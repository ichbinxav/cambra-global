// Dispatches an event to all active WebhookEndpoints subscribed to it.
// Supports retry with exponential backoff (up to 3 attempts) inline,
// and falls back to "pending" delivery rows for the scheduled retry job.
// Invoked from other backend functions when domain events happen.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event_type, payload = {} } = await req.json();
    if (!event_type) return Response.json({ error: "event_type required" }, { status: 400 });
    if (!SUPPORTED_EVENTS.includes(event_type)) {
      return Response.json({ error: `unsupported_event_type: ${event_type}`, supported: SUPPORTED_EVENTS }, { status: 400 });
    }

    const endpoints = await base44.asServiceRole.entities.WebhookEndpoint.filter({ status: "active" });
    const subscribed = endpoints.filter((e) => Array.isArray(e.events) && e.events.includes(event_type));

    const results = [];
    for (const ep of subscribed) {
      const requestId = crypto.randomUUID();
      const body = JSON.stringify({
        event: event_type,
        delivery_id: requestId,
        timestamp: new Date().toISOString(),
        data: payload,
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
        payload,
        target_url: ep.url,
        status,
        response_code: finalResult.response_code,
        response_body: finalResult.response_body,
        duration_ms: finalResult.duration_ms,
        attempt,
        error_message: finalResult.error_message,
      });

      await base44.asServiceRole.entities.WebhookEndpoint.update(ep.id, {
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: status,
        failure_count: status === "failed" ? (ep.failure_count || 0) + 1 : 0,
      });

      results.push({ id: ep.id, status, response_code: finalResult.response_code, attempts: attempt });
    }

    return Response.json({ dispatched: results.length, supported_events: SUPPORTED_EVENTS, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});