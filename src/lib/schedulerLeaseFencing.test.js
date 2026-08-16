import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  claimSchedulerRun,
  finishSchedulerRun,
  finishSchedulerRunOrThrow,
  heartbeatSchedulerRun,
  markSchedulerEffectStarted,
  schedulerClaimDeniedResponse,
  schedulerHttpResponseSucceeded,
} from "../../base44/shared/schedulerRun.ts";

function matches(candidate, filter) {
  return Object.entries(filter).every(([key, value]) => candidate[key] === value);
}

function schedulerStore() {
  const rows = [];
  let sequence = 0;
  const api = {
    async filter(filter, _order, limit) {
      return rows.filter((row) => matches(row, filter)).slice(0, limit);
    },
    async create(value) {
      const row = {
        id: `scheduler_${++sequence}`,
        created_date: new Date(sequence * 1000).toISOString(),
        ...structuredClone(value),
      };
      rows.push(row);
      return structuredClone(row);
    },
    async updateMany(filter, update) {
      const matchesRows = rows.filter((row) => matches(row, filter));
      for (const row of matchesRows) Object.assign(row, structuredClone(update.$set || {}));
      return { updated: matchesRows.length };
    },
    async update(id, patch) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row) throw new Error("not_found");
      Object.assign(row, structuredClone(patch));
      return structuredClone(row);
    },
  };
  return {
    svc: { entities: { SchedulerRun: api } },
    rows,
    control: () => rows.find((row) => row.record_kind === "CONTROL"),
  };
}

function request(kind = "SCHEDULED", key = "") {
  const headers = new Headers();
  if (kind === "SCHEDULED") headers.set("base44-scheduled-task", "true");
  if (kind === "INTERNAL") headers.set("x-cambra-internal", "true");
  if (key) headers.set("idempotency-key", key);
  return new Request("https://example.test/worker", { headers });
}

async function claimAndStart(svc, req, input) {
  const claim = await claimSchedulerRun(svc, req, input);
  if (!claim.allowed) return claim;
  return markSchedulerEffectStarted(svc, claim);
}

function schedulerCallerInventory() {
  const root = new URL("../../base44/functions/", import.meta.url).pathname;
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, "entry.ts"))
    .filter((file) => fs.existsSync(file))
    .map((file) => ({ file, source: fs.readFileSync(file, "utf8") }))
    .filter(({ source }) => /\bclaimSchedulerRun\s*\(/.test(source));
}

