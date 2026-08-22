import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  CPIC_CONTRACT_VERSION,
  CPIC_ESTIMATE_CONTRACT_V1,
  CPIC_SUPPORT_STATES,
  CPIC_TRUTH_STATES,
  adaptCpicEstimateV0ToV1,
  adaptP4ServiceEstimateToCpicV0,
  assessCpicSupportV0,
  buildCpicEstimateV0,
  computeExpectedValueV0,
  computeValueOfInformationV0,
  resolveCpicTruthV0,
} from "../../base44/shared/cpicFoundation.ts";
import {
  adaptP4BenchmarkCohortToCpicV0,
  deriveBenchmarkCohort,
} from "../../base44/shared/p4BenchmarkIntelligence.ts";

const TIME = "2026-08-13T10:00:00.000Z";

function completeEstimate(overrides = {}) {
  return {
    estimate_id: "estimate-1",
    problem_id: "effective_rate_bps",
    subject_ref: "cohort:fr:retail",
    truth_state: "BENCHMARK",
    distribution_kind: "EMPIRICAL_QUANTILES",
    unit: "BPS",
    quantiles: { p10: 0, p50: 50, p90: 100 },
    support: {
      raw_n: 25,
      effective_n: 25,
      minimum_effective_n: 10,
      status_hint: "IN_DISTRIBUTION",
      dimensions: [],
    },
    uncertainty: {
      aleatoric: { status: "NOT_ESTIMATED" },
      epistemic: { status: "NOT_ESTIMATED" },
      model: { status: "NOT_APPLICABLE" },
      data: { status: "NOT_ESTIMATED" },
      total: { status: "NOT_ESTIMATED" },
    },
    calibration: { claimed: false },
    method_class: "ROBUST_DESCRIPTIVE_BASELINE",
    trained_model_claim: false,
    model_registered: false,
    effective_at: TIME,
    observed_at: TIME,
    available_at: TIME,
    prediction_time: TIME,
    source_refs: ["BenchmarkCohort:fr-retail"],
    lineage_refs: ["benchmark-lineage-v1"],
    assumptions: ["Empirical descriptive cohort."],
    ...overrides,
  };
}

