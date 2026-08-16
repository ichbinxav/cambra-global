import {
  attemptFailClosedOperation,
  requireCriticalOperation,
} from "./criticalExecution.ts";
import { sha256 } from "./intelligenceCore.ts";

export const PAYMENTS_MIGRATION_SAGA_VERSION = "payments-migration-saga-v1";
export const PAYMENTS_MIGRATION_RECEIPT_VERSION =
  "payments-migration-step-receipt-v1";
export const PAYMENTS_MIGRATION_SAGA_LEASE_MS = 15 * 60_000;

type SagaPhase =
  | "IDLE"
  | "CLAIMED"
  | "EFFECTING"
  | "COMMITTED"
  | "BLOCKED"
  | "RECONCILING";

const text = (value: any) => String(value || "").trim();
const copy = (value: any) => structuredClone(value || {});

function sagaError(message: string, code: string, details: any = null) {
  const error: any = new Error(message);
  error.code = code;
  error.status = 409;
  error.details = details;
  return error;
}

export function paymentsMigrationCasResult(result: any) {
  const explicitSuccess = Object.prototype.hasOwnProperty.call(
      result || {},
      "success",
    )
    ? result.success
    : undefined;
  const counters = ["updated", "modified_count", "matched_count"]
    .filter((key) => Object.prototype.hasOwnProperty.call(result || {}, key))
    .map((key) => Number(result[key]));
  if (
    explicitSuccess === false ||
    (explicitSuccess !== undefined && explicitSuccess !== true) ||
    !counters.length ||
    counters.some((value) => !Number.isInteger(value) || value < 0) ||
    new Set(counters).size !== 1
  ) return { exactly_one: false, no_match: false, ambiguous: true, counters };
  return {
    exactly_one: counters[0] === 1,
    no_match: counters[0] === 0,
    ambiguous: counters[0] !== 0 && counters[0] !== 1,
    counters,
  };
}

/**
 * Material migration authorities are always read with a cap of two.  This
 * keeps "not found", "one canonical row", and "duplicate authority" distinct;
 * a transport failure is represented separately from an empty result.
 */
export function paymentsMigrationAuthorityRows(rows: any) {
  if (!Array.isArray(rows)) {
    return { ok: false as const, state: "UNAVAILABLE" as const, row: null };
  }
  if (rows.length === 0) {
    return { ok: false as const, state: "MISSING" as const, row: null };
  }
  if (rows.length !== 1) {
    return { ok: false as const, state: "AMBIGUOUS" as const, row: null };
  }
  return { ok: true as const, state: "OBSERVED" as const, row: rows[0] };
}

const owns = (value: any, key: string) =>
  Object.prototype.hasOwnProperty.call(value || {}, key);

/** Exact authority projection used to bind the migrating -> live CAS. */
export function paymentsMigrationActivationAuthority(activation: any) {
  const revisionFields: Record<string, any> = {};
  for (const key of ["updated_date", "revision", "_revision"]) {
    if (owns(activation, key)) revisionFields[key] = activation[key];
  }
  const stableAuthorityFields: Record<string, any> = {};
  for (
    const key of [
      "active_mandate_id",
      "authorization_mandate_id",
      "provider_from",
      "provider_to",
    ]
  ) {
    if (owns(activation, key)) stableAuthorityFields[key] = activation[key];
  }
  return {
    version: "payments-migration-activation-authority-v1",
    id: text(activation?.id),
    brand_id: text(activation?.brand_id),
    provider_id: text(activation?.provider_id),
    vertical: text(activation?.vertical),
    status: text(activation?.status),
    revision_fields: revisionFields,
    stable_authority_fields: stableAuthorityFields,
    revision_authority_available: Object.keys(revisionFields).length > 0,
  };
}

export function paymentsMigrationActivationCasFilter(authority: any) {
  return {
    id: authority?.id,
    brand_id: authority?.brand_id,
    provider_id: authority?.provider_id,
    vertical: authority?.vertical,
    status: authority?.status,
    ...(authority?.stable_authority_fields || {}),
    ...(authority?.revision_fields || {}),
  };
}

/**
 * Readback may legitimately advance revision fields and status.  Every stable
 * authority dimension must remain identical to the pre-effect snapshot.
 */
