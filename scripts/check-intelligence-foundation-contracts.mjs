#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configDir = path.join(root, "config", "intelligence");
const fail = (message) => {
  throw new Error(`intelligence_foundation_contract_invalid:${message}`);
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
const unique = (values, label) => {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`duplicate:${label}:${value}`);
    seen.add(value);
  }
  return seen;
};
const exact = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`enum:${label}`);
  }
};

const experience = read("universal-experience.v1.json");
const events = read("experience-event-registry.v1.json");
const eligibility = read("learning-eligibility-policy.v1.json");
const feature = read("feature-registry.v1.json");
const label = read("label-registry.v1.json");
const dataset = read("dataset-registry.v1.json");
const model = read("model-registry.v1.json");
const prediction = read("prediction-registry.v1.json");

if (experience.schema_version !== "universal-experience.v1") {
  fail("experience_schema_version");
}
if (experience.physical_projection?.entity !== "Event") {
  fail("experience_must_reuse_event");
}
if (experience.physical_projection?.exactly_once_claimed !== false) {
  fail("exactly_once_false_claim");
}
for (
  const field of [
    "experience_id",
    "tenant_id",
    "occurred_at",
    "available_at",
    "decision",
    "authority",
    "execution",
    "outcome",
    "learning",
    "privacy",
    "trace",
    "is_demo",
    "is_synthetic",
    "is_test",
    "is_replay",
    "idempotency_key",
    "payload_content_hash",
  ]
) {
  if (!experience.required_fields.includes(field)) {
    fail(`experience_required:${field}`);
  }
}
exact(
  experience.learning_state_enum,
  ["INELIGIBLE", "QUARANTINED", "CLEARED"],
  "experience_learning_state",
);
for (
  const field of [
    "schema_valid",
    "identity_resolution_status",
    "provenance_completeness",
    "context_completeness",
    "execution_certainty",
    "outcome_certainty",
    "temporal_consistency",
    "currency_unit_validity",
    "contradiction_status",
    "privacy_eligibility",
    "learning_eligibility",
  ]
) {
  if (!experience.data_quality_required_fields.includes(field)) {
    fail(`experience_data_quality_required:${field}`);
  }
}

if (events.schema_version !== "experience-event-registry.v1") {
  fail("event_registry_version");
}
if (!Array.isArray(events.events) || events.events.length < 40) {
  fail("event_registry_coverage");
}
unique(
  events.events.map((entry) => `${entry.event_type}@${entry.event_version}`),
  "event_contract",
);
for (const entry of events.events) {
  if (!/^[-a-z0-9_]+(?:\.[-a-z0-9_]+)+$/i.test(entry.event_type)) {
    fail(`event_namespace:${entry.event_type}`);
  }
  if (!Number.isInteger(entry.event_version) || entry.event_version < 1) {
    fail(`event_version:${entry.event_type}`);
  }
  if (
    !["CONTRACT_ONLY", "ADAPTER_PARTIAL", "RUNTIME_VERIFIED", "DEPRECATED"]
      .includes(entry.runtime_state)
  ) {
    fail(`event_runtime_state:${entry.event_type}`);
  }
  if (
    entry.runtime_state === "RUNTIME_VERIFIED" &&
    events.runtime_evidence.length === 0
  ) {
    fail(`event_verified_without_evidence:${entry.event_type}`);
  }
}

exact(
  eligibility.decision_states,
  ["INELIGIBLE", "QUARANTINED", "CLEARED"],
  "eligibility_states",
);
const mandatoryGates = [
  "PHASE_0_GLOBAL_RECONCILIATION",
  "INTELLIGENCE_FOUNDATION_INTEGRATED",
  "SHARED_PRIVACY_TENANT_GATE",
  "SHARED_AUTHORITY_GATE",
];
exact(
  eligibility.mandatory_gate_ids,
  mandatoryGates,
  "mandatory_learning_gates",
);
if (
  !eligibility.cleared_requires?.tenant ||
  !eligibility.cleared_requires?.evidence ||
  !eligibility.cleared_requires?.privacy ||
  !eligibility.cleared_requires?.time ||
  !eligibility.cleared_requires?.gates
) fail("eligibility_gate_dimensions");
if (!eligibility.blockers.includes("MANDATORY_GATES_CURRENTLY_BLOCKED")) {
  fail("eligibility_false_ready");
}

