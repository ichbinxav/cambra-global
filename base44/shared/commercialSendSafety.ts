import { policyIsActive } from "./commercialAutonomy.ts";
import { attemptFailClosedOperation } from "./criticalExecution.ts";

export const COMMERCIAL_SEND_SAFETY_VERSION = "commercial-send-safety-v1.1.0";
export const COMMERCIAL_SEND_CAS_ATTEMPTS = 8;

/**
 * Provider guarantees observed from current primary documentation. This is a
 * capability projection only; the durable authority remains the existing
 * CostBudgetControl send claim journal below.
 */
export const COMMERCIAL_EMAIL_PROVIDER_CAPABILITIES = Object.freeze({
  resend: Object.freeze({
    provider_idempotency: "IDEMPOTENCY_KEY_SAME_PAYLOAD_24H",
    reconciliation: "EMAIL_ID",
    provider_retry_contract: "SAME_KEY_SAME_PAYLOAD_WITHIN_24H_ONLY",
    cambra_automatic_retry: "BLOCKED_AFTER_TRANSPORT_STARTED",
    acceptance_is_delivery: false,
    evidence_as_of: "2026-08-13",
    documentation_refs: Object.freeze([
      "https://resend.com/docs/dashboard/emails/idempotency-keys",
      "https://resend.com/docs/api-reference/emails/send-email",
    ]),
  }),
  outlook: Object.freeze({
    provider_idempotency: "NOT_DOCUMENTED",
    reconciliation: "IMMUTABLE_DRAFT_ID_SENT_ITEMS_LOOKUP",
    provider_retry_contract: "NONE",
    cambra_automatic_retry: "NEVER_AFTER_SEND_STARTED",
    acceptance_is_delivery: false,
    evidence_as_of: "2026-08-13",
    documentation_refs: Object.freeze([
      "https://learn.microsoft.com/en-us/graph/outlook-immutable-id",
      "https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0",
      "https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0",
      "https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0",
    ]),
  }),
  instantly: Object.freeze({
    provider_idempotency: "NOT_DOCUMENTED",
    reconciliation: "PROVIDER_IDS_WHEN_RESPONSE_OBSERVED",
    provider_retry_contract: "NONE",
    cambra_automatic_retry: "AT_MOST_ONCE_REVIEW_REQUIRED",
    acceptance_is_delivery: false,
    evidence_as_of: "2026-08-13",
    documentation_refs: Object.freeze([
      "https://developer.instantly.ai/api-reference/lead/create-lead",
      "https://developer.instantly.ai/api-reference/email/reply-to-an-email",
    ]),
  }),
});

export function commercialEmailProviderCapability(provider: unknown) {
  const key = text(provider)
    .toLowerCase() as keyof typeof COMMERCIAL_EMAIL_PROVIDER_CAPABILITIES;
  return COMMERCIAL_EMAIL_PROVIDER_CAPABILITIES[key] || null;
}

export function requireResendIdempotencyKey(value: unknown) {
  const key = text(value);
  if (!key || key.length > 256) {
    throw sendError("valid_resend_idempotency_key_required", {
      status: 409,
      provider_effect_started: false,
    });
  }
  return key;
}

type JsonRow = Record<string, any>;

const text = (value: unknown) => String(value || "").trim();
const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const positiveLimit = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const updatedExactlyOne = (result: any) => {
  const explicitStatuses = ["success", "ok"]
    .filter((key) =>
      result && Object.prototype.hasOwnProperty.call(result, key)
    )
    .map((key) => result[key]);
  const counters = ["updated", "modified_count", "matched_count"]
    .filter((key) =>
      result && Object.prototype.hasOwnProperty.call(result, key)
    )
    .map((key) => result[key]);
  if (
    explicitStatuses.some((value) => value !== true) ||
    counters.length === 0 ||
    counters.some((value) => !Number.isInteger(value) || value < 0) ||
    counters.some((value) => value !== counters[0]) ||
    counters[0] > 1
  ) {
    throw sendError("send_slot_authority_ambiguous");
  }
  return counters[0] === 1;
};

function sendError(message: string, details: JsonRow = {}) {
  return Object.assign(new Error(message), {
    code: message.toUpperCase(),
    status: 409,
    ...details,
  });
}

/**
 * Validates the canonical response returned by an internal
 * commercialSendMessage invocation. An empty/unknown wrapper is not delivery
 * evidence: callers must stop in REVIEW_REQUIRED before projecting a case,
 * event or task as sent.
 */
