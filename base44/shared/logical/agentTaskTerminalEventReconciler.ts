import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { requireAdminOrInternal } from "../internalGate.ts";
import {
  claimSchedulerRun,
  finishSchedulerRunOrThrow,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
} from "../schedulerRun.ts";
import {
  AGENT_TASK_TERMINAL_EVENT_CLAIM_LEASE_MS,
  AGENT_TASK_TERMINAL_EVENT_RECONCILER_GUARANTEE,
  AGENT_TASK_TERMINAL_EVENT_RECONCILER_VERSION,
  agentTaskTerminalReconcilerFailureLog,
  reconcileCanonicalAgentTerminalEventOutboxRow,
  stableAgentTaskTerminalWorkerErrorCode,
} from "../agentTaskTerminalEventOutbox.ts";

const MAX_BATCH = 50;

function updatedExactlyOne(result: any) {
  if (!result || typeof result !== "object") return false;
  const explicit = ["success", "ok"]
    .filter((key) => Object.prototype.hasOwnProperty.call(result, key))
    .map((key) => result[key]);
  if (explicit.some((value) => value !== true)) return false;
  const counts = ["updated", "modified_count", "matched_count"]
    .filter((key) => result[key] !== undefined && result[key] !== null)
    .map((key) => Number(result[key]));
  return counts.length > 0 &&
    counts.every((value) => Number.isInteger(value) && value === 1);
}

async function recordWorkerError(svc: any, task: any, code: string) {
  if (!String(task?.id || "")) return false;
  const filter: Record<string, unknown> = {
    id: task?.id,
    terminal_event_state: task?.terminal_event_state,
  };
  for (const key of [
    "brand_id",
    "tenant_key",
    "terminal_event_idempotency_key",
    "terminal_event_payload_hash",
    "terminal_event_next_attempt_at",
    "trace_revision",
  ]) {
    if (task?.[key] !== undefined && task?.[key] !== null) {
      filter[key] = task[key];
    }
  }
  const revision = Number(task?.terminal_event_revision);
  if (Number.isSafeInteger(revision) && revision >= 0) {
    filter.terminal_event_revision = revision;
  }
  if (String(task?.terminal_event_claim_token || "")) {
    filter.terminal_event_claim_token = task.terminal_event_claim_token;
  }
  const attemptedAt = new Date().toISOString();
  const nextAttemptAt = new Date(
    Date.now() + AGENT_TASK_TERMINAL_EVENT_CLAIM_LEASE_MS,
  ).toISOString();
  const errorCode = `WORKER_ERROR:${code}`.slice(0, 200);
  const result = await svc.entities.AgentTask.updateMany(filter, {
    $set: {
      terminal_event_last_attempt_at: attemptedAt,
      terminal_event_next_attempt_at: nextAttemptAt,
      terminal_event_error: errorCode,
    },
  });
  if (!updatedExactlyOne(result)) return false;
  const observed = await svc.entities.AgentTask.get(task.id);
  return Boolean(
    observed &&
      observed.terminal_event_state === task.terminal_event_state &&
      observed.terminal_event_last_attempt_at === attemptedAt &&
      observed.terminal_event_next_attempt_at === nextAttemptAt &&
      observed.terminal_event_error === errorCode,
  );
}

async function initializeMissingNextAttempt(svc: any, task: any) {
  if (!String(task?.id || "")) {
    throw new Error("agent_task_terminal_event_task_id_required");
  }
  const filter: Record<string, unknown> = {
    id: task.id,
    terminal_event_state: task.terminal_event_state,
    terminal_event_next_attempt_at: null,
  };
  for (const key of [
    "brand_id",
    "tenant_key",
    "terminal_event_idempotency_key",
    "terminal_event_payload_hash",
    "trace_revision",
  ]) {
    if (task?.[key] !== undefined && task?.[key] !== null) {
      filter[key] = task[key];
    }
  }
  const revision = Number(task?.terminal_event_revision);
  if (Number.isSafeInteger(revision) && revision >= 0) {
    filter.terminal_event_revision = revision;
  }
  if (String(task?.terminal_event_claim_token || "")) {
    filter.terminal_event_claim_token = task.terminal_event_claim_token;
  }
  const dueAt = new Date().toISOString();
  const result = await svc.entities.AgentTask.updateMany(filter, {
    $set: { terminal_event_next_attempt_at: dueAt },
  });
  if (!updatedExactlyOne(result)) {
    throw new Error("agent_task_terminal_event_schedule_backfill_conflict");
  }
  const observed = await svc.entities.AgentTask.get(task.id);
  if (
    !observed ||
    observed.terminal_event_state !== task.terminal_event_state ||
    observed.terminal_event_next_attempt_at !== dueAt ||
    (Number.isSafeInteger(revision) &&
      Number(observed.terminal_event_revision) !== revision)
  ) {
    throw new Error("agent_task_terminal_event_schedule_backfill_mismatch");
  }
  return observed;
}

