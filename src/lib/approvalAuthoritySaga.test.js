import { describe, expect, it } from "vitest";
import {
  acquireResolutionAttempt,
  assertFreshApprovalConfirmationNonce,
  claimApprovalConfirmation,
  finalizeApproval,
  installApprovalConfirmationPreview,
  markResolutionEffectsStarted,
  releaseResolutionClaimIfNoEffects,
  renewResolutionLease,
  updatedExactlyOne,
} from "../../base44/shared/approvalResolutionSaga.ts";
import {
  approvalAuthorityHash,
  approvalImmutableContentHash,
  buildApprovalAuthoritySnapshot,
  buildApprovalConfirmationBinding,
  deriveApprovalLifecycle,
  projectApprovalCommandResponse,
  projectCanonicalApprovalCommandResult,
} from "../../base44/shared/approvalAuthority.ts";
import { resolveCommunicationThreadBrandId } from "../../base44/shared/communicationTenant.ts";

const clone = (value) => structuredClone(value);
const matches = (row, query) =>
  Object.entries(query).every(([key, value]) => row?.[key] === value);

function approvalService(initial) {
  let row = clone(initial);
  let updates = 0;
  return {
    current: () => clone(row),
    updateCount: () => updates,
    entities: {
      Approval: {
        get: async (id) => (row.id === id ? clone(row) : null),
        updateMany: async (query, operation) => {
          if (!matches(row, query)) return { updated: 0 };
          row = { ...row, ...clone(operation.$set) };
          updates += 1;
          return { updated: 1 };
        },
      },
    },
  };
}

function claimedApproval(overrides = {}) {
  return {
    id: "approval-1",
    status: "resolving",
    resolution_command_key: "command-1",
    approval_revision: 8,
    resolution_phase: "claimed",
    resolution_phase_revision: 3,
    resolution_attempt_token: "",
    resolution_effects_started: false,
    resolution_lease_expires_at: "",
    ...overrides,
  };
}

function entityService(rowsByEntity) {
  const entities = {};
  for (const [entity, rows] of Object.entries(rowsByEntity)) {
    entities[entity] = {
      get: async (id) => clone(rows[id]),
    };
  }
  return { entities };
}