describe("scheduler lease and fencing authority", () => {
  it("marks only 2xx handler responses as successful scheduler executions", () => {
    expect(schedulerHttpResponseSucceeded(new Response(null, { status: 200 }))).toBe(true);
    expect(schedulerHttpResponseSucceeded(new Response(null, { status: 299 }))).toBe(true);
    for (const status of [300, 400, 401, 409, 429, 500, 503]) {
      expect(schedulerHttpResponseSucceeded(new Response(null, { status })), String(status))
        .toBe(false);
    }
  });

  it("requires direct claimants to propagate terminal fence ambiguity", async () => {
    const state = schedulerStore();
    const claim = await claimSchedulerRun(state.svc, request("SCHEDULED"), {
      worker_key: "finalize-required-worker",
      cadence_seconds: 300,
    });
    const stale = { ...claim, control_revision: claim.control_revision - 1 };
    const originalError = console.error;
    console.error = () => {};
    try {
      await expect(
        finishSchedulerRunOrThrow(state.svc, stale, {}, true),
      ).rejects.toMatchObject({
        name: "SchedulerExecutionEvidenceError",
        code: "SCHEDULER_EXECUTION_EVIDENCE_AMBIGUOUS",
        status: 503,
        reason: "scheduler_finalize_fence_lost",
        review_required: true,
      });
    } finally {
      console.error = originalError;
    }
  });

  it("does not leave direct scheduler finalization ambiguity silently ignored", () => {
    const explicitFinalizers = new Set([
      "commercialFollowUpWorker",
    ]);
    for (const { file, source } of schedulerCallerInventory()) {
      const name = path.basename(path.dirname(file));
      if (explicitFinalizers.has(name)) continue;
      expect(source, file).toContain("finishSchedulerRunOrThrow(");
      expect(source, file).not.toMatch(/\bfinishSchedulerRun\s*\(/);
    }
  });

  it("routes every direct scheduler claimant through the centralized denied response", () => {
    const callers = schedulerCallerInventory();
    expect(callers.map(({ file }) => path.basename(path.dirname(file))).sort()).toEqual([
      "alwaysOnLeadDiscoveryWorker",
      "autonomousCompanyOrchestrator",
      "autonomousPartnerWorker",
      "commercialFollowUpWorker",
      "costGovernanceWorker",
      "eclLifecycleScheduler",
      "getEuropeanGrowthCommandCenter",
      "instantlyProviderEventRetryWorker",
      "instantlyReconciliationWorker",
      "operatingHealthWorker",
      "outboundDeliverabilityManager",
      "outboundVolumeWorker",
      "postMeetingWorker",
      "processWebhookDeadLetters",
      "productionReadinessWorker",
      "reconcileRecoverBilling",
      "regulatoryMonitoringWorker",
    ]);
    for (const { file, source } of callers) {
      const claims = source.match(/\bclaimSchedulerRun\s*\(/g) || [];
      const starts = source.match(/\bmarkSchedulerEffectStarted\s*\(/g) || [];
      const deniedResponses = source.match(/\bschedulerClaimDeniedResponse\s*\(/g) || [];
      expect(starts.length, file).toBe(claims.length);
      expect(deniedResponses.length, file).toBe(claims.length + starts.length);
      expect(source, file).not.toMatch(
        /if\s*\(\s*![_A-Za-z][_A-Za-z0-9.]*\.allowed\s*\)[\s\S]{0,400}?duplicate_blocked\s*:\s*true/,
      );
    }
  });

  it("acknowledges only a proven duplicate and fails authority or fence ambiguity", async () => {
    const duplicate = schedulerClaimDeniedResponse({
      allowed: false,
      duplicate: true,
      duplicate_proven: true,
      reason: "same_worker_same_cadence_slot",
      run_key: "run-1",
    });
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      ok: true,
      duplicate_blocked: true,
      duplicate_proven: true,
    });

    const unprovenDuplicate = schedulerClaimDeniedResponse({
      allowed: false,
      duplicate: true,
      duplicate_proven: false,
      reason: "worker_single_flight_active",
      run_key: "run-unproven",
    });
    expect(unprovenDuplicate.status).toBe(503);

    const mislabeledAmbiguity = schedulerClaimDeniedResponse({
      allowed: false,
      duplicate: true,
      duplicate_proven: true,
      reason: "scheduler_effect_fence_lost",
      run_key: "run-mislabeled",
    });
    expect(mislabeledAmbiguity.status).toBe(503);

    for (const reason of [
      "scheduler_control_unavailable",
      "scheduler_control_duplicate",
      "scheduler_claim_conflict",
      "scheduler_effect_fence_lost",
    ]) {
      const blocked = schedulerClaimDeniedResponse({
        allowed: false,
        duplicate: false,
        review_required: reason.includes("fence"),
        reason,
        run_key: "run-2",
      });
      expect(blocked.status).toBe(503);
      await expect(blocked.json()).resolves.toMatchObject({
        ok: false,
        duplicate_blocked: false,
        duplicate_proven: false,
        reason,
      });
    }
  });

  it("fails closed if concurrent cold bootstrap creates duplicate controls", async () => {
    const state = schedulerStore();
    const [a, b] = await Promise.all([
      claimSchedulerRun(state.svc, request("SCHEDULED"), {
        worker_key: "cold-worker",
        cadence_seconds: 300,
      }),
      claimSchedulerRun(state.svc, request("INTERNAL", "cold-start"), {
        worker_key: "cold-worker",
        cadence_seconds: 300,
      }),
    ]);
    expect([a.allowed, b.allowed].filter(Boolean).length).toBeLessThanOrEqual(1);
    if (state.rows.filter((row) => row.record_kind === "CONTROL").length > 1) {
      expect(a.allowed).toBe(false);
      expect(b.allowed).toBe(false);
      expect([a.reason, b.reason]).toContain("scheduler_control_duplicate");
    }
  });

  it("returns an operational failure when scheduler authority cannot be read", async () => {
    const state = schedulerStore();
    state.svc.entities.SchedulerRun.filter = async () => {
      throw new Error("injected_authority_read_failure");
    };
    const result = await claimAndStart(state.svc, request("SCHEDULED"), {
      worker_key: "unreadable-worker",
      cadence_seconds: 300,
    });
    expect(result).toMatchObject({
      allowed: false,
      duplicate: false,
      reason: "scheduler_control_unavailable",
    });
    expect(schedulerClaimDeniedResponse(result).status).toBe(503);
    expect(state.rows.at(-1)).toMatchObject({
      status: "FAILED",
      details_json: { duplicate_proven: false },
    });
  });

  it("fails closed and emits an observable event when control bootstrap persistence fails", async () => {
    const state = schedulerStore();
    const originalCreate = state.svc.entities.SchedulerRun.create;
    state.svc.entities.SchedulerRun.create = async (value) => {
      if (value?.record_kind === "CONTROL") {
        throw Object.assign(new Error("injected_bootstrap_failure"), {
          code: "BOOTSTRAP_WRITE_FAILED",
        });
      }
      return originalCreate(value);
    };
    const logged = [];
    const originalError = console.error;
    console.error = (...args) => logged.push(args.join(" "));
    try {
      const result = await claimSchedulerRun(state.svc, request("SCHEDULED"), {
        worker_key: "bootstrap-failure-worker",
        cadence_seconds: 300,
      });
      expect(result).toMatchObject({
        allowed: false,
        duplicate: false,
        reason: "scheduler_control_bootstrap_unavailable",
      });
      expect(schedulerClaimDeniedResponse(result).status).toBe(503);
      expect(logged.join("\n")).toContain("scheduler_authority_operation_failed");
      expect(logged.join("\n")).toContain("scheduler_control_bootstrap");
    } finally {
      console.error = originalError;
    }
  });

  it("fails closed if the durable RUNNING attempt projection cannot be persisted", async () => {
    const state = schedulerStore();
    const originalUpdateMany = state.svc.entities.SchedulerRun.updateMany;
    state.svc.entities.SchedulerRun.updateMany = async (filter, update) => {
      if (update?.$set?.status === "RUNNING" && update?.$set?.effects_started === true) {
        throw new Error("injected_attempt_start_failure");
      }
      return originalUpdateMany(filter, update);
    };
    const result = await claimAndStart(state.svc, request("SCHEDULED"), {
      worker_key: "attempt-start-failure-worker",
      cadence_seconds: 300,
    });
    expect(result).toMatchObject({
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: "scheduler_attempt_start_persistence_failed",
    });
    expect(schedulerClaimDeniedResponse(result).status).toBe(503);
  });

  it("does not relabel CAS or effect-fence loss as a duplicate", async () => {
    const cas = schedulerStore();
    const casUpdate = cas.svc.entities.SchedulerRun.updateMany;
    cas.svc.entities.SchedulerRun.updateMany = async (filter, update) => {
      if (update?.$set?.control_state === "CLAIMED") return { updated: 0 };
      return casUpdate(filter, update);
    };
    const conflicted = await claimSchedulerRun(cas.svc, request("SCHEDULED"), {
      worker_key: "cas-worker",
      cadence_seconds: 300,
    });
    expect(conflicted).toMatchObject({
      allowed: false,
      duplicate: false,
      reason: "scheduler_claim_conflict",
    });
    expect(schedulerClaimDeniedResponse(conflicted).status).toBe(503);

    const fence = schedulerStore();
    const fenceUpdate = fence.svc.entities.SchedulerRun.updateMany;
    fence.svc.entities.SchedulerRun.updateMany = async (filter, update) => {
      if (update?.$set?.control_state === "RUNNING") return { updated: 0 };
      return fenceUpdate(filter, update);
    };
    const lost = await claimAndStart(fence.svc, request("SCHEDULED"), {
      worker_key: "fence-worker",
      cadence_seconds: 300,
    });
    expect(lost).toMatchObject({
      allowed: false,
      duplicate: false,
      review_required: true,
      reason: "scheduler_effect_fence_lost",
    });
    expect(schedulerClaimDeniedResponse(lost).status).toBe(503);
  });

  it("fails closed when scheduler CAS counters contradict each other", async () => {
    const claimState = schedulerStore();
    const claimUpdate = claimState.svc.entities.SchedulerRun.updateMany;
    claimState.svc.entities.SchedulerRun.updateMany = async (filter, update) => {
      if (update?.$set?.control_state === "CLAIMED") {
        await claimUpdate(filter, update);
        return { updated: 1, matched_count: 2 };
      }
      return claimUpdate(filter, update);
    };
    const claim = await claimSchedulerRun(
      claimState.svc,
      request("SCHEDULED"),
      { worker_key: "contradictory-claim-worker", cadence_seconds: 300 },
    );
    expect(claim).toMatchObject({
      allowed: false,
      reason: "scheduler_claim_conflict",
    });

    const finishState = schedulerStore();
    const started = await claimAndStart(
      finishState.svc,
      request("SCHEDULED"),
      { worker_key: "contradictory-finish-worker", cadence_seconds: 300 },
    );
    expect(started.allowed).toBe(true);
    const finishUpdate = finishState.svc.entities.SchedulerRun.updateMany;
    finishState.svc.entities.SchedulerRun.updateMany = async (filter, update) => {
      if (update?.$set?.status === "COMPLETED") {
        await finishUpdate(filter, update);
        return { updated: 1, matched_count: 2 };
      }
      return finishUpdate(filter, update);
    };
    await expect(
      finishSchedulerRun(finishState.svc, started, {}, true),
    ).resolves.toMatchObject({
      ok: false,
      reason: "scheduler_finalize_fence_lost",
    });
    expect(finishState.control()).toMatchObject({
      control_state: "RUNNING",
      control_effects_started: true,
    });
  });

  it("rejects explicit scheduler CAS failure flags despite an updated counter", async () => {
    for (const failureStatus of [{ success: false }, { ok: false }]) {
      const state = schedulerStore();
      const originalUpdate = state.svc.entities.SchedulerRun.updateMany;
      state.svc.entities.SchedulerRun.updateMany = async (filter, update) => {
        const result = await originalUpdate(filter, update);
        if (update?.$set?.control_state === "CLAIMED" && result.updated === 1) {
          return { ...failureStatus, updated: 1 };
        }
        return result;
      };
      const claim = await claimSchedulerRun(
        state.svc,
        request("SCHEDULED"),
        {
          worker_key: `negative-status-${Object.keys(failureStatus)[0]}`,
          cadence_seconds: 300,
        },
      );
      expect(claim, JSON.stringify(failureStatus)).toMatchObject({
        allowed: false,
        duplicate: false,
        reason: "scheduler_claim_conflict",
      });
    }
  });

  it("serializes concurrent claimants across every trigger kind", async () => {
    const fresh = schedulerStore();
    const bootstrap = await claimAndStart(fresh.svc, request("INTERNAL", "bootstrap"), {
      worker_key: "worker-a",
      cadence_seconds: 300,
    });
    await finishSchedulerRun(fresh.svc, bootstrap, {}, true);
    const [scheduled, manual] = await Promise.all([
      claimAndStart(fresh.svc, request("SCHEDULED"), {
        worker_key: "worker-a",
        cadence_seconds: 300,
      }),
      claimAndStart(fresh.svc, request("MANUAL", "manual-1"), {
        worker_key: "worker-a",
        cadence_seconds: 300,
      }),
    ]);
    expect(
      [scheduled.allowed, manual.allowed].filter(Boolean),
      JSON.stringify([scheduled, manual]),
    ).toHaveLength(1);
    expect(fresh.rows.filter((row) => row.status === "RUNNING")).toHaveLength(1);
    expect(fresh.control()).toMatchObject({
      control_state: "RUNNING",
      control_effects_started: true,
    });
  });

  it("acknowledges only an exact active replay and rejects different work", async () => {
    const state = schedulerStore();
    const active = await claimAndStart(
      state.svc,
      request("INTERNAL"),
      {
        worker_key: "active-identity-worker",
        cadence_seconds: 300,
        operation_key: "operation-a",
        effect_key: "effect-a",
      },
    );
    expect(active.allowed).toBe(true);

    const exactReplay = await claimSchedulerRun(
      state.svc,
      request("MANUAL"),
      {
        worker_key: "active-identity-worker",
        cadence_seconds: 300,
        operation_key: "operation-a",
        effect_key: "effect-a",
      },
    );
    expect(exactReplay).toMatchObject({
      allowed: false,
      duplicate: true,
      duplicate_proven: true,
      reason: "worker_single_flight_active",
    });
    expect(schedulerClaimDeniedResponse(exactReplay).status).toBe(200);

    const differentWork = await claimSchedulerRun(
      state.svc,
      request("MANUAL"),
      {
        worker_key: "active-identity-worker",
        cadence_seconds: 300,
        operation_key: "operation-b",
        effect_key: "effect-b",
      },
    );
    expect(differentWork).toMatchObject({
      allowed: false,
      duplicate: false,
      duplicate_proven: false,
      reason: "worker_single_flight_conflict",
      active_operation_key:
        "active-identity-worker:operation:operation-a",
      active_effect_key: "active-identity-worker:effect:effect-a",
    });
    expect(schedulerClaimDeniedResponse(differentWork).status).toBe(503);
  });

  it("gives scheduled, manual and internal triggers one operation and one effect", async () => {
    const state = schedulerStore();
    // Bootstrap the singleton authority before the race. The in-memory store
    // deliberately has no entity uniqueness guarantee; cold bootstrap races
    // are covered separately and fail closed on duplicate controls.
    const bootstrap = await claimSchedulerRun(
      state.svc,
      request("INTERNAL", "bootstrap"),
      { worker_key: "three-trigger-worker", cadence_seconds: 300 },
    );
    await finishSchedulerRun(state.svc, bootstrap, {}, true);
    const operationKey = "shared-operation";
    const claims = await Promise.all([
      claimSchedulerRun(state.svc, request("SCHEDULED", operationKey), {
        worker_key: "three-trigger-worker", cadence_seconds: 300,
      }),
      claimSchedulerRun(state.svc, request("MANUAL", operationKey), {
        worker_key: "three-trigger-worker", cadence_seconds: 300,
      }),
      claimSchedulerRun(state.svc, request("INTERNAL", operationKey), {
        worker_key: "three-trigger-worker", cadence_seconds: 300,
      }),
    ]);
    const winners = claims.filter((claim) => claim.allowed);
    expect(winners).toHaveLength(1);
    expect(winners[0]).toMatchObject({
      operation_key: "three-trigger-worker:operation:shared-operation",
      effect_key: "three-trigger-worker:effect:shared-operation",
    });
    const started = await markSchedulerEffectStarted(state.svc, winners[0]);
    expect(started).toMatchObject({ allowed: true, effect_started: true });
    let providerEffects = 0;
    if (started.allowed) providerEffects += 1;
    expect(providerEffects).toBe(1);
    await finishSchedulerRun(state.svc, started, { provider_effects: 1 }, true);
    const replay = await claimSchedulerRun(
      state.svc,
      request("MANUAL", operationKey),
      { worker_key: "three-trigger-worker", cadence_seconds: 300 },
    );
    expect(replay).toMatchObject({
      allowed: false,
      duplicate: true,
      duplicate_proven: true,
      reason: "same_logical_operation",
    });
  });

  it("deduplicates the same manual replay identity but separates distinct subjects", async () => {
    const state = schedulerStore();
    const first = await claimAndStart(
      state.svc,
      request("MANUAL", "manual-replay:dead_letter_1"),
      { worker_key: "dlq-worker", cadence_seconds: 300 },
    );
    expect(first).toMatchObject({
      allowed: true,
      operation_key: "dlq-worker:operation:manual-replay:dead_letter_1",
      effect_key: "dlq-worker:effect:manual-replay:dead_letter_1",
    });
    await finishSchedulerRun(state.svc, first, {}, true);

    const sameSubject = await claimSchedulerRun(
      state.svc,
      request("MANUAL", "manual-replay:dead_letter_1"),
      { worker_key: "dlq-worker", cadence_seconds: 300 },
    );
    expect(sameSubject).toMatchObject({
      allowed: false,
      duplicate: true,
      duplicate_proven: true,
      reason: "same_logical_operation",
    });

    const distinctSubject = await claimSchedulerRun(
      state.svc,
      request("MANUAL", "manual-replay:dead_letter_2"),
      { worker_key: "dlq-worker", cadence_seconds: 300 },
    );
    expect(distinctSubject).toMatchObject({
      allowed: true,
      operation_key: "dlq-worker:operation:manual-replay:dead_letter_2",
      effect_key: "dlq-worker:effect:manual-replay:dead_letter_2",
    });
  });

  it("fences stale heartbeat and stale finalize", async () => {
    const state = schedulerStore();
    const claim = await claimAndStart(state.svc, request("SCHEDULED"), {
      worker_key: "worker-a",
      cadence_seconds: 300,
    });
    expect(claim.allowed).toBe(true);
    expect((await heartbeatSchedulerRun(state.svc, claim)).ok).toBe(true);
    const stale = { ...claim, control_revision: claim.control_revision - 1 };
    expect(await heartbeatSchedulerRun(state.svc, stale)).toMatchObject({
      ok: false,
      reason: "scheduler_heartbeat_fence_lost",
    });
    await expect(finishSchedulerRun(state.svc, stale, {}, true)).resolves.toMatchObject({
      ok: false,
      reason: "scheduler_finalize_fence_lost",
    });
    expect(state.control().control_state).toBe("RUNNING");
    await finishSchedulerRun(state.svc, claim, {}, true);
    expect(state.control()).toMatchObject({
      control_state: "IDLE",
      last_terminal_status: "COMPLETED",
    });
    expect(state.rows.find((row) => row.id === claim.run.id).status).toBe(
      "COMPLETED",
    );
  });

  it("blocks terminal replays with the same scheduled or explicit logical key", async () => {
    const scheduled = schedulerStore();
    const first = await claimAndStart(scheduled.svc, request("SCHEDULED"), {
      worker_key: "worker-a",
      cadence_seconds: 300,
    });
    await finishSchedulerRun(scheduled.svc, first, {}, true);
    const replay = await claimSchedulerRun(scheduled.svc, request("SCHEDULED"), {
      worker_key: "worker-a",
      cadence_seconds: 300,
    });
    expect(replay).toMatchObject({ allowed: false, duplicate: true });

    const internal = schedulerStore();
    const keyed = await claimAndStart(
      internal.svc,
      request("INTERNAL", "logical-command"),
      { worker_key: "worker-a", cadence_seconds: 300 },
    );
    await finishSchedulerRun(internal.svc, keyed, {}, true);
    const keyedReplay = await claimSchedulerRun(
      internal.svc,
      request("INTERNAL", "logical-command"),
      { worker_key: "worker-a", cadence_seconds: 300 },
    );
    expect(keyedReplay).toMatchObject({ allowed: false, duplicate: true });
  });

  it("deduplicates A after B using durable ATTEMPT history", async () => {
    const state = schedulerStore();
    const run = async (key) => {
      const claim = await claimAndStart(
        state.svc,
        request("INTERNAL", key),
        { worker_key: "historical-worker", cadence_seconds: 300 },
      );
      expect(claim.allowed).toBe(true);
      expect((await finishSchedulerRun(state.svc, claim, {}, true)).ok).toBe(true);
    };
    await run("operation-a");
    await run("operation-b");
    expect(state.control().last_terminal_operation_key).toBe(
      "historical-worker:operation:operation-b",
    );
    const replayA = await claimSchedulerRun(
      state.svc,
      request("INTERNAL", "operation-a"),
      { worker_key: "historical-worker", cadence_seconds: 300 },
    );
    expect(replayA).toMatchObject({
      allowed: false,
      duplicate: true,
      duplicate_proven: true,
      reason: "same_logical_operation",
    });
    const replayAAgain = await claimSchedulerRun(
      state.svc,
      request("MANUAL", "operation-a"),
      { worker_key: "historical-worker", cadence_seconds: 300 },
    );
    expect(replayAAgain).toMatchObject({
      allowed: false,
      duplicate: true,
      duplicate_proven: true,
      reason: "same_logical_operation",
    });
  });

  it("binds each durable operation and effect identity one-to-one", async () => {
    const state = schedulerStore();
    const first = await claimAndStart(
      state.svc,
      request("INTERNAL"),
      {
        worker_key: "binding-worker",
        cadence_seconds: 300,
        operation_key: "operation-a",
        effect_key: "effect-x",
      },
    );
    expect(first.allowed).toBe(true);
    expect((await finishSchedulerRun(state.svc, first, {}, true)).ok).toBe(true);

    const sameEffectDifferentOperation = await claimSchedulerRun(
      state.svc,
      request("INTERNAL"),
      {
        worker_key: "binding-worker",
        cadence_seconds: 300,
        operation_key: "operation-b",
        effect_key: "effect-x",
      },
    );
    expect(sameEffectDifferentOperation).toMatchObject({
      allowed: false,
      review_required: true,
      reason: "scheduler_operation_effect_binding_conflict",
      historical_operation_key: "binding-worker:operation:operation-a",
      historical_effect_key: "binding-worker:effect:effect-x",
    });
    expect(schedulerClaimDeniedResponse(sameEffectDifferentOperation).status).toBe(503);

    const sameOperationDifferentEffect = await claimSchedulerRun(
      state.svc,
      request("INTERNAL"),
      {
        worker_key: "binding-worker",
        cadence_seconds: 300,
        operation_key: "operation-a",
        effect_key: "effect-y",
      },
    );
    expect(sameOperationDifferentEffect).toMatchObject({
      allowed: false,
      review_required: true,
      reason: "scheduler_operation_effect_binding_conflict",
      historical_operation_key: "binding-worker:operation:operation-a",
      historical_effect_key: "binding-worker:effect:effect-x",
    });
    expect(schedulerClaimDeniedResponse(sameOperationDifferentEffect).status).toBe(503);
  });

  it("fails closed on ambiguous or unavailable durable operation history", async () => {
    const ambiguous = schedulerStore();
    const bootstrap = await claimSchedulerRun(ambiguous.svc, request("INTERNAL", "bootstrap"), {
      worker_key: "history-worker", cadence_seconds: 300,
    });
    await finishSchedulerRun(ambiguous.svc, bootstrap, {}, true);
    for (const id of ["history_1", "history_2"]) {
      ambiguous.rows.push({
        id,
        record_kind: "ATTEMPT",
        worker_key: "history-worker",
        operation_key: "history-worker:operation:ambiguous",
        claim_acquired: true,
        status: "COMPLETED",
        material_effect_state: "EXECUTED",
        effects_started: true,
      });
    }
    const conflict = await claimSchedulerRun(
      ambiguous.svc,
      request("INTERNAL", "ambiguous"),
      { worker_key: "history-worker", cadence_seconds: 300 },
    );
    expect(conflict).toMatchObject({
      allowed: false,
      review_required: true,
      reason: "scheduler_operation_history_ambiguous",
    });

    const unavailable = schedulerStore();
    const originalFilter = unavailable.svc.entities.SchedulerRun.filter;
    unavailable.svc.entities.SchedulerRun.filter = async (filter, ...rest) => {
      if (filter?.record_kind === "ATTEMPT" && filter?.operation_key) {
        throw new Error("injected_history_read_failure");
      }
      return originalFilter(filter, ...rest);
    };
    const blocked = await claimSchedulerRun(
      unavailable.svc,
      request("INTERNAL", "unavailable"),
      { worker_key: "history-worker", cadence_seconds: 300 },
    );
    expect(blocked).toMatchObject({
      allowed: false,
      review_required: true,
      reason: "scheduler_operation_history_unavailable",
    });
  });

  it("retries only pre-effect terminal history and quarantines post-effect failure", async () => {
    const pre = schedulerStore();
    const preClaim = await claimSchedulerRun(
      pre.svc,
      request("INTERNAL", "retryable"),
      { worker_key: "retry-worker", cadence_seconds: 300 },
    );
    expect((await finishSchedulerRun(pre.svc, preClaim, {}, false)).ok).toBe(true);
    const retry = await claimSchedulerRun(
      pre.svc,
      request("INTERNAL", "retryable"),
      { worker_key: "retry-worker", cadence_seconds: 300 },
    );
    expect(retry).toMatchObject({ allowed: true, effect_started: false });

    const post = schedulerStore();
    const started = await claimAndStart(
      post.svc,
      request("INTERNAL", "ambiguous-effect"),
      { worker_key: "post-worker", cadence_seconds: 300 },
    );
    const failed = await finishSchedulerRun(post.svc, started, {}, false);
    expect(failed).toMatchObject({ ok: true, status: "FAILED" });
    expect(post.control()).toMatchObject({
      control_state: "REVIEW_REQUIRED",
      control_effects_started: true,
    });
    const replay = await claimSchedulerRun(
      post.svc,
      request("INTERNAL", "ambiguous-effect"),
      { worker_key: "post-worker", cadence_seconds: 300 },
    );
    expect(replay).toMatchObject({
      allowed: false,
      review_required: true,
      reason: "scheduler_operation_history_requires_review",
      historical_material_state: "FAILED_POST_EFFECT",
    });
    expect(schedulerClaimDeniedResponse(replay).status).toBe(503);
  });

  it("quarantines takeover if the superseded pre-effect attempt cannot be settled", async () => {
    const state = schedulerStore();
    const now = new Date(0).toISOString();
    await state.svc.entities.SchedulerRun.create({
      record_kind: "CONTROL",
      control_key: "scheduler-control:takeover-failure-worker",
      control_state: "CLAIMED",
      control_revision: 7,
      control_token: "dead-token",
      control_owner: "dead-owner",
      control_expires_at: now,
      control_effects_started: false,
      active_attempt_id: "attempt_dead",
      run_key: "control:takeover-failure-worker",
      worker_key: "takeover-failure-worker",
      cadence_seconds: 300,
      invocation_kind: "INTERNAL",
      status: "COMPLETED",
      started_at: now,
    });
    state.rows.push({
      id: "attempt_dead",
      record_kind: "ATTEMPT",
      status: "CLAIMED",
      effects_started: false,
      attempt_token: "attempt-token",
    });
    const originalUpdate = state.svc.entities.SchedulerRun.updateMany;
    state.svc.entities.SchedulerRun.updateMany = async (filter, update) => {
      if (
        filter?.id === "attempt_dead" &&
        update?.$set?.status === "EXPIRED_PRE_EFFECT"
      ) return { updated: 0 };
      return originalUpdate(filter, update);
    };
    const result = await claimSchedulerRun(
      state.svc,
      request("INTERNAL", "recovery"),
      { worker_key: "takeover-failure-worker", cadence_seconds: 300 },
    );
    expect(result).toMatchObject({
      allowed: false,
      review_required: true,
      reason: "scheduler_superseded_attempt_not_persisted",
      quarantine_persisted: true,
    });
    expect(state.control().control_state).toBe("REVIEW_REQUIRED");
    expect(state.rows.filter((row) => row.claim_acquired === true)).toHaveLength(0);
  });

  it("quarantines an expired owner that had crossed the effect fence", async () => {
    const state = schedulerStore();
    const claim = await claimAndStart(state.svc, request("SCHEDULED"), {
      worker_key: "worker-a",
      cadence_seconds: 300,
    });
    const control = state.control();
    control.control_expires_at = new Date(0).toISOString();
    const retry = await claimSchedulerRun(
      state.svc,
      request("INTERNAL", "recovery"),
      { worker_key: "worker-a", cadence_seconds: 300 },
    );
    expect(claim.allowed).toBe(true);
    expect(retry).toMatchObject({
      allowed: false,
      review_required: true,
      reason: "scheduler_previous_effect_ambiguous",
    });
    expect(state.control().control_state).toBe("REVIEW_REQUIRED");
  });

  it("takes over an expired claim only when no effect ever started", async () => {
    const state = schedulerStore();
    const now = new Date(0).toISOString();
    await state.svc.entities.SchedulerRun.create({
      record_kind: "CONTROL",
      control_key: "scheduler-control:worker-a",
      control_state: "CLAIMED",
      control_revision: 7,
      control_token: "dead-token",
      control_owner: "dead-owner",
      control_expires_at: now,
      control_effects_started: false,
      active_attempt_id: "attempt_dead",
      run_key: "control:worker-a",
      worker_key: "worker-a",
      cadence_seconds: 300,
      invocation_kind: "INTERNAL",
      status: "COMPLETED",
      started_at: now,
    });
    state.rows.push({
      id: "attempt_dead",
      record_kind: "ATTEMPT",
      status: "CLAIMED",
      effects_started: false,
      attempt_token: "attempt-token",
    });
    const takeover = await claimSchedulerRun(
      state.svc,
      request("INTERNAL", "takeover"),
      { worker_key: "worker-a", cadence_seconds: 300 },
    );
    expect(takeover.allowed).toBe(true);
    expect(state.rows.find((row) => row.id === "attempt_dead").status).toBe(
      "EXPIRED_PRE_EFFECT",
    );
    expect(state.control()).toMatchObject({
      control_state: "CLAIMED",
      control_effects_started: false,
    });
  });

  it.each([
    ["CLAIMED", "", false],
    ["CLAIMED", "not-a-date", false],
    ["RUNNING", new Date(0).toISOString(), false],
    ["RUNNING", new Date(0).toISOString(), true],
  ])(
    "blocks unsafe takeover state=%s expiry=%s effects_started=%s",
    async (controlState, expiresAt, effectsStarted) => {
      const state = schedulerStore();
      const now = new Date(0).toISOString();
      await state.svc.entities.SchedulerRun.create({
        record_kind: "CONTROL",
        control_key: "scheduler-control:unsafe-worker",
        control_state: controlState,
        control_revision: 4,
        control_token: "old-token",
        control_owner: "old-owner",
        control_expires_at: expiresAt,
        control_effects_started: effectsStarted,
        active_attempt_id: "old-attempt",
        run_key: "control:unsafe-worker",
        worker_key: "unsafe-worker",
        cadence_seconds: 300,
        invocation_kind: "INTERNAL",
        status: "COMPLETED",
        started_at: now,
      });
      const result = await claimSchedulerRun(
        state.svc,
        request("INTERNAL", "recovery"),
        { worker_key: "unsafe-worker", cadence_seconds: 300 },
      );
      expect(result).toMatchObject({
        allowed: false,
        review_required: true,
        reason: "scheduler_previous_effect_ambiguous",
      });
      expect(state.control().control_state).toBe("REVIEW_REQUIRED");
    },
  );

  it("fails closed on duplicate control authority", async () => {
    const state = schedulerStore();
    await claimSchedulerRun(state.svc, request("SCHEDULED"), {
      worker_key: "worker-a",
      cadence_seconds: 300,
    });
    state.rows.push({
      ...structuredClone(state.control()),
      id: "duplicate-control",
      control_state: "IDLE",
      control_revision: 0,
      control_token: "",
    });
    const result = await claimSchedulerRun(
      state.svc,
      request("INTERNAL", "second"),
      { worker_key: "worker-a", cadence_seconds: 300 },
    );
    expect(result).toMatchObject({
      allowed: false,
      duplicate: false,
      reason: "scheduler_control_duplicate",
    });
    expect(state.rows.at(-1)).toMatchObject({
      status: "FAILED",
      details_json: { duplicate_proven: false },
    });
  });
});
