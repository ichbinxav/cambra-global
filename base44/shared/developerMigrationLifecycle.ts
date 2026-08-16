import {
  approvalImmutableContentHash,
  buildApprovalAuthoritySnapshot,
} from "./approvalAuthority.ts";
import { updatedExactlyOne } from "./approvalResolutionSaga.ts";
import { sha256 } from "./intelligenceCore.ts";
import { assertOperationAllowed } from "./operationalControl.ts";
import { readSingletonAuthority } from "./singletonAuthority.ts";
import {
  attemptFailClosedOperation,
  requireCriticalOperation,
} from "./criticalExecution.ts";

export const DEVELOPER_LIFECYCLE_VERSION = "developer-material-saga-v2";
export const DEVELOPER_LIFECYCLE_LEASE_MS = 15 * 60_000;
export const DEVELOPER_STEP_RECEIPT_VERSION =
  "developer-material-step-receipt-v1";
export const DEVELOPER_ACTION_HISTORY_VERSION =
  "developer-material-action-history-v1";

export type DeveloperMaterialAction = "apply_plan" | "cutover" | "rollback";

const ACTION_CONFIG: Record<DeveloperMaterialAction, {
  approvalAction: string;
  taskType: string;
  risk: number;
  initialStatus: string;
  activeStatus: string;
  finalStatus: string;
}> = Object.freeze({
  apply_plan: {
    approvalAction: "developer_apply_patch",
    taskType: "developer_migration_plan",
    risk: 3,
    initialStatus: "awaiting_approval",
    activeStatus: "branching",
    finalStatus: "pr_open",
  },
  cutover: {
    approvalAction: "migration_go_live",
    taskType: "developer_cutover",
    risk: 4,
    initialStatus: "awaiting_cutover_approval",
    activeStatus: "cutting_over",
    finalStatus: "verifying",
  },
  rollback: {
    approvalAction: "developer_rollback",
    taskType: "developer_rollback",
    risk: 4,
    initialStatus: "failed",
    activeStatus: "rolling_back",
    finalStatus: "rolled_back",
  },
});

const text = (value: any) => String(value || "").trim();
const same = (a: any, b: any) => text(a) === text(b);
const repo = (value: any) =>
  text(value)
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();

function failure(error: string, details: any = null) {
  return { ok: false as const, error, details };
}

function planApprovedByFounder(run: any) {
  const plan = { ...(run?.migration_plan || {}) };
  for (
    const field of [
      "engine_version",
      "base_sha",
      "base_tree_sha",
      "scan_bytes",
      "tree_truncated",
    ]
  ) delete plan[field];
  return plan;
}

export async function developerWorkspaceBindingHash(workspace: any) {
  return sha256({
    id: text(workspace?.id),
    brand_id: text(workspace?.brand_id),
    provider: text(workspace?.provider),
    repo_full_name: repo(workspace?.repo_full_name),
    default_branch: text(workspace?.default_branch),
  });
}

export async function developerRollbackBindingHash(run: any) {
  return sha256({
    run_id: text(run?.id),
    commit_sha: text(run?.commit_sha),
    rollback_sha: text(run?.rollback_sha),
    rollback_tree_sha: text(
      run?.migration_plan?.rollback_tree_sha ||
        run?.migration_plan?.base_tree_sha,
    ),
  });
}

export async function developerApprovalContentHash(approval: any) {
  const actor = text(approval?.resolution_actor_email).toLowerCase();
  return sha256({
    approval: await approvalImmutableContentHash(approval, actor),
    decision: "approve",
    reason: text(approval?.resolution_reason),
  });
}

async function validateCommonBinding(
  action: DeveloperMaterialAction,
  approval: any,
  task: any,
  run: any,
  workspace: any,
) {
  const config = ACTION_CONFIG[action];
  const payload = approval?.draft_payload_json || {};
  if (!approval || !run || !workspace || !task) {
    return failure("developer_authority_dependency_missing");
  }
  if (
    approval.status !== "approved" ||
    approval.resolution_phase !== "finalized" ||
    approval.resolution_decision !== "approve"
  ) return failure("developer_approval_not_durably_approved");
  if (
    !text(approval.resolution_command_key) ||
    !text(approval.resolution_actor_email) ||
    !/^[a-f0-9]{64}$/i.test(text(approval.resolution_authority_hash)) ||
    !/^[a-f0-9]{64}$/i.test(text(approval.resolution_content_hash))
  ) return failure("developer_approval_resolution_evidence_missing");
  if (
    approval.expires_at &&
    Number.isFinite(Date.parse(approval.expires_at)) &&
    Date.parse(approval.expires_at) <= Date.now()
  ) return failure("developer_approval_expired");
  if (
    !same(approval.action_type, config.approvalAction) ||
    !same(approval.related_entity_type, "DeveloperMigrationRun") ||
    !same(approval.related_entity_id, run.id) ||
    !same(payload.run_id, run.id) ||
    !same(payload.workspace_id, workspace.id) ||
    Number(approval.risk_level) !== config.risk
  ) return failure("developer_approval_run_binding_mismatch");
  if (
    !same(run.workspace_id, workspace.id) ||
    !same(run.brand_id, workspace.brand_id) ||
    !same(run.brand_id, approval.brand_id) ||
    !same(run.brand_id, task.brand_id) ||
    !same(workspace.provider, "github") ||
    !same(run.base_branch, workspace.default_branch) ||
    repo(payload.repo_full_name) !== repo(workspace.repo_full_name)
  ) return failure("developer_workspace_repository_binding_mismatch");
  if (
    !same(task.id, approval.agent_task_id) ||
    !same(task.agent_name, "developer_migration") ||
    !same(task.task_type, config.taskType) ||
    !same(task.status, "completed") ||
    task.requires_approval !== true ||
    Number(task.risk_level) !== config.risk ||
    !same(task.output_payload_json?.run_id, run.id)
  ) return failure("developer_agent_task_binding_mismatch");
  if (
    !same(payload.binding_version, DEVELOPER_LIFECYCLE_VERSION) ||
    !same(
      payload.workspace_binding_hash,
      await developerWorkspaceBindingHash(workspace),
    )
  ) return failure("developer_workspace_binding_hash_mismatch");
  if (
    !same(
      approval.resolution_content_hash,
      await developerApprovalContentHash(approval),
    )
  ) return failure("developer_approval_content_hash_mismatch");
  return { ok: true as const, payload };
}

