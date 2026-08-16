import { sha256 } from "./intelligenceCore.ts";

export const APPROVAL_DECISION_STATUSES = Object.freeze([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
] as const);
export const APPROVAL_EXECUTION_STATUSES = Object.freeze([
  "NOT_STARTED",
  "CLAIMED",
  "EFFECTING",
  "EXECUTED",
  "FAILED_RETRYABLE",
  "FAILED_TERMINAL",
  "REVIEW_REQUIRED",
] as const);

const DECISION_STATUS_SET = new Set<string>(APPROVAL_DECISION_STATUSES);
const EXECUTION_STATUS_SET = new Set<string>(APPROVAL_EXECUTION_STATUSES);
const HASH = /^[a-f0-9]{64}$/;

function text(value: any) {
  return String(value ?? "").trim();
}

function legacyDecisionStatus(approval: any) {
  const status = text(approval?.status).toLowerCase();
  if (status === "approved") return "APPROVED";
  if (status === "rejected" || status === "cancelled") return "REJECTED";
  if (status === "expired") return "EXPIRED";
  return "PENDING";
}

function executionReceiptRef(approval: any, task: any) {
  const result = task?.execution_result_json || task?.output_payload_json || {};
  return task
    ? text(
      task?.execution_receipt_ref ||
      result.execution_receipt_ref ||
      result.provider_receipt_id ||
      result.provider_reference_id ||
      result.receipt_id ||
      result.message_id ||
      result.event_id,
    )
    : text(approval?.execution_receipt_ref);
}

/**
 * Backward-compatible lifecycle projection for Approval rows. An old
 * `status=approved` row proves a decision only. It never proves execution.
 * Likewise an explicit EXECUTED value without a receipt is downgraded to
 * REVIEW_REQUIRED rather than laundering a historical decision into success.
 */
export function deriveApprovalLifecycle(approval: any, task: any = null) {
  const legacyDecision = legacyDecisionStatus(approval);
  const explicitDecision = text(approval?.decision_status).toUpperCase();
  const decisionStatus =
    DECISION_STATUS_SET.has(explicitDecision) &&
      (text(approval?.decision_status_recorded_at) ||
        explicitDecision === legacyDecision)
      ? explicitDecision
      : legacyDecision;
  const receiptRef = executionReceiptRef(approval, task);
  const explicitExecution = text(approval?.execution_status).toUpperCase();

  let executionStatus: string;
  if (
    receiptRef &&
    task?.status === "completed" &&
    task?.execution_phase === "completed" &&
    task?.execution_status === "EXECUTED"
  ) {
    executionStatus = "EXECUTED";
  } else if (
    task?.execution_phase === "review_required" ||
    task?.execution_status === "REVIEW_REQUIRED"
  ) {
    executionStatus = "REVIEW_REQUIRED";
  } else if (
    task?.status === "running" &&
    task?.execution_phase === "applying"
  ) {
    executionStatus = "EFFECTING";
  } else if (
    task?.status === "running" &&
    task?.execution_phase === "claimed"
  ) {
    executionStatus = "CLAIMED";
  } else if (task?.status === "failed") {
    executionStatus = task?.execution_effects_started === true
      ? "REVIEW_REQUIRED"
      : "FAILED_RETRYABLE";
  } else if (task?.status === "cancelled") {
    executionStatus = "FAILED_TERMINAL";
  } else if (
    EXECUTION_STATUS_SET.has(explicitExecution) &&
    text(approval?.execution_status_recorded_at) &&
    !task
  ) {
    executionStatus = explicitExecution;
  } else if (decisionStatus !== "APPROVED") {
    executionStatus = "NOT_STARTED";
  } else if (
    approval?.resolution_effects_started === true ||
    task?.execution_effects_started === true ||
    ["applying", "completed", "review_required"].includes(
      text(task?.execution_phase),
    )
  ) {
    executionStatus = "REVIEW_REQUIRED";
  } else {
    executionStatus = "NOT_STARTED";
  }

  if (executionStatus === "EXECUTED" && !receiptRef)
    executionStatus = "REVIEW_REQUIRED";
  return Object.freeze({
    decision_status: decisionStatus,
    execution_status: executionStatus,
    execution_receipt_ref: receiptRef || null,
    derivation:
      text(approval?.decision_status_recorded_at) ||
        text(approval?.execution_status_recorded_at)
        ? "EXPLICIT_WITH_CONSERVATIVE_RECEIPT_CHECK"
        : "LEGACY_CONSERVATIVE",
  });
}

/**
 * Projects an audit/result payload through the current canonical Approval
 * authority. `recordedResult` is deliberately spread first: an admin-writable
 * FounderCommandAudit can never override the decision/execution axes read from
 * Approval (and, only for registered external executors, AgentTask).
 */
