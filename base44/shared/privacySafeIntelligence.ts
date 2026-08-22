import {
  observedFiniteNumber,
  P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS,
} from "./intelligenceCore.ts";
import { validateStoredIntelligenceRecord } from "./intelligenceTenantScope.ts";
import { isP4PublishableObservedCohort } from "./p4BenchmarkIntelligence.ts";

export const PRIVACY_SAFE_INTELLIGENCE_VERSION =
  "privacy-safe-intelligence-1.3.0";
export const PRIVACY_SAFE_COMPLETE_READ_VERSION =
  "privacy-safe-complete-read-1.0.0";
// Compatibility alias. P12 has one canonical cross-tenant privacy floor.
export const MIN_ANONYMIZED_DISTINCT_MERCHANTS =
  P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS;
export const FORBIDDEN_INTELLIGENCE_KEYS = [
  "brand_id",
  "merchant_id",
  "owner_email",
  "user_email",
  "contact_email",
  "contact_name",
  "signed_by_email",
  "source_anon_id",
  "contribution_hash",
  "related_entity_id",
  "verification_source_id",
  "document_id",
  "thread_id",
  "message_id",
  "account_id",
  "merchant_account_id",
  "mid",
  "contract_id",
  "ip_hash",
  "email_domain",
];
const forbidden = new Set(FORBIDDEN_INTELLIGENCE_KEYS);

export function assertNoMerchantIdentifiers(
  value: any,
  path = "root",
): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const walk = (current: any, currentPath: string) => {
    if (current == null) return;
    if (Array.isArray(current)) {
      current.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }
    if (typeof current !== "object") return;
    for (const [key, item] of Object.entries(current)) {
      if (forbidden.has(key.toLowerCase())) {
        violations.push(`${currentPath}.${key}`);
      }
      walk(item, `${currentPath}.${key}`);
    }
  };
  walk(value, path);
  return { ok: violations.length === 0, violations };
}

function instantMs(raw: any) {
  if (raw === null || raw === undefined || raw === "") return null;
  const value = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isFinite(value) ? value : null;
}

export function quarterOf(raw: any) {
  const time = instantMs(raw);
  if (time === null) return "unknown";
  const date = new Date(time);
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

export function coarseNumber(value: any, step = 1) {
  const number = observedFiniteNumber(value);
  if (number === null) return null;
  return Math.round(number / step) * step;
}

function normalizedBucket(value: any) {
  return String(value || "unknown").trim().toLowerCase() || "unknown";
}

export const UNKNOWN_OUTCOME_CURRENCY = "UNKNOWN";

export function canonicalOutcomeCurrency(value: any) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) && currency !== "XXX"
    ? currency
    : UNKNOWN_OUTCOME_CURRENCY;
}

export function outcomeCohortKey(row: any) {
  return [
    normalizedBucket(row?.vertical),
    normalizedBucket(row?.provider_id),
    quarterOf(row?.captured_at),
    canonicalOutcomeCurrency(row?.currency),
  ].join("::");
}

function outcomePrecedence(row: any) {
  return {
    captured: instantMs(row?.captured_at) ?? -1,
    updated: instantMs(row?.updated_date) ?? -1,
    created: instantMs(row?.created_date) ?? -1,
    stable: String(row?.outcome_key || row?.id || ""),
  };
}

function laterDeclaredOutcome(candidate: any, current: any) {
  if (!current) return true;
  const next = outcomePrecedence(candidate);
  const prior = outcomePrecedence(current);
  if (next.captured !== prior.captured) return next.captured > prior.captured;
  if (next.updated !== prior.updated) return next.updated > prior.updated;
  if (next.created !== prior.created) return next.created > prior.created;
  return next.stable > prior.stable;
}

export function collapseOutcomeObservations(rows: any[]) {
  const declared = (Array.isArray(rows) ? rows : []).filter((row) =>
    row?.quarantined !== true &&
    validateStoredIntelligenceRecord(row, "outcome").ok &&
    String(row?.brand_id || "") && quarterOf(row?.captured_at) !== "unknown"
  );
  const cohorts = new Set(declared.map(outcomeCohortKey));
  if (cohorts.size !== 1) return [];
  const byMerchant = new Map<string, any>();
  for (const row of declared) {
    const merchant = String(row.brand_id);
    const current = byMerchant.get(merchant);
    if (laterDeclaredOutcome(row, current)) byMerchant.set(merchant, row);
  }
  return [...byMerchant.values()];
}