export function paymentsMigrationActivationReadbackMatches(
  observed: any,
  authority: any,
  expectedStatus: string,
) {
  if (
    text(observed?.id) !== text(authority?.id) ||
    text(observed?.brand_id) !== text(authority?.brand_id) ||
    text(observed?.provider_id) !== text(authority?.provider_id) ||
    text(observed?.vertical) !== text(authority?.vertical) ||
    text(observed?.status) !== text(expectedStatus)
  ) return false;
  return Object.entries(authority?.stable_authority_fields || {}).every(
    ([key, value]) => JSON.stringify(observed?.[key]) === JSON.stringify(value),
  );
}

export function paymentsMigrationSagaState(task: any) {
  const raw = task?.metadata_json?.migration_saga || {};
  return {
    version: text(raw.version) || PAYMENTS_MIGRATION_SAGA_VERSION,
    phase: (text(raw.phase) || "IDLE") as SagaPhase,
    revision: Number(raw.revision || 0),
    operation_key: text(raw.operation_key),
    attempt_token: text(raw.attempt_token),
    lease_expires_at: text(raw.lease_expires_at),
    effect_started: raw.effect_started === true,
    automatic_retry_blocked: raw.automatic_retry_blocked === true,
    pending_step: raw.pending_step || null,
    receipts: Array.isArray(raw.receipts) ? copy(raw.receipts) : [],
    receipt_head: text(raw.receipt_head),
    receipt_count: Number(raw.receipt_count || 0),
    result: raw.result || null,
    blocker: text(raw.blocker),
    updated_at: text(raw.updated_at),
  };
}

function withSaga(task: any, saga: any) {
  return {
    ...(task?.metadata_json || {}),
    migration_saga: saga,
  };
}

async function receiptHash(receipt: any) {
  const { receipt_hash: _ignored, ...content } = receipt || {};
  return sha256(content);
}

export async function validatePaymentsMigrationReceiptChain(task: any) {
  const state = paymentsMigrationSagaState(task);
  let head = "";
  for (let index = 0; index < state.receipts.length; index++) {
    const receipt = state.receipts[index];
    if (
      receipt?.receipt_version !== PAYMENTS_MIGRATION_RECEIPT_VERSION ||
      Number(receipt?.receipt_sequence || 0) !== index + 1 ||
      text(receipt?.prior_receipt_hash) !== head ||
      !text(receipt?.operation_key) || !text(receipt?.step_key) ||
      !text(receipt?.attempt_token) || !text(receipt?.started_at) ||
      !text(receipt?.completed_at)
    ) {
      return {
        ok: false as const,
        error: "payments_migration_receipt_chain_invalid",
        receipt_count: index,
        receipt_head: head,
      };
    }
    const expected = await receiptHash(receipt);
    if (expected !== text(receipt?.receipt_hash)) {
      return {
        ok: false as const,
        error: "payments_migration_receipt_hash_mismatch",
        receipt_count: index,
        receipt_head: head,
      };
    }
    head = expected;
  }
  if (
    state.receipt_count !== state.receipts.length ||
    state.receipt_head !== head
  ) {
    return {
      ok: false as const,
      error: "payments_migration_receipt_head_mismatch",
      receipt_count: state.receipts.length,
      receipt_head: head,
    };
  }
  return {
    ok: true as const,
    receipt_count: state.receipts.length,
    receipt_head: head,
  };
}

async function readTask(svc: any, taskId: string, operation: string) {
  const rows = await requireCriticalOperation(
    operation,
    () => svc.entities.MigrationTask.filter({ id: taskId }, "-created_date", 2),
  );
  const authority = paymentsMigrationAuthorityRows(rows);
  if (authority.state === "MISSING") {
    throw sagaError(
      "payments_migration_task_missing",
      "PAYMENTS_MIGRATION_TASK_MISSING",
    );
  }
  if (authority.state === "AMBIGUOUS") {
    throw sagaError(
      "payments_migration_task_authority_ambiguous",
      "PAYMENTS_MIGRATION_TASK_AUTHORITY_AMBIGUOUS",
    );
  }
  if (!authority.ok) {
    throw sagaError(
      "payments_migration_task_authority_unavailable",
      "PAYMENTS_MIGRATION_TASK_AUTHORITY_UNAVAILABLE",
    );
  }
  return authority.row;
}

function exactFilter(task: any) {
  const filter: Record<string, any> = {
    id: task.id,
    status: task.status,
    metadata_json: task.metadata_json || {},
  };
  for (const key of ["updated_date", "revision", "_revision"]) {
    if (owns(task, key)) filter[key] = task[key];
  }
  return filter;
}

