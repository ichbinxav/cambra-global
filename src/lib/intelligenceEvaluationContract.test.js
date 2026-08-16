import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVALUATION_BASELINE_KINDS,
  EVALUATION_HARNESS_VERSION,
  EVALUATION_SAFETY_CATEGORIES,
  EVALUATION_SEGMENT_CUTS,
  validateEvaluationPacket,
  validateMetricContract,
  validateProblemContract,
} from "../../base44/shared/intelligenceEvaluationContract.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function evidence(name) {
  return [`artifact://evaluation-fixture/${name}`];
}

function problem() {
  return {
    problem_id: "lead-progression-ranking",
    problem_version: "1.0.0",
    problem_type: "RANKING",
    decision_to_improve: "Rank eligible companies for human commercial review.",
    business_owner: "Founder",
    affected_population: "Eligible tenant-private merchant candidates.",
    prediction_time_definition:
      "Immediately before ranking; before contact selection.",
    action_enabled: "Order an advisory queue; no automatic contact or send.",
    current_baselines: EVALUATION_BASELINE_KINDS.map((kind) => ({
      kind,
      ref: `baseline://${kind.toLowerCase()}/1`,
      evidence_refs: evidence(`baseline-${kind.toLowerCase()}`),
    })),
    false_positive_cost: 10,
    false_negative_cost: 5,
    required_latency_ms: 500,
    authority_class: "ADVISORY_ONLY",
    label_contract_ref: "label://lead-progression/1",
    label_maturity: "30 days after confirmed exposure",
    evaluation_guardrails: ["tenant leakage = 0", "no automatic contact"],
    fallback_ref: "baseline://deterministic-rule/1",
    expected_value_hypothesis:
      "Improve reviewed qualified opportunities without raising contact cost.",
    stop_criteria: ["tenant leak", "authority regression", "hard cost cap"],
    privacy_security_assessment_ref: "review://privacy-security/1",
    evidence_refs: evidence("problem"),
  };
}

function metric() {
  return {
    metric_id: "ndcg-at-20",
    metric_version: "1.0.0",
    name: "NDCG@20",
    formula: "discounted cumulative gain divided by ideal gain at k=20",
    direction: "HIGHER_IS_BETTER",
    population: "frozen temporal holdout",
    exclusions: ["censored outcomes"],
    window: "30 days",
    confidence_interval_method: "tenant-group bootstrap",
    minimum_sample: 100,
    segment_cuts: [...EVALUATION_SEGMENT_CUTS],
    materiality_threshold: 0.02,
    baseline_ref: "baseline://deterministic-rule/1",
    source_refs: evidence("metric-source"),
    owner: "CAMBRA Intelligence",
    is_primary: true,
  };
}

