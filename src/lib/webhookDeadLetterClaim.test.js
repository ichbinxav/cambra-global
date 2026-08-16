import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  claimWebhookDeadLetter,
  finishWebhookDeadLetterClaim,
  markWebhookClaimReviewRequired,
  markWebhookDeliveryStarted,
  persistWebhookDeliveryReceipt,
  prepareWebhookDispatchIntent,
  webhookClaimFailureDecision,
  webhookDispatchIdentity,
} from "../../base44/shared/webhookDeadLetterClaim.ts";

function store(initial) {
  let row = structuredClone(initial);
  const matches = (candidate, filter) =>
    Object.entries(filter).every(([key, value]) => {
      const actual = candidate[key];
      return value === null ? actual == null : actual === value;
    });
  return {
    row: () => structuredClone(row),
    svc: {
      entities: {
        WebhookDeadLetter: {
          async updateMany(filter, update) {
            if (!matches(row, filter)) return { updated: 0 };
            row = { ...row, ...(update.$set || {}) };
            return { updated: 1 };
          },
        },
      },
    },
  };
}

const pending = () => ({
  id: "dlq_1",
  status: "pending_retry",
  total_attempts: 3,
  claim_state: "IDLE",
  claim_revision: 0,
  claim_token: "",
  claim_owner: "",
  claim_effects_started: false,
});

