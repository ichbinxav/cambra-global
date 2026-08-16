import { safeBestEffort } from '../../shared/bestEffort.ts';
// Dispatches an event to all active WebhookEndpoints subscribed to it.
// Performs exactly one transport attempt. Without provider idempotency or a
// reconciliation API, any failure after transport starts is REVIEW_REQUIRED.
// Invoked from other backend functions when domain events happen.
//
// Endpoint classification: INTERNAL_ONLY (invoked by other backend functions
// via base44.functions.invoke). No auth gate here because callers are
// server-to-server — a malicious external caller could only trigger deliveries
// to webhooks THEY themselves registered (WebhookEndpoint is admin-write RLS),
// which is not useful. If we ever expose this from an unauthenticated frontend
// path, add auth here first.
// asServiceRole justification: reads all active WebhookEndpoints across tenants
// (event dispatch is a platform-level concern) and writes delivery/DLQ audit rows.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { quarantineProbe } from "../../shared/internalGate.ts";
import { isInternalCaller, redactSecrets } from "../../shared/internalSecret.ts";
import { buildPublicWebhookPayload } from "../../shared/webhookPublicPayload.ts";
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { fetchPublicHttps, PublicHttpEgressError } from '../../shared/publicHttpEgress.ts';
import { captureEmergencyEpoch, guardedEmergencyEffect } from '../../shared/operationalControl.ts';
import {
  claimWebhookDeadLetter,
  finishWebhookDeadLetterClaim,
  markWebhookClaimFailedPreEffect,
  markWebhookClaimReviewRequired,
  markWebhookDeliveryStarted,
  persistWebhookDeliveryReceipt,
  prepareWebhookDispatchIntent,
  webhookDispatchIdentity,
} from '../../shared/webhookDeadLetterClaim.ts';

const SUPPORTED_EVENTS = [
  "new_brand_created",
  "new_document_uploaded",
  "analysis_completed",
  "savings_unlocked",
  "report_created",
  "integration_connected",
];

async function hmacSha256Hex(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deliverOnce({ endpoint, body, signature, event_type, requestId, attempt, guard }: {
  endpoint: any;
  body: string;
  signature: string;
  event_type: string;
  requestId: string;
  attempt: number;
  guard?:(effect:()=>Promise<any>)=>Promise<any>;
}) {
  const startedAt = Date.now();
  try {
    const effect=()=>fetchPublicHttps(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "CAMBRA-Webhooks/1.0",
        "X-CAMBRA-Event": event_type,
        "X-CAMBRA-Signature": signature,
        "X-CAMBRA-Delivery": requestId,
        "X-CAMBRA-Attempt": String(attempt),
      },
      body,
    }, { maxRedirects: 0 });
    const { response: res, finalUrl } = guard?await guard(effect):await effect();
    if (finalUrl !== new URL(endpoint.url).toString()) {
      throw new PublicHttpEgressError('webhook_redirect_forbidden');
    }
    try { await res.body?.cancel(); } catch (_) { /* body disposal only */ }
    return { ok: res.ok, response_code: res.status, response_body: "", duration_ms: Date.now() - startedAt, error_message: "" };
  } catch (err) {
    if(['EMERGENCY_EFFECT_AMBIGUOUS','EMERGENCY_CONTROL_EPOCH_CHANGED','EMERGENCY_CONTROL_PAUSED'].includes(String((err as any)?.code||'')))throw err;
    return { ok: false, response_code: 0, response_body: "", duration_ms: Date.now() - startedAt, error_message: String((err as Error)?.message || err || "webhook_delivery_failed") };
  }
}

// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): no live caller found (API-platform family kept out of caution).
Deno.serve(async (req) => {
  await quarantineProbe(createClientFromRequest(req), "dispatchWebhook");
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event_type, payload = {} } = body;

    // SECURITY-1 (2026-07-24) — INTERNAL_ONLY enforcement, as this file's own
    // classification comment prescribes. Without this gate an anonymous caller
    // could push forged-but-validly-SIGNED events to every registered endpoint.
    // Allowed callers: (a) authenticated admin, (b) server-to-server callers
    // presenting the shared INTERNAL_CALL_SECRET via the x-internal-secret
    // header or payload.internal_secret. Frontend invocation is not supported.
    const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'dispatchWebhook',fallback:null,severity:'critical'}));
    const isAdmin = user?.role === "admin";
    // v62 C4 — comparación en tiempo constante vía módulo compartido (ver internalSecret.ts)
    const isInternal = isInternalCaller(req, body);
    if (!isAdmin && !isInternal) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    if (!event_type) return Response.json({ error: "event_type required" }, { status: 400 });
    if (!SUPPORTED_EVENTS.includes(event_type)) {
      return Response.json({ error: `unsupported_event_type: ${event_type}`, supported: SUPPORTED_EVENTS }, { status: 400 });
    }
    // One exact epoch is retained across the whole fan-out. A failed authority
    // read therefore returns non-2xx before endpoint reads or provider calls,
    // and STOP -> RESUME cannot grant a fresh epoch to an in-flight dispatch.
    const emergencyEpoch=await captureEmergencyEpoch(base44.asServiceRole,'communications');

    // v62.2 CP6.3 — OUTBOUND payloads are built by ALLOWLIST per event type
    // (buildPublicWebhookPayload): undocumented fields are omitted, internal
    // objects never leak to an external URL. The same public payload is what
    // gets persisted (WebhookDelivery / WebhookDeadLetter), with
    // redactSecrets as defense in depth. No internal_secret, no private
    // headers, no arbitrary internal payload can cross this boundary.
    const publicPayload = redactSecrets(
      buildPublicWebhookPayload(event_type, payload),
    ) as Record<string, unknown>;
    const operationKey = String(
      req.headers.get('idempotency-key') ||
      req.headers.get('x-cambra-command-key') ||
      body?.operation_key || '',
    ).trim().slice(0, 300);
    if (!operationKey) {
      return Response.json({
        ok: false,
        error: 'webhook_dispatch_idempotency_key_required',
      }, { status: 428 });
    }

    const endpointPageSize=1001;
    const endpoints = await base44.asServiceRole.entities.WebhookEndpoint.filter(
      { status: "active" },
      "created_date",
      endpointPageSize,
    );
    if (!Array.isArray(endpoints) || endpoints.length >= endpointPageSize) {
      return Response.json({
        ok:false,
        error:'webhook_endpoint_inventory_incomplete',
        review_required:true,
      },{status:503});
    }
    const subscribed = endpoints.filter((e) => Array.isArray(e.events) && e.events.includes(event_type));

    const results = [];
    let reviewRequired=false;
    let blocked=false;
    for (const ep of subscribed) {
      const identity = await webhookDispatchIdentity({
        operation_key: operationKey,
        endpoint_id: String(ep.id),
        event_type,
        payload: publicPayload,
      });
      const prepared = await prepareWebhookDispatchIntent(base44.asServiceRole, {
        ...identity,
        webhook_id: String(ep.id),
        webhook_name: String(ep.name || ''),
        event_type,
        target_url: String(ep.url),
        payload: publicPayload,
      });
      const intent = prepared.intent;
      const requestId = identity.delivery_id;

      if (intent.status === 'resolved' && intent.claim_state === 'EXECUTED') {
        results.push({
          id: ep.id,
          delivery_id: requestId,
          status: 'success',
          duplicate: true,
          already_executed: true,
          attempts: Number(intent.total_attempts || 1),
        });
        continue;
      }
      if (['REVIEW_REQUIRED', 'FAILED_POST_EFFECT'].includes(String(intent.claim_state || ''))) {
        reviewRequired=true;
        results.push({
          id:ep.id,
          delivery_id:requestId,
          status:'review_required',
          claim_state: "REVIEW_REQUIRED",
          review_required:true,
          automatic_retry_blocked:true,
        });
        continue;
      }

      const claimResult = await claimWebhookDeadLetter(base44.asServiceRole, intent, {
        expected_status:'dispatch_pending',
        owner:`dispatchWebhook:${identity.operation_key}`,
      });
      if (!claimResult.acquired) {
        const ambiguity = claimResult.review_required === true ? claimResult : null;
        reviewRequired = reviewRequired || ambiguity !== null;
        blocked = blocked || ambiguity === null;
        results.push({
          id: ep.id,
          delivery_id: requestId,
          status: ambiguity ? 'review_required' : 'claim_blocked',
          claim_state: ambiguity ? "REVIEW_REQUIRED" : String(intent.claim_state || 'CLAIMED'),
          reason: claimResult.reason,
          review_required: ambiguity !== null,
          automatic_retry_blocked:ambiguity!==null,
        });
        continue;
      }
      let deliveryClaim = (claimResult as any).claim;
      const wireCreatedAt = String(intent.wire_created_at || new Date().toISOString());
      const wireBody = JSON.stringify({
        event: event_type,
        delivery_id: requestId,
        timestamp: wireCreatedAt,
        data: publicPayload,
      });
      const signature = ep.secret ? await hmacSha256Hex(ep.secret, wireBody) : "";

      let finalResult = { ok: false, response_code: 0, response_body: "", duration_ms: 0, error_message: "" };
      const attempt = 1;
      let ambiguity:any=null;
      try{
        const started = await markWebhookDeliveryStarted(base44.asServiceRole, deliveryClaim);
        if (!started.ok) {
          blocked=true;
          results.push({ id:ep.id,delivery_id:requestId,status:'claim_blocked',reason:started.reason });
          continue;
        }
        deliveryClaim=started.claim;
        finalResult = await deliverOnce({
          endpoint:ep,body:wireBody,signature,event_type,requestId,attempt,
          guard:(effect)=>guardedEmergencyEffect(base44.asServiceRole,{
            claim:emergencyEpoch,
            effect_key:identity.effect_key,
            effect,
            contain:async()=>{
              await base44.asServiceRole.entities.WebhookEndpoint.update(ep.id,{status:'disabled',auto_disabled_at:new Date().toISOString(),last_delivery_status:'failed'});
              return{ok:true,endpoint_id:ep.id,locally_disabled:true};
            },
          }),
        });
      }catch(error:any){
        const provedPreEffect =
          ['EMERGENCY_CONTROL_EPOCH_CHANGED','EMERGENCY_CONTROL_PAUSED'].includes(String(error?.code || '')) &&
          String(error?.phase || '').startsWith('before:');
        if (provedPreEffect) {
          const failed = await markWebhookClaimFailedPreEffect(
            base44.asServiceRole,
            deliveryClaim,
            String(error.code),
          );
          if (!failed.ok) throw new Error('webhook_failed_pre_effect_fence_lost');
          throw error;
        }
        ambiguity=error;
        finalResult={ok:false,response_code:Number(error?.effect_result?.response?.status||0),response_body:"",duration_ms:0,error_message:'emergency_effect_ambiguous_review_required'};
      }
      // This endpoint offers no provider idempotency or reconciliation API.
      // Once transport started, every network/HTTP failure is effect-unknown:
      // persist REVIEW_REQUIRED and never issue an inline or scheduled replay.
      if(!finalResult.ok){
        ambiguity=ambiguity||{code:'WEBHOOK_EFFECT_UNKNOWN',review_required:true};
        reviewRequired=true;
      }

      const status = finalResult.ok ? "success" : "failed";
      const receipt = await persistWebhookDeliveryReceipt(base44.asServiceRole, {
        effect_key: identity.effect_key,
        operation_key: identity.operation_key,
        delivery_id: requestId,
        payload_hash: identity.payload_hash,
        claim_token: deliveryClaim.token,
        claim_revision: deliveryClaim.revision,
        webhook_id: ep.id,
        webhook_name: ep.name,
        event_type,
        payload: publicPayload,
        target_url: ep.url,
        status,
        response_code: finalResult.response_code,
        response_body: finalResult.response_body,
        duration_ms: finalResult.duration_ms,
        attempt,
        error_message: finalResult.error_message,
        observed_at: new Date().toISOString(),
        provider_receipt_json: {
          provider: 'custom_webhook',
          http_status: finalResult.response_code,
          acknowledgement: finalResult.response_code > 0 ? 'HTTP_RESPONSE_OBSERVED' : 'TRANSPORT_RESULT_UNKNOWN',
          reconciled: false,
        },
      });
      if (!receipt.ok) {
        ambiguity=ambiguity||receipt;
        reviewRequired=true;
      }

      if (!finalResult.ok || !receipt.ok) {
        const reviewed = await markWebhookClaimReviewRequired(base44.asServiceRole, deliveryClaim, {
          reason: String((receipt as any).reason || finalResult.error_message || 'webhook_effect_unknown'),
          patch: {
            total_attempts: attempt,
            last_response_code: finalResult.response_code,
            last_response_body: finalResult.response_body,
            first_failed_at: String(intent.first_failed_at || new Date().toISOString()),
          },
          result: {
            effect_key: identity.effect_key,
            response_code: finalResult.response_code,
            receipt_persisted: receipt.ok === true,
            provider_reconciled: false,
          },
        });
        if (!reviewed.ok) throw new Error(reviewed.reason);
      } else {
        const finished = await finishWebhookDeadLetterClaim(
          base44.asServiceRole,
          deliveryClaim,
          {
            status:'resolved',
            resolved_at:new Date().toISOString(),
            total_attempts:attempt,
            last_response_code:finalResult.response_code,
          },
          { terminal_state:'EXECUTED' },
        );
        if (!finished.ok) throw new Error(finished.reason);
      }

      const newFailureCount = status === "failed" ? (ep.failure_count || 0) + 1 : 0;
      const autoDisable = newFailureCount >= 10; // 10 consecutive failures auto-disables
      await base44.asServiceRole.entities.WebhookEndpoint.update(ep.id, {
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: status,
        failure_count: newFailureCount,
        ...(autoDisable ? { status: "disabled", auto_disabled_at: new Date().toISOString() } : {}),
      });

      results.push({ id: ep.id, delivery_id:requestId, effect_key:identity.effect_key, status, response_code: finalResult.response_code, attempts: attempt, review_required:ambiguity!==null, automatic_retry_blocked:ambiguity!==null });
    }

    return Response.json({ ok:!reviewRequired&&!blocked, dispatched: results.filter((row:any)=>!row.duplicate&&!String(row.status).includes('blocked')).length, supported_events: SUPPORTED_EVENTS, results, review_required:reviewRequired },{status:reviewRequired?409:blocked?503:200});
  } catch (error) {
    return internalErrorResponse(error, 'dispatchWebhook');
  }
});
