import {
  validateIntelligenceTenantScope,
  validateStoredIntelligenceRecord,
} from "./intelligenceTenantScope.ts";

export const CLAIM_PROMOTION_POLICY_VERSION =
  "p12-claim-promotion-lineage.v2";

type JsonRecord = Record<string, any>;

const text = (value: unknown) => String(value ?? "").trim();
const time = (value: unknown) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
};
const exactIds = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  const ids = value.map(text);
  if (
    ids.length === 0 || ids.some((id) =>
      !id || id.length > 240 || /[\s*?]/.test(id)
    ) || new Set(ids).size !== ids.length
  ) return null;
  return ids;
};
const sameSet = (expected: string[], rows: JsonRecord[]) => {
  const actual = rows.map((row) => text(row?.id));
  return actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((id) => actual.includes(id));
};

export type ClaimPromotionAssessment = {
  ok: boolean;
  policy_version: typeof CLAIM_PROMOTION_POLICY_VERSION;
  reason_codes: string[];
  derived_truth_level: "verified_official" | "observed" | null;
  evidence_ids: string[];
  observation_ids: string[];
  manual_decision_is_descriptive_only: true;
  training_eligible: false;
  model_eligible: false;
  calibration_eligible: false;
};

/**
 * Validates a claim against rows already loaded by the server. Counts and
 * `corroborated` flags supplied by a caller never grant promotion authority.
 */
