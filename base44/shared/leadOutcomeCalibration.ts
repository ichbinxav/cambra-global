import {
  canonicalOutcomeCurrency,
  latestVerifiedOutcomeAggregateSnapshots,
  safeVerifiedOutcomeAggregate,
  UNKNOWN_OUTCOME_CURRENCY,
} from "./privacySafeIntelligence.ts";

export const LEAD_OUTCOME_ADVISORY_HEURISTIC_VERSION =
  "lead-outcome-advisory-heuristic-1.2.0";
// Compatibility export/function name. The signal is a bounded descriptive
// heuristic, not a probability estimate or a statistically calibrated model.
export const LEAD_OUTCOME_CALIBRATION_VERSION =
  LEAD_OUTCOME_ADVISORY_HEURISTIC_VERSION;

function textSet(values: any[]) {
  return new Set(
    values.map((x) => String(x || "").trim().toLowerCase()).filter(Boolean),
  );
}

function leadProviders(lead: any) {
  return textSet([
    ...(Array.isArray(lead?.probable_payment_stack)
      ? lead.probable_payment_stack
      : []),
    lead?.enrichment_json?.payment_provider,
    lead?.source_evidence_json?.payment_provider,
  ]);
}

function leadCurrency(lead: any) {
  const explicit = [
    lead?.currency,
    lead?.source_evidence_json?.currency,
    lead?.enrichment_json?.currency,
  ].map(canonicalOutcomeCurrency).find((value) =>
    value !== UNKNOWN_OUTCOME_CURRENCY
  );
  if (explicit) return explicit;
  const hasExplicitEurEstimate = [
    lead?.estimated_tpv_min_eur,
    lead?.estimated_tpv_max_eur,
    lead?.estimated_opportunity_min_eur,
    lead?.estimated_opportunity_max_eur,
  ].some((value) => typeof value === "number" && Number.isFinite(value));
  return hasExplicitEurEstimate ? "EUR" : null;
}

function instantMs(raw: any) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(value) ? value : null;
}

// Periods are cohort labels, not availability timestamps. Their start must not
// be in the future, while last_verified_at proves when the aggregate was
// actually available to the scorer.
function periodStartMs(raw: any) {
  const value = String(raw || "").trim();
  let match = value.match(/^(\d{4})-Q([1-4])$/i);
  if (match) {
    return Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1);
  }
  match = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (match) return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
  match = value.match(/^(\d{4})$/);
  if (match) return Date.UTC(Number(match[1]), 0, 1);
  return instantMs(value);
}

function temporalOptions(input: any) {
  const raw = input && typeof input === "object"
    ? input.as_of ?? input.prediction_time
    : input;
  const ms = instantMs(raw);
  return ms === null ? null : { ms, iso: new Date(ms).toISOString() };
}

export function safeLeadOutcomeAggregate(row: any) {
  const aggregate = safeVerifiedOutcomeAggregate(row);
  if (!aggregate) return null;
  const success = aggregate.success_rate_pct;
  const period = aggregate.period;
  const periodStart = periodStartMs(period);
  if (
    success === null || success < 0 || success > 100 ||
    periodStart === null
  ) return null;
  return {
    ...aggregate,
    success_rate_pct: success,
    period_start_ms: periodStart,
  };
}

function boundedAdjustment(success: number) {
  if (success >= 70) return 3;
  if (success >= 55) return 1;
  if (success < 30) return -3;
  if (success < 45) return -1;
  return 0;
}

function unavailable(reason: string, asOf: string | null = null) {
  return {
    methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
    probabilistic_calibration: false,
    applied: false,
    adjustment: 0,
    reason,
    version: LEAD_OUTCOME_CALIBRATION_VERSION,
    aggregate_refs: [],
    sample_size: 0,
    as_of: asOf,
    temporal_filter: "period_start_and_last_verified_at_lte_prediction_time",
  };
}

