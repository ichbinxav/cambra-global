/**
 * Pure vocabulary shared by the existing durable claim primitives.
 *
 * This module owns no entity, lease or mutation. SchedulerRun,
 * CostBudgetControl/commercial send and WebhookDeadLetter remain the durable
 * authorities for their own effects; this facade only makes their native
 * states comparable without creating a second control plane.
 */
export const MATERIAL_EFFECT_CONTRACT_VERSION =
  "material-effect-contract-v1.0.0";

export const MATERIAL_EFFECT_STATES = Object.freeze(
  [
    "CLAIMED",
    "EFFECT_STARTED",
    "EXECUTED",
    "FAILED_PRE_EFFECT",
    "FAILED_POST_EFFECT",
    "REVIEW_REQUIRED",
    "RELEASED",
    "EXPIRED_PRE_EFFECT",
  ] as const,
);

export type MaterialEffectState = typeof MATERIAL_EFFECT_STATES[number];

export type MaterialEffectProjectionInput = {
  native_state?: unknown;
  effects_started?: boolean;
  terminal_success?: boolean;
  terminal_failure?: boolean;
  review_required?: boolean;
  released?: boolean;
  expired_pre_effect?: boolean;
};

const EFFECT_STARTED_STATES = new Set([
  "EFFECT_STARTED",
  "RUNNING",
  "DELIVERING",
  "TRANSPORT_STARTED",
  "EFFECTING",
]);
const EXECUTED_STATES = new Set([
  "EXECUTED",
  "COMPLETED",
  "COMMITTED",
  "DELIVERED",
  "RECONCILED",
]);
// Provider transport acknowledgement/observation is evidence that an effect
// may have started, never evidence that it executed or was delivered. Keep
// this veto ahead of terminal_success so adapters cannot accidentally promote
// a 202/accepted-style response by passing an optimistic boolean.
const NON_CONFIRMING_STATES = new Set(["ACCEPTED", "OBSERVED"]);
const REVIEW_STATES = new Set([
  "REVIEW_REQUIRED",
  "EFFECT_UNKNOWN",
  "TRANSPORT_UNKNOWN",
]);

export function projectMaterialEffectState(
  input: MaterialEffectProjectionInput,
): MaterialEffectState {
  const nativeState = String(input.native_state || "").toUpperCase();
  if (input.review_required === true || REVIEW_STATES.has(nativeState)) {
    return "REVIEW_REQUIRED";
  }
  if (
    input.effects_started === true &&
    (input.expired_pre_effect === true ||
      nativeState === "EXPIRED_PRE_EFFECT" ||
      nativeState === "FAILED_PRE_EFFECT")
  ) {
    return "REVIEW_REQUIRED";
  }
  if (
    input.expired_pre_effect === true || nativeState === "EXPIRED_PRE_EFFECT"
  ) {
    return "EXPIRED_PRE_EFFECT";
  }
  if (NON_CONFIRMING_STATES.has(nativeState)) {
    return input.effects_started === true ? "EFFECT_STARTED" : "CLAIMED";
  }
  if (nativeState === "ROLLED_BACK") return "RELEASED";
  if (input.terminal_success === true || EXECUTED_STATES.has(nativeState)) {
    return "EXECUTED";
  }
  if (input.terminal_failure === true || nativeState === "FAILED") {
    return input.effects_started === true
      ? "FAILED_POST_EFFECT"
      : "FAILED_PRE_EFFECT";
  }
  if (nativeState === "FAILED_POST_EFFECT") return "FAILED_POST_EFFECT";
  if (nativeState === "FAILED_PRE_EFFECT") return "FAILED_PRE_EFFECT";
  if (
    input.effects_started === true || EFFECT_STARTED_STATES.has(nativeState)
  ) {
    return "EFFECT_STARTED";
  }
  if (
    input.released === true || nativeState === "RELEASED" ||
    nativeState === "IDLE"
  ) {
    return "RELEASED";
  }
  return "CLAIMED";
}

export function materialEffectTakeoverDecision(input: {
  state: MaterialEffectState;
  lease_expired: boolean;
}) {
  if (
    input.state === "EFFECT_STARTED" ||
    input.state === "FAILED_POST_EFFECT" ||
    input.state === "REVIEW_REQUIRED"
  ) {
    return Object.freeze({
      takeover_allowed: false,
      review_required: true,
      reason: "post_effect_or_ambiguous_requires_reconciliation",
    });
  }
  if (!input.lease_expired) {
    return Object.freeze({
      takeover_allowed: false,
      review_required: false,
      reason: "lease_active",
    });
  }
  if (
    input.state === "CLAIMED" ||
    input.state === "FAILED_PRE_EFFECT" ||
    input.state === "EXPIRED_PRE_EFFECT"
  ) {
    return Object.freeze({
      takeover_allowed: true,
      review_required: false,
      reason: "expired_before_effect_safe_takeover",
    });
  }
  return Object.freeze({
    takeover_allowed: false,
    review_required: false,
    reason: "terminal_or_released_not_takeover_eligible",
  });
}

export function schedulerMaterialEffectState(row: any): MaterialEffectState {
  return projectMaterialEffectState({
    native_state: row?.material_effect_state || row?.status ||
      row?.control_state,
    effects_started: row?.effects_started === true ||
      row?.control_effects_started === true,
    review_required: row?.status === "REVIEW_REQUIRED" ||
      row?.control_state === "REVIEW_REQUIRED",
    expired_pre_effect: row?.status === "EXPIRED_PRE_EFFECT",
  });
}

export function commercialSendMaterialEffectState(
  row: any,
): MaterialEffectState {
  return projectMaterialEffectState({
    native_state: row?.state || row?.send_claim_state || row?.send_status,
    effects_started: row?.provider_effect_started === true ||
      row?.transport_started === true,
    review_required: row?.state === "REVIEW_REQUIRED" ||
      row?.send_status === "review_required",
  });
}

export function webhookDlqMaterialEffectState(row: any): MaterialEffectState {
  return projectMaterialEffectState({
    native_state: row?.claim_state,
    effects_started: row?.claim_effects_started === true,
    review_required: row?.claim_state === "REVIEW_REQUIRED",
  });
}