async function validateActionBinding(
  action: DeveloperMaterialAction,
  approval: any,
  task: any,
  run: any,
  workspace: any,
) {
  const common = await validateCommonBinding(
    action,
    approval,
    task,
    run,
    workspace,
  );
  if (common.ok === false) return common;
  const payload = common.payload;
  if (action === "apply_plan") {
    if (!same(run.approval_id, approval.id)) {
      return failure("developer_apply_approval_link_mismatch");
    }
    if (
      !same(payload.base_branch, run.base_branch) ||
      !same(payload.base_sha, run.migration_plan?.base_sha) ||
      !payload.approved_plan ||
      typeof payload.approved_plan !== "object" ||
      !task.output_payload_json?.plan
    ) return failure("developer_apply_plan_snapshot_missing");
    const approvedPlanHash = await sha256(payload.approved_plan);
    if (
      !same(payload.plan_hash, approvedPlanHash) ||
      !same(await sha256(task.output_payload_json.plan), approvedPlanHash) ||
      !same(await sha256(planApprovedByFounder(run)), approvedPlanHash) ||
      !same(task.output_payload_json?.workspace_id, workspace.id)
    ) return failure("developer_apply_plan_hash_mismatch");
  } else if (action === "cutover") {
    if (!same(run.cutover_approval_id, approval.id)) {
      return failure("developer_cutover_approval_link_mismatch");
    }
    const ciHash = await sha256(run.test_results || {});
    if (
      Number(payload.pr_number || 0) <= 0 ||
      Number(payload.pr_number) !== Number(run.pull_request_number) ||
      !same(payload.approved_head_sha, run.test_results?.head_sha) ||
      !same(payload.ci_hash, ciHash) ||
      !same(await sha256(payload.test_results || {}), ciHash) ||
      !same(await sha256(task.output_payload_json?.test_results || {}), ciHash)
    ) return failure("developer_cutover_ci_hash_mismatch");
    if (
      Number(run.test_results?.total || 0) < 1 ||
      Number(run.test_results?.failed || 0) !== 0 ||
      Number(run.test_results?.pending || 0) !== 0 ||
      run.test_results?.structural_mismatch === true ||
      run.test_results?.mergeable === false
    ) return failure("developer_cutover_ci_not_green");
  } else {
    if (!same(run.verification?.rollback_approval_id, approval.id)) {
      return failure("developer_rollback_approval_link_mismatch");
    }
    if (
      !same(payload.expected_head_sha, run.commit_sha) ||
      !same(payload.rollback_sha, run.rollback_sha) ||
      !same(task.output_payload_json?.current_merge_sha, run.commit_sha) ||
      !same(task.output_payload_json?.rollback_sha, run.rollback_sha) ||
      !same(
        payload.rollback_binding_hash,
        await developerRollbackBindingHash(run),
      )
    ) return failure("developer_rollback_snapshot_hash_mismatch");
  }
  return { ok: true as const, payload };
}

async function stableBindingHash(
  action: DeveloperMaterialAction,
  approval: any,
  task: any,
  run: any,
  workspace: any,
) {
  const payload = approval.draft_payload_json || {};
  const actionRun = action === "apply_plan"
    ? {
      approval_id: run.approval_id,
      base_sha: run.migration_plan?.base_sha,
      base_tree_sha: run.migration_plan?.base_tree_sha,
      plan_hash: await sha256(planApprovedByFounder(run)),
    }
    : action === "cutover"
    ? {
      cutover_approval_id: run.cutover_approval_id,
      working_branch: run.working_branch,
      pull_request_number: Number(run.pull_request_number || 0),
      approved_head_sha: run.test_results?.head_sha,
      ci_hash: await sha256(run.test_results || {}),
      rollback_sha: run.rollback_sha,
    }
    : {
      rollback_approval_id: run.verification?.rollback_approval_id,
      commit_sha: run.commit_sha,
      rollback_sha: run.rollback_sha,
      rollback_tree_sha: run.migration_plan?.rollback_tree_sha ||
        run.migration_plan?.base_tree_sha,
    };
  return sha256({
    version: DEVELOPER_LIFECYCLE_VERSION,
    action,
    approval: {
      id: approval.id,
      action_type: approval.action_type,
      brand_id: approval.brand_id,
      risk_level: Number(approval.risk_level || 0),
      resolution_command_key: approval.resolution_command_key,
      resolution_actor_email: text(approval.resolution_actor_email)
        .toLowerCase(),
      resolution_authority_hash: approval.resolution_authority_hash,
      resolution_content_hash: approval.resolution_content_hash,
      payload_hash: await sha256(payload),
    },
    task: {
      id: task.id,
      task_type: task.task_type,
      risk_level: Number(task.risk_level || 0),
      output_hash: await sha256(task.output_payload_json || {}),
    },
    run: {
      id: run.id,
      workspace_id: run.workspace_id,
      brand_id: run.brand_id,
      source_provider: run.source_provider,
      target_provider: run.target_provider,
      base_branch: run.base_branch,
      action: actionRun,
    },
    workspace: {
      binding_hash: await developerWorkspaceBindingHash(workspace),
      current_provider: workspace.current_provider,
      target_provider: workspace.target_provider,
    },
  });
}

