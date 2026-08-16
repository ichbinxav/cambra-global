import { sha256 } from "./intelligenceCore.ts";
import {
  materialEffectTakeoverDecision,
  webhookDlqMaterialEffectState,
} from "./materialEffectContract.ts";

export const WEBHOOK_DLQ_CLAIM_VERSION = "webhook-dlq-claim-v3.0.0";
export const WEBHOOK_DLQ_LEASE_MS = 10 * 60_000;

export type WebhookMaterialClaimState =
  | "RELEASED"
  | "CLAIMED"
  | "EFFECT_STARTED"
  | "EXECUTED"
  | "FAILED_PRE_EFFECT"
  | "FAILED_POST_EFFECT"
  | "REVIEW_REQUIRED"
  | "EXPIRED_PRE_EFFECT";

type WebhookClaimableStatus =
  | "dispatch_pending"
  | "pending_retry"
  | "exhausted";

const BENIGN_WEBHOOK_CLAIM_DENIALS = new Set([
  "claim_active",
  "status_changed",
  "already_executed",
]);

/**
 * Projects a failed DLQ claim/start into the worker response contract. Only a
 * proven live/terminal duplicate is benign. CAS conflict, authority ambiguity
 * and a lost delivery-start fence must fail the scheduler invocation visibly;
 * otherwise a 200 would make the cadence slot look complete while no owner is
 * proven.
 */
export function webhookClaimFailureDecision(result: any) {
  const reason = String(result?.reason || "webhook_claim_unknown");
  const benign = result?.review_required !== true &&
    BENIGN_WEBHOOK_CLAIM_DENIALS.has(reason);
  return Object.freeze({
    benign,
    review_required: !benign,
    scheduler_ok: benign,
    http_status: benign ? 200 : 409,
    reason,
  });
}

type MutationOutcome =
  | "updated"
  | "conflict"
  | "authority_unavailable"
  | "authority_ambiguous";

function webhookDlqMutationOutcome(result: any): MutationOutcome {
  if (!result || typeof result !== "object") return "authority_unavailable";
  const explicitStatuses = ["success", "ok"]
    .filter((key) => Object.prototype.hasOwnProperty.call(result, key))
    .map((key) => result[key]);
  // Never promote a mutation whose adapter explicitly reports failure. A
  // positive counter beside that failure is contradictory durable evidence.
  if (explicitStatuses.some((value) => value !== true)) {
    return "authority_ambiguous";
  }
  const counts = [result.updated, result.modified_count, result.matched_count]
    .filter((value) => value !== undefined && value !== null)
    .map(Number);
  if (!counts.length || counts.some((value) => !Number.isInteger(value) || value < 0)) {
    return "authority_unavailable";
  }
  if (new Set(counts).size > 1) return "authority_ambiguous";
  if (counts[0] === 1) return "updated";
  if (counts[0] === 0) return "conflict";
  return "authority_ambiguous";
}

function dlqAuthorityError(operation: string, outcome: MutationOutcome, cause?: unknown) {
  const code = `WEBHOOK_DLQ_${operation.toUpperCase()}_${
    outcome === "authority_ambiguous" ? "AUTHORITY_AMBIGUOUS" : "AUTHORITY_UNAVAILABLE"
  }`;
  return Object.assign(new Error(code.toLowerCase()), {
    code,
    status: 503,
    review_required: true,
    authority_unavailable: outcome === "authority_unavailable",
    authority_ambiguous: outcome === "authority_ambiguous",
    cause,
  });
}

async function mutateDlq(
  svc: any,
  operation: string,
  filter: Record<string, unknown>,
  update: Record<string, unknown>,
) {
  let result: any;
  try {
    result = await svc.entities.WebhookDeadLetter.updateMany(filter, update);
  } catch (error) {
    throw dlqAuthorityError(operation, "authority_unavailable", error);
  }
  const outcome = webhookDlqMutationOutcome(result);
  if (outcome === "authority_unavailable" || outcome === "authority_ambiguous") {
    throw dlqAuthorityError(operation, outcome);
  }
  return outcome;
}

export function webhookDlqUpdatedExactlyOne(result: any) {
  return webhookDlqMutationOutcome(result) === "updated";
}

