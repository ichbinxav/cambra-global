/**
 * CAMBRA Intelligence v2 Phase-1 semantic contracts.
 *
 * This module is deliberately a shared, side-effect-free boundary. It does not
 * create datasets, train models, promote artifacts or grant authority. Domain
 * systems remain the source of truth and may project committed records into the
 * Universal Experience envelope through the existing Event entity.
 */

export const UNIVERSAL_EXPERIENCE_SCHEMA_VERSION = "universal-experience.v1";
export const LEARNING_ELIGIBILITY_POLICY_VERSION = "learning-eligibility.v2";

export const LEARNING_USE_CLASSES = [
  "DESCRIPTIVE",
  "ADVISORY",
  "MODEL_EVALUATION",
  "MODEL_TRAINING",
  "CALIBRATION",
] as const;

export type LearningUseClass = typeof LEARNING_USE_CLASSES[number];

export const LEARNING_ELIGIBILITY_STATUSES = [
  "INELIGIBLE",
  "PENDING_PROVENANCE",
  "PENDING_EXECUTION",
  "PENDING_OUTCOME",
  "PENDING_LABEL_MATURITY",
  "ELIGIBLE_AGGREGATE_ONLY",
  "ELIGIBLE_EVALUATION_ONLY",
  "ELIGIBLE_TRAINING",
  "REVOKED",
] as const;

export type LearningEligibilityStatus =
  typeof LEARNING_ELIGIBILITY_STATUSES[number];

export const LEARNING_ELIGIBILITY_STATES = [
  "INELIGIBLE",
  "QUARANTINED",
  "CLEARED",
] as const;

export type LearningEligibilityState =
  typeof LEARNING_ELIGIBILITY_STATES[number];

export const MANDATORY_LEARNING_GATE_IDS = [
  "PHASE_0_GLOBAL_RECONCILIATION",
  "INTELLIGENCE_FOUNDATION_INTEGRATED",
  "SHARED_PRIVACY_TENANT_GATE",
  "SHARED_AUTHORITY_GATE",
] as const;

export const EXPERIENCE_EXECUTION_STATES = [
  "NOT_PROPOSED",
  "PROPOSED",
  "APPROVED",
  "REJECTED",
  "QUEUED",
  "EXECUTED",
  "FAILED",
  "CANCELLED",
  "UNKNOWN",
] as const;

export const EXPERIENCE_OUTCOME_STATES = [
  "PENDING",
  "OBSERVED",
  "VERIFIED",
  "RECONCILED",
  "EXPIRED",
  "UNATTRIBUTABLE",
] as const;

export const EXPERIENCE_TENANT_SCOPES = [
  "TENANT",
  "PLATFORM",
  "ANONYMIZED_AGGREGATE",
] as const;

type JsonRecord = Record<string, unknown>;

export type ValidationResult = {
  ok: boolean;
  errors: string[];
};

export type LearningEligibilityDecision = {
  state: LearningEligibilityState;
  status: LearningEligibilityStatus;
  policy_version: typeof LEARNING_ELIGIBILITY_POLICY_VERSION;
  reason_codes: string[];
  evaluated_at: string | null;
  decided_at: string | null;
  allowed_scopes: string[];
  allowed_uses: LearningUseClass[];
  requested_use_class: LearningUseClass | null;
  purpose: string | null;
  lineage: {
    experience_refs: string[];
    evidence_refs: string[];
    observation_refs: string[];
    claim_refs: string[];
    outcome_refs: string[];
    execution_receipt_refs: string[];
  };
};

export type ImmutableLearningEligibilityDecision =
  LearningEligibilityDecision & {
    eligibility_decision_id: string;
    content_hash: string;
    immutable: true;
    supersedes_decision_id: string | null;
    expires_at: string | null;
    revocation_ref: string | null;
  };

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const nonEmptyStrings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(nonEmpty);

const hasSha256 = (value: unknown): value is string =>
  nonEmpty(value) && /^(?:sha256:)?[a-f0-9]{64}$/i.test(value);

