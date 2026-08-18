import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appendUniversalExperience,
  appendLearningEligibilityDecision,
  appendCommittedAdaptiveLeadDecision,
  ADAPTIVE_LEAD_EXPERIENCE_EVENT_TYPES,
  buildAdaptiveLeadDecisionExperiences,
  buildLearningEligibilityDecision,
  buildDiscoveryRunExperience,
  DISCOVERY_EXPERIENCE_EVENT_TYPES,
  evaluateLearningEligibility,
  expectedDiscoveryRunExperienceDescriptors,
  LEARNING_ELIGIBILITY_POLICY_VERSION,
  MANDATORY_LEARNING_GATE_IDS,
  projectUniversalExperienceToEvent,
  reconcileDiscoveryExperienceBatch,
  reconcileDiscoveryRunExperiences,
  UNIVERSAL_EXPERIENCE_SCHEMA_VERSION,
  validateUniversalExperience,
} from "../../base44/shared/intelligenceFoundationContracts.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const readConfig = (name) =>
  JSON.parse(
    fs.readFileSync(path.join(ROOT, "config", "intelligence", name), "utf8"),
  );
const HASH = `sha256:${"a".repeat(64)}`;

const validExperience = () => ({
  experience_id: "exp_test_001",
  schema_version: UNIVERSAL_EXPERIENCE_SCHEMA_VERSION,
  event_type: "recommendation.produced",
  event_version: 1,
  occurred_at: "2026-01-01T00:00:00.000Z",
  observed_at: "2026-01-01T00:00:01.000Z",
  recorded_at: "2026-01-01T00:00:02.000Z",
  effective_at: "2026-01-01T00:00:00.000Z",
  available_at: "2026-01-01T00:00:02.000Z",
  tenant_id: "brand_001",
  tenant_scope: "TENANT",
  idempotency_key: "recommendation:001:v1",
  payload_content_hash: HASH,
  actor: { type: "WORKER", id: "decision_worker", actor_version: "1.0.0" },
  identity: {
    merchant_id: "brand_001",
    company_id: "company_001",
    market: "FR",
  },
  source: {
    system: "IntelligenceSnapshot",
    entity_type: "IntelligenceSnapshot",
    record_id: "snapshot_001",
    content_hash: HASH,
    evidence_ids: ["evidence_001"],
  },
  context_snapshot_id: "snapshot_001",
  decision: {
    decision_id: "decision_001",
    decision_type: "RECOMMEND",
    reason_codes: ["EVIDENCE_SUPPORTED"],
  },
  producer: {
    code_version: "test",
    policy_version: "policy-v1",
    cambra_model_id: null,
  },
  authority: {
    authority_snapshot_id: "authority_001",
    decision: "ALLOW_WITHIN_POLICY",
    approval_required: false,
  },
  execution: { status: "NOT_PROPOSED", execution_id: null },
  outcome: { status: "PENDING", outcome_id: null },
  learning: {
    eligibility: "QUARANTINED",
    reason_codes: ["OUTCOME_NOT_VERIFIED"],
  },
  privacy: {
    classification: "CONFIDENTIAL",
    purpose: ["COMMERCIAL_OPERATION"],
    training_allowed: false,
    cross_tenant_allowed: false,
    retention_policy_key: "commercial-intelligence",
  },
  trace: {
    correlation_id: "trace_001",
    aggregate_id: "company_001",
    sequence_number: 1,
  },
  data_quality: {
    schema_valid: true,
    identity_resolution_status: "RESOLVED",
    provenance_completeness: "COMPLETE",
    context_completeness: "COMPLETE",
    execution_certainty: "NOT_APPLICABLE",
    outcome_certainty: "PENDING",
    temporal_consistency: "VALID",
    currency_unit_validity: "NOT_APPLICABLE",
    contradiction_status: "CLEAR",
    privacy_eligibility: "RESTRICTED_TO_OPERATION",
    learning_eligibility: "QUARANTINED",
  },
  is_demo: false,
  is_synthetic: false,
  is_test: true,
  is_replay: false,
  payload: { recommendation: "REVIEW" },
});

