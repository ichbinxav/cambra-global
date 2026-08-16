import { describe, expect, it } from "vitest";
import {
  blockPaymentsMigrationSagaBeforeEffect,
  claimPaymentsMigrationSaga,
  finishPaymentsMigrationSagaStep,
  markPaymentsMigrationReconciliation,
  paymentsMigrationActivationAuthority,
  paymentsMigrationActivationCasFilter,
  paymentsMigrationActivationReadbackMatches,
  paymentsMigrationAuthorityRows,
  paymentsMigrationCasResult,
  paymentsMigrationSagaState,
  startPaymentsMigrationSagaStep,
  validatePaymentsMigrationReceiptChain,
} from "../../base44/shared/paymentsMigrationSaga.ts";

const copy = (value) => structuredClone(value);

function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) =>
    JSON.stringify(row[key]) === JSON.stringify(value)
  );
}

function taskRow() {
  return {
    id: "migration-task-1",
    deal_activation_id: "activation-1",
    status: "in_progress",
    completed_at: "",
    metadata_json: {
      plan_version: "payments-recover-p9-v1",
      customer_stage: "going_live",
      retry_count: 2,
    },
  };
}

function service(initialTask) {
  let task = copy(initialTask);
  const writes = [];
  return {
    writes,
    current: () => copy(task),
    entities: {
      MigrationTask: {
        get: async () => copy(task),
        filter: async () => [copy(task)],
        updateMany: async (filter, update) => {
          writes.push({ filter: copy(filter), update: copy(update) });
          if (!matches(task, filter)) return { updated: 0 };
          task = { ...task, ...copy(update.$set) };
          return { updated: 1 };
        },
      },
    },
  };
}

async function claimedService(operationKey = "go-live-A") {
  const svc = service(taskRow());
  const claim = await claimPaymentsMigrationSaga(svc, svc.current(), {
    operation_key: operationKey,
    now_ms: Date.parse("2026-08-14T08:00:00.000Z"),
  });
  return { svc, claim, operationKey };
}