describe("approval resolution saga concurrency", () => {
  it("ignores a fake EXECUTED audit receipt when canonical execution is NOT_STARTED", () => {
    const approval = {
      id: "approval-replay",
      status: "approved",
      decision_status: "APPROVED",
      decision_status_recorded_at: "2026-08-14T00:00:00.000Z",
      execution_status: "NOT_STARTED",
      execution_status_recorded_at: "2026-08-14T00:00:00.000Z",
      execution_receipt_ref: "",
    };
    const task = {
      id: "task-replay",
      status: "waiting_approval",
      execution_phase: "idle",
      execution_status: "NOT_STARTED",
      execution_receipt_ref: "",
    };
    const fakeAudit = {
      execution_status: "EXECUTED",
      execution_receipt_ref: "provider:fake-admin-audit-receipt",
    };

    for (const allowTaskExecution of [false, true]) {
      const result = projectCanonicalApprovalCommandResult({
        approval,
        task,
        recordedResult: fakeAudit,
        allowTaskExecution,
      });
      expect(result).toMatchObject({
        execution_status: "NOT_STARTED",
        execution_receipt_ref: null,
      });
      expect(projectApprovalCommandResponse(result)).toEqual({
        status: "resolved",
        command_status: "executed",
        execution_status: "NOT_STARTED",
      });
    }
  });

  it("lets a linked AgentTask override fake Approval EXECUTED state", () => {
    const result = deriveApprovalLifecycle({
      id: "approval-external",
      status: "approved",
      decision_status: "APPROVED",
      decision_status_recorded_at: "2026-08-14T00:00:00.000Z",
      execution_status: "EXECUTED",
      execution_status_recorded_at: "2026-08-14T00:00:01.000Z",
      execution_receipt_ref: "provider:fake-approval-receipt",
    }, {
      id: "task-external",
      status: "waiting_approval",
      execution_phase: "idle",
      execution_status: "NOT_STARTED",
      execution_receipt_ref: "",
    });
    expect(result).toMatchObject({
      decision_status: "APPROVED",
      execution_status: "NOT_STARTED",
      execution_receipt_ref: null,
    });
    expect(result.execution_status).not.toBe("EXECUTED");
  });

  it("rejects contradictory or incomplete CAS counters", () => {
    expect(updatedExactlyOne({ updated: 1 })).toBe(true);
    expect(updatedExactlyOne({ matched_count: 1, modified_count: 1 })).toBe(
      true,
    );
    expect(updatedExactlyOne({ updated: 1, matched_count: 0 })).toBe(false);
    expect(updatedExactlyOne({ success: false, updated: 1 })).toBe(false);
    expect(updatedExactlyOne({ ok: false, updated: 1 })).toBe(false);
    expect(updatedExactlyOne({ matched_count: 1, modified_count: 0 })).toBe(
      false,
    );
    expect(updatedExactlyOne({})).toBe(false);
  });

  it("grants exactly one claim when two attempts race", async () => {
    const initial = claimedApproval();
    const svc = approvalService(initial);
    const [first, second] = await Promise.all([
      acquireResolutionAttempt(svc, initial, "command-1", 1_000),
      acquireResolutionAttempt(svc, initial, "command-1", 1_000),
    ]);

    expect([first.acquired, second.acquired].filter(Boolean)).toHaveLength(1);
    expect(
      [first.in_progress, second.in_progress].filter(Boolean),
    ).toHaveLength(1);
    expect(svc.updateCount()).toBe(1);
    expect(svc.current()).toMatchObject({
      resolution_phase: "applying",
      resolution_phase_revision: 4,
    });
    expect(svc.current().resolution_attempt_token).toMatch(
      /^approval-attempt:/,
    );
  });

  it("does not steal a live lease", async () => {
    const now = Date.parse("2026-08-13T10:00:00.000Z");
    const initial = claimedApproval({
      resolution_phase: "applying",
      resolution_phase_revision: 4,
      resolution_attempt_token: "attempt-live",
      resolution_lease_expires_at: new Date(now + 60_000).toISOString(),
    });
    const svc = approvalService(initial);

    const result = await acquireResolutionAttempt(
      svc,
      initial,
      "command-1",
      now,
    );

    expect(result).toMatchObject({ acquired: false, in_progress: true });
    expect(result.approval.resolution_attempt_token).toBe("attempt-live");
    expect(svc.updateCount()).toBe(0);
  });

  it("resumes after an expired lease with a new fenced attempt token", async () => {
    const now = Date.parse("2026-08-13T10:00:00.000Z");
    const initial = claimedApproval({
      resolution_phase: "applying",
      resolution_phase_revision: 4,
      resolution_attempt_token: "attempt-expired",
      resolution_lease_expires_at: new Date(now - 1).toISOString(),
    });
    const svc = approvalService(initial);

    const result = await acquireResolutionAttempt(
      svc,
      initial,
      "command-1",
      now,
    );

    expect(result).toMatchObject({ acquired: true, in_progress: false });
    expect(result.approval).toMatchObject({
      resolution_phase: "applying",
      resolution_phase_revision: 5,
    });
    expect(result.approval.resolution_attempt_token).not.toBe(
      "attempt-expired",
    );
    expect(Date.parse(result.approval.resolution_lease_expires_at)).toBe(
      now + 10 * 60_000,
    );
  });

  it("never takes over an applying attempt with an unknown lease or post-effect state", async () => {
    for (
      const initial of [
        claimedApproval({
          resolution_phase: "applying",
          resolution_phase_revision: 4,
          resolution_attempt_token: "attempt-unknown",
          resolution_lease_expires_at: "",
        }),
        claimedApproval({
          resolution_phase: "applying",
          resolution_phase_revision: 4,
          resolution_attempt_token: "attempt-post-effect",
          resolution_lease_expires_at: "2026-08-13T09:00:00.000Z",
          resolution_effects_started: true,
        }),
      ]
    ) {
      const svc = approvalService(initial);
      const result = await acquireResolutionAttempt(
        svc,
        initial,
        "command-1",
        Date.parse("2026-08-13T10:00:00.000Z"),
      );
      expect(result).toMatchObject({
        acquired: false,
        review_required: true,
      });
      expect(svc.updateCount()).toBe(0);
      expect(svc.current().resolution_attempt_token).toBe(
        initial.resolution_attempt_token,
      );
    }
  });

  it("never takes over malformed claimed post-effect state or an expired approval", async () => {
    const now = Date.parse("2026-08-13T10:00:00.000Z");
    for (
      const initial of [
        claimedApproval({
          resolution_effects_started: true,
          resolution_lease_expires_at: new Date(now - 1).toISOString(),
        }),
        claimedApproval({
          expires_at: new Date(now - 1).toISOString(),
        }),
      ]
    ) {
      const svc = approvalService(initial);
      const result = await acquireResolutionAttempt(
        svc,
        initial,
        "command-1",
        now,
      );
      expect(result).toMatchObject({
        acquired: false,
        review_required: true,
      });
      expect(svc.updateCount()).toBe(0);
    }
  });

  it("fences effects and finalization with the owned revision and token", async () => {
    const svc = approvalService(claimedApproval());
    const acquired = await acquireResolutionAttempt(
      svc,
      svc.current(),
      "command-1",
      1_000,
    );
    expect(acquired.acquired).toBe(true);

    const effectsStarted = await markResolutionEffectsStarted(
      svc,
      acquired.approval,
      "command-1",
    );
    expect(effectsStarted.resolution_effects_started).toBe(true);
    expect(svc.current().resolution_effects_started).toBe(true);

    await finalizeApproval(svc, effectsStarted, "command-1", "approved", {
      resolution_decision: "approve",
    });
    expect(svc.current()).toMatchObject({
      status: "approved",
      resolution_phase: "finalized",
      approval_revision: 9,
      resolution_phase_revision: 5,
      resolution_decision: "approve",
      resolution_lease_expires_at: "",
    });
  });

  it("rejects stale effects and stale finalization after ownership changes", async () => {
    const initial = claimedApproval();
    const svc = approvalService(initial);
    const acquired = await acquireResolutionAttempt(
      svc,
      initial,
      "command-1",
      1_000,
    );

    await expect(
      markResolutionEffectsStarted(
        svc,
        { ...acquired.approval, resolution_attempt_token: "stale-token" },
        "command-1",
      ),
    ).rejects.toThrow("approval_resolution_effect_start_claim_lost");
    await expect(
      finalizeApproval(
        svc,
        { ...acquired.approval, resolution_phase_revision: 3 },
        "command-1",
        "approved",
      ),
    ).rejects.toThrow("approval_resolution_claim_lost");

    expect(svc.current()).toMatchObject({
      status: "resolving",
      resolution_phase: "applying",
      resolution_phase_revision: 4,
      resolution_effects_started: false,
    });
  });

  it("never finalizes EXECUTED without an immutable receipt reference", async () => {
    const svc = approvalService(claimedApproval());
    const acquired = await acquireResolutionAttempt(
      svc,
      svc.current(),
      "command-1",
      1_000,
    );
    const observed = await finalizeApproval(
      svc,
      acquired.approval,
      "command-1",
      "approved",
      { execution_status: "EXECUTED", execution_receipt_ref: "" },
    );
    expect(observed).toMatchObject({
      decision_status: "APPROVED",
      execution_status: "REVIEW_REQUIRED",
      execution_receipt_ref: "",
    });
  });

  it("revalidates approval expiry immediately before a material effect", async () => {
    const svc = approvalService(claimedApproval());
    const acquired = await acquireResolutionAttempt(
      svc,
      svc.current(),
      "command-1",
      1_000,
    );
    await expect(
      markResolutionEffectsStarted(
        svc,
        { ...acquired.approval, expires_at: "2000-01-01T00:00:00.000Z" },
        "command-1",
      ),
    ).rejects.toThrow("approval_resolution_expired_before_effect");
    expect(svc.current().resolution_effects_started).toBe(false);
  });

  it("renews only the currently fenced lease", async () => {
    const svc = approvalService(claimedApproval());
    const acquired = await acquireResolutionAttempt(
      svc,
      svc.current(),
      "command-1",
      1_000,
    );
    await expect(
      renewResolutionLease(svc, acquired.approval, "command-1", 2_000),
    ).rejects.toThrow("approval_resolution_effect_start_not_observed");
    const started = await markResolutionEffectsStarted(
      svc,
      acquired.approval,
      "command-1",
    );
    const renewed = await renewResolutionLease(
      svc,
      started,
      "command-1",
      2_000,
    );
    expect(Date.parse(renewed.resolution_lease_expires_at)).toBe(
      2_000 + 10 * 60_000,
    );
    await expect(
      renewResolutionLease(
        svc,
        { ...renewed, resolution_attempt_token: "stale" },
        "command-1",
        3_000,
      ),
    ).rejects.toThrow("approval_resolution_claim_lost");
  });

  it("requires exact readback before effects or a renewed lease become authoritative", async () => {
    const svc = approvalService(claimedApproval());
    const acquired = await acquireResolutionAttempt(
      svc,
      svc.current(),
      "command-1",
      1_000,
    );
    const normalUpdate = svc.entities.Approval.updateMany;
    svc.entities.Approval.updateMany = async (query, operation) => {
      if (operation?.$set?.resolution_effects_started === true) {
        return { success: true, updated: 1 };
      }
      return normalUpdate(query, operation);
    };
    await expect(markResolutionEffectsStarted(
      svc,
      acquired.approval,
      "command-1",
    )).rejects.toThrow("approval_resolution_effect_start_readback_mismatch");
    expect(svc.current().resolution_effects_started).toBe(false);
  });

  it("rejects unknown execution states and untyped execution receipts", async () => {
    const invalidSvc = approvalService(claimedApproval());
    const invalid = await acquireResolutionAttempt(
      invalidSvc,
      invalidSvc.current(),
      "command-1",
      1_000,
    );
    await expect(finalizeApproval(
      invalidSvc,
      invalid.approval,
      "command-1",
      "approved",
      { execution_status: "MAGIC" },
    )).rejects.toThrow("approval_execution_status_invalid");

    const receiptSvc = approvalService(claimedApproval());
    const receiptClaim = await acquireResolutionAttempt(
      receiptSvc,
      receiptSvc.current(),
      "command-1",
      1_000,
    );
    const observed = await finalizeApproval(
      receiptSvc,
      receiptClaim.approval,
      "command-1",
      "approved",
      { execution_status: "EXECUTED", execution_receipt_ref: "untyped" },
    );
    expect(observed.execution_status).toBe("REVIEW_REQUIRED");
  });

  it("releases a pre-effect claim but never rolls back after effects start", async () => {
    const beforeEffects = approvalService(claimedApproval({
      confirmation_preview_generation: 1,
      confirmation_preview_command_key: "command-1",
      confirmation_preview_actor_email: "founder@example.test",
      confirmation_preview_hash: "preview-hash-1",
      confirmation_nonce_hash: "consumed-nonce-hash",
      resolution_nonce_hash: "consumed-nonce-hash",
      resolution_nonce_used_at: "2026-08-14T00:00:00.000Z",
      resolution_preview_generation: 1,
    }));
    const acquired = await acquireResolutionAttempt(
      beforeEffects,
      beforeEffects.current(),
      "command-1",
      1_000,
    );
    const release = await releaseResolutionClaimIfNoEffects(
      beforeEffects,
      acquired.approval,
      "command-1",
    );
    expect(release.released).toBe(true);
    expect(beforeEffects.current()).toMatchObject({
      status: "pending",
      resolution_command_key: "",
      resolution_binding_hash: "",
      resolution_nonce_hash: "consumed-nonce-hash",
      resolution_nonce_used_at: "2026-08-14T00:00:00.000Z",
      approval_revision: 9,
    });
    expect(release.retry_requires_new_preview).toBe(true);
    expect(() =>
      assertFreshApprovalConfirmationNonce(
        beforeEffects.current(),
        "consumed-nonce-hash",
        1,
      )
    ).toThrow("approval_confirmation_nonce_already_consumed");
    try {
      assertFreshApprovalConfirmationNonce(
        beforeEffects.current(),
        "consumed-nonce-hash",
        1,
      );
      throw new Error("expected_same_nonce_replay_to_fail");
    } catch (error) {
      expect(error).toMatchObject({
        message: "approval_confirmation_nonce_already_consumed",
        status: 409,
        retry_requires_new_preview: true,
      });
    }

    const afterEffects = approvalService(claimedApproval({
      confirmation_preview_generation: 1,
      confirmation_nonce_hash: "second-consumed-nonce-hash",
      resolution_nonce_hash: "second-consumed-nonce-hash",
      resolution_nonce_used_at: "2026-08-14T00:00:01.000Z",
      resolution_preview_generation: 1,
    }));
    const secondClaim = await acquireResolutionAttempt(
      afterEffects,
      afterEffects.current(),
      "command-1",
      1_000,
    );
    const marked = await markResolutionEffectsStarted(
      afterEffects,
      secondClaim.approval,
      "command-1",
    );
    const denied = await releaseResolutionClaimIfNoEffects(
      afterEffects,
      marked,
      "command-1",
    );
    expect(denied.released).toBe(false);
    expect(afterEffects.current().status).toBe("resolving");
  });

  it("allows one fresh generation after release while rejecting the old preview nonce", async () => {
    const svc = approvalService(claimedApproval({
      confirmation_preview_generation: 1,
      confirmation_preview_command_key: "command-1",
      confirmation_preview_actor_email: "founder@example.test",
      confirmation_preview_hash: "preview-hash-1",
      confirmation_nonce_hash: "old-nonce-hash",
      resolution_nonce_hash: "old-nonce-hash",
      resolution_nonce_used_at: "2026-08-14T00:00:00.000Z",
      resolution_preview_generation: 1,
    }));
    const firstAttempt = await acquireResolutionAttempt(
      svc,
      svc.current(),
      "command-1",
      1_000,
    );
    const released = await releaseResolutionClaimIfNoEffects(
      svc,
      firstAttempt.approval,
      "command-1",
    );
    expect(released).toMatchObject({
      released: true,
      retry_requires_new_preview: true,
    });
    expect(() =>
      assertFreshApprovalConfirmationNonce(
        svc.current(),
        "old-nonce-hash",
        1,
      )
    ).toThrow("approval_confirmation_nonce_already_consumed");

    const installed = await installApprovalConfirmationPreview(
      svc,
      svc.current(),
      {
        commandKey: "command-2",
        actorEmail: "founder@example.test",
        nonceHash: "new-nonce-hash",
        previewHash: "preview-hash-2",
      },
    );
    expect(installed).toMatchObject({
      status: "pending",
      confirmation_preview_generation: 2,
      confirmation_preview_command_key: "command-2",
      confirmation_nonce_hash: "new-nonce-hash",
    });
    expect(() =>
      assertFreshApprovalConfirmationNonce(installed, "old-nonce-hash", 1)
    ).toThrow("approval_confirmation_preview_not_current");
    const consumed = await claimApprovalConfirmation(svc, installed, {
      commandKey: "command-2",
      actorEmail: "founder@example.test",
      nonceHash: "new-nonce-hash",
      previewGeneration: 2,
    });
    expect(consumed).toMatchObject({
      status: "resolving",
      resolution_command_key: "command-2",
      resolution_nonce_hash: "new-nonce-hash",
      resolution_preview_generation: 2,
    });
    expect(() =>
      assertFreshApprovalConfirmationNonce(consumed, "new-nonce-hash", 2)
    ).toThrow("approval_confirmation_nonce_already_consumed");
  });

  it("requires durable nonce evidence before a pre-effect claim can be released", async () => {
    const svc = approvalService(claimedApproval());
    const acquired = await acquireResolutionAttempt(
      svc,
      svc.current(),
      "command-1",
      1_000,
    );
    await expect(
      releaseResolutionClaimIfNoEffects(svc, acquired.approval, "command-1"),
    ).rejects.toThrow("approval_resolution_release_nonce_evidence_missing");
    expect(svc.current().status).toBe("resolving");
  });
});