const isoMillis = (value: unknown): number | null => {
  if (!nonEmpty(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

async function canonicalSha256(value: unknown): Promise<string> {
  const canonical = JSON.stringify(value, (_key, item) => {
    if (!isRecord(item)) return item;
    return Object.fromEntries(
      Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

const pushMissing = (errors: string[], record: JsonRecord, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined || value === "") {
      errors.push(`missing:${key}`);
    }
  }
};

/**
 * Validates the semantic envelope used by new v2 experience producers.
 * Legacy Event rows remain readable: this validator is only invoked when a
 * producer claims `universal-experience.v1`.
 */
export function validateUniversalExperience(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["experience_object_required"] };
  }

  pushMissing(errors, input, [
    "experience_id",
    "schema_version",
    "event_type",
    "event_version",
    "occurred_at",
    "observed_at",
    "recorded_at",
    "effective_at",
    "available_at",
    "tenant_id",
    "tenant_scope",
    "idempotency_key",
    "payload_content_hash",
    "actor",
    "identity",
    "source",
    "context_snapshot_id",
    "decision",
    "producer",
    "authority",
    "execution",
    "outcome",
    "learning",
    "privacy",
    "trace",
    "data_quality",
    "is_demo",
    "is_synthetic",
    "is_test",
    "is_replay",
  ]);

  if (input.schema_version !== UNIVERSAL_EXPERIENCE_SCHEMA_VERSION) {
    errors.push("unsupported:schema_version");
  }
  if (
    !/^[-a-z0-9_]+(?:\.[-a-z0-9_]+)+$/i.test(String(input.event_type || ""))
  ) {
    errors.push("invalid:event_type_namespace");
  }
  if (
    !Number.isInteger(input.event_version) || Number(input.event_version) < 1
  ) {
    errors.push("invalid:event_version");
  }
  if (!EXPERIENCE_TENANT_SCOPES.includes(input.tenant_scope as never)) {
    errors.push("invalid:tenant_scope");
  }
  if (!hasSha256(input.payload_content_hash)) {
    errors.push("invalid:payload_content_hash");
  }
  for (const flag of ["is_demo", "is_synthetic", "is_test", "is_replay"]) {
    if (typeof input[flag] !== "boolean") errors.push(`invalid:${flag}`);
  }

  const timeKeys = [
    "occurred_at",
    "observed_at",
    "recorded_at",
    "effective_at",
    "available_at",
  ];
  const times = Object.fromEntries(
    timeKeys.map((key) => [key, isoMillis(input[key])]),
  );
  for (const key of timeKeys) {
    if (times[key] === null) errors.push(`invalid:${key}`);
  }
  if (
    times.occurred_at !== null && times.observed_at !== null &&
    times.occurred_at > times.observed_at
  ) {
    errors.push("temporal:occurred_after_observed");
  }
  if (
    times.observed_at !== null && times.recorded_at !== null &&
    times.observed_at > times.recorded_at
  ) {
    errors.push("temporal:observed_after_recorded");
  }

  for (
    const key of [
      "actor",
      "identity",
      "source",
      "decision",
      "producer",
      "authority",
      "execution",
      "outcome",
      "learning",
      "privacy",
      "trace",
      "data_quality",
    ]
  ) {
    if (!isRecord(input[key])) errors.push(`invalid:${key}`);
  }

  const actor = isRecord(input.actor) ? input.actor : {};
  if (!nonEmpty(actor.type) || !nonEmpty(actor.id)) {
    errors.push("invalid:actor_identity");
  }

  const source = isRecord(input.source) ? input.source : {};
  if (
    !nonEmpty(source.system) || !nonEmpty(source.record_id) ||
    !hasSha256(source.content_hash)
  ) {
    errors.push("invalid:source_lineage");
  }

  const identity = isRecord(input.identity) ? input.identity : {};
  if (
    !Object.values(identity).some((value) =>
      value !== null && value !== undefined && value !== ""
    )
  ) {
    errors.push("invalid:identity_empty");
  }

  const decision = isRecord(input.decision) ? input.decision : {};
  if (
    !nonEmpty(decision.decision_id) || !nonEmpty(decision.decision_type) ||
    !Array.isArray(decision.reason_codes)
  ) {
    errors.push("invalid:decision_lineage");
  }

  const producer = isRecord(input.producer) ? input.producer : {};
  if (
    !nonEmpty(producer.code_version) || !nonEmpty(producer.policy_version)
  ) {
    errors.push("invalid:producer_version");
  }

  const authority = isRecord(input.authority) ? input.authority : {};
  if (
    !nonEmpty(authority.decision) || !nonEmpty(authority.authority_snapshot_id)
  ) {
    errors.push("invalid:authority_lineage");
  }

  const execution = isRecord(input.execution) ? input.execution : {};
  if (!EXPERIENCE_EXECUTION_STATES.includes(execution.status as never)) {
    errors.push("invalid:execution_status");
  }

  const outcome = isRecord(input.outcome) ? input.outcome : {};
  if (!EXPERIENCE_OUTCOME_STATES.includes(outcome.status as never)) {
    errors.push("invalid:outcome_status");
  }

  const learning = isRecord(input.learning) ? input.learning : {};
  if (
    !LEARNING_ELIGIBILITY_STATES.includes(learning.eligibility as never) ||
    !Array.isArray(learning.reason_codes)
  ) {
    errors.push("invalid:learning_state");
  }

  const privacy = isRecord(input.privacy) ? input.privacy : {};
  if (
    !nonEmpty(privacy.classification) || !nonEmptyStrings(privacy.purpose) ||
    !nonEmpty(privacy.retention_policy_key)
  ) {
    errors.push("invalid:privacy_contract");
  }
  if (
    typeof privacy.training_allowed !== "boolean" ||
    typeof privacy.cross_tenant_allowed !== "boolean"
  ) {
    errors.push("invalid:privacy_boolean");
  }

  const trace = isRecord(input.trace) ? input.trace : {};
  if (!nonEmpty(trace.correlation_id)) errors.push("invalid:correlation_id");

  const dataQuality = isRecord(input.data_quality) ? input.data_quality : {};
  for (
    const key of [
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
    if (
      dataQuality[key] === null || dataQuality[key] === undefined ||
      dataQuality[key] === ""
    ) {
      errors.push(`invalid:data_quality.${key}`);
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)].sort() };
}

/**
 * Backwards-compatible projection into the existing Event entity.
 * Callers still need their domain transaction/outbox boundary; this helper does
 * not claim exactly-once persistence.
 */
export function projectUniversalExperienceToEvent(input: unknown): JsonRecord {
  const validation = validateUniversalExperience(input);
  if (!validation.ok) {
    throw new Error(
      `universal_experience_invalid:${validation.errors.join(",")}`,
    );
  }
  const experience = input as JsonRecord;

  return {
    brand_id: experience.tenant_id,
    tenant_id: experience.tenant_id,
    tenant_scope: experience.tenant_scope,
    experience_id: experience.experience_id,
    schema_version: experience.schema_version,
    event_type: experience.event_type,
    event_version: experience.event_version,
    source: (experience.source as JsonRecord).system,
    entity_type: (experience.source as JsonRecord).entity_type ||
      (experience.source as JsonRecord).system,
    entity_id: (experience.source as JsonRecord).record_id,
    idempotency_key: experience.idempotency_key,
    aggregate_id: (experience.trace as JsonRecord).aggregate_id || null,
    sequence_number: (experience.trace as JsonRecord).sequence_number ?? null,
    occurred_at: experience.occurred_at,
    observed_at: experience.observed_at,
    recorded_at: experience.recorded_at,
    effective_at: experience.effective_at,
    available_at: experience.available_at,
    payload_content_hash: experience.payload_content_hash,
    actor_json: experience.actor,
    identity_json: experience.identity,
    source_json: experience.source,
    context_snapshot_id: experience.context_snapshot_id || null,
    decision_json: experience.decision,
    producer_json: experience.producer,
    authority_json: experience.authority,
    execution_json: experience.execution,
    outcome_json: experience.outcome,
    learning_json: experience.learning,
    privacy_json: experience.privacy,
    trace_json: experience.trace,
    data_quality_json: experience.data_quality,
    is_demo: experience.is_demo === true,
    is_synthetic: experience.is_synthetic === true,
    is_test: experience.is_test === true,
    is_replay: experience.is_replay === true,
    payload_json: experience.payload || {},
    status: "processed",
    processed_at: experience.recorded_at,
  };
}

export type UniversalExperienceAppendResult = {
  status: "CREATED" | "DUPLICATE";
  event: JsonRecord;
};

export const ADAPTIVE_LEAD_EXPERIENCE_EVENT_TYPES = [
  "candidate.score_calculated",
  "candidate.outreach_worthiness_decided",
  "candidate.stopped",
] as const;

export type AdaptiveLeadExperienceEventType =
  typeof ADAPTIVE_LEAD_EXPERIENCE_EVENT_TYPES[number];

export type AdaptiveLeadExperienceAppendResult = {
  ok: boolean;
  candidate_id: string;
  created: number;
  duplicate: number;
  errors: Array<{ event_type: AdaptiveLeadExperienceEventType; code: string }>;
};

export const ADAPTIVE_LEAD_CONTACT_GATE_EVENT_TYPES = [
  "candidate.score_calculated",
  "candidate.outreach_worthiness_decided",
] as const;

export type AdaptiveLeadProjectionGateState =
  | "VERIFIED"
  | "SOURCE_INVALID"
  | "LOOKUP_UNAVAILABLE"
  | "MISSING"
  | "AMBIGUOUS"
  | "INVALID";

export type AdaptiveLeadProjectionGateResult = {
  allowed: boolean;
  state: AdaptiveLeadProjectionGateState;
  candidate_id: string;
  decision_id: string | null;
  source_snapshot_hash: string | null;
  expected_event_types: string[];
  verified_event_types: string[];
  event_ids: string[];
  blockers: string[];
};

export type AdaptiveLeadProjectionReconciliationResult =
  & AdaptiveLeadProjectionGateResult
  & {
    append: AdaptiveLeadExperienceAppendResult;
    recovered_after_append_error: boolean;
    rescore_performed: false;
    source_mutated: false;
    learning_eligible: false;
  };

export const DISCOVERY_EXPERIENCE_EVENT_TYPES = [
  "discovery.plan.accepted",
  "discovery.stage.started",
  "discovery.stage.completed",
  "discovery.stage.failed",
  "discovery.result.attributed",
  "discovery.result.scored",
] as const;

export type DiscoveryExperienceEventType =
  typeof DISCOVERY_EXPERIENCE_EVENT_TYPES[number];

export type DiscoveryExperienceDescriptor = {
  projection_key: string;
  event_type: DiscoveryExperienceEventType;
  stage: string;
  occurred_at: string;
  sequence_number: number;
  source_snapshot: JsonRecord;
};

export type DiscoveryExperienceReconciliation = {
  ok: boolean;
  run_id: string;
  expected: number;
  created: number;
  duplicate: number;
  errors: Array<{
    projection_key: string;
    event_type: DiscoveryExperienceEventType;
    code: string;
  }>;
};

const DISCOVERY_TERMINAL_STATES = new Set([
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "BUDGET_STOPPED",
  "FOUNDER_STOPPED",
  "SOURCE_LIMITED",
  "FAILED",
  "NEEDS_REVIEW",
]);

const safeKeyPart = (value: unknown) =>
  String(value ?? "unknown").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";

const discoveryTimestamp = (
  value: unknown,
  fallback: unknown,
): string | null => {
  if (isoMillis(value) !== null) return String(value);
  if (isoMillis(fallback) !== null) return String(fallback);
  return null;
};

/**
 * Reconstructs the complete Discovery projection intent from durable source
 * facts. No delivery marker is written back to the run: Event is a projection,
 * while DiscoveryExecutionRun remains the authority and terminal rows remain
 * immutable. Stage starts are reconstructible because the execution boundary
 * persists `started_at` into every committed actual_stages_json entry.
 */
export function expectedDiscoveryRunExperienceDescriptors(
  run: JsonRecord,
): DiscoveryExperienceDescriptor[] {
  const runId = String(run.id || "").trim();
  if (!runId) throw new Error("discovery_experience_run_id_required");
  const startedAt = discoveryTimestamp(run.started_at, run.completed_at);
  if (!startedAt) throw new Error("discovery_experience_timestamp_required");

  const descriptors: DiscoveryExperienceDescriptor[] = [{
    projection_key: "plan.accepted",
    event_type: "discovery.plan.accepted",
    stage: "PLAN",
    occurred_at: startedAt,
    sequence_number: 0,
    source_snapshot: {
      accepted_plan_hash: run.accepted_plan_hash || null,
      source_capability_version: run.source_capability_version || null,
      discovery_type: run.discovery_type || null,
      initiator: run.initiator || null,
      saved_view_id: run.saved_view_id || null,
      saved_view_revision: run.saved_view_revision || null,
      saved_view_config_hash: run.saved_view_config_hash || null,
      target_count: run.target_count ?? null,
      hard_cap_minor: run.hard_cap_minor ?? null,
      selected_sources: Array.isArray(run.selected_sources)
        ? run.selected_sources
        : [],
      started_at: startedAt,
    },
  }];

  const stages = Array.isArray(run.actual_stages_json)
    ? run.actual_stages_json.filter(isRecord)
    : [];
  stages.forEach((stageRecord, index) => {
    const stage = String(stageRecord.stage || `STAGE_${index}`);
    const attempt = Number.isInteger(Number(stageRecord.attempt)) &&
        Number(stageRecord.attempt) > 0
      ? Number(stageRecord.attempt)
      : null;
    const stageProjectionKey = attempt
      ? `attempt.${attempt}.${safeKeyPart(stage)}`
      : `${index}.${safeKeyPart(stage)}`;
    const completedAt = discoveryTimestamp(
      stageRecord.at || stageRecord.completed_at,
      index === stages.length - 1 ? run.completed_at : null,
    );
    const stageStartedAt = discoveryTimestamp(
      stageRecord.started_at,
      index === 0 ? startedAt : null,
    );
    const sourceSnapshot = {
      index,
      stage,
      status: stageRecord.status || "UNKNOWN",
      started_at: stageStartedAt,
      completed_at: completedAt,
      attempt,
      paid: stageRecord.paid === true,
      deterministic: stageRecord.deterministic === true,
      details: stageRecord,
    };
    if (stageStartedAt) {
      descriptors.push({
        projection_key: `stage.${stageProjectionKey}.started`,
        event_type: "discovery.stage.started",
        stage,
        occurred_at: stageStartedAt,
        sequence_number: index * 2 + 1,
        source_snapshot: {
          index,
          stage,
          started_at: stageStartedAt,
          attempt,
        },
      });
    }
    if (completedAt) {
      const failed = ["FAILED", "NEEDS_REVIEW", "BLOCKED"].includes(
        String(stageRecord.status || "").toUpperCase(),
      );
      descriptors.push({
        projection_key: `stage.${stageProjectionKey}.${
          failed ? "failed" : "completed"
        }`,
        event_type: failed
          ? "discovery.stage.failed"
          : "discovery.stage.completed",
        stage,
        occurred_at: completedAt,
        sequence_number: index * 2 + 2,
        source_snapshot: sourceSnapshot,
      });
    }
  });

  const activeAttempt = Number(run.stage_attempt || 0);
  const activeStage = String(run.current_stage || "");
  const activeStartedAt = discoveryTimestamp(run.stage_started_at, null);
  const activeAttemptPersisted = stages.some((item) =>
    Number(item.attempt || 0) === activeAttempt &&
    String(item.stage || "") === activeStage
  );
  if (
    activeAttempt > 0 && activeStage && activeStartedAt &&
    String(run.stage_attempt_token || "").trim() && !activeAttemptPersisted
  ) {
    descriptors.push({
      projection_key: `stage.attempt.${activeAttempt}.${
        safeKeyPart(activeStage)
      }.started`,
      event_type: "discovery.stage.started",
      stage: activeStage,
      occurred_at: activeStartedAt,
      sequence_number: stages.length * 2 + 1,
      source_snapshot: {
        index: stages.length,
        stage: activeStage,
        started_at: activeStartedAt,
        attempt: activeAttempt,
      },
    });
  }

  const terminal = DISCOVERY_TERMINAL_STATES.has(String(run.status || ""));
  const terminalAt = discoveryTimestamp(run.completed_at, null);
  const terminalHash = String(run.terminal_snapshot_hash || "").trim();
  if (terminal && terminalAt && terminalHash) {
    if (
      Array.isArray(run.result_attribution_json) &&
      run.result_attribution_json.length > 0
    ) {
      descriptors.push({
        projection_key: `terminal.${safeKeyPart(terminalHash)}.attributed`,
        event_type: "discovery.result.attributed",
        stage: "ATTRIBUTION",
        occurred_at: terminalAt,
        sequence_number: stages.length * 2 + 3,
        source_snapshot: {
          terminal_snapshot_hash: terminalHash,
          result_entity_type: run.result_entity_type || null,
          result_ids: Array.isArray(run.result_ids) ? run.result_ids : [],
          result_attribution: run.result_attribution_json,
        },
      });
    }
    const coverage = isRecord(run.scoring_coverage_json)
      ? run.scoring_coverage_json
      : {};
    if (coverage.status && coverage.status !== "NOT_STARTED") {
      descriptors.push({
        projection_key: `terminal.${safeKeyPart(terminalHash)}.scored`,
        event_type: "discovery.result.scored",
        stage: "SCORING",
        occurred_at: terminalAt,
        sequence_number: stages.length * 2 + 4,
        source_snapshot: {
          terminal_snapshot_hash: terminalHash,
          result_entity_type: run.result_entity_type || null,
          result_ids: Array.isArray(run.result_ids) ? run.result_ids : [],
          scoring_coverage: coverage,
          quality: isRecord(run.quality_json) ? run.quality_json : {},
          cost_reconciliation: isRecord(run.cost_reconciliation_json)
            ? run.cost_reconciliation_json
            : {},
        },
      });
    }
  }
  return descriptors;
}

/**
 * Replay-safe append into the existing Event projection.
 *
 * Duplicate delivery with the same semantic hash is harmless. Reusing an
 * idempotency key for different content is an integrity conflict and fails
 * closed. Concurrent creates are also detected as ambiguous (Base44 does not
 * expose a unique index here). The committed domain record remains the source
 * of truth, so callers can reconstruct and retry this projection after a crash.
 */
export async function appendUniversalExperience(
  service: any,
  input: unknown,
): Promise<UniversalExperienceAppendResult> {
  const event = projectUniversalExperienceToEvent(input);
  const key = String(event.idempotency_key || "");
  const existing = await service.entities.Event.filter(
    { idempotency_key: key },
    "-recorded_at",
    2,
  );
  if (existing.length > 1) {
    throw new Error("universal_experience_duplicate_authority");
  }
  if (existing[0]) {
    if (existing[0].payload_content_hash !== event.payload_content_hash) {
      throw new Error("universal_experience_idempotency_conflict");
    }
    return { status: "DUPLICATE", event: existing[0] };
  }
  const created = await service.entities.Event.create(event);
  const observed = await service.entities.Event.filter(
    { idempotency_key: key },
    "-recorded_at",
    2,
  );
  if (observed.length !== 1) {
    throw new Error("universal_experience_append_ambiguous");
  }
  if (observed[0].payload_content_hash !== event.payload_content_hash) {
    throw new Error("universal_experience_idempotency_conflict");
  }
  return { status: "CREATED", event: created };
}

/**
 * Builds the append-only Adaptive Lead projection from a committed OutboundLead
 * row. The mutable compatibility row remains the source of truth; Event keeps
 * the decision history. Person fields are deliberately excluded.
 */
export async function buildAdaptiveLeadDecisionExperiences(
  lead: JsonRecord,
  _taskId: string,
): Promise<JsonRecord[]> {
  const candidateId = String(lead.id || "").trim();
  const score = isRecord(lead.score_breakdown_json)
    ? lead.score_breakdown_json
    : {};
  const decision = isRecord(score.adaptive_lead_v0)
    ? score.adaptive_lead_v0
    : {};
  const decisionId = String(decision.decision_id || "").trim();
  const decisionTime = String(decision.decision_time || "").trim();
  const disposition = String(decision.disposition || "").trim();
  if (!candidateId || !decisionId || isoMillis(decisionTime) === null) {
    throw new Error("adaptive_lead_committed_decision_snapshot_required");
  }
  if (!disposition) throw new Error("adaptive_lead_disposition_required");

  const sourceSnapshot = {
    candidate_id: candidateId,
    canonical_company_key: lead.canonical_company_key || null,
    company_domain: lead.company_domain || null,
    score: lead.score ?? null,
    adaptive_lead_v0: decision,
    score_contract: {
      scoring_version: score.scoring_version || null,
      scoring_contract: score.scoring_contract || null,
      methodology_class: score.methodology_class || null,
      company_only: score.company_only === true,
      contact_features_used: score.contact_features_used === true,
    },
  };
  const sourceHash = await canonicalSha256(sourceSnapshot);
  const basePayload = {
    candidate_id: candidateId,
    canonical_company_key: lead.canonical_company_key || null,
    decision_id: decisionId,
    decision_time: decisionTime,
    disposition,
    intelligence_state_before: decision.intelligence_state_before || null,
    intelligence_state_after: decision.intelligence_state_after || null,
    stopping_reason: decision.stopping_reason || null,
    reason_codes: Array.isArray(decision.reason_codes)
      ? decision.reason_codes
      : [],
    scores: isRecord(decision.scores) ? decision.scores : {},
    gaps: Array.isArray(decision.gaps) ? decision.gaps : [],
    unknowns: Array.isArray(decision.unknowns) ? decision.unknowns : [],
    transition_plan: Array.isArray(decision.transition_plan)
      ? decision.transition_plan
      : [],
    source_snapshot_hash: `sha256:${sourceHash}`,
    company_only: decision.company_only === true,
    contact_features_used: decision.contact_features_used === true,
    automatic_outreach_authorized: false,
    paid_action_authorized: false,
  };
  const planned: Array<{
    event_type: AdaptiveLeadExperienceEventType;
    sequence_number: number;
    decision_type: string;
  }> = [{
    event_type: "candidate.score_calculated",
    sequence_number: 1,
    decision_type: "CALCULATE_COMPANY_SCORE",
  }, {
    event_type: "candidate.outreach_worthiness_decided",
    sequence_number: 2,
    decision_type: "DECIDE_OUTREACH_WORTHINESS",
  }];
  if (
    [
      "DROP",
      "STOP_SUFFICIENT",
      "STOP_LOW_VALUE",
      "NEEDS_REVIEW",
      "SOURCE_LIMITED",
      "BUDGET_STOPPED",
    ].includes(disposition)
  ) {
    planned.push({
      event_type: "candidate.stopped",
      sequence_number: 3,
      decision_type: "STOP_CANDIDATE_PROGRESSION",
    });
  }

  const recordedAt = new Date(
    Math.max(Date.now(), Date.parse(decisionTime)),
  ).toISOString();
  const experiences: JsonRecord[] = [];
  for (const item of planned) {
    const payload = { ...basePayload, event_type: item.event_type };
    const payloadHash = await canonicalSha256(payload);
    experiences.push({
      experience_id: `${decisionId}:${item.event_type}`,
      schema_version: UNIVERSAL_EXPERIENCE_SCHEMA_VERSION,
      event_type: item.event_type,
      event_version: 1,
      occurred_at: decisionTime,
      observed_at: decisionTime,
      recorded_at: recordedAt,
      effective_at: decisionTime,
      available_at: decisionTime,
      tenant_id: "_platform",
      tenant_scope: "PLATFORM",
      idempotency_key: `${decisionId}:${item.event_type}`,
      payload_content_hash: `sha256:${payloadHash}`,
      actor: {
        type: "WORKER",
        id: "lead_scoring_agent",
        actor_version: String(
          decision.rule_or_model_version || "adaptive-lead-core.v0",
        ),
      },
      identity: {
        company_id: String(lead.canonical_company_key || candidateId),
        candidate_id: candidateId,
      },
      source: {
        system: "OutboundLead",
        entity_type: "OutboundLead",
        record_id: candidateId,
        content_hash: `sha256:${sourceHash}`,
        evidence_ids: Array.isArray(decision.evidence_refs)
          ? decision.evidence_refs
          : [],
      },
      context_snapshot_id: decisionId,
      decision: {
        decision_id: decisionId,
        decision_type: item.decision_type,
        disposition,
        reason_codes: Array.isArray(decision.reason_codes)
          ? decision.reason_codes
          : [],
      },
      producer: {
        code_version: String(
          decision.rule_or_model_version || "adaptive-lead-core.v0",
        ),
        policy_version: String(decision.policy_version || "unknown"),
        cambra_model_id: null,
      },
      authority: {
        authority_snapshot_id: decisionId,
        decision: "NO_EXECUTION_AUTHORITY",
        approval_required: false,
      },
      execution: {
        status: "EXECUTED",
        execution_id: decisionId,
        idempotency_key: decisionId,
      },
      outcome: { status: "PENDING", outcome_id: null },
      learning: {
        eligibility: "QUARANTINED",
        reason_codes: [
          "ADAPTIVE_RUNTIME_GATES_NOT_VERIFIED",
          "NO_FROZEN_DATASET_OR_LABEL_CLEARANCE",
        ],
      },
      privacy: {
        classification: "CONFIDENTIAL",
        purpose: ["PLATFORM_ACQUISITION_DECISION_AUDIT"],
        training_allowed: false,
        cross_tenant_allowed: false,
        retention_policy_key: "commercial-intelligence",
      },
      trace: {
        correlation_id: decisionId,
        aggregate_id: candidateId,
        sequence_number: item.sequence_number,
      },
      data_quality: {
        schema_valid: true,
        identity_resolution_status: lead.canonical_company_key
          ? "PARTIAL"
          : "MISSING",
        provenance_completeness: "PARTIAL",
        context_completeness: "POINT_IN_TIME_DECISION_SNAPSHOT",
        execution_certainty: "SOURCE_COMMITTED",
        outcome_certainty: "PENDING",
        temporal_consistency: "VALID",
        currency_unit_validity: "NOT_APPLICABLE",
        contradiction_status: "UNKNOWN",
        privacy_eligibility: "PLATFORM_OPERATION_ONLY",
        learning_eligibility: "QUARANTINED",
      },
      is_demo: false,
      is_synthetic: false,
      is_test: false,
      is_replay: false,
      payload,
    });
  }
  return experiences;
}

export async function appendCommittedAdaptiveLeadDecision(
  service: any,
  lead: JsonRecord,
  taskId: string,
): Promise<AdaptiveLeadExperienceAppendResult> {
  const candidateId = String(lead.id || "").trim();
  const result: AdaptiveLeadExperienceAppendResult = {
    ok: true,
    candidate_id: candidateId,
    created: 0,
    duplicate: 0,
    errors: [],
  };
  let experiences: JsonRecord[];
  try {
    experiences = await buildAdaptiveLeadDecisionExperiences(lead, taskId);
  } catch (error) {
    result.ok = false;
    result.errors.push({
      event_type: "candidate.score_calculated",
      code: String((error as Error)?.message || error || "UNKNOWN"),
    });
    return result;
  }
  for (const experience of experiences) {
    try {
      const appended = await appendUniversalExperience(service, experience);
      if (appended.status === "CREATED") result.created += 1;
      else result.duplicate += 1;
    } catch (error) {
      result.ok = false;
      result.errors.push({
        event_type: experience.event_type as AdaptiveLeadExperienceEventType,
        code: String((error as Error)?.message || error || "UNKNOWN"),
      });
    }
  }
  return result;
}

const adaptiveProjectionComparable = (event: JsonRecord) => ({
  brand_id: event.brand_id,
  tenant_id: event.tenant_id,
  tenant_scope: event.tenant_scope,
  experience_id: event.experience_id,
  schema_version: event.schema_version,
  event_type: event.event_type,
  event_version: event.event_version,
  source: event.source,
  entity_type: event.entity_type,
  entity_id: event.entity_id,
  idempotency_key: event.idempotency_key,
  aggregate_id: event.aggregate_id,
  sequence_number: event.sequence_number,
  occurred_at: event.occurred_at,
  observed_at: event.observed_at,
  effective_at: event.effective_at,
  available_at: event.available_at,
  payload_content_hash: event.payload_content_hash,
  actor_json: event.actor_json,
  identity_json: event.identity_json,
  source_json: event.source_json,
  context_snapshot_id: event.context_snapshot_id,
  decision_json: event.decision_json,
  producer_json: event.producer_json,
  authority_json: event.authority_json,
  execution_json: event.execution_json,
  outcome_json: event.outcome_json,
  learning_json: event.learning_json,
  privacy_json: event.privacy_json,
  trace_json: event.trace_json,
  data_quality_json: event.data_quality_json,
  is_demo: event.is_demo,
  is_synthetic: event.is_synthetic,
  is_test: event.is_test,
  is_replay: event.is_replay,
  payload_json: event.payload_json,
  status: event.status,
});

/**
 * Proves that the current committed Adaptive Lead decision has exactly one
 * immutable score event and exactly one outreach-worthiness event. This is a
 * strict contact-data gate: an unavailable read, missing row, duplicate row or
 * envelope/source mismatch is never interpreted as success.
 */
export async function verifyCommittedAdaptiveLeadDecisionProjection(
  service: any,
  lead: JsonRecord,
): Promise<AdaptiveLeadProjectionGateResult> {
  const candidateId = String(lead?.id || "").trim();
  const score = isRecord(lead?.score_breakdown_json)
    ? lead.score_breakdown_json
    : {};
  const decision = isRecord(score.adaptive_lead_v0)
    ? score.adaptive_lead_v0
    : {};
  const decisionId = String(decision.decision_id || "").trim() || null;
  const base: Omit<AdaptiveLeadProjectionGateResult, "allowed" | "state"> = {
    candidate_id: candidateId,
    decision_id: decisionId,
    source_snapshot_hash: null,
    expected_event_types: [...ADAPTIVE_LEAD_CONTACT_GATE_EVENT_TYPES],
    verified_event_types: [] as string[],
    event_ids: [] as string[],
    blockers: [] as string[],
  };

  let expected: JsonRecord[];
  try {
    expected = (await buildAdaptiveLeadDecisionExperiences(
      lead,
      decisionId || "adaptive-projection-verification",
    )).filter((event) =>
      ADAPTIVE_LEAD_CONTACT_GATE_EVENT_TYPES.includes(
        event
          .event_type as typeof ADAPTIVE_LEAD_CONTACT_GATE_EVENT_TYPES[number],
      )
    );
  } catch (_) {
    return {
      ...base,
      allowed: false,
      state: "SOURCE_INVALID",
      blockers: ["adaptive_experience_projection_source_invalid"],
    };
  }

  const expectedSource = isRecord(expected[0]?.source)
    ? String(expected[0].source.content_hash || "")
    : "";
  base.source_snapshot_hash = expectedSource || null;

  let state: AdaptiveLeadProjectionGateState = "VERIFIED";
  for (const experience of expected) {
    const eventType = String(experience.event_type || "");
    const key = String(experience.idempotency_key || "");
    let rows: unknown;
    try {
      rows = await service.entities.Event.filter(
        { idempotency_key: key },
        "-recorded_at",
        2,
      );
    } catch (_) {
      return {
        ...base,
        allowed: false,
        state: "LOOKUP_UNAVAILABLE",
        blockers: ["adaptive_experience_projection_lookup_unavailable"],
      };
    }
    if (!Array.isArray(rows)) {
      return {
        ...base,
        allowed: false,
        state: "LOOKUP_UNAVAILABLE",
        blockers: ["adaptive_experience_projection_lookup_unavailable"],
      };
    }
    if (rows.length === 0) {
      if (state === "VERIFIED") state = "MISSING";
      base.blockers.push(`adaptive_experience_projection_missing:${eventType}`);
      continue;
    }
    if (rows.length > 1) {
      state = "AMBIGUOUS";
      base.blockers.push(
        `adaptive_experience_projection_ambiguous:${eventType}`,
      );
      continue;
    }

    const observed = rows[0] as JsonRecord;
    const projected = projectUniversalExperienceToEvent(experience);
    const observedRecordedAt = isoMillis(observed.recorded_at);
    const observedProcessedAt = isoMillis(observed.processed_at);
    const decisionTime = isoMillis(experience.occurred_at);
    const temporalValid = observedRecordedAt !== null &&
      observedProcessedAt === observedRecordedAt && decisionTime !== null &&
      observedRecordedAt >= decisionTime;
    const expectedHash = await canonicalSha256(
      adaptiveProjectionComparable(projected),
    );
    const observedHash = await canonicalSha256(
      adaptiveProjectionComparable(observed),
    );
    if (!temporalValid || expectedHash !== observedHash) {
      if (state !== "AMBIGUOUS") state = "INVALID";
      base.blockers.push(`adaptive_experience_projection_invalid:${eventType}`);
      continue;
    }
    base.verified_event_types.push(eventType);
    base.event_ids.push(String(observed.id || key));
  }

  const allowed = state === "VERIFIED" &&
    base.verified_event_types.length ===
      ADAPTIVE_LEAD_CONTACT_GATE_EVENT_TYPES.length;
  return {
    ...base,
    allowed,
    state: allowed ? "VERIFIED" : state,
    blockers: [...new Set(base.blockers)],
  };
}

/**
 * Rebuilds only the Event projection from the already-committed OutboundLead
 * snapshot. It never recalculates a score, mutates the source or enables
 * learning. A create-then-ack crash is considered recovered only when the
 * strict read-back proves the complete exact projection.
 */
export async function reconcileCommittedAdaptiveLeadDecisionProjection(
  service: any,
  lead: JsonRecord,
  reconciliationId: string,
): Promise<AdaptiveLeadProjectionReconciliationResult> {
  const append = await appendCommittedAdaptiveLeadDecision(
    service,
    lead,
    reconciliationId,
  );
  const gate = await verifyCommittedAdaptiveLeadDecisionProjection(
    service,
    lead,
  );
  return {
    ...gate,
    append,
    recovered_after_append_error: gate.allowed && !append.ok,
    rescore_performed: false,
    source_mutated: false,
    learning_eligible: false,
  };
}

export async function buildDiscoveryRunExperience(
  run: JsonRecord,
  eventType: DiscoveryExperienceEventType,
  stage: string,
  descriptor?: DiscoveryExperienceDescriptor,
): Promise<JsonRecord> {
  const resolvedDescriptor = descriptor || {
    projection_key: `${safeKeyPart(stage)}.${safeKeyPart(eventType)}`,
    event_type: eventType,
    stage,
    occurred_at: String(
      run.completed_at || run.heartbeat_at || run.started_at || "",
    ),
    sequence_number: Number(run.run_revision || 0),
    source_snapshot: {
      run_revision: Number(run.run_revision || 0),
      status: run.status || null,
      accepted_plan_hash: run.accepted_plan_hash || null,
      terminal_snapshot_hash: run.terminal_snapshot_hash || null,
      result_ids: Array.isArray(run.result_ids) ? run.result_ids : [],
      result_attribution: Array.isArray(run.result_attribution_json)
        ? run.result_attribution_json
        : [],
      scoring_coverage: isRecord(run.scoring_coverage_json)
        ? run.scoring_coverage_json
        : {},
    },
  };
  if (resolvedDescriptor.event_type !== eventType) {
    throw new Error("discovery_experience_descriptor_type_mismatch");
  }
  const timestamp = String(resolvedDescriptor.occurred_at || "");
  if (isoMillis(timestamp) === null) {
    throw new Error("discovery_experience_timestamp_required");
  }
  const recordedAt = new Date(
    Math.max(Date.now(), Date.parse(timestamp)),
  ).toISOString();
  const runId = String(run.id || "");
  const payload = {
    run_id: runId,
    projection_key: resolvedDescriptor.projection_key,
    stage: resolvedDescriptor.stage,
    discovery_type: run.discovery_type || null,
    source_snapshot: resolvedDescriptor.source_snapshot,
  };
  const payloadHash = await canonicalSha256(payload);
  const sourceHash = await canonicalSha256({
    run_id: runId,
    projection_key: resolvedDescriptor.projection_key,
    source_snapshot: resolvedDescriptor.source_snapshot,
  });
  const eventFailed = eventType === "discovery.stage.failed";
  const resultEvent = eventType === "discovery.result.attributed" ||
    eventType === "discovery.result.scored";
  const reasonCode = eventType === "discovery.plan.accepted"
    ? "ACCEPTED_PLAN"
    : eventType === "discovery.stage.started"
    ? "STAGE_STARTED"
    : eventType === "discovery.stage.failed"
    ? String(
      (resolvedDescriptor.source_snapshot as JsonRecord).status ||
        "STAGE_FAILED",
    )
    : eventType === "discovery.stage.completed"
    ? String(
      (resolvedDescriptor.source_snapshot as JsonRecord).status ||
        "STAGE_COMPLETED",
    )
    : eventType === "discovery.result.attributed"
    ? "RESULTS_ATTRIBUTED"
    : "RESULTS_SCORED";
  return {
    experience_id:
      `discovery:${runId}:${resolvedDescriptor.projection_key}:${eventType}`,
    schema_version: UNIVERSAL_EXPERIENCE_SCHEMA_VERSION,
    event_type: eventType,
    event_version: 1,
    occurred_at: timestamp,
    observed_at: timestamp,
    recorded_at: recordedAt,
    effective_at: timestamp,
    available_at: timestamp,
    tenant_id: "_platform",
    tenant_scope: "PLATFORM",
    idempotency_key:
      `discovery:${runId}:${resolvedDescriptor.projection_key}:${eventType}`,
    payload_content_hash: `sha256:${payloadHash}`,
    actor: {
      type: run.initiator === "FOUNDER" ? "HUMAN" : "WORKER",
      id: String(run.created_by_email || "discovery_executor"),
      actor_version: String(run.engine_version || "unknown"),
    },
    identity: {
      discovery_run_id: runId,
      market: null,
      company_id: null,
    },
    source: {
      system: "DiscoveryExecutionRun",
      entity_type: "DiscoveryExecutionRun",
      record_id: runId,
      content_hash: `sha256:${sourceHash}`,
      evidence_ids: [],
    },
    context_snapshot_id: `discovery-plan:${
      String(
        run.accepted_plan_hash || "missing",
      )
    }`,
    decision: {
      decision_id:
        `discovery-run:${runId}:${resolvedDescriptor.projection_key}`,
      decision_type: eventType === "discovery.plan.accepted"
        ? "ACCEPT_PLAN"
        : resultEvent
        ? "FINALIZE_RUN"
        : "ADVANCE_STAGE",
      reason_codes: [reasonCode],
    },
    producer: {
      code_version: String(run.engine_version || "unknown"),
      policy_version: String(run.source_capability_version || "unknown"),
      cambra_model_id: null,
    },
    authority: {
      authority_snapshot_id: `discovery-plan:${
        String(
          run.accepted_plan_hash || "missing",
        )
      }`,
      decision: "ALLOW_WITHIN_ACCEPTED_PLAN",
      approval_required: false,
    },
    execution: {
      status: eventType === "discovery.stage.started"
        ? "QUEUED"
        : eventFailed
        ? "FAILED"
        : "EXECUTED",
      execution_id: runId,
      idempotency_key: String(run.run_key || runId),
    },
    outcome: {
      status: resultEvent ? "OBSERVED" : "PENDING",
      outcome_id: resultEvent ? `discovery-run:${runId}` : null,
    },
    learning: {
      eligibility: "QUARANTINED",
      reason_codes: [
        "DISCOVERY_OPERATIONAL_TRUTH_RUNTIME_NOT_VERIFIED",
        "MANDATORY_INTELLIGENCE_GATES_BLOCKED",
      ],
    },
    privacy: {
      classification: "CONFIDENTIAL",
      purpose: ["DISCOVERY_OPERATION"],
      training_allowed: false,
      cross_tenant_allowed: false,
      retention_policy_key: "commercial-intelligence",
    },
    trace: {
      correlation_id: String(run.run_key || runId),
      aggregate_id: runId,
      sequence_number: resolvedDescriptor.sequence_number,
    },
    data_quality: {
      schema_valid: true,
      identity_resolution_status: "PARTIAL",
      provenance_completeness: run.accepted_plan_hash ? "PARTIAL" : "MISSING",
      context_completeness: resultEvent
        ? "TERMINAL_SOURCE_SNAPSHOT"
        : "ACCEPTED_PLAN_AND_STAGE_SOURCE",
      execution_certainty: eventType === "discovery.stage.started"
        ? "PENDING"
        : "OBSERVED",
      outcome_certainty: "NOT_ECONOMIC_OUTCOME",
      temporal_consistency: "VALID",
      currency_unit_validity: "NOT_APPLICABLE",
      contradiction_status: "UNKNOWN",
      privacy_eligibility: "OPERATION_ONLY",
      learning_eligibility: "QUARANTINED",
    },
    is_demo: false,
    is_synthetic: false,
    is_test: false,
    is_replay: false,
    payload,
  };
}

/**
 * Projects all facts currently reconstructible from one committed run.
 * Failure is explicit in the returned result and is safe to retry. This method
 * never updates DiscoveryExecutionRun, including terminal rows.
 */
export async function reconcileDiscoveryRunExperiences(
  service: any,
  run: JsonRecord,
): Promise<DiscoveryExperienceReconciliation> {
  const runId = String(run.id || "").trim();
  const descriptors = expectedDiscoveryRunExperienceDescriptors(run);
  const result: DiscoveryExperienceReconciliation = {
    ok: true,
    run_id: runId,
    expected: descriptors.length,
    created: 0,
    duplicate: 0,
    errors: [],
  };
  for (const descriptor of descriptors) {
    try {
      const experience = await buildDiscoveryRunExperience(
        run,
        descriptor.event_type,
        descriptor.stage,
        descriptor,
      );
      const appended = await appendUniversalExperience(service, experience);
      if (appended.status === "CREATED") result.created += 1;
      else result.duplicate += 1;
    } catch (error) {
      result.ok = false;
      result.errors.push({
        projection_key: descriptor.projection_key,
        event_type: descriptor.event_type,
        code: String((error as Error)?.message || error || "UNKNOWN"),
      });
    }
  }
  return result;
}

export async function reconcileDiscoveryExperienceBatch(
  service: any,
  runs: JsonRecord[],
  limit = 12,
) {
  const results: DiscoveryExperienceReconciliation[] = [];
  for (const run of runs.slice(0, Math.max(1, Math.min(50, limit)))) {
    try {
      results.push(await reconcileDiscoveryRunExperiences(service, run));
    } catch (error) {
      results.push({
        ok: false,
        run_id: String(run?.id || "UNKNOWN"),
        expected: 0,
        created: 0,
        duplicate: 0,
        errors: [{
          projection_key: "RECONSTRUCTION",
          event_type: "discovery.plan.accepted",
          code: String((error as Error)?.message || error || "UNKNOWN"),
        }],
      });
    }
  }
  return {
    ok: results.every((item) => item.ok),
    runs: results,
    expected: results.reduce((sum, item) => sum + item.expected, 0),
    created: results.reduce((sum, item) => sum + item.created, 0),
    duplicate: results.reduce((sum, item) => sum + item.duplicate, 0),
    errors: results.flatMap((item) =>
      item.errors.map((error) => ({
        run_id: item.run_id,
        ...error,
      }))
    ),
  };
}

const reason = (set: Set<string>, code: string, condition: boolean) => {
  if (condition) set.add(code);
};

const recordOrEmpty = (value: unknown): JsonRecord =>
  isRecord(value) ? value : {};

const exactReferenceList = (value: unknown) => {
  if (!Array.isArray(value)) return { refs: [] as string[], valid: false };
  const raw = value.map((item) => String(item ?? "").trim());
  const valid = raw.length > 0 && raw.every((item) =>
    item.length > 0 &&
    item.length <= 240 &&
    !/[\s*?]/.test(item)
  ) && new Set(raw).size === raw.length;
  return { refs: valid ? raw : raw.filter(Boolean), valid };
};

const sameReferenceSet = (left: string[], right: string[]) =>
  left.length === right.length &&
  [...left].sort().every((item, index) => item === [...right].sort()[index]);

const freezeDecision = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      freezeDecision(nested);
    }
  }
  return value;
};