export async function validateDeveloperExecutionAuthority(
  svc: any,
  input: {
    action: DeveloperMaterialAction;
    runId: string;
    workspaceId: string;
    approvalId: string;
    phase: "preclaim" | "active" | "terminal";
    expectedBindingHash?: string;
    expectedAttemptToken?: string;
  },
) {
  const config = ACTION_CONFIG[input.action];
  const [run, workspace, approval] = await Promise.all([
    requireCriticalOperation(
      "developer_migration_run_authority_read",
      () => svc.entities.DeveloperMigrationRun.get(input.runId),
    ),
    requireCriticalOperation(
      "developer_workspace_authority_read",
      () => svc.entities.DeveloperWorkspace.get(input.workspaceId),
    ),
    requireCriticalOperation(
      "developer_approval_authority_read",
      () => svc.entities.Approval.get(input.approvalId),
    ),
  ]);
  const task = approval?.agent_task_id
    ? await requireCriticalOperation(
      "developer_agent_task_authority_read",
      () => svc.entities.AgentTask.get(approval.agent_task_id),
    )
    : null;
  const binding = await validateActionBinding(
    input.action,
    approval,
    task,
    run,
    workspace,
  );
  if (binding.ok === false) return binding;
  if (input.phase === "preclaim") {
    if (run.status !== config.initialStatus) {
      return failure("developer_run_state_not_authorized", {
        expected: config.initialStatus,
        actual: run.status,
      });
    }
    const authorityHash = await sha256(
      await buildApprovalAuthoritySnapshot(
        svc,
        approval,
        task,
        approval.resolution_actor_email,
      ),
    );
    if (!same(authorityHash, approval.resolution_authority_hash)) {
      return failure("developer_approval_authority_hash_mismatch");
    }
  } else if (input.phase === "active") {
    if (
      run.status !== config.activeStatus ||
      run.lifecycle_action !== input.action ||
      !same(run.lifecycle_attempt_token, input.expectedAttemptToken)
    ) return failure("developer_lifecycle_fence_lost");
  } else if (
    run.lifecycle_action !== input.action ||
    run.lifecycle_phase !== "completed" ||
    !same(run.lifecycle_approval_id, approval.id) ||
    !same(run.lifecycle_authority_hash, approval.resolution_authority_hash)
  ) {
    return failure("developer_terminal_lifecycle_evidence_mismatch");
  }
  const bindingHash = await stableBindingHash(
    input.action,
    approval,
    task,
    run,
    workspace,
  );
  if (
    input.expectedBindingHash &&
    !same(bindingHash, input.expectedBindingHash)
  ) return failure("developer_stable_binding_hash_mismatch");
  if (
    input.phase === "terminal" &&
    !same(run.lifecycle_binding_hash, bindingHash)
  ) return failure("developer_terminal_binding_hash_mismatch");
  if (input.phase === "terminal") {
    const history = await validateDeveloperLifecycleHistory(run);
    if (!history.ok) {
      return failure("developer_terminal_action_history_invalid", history);
    }
    const chain = await validateDeveloperLifecycleReceiptChain(run);
    if (
      !chain.ok ||
      !same(run?.lifecycle_result?.receipt_chain_head, chain.receipt_head) ||
      Number(run?.lifecycle_result?.receipt_count || 0) !== chain.receipt_count
    ) return failure("developer_terminal_receipt_chain_invalid", chain);
  }
  return {
    ok: true as const,
    run,
    workspace,
    approval,
    task,
    binding_hash: bindingHash,
    authority_hash: text(approval.resolution_authority_hash),
  };
}

export async function assertDeveloperMigrationsAllowed(svc: any) {
  const state = await assertOperationAllowed(svc, "migrations");
  const authority = await readSingletonAuthority(svc, {
    entity: "EmergencyControl",
    query: { control_key: "global" },
    sort: "-updated_at",
    authority: "emergency_control",
  });
  if (!authority.ok || !authority.row) {
    const error: any = new Error(
      authority.blocker || "emergency_control_authority_unavailable",
    );
    error.code = "EMERGENCY_CONTROL_PAUSED";
    throw error;
  }
  const row: any = authority.row;
  // assertOperationAllowed and this singleton read are deliberately separate
  // reads. Re-check the material flags on the later read so a STOP committed
  // between them wins this guard instead of merely changing its fence hash.
  if (row.safe_mode === true || row.migrations_paused === true) {
    const error: any = new Error("emergency_control_paused:migrations");
    error.code = "EMERGENCY_CONTROL_PAUSED";
    error.state = {
      safe_mode: row.safe_mode === true,
      migrations_paused: row.migrations_paused === true,
      control_revision: Number(row.control_revision || 0),
      last_correlation_id: text(row.last_correlation_id),
    };
    throw error;
  }
  return {
    ...state,
    control_id: row.id,
    control_revision: Number(row.control_revision || 0),
    fence_hash: await sha256({
      id: row.id,
      control_revision: Number(row.control_revision || 0),
      safe_mode: row.safe_mode === true,
      migrations_paused: row.migrations_paused === true,
      resume_check_required: row.resume_check_required === true,
      last_correlation_id: text(row.last_correlation_id),
    }),
  };
}