export function projectCanonicalApprovalCommandResult(input: any) {
  const approval = input?.approval;
  if (!approval) throw new Error("approval_execution_authority_unavailable");
  const lifecycle = input?.allowTaskExecution === true
    ? deriveApprovalLifecycle(approval, input?.task || null)
    : {
      decision_status: text(approval.decision_status).toUpperCase(),
      execution_status: text(approval.execution_status).toUpperCase(),
      execution_receipt_ref: text(approval.execution_receipt_ref) || null,
    };
  if (
    !DECISION_STATUS_SET.has(lifecycle.decision_status) ||
    !EXECUTION_STATUS_SET.has(lifecycle.execution_status) ||
    (lifecycle.execution_status === "EXECUTED" &&
      !text(lifecycle.execution_receipt_ref))
  ) throw new Error("approval_execution_authority_ambiguous");
  return {
    ...(input?.recordedResult || {}),
    approval_status: approval.status,
    decision_status: lifecycle.decision_status,
    execution_status: lifecycle.execution_status,
    execution_receipt_ref: lifecycle.execution_receipt_ref,
  };
}

export function projectApprovalCommandResponse(result: any) {
  const executionStatus = text(result?.execution_status).toUpperCase();
  if (!EXECUTION_STATUS_SET.has(executionStatus)) {
    throw new Error("approval_execution_status_unavailable");
  }
  return {
    status: executionStatus === "EXECUTED" ? "executed" : "resolved",
    command_status: "executed",
    execution_status: executionStatus,
  };
}

function bindingError(code: string) {
  const error: any = new Error(code);
  error.code = code;
  error.status = 409;
  return error;
}

/**
 * Canonical one-use confirmation envelope. The object deliberately binds
 * absence (for example, no intelligence snapshot) through an explicit
 * sentinel id + digest; a later dependency can therefore never be silently
 * substituted into an already confirmed preview.
 */
export async function buildApprovalConfirmationBinding(input: any) {
  const approval = input?.approval || {};
  const actorEmail = text(input?.actorEmail).toLowerCase();
  const tenant = text(approval.brand_id || input?.tenant);
  const subjectType = text(
    approval.related_entity_type || input?.subject?.type || "AgentTask",
  );
  const subjectId = text(
    approval.related_entity_id ||
      input?.subject?.id ||
      approval.agent_task_id,
  );
  const expiresAt = text(approval.expires_at || input?.expiresAt);
  const policyKey = text(input?.policy?.key);
  const policyVersion = text(input?.policy?.version);
  const authorityId = text(input?.authoritySnapshot?.id);
  const authorityHash = text(input?.authoritySnapshot?.hash);
  const intelligenceId = text(input?.intelligenceSnapshot?.id);
  const intelligenceHash = text(input?.intelligenceSnapshot?.hash);
  const marketScopeVersion = text(input?.marketScopeVersion);
  const emergencyId = text(input?.emergency?.id);
  const emergencyRevision = Number(input?.emergency?.revision);
  const nonceHash = text(input?.nonceHash);

  if (!actorEmail) throw bindingError("approval_binding_actor_required");
  if (!tenant) throw bindingError("approval_binding_tenant_required");
  if (!subjectType || !subjectId)
    throw bindingError("approval_binding_subject_required");
  if (!Number.isFinite(Date.parse(expiresAt)))
    throw bindingError("approval_binding_expiry_required");
  if (!policyKey || !policyVersion)
    throw bindingError("approval_binding_policy_required");
  if (!authorityId || !HASH.test(authorityHash))
    throw bindingError("approval_binding_authority_snapshot_required");
  if (!intelligenceId || !HASH.test(intelligenceHash))
    throw bindingError("approval_binding_intelligence_snapshot_required");
  if (!marketScopeVersion)
    throw bindingError("approval_binding_market_scope_required");
  if (!emergencyId || !Number.isInteger(emergencyRevision))
    throw bindingError("approval_binding_emergency_revision_required");
  if (!HASH.test(nonceHash))
    throw bindingError("approval_binding_nonce_required");

  const payload = approval.draft_payload_json || {};
  const binding: any = {
    schema_version: "approval-confirmation-binding.v1",
    approval_id: text(approval.id),
    payload_hash: await sha256({
      draft_content: approval.draft_content || "",
      draft_payload_json: payload,
    }),
    policy: { key: policyKey, version: policyVersion },
    authority_snapshot: { id: authorityId, hash: authorityHash },
    intelligence_snapshot: {
      id: intelligenceId,
      hash: intelligenceHash,
      state: text(input?.intelligenceSnapshot?.state) || "OBSERVED",
    },
    economic_terms_hash: await sha256({
      domain: "ECONOMIC_TERMS",
      terms: input?.economicTerms ?? payload,
    }),
    legal_terms_hash: await sha256({
      domain: "LEGAL_TERMS",
      terms: input?.legalTerms ?? payload,
    }),
    market_scope_version: marketScopeVersion,
    emergency_control: { id: emergencyId, revision: emergencyRevision },
    actor: actorEmail,
    tenant,
    subject: { type: subjectType, id: subjectId },
    decision: text(input?.decision),
    reason: text(input?.reason),
    expires_at: expiresAt,
    confirmation_nonce_hash: nonceHash,
  };
  return Object.freeze({ ...binding, binding_hash: await sha256(binding) });
}