export function requireAcceptedCommercialSendResponse(
  invocation: any,
  boundary = "commercial_send",
) {
  const response = invocation?.data ?? invocation;
  const hasReceipt = typeof response?.message_id === "string" &&
    response.message_id.trim().length > 0;
  const hasProvider = typeof response?.provider === "string" &&
    response.provider.trim().length > 0;
  const hasAcceptedState = response?.duplicate === true ||
    typeof response?.queued === "boolean";
  if (
    response?.ok !== true || !hasReceipt || !hasProvider || !hasAcceptedState
  ) {
    throw Object.assign(new Error(`${boundary}_response_unverified`), {
      code: "COMMERCIAL_SEND_REVIEW_REQUIRED",
      status: 409,
      review_required: true,
      automatic_retry_blocked: true,
      boundary,
    });
  }
  return response;
}

export function commercialSendWindowKeys(at = new Date()) {
  const iso = at.toISOString();
  return { day_key: iso.slice(0, 10), minute_key: iso.slice(0, 16) };
}

export function exactCommercialPolicyDecision(
  rows: unknown,
  policyKey: unknown,
  policyVersion: unknown,
  now = Date.now(),
) {
  if (!Array.isArray(rows)) {
    return {
      ok: false,
      blocker: "commercial_policy_lookup_unavailable",
      policy: null,
    };
  }
  const active = rows.filter((row: any) => policyIsActive(row, now));
  if (active.length !== 1) {
    return {
      ok: false,
      blocker: active.length > 1
        ? "ambiguous_active_commercial_policies"
        : "exactly_one_active_commercial_policy_required",
      policy: null,
      active_count: active.length,
    };
  }
  const policy = active[0];
  if (
    text(policy.policy_key) !== text(policyKey) ||
    text(policy.version) !== text(policyVersion)
  ) {
    return {
      ok: false,
      blocker: "exact_commercial_policy_version_required",
      policy: null,
      active_count: 1,
    };
  }
  return { ok: true, blocker: null, policy, active_count: 1 };
}

export async function readExactCommercialPolicy(
  svc: any,
  input: { policy_key: string; policy_version: string; now?: number },
) {
  let rows: unknown;
  try {
    rows = await svc.entities.CommercialPolicy.filter(
      { policy_key: input.policy_key, status: "active" },
      "-approved_at",
      20,
    );
  } catch (_) {
    rows = undefined;
  }
  return exactCommercialPolicyDecision(
    rows,
    input.policy_key,
    input.policy_version,
    input.now,
  );
}

export async function readCommercialSuppression(svc: any, email: string) {
  let rows: unknown;
  try {
    rows = await svc.entities.ContactSuppression.filter(
      { email, active: true },
      "-created_date",
      2,
    );
  } catch (_) {
    return {
      allowed: false,
      blocker: "suppression_lookup_unavailable",
      rows: null,
    };
  }
  if (!Array.isArray(rows)) {
    return {
      allowed: false,
      blocker: "suppression_lookup_unavailable",
      rows: null,
    };
  }
  const normalized = String(email || "").trim().toLowerCase();
  if (
    rows.some((row: any) =>
      row?.active !== true ||
      String(row?.email || "").trim().toLowerCase() !== normalized
    )
  ) {
    return {
      allowed: false,
      blocker: "suppression_lookup_ambiguous",
      rows,
    };
  }
  if (rows.length > 1) {
    return {
      allowed: false,
      blocker: "suppression_lookup_ambiguous",
      rows,
    };
  }
  if (rows.length === 1) {
    return { allowed: false, blocker: "contact_suppressed", rows };
  }
  return { allowed: true, blocker: null, rows };
}