describe("CPIC Phase 2 canonical foundation", () => {
  it("defines the full truth/support taxonomy without treating unknown as zero", () => {
    expect(CPIC_CONTRACT_VERSION).toBe("cpic-foundation.v0");
    expect(CPIC_TRUTH_STATES).toContain("EXTRACTED_UNVERIFIED");
    expect(CPIC_TRUTH_STATES).toContain("CONTRADICTED");
    expect(CPIC_SUPPORT_STATES).toEqual([
      "IN_DISTRIBUTION",
      "EDGE_OF_SUPPORT",
      "LOW_SUPPORT",
      "OUT_OF_DISTRIBUTION",
      "UNKNOWN_SUPPORT",
    ]);
    const unknown = resolveCpicTruthV0({});
    expect(unknown).toMatchObject({ selected: "NONE", value: null, truth_state: "UNKNOWN" });
    const zero = resolveCpicTruthV0({
      deterministic: { value: 0, truth_state: "VERIFIED", source_ref: "invoice:1" },
      estimate: { value: 42, truth_state: "PREDICTED", source_ref: "model:x" },
    });
    expect(zero).toMatchObject({ selected: "DETERMINISTIC", value: 0, inference_overrode_truth: false });
  });

  it("shares the canonical support vocabulary with the single prediction registry", () => {
    const registry = JSON.parse(fs.readFileSync("config/intelligence/prediction-registry.v1.json", "utf8"));
    expect(registry.record_schema.support_status_enum).toEqual(CPIC_SUPPORT_STATES);
    expect(registry.record_schema.support_status_legacy_aliases).toEqual({
      BORDERLINE: "EDGE_OF_SUPPORT",
      EDGE_OF_DISTRIBUTION: "EDGE_OF_SUPPORT",
      UNKNOWN: "UNKNOWN_SUPPORT",
    });
    expect(registry.records).toEqual([]);
    expect(registry.registry_state).toBe("CONTRACT_ONLY");
  });

  it("preserves distribution and lineage while legacy heuristic support abstains", () => {
    const result = buildCpicEstimateV0(completeEstimate());
    expect(result.status).toBe("ABSTAIN");
    expect(result.distribution.quantiles).toEqual([
      { key: "p10", p: 0.1, value: 0 },
      { key: "p50", p: 0.5, value: 50 },
      { key: "p90", p: 0.9, value: 100 },
    ]);
    expect(result.time).toMatchObject({ available_at: TIME, prediction_time: TIME });
    expect(result.provenance.source_refs).toEqual(["BenchmarkCohort:fr-retail"]);
    expect(result.support).toMatchObject({
      status: "UNKNOWN_SUPPORT",
      heuristic_status: "IN_DISTRIBUTION",
      registered_detector_resolved: false,
    });
    expect(result.decision_safety).toMatchObject({
      recommendation: "ABSTAIN",
      material_automation_allowed: false,
      authority_granted: false,
      billing_eligible: false,
    });
  });

  it("abstains on malformed quantiles, point-in-time leakage and missing provenance", () => {
    const result = buildCpicEstimateV0(completeEstimate({
      quantiles: { p10: 100, p90: 10 },
      available_at: "2026-08-14T00:00:00.000Z",
      prediction_time: "2026-08-13T00:00:00.000Z",
      source_refs: [],
    }));
    expect(result.status).toBe("ABSTAIN");
    expect(result.decision_safety.reason_codes).toEqual(expect.arrayContaining([
      "QUANTILE_ORDER_INVALID",
      "POINT_IN_TIME_LEAKAGE",
      "SOURCE_PROVENANCE_REQUIRED",
    ]));
  });

  it("keeps aleatoric, epistemic, model and data uncertainty distinct", () => {
    const result = buildCpicEstimateV0(completeEstimate({
      uncertainty: {
        aleatoric: { status: "NOT_ESTIMATED" },
        epistemic: { status: "NOT_ESTIMATED" },
        model: { status: "NOT_APPLICABLE" },
        data: { status: "NOT_ESTIMATED" },
        total: { status: "BOUNDED", measure: "empirical_range", lower: 0, upper: 100, unit: "BPS", source_ref: "benchmark:1" },
      },
    }));
    expect(Object.keys(result.uncertainty)).toEqual(expect.arrayContaining([
      "aleatoric",
      "epistemic",
      "model",
      "data",
      "total",
    ]));
    expect(result.uncertainty.decomposition_claimed).toBe(false);
    expect(result.uncertainty.total).toMatchObject({ status: "BOUNDED", lower: 0, upper: 100 });
  });

  it("rejects unsupported uncertainty decomposition and calibration claims", () => {
    const result = buildCpicEstimateV0(completeEstimate({
      method_class: "EXTERNAL_STATISTICAL_ARTIFACT",
      trained_model_claim: true,
      bayesian_claim: true,
      uncertainty: {
        aleatoric: { status: "ESTIMATED", measure: "variance", value: 1, unit: "BPS2" },
      },
      calibration: { claimed: true },
    }));
    expect(result.status).toBe("ABSTAIN");
    expect(result.calibration.probabilistic_calibration).toBe(false);
    expect(result.decision_safety.reason_codes).toEqual(expect.arrayContaining([
      "UNCERTAINTY_COMPONENT_EVIDENCE_INCOMPLETE",
      "UNSUPPORTED_CALIBRATION_CLAIM",
      "REGISTERED_MODEL_EVIDENCE_MISSING",
      "UNSUPPORTED_BAYESIAN_CLAIM",
    ]));
    expect(result.method).toMatchObject({
      trained_model_claim_requested: true,
      trained_model_claim: false,
      bayesian_claim_requested: true,
      bayesian_claim: false,
    });
  });

  it("CPIC-AT-208 labels the V0 support screen heuristic and keeps canonical support unknown", () => {
    expect(assessCpicSupportV0({ raw_n: 9, effective_n: 9 })).toMatchObject({
      status: "UNKNOWN_SUPPORT",
      heuristic_status: "LOW_SUPPORT",
    });
    expect(assessCpicSupportV0({ raw_n: 10, effective_n: 10 })).toMatchObject({
      status: "UNKNOWN_SUPPORT",
      heuristic_status: "EDGE_OF_SUPPORT",
    });
    expect(assessCpicSupportV0({ raw_n: 25, effective_n: 25 })).toMatchObject({
      status: "UNKNOWN_SUPPORT",
      heuristic_status: "IN_DISTRIBUTION",
    });
    expect(assessCpicSupportV0({ raw_n: null, effective_n: null })).toMatchObject({
      status: "UNKNOWN_SUPPORT",
      heuristic_status: "UNKNOWN_SUPPORT",
    });
    expect(assessCpicSupportV0({
      raw_n: 100,
      effective_n: 80,
      dimensions: [{ name: "country", observed: true, in_reference_support: false }],
    })).toMatchObject({
      status: "UNKNOWN_SUPPORT",
      heuristic_status: "OUT_OF_DISTRIBUTION",
      registered_detector_resolved: false,
      automatic_action_allowed: false,
    });
  });

  it("CPIC-AT-267 never accepts caller-provided model/calibration authority references", () => {
    const result = buildCpicEstimateV0(completeEstimate({
      method_class: "EXTERNAL_STATISTICAL_ARTIFACT",
      trained_model_claim: true,
      model_registered: true,
      model_registry_ref: "model-registry:claimed",
      calibration: {
        claimed: true,
        model_registered: true,
        model_approval_ref: "approval:claimed",
        evaluation_ref: "evaluation:claimed",
        evaluated_at: TIME,
        evaluation_n: 1000,
        metrics: { brier: 0.1, ece: 0.02 },
      },
    }));
    expect(result.method).toMatchObject({
      trained_model_claim: false,
      model_registered: false,
      model_registry_ref: null,
      registry_resolution_status: "NOT_RESOLVED",
    });
    expect(result.calibration).toMatchObject({
      claim_allowed: false,
      probabilistic_calibration: false,
      registry_resolution_status: "NOT_RESOLVED",
    });
    expect(result.decision_safety.material_automation_allowed).toBe(false);
  });
});

