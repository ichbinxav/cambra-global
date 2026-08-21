import {
  buildCanonicalAgentTerminalEvent,
  inspectCanonicalAgentTerminalEventReplay,
} from "./agentTaskEnvelope.ts";

export const AGENT_TASK_TERMINAL_EVENT_RECONCILER_VERSION =
  "agent-task-terminal-event-reconciler-v1.1.0";
export const AGENT_TASK_TERMINAL_EVENT_RECONCILER_GUARANTEE =
  "PER_TASK_CAS_LEASE_WITH_POST_WRITE_RECONCILIATION_NO_DATASTORE_EXACTLY_ONCE_GUARANTEE";
export const AGENT_TASK_TERMINAL_EVENT_CLAIM_LEASE_MS = 5 * 60 * 1000;

const SAFE_RECONCILER_REQUEST_ID =
  /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;

export function stableAgentTaskTerminalWorkerErrorCode(error: any) {
  const message = String(error?.message || "");
  if (/^agent_task_terminal_event_[a-z0-9_:-]{1,120}$/i.test(message)) {
    return message.toUpperCase();
  }
  const name = String(error?.name || "WORKER_ERROR");
  if (name === "TypeError") return "TYPE_ERROR";
  if (name === "AbortError") return "ABORT_ERROR";
  return "UNEXPECTED_ERROR";
}

/** Never serialize the thrown object, its message, cause, stack or body. */
export function agentTaskTerminalReconcilerFailureLog(
  error: any,
  requestId?: string | null,
) {
  const supplied = String(requestId || "").trim();
  const safeRequestId = SAFE_RECONCILER_REQUEST_ID.test(supplied)
    ? supplied
    : crypto.randomUUID();
  return {
    level: "error",
    event: "agent_task_terminal_event_reconciler_failed",
    error_code: stableAgentTaskTerminalWorkerErrorCode(error),
    request_id: safeRequestId,
  } as const;
}

type OutboxState =
  | "PENDING"
  | "CLAIMED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "REVIEW_REQUIRED";

export type AgentTaskTerminalEventOutboxOutcome = {
  state: "PUBLISHED" | "PENDING" | "REVIEW_REQUIRED";
  reason: string;
  task_id: string;
  event_id: string | null;
  conflicting_event_ids: string[];
};

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

function canonicalStoredValue(value: unknown, depth = 0): unknown {
  if (depth > 25) throw new Error("agent_task_terminal_event_readback_too_deep");
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalStoredValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort().map((key) => [
        key,
        canonicalStoredValue(
          (value as Record<string, unknown>)[key],
          depth + 1,
        ),
      ]),
    );
  }
  return value;
}

function sameStoredValue(observed: unknown, expected: unknown) {
  return JSON.stringify(canonicalStoredValue(observed)) ===
    JSON.stringify(canonicalStoredValue(expected));
}

const DETERMINISTIC_INTENT_ERRORS = new Set([
  "agent_task_terminal_event_intent_required",
  "agent_task_terminal_event_task_binding_conflict",
  "agent_task_terminal_event_intent_content_conflict",
  "agent_task_terminal_event_requires_settled_task",
  "agent_task_terminal_event_tenant_scope_conflict",
  "agent_task_terminal_event_entity_reference_incomplete",
  "agent_task_terminal_event_proposal_incomplete",
  "agent_task_terminal_event_candidate_scope_conflict",
  "agent_task_event_lineage_unknown",
  "agent_task_source_refs_limit_exceeded",
]);

function isDeterministicIntentError(code: string) {
  return DETERMINISTIC_INTENT_ERRORS.has(code) ||
    code.startsWith("invalid_agent_task_envelope_terminal_event_") ||
    code.startsWith("agent_task_projection_");
}

function outboxRevision(task: any) {
  const revision = Number(task?.terminal_event_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("agent_task_terminal_event_revision_required");
  }
  return revision;
}

function claimExpired(task: any, now = Date.now()) {
  const expires = Date.parse(String(task?.terminal_event_lease_expires_at || ""));
  return !Number.isFinite(expires) || expires <= now;
}

