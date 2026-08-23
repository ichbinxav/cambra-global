export const AGENT_TASK_ENVELOPE_VERSION = "agent-task-envelope-v2.0.0";
export const LEGACY_AGENT_TASK_ENVELOPE_VERSION = "agent-task-envelope-v1.0.0";

export type AgentTaskTrigger =
  | "SCHEDULED"
  | "MANUAL"
  | "INTERNAL"
  | "EVENT"
  | "APPROVAL"
  | "RESUME"
  | "UNKNOWN";

export type TraceContextState = "OBSERVED" | "NOT_APPLICABLE" | "UNKNOWN";
export type AgentTaskEffectState =
  | "NOT_APPLICABLE"
  | "NOT_STARTED"
  | "EFFECT_STARTED"
  | "EXECUTED"
  | "FAILED_PRE_EFFECT"
  | "FAILED_POST_EFFECT"
  | "REVIEW_REQUIRED";
export type AgentTaskTerminalState =
  | "OPEN"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "REVIEW_REQUIRED";
export type AgentTaskAmbiguityState = "NONE" | "UNKNOWN" | "REVIEW_REQUIRED";
export type AgentTaskCostState =
  | "NOT_APPLICABLE"
  | "NOT_STARTED"
  | "NOT_RESERVED"
  | "RESERVATION_AMBIGUOUS"
  | "RESERVED"
  | "SETTLED"
  | "UNKNOWN";

export type AgentTaskCostEvidence = {
  version: "agent-task-cost-evidence-v1";
  code: string;
  observed_at: string;
  reservation_started: boolean;
  reservation_persisted: boolean;
  settlement_persisted: boolean;
};

type SourceRef = {
  type: string;
  id: string;
  version?: string;
  hash?: string;
};

export type TraceContextRef = {
  status: TraceContextState;
  id?: string | null;
  hash?: string | null;
  key?: string | null;
  version?: string | null;
};

type RootEnvelopeInput = {
  workflowKey: string;
  workflowVersion: string;
  tenantKey: string;
  processingPurpose: string;
  functionName: string;
  input: unknown;
  triggerType?: AgentTaskTrigger;
  sourceRefs?: SourceRef[];
  parentRun?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  policySnapshotId?: string | null;
  policySnapshotHash?: string | null;
  authoritySnapshotId?: string | null;
  authoritySnapshotHash?: string | null;
  intelligenceSnapshotId?: string | null;
  intelligenceSnapshotHash?: string | null;
  policyContext?: TraceContextRef;
  authorityContext?: TraceContextRef;
  intelligenceContext?: TraceContextRef;
  materialEffect?: boolean;
  effectClass?: string | null;
  costApplicable?: boolean;
  deadlineAt?: string | null;
};

type ChildEnvelopeInput = {
  stepKey: string;
  stepIndex: number;
  input: unknown;
  sourceRefs?: SourceRef[];
  subjectType?: string | null;
  subjectId?: string | null;
  materialEffect?: boolean;
  effectClass?: string | null;
  costApplicable?: boolean;
};

export type CanonicalAgentTerminalEventInput = {
  eventType: string;
  source: string;
  entityType?: string | null;
  entityId?: string | null;
  payload?: unknown;
};

type TerminalEnvelopeInput = {
  terminalState: Exclude<AgentTaskTerminalState, "OPEN">;
  effectState: AgentTaskEffectState;
  ambiguityState?: AgentTaskAmbiguityState;
  result: unknown;
  costRecordRefs?: SourceRef[];
  costState?: AgentTaskCostState;
  costEvidence?: AgentTaskCostEvidence;
  effectRefs?: SourceRef[];
  receiptRefs?: SourceRef[];
  policyContext?: TraceContextRef;
  authorityContext?: TraceContextRef;
  intelligenceContext?: TraceContextRef;
  /**
   * Optional durable outbox intent. It is persisted in the same AgentTask CAS
   * as terminal settlement, but it does not create Event and does not claim a
   * cross-entity transaction or datastore uniqueness guarantee.
   */
  terminalEvent?: CanonicalAgentTerminalEventInput;
  /** @deprecated Completeness is derived from states and durable references. */
  effectCoverageComplete?: boolean;
};

const HASH = /^[a-f0-9]{64}$/;
const SAFE_KEY = /^[a-zA-Z0-9_][a-zA-Z0-9._:/-]{0,299}$/;
const SECRET_KEY =
  /(secret|token|password|authorization|cookie|api[_-]?key|private[_-]?key)/i;
const SUPPORTED_ENVELOPE_VERSIONS = new Set([
  AGENT_TASK_ENVELOPE_VERSION,
  LEGACY_AGENT_TASK_ENVELOPE_VERSION,
]);

function canonical(value: unknown): string {
  if (value === undefined) return '["undefined"]';
  if (value === null) return '["null"]';
  if (typeof value === "string") return `["string",${JSON.stringify(value)}]`;
  if (typeof value === "boolean") {
    return `["boolean",${value ? "true" : "false"}]`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("agent_task_projection_non_finite_number");
    }
    return `["number",${
      Object.is(value, -0) ? '"-0"' : JSON.stringify(value)
    }]`;
  }
  if (Array.isArray(value)) {
    return `["array",[${value.map(canonical).join(",")}]]`;
  }
  const record = value as Record<string, unknown>;
  return `["object",[${
    Object.keys(record).sort().map((key) =>
      `[${JSON.stringify(key)},${canonical(record[key])}]`
    ).join(",")
  }]]`;
}

function redactForHash(value: unknown, depth = 0): unknown {
  if (depth > 12) throw new Error("agent_task_projection_depth_limit_exceeded");
  if (value === undefined || value === null) return value;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 500) {
      throw new Error("agent_task_projection_array_limit_exceeded");
    }
    return value.map((item) => redactForHash(item, depth + 1));
  }
  if (typeof value !== "object") {
    throw new Error("agent_task_projection_unsupported_value");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("agent_task_projection_non_plain_object");
  }
  const output: Record<string, unknown> = {};
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 500) {
    throw new Error("agent_task_projection_object_limit_exceeded");
  }
  for (const [key, child] of entries) {
    output[key] = SECRET_KEY.test(key)
      ? "[REDACTED]"
      : redactForHash(child, depth + 1);
  }
  return output;
}