/**
 * Strict, purpose-specific admission gate for learning material.
 *
 * - INELIGIBLE means a known disqualifier exists.
 * - QUARANTINED means required truth is absent, ambiguous or not runtime-proven.
 * - CLEARED means this policy's contract is satisfied for the requested scope;
 *   it is not a dataset seal or model promotion.
 */
export function evaluateLearningEligibility(
  input: unknown,
): LearningEligibilityDecision {
  const ineligible = new Set<string>();
  const quarantined = new Set<string>();
  const value = recordOrEmpty(input);
  const evaluatedAt = nonEmpty(value.evaluated_at) ? value.evaluated_at : null;
  const requestedUseRaw = String(value.requested_use_class || "").toUpperCase();
  const requestedUse = LEARNING_USE_CLASSES.includes(requestedUseRaw as never)
    ? requestedUseRaw as LearningUseClass
    : null;
  if (!requestedUse) quarantined.add("REQUESTED_USE_CLASS_MISSING_OR_INVALID");
  if (requestedUse === "DESCRIPTIVE" || requestedUse === "ADVISORY") {
    ineligible.add("NON_LEARNING_USE_CLASS");
  }

  const privacy = recordOrEmpty(value.privacy);
  const purpose = nonEmpty(value.purpose) ? value.purpose : null;
  if (!purpose) quarantined.add("PURPOSE_MISSING");
  if (
    purpose && nonEmpty(privacy.requested_purpose) &&
    purpose !== privacy.requested_purpose
  ) {
    ineligible.add("PURPOSE_BINDING_MISMATCH");
  }

  const rawLineage = recordOrEmpty(value.lineage);
  const lineage = {
    experience_refs: exactReferenceList(rawLineage.experience_refs),
    evidence_refs: exactReferenceList(rawLineage.evidence_refs),
    observation_refs: exactReferenceList(rawLineage.observation_refs),
    claim_refs: exactReferenceList(rawLineage.claim_refs),
    outcome_refs: exactReferenceList(rawLineage.outcome_refs),
    execution_receipt_refs: exactReferenceList(
      rawLineage.execution_receipt_refs,
    ),
  };
  for (const [key, refs] of Object.entries(lineage)) {
    if (!refs.valid) quarantined.add(`LINEAGE_EXACT_REFS_REQUIRED:${key}`);
  }

  const data = recordOrEmpty(value.data);
  reason(ineligible, "DATA_REVOKED", data.revoked === true);
  reason(ineligible, "DEMO_DATA", data.is_demo === true);
  reason(ineligible, "SYNTHETIC_DATA", data.is_synthetic === true);
  reason(ineligible, "TEST_DATA", data.is_test === true);
  reason(ineligible, "REPLAY_DATA", data.is_replay === true);
  reason(
    ineligible,
    "SELF_REFERENTIAL_LABEL",
    data.self_generated_label === true,
  );
  reason(
    ineligible,
    "CALLER_ELIGIBILITY_HINT_REJECTED",
    data.caller_declared_training_eligible === true ||
      data.training_eligible_hint === true ||
      data.training_eligible_core === true,
  );
  if (
    ["MODEL_EVALUATION", "MODEL_TRAINING", "CALIBRATION"].includes(
      String(requestedUse || ""),
    )
  ) {
    reason(
      ineligible,
      "MANUAL_PROMOTION_NOT_MODEL_AUTHORITY",
      data.manual_promotion_requested === true ||
        data.manual_override === true ||
        data.weak_evidence === true,
    );
  }

  const gates = Array.isArray(value.gates) ? value.gates.filter(isRecord) : [];
  const requiredGateIds = [
    ...MANDATORY_LEARNING_GATE_IDS,
    ...(Array.isArray(value.additional_required_gate_ids)
      ? value.additional_required_gate_ids.filter(nonEmpty)
      : []),
  ];
  for (const gateId of [...new Set(requiredGateIds)]) {
    const gate = gates.find((candidate) => candidate.gate_id === gateId);
    if (!gate) {
      quarantined.add(`GATE_MISSING:${gateId}`);
      continue;
    }
    if (gate.status !== "PASSED") quarantined.add(`GATE_NOT_PASSED:${gateId}`);
    if (!nonEmptyStrings(gate.runtime_evidence)) {
      quarantined.add(`GATE_RUNTIME_EVIDENCE_MISSING:${gateId}`);
    }
  }

  const tenant = recordOrEmpty(value.tenant);
  if (!nonEmpty(tenant.tenant_id)) quarantined.add("TENANT_ID_MISSING");
  if (!EXPERIENCE_TENANT_SCOPES.includes(tenant.tenant_scope as never)) {
    quarantined.add("TENANT_SCOPE_INVALID");
  }
  if (tenant.identity_status !== "RESOLVED") {
    quarantined.add("IDENTITY_NOT_RESOLVED");
  }
  if (tenant.identity_conflict === true) quarantined.add("IDENTITY_CONFLICT");

  const evidence = recordOrEmpty(value.evidence);
  if (!nonEmptyStrings(evidence.evidence_refs)) {
    quarantined.add("EVIDENCE_REFS_MISSING");
  } else if (
    !sameReferenceSet(
      evidence.evidence_refs as string[],
      lineage.evidence_refs.refs,
    )
  ) {
    quarantined.add("EVIDENCE_LINEAGE_MISMATCH");
  }
  if (!nonEmptyStrings(evidence.source_refs)) {
    quarantined.add("SOURCE_REFS_MISSING");
  }
  if (evidence.provenance_status !== "VERIFIED") {
    quarantined.add("PROVENANCE_NOT_VERIFIED");
  }
  if (!["V2", "V3", "V4"].includes(String(evidence.verification_tier || ""))) {
    quarantined.add("EVIDENCE_VERIFICATION_TIER_INSUFFICIENT");
  }
  if (evidence.contradiction_status !== "CLEAR") {
    quarantined.add("EVIDENCE_CONTRADICTED_OR_UNKNOWN");
  }

  if (privacy.training_allowed !== true) ineligible.add("TRAINING_NOT_ALLOWED");
  if (
    !nonEmpty(privacy.requested_purpose) ||
    !nonEmptyStrings(privacy.allowed_purposes) ||
    !privacy.allowed_purposes.includes(privacy.requested_purpose)
  ) {
    ineligible.add("PURPOSE_NOT_ALLOWED");
  }
  if (!nonEmpty(privacy.legal_basis)) quarantined.add("LEGAL_BASIS_MISSING");
  if (!nonEmpty(privacy.retention_policy_key)) {
    quarantined.add("RETENTION_POLICY_MISSING");
  }
  if (privacy.restriction_active === true) {
    ineligible.add("PRIVACY_RESTRICTION_ACTIVE");
  }
  if (privacy.special_category_data === true) {
    ineligible.add("SPECIAL_CATEGORY_DATA");
  }
  if (tenant.tenant_scope === "ANONYMIZED_AGGREGATE") {
    if (privacy.cross_tenant_allowed !== true) {
      ineligible.add("CROSS_TENANT_NOT_ALLOWED");
    }
    if (
      !Number.isInteger(privacy.cohort_size) || Number(privacy.cohort_size) < 10
    ) {
      ineligible.add("AGGREGATE_K_BELOW_10");
    }
    if (privacy.reidentification_mapping_present === true) {
      ineligible.add("REIDENTIFICATION_MAPPING_PRESENT");
    }
  }

  const execution = recordOrEmpty(value.execution);
  if (execution.status !== "EXECUTED") {
    quarantined.add("EXECUTION_NOT_CONFIRMED");
  }
  if (
    !nonEmpty(execution.execution_id) || !nonEmpty(execution.idempotency_key)
  ) quarantined.add("EXECUTION_LINEAGE_MISSING");
  if (
    nonEmpty(execution.execution_id) &&
    !lineage.execution_receipt_refs.refs.includes(execution.execution_id)
  ) {
    quarantined.add("EXECUTION_RECEIPT_LINEAGE_MISMATCH");
  }

  const outcome = recordOrEmpty(value.outcome);
  if (!["VERIFIED", "RECONCILED"].includes(String(outcome.status || ""))) {
    quarantined.add("OUTCOME_NOT_VERIFIED");
  }
  if (outcome.label_mature !== true) quarantined.add("LABEL_NOT_MATURE");
  if (
    !nonEmpty(outcome.outcome_id) || !nonEmpty(outcome.verification_source_id)
  ) quarantined.add("OUTCOME_LINEAGE_MISSING");
  if (
    nonEmpty(outcome.outcome_id) &&
    !lineage.outcome_refs.refs.includes(outcome.outcome_id)
  ) {
    quarantined.add("OUTCOME_REFERENCE_LINEAGE_MISMATCH");
  }

  const label = recordOrEmpty(value.label);
  if (!nonEmpty(label.definition_id) || !nonEmpty(label.definition_version)) {
    quarantined.add("LABEL_DEFINITION_MISSING");
  }
  if (!nonEmpty(label.source)) quarantined.add("LABEL_SOURCE_MISSING");
  if (label.source === "CAMBRA_GENERATED_ONLY") {
    ineligible.add("SELF_REFERENTIAL_LABEL");
  }
  if (label.source === "MANUAL_OVERRIDE") {
    ineligible.add("MANUAL_LABEL_NOT_DEFENSIBLE");
  }
  const verificationOrder = ["V0", "V1", "V2", "V3", "V4"];
  const requiredVerificationTier = String(
    label.minimum_verification_tier || "",
  );
  if (!verificationOrder.includes(requiredVerificationTier)) {
    quarantined.add("LABEL_MINIMUM_VERIFICATION_TIER_MISSING");
  } else if (
    verificationOrder.indexOf(String(evidence.verification_tier || "")) <
      verificationOrder.indexOf(requiredVerificationTier)
  ) {
    ineligible.add("LABEL_VERIFICATION_TIER_NOT_MET");
  }

  const time = recordOrEmpty(value.time);
  const requiredTimeKeys = [
    "occurred_at",
    "observed_at",
    "recorded_at",
    "effective_at",
    "available_at",
    "prediction_time",
    "training_cutoff",
    "outcome_mature_at",
    "evaluated_at",
  ];
  const parsedTimes: Record<string, number | null> = {};
  for (const key of requiredTimeKeys) {
    parsedTimes[key] = isoMillis(time[key]);
    if (parsedTimes[key] === null) {
      quarantined.add(`TIME_INVALID_OR_MISSING:${key}`);
    }
  }
  const ordered = (left: string, right: string, code: string) => {
    const leftValue = parsedTimes[left];
    const rightValue = parsedTimes[right];
    if (leftValue !== null && rightValue !== null && leftValue > rightValue) {
      quarantined.add(code);
    }
  };
  ordered("occurred_at", "observed_at", "TIME_OCCURRED_AFTER_OBSERVED");
  ordered("observed_at", "recorded_at", "TIME_OBSERVED_AFTER_RECORDED");
  ordered("effective_at", "available_at", "TIME_EFFECTIVE_AFTER_AVAILABLE");
  ordered("available_at", "prediction_time", "POINT_IN_TIME_LEAKAGE");
  ordered("recorded_at", "prediction_time", "POINT_IN_TIME_RECORDING_LEAKAGE");
  ordered(
    "training_cutoff",
    "prediction_time",
    "TRAINING_CUTOFF_AFTER_PREDICTION",
  );
  ordered(
    "prediction_time",
    "outcome_mature_at",
    "OUTCOME_MATURES_BEFORE_PREDICTION",
  );
  ordered(
    "outcome_mature_at",
    "evaluated_at",
    "OUTCOME_NOT_MATURE_AT_EVALUATION",
  );
  if (
    evaluatedAt !== null && isoMillis(evaluatedAt) !== parsedTimes.evaluated_at
  ) {
    quarantined.add("EVALUATION_TIME_MISMATCH");
  }

  const allowedScopes = Array.isArray(privacy.allowed_scopes)
    ? privacy.allowed_scopes.filter(nonEmpty)
    : [];
  if (allowedScopes.length === 0) quarantined.add("ALLOWED_SCOPE_MISSING");
  const requiredScope = tenant.tenant_scope === "ANONYMIZED_AGGREGATE"
    ? "privacy_safe_aggregate"
    : tenant.tenant_scope === "TENANT"
    ? "tenant_private"
    : tenant.tenant_scope === "PLATFORM"
    ? "platform"
    : null;
  if (requiredScope && !allowedScopes.includes(requiredScope)) {
    ineligible.add("TENANT_SCOPE_NOT_ALLOWED");
  }

  const normalizedLineage = Object.fromEntries(
    Object.entries(lineage).map(([key, refs]) => [key, refs.refs]),
  ) as LearningEligibilityDecision["lineage"];
  const base: Pick<
    LearningEligibilityDecision,
    | "policy_version"
    | "evaluated_at"
    | "decided_at"
    | "requested_use_class"
    | "purpose"
    | "lineage"
  > = {
    policy_version: LEARNING_ELIGIBILITY_POLICY_VERSION,
    evaluated_at: evaluatedAt,
    decided_at: evaluatedAt,
    requested_use_class: requestedUse,
    purpose,
    lineage: normalizedLineage,
  };
  const allReasons = [...ineligible, ...quarantined].sort();
  if (ineligible.size > 0) {
    const status: LearningEligibilityStatus = data.revoked === true
      ? "REVOKED"
      : "INELIGIBLE";
    return freezeDecision({
      ...base,
      state: "INELIGIBLE",
      status,
      reason_codes: allReasons,
      allowed_scopes: [],
      allowed_uses: [],
    });
  }
  if (quarantined.size > 0) {
    const status: LearningEligibilityStatus = quarantined.has(
        "EXECUTION_NOT_CONFIRMED",
      )
      ? "PENDING_EXECUTION"
      : quarantined.has("OUTCOME_NOT_VERIFIED")
      ? "PENDING_OUTCOME"
      : quarantined.has("LABEL_NOT_MATURE")
      ? "PENDING_LABEL_MATURITY"
      : "PENDING_PROVENANCE";
    return freezeDecision({
      ...base,
      state: "QUARANTINED",
      status,
      reason_codes: [...quarantined].sort(),
      allowed_scopes: [],
      allowed_uses: [],
    });
  }
  const status: LearningEligibilityStatus = tenant.tenant_scope ===
      "ANONYMIZED_AGGREGATE"
    ? "ELIGIBLE_AGGREGATE_ONLY"
    : requestedUse === "MODEL_TRAINING"
    ? "ELIGIBLE_TRAINING"
    : "ELIGIBLE_EVALUATION_ONLY";
  return freezeDecision({
    ...base,
    state: "CLEARED",
    status,
    reason_codes: [],
    allowed_scopes: [...new Set(allowedScopes)].sort(),
    allowed_uses: requestedUse ? [requestedUse] : [],
  });
}

