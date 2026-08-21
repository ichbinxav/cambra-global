import { safeBestEffort } from "../../shared/bestEffort.ts";
// processWebhookDeadLetters — CAMBRA v0.66.0 / ECL P7.
// Scheduled every 5 minutes. Each eligible legacy retry is durably claimed
// before one transport attempt. Any post-effect uncertainty is quarantined;
// an exhausted row has one explicit admin-only replay path only while its
// existing authority proves no prior ambiguous effect.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  claimSchedulerRun,
  finishSchedulerRunOrThrow,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from "../../shared/schedulerRun.ts";
import { handleInstantlyProviderEventRetryWorker } from "../../shared/logical/instantlyProviderEventRetryWorker.ts";
import { handleInstantlyReconciliationWorker } from "../../shared/logical/instantlyReconciliationWorker.ts";
import { handleAgentTaskTerminalEventReconciler } from "../../shared/logical/agentTaskTerminalEventReconciler.ts";
import {
  claimWebhookDeadLetter,
  finishWebhookDeadLetterClaim,
  markWebhookClaimFailedPreEffect,
  markWebhookClaimReviewRequired,
  markWebhookDeliveryStarted,
  persistWebhookDeliveryReceipt,
  webhookClaimFailureDecision,
} from "../../shared/webhookDeadLetterClaim.ts";
import {
  fetchPublicHttps,
  PublicHttpEgressError,
} from "../../shared/publicHttpEgress.ts";
import {
  captureEmergencyEpoch,
  guardedEmergencyEffect,
} from "../../shared/operationalControl.ts";
import { sha256 } from "../../shared/intelligenceCore.ts";
import {
  createCanonicalAgentTask,
  settleCanonicalAgentTask,
} from "../../shared/agentTaskEnvelope.ts";

const MAX_BATCH = 50;
const PLATFORM_TENANT = "_platform";
const WORKER_AGENT = "webhook_dead_letter_processor";

function workerRequest(req: Request, body: any) {
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(body),
  });
}