function currentRevision(row: any) {
  return Math.max(0, Number(row?.claim_revision || 0));
}

function leaseStatus(row: any, nowMs: number): "ACTIVE" | "EXPIRED" | "UNKNOWN" {
  const expiry = Date.parse(String(row?.claim_expires_at || ""));
  if (!Number.isFinite(expiry)) return "UNKNOWN";
  return expiry > nowMs ? "ACTIVE" : "EXPIRED";
}

function claimState(row: any): WebhookMaterialClaimState | "DELIVERING" | "IDLE" {
  const value = String(row?.claim_state || "IDLE");
  if (value === "DELIVERING" || value === "IDLE") return value;
  if ([
    "RELEASED",
    "CLAIMED",
    "EFFECT_STARTED",
    "EXECUTED",
    "FAILED_PRE_EFFECT",
    "FAILED_POST_EFFECT",
    "REVIEW_REQUIRED",
    "EXPIRED_PRE_EFFECT",
  ].includes(value)) return value as WebhookMaterialClaimState;
  return "IDLE";
}

function claimFilter(row: any, expectedStatus: string) {
  const base: any = {
    id: row.id,
    status: expectedStatus,
    total_attempts: Number(row.total_attempts || 0),
  };
  if (row.claim_revision === undefined || row.claim_revision === null) {
    base.locked_at = row.locked_at || null;
    base.claim_token = row.claim_token || null;
  } else {
    base.claim_revision = currentRevision(row);
    base.claim_token = String(row.claim_token || "");
    base.claim_state = String(row.claim_state || "IDLE");
  }
  return base;
}

export async function claimWebhookDeadLetter(
  svc: any,
  row: any,
  input: {
    expected_status: WebhookClaimableStatus;
    owner: string;
    now_ms?: number;
    lease_ms?: number;
  },
) {
  const nowMs = input.now_ms ?? Date.now();
  const state = claimState(row);
  if (row?.status !== input.expected_status)
    return { acquired: false, reason: "status_changed" };
  const projectedState = webhookDlqMaterialEffectState(row);
  if (projectedState === "EXECUTED")
    return { acquired: false, reason: "already_executed", terminal: true };
  if (["REVIEW_REQUIRED", "FAILED_POST_EFFECT"].includes(projectedState))
    return { acquired: false, reason: "review_required", review_required: true };
  const observedLease = leaseStatus(row, nowMs);
  if (["CLAIMED", "EFFECT_STARTED", "DELIVERING"].includes(state) && observedLease === "ACTIVE")
    return { acquired: false, reason: "claim_active" };
  if (["CLAIMED", "EFFECT_STARTED", "DELIVERING"].includes(state) && observedLease === "UNKNOWN") {
    return {
      acquired: false,
      reason: "claim_lease_authority_unknown",
      review_required: true,
    };
  }

  const takeover = materialEffectTakeoverDecision({
    state: projectedState,
    lease_expired: observedLease === "EXPIRED",
  });
  if (takeover.review_required) {
    const outcome = await mutateDlq(
      svc,
      "quarantine",
      claimFilter(row, input.expected_status),
      {
        $set: {
          status: "exhausted",
          claim_state: "REVIEW_REQUIRED",
          claim_revision: currentRevision(row) + 1,
          claim_expires_at: "",
          locked_at: null,
          claim_terminal_at: new Date(nowMs).toISOString(),
          last_error_message:
            "ambiguous_delivery_after_expired_claim_requires_manual_reconciliation",
        },
      },
    );
    return {
      acquired: false,
      reason: outcome === "updated"
        ? "ambiguous_delivery_review_required"
        : "claim_conflict",
      review_required: true,
    };
  }

  const token = `webhook-dlq:${crypto.randomUUID()}`;
  const revision = currentRevision(row) + 1;
  const claimedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(
    nowMs + Math.max(60_000, input.lease_ms || WEBHOOK_DLQ_LEASE_MS),
  ).toISOString();
  const reclaimedFrom = takeover.takeover_allowed && state === "CLAIMED"
    ? "EXPIRED_PRE_EFFECT"
    : null;
  const wireCreatedAt = String(row?.claim_wire_created_at || claimedAt);
  const attemptKey = String(
    row?.effect_key || row?.claim_attempt_key ||
      `webhook-retry:${row.id}:${Number(row.total_attempts || 0) + 1}`,
  );
  const outcome = await mutateDlq(
    svc,
    "claim",
    claimFilter(row, input.expected_status),
    {
      $set: {
        claim_state: "CLAIMED",
        claim_revision: revision,
        claim_token: token,
        claim_owner: String(input.owner || "unknown"),
        claim_acquired_at: claimedAt,
        claim_expires_at: expiresAt,
        claim_effects_started: false,
        claim_attempt_key: attemptKey,
        claim_wire_created_at: wireCreatedAt,
        claim_previous_state: reclaimedFrom || state,
        locked_at: claimedAt,
      },
    },
  );
  if (outcome !== "updated")
    return { acquired: false, reason: "claim_conflict" };
  return {
    acquired: true,
    claim: {
      id: row.id,
      expected_status: input.expected_status,
      token,
      revision,
      owner: String(input.owner || "unknown"),
      attempt_key: attemptKey,
      wire_created_at: wireCreatedAt,
    },
    ...(reclaimedFrom ? { reclaimed_from: reclaimedFrom } : {}),
  };
}