function exactPatchObserved(task: any, patch: any) {
  return Object.entries(patch || {}).every(([key, value]) =>
    value === undefined || JSON.stringify(task?.[key]) === JSON.stringify(value)
  );
}

async function casTask(
  svc: any,
  task: any,
  patch: any,
  operation: string,
) {
  const result = await attemptFailClosedOperation(
    operation,
    () =>
      svc.entities.MigrationTask.updateMany(exactFilter(task), { $set: patch }),
  );
  const decision = paymentsMigrationCasResult(result);
  if (decision.ambiguous) {
    throw sagaError(
      "payments_migration_cas_authority_ambiguous",
      "PAYMENTS_MIGRATION_CAS_AUTHORITY_AMBIGUOUS",
      decision,
    );
  }
  const observed = await readTask(
    svc,
    task.id,
    `${operation}_readback`,
  );
  return {
    decision,
    observed,
    patch_observed: exactPatchObserved(observed, patch),
  };
}

function exactSagaObserved(task: any, expected: any) {
  const observed = paymentsMigrationSagaState(task);
  return observed.version === PAYMENTS_MIGRATION_SAGA_VERSION &&
    observed.phase === expected.phase &&
    observed.revision === expected.revision &&
    observed.operation_key === expected.operation_key &&
    observed.attempt_token === expected.attempt_token;
}

export async function paymentsMigrationOperationKey(input: {
  task_id: string;
  activation_id: string;
  from_status: string;
  to_status: string;
  payload_hash: string;
}) {
  return `payments-migration:${await sha256({
    version: PAYMENTS_MIGRATION_SAGA_VERSION,
    task_id: text(input.task_id),
    activation_id: text(input.activation_id),
    from_status: text(input.from_status),
    to_status: text(input.to_status),
    payload_hash: text(input.payload_hash),
  })}`;
}

export async function markPaymentsMigrationReconciliation(
  svc: any,
  task: any,
  reason: string,
  evidence: any = null,
) {
  const current = paymentsMigrationSagaState(task);
  const next = {
    ...current,
    version: PAYMENTS_MIGRATION_SAGA_VERSION,
    phase: "RECONCILING" as SagaPhase,
    revision: current.revision + 1,
    lease_expires_at: "",
    automatic_retry_blocked: true,
    blocker: text(reason).slice(0, 500),
    result: { ...(current.result || {}), reconciliation_evidence: evidence },
    updated_at: new Date().toISOString(),
  };
  const { decision, observed, patch_observed } = await casTask(
    svc,
    task,
    {
      status: task.status === "done" ? "blocked" : task.status,
      completed_at: task.status === "done" ? "" : task.completed_at,
      blocked_reason: text(reason).slice(0, 500),
      metadata_json: withSaga(task, next),
    },
    "payments_migration_reconciliation_cas",
  );
  if (
    !decision.exactly_one || !patch_observed ||
    !exactSagaObserved(observed, next)
  ) {
    throw sagaError(
      "payments_migration_reconciliation_persistence_ambiguous",
      "PAYMENTS_MIGRATION_RECONCILIATION_PERSISTENCE_AMBIGUOUS",
    );
  }
  return observed;
}