export function privacySafeOutcomeAggregate(rows: any[]) {
  // Select one declared point-in-time outcome first. Metric availability is
  // evaluated only afterwards so a newer UNKNOWN cannot expose an older value
  // as if it were still the merchant's current declared observation.
  const collapsed = collapseOutcomeObservations(rows);
  const currency = canonicalOutcomeCurrency(collapsed[0]?.currency);
  // A number without a known unit is not financial evidence. UNKNOWN currency
  // remains an explicit cohort key for diagnostics, but it is never published
  // as a financial aggregate and is never assumed to be EUR.
  if (currency === UNKNOWN_OUTCOME_CURRENCY) return null;
  const eligible = collapsed.filter((row) =>
    observedFiniteNumber(row?.realized_savings) !== null
  );
  if (eligible.length < MIN_ANONYMIZED_DISTINCT_MERCHANTS) return null;

  const realized = eligible.map((row) =>
    observedFiniteNumber(row.realized_savings) as number
  ).sort((a, b) => a - b);
  const expectedEligible = eligible.filter((row) =>
    observedFiniteNumber(row?.expected_savings) !== null
  );
  const successEligible = eligible.filter((row) =>
    typeof row?.success === "boolean"
  );
  const median = realized[Math.floor(realized.length / 2)];
  const meanExpected =
    expectedEligible.length >= MIN_ANONYMIZED_DISTINCT_MERCHANTS
      ? expectedEligible.reduce(
        (sum, row) =>
          sum + (observedFiniteNumber(row.expected_savings) as number),
        0,
      ) / expectedEligible.length
      : null;
  const successRate =
    successEligible.length >= MIN_ANONYMIZED_DISTINCT_MERCHANTS
      ? successEligible.filter((row) => row.success === true).length /
        successEligible.length
      : null;
  const payload = {
    kind: "verified_outcomes",
    vertical: normalizedBucket(eligible[0]?.vertical),
    provider_bucket: normalizedBucket(eligible[0]?.provider_id),
    period: quarterOf(eligible[0]?.captured_at),
    currency,
    sample_size: eligible.length,
    observation_selection:
      "latest_declared_observation_per_distinct_merchant_cohort",
    distinct_merchant_denominators: true,
    financial_values_converted: false,
    financial_value_unit: `native_currency:${currency}`,
    median_realized_savings: coarseNumber(median, 100),
    mean_expected_savings: coarseNumber(meanExpected, 100),
    success_rate_pct: successRate === null
      ? null
      : coarseNumber(successRate * 100, 5),
  };
  const check = assertNoMerchantIdentifiers(payload);
  if (!check.ok) {
    throw new Error(
      `privacy_safe_identifier_violation:${check.violations.join(",")}`,
    );
  }
  return payload;
}

export function completeEntityReadCoverage(
  value: any,
  expectedSourceEntity: string,
) {
  return Boolean(
    value?.status === "COMPLETE" &&
      value?.coverage_complete === true &&
      String(value?.source_entity || "") === expectedSourceEntity &&
      Number.isFinite(Number(value?.records_read)) &&
      Number(value?.records_read) >= 0 &&
      Number.isFinite(Number(value?.pages_fetched)) &&
      Number(value?.pages_fetched) >= 1 &&
      typeof value?.snapshot_at === "string" &&
      instantMs(value.snapshot_at) !== null,
  );
}

export function completeAggregateSourceCoverage(
  value: any,
  expectedSourceEntity = "IntelligenceOutcome",
) {
  return Boolean(
    value?.aggregate_input_complete === true &&
      completeEntityReadCoverage(value, expectedSourceEntity),
  );
}