export async function hashAgentTaskProjection(value: unknown) {
  const bytes = new TextEncoder().encode(canonical(redactForHash(value)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function requiredKey(name: string, value: unknown) {
  const normalized = String(value || "").trim();
  if (!SAFE_KEY.test(normalized)) {
    throw new Error(`invalid_agent_task_envelope_${name}`);
  }
  return normalized;
}

function optionalKey(name: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return requiredKey(name, value);
}

function optionalHash(name: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (!HASH.test(normalized)) {
    throw new Error(`invalid_agent_task_envelope_${name}`);
  }
  return normalized;
}

function optionalDate(name: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid_agent_task_envelope_${name}`);
  }
  return new Date(parsed).toISOString();
}

function costEvidence(
  name: string,
  value: AgentTaskCostEvidence | undefined,
): AgentTaskCostEvidence | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== "agent-task-cost-evidence-v1") {
    throw new Error(`invalid_agent_task_envelope_${name}_version`);
  }
  const code = requiredKey(`${name}_code`, value.code);
  const observedAt = optionalDate(`${name}_observed_at`, value.observed_at);
  if (!observedAt) {
    throw new Error(`invalid_agent_task_envelope_${name}_observed_at`);
  }
  for (const field of [
    "reservation_started",
    "reservation_persisted",
    "settlement_persisted",
  ] as const) {
    if (typeof value[field] !== "boolean") {
      throw new Error(`invalid_agent_task_envelope_${name}_${field}`);
    }
  }
  return {
    version: "agent-task-cost-evidence-v1",
    code,
    observed_at: observedAt,
    reservation_started: value.reservation_started,
    reservation_persisted: value.reservation_persisted,
    settlement_persisted: value.settlement_persisted,
  };
}

function rootCostEvidence(costApplicable: boolean, at: string): AgentTaskCostEvidence {
  return {
    version: "agent-task-cost-evidence-v1",
    code: costApplicable ? "ROOT_BOUND_PRE_RESERVATION" : "COST_NOT_APPLICABLE",
    observed_at: at,
    reservation_started: false,
    reservation_persisted: false,
    settlement_persisted: false,
  };
}

function costStateCoherent(input: {
  costApplicable: boolean;
  terminalState: AgentTaskTerminalState;
  costState: AgentTaskCostState;
  costEvidence: AgentTaskCostEvidence | null;
  costRecordRefs: SourceRef[];
}) {
  const evidence = input.costEvidence;
  if (!input.costApplicable) {
    return input.costState === "NOT_APPLICABLE" &&
      input.costRecordRefs.length === 0 && Boolean(evidence) &&
      evidence!.reservation_started === false &&
      evidence!.reservation_persisted === false &&
      evidence!.settlement_persisted === false;
  }
  if (!evidence) return false;
  if (input.costState === "NOT_RESERVED") {
    return input.costRecordRefs.length === 0 &&
      evidence.reservation_started === false &&
      evidence.reservation_persisted === false &&
      evidence.settlement_persisted === false;
  }
  if (input.costState === "RESERVATION_AMBIGUOUS") {
    return input.terminalState === "REVIEW_REQUIRED" &&
      input.costRecordRefs.length === 0 &&
      evidence.reservation_started === true &&
      evidence.reservation_persisted === false &&
      evidence.settlement_persisted === false;
  }
  if (input.costState === "RESERVED") {
    return input.terminalState === "REVIEW_REQUIRED" &&
      input.costRecordRefs.length > 0 &&
      evidence.reservation_started === true &&
      evidence.reservation_persisted === true &&
      evidence.settlement_persisted === false;
  }
  if (input.costState === "SETTLED") {
    return input.costRecordRefs.length > 0 &&
      evidence.reservation_started === true &&
      evidence.reservation_persisted === true &&
      evidence.settlement_persisted === true;
  }
  return false;
}

function sourceRefs(values: SourceRef[] = []) {
  if (values.length > 250) {
    throw new Error("agent_task_source_refs_limit_exceeded");
  }
  return values.map((value) => ({
    type: requiredKey("source_ref_type", value?.type),
    id: requiredKey("source_ref_id", value?.id),
    ...(value?.version
      ? { version: requiredKey("source_ref_version", value.version) }
      : {}),
    ...(value?.hash
      ? { hash: optionalHash("source_ref_hash", value.hash) }
      : {}),
  }));
}

type TraceMutationOutcome =
  | "updated"
  | "conflict"
  | "authority_unavailable"
  | "authority_ambiguous";

function traceMutationOutcome(result: any): TraceMutationOutcome {
  if (!result || typeof result !== "object") return "authority_unavailable";
  const explicit = ["success", "ok"]
    .filter((key) => Object.prototype.hasOwnProperty.call(result, key))
    .map((key) => result[key]);
  if (explicit.some((value) => value !== true)) return "authority_ambiguous";
  const counts = [result.updated, result.modified_count, result.matched_count]
    .filter((value) => value !== undefined && value !== null)
    .map(Number);
  if (
    counts.length === 0 ||
    counts.some((value) => !Number.isInteger(value) || value < 0)
  ) return "authority_unavailable";
  if (new Set(counts).size > 1) return "authority_ambiguous";
  if (counts[0] === 1) return "updated";
  if (counts[0] === 0) return "conflict";
  return "authority_ambiguous";
}

async function updateAgentTaskTraceExactlyOnce(
  svc: any,
  filter: Record<string, unknown>,
  patch: Record<string, unknown>,
  operation: string,
) {
  let result: any;
  try {
    // The platform's updateMany takes MongoDB update operators, never a plain
    // field map: passing the patch directly made every canonical bind fail at
    // runtime while mocked tests still passed.
    result = await svc.entities.AgentTask.updateMany(filter, { $set: patch });
  } catch (cause) {
    throw Object.assign(new Error(`${operation}_authority_unavailable`), {
      code: `${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,
      cause,
    });
  }
  const outcome = traceMutationOutcome(result);
  if (outcome !== "updated") {
    throw Object.assign(new Error(`${operation}_${outcome}`), {
      code: `${operation.toUpperCase()}_${outcome.toUpperCase()}`,
    });
  }
}

function contextRef(
  name: string,
  explicit: TraceContextRef | undefined,
  defaults: { id?: unknown; hash?: unknown } = {},
) {
  const defaultId = optionalKey(`${name}_snapshot_id`, defaults.id);
  const defaultHash = optionalHash(`${name}_snapshot_hash`, defaults.hash);
  const status = explicit?.status ||
    (defaultId || defaultHash ? "OBSERVED" : "UNKNOWN");
  if (!["OBSERVED", "NOT_APPLICABLE", "UNKNOWN"].includes(status)) {
    throw new Error(`invalid_agent_task_envelope_${name}_context_status`);
  }
  const id = optionalKey(`${name}_context_id`, explicit?.id ?? defaultId);
  const hash = optionalHash(
    `${name}_context_hash`,
    explicit?.hash ?? defaultHash,
  );
  const key = optionalKey(`${name}_context_key`, explicit?.key);
  const version = optionalKey(`${name}_context_version`, explicit?.version);
  if (status === "OBSERVED" && !id && !hash && !key) {
    throw new Error(`invalid_agent_task_envelope_${name}_context_reference`);
  }
  if (status === "NOT_APPLICABLE" && (id || hash || key || version)) {
    throw new Error(
      `invalid_agent_task_envelope_${name}_context_not_applicable`,
    );
  }
  return {
    status,
    ...(id ? { id } : {}),
    ...(hash ? { hash } : {}),
    ...(key ? { key } : {}),
    ...(version ? { version } : {}),
  };
}

function contextComplete(value: any) {
  return value?.status === "NOT_APPLICABLE" ||
    (value?.status === "OBSERVED" &&
      Boolean(value?.id || value?.hash || value?.key));
}

function terminalEffectCoherent(input: {
  material: boolean;
  terminalState: AgentTaskTerminalState;
  effectState: AgentTaskEffectState;
  ambiguityState: AgentTaskAmbiguityState;
  effectRefs: SourceRef[];
  receiptRefs: SourceRef[];
  costState?: AgentTaskCostState;
}) {
  const noEffectEvidence = input.effectRefs.length === 0 &&
    input.receiptRefs.length === 0;
  if (!input.material) {
    return input.effectState === "NOT_APPLICABLE" && noEffectEvidence &&
      input.ambiguityState === "NONE" &&
      ["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED"].includes(
        input.terminalState,
      );
  }
  if (input.terminalState === "COMPLETED") {
    return input.effectState === "EXECUTED" &&
      input.effectRefs.length > 0 && input.receiptRefs.length > 0 &&
      input.ambiguityState === "NONE";
  }
  if (["FAILED", "CANCELLED"].includes(input.terminalState)) {
    return input.effectState === "FAILED_PRE_EFFECT" && noEffectEvidence &&
      input.ambiguityState === "NONE";
  }
  if (input.terminalState === "REVIEW_REQUIRED") {
    if (
      input.effectState === "FAILED_PRE_EFFECT" && noEffectEvidence &&
      input.ambiguityState === "REVIEW_REQUIRED" &&
      ["RESERVATION_AMBIGUOUS", "RESERVED"].includes(
        String(input.costState || ""),
      )
    ) return true;
    return ["FAILED_POST_EFFECT", "REVIEW_REQUIRED"].includes(
      input.effectState,
    ) && input.effectRefs.length > 0 &&
      ["UNKNOWN", "REVIEW_REQUIRED"].includes(input.ambiguityState);
  }
  return false;
}

function objectiveEffectCoverage(input: {
  material: boolean;
  terminalState: AgentTaskTerminalState;
  effectState: AgentTaskEffectState;
  ambiguityState: AgentTaskAmbiguityState;
  effectRefs: SourceRef[];
  receiptRefs: SourceRef[];
  costState?: AgentTaskCostState;
}) {
  if (!input.material) {
    return terminalEffectCoherent(input) ? "NOT_APPLICABLE" : "PARTIAL";
  }
  // Ambiguous post-effect work remains partial even when the caller supplies
  // a ref: provider reconciliation, not a boolean assertion, must close it.
  return terminalEffectCoherent(input) &&
      ["EXECUTED", "FAILED_PRE_EFFECT"].includes(input.effectState)
    ? "COMPLETE"
    : "PARTIAL";
}

export function agentTaskTrigger(
  req: Request,
  explicit?: AgentTaskTrigger,
): AgentTaskTrigger {
  if (explicit && explicit !== "UNKNOWN") return explicit;
  if (
    String(req.headers.get("base44-scheduled-task") || "").toLowerCase() ===
      "true" || req.headers.get("base44-automation-id")
  ) return "SCHEDULED";
  if (
    req.headers.get("x-cambra-internal") ||
    req.headers.get("x-internal-secret")
  ) return "INTERNAL";
  return "MANUAL";
}

function triggerReference(req: Request) {
  return String(
    req.headers.get("base44-automation-id") ||
      req.headers.get("x-cambra-command-key") ||
      req.headers.get("x-cambra-request-id") ||
      req.headers.get("x-request-id") ||
      "",
  ).trim().slice(0, 300) || null;
}

export async function buildRootAgentTaskEnvelope(
  req: Request,
  input: RootEnvelopeInput,
) {
  const now = new Date().toISOString();
  const tenantKey = requiredKey("tenant_key", input.tenantKey);
  const policyHash = optionalHash(
    "policy_snapshot_hash",
    input.policySnapshotHash,
  );
  const authorityHash = optionalHash(
    "authority_snapshot_hash",
    input.authoritySnapshotHash,
  );
  const intelligenceHash = optionalHash(
    "intelligence_snapshot_hash",
    input.intelligenceSnapshotHash,
  );
  const policySnapshotId = optionalKey(
    "policy_snapshot_id",
    input.policySnapshotId,
  );
  const authoritySnapshotId = optionalKey(
    "authority_snapshot_id",
    input.authoritySnapshotId,
  );
  const intelligenceSnapshotId = optionalKey(
    "intelligence_snapshot_id",
    input.intelligenceSnapshotId,
  );
  const deadlineAt = optionalDate("deadline_at", input.deadlineAt);
  const traceId = `trace:${crypto.randomUUID()}`;
  const orchestrationId = `orchestration:${crypto.randomUUID()}`;
  const attemptToken = `attempt:${crypto.randomUUID()}`;
  const fenceToken = `task-fence:${crypto.randomUUID()}`;
  const parentRun = optionalKey("parent_run", input.parentRun);
  const subjectType = requiredKey(
    "subject_type",
    input.subjectType || (tenantKey === "_platform" ? "Platform" : "Tenant"),
  );
  const subjectId = requiredKey(
    "subject_id",
    input.subjectId || tenantKey,
  );
  const materialEffect = input.materialEffect === true;
  const costApplicable = input.costApplicable === true;
  const effectClass = optionalKey("effect_class", input.effectClass);
  if (materialEffect && !effectClass) {
    throw new Error("invalid_agent_task_envelope_effect_class");
  }
  return {
    envelope_version: AGENT_TASK_ENVELOPE_VERSION,
    // Creation proves trace identity, not terminal effect/cost/receipt lineage.
    lineage_state: "PARTIAL",
    trace_id: traceId,
    orchestration_id: orchestrationId,
    ...(parentRun ? { parent_run: parentRun } : {}),
    workflow_key: requiredKey("workflow_key", input.workflowKey),
    workflow_version: requiredKey("workflow_version", input.workflowVersion),
    step_key: "root",
    step_index: 0,
    step: { key: "root", index: 0, attempt: 1 },
    attempt_number: 1,
    attempt_token: attemptToken,
    fence_token: fenceToken,
    trigger_type: agentTaskTrigger(req, input.triggerType),
    ...(triggerReference(req) ? { trigger_ref: triggerReference(req) } : {}),
    tenant_key: tenantKey,
    subject_type: subjectType,
    subject_id: subjectId,
    processing_purpose: requiredKey(
      "processing_purpose",
      input.processingPurpose,
    ),
    input_hash: await hashAgentTaskProjection(input.input),
    ...(policySnapshotId ? { policy_snapshot_id: policySnapshotId } : {}),
    ...(policyHash ? { policy_snapshot_hash: policyHash } : {}),
    ...(authoritySnapshotId
      ? { authority_snapshot_id: authoritySnapshotId }
      : {}),
    ...(authorityHash ? { authority_snapshot_hash: authorityHash } : {}),
    ...(intelligenceSnapshotId
      ? { intelligence_snapshot_id: intelligenceSnapshotId }
      : {}),
    ...(intelligenceHash
      ? { intelligence_snapshot_hash: intelligenceHash }
      : {}),
    policy_context_json: contextRef("policy", input.policyContext, {
      id: policySnapshotId,
      hash: policyHash,
    }),
    authority_context_json: contextRef("authority", input.authorityContext, {
      id: authoritySnapshotId,
      hash: authorityHash,
    }),
    intelligence_context_json: contextRef(
      "intelligence",
      input.intelligenceContext,
      { id: intelligenceSnapshotId, hash: intelligenceHash },
    ),
    material_effect: materialEffect,
    ...(effectClass ? { effect_class: effectClass } : {}),
    cost_applicable: costApplicable,
    cost_state: costApplicable ? "NOT_STARTED" : "NOT_APPLICABLE",
    cost_evidence_json: rootCostEvidence(costApplicable, now),
    effect_state: materialEffect ? "NOT_STARTED" : "NOT_APPLICABLE",
    effect_coverage_state: materialEffect ? "UNKNOWN" : "NOT_APPLICABLE",
    ambiguity_state: "NONE",
    terminal_state: "OPEN",
    trace_revision: 0,
    ...(deadlineAt ? { deadline_at: deadlineAt } : {}),
    heartbeat_at: now,
    source_refs_json: sourceRefs([
      {
        type: "function",
        id: input.functionName,
        version: input.workflowVersion,
      },
      ...(input.sourceRefs || []),
    ]),
  };
}

async function closeCreatedRootTaskAfterBindFailure(
  svc: any,
  created: any,
  envelope: any,
  revision: number,
  _cause: any,
) {
  const at = new Date().toISOString();
  const failure = {
    ok: false,
    error: "agent_task_root_bind_failed",
    cause_code: "agent_task_root_bind_failed",
  };
  const failureHash = await hashAgentTaskProjection(failure);
  const filter: Record<string, unknown> = {
    id: created.id,
    envelope_version: AGENT_TASK_ENVELOPE_VERSION,
    trace_id: envelope.trace_id,
    attempt_token: envelope.attempt_token,
    fence_token: envelope.fence_token,
    trace_revision: revision,
  };
  if (created.status !== undefined && created.status !== null) {
    filter.status = created.status;
  }
  if (revision > 0) filter.root_task_id = created.id;
  await updateAgentTaskTraceExactlyOnce(
    svc,
    filter,
    {
      root_task_id: created.id,
      status: "failed",
      error: "agent_task_root_bind_failed",
      completed_at: at,
      heartbeat_at: at,
      lineage_state: "PARTIAL",
      terminal_state: "FAILED",
      effect_state: envelope.material_effect
        ? "FAILED_PRE_EFFECT"
        : "NOT_APPLICABLE",
      effect_coverage_state: envelope.material_effect
        ? "COMPLETE"
        : "NOT_APPLICABLE",
      ambiguity_state: "NONE",
      output_hash: failureHash,
      terminal_result_hash: failureHash,
      terminal_result_json: { value: failure },
      cost_record_refs_json: [],
      cost_state: envelope.cost_applicable ? "NOT_RESERVED" : "NOT_APPLICABLE",
      cost_evidence_json: {
        version: "agent-task-cost-evidence-v1",
        code: "ROOT_BIND_FAILED_PRE_RESERVATION",
        observed_at: at,
        reservation_started: false,
        reservation_persisted: false,
        settlement_persisted: false,
      },
      effect_refs_json: [],
      receipt_refs_json: [],
      trace_revision: revision + 1,
    },
    "agent_task_root_bind_failure_close",
  );
}

export async function createCanonicalAgentTask(
  svc: any,
  req: Request,
  task: Record<string, unknown>,
  input: RootEnvelopeInput,
) {
  const tenantKey = requiredKey("task_tenant_key", task.brand_id);
  if (tenantKey !== requiredKey("input_tenant_key", input.tenantKey)) {
    throw new Error("agent_task_tenant_scope_conflict");
  }
  const envelope = await buildRootAgentTaskEnvelope(req, {
    ...input,
    subjectType: input.subjectType || String(task.related_entity_type || "") ||
      undefined,
    subjectId: input.subjectId || String(task.related_entity_id || "") ||
      undefined,
  });
  const created = await svc.entities.AgentTask.create({ ...task, ...envelope });
  if (!created?.id) throw new Error("agent_task_root_create_missing_id");
  const rootPatch = {
    root_task_id: created.id,
    heartbeat_at: new Date().toISOString(),
    trace_revision: 1,
  };
  try {
    await updateAgentTaskTraceExactlyOnce(
      svc,
      {
        id: created.id,
        envelope_version: AGENT_TASK_ENVELOPE_VERSION,
        trace_id: envelope.trace_id,
        attempt_token: envelope.attempt_token,
        fence_token: envelope.fence_token,
        trace_revision: 0,
      },
      rootPatch,
      "agent_task_root_bind",
    );
  } catch (error: any) {
    try {
      await closeCreatedRootTaskAfterBindFailure(
        svc,
        created,
        envelope,
        0,
        error,
      );
    } catch (cleanupError: any) {
      error.agent_task_cleanup_error = String(
        cleanupError?.code || cleanupError?.message || cleanupError,
      ).slice(0, 200);
    }
    throw error;
  }
  const observed = await svc.entities.AgentTask.get(created.id);
  if (
    !observed || observed.root_task_id !== created.id ||
    observed.trace_id !== envelope.trace_id ||
    observed.input_hash !== envelope.input_hash ||
    observed.tenant_key !== envelope.tenant_key
  ) {
    const error: any = new Error("agent_task_root_readback_mismatch");
    try {
      await closeCreatedRootTaskAfterBindFailure(
        svc,
        created,
        envelope,
        1,
        error,
      );
    } catch (cleanupError: any) {
      error.agent_task_cleanup_error = String(
        cleanupError?.code || cleanupError?.message || cleanupError,
      ).slice(0, 200);
    }
    throw error;
  }
  return { ...observed, ...envelope, ...rootPatch };
}

export function inspectAgentTaskLineage(task: any) {
  if (!task?.envelope_version) {
    return {
      state: "UNKNOWN" as const,
      legacy: true,
      reason: "LEGACY_ROW_WITHOUT_ENVELOPE",
      missing: ["envelope_version"],
      invalid: [] as string[],
    };
  }
  const isCurrent = task.envelope_version === AGENT_TASK_ENVELOPE_VERSION;
  const required = [
    "lineage_state",
    "trace_id",
    "orchestration_id",
    "root_task_id",
    "workflow_key",
    "workflow_version",
    "step_key",
    "attempt_number",
    "attempt_token",
    "fence_token",
    "trigger_type",
    "tenant_key",
    "processing_purpose",
    "input_hash",
    "heartbeat_at",
    ...(isCurrent
      ? [
        "step",
        "subject_type",
        "subject_id",
        "policy_context_json",
        "authority_context_json",
        "intelligence_context_json",
        "material_effect",
        "cost_applicable",
        "effect_state",
        "effect_coverage_state",
        "ambiguity_state",
        "terminal_state",
        "trace_revision",
      ]
      : []),
  ];
  const missing = required.filter((field) =>
    task[field] === null || task[field] === undefined || task[field] === ""
  );
  const invalid: string[] = [];
  if (!SUPPORTED_ENVELOPE_VERSIONS.has(String(task.envelope_version))) {
    invalid.push("envelope_version");
  }
  if (!["PARTIAL", "COMPLETE"].includes(String(task.lineage_state || ""))) {
    invalid.push("lineage_state");
  }
  for (
    const field of [
      "input_hash",
      "output_hash",
      "terminal_result_hash",
      "policy_snapshot_hash",
      "authority_snapshot_hash",
      "intelligence_snapshot_hash",
    ]
  ) {
    if (task[field] && !HASH.test(String(task[field]))) invalid.push(field);
  }
  if (Number(task.attempt_number || 0) < 1) invalid.push("attempt_number");
  if (
    isCurrent &&
    (!Number.isSafeInteger(Number(task.trace_revision)) ||
      Number(task.trace_revision) < 0)
  ) invalid.push("trace_revision");
  if (task.parent_task_id && task.parent_task_id === task.id) {
    invalid.push("parent_task_id");
  }
  if (isCurrent) {
    if (
      ![
        "NOT_APPLICABLE",
        "NOT_STARTED",
        "EFFECT_STARTED",
        "EXECUTED",
        "FAILED_PRE_EFFECT",
        "FAILED_POST_EFFECT",
        "REVIEW_REQUIRED",
      ]
        .includes(String(task.effect_state || ""))
    ) invalid.push("effect_state");
    if (
      !["NOT_APPLICABLE", "UNKNOWN", "PARTIAL", "COMPLETE"].includes(
        String(task.effect_coverage_state || ""),
      )
    ) invalid.push("effect_coverage_state");
    if (
      !["NONE", "UNKNOWN", "REVIEW_REQUIRED"].includes(
        String(task.ambiguity_state || ""),
      )
    ) {
      invalid.push("ambiguity_state");
    }
    if (
      !["OPEN", "COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED"].includes(
        String(task.terminal_state || ""),
      )
    ) {
      invalid.push("terminal_state");
    }
    const costStatePresent = task.cost_state !== null &&
      task.cost_state !== undefined && task.cost_state !== "";
    const costEvidencePresent = task.cost_evidence_json !== null &&
      task.cost_evidence_json !== undefined;
    if (costStatePresent !== costEvidencePresent) {
      invalid.push("cost_projection_incomplete");
    }
    if (
      costStatePresent && ![
        "NOT_APPLICABLE",
        "NOT_STARTED",
        "NOT_RESERVED",
        "RESERVATION_AMBIGUOUS",
        "RESERVED",
        "SETTLED",
        "UNKNOWN",
      ].includes(String(task.cost_state))
    ) invalid.push("cost_state");
    let persistedCostEvidence: AgentTaskCostEvidence | null = null;
    if (costEvidencePresent) {
      try {
        persistedCostEvidence = costEvidence(
          "persisted_cost_evidence",
          task.cost_evidence_json,
        );
      } catch {
        invalid.push("cost_evidence_json");
      }
    }
    if (task.material_effect === true && !task.effect_class) {
      invalid.push("effect_class");
    }
    if (task.lineage_state === "COMPLETE") {
      const persistedEffectRefs = Array.isArray(task.effect_refs_json)
        ? task.effect_refs_json
        : [];
      const persistedReceiptRefs = Array.isArray(task.receipt_refs_json)
        ? task.receipt_refs_json
        : [];
      const persistedCoherence = terminalEffectCoherent({
        material: task.material_effect === true,
        terminalState: task.terminal_state,
        effectState: task.effect_state,
        ambiguityState: task.ambiguity_state,
        effectRefs: persistedEffectRefs,
        receiptRefs: persistedReceiptRefs,
        costState: task.cost_state,
      });
      const persistedCoverage = objectiveEffectCoverage({
        material: task.material_effect === true,
        terminalState: task.terminal_state,
        effectState: task.effect_state,
        ambiguityState: task.ambiguity_state,
        effectRefs: persistedEffectRefs,
        receiptRefs: persistedReceiptRefs,
        costState: task.cost_state,
      });
      const persistedCostRefs = Array.isArray(task.cost_record_refs_json)
        ? task.cost_record_refs_json
        : [];
      if (!costStateCoherent({
        costApplicable: task.cost_applicable === true,
        terminalState: task.terminal_state,
        costState: task.cost_state,
        costEvidence: persistedCostEvidence,
        costRecordRefs: persistedCostRefs,
      })) invalid.push("terminal_cost_coherence");
      if (!persistedCoherence) invalid.push("terminal_effect_coherence");
      if (task.effect_coverage_state !== persistedCoverage) {
        invalid.push("effect_coverage_state");
      }
    }
  }
  const structurallyValid = missing.length === 0 && invalid.length === 0;
  return {
    state: structurallyValid && task.lineage_state === "COMPLETE"
      ? "COMPLETE" as const
      : "PARTIAL" as const,
    legacy: task.envelope_version === LEGACY_AGENT_TASK_ENVELOPE_VERSION,
    reason: structurallyValid && task.lineage_state === "COMPLETE"
      ? "CANONICAL_ENVELOPE_COMPLETE"
      : structurallyValid
      ? "SOURCE_ENVELOPE_PRESENT_BUT_OTR013_NOT_FULLY_CLOSED"
      : "SOURCE_ENVELOPE_INCOMPLETE_OR_INVALID",
    missing,
    invalid,
  };
}

export async function buildChildAgentTaskEnvelope(
  parent: any,
  input: ChildEnvelopeInput,
) {
  const parentLineage = inspectAgentTaskLineage(parent);
  if (
    parentLineage.state === "UNKNOWN" ||
    parentLineage.missing.length > 0 ||
    parentLineage.invalid.length > 0 ||
    !parent?.id ||
    !parent?.root_task_id
  ) throw new Error("parent_agent_task_lineage_unknown");
  if (parent.envelope_version !== AGENT_TASK_ENVELOPE_VERSION) {
    throw new Error("parent_agent_task_envelope_upgrade_required");
  }
  const rawStepIndex = Number(input.stepIndex);
  if (!Number.isSafeInteger(rawStepIndex) || rawStepIndex < 1) {
    throw new Error("invalid_agent_task_envelope_step_index");
  }
  const stepIndex = rawStepIndex;
  const materialEffect = input.materialEffect === true;
  const effectClass = optionalKey("effect_class", input.effectClass);
  if (materialEffect && !effectClass) {
    throw new Error("invalid_agent_task_envelope_effect_class");
  }
  return {
    envelope_version: AGENT_TASK_ENVELOPE_VERSION,
    lineage_state: "PARTIAL",
    trace_id: String(parent.trace_id),
    orchestration_id: String(parent.orchestration_id),
    root_task_id: String(parent.root_task_id),
    parent_task_id: String(parent.id),
    parent_run: String(parent.id),
    workflow_key: String(parent.workflow_key),
    workflow_version: String(parent.workflow_version),
    step_key: requiredKey("step_key", input.stepKey),
    step_index: stepIndex,
    step: {
      key: requiredKey("step_key", input.stepKey),
      index: stepIndex,
      attempt: 1,
    },
    attempt_number: 1,
    attempt_token: `attempt:${crypto.randomUUID()}`,
    fence_token: `task-fence:${crypto.randomUUID()}`,
    trigger_type: "INTERNAL",
    trigger_ref: String(parent.id),
    tenant_key: String(parent.tenant_key),
    subject_type: requiredKey(
      "subject_type",
      input.subjectType || parent.subject_type,
    ),
    subject_id: requiredKey(
      "subject_id",
      input.subjectId || parent.subject_id,
    ),
    processing_purpose: String(parent.processing_purpose),
    input_hash: await hashAgentTaskProjection(input.input),
    ...(parent.policy_snapshot_id
      ? { policy_snapshot_id: parent.policy_snapshot_id }
      : {}),
    ...(parent.policy_snapshot_hash
      ? { policy_snapshot_hash: parent.policy_snapshot_hash }
      : {}),
    ...(parent.authority_snapshot_id
      ? { authority_snapshot_id: parent.authority_snapshot_id }
      : {}),
    ...(parent.authority_snapshot_hash
      ? { authority_snapshot_hash: parent.authority_snapshot_hash }
      : {}),
    ...(parent.intelligence_snapshot_id
      ? { intelligence_snapshot_id: parent.intelligence_snapshot_id }
      : {}),
    ...(parent.intelligence_snapshot_hash
      ? { intelligence_snapshot_hash: parent.intelligence_snapshot_hash }
      : {}),
    policy_context_json: parent.policy_context_json,
    authority_context_json: parent.authority_context_json,
    intelligence_context_json: parent.intelligence_context_json,
    material_effect: materialEffect,
    ...(effectClass ? { effect_class: effectClass } : {}),
    cost_applicable: input.costApplicable === true,
    cost_state: input.costApplicable === true ? "NOT_STARTED" : "NOT_APPLICABLE",
    cost_evidence_json: rootCostEvidence(
      input.costApplicable === true,
      new Date().toISOString(),
    ),
    effect_state: materialEffect ? "NOT_STARTED" : "NOT_APPLICABLE",
    effect_coverage_state: materialEffect ? "UNKNOWN" : "NOT_APPLICABLE",
    ambiguity_state: "NONE",
    terminal_state: "OPEN",
    trace_revision: 0,
    ...(parent.deadline_at ? { deadline_at: parent.deadline_at } : {}),
    heartbeat_at: new Date().toISOString(),
    source_refs_json: sourceRefs([
      {
        type: "parent_task",
        id: String(parent.id),
        version: AGENT_TASK_ENVELOPE_VERSION,
      },
      ...(input.sourceRefs || []),
    ]),
  };
}

export async function attachCanonicalChildTask(
  svc: any,
  childTaskId: string,
  parent: any,
  input: ChildEnvelopeInput,
) {
  const id = String(childTaskId || "").trim();
  if (!id) throw new Error("child_agent_task_id_required");
  const child = await svc.entities.AgentTask.get(id);
  if (!child) throw new Error("child_agent_task_not_found");
  if (String(child.brand_id || "") !== String(parent.brand_id || "")) {
    throw new Error("child_agent_task_tenant_scope_conflict");
  }
  if (child.envelope_version) {
    const inspection = inspectAgentTaskLineage(child);
    if (
      inspection.state === "UNKNOWN" ||
      inspection.missing.length > 0 ||
      inspection.invalid.length > 0
    ) throw new Error("existing_child_agent_task_lineage_invalid");
    const stepIndex = Number(input.stepIndex);
    if (!Number.isSafeInteger(stepIndex) || stepIndex < 1) {
      throw new Error("invalid_agent_task_envelope_step_index");
    }
    const lineagePairs = [
      ["trace_id", parent.trace_id],
      ["orchestration_id", parent.orchestration_id],
      ["root_task_id", parent.root_task_id],
      ["parent_task_id", parent.id],
      ["parent_run", parent.id],
      ["workflow_key", parent.workflow_key],
      ["workflow_version", parent.workflow_version],
      ["tenant_key", parent.tenant_key],
      ["processing_purpose", parent.processing_purpose],
      ["policy_snapshot_hash", parent.policy_snapshot_hash || null],
      ["authority_snapshot_hash", parent.authority_snapshot_hash || null],
      ["intelligence_snapshot_hash", parent.intelligence_snapshot_hash || null],
      ["deadline_at", parent.deadline_at || null],
      ["step_key", requiredKey("step_key", input.stepKey)],
      ["step_index", stepIndex],
      ["trigger_type", "INTERNAL"],
      ["trigger_ref", parent.id],
      ["input_hash", await hashAgentTaskProjection(input.input)],
    ];
    if (
      lineagePairs.some(([field, expected]) =>
        (child[field as string] ?? null) !== expected
      )
    ) {
      throw new Error("child_agent_task_lineage_conflict");
    }
    return child;
  }
  const envelope = await buildChildAgentTaskEnvelope(parent, input);
  const childFence: Record<string, unknown> = {
    id,
    brand_id: child.brand_id,
  };
  if (child.status !== undefined && child.status !== null) {
    childFence.status = child.status;
  }
  if (child.updated_date) childFence.updated_date = child.updated_date;
  if (child._revision !== undefined && child._revision !== null) {
    childFence._revision = child._revision;
  }
  await updateAgentTaskTraceExactlyOnce(
    svc,
    childFence,
    envelope,
    "agent_task_child_bind",
  );
  const observed = await svc.entities.AgentTask.get(id);
  if (
    !observed || observed.trace_id !== envelope.trace_id ||
    observed.parent_task_id !== envelope.parent_task_id ||
    observed.input_hash !== envelope.input_hash
  ) throw new Error("child_agent_task_readback_mismatch");
  return observed;
}

export async function buildAgentTaskOutputEnvelope(output: unknown) {
  return {
    output_hash: await hashAgentTaskProjection(output),
    heartbeat_at: new Date().toISOString(),
  };
}

function terminalLineageComplete(task: any, terminal: {
  terminalState: Exclude<AgentTaskTerminalState, "OPEN">;
  effectState: AgentTaskEffectState;
  ambiguityState: AgentTaskAmbiguityState;
  costRecordRefs: SourceRef[];
  costState: AgentTaskCostState;
  costEvidence: AgentTaskCostEvidence | null;
  effectRefs: SourceRef[];
  receiptRefs: SourceRef[];
  policyContext: TraceContextRef;
  authorityContext: TraceContextRef;
  intelligenceContext: TraceContextRef;
  effectCoverageState: "NOT_APPLICABLE" | "PARTIAL" | "COMPLETE";
}) {
  const contexts = [
    terminal.policyContext,
    terminal.authorityContext,
    terminal.intelligenceContext,
  ];
  if (!contexts.every(contextComplete)) return false;
  if (["RESERVATION_AMBIGUOUS", "RESERVED", "UNKNOWN", "NOT_STARTED"].includes(
    terminal.costState,
  )) return false;
  if (!costStateCoherent({
    costApplicable: task.cost_applicable === true,
    terminalState: terminal.terminalState,
    costState: terminal.costState,
    costEvidence: terminal.costEvidence,
    costRecordRefs: terminal.costRecordRefs,
  })) return false;
  const coherent = terminalEffectCoherent({
    material: task.material_effect === true,
    terminalState: terminal.terminalState,
    effectState: terminal.effectState,
    ambiguityState: terminal.ambiguityState,
    effectRefs: terminal.effectRefs,
    receiptRefs: terminal.receiptRefs,
    costState: terminal.costState,
  });
  if (!coherent) return false;
  return task.material_effect === true
    ? terminal.effectCoverageState === "COMPLETE"
    : terminal.effectCoverageState === "NOT_APPLICABLE";
}

export async function buildAgentTaskTerminalEnvelope(
  task: any,
  input: TerminalEnvelopeInput,
) {
  const inspection = inspectAgentTaskLineage(task);
  if (
    inspection.state === "UNKNOWN" || inspection.missing.length > 0 ||
    inspection.invalid.length > 0 ||
    task.envelope_version !== AGENT_TASK_ENVELOPE_VERSION
  ) throw new Error("agent_task_terminal_lineage_unknown");
  const ambiguityState = input.ambiguityState || "NONE";
  if (![
    "COMPLETED",
    "FAILED",
    "CANCELLED",
    "REVIEW_REQUIRED",
  ].includes(input.terminalState)) {
    throw new Error("invalid_agent_task_terminal_state");
  }
  if (![
    "NOT_APPLICABLE",
    "NOT_STARTED",
    "EFFECT_STARTED",
    "EXECUTED",
    "FAILED_PRE_EFFECT",
    "FAILED_POST_EFFECT",
    "REVIEW_REQUIRED",
  ].includes(input.effectState)) {
    throw new Error("invalid_agent_task_terminal_effect_state");
  }
  if (!["NONE", "UNKNOWN", "REVIEW_REQUIRED"].includes(ambiguityState)) {
    throw new Error("invalid_agent_task_terminal_ambiguity_state");
  }
  if (
    input.effectState === "EXECUTED" &&
    ((input.effectRefs || []).length === 0 ||
      (input.receiptRefs || []).length === 0)
  ) throw new Error("agent_task_executed_effect_and_receipt_required");
  if (
    ["FAILED_POST_EFFECT", "REVIEW_REQUIRED"].includes(input.effectState) &&
    !["UNKNOWN", "REVIEW_REQUIRED"].includes(ambiguityState)
  ) throw new Error("agent_task_post_effect_ambiguity_required");
  if (
    input.effectState === "FAILED_PRE_EFFECT" &&
    ((input.effectRefs || []).length > 0 ||
      (input.receiptRefs || []).length > 0)
  ) throw new Error("agent_task_pre_effect_cannot_bind_effect_receipt");
  const terminalResultHash = await hashAgentTaskProjection(input.result);
  const policyContext = contextRef(
    "policy",
    input.policyContext || task.policy_context_json,
  );
  const authorityContext = contextRef(
    "authority",
    input.authorityContext || task.authority_context_json,
  );
  const intelligenceContext = contextRef(
    "intelligence",
    input.intelligenceContext || task.intelligence_context_json,
  );
  const costRecordRefs = sourceRefs(input.costRecordRefs);
  const costState = String(
    input.costState ||
      (task.cost_applicable === true ? "UNKNOWN" : "NOT_APPLICABLE"),
  ) as AgentTaskCostState;
  if (![
    "NOT_APPLICABLE",
    "NOT_STARTED",
    "NOT_RESERVED",
    "RESERVATION_AMBIGUOUS",
    "RESERVED",
    "SETTLED",
    "UNKNOWN",
  ].includes(costState)) {
    throw new Error("invalid_agent_task_terminal_cost_state");
  }
  const terminalCostEvidence = costEvidence(
    "terminal_cost_evidence",
    input.costEvidence || (task.cost_applicable === true
      ? undefined
      : {
        version: "agent-task-cost-evidence-v1",
        code: "COST_NOT_APPLICABLE",
        observed_at: new Date().toISOString(),
        reservation_started: false,
        reservation_persisted: false,
        settlement_persisted: false,
      }),
  );
  const terminalCostCoherent = costStateCoherent({
    costApplicable: task.cost_applicable === true,
    terminalState: input.terminalState,
    costState,
    costEvidence: terminalCostEvidence,
    costRecordRefs,
  });
  // UNKNOWN is an honest partial projection. Every affirmative cost state is
  // rejected unless its booleans, refs and terminal state agree exactly.
  if (costState !== "UNKNOWN" && !terminalCostCoherent) {
    throw new Error("agent_task_terminal_cost_evidence_incoherent");
  }
  const effectRefs = sourceRefs(input.effectRefs);
  const receiptRefs = sourceRefs(input.receiptRefs);
  const effectCoverageState = objectiveEffectCoverage({
    material: task.material_effect === true,
    terminalState: input.terminalState,
    effectState: input.effectState,
    ambiguityState,
    effectRefs,
    receiptRefs,
    costState,
  });
  const complete = terminalLineageComplete(task, {
    terminalState: input.terminalState,
    effectState: input.effectState,
    ambiguityState,
    costRecordRefs,
    costState,
    costEvidence: terminalCostEvidence,
    effectRefs,
    receiptRefs,
    policyContext,
    authorityContext,
    intelligenceContext,
    effectCoverageState,
  });
  return {
    lineage_state: complete ? "COMPLETE" : "PARTIAL",
    output_hash: terminalResultHash,
    terminal_result_hash: terminalResultHash,
    terminal_result_json: { value: redactForHash(input.result) },
    terminal_state: input.terminalState,
    effect_state: input.effectState,
    effect_coverage_state: effectCoverageState,
    ambiguity_state: ambiguityState,
    policy_context_json: policyContext,
    authority_context_json: authorityContext,
    intelligence_context_json: intelligenceContext,
    cost_record_refs_json: costRecordRefs,
    cost_state: costState,
    cost_evidence_json: terminalCostEvidence || {
      version: "agent-task-cost-evidence-v1",
      code: "COST_EVIDENCE_UNKNOWN",
      observed_at: new Date().toISOString(),
      reservation_started: false,
      reservation_persisted: false,
      settlement_persisted: false,
    },
    effect_refs_json: effectRefs,
    receipt_refs_json: receiptRefs,
    heartbeat_at: new Date().toISOString(),
  };
}

const TERMINAL_IMMUTABLE_BINDING_FIELDS = Object.freeze([
  "brand_id",
  "tenant_key",
  "agent_name",
  "task_type",
  "related_entity_type",
  "related_entity_id",
  "envelope_version",
  "trace_id",
  "orchestration_id",
  "root_task_id",
  "parent_task_id",
  "parent_run",
  "workflow_key",
  "workflow_version",
  "step_key",
  "step_index",
  "step",
  "attempt_number",
  "attempt_token",
  "fence_token",
  "trigger_type",
  "trigger_ref",
  "subject_type",
  "subject_id",
  "processing_purpose",
  "input_hash",
  "deadline_at",
  "material_effect",
  "effect_class",
  "cost_applicable",
  "policy_snapshot_id",
  "policy_snapshot_hash",
  "authority_snapshot_id",
  "authority_snapshot_hash",
  "intelligence_snapshot_id",
  "intelligence_snapshot_hash",
  "source_refs_json",
] as const);

const TERMINAL_OWNED_TRANSITION_FIELDS = Object.freeze([
  "lineage_state",
  "output_hash",
  "policy_context_json",
  "authority_context_json",
  "intelligence_context_json",
  "effect_state",
  "effect_coverage_state",
  "ambiguity_state",
  "terminal_state",
  "terminal_result_hash",
  "terminal_result_json",
  "cost_record_refs_json",
  "cost_state",
  "cost_evidence_json",
  "effect_refs_json",
  "receipt_refs_json",
  "heartbeat_at",
  "trace_revision",
] as const);

const TERMINAL_EVENT_OUTBOX_FIELDS = Object.freeze([
  "terminal_event_state",
  "terminal_event_idempotency_key",
  "terminal_event_payload_hash",
  "terminal_event_intent_json",
  "terminal_event_id",
  "terminal_event_revision",
  "terminal_event_last_attempt_at",
  "terminal_event_next_attempt_at",
  "terminal_event_published_at",
  "terminal_event_error",
  "terminal_event_conflicting_ids_json",
  "terminal_event_claim_token",
  "terminal_event_claimed_at",
  "terminal_event_lease_expires_at",
] as const);

const TERMINAL_PROTECTED_PATCH_FIELDS = new Set<string>([
  ...TERMINAL_IMMUTABLE_BINDING_FIELDS,
  ...TERMINAL_OWNED_TRANSITION_FIELDS,
  ...TERMINAL_EVENT_OUTBOX_FIELDS,
]);

function exactEnvelopeValue(left: unknown, right: unknown) {
  try {
    return canonical(left) === canonical(right);
  } catch {
    return false;
  }
}

function terminalSettlementFence(task: any, revision: number) {
  const filter: Record<string, unknown> = { id: task.id };
  for (
    const field of [
      ...TERMINAL_IMMUTABLE_BINDING_FIELDS,
      ...TERMINAL_OWNED_TRANSITION_FIELDS,
      "status",
    ]
  ) {
    const expected = field === "trace_revision"
      ? revision
      : task[field] === undefined
      ? null
      : task[field];
    // The platform query engine cannot match an ARRAY field by equality: such a
    // predicate never matches any row, so including it here made every terminal
    // settlement fail as a false conflict. Array-valued fields stay out of the
    // CAS predicate and are still verified exactly in the authoritative
    // readback below; serialization remains owned by trace_revision.
    if (Array.isArray(expected)) continue;
    filter[field] = expected;
  }
  return filter;
}

function terminalSettlementReadbackMatches(
  observed: any,
  task: any,
  patch: Record<string, unknown>,
) {
  if (!observed || String(observed.id || "") !== String(task.id || "")) {
    return false;
  }
  if (
    TERMINAL_IMMUTABLE_BINDING_FIELDS.some((field) =>
      !exactEnvelopeValue(observed[field], task[field])
    )
  ) return false;
  return Object.entries(patch).every(([field, expected]) =>
    exactEnvelopeValue(observed[field], expected)
  );
}

export async function settleCanonicalAgentTask(
  svc: any,
  task: any,
  taskPatch: Record<string, unknown>,
  input: TerminalEnvelopeInput,
) {
  if (!task?.id) throw new Error("agent_task_terminal_id_required");
  if (task.terminal_state && task.terminal_state !== "OPEN") {
    throw new Error("agent_task_terminal_already_settled");
  }
  if (
    TERMINAL_EVENT_OUTBOX_FIELDS.some((field) =>
      task[field] !== undefined && task[field] !== null
    )
  ) throw new Error("agent_task_terminal_event_outbox_preexisting");
  if (
    Object.keys(taskPatch).some((field) =>
      TERMINAL_PROTECTED_PATCH_FIELDS.has(field)
    )
  ) {
    throw new Error("agent_task_terminal_protected_field_patch_forbidden");
  }
  const revision = Number(task.trace_revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("agent_task_terminal_trace_revision_required");
  }
  const terminal = await buildAgentTaskTerminalEnvelope(task, input);
  const nextRevision = revision + 1;
  const settledProjection = {
    ...task,
    ...taskPatch,
    ...terminal,
    trace_revision: nextRevision,
  };
  const terminalEventIntent = input.terminalEvent
    ? await buildCanonicalAgentTerminalEvent(
      settledProjection,
      input.terminalEvent,
    )
    : null;
  const terminalEventPatch = terminalEventIntent
    ? {
      terminal_event_state: "PENDING",
      terminal_event_idempotency_key: terminalEventIntent.idempotency_key,
      terminal_event_payload_hash: terminalEventIntent.payload_content_hash,
      terminal_event_intent_json: terminalEventIntent,
      terminal_event_revision: 0,
      terminal_event_next_attempt_at: new Date().toISOString(),
    }
    : {};
  const patch = {
    ...taskPatch,
    ...terminal,
    ...terminalEventPatch,
    trace_revision: nextRevision,
  };
  // This CAS protects trace settlement only. It is not an effect-authority
  // fence and never replaces the domain claim/provider reconciliation plane.
  await updateAgentTaskTraceExactlyOnce(
    svc,
    terminalSettlementFence(task, revision),
    patch,
    "agent_task_terminal_settle",
  );
  const observed = await svc.entities.AgentTask.get(task.id);
  if (!terminalSettlementReadbackMatches(observed, task, patch)) {
    throw new Error("agent_task_terminal_readback_mismatch");
  }
  return observed;
}

export function buildCanonicalEventTraceEnvelope(task: any) {
  const inspection = inspectAgentTaskLineage(task);
  if (
    inspection.state === "UNKNOWN" || inspection.missing.length > 0 ||
    inspection.invalid.length > 0 || !task?.id
  ) throw new Error("agent_task_event_lineage_unknown");
  return {
    trace_envelope_version: String(task.envelope_version),
    trace_lineage_state: String(task.lineage_state),
    trace_id: String(task.trace_id),
    parent_run: String(task.parent_run || task.id),
    step: task.step,
    tenant_key: String(task.tenant_key),
    subject_type: String(task.subject_type),
    subject_id: String(task.subject_id),
    input_hash: String(task.input_hash),
    policy_context_json: task.policy_context_json,
    authority_context_json: task.authority_context_json,
    intelligence_context_json: task.intelligence_context_json,
    cost_record_refs_json: sourceRefs(task.cost_record_refs_json || []),
    cost_state: String(task.cost_state),
    cost_evidence_json: task.cost_evidence_json,
    effect_refs_json: sourceRefs(task.effect_refs_json || []),
    receipt_refs_json: sourceRefs(task.receipt_refs_json || []),
    ...(task.terminal_result_hash
      ? { terminal_result_hash: task.terminal_result_hash }
      : {}),
    ...(task.terminal_result_json
      ? { terminal_result_json: task.terminal_result_json }
      : {}),
    terminal_state: String(task.terminal_state),
    ambiguity_state: String(task.ambiguity_state),
    agent_task_id: String(task.id),
  };
}

export const AGENT_TASK_TERMINAL_EVENT_PERSISTENCE_GUARANTEE =
  "DURABLE_TASK_OUTBOX_INTENT_ONLY_NO_CROSS_ENTITY_EXACTLY_ONCE_GUARANTEE";

const TERMINAL_EVENT_REPLAY_BINDING_FIELDS = Object.freeze([
  "brand_id",
  "event_type",
  "source",
  "entity_type",
  "entity_id",
  "idempotency_key",
  "payload_content_hash",
  "agent_task_id",
  "trace_envelope_version",
  "trace_lineage_state",
  "trace_id",
  "parent_run",
  "step",
  "tenant_key",
  "subject_type",
  "subject_id",
  "input_hash",
  "policy_context_json",
  "authority_context_json",
  "intelligence_context_json",
  "cost_record_refs_json",
  "cost_state",
  "cost_evidence_json",
  "effect_refs_json",
  "receipt_refs_json",
  "terminal_result_hash",
  "terminal_result_json",
  "terminal_state",
  "ambiguity_state",
  "payload_json",
  "execution_json",
  "outcome_json",
] as const);

function terminalEventPayload(value: unknown) {
  const redacted = redactForHash(value === undefined ? {} : value);
  return redacted && typeof redacted === "object" && !Array.isArray(redacted)
    ? redacted
    : { value: redacted ?? null };
}

/**
 * Builds a deterministic terminal Event outbox record from a canonical settled
 * AgentTask projection. `settleCanonicalAgentTask` persists and reads this back
 * in its terminal CAS; this pure builder alone proves no datastore state. The
 * idempotency key intentionally excludes the outcome hash: one task/event type
 * owns one semantic event, so changed content is a conflict, not a second event.
 *
 * This function performs no Event write. Base44 exposes neither a unique Event
 * idempotency constraint nor a transaction spanning AgentTask and Event, so a
 * dispatcher must retain PENDING/REVIEW_REQUIRED state and reconcile before it
 * can claim publication.
 */
export async function buildCanonicalAgentTerminalEvent(
  task: any,
  input: CanonicalAgentTerminalEventInput,
) {
  const terminalState = String(task?.terminal_state || "");
  if (
    !["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED"].includes(
      terminalState,
    ) || !task?.terminal_result_hash || !task?.terminal_result_json ||
    !Number.isSafeInteger(Number(task?.trace_revision)) ||
    Number(task.trace_revision) < 2
  ) throw new Error("agent_task_terminal_event_requires_settled_task");
  if (String(task.brand_id || "") !== String(task.tenant_key || "")) {
    throw new Error("agent_task_terminal_event_tenant_scope_conflict");
  }
  const tenantKey = requiredKey("terminal_event_tenant_key", task.tenant_key);
  const eventType = requiredKey("terminal_event_type", input?.eventType);
  const eventSource = requiredKey("terminal_event_source", input?.source);
  const entityType = optionalKey("terminal_event_entity_type", input?.entityType);
  const entityId = optionalKey("terminal_event_entity_id", input?.entityId);
  if (Boolean(entityType) !== Boolean(entityId)) {
    throw new Error("agent_task_terminal_event_entity_reference_incomplete");
  }
  const taskId = requiredKey("terminal_event_task_id", task.id);
  const idempotencyKey = requiredKey(
    "terminal_event_idempotency_key",
    `agent-task-terminal:${tenantKey}:${taskId}:${eventType}`,
  );
  const trace = buildCanonicalEventTraceEnvelope(task);
  const payloadJson = terminalEventPayload(input?.payload);
  const semanticRecord = {
    event_type: eventType,
    source: eventSource,
    entity_type: entityType,
    entity_id: entityId,
    payload_json: payloadJson,
    ...trace,
    execution_json: {
      agent_task_id: taskId,
      effect_state: String(task.effect_state),
      effect_coverage_state: String(task.effect_coverage_state),
      cost_applicable: task.cost_applicable === true,
      cost_state: trace.cost_state,
      cost_evidence: trace.cost_evidence_json,
      cost_record_refs: trace.cost_record_refs_json,
      effect_refs: trace.effect_refs_json,
      receipt_refs: trace.receipt_refs_json,
    },
    outcome_json: {
      agent_task_id: taskId,
      terminal_state: terminalState,
      ambiguity_state: String(task.ambiguity_state),
      terminal_result_hash: String(task.terminal_result_hash),
    },
  };
  const payloadContentHash =
    `sha256:${await hashAgentTaskProjection(semanticRecord)}`;
  return {
    brand_id: String(task.brand_id),
    ...semanticRecord,
    idempotency_key: idempotencyKey,
    payload_content_hash: payloadContentHash,
    status: "processed",
    retry_count: 0,
  };
}

export type CanonicalAgentTerminalEventReplayInspection = {
  state:
    | "NO_OBSERVED_EVENT"
    | "MATCHED_REPLAY"
    | "CONTENT_CONFLICT"
    | "AMBIGUOUS_DUPLICATES";
  event_id: string | null;
  event_ids: string[];
  mismatched_fields: string[];
};

/**
 * Classifies a bounded exact-key Event read. NO_OBSERVED_EVENT is not authority
 * to create: the caller still needs a durable claim/dispatcher. More than one
 * row is an ambiguity that must never be collapsed into an idempotent success.
 */
export function inspectCanonicalAgentTerminalEventReplay(
  candidates: any[],
  proposed: any,
): CanonicalAgentTerminalEventReplayInspection {
  if (!Array.isArray(candidates)) {
    throw new Error("agent_task_terminal_event_candidates_unavailable");
  }
  const key = String(proposed?.idempotency_key || "");
  if (!key || !proposed?.payload_content_hash) {
    throw new Error("agent_task_terminal_event_proposal_incomplete");
  }
  if (candidates.some((row) => String(row?.idempotency_key || "") !== key)) {
    throw new Error("agent_task_terminal_event_candidate_scope_conflict");
  }
  if (candidates.length === 0) {
    return {
      state: "NO_OBSERVED_EVENT",
      event_id: null,
      event_ids: [],
      mismatched_fields: [],
    };
  }
  if (candidates.length > 1) {
    return {
      state: "AMBIGUOUS_DUPLICATES",
      event_id: null,
      event_ids: candidates.map((row) => String(row?.id || "")).filter(Boolean),
      mismatched_fields: [],
    };
  }
  const observed = candidates[0];
  const mismatchedFields = TERMINAL_EVENT_REPLAY_BINDING_FIELDS.filter(
    (field) => !exactEnvelopeValue(observed?.[field], proposed?.[field]),
  );
  return mismatchedFields.length === 0
    ? {
      state: "MATCHED_REPLAY",
      event_id: String(observed?.id || "") || null,
      event_ids: String(observed?.id || "") ? [String(observed.id)] : [],
      mismatched_fields: [],
    }
    : {
      state: "CONTENT_CONFLICT",
      event_id: String(observed?.id || "") || null,
      event_ids: String(observed?.id || "") ? [String(observed.id)] : [],
      mismatched_fields: mismatchedFields,
    };
}

export async function createCanonicalAgentEvent(
  svc: any,
  task: any,
  event: Record<string, unknown>,
) {
  if (String(event.brand_id || "") !== String(task.brand_id || "")) {
    throw new Error("agent_task_event_tenant_scope_conflict");
  }
  if (event.agent_task_id && String(event.agent_task_id) !== String(task.id)) {
    throw new Error("agent_task_event_identity_conflict");
  }
  const trace = buildCanonicalEventTraceEnvelope(task);
  return await svc.entities.Event.create({ ...event, ...trace });
}
