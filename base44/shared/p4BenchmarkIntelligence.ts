// P4 repository-native statistical benchmark policy.
// Merchant pseudonyms are used only for distinct-count/deduplication and are
// never returned from this module. Public/retained outputs require k >= 10.

import { P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS } from "./intelligenceCore.ts";
import { buildCpicEstimateV0 } from "./cpicFoundation.ts";

export const P4_BENCHMARK_POLICY_VERSION = "p4-benchmark-policy-1.0.0";
// Compatibility alias: P4 derivation and P12 access share one privacy floor.
export const P4_MIN_DISTINCT_MERCHANTS = P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS;
export const P4_OUTLIER_POLICY = "tukey-iqr-1.5-v1";

export function percentile(sortedValues: number[], q: number): number | null {
  if (!sortedValues.length) return null;
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return sortedValues[lower + 1] === undefined
    ? sortedValues[lower]
    : sortedValues[lower] +
      fraction * (sortedValues[lower + 1] - sortedValues[lower]);
}

function timestamp(row: any): number {
  const value = Date.parse(
    row?.known_at || row?.created_date || row?.updated_date || row?.month ||
      "1970-01-01",
  );
  return Number.isFinite(value) ? value : 0;
}

function preferredMerchantObservation(rows: any[]): any | null {
  const verified = rows.filter((row) =>
    row?.contribution_source === "verified"
  );
  const eligible = verified.length ? verified : rows;
  return [...eligible].sort((a, b) =>
    timestamp(b) - timestamp(a) ||
    String(a?.contribution_hash || "").localeCompare(
      String(b?.contribution_hash || ""),
    )
  )[0] || null;
}

export function benchmarkGroupKey(row: any): string {
  return [row?.cohort_key, row?.metric_key, row?.month].map((value) =>
    String(value || "")
  ).join("::");
}