describe("payments migration domain saga", () => {
  it("accepts only coherent exact-one CAS counters", () => {
    expect(paymentsMigrationCasResult({ updated: 1 })).toMatchObject({
      exactly_one: true,
      ambiguous: false,
    });
    expect(paymentsMigrationCasResult({ updated: 1, matched_count: 1 }))
      .toMatchObject({
        exactly_one: true,
        ambiguous: false,
      });
    expect(paymentsMigrationCasResult({ updated: 1, matched_count: 2 }))
      .toMatchObject({
        exactly_one: false,
        ambiguous: true,
      });
    expect(paymentsMigrationCasResult({ success: false, updated: 1 }))
      .toMatchObject({ exactly_one: false, ambiguous: true });
    expect(paymentsMigrationCasResult({})).toMatchObject({
      exactly_one: false,
      ambiguous: true,
    });
  });

  it("distinguishes missing, duplicate, and unavailable material authority", () => {
    expect(paymentsMigrationAuthorityRows(null).state).toBe("UNAVAILABLE");
    expect(paymentsMigrationAuthorityRows([]).state).toBe("MISSING");
    expect(paymentsMigrationAuthorityRows([{ id: "a" }, { id: "b" }]).state)
      .toBe("AMBIGUOUS");
    expect(paymentsMigrationAuthorityRows([{ id: "a" }])).toMatchObject({
      ok: true,
      state: "OBSERVED",
      row: { id: "a" },
    });
  });

  it("binds activation CAS and readback to the exact material authority", () => {
    const activation = {
      id: "activation-1",
      brand_id: "brand-1",
      provider_id: "provider-1",
      vertical: "payments",
      status: "migrating",
      updated_date: "2026-08-14T08:00:00.000Z",
      active_mandate_id: "mandate-1",
    };
    const authority = paymentsMigrationActivationAuthority(activation);
    expect(authority.revision_authority_available).toBe(true);
    expect(paymentsMigrationActivationCasFilter(authority)).toMatchObject({
      id: "activation-1",
      brand_id: "brand-1",
      provider_id: "provider-1",
      vertical: "payments",
      status: "migrating",
      updated_date: "2026-08-14T08:00:00.000Z",
      active_mandate_id: "mandate-1",
    });
    expect(paymentsMigrationActivationReadbackMatches(
      {
        ...activation,
        status: "live",
        updated_date: "2026-08-14T08:01:00.000Z",
      },
      authority,
      "live",
    )).toBe(true);
    expect(paymentsMigrationActivationReadbackMatches(
      { ...activation, status: "live", provider_id: "provider-2" },
      authority,
      "live",
    )).toBe(false);
  });

  it("CAS-fences concurrent claims and preserves legacy metadata", async () => {
    const svc = service(taskRow());
    const input = {
      operation_key: "go-live-A",
      now_ms: Date.parse("2026-08-14T08:00:00.000Z"),
    };
    const [left, right] = await Promise.all([
      claimPaymentsMigrationSaga(svc, taskRow(), input),
      claimPaymentsMigrationSaga(svc, taskRow(), input),
    ]);
    expect([left.acquired, right.acquired].filter(Boolean)).toHaveLength(1);
    expect([left.in_progress, right.in_progress].filter(Boolean)).toHaveLength(
      1,
    );
    expect(svc.current().metadata_json).toMatchObject({
      plan_version: "payments-recover-p9-v1",
      customer_stage: "going_live",
      retry_count: 2,
      migration_saga: {
        phase: "CLAIMED",
        operation_key: "go-live-A",
        revision: 1,
      },
    });
  });

  it("persists and verifies a content-addressed receipt before terminal replay", async () => {
    const { svc, claim, operationKey } = await claimedService();
    const attemptToken = paymentsMigrationSagaState(claim.task).attempt_token;
    const effecting = await startPaymentsMigrationSagaStep(svc, claim.task, {
      operation_key: operationKey,
      attempt_token: attemptToken,
      step_key: "activate_payments_go_live",
    });
    const committed = await finishPaymentsMigrationSagaStep(svc, effecting, {
      operation_key: operationKey,
      attempt_token: attemptToken,
      step_key: "activate_payments_go_live",
      result: {
        activation_id: "activation-1",
        activation_from: "migrating",
        activation_to: "live",
      },
      terminal_phase: "COMMITTED",
      task_patch: {
        status: "done",
        completed_at: "2026-08-14T08:01:00.000Z",
        metadata_json: {
          ...effecting.metadata_json,
          last_note: "provider cutover observed",
        },
      },
    });
    const chain = await validatePaymentsMigrationReceiptChain(committed);
    expect(chain).toMatchObject({ ok: true, receipt_count: 1 });
    expect(chain.receipt_head).toMatch(/^[a-f0-9]{64}$/);
    expect(committed.metadata_json.last_note).toBe("provider cutover observed");
    const replay = await claimPaymentsMigrationSaga(svc, committed, {
      operation_key: operationKey,
    });
    expect(replay).toMatchObject({ acquired: false, replay: true });
  });

  it("blocks a different operation against an already committed task", async () => {
    const { svc, claim, operationKey } = await claimedService("go-live-A");
    const token = paymentsMigrationSagaState(claim.task).attempt_token;
    const effecting = await startPaymentsMigrationSagaStep(svc, claim.task, {
      operation_key: operationKey,
      attempt_token: token,
      step_key: "activate_payments_go_live",
    });
    const committed = await finishPaymentsMigrationSagaStep(svc, effecting, {
      operation_key: operationKey,
      attempt_token: token,
      step_key: "activate_payments_go_live",
      result: { activation_to: "live" },
      terminal_phase: "COMMITTED",
      task_patch: { status: "done" },
    });
    const writesBefore = svc.writes.length;
    const conflict = await claimPaymentsMigrationSaga(svc, committed, {
      operation_key: "go-live-B",
    });
    expect(conflict).toMatchObject({
      acquired: false,
      replay: false,
      review_required: true,
      binding_conflict: true,
    });
    expect(svc.writes).toHaveLength(writesBefore);
  });

  it("quarantines a tampered committed chain instead of replaying it", async () => {
    const { svc, claim, operationKey } = await claimedService();
    const token = paymentsMigrationSagaState(claim.task).attempt_token;
    const effecting = await startPaymentsMigrationSagaStep(svc, claim.task, {
      operation_key: operationKey,
      attempt_token: token,
      step_key: "activate_payments_go_live",
    });
    const committed = await finishPaymentsMigrationSagaStep(svc, effecting, {
      operation_key: operationKey,
      attempt_token: token,
      step_key: "activate_payments_go_live",
      result: { activation_to: "live" },
      terminal_phase: "COMMITTED",
      task_patch: { status: "done" },
    });
    committed.metadata_json.migration_saga.receipts[0].result.activation_to =
      "paused";
    const tampered = service(committed);
    const result = await claimPaymentsMigrationSaga(tampered, committed, {
      operation_key: operationKey,
    });
    expect(result).toMatchObject({
      acquired: false,
      replay: false,
      review_required: true,
    });
    expect(paymentsMigrationSagaState(tampered.current())).toMatchObject({
      phase: "RECONCILING",
      automatic_retry_blocked: true,
    });
  });

  it("quarantines an expired post-effect lease instead of taking it over", async () => {
    const { svc, claim, operationKey } = await claimedService();
    const token = paymentsMigrationSagaState(claim.task).attempt_token;
    const effecting = await startPaymentsMigrationSagaStep(svc, claim.task, {
      operation_key: operationKey,
      attempt_token: token,
      step_key: "activate_payments_go_live",
    });
    effecting.metadata_json.migration_saga.lease_expires_at =
      "2026-08-14T08:01:00.000Z";
    const expiredSvc = service(effecting);
    const result = await claimPaymentsMigrationSaga(expiredSvc, effecting, {
      operation_key: operationKey,
      now_ms: Date.parse("2026-08-14T09:00:00.000Z"),
    });
    expect(result).toMatchObject({
      acquired: false,
      review_required: true,
    });
    expect(expiredSvc.current()).toMatchObject({
      status: "in_progress",
      metadata_json: {
        migration_saga: {
          phase: "RECONCILING",
          automatic_retry_blocked: true,
        },
      },
    });
  });

  it("allows takeover only for an expired pre-effect lease and fences the old owner", async () => {
    const { claim, operationKey } = await claimedService();
    const oldToken = paymentsMigrationSagaState(claim.task).attempt_token;
    const expired = copy(claim.task);
    expired.metadata_json.migration_saga.lease_expires_at =
      "2026-08-14T08:01:00.000Z";
    const svc = service(expired);
    const takeover = await claimPaymentsMigrationSaga(svc, expired, {
      operation_key: operationKey,
      now_ms: Date.parse("2026-08-14T09:00:00.000Z"),
    });
    expect(takeover).toMatchObject({ acquired: true, replay: false });
    expect(paymentsMigrationSagaState(takeover.task).attempt_token).not.toBe(
      oldToken,
    );
    await expect(startPaymentsMigrationSagaStep(svc, expired, {
      operation_key: operationKey,
      attempt_token: oldToken,
      step_key: "activate_payments_go_live",
    })).rejects.toMatchObject({
      code: "PAYMENTS_MIGRATION_EFFECT_START_AMBIGUOUS",
    });
    expect(paymentsMigrationSagaState(svc.current()).attempt_token).toBe(
      paymentsMigrationSagaState(takeover.task).attempt_token,
    );
  });

  it("treats a missing lease as unknown authority, never as expiry permission", async () => {
    const { claim, operationKey } = await claimedService();
    const unknownLease = copy(claim.task);
    unknownLease.metadata_json.migration_saga.lease_expires_at = "";
    const svc = service(unknownLease);
    const result = await claimPaymentsMigrationSaga(svc, unknownLease, {
      operation_key: operationKey,
      now_ms: Date.parse("2026-08-14T09:00:00.000Z"),
    });
    expect(result).toMatchObject({
      acquired: false,
      review_required: true,
    });
    expect(paymentsMigrationSagaState(svc.current())).toMatchObject({
      phase: "RECONCILING",
      blocker: "payments_migration_lease_authority_unknown",
    });
  });

  it("makes a pre-effect denial explicitly blocked and manually retryable", async () => {
    const { svc, claim, operationKey } = await claimedService();
    const token = paymentsMigrationSagaState(claim.task).attempt_token;
    const blocked = await blockPaymentsMigrationSagaBeforeEffect(
      svc,
      claim.task,
      {
        operation_key: operationKey,
        attempt_token: token,
        blocker: "emergency_epoch_changed_before_go_live",
      },
    );
    expect(blocked).toMatchObject({
      status: "blocked",
      blocked_reason: "emergency_epoch_changed_before_go_live",
      metadata_json: {
        migration_saga: {
          phase: "BLOCKED",
          effect_started: false,
          automatic_retry_blocked: false,
        },
      },
    });
  });

  it("converges to reconciliation when provider success cannot be checkpointed", async () => {
    const { svc, claim, operationKey } = await claimedService();
    const token = paymentsMigrationSagaState(claim.task).attempt_token;
    const effecting = await startPaymentsMigrationSagaStep(svc, claim.task, {
      operation_key: operationKey,
      attempt_token: token,
      step_key: "activate_payments_go_live",
    });
    const normalUpdate = svc.entities.MigrationTask.updateMany;
    let swallowFinish = true;
    svc.entities.MigrationTask.updateMany = async (filter, update) => {
      if (
        swallowFinish &&
        update?.$set?.metadata_json?.migration_saga?.phase === "COMMITTED"
      ) {
        swallowFinish = false;
        return { updated: 1 };
      }
      return normalUpdate(filter, update);
    };
    await expect(finishPaymentsMigrationSagaStep(svc, effecting, {
      operation_key: operationKey,
      attempt_token: token,
      step_key: "activate_payments_go_live",
      result: { provider_success: true, activation_to: "live" },
      terminal_phase: "COMMITTED",
      task_patch: { status: "done" },
    })).rejects.toMatchObject({
      code: "PAYMENTS_MIGRATION_EFFECT_RECEIPT_READBACK_MISMATCH",
    });
    const reconciled = await markPaymentsMigrationReconciliation(
      svc,
      svc.current(),
      "activation_live_receipt_commit_failed",
      { activation_status: "live" },
    );
    expect(reconciled).toMatchObject({
      status: "in_progress",
      metadata_json: {
        migration_saga: {
          phase: "RECONCILING",
          automatic_retry_blocked: true,
        },
      },
    });
  });
});
