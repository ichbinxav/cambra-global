import { describe, expect, it } from "vitest";
import {
  acquireDeveloperLifecycle,
  assertDeveloperMigrationsAllowed,
  completeDeveloperLifecycle,
  developerApprovalContentHash,
  developerLifecycleIdempotencyKey,
  developerWorkspaceBindingHash,
  finishDeveloperLifecycleStep,
  markDeveloperLifecycleReviewRequired,
  startDeveloperLifecycleStep,
  validateDeveloperExecutionAuthority,
  validateDeveloperLifecycleHistory,
  validateDeveloperLifecycleReceiptChain,
} from "../../base44/shared/developerMigrationLifecycle.ts";
import { buildApprovalAuthoritySnapshot } from "../../base44/shared/approvalAuthority.ts";
import { sha256 } from "../../base44/shared/intelligenceCore.ts";

const copy = (value) => structuredClone(value);

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
}

function lifecycleService(initialRun, emergencyRow = null) {
  let run = copy(initialRun);
  let emergency = emergencyRow ? copy(emergencyRow) : null;
  const updates = [];
  return {
    updates,
    currentRun: () => copy(run),
    setEmergency: (next) => {
      emergency = copy(next);
    },
    entities: {
      DeveloperMigrationRun: {
        get: async () => copy(run),
        updateMany: async (filter, update) => {
          updates.push({ filter: copy(filter), update: copy(update) });
          if (!matches(run, filter)) return { updated: 0 };
          run = { ...run, ...copy(update.$set) };
          return { updated: 1 };
        },
      },
      EmergencyControl: {
        filter: async () => emergency ? [copy(emergency)] : [],
      },
    },
  };
}

const authority = {
  action: "apply_plan",
  approvalId: "approval-1",
  authorityHash: "a".repeat(64),
  bindingHash: "b".repeat(64),
};

function awaitingRun() {
  return {
    id: "run-1",
    status: "awaiting_approval",
    lifecycle_action: "",
    lifecycle_phase: "idle",
    lifecycle_revision: 0,
    lifecycle_attempt_token: "",
    lifecycle_steps: {},
  };
}