export async function claimPaymentsMigrationSaga(
  svc: any,
  task: any,
  input: { operation_key: string; now_ms?: number },
) {
  const operationKey = text(input.operation_key);
  if (!operationKey) {
    throw sagaError(
      "payments_migration_operation_key_required",
      "PAYMENTS_MIGRATION_OPERATION_KEY_REQUIRED",
    );
  }
  let currentTask = task;
  let current = paymentsMigrationSagaState(task);
  const chain = await validatePaymentsMigrationReceiptChain(task);
  if (!chain.ok) {
    currentTask = await markPaymentsMigrationReconciliation(
      svc,
      task,
      "payments_migration_receipt_chain_invalid",
      chain,
    );
    return {
      acquired: false,
      replay: false,
      review_required: true,
      task: currentTask,
    };
  }
  if (current.phase === "COMMITTED" && current.operation_key === operationKey) {
    return {
      acquired: false,
      replay: true,
      review_required: false,
      task,
      result: current.result,
    };
  }
  if (current.phase === "COMMITTED") {
    return {
      acquired: false,
      replay: false,
      review_required: true,
      binding_conflict: true,
      task,
    };
  }
  if (
    current.phase === "RECONCILING" ||
    (current.phase === "BLOCKED" && current.effect_started)
  ) {
    return { acquired: false, replay: false, review_required: true, task };
  }
  if (["CLAIMED", "EFFECTING"].includes(current.phase)) {
    const lease = Date.parse(current.lease_expires_at);
    const nowMs = Number(input.now_ms || Date.now());
    if (!Number.isFinite(lease)) {
      currentTask = await markPaymentsMigrationReconciliation(
        svc,
        task,
        "payments_migration_lease_authority_unknown",
      );
      return {
        acquired: false,
        replay: false,
        review_required: true,
        task: currentTask,
      };
    }
    if (lease > nowMs) {
      return {
        acquired: false,
        replay: false,
        in_progress: true,
        review_required: false,
        task,
      };
    }
    if (
      current.phase === "EFFECTING" || current.effect_started ||
      current.pending_step
    ) {
      currentTask = await markPaymentsMigrationReconciliation(
        svc,
        task,
        "expired_payments_migration_effect_requires_reconciliation",
      );
      return {
        acquired: false,
        replay: false,
        review_required: true,
        task: currentTask,
      };
    }
  }

  const nowMs = Number(input.now_ms || Date.now());
  const next = {
    ...current,
    version: PAYMENTS_MIGRATION_SAGA_VERSION,
    phase: "CLAIMED" as SagaPhase,
    revision: current.revision + 1,
    operation_key: operationKey,
    attempt_token: `payments-migration-attempt:${crypto.randomUUID()}`,
    lease_expires_at: new Date(nowMs + PAYMENTS_MIGRATION_SAGA_LEASE_MS)
      .toISOString(),
    effect_started: false,
    automatic_retry_blocked: false,
    pending_step: null,
    result: null,
    blocker: "",
    updated_at: new Date(nowMs).toISOString(),
  };
  const { decision, observed, patch_observed } = await casTask(
    svc,
    task,
    { metadata_json: withSaga(task, next) },
    "payments_migration_claim_cas",
  );
  if (
    decision.exactly_one && patch_observed &&
    exactSagaObserved(observed, next)
  ) {
    return {
      acquired: true,
      replay: false,
      review_required: false,
      task: observed,
    };
  }
  const observedState = paymentsMigrationSagaState(observed);
  const observedChain = await validatePaymentsMigrationReceiptChain(observed);
  if (
    observedChain.ok && observedState.phase === "COMMITTED" &&
    observedState.operation_key === operationKey
  ) {
    return {
      acquired: false,
      replay: true,
      review_required: false,
      task: observed,
      result: observedState.result,
    };
  }
  if (
    observedState.operation_key === operationKey &&
    ["CLAIMED", "EFFECTING"].includes(observedState.phase)
  ) {
    return {
      acquired: false,
      replay: false,
      in_progress: true,
      review_required: false,
      task: observed,
    };
  }
  return {
    acquired: false,
    replay: false,
    review_required: true,
    task: observed,
  };
}

export async function startPaymentsMigrationSagaStep(
  svc: any,
  task: any,
  input: { operation_key: string; attempt_token: string; step_key: string },
) {
  const current = paymentsMigrationSagaState(task);
  if (
    current.phase !== "CLAIMED" ||
    current.operation_key !== text(input.operation_key) ||
    current.attempt_token !== text(input.attempt_token)
  ) {
    throw sagaError(
      "payments_migration_saga_fence_lost",
      "PAYMENTS_MIGRATION_SAGA_FENCE_LOST",
    );
  }
  const chain = await validatePaymentsMigrationReceiptChain(task);
  if (!chain.ok) {
    throw sagaError(
      chain.error,
      "PAYMENTS_MIGRATION_RECEIPT_CHAIN_INVALID",
      chain,
    );
  }
  const startedAt = new Date().toISOString();
  const pending = {
    receipt_version: PAYMENTS_MIGRATION_RECEIPT_VERSION,
    receipt_sequence: chain.receipt_count + 1,
    prior_receipt_hash: chain.receipt_head,
    operation_key: current.operation_key,
    step_key: text(input.step_key),
    attempt_token: current.attempt_token,
    started_at: startedAt,
  };
  const next = {
    ...current,
    phase: "EFFECTING" as SagaPhase,
    revision: current.revision + 1,
    effect_started: true,
    automatic_retry_blocked: true,
    pending_step: pending,
    lease_expires_at: new Date(Date.now() + PAYMENTS_MIGRATION_SAGA_LEASE_MS)
      .toISOString(),
    updated_at: startedAt,
  };
  const { decision, observed, patch_observed } = await casTask(
    svc,
    task,
    { metadata_json: withSaga(task, next) },
    "payments_migration_effect_start_cas",
  );
  if (
    !decision.exactly_one || !patch_observed ||
    !exactSagaObserved(observed, next)
  ) {
    throw sagaError(
      "payments_migration_effect_start_ambiguous",
      "PAYMENTS_MIGRATION_EFFECT_START_AMBIGUOUS",
    );
  }
  return observed;
}

