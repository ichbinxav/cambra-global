// Admin-only — sends a test webhook to a registered endpoint.
// Validates HMAC SHA-256 signing, includes timestamp + event id in signature payload,
// records a WebhookDelivery row, and never includes secrets or sensitive documents.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

async function sign(secret, payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== "admin") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const { webhook_id } = await req.json().catch(() => ({}));
    if (!webhook_id) return Response.json({ error: "webhook_id required" }, { status: 400 });

    const webhook = await base44.asServiceRole.entities.WebhookEndpoint.get(webhook_id).catch(() => null);
    if (!webhook) return Response.json({ error: "not_found" }, { status: 404 });

    const event_id = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    // Safe payload — no secrets, no document URLs, no tokens.
    const payload = {
      event_id,
      event_type: "webhook.test",
      timestamp: new Date().toISOString(),
      data: {
        message: "This is a test webhook from CAMBRA admin.",
        webhook_id: webhook.id,
        webhook_name: webhook.name,
      },
    };
    const body = JSON.stringify(payload);
    // Signature payload includes timestamp + event_id + body
    const signaturePayload = `${timestamp}.${event_id}.${body}`;
    const signature = await sign(webhook.secret || "no_secret_set", signaturePayload);

    const start = Date.now();
    let status = "failed", response_code = 0, response_body = "", error_message = null;
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cambra-Event": "webhook.test",
          "X-Cambra-Event-Id": event_id,
          "X-Cambra-Timestamp": timestamp,
          "X-Cambra-Signature": `sha256=${signature}`,
          "User-Agent": "Cambra-Webhooks/1.0 (test)",
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      response_code = res.status;
      response_body = (await res.text().catch(() => "")).slice(0, 500);
      status = res.ok ? "success" : "failed";
    } catch (e) {
      error_message = e.message;
    }
    const duration_ms = Date.now() - start;

    await base44.asServiceRole.entities.WebhookDelivery.create({
      webhook_id: webhook.id,
      webhook_name: webhook.name,
      event_type: "webhook.test",
      payload,
      target_url: webhook.url,
      status,
      response_code,
      response_body,
      duration_ms,
      attempt: 1,
      error_message,
    }).catch(() => null);

    return Response.json({
      ok: status === "success",
      status,
      response_code,
      response_body,
      duration_ms,
      event_id,
      signature_algorithm: "HMAC-SHA256",
      headers_sent: ["X-Cambra-Event", "X-Cambra-Event-Id", "X-Cambra-Timestamp", "X-Cambra-Signature"],
      error_message,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});