export function safeVerifiedOutcomeAggregate(row: any) {
  const metrics = row?.metrics_json;
  const rowSample = Number(row?.sample_size);
  const metricSample = Number(metrics?.sample_size);
  const currency = canonicalOutcomeCurrency(metrics?.currency);
  const seriesKey = String(row?.aggregate_series_key || "");
  const snapshotVersion = String(row?.aggregate_snapshot_version || "");
  const vertical = normalizedBucket(row?.vertical || metrics?.vertical);
  const provider = normalizedBucket(
    row?.provider_bucket || metrics?.provider_bucket,
  );
  const period = String(row?.period || metrics?.period || "");
  const expectedSeriesKey =
    `outcome:${vertical}::${provider}::${period}::${currency}`;
  const sourceEligible = Number(metrics?.source_coverage?.eligible_records);
  if (
    row?.aggregate_type !== "verified_outcomes" ||
    !Number.isInteger(rowSample) ||
    !Number.isInteger(metricSample) ||
    rowSample < MIN_ANONYMIZED_DISTINCT_MERCHANTS ||
    metricSample < MIN_ANONYMIZED_DISTINCT_MERCHANTS ||
    rowSample !== metricSample ||
    row?.reidentification_mapping_retained !== false ||
    metrics?.kind !== "verified_outcomes" ||
    metrics?.distinct_merchant_denominators !== true ||
    metrics?.observation_selection !==
      "latest_declared_observation_per_distinct_merchant_cohort" ||
    metrics?.financial_values_converted !== false ||
    metrics?.financial_value_unit !== `native_currency:${currency}` ||
    currency === UNKNOWN_OUTCOME_CURRENCY ||
    normalizedBucket(metrics?.vertical) !== vertical ||
    normalizedBucket(metrics?.provider_bucket) !== provider ||
    String(metrics?.period || "") !== period ||
    String(row?.currency_bucket || "") !== currency ||
    seriesKey !== expectedSeriesKey ||
    !snapshotVersion ||
    snapshotVersion !== String(metrics?.aggregate_snapshot_version || "") ||
    !Number.isFinite(sourceEligible) || sourceEligible < rowSample ||
    !completeAggregateSourceCoverage(metrics?.source_coverage)
  ) return null;
  const privacy = assertNoMerchantIdentifiers(metrics);
  if (!privacy.ok) return null;
  const lastVerifiedAt = instantMs(row?.last_verified_at);
  const generatedAt = instantMs(metrics?.generated_at);
  if (
    quarterOf(metrics?.generated_at) === "unknown" ||
    lastVerifiedAt === null || generatedAt === null
  ) return null;
  return {
    aggregate_ref: String(row?.aggregate_key || ""),
    aggregate_series_ref: seriesKey,
    aggregate_snapshot_version: snapshotVersion,
    vertical,
    provider_bucket: provider,
    currency,
    period,
    sample_size: rowSample,
    success_rate_pct: observedFiniteNumber(metrics?.success_rate_pct),
    median_realized_savings: observedFiniteNumber(
      metrics?.median_realized_savings,
    ),
    mean_expected_savings: observedFiniteNumber(
      metrics?.mean_expected_savings,
    ),
    last_verified_at_ms: lastVerifiedAt,
    generated_at_ms: generatedAt,
    source_coverage: metrics.source_coverage,
  };
}

export function latestVerifiedOutcomeAggregateSnapshots(
  rows: any[],
  asOf: any = null,
) {
  const asOfMs = asOf === null ? Infinity : instantMs(asOf);
  if (asOfMs === null) return [];
  const latest = new Map<string, any>();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const row = safeVerifiedOutcomeAggregate(raw);
    if (!row || row.last_verified_at_ms > asOfMs) continue;
    const current = latest.get(row.aggregate_series_ref);
    if (
      !current || row.last_verified_at_ms > current.last_verified_at_ms ||
      (row.last_verified_at_ms === current.last_verified_at_ms &&
        row.aggregate_ref > current.aggregate_ref)
    ) latest.set(row.aggregate_series_ref, row);
  }
  return [...latest.values()];
}

export function privacySafeBenchmarkAggregate(row: any) {
  if (!isP4PublishableObservedCohort(row)) return null;
  const sampleSize = observedFiniteNumber(row?.n) as number;
  const sourcePopulation = normalizedBucket(row?.source_population);
  const payload = {
    kind: "benchmark",
    source_population: sourcePopulation,
    vertical: String(row.vertical || "unknown"),
    country: String(row.country || "unknown"),
    revenue_tier: String(row.revenue_tier || "unknown"),
    metric_key: String(row.metric_key || "unknown"),
    period: String(row.month || "").slice(0, 4),
    sample_size: Math.floor(sampleSize),
    median: coarseNumber(row.median, .01),
    p25: coarseNumber(row.p25, .01),
    p75: coarseNumber(row.p75, .01),
  };
  const check = assertNoMerchantIdentifiers(payload);
  if (!check.ok) {
    throw new Error(
      `privacy_safe_identifier_violation:${check.violations.join(",")}`,
    );
  }
  return payload;
}

