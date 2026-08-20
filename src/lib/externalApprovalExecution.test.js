import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  beginExternalApprovalEffects,
  claimExternalApprovalExecution,
  completeExternalApprovalExecution,
  markExternalApprovalReviewRequired,
} from "../../base44/shared/externalApprovalExecution.ts";
import {
  approvalImmutableContentHash,
  buildApprovalConfirmationBinding,
  buildApprovalAuthoritySnapshot,
} from "../../base44/shared/approvalAuthority.ts";
import { sha256 } from "../../base44/shared/intelligenceCore.ts";
import fs from "node:fs";

const TEST_NOW = new Date("2026-08-14T12:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TEST_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

const matches = (row, query) => Object.entries(query).every(([key, value]) => row?.[key] === value);

function fixture(overrides = {}) {
  const approval = {
    id: "approval-1",
    brand_id: "_platform",
    agent_task_id: "task-1",
    action_type: "publish_linkedin_post",
    risk_level: 2,
    status: "approved",
    resolution_command_key: "command-1",
    resolution_decision: "approve",
    resolution_actor_email: "founder@cambra.test",
    resolution_authority_hash: "authority-hash",
    resolution_content_hash: "content-hash",
    expires_at: "2026-08-20T10:00:00.000Z",
    draft_content: "Publish the exact approved content",
    draft_payload_json: { content: "approved content" },
  };
  const task = {
    id: "task-1",
    brand_id: "_platform",
    agent_name: "linkedin",
    task_type: "publish_linkedin_post",
    status: "waiting_approval",
    requires_approval: true,
    risk_level: 2,
    approval_id: "approval-1",
    execution_phase: "idle",
    execution_revision: 0,
    execution_effects_started: false,
    ...overrides,
  };
  return { approval, task };
}

function service(initialTask, emergency = {}, options = {}) {
  let task = structuredClone(initialTask);
  let control = {
    id: "emergency-1",
    control_key: "global",
    safe_mode: false,
    communications_paused: false,
    negotiations_paused: false,
    migrations_paused: false,
    billing_issuance_paused: false,
    paid_discovery_paused: false,
    resume_check_required: false,
    ...emergency,
  };
  return {
    task: () => structuredClone(task),
    setEmergency: (patch) => { control = { ...control, ...patch }; },
    entities: {
      EmergencyControl: { filter: async () => [structuredClone(control)] },
      AgentTask: {
        get: async (id) => id === task.id ? structuredClone(task) : null,
        updateMany: async (query, operation) => {
          if (!matches(task, query)) return { updated: 0 };
          task = { ...task, ...structuredClone(operation.$set) };
          return options.casResult || { updated: 1 };
        },
      },
    },
  };
}

async function authorize(svc, approval, task) {
  approval.resolution_authority_hash = await sha256(
    await buildApprovalAuthoritySnapshot(svc, approval, task, approval.resolution_actor_email),
  );
  approval.resolution_content_hash = await sha256({
    approval: await approvalImmutableContentHash(approval, approval.resolution_actor_email),
    decision: "approve",
    reason: "",
  });
  const nonceHash = await sha256("one-use-confirmation-nonce");
  const intelligenceHash = await sha256({
    state: "NONE_BOUND",
    approval_id: approval.id,
  });
  const binding = await buildApprovalConfirmationBinding({
    approval,
    actorEmail: approval.resolution_actor_email,
    decision: "approve",
    reason: "",
    nonceHash,
    policy: { key: "founder_approval_resolution", version: "test-v1" },
    authoritySnapshot: {
      id: "approval-authority:test",
      hash: approval.resolution_authority_hash,
    },
    intelligenceSnapshot: {
      id: "NONE_BOUND",
      hash: intelligenceHash,
      state: "NONE_BOUND",
    },
    economicTerms: approval.draft_payload_json,
    legalTerms: approval.draft_payload_json,
    marketScopeVersion: "market-scope-test-v1",
    emergency: { id: "emergency-1", revision: 0 },
  });
  Object.assign(approval, {
    decision_status: "APPROVED",
    decision_status_recorded_at: "2026-08-14T10:00:00.000Z",
    execution_status: "NOT_STARTED",
    execution_status_recorded_at: "2026-08-14T10:00:00.000Z",
    resolution_binding_json: binding,
    resolution_binding_hash: binding.binding_hash,
    resolution_policy_key: binding.policy.key,
    resolution_policy_version: binding.policy.version,
    resolution_authority_snapshot_id: binding.authority_snapshot.id,
    resolution_intelligence_snapshot_id: binding.intelligence_snapshot.id,
    resolution_intelligence_snapshot_hash: binding.intelligence_snapshot.hash,
    resolution_economic_terms_hash: binding.economic_terms_hash,
    resolution_legal_terms_hash: binding.legal_terms_hash,
    resolution_market_scope_version: binding.market_scope_version,
    resolution_emergency_control_id: binding.emergency_control.id,
    resolution_emergency_control_revision: binding.emergency_control.revision,
    resolution_nonce_hash: nonceHash,
    resolution_nonce_used_at: "2026-08-14T10:00:00.000Z",
  });
}

const input = (approval, task, nowMs) => ({
  approval,
  task,
  commandKey: "command-1",
  actorEmail: "founder@cambra.test",
  actionType: "publish_linkedin_post",
  agentName: "linkedin",
  taskType: "publish_linkedin_post",
  riskLevel: 2,
  nowMs,
});

describe("approval-gated external execution fencing", () => {
  it("allows exactly one Promise.all claimant", async () => {
    const { approval, task } = fixture();
    const svc = service(task);
    await authorize(svc, approval, task);
    const claims = await Promise.all(Array.from({ length: 12 }, () =>
      claimExternalApprovalExecution(svc, input(approval, task))));
    expect(claims.filter((row) => row.acquired)).toHaveLength(1);
    expect(claims.filter((row) => row.state === "in_progress")).toHaveLength(11);
    expect(svc.task()).toMatchObject({ status: "running", execution_phase: "claimed", execution_command_key: "command-1" });
    expect(svc.task().execution_status).toBe("CLAIMED");
  });

  it("never trusts a contradictory negative CAS response", async () => {
    const { approval, task } = fixture();
    const authoritySvc = service(task);
    await authorize(authoritySvc, approval, task);
    const svc = service(task, {}, {
      casResult: { success: false, updated: 1, matched_count: 1 },
    });
    const result = await claimExternalApprovalExecution(
      svc,
      input(approval, task),
    );
    expect(result).toMatchObject({ acquired: false, state: "in_progress" });
  });

  it("persists the postcondition and replays it without another claim", async () => {
    const { approval, task } = fixture();
    const svc = service(task);
    await authorize(svc, approval, task);
    const claim = await claimExternalApprovalExecution(svc, input(approval, task));
    await beginExternalApprovalEffects(svc, claim);
    const persisted = await completeExternalApprovalExecution(svc, claim, { published: true, provider_id: "post-1", execution_receipt_ref:"taplio-post:post-1" }, "Published");
    const replay = await claimExternalApprovalExecution(svc, input(approval, svc.task()));
    expect(persisted).toMatchObject({ ok: true, terminal: true, provider_id: "post-1", execution_receipt_ref:"taplio-post:post-1" });
    expect(replay).toMatchObject({ acquired: false, state: "replay" });
    expect(replay.result).toMatchObject({ provider_id: "post-1", command_key: "command-1" });
    expect(svc.task()).toMatchObject({ execution_status:"EXECUTED", execution_receipt_ref:persisted.execution_receipt_ref });
  });

  it("requires an explicit typed effect receipt before EXECUTED", async () => {
    const { approval, task } = fixture();
    const svc = service(task);
    await authorize(svc, approval, task);
    const claim = await claimExternalApprovalExecution(
      svc,
      input(approval, task),
    );
    await beginExternalApprovalEffects(svc, claim);
    for (const execution_receipt_ref of [undefined, "", "untyped"]) {
      await expect(
        completeExternalApprovalExecution(
          svc,
          claim,
          { published: true, execution_receipt_ref },
          "Published",
        ),
      ).rejects.toThrow("external_execution_receipt_required");
    }
    await markExternalApprovalReviewRequired(
      svc,
      claim,
      "external_execution_receipt_missing_after_effect",
    );
    expect(svc.task()).toMatchObject({
      execution_status: "REVIEW_REQUIRED",
      execution_phase: "review_required",
    });
  });

  it("rejects a mutated approved payload and a different admin actor", async () => {
    const { approval, task } = fixture();
    approval.draft_payload_json = { content: "approved text" };
    const svc = service(task);
    await authorize(svc, approval, task);
    approval.draft_payload_json = { content: "mutated after approval" };
    await expect(claimExternalApprovalExecution(svc, input(approval, task)))
      .rejects.toThrow(/external_execution_(confirmation_payload|content_hash)_mismatch/);
    approval.draft_payload_json = { content: "approved text" };
    await expect(claimExternalApprovalExecution(svc, { ...input(approval, task), actorEmail:"other-admin@cambra.test" }))
      .rejects.toThrow("external_execution_actor_mismatch");
    await expect(claimExternalApprovalExecution(svc, { ...input(approval, task), actorEmail:"" }))
      .rejects.toMatchObject({ code:"external_execution_actor_mismatch", status:403 });
    expect(svc.task().status).toBe("waiting_approval");
  });

  it("turns an expired post-effect crash into terminal REVIEW_REQUIRED", async () => {
    const now = Date.now();
    const canonical = fixture();
    const authoritySvc = service(canonical.task);
    await authorize(authoritySvc, canonical.approval, canonical.task);
    const approval = canonical.approval;
    const task = { ...canonical.task,
      status: "running",
      execution_phase: "applying",
      execution_revision: 3,
      execution_command_key: "command-1",
      execution_attempt_token: "dead-attempt",
      execution_effects_started: true,
      execution_lease_expires_at: new Date(now - 1_000).toISOString(),
      execution_authority_hash: approval.resolution_authority_hash,
    };
    const svc = service(task);
    const replay = await claimExternalApprovalExecution(svc, input(approval, task, now));
    expect(replay).toMatchObject({ acquired: false, state: "review_required" });
    expect(svc.task()).toMatchObject({
      status: "waiting_input",
      execution_phase: "review_required",
      execution_status: "REVIEW_REQUIRED",
      execution_error: "external_execution_lease_expired_after_effect",
    });
  });

  it("turns a missing or invalid running lease into REVIEW_REQUIRED without takeover", async () => {
    for (const lease of ["", "not-a-date"]) {
      const canonical = fixture();
      const authoritySvc = service(canonical.task);
      await authorize(authoritySvc, canonical.approval, canonical.task);
      const task = {
        ...canonical.task,
        status: "running",
        execution_phase: "claimed",
        execution_status: "CLAIMED",
        execution_revision: 3,
        execution_command_key: "command-1",
        execution_attempt_token: "unknown-lease-owner",
        execution_effects_started: false,
        execution_lease_expires_at: lease,
        execution_authority_hash:
          canonical.approval.resolution_authority_hash,
      };
      const svc = service(task);
      const result = await claimExternalApprovalExecution(
        svc,
        input(canonical.approval, task, Date.now()),
      );
      expect(result).toMatchObject({
        acquired: false,
        state: "review_required",
      });
      expect(svc.task()).toMatchObject({
        execution_attempt_token: "unknown-lease-owner",
        execution_phase: "review_required",
        execution_status: "REVIEW_REQUIRED",
        execution_error: "external_execution_lease_unknown",
      });
    }
  });

  it("revalidates approval expiry before claim and immediately before effects", async () => {
    const expired = fixture();
    const expiredSvc = service(expired.task);
    await authorize(expiredSvc, expired.approval, expired.task);
    expired.approval.expires_at = "2020-01-01T00:00:00.000Z";
    await expect(
      claimExternalApprovalExecution(
        expiredSvc,
        input(expired.approval, expired.task, Date.now()),
      ),
    ).rejects.toThrow("external_execution_approval_expired");
    expect(expiredSvc.task().status).toBe("waiting_approval");

    const current = fixture();
    const currentSvc = service(current.task);
    await authorize(currentSvc, current.approval, current.task);
    const claim = await claimExternalApprovalExecution(
      currentSvc,
      input(current.approval, current.task),
    );
    claim.approval.expires_at = "2020-01-01T00:00:00.000Z";
    await expect(
      beginExternalApprovalEffects(currentSvc, claim),
    ).rejects.toThrow("external_execution_approval_expired");
    expect(currentSvc.task()).toMatchObject({
      execution_phase: "claimed",
      execution_effects_started: false,
    });
  });

  it("lets a communications stop win after the provider effect", async () => {
    const { approval, task } = fixture();
    const svc = service(task);
    await authorize(svc, approval, task);
    const claim = await claimExternalApprovalExecution(svc, input(approval, task));
    await beginExternalApprovalEffects(svc, claim);
    svc.setEmergency({ communications_paused: true });
    await expect(completeExternalApprovalExecution(svc, claim, { published: true }, "Published"))
      .rejects.toThrow("emergency_control_paused:communications");
    await markExternalApprovalReviewRequired(svc, claim, "emergency_stop_after_external_effect");
    expect(svc.task()).toMatchObject({
      status: "waiting_input",
      execution_phase: "review_required",
      execution_status: "REVIEW_REQUIRED",
      execution_error: "emergency_stop_after_external_effect",
    });
  });

  it("keeps the gateway and all seven executors on the durable protocol", () => {
    const gateway = fs.readFileSync("base44/functions/founderOSCommand/entry.ts", "utf8");
    expect(gateway).toContain("execution_command_key: commandKey");
    expect(gateway).toContain("DURABLE_EXTERNAL_EXECUTORS");
    for (const file of ["outreachAgent", "followUpAgent", "blogAgent", "linkedinAgent", "xTwitterAgent", "newsletterAgent", "meetingAgent"]) {
      const source = fs.readFileSync(`base44/functions/${file}/entry.ts`, "utf8");
      expect(source).toContain("claimExternalApprovalExecution");
      expect(source).toContain("completeExternalApprovalExecution");
      expect(source).toContain("markExternalApprovalReviewRequired");
      expect(source).toContain("execution_receipt_ref");
    }
    for (const file of ["linkedinAgent", "xTwitterAgent", "newsletterAgent"]) {
      expect(fs.readFileSync(`base44/functions/${file}/entry.ts`, "utf8"))
        .toMatch(/stable_event_key:\s*true/);
    }
  });
});