/**
 * Produces the immutable, content-addressed decision receipt. Persistence is
 * append-only through the existing Event ledger; callers cannot supply or
 * overwrite the decision identity.
 */
async function contentAddressLearningEligibilityDecision(
  decision: LearningEligibilityDecision,
  value: JsonRecord,
): Promise<ImmutableLearningEligibilityDecision> {
  const supersedes = nonEmpty(value.supersedes_decision_id)
    ? value.supersedes_decision_id
    : null;
  const expiresAt = nonEmpty(value.expires_at) ? value.expires_at : null;
  const revocationRef = nonEmpty(value.revocation_ref)
    ? value.revocation_ref
    : null;
  const contentHash = await canonicalSha256({
    decision,
    supersedes_decision_id: supersedes,
    expires_at: expiresAt,
    revocation_ref: revocationRef,
  });
  return freezeDecision({
    ...decision,
    eligibility_decision_id: `learning-eligibility:${contentHash}`,
    content_hash: `sha256:${contentHash}`,
    immutable: true,
    supersedes_decision_id: supersedes,
    expires_at: expiresAt,
    revocation_ref: revocationRef,
  });
}

export async function buildLearningEligibilityDecision(
  input: unknown,
): Promise<ImmutableLearningEligibilityDecision> {
  return contentAddressLearningEligibilityDecision(
    evaluateLearningEligibility(input),
    recordOrEmpty(input),
  );
}