function ownedFilter(claim: any, state: "CLAIMED" | "EFFECT_STARTED") {
  return {
    id: claim.id,
    status: claim.expected_status,
    claim_state: state,
    claim_revision: Number(claim.revision),
    claim_token: String(claim.token),
    claim_owner: String(claim.owner),
  };
}

export async function markWebhookDeliveryStarted(svc: any, claim: any) {
  const nextRevision = Number(claim.revision) + 1;
  const outcome = await mutateDlq(
    svc,
    "delivery_start",
    {
      ...ownedFilter(claim, "CLAIMED"),
      claim_effects_started: false,
    },
    {
      $set: {
        claim_state: "EFFECT_STARTED",
        claim_revision: nextRevision,
        claim_effects_started: true,
        delivery_started_at: new Date().toISOString(),
      },
    },
  );
  if (outcome !== "updated")
    return { ok: false, reason: "delivery_claim_lost" };
  return { ok: true, claim: { ...claim, revision: nextRevision } };
}

export async function finishWebhookDeadLetterClaim(
  svc: any,
  claim: any,
  patch: Record<string, unknown>,
  options: {
    after_effect?: boolean;
    terminal_state?: Extract<
      WebhookMaterialClaimState,
      "RELEASED" | "EXECUTED" | "FAILED_PRE_EFFECT"
    >;
  } = {},
) {
  const afterEffect = options.after_effect !== false;
  const state = afterEffect ? "EFFECT_STARTED" : "CLAIMED";
  const patchStatus = String(patch?.status || "");
  const terminalState = options.terminal_state ||
    (!afterEffect
      ? (patchStatus === "abandoned" ? "FAILED_PRE_EFFECT" : "RELEASED")
      : (patchStatus === "resolved" ? "EXECUTED" : "REVIEW_REQUIRED"));
  const invalidPostEffect = afterEffect &&
    (terminalState !== "EXECUTED" || patchStatus !== "resolved");
  const invalidPreEffect = !afterEffect && terminalState === "EXECUTED";
  if (invalidPostEffect || invalidPreEffect) {
    return {
      ok: false,
      reason: "invalid_webhook_terminal_transition_review_required",
      terminal_state: "REVIEW_REQUIRED" as const,
      review_required: true,
    };
  }
  const outcome = await mutateDlq(
    svc,
    "finalize",
    ownedFilter(claim, state),
    {
      $set: {
        ...patch,
        claim_state: terminalState,
        claim_revision: Number(claim.revision) + 1,
        claim_token: "",
        claim_owner: "",
        claim_expires_at: "",
        claim_effects_started: terminalState === "EXECUTED",
        claim_terminal_at: new Date().toISOString(),
        locked_at: null,
      },
    },
  );
  const ok = outcome === "updated";
  return {
    ok,
    reason: ok ? "finalized" : "finalize_claim_lost_review_required",
    terminal_state: ok ? terminalState : "REVIEW_REQUIRED",
  };
}

