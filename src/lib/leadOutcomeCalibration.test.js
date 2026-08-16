import { describe, expect, it } from "vitest";
import {
  leadOutcomeCalibration,
  safeLeadOutcomeAggregate,
} from "../../base44/shared/leadOutcomeCalibration.ts";
import { buildResilientLeadScore } from "../../base44/shared/leadScoringResilience.ts";
const AS_OF = "2026-08-15T12:00:00.000Z";
const aggregate = (over = {}) => ({
  aggregate_key:
    "outcome:payments::stripe::2026-Q3::EUR@2026-08-10T12:00:00.000Z",
  aggregate_series_key: "outcome:payments::stripe::2026-Q3::EUR",
  aggregate_snapshot_version:
    "privacy-safe-intelligence-1.3.0@2026-08-10T12:00:00.000Z",
  aggregate_type: "verified_outcomes",
  vertical: "payments",
  provider_bucket: "stripe",
  currency_bucket: "EUR",
  period: "2026-Q3",
  sample_size: 10,
  reidentification_mapping_retained: false,
  last_verified_at: "2026-08-10T12:00:00.000Z",
  metrics_json: {
    aggregate_snapshot_version:
      "privacy-safe-intelligence-1.3.0@2026-08-10T12:00:00.000Z",
    kind: "verified_outcomes",
    vertical: "payments",
    provider_bucket: "stripe",
    currency: "EUR",
    period: "2026-Q3",
    sample_size: 10,
    success_rate_pct: 80,
    observation_selection:
      "latest_declared_observation_per_distinct_merchant_cohort",
    distinct_merchant_denominators: true,
    financial_values_converted: false,
    financial_value_unit: "native_currency:EUR",
    generated_at: "2026-08-10T12:00:00.000Z",
    source_coverage: {
      status: "COMPLETE",
      coverage_complete: true,
      aggregate_input_complete: true,
      source_entity: "IntelligenceOutcome",
      snapshot_at: "2026-08-10T12:00:00.000Z",
      records_read: 10,
      eligible_records: 10,
      pages_fetched: 1,
    },
  },
  ...over,
});
describe("privacy-safe outcomes -> lead scoring", () => {
  it("rejects k<10, reidentification mappings, forbidden identifiers and unknown success metrics", () => {
    expect(safeLeadOutcomeAggregate(aggregate({ sample_size: 9 }))).toBe(null);
    expect(
      safeLeadOutcomeAggregate(
        aggregate({ reidentification_mapping_retained: true }),
      ),
    ).toBe(null);
    expect(
      safeLeadOutcomeAggregate(
        aggregate({
          metrics_json: { ...aggregate().metrics_json, brand_id: "tenant" },
        }),
      ),
    ).toBe(null);
    expect(
      safeLeadOutcomeAggregate(aggregate({
        metrics_json: {
          ...aggregate().metrics_json,
          source_coverage: {
            ...aggregate().metrics_json.source_coverage,
            coverage_complete: false,
          },
        },
      })),
    ).toBe(null);
    expect(
      safeLeadOutcomeAggregate(aggregate({
        aggregate_snapshot_version: "mismatched-snapshot",
      })),
    ).toBe(null);
    expect(
      safeLeadOutcomeAggregate(
        aggregate({
          metrics_json: { ...aggregate().metrics_json, success_rate_pct: null },
        }),
      ),
    ).toBe(null);
  });
  it("keeps native currencies separate and requires lead currency when several cohorts match", () => {
    const usd = aggregate({
      aggregate_key:
        "outcome:payments::stripe::2026-Q3::USD@2026-08-11T12:00:00.000Z",
      aggregate_series_key: "outcome:payments::stripe::2026-Q3::USD",
      currency_bucket: "USD",
      last_verified_at: "2026-08-11T12:00:00.000Z",
      metrics_json: {
        ...aggregate().metrics_json,
        currency: "USD",
        financial_value_unit: "native_currency:USD",
      },
    });
    expect(
      leadOutcomeCalibration(
        { probable_payment_stack: ["stripe"] },
        [aggregate(), usd],
        { as_of: AS_OF },
      ),
    ).toMatchObject({
      applied: false,
      reason: "lead_currency_required_for_multi_currency_outcomes",
    });
    expect(
      leadOutcomeCalibration(
        { probable_payment_stack: ["stripe"], currency: "USD" },
        [aggregate(), usd],
        { as_of: AS_OF },
      ),
    ).toMatchObject({ applied: true, currency: "USD", sample_size: 10 });
    expect(
      safeLeadOutcomeAggregate(aggregate({
        currency_bucket: "",
        metrics_json: {
          ...aggregate().metrics_json,
          currency: null,
          financial_value_unit: "native_currency:UNKNOWN",
        },
      })),
    ).toBeNull();
  });
  it("requires provider evidence on the lead and matches only that provider", () => {
    expect(leadOutcomeCalibration({}, [aggregate()], { as_of: AS_OF }))
      .toMatchObject({
      applied: false,
      reason: "provider_evidence_required",
    });
    expect(
      leadOutcomeCalibration({ probable_payment_stack: ["adyen"] }, [
        aggregate(),
      ], { as_of: AS_OF }),
    ).toMatchObject({ applied: false, adjustment: 0 });
    expect(
      leadOutcomeCalibration({ probable_payment_stack: ["Stripe"] }, [
        aggregate(),
      ], { as_of: AS_OF }),
    ).toMatchObject({ applied: true, adjustment: 3, sample_size: 10 });
  });
  it("requires a valid prediction time and excludes future periods or verification timestamps", () => {
    const lead = { probable_payment_stack: ["stripe"] };
    expect(leadOutcomeCalibration(lead, [aggregate()], undefined)).toMatchObject({
      applied: false,
      reason: "valid_prediction_time_required",
      as_of: null,
    });
    expect(
      leadOutcomeCalibration(lead, [aggregate()], { as_of: "not-a-date" }),
    ).toMatchObject({
      applied: false,
      reason: "valid_prediction_time_required",
    });
    expect(
      leadOutcomeCalibration(lead, [
        aggregate({
          aggregate_key:
            "outcome:payments::stripe::2026-Q4::EUR@2026-08-10T12:00:00.000Z",
          aggregate_series_key: "outcome:payments::stripe::2026-Q4::EUR",
          period: "2026-Q4",
          metrics_json: { ...aggregate().metrics_json, period: "2026-Q4" },
        }),
      ], { prediction_time: AS_OF }),
    ).toMatchObject({
      applied: false,
      reason: "no_point_in_time_eligible_provider_outcome_cohort",
    });
    expect(
      leadOutcomeCalibration(lead, [
        aggregate({ last_verified_at: "2026-08-16T00:00:00.000Z" }),
      ], { prediction_time: AS_OF }),
    ).toMatchObject({
      applied: false,
      reason: "no_point_in_time_eligible_provider_outcome_cohort",
    });
    expect(
      leadOutcomeCalibration(lead, [aggregate()], {
        prediction_time: AS_OF,
      }),
    ).toMatchObject({
      applied: true,
      as_of: AS_OF,
      temporal_filter:
        "period_start_and_last_verified_at_lte_prediction_time",
    });
  });
  it("applies only a bounded descriptive advisory heuristic and stores aggregate refs, never tenant IDs", () => {
    const lead = {
      id: "l1",
      contact_email: "a@merchant.test",
      probable_payment_stack: ["stripe"],
      company_name: "Merchant",
      enrichment_json: { commerce_platform: "shopify", employees: 100 },
    };
    const advisory = leadOutcomeCalibration(lead, [aggregate()], {
      as_of: AS_OF,
    });
    expect(advisory).toMatchObject({
      methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
      probabilistic_calibration: false,
      reason: "privacy_safe_verified_outcome_heuristic_advisory",
    });
    const scored = buildResilientLeadScore(
      lead,
      null,
      "UNAVAILABLE_OR_UNPARSEABLE",
      advisory,
    );
    const base = buildResilientLeadScore(
      lead,
      null,
      "UNAVAILABLE_OR_UNPARSEABLE",
    );
    expect(scored.score - base.score).toBe(3);
    expect(scored.score_breakdown_json.outcome_calibration).toMatchObject({
      methodology_class: "DESCRIPTIVE_AGGREGATE_HEURISTIC",
      probabilistic_calibration: false,
      legacy_field_name: true,
      as_of: AS_OF,
    });
    expect(Math.abs(scored.score_breakdown_json.outcome_calibration.adjustment))
      .toBeLessThanOrEqual(3);
    expect(JSON.stringify(scored)).not.toContain("brand_id");
  });
  it("keeps the privacy-safe advisory bounded without reintroducing a contact feature into company score", () => {
    const lead = {
      id: "l2",
      probable_payment_stack: ["stripe"],
      enrichment_json: {
        commerce_platform: "shopify",
        employees: 10000,
        revenue: "100m",
      },
    };
    const r = buildResilientLeadScore(
      lead,
      { id: "l2", score: 100, reasoning: "evidence", next_action: "review" },
      "PARSED",
      leadOutcomeCalibration(lead, [aggregate()], { as_of: AS_OF }),
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score_breakdown_json).toMatchObject({
      company_only: true,
      contact_features_used: false,
      email_cap_applied: false,
    });
  });
});