export async function readCommercialSendIdempotency(
  svc: any,
  threadId: string,
  idempotencyKey: string,
) {
  let rows: unknown;
  try {
    rows = await svc.entities.CommunicationMessage.filter(
      {
        thread_id: threadId,
        direction: "outbound",
        idempotency_key: idempotencyKey,
      },
      "-created_date",
      2,
    );
  } catch (_) {
    return {
      ok: false,
      blocker: "send_idempotency_lookup_unavailable",
      message: null,
    };
  }
  if (!Array.isArray(rows)) {
    return {
      ok: false,
      blocker: "send_idempotency_lookup_unavailable",
      message: null,
    };
  }
  if (rows.length > 1) {
    return {
      ok: false,
      blocker: "send_idempotency_lookup_ambiguous",
      message: null,
    };
  }
  const malformed = rows.some((row: any) =>
    text(row?.thread_id) !== text(threadId) ||
    text(row?.idempotency_key) !== text(idempotencyKey) ||
    text(row?.direction) !== "outbound"
  );
  if (malformed) {
    return {
      ok: false,
      blocker: "send_idempotency_lookup_ambiguous",
      message: null,
    };
  }
  return { ok: true, blocker: null, message: rows[0] || null };
}

/** A cost reservation is itself an external-effect authority boundary. */
export async function readPaidSendReservation(svc: any, eventKey: string) {
  let rows: unknown;
  try {
    rows = await svc.entities.CostUsageEvent.filter(
      { event_key: eventKey },
      "-occurred_at",
      2,
    );
  } catch (_) {
    return {
      ok: false,
      duplicate: false,
      blocker: "paid_send_reservation_lookup_unavailable",
      event: null,
    };
  }
  if (!Array.isArray(rows)) {
    return {
      ok: false,
      duplicate: false,
      blocker: "paid_send_reservation_lookup_unavailable",
      event: null,
    };
  }
  if (
    rows.length > 1 ||
    rows.some((row: any) => text(row?.event_key) !== text(eventKey))
  ) {
    return {
      ok: false,
      duplicate: rows.length > 0,
      blocker: "paid_send_reservation_lookup_ambiguous",
      event: null,
    };
  }
  if (rows.length === 1) {
    return {
      ok: true,
      duplicate: true,
      blocker: "duplicate_paid_send_effect_requires_reconciliation",
      event: rows[0],
    };
  }
  return { ok: true, duplicate: false, blocker: null, event: null };
}

function stateFromControl(control: any, at: Date, baseline: any) {
  const windows = commercialSendWindowKeys(at);
  const source = control?.send_reservation_state_json || {};
  const sameDay = source.day_key === windows.day_key;
  const sameMinute = sameDay && source.minute_key === windows.minute_key;
  const allClaims = Array.isArray(source.claims) ? source.claims : [];
  const unresolved = allClaims.filter((row: any) =>
    ["CLAIMED", "TRANSPORT_STARTED", "REVIEW_REQUIRED"].includes(
      String(row?.state || ""),
    )
  );
  const terminal = allClaims.filter((row: any) =>
    !["CLAIMED", "TRANSPORT_STARTED", "REVIEW_REQUIRED"].includes(
      String(row?.state || ""),
    )
  ).slice(-4000);
  return {
    contract_version: COMMERCIAL_SEND_SAFETY_VERSION,
    day_key: windows.day_key,
    minute_key: windows.minute_key,
    policy_daily_counts: sameDay && source.policy_daily_counts
      ? { ...source.policy_daily_counts }
      : {},
    profile_daily_counts: sameDay && source.profile_daily_counts
      ? { ...source.profile_daily_counts }
      : {},
    profile_burst_counts: sameMinute && source.profile_burst_counts
      ? { ...source.profile_burst_counts }
      : {},
    // Unresolved provider-effect ambiguity survives UTC day rollover. Only
    // bounded terminal history is pruned; CommunicationMessage remains the
    // canonical long-term committed dedupe ledger.
    claims: [...terminal, ...unresolved],
    baseline: {
      profile_sent_today: count(baseline?.profile_sent_today),
      policy_sent_today: count(baseline?.policy_sent_today),
      profile_sent_minute: count(baseline?.profile_sent_minute),
    },
  };
}

function claimIndex(state: any, idempotencyKey: string) {
  return state.claims.findIndex((row: any) =>
    text(row?.idempotency_key) === idempotencyKey &&
    row?.state !== "ROLLED_BACK"
  );
}

export function paidReservationTransportDecision(reservation: any) {
  if (!reservation || reservation.duplicate === true) {
    return {
      allowed: false,
      blocker: reservation?.duplicate === true
        ? "duplicate_paid_send_effect_requires_reconciliation"
        : "paid_send_reservation_required",
    };
  }
  if (!reservation.event?.id || reservation.event.status !== "RESERVED") {
    return { allowed: false, blocker: "paid_send_reservation_unverified" };
  }
  return { allowed: true, blocker: null };
}

