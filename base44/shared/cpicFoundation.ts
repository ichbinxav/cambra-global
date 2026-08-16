/**
 * CAMBRA Probabilistic Intelligence Core (CPIC) — Phase 2 foundation.
 *
 * This is a pure semantic/calculation boundary over the existing Intelligence
 * v2/P4 authorities. It deliberately does not train, register, deploy or
 * calibrate a model, persist a second ledger, or grant execution authority.
 */

export const CPIC_CONTRACT_VERSION = "cpic-foundation.v0";
export const CPIC_ESTIMATE_CONTRACT_V1 = "cpic-estimate.v1";
export const CPIC_EXPECTED_VALUE_VERSION = "cpic-expected-value.v0";
export const CPIC_VALUE_OF_INFORMATION_VERSION = "cpic-value-of-information.v0";

export const CPIC_TRUTH_STATES = [
  "UNKNOWN",
  "OBSERVED",
  "EXTRACTED_UNVERIFIED",
  "CORROBORATED",
  "VERIFIED",
  "BENCHMARK",
  "INFERRED",
  "PREDICTED",
  "SIMULATED",
  "REALIZED",
  "RECONCILED",
  "STALE",
  "CONTRADICTED",
  "OOD",
] as const;

export const CPIC_SUPPORT_STATES = [
  "IN_DISTRIBUTION",
  "EDGE_OF_SUPPORT",
  "LOW_SUPPORT",
  "OUT_OF_DISTRIBUTION",
  "UNKNOWN_SUPPORT",
] as const;

export const CPIC_UNCERTAINTY_COMPONENTS = [
  "aleatoric",
  "epistemic",
  "model",
  "data",
] as const;

export const CPIC_VALUE_MODES = [
  "UNKNOWN",
  "OBSERVED",
  "EXTRACTED",
  "DETERMINISTIC_DERIVED",
  "STATISTICALLY_INFERRED",
  "PREDICTED",
  "SIMULATED",
  "IMPUTED",
] as const;

export const CPIC_VERIFICATION_STATUSES = [
  "NOT_ASSESSED",
  "UNVERIFIED",
  "SOURCE_VERIFIED",
  "CORROBORATED",
  "VERIFIED",
  "RECONCILED",
  "REJECTED",
] as const;

export const CPIC_EVIDENCE_STATUSES = [
  "NO_EVIDENCE",
  "PARTIAL",
  "SUFFICIENT_FOR_ESTIMATION",
  "SUFFICIENT_FOR_DECISION",
  "QUARANTINED",
  "CONTRADICTED",
  "REVOKED",
] as const;

export const CPIC_TEMPORAL_STATUSES = [
  "CURRENT",
  "STALE",
  "EXPIRED",
  "FUTURE_NOT_YET_EFFECTIVE",
  "SUPERSEDED",
  "UNKNOWN_TIME",
] as const;

export const CPIC_REALIZATION_STATUSES = [
  "NOT_APPLICABLE",
  "NOT_STARTED",
  "PENDING",
  "PARTIALLY_EXECUTED",
  "EXECUTED",
  "OUTCOME_IMMATURE",
  "REALIZED",
  "RECONCILED",
  "REVERSED",
] as const;

export const CPIC_DISPUTE_STATUSES = [
  "NONE",
  "DISPUTED",
  "UNDER_REVIEW",
  "RESOLVED_VALID",
  "RESOLVED_INVALID",
] as const;

export const CPIC_CAUSAL_STATUSES = [
  "DESCRIPTIVE",
  "PREDICTIVE_ASSOCIATIONAL",
  "CAUSAL_HYPOTHESIS",
  "CAUSALLY_IDENTIFIED_WITH_ASSUMPTIONS",
  "EXPERIMENTALLY_IDENTIFIED",
  "NOT_TRANSPORTABLE",
] as const;

export const CPIC_SUBJECT_TYPES = [
  "CORPORATE_GROUP",
  "LEGAL_ENTITY",
  "MERCHANT",
  "BRAND",
  "STOREFRONT",
  "PROVIDER",
  "PROVIDER_PRODUCT",
  "CONTRACT",
  "NEGOTIATION_CASE",
  "MIGRATION",
  "LEAD",
  "OTHER",
] as const;

export const CPIC_IDENTITY_MERGE_STATES = [
  "STABLE",
  "AMBIGUOUS",
  "QUARANTINED",
  "SUPERSEDED",
] as const;

export const CPIC_PREDICTION_TASKS = [
  "REGRESSION",
  "CLASSIFICATION",
  "SURVIVAL",
  "RANKING",
  "FORECAST",
  "CAUSAL",
  "DECISION",
  "SIMULATION",
] as const;

export const CPIC_DISTRIBUTION_REPRESENTATIONS = [
  "PARAMETRIC",
  "EMPIRICAL_SAMPLES",
  "QUANTILES",
  "MIXTURE",
  "DISCRETE",
  "NONE",
] as const;

export const CPIC_INTERVAL_KINDS = [
  "CREDIBLE",
  "PREDICTION",
  "CONFIDENCE",
  "CONFORMAL",
  "BOOTSTRAP",
  "SENSITIVITY",
] as const;

export const CPIC_DECISION_ELIGIBILITY_STATES = [
  "ELIGIBLE",
  "ADVISORY_ONLY",
  "REVIEW_REQUIRED",
  "ABSTAIN",
  "FORBIDDEN",
] as const;

export type CpicTruthState = typeof CPIC_TRUTH_STATES[number];
export type CpicSupportState = typeof CPIC_SUPPORT_STATES[number];
export type JsonRecord = Record<string, unknown>;

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

const nonNegative = (value: unknown): number | null => {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
};

const probability = (value: unknown): number | null => {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : null;
};

const iso = (value: unknown): string | null => {
  const normalized = text(value);
  return normalized && Number.isFinite(Date.parse(normalized))
    ? normalized
    : null;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
      ...new Set(
        value.map(text).filter((item): item is string => Boolean(item)),
      ),
    ]
      .sort()
    : [];

const round = (value: number, digits = 6) => {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

const sortedReasons = (reasons: Iterable<string>) =>
  [...new Set(reasons)].sort();

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const candidate = String(value || "");
  return allowed.includes(candidate) ? candidate as T[number] : fallback;
}

