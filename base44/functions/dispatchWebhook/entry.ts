// Dispatches an event to all active WebhookEndpoints subscribed to it.
// Supports retry with exponential backoff (up to 3 attempts) inline,
// and falls back to "pending" delivery rows for the scheduled retry job.
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
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
import { quarantineProbe } from "../../shared/internalGate.ts";
import { isInternalCaller, redactSecrets } from "../../shared/internalSecret.ts";
import { buildPublicWebhookPayload } from "../../shared/webhookPublicPayload.ts";

const SUPPORTED_EVENTS = [
  "new_brand_created",
  "new_document_uploaded",
  "analysis_completed",
  "savings_unlocked",
  "report_created",
  "integration_connected",
];

const RETRY_DELAYS_MS = [0, 2000, 8000]; // 0s, 2s, 8s — inline retries

async function hmacSha256Hex(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function deliverOnce({ endpoint, body, signature, event_type, requestId, attempt }) {
  const startedAt = Date.now();
  try {
    const res = await fetch(endpoint.url, {
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
    });
    const response_body = (await res.text()).slice(0, 500);
    return { ok: res.ok, response_code: res.status, response_body, duration_ms: Date.now() - startedAt, error_message: "" };
  } catch (err) {
    return { ok: false, response_code: 0, response_body: "", duration_ms: Date.now() - startedAt, error_message: err.message };
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
    const user = await base44.auth.me().catch(() => null);
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

    // v62.2 CP6.3 — OUTBOUND payloads are built by ALLOWLIST per event type
    // (buildPublicWebhookPayload): undocumented fields are omitted, internal
    // objects never leak to an external URL. The same public payload is what
    // gets persisted (WebhookDelivery / WebhookDeadLetter) and retried, with
    // redactSecrets as defense in depth. No internal_secret, no private
    // headers, no arbitrary internal payload can cross this boundary.
    const publicPayload = redactSecrets(buildPublicWebhookPayload(event_type, payload));

    const endpoints = await base44.asServiceRole.entities.WebhookEndpoint.filter({ status: "active" });
    const subscribed = endpoints.filter((e) => Array.isArray(e.events) && e.events.includes(event_type));

    const results = [];
    for (const ep of subscribed) {
      const requestId = crypto.randomUUID();
      const body = JSON.stringify({
        event: event_type,
        delivery_id: requestId,
        timestamp: new Date().toISOString(),
        data: publicPayload,
      });
      const signature = ep.secret ? await hmacSha256Hex(ep.secret, body) : "";

      let finalResult = { ok: false, response_code: 0, response_body: "", duration_ms: 0, error_message: "" };
      let attempt = 0;
      for (attempt = 1; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (RETRY_DELAYS_MS[attempt - 1] > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
        finalResult = await deliverOnce({ endpoint: ep, body, signature, event_type, requestId, attempt });
        if (finalResult.ok) break;
      }

      const status = finalResult.ok ? "success" : "failed";
      await base44.asServiceRole.entities.WebhookDelivery.create({
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
      });

      // Send failures to Dead Letter Queue for scheduled background retry
      if (!finalResult.ok) {
        await base44.asServiceRole.entities.WebhookDeadLetter.create({
          webhook_id: ep.id,
          webhook_name: ep.name,
          event_type,
          target_url: ep.url,
          payload: publicPayload,
          last_response_code: finalResult.response_code,
          last_response_body: finalResult.response_body,
          last_error_message: finalResult.error_message,
          total_attempts: attempt,
          next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // first DLQ retry in 5 min
          status: "pending_retry",
          first_failed_at: new Date().toISOString(),
        });
      }

      const newFailureCount = status === "failed" ? (ep.failure_count || 0) + 1 : 0;
      const autoDisable = newFailureCount >= 10; // 10 consecutive failures auto-disables
      await base44.asServiceRole.entities.WebhookEndpoint.update(ep.id, {
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: status,
        failure_count: newFailureCount,
        ...(autoDisable ? { status: "disabled", auto_disabled_at: new Date().toISOString() } : {}),
      });

      results.push({ id: ep.id, status, response_code: finalResult.response_code, attempts: attempt });
    }

    return Response.json({ dispatched: results.length, supported_events: SUPPORTED_EVENTS, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});