export async function developerLifecycleIdempotencyKey(input: {
  action: DeveloperMaterialAction;
  runId: string;
  approvalId: string;
  authorityHash: string;
  bindingHash: string;
}) {
  return `developer:${input.action}:${await sha256({
    version: DEVELOPER_LIFECYCLE_VERSION,
    run_id: input.runId,
    approval_id: input.approvalId,
    authority_hash: input.authorityHash,
    binding_hash: input.bindingHash,
  })}`;
}

function lifecycleFilter(run: any) {
  const filter: any = { id: run.id, status: run.status };
  if (run.lifecycle_revision != null) {
    filter.lifecycle_revision = Number(run.lifecycle_revision || 0);
  } else if (run.updated_date) {
    filter.updated_date = run.updated_date;
  }
  if (run.lifecycle_action) filter.lifecycle_action = run.lifecycle_action;
  if (run.lifecycle_phase) filter.lifecycle_phase = run.lifecycle_phase;
  if (run.lifecycle_attempt_token) {
    filter.lifecycle_attempt_token = run.lifecycle_attempt_token;
  }
  return filter;
}

function hasExternalStepEvidence(run: any) {
  return Object.values(run?.lifecycle_steps || {}).some((step: any) =>
    ["pending", "succeeded", "ambiguous"].includes(String(step?.status || ""))
  );
}

function orderedDeveloperSteps(run: any) {
  return Object.entries(run?.lifecycle_steps || {}).sort(
    ([, left]: any, [, right]: any) =>
      Number(left?.receipt_sequence || 0) -
      Number(right?.receipt_sequence || 0),
  );
}

async function developerStepReceiptHash(run: any, stepKey: string, step: any) {
  const priorActionHead = text(run?.lifecycle_result?.prior_action_head);
  return sha256({
    receipt_version: DEVELOPER_STEP_RECEIPT_VERSION,
    receipt_sequence: Number(step?.receipt_sequence || 0),
    prior_receipt_hash: text(step?.prior_receipt_hash),
    step_key: stepKey,
    attempt_token: text(run?.lifecycle_attempt_token),
    authority_hash: text(run?.lifecycle_authority_hash),
    binding_hash: text(run?.lifecycle_binding_hash),
    idempotency_key: text(run?.lifecycle_idempotency_key),
    ...(priorActionHead ? { prior_action_head: priorActionHead } : {}),
    started_at: text(step?.started_at),
    completed_at: text(step?.completed_at),
    result: step?.result || null,
  });
}

function developerActionHistory(run: any) {
  const result = run?.lifecycle_result || {};
  return Array.isArray(result.prior_actions)
    ? structuredClone(result.prior_actions)
    : [];
}

function currentActionResult(run: any) {
  const result = { ...(run?.lifecycle_result || {}) };
  for (
    const key of [
      "receipt_history_version",
      "prior_actions",
      "prior_action_head",
      "prior_action_count",
    ]
  ) delete result[key];
  return result;
}

async function developerActionHistoryHash(action: any) {
  const { action_hash: _ignored, ...content } = action || {};
  return sha256(content);
}

export async function validateDeveloperLifecycleHistory(run: any) {
  const history = developerActionHistory(run);
  let head = "";
  for (let index = 0; index < history.length; index++) {
    const action = history[index];
    if (
      action?.history_version !== DEVELOPER_ACTION_HISTORY_VERSION ||
      Number(action?.action_sequence || 0) !== index + 1 ||
      text(action?.prior_action_hash) !== head ||
      !["apply_plan", "cutover", "rollback"].includes(
        text(action?.action),
      ) ||
      !text(action?.attempt_token) ||
      !text(action?.idempotency_key) ||
      !text(action?.authority_hash) ||
      !text(action?.binding_hash)
    ) {
      return {
        ok: false as const,
        error: "developer_action_history_invalid",
        action_sequence: index + 1,
        action_head: head,
        action_count: index,
      };
    }
    const archivedRun = {
      lifecycle_attempt_token: action.attempt_token,
      lifecycle_authority_hash: action.authority_hash,
      lifecycle_binding_hash: action.binding_hash,
      lifecycle_idempotency_key: action.idempotency_key,
      lifecycle_steps: action.steps || {},
      lifecycle_result: { prior_action_head: action.prior_action_hash },
    };
    const receipts = await validateDeveloperLifecycleReceiptChain(archivedRun);
    if (
      !receipts.ok ||
      !same(receipts.receipt_head, action.receipt_chain_head) ||
      receipts.receipt_count !== Number(action.receipt_count || 0)
    ) {
      return {
        ok: false as const,
        error: "developer_action_history_receipt_invalid",
        action_sequence: index + 1,
        action_head: head,
        action_count: index,
      };
    }
    const expected = await developerActionHistoryHash(action);
    if (!same(expected, action.action_hash)) {
      return {
        ok: false as const,
        error: "developer_action_history_hash_mismatch",
        action_sequence: index + 1,
        action_head: head,
        action_count: index,
      };
    }
    head = expected;
  }
  const result = run?.lifecycle_result || {};
  if (
    Number(result.prior_action_count || 0) !== history.length ||
    text(result.prior_action_head) !== head
  ) {
    return {
      ok: false as const,
      error: "developer_action_history_head_mismatch",
      action_head: head,
      action_count: history.length,
    };
  }
  return { ok: true as const, action_head: head, action_count: history.length };
}