function packet() {
  return {
    evaluation_id: "evaluation-fixture-1",
    evaluation_version: "1.0.0",
    evaluated_at: "2026-08-13T10:00:00.000Z",
    problem: problem(),
    candidate: {
      candidate_id: "candidate-fixture-1",
      candidate_version: "0.1.0",
      model_type: "STATISTICAL",
      artifact_ref: "artifact://candidate-fixture-1",
      artifact_hash: HASH_A,
      training_run_ref: "training-run://fixture-1",
      evidence_refs: evidence("candidate"),
    },
    holdout: {
      dataset_id: "dataset-fixture-1",
      dataset_version: "1.0.0",
      content_hash: HASH_B,
      manifest_ref: "manifest://dataset-fixture-1",
      split_strategy: "TEMPORAL_GROUPED",
      frozen: true,
      immutable: true,
      independent_from_training: true,
      training_end_at: "2026-01-31T23:59:59.000Z",
      holdout_start_at: "2026-02-01T00:00:00.000Z",
      holdout_end_at: "2026-03-01T00:00:00.000Z",
      prediction_cutoff_at: "2026-02-01T08:00:00.000Z",
      treatment_started_at: "2026-02-01T08:00:00.000Z",
      latest_feature_available_at: "2026-01-31T23:59:59.000Z",
      leakage_report: {
        status: "PASS",
        post_treatment_feature_count: 0,
        post_outcome_feature_count: 0,
        future_information_count: 0,
        identity_overlap_count: 0,
        evidence_refs: evidence("leakage"),
      },
      evidence_refs: evidence("holdout"),
    },
    metrics: [metric()],
    segments: {
      status: "PASS",
      cuts: EVALUATION_SEGMENT_CUTS.map((name) => ({
        name,
        status: "EVALUATED",
        sample_size: 100,
        material_regression: false,
        evidence_refs: evidence(`segment-${name}`),
      })),
      material_regressions: [],
      unsupported_segments: [],
      evidence_refs: evidence("segments"),
    },
    calibration: {
      status: "PASS",
      applicability: "APPLICABLE",
      method: "isotonic on validation only",
      candidate_result: { ece: 0.03 },
      baseline_result: { ece: 0.04 },
      non_regression: true,
      evidence_refs: evidence("calibration"),
    },
    safety: {
      status: "PASS",
      tests: EVALUATION_SAFETY_CATEGORIES.map((category) => ({
        category,
        status: "PASS",
        evidence_refs: evidence(`safety-${category.toLowerCase()}`),
      })),
      tenant_leakage_count: 0,
      authority_regression_count: 0,
      unsupported_claim_rate: 0,
      unsupported_claim_threshold: 0.01,
      privacy_review_ref: "review://privacy/1",
      authority_review_ref: "review://authority/1",
      evidence_refs: evidence("safety"),
    },
    cost_latency: {
      status: "PASS",
      currency: "EUR",
      candidate_cost: 2,
      hard_cost_cap: 5,
      net_utility: 20,
      p95_latency_ms: 100,
      latency_slo_ms: 500,
      cost_attribution_refs: evidence("cost-attribution"),
      evidence_refs: evidence("cost-latency"),
    },
    reproducibility: {
      status: "PASS",
      code_ref: "git://fixture@immutable-sha",
      dependency_lock_ref: "artifact://package-lock",
      dataset_content_hash: HASH_B,
      feature_contract_versions: ["lead-feature-contract@1"],
      label_contract_versions: ["lead-progression-label@1"],
      random_seeds: [7, 19, 41],
      environment_ref: "artifact://environment-lock",
      logs_ref: "artifact://training-logs",
      artifact_hash: HASH_A,
      reproduction_command_ref: "artifact://reproduction-command",
      rerun_tolerance: 0.001,
      observed_rerun_delta: 0.0001,
      within_tolerance: true,
      signed_evaluation_report_ref: "artifact://signed-evaluation",
      evidence_refs: evidence("reproducibility"),
    },
    promotion: {
      requested_stage: "SHADOW",
      problem_contract_ref: "problem://lead-progression-ranking/1.0.0",
      model_card_ref: "model-card://candidate-fixture-1",
      dataset_card_ref: "dataset-card://dataset-fixture-1",
      evaluation_report_ref: "evaluation://evaluation-fixture-1",
      baseline_comparison_ref: "comparison://baseline-candidate/1",
      segment_report_ref: "segments://evaluation-fixture-1",
      shadow_report_ref: "shadow://controlled-fixture/1",
      privacy_security_authority_review_ref: "review://combined/1",
      cost_latency_report_ref: "cost-latency://evaluation-fixture-1",
      rollback_test_ref: "rollback-test://fixture-1",
      owner_on_call: "CAMBRA Intelligence",
      start_at: "2026-08-14T00:00:00.000Z",
      review_at: "2026-08-21T00:00:00.000Z",
      approvals: [{
        approval_id: "approval-fixture-1",
        approved_by: "founder-fixture",
        scope: "contract-test-only",
        evidence_refs: evidence("approval"),
      }],
      evidence_refs: evidence("promotion-packet"),
    },
    evidence_refs: evidence("evaluation-packet"),
  };
}