export async function handleAgentTaskTerminalEventReconciler(req: Request) {
  let svc: any = null;
  let claim: any = null;
  let success = true;
  try {
    const base44 = createClientFromRequest(req);
    // claimSchedulerRun also inspects a clone of the request. Preserve the
    // original body so the scheduler authority can derive the same identity.
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    svc = base44.asServiceRole;
    const requested = Number(body?.args?.limit ?? body?.limit ?? MAX_BATCH);
    const limit = Math.max(
      1,
      Math.min(
        MAX_BATCH,
        Number.isFinite(requested) ? Math.floor(requested) : MAX_BATCH,
      ),
    );
    claim = await claimSchedulerRun(svc, req, {
      worker_key: "agentTaskTerminalEventReconciler",
      cadence_seconds: 300,
    });
    {
      const denied = schedulerClaimDeniedResponse(claim);
      if (denied) return denied;
    }
    const openStates = { $in: ["PENDING", "CLAIMED", "PUBLISHING"] };
    const now = new Date().toISOString();
    const [legacyUndated, dueRows] = await Promise.all([
      // Explicit compatibility intake for any row created before
      // terminal_event_next_attempt_at existed. Canonical new rows never rely
      // on datastore null ordering.
      svc.entities.AgentTask.filter(
        {
          terminal_event_state: openStates,
          terminal_event_next_attempt_at: null,
        },
        "created_date",
        limit,
      ),
      svc.entities.AgentTask.filter(
        {
          terminal_event_state: openStates,
          terminal_event_next_attempt_at: { $lte: now },
        },
        "terminal_event_next_attempt_at",
        limit,
      ),
    ]);
    if (!Array.isArray(legacyUndated) || !Array.isArray(dueRows)) {
      throw new Error("agent_task_terminal_event_pending_read_unavailable");
    }
    const pending = [...legacyUndated, ...dueRows]
      .filter((task, index, rows) =>
        rows.findIndex((candidate) => candidate?.id === task?.id) === index
      )
      .slice(0, limit);
    if (pending.length > 0) {
      claim = await markSchedulerEffectStarted(svc, claim);
      const denied = schedulerClaimDeniedResponse(claim);
      if (denied) return denied;
    }

    const outcomes: any[] = [];
    let legacySchedulesBackfilled = 0;
    for (const task of pending) {
      try {
        const scheduledTask = String(task?.terminal_event_next_attempt_at || "")
          ? task
          : await initializeMissingNextAttempt(svc, task);
        if (scheduledTask !== task) legacySchedulesBackfilled += 1;
        outcomes.push(
          await reconcileCanonicalAgentTerminalEventOutboxRow(
            svc,
            scheduledTask,
          ),
        );
      } catch (error: any) {
        const code = stableAgentTaskTerminalWorkerErrorCode(error);
        let errorRecorded = false;
        try {
          errorRecorded = await recordWorkerError(svc, task, code);
        } catch {
          // The SchedulerRun is failed below. Never pretend that an unrecorded
          // per-row failure left a proven PENDING state.
        }
        outcomes.push({
          state: "ERROR",
          reason: code,
          task_id: String(task?.id || ""),
          event_id: null,
          conflicting_event_ids: [],
          worker_error: true,
          error_recorded: errorRecorded,
        });
      }
    }
    const counts = {
      published: outcomes.filter((row) => row.state === "PUBLISHED").length,
      pending: outcomes.filter((row) => row.state === "PENDING").length,
      review_required: outcomes.filter((row) =>
        row.state === "REVIEW_REQUIRED"
      ).length,
      worker_errors: outcomes.filter((row) => row.worker_error === true).length,
    };
    success = counts.worker_errors === 0;
    return Response.json({
      ok: success,
      scanned: pending.length,
      legacy_schedules_backfilled: legacySchedulesBackfilled,
      ...counts,
      outcomes: outcomes.slice(0, MAX_BATCH),
      reconciler_version: AGENT_TASK_TERMINAL_EVENT_RECONCILER_VERSION,
      persistence_guarantee:
        AGENT_TASK_TERMINAL_EVENT_RECONCILER_GUARANTEE,
      exactly_once_claimed: false,
    }, { status: success ? 200 : 500 });
  } catch (error) {
    success = false;
    const failureLog = agentTaskTerminalReconcilerFailureLog(
      error,
      req.headers.get("x-request-id") || req.headers.get("x-correlation-id"),
    );
    console.error(JSON.stringify(failureLog));
    return Response.json({
      ok: false,
      error: "agent_task_terminal_event_reconciler_failed",
      request_id: failureLog.request_id,
      exactly_once_claimed: false,
    }, { status: 500 });
  } finally {
    if (svc && claim?.allowed) {
      await finishSchedulerRunOrThrow(svc, claim, {
        worker_key: "agentTaskTerminalEventReconciler",
      }, success);
    }
  }
}