function coverage(
  status: "COMPLETE" | "INCOMPLETE",
  input: any,
  extra: any = {},
) {
  return {
    status,
    coverage_complete: status === "COMPLETE",
    source_entity: String(input.source_entity || "unknown"),
    snapshot_at: input.snapshot_at,
    source_watermark: input.source_watermark || null,
    records_read: input.records_read,
    pages_fetched: input.pages_fetched,
    page_size: input.page_size,
    pagination: "created_date_ascending_offset_bounded_by_snapshot",
    read_version: PRIVACY_SAFE_COMPLETE_READ_VERSION,
    ...extra,
  };
}

// Base44 caps list/filter at 5,000 rows. This helper keeps reading until it
// observes a short terminal page. Any read error, duplicate page, moving row or
// safety-page exhaustion returns INCOMPLETE; callers must not publish from it.
export async function readCompleteEntityPages(
  entity: any,
  options: any = {},
) {
  const snapshotMs = instantMs(options.snapshot_at);
  const pageSize = Math.max(
    1,
    Math.min(5000, Math.floor(Number(options.page_size) || 1000)),
  );
  const maxPages = Math.max(
    1,
    Math.min(10_000, Math.floor(Number(options.max_pages) || 1000)),
  );
  const sourceEntity = String(options.source_entity || "unknown");
  if (snapshotMs === null || !entity || typeof entity.filter !== "function") {
    const snapshotAt = snapshotMs === null
      ? null
      : new Date(snapshotMs).toISOString();
    return {
      ok: false,
      rows: [],
      coverage: coverage("INCOMPLETE", {
        source_entity: sourceEntity,
        snapshot_at: snapshotAt,
        source_watermark: null,
        records_read: 0,
        pages_fetched: 0,
        page_size: pageSize,
      }, { blocker: "invalid_complete_read_configuration" }),
    };
  }

  const snapshotAt = new Date(snapshotMs).toISOString();
  const rows: any[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  let lastCreatedMs = -Infinity;
  let watermarkMs = -Infinity;
  const incomplete = (blocker: string) => ({
    ok: false,
    rows,
    coverage: coverage("INCOMPLETE", {
      source_entity: sourceEntity,
      snapshot_at: snapshotAt,
      source_watermark: Number.isFinite(watermarkMs)
        ? new Date(watermarkMs).toISOString()
        : null,
      records_read: rows.length,
      pages_fetched: pagesFetched,
      page_size: pageSize,
    }, { blocker }),
  });

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    let page: any;
    try {
      page = await entity.filter(
        { created_date: { $lte: snapshotAt } },
        "created_date",
        pageSize,
        rows.length,
      );
    } catch {
      return incomplete("source_page_read_failed");
    }
    pagesFetched++;
    if (!Array.isArray(page) || page.length > pageSize) {
      return incomplete("source_page_shape_invalid");
    }

    for (const row of page) {
      const id = String(row?.id || "");
      const createdMs = instantMs(row?.created_date);
      const updatedMs = row?.updated_date
        ? instantMs(row.updated_date)
        : createdMs;
      if (
        !id || createdMs === null || updatedMs === null ||
        createdMs > snapshotMs || updatedMs > snapshotMs ||
        createdMs < lastCreatedMs
      ) return incomplete("source_snapshot_consistency_unproven");
      if (seen.has(id)) return incomplete("source_page_overlap_detected");
      seen.add(id);
      rows.push(row);
      lastCreatedMs = createdMs;
      watermarkMs = Math.max(watermarkMs, updatedMs);
    }

    if (page.length < pageSize) {
      return {
        ok: true,
        rows,
        coverage: coverage("COMPLETE", {
          source_entity: sourceEntity,
          snapshot_at: snapshotAt,
          source_watermark: Number.isFinite(watermarkMs)
            ? new Date(watermarkMs).toISOString()
            : null,
          records_read: rows.length,
          pages_fetched: pagesFetched,
          page_size: pageSize,
        }),
      };
    }
  }
  return incomplete("complete_read_page_limit_reached");
}