export function leadOutcomeCalibration(
  lead: any,
  rows: any[],
  asOfOrOptions: any,
) {
  const asOf = temporalOptions(asOfOrOptions);
  if (!asOf) return unavailable("valid_prediction_time_required");
  const providers = leadProviders(lead);
  if (!providers.size) {
    return unavailable("provider_evidence_required", asOf.iso);
  }

  const latestSnapshots = latestVerifiedOutcomeAggregateSnapshots(rows);
  const providerCandidates = latestSnapshots
    .map((row: any) =>
      safeLeadOutcomeAggregate({
        aggregate_key: row.aggregate_ref,
        aggregate_series_key: row.aggregate_series_ref,
        aggregate_snapshot_version: row.aggregate_snapshot_version,
        aggregate_type: "verified_outcomes",
        vertical: row.vertical,
        provider_bucket: row.provider_bucket,
        currency_bucket: row.currency,
        period: row.period,
        sample_size: row.sample_size,
        reidentification_mapping_retained: false,
        last_verified_at: new Date(row.last_verified_at_ms).toISOString(),
        metrics_json: {
          kind: "verified_outcomes",
          aggregate_snapshot_version: row.aggregate_snapshot_version,
          vertical: row.vertical,
          provider_bucket: row.provider_bucket,
          currency: row.currency,
          period: row.period,
          sample_size: row.sample_size,
          success_rate_pct: row.success_rate_pct,
          median_realized_savings: row.median_realized_savings,
          mean_expected_savings: row.mean_expected_savings,
          observation_selection:
            "latest_declared_observation_per_distinct_merchant_cohort",
          distinct_merchant_denominators: true,
          financial_values_converted: false,
          financial_value_unit: `native_currency:${row.currency}`,
          source_coverage: row.source_coverage,
          generated_at: new Date(row.generated_at_ms).toISOString(),
        },
      })
    )
    .filter(Boolean)
    .filter((row: any) =>
      row.vertical === "payments" && providers.has(row.provider_bucket)
    );
  const pointInTimeCandidates = providerCandidates.filter((row: any) =>
    row.period_start_ms <= asOf.ms && row.last_verified_at_ms <= asOf.ms
  );
  const requestedCurrency = leadCurrency(lead);
  const currencies = new Set(
    pointInTimeCandidates.map((row: any) => row.currency),
  );
  if (!requestedCurrency && currencies.size > 1) {
    return unavailable(
      "lead_currency_required_for_multi_currency_outcomes",
      asOf.iso,
    );
  }
  const resolvedCurrency = requestedCurrency || [...currencies][0] || null;
  const currencyCandidates = pointInTimeCandidates.filter((row: any) =>
    resolvedCurrency && row.currency === resolvedCurrency
  );
  // Do not add repeated quarterly merchant cohorts as if their sample counts
  // were independent. The latest complete provider/currency cohort is the
  // conservative advisory input.
  const candidates = currencyCandidates.sort((a: any, b: any) =>
    b.period_start_ms - a.period_start_ms ||
    b.last_verified_at_ms - a.last_verified_at_ms
  ).slice(0, 1);
  if (!candidates.length) {
    return unavailable(
      pointInTimeCandidates.length && resolvedCurrency
        ? "no_matching_currency_provider_outcome_cohort"
        : providerCandidates.length
        ? "no_point_in_time_eligible_provider_outcome_cohort"
        : "no_privacy_safe_provider_outcome_cohort",
      asOf.iso,
    );
  }

  const total = candidates.reduce(
    (sum: number, row: any) => sum + row.sample_size,
    0,
  );
  const success = candidates.reduce(
    (sum: number, row: any) => sum + row.success_rate_pct * row.sample_size,
    0,
  ) / total;
  const adjustment = boundedAdjustment(success);
  return {
    methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
    probabilistic_calibration: false,
    applied: true,
    adjustment,
    reason: "privacy_safe_verified_outcome_heuristic_advisory",
    version: LEAD_OUTCOME_CALIBRATION_VERSION,
    aggregate_refs: candidates.map((row: any) => row.aggregate_ref).filter(
      Boolean,
    ).slice(0, 12),
    currency: resolvedCurrency,
    sample_size: total,
    success_rate_pct: Math.round(success * 10) / 10,
    as_of: asOf.iso,
    temporal_filter: "period_start_and_last_verified_at_lte_prediction_time",
  };
}
