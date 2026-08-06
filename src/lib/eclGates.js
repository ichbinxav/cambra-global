// v62.4 — ECL P2: pure gate evaluation + freeze-eligibility derivation +
// ConfidenceResult finalization (canonical).
//
// PURE. No writes, no I/O, no effects, and NO `Date.now()`: time enters
// exclusively through context.now, so an expiry decision is reproducible from
// its inputs instead of depending on when the test happened to run.
//
// WHY finalizeConfidenceResult lives HERE and not in confidenceResult.js:
// finalization needs the policy and the context (it derives freezeEligibility,
// which is a gate outcome). Putting it beside the shape definition would force
// confidenceResult.js to import this module while this module imports its
// enums — a cycle. The shape is declared there, the policy-dependent
// evaluation is declared here.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.

import { deepFreeze } from "./eclSerialize.js";
import {
  CONFIDENCE_LEVELS,
  FREEZE_ELIGIBILITY,
  makeConfidenceAssessment,
  ConfidenceContractError,
} from "./confidenceResult.js";

export const REQUIRED_CONTEXT_KEYS = [
  "now",
  "hasAttestation",
  "hasOpenConflicts",
  "baselineLocked",
  "activeStrikeCountByScope",
  "hasBlockingReviewCase",
];

export class EclContextError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclContextError";
  }
}

/**
 * The context is MANDATORY and complete-or-nothing. A missing `hasAttestation`
 * defaulting to false would look like a safe default and would in fact answer a
 * question nobody asked; a missing `now` would silently reintroduce wall-clock
 * time. Both are refused.
 */
export function assertContext(context) {
  const c = context && typeof context === "object" ? context : {};
  const missing = REQUIRED_CONTEXT_KEYS.filter((k) => c[k] === undefined || c[k] === null);
  if (missing.length) {
    throw new EclContextError(`gate context is missing required key(s): ${missing.join(", ")}`);
  }
  const t = c.now instanceof Date ? c.now.getTime() : Date.parse(String(c.now));
  if (Number.isNaN(t)) throw new EclContextError("context.now must be a Date or a parseable ISO instant");
  return { ...c, nowMs: t };
}

function confidenceRank(policy, level) {
  const order = (policy && policy.confidenceOrder) || CONFIDENCE_LEVELS;
  return order.indexOf(level);
}

function isExpired(result, nowMs) {
  if (!result.expiresAt) return false;
  const exp = Date.parse(String(result.expiresAt));
  if (Number.isNaN(exp)) return false;
  return nowMs > exp;
}

/**
 * Evaluate one policy gate against a result. Returns
 * { allowed, gateName, reasons[], policyVersion } and nothing else: no write,
 * no side effect, no partial application anywhere in the product.
 */