export async function finishPaymentsMigrationSagaStep(
  svc: any,
  task: any,
  input: {
    operation_key: string;
    attempt_token: string;
    step_key: string;
    result: any;
    terminal_phase: "COMMITTED" | "BLOCKED" | "RECONCILING";
    task_patch: any;
  },
) {
  const current = paymentsMigrationSagaState(task);
  const pending = current.pending_step;
  if (
    current.phase !== "EFFECTING" ||
    current.operation_key !== text(input.operation_key) ||
    current.attempt_token !== text(input.attempt_token) ||
    pending?.step_key !== text(input.step_key)
  ) {
    throw sagaError(
      "payments_migration_saga_fence_lost",
      "PAYMENTS_MIGRATION_SAGA_FENCE_LOST",
    );
  }
  const receipt = {
    ...pending,
    completed_at: new Date().toISOString(),
    result: input.result || null,
  };
  const hash = await receiptHash(receipt);
  const receipts = [...current.receipts, { ...receipt, receipt_hash: hash }];
  const next = {
    ...current,
    phase: input.terminal_phase as SagaPhase,
    revision: current.revision + 1,
    lease_expires_at: "",
    pending_step: null,
    receipts,
    receipt_head: hash,
    receipt_count: receipts.length,
    automatic_retry_blocked: input.terminal_phase !== "COMMITTED",
    blocker: input.terminal_phase === "COMMITTED"
      ? ""
      : text(input?.result?.blocker || input.terminal_phase).slice(0, 500),
    result: input.result || null,
    updated_at: new Date().toISOString(),
  };
  const { decision, observed, patch_observed } = await casTask(
    svc,
    task,
    {
      ...input.task_patch,
      metadata_json: withSaga(
        {
          metadata_json: input?.task_patch?.metadata_json || task.metadata_json,
        },
        next,
      ),
    },
    "payments_migration_effect_finish_cas",
  );
  const observedChain = await validatePaymentsMigrationReceiptChain(observed);
  if (
    !decision.exactly_one || !patch_observed ||
    !exactSagaObserved(observed, next) ||
    !observedChain.ok || observedChain.receipt_head !== hash
  ) {
    throw sagaError(
      "payments_migration_effect_receipt_readback_mismatch",
      "PAYMENTS_MIGRATION_EFFECT_RECEIPT_READBACK_MISMATCH",
      observedChain,
    );
  }
  return observed;
}

export async function blockPaymentsMigrationSagaBeforeEffect(
  svc: any,
  task: any,
  input: { operation_key: string; attempt_token: string; blocker: string },
) {
  const current = paymentsMigrationSagaState(task);
  if (
    current.phase !== "CLAIMED" || current.effect_started ||
    current.operation_key !== text(input.operation_key) ||
    current.attempt_token !== text(input.attempt_token)
  ) {
    throw sagaError(
      "payments_migration_saga_fence_lost",
      "PAYMENTS_MIGRATION_SAGA_FENCE_LOST",
    );
  }
  const next = {
    ...current,
    phase: "BLOCKED" as SagaPhase,
    revision: current.revision + 1,
    lease_expires_at: "",
    automatic_retry_blocked: false,
    blocker: text(input.blocker).slice(0, 500),
    updated_at: new Date().toISOString(),
  };
  const { decision, observed, patch_observed } = await casTask(
    svc,
    task,
    {
      status: "blocked",
      blocked_reason: next.blocker,
      metadata_json: withSaga(task, next),
    },
    "payments_migration_pre_effect_block_cas",
  );
  if (
    !decision.exactly_one || !patch_observed ||
    !exactSagaObserved(observed, next)
  ) {
    throw sagaError(
      "payments_migration_pre_effect_block_ambiguous",
      "PAYMENTS_MIGRATION_PRE_EFFECT_BLOCK_AMBIGUOUS",
    );
  }
  return observed;
}
