/**
 * Adaptive Lead P0 learning boundary.
 *
 * This module deliberately produces a bounded, selected-population advisory
 * label. It is not a training label, a probability model or causal evidence.
 * UNKNOWN/PENDING rows never enter a negative denominator.
 */

export const ACQUISITION_ADVISORY_LABEL_CONTRACT = Object.freeze({
  label_name: "merchant_acquisition_progression_advisory",
  label_version: "merchant-acquisition-progression-advisory-v1.0.0",
  decision_supported:
    "bounded ordering among already-eligible outbound candidates",
  eligible_population:
    "scored candidates with a confirmed outbound send exposure",
  prediction_time: "before governed outbound send",
  exposure_required:
    "CommunicationThread.last_outbound_at from the canonical send path",
  observation_window_days: 30,
  positive_definition:
    "a post-exposure inbound reply, positive reply, completed meeting, deterministically attributed win, or verified savings",
  negative_definition:
    "confirmed outbound exposure with no qualifying post-exposure progression after the full 30-day observation window",
  missing_outcome: "PENDING_OR_CENSORED_EXCLUDE",
  methodology_class: "DESCRIPTIVE_SELECTED_POPULATION_ADVISORY",
  probabilistic_calibration: false,
  training_eligible: false,
  causal_claim: false,
});

export const VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT = Object.freeze({
  method: "exact_lead_thread_exposure_report_lineage",
  version: "verified-savings-attribution-v1.0.0",
  accepted_state: "EXACT",
  required_lineage: [
    "lead_id",
    "thread_id",
    "exposure_at",
    "brand_id",
    "onboarding_observed_at",
    "deal_activation_id",
    "deal_activated_at",
    "monthly_savings_report_id",
  ],
  temporal_rule:
    "specific MonthlySavingsReport verified observation at-or-after exact outbound exposure, durable merchant onboarding observation and exact deal activation",
  ambiguous_or_missing: "OMIT_ECONOMIC_LABEL",
  causal_claim: false,
  training_eligible: false,
});

export const OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT = Object.freeze({
  ...ACQUISITION_ADVISORY_LABEL_CONTRACT,
  label_name: "outreach_variant_progression_advisory",
  label_version: "outreach-variant-progression-advisory-v1.0.0",
  decision_supported:
    "bounded variant choice inside an already-authorized outreach policy",
  eligible_population:
    "experiment-assigned threads with a confirmed outbound send exposure",
});

export type AcquisitionLearningEligibility =
  | "INELIGIBLE"
  | "PENDING_EXECUTION"
  | "PENDING_OUTCOME"
  | "PENDING_LABEL_MATURITY"
  | "ELIGIBLE_AGGREGATE_ONLY";

export type AcquisitionProgressionOutcome =
  | "reply"
  | "positive_reply"
  | "meeting"
  | "won"
  | "verified_savings";

export interface VerifiedSavingsEvidence {
  amount: number;
  observed_at?: string | null;
  report_id?: string | null;
  deal_activation_id?: string | null;
  brand_id?: string | null;
}

const ISO_MILLISECONDS_PER_DAY = 86_400_000;