export function groupBenchmarkContributions(rows: any[]): Map<string, any[]> {
  const groups = new Map<string, any[]>();
  for (const row of rows || []) {
    if (
      !row?.validated || row?.flagged || !row?.cohort_key || !row?.metric_key ||
      !row?.month
    ) continue;
    const key = benchmarkGroupKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

export function deriveBenchmarkCohort(
  rows: any[],
  options: { minimumDistinctMerchants?: number } = {},
) {
  const requestedMinimum = Number(options.minimumDistinctMerchants);
  const minimum = Math.max(
    P4_MIN_DISTINCT_MERCHANTS,
    Number.isFinite(requestedMinimum)
      ? requestedMinimum
      : P4_MIN_DISTINCT_MERCHANTS,
  );
  const byMerchant = new Map<string, any[]>();
  for (const row of rows || []) {
    if (!row?.validated || row?.flagged) continue;
    const merchant = String(row?.source_anon_id || "");
    const value = Number(row?.metric_value);
    if (!merchant || !Number.isFinite(value)) continue;
    byMerchant.set(merchant, [...(byMerchant.get(merchant) || []), row]);
  }

  const selected = [...byMerchant.values()].map(preferredMerchantObservation)
    .filter(Boolean);
  const rawValues = selected.map((row) => Number(row.metric_value)).sort((
    a,
    b,
  ) => a - b);
  const rawDistinctMerchants = rawValues.length;
  const q1 = percentile(rawValues, .25);
  const q3 = percentile(rawValues, .75);
  const iqr = q1 == null || q3 == null ? 0 : q3 - q1;
  const lower = iqr > 0 && q1 !== null ? q1 - 1.5 * iqr : -Infinity;
  const upper = iqr > 0 && q3 !== null ? q3 + 1.5 * iqr : Infinity;
  const values = rawValues.filter((value) => value >= lower && value <= upper);
  const excludedOutliers = rawValues.length - values.length;
  const sampleSize = values.length;
  const sufficient = sampleSize >= minimum;
  const average = sufficient
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  const variance = sufficient && average !== null
    ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length
    : null;
  const sourceCounts = selected.reduce(
    (counts: Record<string, number>, row: any) => {
      const key = String(row?.contribution_source || "estimated");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    },
    {},
  );

  return {
    status: sufficient ? "AVAILABLE" : "INSUFFICIENT_DATA",
    isPublic: sufficient,
    sampleSize,
    rawDistinctMerchants,
    minimumDistinctMerchants: minimum,
    insufficientDataReason: sufficient
      ? null
      : "MINIMUM_DISTINCT_MERCHANT_THRESHOLD_NOT_MET",
    median: sufficient ? percentile(values, .5) : null,
    p25: sufficient ? percentile(values, .25) : null,
    p75: sufficient ? percentile(values, .75) : null,
    p10: sufficient ? percentile(values, .1) : null,
    p90: sufficient ? percentile(values, .9) : null,
    minimum: sufficient ? values[0] : null,
    maximum: sufficient ? values[values.length - 1] : null,
    average,
    variance,
    effectiveSampleSize: sampleSize,
    sourceCounts,
    excludedOutliers,
    outlierPolicy: P4_OUTLIER_POLICY,
    derivationVersion: P4_BENCHMARK_POLICY_VERSION,
    confidence: !sufficient
      ? "INSUFFICIENT"
      : sampleSize >= 40
      ? "HIGH"
      : sampleSize >= 20
      ? "MEDIUM"
      : "LOW",
    supportStatus: !sufficient
      ? "LOW_SUPPORT"
      : sampleSize >= minimum * 2
      ? "IN_DISTRIBUTION"
      : "EDGE_OF_SUPPORT",
    methodologyClass: "ROBUST_DESCRIPTIVE_BASELINE",
    confidenceSemantics: "SAMPLE_SIZE_BAND_NOT_PROBABILISTIC_CONFIDENCE",
    probabilisticCalibration: false,
    calibrationStatus: "NOT_APPLICABLE_DESCRIPTIVE",
  };
}

function latestKnownAt(rows: any[]): string | null {
  const values = (rows || []).map((row) =>
    row?.known_at || row?.created_date || row?.updated_date
  )
    .filter((value) => Number.isFinite(Date.parse(String(value))))
    .map(String).sort((left, right) => Date.parse(right) - Date.parse(left));
  return values[0] || null;
}

function monthEffectiveAt(value: unknown): string | null {
  const month = String(value || "");
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const candidate = `${month}-01T00:00:00.000Z`;
  return Number.isFinite(Date.parse(candidate)) ? candidate : null;
}

/**
 * P4 descriptive cohort → common CPIC contract. This is a baseline adapter,
 * not a trained/Bayesian model and not a calibration claim.
 */
export function adaptP4BenchmarkCohortToCpicV0(rows: any[], options: any = {}) {
  const eligibleRows = (rows || []).filter((row) =>
    row?.validated && !row?.flagged
  );
  const groupKeys = [...new Set(eligibleRows.map(benchmarkGroupKey))].filter(
    Boolean,
  );
  const derived = deriveBenchmarkCohort(rows, {
    minimumDistinctMerchants: options.minimumDistinctMerchants,
  });
  const first = eligibleRows[0] || {};
  const cohortRef = String(options.cohortRef || "").trim() || null;
  const mixedCohorts = groupKeys.length !== 1;
  const availableAt = options.availableAt || latestKnownAt(eligibleRows);
  const effectiveAt = options.effectiveAt || monthEffectiveAt(first.month);
  const sourceRefs = cohortRef ? [`P4BenchmarkCohort:${cohortRef}`] : [];
  const lineageRefs = cohortRef && !mixedCohorts
    ? [
      String(
        options.lineageRef ||
          `${cohortRef}:${first.metric_key || "UNKNOWN"}:${
            first.month || "UNKNOWN"
          }:${P4_BENCHMARK_POLICY_VERSION}`,
      ),
    ]
    : [];

  return buildCpicEstimateV0({
    estimate_id: options.estimateId ||
      (cohortRef ? `p4-baseline:${cohortRef}` : null),
    problem_id: options.problemId || first.metric_key,
    subject_ref: options.subjectRef || cohortRef,
    truth_state: "BENCHMARK",
    deterministic: false,
    distribution_kind: "EMPIRICAL_ROBUST_COHORT_QUANTILES",
    unit: options.unit,
    currency: options.currency,
    mean: mixedCohorts ? null : derived.average,
    median: mixedCohorts ? null : derived.median,
    variance: mixedCohorts ? null : derived.variance,
    quantiles: mixedCohorts || !derived.isPublic ? {} : {
      p10: derived.p10,
      p25: derived.p25,
      p50: derived.median,
      p75: derived.p75,
      p90: derived.p90,
    },
    support: {
      raw_n: mixedCohorts ? null : derived.rawDistinctMerchants,
      effective_n: mixedCohorts ? null : derived.effectiveSampleSize,
      minimum_effective_n: derived.minimumDistinctMerchants,
      status_hint: mixedCohorts ? "UNKNOWN_SUPPORT" : derived.supportStatus,
      dimensions: Array.isArray(options.supportDimensions) &&
          options.supportDimensions.length
        ? options.supportDimensions
        : [
          {
            name: "cohort_key",
            observed: Boolean(first.cohort_key),
            in_reference_support: Boolean(first.cohort_key),
          },
          {
            name: "metric_key",
            observed: Boolean(first.metric_key),
            in_reference_support: Boolean(first.metric_key),
          },
          {
            name: "month",
            observed: Boolean(first.month),
            in_reference_support: Boolean(first.month),
          },
        ],
    },
    uncertainty: {
      aleatoric: {
        status: "NOT_ESTIMATED",
        reason: "DESCRIPTIVE_COHORT_DOES_NOT_DECOMPOSE_ALEATORIC_UNCERTAINTY",
      },
      epistemic: {
        status: "NOT_ESTIMATED",
        reason: "DESCRIPTIVE_COHORT_DOES_NOT_DECOMPOSE_EPISTEMIC_UNCERTAINTY",
      },
      model: { status: "NOT_APPLICABLE", reason: "NO_TRAINED_MODEL" },
      data: {
        status: "NOT_ESTIMATED",
        reason: "SAMPLE_SUPPORT_IS_REPORTED_SEPARATELY",
      },
      total: {
        status: "NOT_ESTIMATED",
        reason: "EMPIRICAL_SPREAD_IS_NOT_A_CALIBRATED_UNCERTAINTY_INTERVAL",
      },
    },
    calibration: { claimed: false },
    method_class: "ROBUST_DESCRIPTIVE_BASELINE",
    trained_model_claim: false,
    model_registered: false,
    model_registry_ref: null,
    derivation_version: P4_BENCHMARK_POLICY_VERSION,
    effective_at: effectiveAt,
    observed_at: options.observedAt || availableAt,
    available_at: availableAt,
    prediction_time: options.predictionTime,
    training_cutoff: null,
    source_refs: sourceRefs,
    lineage_refs: lineageRefs,
    assumptions: [
      "One preferred contribution per distinct merchant.",
      `Outliers handled by ${P4_OUTLIER_POLICY}.`,
      "Empirical cohort quantiles are descriptive and not probabilistically calibrated.",
      ...(Array.isArray(options.assumptions) ? options.assumptions : []),
    ],
  });
}