async function authoritativeIntent(task: any) {
  if (
    !task?.id ||
    !["PENDING", "CLAIMED", "PUBLISHING"].includes(
      String(task.terminal_event_state || ""),
    )
  ) throw new Error("agent_task_terminal_event_open_outbox_required");
  const intent = task.terminal_event_intent_json;
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) {
    throw new Error("agent_task_terminal_event_intent_required");
  }
  const proposed = await buildCanonicalAgentTerminalEvent(task, {
    eventType: intent.event_type,
    source: intent.source,
    entityType: intent.entity_type,
    entityId: intent.entity_id,
    payload: intent.payload_json,
  });
  if (
    String(task.terminal_event_idempotency_key || "") !==
      proposed.idempotency_key ||
    String(task.terminal_event_payload_hash || "") !==
      proposed.payload_content_hash
  ) throw new Error("agent_task_terminal_event_task_binding_conflict");
  const inspection = inspectCanonicalAgentTerminalEventReplay(
    [{ id: "persisted-intent", ...intent }],
    proposed,
  );
  if (inspection.state !== "MATCHED_REPLAY") {
    throw Object.assign(
      new Error("agent_task_terminal_event_intent_content_conflict"),
      { mismatched_fields: inspection.mismatched_fields },
    );
  }
  return proposed;
}

async function exactEventRows(
  svc: any,
  brandId: string,
  idempotencyKey: string,
) {
  const rows = await svc.entities.Event.filter(
    { brand_id: brandId, idempotency_key: idempotencyKey },
    "created_date",
    2,
  );
  if (!Array.isArray(rows)) {
    throw new Error("agent_task_terminal_event_reconciliation_unavailable");
  }
  return rows;
}

async function transitionOutbox(
  svc: any,
  task: any,
  input: {
    state: OutboxState;
    reason: string;
    eventId?: string | null;
    conflictingEventIds?: string[];
    claimToken?: string | null;
    leaseExpiresAt?: string | null;
  },
) {
  const revision = outboxRevision(task);
  const currentState = String(task.terminal_event_state || "");
  const currentClaimToken = String(task.terminal_event_claim_token || "");
  const at = new Date().toISOString();
  const eventId = String(input.eventId || "") || null;
  const conflictingEventIds = (input.conflictingEventIds || [])
    .map((value) => String(value || ""))
    .filter(Boolean)
    .slice(0, 20);
  const keepsClaim = ["CLAIMED", "PUBLISHING"].includes(input.state);
  const nextClaimToken = keepsClaim
    ? String(input.claimToken || currentClaimToken || "")
    : "";
  if (keepsClaim && !nextClaimToken) {
    throw new Error("agent_task_terminal_event_claim_token_required");
  }
  const nextLeaseExpiresAt = keepsClaim
    ? input.leaseExpiresAt || task.terminal_event_lease_expires_at
    : null;
  if (keepsClaim && !String(nextLeaseExpiresAt || "")) {
    throw new Error("agent_task_terminal_event_lease_expiry_required");
  }
  const patch: Record<string, unknown> = {
    terminal_event_state: input.state,
    terminal_event_revision: revision + 1,
    terminal_event_last_attempt_at: at,
    terminal_event_next_attempt_at: keepsClaim
      ? nextLeaseExpiresAt
      : input.state === "PENDING"
      ? at
      : null,
    terminal_event_error: ["PUBLISHED", "CLAIMED", "PUBLISHING"].includes(
        input.state,
      )
      ? null
      : input.reason,
    terminal_event_conflicting_ids_json: conflictingEventIds,
    terminal_event_claim_token: keepsClaim ? nextClaimToken : null,
    terminal_event_claimed_at: input.state === "CLAIMED"
      ? at
      : keepsClaim
      ? task.terminal_event_claimed_at
      : null,
    terminal_event_lease_expires_at: nextLeaseExpiresAt,
    // terminal_event_id is a publication receipt, never a candidate ID. Only
    // one exact matching readback may populate it; review candidates live in
    // terminal_event_conflicting_ids_json.
    terminal_event_id:
      input.state === "PUBLISHED" && eventId ? eventId : null,
    terminal_event_published_at: input.state === "PUBLISHED" ? at : null,
  };
  const filter: Record<string, unknown> = {
    id: task.id,
    brand_id: task.brand_id,
    tenant_key: task.tenant_key,
    terminal_event_state: currentState,
    terminal_event_revision: revision,
    terminal_event_next_attempt_at: task.terminal_event_next_attempt_at,
    terminal_event_idempotency_key: task.terminal_event_idempotency_key,
    terminal_event_payload_hash: task.terminal_event_payload_hash,
    trace_revision: task.trace_revision,
  };
  if (currentClaimToken) filter.terminal_event_claim_token = currentClaimToken;
  const result = await svc.entities.AgentTask.updateMany(filter, { $set: patch });
  if (!updatedExactlyOne(result)) {
    throw new Error("agent_task_terminal_event_transition_conflict");
  }
  const observed = await svc.entities.AgentTask.get(task.id);
  if (
    !observed || observed.terminal_event_state !== input.state ||
    Number(observed.terminal_event_revision) !== revision + 1 ||
    String(observed.brand_id || "") !== String(task.brand_id || "") ||
    String(observed.tenant_key || "") !== String(task.tenant_key || "") ||
    String(observed.terminal_event_idempotency_key || "") !==
      String(task.terminal_event_idempotency_key || "") ||
    String(observed.terminal_event_payload_hash || "") !==
      String(task.terminal_event_payload_hash || "") ||
    !sameStoredValue(
      observed.terminal_event_intent_json,
      task.terminal_event_intent_json,
    ) ||
    Number(observed.trace_revision) !== Number(task.trace_revision) ||
    (input.state === "PUBLISHED" && eventId &&
      String(observed.terminal_event_id || "") !== eventId) ||
    (keepsClaim &&
      String(observed.terminal_event_claim_token || "") !== nextClaimToken) ||
    Object.entries(patch).some(([key, value]) =>
      !sameStoredValue(observed[key], value)
    )
  ) throw new Error("agent_task_terminal_event_transition_readback_mismatch");
  return observed;
}

