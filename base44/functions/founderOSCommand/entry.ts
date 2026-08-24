import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { FOUNDER_OS_VERSION, safeNumber } from "../../shared/founderOSCore.ts";
import { handleFounderMeetingAdmin } from "../../shared/logical/founderMeetingAdmin.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import { safeBestEffort } from "../../shared/bestEffort.ts";
import { sha256 } from "../../shared/intelligenceCore.ts";
import {
  LOCALE_MARKET_BY_CODE,
  LOCALE_REGISTRY,
  PRODUCT_LOCALES,
} from "../../shared/generated/localeRegistry.ts";
import { normalizeProductLocale } from "../../shared/localeRuntime.ts";
import {
  approvalImmutableContentHash,
  buildApprovalConfirmationBinding,
  buildApprovalAuthoritySnapshot,
  deriveApprovalLifecycle,
  projectApprovalCommandResponse,
  projectCanonicalApprovalCommandResult,
} from "../../shared/approvalAuthority.ts";
import { emergencyState } from "../../shared/operationalControl.ts";
import { MARKET_SCOPE_VERSION } from "../../shared/marketLaunchScope.ts";
import {
  assertFreshApprovalConfirmationNonce,
  installApprovalConfirmationPreview,
} from "../../shared/approvalResolutionSaga.ts";
import { inspectCommandFunctionResponse } from "../../shared/commandFunctionResult.ts";

type ApprovalResolutionMode =
  | "commercial"
  | "external_executor"
  | "developer_authorization"
  | "blocked";
type ApprovalResolutionRule = Readonly<{
  mode: ApprovalResolutionMode;
  resolver: string;
  expectedRisk: number;
  expectedAgent?: string | readonly string[];
  expectedTaskType?: string;
}>;

/**
 * Fail-closed registry of every action_type currently emitted by
 * `Approval.create`. Adding an Approval producer without registering its
 * canonical resolution semantics is intentionally a release-test failure.
 */
const APPROVAL_RESOLUTION_REGISTRY: Readonly<
  Record<string, ApprovalResolutionRule>
> = Object.freeze({
  "final_provider_deal": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "aggregate_contract": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "aggregate_contract_execution": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "commercial_reply_exception": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "provider_negotiation_review": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "aggregate_procurement_review": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "contract_mismatch": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "contract_exception": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "post_meeting_commitment_review": {
    mode: "commercial",
    resolver: "resolveCommercialApproval",
    expectedRisk: 4,
  },
  "send_outreach_email": {
    mode: "external_executor",
    resolver: "outreachAgent",
    expectedRisk: 3,
    expectedAgent: "outreach",
    expectedTaskType: "send_outreach_email",
  },
  "send_follow_up_email": {
    mode: "external_executor",
    resolver: "followUpAgent",
    expectedRisk: 3,
    expectedAgent: "follow_up",
    expectedTaskType: "send_follow_up_email",
  },
  "schedule_founder_meeting": {
    mode: "external_executor",
    resolver: "meetingAgent",
    expectedRisk: 3,
    expectedAgent: ["meeting", "founder_meeting"],
    expectedTaskType: "schedule_founder_meeting",
  },
  "publish_blog": {
    mode: "external_executor",
    resolver: "blogAgent",
    expectedRisk: 2,
    expectedAgent: "blog",
    expectedTaskType: "publish_blog",
  },
  "publish_linkedin_post": {
    mode: "external_executor",
    resolver: "linkedinAgent",
    expectedRisk: 2,
    expectedAgent: "linkedin",
    expectedTaskType: "publish_linkedin_post",
  },
  "publish_x_post": {
    mode: "external_executor",
    resolver: "xTwitterAgent",
    expectedRisk: 2,
    expectedAgent: "x_twitter",
    expectedTaskType: "publish_x_post",
  },
  "send_newsletter": {
    mode: "external_executor",
    resolver: "newsletterAgent",
    expectedRisk: 2,
    expectedAgent: "newsletter",
    expectedTaskType: "send_newsletter",
  },
  "send_investor_update": {
    mode: "blocked",
    resolver: "investor_update_transport_not_configured",
    expectedRisk: 2,
    expectedAgent: "investor_update",
    expectedTaskType: "draft_investor_update",
  },
  "developer_apply_patch": {
    mode: "developer_authorization",
    resolver: "developerMigrationEngine:apply_plan",
    expectedRisk: 3,
    expectedAgent: "developer_migration",
    expectedTaskType: "developer_migration_plan",
  },
  "migration_go_live": {
    mode: "developer_authorization",
    resolver: "developerMigrationEngine:cutover",
    expectedRisk: 4,
    expectedAgent: "developer_migration",
    expectedTaskType: "developer_cutover",
  },
  "developer_rollback": {
    mode: "developer_authorization",
    resolver: "developerMigrationEngine:rollback",
    expectedRisk: 4,
    expectedAgent: "developer_migration",
    expectedTaskType: "developer_rollback",
  },
});

// These executors implement the AgentTask durable claim/fencing protocol. Only
// this set may be resumed from a terminal Approval. Outreach/follow-up retain
// their commercial-message receipts underneath this same approval fence.
const DURABLE_EXTERNAL_EXECUTORS = new Set([
  "outreachAgent",
  "followUpAgent",
  "meetingAgent",
  "blogAgent",
  "linkedinAgent",
  "xTwitterAgent",
  "newsletterAgent",
]);
const commercial = new Set(
  Object.entries(APPROVAL_RESOLUTION_REGISTRY)
    .filter(([, rule]) => rule.mode === "commercial")
    .map(([actionType]) => actionType),
);
const founderMeetingActions = new Set([
  "status",
  "configure_policy",
  "command",
  "record_outcome",
  "mark_no_show",
  "cancel_meeting",
]);
const newKey = () => `founder-command:${crypto.randomUUID()}`;
const now = () => new Date().toISOString();
const clean = (value: any, max = 160) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