function parseTime(value: unknown): number | null {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function atOrAfter(value: unknown, lowerBound: number): boolean {
  const parsed = parseTime(value);
  return parsed !== null && parsed >= lowerBound;
}

function classificationOf(thread: any): string {
  return String(thread?.classification || "").trim().toLowerCase();
}

function positiveProgression(
  lead: any,
  thread: any,
  attribution: any,
  verifiedSavings: VerifiedSavingsEvidence | null,
  exposureAt: number,
) {
  const outcomes: AcquisitionProgressionOutcome[] = [];
  const inboundAfterExposure = atOrAfter(thread?.last_inbound_at, exposureAt);
  const classification = classificationOf(thread);

  if (inboundAfterExposure) outcomes.push("reply");
  if (
    inboundAfterExposure && ["interested", "meeting"].includes(classification)
  ) {
    outcomes.push("positive_reply");
  }

  const completedMeetingAfterExposure =
    String(thread?.meeting_status || "") === "completed" &&
    (atOrAfter(thread?.meeting_outcome_captured_at, exposureAt) ||
      atOrAfter(thread?.meeting_end_at, exposureAt));
  if (completedMeetingAfterExposure) outcomes.push("meeting");

  const attributedAfterExposure =
    Boolean(attribution?.id || attribution?.lead_id) &&
    String(attribution?.lead_id || lead?.id || "") === String(lead?.id || "") &&
    atOrAfter(attribution?.attributed_at, exposureAt);
  // Commercial progression and economic attribution are separate truths.
  // An ambiguous/missing savings report must not erase a reply, meeting or
  // deterministically linked won state for this exact lead/thread.
  const commercialThreadLineage = Boolean(attribution?.thread_id) &&
    String(attribution.thread_id) === String(thread?.id || "");
  if (
    attributedAfterExposure && commercialThreadLineage &&
    String(lead?.stage || "") === "won"
  ) {
    outcomes.push("won");
  }

  const verifiedAmount = Number(verifiedSavings?.amount);
  const attributionState = String(
    attribution?.attribution_state || "",
  ).toUpperCase();
  const exactReportRef = String(attribution?.monthly_savings_report_id || "");
  const exactDealRef = String(attribution?.deal_activation_id || "");
  const sameReport = Boolean(
    exactReportRef && verifiedSavings?.report_id &&
      exactReportRef === String(verifiedSavings.report_id),
  );
  const sameDeal = Boolean(
    exactDealRef && verifiedSavings?.deal_activation_id &&
      exactDealRef === String(verifiedSavings.deal_activation_id),
  );
  const sameBrand = Boolean(
    attribution?.brand_id && verifiedSavings?.brand_id &&
      String(attribution.brand_id) === String(verifiedSavings.brand_id),
  );
  const attributionReportObservedAt = parseTime(
    attribution?.report_observed_at,
  );
  const savingsObservedAt = parseTime(verifiedSavings?.observed_at);
  const sameReportObservation = attributionReportObservedAt !== null &&
    savingsObservedAt !== null &&
    attributionReportObservedAt === savingsObservedAt;
  const exactEconomicLineage = attributionState === "EXACT" &&
    attribution?.economic_attribution_eligible === true &&
    attribution?.attribution_method ===
      VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.method &&
    attribution?.attribution_method_version ===
      VERIFIED_SAVINGS_ATTRIBUTION_CONTRACT.version &&
    sameReport && sameDeal && sameBrand && sameReportObservation &&
    String(attribution?.thread_id || "") === String(thread?.id || "") &&
    String(attribution?.exposure_at || "") ===
      String(thread?.last_outbound_at || "");
  const onboardingObservedAt = parseTime(
    attribution?.onboarding_observed_at,
  );
  const dealActivatedAt = parseTime(attribution?.deal_activated_at);
  const verifiedObservedAt = savingsObservedAt;
  const verifiedAfterRequiredLineage = verifiedObservedAt !== null &&
    onboardingObservedAt !== null && dealActivatedAt !== null &&
    verifiedObservedAt >= exposureAt &&
    verifiedObservedAt >= onboardingObservedAt &&
    verifiedObservedAt >= dealActivatedAt;
  if (
    attributedAfterExposure && exactEconomicLineage && verifiedAmount > 0 &&
    verifiedAfterRequiredLineage
  ) {
    outcomes.push("verified_savings");
  }

  return [...new Set(outcomes)];
}

export function verifiedSavingsAttributionEligibility(
  lead: any,
  thread: any,
  attribution: any,
  verifiedSavings: VerifiedSavingsEvidence | null,
) {
  const exposureMs = parseTime(thread?.last_outbound_at);
  if (exposureMs === null) {
    return { eligible: false, reason: "CONFIRMED_EXPOSURE_REQUIRED" };
  }
  const outcome = positiveProgression(
    lead,
    thread,
    attribution,
    verifiedSavings,
    exposureMs,
  );
  return outcome.includes("verified_savings")
    ? {
      eligible: true,
      reason: "EXACT_POST_EXPOSURE_ONBOARDING_REPORT_LINEAGE",
      report_id: verifiedSavings?.report_id || null,
      amount: Number(verifiedSavings?.amount),
    }
    : {
      eligible: false,
      reason: "EXACT_POST_EXPOSURE_ONBOARDING_REPORT_LINEAGE_REQUIRED",
    };
}

export function evaluateAcquisitionLearningEligibility(
  input: {
    lead: any;
    thread?: any | null;
    attribution?: any | null;
    verified_savings?: VerifiedSavingsEvidence | null;
  },
  at = new Date(),
) {
  const lead = input?.lead || null;
  const thread = input?.thread || null;
  const contract = ACQUISITION_ADVISORY_LABEL_CONTRACT;
  const base = {
    label_contract_version: contract.label_version,
    methodology_class: contract.methodology_class,
    probabilistic_calibration: false,
    training_eligible: false,
    selected_population: "CONFIRMED_OUTBOUND_EXPOSURE_ONLY",
    actual_exposure: false,
    exposure_at: null as string | null,
    matures_at: null as string | null,
    outcomes: [] as AcquisitionProgressionOutcome[],
    positive: false,
    negative: false,
    censored: false,
    reason_codes: [] as string[],
  };

  if (!lead?.score_breakdown_json?.scoring_version) {
    return {
      ...base,
      status: "INELIGIBLE" as AcquisitionLearningEligibility,
      reason_codes: ["POINT_IN_TIME_SCORE_SNAPSHOT_REQUIRED"],
    };
  }

  const exposureMs = parseTime(thread?.last_outbound_at);
  if (exposureMs === null || exposureMs > at.getTime()) {
    return {
      ...base,
      status: "PENDING_EXECUTION" as AcquisitionLearningEligibility,
      reason_codes: ["CONFIRMED_OUTBOUND_SEND_REQUIRED"],
    };
  }

  const maturesMs = exposureMs +
    contract.observation_window_days * ISO_MILLISECONDS_PER_DAY;
  const exposure = {
    actual_exposure: true,
    exposure_at: new Date(exposureMs).toISOString(),
    matures_at: new Date(maturesMs).toISOString(),
  };
  const outcomes = positiveProgression(
    lead,
    thread,
    input?.attribution,
    input?.verified_savings || null,
    exposureMs,
  );

  // A real positive event is observed; waiting to manufacture a symmetric
  // negative would only delay already-observed truth.
  if (outcomes.length) {
    return {
      ...base,
      ...exposure,
      status: "ELIGIBLE_AGGREGATE_ONLY" as AcquisitionLearningEligibility,
      outcomes,
      positive: true,
      reason_codes: ["POST_EXPOSURE_PROGRESS_OBSERVED"],
    };
  }

  if (at.getTime() < maturesMs) {
    return {
      ...base,
      ...exposure,
      status: "PENDING_LABEL_MATURITY" as AcquisitionLearningEligibility,
      reason_codes: ["OBSERVATION_WINDOW_OPEN"],
    };
  }

  // Only a confirmed send whose complete response horizon has elapsed can
  // become a bounded negative for this exact reply/progression endpoint.
  return {
    ...base,
    ...exposure,
    status: "ELIGIBLE_AGGREGATE_ONLY" as AcquisitionLearningEligibility,
    negative: true,
    reason_codes: ["NO_PROGRESS_AFTER_MATURE_CONFIRMED_EXPOSURE"],
  };
}

export function acquisitionAdvisoryEligible(value: any): boolean {
  return value?.status === "ELIGIBLE_AGGREGATE_ONLY" &&
    value?.label_contract_version ===
      ACQUISITION_ADVISORY_LABEL_CONTRACT.label_version &&
    value?.methodology_class ===
      ACQUISITION_ADVISORY_LABEL_CONTRACT.methodology_class &&
    value?.training_eligible === false;
}

export function evaluateOutreachExperimentEligibility(
  input: { thread?: any | null; subject?: any | null },
  at = new Date(),
) {
  const thread = input?.thread || null;
  const subject = input?.subject || null;
  const contract = OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT;
  const base = {
    label_contract_version: contract.label_version,
    methodology_class: contract.methodology_class,
    probabilistic_calibration: false,
    training_eligible: false,
    selected_population: "CONFIRMED_OUTBOUND_EXPOSURE_ONLY",
    actual_exposure: false,
    exposure_at: null as string | null,
    matures_at: null as string | null,
    outcomes: [] as AcquisitionProgressionOutcome[],
    positive: false,
    negative: false,
    reason_codes: [] as string[],
  };
  const exposureMs = parseTime(thread?.last_outbound_at);
  if (exposureMs === null || exposureMs > at.getTime()) {
    return {
      ...base,
      status: "PENDING_EXECUTION" as AcquisitionLearningEligibility,
      reason_codes: ["CONFIRMED_OUTBOUND_SEND_REQUIRED"],
    };
  }
  const maturesMs = exposureMs +
    contract.observation_window_days * ISO_MILLISECONDS_PER_DAY;
  const exposure = {
    actual_exposure: true,
    exposure_at: new Date(exposureMs).toISOString(),
    matures_at: new Date(maturesMs).toISOString(),
  };
  // Variant evaluation has no right to infer economic attribution. It uses
  // only post-send reply/positive-reply/completed-meeting observations.
  const outcomes = positiveProgression(
    { ...subject, id: subject?.id || thread?.related_entity_id || "" },
    thread,
    null,
    null,
    exposureMs,
  ).filter((outcome) =>
    ["reply", "positive_reply", "meeting"].includes(outcome)
  );
  if (outcomes.length) {
    return {
      ...base,
      ...exposure,
      status: "ELIGIBLE_AGGREGATE_ONLY" as AcquisitionLearningEligibility,
      outcomes,
      positive: true,
      reason_codes: ["POST_EXPOSURE_PROGRESS_OBSERVED"],
    };
  }
  if (at.getTime() < maturesMs) {
    return {
      ...base,
      ...exposure,
      status: "PENDING_LABEL_MATURITY" as AcquisitionLearningEligibility,
      reason_codes: ["OBSERVATION_WINDOW_OPEN"],
    };
  }
  return {
    ...base,
    ...exposure,
    status: "ELIGIBLE_AGGREGATE_ONLY" as AcquisitionLearningEligibility,
    negative: true,
    reason_codes: ["NO_PROGRESS_AFTER_MATURE_CONFIRMED_EXPOSURE"],
  };
}

export function outreachExperimentAdvisoryEligible(value: any): boolean {
  return value?.status === "ELIGIBLE_AGGREGATE_ONLY" &&
    value?.label_contract_version ===
      OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.label_version &&
    value?.methodology_class ===
      OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.methodology_class &&
    value?.training_eligible === false;
}