/**
 * Acquires the profile/day, policy-version/day and profile/minute slots with
 * one CAS write on the existing CostBudgetControl singleton. A slot remains
 * consumed once provider execution starts, including ambiguous failures.
 */
export async function claimCommercialSendSlot(svc: any, input: any) {
  const idempotencyKey = text(input?.idempotency_key);
  const profileKey = text(input?.profile_key);
  const policyKey = text(input?.policy_key);
  const policyVersion = text(input?.policy_version);
  if (!idempotencyKey || !profileKey || !policyKey || !policyVersion) {
    throw sendError("complete_send_slot_identity_required");
  }
  const policyLimit = positiveLimit(input?.policy_daily_limit);
  const profileLimit = positiveLimit(input?.profile_daily_limit);
  const burstLimit = positiveLimit(input?.profile_burst_limit);
  if (!policyLimit || !profileLimit || !burstLimit) {
    throw sendError("positive_send_slot_limits_required");
  }
  let controls: unknown;
  try {
    controls = await svc.entities.CostBudgetControl.filter(
      { control_key: "global", status: "active" },
      "-approved_at",
      3,
    );
  } catch (_) {
    throw sendError("send_slot_authority_lookup_unavailable");
  }
  if (!Array.isArray(controls)) {
    throw sendError("send_slot_authority_lookup_unavailable");
  }
  if (controls.length !== 1) {
    throw sendError(
      controls.length > 1
        ? "multiple_active_send_slot_authorities"
        : "active_send_slot_authority_required",
    );
  }
  const controlId = controls[0].id;
  const at = input?.at instanceof Date ? input.at : new Date();
  const policyCounterKey = `${policyKey}:${policyVersion}`;
  for (let attempt = 1; attempt <= COMMERCIAL_SEND_CAS_ATTEMPTS; attempt++) {
    let fresh: any;
    try {
      fresh = await svc.entities.CostBudgetControl.get(controlId);
    } catch (_) {
      throw sendError("send_slot_authority_read_unavailable");
    }
    if (!fresh || fresh.status !== "active") {
      throw sendError("active_send_slot_authority_required");
    }
    const revision = Number(fresh.reservation_revision);
    if (!Number.isInteger(revision) || revision < 0) {
      throw sendError("send_slot_authority_revision_required");
    }
    const state = stateFromControl(fresh, at, input?.baseline || {});
    const unresolvedCount = state.claims.filter((row: any) =>
      ["CLAIMED", "TRANSPORT_STARTED", "REVIEW_REQUIRED"].includes(
        String(row?.state || ""),
      )
    ).length;
    if (unresolvedCount > 1000 || state.claims.length >= 5000) {
      throw sendError("send_claim_journal_capacity_review_required");
    }
    const existingIndex = claimIndex(state, idempotencyKey);
    if (existingIndex >= 0) {
      const existing = state.claims[existingIndex];
      return {
        acquired: false,
        duplicate: true,
        review_required: existing.state !== "COMMITTED",
        blocker: existing.state === "COMMITTED"
          ? "send_already_committed"
          : "send_effect_ambiguous_review_required",
        claim: existing,
      };
    }
    const profileDaily = Math.max(
      count(state.profile_daily_counts[profileKey]),
      count(input?.baseline?.profile_sent_today),
    );
    const policyDaily = Math.max(
      count(state.policy_daily_counts[policyCounterKey]),
      count(input?.baseline?.policy_sent_today),
    );
    const burst = Math.max(
      count(state.profile_burst_counts[profileKey]),
      count(input?.baseline?.profile_sent_minute),
    );
    if (profileDaily >= profileLimit) {
      throw sendError("sending_profile_daily_cap_reached", {
        limit: profileLimit,
      });
    }
    if (policyDaily >= policyLimit) {
      throw sendError("commercial_policy_daily_limit_reached", {
        limit: policyLimit,
      });
    }
    if (burst >= burstLimit) {
      throw sendError("sending_profile_burst_limit", {
        limit: burstLimit,
        status: 429,
      });
    }
    const claim = {
      claim_id: crypto.randomUUID(),
      idempotency_key: idempotencyKey,
      state: "CLAIMED",
      thread_id: text(input.thread_id),
      profile_key: profileKey,
      policy_key: policyKey,
      policy_version: policyVersion,
      provider: text(input.provider).toLowerCase(),
      day_key: state.day_key,
      minute_key: state.minute_key,
      claimed_at: at.toISOString(),
      provider_effect_started: false,
    };
    state.profile_daily_counts[profileKey] = profileDaily + 1;
    state.policy_daily_counts[policyCounterKey] = policyDaily + 1;
    state.profile_burst_counts[profileKey] = burst + 1;
    state.claims = [...state.claims, claim];
    const changed = await attemptFailClosedOperation(
      "commercial_send_claim_transition_cas",
      () =>
        svc.entities.CostBudgetControl.updateMany(
          { id: fresh.id, status: "active", reservation_revision: revision },
          {
            $set: {
              send_reservation_state_json: state,
              reservation_revision: revision + 1,
              updated_by: "commercial_send_governor",
              updated_at: at.toISOString(),
            },
          },
        ),
    );
    if (updatedExactlyOne(changed)) {
      return {
        acquired: true,
        duplicate: false,
        review_required: false,
        blocker: null,
        control_id: fresh.id,
        reservation_revision: revision + 1,
        claim,
      };
    }
  }
  throw sendError("send_slot_concurrency_exhausted");
}