async function archiveCompletedDeveloperAction(run: any) {
  const history = await validateDeveloperLifecycleHistory(run);
  const receipts = await validateDeveloperLifecycleReceiptChain(run);
  if (
    !history.ok || !receipts.ok || run?.lifecycle_phase !== "completed" ||
    !same(run?.lifecycle_result?.receipt_chain_head, receipts.receipt_head) ||
    Number(run?.lifecycle_result?.receipt_count || 0) !== receipts.receipt_count
  ) throw new Error("developer_prior_action_evidence_invalid");
  const priorActions = developerActionHistory(run);
  const archived: any = {
    history_version: DEVELOPER_ACTION_HISTORY_VERSION,
    action_sequence: history.action_count + 1,
    prior_action_hash: history.action_head,
    action: run.lifecycle_action,
    attempt_token: run.lifecycle_attempt_token,
    idempotency_key: run.lifecycle_idempotency_key,
    approval_id: run.lifecycle_approval_id,
    authority_hash: run.lifecycle_authority_hash,
    binding_hash: run.lifecycle_binding_hash,
    started_at: run.lifecycle_started_at,
    completed_at: run.lifecycle_completed_at,
    steps: structuredClone(run.lifecycle_steps || {}),
    result: currentActionResult(run),
    receipt_chain_head: receipts.receipt_head,
    receipt_count: receipts.receipt_count,
  };
  archived.action_hash = await developerActionHistoryHash(archived);
  const nextHistory = [...priorActions, archived];
  return {
    receipt_history_version: DEVELOPER_ACTION_HISTORY_VERSION,
    prior_actions: nextHistory,
    prior_action_head: archived.action_hash,
    prior_action_count: nextHistory.length,
  };
}

/**
 * Recomputes the complete append-only receipt chain. A terminal replay is
 * trusted only when every step is succeeded, contiguous and content-addressed
 * to the exact approval/authority/attempt fence that executed it.
 */
export async function validateDeveloperLifecycleReceiptChain(run: any) {
  const steps = orderedDeveloperSteps(run);
  let head = "";
  for (let index = 0; index < steps.length; index++) {
    const [stepKey, step]: any = steps[index];
    if (
      step?.status !== "succeeded" ||
      step?.receipt_version !== DEVELOPER_STEP_RECEIPT_VERSION ||
      Number(step?.receipt_sequence || 0) !== index + 1 ||
      text(step?.prior_receipt_hash) !== head ||
      !text(step?.started_at) || !text(step?.completed_at)
    ) {
      return {
        ok: false as const,
        error: "developer_step_receipt_chain_invalid",
        step_key: stepKey,
        receipt_head: head,
        receipt_count: index,
      };
    }
    const expected = await developerStepReceiptHash(run, stepKey, step);
    if (!same(expected, step?.receipt_hash)) {
      return {
        ok: false as const,
        error: "developer_step_receipt_hash_mismatch",
        step_key: stepKey,
        receipt_head: head,
        receipt_count: index,
      };
    }
    head = expected;
  }
  return {
    ok: true as const,
    receipt_head: head,
    receipt_count: steps.length,
  };
}

export async function markDeveloperLifecycleReviewRequired(
  svc: any,
  run: any,
  reason: string,
  evidence: any = null,
) {
  const revision = Number(run?.lifecycle_revision || 0);
  const expectedReason = text(reason).slice(0, 500);
  const expectedEvidence = evidence || {};
  const assertReviewReadback = (observed: any) => {
    if (
      observed?.status !== "review_required" ||
      observed?.lifecycle_phase !== "review_required" ||
      Number(observed?.lifecycle_revision || 0) < revision + 1 ||
      text(observed?.lifecycle_attempt_token) !==
        text(run?.lifecycle_attempt_token) ||
      text(observed?.lifecycle_review_reason) !== expectedReason ||
      JSON.stringify(observed?.lifecycle_review_evidence || {}) !==
        JSON.stringify(expectedEvidence) ||
      text(observed?.lifecycle_lease_expires_at)
    ) {
      const error: any = new Error(
        "developer_review_required_persistence_ambiguous",
      );
      error.code = "DEVELOPER_REVIEW_REQUIRED_PERSISTENCE_AMBIGUOUS";
      error.run = observed;
      throw error;
    }
    return observed;
  };
  const changed = await attemptFailClosedOperation(
    "developer_review_required_cas",
    () =>
      svc.entities.DeveloperMigrationRun.updateMany(
        lifecycleFilter(run),
        {
          $set: {
            status: "review_required",
            lifecycle_phase: "review_required",
            lifecycle_revision: revision + 1,
            lifecycle_lease_expires_at: "",
            lifecycle_review_reason: expectedReason,
            lifecycle_review_evidence: expectedEvidence,
            lifecycle_updated_at: new Date().toISOString(),
          },
        },
      ),
  );
  if (updatedExactlyOne(changed)) {
    const observed = await requireCriticalOperation(
      "developer_review_required_readback",
      () => svc.entities.DeveloperMigrationRun.get(run.id),
    );
    return assertReviewReadback(observed);
  }
  const observed = await requireCriticalOperation(
    "developer_review_required_conflict_readback",
    () => svc.entities.DeveloperMigrationRun.get(run.id),
  );
  return assertReviewReadback(observed);
}

