/**
 * CAMBRA Intelligence — single Evaluation Harness contract (Phase 1).
 *
 * Pure, storage-agnostic validation only. A valid packet proves only that its
 * shape is complete enough for independent evidence review. This module never
 * verifies referenced evidence, trains/registers/promotes/serves a model, or
 * grants execution authority.
 */

export const EVALUATION_HARNESS_VERSION = "evaluation-harness.v1";

export const EVALUATION_PROBLEM_TYPES = [
  "RANKING",
  "CLASSIFICATION",
  "REGRESSION",
  "FORECASTING_TIME_TO_EVENT",
  "GENERATIVE",
] as const;

export const EVALUATION_BASELINE_KINDS = [
  "CURRENT_PRODUCTION",
  "ABSTAIN_DO_NOTHING",
  "DETERMINISTIC_RULE",
  "STATISTICAL_BASELINE",
] as const;

export const EVALUATION_ADDITIONAL_BASELINE_KINDS = [
  "CALIBRATED_HEURISTIC",
  "CURRENT_CHAMPION",
  "DOMAIN_SPECIFIC",
] as const;

export const EVALUATION_MODEL_TYPES = [
  "RULES",
  "STATISTICAL",
  "ML",
  "LLM_PROMPT",
  "FINE_TUNED_LM",
  "ENSEMBLE",
] as const;

export const EVALUATION_SEGMENT_CUTS = [
  "tenant",
  "country",
  "language",
  "currency",
  "industry",
  "merchant_size",
  "provider",
  "channel_source",
  "outcome_verification_tier",
  "low_data_new_segment",
  "time_cohort",
] as const;

export const EVALUATION_SAFETY_CATEGORIES = [
  "CROSS_TENANT_REQUEST",
  "PROMPT_INJECTION",
  "FORGED_EVIDENCE",
  "STALE_OR_CONTRADICTORY_FACTS",
  "UNSUPPORTED_IDENTITY_MERGE",
  "MALICIOUS_CURRENCY_OR_UNIT",
  "APPROVAL_BYPASS",
  "REPLAYED_EXECUTION",
  "COST_AMPLIFICATION",
  "PII_EXTRACTION",
  "DELETION_PROPAGATION",
  "UNSUPPORTED_LOCALE_OR_MARKET",
  "DEPENDENCY_UNAVAILABLE",
  "ARTIFACT_VERSION_MISMATCH",
] as const;

export type EvaluationValidationDecision =
  | "REJECTED_FAIL_CLOSED"
  | "CONTRACT_VALID_EVIDENCE_UNVERIFIED_HUMAN_REVIEW_REQUIRED";

export type EvaluationValidationResult = {
  contract_version: typeof EVALUATION_HARNESS_VERSION;
  valid: boolean;
  decision: EvaluationValidationDecision;
  reason_codes: string[];
  evidence_verified: false;
  registration_allowed: false;
  promotion_allowed: false;
  serving_allowed: false;
  authority_granted: false;
  human_review_required: true;
};

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string | null => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length ? normalized : null;
};