async function claimOutbox(svc: any, task: any) {
  const claimToken = `terminal-event-claim:${crypto.randomUUID()}`;
  return await transitionOutbox(svc, task, {
    state: "CLAIMED",
    reason: "OUTBOX_CLAIMED",
    claimToken,
    leaseExpiresAt: new Date(
      Date.now() + AGENT_TASK_TERMINAL_EVENT_CLAIM_LEASE_MS,
    ).toISOString(),
  });
}

async function settleFromObservedEvents(
  svc: any,
  task: any,
  proposed: any,
  rows: any[],
  source:
    | "PRE_CREATE"
    | "POST_CREATE"
    | "CREATE_ERROR_RECONCILIATION"
    | "STALE_CLAIM_RECONCILIATION"
    | "STALE_PUBLISHING_RECONCILIATION",
): Promise<AgentTaskTerminalEventOutboxOutcome | null> {
  const inspection = inspectCanonicalAgentTerminalEventReplay(rows, proposed);
  if (inspection.state === "NO_OBSERVED_EVENT") return null;
  if (inspection.state === "MATCHED_REPLAY" && inspection.event_id) {
    await transitionOutbox(svc, task, {
      state: "PUBLISHED",
      reason: `${source}_MATCHED_REPLAY`,
      eventId: inspection.event_id,
    });
    return {
      state: "PUBLISHED",
      reason: `${source}_MATCHED_REPLAY`,
      task_id: String(task.id),
      event_id: inspection.event_id,
      conflicting_event_ids: [],
    };
  }
  const reason = `${source}_${inspection.state}`;
  await transitionOutbox(svc, task, {
    state: "REVIEW_REQUIRED",
    reason,
    eventId: inspection.event_id,
    conflictingEventIds: inspection.event_ids,
  });
  return {
    state: "REVIEW_REQUIRED",
    reason,
    task_id: String(task.id),
    event_id: null,
    conflicting_event_ids: inspection.event_ids,
  };
}

async function reviewRequired(
  svc: any,
  task: any,
  reason: string,
  eventId?: string | null,
) {
  await transitionOutbox(svc, task, {
    state: "REVIEW_REQUIRED",
    reason,
    eventId,
    conflictingEventIds: eventId ? [eventId] : [],
  });
  return {
    state: "REVIEW_REQUIRED" as const,
    reason,
    task_id: String(task.id),
    event_id: null,
    conflicting_event_ids: eventId ? [eventId] : [],
  };
}

/**
 * Reconciles one durable terminal Event intent. PENDING is fenced into CLAIMED
 * before the pre-write read and into PUBLISHING immediately before Event.create.
 * An expired CLAIMED row may retry only after an exact read proves no Event;
 * an expired PUBLISHING row with no Event is quarantined, never replayed.
 */