const sameLoadedIds = (refs: string[], rows: JsonRecord[]) => {
  const ids = rows.map((row) => String(row?.id || ""));
  return ids.length === refs.length && new Set(ids).size === ids.length &&
    refs.every((ref) => ids.includes(ref));
};

async function loadExactEligibilityRows(
  service: any,
  entityName: string,
  refs: string[],
) {
  const rows: JsonRecord[] = [];
  for (const ref of refs) {
    const row = await service.entities[entityName].get(ref);
    if (!row) throw new Error(`learning_lineage_not_found:${entityName}:${ref}`);
    rows.push(row);
  }
  if (!sameLoadedIds(refs, rows)) {
    throw new Error(`learning_lineage_reference_mismatch:${entityName}`);
  }
  return rows;
}

const eventPurposes = (row: JsonRecord) => {
  const identity = recordOrEmpty(row.identity_json);
  const privacy = recordOrEmpty(row.privacy_json);
  const payload = recordOrEmpty(row.payload_json);
  return [
    identity.purpose,
    payload.purpose,
    ...(Array.isArray(privacy.purpose) ? privacy.purpose : []),
  ].filter(nonEmpty).map((item) => String(item));
};

const rowTime = (row: JsonRecord, ...keys: string[]) => {
  for (const key of keys) {
    const parsed = isoMillis(row[key]);
    if (parsed !== null) return parsed;
  }
  return null;
};