const finite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isoTime = (value: unknown): number | null => {
  const normalized = text(value);
  if (!normalized) return null;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(text).filter((entry): entry is string => Boolean(entry))
    : [];

const sha256 = (value: unknown): string | null => {
  const normalized = text(value)?.toLowerCase() || null;
  return normalized && /^(?:sha256:)?[a-f0-9]{64}$/.test(normalized)
    ? normalized.replace(/^sha256:/, "")
    : null;
};

const sortedReasons = (reasons: Iterable<string>) =>
  [...new Set(reasons)].sort();

function requireText(
  value: JsonRecord,
  field: string,
  path: string,
  reasons: Set<string>,
) {
  if (!text(value[field])) {
    reasons.add(`MISSING_REQUIRED_FIELD:${path}.${field}`);
  }
}

function requireEvidence(
  value: unknown,
  path: string,
  reasons: Set<string>,
) {
  const normalized = stringArray(value);
  if (normalized.length === 0) {
    reasons.add(`EMPTY_EVIDENCE:${path}`);
    return;
  }
  if (!Array.isArray(value) || normalized.length !== value.length) {
    reasons.add(`INVALID_EVIDENCE_REF:${path}`);
  }
}

function requireNonEmptyArray(
  value: unknown,
  path: string,
  reasons: Set<string>,
) {
  if (!Array.isArray(value) || value.length === 0) {
    reasons.add(`EMPTY_REQUIRED_ARRAY:${path}`);
  }
}

function requireReport(
  value: unknown,
  path: string,
  reasons: Set<string>,
): JsonRecord {
  if (!isRecord(value)) {
    reasons.add(`MISSING_REQUIRED_REPORT:${path}`);
    return {};
  }
  return value;
}

function validateProblemInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "problem", reasons);
  for (
    const field of [
      "problem_id",
      "problem_version",
      "decision_to_improve",
      "business_owner",
      "affected_population",
      "prediction_time_definition",
      "action_enabled",
      "authority_class",
      "label_contract_ref",
      "label_maturity",
      "fallback_ref",
      "expected_value_hypothesis",
      "privacy_security_assessment_ref",
    ]
  ) requireText(value, field, "problem", reasons);

  if (!EVALUATION_PROBLEM_TYPES.includes(value.problem_type as never)) {
    reasons.add("INVALID_PROBLEM_TYPE");
  }

  for (const field of ["false_positive_cost", "false_negative_cost"]) {
    const cost = finite(value[field]);
    if (cost === null || cost < 0) reasons.add(`INVALID_PROBLEM_COST:${field}`);
  }
  const latency = finite(value.required_latency_ms);
  if (latency === null || latency <= 0) reasons.add("INVALID_REQUIRED_LATENCY");

  const baselines = Array.isArray(value.current_baselines)
    ? value.current_baselines.filter(isRecord)
    : [];
  const baselineKinds = baselines.map((entry) => text(entry.kind)).filter(
    Boolean,
  );
  if (new Set(baselineKinds).size !== baselineKinds.length) {
    reasons.add("DUPLICATE_BASELINE_KIND");
  }
  for (const [index, baseline] of baselines.entries()) {
    const kind = text(baseline.kind);
    if (
      !kind ||
      ![
        ...EVALUATION_BASELINE_KINDS,
        ...EVALUATION_ADDITIONAL_BASELINE_KINDS,
      ].includes(kind as never)
    ) reasons.add(`INVALID_BASELINE_KIND:problem.current_baselines[${index}]`);
    requireText(
      baseline,
      "ref",
      `problem.current_baselines[${index}]`,
      reasons,
    );
    requireEvidence(
      baseline.evidence_refs,
      `problem.current_baselines[${index}]`,
      reasons,
    );
  }
  for (const kind of EVALUATION_BASELINE_KINDS) {
    const baseline = baselines.find((entry) => entry.kind === kind);
    if (!baseline) {
      reasons.add(`MISSING_BASELINE:${kind}`);
      continue;
    }
    requireText(baseline, "ref", `problem.current_baselines.${kind}`, reasons);
    requireEvidence(
      baseline.evidence_refs,
      `problem.current_baselines.${kind}`,
      reasons,
    );
  }
  requireNonEmptyArray(
    value.evaluation_guardrails,
    "problem.evaluation_guardrails",
    reasons,
  );
  requireNonEmptyArray(value.stop_criteria, "problem.stop_criteria", reasons);
  requireEvidence(value.evidence_refs, "problem", reasons);
}

function validateMetricInto(
  input: unknown,
  reasons: Set<string>,
  path = "metrics[0]",
) {
  const value = requireReport(input, path, reasons);
  for (
    const field of [
      "metric_id",
      "metric_version",
      "name",
      "formula",
      "population",
      "window",
      "confidence_interval_method",
      "baseline_ref",
      "owner",
    ]
  ) requireText(value, field, path, reasons);

  if (
    !["HIGHER_IS_BETTER", "LOWER_IS_BETTER", "TARGET_RANGE"].includes(
      String(value.direction || ""),
    )
  ) reasons.add(`INVALID_METRIC_DIRECTION:${path}`);
  const minimumSample = finite(value.minimum_sample);
  if (minimumSample === null || minimumSample < 1) {
    reasons.add(`INVALID_METRIC_MINIMUM_SAMPLE:${path}`);
  }
  const materiality = finite(value.materiality_threshold);
  if (materiality === null || materiality < 0) {
    reasons.add(`INVALID_METRIC_MATERIALITY:${path}`);
  }
  if (!Array.isArray(value.exclusions)) {
    reasons.add(`INVALID_METRIC_EXCLUSIONS:${path}`);
  }
  requireNonEmptyArray(value.segment_cuts, `${path}.segment_cuts`, reasons);
  requireEvidence(value.source_refs, `${path}.source_refs`, reasons);
  if (typeof value.is_primary !== "boolean") {
    reasons.add(`INVALID_METRIC_PRIMARY_FLAG:${path}`);
  }
}

function validateCandidateInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "candidate", reasons);
  for (
    const field of [
      "candidate_id",
      "candidate_version",
      "model_type",
      "artifact_ref",
      "training_run_ref",
    ]
  ) requireText(value, field, "candidate", reasons);
  if (!EVALUATION_MODEL_TYPES.includes(value.model_type as never)) {
    reasons.add("INVALID_CANDIDATE_MODEL_TYPE");
  }
  if (!sha256(value.artifact_hash)) {
    reasons.add("INVALID_CANDIDATE_ARTIFACT_HASH");
  }
  requireEvidence(value.evidence_refs, "candidate", reasons);
}

function validateHoldoutInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "holdout", reasons);
  for (const field of ["dataset_id", "dataset_version", "manifest_ref"]) {
    requireText(value, field, "holdout", reasons);
  }
  if (!sha256(value.content_hash)) reasons.add("INVALID_HOLDOUT_CONTENT_HASH");
  if (value.split_strategy !== "TEMPORAL_GROUPED") {
    reasons.add("INVALID_HOLDOUT_SPLIT_STRATEGY");
  }
  if (value.frozen !== true) reasons.add("HOLDOUT_NOT_FROZEN");
  if (value.immutable !== true) reasons.add("HOLDOUT_NOT_IMMUTABLE");
  if (value.independent_from_training !== true) {
    reasons.add("HOLDOUT_NOT_INDEPENDENT_FROM_TRAINING");
  }

  const trainingEnd = isoTime(value.training_end_at);
  const holdoutStart = isoTime(value.holdout_start_at);
  const holdoutEnd = isoTime(value.holdout_end_at);
  const predictionCutoff = isoTime(value.prediction_cutoff_at);
  const treatmentStarted = isoTime(value.treatment_started_at);
  const latestFeature = isoTime(value.latest_feature_available_at);
  for (
    const [field, parsed] of [
      ["training_end_at", trainingEnd],
      ["holdout_start_at", holdoutStart],
      ["holdout_end_at", holdoutEnd],
      ["prediction_cutoff_at", predictionCutoff],
      ["treatment_started_at", treatmentStarted],
      ["latest_feature_available_at", latestFeature],
    ] as const
  ) {
    if (parsed === null) reasons.add(`INVALID_HOLDOUT_TIME:${field}`);
  }
  if (
    trainingEnd !== null && holdoutStart !== null && trainingEnd >= holdoutStart
  ) reasons.add("TRAINING_HOLDOUT_TEMPORAL_OVERLAP");
  if (
    holdoutStart !== null && holdoutEnd !== null && holdoutStart >= holdoutEnd
  ) reasons.add("INVALID_HOLDOUT_TIME_RANGE");
  if (
    latestFeature !== null && predictionCutoff !== null &&
    latestFeature > predictionCutoff
  ) reasons.add("FUTURE_INFORMATION_LEAKAGE");
  if (
    latestFeature !== null && treatmentStarted !== null &&
    latestFeature >= treatmentStarted
  ) reasons.add("POST_TREATMENT_LEAKAGE");

  const leakage = requireReport(
    value.leakage_report,
    "holdout.leakage_report",
    reasons,
  );
  if (leakage.status !== "PASS") reasons.add("LEAKAGE_REPORT_NOT_PASS");
  for (
    const [field, code] of [
      ["post_treatment_feature_count", "POST_TREATMENT_LEAKAGE"],
      ["post_outcome_feature_count", "POST_OUTCOME_LEAKAGE"],
      ["future_information_count", "FUTURE_INFORMATION_LEAKAGE"],
      ["identity_overlap_count", "IDENTITY_SPLIT_LEAKAGE"],
    ] as const
  ) {
    const count = finite(leakage[field]);
    if (count === null || count !== 0) reasons.add(code);
  }
  requireEvidence(
    leakage.evidence_refs,
    "holdout.leakage_report",
    reasons,
  );
  requireEvidence(value.evidence_refs, "holdout", reasons);
}

function validateSegmentsInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "segments", reasons);
  if (value.status !== "PASS") reasons.add("SEGMENT_REPORT_NOT_PASS");
  const cuts = Array.isArray(value.cuts) ? value.cuts.filter(isRecord) : [];
  const names = cuts.map((entry) => text(entry.name)).filter(Boolean);
  if (new Set(names).size !== names.length) {
    reasons.add("DUPLICATE_SEGMENT_CUT");
  }
  for (const required of EVALUATION_SEGMENT_CUTS) {
    const cut = cuts.find((entry) => entry.name === required);
    if (!cut) {
      reasons.add(`MISSING_SEGMENT_CUT:${required}`);
      continue;
    }
    if (!["EVALUATED", "INSUFFICIENT_SAMPLE"].includes(String(cut.status))) {
      reasons.add(`INVALID_SEGMENT_STATUS:${required}`);
    }
    const sample = finite(cut.sample_size);
    if (sample === null || sample < 0) {
      reasons.add(`INVALID_SEGMENT_SAMPLE:${required}`);
    }
    if (cut.status === "INSUFFICIENT_SAMPLE" && !text(cut.limitation)) {
      reasons.add(`UNDOCUMENTED_SEGMENT_LIMITATION:${required}`);
    }
    if (cut.material_regression !== false) {
      reasons.add(`MATERIAL_OR_UNKNOWN_SEGMENT_REGRESSION:${required}`);
    }
    requireEvidence(cut.evidence_refs, `segments.${required}`, reasons);
  }
  if (!Array.isArray(value.material_regressions)) {
    reasons.add("INVALID_MATERIAL_REGRESSION_REPORT");
  } else if (value.material_regressions.length > 0) {
    reasons.add("MATERIAL_SEGMENT_REGRESSION");
  }
  if (!Array.isArray(value.unsupported_segments)) {
    reasons.add("INVALID_UNSUPPORTED_SEGMENTS_REPORT");
  }
  requireEvidence(value.evidence_refs, "segments", reasons);
}

function validateCalibrationInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "calibration", reasons);
  const applicability = String(value.applicability || "");
  if (applicability === "APPLICABLE") {
    if (value.status !== "PASS") reasons.add("CALIBRATION_REPORT_NOT_PASS");
    requireText(value, "method", "calibration", reasons);
    if (
      value.candidate_result === null || value.candidate_result === undefined
    ) {
      reasons.add("MISSING_CALIBRATION_CANDIDATE_RESULT");
    }
    if (value.baseline_result === null || value.baseline_result === undefined) {
      reasons.add("MISSING_CALIBRATION_BASELINE_RESULT");
    }
    if (value.non_regression !== true) reasons.add("CALIBRATION_REGRESSION");
  } else if (applicability === "NOT_APPLICABLE") {
    if (value.status !== "NOT_APPLICABLE") {
      reasons.add("INVALID_CALIBRATION_NOT_APPLICABLE_STATUS");
    }
    requireText(value, "applicability_justification", "calibration", reasons);
  } else {
    reasons.add("CALIBRATION_APPLICABILITY_UNDECLARED");
  }
  requireEvidence(value.evidence_refs, "calibration", reasons);
}

function validateSafetyInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "safety", reasons);
  if (value.status !== "PASS") reasons.add("SAFETY_REPORT_NOT_PASS");
  const tests = Array.isArray(value.tests) ? value.tests.filter(isRecord) : [];
  const categories = tests.map((entry) => text(entry.category)).filter(Boolean);
  if (new Set(categories).size !== categories.length) {
    reasons.add("DUPLICATE_SAFETY_TEST_CATEGORY");
  }
  for (const required of EVALUATION_SAFETY_CATEGORIES) {
    const test = tests.find((entry) => entry.category === required);
    if (!test) {
      reasons.add(`MISSING_SAFETY_TEST:${required}`);
      continue;
    }
    if (test.status !== "PASS") reasons.add(`SAFETY_TEST_FAILED:${required}`);
    requireEvidence(test.evidence_refs, `safety.${required}`, reasons);
  }
  const tenantLeakage = finite(value.tenant_leakage_count);
  if (tenantLeakage === null || tenantLeakage !== 0) {
    reasons.add("TENANT_ISOLATION_FAILURE");
  }
  const authorityRegressions = finite(value.authority_regression_count);
  if (authorityRegressions === null || authorityRegressions !== 0) {
    reasons.add("AUTHORITY_REGRESSION");
  }
  const unsupportedRate = finite(value.unsupported_claim_rate);
  const unsupportedThreshold = finite(value.unsupported_claim_threshold);
  if (
    unsupportedRate === null || unsupportedThreshold === null ||
    unsupportedRate < 0 || unsupportedThreshold < 0 ||
    unsupportedRate > unsupportedThreshold
  ) reasons.add("UNSUPPORTED_CLAIMS_ABOVE_THRESHOLD");
  requireText(value, "privacy_review_ref", "safety", reasons);
  requireText(value, "authority_review_ref", "safety", reasons);
  requireEvidence(value.evidence_refs, "safety", reasons);
}

function validateCostLatencyInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "cost_latency", reasons);
  if (value.status !== "PASS") reasons.add("COST_LATENCY_REPORT_NOT_PASS");
  requireText(value, "currency", "cost_latency", reasons);
  const candidateCost = finite(value.candidate_cost);
  const hardCostCap = finite(value.hard_cost_cap);
  if (
    candidateCost === null || hardCostCap === null || candidateCost < 0 ||
    hardCostCap < 0 || candidateCost > hardCostCap
  ) reasons.add("COST_BEYOND_HARD_CAP");
  const netUtility = finite(value.net_utility);
  if (netUtility === null || netUtility <= 0) {
    reasons.add("NET_UTILITY_NOT_POSITIVE");
  }
  const latency = finite(value.p95_latency_ms);
  const latencySlo = finite(value.latency_slo_ms);
  if (
    latency === null || latencySlo === null || latency < 0 || latencySlo <= 0 ||
    latency > latencySlo
  ) reasons.add("LATENCY_SLO_EXCEEDED");
  requireEvidence(
    value.cost_attribution_refs,
    "cost_latency.cost_attribution_refs",
    reasons,
  );
  requireEvidence(value.evidence_refs, "cost_latency", reasons);
}

function validateReproducibilityInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "reproducibility", reasons);
  if (value.status !== "PASS") reasons.add("REPRODUCIBILITY_REPORT_NOT_PASS");
  for (
    const field of [
      "code_ref",
      "dependency_lock_ref",
      "environment_ref",
      "logs_ref",
      "reproduction_command_ref",
      "signed_evaluation_report_ref",
    ]
  ) requireText(value, field, "reproducibility", reasons);
  if (!sha256(value.dataset_content_hash)) {
    reasons.add("INVALID_REPRODUCIBILITY_DATASET_HASH");
  }
  if (!sha256(value.artifact_hash)) {
    reasons.add("INVALID_REPRODUCIBILITY_ARTIFACT_HASH");
  }
  requireNonEmptyArray(
    value.feature_contract_versions,
    "reproducibility.feature_contract_versions",
    reasons,
  );
  requireNonEmptyArray(
    value.label_contract_versions,
    "reproducibility.label_contract_versions",
    reasons,
  );
  requireNonEmptyArray(
    value.random_seeds,
    "reproducibility.random_seeds",
    reasons,
  );
  const tolerance = finite(value.rerun_tolerance);
  const delta = finite(value.observed_rerun_delta);
  if (
    tolerance === null || delta === null || tolerance < 0 || delta < 0 ||
    delta > tolerance || value.within_tolerance !== true
  ) reasons.add("NON_REPRODUCIBLE_RESULT");
  requireEvidence(value.evidence_refs, "reproducibility", reasons);
}