export async function markWebhookClaimReviewRequired(
  svc: any,
  claim: any,
  input: {
    reason: string;
    patch?: Record<string, unknown>;
    result?: Record<string, unknown> | null;
  },
) {
  const outcome = await mutateDlq(
    svc,
    "review_required",
    ownedFilter(claim, "EFFECT_STARTED"),
    {
      $set: {
        ...(input.patch || {}),
        status: "exhausted",
        claim_state: "REVIEW_REQUIRED",
        claim_revision: Number(claim.revision) + 1,
        claim_expires_at: "",
        claim_effects_started: true,
        claim_terminal_at: new Date().toISOString(),
        last_error_message: String(input.reason || "webhook_effect_unknown")
          .slice(0, 500),
        claim_result_json: input.result || null,
        locked_at: null,
      },
    },
  );
  const ok = outcome === "updated";
  return {
    ok,
    review_required: true,
    reason: ok ? "review_required_persisted" : "review_required_fence_lost",
  };
}

/** Records a proved zero-effect abort after the fence but before transport. */
export async function markWebhookClaimFailedPreEffect(
  svc: any,
  claim: any,
  reason: string,
) {
  const outcome = await mutateDlq(
    svc,
    "failed_pre_effect",
    ownedFilter(claim, "EFFECT_STARTED"),
    {
      $set: {
        claim_state: "FAILED_PRE_EFFECT",
        claim_revision: Number(claim.revision) + 1,
        claim_token: "",
        claim_owner: "",
        claim_expires_at: "",
        claim_effects_started: false,
        claim_terminal_at: new Date().toISOString(),
        last_error_message: String(reason || "webhook_failed_pre_effect")
          .slice(0, 500),
        locked_at: null,
      },
    },
  );
  return {
    ok: outcome === "updated",
    terminal_state: outcome === "updated"
      ? "FAILED_PRE_EFFECT"
      : "REVIEW_REQUIRED",
  };
}

function webhookAuthorityError(
  code: string,
  options: Record<string, unknown> = {},
) {
  return Object.assign(new Error(code.toLowerCase()), {
    code,
    status: code.endsWith("_BINDING_MISMATCH") ? 409 : 503,
    review_required: true,
    ...options,
  });
}

async function exactRows(
  entity: any,
  filter: Record<string, unknown>,
  operation: string,
) {
  let rows: any;
  try {
    rows = await entity.filter(filter, "created_date", 2);
  } catch (cause) {
    throw webhookAuthorityError(`${operation}_AUTHORITY_UNAVAILABLE`, { cause });
  }
  if (!Array.isArray(rows)) {
    throw webhookAuthorityError(`${operation}_AUTHORITY_UNAVAILABLE`);
  }
  if (rows.length > 1) {
    throw webhookAuthorityError(`${operation}_AUTHORITY_AMBIGUOUS`, {
      conflicting_ids: rows.map((row: any) => row?.id).filter(Boolean),
    });
  }
  return rows;
}

export async function webhookDispatchIdentity(input: {
  operation_key: string;
  endpoint_id: string;
  event_type: string;
  payload: Record<string, unknown>;
}) {
  const operationKey = String(input.operation_key || "").trim();
  if (!operationKey) {
    throw webhookAuthorityError("WEBHOOK_DISPATCH_IDEMPOTENCY_KEY_REQUIRED", {
      status: 428,
      review_required: false,
    });
  }
  const operationKeyHash = await sha256(`webhook-operation:${operationKey}`);
  const payloadHash = await sha256({
    event_type: input.event_type,
    payload: input.payload,
  });
  const effectKey = `webhook-dispatch:${input.endpoint_id}:${operationKeyHash}`;
  return {
    operation_key: operationKeyHash,
    effect_key: effectKey,
    delivery_id: `cambra_${(await sha256(effectKey)).slice(0, 48)}`,
    payload_hash: payloadHash,
  };
}

/**
 * Bootstraps one dispatch intent on the existing WebhookDeadLetter authority.
 * Base44 does not promise a unique secondary index here, so a concurrent
 * duplicate is never resolved with "oldest wins": an exact re-read must find
 * one row or every contender fails closed before transport starts. The CAS
 * claim above remains the ownership authority.
 */