export async function acquireDeveloperLifecycle(
  svc: any,
  input: {
    run: any;
    action: DeveloperMaterialAction;
    approvalId: string;
    authorityHash: string;
    bindingHash: string;
    idempotencyKey: string;
    nowMs?: number;
  },
) {
  const config = ACTION_CONFIG[input.action];
  let run = input.run;
  const nowMs = Number(input.nowMs || Date.now());
  if (
    run.lifecycle_action === input.action &&
    run.lifecycle_phase === "completed" &&
    same(run.lifecycle_idempotency_key, input.idempotencyKey)
  ) {
    const history = await validateDeveloperLifecycleHistory(run);
    const chain = await validateDeveloperLifecycleReceiptChain(run);
    if (
      history.ok && chain.ok &&
      same(run?.lifecycle_result?.receipt_chain_head, chain.receipt_head) &&
      Number(run?.lifecycle_result?.receipt_count || 0) === chain.receipt_count
    ) return { acquired: false, replay: true, in_progress: false, run };
    run = await markDeveloperLifecycleReviewRequired(
      svc,
      run,
      "terminal_material_receipt_chain_invalid",
      { history, chain },
    );
    return {
      acquired: false,
      replay: false,
      in_progress: false,
      review_required: true,
      run,
    };
  }
  if (
    run.status === "review_required" ||
    run.lifecycle_phase === "review_required"
  ) {
    return {
      acquired: false,
      replay: false,
      in_progress: false,
      review_required: true,
      run,
    };
  }

  const sameActiveAction = run.lifecycle_action === input.action &&
    ["claimed", "effecting"].includes(String(run.lifecycle_phase || ""));
  if (sameActiveAction) {
    const leaseUntil = Date.parse(String(run.lifecycle_lease_expires_at || ""));
    if (!Number.isFinite(leaseUntil)) {
      run = await markDeveloperLifecycleReviewRequired(
        svc,
        run,
        "developer_lifecycle_lease_authority_unknown",
        { action: input.action, idempotency_key: input.idempotencyKey },
      );
      return {
        acquired: false,
        replay: false,
        in_progress: false,
        review_required: true,
        run,
      };
    }
    if (Number.isFinite(leaseUntil) && leaseUntil > nowMs) {
      return { acquired: false, replay: false, in_progress: true, run };
    }
    if (run.lifecycle_phase === "effecting" || hasExternalStepEvidence(run)) {
      run = await markDeveloperLifecycleReviewRequired(
        svc,
        run,
        "expired_material_effect_lease_requires_reconciliation",
        { action: input.action, idempotency_key: input.idempotencyKey },
      );
      return {
        acquired: false,
        replay: false,
        in_progress: false,
        review_required: true,
        run,
      };
    }
  } else if (run.status !== config.initialStatus) {
    return {
      acquired: false,
      replay: false,
      in_progress: false,
      error: "developer_lifecycle_state_not_claimable",
      run,
    };
  }

  const priorHistory = run.lifecycle_phase === "completed"
    ? await archiveCompletedDeveloperAction(run)
    : await (async () => {
      const observed = await validateDeveloperLifecycleHistory(run);
      if (!observed.ok) {
        throw new Error("developer_prior_action_evidence_invalid");
      }
      return {
        receipt_history_version: DEVELOPER_ACTION_HISTORY_VERSION,
        prior_actions: developerActionHistory(run),
        prior_action_head: observed.action_head,
        prior_action_count: observed.action_count,
      };
    })();
  const attemptToken = `developer-attempt:${crypto.randomUUID()}`;
  const revision = Number(run.lifecycle_revision || 0);
  const changed = await attemptFailClosedOperation(
    "developer_lifecycle_claim_cas",
    () =>
      svc.entities.DeveloperMigrationRun.updateMany(
        lifecycleFilter(run),
        {
          $set: {
            status: config.activeStatus,
            lifecycle_version: DEVELOPER_LIFECYCLE_VERSION,
            lifecycle_action: input.action,
            lifecycle_phase: "claimed",
            lifecycle_revision: revision + 1,
            lifecycle_attempt_token: attemptToken,
            lifecycle_lease_expires_at: new Date(
              nowMs + DEVELOPER_LIFECYCLE_LEASE_MS,
            ).toISOString(),
            lifecycle_idempotency_key: input.idempotencyKey,
            lifecycle_approval_id: input.approvalId,
            lifecycle_authority_hash: input.authorityHash,
            lifecycle_binding_hash: input.bindingHash,
            lifecycle_steps: {},
            lifecycle_result: priorHistory,
            lifecycle_review_reason: "",
            lifecycle_review_evidence: {},
            lifecycle_started_at: new Date(nowMs).toISOString(),
            lifecycle_updated_at: new Date(nowMs).toISOString(),
          },
        },
      ),
  );
  if (!updatedExactlyOne(changed)) {
    const concurrent = await requireCriticalOperation(
      "developer_lifecycle_claim_readback",
      () => svc.entities.DeveloperMigrationRun.get(run.id),
    );
    const terminalReplay = concurrent.lifecycle_phase === "completed" &&
      same(concurrent.lifecycle_idempotency_key, input.idempotencyKey);
    if (terminalReplay) {
      const history = await validateDeveloperLifecycleHistory(concurrent);
      const chain = await validateDeveloperLifecycleReceiptChain(concurrent);
      if (
        !history.ok || !chain.ok ||
        !same(
          concurrent?.lifecycle_result?.receipt_chain_head,
          chain.receipt_head,
        ) ||
        Number(concurrent?.lifecycle_result?.receipt_count || 0) !==
          chain.receipt_count
      ) {
        const reviewed = await markDeveloperLifecycleReviewRequired(
          svc,
          concurrent,
          "terminal_material_receipt_chain_invalid",
          { history, chain },
        );
        return {
          acquired: false,
          replay: false,
          in_progress: false,
          review_required: true,
          run: reviewed,
        };
      }
    }
    return {
      acquired: false,
      replay: terminalReplay,
      in_progress: ["claimed", "effecting"].includes(
        String(concurrent.lifecycle_phase || ""),
      ),
      run: concurrent,
    };
  }
  const observed = await requireCriticalOperation(
    "developer_lifecycle_claim_exact_readback",
    () => svc.entities.DeveloperMigrationRun.get(run.id),
  );
  if (
    observed?.status !== config.activeStatus ||
    observed?.lifecycle_phase !== "claimed" ||
    Number(observed?.lifecycle_revision || 0) !== revision + 1 ||
    !same(observed?.lifecycle_attempt_token, attemptToken) ||
    !same(observed?.lifecycle_idempotency_key, input.idempotencyKey) ||
    !same(observed?.lifecycle_authority_hash, input.authorityHash) ||
    !same(observed?.lifecycle_binding_hash, input.bindingHash)
  ) {
    const error: any = new Error("developer_lifecycle_claim_readback_mismatch");
    error.code = "DEVELOPER_LIFECYCLE_CLAIM_READBACK_MISMATCH";
    error.run = observed;
    throw error;
  }
  return {
    acquired: true,
    replay: false,
    in_progress: false,
    run: observed,
  };
}