describe("CPIC additive V1 orthogonal contract", () => {
  it("decomposes V0 without promoting legacy support or generic intervals", async () => {
    const v0 = buildCpicEstimateV0(completeEstimate({
      truth_state: "CONTRADICTED",
      interval: { lower: 10, upper: 90, level: 0.9, kind: "LEGACY" },
    }));
    const v1 = await adaptCpicEstimateV0ToV1(v0, {
      trace_id: "trace-1",
      subject_ref: {
        subject_type: "MERCHANT",
        canonical_id: "merchant-pseudonym-1",
        identity_version: "identity-v1",
        tenant_id: "tenant-pseudonym-1",
        scope: "CPIC_ADVISORY_ESTIMATION",
        merge_state: "STABLE",
      },
      tenant_scope: {
        tenant_id: "tenant-pseudonym-1",
        purpose: "CPIC_ADVISORY_ESTIMATE",
        allowed_consumers: ["FOUNDER_ADMIN"],
      },
      ingested_time: TIME,
      as_of_time: TIME,
      horizon: "CURRENT_PERIOD",
      created_at: TIME,
    });
    expect(v1.schema_version).toBe(CPIC_ESTIMATE_CONTRACT_V1);
    expect(v1.status_dimensions).toMatchObject({
      value_mode: "UNKNOWN",
      verification_status: "REJECTED",
      evidence_status: "CONTRADICTED",
      temporal_status: "CURRENT",
      support_status: "UNKNOWN_SUPPORT",
      dispute_status: "DISPUTED",
      causal_status: "DESCRIPTIVE",
    });
    expect(v1.intervals).toEqual([]);
    expect(v1.registry_resolution).toEqual({
      model_artifact_resolved: false,
      calibration_artifact_resolved: false,
      deployment_resolved: false,
      support_detector_resolved: false,
    });
    expect(v1.decision_eligibility.status).toBe("ABSTAIN");
    expect(v1.material_automation_allowed).toBe(false);
    expect(v1.content_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("CPIC-AT-013/014 fails closed when subject and tenant bindings disagree", async () => {
    const v0 = buildCpicEstimateV0(completeEstimate());
    const v1 = await adaptCpicEstimateV0ToV1(v0, {
      trace_id: "trace-cross-tenant",
      subject_ref: {
        subject_type: "MERCHANT",
        canonical_id: "merchant-1",
        identity_version: "v1",
        tenant_id: "tenant-a",
        scope: "P4_ADVISORY_ESTIMATION",
        merge_state: "STABLE",
      },
      tenant_scope: { tenant_id: "tenant-b", purpose: "CPIC_ADVISORY_ESTIMATE" },
      ingested_time: TIME,
      as_of_time: TIME,
      created_at: TIME,
    });
    expect(v1.contract_status).toBe("INVALID_FAIL_CLOSED");
    expect(v1.decision_eligibility.status).toBe("FORBIDDEN");
    expect(v1.decision_eligibility.reason_codes).toContain("TENANT_BINDING_INVALID");
  });
});

describe("CPIC deterministic Expected Value and Value of Information V0", () => {
  it("ranks explicit joint scenarios while remaining simulated and non-billable", () => {
    const result = computeExpectedValueV0({
      decision_id: "decision-1",
      utility_unit: "EUR_MINOR",
      assumptions: ["Scenario probabilities are founder-approved inputs."],
      source_refs: ["scenario-set:1"],
      options: [
        {
          action: "DO_NOTHING",
          direct_cost_utility: 0,
          outcomes: [{ outcome_id: "stable", probability: 1, utility: 0 }],
        },
        {
          action: "RESEARCH",
          direct_cost_utility: 10,
          outcomes: [
            { outcome_id: "useful", probability: 0.25, utility: 100 },
            { outcome_id: "not_useful", probability: 0.75, utility: 0 },
          ],
        },
      ],
    });
    expect(result).toMatchObject({
      status: "SIMULATED_ADVISORY",
      truth_state: "SIMULATED",
      selected_action_advisory: "RESEARCH",
      selected_expected_net_utility: 15,
      authority_granted: false,
      billing_eligible: false,
    });
    expect(result.probability_semantics).toMatch(/JOINT_SCENARIOS_NOT_MULTIPLIED_MARGINALS/);
  });

  it("abstains when scenario probabilities or acquisition costs are incomplete", () => {
    const ev = computeExpectedValueV0({
      decision_id: "d",
      utility_unit: "EUR_MINOR",
      assumptions: ["a"],
      source_refs: ["s"],
      options: [{
        action: "A",
        direct_cost_utility: 0,
        outcomes: [{ outcome_id: "o", probability: 0.8, utility: 1 }],
      }],
    });
    expect(ev.status).toBe("ABSTAIN");
    expect(ev.reason_codes.join(" ")).toMatch(/PROBABILITIES_MUST_SUM_TO_ONE/);

    const voi = computeValueOfInformationV0({
      research_action: "CHECK_PSP",
      utility_unit: "EUR_MINOR",
      assumptions: ["a"],
      source_refs: ["s"],
      source_success_probability: 1,
      expected_uncertainty_reduction: 0.1,
      current_options: [{ action: "A", expected_utility: 0 }],
      research_outcomes: [{ outcome_id: "o", probability: 1, best_action_after: "A", best_expected_utility_after: 1 }],
      acquisition_costs: { api: 0 },
      controls: { privacy_allowed: true, budget_authorized: true },
    });
    expect(voi.status).toBe("ABSTAIN");
    expect(voi.reason_codes).toContain("ACQUISITION_COST_REQUIRED:llm");
  });

  it("computes net EVI, source failure and action-change probability transparently", () => {
    const result = computeValueOfInformationV0({
      research_action: "CHECK_PSP",
      utility_unit: "EUR_MINOR",
      assumptions: ["Post-research utilities and source success are scenario inputs."],
      source_refs: ["research-policy:1"],
      source_success_probability: 0.8,
      expected_uncertainty_reduction: 0.6,
      current_options: [
        { action: "A", expected_utility: 100 },
        { action: "B", expected_utility: 90 },
      ],
      research_outcomes: [
        { outcome_id: "keep-a", probability: 0.5, best_action_after: "A", best_expected_utility_after: 110 },
        { outcome_id: "switch-b", probability: 0.5, best_action_after: "B", best_expected_utility_after: 140 },
      ],
      acquisition_costs: { api: 5, llm: 1, latency: 2, privacy_compliance: 1, other: 1 },
      controls: { privacy_allowed: true, budget_authorized: true },
      minimum_net_information_value: 0,
    });
    expect(result).toMatchObject({
      status: "SIMULATED_ADVISORY",
      expected_best_utility_after_research: 120,
      gross_expected_information_value: 20,
      total_acquisition_cost: 10,
      net_expected_information_value: 10,
      action_change_probability: 0.4,
      expected_uncertainty_reduction: 0.6,
      recommendation: "ACQUIRE_INFORMATION_ADVISORY",
      probabilistic_calibration: false,
      authority_granted: false,
      execution_requested: false,
    });
  });

  it("rejects useless research and respects privacy/budget controls", () => {
    const base = {
      research_action: "LOOKUP",
      utility_unit: "UTILITY_POINT",
      assumptions: ["Explicit deterministic scenario."],
      source_refs: ["policy:1"],
      source_success_probability: 1,
      expected_uncertainty_reduction: 0,
      current_options: [{ action: "A", expected_utility: 10 }],
      research_outcomes: [{ outcome_id: "same", probability: 1, best_action_after: "A", best_expected_utility_after: 10 }],
      acquisition_costs: { api: 1, llm: 0, latency: 0, privacy_compliance: 0, other: 0 },
      controls: { privacy_allowed: true, budget_authorized: true },
    };
    expect(computeValueOfInformationV0(base)).toMatchObject({
      net_expected_information_value: -1,
      recommendation: "DO_NOT_ACQUIRE",
    });
    expect(computeValueOfInformationV0({
      ...base,
      research_outcomes: [{ outcome_id: "gain", probability: 1, best_action_after: "B", best_expected_utility_after: 100 }],
      controls: { privacy_allowed: false, budget_authorized: true },
    }).recommendation).toBe("BLOCKED_BY_POLICY");
  });
});

describe("P4 reuse through the CPIC contract", () => {
  const row = (index, extra = {}) => ({
    source_anon_id: `merchant-${index}`,
    metric_value: 100 + index,
    cohort_key: "small|FR|payments",
    metric_key: "payment_effective_rate",
    month: "2026-07",
    source_population: "inbound",
    validated: true,
    flagged: false,
    contribution_hash: `hash-${index}`,
    contribution_source: "verified",
    known_at: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    ...extra,
  });

  it("extends P4 descriptive output with distribution/support metadata, not model claims", () => {
    const derived = deriveBenchmarkCohort(Array.from({ length: 10 }, (_, index) => row(index)));
    expect(derived).toMatchObject({
      p90: 108.1,
      minimum: 100,
      maximum: 109,
      effectiveSampleSize: 10,
      supportStatus: "EDGE_OF_SUPPORT",
      methodologyClass: "ROBUST_DESCRIPTIVE_BASELINE",
      confidenceSemantics: "SAMPLE_SIZE_BAND_NOT_PROBABILISTIC_CONFIDENCE",
      probabilisticCalibration: false,
      calibrationStatus: "NOT_APPLICABLE_DESCRIPTIVE",
    });
  });

  it("adapts a sufficient P4 cohort without leaking merchant identifiers", () => {
    const result = adaptP4BenchmarkCohortToCpicV0(
      Array.from({ length: 10 }, (_, index) => row(index)),
      {
        cohortRef: "fr-small-payments-2026-07",
        unit: "BPS",
        predictionTime: TIME,
      },
    );
    expect(result).toMatchObject({
      status: "ABSTAIN",
      truth: { state: "BENCHMARK" },
      support: {
        status: "UNKNOWN_SUPPORT",
        heuristic_status: "EDGE_OF_SUPPORT",
        effective_n: 10,
      },
      calibration: { status: "NOT_APPLICABLE_DESCRIPTIVE", probabilistic_calibration: false },
      method: { class: "ROBUST_DESCRIPTIVE_BASELINE", trained_model_claim: false },
    });
    expect(JSON.stringify(result)).not.toMatch(/merchant-0|source_anon_id/);
  });

  it("abstains for an insufficient or mixed P4 cohort", () => {
    const insufficient = adaptP4BenchmarkCohortToCpicV0(
      Array.from({ length: 9 }, (_, index) => row(index)),
      { cohortRef: "fr-small", unit: "BPS", predictionTime: TIME },
    );
    expect(insufficient.status).toBe("ABSTAIN");
    const mixed = adaptP4BenchmarkCohortToCpicV0(
      [...Array.from({ length: 10 }, (_, index) => row(index)), row(10, { cohort_key: "small|ES|payments" })],
      { cohortRef: "mixed", unit: "BPS", predictionTime: TIME },
    );
    expect(mixed.status).toBe("ABSTAIN");
  });

  it("quarantines external P4 model/calibration claims without local registry evidence", () => {
    const result = adaptP4ServiceEstimateToCpicV0({
      estimate_id: "p4-1",
      target_spec_id: "provider-markup",
      model_version_id: "external-model-v1",
      lineage_hash: "lineage-1",
      as_of: "2026-08-12T00:00:00.000Z",
      training_cutoff: "2026-08-01T00:00:00.000Z",
      quantiles: { p10: 90, p50: 100, p90: 120 },
      interval: { lower: 80, upper: 130, level: 0.9, calibrated: true },
      support: { unique_merchants: 30, n_eff: 25 },
      ood: { status: "IN_DISTRIBUTION" },
    }, {
      subject_ref: "brand:1",
      unit: "BPS",
      available_at: TIME,
      prediction_time: TIME,
    });
    expect(result.status).toBe("ABSTAIN");
    expect(result.calibration.probabilistic_calibration).toBe(false);
    expect(result.decision_safety.reason_codes).toEqual(expect.arrayContaining([
      "REGISTERED_MODEL_EVIDENCE_MISSING",
      "UNSUPPORTED_CALIBRATION_CLAIM",
    ]));
  });

  it("persists the CPIC evidence envelope through the existing P4 function only", () => {
    const source = fs.readFileSync("base44/shared/logical/requestP4Estimate.ts", "utf8");
    expect(source).toContain("adaptP4ServiceEstimateToCpicV0");
    expect(source).toContain("cpic_contract: cpicContract");
    expect(source).toContain("calibration_locally_verified: false");
    expect(source).toContain("model_locally_registered: false");
    expect(source).toContain("material_automation_allowed: false");
    expect(source).not.toMatch(/entities\.(?:ModelRegistry|PredictionRegistry)\.create/);
  });
});