function validatePromotionInto(input: unknown, reasons: Set<string>) {
  const value = requireReport(input, "promotion", reasons);
  if (
    !["SHADOW", "CANARY", "CHAMPION"].includes(String(value.requested_stage))
  ) {
    reasons.add("INVALID_REQUESTED_STAGE");
  }
  for (
    const field of [
      "problem_contract_ref",
      "model_card_ref",
      "dataset_card_ref",
      "evaluation_report_ref",
      "baseline_comparison_ref",
      "segment_report_ref",
      "shadow_report_ref",
      "privacy_security_authority_review_ref",
      "cost_latency_report_ref",
      "rollback_test_ref",
      "owner_on_call",
    ]
  ) requireText(value, field, "promotion", reasons);
  const startAt = isoTime(value.start_at);
  const reviewAt = isoTime(value.review_at);
  if (startAt === null) reasons.add("INVALID_PROMOTION_START_TIME");
  if (reviewAt === null || (startAt !== null && reviewAt <= startAt)) {
    reasons.add("INVALID_PROMOTION_REVIEW_TIME");
  }
  const approvals = Array.isArray(value.approvals)
    ? value.approvals.filter(isRecord)
    : [];
  if (approvals.length === 0) reasons.add("MISSING_PROMOTION_APPROVALS");
  for (const [index, approval] of approvals.entries()) {
    for (const field of ["approval_id", "approved_by", "scope"]) {
      requireText(approval, field, `promotion.approvals[${index}]`, reasons);
    }
    requireEvidence(
      approval.evidence_refs,
      `promotion.approvals[${index}]`,
      reasons,
    );
  }
  requireEvidence(value.evidence_refs, "promotion", reasons);
}

function contractResult(reasons: Set<string>): EvaluationValidationResult {
  const reasonCodes = sortedReasons(reasons);
  const valid = reasonCodes.length === 0;
  return {
    contract_version: EVALUATION_HARNESS_VERSION,
    valid,
    decision: valid
      ? "CONTRACT_VALID_EVIDENCE_UNVERIFIED_HUMAN_REVIEW_REQUIRED"
      : "REJECTED_FAIL_CLOSED",
    reason_codes: reasonCodes,
    evidence_verified: false,
    registration_allowed: false,
    promotion_allowed: false,
    serving_allowed: false,
    authority_granted: false,
    human_review_required: true,
  };
}

export function validateProblemContract(input: unknown) {
  const reasons = new Set<string>();
  validateProblemInto(input, reasons);
  return contractResult(reasons);
}

export function validateMetricContract(input: unknown) {
  const reasons = new Set<string>();
  validateMetricInto(input, reasons);
  return contractResult(reasons);
}

export function validateEvaluationPacket(input: unknown) {
  const reasons = new Set<string>();
  const value = requireReport(input, "evaluation", reasons);
  for (const field of ["evaluation_id", "evaluation_version"]) {
    requireText(value, field, "evaluation", reasons);
  }
  if (isoTime(value.evaluated_at) === null) {
    reasons.add("INVALID_EVALUATED_AT");
  }
  requireEvidence(value.evidence_refs, "evaluation", reasons);

  validateProblemInto(value.problem, reasons);
  validateCandidateInto(value.candidate, reasons);
  validateHoldoutInto(value.holdout, reasons);

  const metrics = Array.isArray(value.metrics) ? value.metrics : [];
  if (metrics.length === 0) reasons.add("MISSING_METRIC_REPORTS");
  metrics.forEach((metric, index) =>
    validateMetricInto(metric, reasons, `metrics[${index}]`)
  );
  if (
    !metrics.some((metric) => isRecord(metric) && metric.is_primary === true)
  ) {
    reasons.add("PRIMARY_METRIC_NOT_PREDECLARED");
  }

  validateSegmentsInto(value.segments, reasons);
  validateCalibrationInto(value.calibration, reasons);
  validateSafetyInto(value.safety, reasons);
  validateCostLatencyInto(value.cost_latency, reasons);
  validateReproducibilityInto(value.reproducibility, reasons);
  validatePromotionInto(value.promotion, reasons);

  const candidate = isRecord(value.candidate) ? value.candidate : {};
  const holdout = isRecord(value.holdout) ? value.holdout : {};
  const reproducibility = isRecord(value.reproducibility)
    ? value.reproducibility
    : {};
  const candidateHash = sha256(candidate.artifact_hash);
  const reproducibilityArtifactHash = sha256(reproducibility.artifact_hash);
  if (
    candidateHash && reproducibilityArtifactHash &&
    candidateHash !== reproducibilityArtifactHash
  ) reasons.add("ARTIFACT_HASH_LINEAGE_MISMATCH");
  const holdoutHash = sha256(holdout.content_hash);
  const reproducibilityDatasetHash = sha256(
    reproducibility.dataset_content_hash,
  );
  if (
    holdoutHash && reproducibilityDatasetHash &&
    holdoutHash !== reproducibilityDatasetHash
  ) reasons.add("DATASET_HASH_LINEAGE_MISMATCH");

  return contractResult(reasons);
}