const committedDiscoveryRun = () => ({
  id: "run_reconstruct_001",
  run_key: "discovery:run_reconstruct_001",
  run_revision: 8,
  initiator: "SCHEDULED",
  created_by_email: "scheduled-discovery@cambra.internal",
  status: "COMPLETED_PARTIAL",
  current_stage: "COMPLETE",
  discovery_type: "MERCHANT",
  accepted_plan_hash: "b".repeat(64),
  source_capability_version: "discovery-source-capability.v2",
  selected_sources: ["AUTO"],
  target_count: 25,
  hard_cap_minor: 100,
  actual_stages_json: [
    {
      stage: "PLAN",
      status: "COMPLETED",
      at: "2026-02-01T00:00:01.000Z",
      paid: false,
    },
    {
      stage: "NATIVE_DISCOVERY",
      status: "COMPLETED",
      started_at: "2026-02-01T00:00:02.000Z",
      at: "2026-02-01T00:00:03.000Z",
      attempt: 1,
      paid: false,
    },
    {
      stage: "SELECTIVE_COMPANY_ENRICHMENT",
      status: "FAILED",
      started_at: "2026-02-01T00:00:03.100Z",
      at: "2026-02-01T00:00:03.900Z",
      attempt: 2,
      paid: false,
    },
    {
      stage: "SCORING",
      status: "COMPLETED",
      started_at: "2026-02-01T00:00:04.000Z",
      at: "2026-02-01T00:00:05.000Z",
      attempt: 3,
      paid: false,
      deterministic: true,
    },
  ],
  result_entity_type: "OutboundLead",
  result_ids: ["lead_1"],
  result_attribution_json: [{ result_ref: "lead_1", source: "AUTO" }],
  scoring_coverage_json: {
    status: "COMPLETE",
    requested: 1,
    scored: 1,
    missing: 0,
  },
  quality_json: { status: "OBSERVED" },
  terminal_snapshot_hash: "c".repeat(64),
  cost_reconciliation_json: { status: "RECONCILED", observed_minor: 0 },
  engine_version: "discovery-v2",
  started_at: "2026-02-01T00:00:00.000Z",
  completed_at: "2026-02-01T00:00:06.000Z",
});

const eventProjectionService = ({ failCreates = 0, seed = [] } = {}) => {
  const rows = [...seed];
  let remainingFailures = failCreates;
  let sourceMutations = 0;
  return {
    rows,
    get sourceMutations() {
      return sourceMutations;
    },
    service: {
      entities: {
        Event: {
          async filter({ idempotency_key }) {
            return rows.filter((row) =>
              row.idempotency_key === idempotency_key
            );
          },
          async create(row) {
            if (remainingFailures > 0) {
              remainingFailures -= 1;
              throw new Error("simulated_event_write_failure");
            }
            const saved = { id: `event_${rows.length + 1}`, ...row };
            rows.push(saved);
            return saved;
          },
        },
        DiscoveryExecutionRun: {
          async update() {
            sourceMutations += 1;
            throw new Error("terminal_source_must_not_be_mutated");
          },
          async updateMany() {
            sourceMutations += 1;
            throw new Error("terminal_source_must_not_be_mutated");
          },
        },
      },
    },
  };
};

const clearEligibilityInput = () => ({
  evaluated_at: "2026-02-02T00:00:00.000Z",
  requested_use_class: "MODEL_TRAINING",
  domain: "payments",
  purpose: "PAYMENTS_MODEL_EVALUATION",
  context_snapshot_id: "snapshot_learning_001",
  gates: MANDATORY_LEARNING_GATE_IDS.map((gate_id) => ({
    gate_id,
    status: "PASSED",
    runtime_evidence: [`runtime://${gate_id.toLowerCase()}`],
  })),
  additional_required_gate_ids: [],
  data: {
    revoked: false,
    is_demo: false,
    is_synthetic: false,
    is_test: false,
    is_replay: false,
    self_generated_label: false,
  },
  tenant: {
    tenant_id: "brand_001",
    tenant_scope: "TENANT",
    identity_status: "RESOLVED",
    identity_conflict: false,
  },
  evidence: {
    evidence_refs: ["evidence_001"],
    source_refs: ["MonthlySavingsReport:report_001"],
    provenance_status: "VERIFIED",
    verification_tier: "V4",
    contradiction_status: "CLEAR",
  },
  lineage: {
    experience_refs: ["experience_001"],
    evidence_refs: ["evidence_001"],
    observation_refs: ["observation_001"],
    claim_refs: ["claim_001"],
    outcome_refs: ["outcome_001"],
    execution_receipt_refs: ["receipt_001"],
  },
  privacy: {
    training_allowed: true,
    requested_purpose: "PAYMENTS_MODEL_EVALUATION",
    allowed_purposes: ["PAYMENTS_MODEL_EVALUATION"],
    allowed_scopes: ["tenant_private"],
    legal_basis: "contract_and_legitimate_interest_reviewed",
    retention_policy_key: "payments-learning-v1",
    restriction_active: false,
    special_category_data: false,
    cross_tenant_allowed: false,
  },
  execution: {
    status: "EXECUTED",
    execution_id: "receipt_001",
    idempotency_key: "migration:001",
  },
  outcome: {
    status: "RECONCILED",
    outcome_id: "outcome_001",
    verification_source_id: "report_001",
    label_mature: true,
  },
  label: {
    definition_id: "verified_savings_realized",
    definition_version: "1.0.0",
    minimum_verification_tier: "V4",
    source: "DETERMINISTIC_DOMAIN_TRUTH",
  },
  time: {
    occurred_at: "2026-01-01T00:00:00.000Z",
    observed_at: "2026-01-01T00:00:01.000Z",
    recorded_at: "2026-01-01T00:00:02.000Z",
    effective_at: "2026-01-01T00:00:00.000Z",
    available_at: "2026-01-01T00:00:02.000Z",
    training_cutoff: "2025-12-31T23:59:59.000Z",
    prediction_time: "2026-01-02T00:00:00.000Z",
    outcome_mature_at: "2026-02-01T00:00:00.000Z",
    evaluated_at: "2026-02-02T00:00:00.000Z",
  },
});