export function assessClaimPromotionLineage(input: {
  claim: JsonRecord;
  evidence_rows: JsonRecord[];
  observation_rows: JsonRecord[];
  evaluated_at?: string;
}): ClaimPromotionAssessment {
  const reasons = new Set<string>();
  const claim = input?.claim || {};
  const evidenceIds = exactIds(claim.evidence_ids);
  const observationIds = exactIds(claim.observation_ids);
  const evidenceRows = Array.isArray(input?.evidence_rows)
    ? input.evidence_rows
    : [];
  const observationRows = Array.isArray(input?.observation_rows)
    ? input.observation_rows
    : [];

  if (!evidenceIds) reasons.add("EXACT_EVIDENCE_REFS_REQUIRED");
  if (!observationIds) reasons.add("EXACT_OBSERVATION_REFS_REQUIRED");
  if (evidenceIds && !sameSet(evidenceIds, evidenceRows)) {
    reasons.add("EVIDENCE_REFERENCE_SET_MISMATCH");
  }
  if (observationIds && !sameSet(observationIds, observationRows)) {
    reasons.add("OBSERVATION_REFERENCE_SET_MISMATCH");
  }

  const claimBinding = validateIntelligenceTenantScope(claim, "claim");
  if (!claimBinding.ok) reasons.add("CLAIM_TENANT_PURPOSE_INVALID");
  const claimPurpose = text(claim.purpose).toLowerCase();
  const claimDomain = text(claim.domain).toLowerCase();
  if (!claimPurpose) reasons.add("CLAIM_PURPOSE_MISSING");
  if (!claimDomain) reasons.add("CLAIM_DOMAIN_MISSING");
  for (const evidence of evidenceRows) {
    const binding = validateStoredIntelligenceRecord(evidence, "evidence");
    if (
      !binding.ok || !claimBinding.ok ||
      binding.scope_key !== claimBinding.scope_key
    ) reasons.add("EVIDENCE_TENANT_PURPOSE_MISMATCH");
    if (
      text(evidence.purpose).toLowerCase() !== claimPurpose ||
      text(evidence.domain).toLowerCase() !== claimDomain
    ) reasons.add("EVIDENCE_TENANT_PURPOSE_MISMATCH");
    if (evidence.quarantined === true || evidence.is_demo === true) {
      reasons.add("EVIDENCE_QUARANTINED_OR_DEMO");
    }
    if (!text(evidence.source_reference)) {
      reasons.add("EVIDENCE_SOURCE_REFERENCE_MISSING");
    }
    if (time(evidence.observed_at) === null || time(evidence.recorded_at) === null) {
      reasons.add("EVIDENCE_TIME_INVALID");
    }
    if (text(evidence.truth_level) === "inferred") {
      reasons.add("INFERRED_EVIDENCE_NOT_PROMOTABLE");
    }
    const verification = text(evidence.verification_status);
    if (
      text(evidence.truth_level) !== "verified_official" &&
      !["VERIFIED", "HIGH"].includes(verification)
    ) reasons.add("EVIDENCE_NOT_VERIFIED");
  }

  for (const observation of observationRows) {
    const binding = validateStoredIntelligenceRecord(
      observation,
      "observation",
    );
    if (
      !binding.ok || !claimBinding.ok ||
      binding.scope_key !== claimBinding.scope_key
    ) reasons.add("OBSERVATION_TENANT_PURPOSE_MISMATCH");
    if (
      text(observation.purpose).toLowerCase() !== claimPurpose ||
      text(observation.domain).toLowerCase() !== claimDomain
    ) reasons.add("OBSERVATION_TENANT_PURPOSE_MISMATCH");
    if (
      !evidenceIds || !evidenceIds.includes(text(observation.evidence_id))
    ) reasons.add("OBSERVATION_EVIDENCE_LINK_INVALID");
    if (text(observation.semantic_key) !== text(claim.semantic_key)) {
      reasons.add("OBSERVATION_SEMANTIC_KEY_MISMATCH");
    }
    if (
      !["corroborated", "verified", "active"].includes(
        text(observation.status),
      )
    ) reasons.add("OBSERVATION_NOT_CORROBORATED");
    if (text(observation.truth_level) === "inferred") {
      reasons.add("INFERRED_OBSERVATION_NOT_PROMOTABLE");
    }
    if (time(observation.observed_at) === null) {
      reasons.add("OBSERVATION_TIME_INVALID");
    }
  }

  const claimEffectiveAt = time(claim.effective_at || claim.valid_from);
  const claimObservedAt = time(claim.observed_at);
  if (claimEffectiveAt === null || claimObservedAt === null) {
    reasons.add("CLAIM_TIME_INVALID");
  } else {
    if (claimEffectiveAt > claimObservedAt) {
      reasons.add("CLAIM_EFFECTIVE_AFTER_OBSERVED");
    }
    for (const row of [...evidenceRows, ...observationRows]) {
      const observedAt = time(row.observed_at);
      if (observedAt !== null && observedAt > claimObservedAt) {
        reasons.add("CLAIM_USES_FUTURE_LINEAGE");
      }
    }
  }
  const evaluatedAt = time(input?.evaluated_at || new Date().toISOString());
  if (evaluatedAt === null || (claimObservedAt !== null && claimObservedAt > evaluatedAt)) {
    reasons.add("CLAIM_OBSERVED_IN_FUTURE");
  }

  const linkedEvidence = new Set(
    observationRows.map((row) => text(row.evidence_id)).filter(Boolean),
  );
  const allOfficial = evidenceRows.length > 0 && evidenceRows.every((row) =>
    text(row.truth_level) === "verified_official"
  );
  const observedCorroborated = evidenceRows.length >= 2 &&
    linkedEvidence.size >= 2 &&
    observationRows.length >= 2;
  const derivedTruthLevel = allOfficial
    ? "verified_official"
    : observedCorroborated
    ? "observed"
    : null;
  if (!derivedTruthLevel) reasons.add("INSUFFICIENT_INDEPENDENT_LINEAGE");
  if (
    derivedTruthLevel && text(claim.truth_level) !== derivedTruthLevel
  ) reasons.add("CALLER_TRUTH_LEVEL_NOT_DERIVED");

  return Object.freeze({
    ok: reasons.size === 0,
    policy_version: CLAIM_PROMOTION_POLICY_VERSION,
    reason_codes: [...reasons].sort(),
    derived_truth_level: derivedTruthLevel,
    evidence_ids: evidenceIds || [],
    observation_ids: observationIds || [],
    manual_decision_is_descriptive_only: true,
    training_eligible: false,
    model_eligible: false,
    calibration_eligible: false,
  });
}

export function callerLearningAuthorityRejected(input: JsonRecord) {
  return input?.training_eligible === true ||
    input?.model_eligible === true ||
    input?.calibration_eligible === true ||
    input?.learning_eligibility === "ELIGIBLE_TRAINING" ||
    input?.learning_eligibility_status === "ELIGIBLE_TRAINING" ||
    input?.training_eligible_core === true;
}
