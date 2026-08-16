import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoMerchantIdentifiers,
  coarseNumber,
  collapseOutcomeObservations,
  completeAggregateSourceCoverage,
  MIN_ANONYMIZED_DISTINCT_MERCHANTS,
  outcomeCohortKey,
  privacySafeBenchmarkAggregate,
  privacySafeOutcomeAggregate,
  quarterOf,
  readCompleteEntityPages,
} from "../../base44/shared/privacySafeIntelligence.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8");

function sourceRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    created_date: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    updated_date: `2026-08-${String(index + 1).padStart(2, "0")}T01:00:00.000Z`,
  }));
}

describe("privacy-safe retained intelligence", () => {
  it("treats pseudonyms as personal-data-adjacent and forbids them from retained aggregate payloads", () => {
    expect(assertNoMerchantIdentifiers({ source_anon_id: "x" }).ok).toBe(false);
    expect(assertNoMerchantIdentifiers({ brand_id: "b" }).ok).toBe(false);
    expect(assertNoMerchantIdentifiers({ contact_email: "x@y.com" }).ok)
      .toBe(false);
  });

  it("suppresses cohorts below k=10 and removes row-level identity", () => {
    expect(MIN_ANONYMIZED_DISTINCT_MERCHANTS).toBe(10);
    expect(privacySafeBenchmarkAggregate({ n: 9 })).toBe(null);
    const aggregate = privacySafeBenchmarkAggregate({
      n: 10,
      vertical: "payments",
      country: "France",
      revenue_tier: "mid",
      metric_key: "payment_effective_rate",
      month: "2026-08",
      median: 1.234,
      p25: 1.1,
      p75: 1.4,
    });
    expect(aggregate.sample_size).toBe(10);
    expect(JSON.stringify(aggregate)).not.toMatch(/brand_id|source_anon_id|email/i);
  });

  it("requires ten distinct merchants for outcome learning retention", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      tenant_scope: "tenant",
      brand_id: `b${index}`,
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-01",
      realized_savings: 1000 + index * 10,
      expected_savings: 1200,
      success: true,
    }));
    const aggregate = privacySafeOutcomeAggregate(rows);
    expect(aggregate.sample_size).toBe(10);
    expect(JSON.stringify(aggregate)).not.toContain("b0");
    expect(privacySafeOutcomeAggregate(rows.slice(0, 9))).toBe(null);
  });

  it("collapses duplicate rows to one declared observation per merchant and cohort", () => {
    const current = Array.from({ length: 10 }, (_, index) => ({
      id: `current-${index}`,
      outcome_key: `current-${index}`,
      tenant_scope: "tenant",
      brand_id: `b${index}`,
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-10T00:00:00.000Z",
      realized_savings: 1000,
      expected_savings: 1000,
      success: true,
    }));
    const staleDuplicate = {
      id: "stale-duplicate",
      outcome_key: "stale-duplicate",
      tenant_scope: "tenant",
      brand_id: "b0",
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-01T00:00:00.000Z",
      realized_savings: 100000,
      expected_savings: 100000,
      success: false,
    };
    const rows = [staleDuplicate, ...current].reverse();
    expect(collapseOutcomeObservations(rows)).toHaveLength(10);
    expect(privacySafeOutcomeAggregate(rows)).toMatchObject({
      sample_size: 10,
      currency: "EUR",
      financial_values_converted: false,
      financial_value_unit: "native_currency:EUR",
      median_realized_savings: 1000,
      mean_expected_savings: 1000,
      success_rate_pct: 100,
      distinct_merchant_denominators: true,
      observation_selection:
        "latest_declared_observation_per_distinct_merchant_cohort",
    });
  });

  it("selects the latest declared merchant observation before evaluating metric availability", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: `known-${index}`,
      tenant_scope: "tenant",
      brand_id: `b${index}`,
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-01T00:00:00.000Z",
      realized_savings: 1000,
    }));
    rows.push({
      id: "newer-unknown",
      tenant_scope: "tenant",
      brand_id: "b0",
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-10T00:00:00.000Z",
      realized_savings: null,
    });
    expect(collapseOutcomeObservations(rows)).toHaveLength(10);
    expect(privacySafeOutcomeAggregate(rows)).toBeNull();
  });

  it("does not let missing financial values complete k or become zero", () => {
    const known = Array.from({ length: 9 }, (_, index) => ({
      tenant_scope: "tenant",
      brand_id: `known-${index}`,
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-01",
      realized_savings: 100 + index,
    }));
    const unknown = {
      tenant_scope: "tenant",
      brand_id: "unknown-tenth",
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-01",
      realized_savings: null,
      expected_savings: null,
    };
    expect(privacySafeOutcomeAggregate([...known, unknown])).toBeNull();
    expect(coarseNumber(null)).toBeNull();
    expect(quarterOf(null)).toBe("unknown");
  });

  it("preserves explicit zero while withholding metric slices without their own k=10 evidence", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      tenant_scope: "tenant",
      brand_id: `b${index}`,
      vertical: "payments",
      provider_id: "stripe",
      currency: "EUR",
      captured_at: "2026-08-01",
      realized_savings: 0,
      ...(index === 0 ? { expected_savings: 100, success: false } : {}),
    }));
    expect(privacySafeOutcomeAggregate(rows)).toMatchObject({
      sample_size: 10,
      currency: "EUR",
      median_realized_savings: 0,
      mean_expected_savings: null,
      success_rate_pct: null,
    });
  });

  it("uses currency in the cohort identity and never mixes or assumes EUR", () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      tenant_scope: "tenant",
      brand_id: `b${index}`,
      vertical: "payments",
      provider_id: "stripe",
      captured_at: "2026-08-01T00:00:00.000Z",
      realized_savings: 1000,
      currency: index === 9 ? "USD" : "EUR",
    }));
    expect(outcomeCohortKey(rows[0])).toBe(
      "payments::stripe::2026-Q3::EUR",
    );
    expect(outcomeCohortKey({ ...rows[0], currency: null })).toBe(
      "payments::stripe::2026-Q3::UNKNOWN",
    );
    expect(privacySafeOutcomeAggregate(rows)).toBeNull();
    expect(
      privacySafeOutcomeAggregate(rows.map((row) => ({
        ...row,
        currency: null,
      }))),
    ).toBeNull();
    expect(JSON.stringify(privacySafeOutcomeAggregate(
      rows.map((row) => ({ ...row, currency: "USD" })),
    ))).not.toContain("_eur");
  });

  it("accepts only explicit COMPLETE aggregate source coverage", () => {
    const coverage = {
      status: "COMPLETE",
      coverage_complete: true,
      aggregate_input_complete: true,
      source_entity: "IntelligenceOutcome",
      snapshot_at: "2026-08-31T00:00:00.000Z",
      records_read: 10,
      pages_fetched: 1,
    };
    expect(completeAggregateSourceCoverage(coverage)).toBe(true);
    expect(completeAggregateSourceCoverage({
      ...coverage,
      coverage_complete: false,
    })).toBe(false);
    expect(completeAggregateSourceCoverage({
      ...coverage,
      status: "INCOMPLETE",
    })).toBe(false);
  });

  it("paginates to a terminal page and records a complete snapshot watermark", async () => {
    const rows = sourceRows(5);
    const calls = [];
    const entity = {
      filter: async (query, sort, limit, skip) => {
        calls.push({ query, sort, limit, skip });
        return rows.slice(skip, skip + limit);
      },
    };
    const result = await readCompleteEntityPages(entity, {
      source_entity: "Fixture",
      snapshot_at: "2026-08-31T00:00:00.000Z",
      page_size: 2,
      max_pages: 10,
    });
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(5);
    expect(result.coverage).toMatchObject({
      status: "COMPLETE",
      coverage_complete: true,
      records_read: 5,
      pages_fetched: 3,
      source_watermark: "2026-08-05T01:00:00.000Z",
    });
    expect(calls.map((call) => call.skip)).toEqual([0, 2, 4]);
    expect(calls[0].query).toEqual({
      created_date: { $lte: "2026-08-31T00:00:00.000Z" },
    });
  });

  it("marks incomplete pagination for review instead of treating a partial read as complete", async () => {
    const rows = sourceRows(4);
    const capped = await readCompleteEntityPages({
      filter: async (_query, _sort, limit, skip) =>
        rows.slice(skip, skip + limit),
    }, {
      source_entity: "Fixture",
      snapshot_at: "2026-08-31T00:00:00.000Z",
      page_size: 2,
      max_pages: 2,
    });
    expect(capped).toMatchObject({
      ok: false,
      coverage: {
        status: "INCOMPLETE",
        coverage_complete: false,
        blocker: "complete_read_page_limit_reached",
      },
    });

    const failed = await readCompleteEntityPages({
      filter: async () => {
        throw new Error("provider unavailable");
      },
    }, {
      source_entity: "Fixture",
      snapshot_at: "2026-08-31T00:00:00.000Z",
      page_size: 2,
    });
    expect(failed).toMatchObject({
      ok: false,
      rows: [],
      coverage: { blocker: "source_page_read_failed" },
    });
  });

  it("worker is scheduled, paginated and fail-closed on incomplete coverage", () => {
    const config = JSON.parse(
      read("base44/functions/privacySafeIntelligenceWorker/function.jsonc"),
    );
    expect(config.automations[0].is_active).toBe(true);
    const entity = JSON.parse(
      read("base44/entities/AnonymizedIntelligenceAggregate.jsonc"),
    );
    expect(entity.properties.reidentification_mapping_retained.const).toBe(
      false,
    );
    const source = read(
      "base44/functions/privacySafeIntelligenceWorker/entry.ts",
    );
    expect(source).not.toContain("source_anon_id");
    expect(source).not.toContain("contact_email");
    expect(source).toContain("readCompleteEntityPages");
    expect(source).toContain("source_coverage_incomplete");
    expect(source).toContain("aggregates_published: 0");
    expect(source).toContain("appendAggregateSnapshot");
    expect(source).not.toContain(
      "AnonymizedIntelligenceAggregate.update",
    );
    expect(source).not.toMatch(/\.list\([^)]*,\s*5000\)/);
  });

  it("moat consumes only complete privacy-safe outcome aggregates", () => {
    const source = read("base44/functions/moatCuratorWorker/entry.ts");
    expect(source).toContain("AnonymizedIntelligenceAggregate");
    expect(source).toContain("readCompleteEntityPages");
    expect(source).toContain("privacy_safe_outcome_coverage_incomplete");
    expect(source).toContain("metrics_published: 0");
    expect(source).not.toContain("entities.IntelligenceOutcome");
  });

  it("privacy pages state cross-tenant retained intelligence is anonymous, not merely pseudonymous", () => {
    for (const locale of ["en", "fr", "es"]) {
      const source = read(`src/content/legal/${locale}/privacy.js`);
      expect(source).toContain("47 rue Vivienne");
      expect(source).not.toContain("42 rue Vivienne");
    }
  });
});