export async function prepareWebhookDispatchIntent(
  svc: any,
  input: {
    effect_key: string;
    operation_key: string;
    delivery_id: string;
    payload_hash: string;
    webhook_id: string;
    webhook_name?: string;
    event_type: string;
    target_url: string;
    payload: Record<string, unknown>;
    wire_created_at?: string;
  },
) {
  const binding = {
    effect_key: input.effect_key,
    operation_key: input.operation_key,
    delivery_id: input.delivery_id,
    payload_hash: input.payload_hash,
    webhook_id: input.webhook_id,
    event_type: input.event_type,
    target_url: input.target_url,
  };
  let rows = await exactRows(
    svc.entities.WebhookDeadLetter,
    { effect_key: input.effect_key },
    "WEBHOOK_DISPATCH_INTENT_READ",
  );
  if (rows.length === 0) {
    const now = input.wire_created_at || new Date().toISOString();
    try {
      await svc.entities.WebhookDeadLetter.create({
        ...binding,
        webhook_name: input.webhook_name || "",
        payload: input.payload,
        status: "dispatch_pending",
        total_attempts: 0,
        claim_state: "RELEASED",
        claim_revision: 0,
        claim_token: "",
        claim_owner: "",
        claim_effects_started: false,
        wire_created_at: now,
      });
    } catch (cause) {
      // A commit followed by a lost response is recoverable via exact re-read.
      const recovered = await exactRows(
        svc.entities.WebhookDeadLetter,
        { effect_key: input.effect_key },
        "WEBHOOK_DISPATCH_INTENT_RECOVERY_READ",
      );
      if (recovered.length === 0) {
        throw webhookAuthorityError(
          "WEBHOOK_DISPATCH_INTENT_CREATE_AUTHORITY_UNAVAILABLE",
          { cause },
        );
      }
    }
    rows = await exactRows(
      svc.entities.WebhookDeadLetter,
      { effect_key: input.effect_key },
      "WEBHOOK_DISPATCH_INTENT_VERIFY",
    );
  }
  if (rows.length !== 1) {
    throw webhookAuthorityError("WEBHOOK_DISPATCH_INTENT_MISSING");
  }
  const row = rows[0];
  const mismatch = Object.entries(binding).find(
    ([key, value]) => String(row?.[key] ?? "") !== String(value ?? ""),
  );
  if (mismatch) {
    throw webhookAuthorityError("WEBHOOK_DISPATCH_INTENT_BINDING_MISMATCH", {
      binding_field: mismatch[0],
      intent_id: row?.id || null,
    });
  }
  return { ok: true, intent: row, created: rows[0]?.created_date === undefined };
}

/** Persists and re-reads the one local transport receipt for an effect key. */
export async function persistWebhookDeliveryReceipt(
  svc: any,
  input: Record<string, any> & {
    effect_key: string;
    delivery_id: string;
    payload_hash: string;
    status: "success" | "failed";
  },
) {
  let createError: unknown = null;
  try {
    await svc.entities.WebhookDelivery.create(input);
  } catch (error) {
    createError = error;
  }
  let rows: any[];
  try {
    rows = await exactRows(
      svc.entities.WebhookDelivery,
      { effect_key: input.effect_key },
      "WEBHOOK_DELIVERY_RECEIPT_READ",
    );
  } catch (error) {
    return {
      ok: false,
      review_required: true,
      reason: String((error as any)?.code || "webhook_delivery_receipt_unavailable"),
      cause: createError || error,
    };
  }
  if (rows.length !== 1) {
    return {
      ok: false,
      review_required: true,
      reason: createError
        ? "webhook_delivery_receipt_persistence_failed"
        : "webhook_delivery_receipt_missing",
      cause: createError,
    };
  }
  const row = rows[0];
  const exact = ["effect_key", "delivery_id", "payload_hash", "status"]
    .every((field) => String(row?.[field] || "") === String(input[field] || ""));
  if (!exact) {
    return {
      ok: false,
      review_required: true,
      reason: "webhook_delivery_receipt_binding_mismatch",
      receipt_id: row?.id || null,
    };
  }
  return { ok: true, receipt: row, recovered_after_create_error: Boolean(createError) };
}
