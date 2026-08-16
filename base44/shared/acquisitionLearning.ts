import { ACQUISITION_ADVISORY_LABEL_CONTRACT } from "./adaptiveLeadLearning.ts";

export type Outcome =
  | "reply"
  | "positive_reply"
  | "meeting"
  | "won"
  | "verified_savings";

const OUTCOME_WEIGHTS: Record<Outcome, number> = {
  reply: 0.08,
  positive_reply: 0.18,
  meeting: 0.32,
  won: 0.55,
  verified_savings: 1,
};

/**
 * Contact/title context is a post-company-gate dimension. It can segment an
 * already outreach-worthy queue; it must never change company pre-fit.
 */
export function contactContextEligible(lead: any): boolean {
  return ["ready", "queued", "contacted", "converted"].includes(
    String(lead?.reservoir_state || ""),
  ) || ["outreach_ready", "contacted", "engaged", "won"].includes(
    String(lead?.revenue_stage || ""),
  ) ||
    [
      "outreach_ready",
      "waiting_window",
      "waiting_capacity",
      "contacted",
      "meeting",
      "won",
    ]
      .includes(String(lead?.stage || ""));
}

function roleFamily(lead: any): string {
  if (!contactContextEligible(lead)) return "pre_contact_not_available";
  const title = String(lead?.contact_title || "").toLowerCase();
  if (/cfo|finance|payments/.test(title)) return "finance";
  if (/founder|ceo/.test(title)) return "founder_exec";
  if (/ecommerce|commerce/.test(title)) return "commerce";
  return "other";
}

export function cohortKey(lead: any) {
  const breakdown = lead?.score_breakdown_json || {};
  const signals = breakdown.signals || {};
  return [
    String(lead?.country || "unknown").toLowerCase(),
    String(lead?.industry || "unknown").toLowerCase(),
    signals.commerce_platform || "unknown",
    signals.payment_provider || "unknown",
    roleFamily(lead),
  ].join("|");
}

export function outcomeValue(outcome: Outcome, verifiedSavings = 0) {
  const base = OUTCOME_WEIGHTS[outcome] || 0;
  return outcome === "verified_savings"
    ? Math.min(2, base + Math.log10(1 + Math.max(0, verifiedSavings)) / 10)
    : base;
}

/**
 * Legacy cohorts are neutral. Only cohorts rebuilt under the explicit
 * exposure/maturity contract may influence ordering, and even then the
 * adjustment remains a bounded advisory (never probability or training).
 */
export function boundedLearningMultiplier(stats: any) {
  if (
    stats?.label_contract_version !==
      ACQUISITION_ADVISORY_LABEL_CONTRACT.label_version ||
    stats?.methodology_class !==
      ACQUISITION_ADVISORY_LABEL_CONTRACT.methodology_class ||
    stats?.training_eligible !== false ||
    stats?.probabilistic_calibration !== false
  ) return 1;
  const n = Number(stats?.eligible_sample_size ?? stats?.sample_size ?? 0);
  if (n < 20) return 1;
  const rate = Number(stats?.mean_outcome_value || 0);
  const shrink = n / (n + 100);
  return Number(
    Math.max(.85, Math.min(1.15, 1 + (rate - 0.2) * 0.35 * shrink)).toFixed(4),
  );
}

export function learnedPriority(
  opportunity: number,
  confidence: number,
  stats: any,
) {
  return opportunity * confidence * boundedLearningMultiplier(stats);
}
