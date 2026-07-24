// Scheduled job — processes the WebhookDeadLetter queue.
// Retries with exponential backoff (5min, 30min, 2h, 12h, 24h).
// After ~6 attempts (~24h total) marks the delivery as "exhausted".
// Run every 5 minutes via Base44 scheduled automation.
//
// SECURITY-2 (2026-07-24):
//   · Canonical trust gate (admin OR INTERNAL_CALL_SECRET). The scheduler
//     authenticates as the app-owner admin (verified empirically:
//     base44-scheduled-task runs pass auth.me() with role=admin), so the cron
//     keeps working. The previous inverted pattern let ANONYMOUS callers
//     trigger concurrent retry storms.
//   · CLAIM before re-delivery: each due row gets locked_at set first; rows
//     locked less than LOCK_TTL_MIN ago are skipped — two concurrent runs can
//     no longer double-send the same delivery.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";

const BACKOFF_MINUTES = [5, 30, 120, 720, 1440, 1440]; // 5m, 30m, 2h, 12h, 24h, 24h
const MAX_TOTAL_ATTEMPTS = 9; // 3 inline + 6 DLQ
const LOCK_TTL_MIN = 10; // a lock older than this is considered stale (crashed run)

async function hmacSha256Hex(secret, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body0 = await req.json().catch(() => ({}));

    const gate = await requireAdminOrInternal(req, base44, body0);
    if (!gate.ok) return gate.response;

    const now = new Date();
    const pending = await base44.asServiceRole.entities.WebhookDeadLetter.filter({ status: "pending_retry" }, "-created_date", 50);
    const dueNow = pending.filter((d) => !d.next_retry_at || new Date(d.next_retry_at) <= now);

    const results = [];
    for (const dl of dueNow) {
      // ── Claim (double-send protection) ──
      // Re-read: another concurrent run may have claimed or resolved it since
      // our filter. Skip anything locked recently or no longer pending.
      const fresh = await base44.asServiceRole.entities.WebhookDeadLetter.get(dl.id).catch(() => null);
      if (!fresh || fresh.status !== "pending_retry") {
        results.push({ id: dl.id, action: "skipped_not_pending" });
        continue;
      }
      if (fresh.locked_at && (now.getTime() - new Date(fresh.locked_at).getTime()) < LOCK_TTL_MIN * 60 * 1000) {
        results.push({ id: dl.id, action: "skipped_locked" });
        continue;
      }
      await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, { locked_at: new Date().toISOString() });

      const endpoint = await base44.asServiceRole.entities.WebhookEndpoint.get(dl.webhook_id).catch(() => null);
      if (!endpoint || endpoint.status === "disabled") {
        await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, { status: "abandoned", locked_at: null });
        results.push({ id: dl.id, action: "abandoned_disabled_endpoint" });
        continue;
      }

      const body = JSON.stringify({
        event: dl.event_type,
        delivery_id: dl.id,
        timestamp: new Date().toISOString(),
        data: dl.payload,
        retry: true,
      });
      const signature = endpoint.secret ? await hmacSha256Hex(endpoint.secret, body) : "";

      const startedAt = Date.now();
      let ok = false, responseCode = 0, responseBody = "", errorMessage = "";
      try {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "CAMBRA-Webhooks/1.0 (retry)",
            "X-CAMBRA-Event": dl.event_type,
            "X-CAMBRA-Signature": signature,
            "X-CAMBRA-Delivery": dl.id,
            "X-CAMBRA-Attempt": String((dl.total_attempts || 0) + 1),
            "X-CAMBRA-Retry": "true",
          },
          body,
        });
        ok = res.ok;
        responseCode = res.status;
        responseBody = (await res.text()).slice(0, 500);
      } catch (e) {
        errorMessage = e.message;
      }
      const duration = Date.now() - startedAt;

      await base44.asServiceRole.entities.WebhookDelivery.create({
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
      });

      const newAttempts = (dl.total_attempts || 0) + 1;
      if (ok) {
        await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, {
          status: "resolved",
          resolved_at: new Date().toISOString(),
          total_attempts: newAttempts,
          last_response_code: responseCode,
          locked_at: null,
        });
        results.push({ id: dl.id, action: "resolved", attempts: newAttempts });
      } else if (newAttempts >= MAX_TOTAL_ATTEMPTS) {
        await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, {
          status: "exhausted",
          total_attempts: newAttempts,
          last_response_code: responseCode,
          last_response_body: responseBody,
          last_error_message: errorMessage,
          locked_at: null,
        });
        results.push({ id: dl.id, action: "exhausted", attempts: newAttempts });
      } else {
        const dlqAttemptIndex = Math.min(newAttempts - 3 - 1, BACKOFF_MINUTES.length - 1);
        const nextDelay = BACKOFF_MINUTES[Math.max(0, dlqAttemptIndex)];
        await base44.asServiceRole.entities.WebhookDeadLetter.update(dl.id, {
          total_attempts: newAttempts,
          next_retry_at: new Date(Date.now() + nextDelay * 60 * 1000).toISOString(),
          last_response_code: responseCode,
          last_response_body: responseBody,
          last_error_message: errorMessage,
          locked_at: null,
        });
        results.push({ id: dl.id, action: "rescheduled", attempts: newAttempts, next_delay_min: nextDelay });
      }
    }

    return Response.json({ processed: results.length, pending_total: pending.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});