async function mutateClaim(
  svc: any,
  slot: any,
  operation: string,
  details: any,
) {
  if (!slot?.acquired || !slot?.claim?.claim_id || !slot?.control_id) {
    throw sendError("owned_send_slot_claim_required");
  }
  for (let attempt = 1; attempt <= COMMERCIAL_SEND_CAS_ATTEMPTS; attempt++) {
    let fresh: any;
    try {
      fresh = await svc.entities.CostBudgetControl.get(slot.control_id);
    } catch (_) {
      throw sendError("send_slot_authority_read_unavailable");
    }
    if (!fresh || fresh.status !== "active") {
      throw sendError("active_send_slot_authority_required");
    }
    const revision = Number(fresh.reservation_revision);
    const state = fresh.send_reservation_state_json;
    if (!Number.isInteger(revision) || !state || !Array.isArray(state.claims)) {
      throw sendError("durable_send_slot_state_required");
    }
    const index = state.claims.findIndex((row: any) =>
      row?.claim_id === slot.claim.claim_id &&
      row?.idempotency_key === slot.claim.idempotency_key
    );
    if (index < 0) throw sendError("owned_send_slot_claim_not_found");
    const current = state.claims[index];
    if (operation === "COMMIT" && current.state === "COMMITTED") {
      const providerReferenceId = text(
        details?.provider_reference_id || details?.provider_message_id,
      );
      const providerReferenceKind = text(details?.provider_reference_kind);
      if (
        text(current.provider_message_id) ===
          providerReferenceId &&
        text(current.provider_reference_kind) === providerReferenceKind &&
        text(current.message_id) === text(details?.message_id) &&
        providerReferenceId && providerReferenceKind &&
        text(details?.message_id)
      ) return { ok: true, duplicate: true, claim: current };
      throw sendError("send_commit_receipt_conflict");
    }
    if (operation === "REVIEW" && current.state === "COMMITTED") {
      return { ok: true, duplicate: true, claim: current };
    }
    const nextState = { ...state, claims: [...state.claims] };
    if (operation === "ROLLBACK") {
      if (
        current.state !== "CLAIMED" || current.provider_effect_started === true
      ) {
        throw sendError("send_slot_rollback_forbidden_after_provider_boundary");
      }
      const policyCounterKey =
        `${current.policy_key}:${current.policy_version}`;
      if (nextState.day_key === current.day_key) {
        nextState.profile_daily_counts = { ...nextState.profile_daily_counts };
        nextState.policy_daily_counts = { ...nextState.policy_daily_counts };
        nextState.profile_daily_counts[current.profile_key] = Math.max(
          0,
          count(nextState.profile_daily_counts[current.profile_key]) - 1,
        );
        nextState.policy_daily_counts[policyCounterKey] = Math.max(
          0,
          count(nextState.policy_daily_counts[policyCounterKey]) - 1,
        );
      }
      if (nextState.minute_key === current.minute_key) {
        nextState.profile_burst_counts = { ...nextState.profile_burst_counts };
        nextState.profile_burst_counts[current.profile_key] = Math.max(
          0,
          count(nextState.profile_burst_counts[current.profile_key]) - 1,
        );
      }
      nextState.claims[index] = {
        ...current,
        state: "ROLLED_BACK",
        provider_effect_started: false,
        rolled_back_at: new Date().toISOString(),
        blocker: text(details?.blocker),
      };
    } else if (operation === "START") {
      if (
        current.state !== "CLAIMED" || current.provider_effect_started === true
      ) {
        throw sendError("send_effect_ambiguous_review_required");
      }
      nextState.claims[index] = {
        ...current,
        state: "TRANSPORT_STARTED",
        provider_effect_started: true,
        provider_effect_started_at: new Date().toISOString(),
      };
    } else if (operation === "COMMIT") {
      if (!current.provider_effect_started) {
        throw sendError("provider_effect_start_proof_required");
      }
      const providerReferenceId = text(
        details?.provider_reference_id || details?.provider_message_id,
      );
      const providerReferenceKind = text(details?.provider_reference_kind);
      const localMessageId = text(details?.message_id);
      if (!providerReferenceId || !providerReferenceKind || !localMessageId) {
        throw sendError("complete_send_commit_receipt_required");
      }
      if (
        (current.provider_reference_id &&
          text(current.provider_reference_id) !== providerReferenceId) ||
        (current.provider_reference_kind &&
          text(current.provider_reference_kind) !== providerReferenceKind)
      ) {
        throw sendError("send_commit_receipt_conflict");
      }
      if (
        ![
          "TRANSPORT_STARTED",
          "REVIEW_REQUIRED",
        ].includes(String(current.state || ""))
      ) {
        throw sendError("send_commit_state_invalid");
      }
      nextState.claims[index] = {
        ...current,
        state: "COMMITTED",
        committed_at: new Date().toISOString(),
        provider_message_id: providerReferenceId,
        provider_reference_id: providerReferenceId,
        provider_reference_kind: providerReferenceKind,
        provider_reference_state: "COMMITTED_RECEIPT",
        message_id: localMessageId,
      };
    } else if (operation === "PROVIDER_REFERENCE") {
      if (
        current.state !== "TRANSPORT_STARTED" ||
        current.provider_effect_started !== true
      ) {
        throw sendError("provider_reference_state_invalid");
      }
      const provider = text(details?.provider).toLowerCase();
      const referenceId = text(details?.provider_reference_id);
      const referenceKind = text(details?.reference_kind);
      if (!provider || !referenceId || !referenceKind) {
        throw sendError("complete_provider_reference_required");
      }
      if (text(current.provider) && text(current.provider) !== provider) {
        throw sendError("send_provider_reference_conflict");
      }
      if (current.provider_reference_id) {
        if (
          text(current.provider_reference_id) === referenceId &&
          text(current.provider_reference_kind) === referenceKind
        ) return { ok: true, duplicate: true, claim: current };
        throw sendError("send_provider_reference_conflict");
      }
      nextState.claims[index] = {
        ...current,
        provider,
        provider_reference_id: referenceId,
        provider_reference_kind: referenceKind,
        provider_reference_state: text(details?.reference_state) ||
          "PERSISTED_PRE_EFFECT",
        provider_reference_recorded_at: new Date().toISOString(),
      };
    } else if (operation === "REVIEW") {
      if (!current.provider_effect_started) {
        throw sendError("provider_effect_start_proof_required");
      }
      nextState.claims[index] = {
        ...current,
        state: "REVIEW_REQUIRED",
        review_required_at: new Date().toISOString(),
        blocker: text(details?.blocker) || "provider_effect_ambiguous",
      };
    } else throw sendError("known_send_claim_transition_required");
    const changed = await svc.entities.CostBudgetControl.updateMany(
      { id: fresh.id, status: "active", reservation_revision: revision },
      {
        $set: {
          send_reservation_state_json: nextState,
          reservation_revision: revision + 1,
          updated_by: "commercial_send_governor",
          updated_at: new Date().toISOString(),
        },
      },
    );
    if (updatedExactlyOne(changed)) {
      return { ok: true, claim: nextState.claims[index] };
    }
  }
  throw sendError("send_claim_transition_concurrency_exhausted");
}

