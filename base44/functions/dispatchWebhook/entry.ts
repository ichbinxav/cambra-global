// Dispatches an event to all active WebhookEndpoints subscribed to it.
// Invoked internally from other backend functions when domain events happen.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function hmacSha256Hex(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event_type, payload = {} } = await req.json();
    if (!event_type) return Response.json({ error: "event_type required" }, { status: 400 });

    const endpoints = await base44.asServiceRole.entities.WebhookEndpoint.filter({ status: "active" });
    const subscribed = endpoints.filter(e => Array.isArray(e.events) && e.events.includes(event_type));

    const results = [];
    for (const ep of subscribed) {
      const body = JSON.stringify({
        event: event_type,
        timestamp: new Date().toISOString(),
        data: payload,
      });
      const signature = ep.secret ? await hmacSha256Hex(ep.secret, body) : "";
      const startedAt = Date.now();
      let status = "failed", response_code = 0, response_body = "", error_message = "";
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CAMBRA-Event": event_type,
            "X-CAMBRA-Signature": signature,
          },
          body,
        });
        response_code = res.status;
        response_body = (await res.text()).slice(0, 500);
        status = res.ok ? "success" : "failed";
      } catch (err) {
        error_message = err.message;
      }
      const duration_ms = Date.now() - startedAt;

      await base44.asServiceRole.entities.WebhookDelivery.create({
        webhook_id: ep.id,
        webhook_name: ep.name,
        event_type,
        payload,
        target_url: ep.url,
        status,
        response_code,
        response_body,
        duration_ms,
        attempt: 1,
        error_message,
      });

      await base44.asServiceRole.entities.WebhookEndpoint.update(ep.id, {
        last_delivery_at: new Date().toISOString(),
        last_delivery_status: status,
        failure_count: status === "failed" ? (ep.failure_count || 0) + 1 : 0,
      });

      results.push({ id: ep.id, status, response_code });
    }

    return Response.json({ dispatched: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});