async function transitionDeveloperLifecycle(
  svc: any,
  run: any,
  patch: any,
) {
  const revision = Number(run.lifecycle_revision || 0);
  const changed = await svc.entities.DeveloperMigrationRun.updateMany(
    lifecycleFilter(run),
    {
      $set: {
        ...patch,
        lifecycle_revision: revision + 1,
        lifecycle_updated_at: new Date().toISOString(),
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    const error: any = new Error("developer_lifecycle_claim_lost");
    error.code = "DEVELOPER_LIFECYCLE_CLAIM_LOST";
    throw error;
  }
  const observed = await requireCriticalOperation(
    "developer_lifecycle_transition_exact_readback",
    () => svc.entities.DeveloperMigrationRun.get(run.id),
  );
  if (
    Number(observed?.lifecycle_revision || 0) !== revision + 1 ||
    !same(
      observed?.lifecycle_attempt_token,
      Object.prototype.hasOwnProperty.call(patch, "lifecycle_attempt_token")
        ? patch.lifecycle_attempt_token
        : run.lifecycle_attempt_token,
    ) ||
    await sha256(
        Object.fromEntries(
          Object.keys(patch).map((key) => [key, observed?.[key]]),
        ),
      ) !== await sha256(patch)
  ) {
    const error: any = new Error(
      "developer_lifecycle_transition_readback_mismatch",
    );
    error.code = "DEVELOPER_LIFECYCLE_TRANSITION_READBACK_MISMATCH";
    error.run = observed;
    throw error;
  }
  return observed;
}

export async function startDeveloperLifecycleStep(
  svc: any,
  run: any,
  stepKey: string,
) {
  const existing = run?.lifecycle_steps?.[stepKey];
  if (existing?.status === "succeeded") {
    const chain = await validateDeveloperLifecycleReceiptChain(run);
    if (chain.ok) {
      return { run, replay: true, result: existing.result || null };
    }
    const reviewed = await markDeveloperLifecycleReviewRequired(
      svc,
      run,
      "material_effect_receipt_chain_invalid",
      chain,
    );
    const error: any = new Error("developer_material_effect_requires_review");
    error.code = "DEVELOPER_REVIEW_REQUIRED";
    error.run = reviewed;
    throw error;
  }
  if (existing) {
    const reviewed = await markDeveloperLifecycleReviewRequired(
      svc,
      run,
      "material_effect_step_not_replayable",
      { step_key: stepKey, prior_step: existing },
    );
    const error: any = new Error("developer_material_effect_requires_review");
    error.code = "DEVELOPER_REVIEW_REQUIRED";
    error.run = reviewed;
    throw error;
  }
  const prior = await validateDeveloperLifecycleReceiptChain(run);
  if (!prior.ok) {
    const reviewed = await markDeveloperLifecycleReviewRequired(
      svc,
      run,
      "material_effect_receipt_chain_invalid",
      prior,
    );
    const error: any = new Error("developer_material_effect_requires_review");
    error.code = "DEVELOPER_REVIEW_REQUIRED";
    error.run = reviewed;
    throw error;
  }
  const timestamp = new Date().toISOString();
  const next = {
    ...(run.lifecycle_steps || {}),
    [stepKey]: {
      status: "pending",
      receipt_version: DEVELOPER_STEP_RECEIPT_VERSION,
      receipt_sequence: prior.receipt_count + 1,
      prior_receipt_hash: prior.receipt_head,
      started_at: timestamp,
    },
  };
  return {
    replay: false,
    run: await transitionDeveloperLifecycle(svc, run, {
      lifecycle_phase: "effecting",
      lifecycle_steps: next,
      lifecycle_lease_expires_at: new Date(
        Date.now() + DEVELOPER_LIFECYCLE_LEASE_MS,
      ).toISOString(),
    }),
  };
}

export async function finishDeveloperLifecycleStep(
  svc: any,
  run: any,
  stepKey: string,
  result: any,
) {
  const existing = run?.lifecycle_steps?.[stepKey];
  if (!existing || existing.status !== "pending") {
    throw new Error("developer_lifecycle_step_not_pending");
  }
  const completedAt = new Date().toISOString();
  const completed = {
    ...existing,
    status: "succeeded",
    completed_at: completedAt,
    result: result || null,
  };
  const receiptHash = await developerStepReceiptHash(run, stepKey, completed);
  const next = {
    ...(run.lifecycle_steps || {}),
    [stepKey]: {
      ...completed,
      receipt_hash: receiptHash,
    },
  };
  const observed = await transitionDeveloperLifecycle(svc, run, {
    lifecycle_phase: "effecting",
    lifecycle_steps: next,
    lifecycle_lease_expires_at: new Date(
      Date.now() + DEVELOPER_LIFECYCLE_LEASE_MS,
    ).toISOString(),
  });
  const chain = await validateDeveloperLifecycleReceiptChain(observed);
  const persisted = observed?.lifecycle_steps?.[stepKey];
  if (
    !chain.ok || !same(persisted?.receipt_hash, receiptHash) ||
    !same(await sha256(persisted?.result ?? null), await sha256(result || null))
  ) {
    const error: any = new Error("developer_step_receipt_readback_mismatch");
    error.code = "DEVELOPER_STEP_RECEIPT_READBACK_MISMATCH";
    error.run = observed;
    throw error;
  }
  return observed;
}

export async function releaseDeveloperLifecycleBeforeEffects(
  svc: any,
  run: any,
  reason: string,
) {
  if (
    run.lifecycle_phase !== "claimed" ||
    hasExternalStepEvidence(run)
  ) return { released: false, run };
  const config = ACTION_CONFIG[run.lifecycle_action as DeveloperMaterialAction];
  if (!config) return { released: false, run };
  const released = await transitionDeveloperLifecycle(svc, run, {
    status: config.initialStatus,
    lifecycle_action: "",
    lifecycle_phase: "idle",
    lifecycle_attempt_token: "",
    lifecycle_lease_expires_at: "",
    lifecycle_idempotency_key: "",
    lifecycle_approval_id: "",
    lifecycle_authority_hash: "",
    lifecycle_binding_hash: "",
    lifecycle_steps: {},
    lifecycle_review_reason: text(reason).slice(0, 500),
  });
  return { released: true, run: released };
}

export async function completeDeveloperLifecycle(
  svc: any,
  run: any,
  finalPatch: any,
) {
  const config = ACTION_CONFIG[run.lifecycle_action as DeveloperMaterialAction];
  if (!config) throw new Error("developer_lifecycle_action_invalid");
  const chain = await validateDeveloperLifecycleReceiptChain(run);
  if (!chain.ok || chain.receipt_count < 1) {
    throw new Error("developer_terminal_receipt_chain_required");
  }
  const completed = await transitionDeveloperLifecycle(svc, run, {
    ...finalPatch,
    lifecycle_result: {
      receipt_history_version: run?.lifecycle_result?.receipt_history_version ||
        DEVELOPER_ACTION_HISTORY_VERSION,
      prior_actions: developerActionHistory(run),
      prior_action_head: text(run?.lifecycle_result?.prior_action_head),
      prior_action_count: Number(
        run?.lifecycle_result?.prior_action_count || 0,
      ),
      ...(finalPatch?.lifecycle_result || {}),
      receipt_chain_version: DEVELOPER_STEP_RECEIPT_VERSION,
      receipt_chain_head: chain.receipt_head,
      receipt_count: chain.receipt_count,
      receipt_chain_verified: true,
    },
    status: config.finalStatus,
    lifecycle_phase: "completed",
    lifecycle_lease_expires_at: "",
    lifecycle_completed_at: new Date().toISOString(),
  });
  const history = await validateDeveloperLifecycleHistory(completed);
  const readback = await validateDeveloperLifecycleReceiptChain(completed);
  if (
    !history.ok || !readback.ok ||
    !same(
      completed?.lifecycle_result?.receipt_chain_head,
      readback.receipt_head,
    ) ||
    Number(completed?.lifecycle_result?.receipt_count || 0) !==
      readback.receipt_count
  ) throw new Error("developer_terminal_receipt_readback_mismatch");
  return completed;
}