function validTimezone(value: string) {
  try {
    Intl.DateTimeFormat("en-GB", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function localePreferencePatch(input: any) {
  const requestedLocale = normalizeProductLocale(
    input?.locale || input?.language,
  );
  if (!requestedLocale)
    return { ok: false, error: "supported_product_locale_required" };
  const profile = (PRODUCT_LOCALES as any[]).find(
    (row: any) => row.locale === requestedLocale,
  );
  const marketCode = clean(input?.market_code, 8).toUpperCase();
  if (marketCode && !LOCALE_MARKET_BY_CODE[marketCode])
    return { ok: false, error: "known_market_code_required" };
  const currency = clean(
    input?.currency || LOCALE_MARKET_BY_CODE[marketCode]?.currency || "EUR",
    3,
  ).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    return { ok: false, error: "iso_currency_required" };
  const timezone = clean(
    input?.timezone || LOCALE_MARKET_BY_CODE[marketCode]?.timezone || "UTC",
    80,
  );
  if (!validTimezone(timezone))
    return { ok: false, error: "iana_timezone_required" };
  const timezoneMode = clean(
    input?.timezone_mode || "automatic",
    20,
  ).toLowerCase();
  if (!["automatic", "explicit"].includes(timezoneMode))
    return { ok: false, error: "timezone_mode_invalid" };
  const firstDay =
    input?.first_day_of_week == null ? null : Number(input.first_day_of_week);
  if (
    firstDay !== null &&
    (!Number.isInteger(firstDay) || firstDay < 0 || firstDay > 6)
  )
    return { ok: false, error: "first_day_of_week_invalid" };
  return {
    ok: true,
    patch: {
      locale: requestedLocale,
      language: profile?.language || requestedLocale.split("-")[0],
      market_code: marketCode || null,
      currency,
      timezone,
      timezone_mode: timezoneMode,
      date_format:
        clean(input?.date_format || "locale_default", 40) || "locale_default",
      number_format:
        clean(input?.number_format || "locale_default", 40) || "locale_default",
      currency_format:
        clean(input?.currency_format || "locale_default", 40) ||
        "locale_default",
      first_day_of_week: firstDay,
      source: "admin",
      registry_version: LOCALE_REGISTRY.registryVersion,
      updated_at: now(),
    },
  };
}

function updatedExactlyOne(result: any) {
  if (!result || typeof result !== "object") return false;
  if (result.success === false || result.ok === false) return false;
  const counters = ["updated", "modified_count", "matched_count"]
    .filter((key) => result[key] !== undefined && result[key] !== null)
    .map((key) => Number(result[key]));
  return counters.length > 0 && counters.every((value) =>
    Number.isInteger(value) && value === 1
  );
}

function isApprovalIntent(intent: any) {
  return String(intent || "").startsWith("approval");
}

function commandResponseProjection(intent: any, result: any) {
  const commandStatus = "executed";
  if (!isApprovalIntent(intent)) {
    return { status: commandStatus, command_status: commandStatus };
  }
  return projectApprovalCommandResponse(result);
}

async function canonicalApprovalCommandResult(
  svc: any,
  intent: any,
  result: any,
  scope: any,
  expectedCommandKey = "",
  expectedActorEmail = "",
) {
  if (!isApprovalIntent(intent)) return result || {};
  const approvalId = String(scope?.approval_id || "");
  if (!approvalId) throw new Error("approval_execution_authority_missing");
  const approval = await svc.entities.Approval.get(approvalId).catch(
    (error: any) =>
      safeBestEffort(error, {
        operation: "founderOSCommand.canonical_approval_execution_read",
        fallback: null,
        severity: "critical",
      }),
  );
  if (
    !approval ||
    String(approval.id || "") !== approvalId ||
    !["approved", "rejected", "expired"].includes(String(approval.status || ""))
  ) throw new Error("approval_execution_authority_unavailable");
  if (
    (expectedCommandKey &&
      String(approval.resolution_command_key || "") !== expectedCommandKey) ||
    (expectedActorEmail &&
      String(approval.resolution_actor_email || "").toLowerCase() !==
        expectedActorEmail.toLowerCase()) ||
    (scope?.decision &&
      String(approval.resolution_decision || "") !== String(scope.decision))
  ) throw new Error("approval_execution_authority_binding_mismatch");
  const rule = APPROVAL_RESOLUTION_REGISTRY[String(approval.action_type || "")];
  if (!rule) throw new Error("approval_execution_authority_ambiguous");

  if (!approval.agent_task_id) {
    throw new Error("approval_execution_task_authority_missing");
  }
  const task = await svc.entities.AgentTask.get(approval.agent_task_id).catch(
    (error: any) =>
      safeBestEffort(error, {
        operation: "founderOSCommand.canonical_approval_task_execution_read",
        fallback: null,
        severity: "critical",
      }),
  );
  if (!task || String(task.id || "") !== String(approval.agent_task_id)) {
    throw new Error("approval_execution_task_authority_unavailable");
  }
  const taskBinding = validateRegisteredTaskBinding(approval, task, rule, [
    "waiting_approval",
    "running",
    "completed",
    "waiting_input",
    "failed",
    "cancelled",
  ]);
  if (!taskBinding.ok) {
    const taskBindingError = (taskBinding as { error?: string }).error ||
      "unknown_binding";
    throw new Error(
      `approval_execution_task_authority_ambiguous:${taskBindingError}`,
    );
  }
  return projectCanonicalApprovalCommandResult({
    approval,
    task,
    recordedResult: result,
    allowTaskExecution: rule.mode === "external_executor",
  });
}

async function executionReplayResponse(
  svc: any,
  replay: any,
  commandKey: string,
  actorEmail: string,
  fallbackIntent: any = "",
  fallbackScope: any = {},
) {
  const priorIntent = replay.intent || fallbackIntent;
  const approvalReplay = isApprovalIntent(priorIntent) ||
    isApprovalIntent(fallbackIntent) ||
    String(replay.action || "") === "resolve_approval";
  const projectionIntent = approvalReplay ? "approval" : priorIntent;
  let priorScope = replay.scope_json || fallbackScope;
  if (approvalReplay) {
    const requestedApprovalId = String(fallbackScope?.approval_id || "");
    const recordedApprovalId = String(replay.scope_json?.approval_id || "");
    if (
      !requestedApprovalId ||
      (recordedApprovalId && recordedApprovalId !== requestedApprovalId)
    ) throw new Error("approval_replay_scope_mismatch");
    priorScope = { ...fallbackScope, approval_id: requestedApprovalId };
  }
  const priorResult = approvalReplay
    ? await canonicalApprovalCommandResult(
      svc,
      projectionIntent,
      replay.result_json,
      priorScope,
      commandKey,
      actorEmail,
    )
    : replay.result_json || {};
  const projection = commandResponseProjection(projectionIntent, priorResult);
  return Response.json({
    ok: true,
    idempotent_replay: true,
    command_key: commandKey,
    preview: replay.preview_json,
    result: priorResult,
    ...projection,
    audit_id: replay.id,
  });
}

function previewExpired(preview: any) {
  const value = Date.parse(String(preview?.preview_expires_at || ""));
  return !Number.isFinite(value) || value <= Date.now();
}

async function existingExecution(
  svc: any,
  commandKey: string,
  actorEmail = "",
) {
  if (!commandKey) return null;
  const rows = await svc.entities.FounderCommandAudit.filter(
    {
      command_key: commandKey,
      status: "executed",
      ...(actorEmail ? { actor_email: actorEmail } : {}),
    },
    "-created_at",
    2,
  );
  if (rows.length > 1) throw new Error("founder_command_execution_ambiguous");
  const row = rows[0] || null;
  return row && (!actorEmail || row.actor_email === actorEmail) ? row : null;
}

async function storedPreview(
  svc: any,
  commandKey: string,
  action: string,
  actorEmail: string,
) {
  if (!commandKey) return null;
  const rows = await svc.entities.FounderCommandAudit.filter(
    {
      command_key: commandKey,
      action,
      status: "previewed",
      actor_email: actorEmail,
    },
    "-created_at",
    2,
  );
  if (rows.length > 1) throw new Error("founder_command_preview_ambiguous");
  const row = rows[0] || null;
  return row && row.actor_email === actorEmail ? row : null;
}

async function persistPreview(svc: any, user: any, body: any, input: any) {
  const commandKey = String(input.command_key || body.command_key || newKey());
  const preview = {
    ...input.preview,
    preview_hash: await sha256(input.preview),
    preview_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
  await svc.entities.FounderCommandAudit.create({
    command_key: commandKey,
    conversation_id: body.conversation_id || "",
    actor_email: user.email,
    intent: input.intent || input.action,
    action: input.action,
    scope_json: input.scope || {},
    risk_level: input.risk,
    material: input.material,
    requires_confirmation: true,
    confirmed: false,
    preview_json: preview,
    status: "previewed",
    result_json: {},
    policy_json: { founder_os_version: FOUNDER_OS_VERSION },
    created_at: now(),
  });
  return Response.json({
    ok: true,
    requires_confirmation: true,
    command_key: commandKey,
    preview,
    ...(input.confirmation_nonce
      ? { confirmation_nonce: String(input.confirmation_nonce) }
      : {}),
  });
}

async function persistExecution(svc: any, user: any, body: any, input: any) {
  const createdAt = now();
  const prior = await existingExecution(
    svc,
    String(input.command_key || ""),
    String(user.email || ""),
  );
  if (prior) {
    return executionReplayResponse(
      svc,
      prior,
      input.command_key,
      String(user.email || ""),
      input.intent || input.action,
      input.scope || body.scope || {},
    );
  }
  const intent = input.intent || input.action;
  const scope = input.scope || body.scope || {};
  const result = await canonicalApprovalCommandResult(
    svc,
    intent,
    input.result,
    scope,
    String(input.command_key || ""),
    String(user.email || ""),
  );
  const projection = commandResponseProjection(intent, result);
  const audit = await svc.entities.FounderCommandAudit.create({
    command_key: input.command_key,
    conversation_id: body.conversation_id || "",
    actor_email: user.email,
    intent,
    action: input.action,
    scope_json: scope,
    risk_level: input.risk,
    material: input.material,
    requires_confirmation: input.requires_confirmation !== false,
    confirmed: input.requires_confirmation === false ? false : true,
    preview_json: input.preview || {},
    status: "executed",
    result_json: result,
    policy_json: { founder_os_version: FOUNDER_OS_VERSION },
    created_at: createdAt,
  });
  await svc.entities.OperationalLog.create({
    event_type: "founder_os_command",
    message: input.action,
    data_json: {
      command_key: input.command_key,
      risk_level: input.risk,
      material: input.material,
      preview: input.preview,
      result,
      audit_id: audit.id,
    },
    actor_email: user.email,
    created_at: createdAt,
  }).catch((error: any) =>
    safeBestEffort(error, {
      operation: "founderOSCommand",
      fallback: null,
      severity: "secondary",
    }),
  );
  return Response.json({
    ok: true,
    command_key: input.command_key,
    preview: input.preview,
    result,
    ...projection,
    audit_id: audit.id,
  });
}

function sameText(left: any, right: any) {
  return String(left ?? "").trim() === String(right ?? "").trim();
}

function sameRepo(left: any, right: any) {
  return String(left ?? "").trim().toLowerCase() ===
    String(right ?? "").trim().toLowerCase();
}

function bindingFailure(error: string) {
  return { ok: false as const, error };
}

function expectedAgentMatches(expected: string | readonly string[] | undefined, actual: any) {
  if (!expected) return true;
  const allowed = Array.isArray(expected) ? expected : [expected];
  return allowed.includes(String(actual || ""));
}

function validateRegisteredTaskBinding(
  approval: any,
  task: any,
  rule: ApprovalResolutionRule,
  allowedExternalStatuses: readonly string[] = ["waiting_approval"],
) {
  if (!task || !sameText(task.id, approval.agent_task_id))
    return bindingFailure("approval_agent_task_missing_or_mismatched");
  if (!sameText(task.brand_id, approval.brand_id))
    return bindingFailure("approval_agent_task_brand_mismatch");
  if (!expectedAgentMatches(rule.expectedAgent, task.agent_name))
    return bindingFailure("approval_agent_task_owner_mismatch");
  if (rule.expectedTaskType && !sameText(task.task_type, rule.expectedTaskType))
    return bindingFailure("approval_agent_task_type_mismatch");
  if (Number(task.risk_level) !== Number(rule.expectedRisk) ||
    Number(approval.risk_level) !== Number(rule.expectedRisk))
    return bindingFailure("approval_risk_binding_mismatch");
  if (task.requires_approval !== true)
    return bindingFailure("approval_agent_task_authority_flag_missing");
  if (
    rule.mode === "external_executor" || rule.mode === "blocked"
  ) {
    if (!sameText(task.approval_id, approval.id))
      return bindingFailure("approval_agent_task_reverse_link_mismatch");
    if (!allowedExternalStatuses.includes(String(task.status || "")))
      return bindingFailure("approval_agent_task_not_waiting");
  }
  return { ok: true as const };
}

async function validateDeveloperAuthorizationBinding(
  svc: any,
  approval: any,
  task: any,
  rule: ApprovalResolutionRule,
) {
  const taskBinding = validateRegisteredTaskBinding(approval, task, rule);
  if (!taskBinding.ok) return taskBinding;
  if (!sameText(approval.related_entity_type, "DeveloperMigrationRun"))
    return bindingFailure("developer_approval_related_type_mismatch");

  const payload = approval.draft_payload_json || {};
  if (!sameText(payload.run_id, approval.related_entity_id))
    return bindingFailure("developer_approval_run_payload_mismatch");
  const run = await svc.entities.DeveloperMigrationRun.get(
    String(approval.related_entity_id || ""),
  );
  if (!run || !sameText(run.id, approval.related_entity_id))
    return bindingFailure("developer_migration_run_not_found");
  if (!sameText(run.workspace_id, payload.workspace_id))
    return bindingFailure("developer_workspace_payload_mismatch");
  const workspace = await svc.entities.DeveloperWorkspace.get(
    String(run.workspace_id || ""),
  );
  if (!workspace)
    return bindingFailure("developer_workspace_not_found");
  if (!sameText(workspace.provider, "github"))
    return bindingFailure("developer_workspace_provider_not_supported");
  if (!sameText(task.status, "completed"))
    return bindingFailure("developer_authorization_task_not_completed");
  if (
    !sameText(approval.brand_id, run.brand_id) ||
    !sameText(approval.brand_id, workspace.brand_id) ||
    !sameText(approval.brand_id, task.brand_id)
  ) return bindingFailure("developer_authority_brand_mismatch");
  if (
    !sameRepo(payload.repo_full_name, workspace.repo_full_name) ||
    !sameRepo(payload.repo_full_name, task.output_payload_json?.repo_full_name || workspace.repo_full_name)
  ) return bindingFailure("developer_repository_binding_mismatch");
  if (!sameText(task.output_payload_json?.run_id, run.id))
    return bindingFailure("developer_task_run_link_mismatch");

  if (approval.action_type === "developer_apply_patch") {
    if (!sameText(run.approval_id, approval.id))
      return bindingFailure("developer_apply_approval_link_mismatch");
    if (!sameText(run.status, "awaiting_approval"))
      return bindingFailure("developer_apply_run_state_mismatch");
    if (!sameText(task.output_payload_json?.workspace_id, workspace.id))
      return bindingFailure("developer_apply_task_workspace_mismatch");
    if (
      !sameText(payload.base_branch, run.base_branch) ||
      !sameText(payload.base_branch, workspace.default_branch)
    ) return bindingFailure("developer_apply_base_branch_mismatch");
    if (
      !sameText(payload.base_sha, run.migration_plan?.base_sha) ||
      !payload.approved_plan || typeof payload.approved_plan !== "object"
    ) return bindingFailure("developer_apply_plan_snapshot_mismatch");
    if (
      !task.output_payload_json?.plan ||
      await sha256(task.output_payload_json.plan) !==
        await sha256(payload.approved_plan)
    ) return bindingFailure("developer_apply_task_plan_mismatch");
    const runPlan = { ...(run.migration_plan || {}) };
    for (
      const generatedField of [
        "engine_version",
        "base_sha",
        "base_tree_sha",
        "scan_bytes",
        "tree_truncated",
      ]
    ) delete runPlan[generatedField];
    if (await sha256(runPlan) !== await sha256(payload.approved_plan))
      return bindingFailure("developer_apply_run_plan_mismatch");
  } else if (approval.action_type === "migration_go_live") {
    if (!sameText(run.cutover_approval_id, approval.id))
      return bindingFailure("developer_cutover_approval_link_mismatch");
    if (!sameText(run.status, "awaiting_cutover_approval"))
      return bindingFailure("developer_cutover_run_state_mismatch");
    if (
      Number(payload.pr_number || 0) <= 0 ||
      Number(payload.pr_number) !== Number(run.pull_request_number)
    ) return bindingFailure("developer_cutover_pr_binding_mismatch");
    if (
      !sameText(payload.approved_head_sha, run.test_results?.head_sha) ||
      Number(run.test_results?.total || 0) < 1 ||
      Number(run.test_results?.failed || 0) !== 0 ||
      Number(run.test_results?.pending || 0) !== 0 ||
      run.test_results?.structural_mismatch === true ||
      run.test_results?.mergeable === false
    ) return bindingFailure("developer_cutover_ci_authority_mismatch");
    if (
      await sha256(payload.test_results || {}) !==
        await sha256(run.test_results || {}) ||
      await sha256(task.output_payload_json?.test_results || {}) !==
        await sha256(run.test_results || {})
    ) return bindingFailure("developer_cutover_ci_snapshot_mismatch");
  } else if (approval.action_type === "developer_rollback") {
    if (!sameText(run.verification?.rollback_approval_id, approval.id))
      return bindingFailure("developer_rollback_approval_link_mismatch");
    if (!sameText(run.status, "failed"))
      return bindingFailure("developer_rollback_run_state_mismatch");
    if (
      !sameText(payload.expected_head_sha, run.commit_sha) ||
      !sameText(payload.rollback_sha, run.rollback_sha) ||
      !sameText(task.output_payload_json?.current_merge_sha, run.commit_sha) ||
      !sameText(task.output_payload_json?.rollback_sha, run.rollback_sha)
    ) return bindingFailure("developer_rollback_snapshot_mismatch");
  } else {
    return bindingFailure("unsupported_developer_approval_action_type");
  }
  return { ok: true as const, run, workspace };
}

async function approvalIntelligenceBinding(
  svc: any,
  approval: any,
  task: any,
) {
  const payload = approval.draft_payload_json || {};
  let snapshotId = String(
    approval.intelligence_snapshot_id ||
      payload.intelligence_snapshot_id ||
      task?.intelligence_snapshot_id ||
      task?.output_payload_json?.intelligence_snapshot_id ||
      "",
  );
  if (
    !snapshotId &&
    [
      "NegotiationCase",
      "DynamicAgreement",
      "DeveloperMigrationRun",
    ].includes(String(approval.related_entity_type || ""))
  ) {
    const related = await svc.entities[approval.related_entity_type].get(
      approval.related_entity_id,
    );
    snapshotId = String(related?.intelligence_snapshot_id || "");
  }
  if (!snapshotId) {
    return {
      id: "NONE_BOUND",
      hash: await sha256({
        state: "NONE_BOUND",
        approval_id: approval.id,
        agent_task_id: approval.agent_task_id || null,
      }),
      state: "NONE_BOUND",
    };
  }
  const row = await svc.entities.IntelligenceSnapshot.get(snapshotId);
  if (!row || String(row.id || "") !== snapshotId)
    throw new Error("approval_intelligence_snapshot_missing");
  const computed = await sha256(row.snapshot_json || row);
  if (
    String(row.snapshot_hash || "") &&
    String(row.snapshot_hash) !== computed
  ) throw new Error("approval_intelligence_snapshot_hash_mismatch");
  return {
    id: snapshotId,
    hash: String(row.snapshot_hash || computed),
    state: "OBSERVED",
  };
}

async function approvalConfirmationBinding(
  svc: any,
  input: {
    approval: any;
    task: any;
    actorEmail: string;
    decision: string;
    reason: string;
    nonceHash: string;
    authoritySnapshot: any;
    authorityHash: string;
  },
) {
  const emergency = await emergencyState(svc);
  if (
    !emergency.control_available ||
    !emergency.control_id ||
    !Number.isInteger(emergency.control_revision)
  ) throw new Error("approval_emergency_authority_unavailable");
  const intelligenceSnapshot = await approvalIntelligenceBinding(
    svc,
    input.approval,
    input.task,
  );
  const payload = input.approval.draft_payload_json || {};
  return buildApprovalConfirmationBinding({
    approval: input.approval,
    actorEmail: input.actorEmail,
    decision: input.decision,
    reason: input.reason,
    nonceHash: input.nonceHash,
    policy: {
      key: "founder_approval_resolution",
      version: FOUNDER_OS_VERSION,
    },
    authoritySnapshot: {
      id: `approval-authority:${input.approval.id}:${input.authorityHash.slice(0, 24)}`,
      hash: input.authorityHash,
    },
    intelligenceSnapshot,
    economicTerms: {
      draft_payload_json: payload,
      financial_impact:
        payload.estimated_financial_impact ??
        payload.expected_provider_revenue_12m_minor ??
        null,
    },
    legalTerms: {
      draft_content: input.approval.draft_content || "",
      draft_payload_json: payload,
    },
    marketScopeVersion: MARKET_SCOPE_VERSION,
    emergency: {
      id: emergency.control_id,
      revision: emergency.control_revision,
    },
  });
}

async function persistExecutorEvidence(
  svc: any,
  user: any,
  input: {
    commandKey: string;
    approval: any;
    resolver: string;
    status:
      | "EXECUTED"
      | "FAILED_RETRYABLE"
      | "FAILED_TERMINAL"
      | "REVIEW_REQUIRED";
    result?: any;
    error?: string;
  },
) {
  return svc.entities.OperationalLog.create({
    brand_id: input.approval.brand_id || "",
    event_type: "founder_approval_executor",
    message: `${input.approval.action_type}:${input.status}`,
    data_json: {
      command_key: input.commandKey,
      approval_id: input.approval.id,
      action_type: input.approval.action_type,
      authorization_status: "approved",
      execution_status: input.status,
      resolver: input.resolver,
      result: input.result || null,
      error: input.error || null,
    },
    actor_email: user.email,
    created_at: now(),
  });
}

async function persistApprovedButExecutionFailed(
  svc: any,
  user: any,
  body: any,
  input: {
    commandKey: string;
    approval: any;
    decision: string;
    risk: number;
    material: boolean;
    preview: any;
    resolver: string;
    error: string;
    reviewRequired?: boolean;
  },
) {
  const createdAt = now();
  const result = {
    ok: false,
    error: input.reviewRequired
      ? "approved_execution_review_required"
      : "approved_but_executor_failed",
    approval_status: "approved",
    authorization_recorded: true,
    execution_status: input.reviewRequired
      ? "REVIEW_REQUIRED"
      : "FAILED_RETRYABLE",
    execution_error: clean(input.error, 240),
    resolver: input.resolver,
    review_required: input.reviewRequired === true,
    retry_requires_new_approval: false,
    retry_execution_via_canonical_agent: input.reviewRequired !== true,
  };
  const audit = await svc.entities.FounderCommandAudit.create({
    command_key: input.commandKey,
    conversation_id: body.conversation_id || "",
    actor_email: user.email,
    intent: "approval_execution",
    action: "resolve_approval",
    scope_json: {
      approval_id: input.approval.id,
      decision: input.decision,
      resolver: input.resolver,
    },
    risk_level: input.risk,
    material: input.material,
    requires_confirmation: true,
    confirmed: true,
    preview_json: input.preview || {},
    status: "failed",
    result_json: result,
    policy_json: { founder_os_version: FOUNDER_OS_VERSION },
    created_at: createdAt,
  });
  await persistExecutorEvidence(svc, user, {
    commandKey: input.commandKey,
    approval: input.approval,
    resolver: input.resolver,
    status: input.reviewRequired ? "REVIEW_REQUIRED" : "FAILED_RETRYABLE",
    error: input.error,
  }).catch((evidenceError:any)=>safeBestEffort(evidenceError,{operation:'founderOSCommand.persist_failed_executor_evidence',fallback:null,severity:'critical'}));
  return Response.json({ ...result, audit_id: audit.id }, { status: 502 });
}

Deno.serve(async (req) => {
  const routedAction = String(
    (
      await req
        .clone()
        .json()
        .catch(() => ({}))
    )?.action || "",
  );
  if (founderMeetingActions.has(routedAction))
    return handleFounderMeetingAdmin(req);
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user)
      return Response.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    if (user.role !== "admin")
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const confirmed = body.confirmed === true;
    const svc = base44.asServiceRole;
    const suppliedCommandKey = String(body.command_key || "");
    const commandKey = suppliedCommandKey || (confirmed ? "" : newKey());
    if (!action)
      return Response.json(
        { ok: false, error: "action_required" },
        { status: 400 },
      );
    if (confirmed) {
      if (!suppliedCommandKey)
        return Response.json(
          { ok: false, error: "preview_command_key_required" },
          { status: 409 },
        );
      const replay = await existingExecution(svc, commandKey, user.email);
      if (replay)
        return executionReplayResponse(
          svc,
          replay,
          commandKey,
          String(user.email || ""),
          action === "resolve_approval" ? "approval" : action,
          action === "resolve_approval"
            ? {
              approval_id: String(body.approval_id || ""),
              decision: String(body.decision || "approve"),
            }
            : {},
        );
    }

    if (action === "save_admin_locale_preference") {
      const parsed = localePreferencePatch(body.preference || body);
      if (!parsed.ok)
        return Response.json(
          { ok: false, error: parsed.error },
          { status: 400 },
        );
      const key = commandKey || newKey();
      const replay = await existingExecution(svc, key, user.email);
      if (replay)
        return executionReplayResponse(
          svc,
          replay,
          key,
          String(user.email || ""),
          "admin_locale_preference",
          {},
        );
      const preferenceKey = `admin:${String(user.id || user.email || "")}`;
      const rows = await svc.entities.LocalePreference.filter(
        { preference_key: preferenceKey },
        "-updated_at",
        5,
      );
      const previous = rows[0] || null;
      const saved = previous
        ? await svc.entities.LocalePreference.update(previous.id, {
            ...parsed.patch,
            user_id: String(user.id || ""),
            preference_key: preferenceKey,
          })
        : await svc.entities.LocalePreference.create({
            ...parsed.patch,
            user_id: String(user.id || ""),
            preference_key: preferenceKey,
          });
      const result = {
        ok: true,
        preference: {
          locale: saved.locale,
          language: saved.language,
          market_code: saved.market_code || null,
          currency: saved.currency,
          timezone: saved.timezone,
          timezone_mode: saved.timezone_mode || "automatic",
          date_format: saved.date_format || "locale_default",
          number_format: saved.number_format || "locale_default",
          currency_format: saved.currency_format || "locale_default",
          first_day_of_week: saved.first_day_of_week ?? null,
          updated_at: saved.updated_at,
        },
        previous_value: previous
          ? {
              locale: previous.locale,
              language: previous.language,
              market_code: previous.market_code || null,
              currency: previous.currency,
              timezone: previous.timezone,
            }
          : null,
      };
      return persistExecution(svc, user, body, {
        command_key: key,
        action,
        intent: "admin_locale_preference",
        scope: { preference_key: preferenceKey },
        risk: 1,
        material: false,
        requires_confirmation: false,
        preview: {
          action,
          previous_value: result.previous_value,
          new_value: result.preference,
          registry_version: LOCALE_REGISTRY.registryVersion,
        },
        result,
      });
    }

    if (action === "resolve_approval") {
      const id = String(body.approval_id || "");
      const decision = String(body.decision || "approve");
      if (!["approve", "reject"].includes(decision))
        return Response.json(
          { ok: false, error: "decision_must_be_approve_or_reject" },
          { status: 400 },
        );
      const approval = await svc.entities.Approval.get(id);
      if (!approval)
        return Response.json(
          { ok: false, error: "approval_not_found" },
          { status: 404 },
        );
      const rule = APPROVAL_RESOLUTION_REGISTRY[String(approval.action_type)];
      if (!rule)
        return Response.json(
          {
            ok: false,
            error: "unsupported_approval_action_type",
            action_type: approval.action_type,
          },
          { status: 409 },
        );
      const task = approval.agent_task_id
        ? await svc.entities.AgentTask.get(approval.agent_task_id)
        : null;
      const risk = safeNumber(approval.risk_level);
      const material = risk >= 3;
      const reason = decision === "reject" ? String(body.reason || "") : "";
      const confirmationNonce = confirmed
        ? String(body.confirmation_nonce || "")
        : crypto.randomUUID();
      if (confirmed && !confirmationNonce)
        return Response.json(
          { ok: false, error: "approval_confirmation_nonce_required" },
          { status: 409 },
        );
      const confirmationNonceHash = await sha256(confirmationNonce);
      if (risk !== Number(rule.expectedRisk))
        return Response.json(
          { ok: false, error: "approval_registry_risk_mismatch" },
          { status: 409 },
        );

      if (
        confirmed &&
        ["approved", "rejected", "expired"].includes(String(approval.status))
      ) {
        if (
          !sameText(approval.resolution_command_key, commandKey) ||
          String(approval.resolution_actor_email || "").toLowerCase() !==
            String(user.email || "").toLowerCase() ||
          !sameText(approval.resolution_decision, decision) ||
          !sameText(approval.resolution_nonce_hash, confirmationNonceHash)
        )
          return Response.json(
            { ok: false, error: "approval_already_resolved_by_other_command" },
            { status: 409 },
          );
        const replayPreview = await storedPreview(
          svc,
          commandKey,
          action,
          user.email,
        );
        if (
          rule.mode === "external_executor" &&
          approval.status === "approved" &&
          DURABLE_EXTERNAL_EXECUTORS.has(rule.resolver) &&
          task &&
          ["waiting_approval", "running"].includes(String(task.status || ""))
        ) {
          const replayBinding = validateRegisteredTaskBinding(
            approval,
            task,
            rule,
            ["waiting_approval", "running"],
          );
          if (!replayBinding.ok)
            return Response.json(replayBinding, { status: 409 });
          const response = await base44.functions.invoke(rule.resolver, {
            mode: "execute",
            approval_id: approval.id,
            execution_command_key: commandKey,
          });
          const resumed = response?.data || response;
          if (resumed?.ok === false) {
            if (
              resumed.execution_state === "in_progress" ||
              resumed.error === "external_execution_claim_in_progress"
            ) return Response.json({
              ...resumed,
              idempotent_replay: true,
              authorization_recorded: true,
            }, { status: 409 });
            return persistApprovedButExecutionFailed(svc, user, body, {
              commandKey,
              approval,
              decision,
              risk,
              material,
              preview: replayPreview?.preview_json || {
                authority_hash: approval.resolution_authority_hash,
              },
              resolver: rule.resolver,
              error: String(resumed.error || `${rule.resolver}_execute_failed`),
              reviewRequired:
                resumed.review_required === true ||
                resumed.execution_state === "review_required",
            });
          }
          if (!String(resumed?.execution_receipt_ref || ""))
            return persistApprovedButExecutionFailed(svc, user, body, {
              commandKey,
              approval,
              decision,
              risk,
              material,
              preview: replayPreview?.preview_json || {},
              resolver: rule.resolver,
              error: "approved_execution_receipt_missing",
              reviewRequired: true,
            });
          await persistExecutorEvidence(svc, user, {
            commandKey,
            approval,
            resolver: rule.resolver,
            status: "EXECUTED",
            result: resumed,
          });
          return persistExecution(svc, user, body, {
            command_key: commandKey,
            action,
            intent: "approval_execution_recovery",
            scope: { approval_id: id, decision, terminal_replay: true },
            risk,
            material,
            preview: replayPreview?.preview_json || {
              authority_hash: approval.resolution_authority_hash,
            },
            result: {
              ok: true,
              idempotent_replay: true,
              approval_status: "approved",
              authorization_recorded: true,
              execution_status: "EXECUTED",
              resolver: rule.resolver,
              executor_result: resumed,
            },
          });
        }
        const executionStatus = rule.mode === "external_executor"
          ? deriveApprovalLifecycle(approval, task).execution_status
          : "NOT_STARTED";
        if (
          rule.mode === "external_executor" &&
          approval.status === "approved" &&
          executionStatus !== "EXECUTED"
        ) {
          const failedAudit = (
            await svc.entities.FounderCommandAudit.filter(
              {
                command_key: commandKey,
                actor_email: user.email,
                status: "failed",
              },
              "-created_at",
              5,
            ).catch((auditReadError:any)=>safeBestEffort(auditReadError,{operation:'founderOSCommand.failed_execution_audit_read',fallback:[],severity:'critical'}))
          )[0] || null;
          const replayResult = failedAudit?.result_json || {
            ok: false,
            error: executionStatus === "FAILED_RETRYABLE" ||
                executionStatus === "FAILED_TERMINAL"
              ? "approved_but_executor_failed"
              : executionStatus === "REVIEW_REQUIRED"
                ? "approved_execution_review_required"
              : "approved_execution_not_observed",
            approval_status: "approved",
            authorization_recorded: true,
            execution_status: executionStatus,
            retry_requires_new_approval: false,
            review_required: executionStatus === "REVIEW_REQUIRED",
            retry_execution_via_canonical_agent:
              executionStatus !== "REVIEW_REQUIRED",
          };
          return Response.json(
            {
              ...replayResult,
              idempotent_replay: true,
              audit_id: failedAudit?.id || null,
            },
            {
              status: ["FAILED_RETRYABLE", "FAILED_TERMINAL"].includes(
                  executionStatus,
                )
                ? 502
                : 409,
            },
          );
        }
        return persistExecution(svc, user, body, {
          command_key: commandKey,
          action,
          intent: "approval",
          scope: { approval_id: id, decision, terminal_replay: true },
          risk,
          material,
          preview: replayPreview?.preview_json || {
            authority_hash: approval.resolution_authority_hash,
          },
          result: {
            ok: true,
            idempotent_replay: true,
            approval_status: approval.status,
            authorization_recorded: true,
            execution_status: executionStatus,
            executor_result:
              rule.mode === "external_executor"
                ? task?.execution_result_json || task?.output_payload_json || null
                : null,
          },
        });
      }

      if (
        confirmed &&
        approval.status === "resolving" &&
        sameText(approval.resolution_command_key, commandKey) &&
        rule.mode === "commercial"
      ) {
        if (
          String(approval.resolution_actor_email || "").toLowerCase() !==
            String(user.email || "").toLowerCase() ||
          !sameText(approval.resolution_nonce_hash, confirmationNonceHash)
        )
          return Response.json(
            { ok: false, error: "approval_resolution_actor_mismatch" },
            { status: 409 },
          );
        const resumeResponse = await base44.functions.invoke(
          "resolveCommercialApproval",
          {
            approval_id: approval.id,
            decision: approval.resolution_decision,
            reason: approval.resolution_reason || "",
            resolution_command_key: commandKey,
            expected_authority_hash: approval.resolution_authority_hash,
            resume: true,
          },
        );
        const resumeResult = resumeResponse?.data || resumeResponse;
        if (resumeResult?.ok === false)
          return Response.json(resumeResult, {
            status: resumeResult?.in_progress ||
                resumeResult?.retry_requires_new_preview === true
              ? 409
              : 500,
          });
        const terminal = await svc.entities.Approval.get(approval.id);
        if (
          !["approved", "rejected", "expired"].includes(String(terminal.status))
        )
          return Response.json(
            {
              ok: false,
              error: "approval_resolution_in_progress",
              status: terminal.status,
              phase: terminal.resolution_phase,
            },
            { status: 409 },
          );
        const resumePreview = await storedPreview(
          svc,
          commandKey,
          action,
          user.email,
        );
        return persistExecution(svc, user, body, {
          command_key: commandKey,
          action,
          intent: "approval",
          scope: {
            approval_id: id,
            decision: approval.resolution_decision,
            resumed: true,
          },
          risk,
          material,
          preview: resumePreview?.preview_json || {
            authority_hash: approval.resolution_authority_hash,
          },
          result: { ...resumeResult, resumed: true },
        });
      }

      if (!task)
        return Response.json(
          { ok: false, error: "approval_agent_task_missing" },
          { status: 409 },
        );
      if (rule.mode !== "commercial") {
        const binding = rule.mode === "developer_authorization"
          ? await validateDeveloperAuthorizationBinding(svc, approval, task, rule)
          : validateRegisteredTaskBinding(approval, task, rule);
        if (!binding.ok)
          return Response.json(
            { ok: false, error: (binding as any).error },
            { status: 409 },
          );
      }

      const isNonCommercialResume = confirmed &&
        approval.status === "resolving" &&
        rule.mode !== "commercial";
      if (
        isNonCommercialResume &&
        !sameText(approval.resolution_command_key, commandKey)
      )
        return Response.json(
          { ok: false, error: "approval_resolution_owned_by_other_command" },
          { status: 409 },
        );
      if (isNonCommercialResume) {
        if (
          String(approval.resolution_actor_email || "").toLowerCase() !==
            String(user.email || "").toLowerCase() ||
          !sameText(approval.resolution_decision, decision) ||
          !sameText(approval.resolution_reason || "", reason) ||
          !sameText(approval.resolution_nonce_hash, confirmationNonceHash)
        )
          return Response.json(
            { ok: false, error: "approval_resolution_authority_mismatch" },
            { status: 409 },
          );
        if (
          approval.resolution_effects_started === true ||
          !sameText(approval.resolution_phase, "claimed")
        )
          return Response.json(
            {
              ok: false,
              error: "approval_resolution_requires_manual_reconciliation",
              status: approval.status,
              phase: approval.resolution_phase,
            },
            { status: 409 },
          );
      } else if (approval.status !== "pending") {
        return Response.json(
          { ok: false, error: "approval_not_pending", status: approval.status },
          { status: 409 },
        );
      }
      const authoritySnapshot = await buildApprovalAuthoritySnapshot(
        svc,
        approval,
        task,
        user.email,
      );
      const authorityHash = await sha256(authoritySnapshot);
      const contentHash = await sha256({
        approval: await approvalImmutableContentHash(approval, user.email),
        decision,
        reason,
      });
      let confirmationBinding: any;
      try {
        confirmationBinding = await approvalConfirmationBinding(svc, {
          approval,
          task,
          actorEmail: user.email,
          decision,
          reason,
          nonceHash: confirmationNonceHash,
          authoritySnapshot,
          authorityHash,
        });
      } catch (bindingError) {
        return Response.json(
          {
            ok: false,
            error: String(
              (bindingError as Error)?.message ||
                "approval_confirmation_binding_unavailable",
            ),
          },
          { status: Number((bindingError as any)?.status || 409) },
        );
      }
      const stateFingerprint = await sha256({
        id: approval.id,
        approval_revision: Number(approval.approval_revision || 0),
        status: approval.status,
        action_type: approval.action_type,
        risk_level: risk,
        agent_task_id: approval.agent_task_id || null,
        task_status: task.status || null,
        expires_at: approval.expires_at || null,
        related_entity_type: approval.related_entity_type || null,
        related_entity_id: approval.related_entity_id || null,
        decision,
        reason,
        authority_snapshot: authoritySnapshot,
        confirmation_binding: confirmationBinding,
      });
      let rawPreview: any = {
        action: "resolve_approval",
        decision,
        reason,
        approval_id: approval.id,
        action_type: approval.action_type,
        risk_level: risk,
        material,
        related_entity_type: approval.related_entity_type,
        related_entity_id: approval.related_entity_id,
        expires_at: approval.expires_at,
        summary: String(approval.draft_content || "").slice(0, 1500),
        financial_impact:
          approval.draft_payload_json?.estimated_financial_impact ??
          approval.draft_payload_json?.expected_provider_revenue_12m_minor ??
          null,
        reversible: material
          ? "partially_or_not_reversible"
          : "generally_reversible",
        resolution_mode: rule.mode,
        resolver: rule.resolver,
        blocked_reason: rule.mode === "blocked" ? rule.resolver : null,
        authority_snapshot: authoritySnapshot,
        authority_hash: authorityHash,
        content_hash: contentHash,
        confirmation_binding: confirmationBinding,
        confirmation_binding_hash: confirmationBinding.binding_hash,
        confirmation_nonce_hash: confirmationNonceHash,
        state_fingerprint: stateFingerprint,
      };
      if (!confirmed) {
        const previewAuthorityHash = await sha256(rawPreview);
        let previewAuthority: any;
        try {
          previewAuthority = await installApprovalConfirmationPreview(
            svc,
            approval,
            {
              commandKey,
              actorEmail: user.email,
              nonceHash: confirmationNonceHash,
              previewHash: previewAuthorityHash,
            },
          );
        } catch (previewInstallError) {
          return Response.json(
            {
              ok: false,
              error: String(
                (previewInstallError as Error)?.message ||
                  "approval_confirmation_preview_install_failed",
              ),
              retry_requires_new_preview: true,
            },
            { status: Number((previewInstallError as any)?.status || 409) },
          );
        }
        const installedStateFingerprint = await sha256({
          id: previewAuthority.id,
          approval_revision: Number(previewAuthority.approval_revision || 0),
          status: previewAuthority.status,
          action_type: previewAuthority.action_type,
          risk_level: risk,
          agent_task_id: previewAuthority.agent_task_id || null,
          task_status: task.status || null,
          expires_at: previewAuthority.expires_at || null,
          related_entity_type: previewAuthority.related_entity_type || null,
          related_entity_id: previewAuthority.related_entity_id || null,
          decision,
          reason,
          authority_snapshot: authoritySnapshot,
          confirmation_binding: confirmationBinding,
        });
        rawPreview = {
          ...rawPreview,
          state_fingerprint: installedStateFingerprint,
          confirmation_preview_generation: Number(
            previewAuthority.confirmation_preview_generation,
          ),
          confirmation_preview_authority_hash: previewAuthorityHash,
        };
        return persistPreview(svc, user, body, {
          command_key: commandKey,
          action,
          intent: "approval",
          scope: { approval_id: id, decision },
          risk,
          material,
          preview: rawPreview,
          confirmation_nonce: confirmationNonce,
        });
      }

      const stored = await storedPreview(svc, commandKey, action, user.email);
      if (!stored)
        return Response.json(
          { ok: false, error: "fresh_approval_preview_required" },
          { status: 409 },
        );
      if (!isNonCommercialResume) {
        try {
          assertFreshApprovalConfirmationNonce(
            approval,
            confirmationNonceHash,
            Number(stored.preview_json?.confirmation_preview_generation),
          );
          if (
            !sameText(approval.confirmation_preview_command_key, commandKey) ||
            !sameText(approval.confirmation_preview_actor_email, user.email) ||
            !sameText(
              approval.confirmation_preview_hash,
              stored.preview_json?.confirmation_preview_authority_hash,
            )
          ) throw new Error("approval_confirmation_preview_authority_mismatch");
        } catch (nonceError) {
          return Response.json(
            {
              ok: false,
              error: String(
                (nonceError as Error)?.message ||
                  "approval_confirmation_nonce_already_consumed",
              ),
              retry_requires_new_preview:
                (nonceError as any)?.retry_requires_new_preview !== false,
            },
            { status: Number((nonceError as any)?.status || 409) },
          );
        }
      }
      if (isNonCommercialResume) {
        if (
          !sameText(approval.resolution_authority_hash, authorityHash) ||
          !sameText(approval.resolution_content_hash, contentHash) ||
          !sameText(
            approval.resolution_binding_hash,
            confirmationBinding.binding_hash,
          ) ||
          !sameText(approval.resolution_nonce_hash, confirmationNonceHash) ||
          !sameText(stored.preview_json?.authority_hash, authorityHash) ||
          !sameText(stored.preview_json?.content_hash, contentHash) ||
          !sameText(
            stored.preview_json?.confirmation_binding_hash,
            confirmationBinding.binding_hash,
          )
        )
          return Response.json(
            { ok: false, error: "approval_resolution_resume_snapshot_mismatch" },
            { status: 409 },
          );
      } else {
        if (
          !sameText(
            stored.preview_json?.confirmation_nonce_hash,
            confirmationNonceHash,
          )
        )
          return Response.json(
            { ok: false, error: "approval_confirmation_nonce_mismatch" },
            { status: 409 },
          );
        if (previewExpired(stored.preview_json))
          return Response.json(
            { ok: false, error: "approval_preview_expired" },
            { status: 409 },
          );
        const currentPreview = {
          ...rawPreview,
          confirmation_preview_generation: Number(
            approval.confirmation_preview_generation,
          ),
          confirmation_preview_authority_hash:
            approval.confirmation_preview_hash,
        };
        const currentHash = await sha256(currentPreview);
        if (
          stored.preview_json?.preview_hash !== currentHash ||
          stored.preview_json?.state_fingerprint !== stateFingerprint ||
          !sameText(
            stored.preview_json?.confirmation_binding_hash,
            confirmationBinding.binding_hash,
          )
        )
          return Response.json(
            {
              ok: false,
              error: "approval_preview_stale",
              current_preview: { ...currentPreview, preview_hash: currentHash },
            },
            { status: 409 },
          );
        if (approval.expires_at && Date.parse(approval.expires_at) <= Date.now())
          return Response.json(
            { ok: false, error: "approval_expired" },
            { status: 409 },
          );
      }
      if (rule.mode === "blocked" && decision === "approve") {
        const blockedResult = {
          ok: false,
          error: "approval_action_blocked",
          action_type: approval.action_type,
          blocker: rule.resolver,
          approval_status: "pending",
          execution: false,
        };
        const blockedAudit = await svc.entities.FounderCommandAudit.create({
          command_key: commandKey,
          conversation_id: body.conversation_id || "",
          actor_email: user.email,
          intent: "approval",
          action,
          scope_json: { approval_id: id, decision },
          risk_level: risk,
          material,
          requires_confirmation: true,
          confirmed: true,
          preview_json: stored.preview_json,
          status: "blocked",
          result_json: blockedResult,
          policy_json: { founder_os_version: FOUNDER_OS_VERSION },
          created_at: now(),
        });
        return Response.json(
          { ...blockedResult, audit_id: blockedAudit.id },
          { status: 409 },
        );
      }

      let workingRevision = Number(approval.approval_revision || 0);
      let workingPhaseRevision = Number(approval.resolution_phase_revision || 0);
      if (!isNonCommercialResume) {
        const claimFilter: any = { id: approval.id, status: "pending" };
        if (approval.approval_revision != null)
          claimFilter.approval_revision = workingRevision;
        claimFilter.confirmation_preview_generation = Number(
          stored.preview_json?.confirmation_preview_generation,
        );
        claimFilter.confirmation_preview_command_key = commandKey;
        claimFilter.confirmation_preview_actor_email = user.email;
        claimFilter.confirmation_nonce_hash = confirmationNonceHash;
        if (approval.updated_date)
          claimFilter.updated_date = approval.updated_date;
        const nonceUsedAt = now();
        const claimed = await svc.entities.Approval.updateMany(claimFilter, {
          $set: {
            status: "resolving",
            resolution_command_key: commandKey,
            resolution_authority_hash: authorityHash,
            resolution_content_hash: contentHash,
            resolution_preview_hash: stored.preview_json?.preview_hash || "",
            resolution_preview_generation: Number(
              stored.preview_json?.confirmation_preview_generation,
            ),
            resolution_binding_hash: confirmationBinding.binding_hash,
            resolution_binding_json: confirmationBinding,
            resolution_policy_key: confirmationBinding.policy.key,
            resolution_policy_version: confirmationBinding.policy.version,
            resolution_authority_snapshot_id:
              confirmationBinding.authority_snapshot.id,
            resolution_intelligence_snapshot_id:
              confirmationBinding.intelligence_snapshot.id,
            resolution_intelligence_snapshot_hash:
              confirmationBinding.intelligence_snapshot.hash,
            resolution_economic_terms_hash:
              confirmationBinding.economic_terms_hash,
            resolution_legal_terms_hash: confirmationBinding.legal_terms_hash,
            resolution_market_scope_version:
              confirmationBinding.market_scope_version,
            resolution_emergency_control_id:
              confirmationBinding.emergency_control.id,
            resolution_emergency_control_revision:
              confirmationBinding.emergency_control.revision,
            resolution_nonce_hash: confirmationNonceHash,
            resolution_nonce_used_at: nonceUsedAt,
            resolution_actor_email: user.email,
            resolution_decision: decision,
            resolution_reason: reason,
            resolution_phase: "claimed",
            resolution_phase_revision: 0,
            resolution_attempt_token: "",
            resolution_effects_started: false,
            resolution_lease_expires_at: "",
            resolution_started_at: now(),
            approval_revision: workingRevision + 1,
          },
        });
        if (!updatedExactlyOne(claimed)) {
          const concurrent = await svc.entities.Approval.get(approval.id).catch(
            (readError:any) => safeBestEffort(readError,{operation:'founderOSCommand.concurrent_resolution_read',fallback:null,severity:'critical'}),
          );
          return Response.json(
            {
              ok: false,
              error: concurrent?.resolution_command_key === commandKey
                ? "approval_resolution_in_progress"
                : "approval_resolution_race_lost",
              status: concurrent?.status || "unknown",
            },
            { status: 409 },
          );
        }
        const claimObserved = await svc.entities.Approval.get(approval.id);
        if (
          !claimObserved ||
          claimObserved.status !== "resolving" ||
          !sameText(claimObserved.resolution_command_key, commandKey) ||
          !sameText(claimObserved.resolution_authority_hash, authorityHash) ||
          !sameText(claimObserved.resolution_content_hash, contentHash) ||
          !sameText(
            claimObserved.resolution_binding_hash,
            confirmationBinding.binding_hash,
          ) ||
          !sameText(
            claimObserved.resolution_binding_json?.binding_hash,
            confirmationBinding.binding_hash,
          ) ||
          !sameText(
            claimObserved.resolution_preview_hash,
            stored.preview_json?.preview_hash,
          ) ||
          Number(claimObserved.resolution_preview_generation) !== Number(
            stored.preview_json?.confirmation_preview_generation,
          ) ||
          !sameText(
            claimObserved.resolution_policy_key,
            confirmationBinding.policy.key,
          ) ||
          !sameText(
            claimObserved.resolution_policy_version,
            confirmationBinding.policy.version,
          ) ||
          !sameText(
            claimObserved.resolution_authority_snapshot_id,
            confirmationBinding.authority_snapshot.id,
          ) ||
          !sameText(
            claimObserved.resolution_intelligence_snapshot_id,
            confirmationBinding.intelligence_snapshot.id,
          ) ||
          !sameText(
            claimObserved.resolution_intelligence_snapshot_hash,
            confirmationBinding.intelligence_snapshot.hash,
          ) ||
          !sameText(
            claimObserved.resolution_economic_terms_hash,
            confirmationBinding.economic_terms_hash,
          ) ||
          !sameText(
            claimObserved.resolution_legal_terms_hash,
            confirmationBinding.legal_terms_hash,
          ) ||
          !sameText(
            claimObserved.resolution_market_scope_version,
            confirmationBinding.market_scope_version,
          ) ||
          !sameText(
            claimObserved.resolution_emergency_control_id,
            confirmationBinding.emergency_control.id,
          ) ||
          Number(claimObserved.resolution_emergency_control_revision) !==
            Number(confirmationBinding.emergency_control.revision) ||
          !sameText(claimObserved.resolution_nonce_hash, confirmationNonceHash) ||
          !sameText(claimObserved.resolution_nonce_used_at, nonceUsedAt) ||
          !sameText(claimObserved.resolution_actor_email, user.email) ||
          !sameText(claimObserved.resolution_decision, decision) ||
          claimObserved.resolution_phase !== "claimed" ||
          Number(claimObserved.resolution_phase_revision) !== 0 ||
          claimObserved.resolution_effects_started !== false ||
          Number(claimObserved.approval_revision) !== workingRevision + 1
        )
          return Response.json(
            { ok: false, error: "approval_resolution_claim_readback_mismatch" },
            { status: 409 },
          );
        workingRevision += 1;
        workingPhaseRevision = 0;
      }

      const finalizeAuthorization = async (
        terminalStatus: "approved" | "rejected",
      ) => {
        const expiresAt = Date.parse(String(approval.expires_at || ""));
        if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
          throw new Error("approval_expired_before_decision_commit");
        const completedAt = now();
        const changed = await svc.entities.Approval.updateMany(
          {
            id: approval.id,
            status: "resolving",
            resolution_command_key: commandKey,
            resolution_authority_hash: authorityHash,
            resolution_content_hash: contentHash,
            resolution_binding_hash: confirmationBinding.binding_hash,
            resolution_nonce_hash: confirmationNonceHash,
            resolution_actor_email: user.email,
            resolution_decision: decision,
            resolution_phase: "claimed",
            resolution_phase_revision: workingPhaseRevision,
            resolution_effects_started: false,
            approval_revision: workingRevision,
          },
          {
            $set: {
              status: terminalStatus,
              decision_status:
                terminalStatus === "approved" ? "APPROVED" : "REJECTED",
              decision_status_recorded_at: completedAt,
              execution_status: "NOT_STARTED",
              execution_status_recorded_at: completedAt,
              execution_receipt_ref: "",
              approved_by: user.email,
              approved_at: completedAt,
              rejected_reason: terminalStatus === "rejected" ? reason : "",
              approval_revision: workingRevision + 1,
              resolution_phase: "finalized",
              resolution_phase_revision: workingPhaseRevision + 1,
              resolution_attempt_token: "",
              resolution_effects_started: false,
              resolution_lease_expires_at: "",
              resolution_completed_at: completedAt,
            },
          },
        );
        if (!updatedExactlyOne(changed)) return false;
        const observed = await svc.entities.Approval.get(approval.id);
        if (
          !observed ||
          observed.status !== terminalStatus ||
          observed.decision_status !==
            (terminalStatus === "approved" ? "APPROVED" : "REJECTED") ||
          observed.execution_status !== "NOT_STARTED" ||
          String(observed.execution_receipt_ref || "") !== "" ||
          Number(observed.approval_revision) !== workingRevision + 1 ||
          observed.resolution_phase !== "finalized" ||
          Number(observed.resolution_phase_revision) !==
            workingPhaseRevision + 1 ||
          !sameText(observed.resolution_command_key, commandKey) ||
          !sameText(
            observed.resolution_binding_hash,
            confirmationBinding.binding_hash,
          ) ||
          !sameText(observed.resolution_nonce_hash, confirmationNonceHash)
        )
          throw new Error(
            "approval_authorization_finalization_readback_mismatch",
          );
        return true;
      };

      let result: any;
      try {
        if (rule.mode === "commercial") {
          const response = await base44.functions.invoke(
            "resolveCommercialApproval",
            {
              approval_id: approval.id,
              decision,
              reason,
              resolution_command_key: commandKey,
              expected_authority_hash: authorityHash,
            },
          );
          result = response?.data || response;
          if (result?.ok === false && result?.in_progress)
            return Response.json(result, { status: 409 });
          if (result?.ok === false && result?.retry_requires_new_preview === true)
            return Response.json(
              { ...result, retry_requires_new_preview: true },
              { status: Number(result?.status || 409) },
            );
          if (result?.ok === false)
            throw new Error(result.error || "commercial_approval_failed");
        } else if (decision === "reject") {
          if (!(await finalizeAuthorization("rejected")))
            return Response.json(
              { ok: false, error: "approval_resolution_claim_lost" },
              { status: 409 },
            );
          result = {
            ok: true,
            status: "rejected",
            authorization_recorded: true,
            execution: false,
          };
        } else if (rule.mode === "developer_authorization") {
          if (!(await finalizeAuthorization("approved")))
            return Response.json(
              { ok: false, error: "approval_resolution_claim_lost" },
              { status: 409 },
            );
          result = {
            ok: true,
            status: "approved",
            authorization_recorded: true,
            authorization_only: true,
            execution: false,
            canonical_executor: "developerMigrationEngine",
            next_action: rule.resolver.split(":")[1],
            note:
              "Durable Founder authorization recorded. Developer execution remains separate and revalidates repository, run, CI, branch and approval state.",
          };
        } else if (rule.mode === "external_executor") {
          // Approval is an authorization decision. Make it durable first so a
          // transport failure can never strand the Approval in `resolving`.
          if (!(await finalizeAuthorization("approved")))
            return Response.json(
              { ok: false, error: "approval_resolution_claim_lost" },
              { status: 409 },
            );
          let executorResult: any;
          try {
            const response = await base44.functions.invoke(rule.resolver, {
              mode: "execute",
              approval_id: approval.id,
              execution_command_key: commandKey,
            });
            executorResult = response?.data || response;
            if (executorResult?.ok === false) {
              const executorFailure:any = new Error(
                executorResult.error || `${rule.resolver}_execute_failed`,
              );
              executorFailure.review_required =
                executorResult.review_required === true ||
                executorResult.execution_state === "review_required";
              executorFailure.in_progress =
                executorResult.execution_state === "in_progress";
              throw executorFailure;
            }
            if (!String(executorResult?.execution_receipt_ref || "")) {
              const missingReceipt: any = new Error(
                "approved_execution_receipt_missing",
              );
              missingReceipt.review_required = true;
              throw missingReceipt;
            }
          } catch (executorError) {
            return persistApprovedButExecutionFailed(svc, user, body, {
              commandKey,
              approval,
              decision,
              risk,
              material,
              preview: stored.preview_json,
              resolver: rule.resolver,
              error: String(
                (executorError as Error)?.message || executorError,
              ),
              reviewRequired:
                (executorError as any)?.review_required === true,
            });
          }
          await persistExecutorEvidence(svc, user, {
            commandKey,
            approval,
            resolver: rule.resolver,
            status: "EXECUTED",
            result: executorResult,
          });
          result = {
            ok: true,
            status: "approved",
            authorization_recorded: true,
            execution_status: "EXECUTED",
            resolver: rule.resolver,
            executor_result: executorResult,
          };
        } else {
          throw new Error("blocked_approval_reached_execution");
        }
      } catch (resolutionError) {
        const observed = await svc.entities.Approval.get(approval.id).catch(
          (readError:any) => safeBestEffort(readError,{operation:'founderOSCommand.failed_resolution_state_read',fallback:null,severity:'critical'}),
        );
        const failedAt = now();
        const retryableSameCommand = observed?.status === "resolving" &&
          observed?.resolution_effects_started !== true &&
          sameText(observed?.resolution_command_key, commandKey);
        await svc.entities.FounderCommandAudit.create({
          command_key: commandKey,
          conversation_id: body.conversation_id || "",
          actor_email: user.email,
          intent: "approval",
          action,
          scope_json: { approval_id: id, decision },
          risk_level: risk,
          material,
          requires_confirmation: true,
          confirmed: true,
          preview_json: stored.preview_json,
          status: "failed",
          result_json: {
            error: "approval_resolution_failed",
            approval_status: observed?.status || "unknown",
            retry_same_command: retryableSameCommand,
            retry_requires_new_preview: false,
          },
          policy_json: { founder_os_version: FOUNDER_OS_VERSION },
          created_at: failedAt,
        }).catch((auditError:any)=>safeBestEffort(auditError,{operation:'founderOSCommand.record_resolution_failure_audit',fallback:null,severity:'critical'}));
        await svc.entities.OperationalLog.create({
          event_type: "founder_approval_resolution_failed",
          message: String(approval.action_type || "approval"),
          data_json: {
            command_key: commandKey,
            approval_id: id,
            decision,
            approval_status: observed?.status || "unknown",
            retry_same_command: retryableSameCommand,
            error: clean(
              (resolutionError as Error)?.message || resolutionError,
              240,
            ),
          },
          actor_email: user.email,
          created_at: failedAt,
        }).catch((logError:any)=>safeBestEffort(logError,{operation:'founderOSCommand.record_resolution_failure_log',fallback:null,severity:'critical'}));
        return Response.json(
          {
            ok: false,
            error: "approval_resolution_failed",
            approval_status: observed?.status || "unknown",
            retry_same_command: retryableSameCommand,
            retry_requires_new_preview: false,
          },
          { status: 500 },
        );
      }
      return persistExecution(svc, user, body, {
        command_key: commandKey,
        action,
        intent: "approval",
        scope: { approval_id: id, decision, reason },
        risk,
        material,
        preview: stored.preview_json,
        result,
      });
    }

    if (action === "run_provider_revenue_recovery") {
      const providerId = String(body.provider_id || "");
      const rawPreview = {
        action,
        provider_id: providerId || null,
        impact:
          "Contacts provider only through the existing policy-gated recovery agent; no settlement or contract acceptance.",
        reversible: true,
        state_fingerprint: await sha256({ provider_id: providerId }),
      };
      if (!confirmed)
        return persistPreview(svc, user, body, {
          command_key: commandKey,
          action,
          intent: "provider_revenue_recovery",
          scope: { provider_id: providerId },
          risk: 3,
          material: false,
          preview: rawPreview,
        });
      const stored = await storedPreview(svc, commandKey, action, user.email);
      if (
        !stored ||
        previewExpired(stored.preview_json) ||
        stored.preview_json?.preview_hash !== (await sha256(rawPreview))
      )
        return Response.json(
          { ok: false, error: "fresh_matching_preview_required" },
          { status: 409 },
        );
      const response = await base44.functions.invoke(
        "providerRevenueRecoveryAgent",
        { provider_id: providerId || undefined },
      );
      const result = response?.data || response;
      return persistExecution(svc, user, body, {
        command_key: commandKey,
        action,
        intent: "provider_revenue_recovery",
        scope: { provider_id: providerId },
        risk: 3,
        material: false,
        preview: stored.preview_json,
        result,
      });
    }

    if (action === "run_system_health" || action === "investigate_developer") {
      const fn =
        action === "run_system_health"
          ? "getMaintenanceCenter"
          : "developerSignalWorker";
      const response = await base44.functions.invoke(
        fn,
        action === "investigate_developer"
          ? { incident_id: body.incident_id || undefined }
          : {},
      );
      const inspected = inspectCommandFunctionResponse(response, action === "run_system_health" ? "system_health_check" : "investigate_developer");
      if (!inspected.ok) {
        return Response.json({ ok: false, error: inspected.error || "governed_command_failed" }, { status: 502 });
      }
      const result = inspected.data;
      return persistExecution(svc, user, body, {
        command_key: commandKey || newKey(),
        action,
        risk: 1,
        material: false,
        requires_confirmation: false,
        preview: { action, material: false, reversible: true },
        result,
      });
    }

    if (action === "save_strategy_directive") {
      const directive = String(body.directive || "").trim(),
        scope = String(body.scope || "company");
      if (!directive)
        return Response.json(
          { ok: false, error: "directive_required" },
          { status: 400 },
        );
      const rawPreview = {
        action,
        scope,
        directive,
        warning:
          "Strategic context only. This does not override domain authority, billing, security or contract policies.",
        state_fingerprint: await sha256({ scope, directive }),
      };
      if (!confirmed)
        return persistPreview(svc, user, body, {
          command_key: commandKey,
          action,
          intent: "strategy",
          scope: { scope },
          risk: 2,
          material: false,
          preview: rawPreview,
        });
      const stored = await storedPreview(svc, commandKey, action, user.email);
      if (
        !stored ||
        previewExpired(stored.preview_json) ||
        stored.preview_json?.preview_hash !== (await sha256(rawPreview))
      )
        return Response.json(
          { ok: false, error: "fresh_matching_preview_required" },
          { status: 409 },
        );
      const row = await svc.entities.StrategyDirective.create({
        directive_key: `strategy:${scope}:${Date.now()}`,
        scope,
        directive,
        status: "active",
        priority: safeNumber(body.priority) || 50,
        effective_from: now(),
        evidence_json: {
          source: "founder_os",
          conversation_id: body.conversation_id || null,
        },
        created_by: user.email,
        created_at: now(),
        updated_at: now(),
      });
      return persistExecution(svc, user, body, {
        command_key: commandKey,
        action,
        intent: "strategy",
        scope: { scope },
        risk: 2,
        material: false,
        preview: stored.preview_json,
        result: { ok: true, directive_id: row.id },
      });
    }

    return Response.json(
      {
        ok: false,
        error: "unsupported_action",
        actions: [
          "resolve_approval",
          "run_provider_revenue_recovery",
          "run_system_health",
          "investigate_developer",
          "save_strategy_directive",
          "save_admin_locale_preference",
        ],
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("founderOSCommand failed", error);
    return internalErrorResponse(error, "founderOSCommand");
  }
});