function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (typeof value === "number" && !Number.isFinite(value)) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.keys(value as JsonRecord).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson((value as JsonRecord)[key])}`
  );
  return `{${entries.join(",")}}`;
}

async function sha256Contract(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeSupportHint(value: unknown): CpicSupportState | null {
  const hint = String(value || "").toUpperCase();
  if (hint === "BORDERLINE" || hint === "EDGE_OF_DISTRIBUTION") {
    return "EDGE_OF_SUPPORT";
  }
  if (hint === "UNKNOWN" || hint === "UNKNOWN_SUPPORT") {
    return "UNKNOWN_SUPPORT";
  }
  return CPIC_SUPPORT_STATES.includes(hint as CpicSupportState)
    ? hint as CpicSupportState
    : null;
}

/**
 * Legacy V0 support screen. Counts, dimensions and provider hints can produce
 * a useful heuristic, but they are not a registered OOD detector. Therefore
 * the canonical status stays UNKNOWN_SUPPORT and can never grant authority.
 */
export function assessCpicSupportV0(input: unknown) {
  const value = isRecord(input) ? input : {};
  const reasons = new Set<string>();
  const rawN = nonNegative(value.raw_n);
  const effectiveN = nonNegative(value.effective_n);
  const minimumEffectiveN = nonNegative(value.minimum_effective_n);
  const minimum = minimumEffectiveN === null
    ? 10
    : Math.max(10, minimumEffectiveN);
  const hint = normalizeSupportHint(value.status_hint);
  const dimensions = Array.isArray(value.dimensions)
    ? value.dimensions.filter(isRecord)
    : [];

  if (hint === "OUT_OF_DISTRIBUTION") {
    reasons.add("SOURCE_REPORTED_OUT_OF_DISTRIBUTION");
  }
  if (
    dimensions.some((dimension) =>
      dimension.observed === true && dimension.in_reference_support === false
    )
  ) {
    reasons.add("UNSEEN_DIMENSION_VALUE");
  }
  const incompleteDimensions = dimensions.some((dimension) =>
    dimension.observed !== true ||
    typeof dimension.in_reference_support !== "boolean"
  );
  let heuristicStatus: CpicSupportState;
  if (
    hint === "OUT_OF_DISTRIBUTION" ||
    reasons.has("UNSEEN_DIMENSION_VALUE")
  ) {
    heuristicStatus = "OUT_OF_DISTRIBUTION";
  } else if (rawN === null || effectiveN === null || incompleteDimensions) {
    if (rawN === null) reasons.add("RAW_SAMPLE_SIZE_UNKNOWN");
    if (effectiveN === null) reasons.add("EFFECTIVE_SAMPLE_SIZE_UNKNOWN");
    if (incompleteDimensions) reasons.add("SUPPORT_DIMENSIONS_INCOMPLETE");
    heuristicStatus = "UNKNOWN_SUPPORT";
  } else if (
    rawN < minimum || effectiveN < minimum || hint === "LOW_SUPPORT"
  ) {
    reasons.add("MINIMUM_EFFECTIVE_SUPPORT_NOT_MET");
    heuristicStatus = "LOW_SUPPORT";
  } else if (
    hint === "EDGE_OF_SUPPORT" || rawN < minimum * 2 ||
    effectiveN < minimum * 2
  ) {
    reasons.add("NEAR_MINIMUM_EFFECTIVE_SUPPORT");
    heuristicStatus = "EDGE_OF_SUPPORT";
  } else {
    heuristicStatus = "IN_DISTRIBUTION";
  }

  reasons.add("REGISTERED_SUPPORT_DETECTOR_NOT_RESOLVED");
  if (hint) reasons.add("SOURCE_SUPPORT_HINT_IS_UNVERIFIED_LINEAGE");
  return {
    policy_version: CPIC_CONTRACT_VERSION,
    status: "UNKNOWN_SUPPORT" as CpicSupportState,
    heuristic_status: heuristicStatus,
    source_status_hint: hint,
    semantics: "HEURISTIC_SUPPORT_SCREEN_NOT_REGISTERED_OOD_DETECTOR",
    registered_detector_resolved: false,
    raw_n: rawN,
    effective_n: effectiveN,
    minimum_effective_n: minimum,
    dimensions,
    reason_codes: sortedReasons(reasons),
    automatic_action_allowed: false,
  };
}

function quantileProbability(key: string): number | null {
  const match = /^p(\d{1,3})$/i.exec(key);
  if (!match) return null;
  const percentile = Number(match[1]);
  return Number.isInteger(percentile) && percentile >= 0 && percentile <= 100
    ? percentile / 100
    : null;
}

function normalizeQuantiles(value: unknown) {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, raw]) => {
    const p = quantileProbability(key);
    const amount = finite(raw);
    return p === null || amount === null
      ? []
      : [{ key: key.toLowerCase(), p, value: amount }];
  }).sort((left, right) =>
    left.p - right.p || left.key.localeCompare(right.key)
  );
}

function normalizeThresholdProbabilities(value: unknown) {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([threshold, raw]) => {
    const p = probability(raw);
    return p === null ? [] : [{ threshold, probability: p }];
  }).sort((left, right) => left.threshold.localeCompare(right.threshold));
}

function normalizeUncertaintyComponent(value: unknown) {
  const component = isRecord(value) ? value : {};
  const status = ["ESTIMATED", "BOUNDED", "NOT_ESTIMATED", "NOT_APPLICABLE"]
      .includes(String(component.status || ""))
    ? String(component.status)
    : "NOT_ESTIMATED";
  return {
    status,
    measure: text(component.measure),
    value: finite(component.value),
    lower: finite(component.lower),
    upper: finite(component.upper),
    unit: text(component.unit),
    source_ref: text(component.source_ref),
    reason: text(component.reason) ||
      (status === "NOT_ESTIMATED" ? "NO_DEFENSIBLE_COMPONENT_ESTIMATE" : null),
  };
}

function calibrationContract(input: unknown, methodClass: string) {
  const value = isRecord(input) ? input : {};
  const metrics = isRecord(value.metrics) ? value.metrics : {};
  const evaluationRef = text(value.evaluation_ref);
  const evaluatedAt = iso(value.evaluated_at);
  const evaluationN = nonNegative(value.evaluation_n);
  const modelRegistered = value.model_registered === true;
  const modelApprovalRef = text(value.model_approval_ref);
  const requestedClaim = value.claimed === true;
  const descriptive = methodClass === "ROBUST_DESCRIPTIVE_BASELINE";
  const knownMetric = [
    metrics.brier,
    metrics.ece,
    metrics.slope,
    metrics.intercept,
    metrics.interval_coverage,
  ].some((metric) => finite(metric) !== null);
  const evaluationReferenced = Boolean(
    evaluationRef && evaluatedAt && evaluationN !== null && knownMetric,
  );
  // These values arrived through a data contract. They are lineage, not a
  // server-side registry lookup, so they can never prove calibration.
  const claimAllowed = false;

  return {
    status: descriptive
      ? "NOT_APPLICABLE_DESCRIPTIVE"
      : evaluationReferenced
      ? "UNVERIFIED_EVALUATION_REFERENCE"
      : "NOT_EVALUATED",
    evaluation_ref: evaluationRef,
    evaluated_at: evaluatedAt,
    evaluation_n: evaluationN,
    metrics: {
      brier: finite(metrics.brier),
      ece: finite(metrics.ece),
      slope: finite(metrics.slope),
      intercept: finite(metrics.intercept),
      interval_coverage: finite(metrics.interval_coverage),
    },
    requested_claim: requestedClaim,
    claim_allowed: claimAllowed,
    probabilistic_calibration: false,
    registry_resolution_status: "NOT_RESOLVED",
    source_reported_model_registered: modelRegistered,
    source_reported_model_approval_ref: modelApprovalRef,
    reason_codes: descriptive
      ? ["DESCRIPTIVE_BASELINE_IS_NOT_A_CALIBRATED_PREDICTIVE_MODEL"]
      : requestedClaim || evaluationReferenced || modelRegistered ||
          modelApprovalRef
      ? ["INDEPENDENT_CALIBRATION_REGISTRY_RESOLUTION_REQUIRED"]
      : !evaluationReferenced
      ? ["CALIBRATION_NOT_EVALUATED"]
      : [],
  };
}

/**
 * Builds the canonical distribution-first CPIC envelope. Unknown numeric
 * fields remain null; zero remains a valid observation.
 */
export function buildCpicEstimateV0(input: unknown) {
  const value = isRecord(input) ? input : {};
  const blockers = new Set<string>();
  const warnings = new Set<string>();
  const truthState =
    CPIC_TRUTH_STATES.includes(value.truth_state as CpicTruthState)
      ? value.truth_state as CpicTruthState
      : "UNKNOWN";
  const methodClass = text(value.method_class) || "UNSPECIFIED";
  const quantiles = normalizeQuantiles(value.quantiles);
  const thresholds = normalizeThresholdProbabilities(
    value.threshold_probabilities,
  );
  const support = assessCpicSupportV0(value.support);
  const assumptions = strings(value.assumptions);
  const sourceRefs = strings(value.source_refs);
  const lineageRefs = strings(value.lineage_refs);
  const effectiveAt = iso(value.effective_at);
  const observedAt = iso(value.observed_at);
  const availableAt = iso(value.available_at);
  const predictionTime = iso(value.prediction_time);
  const trainingCutoff = value.training_cutoff === null ||
      value.training_cutoff === undefined || value.training_cutoff === ""
    ? null
    : iso(value.training_cutoff);
  const mean = finite(value.mean);
  const median = finite(value.median);
  const variance = nonNegative(value.variance);
  const intervalInput = isRecord(value.interval) ? value.interval : {};
  const interval = {
    lower: finite(intervalInput.lower),
    upper: finite(intervalInput.upper),
    level: probability(intervalInput.level),
    kind: text(intervalInput.kind),
  };
  const distributionAvailable = quantiles.length >= 2 ||
    (interval.lower !== null && interval.upper !== null) ||
    (mean !== null && variance !== null);

  if (!text(value.estimate_id)) blockers.add("ESTIMATE_ID_REQUIRED");
  if (!text(value.problem_id)) blockers.add("PROBLEM_ID_REQUIRED");
  if (!text(value.subject_ref)) blockers.add("SUBJECT_REF_REQUIRED");
  if (!text(value.unit)) blockers.add("UNIT_REQUIRED");
  if (truthState === "UNKNOWN") blockers.add("TRUTH_STATE_UNKNOWN");
  if (!distributionAvailable) blockers.add("DISTRIBUTION_UNAVAILABLE");
  if (!effectiveAt) blockers.add("EFFECTIVE_TIME_REQUIRED");
  if (!observedAt) blockers.add("OBSERVED_TIME_REQUIRED");
  if (!availableAt) blockers.add("AVAILABLE_TIME_REQUIRED");
  if (!predictionTime) blockers.add("PREDICTION_TIME_REQUIRED");
  if (!sourceRefs.length) blockers.add("SOURCE_PROVENANCE_REQUIRED");
  if (!lineageRefs.length) blockers.add("LINEAGE_REFERENCE_REQUIRED");
  if (!assumptions.length) blockers.add("EXPLICIT_ASSUMPTIONS_REQUIRED");
  if (
    availableAt && predictionTime &&
    Date.parse(availableAt) > Date.parse(predictionTime)
  ) blockers.add("POINT_IN_TIME_LEAKAGE");
  if (
    trainingCutoff && predictionTime &&
    Date.parse(trainingCutoff) > Date.parse(predictionTime)
  ) blockers.add("TRAINING_CUTOFF_AFTER_PREDICTION");
  if (
    interval.lower !== null && interval.upper !== null &&
    interval.lower > interval.upper
  ) blockers.add("INTERVAL_ORDER_INVALID");
  for (let index = 1; index < quantiles.length; index += 1) {
    if (quantiles[index].value < quantiles[index - 1].value) {
      blockers.add("QUANTILE_ORDER_INVALID");
    }
  }
  if (support.status === "OUT_OF_DISTRIBUTION") {
    blockers.add("OUT_OF_DISTRIBUTION");
  }
  if (support.status === "UNKNOWN_SUPPORT") blockers.add("SUPPORT_UNKNOWN");
  if (support.status === "LOW_SUPPORT") blockers.add("SUPPORT_BELOW_MINIMUM");
  if (support.status === "EDGE_OF_SUPPORT") warnings.add("EDGE_OF_SUPPORT");

  const uncertaintyInput = isRecord(value.uncertainty) ? value.uncertainty : {};
  const uncertainty = Object.fromEntries(
    CPIC_UNCERTAINTY_COMPONENTS.map((component) => [
      component,
      normalizeUncertaintyComponent(uncertaintyInput[component]),
    ]),
  );
  const totalUncertainty = normalizeUncertaintyComponent(
    uncertaintyInput.total,
  );
  const componentClaims = Object.values(uncertainty).filter((component: any) =>
    component.status === "ESTIMATED" || component.status === "BOUNDED"
  );
  if (
    componentClaims.some((component: any) =>
      !component.measure || !component.unit || !component.source_ref
    )
  ) blockers.add("UNCERTAINTY_COMPONENT_EVIDENCE_INCOMPLETE");

  const calibration = calibrationContract(value.calibration, methodClass);
  for (const reason of calibration.reason_codes) warnings.add(reason);
  if (calibration.requested_claim && !calibration.claim_allowed) {
    blockers.add("UNSUPPORTED_CALIBRATION_CLAIM");
  }

  const trainedModelClaim = value.trained_model_claim === true;
  const sourceReportedModelRegistered = value.model_registered === true;
  const sourceReportedModelRegistryRef = text(value.model_registry_ref);
  // A boolean/reference supplied in the envelope is never registry authority.
  const trainedModelClaimAccepted = false;
  const bayesianClaimRequested = value.bayesian_claim === true;
  const bayesianEvidenceRefs = strings(value.bayesian_evidence_refs);
  const bayesianClaimAccepted = false;
  if (trainedModelClaim && !trainedModelClaimAccepted) {
    blockers.add("REGISTERED_MODEL_EVIDENCE_MISSING");
  }
  if (bayesianClaimRequested && !bayesianClaimAccepted) {
    blockers.add("UNSUPPORTED_BAYESIAN_CLAIM");
  }

  const strictBlockers = sortedReasons(blockers);
  const advisoryAvailable = strictBlockers.length === 0;
  const materialAutomationAllowed = false;

  return {
    contract_version: CPIC_CONTRACT_VERSION,
    estimate_id: text(value.estimate_id),
    problem_id: text(value.problem_id),
    subject_ref: text(value.subject_ref),
    truth: {
      state: truthState,
      deterministic: value.deterministic === true,
      overrides_inference: value.deterministic === true &&
        ["OBSERVED", "CORROBORATED", "VERIFIED", "REALIZED", "RECONCILED"]
          .includes(truthState),
    },
    provenance: {
      source_refs: sourceRefs,
      lineage_refs: lineageRefs,
      derivation_version: text(value.derivation_version),
      feature_contract_versions: strings(value.feature_contract_versions),
      label_contract_versions: strings(value.label_contract_versions),
      dataset_ref: text(value.dataset_ref),
      model_ref: text(value.model_ref),
    },
    time: {
      effective_at: effectiveAt,
      observed_at: observedAt,
      available_at: availableAt,
      prediction_time: predictionTime,
      training_cutoff: trainingCutoff,
    },
    distribution: {
      available: distributionAvailable,
      kind: text(value.distribution_kind),
      unit: text(value.unit),
      currency: text(value.currency),
      mean,
      median,
      variance,
      quantiles,
      interval,
      threshold_probabilities: thresholds,
      raw_n: support.raw_n,
      effective_n: support.effective_n,
    },
    uncertainty: {
      ...uncertainty,
      total: totalUncertainty,
      decomposition_claimed: componentClaims.length > 0,
      decomposition_supported: componentClaims.length > 0 &&
        !blockers.has("UNCERTAINTY_COMPONENT_EVIDENCE_INCOMPLETE"),
    },
    support,
    calibration,
    method: {
      class: methodClass,
      trained_model_claim_requested: trainedModelClaim,
      trained_model_claim: trainedModelClaimAccepted,
      model_registered: false,
      model_registry_ref: null,
      registry_resolution_status: "NOT_RESOLVED",
      source_reported_model_registered: sourceReportedModelRegistered,
      source_reported_model_registry_ref: sourceReportedModelRegistryRef,
      bayesian_claim_requested: bayesianClaimRequested,
      bayesian_claim: bayesianClaimAccepted,
      bayesian_evidence_refs: bayesianEvidenceRefs,
    },
    assumptions,
    status: advisoryAvailable ? "AVAILABLE_ADVISORY" : "ABSTAIN",
    decision_safety: {
      recommendation: advisoryAvailable ? "ADVISORY_ONLY" : "ABSTAIN",
      presentation_allowed: advisoryAvailable,
      material_automation_allowed: materialAutomationAllowed,
      authority_granted: false,
      billing_eligible: false,
      reason_codes: strictBlockers,
      warnings: sortedReasons(warnings),
    },
  };
}

function normalizeV1Quantiles(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(isRecord).flatMap((item) => {
      const p = probability(item.p);
      const amount = finite(item.value);
      return p === null || amount === null ? [] : [{
        key: text(item.key) || `p${Math.round(p * 100)}`,
        p,
        value: amount,
      }];
    }).sort((left, right) => left.p - right.p);
  }
  return normalizeQuantiles(value);
}

/**
 * Additive V1 semantic envelope. It keeps truth/status/time/subject and
 * distribution dimensions orthogonal. This pure builder performs no registry
 * lookup, so references supplied in the input remain unverified lineage and
 * the result is never eligible for material automation.
 */
export async function buildCpicEstimateV1(input: unknown) {
  const value = isRecord(input) ? input : {};
  const subjectInput = isRecord(value.subject_ref) ? value.subject_ref : {};
  const tenantInput = isRecord(value.tenant_scope) ? value.tenant_scope : {};
  const statusInput = isRecord(value.status_dimensions)
    ? value.status_dimensions
    : {};
  const timeInput = isRecord(value.time) ? value.time : {};
  const distributionInput = isRecord(value.distribution)
    ? value.distribution
    : {};
  const pointInput = isRecord(value.point_summaries)
    ? value.point_summaries
    : {};
  const supportInput = isRecord(value.support) ? value.support : {};
  const errors = new Set<string>();
  const warnings = new Set<string>();

  const estimateId = text(value.estimate_id);
  const traceId = text(value.trace_id);
  const problemId = text(value.problem_id);
  const estimandId = text(value.estimand_id);
  const subjectType = enumValue(
    subjectInput.subject_type,
    CPIC_SUBJECT_TYPES,
    "OTHER",
  );
  const canonicalId = text(subjectInput.canonical_id);
  const identityVersion = text(subjectInput.identity_version);
  const subjectTenantId = text(subjectInput.tenant_id);
  const tenantId = text(tenantInput.tenant_id);
  const subjectScope = text(subjectInput.scope);
  const mergeState = enumValue(
    subjectInput.merge_state,
    CPIC_IDENTITY_MERGE_STATES,
    "QUARANTINED",
  );
  const purpose = text(tenantInput.purpose);
  if (!estimateId) errors.add("ESTIMATE_ID_REQUIRED");
  if (!traceId) errors.add("TRACE_ID_REQUIRED");
  if (!problemId) errors.add("PROBLEM_ID_REQUIRED");
  if (!estimandId) errors.add("ESTIMAND_ID_REQUIRED");
  if (!CPIC_SUBJECT_TYPES.includes(String(subjectInput.subject_type) as any)) {
    errors.add("SUBJECT_TYPE_INVALID");
  }
  if (!canonicalId) errors.add("CANONICAL_SUBJECT_ID_REQUIRED");
  if (!identityVersion) errors.add("IDENTITY_VERSION_REQUIRED");
  if (!subjectTenantId || !tenantId || subjectTenantId !== tenantId) {
    errors.add("TENANT_BINDING_INVALID");
  }
  if (!subjectScope) errors.add("SUBJECT_SCOPE_REQUIRED");
  if (!purpose) errors.add("TENANT_PURPOSE_REQUIRED");
  if (mergeState !== "STABLE") errors.add("SUBJECT_IDENTITY_NOT_STABLE");

  const effectiveTime = iso(timeInput.effective_time);
  const eventTime = iso(timeInput.event_time);
  const observedTime = iso(timeInput.observed_time);
  const ingestedTime = iso(timeInput.ingested_time);
  const availableTime = iso(timeInput.available_time);
  const asOfTime = iso(timeInput.as_of_time);
  const predictionTime = iso(timeInput.prediction_time);
  const trainingCutoff = timeInput.training_cutoff
    ? iso(timeInput.training_cutoff)
    : null;
  const expiresAt = timeInput.expires_at ? iso(timeInput.expires_at) : null;
  for (
    const [time, code] of [
      [effectiveTime, "EFFECTIVE_TIME_REQUIRED"],
      [eventTime, "EVENT_TIME_REQUIRED"],
      [observedTime, "OBSERVED_TIME_REQUIRED"],
      [ingestedTime, "INGESTED_TIME_REQUIRED"],
      [availableTime, "AVAILABLE_TIME_REQUIRED"],
      [asOfTime, "AS_OF_TIME_REQUIRED"],
      [predictionTime, "PREDICTION_TIME_REQUIRED"],
    ] as const
  ) if (!time) errors.add(code);
  if (
    availableTime && predictionTime &&
    Date.parse(availableTime) > Date.parse(predictionTime)
  ) errors.add("POINT_IN_TIME_LEAKAGE");
  if (
    trainingCutoff && predictionTime &&
    Date.parse(trainingCutoff) >= Date.parse(predictionTime)
  ) errors.add("TRAINING_CUTOFF_NOT_BEFORE_PREDICTION");

  let temporalStatus = enumValue(
    statusInput.temporal_status,
    CPIC_TEMPORAL_STATUSES,
    "UNKNOWN_TIME",
  );
  if (!predictionTime) temporalStatus = "UNKNOWN_TIME";
  else if (expiresAt && Date.parse(expiresAt) <= Date.parse(predictionTime)) {
    temporalStatus = "EXPIRED";
  } else if (
    effectiveTime && Date.parse(effectiveTime) > Date.parse(predictionTime)
  ) temporalStatus = "FUTURE_NOT_YET_EFFECTIVE";

  const valueMode = enumValue(
    statusInput.value_mode,
    CPIC_VALUE_MODES,
    "UNKNOWN",
  );
  const verificationStatus = enumValue(
    statusInput.verification_status,
    CPIC_VERIFICATION_STATUSES,
    "NOT_ASSESSED",
  );
  const evidenceStatus = enumValue(
    statusInput.evidence_status,
    CPIC_EVIDENCE_STATUSES,
    "NO_EVIDENCE",
  );
  const sourceSupportStatus = normalizeSupportHint(
    statusInput.support_status || supportInput.status,
  );
  const realizationStatus = enumValue(
    statusInput.realization_status,
    CPIC_REALIZATION_STATUSES,
    "NOT_APPLICABLE",
  );
  const disputeStatus = enumValue(
    statusInput.dispute_status,
    CPIC_DISPUTE_STATUSES,
    "NONE",
  );
  const causalStatus = enumValue(
    statusInput.causal_status,
    CPIC_CAUSAL_STATUSES,
    "DESCRIPTIVE",
  );
  if (
    !CPIC_TEMPORAL_STATUSES.includes(String(statusInput.temporal_status) as any)
  ) errors.add("TEMPORAL_STATUS_INVALID");
  if (!CPIC_VALUE_MODES.includes(String(statusInput.value_mode) as any)) {
    errors.add("VALUE_MODE_INVALID");
  }
  if (
    !CPIC_VERIFICATION_STATUSES.includes(
      String(statusInput.verification_status) as any,
    )
  ) errors.add("VERIFICATION_STATUS_INVALID");
  if (
    !CPIC_EVIDENCE_STATUSES.includes(String(statusInput.evidence_status) as any)
  ) errors.add("EVIDENCE_STATUS_INVALID");
  if (
    !CPIC_REALIZATION_STATUSES.includes(
      String(statusInput.realization_status) as any,
    )
  ) errors.add("REALIZATION_STATUS_INVALID");
  if (
    !CPIC_DISPUTE_STATUSES.includes(String(statusInput.dispute_status) as any)
  ) errors.add("DISPUTE_STATUS_INVALID");
  if (
    !CPIC_CAUSAL_STATUSES.includes(String(statusInput.causal_status) as any)
  ) errors.add("CAUSAL_STATUS_INVALID");
  if (valueMode === "UNKNOWN") errors.add("VALUE_MODE_UNKNOWN");
  if (["QUARANTINED", "CONTRADICTED", "REVOKED"].includes(evidenceStatus)) {
    errors.add(`EVIDENCE_${evidenceStatus}`);
  }
  if (["EXPIRED", "FUTURE_NOT_YET_EFFECTIVE"].includes(temporalStatus)) {
    errors.add(`TEMPORAL_${temporalStatus}`);
  }
  if (["DISPUTED", "UNDER_REVIEW"].includes(disputeStatus)) {
    errors.add(`DISPUTE_${disputeStatus}`);
  }

  const representation = enumValue(
    distributionInput.representation,
    CPIC_DISTRIBUTION_REPRESENTATIONS,
    "NONE",
  );
  const predictionTask = enumValue(
    value.prediction_task,
    CPIC_PREDICTION_TASKS,
    "REGRESSION",
  );
  if (!CPIC_PREDICTION_TASKS.includes(String(value.prediction_task) as any)) {
    errors.add("PREDICTION_TASK_INVALID");
  }
  if (
    !CPIC_DISTRIBUTION_REPRESENTATIONS.includes(
      String(distributionInput.representation) as any,
    )
  ) errors.add("DISTRIBUTION_REPRESENTATION_INVALID");
  const quantiles = normalizeV1Quantiles(distributionInput.quantiles);
  for (let index = 1; index < quantiles.length; index += 1) {
    if (quantiles[index].value < quantiles[index - 1].value) {
      errors.add("QUANTILE_ORDER_INVALID");
    }
  }
  const intervals = Array.isArray(value.intervals)
    ? value.intervals.filter(isRecord).flatMap((interval) => {
      const kind = String(interval.kind || "");
      const level = probability(interval.level);
      const lower = finite(interval.lower);
      const upper = finite(interval.upper);
      if (!CPIC_INTERVAL_KINDS.includes(kind as any)) {
        errors.add("INTERVAL_KIND_INVALID");
        return [];
      }
      if (level === null || lower === null || upper === null || lower > upper) {
        errors.add("INTERVAL_CONTRACT_INVALID");
        return [];
      }
      return [{
        interval_id: text(interval.interval_id),
        kind,
        level,
        lower,
        upper,
        target_quantity: text(interval.target_quantity),
        tail_definition: text(interval.tail_definition),
        coverage_scope: text(interval.coverage_scope),
        method_version: text(interval.method_version),
        observed_coverage_ref: text(interval.observed_coverage_ref),
      }];
    })
    : [];
  const thresholdProbabilities = Array.isArray(value.threshold_probabilities)
    ? value.threshold_probabilities.filter(isRecord).flatMap((threshold) => {
      const p = probability(threshold.probability);
      const amount = finite(threshold.threshold);
      return p === null || amount === null ? [] : [{
        threshold: amount,
        operator: text(threshold.operator),
        probability: p,
        metric: text(threshold.metric),
      }];
    })
    : [];
  if (representation === "NONE") errors.add("DISTRIBUTION_UNAVAILABLE");
  if (representation === "QUANTILES" && quantiles.length < 2) {
    errors.add("QUANTILE_DISTRIBUTION_INCOMPLETE");
  }
  const unit = text(value.unit);
  const nativeCurrency = text(value.native_currency);
  if (!unit) errors.add("UNIT_REQUIRED");
  if (nativeCurrency && !/^[A-Z]{3}$/.test(nativeCurrency)) {
    errors.add("NATIVE_CURRENCY_INVALID");
  }

  const evidenceRefs = strings(value.evidence_refs);
  const claimRefs = strings(value.claim_refs);
  const knownLimitations = strings(value.known_limitations);
  const sourceReportedCalibrated = value.calibrated === true ||
    Boolean(text(value.calibration_artifact_ref));
  if (sourceReportedCalibrated) {
    warnings.add("CALIBRATION_REFERENCE_NOT_REGISTRY_RESOLVED");
  }
  warnings.add("REGISTERED_SUPPORT_DETECTOR_NOT_RESOLVED");
  warnings.add("MODEL_DEPLOYMENT_NOT_REGISTRY_RESOLVED");

  const reasonCodes = sortedReasons(errors);
  const contractWithoutHash = {
    schema_version: CPIC_ESTIMATE_CONTRACT_V1,
    estimate_id: estimateId,
    trace_id: traceId,
    problem_id: problemId,
    estimand_id: estimandId,
    prediction_task: predictionTask,
    subject_ref: {
      subject_type: subjectType,
      canonical_id: canonicalId,
      identity_version: identityVersion,
      tenant_id: subjectTenantId,
      scope: subjectScope,
      merge_state: mergeState,
    },
    tenant_scope: {
      tenant_id: tenantId,
      purpose,
      data_classification: text(tenantInput.data_classification),
      allowed_consumers: strings(tenantInput.allowed_consumers),
      retention_policy_ref: text(tenantInput.retention_policy_ref),
      deletion_behavior: text(tenantInput.deletion_behavior),
    },
    time: {
      effective_time: effectiveTime,
      event_time: eventTime,
      observed_time: observedTime,
      ingested_time: ingestedTime,
      available_time: availableTime,
      as_of_time: asOfTime,
      horizon: text(timeInput.horizon),
      training_cutoff: trainingCutoff,
      prediction_time: predictionTime,
      action_time: iso(timeInput.action_time),
      outcome_window_start: iso(timeInput.outcome_window_start),
      outcome_window_end: iso(timeInput.outcome_window_end),
      label_available_time: iso(timeInput.label_available_time),
      expires_at: expiresAt,
    },
    status_dimensions: {
      value_mode: valueMode,
      verification_status: verificationStatus,
      evidence_status: evidenceStatus,
      temporal_status: temporalStatus,
      support_status: "UNKNOWN_SUPPORT" as CpicSupportState,
      source_reported_support_status: sourceSupportStatus,
      realization_status: realizationStatus,
      dispute_status: disputeStatus,
      causal_status: causalStatus,
    },
    unit,
    native_currency: nativeCurrency,
    normalization_currency: text(value.normalization_currency),
    fx_snapshot_ref: text(value.fx_snapshot_ref),
    point_summaries: {
      mean: finite(pointInput.mean),
      median: finite(pointInput.median),
      mode: finite(pointInput.mode),
      recommended_point: finite(pointInput.recommended_point),
      recommendation_policy_ref: text(pointInput.recommendation_policy_ref),
    },
    distribution: {
      representation,
      family: text(distributionInput.family),
      parameters_ref: text(distributionInput.parameters_ref),
      sample_artifact_ref: text(distributionInput.sample_artifact_ref),
      quantiles,
      mass_at_zero: probability(distributionInput.mass_at_zero),
      truncation: isRecord(distributionInput.truncation)
        ? distributionInput.truncation
        : null,
    },
    intervals,
    threshold_probabilities: thresholdProbabilities,
    support: {
      raw_unique_subject_n: nonNegative(supportInput.raw_unique_subject_n),
      raw_observation_n: nonNegative(supportInput.raw_observation_n),
      weighted_design_n_eff: nonNegative(supportInput.weighted_design_n_eff),
      support_information_n_eff: nonNegative(
        supportInput.support_information_n_eff,
      ),
      posterior_mcmc_ess_bulk: nonNegative(
        supportInput.posterior_mcmc_ess_bulk,
      ),
      posterior_mcmc_ess_tail: nonNegative(
        supportInput.posterior_mcmc_ess_tail,
      ),
      cohort_ref: text(supportInput.cohort_ref),
      support_detector_ref: null,
      unverified_support_detector_ref: text(
        supportInput.support_detector_ref,
      ),
      nearest_support_summary: isRecord(supportInput.nearest_support_summary)
        ? supportInput.nearest_support_summary
        : null,
      registered_detector_resolved: false,
      semantics: "HEURISTIC_OR_SOURCE_REPORTED_SUPPORT_ONLY",
    },
    uncertainty: isRecord(value.uncertainty) ? value.uncertainty : {},
    missingness_assumptions: strings(value.missingness_assumptions),
    measurement_error_assumptions: strings(
      value.measurement_error_assumptions,
    ),
    dependence_assumptions: strings(value.dependence_assumptions),
    constraints: strings(value.constraints),
    known_limitations: knownLimitations,
    evidence_refs: evidenceRefs,
    claim_refs: claimRefs,
    feature_snapshot_ref: text(value.feature_snapshot_ref),
    dataset_ref: text(value.dataset_ref),
    model_artifact_ref: null,
    calibration_artifact_ref: null,
    deployment_ref: null,
    unverified_registry_lineage: {
      model_artifact_ref: text(value.model_artifact_ref),
      calibration_artifact_ref: text(value.calibration_artifact_ref),
      deployment_ref: text(value.deployment_ref),
      source_reported_calibrated: sourceReportedCalibrated,
    },
    registry_resolution: {
      model_artifact_resolved: false,
      calibration_artifact_resolved: false,
      deployment_resolved: false,
      support_detector_resolved: false,
    },
    policy_version: text(value.policy_version),
    contract_status: reasonCodes.length
      ? "INVALID_FAIL_CLOSED"
      : "VALID_CONSERVATIVE",
    decision_eligibility: {
      status: errors.has("TENANT_BINDING_INVALID") ? "FORBIDDEN" : "ABSTAIN",
      reason_codes: sortedReasons([
        ...reasonCodes,
        "REGISTERED_MODEL_DEPLOYMENT_NOT_RESOLVED",
        "REGISTERED_SUPPORT_DETECTOR_NOT_RESOLVED",
      ]),
    },
    authority_granted: false,
    material_automation_allowed: false,
    billing_eligible: false,
    warnings: sortedReasons(warnings),
    created_at: iso(value.created_at) || predictionTime,
  };
  return {
    ...contractWithoutHash,
    content_hash: await sha256Contract(contractWithoutHash),
  };
}

/**
 * Loss-aware compatibility adapter for existing V0 consumers. A legacy mixed
 * truth enum is decomposed, while generic intervals and support hints remain
 * explicitly unverified rather than inheriting probabilistic semantics.
 */
export async function adaptCpicEstimateV0ToV1(
  legacyInput: unknown,
  bindingInput: unknown,
) {
  const legacy = isRecord(legacyInput) ? legacyInput : {};
  const binding = isRecord(bindingInput) ? bindingInput : {};
  const truth = isRecord(legacy.truth) ? legacy.truth : {};
  const provenance = isRecord(legacy.provenance) ? legacy.provenance : {};
  const time = isRecord(legacy.time) ? legacy.time : {};
  const distribution = isRecord(legacy.distribution) ? legacy.distribution : {};
  const support = isRecord(legacy.support) ? legacy.support : {};
  const state = String(truth.state || "UNKNOWN");
  const valueMode = state === "OBSERVED"
    ? "OBSERVED"
    : state === "EXTRACTED_UNVERIFIED"
    ? "EXTRACTED"
    : state === "SIMULATED"
    ? "SIMULATED"
    : state === "PREDICTED"
    ? "PREDICTED"
    : ["INFERRED", "BENCHMARK", "OOD"].includes(state)
    ? "STATISTICALLY_INFERRED"
    : truth.deterministic === true
    ? "DETERMINISTIC_DERIVED"
    : "UNKNOWN";
  const verificationStatus = state === "CORROBORATED"
    ? "CORROBORATED"
    : state === "VERIFIED" || state === "REALIZED"
    ? "VERIFIED"
    : state === "RECONCILED"
    ? "RECONCILED"
    : state === "CONTRADICTED"
    ? "REJECTED"
    : "UNVERIFIED";
  const legacyQuantiles = Array.isArray(distribution.quantiles)
    ? distribution.quantiles
    : [];
  const representation = legacyQuantiles.length >= 2
    ? "QUANTILES"
    : finite(distribution.mean) !== null &&
        finite(distribution.variance) !== null
    ? "PARAMETRIC"
    : "NONE";
  const sourceRefs = strings(provenance.source_refs);
  return buildCpicEstimateV1({
    estimate_id: legacy.estimate_id,
    trace_id: binding.trace_id || legacy.estimate_id,
    problem_id: legacy.problem_id,
    estimand_id: binding.estimand_id || legacy.problem_id,
    prediction_task: state === "SIMULATED" ? "SIMULATION" : "REGRESSION",
    subject_ref: binding.subject_ref,
    tenant_scope: binding.tenant_scope,
    time: {
      effective_time: time.effective_at,
      event_time: time.observed_at,
      observed_time: time.observed_at,
      ingested_time: binding.ingested_time || time.available_at,
      available_time: time.available_at,
      as_of_time: binding.as_of_time || time.prediction_time,
      horizon: binding.horizon,
      training_cutoff: time.training_cutoff,
      prediction_time: time.prediction_time,
      expires_at: binding.expires_at,
    },
    status_dimensions: {
      value_mode: valueMode,
      verification_status: verificationStatus,
      evidence_status: state === "CONTRADICTED"
        ? "CONTRADICTED"
        : sourceRefs.length
        ? "PARTIAL"
        : "NO_EVIDENCE",
      temporal_status: state === "STALE" ? "STALE" : "CURRENT",
      support_status: support.heuristic_status || support.status,
      realization_status: state === "REALIZED"
        ? "REALIZED"
        : state === "RECONCILED"
        ? "RECONCILED"
        : "NOT_APPLICABLE",
      dispute_status: state === "CONTRADICTED" ? "DISPUTED" : "NONE",
      causal_status: ["INFERRED", "PREDICTED"].includes(state)
        ? "PREDICTIVE_ASSOCIATIONAL"
        : "DESCRIPTIVE",
    },
    unit: distribution.unit,
    native_currency: distribution.currency,
    point_summaries: {
      mean: distribution.mean,
      median: distribution.median,
    },
    distribution: {
      representation,
      family: representation === "PARAMETRIC"
        ? "LEGACY_UNSPECIFIED_PARAMETRIC"
        : null,
      quantiles: legacyQuantiles,
    },
    intervals: [],
    threshold_probabilities: Array.isArray(
        distribution.threshold_probabilities,
      )
      ? distribution.threshold_probabilities.flatMap((item: any) => {
        const match = /-?\d+(?:\.\d+)?/.exec(String(item.threshold || ""));
        return match
          ? [{
            threshold: Number(match[0]),
            operator: "LEGACY_UNSPECIFIED",
            probability: item.probability,
            metric: String(item.threshold || "LEGACY_THRESHOLD"),
          }]
          : [];
      })
      : [],
    support: {
      raw_observation_n: distribution.raw_n,
      support_information_n_eff: distribution.effective_n,
      support_detector_ref: null,
    },
    uncertainty: legacy.uncertainty,
    known_limitations: [
      "V0 mixed truth state was decomposed by a conservative adapter.",
      "V0 generic interval is retained only in legacy lineage, not promoted to a typed V1 interval.",
      "V0 support classification is heuristic; no registered detector was resolved.",
    ],
    evidence_refs: sourceRefs,
    claim_refs: [],
    dataset_ref: provenance.dataset_ref,
    model_artifact_ref: provenance.model_ref,
    calibration_artifact_ref: isRecord(legacy.calibration)
      ? legacy.calibration.evaluation_ref
      : null,
    deployment_ref: binding.deployment_ref,
    policy_version: binding.policy_version || CPIC_CONTRACT_VERSION,
    created_at: binding.created_at || time.prediction_time,
  });
}

/** Verified/observed deterministic facts always dominate an estimate. */
export function resolveCpicTruthV0(input: unknown) {
  const value = isRecord(input) ? input : {};
  const deterministic = isRecord(value.deterministic)
    ? value.deterministic
    : {};
  const estimate = isRecord(value.estimate) ? value.estimate : {};
  const deterministicValue = deterministic.value === null ||
      deterministic.value === undefined || deterministic.value === ""
    ? null
    : deterministic.value;
  const deterministicState = String(deterministic.truth_state || "UNKNOWN");
  const authoritative = deterministicValue !== null &&
    ["OBSERVED", "CORROBORATED", "VERIFIED", "REALIZED", "RECONCILED"]
      .includes(deterministicState);
  if (authoritative) {
    return {
      selected: "DETERMINISTIC",
      value: deterministicValue,
      truth_state: deterministicState,
      source_ref: text(deterministic.source_ref),
      estimate_retained_for_lineage: Object.keys(estimate).length > 0,
      inference_overrode_truth: false,
      reason_codes: ["DETERMINISTIC_TRUTH_PRECEDENCE"],
    };
  }
  const estimateValue =
    estimate.value === null || estimate.value === undefined ||
      estimate.value === ""
      ? null
      : estimate.value;
  return estimateValue === null
    ? {
      selected: "NONE",
      value: null,
      truth_state: "UNKNOWN",
      source_ref: null,
      estimate_retained_for_lineage: false,
      inference_overrode_truth: false,
      reason_codes: ["NO_OBSERVED_OR_INFERRED_VALUE"],
    }
    : {
      selected: "ESTIMATE_ADVISORY",
      value: estimateValue,
      truth_state: String(estimate.truth_state || "INFERRED"),
      source_ref: text(estimate.source_ref),
      estimate_retained_for_lineage: true,
      inference_overrode_truth: false,
      reason_codes: ["DETERMINISTIC_TRUTH_UNAVAILABLE"],
    };
}

function abstainedCalculation(version: string, reasons: Iterable<string>) {
  return {
    version,
    status: "ABSTAIN",
    reason_codes: sortedReasons(reasons),
    authority_granted: false,
    billing_eligible: false,
  };
}

/**
 * Deterministic weighted-scenario expected utility. Probabilities are supplied
 * as explicit joint-scenario assumptions; this function never manufactures a
 * joint probability by multiplying marginals.
 */
export function computeExpectedValueV0(input: unknown) {
  const value = isRecord(input) ? input : {};
  const errors = new Set<string>();
  const assumptions = strings(value.assumptions);
  const sourceRefs = strings(value.source_refs);
  const options = Array.isArray(value.options)
    ? value.options.filter(isRecord)
    : [];
  const utilityUnit = text(value.utility_unit);
  if (!text(value.decision_id)) errors.add("DECISION_ID_REQUIRED");
  if (!utilityUnit) errors.add("UTILITY_UNIT_REQUIRED");
  if (!assumptions.length) errors.add("EXPLICIT_ASSUMPTIONS_REQUIRED");
  if (!sourceRefs.length) errors.add("SOURCE_PROVENANCE_REQUIRED");
  if (!options.length) errors.add("OPTIONS_REQUIRED");

  const evaluated = options.flatMap((option) => {
    const action = text(option.action);
    const outcomes = Array.isArray(option.outcomes)
      ? option.outcomes.filter(isRecord)
      : [];
    const directCost = nonNegative(option.direct_cost_utility);
    if (!action) errors.add("OPTION_ACTION_REQUIRED");
    if (directCost === null) {
      errors.add(`DIRECT_COST_REQUIRED:${action || "UNKNOWN"}`);
    }
    if (!outcomes.length) {
      errors.add(`OUTCOMES_REQUIRED:${action || "UNKNOWN"}`);
    }
    let probabilitySum = 0;
    let expected = 0;
    for (const outcome of outcomes) {
      const p = probability(outcome.probability);
      const utility = finite(outcome.utility);
      if (!text(outcome.outcome_id)) {
        errors.add(`OUTCOME_ID_REQUIRED:${action || "UNKNOWN"}`);
      }
      if (p === null) {
        errors.add(`OUTCOME_PROBABILITY_INVALID:${action || "UNKNOWN"}`);
      }
      if (utility === null) {
        errors.add(`OUTCOME_UTILITY_INVALID:${action || "UNKNOWN"}`);
      }
      if (p !== null && utility !== null) {
        probabilitySum += p;
        expected += p * utility;
      }
    }
    if (Math.abs(probabilitySum - 1) > 1e-9) {
      errors.add(
        `JOINT_SCENARIO_PROBABILITIES_MUST_SUM_TO_ONE:${action || "UNKNOWN"}`,
      );
    }
    return action
      ? [{
        action,
        expected_utility_before_direct_cost: round(expected),
        direct_cost_utility: directCost,
        expected_net_utility: directCost === null
          ? null
          : round(expected - directCost),
        scenario_probability_sum: round(probabilitySum, 9),
      }]
      : [];
  });
  if (errors.size) {
    return abstainedCalculation(CPIC_EXPECTED_VALUE_VERSION, errors);
  }
  const ranking = [...evaluated].sort((left, right) =>
    Number(right.expected_net_utility) - Number(left.expected_net_utility) ||
    left.action.localeCompare(right.action)
  );
  return {
    version: CPIC_EXPECTED_VALUE_VERSION,
    status: "SIMULATED_ADVISORY",
    truth_state: "SIMULATED",
    decision_id: text(value.decision_id),
    utility_unit: utilityUnit,
    assumptions,
    source_refs: sourceRefs,
    options: evaluated,
    selected_action_advisory: ranking[0]?.action || null,
    selected_expected_net_utility: ranking[0]?.expected_net_utility ?? null,
    probability_semantics: "EXPLICIT_JOINT_SCENARIOS_NOT_MULTIPLIED_MARGINALS",
    authority_granted: false,
    billing_eligible: false,
    reason_codes: ["EXPECTED_VALUE_IS_SIMULATED_NOT_REALIZED"],
  };
}

/**
 * Deterministic perfect/partial-information approximation V0:
 * EVI = E[best utility after research] - current best utility - all acquisition
 * costs. Inputs are explicit assumptions, not learned or calibrated values.
 */
export function computeValueOfInformationV0(input: unknown) {
  const value = isRecord(input) ? input : {};
  const errors = new Set<string>();
  const currentOptions = Array.isArray(value.current_options)
    ? value.current_options.filter(isRecord)
    : [];
  const outcomes = Array.isArray(value.research_outcomes)
    ? value.research_outcomes.filter(isRecord)
    : [];
  const assumptions = strings(value.assumptions);
  const sourceRefs = strings(value.source_refs);
  const successProbability = probability(value.source_success_probability);
  const expectedUncertaintyReduction = probability(
    value.expected_uncertainty_reduction,
  );
  const costs = isRecord(value.acquisition_costs)
    ? value.acquisition_costs
    : {};
  const controls = isRecord(value.controls) ? value.controls : {};
  const costKeys = ["api", "llm", "latency", "privacy_compliance", "other"];
  if (!text(value.research_action)) errors.add("RESEARCH_ACTION_REQUIRED");
  if (!text(value.utility_unit)) errors.add("UTILITY_UNIT_REQUIRED");
  if (!assumptions.length) errors.add("EXPLICIT_ASSUMPTIONS_REQUIRED");
  if (!sourceRefs.length) errors.add("SOURCE_PROVENANCE_REQUIRED");
  if (!currentOptions.length) errors.add("CURRENT_OPTIONS_REQUIRED");
  if (!outcomes.length) errors.add("RESEARCH_OUTCOMES_REQUIRED");
  if (successProbability === null) {
    errors.add("SOURCE_SUCCESS_PROBABILITY_REQUIRED");
  }
  if (expectedUncertaintyReduction === null) {
    errors.add("EXPECTED_UNCERTAINTY_REDUCTION_REQUIRED");
  }
  if (typeof controls.privacy_allowed !== "boolean") {
    errors.add("PRIVACY_CONTROL_REQUIRED");
  }
  if (typeof controls.budget_authorized !== "boolean") {
    errors.add("BUDGET_CONTROL_REQUIRED");
  }

  const current = currentOptions.flatMap((option) => {
    const action = text(option.action);
    const utility = finite(option.expected_utility);
    if (!action) errors.add("CURRENT_ACTION_REQUIRED");
    if (utility === null) {
      errors.add(`CURRENT_EXPECTED_UTILITY_REQUIRED:${action || "UNKNOWN"}`);
    }
    return action && utility !== null ? [{ action, utility }] : [];
  }).sort((left, right) =>
    right.utility - left.utility || left.action.localeCompare(right.action)
  );
  const currentBest = current[0] || null;

  let outcomeProbabilitySum = 0;
  let expectedAfterSuccess = 0;
  let conditionalActionChangeProbability = 0;
  for (const outcome of outcomes) {
    const p = probability(outcome.probability);
    const utility = finite(outcome.best_expected_utility_after);
    const action = text(outcome.best_action_after);
    if (!text(outcome.outcome_id)) errors.add("RESEARCH_OUTCOME_ID_REQUIRED");
    if (p === null) errors.add("RESEARCH_OUTCOME_PROBABILITY_INVALID");
    if (utility === null) errors.add("RESEARCH_OUTCOME_UTILITY_INVALID");
    if (!action) errors.add("RESEARCH_OUTCOME_ACTION_REQUIRED");
    if (p !== null && utility !== null) {
      outcomeProbabilitySum += p;
      expectedAfterSuccess += p * utility;
      if (currentBest && action !== currentBest.action) {
        conditionalActionChangeProbability += p;
      }
    }
  }
  if (Math.abs(outcomeProbabilitySum - 1) > 1e-9) {
    errors.add("RESEARCH_OUTCOME_PROBABILITIES_MUST_SUM_TO_ONE");
  }

  let totalCost = 0;
  for (const key of costKeys) {
    const cost = nonNegative(costs[key]);
    if (cost === null) errors.add(`ACQUISITION_COST_REQUIRED:${key}`);
    else totalCost += cost;
  }
  if (errors.size || !currentBest || successProbability === null) {
    return abstainedCalculation(CPIC_VALUE_OF_INFORMATION_VERSION, errors);
  }

  const expectedAfter = successProbability * expectedAfterSuccess +
    (1 - successProbability) * currentBest.utility;
  const grossEvi = expectedAfter - currentBest.utility;
  const netEvi = grossEvi - totalCost;
  const minimumNet = nonNegative(value.minimum_net_information_value) ?? 0;
  const policyBlocked = controls.privacy_allowed !== true ||
    controls.budget_authorized !== true;
  const recommendation = policyBlocked
    ? "BLOCKED_BY_POLICY"
    : netEvi > minimumNet
    ? "ACQUIRE_INFORMATION_ADVISORY"
    : "DO_NOT_ACQUIRE";

  return {
    version: CPIC_VALUE_OF_INFORMATION_VERSION,
    status: "SIMULATED_ADVISORY",
    truth_state: "SIMULATED",
    research_action: text(value.research_action),
    utility_unit: text(value.utility_unit),
    current_best_action: currentBest.action,
    current_best_expected_utility: currentBest.utility,
    source_success_probability: successProbability,
    expected_uncertainty_reduction: expectedUncertaintyReduction,
    expected_best_utility_after_research: round(expectedAfter),
    gross_expected_information_value: round(grossEvi),
    total_acquisition_cost: round(totalCost),
    net_expected_information_value: round(netEvi),
    minimum_net_information_value: minimumNet,
    action_change_probability: round(
      successProbability * conditionalActionChangeProbability,
    ),
    costs: Object.fromEntries(
      costKeys.map((key) => [key, nonNegative(costs[key])]),
    ),
    assumptions,
    source_refs: sourceRefs,
    controls: {
      privacy_allowed: controls.privacy_allowed,
      budget_authorized: controls.budget_authorized,
    },
    recommendation,
    authority_granted: false,
    execution_requested: false,
    probabilistic_calibration: false,
    predicted_information_value: true,
    realized_information_value: null,
    reason_codes: policyBlocked
      ? ["RESEARCH_POLICY_OR_BUDGET_BLOCKED"]
      : netEvi > minimumNet
      ? ["POSITIVE_NET_EXPECTED_INFORMATION_VALUE"]
      : ["NON_POSITIVE_NET_EXPECTED_INFORMATION_VALUE"],
  };
}

/**
 * Adapts the existing external P4 response into the common contract. External
 * model/calibration strings are retained as lineage only and never treated as
 * local registry or calibration proof.
 */
export function adaptP4ServiceEstimateToCpicV0(
  estimate: unknown,
  context: unknown,
) {
  const value = isRecord(estimate) ? estimate : {};
  const adapter = isRecord(context) ? context : {};
  const interval = isRecord(value.interval) ? value.interval : {};
  const support = isRecord(value.support) ? value.support : {};
  const ood = isRecord(value.ood) ? value.ood : {};
  const target = isRecord(value.target) ? value.target : {};
  return buildCpicEstimateV0({
    estimate_id: value.estimate_id,
    problem_id: adapter.problem_id || value.target_spec_id,
    subject_ref: adapter.subject_ref || value.target_spec_id,
    truth_state: "PREDICTED",
    deterministic: false,
    distribution_kind: "EXTERNAL_P4_STATISTICAL_OUTPUT",
    unit: adapter.unit || value.unit || target.unit,
    currency: adapter.currency || value.currency || target.currency,
    mean: value.mean,
    median: value.median,
    variance: value.variance,
    quantiles: value.quantiles,
    interval: {
      lower: interval.lower,
      upper: interval.upper,
      level: interval.level,
      kind: interval.kind || "EXTERNAL_UNVERIFIED_INTERVAL",
    },
    threshold_probabilities: value.threshold_probabilities,
    support: {
      raw_n: support.unique_merchants ?? support.raw_n,
      effective_n: support.n_eff ?? support.effective_n,
      minimum_effective_n: 10,
      status_hint: ood.status,
      dimensions: Array.isArray(adapter.support_dimensions) &&
          adapter.support_dimensions.length
        ? adapter.support_dimensions
        : [{
          name: "external_support_dimensions",
          observed: false,
          in_reference_support: null,
        }],
    },
    uncertainty: {
      aleatoric: {
        status: "NOT_ESTIMATED",
        reason: "P4_RESPONSE_DOES_NOT_PROVE_ALEATORIC_DECOMPOSITION",
      },
      epistemic: {
        status: "NOT_ESTIMATED",
        reason: "P4_RESPONSE_DOES_NOT_PROVE_EPISTEMIC_DECOMPOSITION",
      },
      model: {
        status: "NOT_ESTIMATED",
        reason: "LOCAL_MODEL_REGISTRY_EVIDENCE_MISSING",
      },
      data: {
        status: "NOT_ESTIMATED",
        reason: "SAMPLE_SUPPORT_IS_REPORTED_SEPARATELY",
      },
      total: {
        status: interval.lower !== undefined && interval.upper !== undefined
          ? "BOUNDED"
          : "NOT_ESTIMATED",
        measure: interval.lower !== undefined && interval.upper !== undefined
          ? "external_interval"
          : null,
        lower: interval.lower,
        upper: interval.upper,
        unit: adapter.unit || value.unit || target.unit,
        source_ref: value.lineage_hash,
      },
    },
    calibration: {
      claimed: interval.calibrated === true || value.calibrated === true,
      evaluation_ref: value.calibration_ref,
      evaluated_at: value.calibration_evaluated_at,
      evaluation_n: value.calibration_evaluation_n,
      metrics: value.calibration_metrics,
      model_registered: false,
      model_approval_ref: null,
    },
    method_class: "EXTERNAL_STATISTICAL_ARTIFACT",
    trained_model_claim: true,
    model_registered: false,
    model_registry_ref: null,
    model_ref: value.model_version_id,
    dataset_ref: value.dataset_id,
    derivation_version: value.model_version_id,
    effective_at: value.as_of,
    observed_at: value.as_of,
    available_at: adapter.available_at,
    prediction_time: adapter.prediction_time,
    training_cutoff: value.training_cutoff,
    source_refs: [
      `P4StatisticalEstimate:${String(value.estimate_id || "UNKNOWN")}`,
      ...strings(adapter.source_refs),
    ],
    lineage_refs: [value.lineage_hash].filter(Boolean),
    assumptions: [
      "P4 output is statistical evidence and never P3 verified rate truth.",
      "External model and calibration claims are not locally registry-verified.",
      ...strings(adapter.assumptions),
    ],
  });
}