export const markCommercialSendTransportStarted = (svc: any, slot: any) =>
  mutateClaim(svc, slot, "START", {});
export const recordCommercialSendProviderReference = (
  svc: any,
  slot: any,
  details: any,
) => mutateClaim(svc, slot, "PROVIDER_REFERENCE", details);

/**
 * Executes the documented Microsoft Graph draft -> send -> observe sequence.
 * The immutable draft id is durably fenced in the existing send claim before
 * `/send`. Checkpoints let the caller retain the same EmergencyControl epoch
 * around each provider boundary without this adapter becoming an authority.
 */
export async function executeOutlookAcceptedTransport(
  svc: any,
  slot: any,
  input: {
    access_token: string;
    subject: string;
    html: string;
    to: string;
    thread_id: string;
  },
  dependencies: {
    fetcher?: typeof fetch;
    checkpoint?: (name: string) => Promise<void>;
    on_effect_start?: () => void;
  } = {},
) {
  const fetcher = dependencies.fetcher || fetch;
  const checkpoint = dependencies.checkpoint || (async () => {});
  const headers = {
    Authorization: `Bearer ${text(input?.access_token)}`,
    "Prefer": 'IdType="ImmutableId"',
  };
  let draftId = "";
  try {
    await checkpoint("before_outlook_draft");
    dependencies.on_effect_start?.();
    const draftResponse = await fetcher(
      "https://graph.microsoft.com/v1.0/me/messages",
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: String(input?.subject || ""),
          body: { contentType: "HTML", content: String(input?.html || "") },
          toRecipients: [{ emailAddress: { address: text(input?.to) } }],
          internetMessageHeaders: [{
            name: "X-CAMBRA-Thread",
            value: text(input?.thread_id),
          }],
        }),
      },
    );
    const draft = await draftResponse.json().catch(() => ({}));
    if (draftResponse.status !== 201) {
      throw new Error(`outlook_draft_failed:${draftResponse.status}`);
    }
    draftId = text(draft?.id);
    if (!draftId) throw new Error("outlook_draft_id_required");

    await recordCommercialSendProviderReference(svc, slot, {
      provider: "outlook",
      provider_reference_id: draftId,
      reference_kind: "OUTLOOK_IMMUTABLE_DRAFT_ID",
      reference_state: "DRAFT_PERSISTED_PRE_SEND",
    });
    await checkpoint("after_outlook_draft");
    await checkpoint("before_outlook_send");

    const sendResponse = await fetcher(
      `https://graph.microsoft.com/v1.0/me/messages/${
        encodeURIComponent(draftId)
      }/send`,
      { method: "POST", headers },
    );
    if (sendResponse.status !== 202) {
      throw new Error(`outlook_send_failed:${sendResponse.status}`);
    }
    await checkpoint("after_outlook_send");

    let reconciliation: any = {
      status: "ACCEPTED_RECONCILIATION_PENDING",
      delivery_observed: false,
    };
    try {
      const observedResponse = await fetcher(
        `https://graph.microsoft.com/v1.0/me/messages/${
          encodeURIComponent(draftId)
        }?$select=id,isDraft,sentDateTime,conversationId,internetMessageId`,
        { headers },
      );
      const observed = await observedResponse.json().catch(() => ({}));
      reconciliation = observedResponse.ok && observed?.isDraft === false
        ? {
          status: "OBSERVED_SENT_ITEM",
          immutable_id: text(observed.id) || draftId,
          sent_at: observed.sentDateTime || null,
          internet_message_id: observed.internetMessageId || null,
          delivery_observed: false,
        }
        : {
          status: "ACCEPTED_RECONCILIATION_PENDING",
          http_status: observedResponse.status,
          delivery_observed: false,
        };
    } catch (error: any) {
      reconciliation = {
        status: "ACCEPTED_RECONCILIATION_PENDING",
        error: text(error?.message || error).slice(0, 160),
        delivery_observed: false,
      };
    }
    return {
      provider_message_id: draftId,
      immutable_draft_id: draftId,
      conversation_id: draft?.conversationId || null,
      provider_acceptance_state: "ACCEPTED",
      delivery_observed: false,
      reconciliation,
    };
  } catch (error: any) {
    if (draftId && error && typeof error === "object") {
      error.outlook_draft_id = draftId;
    }
    throw error;
  }
}
export const commitCommercialSendSlot = (svc: any, slot: any, details: any) =>
  mutateClaim(svc, slot, "COMMIT", details);
export const markCommercialSendReviewRequired = (
  svc: any,
  slot: any,
  details: any,
) => mutateClaim(svc, slot, "REVIEW", details);
export const rollbackCommercialSendSlot = (svc: any, slot: any, details: any) =>
  mutateClaim(svc, slot, "ROLLBACK", details);