function assertExperiencePurposeTime(
  rows: JsonRecord[],
  purpose: string,
) {
  for (const row of rows) {
    if (
      row.schema_version !== UNIVERSAL_EXPERIENCE_SCHEMA_VERSION ||
      row.status !== "processed" ||
      row.is_demo === true || row.is_synthetic === true ||
      row.is_test === true || row.is_replay === true
    ) throw new Error("learning_experience_not_committed_real_experience");
    if (!eventPurposes(row).includes(purpose)) {
      throw new Error("learning_experience_purpose_mismatch");
    }
    const occurred = rowTime(row, "occurred_at");
    const observed = rowTime(row, "observed_at");
    const recorded = rowTime(row, "recorded_at");
    const effective = rowTime(row, "effective_at");
    const available = rowTime(row, "available_at");
    if (
      occurred === null || observed === null || recorded === null ||
      effective === null || available === null || occurred > observed ||
      observed > recorded || effective > available
    ) throw new Error("learning_experience_time_invalid");
  }
}

function assertReceiptPurposeTime(
  rows: JsonRecord[],
  purpose: string,
) {
  for (const row of rows) {
    if (
      row.status !== "processed" ||
      recordOrEmpty(row.execution_json).status !== "EXECUTED"
    ) throw new Error("learning_execution_receipt_not_executed");
    if (!eventPurposes(row).includes(purpose)) {
      throw new Error("learning_execution_receipt_purpose_mismatch");
    }
    const execution = recordOrEmpty(row.execution_json);
    if (
      isoMillis(execution.executed_at) === null &&
      rowTime(row, "processed_at", "recorded_at", "occurred_at") === null
    ) throw new Error("learning_execution_receipt_time_invalid");
  }
}

