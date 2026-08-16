#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configDir = path.join(root, "config", "intelligence");
const fail = (message) => {
  throw new Error(`intelligence_evaluation_contract_invalid:${message}`);
};
const read = (name) => {
  const file = path.join(configDir, name);
  if (!fs.existsSync(file)) fail(`missing:${name}`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(
      `json:${name}:${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
const exact = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`enum:${label}`);
  }
};
const includesAll = (actual, required, label) => {
  if (!Array.isArray(actual)) fail(`array:${label}`);
  for (const value of required) {
    if (!actual.includes(value)) fail(`missing:${label}:${value}`);
  }
};

const harness = read("evaluation-harness.v1.json");
if (harness.schema_version !== "evaluation-harness.v1") fail("schema_version");
if (harness.contract_state !== "CONTRACT_ONLY") fail("contract_state");
if (
  harness.authority !== "SINGLE_SHARED_CAMBRA_INTELLIGENCE_EVALUATION_HARNESS"
) fail("authority");
exact(harness.evaluation_layers, [
  "CONTRACT",
  "DATA",
  "OFFLINE_MODEL",
  "ADVERSARIAL",
  "SHADOW",
  "CANARY",
  "OUTCOME",
  "SYSTEM",
  "AUTHORITY",
], "evaluation_layers");
exact(harness.required_baseline_kinds, [
  "CURRENT_PRODUCTION",
  "ABSTAIN_DO_NOTHING",
  "DETERMINISTIC_RULE",
  "STATISTICAL_BASELINE",
], "baseline_kinds");
includesAll(harness.baseline_kinds, [
  ...harness.required_baseline_kinds,
  "CALIBRATED_HEURISTIC",
  "CURRENT_CHAMPION",
  "DOMAIN_SPECIFIC",
], "allowed_baseline_kinds");
exact(harness.mandatory_segment_cuts, [
  "tenant",
  "country",
  "language",
  "currency",
  "industry",
  "merchant_size",
  "provider",
  "channel_source",
  "outcome_verification_tier",
  "low_data_new_segment",
  "time_cohort",
], "segment_cuts");
if (harness.mandatory_safety_categories?.length !== 14) {
  fail("safety_category_coverage");
}

const schemaNames = [
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
];
for (const name of schemaNames) {
  if (!harness.schemas?.[name]) fail(`schema:${name}`);
}
includesAll(harness.schemas.problem_contract.required, [
  "decision_to_improve",
  "action_enabled",
  "current_baselines",
  "false_positive_cost",
  "false_negative_cost",
  "authority_class",
  "label_contract_ref",
  "privacy_security_assessment_ref",
  "evidence_refs",
], "problem_required");
includesAll(harness.schemas.metric_contract.required, [
  "formula",
  "direction",
  "population",
  "exclusions",
  "window",
  "confidence_interval_method",
  "minimum_sample",
  "segment_cuts",
  "materiality_threshold",
  "baseline_ref",
  "source_refs",
  "owner",
], "metric_required");
includesAll(harness.schemas.holdout_contract.required, [
  "content_hash",
  "frozen",
  "immutable",
  "independent_from_training",
  "prediction_cutoff_at",
  "treatment_started_at",
  "latest_feature_available_at",
  "leakage_report",
  "evidence_refs",
], "holdout_required");
includesAll(harness.schemas.safety_report.required, [
  "tenant_leakage_count",
  "authority_regression_count",
  "unsupported_claim_rate",
  "unsupported_claim_threshold",
  "evidence_refs",
], "safety_required");
includesAll(harness.schemas.reproducibility_report.required, [
  "code_ref",
  "dependency_lock_ref",
  "dataset_content_hash",
  "random_seeds",
  "artifact_hash",
  "rerun_tolerance",
  "observed_rerun_delta",
  "within_tolerance",
  "signed_evaluation_report_ref",
  "evidence_refs",
], "reproducibility_required");

for (const [name, records] of Object.entries(harness.records || {})) {
  if (!Array.isArray(records) || records.length !== 0) {
    fail(`harness_records_must_be_empty:${name}`);
  }
}
if (Object.keys(harness.records || {}).length !== 4) {
  fail("harness_record_sets");
}
if (
  !Array.isArray(harness.physical_resources_created) ||
  harness.physical_resources_created.length !== 0
) {
  fail("physical_resource_claim");
}
if (
  !Array.isArray(harness.runtime_evidence) ||
  harness.runtime_evidence.length !== 0
) {
  fail("runtime_evidence_false_claim");
}
if (!Array.isArray(harness.blockers) || harness.blockers.length < 5) {
  fail("blockers");
}
if (
  harness.schemas.promotion_packet.decision_policy !==
    "A structurally valid packet remains EVIDENCE_UNVERIFIED and HUMAN_REVIEW_REQUIRED. This contract cannot promote a model."
) fail("promotion_policy");

for (
  const name of [
    "feature-registry.v1.json",
    "label-registry.v1.json",
    "dataset-registry.v1.json",
    "model-registry.v1.json",
    "prediction-registry.v1.json",
  ]
) {
  const registry = read(name);
  if (registry.registry_state !== "CONTRACT_ONLY") {
    fail(`registry_state:${name}`);
  }
  if (!Array.isArray(registry.records) || registry.records.length !== 0) {
    fail(`registry_records:${name}`);
  }
  if (
    !Array.isArray(registry.runtime_evidence) ||
    registry.runtime_evidence.length !== 0
  ) {
    fail(`registry_runtime_evidence:${name}`);
  }
}

const source = fs.readFileSync(
  path.join(root, "base44", "shared", "intelligenceEvaluationContract.ts"),
  "utf8",
);
for (
  const marker of [
    "validateProblemContract",
    "validateMetricContract",
    "validateEvaluationPacket",
    "EMPTY_EVIDENCE",
    "POST_TREATMENT_LEAKAGE",
    "HOLDOUT_NOT_FROZEN",
    "MISSING_SEGMENT_CUT",
    "CALIBRATION_REPORT_NOT_PASS",
    "SAFETY_REPORT_NOT_PASS",
    "COST_BEYOND_HARD_CAP",
    "NON_REPRODUCIBLE_RESULT",
    "promotion_allowed: false",
    "evidence_verified: false",
  ]
) {
  if (!source.includes(marker)) fail(`validator_marker:${marker}`);
}
if (/promotion_allowed:\s*true/.test(source)) fail("automatic_promotion_path");
if (/evidence_verified:\s*true/.test(source)) {
  fail("evidence_verification_claim");
}

console.log(
  "intelligence-evaluation-contract:check PASS — 11 schemas · 11 mandatory segment cuts · 14 mandatory safety categories · 0 evaluation/model/dataset records · 0 runtime/promotion claims",
);