const SNAPSHOT_ENTITY_TYPES = new Set([
  "CommunicationThread",
  "NegotiationCase",
  "DynamicAgreement",
  "DeveloperMigrationRun",
]);
const PAYLOAD_ENTITY_FIELDS: Record<string, string> = Object.freeze({
  offer_id: "NegotiationOffer",
  approved_offer_id: "NegotiationOffer",
  bid_id: "AggregateBid",
  pool_id: "AggregatePool",
  rfp_id: "AggregateRFP",
  recover_id: "DealActivation",
  provider_id: "Provider",
  message_id: "CommunicationMessage",
  thread_id: "CommunicationThread",
  agreement_id: "DynamicAgreement",
  run_id: "DeveloperMigrationRun",
  workspace_id: "DeveloperWorkspace",
  document_id: "Document",
  contract_document_id: "Document",
});

/**
 * Immutable, non-secret digest projection for a Founder approval preview.
 * Reads are deliberately fail-closed: an unavailable dependency must never be
 * represented as an empty snapshot that could later authorize execution.
 */
export async function buildApprovalAuthoritySnapshot(
  svc: any,
  approval: any,
  task: any = null,
  actorEmail = "",
) {
  const refs: { entity: string; id: string }[] = [];
  const add = (entity: any, id: any) => {
    const e = String(entity || ""),
      v = String(id || "");
    if (e && v && !refs.some((x) => x.entity === e && x.id === v)) {
      refs.push({ entity: e, id: v });
    }
  };
  if (SNAPSHOT_ENTITY_TYPES.has(String(approval.related_entity_type || "")))
    add(approval.related_entity_type, approval.related_entity_id);
  const payload = approval.draft_payload_json || {};
  for (const [field, entity] of Object.entries(PAYLOAD_ENTITY_FIELDS))
    add(entity, payload[field]);

  const initial = await Promise.all(
    refs.map(async (ref) => {
      const entity = svc?.entities?.[ref.entity];
      if (!entity?.get)
        throw bindingError("approval_authority_reference_reader_unavailable");
      const row = await entity.get(ref.id);
      if (!row || text(row.id) !== ref.id)
        throw bindingError("approval_authority_reference_missing");
      return { ref, row };
    }),
  );
  for (const { ref, row } of initial) {
    if (ref.entity === "NegotiationCase") {
      add("DealActivation", row.recover_id);
      add("CommunicationThread", row.thread_id);
      add("Mandate", row.authority_snapshot_json?.mandate_id);
      add("NegotiationOffer", row.approved_offer_id);
    }
    if (ref.entity === "DynamicAgreement") {
      add("NegotiationCase", row.negotiation_case_id);
      add("AggregatePool", row.pool_id);
      add("AggregateRFP", row.rfp_id);
    }
  }

  const byKey = new Map(
    initial.map((x) => [`${x.ref.entity}:${x.ref.id}`, x.row]),
  );
  const entitySnapshots = [];
  for (const ref of refs) {
    const row =
      byKey.get(`${ref.entity}:${ref.id}`) ||
      (await svc.entities[ref.entity].get(ref.id));
    if (!row || text(row.id) !== ref.id)
      throw bindingError("approval_authority_reference_missing");
    entitySnapshots.push({
      entity: ref.entity,
      id: ref.id,
      content_hash: await sha256(row),
    });
  }
  return {
    approval_metadata_hash: await sha256({
      brand_id: approval.brand_id || "",
      agent_task_id: approval.agent_task_id || "",
      action_type: approval.action_type || "",
      related_entity_type: approval.related_entity_type || "",
      related_entity_id: approval.related_entity_id || "",
      risk_level: Number(approval.risk_level || 0),
      expires_at: approval.expires_at || null,
      actor_email: String(actorEmail || "").toLowerCase(),
    }),
    approval_content_hash: await sha256({
      draft_content: approval.draft_content || "",
      draft_payload_json: payload,
    }),
    task_content_hash: task ? await sha256(task) : null,
    entity_snapshots: entitySnapshots,
  };
}

export async function approvalAuthorityHash(
  svc: any,
  approval: any,
  task: any = null,
  actorEmail = "",
) {
  return sha256(
    await buildApprovalAuthoritySnapshot(svc, approval, task, actorEmail),
  );
}

export async function approvalImmutableContentHash(
  approval: any,
  actorEmail = "",
) {
  return sha256({
    brand_id: approval.brand_id || "",
    agent_task_id: approval.agent_task_id || "",
    action_type: approval.action_type || "",
    related_entity_type: approval.related_entity_type || "",
    related_entity_id: approval.related_entity_id || "",
    risk_level: Number(approval.risk_level || 0),
    expires_at: approval.expires_at || null,
    draft_content: approval.draft_content || "",
    draft_payload_json: approval.draft_payload_json || {},
    actor_email: String(actorEmail || "").toLowerCase(),
  });
}