describe("CAMBRA single Evaluation Harness contract", () => {
  it("publishes one machine-readable contract while every data/model registry remains empty", () => {
    const harness = JSON.parse(fs.readFileSync(
      "config/intelligence/evaluation-harness.v1.json",
      "utf8",
    ));
    expect(harness).toMatchObject({
      schema_version: EVALUATION_HARNESS_VERSION,
      contract_state: "CONTRACT_ONLY",
      authority: "SINGLE_SHARED_CAMBRA_INTELLIGENCE_EVALUATION_HARNESS",
      records: {
        problems: [],
        metrics: [],
        evaluations: [],
        promotion_packets: [],
      },
      physical_resources_created: [],
      runtime_evidence: [],
    });
    expect(Object.keys(harness.schemas)).toEqual(expect.arrayContaining([
      "problem_contract",
      "metric_contract",
      "candidate_contract",
      "holdout_contract",
      "segment_report",
      "calibration_report",
      "safety_report",
      "cost_latency_report",
      "reproducibility_report",
      "promotion_packet",
      "evaluation_packet",
    ]));
    for (
      const name of [
        "feature-registry.v1.json",
        "label-registry.v1.json",
        "dataset-registry.v1.json",
        "model-registry.v1.json",
        "prediction-registry.v1.json",
      ]
    ) {
      const registry = JSON.parse(
        fs.readFileSync(`config/intelligence/${name}`, "utf8"),
      );
      expect(registry.records, name).toEqual([]);
      expect(registry.runtime_evidence, name).toEqual([]);
    }
  });

  it("accepts a complete hypothetical shape but never verifies evidence or permits promotion", () => {
    const result = validateEvaluationPacket(packet());
    expect(result).toEqual({
      contract_version: EVALUATION_HARNESS_VERSION,
      valid: true,
      decision: "CONTRACT_VALID_EVIDENCE_UNVERIFIED_HUMAN_REVIEW_REQUIRED",
      reason_codes: [],
      evidence_verified: false,
      registration_allowed: false,
      promotion_allowed: false,
      serving_allowed: false,
      authority_granted: false,
      human_review_required: true,
    });
  });

  it("refuses empty evidence at every evaluated boundary", () => {
    const input = packet();
    input.evidence_refs = [];
    input.holdout.leakage_report.evidence_refs = [];
    input.cost_latency.cost_attribution_refs = [];
    const result = validateEvaluationPacket(input);
    expect(result.valid).toBe(false);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "EMPTY_EVIDENCE:evaluation",
      "EMPTY_EVIDENCE:holdout.leakage_report",
      "EMPTY_EVIDENCE:cost_latency.cost_attribution_refs",
    ]));
  });

  it("refuses post-treatment, post-outcome, future and identity-overlap leakage", () => {
    const input = packet();
    input.holdout.latest_feature_available_at = "2026-02-02T00:00:00.000Z";
    input.holdout.leakage_report.post_treatment_feature_count = 1;
    input.holdout.leakage_report.post_outcome_feature_count = 1;
    input.holdout.leakage_report.future_information_count = 1;
    input.holdout.leakage_report.identity_overlap_count = 1;
    const result = validateEvaluationPacket(input);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "POST_TREATMENT_LEAKAGE",
      "POST_OUTCOME_LEAKAGE",
      "FUTURE_INFORMATION_LEAKAGE",
      "IDENTITY_SPLIT_LEAKAGE",
    ]));
  });

  it("refuses a holdout that is not frozen, immutable and independent", () => {
    const input = packet();
    input.holdout.frozen = false;
    input.holdout.immutable = false;
    input.holdout.independent_from_training = false;
    const result = validateEvaluationPacket(input);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "HOLDOUT_NOT_FROZEN",
      "HOLDOUT_NOT_IMMUTABLE",
      "HOLDOUT_NOT_INDEPENDENT_FROM_TRAINING",
    ]));
  });

  it.each([
    ["segments", "MISSING_REQUIRED_REPORT:segments"],
    ["calibration", "MISSING_REQUIRED_REPORT:calibration"],
    ["safety", "MISSING_REQUIRED_REPORT:safety"],
    ["cost_latency", "MISSING_REQUIRED_REPORT:cost_latency"],
    ["reproducibility", "MISSING_REQUIRED_REPORT:reproducibility"],
  ])("refuses a missing %s report", (field, reason) => {
    const input = packet();
    delete input[field];
    const result = validateEvaluationPacket(input);
    expect(result.valid).toBe(false);
    expect(result.reason_codes).toContain(reason);
  });

  it("requires all segment and adversarial categories and rejects material regressions", () => {
    const input = packet();
    input.segments.cuts = input.segments.cuts.filter(({ name }) =>
      name !== "currency"
    );
    input.segments.material_regressions = ["country:FR"];
    input.safety.tests = input.safety.tests.filter(
      ({ category }) => category !== "APPROVAL_BYPASS",
    );
    const result = validateEvaluationPacket(input);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "MISSING_SEGMENT_CUT:currency",
      "MATERIAL_SEGMENT_REGRESSION",
      "MISSING_SAFETY_TEST:APPROVAL_BYPASS",
    ]));
  });

  it("refuses cost, latency and reproducibility breaches", () => {
    const input = packet();
    input.cost_latency.candidate_cost = 6;
    input.cost_latency.p95_latency_ms = 501;
    input.reproducibility.observed_rerun_delta = 0.01;
    input.reproducibility.within_tolerance = false;
    const result = validateEvaluationPacket(input);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "COST_BEYOND_HARD_CAP",
      "LATENCY_SLO_EXCEEDED",
      "NON_REPRODUCIBLE_RESULT",
    ]));
  });

  it("refuses artifact and dataset lineage hash mismatches", () => {
    const input = packet();
    input.reproducibility.artifact_hash = HASH_B;
    input.reproducibility.dataset_content_hash = HASH_A;
    const result = validateEvaluationPacket(input);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "ARTIFACT_HASH_LINEAGE_MISMATCH",
      "DATASET_HASH_LINEAGE_MISMATCH",
    ]));
  });

  it("rejects problem contracts without an actionable decision and full baseline set", () => {
    const input = problem();
    input.action_enabled = "";
    input.current_baselines = input.current_baselines.slice(0, 1);
    const result = validateProblemContract(input);
    expect(result.valid).toBe(false);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "MISSING_REQUIRED_FIELD:problem.action_enabled",
      "MISSING_BASELINE:ABSTAIN_DO_NOTHING",
      "MISSING_BASELINE:DETERMINISTIC_RULE",
      "MISSING_BASELINE:STATISTICAL_BASELINE",
    ]));
  });

  it("rejects global-only metrics without segment cuts or source evidence", () => {
    const input = metric();
    input.segment_cuts = [];
    input.source_refs = [];
    const result = validateMetricContract(input);
    expect(result.valid).toBe(false);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "EMPTY_REQUIRED_ARRAY:metrics[0].segment_cuts",
      "EMPTY_EVIDENCE:metrics[0].source_refs",
    ]));
  });
});