function terminalOutcomeSource(
  outcome: JsonRecord,
  source: JsonRecord,
  tenantId: string,
) {
  if (
    !source || String(source.brand_id || "") !== tenantId ||
    String(outcome.related_entity_id || outcome.verification_source_id || "") !==
      String(outcome.verification_source_id || "")
  ) return false;
  const type = String(outcome.verification_source_type || "");
  if (type === "MonthlySavingsReport") {
    return source.measurement_mode === "fully_verified" &&
      ["realized", "invoiced", "paid", "verified"].includes(
        String(source.verification_status || ""),
      ) && rowTime(source, "verified_at", "updated_date", "created_date") !== null;
  }
  if (type === "NegotiationCase") {
    return ["approved", "rejected", "closed", "expired"].includes(
      String(source.status || ""),
    ) && rowTime(source, "closed_at", "updated_date") !== null;
  }
  if (type === "MigrationTask") {
    return ["done", "blocked", "canceled"].includes(
      String(source.status || ""),
    ) && rowTime(source, "completed_at", "updated_at", "updated_date") !== null;
  }
  return false;
}

/**
 * Re-derives the learning decision from server-loaded rows. The persisted
 * path never trusts caller-declared gates, provenance, execution or outcome
 * state. Current runtime remains fail-closed until the four shared gates and
 * an approved-label-contract gate have fresh RuntimeGateEvidence PASS rows.
 */
export async function evaluateLearningEligibilityFromService(
  service: any,
  input: unknown,
): Promise<LearningEligibilityDecision> {
  const value = recordOrEmpty(input);
  const rawLineage = recordOrEmpty(value.lineage);
  const parsed = {
    experience_refs: exactReferenceList(rawLineage.experience_refs),
    evidence_refs: exactReferenceList(rawLineage.evidence_refs),
    observation_refs: exactReferenceList(rawLineage.observation_refs),
    claim_refs: exactReferenceList(rawLineage.claim_refs),
    outcome_refs: exactReferenceList(rawLineage.outcome_refs),
    execution_receipt_refs: exactReferenceList(
      rawLineage.execution_receipt_refs,
    ),
  };
  for (const [key, refs] of Object.entries(parsed)) {
    if (!refs.valid) throw new Error(`learning_lineage_exact_refs_required:${key}`);
  }
  const [experiences, evidence, observations, claims, outcomes, receipts] =
    await Promise.all([
      loadExactEligibilityRows(
        service,
        "Event",
        parsed.experience_refs.refs,
      ),
      loadExactEligibilityRows(
        service,
        "IntelligenceEvidence",
        parsed.evidence_refs.refs,
      ),
      loadExactEligibilityRows(
        service,
        "IntelligenceObservation",
        parsed.observation_refs.refs,
      ),
      loadExactEligibilityRows(
        service,
        "KnowledgeClaim",
        parsed.claim_refs.refs,
      ),
      loadExactEligibilityRows(
        service,
        "IntelligenceOutcome",
        parsed.outcome_refs.refs,
      ),
      loadExactEligibilityRows(
        service,
        "Event",
        parsed.execution_receipt_refs.refs,
      ),
    ]);

  const tenant = recordOrEmpty(value.tenant);
  const tenantId = String(tenant.tenant_id || "");
  const tenantScope = String(tenant.tenant_scope || "");
  const purpose = String(value.purpose || "");
  const domain = String(value.domain || "");
  if (tenantScope !== "TENANT" || !tenantId || !purpose || !domain) {
    throw new Error("learning_lineage_tenant_purpose_binding_required");
  }
  const scopedRows = [...evidence, ...observations, ...claims, ...outcomes];
  if (scopedRows.some((row) =>
    String(row.tenant_scope || "") !== "tenant" ||
    String(row.brand_id || "") !== tenantId ||
    String(row.purpose || "") !== purpose ||
    String(row.domain || "") !== domain
  )) throw new Error("learning_lineage_tenant_purpose_mismatch");
  if ([...experiences, ...receipts].some((row) =>
    String(row.tenant_scope || "") !== "TENANT" ||
    String(row.tenant_id || row.brand_id || "") !== tenantId
  )) throw new Error("learning_experience_tenant_mismatch");
  assertExperiencePurposeTime(experiences, purpose);
  assertReceiptPurposeTime(receipts, purpose);

  const evidenceIds = new Set(parsed.evidence_refs.refs);
  const observationIds = new Set(parsed.observation_refs.refs);
  if (observations.some((row) => !evidenceIds.has(String(row.evidence_id || "")))) {
    throw new Error("learning_observation_evidence_lineage_invalid");
  }
  if (claims.some((row) =>
    !Array.isArray(row.evidence_ids) ||
    row.evidence_ids.some((id: unknown) => !evidenceIds.has(String(id))) ||
    !Array.isArray(row.observation_ids) ||
    row.observation_ids.some((id: unknown) => !observationIds.has(String(id)))
  )) throw new Error("learning_claim_lineage_invalid");
  if (outcomes.some((row) =>
    !String(row.verification_source_type || "") ||
    !String(row.verification_source_id || "")
  )) throw new Error("learning_outcome_verification_source_missing");
  if (evidence.some((row) => {
    const effective = rowTime(row, "effective_at", "effective_from");
    const observed = rowTime(row, "observed_at");
    const recorded = rowTime(row, "recorded_at");
    return effective === null || observed === null || recorded === null ||
      effective > observed || observed > recorded;
  })) throw new Error("learning_evidence_time_invalid");
  if (observations.some((row) => {
    const effective = rowTime(row, "effective_at");
    const observed = rowTime(row, "observed_at");
    return effective === null || observed === null || effective > observed;
  })) throw new Error("learning_observation_time_invalid");
  if (claims.some((row) => {
    const effective = rowTime(row, "effective_at", "valid_from");
    const observed = rowTime(row, "observed_at");
    return effective === null || observed === null || effective > observed;
  })) throw new Error("learning_claim_time_invalid");

  const outcomeSources: JsonRecord[] = [];
  const supportedOutcomeSourceEntities: Record<string, string> = {
    MonthlySavingsReport: "MonthlySavingsReport",
    NegotiationCase: "NegotiationCase",
    MigrationTask: "MigrationTask",
  };
  for (const outcome of outcomes) {
    const entityName = supportedOutcomeSourceEntities[
      String(outcome.verification_source_type || "")
    ];
    if (!entityName) throw new Error("learning_outcome_verification_source_unsupported");
    const source = await service.entities[entityName].get(
      String(outcome.verification_source_id || ""),
    );
    if (!terminalOutcomeSource(outcome, source, tenantId)) {
      throw new Error("learning_outcome_verification_source_invalid");
    }
    outcomeSources.push(source);
  }

  const requiredGateIds = [
    ...MANDATORY_LEARNING_GATE_IDS,
    "APPROVED_LABEL_CONTRACT",
  ];
  const at = Date.now();
  const gates: JsonRecord[] = [];
  for (const gateId of requiredGateIds) {
    const rows = await service.entities.RuntimeGateEvidence.filter(
      { gate_key: gateId },
      "-observed_at",
      2,
    );
    const gate = Array.isArray(rows) ? rows[0] : null;
    const latestUnambiguous = gate &&
      (!rows[1] || isoMillis(rows[1].observed_at) !== isoMillis(gate.observed_at));
    const fresh = latestUnambiguous && gate.status === "PASS" &&
      isoMillis(gate.observed_at) !== null &&
      (!gate.expires_at || (isoMillis(gate.expires_at) || 0) > at) &&
      nonEmptyStrings(gate.evidence_refs) &&
      ["REAL_RUNTIME", "EXTERNAL", "OPERATOR_EXERCISE"].includes(
        String(gate.evidence_kind || ""),
      );
    gates.push({
      gate_id: gateId,
      status: fresh ? "PASSED" : "BLOCKED",
      runtime_evidence: fresh ? gate.evidence_refs : [],
    });
  }

  const allEvidenceVerified = evidence.every((row) =>
    row.quarantined !== true && row.is_demo !== true &&
    row.truth_level !== "inferred" && nonEmpty(row.source_reference) &&
    isoMillis(row.observed_at) !== null && isoMillis(row.recorded_at) !== null
  );
  const allOutcomesDefensible = outcomes.every((row, index) =>
    row.is_demo !== true && row.verification_source_validated === true &&
    typeof row.success === "boolean" && nonEmpty(row.verification_source_id) &&
    isoMillis(row.captured_at) !== null &&
    terminalOutcomeSource(row, outcomeSources[index], tenantId)
  );
  const allLabelsMature = outcomes.every((row) =>
    row.label_mature === true && isoMillis(row.label_mature_at) !== null &&
    (isoMillis(row.label_mature_at) || Infinity) <= at
  );
  const executionId = String(receipts[0]?.id || "");
  const outcomeId = String(outcomes[0]?.id || "");
  return evaluateLearningEligibility({
    ...value,
    additional_required_gate_ids: ["APPROVED_LABEL_CONTRACT"],
    gates,
    data: {
      ...recordOrEmpty(value.data),
      is_demo: scopedRows.some((row) => row.is_demo === true),
      weak_evidence: !allEvidenceVerified,
      caller_declared_training_eligible: false,
      training_eligible_hint: false,
      training_eligible_core: false,
    },
    tenant: {
      ...tenant,
      identity_status: "RESOLVED",
      identity_conflict: false,
    },
    evidence: {
      evidence_refs: parsed.evidence_refs.refs,
      source_refs: evidence.map((row) => String(row.source_reference)),
      provenance_status: allEvidenceVerified ? "VERIFIED" : "UNKNOWN",
      verification_tier: allEvidenceVerified && allOutcomesDefensible
        ? "V4"
        : "V1",
      contradiction_status: allEvidenceVerified ? "CLEAR" : "UNKNOWN",
    },
    execution: {
      status: receipts.length > 0 ? "EXECUTED" : "UNKNOWN",
      execution_id: executionId,
      idempotency_key: String(receipts[0]?.idempotency_key || ""),
    },
    outcome: {
      status: allOutcomesDefensible ? "VERIFIED" : "PENDING",
      outcome_id: outcomeId,
      verification_source_id: String(outcomes[0]?.verification_source_id || ""),
      label_mature: allLabelsMature,
    },
  });
}