describe("approval authority binding", () => {
  const approval = {
    id: "approval-1",
    brand_id: "brand-1",
    agent_task_id: "task-1",
    action_type: "developer_apply_patch",
    related_entity_type: "DeveloperMigrationRun",
    related_entity_id: "run-1",
    risk_level: 4,
    expires_at: "2026-08-14T10:00:00.000Z",
    draft_content: "Apply reviewed patch",
    draft_payload_json: { run_id: "run-1", approved_sha: "abc123" },
  };
  const task = {
    id: "task-1",
    brand_id: "brand-1",
    action_type: "developer_apply_patch",
    status: "waiting_approval",
  };
  const svc = entityService({
    DeveloperMigrationRun: {
      "run-1": {
        id: "run-1",
        brand_id: "brand-1",
        source_sha: "abc123",
        status: "ready",
      },
    },
  });

  it("includes approval metadata, payload, task, referenced rows and normalized actor", async () => {
    const snapshot = await buildApprovalAuthoritySnapshot(
      svc,
      approval,
      task,
      "Founder@Cambra.Global",
    );

    expect(snapshot.approval_metadata_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.approval_content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.task_content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.entity_snapshots).toEqual([
      {
        entity: "DeveloperMigrationRun",
        id: "run-1",
        content_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
    expect(
      await approvalAuthorityHash(svc, approval, task, "Founder@Cambra.Global"),
    ).toBe(
      await approvalAuthorityHash(svc, approval, task, "founder@cambra.global"),
    );
  });

  it("ignores empty optional refs and deduplicates the same referenced row", async () => {
    let reads = 0;
    const svc = {
      entities: {
        DeveloperMigrationRun: {
          get: async () => {
            reads += 1;
            return { id: "run-1", status: "ready" };
          },
        },
      },
    };
    const snapshot = await buildApprovalAuthoritySnapshot(
      svc,
      {
        ...approval,
        draft_payload_json: { run_id: "run-1", workspace_id: "" },
      },
      task,
      "founder@cambra.global",
    );
    expect(reads).toBe(1);
    expect(snapshot.entity_snapshots).toHaveLength(1);
    expect(snapshot.entity_snapshots[0]).toMatchObject({
      entity: "DeveloperMigrationRun",
      id: "run-1",
    });
  });

  it("fails closed when a referenced authority row is absent", async () => {
    await expect(
      buildApprovalAuthoritySnapshot(
        entityService({ DeveloperMigrationRun: {} }),
        approval,
        task,
        "founder@cambra.global",
      ),
    ).rejects.toThrow("approval_authority_reference_missing");
  });

  it("changes the authority and immutable hashes when metadata, payload or actor changes", async () => {
    const baseAuthority = await approvalAuthorityHash(
      svc,
      approval,
      task,
      "founder@cambra.global",
    );
    const baseImmutable = await approvalImmutableContentHash(
      approval,
      "founder@cambra.global",
    );
    const variants = [
      { ...approval, action_type: "developer_rollback" },
      {
        ...approval,
        draft_payload_json: {
          ...approval.draft_payload_json,
          approved_sha: "def456",
        },
      },
    ];

    for (const variant of variants) {
      expect(
        await approvalAuthorityHash(
          svc,
          variant,
          task,
          "founder@cambra.global",
        ),
      ).not.toBe(baseAuthority);
      expect(
        await approvalImmutableContentHash(variant, "founder@cambra.global"),
      ).not.toBe(baseImmutable);
    }
    expect(
      await approvalAuthorityHash(svc, approval, task, "other@cambra.global"),
    ).not.toBe(baseAuthority);
    expect(
      await approvalImmutableContentHash(approval, "other@cambra.global"),
    ).not.toBe(baseImmutable);
  });

  it("hash-binds every one-use confirmation dimension independently", async () => {
    const base = {
      approval: {
        id: "approval-bound",
        brand_id: "brand-1",
        agent_task_id: "task-1",
        related_entity_type: "NegotiationCase",
        related_entity_id: "case-1",
        expires_at: "2026-08-15T10:00:00.000Z",
        draft_content: "Exact terms",
        draft_payload_json: { variable_fee_bps: 120, legal_terms: "L1" },
      },
      actorEmail: "founder@cambra.global",
      decision: "approve",
      reason: "",
      nonceHash: "c".repeat(64),
      policy: { key: "founder_approval_resolution", version: "1" },
      authoritySnapshot: { id: "authority-1", hash: "a".repeat(64) },
      intelligenceSnapshot: {
        id: "intelligence-1",
        hash: "b".repeat(64),
        state: "OBSERVED",
      },
      economicTerms: { variable_fee_bps: 120 },
      legalTerms: { terms: "L1" },
      marketScopeVersion: "market-scope-1",
      emergency: { id: "emergency-1", revision: 7 },
    };
    const canonical = await buildApprovalConfirmationBinding(base);
    const variants = [
      {
        approval: {
          ...base.approval,
          draft_payload_json: { variable_fee_bps: 121, legal_terms: "L1" },
        },
      },
      { policy: { ...base.policy, version: "2" } },
      { authoritySnapshot: { ...base.authoritySnapshot, id: "authority-2" } },
      {
        authoritySnapshot: { ...base.authoritySnapshot, hash: "d".repeat(64) },
      },
      {
        intelligenceSnapshot: {
          ...base.intelligenceSnapshot,
          id: "intelligence-2",
        },
      },
      {
        intelligenceSnapshot: {
          ...base.intelligenceSnapshot,
          hash: "e".repeat(64),
        },
      },
      { economicTerms: { variable_fee_bps: 119 } },
      { legalTerms: { terms: "L2" } },
      { marketScopeVersion: "market-scope-2" },
      { emergency: { ...base.emergency, revision: 8 } },
      { actorEmail: "other@cambra.global" },
      { approval: { ...base.approval, brand_id: "brand-2" } },
      { approval: { ...base.approval, related_entity_id: "case-2" } },
      {
        approval: { ...base.approval, expires_at: "2026-08-16T10:00:00.000Z" },
      },
      { nonceHash: "f".repeat(64) },
    ];
    for (const variant of variants) {
      const changed = await buildApprovalConfirmationBinding({
        ...base,
        ...variant,
      });
      expect(changed.binding_hash).not.toBe(canonical.binding_hash);
    }
  });

  it("keeps legacy approval decisions separate from execution evidence", () => {
    expect(deriveApprovalLifecycle({ status: "approved" })).toMatchObject({
      decision_status: "APPROVED",
      execution_status: "NOT_STARTED",
      derivation: "LEGACY_CONSERVATIVE",
    });
    expect(
      deriveApprovalLifecycle({
        status: "approved",
        decision_status: "APPROVED",
        decision_status_recorded_at: "2026-08-14T10:00:00Z",
        execution_status: "EXECUTED",
        execution_status_recorded_at: "2026-08-14T10:00:01Z",
      }),
    ).toMatchObject({ execution_status: "REVIEW_REQUIRED" });
    expect(
      deriveApprovalLifecycle(
        { status: "approved" },
        {
          status: "completed",
          execution_phase: "completed",
          execution_status: "EXECUTED",
          execution_receipt_ref: "approval-execution:receipt",
        },
      ),
    ).toMatchObject({ execution_status: "EXECUTED" });
  });
});

describe("commercial communication tenant resolution", () => {
  const svc = entityService({
    Brand: {
      "brand-direct": { id: "brand-direct" },
    },
    NegotiationCase: {
      "case-1": { id: "case-1", brand_id: "brand-case" },
      "case-no-brand": { id: "case-no-brand" },
    },
    DealActivation: {
      "recover-1": { id: "recover-1", brand_id: "brand-recover" },
    },
    OutboundLead: {
      "lead-1": { id: "lead-1" },
    },
    PartnerProspect: {
      "partner-1": { id: "partner-1" },
    },
  });

  it.each([
    [
      "Brand",
      {
        id: "thread-brand",
        related_entity_type: "Brand",
        related_entity_id: "brand-direct",
      },
      "brand-direct",
    ],
    [
      "NegotiationCase",
      {
        id: "thread-case",
        related_entity_type: "NegotiationCase",
        related_entity_id: "case-1",
      },
      "brand-case",
    ],
    [
      "DealActivation",
      { id: "thread-recover", recover_id: "recover-1" },
      "brand-recover",
    ],
    [
      "OutboundLead",
      {
        id: "thread-lead",
        engine: "merchant_acquisition",
        related_entity_type: "OutboundLead",
        related_entity_id: "lead-1",
      },
      "_platform",
    ],
    [
      "PartnerProspect",
      {
        id: "thread-partner",
        engine: "partner_acquisition",
        related_entity_type: "PartnerProspect",
        related_entity_id: "partner-1",
      },
      "_platform",
    ],
  ])(
    "maps %s threads to their canonical tenant",
    async (_kind, thread, expected) => {
      await expect(
        resolveCommunicationThreadBrandId(svc, thread),
      ).resolves.toBe(expected);
    },
  );

  it("fails closed for missing, ambiguous and unresolved tenant ownership", async () => {
    await expect(resolveCommunicationThreadBrandId(svc, null)).rejects.toThrow(
      "communication_thread_required",
    );
    await expect(
      resolveCommunicationThreadBrandId(svc, {
        id: "thread-unknown",
        related_entity_type: "Merchant",
        related_entity_id: "merchant-1",
      }),
    ).rejects.toThrow("communication_thread_brand_unresolved");
    await expect(
      resolveCommunicationThreadBrandId(svc, {
        id: "thread-case-no-brand",
        related_entity_type: "NegotiationCase",
        related_entity_id: "case-no-brand",
      }),
    ).rejects.toThrow("negotiation_thread_brand_unresolved");
  });
});