const registrySpecs = [
  [feature, "feature-registry.v1"],
  [label, "label-registry.v1"],
  [dataset, "dataset-registry.v1"],
  [model, "model-registry.v1"],
  [prediction, "prediction-registry.v1"],
];
for (const [registry, version] of registrySpecs) {
  if (registry.schema_version !== version) fail(`registry_version:${version}`);
  if (registry.registry_state !== "CONTRACT_ONLY") {
    fail(`registry_state:${version}`);
  }
  if (registry.authority !== "SINGLE_SHARED_CAMBRA_INTELLIGENCE_REGISTRY") {
    fail(`registry_authority:${version}`);
  }
  if (
    !Array.isArray(registry.record_schema?.required) ||
    registry.record_schema.required.length < 10
  ) fail(`registry_schema:${version}`);
  if (!Array.isArray(registry.records) || registry.records.length !== 0) {
    fail(`registry_records_must_be_empty:${version}`);
  }
  if (
    !Array.isArray(registry.runtime_evidence) ||
    registry.runtime_evidence.length !== 0
  ) fail(`registry_runtime_false_claim:${version}`);
  if (!Array.isArray(registry.blockers) || registry.blockers.length === 0) {
    fail(`registry_blockers:${version}`);
  }
}
if (
  !model.record_schema.stage_enum.includes("CHAMPION") ||
  !model.promotion_requires.includes("frozen_holdout")
) {
  fail("model_promotion_contract");
}
if (
  !dataset.record_schema.required.includes("content_hash") ||
  !dataset.invariants.some((item) => item.includes("immutable"))
) {
  fail("dataset_immutability_contract");
}
if (!label.invariants.some((item) => item.includes("never ground truth"))) {
  fail("anti_self_training_contract");
}
if (!prediction.invariants.some((item) => item.includes("not an approval"))) {
  fail("prediction_authority_contract");
}

const eventEntity = JSON.parse(
  fs.readFileSync(path.join(root, "base44", "entities", "Event.jsonc"), "utf8"),
);
const eventProperties = eventEntity.properties || {};
for (
  const field of [
    "experience_id",
    "schema_version",
    "event_version",
    "tenant_id",
    "tenant_scope",
    "idempotency_key",
    "occurred_at",
    "observed_at",
    "recorded_at",
    "effective_at",
    "available_at",
    "payload_content_hash",
    "actor_json",
    "identity_json",
    "source_json",
    "decision_json",
    "producer_json",
    "authority_json",
    "execution_json",
    "outcome_json",
    "learning_json",
    "privacy_json",
    "trace_json",
    "data_quality_json",
  ]
) {
  if (!eventProperties[field]) fail(`event_projection_field:${field}`);
}
exact(
  eventEntity.required,
  ["brand_id", "event_type", "source"],
  "event_legacy_required_fields",
);

const moduleSource = fs.readFileSync(
  path.join(root, "base44", "shared", "intelligenceFoundationContracts.ts"),
  "utf8",
);
for (
  const marker of [
    "validateUniversalExperience",
    "projectUniversalExperienceToEvent",
    "evaluateLearningEligibility",
    "POINT_IN_TIME_LEAKAGE",
    "AGGREGATE_K_BELOW_10",
    "SELF_REFERENTIAL_LABEL",
    "LABEL_MINIMUM_VERIFICATION_TIER_MISSING",
  ]
) {
  if (!moduleSource.includes(marker)) fail(`shared_validator_marker:${marker}`);
}

console.log(
  `intelligence-foundation-contracts:check PASS — ${events.events.length} event contracts · ${registrySpecs.length} empty shared registries · eligibility fail-closed · 0 runtime/model readiness claims`,
);