describe("Webhook DLQ durable claim", () => {
  it("allows exactly one concurrent claimant", async () => {
    const state = store(pending());
    const snapshot = state.row();
    const [a, b] = await Promise.all([
      claimWebhookDeadLetter(state.svc, snapshot, {
        expected_status: "pending_retry",
        owner: "worker-a",
        now_ms: 1_000,
      }),
      claimWebhookDeadLetter(state.svc, snapshot, {
        expected_status: "pending_retry",
        owner: "worker-b",
        now_ms: 1_000,
      }),
    ]);
    expect([a.acquired, b.acquired].filter(Boolean)).toHaveLength(1);
    expect(state.row().claim_state).toBe("CLAIMED");
    expect(state.row().claim_revision).toBe(1);
  });

  it("uses a fencing token for effect start and completion", async () => {
    const state = store(pending());
    const acquired = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "pending_retry",
      owner: "worker-a",
      now_ms: 1_000,
    });
    const started = await markWebhookDeliveryStarted(state.svc, acquired.claim);
    expect(started.ok).toBe(true);
    expect(state.row()).toMatchObject({
      claim_state: "EFFECT_STARTED",
      claim_revision: 2,
      claim_effects_started: true,
    });
    const staleFinish = await finishWebhookDeadLetterClaim(
      state.svc,
      acquired.claim,
      { status: "resolved" },
    );
    expect(staleFinish.ok).toBe(false);
    const finished = await finishWebhookDeadLetterClaim(
      state.svc,
      started.claim,
      { status: "resolved" },
    );
    expect(finished.ok).toBe(true);
    expect(state.row()).toMatchObject({
      status: "resolved",
      claim_state: "EXECUTED",
      claim_revision: 3,
    });
  });

  it("rejects an invalid owner token at effect start and terminal settlement", async () => {
    const state = store(pending());
    const acquired = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "pending_retry",
      owner: "worker-a",
      now_ms: 1_000,
    });
    const forged = { ...acquired.claim, token: "forged-token" };
    await expect(markWebhookDeliveryStarted(state.svc, forged)).resolves.toEqual({
      ok: false,
      reason: "delivery_claim_lost",
    });
    const started = await markWebhookDeliveryStarted(state.svc, acquired.claim);
    await expect(
      finishWebhookDeadLetterClaim(state.svc, { ...started.claim, token: "wrong" }, {
        status: "resolved",
      }),
    ).resolves.toMatchObject({ ok: false, terminal_state: "REVIEW_REQUIRED" });
    expect(state.row()).toMatchObject({
      claim_state: "EFFECT_STARTED",
      claim_owner: "worker-a",
    });
  });

  it("quarantines an expired claim once delivery may have started", async () => {
    const state = store({
      ...pending(),
      claim_state: "EFFECT_STARTED",
      claim_revision: 4,
      claim_token: "old-token",
      claim_owner: "dead-worker",
      claim_effects_started: true,
      claim_expires_at: new Date(1_000).toISOString(),
    });
    const result = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "pending_retry",
      owner: "recovery-worker",
      now_ms: 2_000,
    });
    expect(result).toMatchObject({
      acquired: false,
      reason: "ambiguous_delivery_review_required",
      review_required: true,
    });
    expect(state.row()).toMatchObject({
      status: "exhausted",
      claim_state: "REVIEW_REQUIRED",
      claim_revision: 5,
    });
  });

  it("allows only proven duplicate denials to remain scheduler-benign", () => {
    expect(webhookClaimFailureDecision({
      acquired: false,
      reason: "claim_active",
    })).toEqual({
      benign: true,
      review_required: false,
      scheduler_ok: true,
      http_status: 200,
      reason: "claim_active",
    });
    for (const reason of [
      "claim_conflict",
      "ambiguous_delivery_review_required",
      "delivery_claim_lost",
      "webhook_claim_unknown",
    ]) {
      expect(webhookClaimFailureDecision({ acquired: false, reason }), reason)
        .toMatchObject({
          benign: false,
          review_required: true,
          scheduler_ok: false,
          http_status: 409,
        });
    }
  });

  it("reclaims an expired pre-effect lease with a higher fence", async () => {
    const state = store({
      ...pending(),
      claim_state: "CLAIMED",
      claim_revision: 4,
      claim_token: "expired-token",
      claim_owner: "dead-worker",
      claim_expires_at: new Date(1_000).toISOString(),
      claim_effects_started: false,
      claim_attempt_key: "webhook-retry:dlq_1:4",
      claim_wire_created_at: new Date(500).toISOString(),
    });
    const result = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "pending_retry",
      owner: "takeover-worker",
      now_ms: 2_000,
    });
    expect(result).toMatchObject({ acquired: true, reclaimed_from: "EXPIRED_PRE_EFFECT" });
    expect(result.claim).toMatchObject({
      revision: 5,
      owner: "takeover-worker",
      attempt_key: "webhook-retry:dlq_1:4",
      wire_created_at: new Date(500).toISOString(),
    });
    expect(state.row()).toMatchObject({
      claim_state: "CLAIMED",
      claim_revision: 5,
      claim_previous_state: "EXPIRED_PRE_EFFECT",
    });
  });

  it("does not allow a fresh lease to be stolen", async () => {
    const state = store({
      ...pending(),
      claim_state: "CLAIMED",
      claim_revision: 1,
      claim_token: "live-token",
      claim_owner: "live-worker",
      claim_expires_at: new Date(20_000).toISOString(),
    });
    const result = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "pending_retry",
      owner: "other-worker",
      now_ms: 2_000,
    });
    expect(result).toEqual({ acquired: false, reason: "claim_active" });
    expect(state.row().claim_owner).toBe("live-worker");
  });

  it("never treats a missing or invalid lease as expired authority", async () => {
    for (const claim_expires_at of ["", "not-a-date", null]) {
      const state = store({
        ...pending(),
        claim_state: "CLAIMED",
        claim_revision: 4,
        claim_token: "unknown-lease-token",
        claim_owner: "unknown-owner",
        claim_effects_started: false,
        claim_expires_at,
      });
      const result = await claimWebhookDeadLetter(state.svc, state.row(), {
        expected_status: "pending_retry",
        owner: "would-be-takeover",
        now_ms: 2_000,
      });
      expect(result, String(claim_expires_at)).toMatchObject({
        acquired: false,
        reason: "claim_lease_authority_unknown",
        review_required: true,
      });
      expect(state.row().claim_owner).toBe("unknown-owner");
    }
  });

  it("rejects every post-effect release or pre-effect execution transition", async () => {
    const post = store({
      ...pending(),
      claim_state: "EFFECT_STARTED",
      claim_revision: 2,
      claim_token: "post-token",
      claim_owner: "post-owner",
      claim_effects_started: true,
    });
    const postResult = await finishWebhookDeadLetterClaim(
      post.svc,
      {
        id: "dlq_1",
        expected_status: "pending_retry",
        revision: 2,
        token: "post-token",
        owner: "post-owner",
      },
      { status: "pending_retry" },
      { terminal_state: "RELEASED" },
    );
    expect(postResult).toMatchObject({
      ok: false,
      terminal_state: "REVIEW_REQUIRED",
      review_required: true,
    });
    expect(post.row().claim_state).toBe("EFFECT_STARTED");

    const pre = store({
      ...pending(),
      claim_state: "CLAIMED",
      claim_revision: 2,
      claim_token: "pre-token",
      claim_owner: "pre-owner",
      claim_effects_started: false,
    });
    const preResult = await finishWebhookDeadLetterClaim(
      pre.svc,
      {
        id: "dlq_1",
        expected_status: "pending_retry",
        revision: 2,
        token: "pre-token",
        owner: "pre-owner",
      },
      { status: "resolved" },
      { after_effect: false, terminal_state: "EXECUTED" },
    );
    expect(preResult).toMatchObject({ ok: false, review_required: true });
    expect(pre.row().claim_state).toBe("CLAIMED");
  });

  it("distinguishes a CAS conflict from unavailable claim authority", async () => {
    const conflictSvc = {
      entities: {
        WebhookDeadLetter: {
          updateMany: async () => ({ updated: 0 }),
        },
      },
    };
    await expect(
      claimWebhookDeadLetter(conflictSvc, pending(), {
        expected_status: "pending_retry",
        owner: "worker-a",
        now_ms: 1_000,
      }),
    ).resolves.toEqual({ acquired: false, reason: "claim_conflict" });

    const unavailableSvc = {
      entities: {
        WebhookDeadLetter: {
          updateMany: async () => {
            throw new Error("database offline");
          },
        },
      },
    };
    await expect(
      claimWebhookDeadLetter(unavailableSvc, pending(), {
        expected_status: "pending_retry",
        owner: "worker-a",
        now_ms: 1_000,
      }),
    ).rejects.toMatchObject({
      code: "WEBHOOK_DLQ_CLAIM_AUTHORITY_UNAVAILABLE",
      status: 503,
      review_required: true,
    });
  });

  it("rejects explicit DLQ CAS failure flags despite an updated counter", async () => {
    for (const failureStatus of [{ success: false }, { ok: false }]) {
      const state = store(pending());
      const originalUpdate = state.svc.entities.WebhookDeadLetter.updateMany;
      state.svc.entities.WebhookDeadLetter.updateMany = async (filter, update) => {
        const result = await originalUpdate(filter, update);
        return result.updated === 1
          ? { ...failureStatus, updated: 1 }
          : result;
      };
      await expect(
        claimWebhookDeadLetter(state.svc, pending(), {
          expected_status: "pending_retry",
          owner: `worker-${Object.keys(failureStatus)[0]}`,
          now_ms: 1_000,
        }),
      ).rejects.toMatchObject({
        code: "WEBHOOK_DLQ_CLAIM_AUTHORITY_AMBIGUOUS",
        status: 503,
        review_required: true,
      });
    }
  });

  it("fails closed when effect fencing or finalization authority is unavailable", async () => {
    const state = store(pending());
    const acquired = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "pending_retry",
      owner: "worker-a",
      now_ms: 1_000,
    });
    const unavailableSvc = {
      entities: {
        WebhookDeadLetter: {
          updateMany: async () => null,
        },
      },
    };
    await expect(
      markWebhookDeliveryStarted(unavailableSvc, acquired.claim),
    ).rejects.toMatchObject({
      code: "WEBHOOK_DLQ_DELIVERY_START_AUTHORITY_UNAVAILABLE",
      review_required: true,
    });

    const started = await markWebhookDeliveryStarted(state.svc, acquired.claim);
    await expect(
      finishWebhookDeadLetterClaim(unavailableSvc, started.claim, {
        status: "resolved",
      }),
    ).rejects.toMatchObject({
      code: "WEBHOOK_DLQ_FINALIZE_AUTHORITY_UNAVAILABLE",
      review_required: true,
    });
    expect(state.row()).toMatchObject({
      claim_state: "EFFECT_STARTED",
      claim_effects_started: true,
    });
  });

  it("keeps manual replay on the same durable attempt identity after a safe pre-effect release", async () => {
    const state = store({ ...pending(), status: "exhausted" });
    const first = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "exhausted",
      owner: "manual-a",
      now_ms: 1_000,
    });
    const released = await finishWebhookDeadLetterClaim(
      state.svc,
      first.claim,
      { last_error_message: "endpoint_read_unavailable" },
      { after_effect: false, terminal_state: "RELEASED" },
    );
    expect(released).toMatchObject({ ok: true, terminal_state: "RELEASED" });
    const replay = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "exhausted",
      owner: "manual-b",
      now_ms: 2_000,
    });
    expect(replay.acquired).toBe(true);
    expect(replay.claim.attempt_key).toBe(first.claim.attempt_key);
    expect(replay.claim.wire_created_at).toBe(first.claim.wire_created_at);
  });

  it("blocks manual replay of REVIEW_REQUIRED until external reconciliation changes authority", async () => {
    const state = store({
      ...pending(),
      status: "exhausted",
      claim_state: "REVIEW_REQUIRED",
      claim_revision: 7,
      claim_effects_started: true,
      claim_attempt_key: "webhook-retry:dlq_1:4",
    });
    const result = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "exhausted",
      owner: "manual-admin",
      now_ms: 2_000,
    });
    expect(result).toMatchObject({
      acquired: false,
      reason: "review_required",
      review_required: true,
    });
    expect(state.row()).toMatchObject({
      claim_state: "REVIEW_REQUIRED",
      claim_revision: 7,
      claim_effects_started: true,
    });
  });

  it("permits one observable effect for concurrent claimants", async () => {
    const state = store(pending());
    const snapshot = state.row();
    const claims = await Promise.all([
      claimWebhookDeadLetter(state.svc, snapshot, {
        expected_status: "pending_retry", owner: "a", now_ms: 1_000,
      }),
      claimWebhookDeadLetter(state.svc, snapshot, {
        expected_status: "pending_retry", owner: "b", now_ms: 1_000,
      }),
    ]);
    let providerCalls = 0;
    for (const result of claims) {
      if (!result.acquired) continue;
      const started = await markWebhookDeliveryStarted(state.svc, result.claim);
      if (!started.ok) continue;
      providerCalls += 1;
      const finished = await finishWebhookDeadLetterClaim(
        state.svc,
        started.claim,
        { status: "resolved", total_attempts: 4 },
      );
      expect(finished.ok).toBe(true);
    }
    expect(providerCalls).toBe(1);
    expect(state.row()).toMatchObject({ status: "resolved", claim_state: "EXECUTED" });
  });

  it("quarantines provider success when local receipt persistence fails and replay never resends", async () => {
    const state = store(pending());
    const acquired = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "pending_retry", owner: "worker-a", now_ms: 1_000,
    });
    const started = await markWebhookDeliveryStarted(state.svc, acquired.claim);
    let providerCalls = 0;
    providerCalls += 1;
    const receipt = await persistWebhookDeliveryReceipt({
      entities: {
        WebhookDelivery: {
          create: async () => { throw new Error("commit_unknown"); },
          filter: async () => [],
        },
      },
    }, {
      effect_key: started.claim.attempt_key,
      delivery_id: "dlq_1",
      payload_hash: "a".repeat(64),
      status: "success",
    });
    expect(receipt).toMatchObject({ ok: false, review_required: true });
    const reviewed = await markWebhookClaimReviewRequired(state.svc, started.claim, {
      reason: receipt.reason,
      result: { receipt_persisted: false },
    });
    expect(reviewed.ok).toBe(true);
    const replay = await claimWebhookDeadLetter(state.svc, state.row(), {
      expected_status: "exhausted", owner: "worker-b", now_ms: 2_000,
    });
    if (replay.acquired) providerCalls += 1;
    expect(replay).toMatchObject({ acquired: false, reason: "review_required" });
    expect(providerCalls).toBe(1);
    expect(state.row()).toMatchObject({
      status: "exhausted",
      claim_state: "REVIEW_REQUIRED",
      claim_effects_started: true,
    });
  });

  it("binds initial dispatch intent to a stable operation, payload and endpoint", async () => {
    const rows = [];
    const svc = {
      entities: {
        WebhookDeadLetter: {
          filter: async ({ effect_key }) => rows.filter((row) => row.effect_key === effect_key),
          create: async (value) => {
            const row = { id: `intent_${rows.length + 1}`, created_date: new Date().toISOString(), ...value };
            rows.push(row);
            return row;
          },
        },
      },
    };
    const identity = await webhookDispatchIdentity({
      operation_key: "checkout-42",
      endpoint_id: "ep_1",
      event_type: "analysis_completed",
      payload: { analysis_id: "a_1" },
    });
    const input = {
      ...identity,
      webhook_id: "ep_1",
      event_type: "analysis_completed",
      target_url: "https://receiver.example/hook",
      payload: { analysis_id: "a_1" },
      wire_created_at: "2026-08-13T09:00:00.000Z",
    };
    const first = await prepareWebhookDispatchIntent(svc, input);
    const replay = await prepareWebhookDispatchIntent(svc, input);
    expect(first.intent.id).toBe(replay.intent.id);
    expect(rows).toHaveLength(1);
    expect(first.intent).toMatchObject({
      status: "dispatch_pending",
      claim_state: "RELEASED",
      effect_key: identity.effect_key,
      delivery_id: identity.delivery_id,
      payload_hash: identity.payload_hash,
    });
    await expect(prepareWebhookDispatchIntent(svc, {
      ...input,
      payload_hash: "f".repeat(64),
    })).rejects.toMatchObject({
      code: "WEBHOOK_DISPATCH_INTENT_BINDING_MISMATCH",
      status: 409,
    });
  });

  it("wires CAS claims before network delivery and keeps schema fields durable", () => {
    const source = fs.readFileSync(
      "base44/functions/processWebhookDeadLetters/entry.ts",
      "utf8",
    );
    const schema = JSON.parse(
      fs.readFileSync("base44/entities/WebhookDeadLetter.jsonc", "utf8"),
    );
    expect(source.indexOf("markWebhookDeliveryStarted")).toBeLessThan(
      source.indexOf("effect:()=>fetchPublicHttps(endpoint.url"),
    );
    expect(source).toContain("markWebhookClaimReviewRequired");
    expect(source).not.toContain("action: \"rescheduled\"");
    expect(source).toContain("operation_key:schedulerOperationKey");
    expect(source).toContain("manual-replay:${body0.deadLetterId}");
    expect(source.indexOf("schedulerOperationKey = manualReplay")).toBeLessThan(
      source.indexOf("claimSchedulerRun(svc, req"),
    );
    expect(source).not.toMatch(/WebhookDeadLetter\.update\(dl\.id, \{ locked_at/);
    for (const field of [
      "claim_state",
      "claim_revision",
      "claim_token",
      "claim_owner",
      "claim_expires_at",
      "claim_effects_started",
      "effect_key",
      "delivery_id",
      "payload_hash",
    ]) {
      expect(schema.properties[field]).toBeTruthy();
    }
    expect(schema.rls.write.user_condition.role).toBe("__service_role_only__");
  });

  it("persists the initial intent and CAS claim before dispatchWebhook transport", () => {
    const source = fs.readFileSync(
      "base44/functions/dispatchWebhook/entry.ts",
      "utf8",
    );
    const deliverySchema = JSON.parse(
      fs.readFileSync("base44/entities/WebhookDelivery.jsonc", "utf8"),
    );
    expect(source.indexOf("prepareWebhookDispatchIntent")).toBeLessThan(
      source.indexOf("finalResult = await deliverOnce"),
    );
    expect(source.indexOf("claimWebhookDeadLetter")).toBeLessThan(
      source.indexOf("finalResult = await deliverOnce"),
    );
    expect(source.indexOf("markWebhookDeliveryStarted")).toBeLessThan(
      source.indexOf("finalResult = await deliverOnce"),
    );
    expect(source).toContain("webhook_dispatch_idempotency_key_required");
    expect(source).toContain("persistWebhookDeliveryReceipt");
    expect(source).toContain("webhook_endpoint_inventory_incomplete");
    expect(deliverySchema.rls.write.user_condition.role).toBe("__service_role_only__");
  });
});