/**
 * Appends the decision receipt to the existing Event ledger. Event rows are
 * never updated here: same decision/same hash is idempotent; same key with a
 * different hash is an integrity conflict.
 */
export async function appendLearningEligibilityDecision(
  service: any,
  input: unknown,
) {
  const value = recordOrEmpty(input);
  const tenant = recordOrEmpty(value.tenant);
  const contextSnapshotId = nonEmpty(value.context_snapshot_id)
    ? value.context_snapshot_id
    : null;
  if (!contextSnapshotId) {
    throw new Error("learning_eligibility_context_snapshot_required");
  }
  const contextSnapshot = await service.entities.IntelligenceSnapshot.get(
    contextSnapshotId,
  );
  if (
    !contextSnapshot ||
    String(contextSnapshot.brand_id || "") !==
      String(recordOrEmpty(value.tenant).tenant_id || "") ||
    !hasSha256(contextSnapshot.snapshot_hash) ||
    isoMillis(contextSnapshot.captured_at) === null ||
    String(recordOrEmpty(contextSnapshot.snapshot_json).purpose || "") !==
      String(value.purpose || "") ||
    String(recordOrEmpty(contextSnapshot.snapshot_json).domain || "") !==
      String(value.domain || "") ||
    isoMillis(recordOrEmpty(value.time).prediction_time) !==
      isoMillis(contextSnapshot.captured_at)
  ) throw new Error("learning_eligibility_context_snapshot_invalid");
  const evaluated = await evaluateLearningEligibilityFromService(
    service,
    input,
  );
  const decision = await contentAddressLearningEligibilityDecision(
    evaluated,
    value,
  );
  const existing = await service.entities.Event.filter({
    idempotency_key: decision.eligibility_decision_id,
  }, "-created_date", 2);
  if (!Array.isArray(existing)) {
    throw new Error("learning_eligibility_event_read_invalid");
  }
  if (existing.length > 1) {
    throw new Error("learning_eligibility_event_ambiguous");
  }
  if (existing[0]) {
    if (existing[0].payload_content_hash !== decision.content_hash) {
      throw new Error("learning_eligibility_event_content_conflict");
    }
    return freezeDecision({
      status: "DUPLICATE" as const,
      event: existing[0],
      decision,
    });
  }

  const tenantScope = String(tenant.tenant_scope || "");
  const tenantId = String(tenant.tenant_id || "");
  if (!EXPERIENCE_TENANT_SCOPES.includes(tenantScope as never) || !tenantId) {
    throw new Error("learning_eligibility_tenant_binding_required");
  }
  const decidedAt = decision.decided_at;
  if (!decidedAt || isoMillis(decidedAt) === null) {
    throw new Error("learning_eligibility_decided_at_required");
  }
  const event = await service.entities.Event.create({
    brand_id: tenantScope === "TENANT" ? tenantId : "_platform",
    tenant_id: tenantId,
    tenant_scope: tenantScope,
    experience_id: decision.eligibility_decision_id,
    schema_version: UNIVERSAL_EXPERIENCE_SCHEMA_VERSION,
    event_type: "learning.eligibility.decided",
    event_version: 2,
    idempotency_key: decision.eligibility_decision_id,
    occurred_at: decidedAt,
    observed_at: decidedAt,
    recorded_at: decidedAt,
    effective_at: decidedAt,
    available_at: decidedAt,
    payload_content_hash: decision.content_hash,
    actor_json: {
      type: "POLICY_ENGINE",
      id: "shared-learning-eligibility",
      actor_version: LEARNING_ELIGIBILITY_POLICY_VERSION,
    },
    identity_json: {
      tenant_id: tenantId,
      tenant_scope: tenantScope,
      purpose: decision.purpose,
    },
    source_json: {
      system: "CAMBRA_INTELLIGENCE",
      entity_type: "LearningEligibilityDecision",
      record_id: decision.eligibility_decision_id,
      content_hash: decision.content_hash,
      ...decision.lineage,
    },
    context_snapshot_id: contextSnapshotId,
    decision_json: {
      decision_id: decision.eligibility_decision_id,
      decision_type: "LEARNING_ELIGIBILITY",
      status: decision.status,
      requested_use_class: decision.requested_use_class,
      reason_codes: decision.reason_codes,
      policy_version: decision.policy_version,
      immutable: true,
    },
    producer_json: {
      code_version: LEARNING_ELIGIBILITY_POLICY_VERSION,
      policy_version: decision.policy_version,
      cambra_model_id: null,
    },
    authority_json: {
      decision: "NO_EXECUTION_AUTHORITY",
      approval_required: false,
    },
    execution_json: { status: "NOT_PROPOSED", execution_id: null },
    outcome_json: {
      status: decision.status,
      outcome_refs: decision.lineage.outcome_refs,
    },
    learning_json: {
      eligibility: decision.state,
      status: decision.status,
      policy_version: decision.policy_version,
      reason_codes: decision.reason_codes,
      decision_id: decision.eligibility_decision_id,
    },
    privacy_json: {
      classification: String(
        recordOrEmpty(value.privacy).privacy_class || "CONFIDENTIAL",
      ),
      purpose: decision.purpose ? [decision.purpose] : [],
      training_allowed: decision.status === "ELIGIBLE_TRAINING",
      cross_tenant_allowed: tenantScope === "ANONYMIZED_AGGREGATE",
      retention_policy_key: recordOrEmpty(value.privacy)
        .retention_policy_key,
    },
    trace_json: {
      correlation_id: String(value.correlation_id || decision.eligibility_decision_id),
      supersedes_decision_id: decision.supersedes_decision_id,
    },
    data_quality_json: {
      schema_valid: true,
      identity_resolution_status: tenant.identity_status,
      provenance_completeness: decision.status === "PENDING_PROVENANCE"
        ? "INCOMPLETE"
        : "COMPLETE",
      temporal_consistency: decision.reason_codes.some((code) =>
          code.startsWith("TIME_") || code.includes("LEAKAGE")
        )
        ? "INVALID"
        : "VALID",
      learning_eligibility: decision.state,
    },
    is_demo: recordOrEmpty(value.data).is_demo === true,
    is_synthetic: recordOrEmpty(value.data).is_synthetic === true,
    is_test: recordOrEmpty(value.data).is_test === true,
    is_replay: recordOrEmpty(value.data).is_replay === true,
    source: "shared-learning-eligibility",
    entity_type: "LearningEligibilityDecision",
    entity_id: decision.eligibility_decision_id,
    payload_json: { decision },
    status: "processed",
    processed_at: decidedAt,
  });
  const observed = await service.entities.Event.filter({
    idempotency_key: decision.eligibility_decision_id,
  }, "-created_date", 2);
  if (
    !Array.isArray(observed) || observed.length !== 1 ||
    observed[0].payload_content_hash !== decision.content_hash
  ) throw new Error("learning_eligibility_event_append_ambiguous");
  return freezeDecision({ status: "CREATED" as const, event, decision });
}
