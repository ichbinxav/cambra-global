// processWebhookDeadLetters — CAMBRA v0.66.0 / ECL P7.
// Scheduled every 5 minutes. Automatic retries remain bounded and claimed before
// delivery. P7 adds worker telemetry and ONE explicit admin-only replay path for
// an exhausted row. The stable DLQ id remains the delivery id on every attempt.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { claimSchedulerRun, finishSchedulerRun } from "../../shared/schedulerRun.ts";

const BACKOFF_MINUTES = [5, 30, 120, 720, 1440, 1440];
const MAX_TOTAL_ATTEMPTS = 9;
const LOCK_TTL_MIN = 10;
const MAX_BATCH = 50;
const PLATFORM_TENANT = "_platform";
const WORKER_AGENT = "webhook_dead_letter_processor";

async function hmacSha256Hex(secret: string, body: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function (req: Request): Promise<Response> {
  let svc: any = null;
  let task: any = null;
  let schedulerClaim: any = null;
  let schedulerOk = true;
  try {
    const base44 = createClientFromRequest(req);
    const body0 = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body0);
    if (!gate.ok) return gate.response;
    svc = base44.asServiceRole;
    schedulerClaim = await claimSchedulerRun(svc, req, { worker_key:"processWebhookDeadLetters", cadence_seconds:300 });
    if (!schedulerClaim.allowed) return Response.json({ ok:true, duplicate_blocked:true, run_key:schedulerClaim.run_key });

    const manualReplay = body0?.manualReplay === true;
    if (manualReplay && (!gate.isAdmin || body0?.confirm !== "REPLAY_EXHAUSTED" || typeof body0?.deadLetterId !== "string" || !body0.deadLetterId)) {
      return Response.json({ ok: false, error: "manual_replay_requires_admin_confirmation_and_deadLetterId" }, { status: 403 });
    }
    const requested = Number(body0?.args?.limit ?? body0?.limit ?? MAX_BATCH);
    const limit = Math.max(1, Math.min(MAX_BATCH, Number.isFinite(requested) ? Math.floor(requested) : MAX_BATCH));
    const now = new Date();
    task = await svc.entities.AgentTask.create({ brand_id: PLATFORM_TENANT, agent_name: WORKER_AGENT, task_type: manualReplay ? "p7_manual_dead_letter_replay" : "scheduled_dead_letter_retry", status: "running", requires_approval: false, risk_level: manualReplay ? 3 : 1, input_summary: manualReplay ? `Admin replay ${body0.deadLetterId}` : `Webhook DLQ sweep limit ${limit}`, started_at: now.toISOString() }).catch(() => null);

    let pending: any[] = [];
    let dueNow: any[] = [];
    if (manualReplay) {
      const one = await svc.entities.WebhookDeadLetter.get(body0.deadLetterId).catch(() => null);
      if (!one) return Response.json({ ok: false, error: "dead_letter_not_found" }, { status: 404 });
      if (one.status !== "exhausted") return Response.json({ ok: false, error: "manual_replay_only_for_exhausted" }, { status: 409 });
      pending = [one];
      dueNow = [one];
    } else {
      pending = await svc.entities.WebhookDeadLetter.filter({ status: "pending_retry" }, "-created_date", limit);
      dueNow = pending.filter((d: any) => !d.next_retry_at || new Date(d.next_retry_at) <= now).slice(0, limit);
    }

    const results: any[] = [];
    for (const dl of dueNow) {
      const fresh = await svc.entities.WebhookDeadLetter.get(dl.id).catch(() => null);
      const expectedStatus = manualReplay ? "exhausted" : "pending_retry";
      if (!fresh || fresh.status !== expectedStatus) { results.push({ id: dl.id, action: "skipped_status_changed" }); continue; }
      if (fresh.locked_at && (now.getTime() - new Date(fresh.locked_at).getTime()) < LOCK_TTL_MIN * 60 * 1000) { results.push({ id: dl.id, action: "skipped_locked" }); continue; }
      await svc.entities.WebhookDeadLetter.update(dl.id, { locked_at: new Date().toISOString() });

      const endpoint = await svc.entities.WebhookEndpoint.get(dl.webhook_id).catch(() => null);
      if (!endpoint || endpoint.status === "disabled") {
        await svc.entities.WebhookDeadLetter.update(dl.id, { status: "abandoned", locked_at: null });
        results.push({ id: dl.id, action: "abandoned_disabled_endpoint" });
        continue;
      }

      const wireBody = JSON.stringify({ event: dl.event_type, delivery_id: dl.id, timestamp: new Date().toISOString(), data: dl.payload, retry: true, manual_replay: manualReplay });
      const signature = endpoint.secret ? await hmacSha256Hex(endpoint.secret, wireBody) : "";
      const startedAt = Date.now();
      let ok = false, responseCode = 0, responseBody = "", errorMessage = "";
      try {
        const res = await fetch(endpoint.url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "CAMBRA-Webhooks/1.0 (retry)", "X-CAMBRA-Event": dl.event_type, "X-CAMBRA-Signature": signature, "X-CAMBRA-Delivery": dl.id, "X-CAMBRA-Attempt": String((dl.total_attempts || 0) + 1), "X-CAMBRA-Retry": "true", "X-CAMBRA-Manual-Replay": manualReplay ? "true" : "false" }, body: wireBody });
        ok = res.ok;
        responseCode = res.status;
        responseBody = (await res.text()).slice(0, 500);
      } catch (e) { errorMessage = String((e as Error)?.message || e || "delivery_failed").slice(0, 500); }
      const duration = Date.now() - startedAt;

      await svc.entities.WebhookDelivery.create({ webhook_id: endpoint.id, webhook_name: endpoint.name, event_type: dl.event_type, payload: dl.payload, target_url: endpoint.url, status: ok ? "success" : "failed", response_code: responseCode, response_body: responseBody, duration_ms: duration, attempt: (dl.total_attempts || 0) + 1, error_message: errorMessage });
      const newAttempts = (dl.total_attempts || 0) + 1;
      if (ok) {
        await svc.entities.WebhookDeadLetter.update(dl.id, { status: "resolved", resolved_at: new Date().toISOString(), total_attempts: newAttempts, last_response_code: responseCode, locked_at: null });
        results.push({ id: dl.id, action: "resolved", attempts: newAttempts, manualReplay });
      } else if (manualReplay || newAttempts >= MAX_TOTAL_ATTEMPTS) {
        await svc.entities.WebhookDeadLetter.update(dl.id, { status: "exhausted", total_attempts: newAttempts, last_response_code: responseCode, last_response_body: responseBody, last_error_message: errorMessage, locked_at: null });
        results.push({ id: dl.id, action: "exhausted", attempts: newAttempts, manualReplay });
      } else {
        const dlqAttemptIndex = Math.min(newAttempts - 4, BACKOFF_MINUTES.length - 1);
        const nextDelay = BACKOFF_MINUTES[Math.max(0, dlqAttemptIndex)];
        await svc.entities.WebhookDeadLetter.update(dl.id, { total_attempts: newAttempts, next_retry_at: new Date(Date.now() + nextDelay * 60 * 1000).toISOString(), last_response_code: responseCode, last_response_body: responseBody, last_error_message: errorMessage, locked_at: null });
        results.push({ id: dl.id, action: "rescheduled", attempts: newAttempts, next_delay_min: nextDelay });
      }
    }

    const summary = { processed: results.length, pending_total: pending.length, manual_replay: manualReplay, results };
    if (task?.id) await svc.entities.AgentTask.update(task.id, { status: "completed", output_summary: `Webhook DLQ ${manualReplay ? "manual replay" : "sweep"}: ${results.length} processed`, output_payload_json: summary, completed_at: new Date().toISOString() }).catch(() => null);
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    schedulerOk = false;
    const message = String((error as Error)?.message || error || "webhook_dead_letter_worker_failed").slice(0, 500);
    if (svc && task?.id) await svc.entities.AgentTask.update(task.id, { status: "failed", error: message, completed_at: new Date().toISOString() }).catch(() => null);
    return Response.json({ ok: false, error: "webhook_dead_letter_worker_failed", message }, { status: 500 });
  } finally {
    if (svc && schedulerClaim) await finishSchedulerRun(svc, schedulerClaim, { worker_key:"processWebhookDeadLetters" }, schedulerOk);
  }
}
