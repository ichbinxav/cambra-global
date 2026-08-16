// Cross-engine learning boundary: aggregate verified outcomes only.
// It never returns row identifiers, tenant identifiers or raw observations.
import {
  observedFiniteNumber,
  P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS,
} from "./intelligenceCore.ts";
import { validateStoredIntelligenceRecord } from "./intelligenceTenantScope.ts";
import {
  canonicalOutcomeCurrency,
  completeEntityReadCoverage,
  latestVerifiedOutcomeAggregateSnapshots,
  UNKNOWN_OUTCOME_CURRENCY,
} from "./privacySafeIntelligence.ts";

export const MIN_OUTCOME_CALIBRATION_COHORT =
  P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS;
export const OUTCOME_ADVISORY_HEURISTIC_VERSION =
  "outcome-advisory-heuristic-v1.0.0";
// Compatibility export/function name for existing callers. This is not a
// statistical or probabilistic calibration model.
export const OUTCOME_CALIBRATION_VERSION = OUTCOME_ADVISORY_HEURISTIC_VERSION;

const canonicalCurrency = (value: any) => {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) && currency !== "XXX"
    ? currency
    : "UNKNOWN";
};

const time = (value: any) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : -1;
};

function collapseLatestMerchantOutcome(rows: any[]) {
  const latest = new Map<string, any>();
  for (const row of rows) {
    const merchant = String(row?.brand_id || "").trim();
    if (!merchant) continue;
    const current = latest.get(merchant);
    const rowOrder = [
      time(row.captured_at),
      time(row.updated_date),
      time(row.created_date),
      String(row.outcome_key || row.id || ""),
    ];
    const currentOrder = current
      ? [
        time(current.captured_at),
        time(current.updated_date),
        time(current.created_date),
        String(current.outcome_key || current.id || ""),
      ]
      : null;
    if (
      !currentOrder || rowOrder[0] > currentOrder[0] ||
      rowOrder[0] === currentOrder[0] && (
          rowOrder[1] > currentOrder[1] || rowOrder[1] === currentOrder[1] && (
              rowOrder[2] > currentOrder[2] ||
              rowOrder[2] === currentOrder[2] && rowOrder[3] > currentOrder[3]
            )
        )
    ) latest.set(merchant, row);
  }
  return [...latest.values()];
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function buildOutcomeCalibration(
  rows: any[],
  options?: { currency?: string },
) {
  const requestedRaw = String(options?.currency || "").trim();
  const requestedCurrency = requestedRaw ? canonicalCurrency(requestedRaw) : "";
  const valid = (Array.isArray(rows) ? rows : []).filter((row: any) =>
    row?.is_demo !== true &&
    row?.quarantined !== true &&
    validateStoredIntelligenceRecord(row, "outcome").ok &&
    String(row?.brand_id || "").trim() !== ""
  );
  const currencies = new Set(
    valid.map((row: any) => canonicalCurrency(row?.currency)),
  );
  const invalidRequestedCurrency = requestedRaw &&
    requestedCurrency === "UNKNOWN";
  const currency = requestedCurrency ||
    (currencies.size === 1 ? [...currencies][0] : "");
  const mixedOrUnknownCurrency = invalidRequestedCurrency || !currency ||
    currency === "UNKNOWN" || (!requestedCurrency && currencies.size !== 1);
  const sameCurrency = mixedOrUnknownCurrency
    ? []
    : valid.filter((row: any) => canonicalCurrency(row?.currency) === currency);
  // Collapse history before deciding metric availability. A newer UNKNOWN
  // financial observation supersedes an older known one for that merchant and
  // cannot silently resurrect it into the aggregate.
  const declared = collapseLatestMerchantOutcome(sameCurrency);
  const eligible = declared.filter((row: any) =>
    observedFiniteNumber(row?.realized_savings) !== null
  );
  const distinctMerchants = new Set(
    eligible.map((row: any) => String(row.brand_id)),
  );
  if (
    distinctMerchants.size < MIN_OUTCOME_CALIBRATION_COHORT ||
    mixedOrUnknownCurrency
  ) {
    return {
      version: OUTCOME_CALIBRATION_VERSION,
      methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
      probabilistic_calibration: false,
      suppressed: true,
      n: distinctMerchants.size,
      observation_count: eligible.length,
      minimum_cohort: MIN_OUTCOME_CALIBRATION_COHORT,
      aggregate: null,
      suppression_reason: mixedOrUnknownCurrency
        ? "KNOWN_SINGLE_CURRENCY_COHORT_REQUIRED"
        : "MINIMUM_DISTINCT_MERCHANT_THRESHOLD_NOT_MET",
      truth_note:
        "No advisory signal is available. The descriptive aggregate heuristic is suppressed; no raw records, identifiers, probability, target, public provider rate or guarantee are returned.",
    };
  }
  const realized = eligible.map((row: any) =>
    observedFiniteNumber(row.realized_savings) as number
  );
  const confidenceEligible = eligible.filter((row: any) =>
    observedFiniteNumber(row.confidence_after) !== null
  );
  const confidenceMerchants = new Set(
    confidenceEligible.map((row: any) => String(row.brand_id)),
  );
  const confidence = confidenceEligible.map((row: any) =>
    observedFiniteNumber(row.confidence_after) as number
  );
  const successEligible = eligible.filter((row: any) =>
    typeof row.success === "boolean"
  );
  const successMerchants = new Set(
    successEligible.map((row: any) => String(row.brand_id)),
  );
  const negativeEligible = eligible.filter((row: any) =>
    row.negative_knowledge === true || typeof row.success === "boolean"
  );
  const negativeMerchants = new Set(
    negativeEligible.map((row: any) => String(row.brand_id)),
  );
  return {
    version: OUTCOME_CALIBRATION_VERSION,
    methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
    probabilistic_calibration: false,
    suppressed: false,
    n: distinctMerchants.size,
    observation_count: eligible.length,
    observation_selection: "latest_declared_observation_per_distinct_merchant",
    minimum_cohort: MIN_OUTCOME_CALIBRATION_COHORT,
    aggregate: {
      currency,
      median_realized_savings: Number(median(realized).toFixed(2)),
      success_rate: successMerchants.size >= MIN_OUTCOME_CALIBRATION_COHORT
        ? Number(
          (successEligible.filter((row: any) => row.success === true).length /
            successEligible.length).toFixed(4),
        )
        : null,
      negative_outcome_rate:
        negativeMerchants.size >= MIN_OUTCOME_CALIBRATION_COHORT
          ? Number(
            (negativeEligible.filter((row: any) =>
              row.negative_knowledge === true || row.success === false
            ).length / negativeEligible.length).toFixed(4),
          )
          : null,
      median_confidence_after:
        confidenceMerchants.size >= MIN_OUTCOME_CALIBRATION_COHORT
          ? Number(median(confidence).toFixed(4))
          : null,
    },
    truth_note:
      "Private descriptive aggregate heuristic for advisory context only. It is not statistically or probabilistically calibrated. It is not a public provider rate, a negotiation target, a promise, or authority to accept terms. No merchant or outcome identifiers are returned.",
  };
}

export function buildPrivacySafeOutcomeCalibration(
  rows: any[],
  options: {
    currency?: string;
    provider_id?: string;
    as_of?: string;
    source_coverage?: any;
  } = {},
) {
  const currency = canonicalOutcomeCurrency(options.currency);
  const provider = String(options.provider_id || "").trim().toLowerCase();
  const asOf = String(options.as_of || "").trim();
  const coverage = options.source_coverage;
  const suppressed = (reason: string) => ({
    version: OUTCOME_CALIBRATION_VERSION,
    methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
    probabilistic_calibration: false,
    suppressed: true,
    n: 0,
    observation_count: 0,
    minimum_cohort: MIN_OUTCOME_CALIBRATION_COHORT,
    aggregate: null,
    suppression_reason: reason,
    source_coverage: coverage || null,
    truth_note:
      "No advisory signal is available. Only a complete, privacy-safe, same-provider, same-native-currency k>=10 aggregate may be consumed; raw tenant outcomes are forbidden.",
  });
  if (
    !completeEntityReadCoverage(
      coverage,
      "AnonymizedIntelligenceAggregate",
    )
  ) return suppressed("SOURCE_COVERAGE_INCOMPLETE");
  if (!provider) return suppressed("PROVIDER_REQUIRED");
  if (currency === UNKNOWN_OUTCOME_CURRENCY) {
    return suppressed("KNOWN_SINGLE_CURRENCY_COHORT_REQUIRED");
  }
  if (!asOf || time(asOf) < 0) return suppressed("VALID_AS_OF_REQUIRED");
  const candidates = latestVerifiedOutcomeAggregateSnapshots(rows, asOf)
    .filter((row: any) =>
      row.vertical === "payments" && row.provider_bucket === provider &&
      row.currency === currency
    ).sort((a: any, b: any) =>
      b.last_verified_at_ms - a.last_verified_at_ms ||
      String(b.aggregate_ref).localeCompare(String(a.aggregate_ref))
    );
  const selected = candidates[0] || null;
  if (!selected) return suppressed("NO_PRIVACY_SAFE_PROVIDER_CURRENCY_COHORT");
  return {
    version: OUTCOME_CALIBRATION_VERSION,
    methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
    probabilistic_calibration: false,
    suppressed: false,
    n: selected.sample_size,
    observation_count: selected.sample_size,
    observation_selection:
      "privacy_safe_latest_snapshot_one_declared_observation_per_distinct_merchant",
    minimum_cohort: MIN_OUTCOME_CALIBRATION_COHORT,
    aggregate: {
      currency,
      median_realized_savings: selected.median_realized_savings,
      mean_expected_savings: selected.mean_expected_savings,
      success_rate: selected.success_rate_pct === null
        ? null
        : Number((selected.success_rate_pct / 100).toFixed(4)),
      negative_outcome_rate: null,
      median_confidence_after: null,
      financial_values_converted: false,
      financial_value_unit: `native_currency:${currency}`,
    },
    aggregate_refs: [selected.aggregate_ref].filter(Boolean),
    source_coverage: coverage,
    truth_note:
      "Private descriptive privacy-safe aggregate heuristic for advisory context only. It is not statistically or probabilistically calibrated, a public provider rate, a negotiation target, a promise, or authority to accept terms.",
  };
}