const learningDecisionService = () => {
  const input = clearEligibilityInput();
  const created = [];
  const records = {
    Event: new Map([
      ["experience_001", {
        id: "experience_001",
        tenant_id: "brand_001",
        brand_id: "brand_001",
        tenant_scope: "TENANT",
        schema_version: UNIVERSAL_EXPERIENCE_SCHEMA_VERSION,
        status: "processed",
        occurred_at: "2026-01-01T00:00:00.000Z",
        observed_at: "2026-01-01T00:00:01.000Z",
        recorded_at: "2026-01-01T00:00:02.000Z",
        effective_at: "2026-01-01T00:00:00.000Z",
        available_at: "2026-01-01T00:00:02.000Z",
        identity_json: { purpose: input.purpose },
        privacy_json: { purpose: [input.purpose] },
        is_demo: false,
        is_synthetic: false,
        is_test: false,
        is_replay: false,
      }],
      ["receipt_001", {
        id: "receipt_001",
        tenant_id: "brand_001",
        brand_id: "brand_001",
        tenant_scope: "TENANT",
        idempotency_key: "migration:001",
        status: "processed",
        processed_at: "2026-01-10T00:00:00.000Z",
        identity_json: { purpose: input.purpose },
        privacy_json: { purpose: [input.purpose] },
        execution_json: {
          status: "EXECUTED",
          executed_at: "2026-01-10T00:00:00.000Z",
        },
      }],
    ]),
    IntelligenceEvidence: new Map([["evidence_001", {
      id: "evidence_001",
      tenant_scope: "tenant",
      brand_id: "brand_001",
      domain: "payments",
      purpose: input.purpose,
      source_reference: "MonthlySavingsReport:report_001",
      truth_level: "verified_official",
      effective_at: "2026-01-01T00:00:00.000Z",
      observed_at: "2026-01-01T00:00:01.000Z",
      recorded_at: "2026-01-01T00:00:02.000Z",
      quarantined: false,
      is_demo: false,
    }]]),
    IntelligenceObservation: new Map([["observation_001", {
      id: "observation_001",
      tenant_scope: "tenant",
      brand_id: "brand_001",
      domain: "payments",
      purpose: input.purpose,
      evidence_id: "evidence_001",
      status: "verified",
      effective_at: "2026-01-01T00:00:00.000Z",
      observed_at: "2026-01-01T00:00:02.000Z",
    }]]),
    KnowledgeClaim: new Map([["claim_001", {
      id: "claim_001",
      tenant_scope: "tenant",
      brand_id: "brand_001",
      domain: "payments",
      purpose: input.purpose,
      evidence_ids: ["evidence_001"],
      observation_ids: ["observation_001"],
      effective_at: "2026-01-01T00:00:00.000Z",
      observed_at: "2026-01-01T00:00:03.000Z",
    }]]),
    IntelligenceOutcome: new Map([["outcome_001", {
      id: "outcome_001",
      tenant_scope: "tenant",
      brand_id: "brand_001",
      domain: "payments",
      purpose: input.purpose,
      success: true,
      negative_knowledge: false,
      verification_source_type: "MonthlySavingsReport",
      verification_source_id: "report_001",
      related_entity_id: "report_001",
      verification_source_validated: true,
      label_mature: true,
      label_mature_at: "2026-02-01T00:00:00.000Z",
      captured_at: "2026-02-01T00:00:00.000Z",
      is_demo: false,
    }]]),
    IntelligenceSnapshot: new Map([["snapshot_learning_001", {
      id: "snapshot_learning_001",
      brand_id: "brand_001",
      snapshot_hash: HASH,
      captured_at: "2026-01-02T00:00:00.000Z",
      snapshot_json: {
        domain: input.domain,
        purpose: input.purpose,
      },
    }]]),
    MonthlySavingsReport: new Map([["report_001", {
      id: "report_001",
      brand_id: "brand_001",
      measurement_mode: "fully_verified",
      verification_status: "verified",
      verified_at: "2026-02-01T00:00:00.000Z",
    }]]),
  };
  const entities = Object.fromEntries(Object.entries(records).map(
    ([name, rows]) => [name, {
      async get(id) {
        return rows.get(id) || null;
      },
    }],
  ));
  entities.Event.filter = async ({ idempotency_key }) =>
    created.filter((row) => row.idempotency_key === idempotency_key);
  entities.Event.create = async (row) => {
    const saved = { id: `eligibility_event_${created.length + 1}`, ...row };
    created.push(saved);
    return saved;
  };
  entities.RuntimeGateEvidence = {
    async filter({ gate_key }) {
      return [{
        id: `gate_${gate_key}`,
        gate_key,
        status: "PASS",
        evidence_kind: "REAL_RUNTIME",
        evidence_refs: [`runtime://${gate_key.toLowerCase()}`],
        observed_at: "2026-02-01T00:00:00.000Z",
        expires_at: "2027-02-01T00:00:00.000Z",
      }];
    },
  };
  return { service: { entities }, created, records };
};