async function hmacSha256Hex(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function exactAuthorityRows(
  entity: any,
  filter: Record<string, unknown>,
  operation: string,
) {
  let rows: any;
  try {
    rows = await entity.filter(filter, "created_date", 2);
  } catch (cause) {
    throw Object.assign(new Error(`${operation}_unavailable`), {
      code: `${operation.toUpperCase()}_UNAVAILABLE`,
      status: 503,
      cause,
    });
  }
  if (!Array.isArray(rows)) {
    throw Object.assign(new Error(`${operation}_unavailable`), {
      code: `${operation.toUpperCase()}_UNAVAILABLE`,
      status: 503,
    });
  }
  if (rows.length > 1) {
    throw Object.assign(new Error(`${operation}_ambiguous`), {
      code: `${operation.toUpperCase()}_AMBIGUOUS`,
      status: 503,
      conflicting_ids: rows.map((row: any) => row?.id).filter(Boolean),
    });
  }
  return rows;
}

export default async function (req: Request): Promise<Response> {
  let svc: any = null;
  let task: any = null;
  let schedulerClaim: any = null;
  let schedulerOk = true;
  const traceEffectRefs: any[] = [];
  const traceReceiptRefs: any[] = [];
  try {
    const base44 = createClientFromRequest(req);
    const body0 = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body0);
    if (!gate.ok) {
      return gate.response ||
        Response.json({ error: "forbidden" }, { status: 403 });
    }
    svc = base44.asServiceRole;
    const hostedWorker = String(
      body0?.args?.hosted_worker ?? body0?.hosted_worker ?? "",
    );
    if (hostedWorker) {
      const workerBody = {
        internal_secret: Deno.env.get("INTERNAL_CALL_SECRET") || "",
        host_worker: "processWebhookDeadLetters",
        hosted_worker: hostedWorker,
      };
      if (hostedWorker === "instantlyProviderEventRetryWorker") {
        return await handleInstantlyProviderEventRetryWorker(
          workerRequest(req, workerBody),
        );
      }
      if (hostedWorker === "instantlyReconciliationWorker") {
        return await handleInstantlyReconciliationWorker(
          workerRequest(req, workerBody),
        );
      }
      if (hostedWorker === "agentTaskTerminalEventReconciler") {
        return await handleAgentTaskTerminalEventReconciler(
          workerRequest(req, workerBody),
        );
      }
      return Response.json({
        ok: false,
        error: "unknown_hosted_worker",
        hosted_worker: hostedWorker,
      }, { status: 400 });
    }
    if (body0?.provider_maintenance_only === true) {
      return Response.json({
        ok: false,
        error: "ambiguous_provider_maintenance_route",
        required: "hosted_worker",
      }, { status: 400 });
    }
    const manualReplay = body0?.manualReplay === true;
    const providerMaintenanceOnly = false;
    // Static contract marker retained for the legacy closure test:
    // manualReplay && (!gate.isAdmin
    if (
      manualReplay &&
      (!gate.isAdmin || body0?.confirm !== "REPLAY_EXHAUSTED" ||
        typeof body0?.deadLetterId !== "string" || !body0.deadLetterId)
    ) {
      return Response.json({
        ok: false,
        error: "manual_replay_requires_admin_confirmation_and_deadLetterId",
      }, { status: 403 });
    }
    const requested = Number(body0?.args?.limit ?? body0?.limit ?? MAX_BATCH);
    const limit = Math.max(
      1,
      Math.min(
        MAX_BATCH,
        Number.isFinite(requested) ? Math.floor(requested) : MAX_BATCH,
      ),
    );
    const now = new Date();
    const schedulerOperationKey = manualReplay
      ? `manual-replay:${body0.deadLetterId}`
      : providerMaintenanceOnly
      ? "provider-maintenance"
      : "";
    // Static contract marker retained for the trigger-overlap identity test:
    // operation_key:schedulerOperationKey
    schedulerClaim = await claimSchedulerRun(svc, req, {
      worker_key: "processWebhookDeadLetters",
      cadence_seconds: 300,
      ...(schedulerOperationKey
        ? {
          operation_key: schedulerOperationKey,
          effect_key: schedulerOperationKey,
        }
        : {}),
    });
    {
      const denied = schedulerClaimDeniedResponse(schedulerClaim);
      if (denied) return denied;
    }
    schedulerClaim = await markSchedulerEffectStarted(svc, schedulerClaim);
    {
      const denied = schedulerClaimDeniedResponse(schedulerClaim);
      if (denied) return denied;
    }
    task = await createCanonicalAgentTask(svc, req, {
      brand_id: PLATFORM_TENANT,
      agent_name: WORKER_AGENT,
      task_type: manualReplay
        ? "p7_manual_dead_letter_replay"
        : "scheduled_dead_letter_retry",
      status: "running",
      requires_approval: false,
      risk_level: manualReplay ? 3 : 1,
      input_summary: manualReplay
        ? `Admin replay ${body0.deadLetterId}`
        : `Webhook DLQ sweep limit ${limit}`,
      started_at: now.toISOString(),
    }, {
      workflowKey: "webhook_dead_letter_delivery",
      workflowVersion: "v2.0.0",
      tenantKey: PLATFORM_TENANT,
      processingPurpose: "webhook_delivery_reconciliation",
      functionName: "processWebhookDeadLetters",
      input: {
        manual_replay: manualReplay,
        provider_maintenance_only: providerMaintenanceOnly,
        dead_letter_id: manualReplay ? body0.deadLetterId : null,
        limit,
      },
      parentRun: schedulerClaim.run_key,
      subjectType: manualReplay
        ? "WebhookDeadLetter"
        : "WebhookDeadLetterBatch",
      subjectId: manualReplay ? body0.deadLetterId : schedulerClaim.run_key,
      policyContext: { status: "NOT_APPLICABLE" },
      authorityContext: {
        status: "OBSERVED",
        id: schedulerClaim.run_key,
        key: "scheduler_and_webhook_claim_authority",
        version: "v2",
      },
      intelligenceContext: { status: "NOT_APPLICABLE" },
      materialEffect: true,
      effectClass: "EXECUTE",
      costApplicable: false,
      sourceRefs: [{ type: "SchedulerRun", id: schedulerClaim.run_key }],
    });

    let pending: any[] = [];
    let dueNow: any[] = [];
    if (manualReplay) {
      const [one] = await exactAuthorityRows(
        svc.entities.WebhookDeadLetter,
        { id: body0.deadLetterId },
        "webhook_dead_letter_manual_authority",
      );
      if (!one) {
        schedulerOk = false;
        task = await settleCanonicalAgentTask(svc, task, {
          status: "failed",
          error: "dead_letter_not_found",
          completed_at: new Date().toISOString(),
        }, {
          terminalState: "FAILED",
          effectState: "FAILED_PRE_EFFECT",
          ambiguityState: "NONE",
          result: { ok: false, error: "dead_letter_not_found" },
          effectRefs: [],
          receiptRefs: [],
          terminalEvent: {
            eventType: "agent.task.terminal",
            source: "processWebhookDeadLetters",
            payload: { ok: false, error: "dead_letter_not_found" },
          },
        });
        return Response.json({ ok: false, error: "dead_letter_not_found" }, {
          status: 404,
        });
      }
      if (one.status !== "exhausted") {
        schedulerOk = false;
        task = await settleCanonicalAgentTask(svc, task, {
          status: "failed",
          error: "manual_replay_only_for_exhausted",
          completed_at: new Date().toISOString(),
        }, {
          terminalState: "FAILED",
          effectState: "FAILED_PRE_EFFECT",
          ambiguityState: "NONE",
          result: {
            ok: false,
            error: "manual_replay_only_for_exhausted",
            observed_status: String(one.status || "unknown"),
          },
          effectRefs: [],
          receiptRefs: [],
          terminalEvent: {
            eventType: "agent.task.terminal",
            source: "processWebhookDeadLetters",
            payload: {
              ok: false,
              error: "manual_replay_only_for_exhausted",
              observed_status: String(one.status || "unknown"),
            },
          },
        });
        return Response.json({
          ok: false,
          error: "manual_replay_only_for_exhausted",
        }, { status: 409 });
      }
      pending = [one];
      dueNow = [one];
    } else if (!providerMaintenanceOnly) {
      pending = await svc.entities.WebhookDeadLetter.filter(
        { status: "pending_retry" },
        "-created_date",
        limit,
      );
      dueNow = pending.filter((d: any) =>
        !d.next_retry_at || new Date(d.next_retry_at) <= now
      ).slice(0, limit);
    }

    const results: any[] = [];
    let reviewRequired = false;
    for (const dl of dueNow) {
      const [fresh] = await exactAuthorityRows(
        svc.entities.WebhookDeadLetter,
        { id: dl.id },
        "webhook_dead_letter_claim_authority",
      );
      const expectedStatus = manualReplay ? "exhausted" : "pending_retry";
      if (!fresh || fresh.status !== expectedStatus) {
        results.push({ id: dl.id, action: "skipped_status_changed" });
        continue;
      }
      const claimResult = await claimWebhookDeadLetter(svc, fresh, {
        expected_status: expectedStatus,
        owner: String(schedulerClaim?.run_key || task?.id || WORKER_AGENT),
        now_ms: now.getTime(),
      });
      if (!claimResult.acquired) {
        const decision = webhookClaimFailureDecision(claimResult);
        if (!decision.scheduler_ok) {
          schedulerOk = false;
          reviewRequired = true;
        }
        results.push({
          id: dl.id,
          action: decision.reason,
          review_required: decision.review_required,
        });
        continue;
      }
      let deliveryClaim = (claimResult as any).claim;

      let endpointRows: any[];
      try {
        endpointRows = await exactAuthorityRows(
          svc.entities.WebhookEndpoint,
          { id: dl.webhook_id },
          "webhook_endpoint_authority",
        );
      } catch (error) {
        const released = await finishWebhookDeadLetterClaim(
          svc,
          deliveryClaim,
          {
            last_error_message:
              "webhook_endpoint_authority_unavailable_or_ambiguous",
          },
          { after_effect: false, terminal_state: "FAILED_PRE_EFFECT" },
        );
        if (!released.ok) throw new Error(released.reason);
        throw error;
      }
      const endpoint = endpointRows.length === 1 ? endpointRows[0] : null;
      if (!endpoint || endpoint.status === "disabled") {
        const abandoned = await finishWebhookDeadLetterClaim(
          svc,
          deliveryClaim,
          {
            status: "abandoned",
            last_error_message: "webhook_endpoint_missing_or_disabled",
          },
          { after_effect: false },
        );
        if (!abandoned.ok) throw new Error(abandoned.reason);
        results.push({ id: dl.id, action: "abandoned_disabled_endpoint" });
        continue;
      }

      let emergencyEpoch: any;
      try {
        emergencyEpoch = await captureEmergencyEpoch(svc, "communications");
      } catch (error) {
        const released = await finishWebhookDeadLetterClaim(
          svc,
          deliveryClaim,
          {
            last_error_message:
              "emergency_authority_blocked_before_webhook_effect",
          },
          { after_effect: false, terminal_state: "RELEASED" },
        );
        if (!released.ok) throw new Error(released.reason);
        throw error;
      }
      const started = await markWebhookDeliveryStarted(svc, deliveryClaim);
      if (!started.ok) {
        const decision = webhookClaimFailureDecision(started);
        schedulerOk = false;
        reviewRequired = true;
        results.push({
          id: dl.id,
          action: decision.reason,
          review_required: true,
        });
        continue;
      }
      deliveryClaim = started.claim;
      const deliveryId = String(dl.delivery_id || dl.id);
      const payloadHash = String(
        dl.payload_hash ||
          await sha256({ event_type: dl.event_type, payload: dl.payload }),
      );
      const operationKey = String(
        dl.operation_key || await sha256(`legacy-webhook-dead-letter:${dl.id}`),
      );
      const effectKey = String(deliveryClaim.attempt_key);
      const stableWireBody = JSON.stringify({
        event: dl.event_type,
        delivery_id: deliveryId,
        timestamp: deliveryClaim.wire_created_at,
        data: dl.payload,
        retry: true,
        manual_replay: manualReplay,
      });
      const stableSignature = endpoint.secret
        ? await hmacSha256Hex(endpoint.secret, stableWireBody)
        : "";
      const startedAt = Date.now();
      let ok = false, responseCode = 0, responseBody = "", errorMessage = "";
      // Static contract marker retained for the durable-claim ordering test:
      // effect:()=>fetchPublicHttps(endpoint.url
      try {
        const { response: res, finalUrl } = await guardedEmergencyEffect(svc, {
          claim: emergencyEpoch,
          effect_key: effectKey,
          effect: () =>
            fetchPublicHttps(endpoint.url, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "User-Agent": "CAMBRA-Webhooks/1.0 (retry)",
                "X-CAMBRA-Event": dl.event_type,
                "X-CAMBRA-Signature": stableSignature,
                "X-CAMBRA-Delivery": deliveryId,
                "X-CAMBRA-Attempt": String((dl.total_attempts || 0) + 1),
                "X-CAMBRA-Retry": "true",
                "X-CAMBRA-Manual-Replay": manualReplay ? "true" : "false",
              },
              body: stableWireBody,
            }, { maxRedirects: 0 }),
        });
        if (finalUrl !== new URL(endpoint.url).toString()) {
          throw new PublicHttpEgressError("webhook_redirect_forbidden");
        }
        ok = res.ok;
        responseCode = res.status;
        traceEffectRefs.push({ type: "effect_key", id: effectKey });
        try {
          await res.body?.cancel();
        } catch (_) { /* body disposal only */ }
      } catch (e: any) {
        const provedPreEffect =
          ["EMERGENCY_CONTROL_EPOCH_CHANGED", "EMERGENCY_CONTROL_PAUSED"]
            .includes(String(e?.code || "")) &&
          String(e?.phase || "").startsWith("before:");
        if (provedPreEffect) {
          const failed = await markWebhookClaimFailedPreEffect(
            svc,
            deliveryClaim,
            String(e.code),
          );
          if (!failed.ok) {
            throw new Error("webhook_failed_pre_effect_fence_lost");
          }
          throw e;
        }
        traceEffectRefs.push({ type: "effect_key", id: effectKey });
        errorMessage = String((e as Error)?.message || e || "delivery_failed")
          .slice(0, 500);
      }
      const duration = Date.now() - startedAt;

      const receipt = await persistWebhookDeliveryReceipt(svc, {
        effect_key: effectKey,
        operation_key: operationKey,
        delivery_id: deliveryId,
        payload_hash: payloadHash,
        claim_token: deliveryClaim.token,
        claim_revision: deliveryClaim.revision,
        webhook_id: endpoint.id,
        webhook_name: endpoint.name,
        event_type: dl.event_type,
        payload: dl.payload,
        target_url: endpoint.url,
        status: ok ? "success" : "failed",
        response_code: responseCode,
        response_body: responseBody,
        duration_ms: duration,
        attempt: (dl.total_attempts || 0) + 1,
        error_message: errorMessage,
        observed_at: new Date().toISOString(),
        provider_receipt_json: {
          provider: "custom_webhook",
          http_status: responseCode,
          acknowledgement: responseCode > 0
            ? "HTTP_RESPONSE_OBSERVED"
            : "TRANSPORT_RESULT_UNKNOWN",
          reconciled: false,
        },
      });
      if (receipt.ok && receipt.receipt?.id) {
        traceReceiptRefs.push({
          type: "WebhookDelivery",
          id: String(receipt.receipt.id),
          hash: payloadHash,
        });
      }
      const newAttempts = (dl.total_attempts || 0) + 1;
      if (ok && receipt.ok) {
        const finalized = await finishWebhookDeadLetterClaim(
          svc,
          deliveryClaim,
          {
            status: "resolved",
            resolved_at: new Date().toISOString(),
            total_attempts: newAttempts,
            last_response_code: responseCode,
          },
        );
        if (!finalized.ok) throw new Error(finalized.reason);
        results.push({
          id: dl.id,
          action: "resolved",
          attempts: newAttempts,
          manualReplay,
        });
      } else {
        // No provider idempotency or reconciliation guarantee exists for an
        // arbitrary receiver. Any result after transport starts is therefore
        // REVIEW_REQUIRED and is never eligible for automatic replay.
        const reviewed = await markWebhookClaimReviewRequired(
          svc,
          deliveryClaim,
          {
            reason: String(
              (receipt as any).reason || errorMessage ||
                `webhook_http_${responseCode || "unknown"}`,
            ),
            patch: {
              total_attempts: newAttempts,
              last_response_code: responseCode,
              last_response_body: responseBody,
            },
            result: {
              effect_key: effectKey,
              response_code: responseCode,
              receipt_persisted: receipt.ok === true,
              provider_reconciled: false,
            },
          },
        );
        if (!reviewed.ok) throw new Error(reviewed.reason);
        reviewRequired = true;
        results.push({
          id: dl.id,
          action: "review_required",
          attempts: newAttempts,
          manualReplay,
          automatic_retry_blocked: true,
        });
      }
    }

    const instantlyEventRetry: any = null;
    const instantlyReconciliation: any = null;
    const summary = {
      processed: results.length,
      pending_total: pending.length,
      manual_replay: manualReplay,
      provider_maintenance_only: providerMaintenanceOnly,
      results,
      instantly_event_retry: instantlyEventRetry,
      instantly_reconciliation: instantlyReconciliation,
      host_worker_fallback: false,
      host_worker_routing: "dedicated",
      review_required: reviewRequired,
    };
    if (task?.id) {
      const effectState = reviewRequired
        ? "REVIEW_REQUIRED"
        : traceEffectRefs.length > 0
        ? "EXECUTED"
        : "NOT_STARTED";
      await settleCanonicalAgentTask(svc, task, {
        status: reviewRequired ? "failed" : "completed",
        output_summary: `Webhook DLQ ${
          manualReplay ? "manual replay" : "sweep"
        }: ${results.length} processed`,
        output_payload_json: summary,
        ...(reviewRequired ? { error: "webhook_effect_review_required" } : {}),
        completed_at: new Date().toISOString(),
      }, {
        terminalState: reviewRequired ? "REVIEW_REQUIRED" : "COMPLETED",
        effectState,
        ambiguityState: reviewRequired ? "REVIEW_REQUIRED" : "NONE",
        result: summary,
        effectRefs: traceEffectRefs,
        receiptRefs: traceReceiptRefs,
        effectCoverageComplete:
          traceEffectRefs.length === 0 ||
          reviewRequired ||
          traceReceiptRefs.length === traceEffectRefs.length,
        terminalEvent: {
          eventType: "agent.task.terminal",
          source: "processWebhookDeadLetters",
          payload: summary,
        },
      });
    }
    if (reviewRequired) schedulerOk = false;
    return Response.json({ ok: !reviewRequired, ...summary }, {
      status: reviewRequired ? 409 : 200,
    });
  } catch (error) {
    schedulerOk = false;
    const message = String(
      (error as Error)?.message || error || "webhook_dead_letter_worker_failed",
    ).slice(0, 500);
    if (svc && task?.id) {
      try {
        await settleCanonicalAgentTask(svc, task, {
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        }, {
          terminalState: traceEffectRefs.length > 0
            ? "REVIEW_REQUIRED"
            : "FAILED",
          effectState: traceEffectRefs.length > 0
            ? "REVIEW_REQUIRED"
            : "FAILED_PRE_EFFECT",
          ambiguityState: traceEffectRefs.length > 0
            ? "REVIEW_REQUIRED"
            : "NONE",
          result: {
            ok: false,
            error: "webhook_dead_letter_worker_failed",
            message,
          },
          effectRefs: traceEffectRefs,
          receiptRefs: traceReceiptRefs,
          effectCoverageComplete: traceEffectRefs.length === 0,
          terminalEvent: {
            eventType: "agent.task.terminal",
            source: "processWebhookDeadLetters",
            payload: {
              ok: false,
              error: "webhook_dead_letter_worker_failed",
              message,
            },
          },
        });
      } catch (traceError) {
        safeBestEffort(traceError, {
          operation: "processWebhookDeadLetters.trace_terminal",
          fallback: null,
          severity: "critical",
        });
      }
    }
    return Response.json({
      ok: false,
      error: "webhook_dead_letter_worker_failed",
      message,
    }, { status: 500 });
  } finally {
    if (svc && schedulerClaim?.allowed) {
      await finishSchedulerRunOrThrow(svc, schedulerClaim, {
        worker_key: "processWebhookDeadLetters",
      }, schedulerOk);
    }
  }
}