describe("Developer material lifecycle fencing", () => {
  it("binds Founder approval to the exact run, workspace, repository and plan hashes", async () => {
    const workspace = {
      id: "workspace-1",
      brand_id: "_platform",
      provider: "github",
      repo_full_name: "ichbinxav/cambra-global",
      default_branch: "main",
      current_provider: "stripe",
      target_provider: "adyen",
    };
    const approvedPlan = {
      summary: "Migrate checkout",
      changes: [{ path: "src/payments.ts", change_type: "modify" }],
      tests: [{ name: "payments", command_or_method: "npm test" }],
    };
    const run = {
      ...awaitingRun(),
      workspace_id: workspace.id,
      brand_id: workspace.brand_id,
      source_provider: "stripe",
      target_provider: "adyen",
      base_branch: "main",
      approval_id: "approval-1",
      migration_plan: {
        ...approvedPlan,
        engine_version: "cambra-developer-v1",
        base_sha: "base-sha",
        base_tree_sha: "tree-sha",
        scan_bytes: 100,
        tree_truncated: false,
      },
    };
    const workspaceHash = await developerWorkspaceBindingHash(workspace);
    const planHash = await sha256(approvedPlan);
    const task = {
      id: "task-1",
      brand_id: "_platform",
      agent_name: "developer_migration",
      task_type: "developer_migration_plan",
      status: "completed",
      requires_approval: true,
      risk_level: 3,
      output_payload_json: {
        run_id: run.id,
        workspace_id: workspace.id,
        repo_full_name: workspace.repo_full_name,
        plan: approvedPlan,
        plan_hash: planHash,
        workspace_binding_hash: workspaceHash,
        binding_version: "developer-material-saga-v2",
      },
    };
    const approval = {
      id: "approval-1",
      brand_id: "_platform",
      agent_task_id: task.id,
      action_type: "developer_apply_patch",
      related_entity_type: "DeveloperMigrationRun",
      related_entity_id: run.id,
      risk_level: 3,
      draft_content: "Apply approved plan",
      draft_payload_json: {
        workspace_id: workspace.id,
        run_id: run.id,
        repo_full_name: workspace.repo_full_name,
        base_branch: "main",
        base_sha: "base-sha",
        approved_plan: approvedPlan,
        plan_hash: planHash,
        workspace_binding_hash: workspaceHash,
        binding_version: "developer-material-saga-v2",
      },
      status: "approved",
      resolution_phase: "finalized",
      resolution_decision: "approve",
      resolution_reason: "",
      resolution_command_key: "founder-command-1",
      resolution_actor_email: "founder@cambra.global",
      resolution_content_hash: "",
      resolution_authority_hash: "",
    };
    const rows = {
      DeveloperMigrationRun: run,
      DeveloperWorkspace: workspace,
      AgentTask: task,
      Approval: approval,
    };
    const svc = {
      entities: Object.fromEntries(
        Object.entries(rows).map(([entity, row]) => [
          entity,
          { get: async () => copy(row) },
        ]),
      ),
    };
    approval.resolution_content_hash = await developerApprovalContentHash(
      approval,
    );
    approval.resolution_authority_hash = await sha256(
      await buildApprovalAuthoritySnapshot(
        svc,
        approval,
        task,
        approval.resolution_actor_email,
      ),
    );
    const valid = await validateDeveloperExecutionAuthority(svc, {
      action: "apply_plan",
      runId: run.id,
      workspaceId: workspace.id,
      approvalId: approval.id,
      phase: "preclaim",
    });
    expect(valid.ok).toBe(true);

    run.migration_plan.changes = [
      { path: "src/unapproved.ts", change_type: "modify" },
    ];
    const drifted = await validateDeveloperExecutionAuthority(svc, {
      action: "apply_plan",
      runId: run.id,
      workspaceId: workspace.id,
      approvalId: approval.id,
      phase: "preclaim",
    });
    expect(drifted).toMatchObject({
      ok: false,
      error: "developer_apply_plan_hash_mismatch",
    });
  });

  it("derives deterministic action-scoped idempotency keys", async () => {
    const input = { ...authority, runId: "run-1" };
    const first = await developerLifecycleIdempotencyKey(input);
    const second = await developerLifecycleIdempotencyKey(input);
    const cutover = await developerLifecycleIdempotencyKey({
      ...input,
      action: "cutover",
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^developer:apply_plan:[a-f0-9]{64}$/);
    expect(cutover).not.toBe(first);
  });

  it("allows exactly one concurrent claimant", async () => {
    const svc = lifecycleService(awaitingRun());
    const idempotencyKey = await developerLifecycleIdempotencyKey({
      ...authority,
      runId: "run-1",
    });
    const input = {
      run: awaitingRun(),
      ...authority,
      idempotencyKey,
      nowMs: Date.parse("2026-08-13T10:00:00.000Z"),
    };
    const [a, b] = await Promise.all([
      acquireDeveloperLifecycle(svc, input),
      acquireDeveloperLifecycle(svc, input),
    ]);
    expect([a.acquired, b.acquired].filter(Boolean)).toHaveLength(1);
    expect([a.in_progress, b.in_progress].filter(Boolean)).toHaveLength(1);
    expect(svc.currentRun()).toMatchObject({
      status: "branching",
      lifecycle_action: "apply_plan",
      lifecycle_phase: "claimed",
      lifecycle_revision: 1,
      lifecycle_idempotency_key: idempotencyKey,
    });
  });

  it("returns terminal replay without executing another mutation", async () => {
    const idempotencyKey = await developerLifecycleIdempotencyKey({
      ...authority,
      runId: "run-1",
    });
    const svc = lifecycleService(awaitingRun());
    const claim = await acquireDeveloperLifecycle(svc, {
      run: awaitingRun(),
      ...authority,
      idempotencyKey,
    });
    const started = await startDeveloperLifecycleStep(
      svc,
      claim.run,
      "create_branch",
    );
    const finished = await finishDeveloperLifecycleStep(
      svc,
      started.run,
      "create_branch",
      { ref: "refs/heads/cambra/migration", sha: "head-1" },
    );
    const completed = await completeDeveloperLifecycle(svc, finished, {
      lifecycle_result: { branch: "cambra/migration" },
    });
    const writesBeforeReplay = svc.updates.length;
    const result = await acquireDeveloperLifecycle(svc, {
      run: completed,
      ...authority,
      idempotencyKey,
    });
    expect(result).toMatchObject({ acquired: false, replay: true });
    expect(svc.updates).toHaveLength(writesBeforeReplay);
    expect(await validateDeveloperLifecycleReceiptChain(completed))
      .toMatchObject({
        ok: true,
        receipt_count: 1,
      });
  });

  it("rejects terminal replay when immutable step evidence was altered", async () => {
    const idempotencyKey = await developerLifecycleIdempotencyKey({
      ...authority,
      runId: "run-1",
    });
    const svc = lifecycleService(awaitingRun());
    const claim = await acquireDeveloperLifecycle(svc, {
      run: awaitingRun(),
      ...authority,
      idempotencyKey,
    });
    const started = await startDeveloperLifecycleStep(
      svc,
      claim.run,
      "create_branch",
    );
    const finished = await finishDeveloperLifecycleStep(
      svc,
      started.run,
      "create_branch",
      { sha: "approved-head" },
    );
    const completed = await completeDeveloperLifecycle(svc, finished, {
      lifecycle_result: { branch: "cambra/migration" },
    });
    const tampered = copy(completed);
    tampered.lifecycle_steps.create_branch.result.sha = "tampered-head";
    const tamperedSvc = lifecycleService(tampered);
    const replay = await acquireDeveloperLifecycle(tamperedSvc, {
      run: tampered,
      ...authority,
      idempotencyKey,
    });
    expect(replay).toMatchObject({
      acquired: false,
      replay: false,
      review_required: true,
    });
    expect(tamperedSvc.currentRun()).toMatchObject({
      status: "review_required",
      lifecycle_review_reason: "terminal_material_receipt_chain_invalid",
    });
  });

  it("fails closed when an external success receipt cannot be read back", async () => {
    const idempotencyKey = await developerLifecycleIdempotencyKey({
      ...authority,
      runId: "run-1",
    });
    const svc = lifecycleService(awaitingRun());
    const claim = await acquireDeveloperLifecycle(svc, {
      run: awaitingRun(),
      ...authority,
      idempotencyKey,
    });
    const started = await startDeveloperLifecycleStep(
      svc,
      claim.run,
      "merge_pull_request",
    );
    const normalUpdate = svc.entities.DeveloperMigrationRun.updateMany;
    svc.entities.DeveloperMigrationRun.updateMany = async (filter, update) => {
      if (
        update?.$set?.lifecycle_steps?.merge_pull_request?.status ===
          "succeeded"
      ) {
        return { updated: 1 };
      }
      return normalUpdate(filter, update);
    };
    await expect(finishDeveloperLifecycleStep(
      svc,
      started.run,
      "merge_pull_request",
      { merged: true, merge_sha: "merge-1" },
    )).rejects.toMatchObject({
      code: "DEVELOPER_LIFECYCLE_TRANSITION_READBACK_MISMATCH",
    });
    expect(svc.currentRun()).toMatchObject({
      lifecycle_phase: "effecting",
      lifecycle_steps: {
        merge_pull_request: { status: "pending" },
      },
    });
  });

  it("never reclaims an expired lease after an external step began", async () => {
    const effecting = {
      ...awaitingRun(),
      status: "branching",
      lifecycle_action: "apply_plan",
      lifecycle_phase: "effecting",
      lifecycle_revision: 3,
      lifecycle_attempt_token: "developer-attempt:old",
      lifecycle_lease_expires_at: "2026-08-13T09:00:00.000Z",
      lifecycle_steps: {
        create_branch: {
          status: "pending",
          started_at: "2026-08-13T08:59:00.000Z",
        },
      },
    };
    const svc = lifecycleService(effecting);
    const result = await acquireDeveloperLifecycle(svc, {
      run: effecting,
      ...authority,
      idempotencyKey: "developer:apply_plan:old",
      nowMs: Date.parse("2026-08-13T10:00:00.000Z"),
    });
    expect(result).toMatchObject({
      acquired: false,
      review_required: true,
    });
    expect(svc.currentRun()).toMatchObject({
      status: "review_required",
      lifecycle_phase: "review_required",
      lifecycle_review_reason:
        "expired_material_effect_lease_requires_reconciliation",
    });
  });

  it("treats a missing active lease as unknown authority", async () => {
    const claimed = {
      ...awaitingRun(),
      status: "branching",
      lifecycle_action: "apply_plan",
      lifecycle_phase: "claimed",
      lifecycle_revision: 1,
      lifecycle_attempt_token: "developer-attempt:old",
      lifecycle_lease_expires_at: "",
      lifecycle_idempotency_key: "developer:apply_plan:old",
    };
    const svc = lifecycleService(claimed);
    const result = await acquireDeveloperLifecycle(svc, {
      run: claimed,
      ...authority,
      idempotencyKey: "developer:apply_plan:old",
      nowMs: Date.parse("2026-08-13T10:00:00.000Z"),
    });
    expect(result).toMatchObject({
      acquired: false,
      review_required: true,
    });
    expect(svc.currentRun()).toMatchObject({
      status: "review_required",
      lifecycle_review_reason: "developer_lifecycle_lease_authority_unknown",
    });
  });

  it("preserves a hash-chained action history across apply, cutover and rollback", async () => {
    const applySvc = lifecycleService(awaitingRun());
    const applyKey = await developerLifecycleIdempotencyKey({
      ...authority,
      runId: "run-1",
    });
    const applyClaim = await acquireDeveloperLifecycle(applySvc, {
      run: awaitingRun(),
      ...authority,
      idempotencyKey: applyKey,
    });
    const applyStarted = await startDeveloperLifecycleStep(
      applySvc,
      applyClaim.run,
      "create_branch",
    );
    const applyFinished = await finishDeveloperLifecycleStep(
      applySvc,
      applyStarted.run,
      "create_branch",
      { sha: "apply-head" },
    );
    const applyCompleted = await completeDeveloperLifecycle(
      applySvc,
      applyFinished,
      { lifecycle_result: { branch: "cambra/migration" } },
    );

    const cutoverInput = {
      action: "cutover",
      approvalId: "approval-cutover",
      authorityHash: "c".repeat(64),
      bindingHash: "d".repeat(64),
      idempotencyKey: await developerLifecycleIdempotencyKey({
        action: "cutover",
        runId: "run-1",
        approvalId: "approval-cutover",
        authorityHash: "c".repeat(64),
        bindingHash: "d".repeat(64),
      }),
    };
    const cutoverReady = {
      ...applyCompleted,
      status: "awaiting_cutover_approval",
    };
    const cutoverSvc = lifecycleService(cutoverReady);
    const cutoverClaim = await acquireDeveloperLifecycle(cutoverSvc, {
      run: cutoverReady,
      ...cutoverInput,
    });
    expect(cutoverClaim.run.lifecycle_result.prior_actions).toHaveLength(1);
    const cutoverStarted = await startDeveloperLifecycleStep(
      cutoverSvc,
      cutoverClaim.run,
      "merge_pull_request",
    );
    const cutoverFinished = await finishDeveloperLifecycleStep(
      cutoverSvc,
      cutoverStarted.run,
      "merge_pull_request",
      { merged: true, merge_sha: "merge-head" },
    );
    const cutoverCompleted = await completeDeveloperLifecycle(
      cutoverSvc,
      cutoverFinished,
      { lifecycle_result: { merge_sha: "merge-head" } },
    );
    expect(await validateDeveloperLifecycleHistory(cutoverCompleted))
      .toMatchObject({ ok: true, action_count: 1 });

    const rollbackInput = {
      action: "rollback",
      approvalId: "approval-rollback",
      authorityHash: "e".repeat(64),
      bindingHash: "f".repeat(64),
      idempotencyKey: await developerLifecycleIdempotencyKey({
        action: "rollback",
        runId: "run-1",
        approvalId: "approval-rollback",
        authorityHash: "e".repeat(64),
        bindingHash: "f".repeat(64),
      }),
    };
    const rollbackReady = { ...cutoverCompleted, status: "failed" };
    const rollbackSvc = lifecycleService(rollbackReady);
    const rollbackClaim = await acquireDeveloperLifecycle(rollbackSvc, {
      run: rollbackReady,
      ...rollbackInput,
    });
    expect(
      rollbackClaim.run.lifecycle_result.prior_actions.map((row) => row.action),
    ).toEqual(["apply_plan", "cutover"]);
    expect(await validateDeveloperLifecycleHistory(rollbackClaim.run))
      .toMatchObject({ ok: true, action_count: 2 });

    const tampered = copy(rollbackClaim.run);
    tampered.lifecycle_result.prior_actions[0].steps.create_branch.result.sha =
      "tampered";
    expect(await validateDeveloperLifecycleHistory(tampered)).toMatchObject({
      ok: false,
      error: "developer_action_history_receipt_invalid",
    });
  });

  it("does not claim REVIEW_REQUIRED persisted when exact readback is absent", async () => {
    const claimed = {
      ...awaitingRun(),
      status: "branching",
      lifecycle_action: "apply_plan",
      lifecycle_phase: "effecting",
      lifecycle_revision: 2,
      lifecycle_attempt_token: "developer-attempt:owner",
    };
    const svc = lifecycleService(claimed);
    svc.entities.DeveloperMigrationRun.updateMany = async () => ({
      success: true,
      updated: 1,
    });
    await expect(markDeveloperLifecycleReviewRequired(
      svc,
      claimed,
      "effect_unknown",
      { step: "merge" },
    )).rejects.toMatchObject({
      code: "DEVELOPER_REVIEW_REQUIRED_PERSISTENCE_AMBIGUOUS",
    });
    expect(svc.currentRun().status).toBe("branching");
  });

  it("CAS-fences a stale step writer", async () => {
    const svc = lifecycleService(awaitingRun());
    const idempotencyKey = await developerLifecycleIdempotencyKey({
      ...authority,
      runId: "run-1",
    });
    const claimed = await acquireDeveloperLifecycle(svc, {
      run: awaitingRun(),
      ...authority,
      idempotencyKey,
    });
    const stale = copy(claimed.run);
    await startDeveloperLifecycleStep(svc, claimed.run, "create_branch");
    await expect(
      startDeveloperLifecycleStep(svc, stale, "create_pull_request"),
    ).rejects.toThrow("developer_lifecycle_claim_lost");
  });

  it("fails closed when an execution-authority dependency cannot be read", async () => {
    const svc = {
      entities: {
        DeveloperMigrationRun: {
          get: async () => {
            throw new Error("migration_store_down");
          },
        },
        DeveloperWorkspace: { get: async () => ({ id: "workspace-1" }) },
        Approval: { get: async () => ({ id: "approval-1" }) },
      },
    };
    await expect(validateDeveloperExecutionAuthority(svc, {
      action: "apply_plan",
      runId: "run-1",
      workspaceId: "workspace-1",
      approvalId: "approval-1",
      phase: "preclaim",
    })).rejects.toMatchObject({
      code: "CRITICAL_EXECUTION_DEPENDENCY_UNAVAILABLE",
      operation: "developer_migration_run_authority_read",
    });
  });

  it("does not report a benign claim conflict when the lifecycle CAS is unavailable", async () => {
    const run = awaitingRun();
    const svc = lifecycleService(run);
    svc.entities.DeveloperMigrationRun.updateMany = async () => {
      throw new Error("migration_cas_down");
    };
    svc.entities.DeveloperMigrationRun.get = async () => {
      throw new Error("migration_readback_down");
    };
    const idempotencyKey = await developerLifecycleIdempotencyKey({
      ...authority,
      runId: run.id,
    });
    await expect(acquireDeveloperLifecycle(svc, {
      run,
      ...authority,
      idempotencyKey,
    })).rejects.toMatchObject({
      code: "CRITICAL_EXECUTION_DEPENDENCY_UNAVAILABLE",
      operation: "developer_lifecycle_claim_readback",
    });
  });
});

describe("Developer EmergencyControl fencing", () => {
  const allowed = {
    id: "emergency-global",
    control_key: "global",
    control_revision: 12,
    safe_mode: false,
    migrations_paused: false,
    resume_check_required: false,
    last_correlation_id: "resume-12",
  };

  it("fails closed when migration execution is paused", async () => {
    const svc = lifecycleService(awaitingRun(), {
      ...allowed,
      control_revision: 13,
      safe_mode: true,
      migrations_paused: true,
      resume_check_required: true,
      last_correlation_id: "stop-13",
    });
    await expect(assertDeveloperMigrationsAllowed(svc)).rejects.toThrow(
      "emergency_control_paused:migrations",
    );
  });

  it("lets a stop committed between the two authority reads win", async () => {
    let reads = 0;
    const svc = {
      entities: {
        EmergencyControl: {
          filter: async () => {
            reads += 1;
            return [copy(
              reads === 1 ? allowed : {
                ...allowed,
                control_revision: 13,
                safe_mode: true,
                migrations_paused: true,
                last_correlation_id: "stop-between-reads-13",
              },
            )];
          },
        },
      },
    };
    await expect(assertDeveloperMigrationsAllowed(svc)).rejects.toThrow(
      "emergency_control_paused:migrations",
    );
    expect(reads).toBe(2);
  });

  it("changes the fence across stop/resume revisions even if flags are allowed again", async () => {
    const svc = lifecycleService(awaitingRun(), allowed);
    const before = await assertDeveloperMigrationsAllowed(svc);
    svc.setEmergency({
      ...allowed,
      control_revision: 14,
      last_correlation_id: "resume-after-stop-14",
    });
    const after = await assertDeveloperMigrationsAllowed(svc);
    expect(before.fence_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(after.fence_hash).not.toBe(before.fence_hash);
    expect(after.control_revision).toBe(14);
  });
});