describe("CAMBRA Intelligence v2 Phase-1 shared foundation", () => {
  it("validates and projects one Universal Experience through the existing Event entity", () => {
    const experience = validExperience();
    expect(validateUniversalExperience(experience)).toEqual({
      ok: true,
      errors: [],
    });
    const event = projectUniversalExperienceToEvent(experience);
    expect(event).toMatchObject({
      brand_id: "brand_001",
      tenant_id: "brand_001",
      experience_id: "exp_test_001",
      schema_version: UNIVERSAL_EXPERIENCE_SCHEMA_VERSION,
      event_type: "recommendation.produced",
      event_version: 1,
      idempotency_key: "recommendation:001:v1",
      context_snapshot_id: "snapshot_001",
      status: "processed",
    });
    expect(event.decision_json).toEqual(experience.decision);
    expect(event.outcome_json).toEqual(experience.outcome);
  });

  it("builds a truthful quarantined Discovery experience from the durable run", async () => {
    const experience = await buildDiscoveryRunExperience({
      id: "run_001",
      run_key: "discovery:run_001",
      run_revision: 4,
      initiator: "SCHEDULED",
      created_by_email: "scheduled-discovery@cambra.internal",
      status: "COMPLETED",
      current_stage: "COMPLETE",
      accepted_plan_hash: "b".repeat(64),
      source_capability_version: "discovery-source-capability.v2",
      result_ids: ["lead_1"],
      result_attribution_json: [{ result_ref: "lead_1" }],
      scoring_coverage_json: { requested: 1, scored: 1, missing: 0 },
      terminal_snapshot_hash: "c".repeat(64),
      cost_reconciliation_json: { status: "RECONCILED", observed_minor: 0 },
      engine_version: "discovery-v2",
      started_at: "2026-02-01T00:00:00.000Z",
      completed_at: "2026-02-01T00:01:00.000Z",
    }, "discovery.result.scored", "SCORING");
    expect(validateUniversalExperience(experience)).toEqual({
      ok: true,
      errors: [],
    });
    expect(experience).toMatchObject({
      event_type: "discovery.result.scored",
      idempotency_key:
        "discovery:run_001:scoring.discovery-result-scored:discovery.result.scored",
      learning: {
        eligibility: "QUARANTINED",
        reason_codes: expect.arrayContaining([
          "DISCOVERY_OPERATIONAL_TRUTH_RUNTIME_NOT_VERIFIED",
        ]),
      },
      privacy: { training_allowed: false },
    });
    expect(experience.payload.source_snapshot.result_ids).toEqual(["lead_1"]);
  });

  it("reconstructs every Discovery event family from one already committed terminal run", async () => {
    const run = committedDiscoveryRun();
    const descriptors = expectedDiscoveryRunExperienceDescriptors(run);
    expect(new Set(descriptors.map((item) => item.event_type))).toEqual(
      new Set(DISCOVERY_EXPERIENCE_EVENT_TYPES),
    );

    const projection = eventProjectionService();
    const first = await reconcileDiscoveryRunExperiences(
      projection.service,
      run,
    );
    expect(first).toMatchObject({
      ok: true,
      run_id: run.id,
      expected: descriptors.length,
      created: descriptors.length,
      duplicate: 0,
      errors: [],
    });
    expect(projection.rows).toHaveLength(descriptors.length);
    expect(projection.rows.every((row) =>
      row.learning_json.eligibility === "QUARANTINED" &&
      row.privacy_json.training_allowed === false
    )).toBe(true);
    expect(projection.sourceMutations).toBe(0);

    const replay = await reconcileDiscoveryRunExperiences(
      projection.service,
      run,
    );
    expect(replay).toMatchObject({
      ok: true,
      created: 0,
      duplicate: descriptors.length,
      errors: [],
    });
    expect(projection.rows).toHaveLength(descriptors.length);
    expect(projection.sourceMutations).toBe(0);
  });

  it("recovers a missing Event on retry without rewriting the committed Discovery source", async () => {
    const run = committedDiscoveryRun();
    const projection = eventProjectionService({ failCreates: 1 });
    const first = await reconcileDiscoveryRunExperiences(
      projection.service,
      run,
    );
    expect(first.ok).toBe(false);
    expect(first.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "simulated_event_write_failure" }),
    ]));

    const retry = await reconcileDiscoveryRunExperiences(
      projection.service,
      run,
    );
    expect(retry).toMatchObject({ ok: true, created: 1, errors: [] });
    expect(projection.rows).toHaveLength(first.expected);
    expect(projection.sourceMutations).toBe(0);
  });

  it("keeps an active stage-start projection hash stable after that stage commits", async () => {
    const terminal = committedDiscoveryRun();
    const active = {
      ...terminal,
      status: "RUNNING",
      current_stage: "SCORING",
      stage_attempt: 3,
      stage_attempt_token: "attempt-token-3",
      stage_started_at: "2026-02-01T00:00:04.000Z",
      actual_stages_json: terminal.actual_stages_json.slice(0, -1),
      completed_at: null,
      terminal_snapshot_hash: null,
      result_ids: [],
      result_attribution_json: [],
      scoring_coverage_json: { status: "NOT_STARTED" },
    };
    const projection = eventProjectionService();
    const beforeCommit = await reconcileDiscoveryRunExperiences(
      projection.service,
      active,
    );
    expect(beforeCommit.ok).toBe(true);

    const afterCommit = await reconcileDiscoveryRunExperiences(
      projection.service,
      terminal,
    );
    expect(afterCommit.ok).toBe(true);
    expect(afterCommit.errors).toEqual([]);
    expect(projection.rows.filter((row) =>
      row.idempotency_key.includes("stage.attempt.3.scoring.started")
    )).toHaveLength(1);
  });

  it("surfaces same projection key with different content as an integrity conflict", async () => {
    const run = committedDiscoveryRun();
    const descriptors = expectedDiscoveryRunExperienceDescriptors(run);
    const firstExperience = await buildDiscoveryRunExperience(
      run,
      descriptors[0].event_type,
      descriptors[0].stage,
      descriptors[0],
    );
    const firstEvent = projectUniversalExperienceToEvent(firstExperience);
    const projection = eventProjectionService({
      seed: [{
        id: "event_conflict",
        ...firstEvent,
        payload_content_hash: `sha256:${"d".repeat(64)}`,
      }],
    });
    const result = await reconcileDiscoveryRunExperiences(
      projection.service,
      run,
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        projection_key: descriptors[0].projection_key,
        code: "universal_experience_idempotency_conflict",
      }),
    ]));
    expect(projection.sourceMutations).toBe(0);
  });

  it("does not treat an Event read failure as an empty idempotency lookup", async () => {
    let creates = 0;
    const service = {
      entities: {
        Event: {
          async filter() {
            throw new Error("event_read_unavailable");
          },
          async create() {
            creates += 1;
          },
        },
      },
    };
    await expect(appendUniversalExperience(service, validExperience())).rejects
      .toThrow("event_read_unavailable");
    expect(creates).toBe(0);
  });

  it("surfaces an unreconstructible source row without aborting the reconciliation batch", async () => {
    const projection = eventProjectionService();
    const result = await reconcileDiscoveryExperienceBatch(
      projection.service,
      [{ id: "run_missing_time" }, committedDiscoveryRun()],
      2,
    );
    expect(result.ok).toBe(false);
    expect(result.runs).toEqual([
      expect.objectContaining({
        ok: false,
        run_id: "run_missing_time",
        errors: [expect.objectContaining({
          code: "discovery_experience_timestamp_required",
        })],
      }),
      expect.objectContaining({ ok: true }),
    ]);
  });

  it("deduplicates the same Discovery projection and rejects key/content conflicts", async () => {
    const experience = validExperience();
    const rows = [];
    const service = {
      entities: {
        Event: {
          async filter({ idempotency_key }) {
            return rows.filter((row) => row.idempotency_key === idempotency_key);
          },
          async create(row) {
            const saved = { id: `event_${rows.length + 1}`, ...row };
            rows.push(saved);
            return saved;
          },
        },
      },
    };
    await expect(appendUniversalExperience(service, experience)).resolves
      .toMatchObject({ status: "CREATED" });
    await expect(appendUniversalExperience(service, experience)).resolves
      .toMatchObject({ status: "DUPLICATE" });
    const conflict = {
      ...experience,
      payload_content_hash: `sha256:${"b".repeat(64)}`,
    };
    await expect(appendUniversalExperience(service, conflict)).rejects
      .toThrow("universal_experience_idempotency_conflict");
    expect(rows).toHaveLength(1);
  });

  it("fails the experience envelope closed on missing tenant, lineage, authority or invalid time", () => {
    const invalid = validExperience();
    invalid.tenant_id = "";
    invalid.source.content_hash = "not-a-hash";
    invalid.authority.authority_snapshot_id = "";
    invalid.observed_at = "2025-12-31T23:00:00.000Z";
    const result = validateUniversalExperience(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "missing:tenant_id",
      "invalid:source_lineage",
      "invalid:authority_lineage",
      "temporal:occurred_after_observed",
    ]));
  });

  it("clears only a hypothetical fully evidenced row and does not convert clearance into model readiness", () => {
    const result = evaluateLearningEligibility(clearEligibilityInput());
    expect(result).toEqual({
      state: "CLEARED",
      status: "ELIGIBLE_TRAINING",
      policy_version: LEARNING_ELIGIBILITY_POLICY_VERSION,
      reason_codes: [],
      evaluated_at: "2026-02-02T00:00:00.000Z",
      decided_at: "2026-02-02T00:00:00.000Z",
      allowed_scopes: ["tenant_private"],
      allowed_uses: ["MODEL_TRAINING"],
      requested_use_class: "MODEL_TRAINING",
      purpose: "PAYMENTS_MODEL_EVALUATION",
      lineage: {
        experience_refs: ["experience_001"],
        evidence_refs: ["evidence_001"],
        observation_refs: ["observation_001"],
        claim_refs: ["claim_001"],
        outcome_refs: ["outcome_001"],
        execution_receipt_refs: ["receipt_001"],
      },
    });
    expect(readConfig("model-registry.v1.json")).toMatchObject({
      registry_state: "CONTRACT_ONLY",
      records: [],
    });
  });

  it("requires exact full lineage and rejects caller/manual learning authority", () => {
    const missing = clearEligibilityInput();
    missing.lineage.claim_refs = [];
    expect(evaluateLearningEligibility(missing)).toMatchObject({
      state: "QUARANTINED",
      status: "PENDING_PROVENANCE",
      reason_codes: expect.arrayContaining([
        "LINEAGE_EXACT_REFS_REQUIRED:claim_refs",
      ]),
    });

    const manual = clearEligibilityInput();
    manual.data.manual_promotion_requested = true;
    manual.data.training_eligible_core = true;
    expect(evaluateLearningEligibility(manual)).toMatchObject({
      state: "INELIGIBLE",
      status: "INELIGIBLE",
      allowed_scopes: [],
      allowed_uses: [],
      reason_codes: expect.arrayContaining([
        "MANUAL_PROMOTION_NOT_MODEL_AUTHORITY",
        "CALLER_ELIGIBILITY_HINT_REJECTED",
      ]),
    });
  });

  it("content-addresses and append-only persists immutable eligibility decisions in Event", async () => {
    const input = clearEligibilityInput();
    const first = await buildLearningEligibilityDecision(input);
    const second = await buildLearningEligibilityDecision(input);
    expect(first).toEqual(second);
    expect(first.eligibility_decision_id).toMatch(
      /^learning-eligibility:[a-f0-9]{64}$/,
    );
    expect(first.content_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.lineage)).toBe(true);

    const projection = learningDecisionService();
    await expect(appendLearningEligibilityDecision(
      projection.service,
      input,
    )).resolves.toMatchObject({ status: "CREATED", decision: first });
    await expect(appendLearningEligibilityDecision(
      projection.service,
      input,
    )).resolves.toMatchObject({ status: "DUPLICATE", decision: first });
    expect(projection.created).toHaveLength(1);
    expect(projection.created[0]).toMatchObject({
      event_type: "learning.eligibility.decided",
      idempotency_key: first.eligibility_decision_id,
      payload_content_hash: first.content_hash,
      decision_json: { immutable: true },
      learning_json: { status: "ELIGIBLE_TRAINING" },
    });
  });

  it("rejects missing, cross-tenant and unexecuted service lineage before a decision write", async () => {
    const missing = learningDecisionService();
    const missingInput = clearEligibilityInput();
    missingInput.lineage.evidence_refs = ["evidence_missing"];
    missingInput.evidence.evidence_refs = ["evidence_missing"];
    await expect(appendLearningEligibilityDecision(
      missing.service,
      missingInput,
    )).rejects.toThrow("learning_lineage_not_found:IntelligenceEvidence:evidence_missing");
    expect(missing.created).toHaveLength(0);

    const crossTenant = learningDecisionService();
    crossTenant.records.IntelligenceEvidence.get("evidence_001").brand_id =
      "brand_other";
    await expect(appendLearningEligibilityDecision(
      crossTenant.service,
      clearEligibilityInput(),
    )).rejects.toThrow("learning_lineage_tenant_purpose_mismatch");
    expect(crossTenant.created).toHaveLength(0);

    const unexecuted = learningDecisionService();
    unexecuted.records.Event.get("receipt_001").execution_json.status =
      "APPROVED";
    await expect(appendLearningEligibilityDecision(
      unexecuted.service,
      clearEligibilityInput(),
    )).rejects.toThrow("learning_execution_receipt_not_executed");
    expect(unexecuted.created).toHaveLength(0);

    const wrongPurpose = learningDecisionService();
    wrongPurpose.records.Event.get("experience_001").privacy_json.purpose =
      ["ANOTHER_PURPOSE"];
    wrongPurpose.records.Event.get("experience_001").identity_json.purpose =
      "ANOTHER_PURPOSE";
    await expect(appendLearningEligibilityDecision(
      wrongPurpose.service,
      clearEligibilityInput(),
    )).rejects.toThrow("learning_experience_purpose_mismatch");
    expect(wrongPurpose.created).toHaveLength(0);

    const invalidTime = learningDecisionService();
    invalidTime.records.IntelligenceObservation.get("observation_001")
      .observed_at = "2025-12-31T00:00:00.000Z";
    await expect(appendLearningEligibilityDecision(
      invalidTime.service,
      clearEligibilityInput(),
    )).rejects.toThrow("learning_observation_time_invalid");
    expect(invalidTime.created).toHaveLength(0);

    const invalidVerificationSource = learningDecisionService();
    invalidVerificationSource.records.MonthlySavingsReport.get("report_001")
      .verification_status = "pending";
    await expect(appendLearningEligibilityDecision(
      invalidVerificationSource.service,
      clearEligibilityInput(),
    )).rejects.toThrow("learning_outcome_verification_source_invalid");
    expect(invalidVerificationSource.created).toHaveLength(0);
  });

  it("persists immature or unverifiable outcomes only as pending, never training eligible", async () => {
    const immature = learningDecisionService();
    immature.records.IntelligenceOutcome.get("outcome_001").label_mature =
      false;
    await expect(appendLearningEligibilityDecision(
      immature.service,
      clearEligibilityInput(),
    )).resolves.toMatchObject({
      status: "CREATED",
      decision: {
        state: "QUARANTINED",
        status: "PENDING_LABEL_MATURITY",
        allowed_uses: [],
      },
    });

    const unverifiable = learningDecisionService();
    unverifiable.records.IntelligenceOutcome.get("outcome_001")
      .verification_source_validated = false;
    await expect(appendLearningEligibilityDecision(
      unverifiable.service,
      clearEligibilityInput(),
    )).resolves.toMatchObject({
      status: "CREATED",
      decision: {
        state: "INELIGIBLE",
        status: "INELIGIBLE",
        allowed_uses: [],
        reason_codes: expect.arrayContaining([
          "OUTCOME_NOT_VERIFIED",
          "LABEL_VERIFICATION_TIER_NOT_MET",
        ]),
      },
    });
  });

  it("quarantines rows when any mandatory gate lacks runtime-backed PASS evidence", () => {
    const actualGates = readConfig("gates.v1.json").gates;
    const input = clearEligibilityInput();
    input.gates = actualGates.map((gate) => ({
      gate_id: gate.gate_id,
      status: gate.gate_status,
      runtime_evidence: gate.runtime_evidence,
    }));
    const result = evaluateLearningEligibility(input);
    expect(result.state).toBe("QUARANTINED");
    for (const gateId of MANDATORY_LEARNING_GATE_IDS) {
      expect(result.reason_codes).toContain(`GATE_NOT_PASSED:${gateId}`);
      expect(result.reason_codes).toContain(
        `GATE_RUNTIME_EVIDENCE_MISSING:${gateId}`,
      );
    }
  });

  it("makes known disqualifiers ineligible while retaining integrity warnings", () => {
    const input = clearEligibilityInput();
    input.data.self_generated_label = true;
    input.execution.status = "APPROVED";
    input.outcome.status = "PENDING";
    input.outcome.label_mature = false;
    const result = evaluateLearningEligibility(input);
    expect(result.state).toBe("INELIGIBLE");
    expect(result.allowed_scopes).toEqual([]);
    expect(result.reason_codes).toEqual(expect.arrayContaining([
      "SELF_REFERENTIAL_LABEL",
      "EXECUTION_NOT_CONFIRMED",
      "OUTCOME_NOT_VERIFIED",
      "LABEL_NOT_MATURE",
    ]));
  });

  it("blocks point-in-time leakage and cross-tenant aggregates below k=10", () => {
    const leaked = clearEligibilityInput();
    leaked.time.available_at = "2026-01-03T00:00:00.000Z";
    expect(evaluateLearningEligibility(leaked)).toMatchObject({
      state: "QUARANTINED",
      reason_codes: expect.arrayContaining(["POINT_IN_TIME_LEAKAGE"]),
    });

    const aggregate = clearEligibilityInput();
    aggregate.tenant.tenant_scope = "ANONYMIZED_AGGREGATE";
    Object.assign(aggregate.privacy, {
      cross_tenant_allowed: true,
      cohort_size: 9,
      reidentification_mapping_present: false,
      allowed_scopes: ["privacy_safe_aggregate"],
    });
    expect(evaluateLearningEligibility(aggregate)).toMatchObject({
      state: "INELIGIBLE",
      reason_codes: expect.arrayContaining(["AGGREGATE_K_BELOW_10"]),
    });
  });

  it("keeps every shared registry contract-only and empty", () => {
    for (
      const name of [
        "feature-registry.v1.json",
        "label-registry.v1.json",
        "dataset-registry.v1.json",
        "model-registry.v1.json",
        "prediction-registry.v1.json",
      ]
    ) {
      expect(readConfig(name)).toMatchObject({
        registry_state: "CONTRACT_ONLY",
        authority: "SINGLE_SHARED_CAMBRA_INTELLIGENCE_REGISTRY",
        records: [],
        runtime_evidence: [],
      });
    }
  });

  it("marks only the Discovery adapter family partial and does not claim runtime verification", () => {
    const registry = readConfig("experience-event-registry.v1.json");
    const discovery = registry.events.filter((entry) =>
      entry.owner_domain === "Discovery"
    );
    expect(discovery.map((entry) => entry.event_type)).toEqual(
      DISCOVERY_EXPERIENCE_EVENT_TYPES,
    );
    expect(discovery.every((entry) =>
      entry.runtime_state === "ADAPTER_PARTIAL"
    )).toBe(true);
    expect(registry.events.some((entry) =>
      entry.runtime_state === "RUNTIME_VERIFIED"
    )).toBe(false);
    expect(registry.runtime_evidence).toEqual([]);
  });

  it("projects committed Adaptive Lead decisions append-only without person data or authority", async () => {
    const lead = {
      id: "lead-adaptive-1",
      canonical_company_key: "domain:merchant.example",
      company_domain: "merchant.example",
      stage: "scored",
      reservoir_state: "qualified",
      score: 82,
      contact_email: "must-not-leak@merchant.example",
      score_breakdown_json: {
        adaptive_lead_v0: {
          decision_id: "adaptive-decision:lead-adaptive-1:2026-08-13T00:00:00Z",
          decision_time: "2026-08-13T00:00:00Z",
          disposition: "DECLARE_OUTREACH_WORTHY",
          intelligence_state_before: "CHEAP_SCREENED",
          intelligence_state_after: "OUTREACH_WORTHY",
          reason_codes: ["COMPANY_ONLY_THRESHOLDS_AND_SUPPORT_PASS"],
          scores: { fit: { value: 80 }, opportunity: { value: 82 } },
          evidence_refs: ["evidence:company:1"],
          policy_version: "adaptive-policy-1",
          rule_or_model_version: "adaptive-lead-core.v0",
          company_only: true,
          contact_features_used: false,
        },
      },
    };
    const events = await buildAdaptiveLeadDecisionExperiences(lead, "task-1");
    expect(events.map((event) => event.event_type)).toEqual([
      "candidate.score_calculated",
      "candidate.outreach_worthiness_decided",
    ]);
    expect(events.every((event) =>
      event.learning.eligibility === "QUARANTINED" &&
      event.privacy.training_allowed === false &&
      event.authority.decision === "NO_EXECUTION_AUTHORITY"
    )).toBe(true);
    expect(JSON.stringify(events)).not.toContain("must-not-leak");
    expect(events.map((event) => validateUniversalExperience(event).ok)).toEqual([
      true,
      true,
    ]);
  });

  it("deduplicates Adaptive Lead replay and reports projection conflicts fail-closed", async () => {
    const rows = [];
    const service = {
      entities: {
        Event: {
          filter: async ({ idempotency_key }) =>
            rows.filter((row) => row.idempotency_key === idempotency_key),
          create: async (row) => {
            rows.push({ id: `event-${rows.length + 1}`, ...row });
            return rows.at(-1);
          },
        },
      },
    };
    const lead = {
      id: "lead-adaptive-2",
      canonical_company_key: "domain:merchant-two.example",
      company_domain: "merchant-two.example",
      stage: "disqualified",
      score: 10,
      score_breakdown_json: {
        adaptive_lead_v0: {
          decision_id: "adaptive-decision:lead-adaptive-2:2026-08-13T00:00:00Z",
          decision_time: "2026-08-13T00:00:00Z",
          disposition: "DROP",
          intelligence_state_before: "CHEAP_SCREENED",
          intelligence_state_after: "DROPPED",
          reason_codes: ["ROBUST_COMPANY_ONLY_LOW_FIT_AND_OPPORTUNITY"],
          policy_version: "adaptive-policy-1",
          rule_or_model_version: "adaptive-lead-core.v0",
          company_only: true,
          contact_features_used: false,
        },
      },
    };
    const first = await appendCommittedAdaptiveLeadDecision(service, lead, "task-2");
    const replay = await appendCommittedAdaptiveLeadDecision(service, lead, "task-2");
    expect(first).toMatchObject({ ok: true, created: 3, duplicate: 0 });
    expect(replay).toMatchObject({ ok: true, created: 0, duplicate: 3 });
    expect(new Set(rows.map((row) => row.idempotency_key)).size).toBe(3);
  });

  it("registers only Discovery and Adaptive Lead adapters as partial", () => {
    const registry = readConfig("experience-event-registry.v1.json");
    const adaptive = registry.events.filter((entry) =>
      entry.owner_domain === "Adaptive Lead"
    );
    expect(adaptive.map((entry) => entry.event_type)).toEqual(
      ADAPTIVE_LEAD_EXPERIENCE_EVENT_TYPES,
    );
    expect(adaptive.every((entry) =>
      entry.runtime_state === "ADAPTER_PARTIAL"
    )).toBe(true);
    expect(registry.events.some((entry) =>
      entry.runtime_state === "RUNTIME_VERIFIED"
    )).toBe(false);
  });

  /* global process */
  it("passes the machine-readable foundation contract checker", () => {
    const output = execFileSync(process.execPath, [
      "scripts/check-intelligence-foundation-contracts.mjs",
    ], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(output).toContain("intelligence-foundation-contracts:check PASS");
    expect(output).toContain("0 runtime/model readiness claims");
  });
});