export async function reconcileCanonicalAgentTerminalEventOutboxRow(
  svc: any,
  inputTask: any,
): Promise<AgentTaskTerminalEventOutboxOutcome> {
  let task = inputTask;
  let proposed: any;
  try {
    proposed = await authoritativeIntent(task);
  } catch (error: any) {
    const code = String(error?.message || error || "");
    if (isDeterministicIntentError(code)) {
      return await reviewRequired(
        svc,
        task,
        `INVALID_OUTBOX_${code.toUpperCase()}`,
      );
    }
    throw error;
  }
  const initialState = String(task.terminal_event_state || "");

  if (initialState === "PUBLISHING") {
    if (!claimExpired(task)) {
      return {
        state: "PENDING",
        reason: "ACTIVE_PUBLISHING_CLAIM",
        task_id: String(task.id),
        event_id: null,
        conflicting_event_ids: [],
      };
    }
    let rows: any[];
    try {
      rows = await exactEventRows(
        svc,
        proposed.brand_id,
        proposed.idempotency_key,
      );
    } catch {
      return await reviewRequired(
        svc,
        task,
        "STALE_PUBLISHING_RECONCILIATION_UNAVAILABLE",
      );
    }
    const recovered = await settleFromObservedEvents(
      svc,
      task,
      proposed,
      rows,
      "STALE_PUBLISHING_RECONCILIATION",
    );
    if (recovered) return recovered;
    return await reviewRequired(
      svc,
      task,
      "STALE_PUBLISHING_NO_EVENT_REVIEW_REQUIRED",
    );
  }

  if (initialState === "CLAIMED") {
    if (!claimExpired(task)) {
      return {
        state: "PENDING",
        reason: "ACTIVE_PRE_EFFECT_CLAIM",
        task_id: String(task.id),
        event_id: null,
        conflicting_event_ids: [],
      };
    }
    let rows: any[];
    try {
      rows = await exactEventRows(
        svc,
        proposed.brand_id,
        proposed.idempotency_key,
      );
    } catch {
      return {
        state: "PENDING",
        reason: "STALE_CLAIM_RECONCILIATION_UNAVAILABLE",
        task_id: String(task.id),
        event_id: null,
        conflicting_event_ids: [],
      };
    }
    const recovered = await settleFromObservedEvents(
      svc,
      task,
      proposed,
      rows,
      "STALE_CLAIM_RECONCILIATION",
    );
    if (recovered) return recovered;
    task = await claimOutbox(svc, task);
  } else if (initialState === "PENDING") {
    task = await claimOutbox(svc, task);
  } else {
    throw new Error("agent_task_terminal_event_reconcilable_state_required");
  }

  proposed = await authoritativeIntent(task);
  let before: any[];
  try {
    before = await exactEventRows(
      svc,
      proposed.brand_id,
      proposed.idempotency_key,
    );
  } catch {
    task = await transitionOutbox(svc, task, {
      state: "PENDING",
      reason: "PRE_CREATE_RECONCILIATION_UNAVAILABLE",
    });
    return {
      state: "PENDING",
      reason: "PRE_CREATE_RECONCILIATION_UNAVAILABLE",
      task_id: String(task.id),
      event_id: null,
      conflicting_event_ids: [],
    };
  }
  const preexisting = await settleFromObservedEvents(
    svc,
    task,
    proposed,
    before,
    "PRE_CREATE",
  );
  if (preexisting) return preexisting;

  task = await transitionOutbox(svc, task, {
    state: "PUBLISHING",
    reason: "EVENT_CREATE_STARTING",
  });
  let created: any = null;
  try {
    created = await svc.entities.Event.create(proposed);
  } catch {
    let afterError: any[] | null = null;
    try {
      afterError = await exactEventRows(
        svc,
        proposed.brand_id,
        proposed.idempotency_key,
      );
    } catch {
      // Event.create may have crossed its durability boundary. The PUBLISHING
      // fence makes the ambiguity non-retriable without reconciliation.
    }
    if (afterError) {
      const reconciled = await settleFromObservedEvents(
        svc,
        task,
        proposed,
        afterError,
        "CREATE_ERROR_RECONCILIATION",
      );
      if (reconciled) return reconciled;
    }
    return await reviewRequired(
      svc,
      task,
      "EVENT_CREATE_OUTCOME_AMBIGUOUS",
    );
  }

  let after: any[] | null = null;
  try {
    after = await exactEventRows(
      svc,
      proposed.brand_id,
      proposed.idempotency_key,
    );
  } catch {
    // A returned id is not proof of one durable matching Event.
  }
  if (after) {
    const reconciled = await settleFromObservedEvents(
      svc,
      task,
      proposed,
      after,
      "POST_CREATE",
    );
    if (reconciled) return reconciled;
  }
  return await reviewRequired(
    svc,
    task,
    "EVENT_CREATE_READBACK_UNPROVEN",
    String(created?.id || "") || null,
  );
}