export function evaluateGate(gateName, result, policy, context) {
  const ctx = assertContext(context);
  const policyVersion = (policy && policy.policyVersion) || null;
  const gate = policy && policy.gates ? policy.gates[gateName] : undefined;
  const reasons = [];

  if (!gate) {
    return deepFreeze({ allowed: false, gateName, reasons: ["gate_unknown"], policyVersion });
  }

  // Non-automatable gate: forbidden means forbidden, whatever the evidence says.
  if (gate.automation === "forbidden") {
    reasons.push("automation_forbidden");
    if (gate.requiresHumanReview) reasons.push("requires_human_review");
    if (gate.manualResolution) reasons.push(`manual_resolution:${gate.manualResolution}`);
    return deepFreeze({ allowed: false, gateName, reasons, policyVersion });
  }

  if (gate.minConfidence) {
    const have = confidenceRank(policy, result.confidenceLevel);
    const need = confidenceRank(policy, gate.minConfidence);
    if (have < 0 || need < 0 || have < need) {
      reasons.push(`confidence_below_min:${result.confidenceLevel}<${gate.minConfidence}`);
    }
  }

  if (Array.isArray(gate.allowedStatuses) && !gate.allowedStatuses.includes(result.evidenceStatus)) {
    reasons.push(`status_not_allowed:${result.evidenceStatus}`);
  }

  if (Array.isArray(gate.allowedVerificationMethods) && !gate.allowedVerificationMethods.includes(result.verificationMethod)) {
    reasons.push(`verification_method_not_allowed:${result.verificationMethod}`);
  }

  if (gate.requiresNotExpired && isExpired(result, ctx.nowMs)) {
    reasons.push("evidence_expired");
  }

  if (gate.requiresAttestation && ctx.hasAttestation !== true) {
    reasons.push("attestation_missing");
  }

  if (gate.requiresNoOpenConflicts && (ctx.hasOpenConflicts === true || (Array.isArray(result.conflicts) && result.conflicts.length > 0))) {
    reasons.push("open_conflicts");
  }

  if (gate.requiresBaselineLocked && ctx.baselineLocked !== true) {
    reasons.push("baseline_not_locked");
  }

  if (gate.requiresNoBlockingReviewCase && ctx.hasBlockingReviewCase === true) {
    reasons.push("blocking_review_case");
  }

  if (typeof gate.blockingStrikeThreshold === "number") {
    const scopes = Array.isArray(gate.blockingStrikeScopes) ? gate.blockingStrikeScopes : [];
    const counts = ctx.activeStrikeCountByScope || {};
    for (const scope of scopes) {
      const n = Number(counts[scope] || 0);
      if (n >= gate.blockingStrikeThreshold) {
        reasons.push(`blocking_strikes:${scope}:${n}`);
      }
    }
  }

  return deepFreeze({ allowed: reasons.length === 0, gateName, reasons, policyVersion });
}

/**
 * Freeze eligibility is DERIVED, never declared: it is the answer to "which
 * freeze-related gate does this evidence actually pass?".
 *   freeze_baseline passes      → eligible
 *   baseline_provisional passes → conditionally_eligible
 *   otherwise                   → not_eligible
 */
export function deriveFreezeEligibility(result, policy, context) {
  if (evaluateGate("freeze_baseline", result, policy, context).allowed) return FREEZE_ELIGIBILITY[0];
  if (evaluateGate("baseline_provisional", result, policy, context).allowed) return FREEZE_ELIGIBILITY[1];
  return FREEZE_ELIGIBILITY[2];
}

/**
 * Turn an assessment into a finalized, deep-frozen ConfidenceResult. The
 * assessment may be a plain field bag (it is re-validated through
 * makeConfidenceAssessment) or an already-built assessment.
 */
export function finalizeConfidenceResult(assessment, policy, context) {
  if (assessment && Object.prototype.hasOwnProperty.call(assessment, "freezeEligibility")) {
    throw new ConfidenceContractError("freezeEligibility is always derived and must not be supplied by the caller");
  }
  const a = makeConfidenceAssessment(assessment);
  const ctx = assertContext(context);

  // A result whose expiry has passed is reported as expired here rather than
  // being left to each consumer to notice.
  const expired = isExpired(a, ctx.nowMs);
  const evidenceStatus = expired && a.evidenceStatus === "accepted_provisionally" ? "expired" : a.evidenceStatus;

  const base = { ...a, evidenceStatus };
  const freezeEligibility = deriveFreezeEligibility(base, policy, context);

  return deepFreeze({
    evidenceType: base.evidenceType,
    sourceType: base.sourceType,
    confidenceLevel: base.confidenceLevel,
    verificationMethod: base.verificationMethod,
    evidenceStatus,
    freezeEligibility,
    passedRules: [...base.passedRules],
    failedRules: base.failedRules.map((r) => ({ ...r })),
    warnings: [...base.warnings],
    missingFields: [...base.missingFields],
    invalidFields: base.invalidFields.map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    conflicts: base.conflicts.map((v) => (typeof v === "object" && v !== null ? { ...v } : v)),
    metrics: { ...base.metrics },
    period: { ...base.period },
    provenance: { ...base.provenance },
    expiresAt: base.expiresAt,
    reviewRequired: base.reviewRequired === true || expired,
    policyVersion: (policy && policy.policyVersion) || null,
    ruleSetVersion: base.ruleSetVersion,
    explanation: {
      reason: base.explanation.reason,
      actionsToImprove: [...base.explanation.actionsToImprove],
    },
  });
}