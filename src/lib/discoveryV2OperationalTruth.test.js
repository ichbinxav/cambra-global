import { describe, expect, it } from "vitest";
import {
  acceptedDiscoveryPlanHash,
  claimDiscoveryRun,
  commitDiscoveryStage,
  discoveryLeaseActive,
  requestDiscoveryStop,
} from "../../base44/shared/discoveryV2Execution.ts";
import {
  advanceScheduledDiscoveryRevision,
  claimScheduledDiscoveryView,
  DISCOVERY_SCHEDULE_CLAIM_MS,
  findScheduledDiscoveryRun,
  recoverPreparedScheduledRevision,
  scheduledDiscoveryClaimActive,
} from "../../base44/shared/discoveryV2Admin.ts";
import {
  buildDiscoveryPartitions,
  classifyDiscoveryScore,
  planDiscoveryQuery,
} from "../../base44/shared/discoveryV2Planner.ts";
import fs from "node:fs";
import path from "node:path";

function fakeRun(overrides = {}) {
  return {
    id: "run-1",
    status: "RUNNING",
    current_stage: "SCORING",
    run_revision: 0,
    stage_attempt: 0,
    errors_json: [],
    ...overrides,
  };
}

function serviceFor(initial) {
  let current = structuredClone(initial);
  const entity = {
    async get(id) {
      return id === current.id ? structuredClone(current) : null;
    },
    async updateMany(filter, operation) {
      const matches = Object.entries(filter).every(
        ([key, value]) => current[key] === value,
      );
      if (!matches) return { updated: 0 };
      current = { ...current, ...(operation.$set || {}) };
      return { updated: 1 };
    },
  };
  return {
    entities: { DiscoveryExecutionRun: entity },
    current: () => structuredClone(current),
  };
}

function scheduledView(overrides = {}) {
  return {
    id: "view-1",
    view_key: "discovery:merchants-fr",
    name: "Merchants FR",
    view_type: "discovery_saved_search",
    revision: 1,
    is_current: true,
    immutable_config_hash: "hash-v1",
    config_json: {
      discovery_type: "MERCHANT",
      schedule: {
        enabled: true,
        status: "ACTIVE",
        cadence_days: 7,
        next_run_at: "2026-08-01T00:00:00.000Z",
      },
    },
    created_by: "founder@example.com",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function scheduleServiceFor(initialViews, initialRuns = []) {
  const views = new Map(
    initialViews.map((row) => [row.id, structuredClone(row)]),
  );
  const runs = initialRuns.map((row) => structuredClone(row));
  let sequence = initialViews.length;
  const matches = (row, filter) =>
    Object.entries(filter).every(([key, value]) => row[key] === value);
  const savedView = {
    async get(id) {
      const row = views.get(id);
      if (!row) throw new Error("not_found");
      return structuredClone(row);
    },
    async filter(filter) {
      return [...views.values()]
        .filter((row) => matches(row, filter))
        .map((row) => structuredClone(row));
    },
    async create(row) {
      const created = { ...structuredClone(row), id: `view-${++sequence}` };
      views.set(created.id, created);
      return structuredClone(created);
    },
    async updateMany(filter, operation) {
      const matching = [...views.values()].filter((row) =>
        matches(row, filter),
      );
      for (const row of matching) {
        views.set(row.id, { ...row, ...(operation.$set || {}) });
      }
      return { updated: matching.length };
    },
  };
  return {
    entities: {
      FounderSavedView: savedView,
      DiscoveryExecutionRun: {
        async filter(filter) {
          return runs
            .filter((row) => matches(row, filter))
            .map((row) => structuredClone(row));
        },
      },
    },
    views: () => [...views.values()].map((row) => structuredClone(row)),
  };
}

/* global process */
describe("Discovery V2 operational truth", () => {
  const read = (file) =>
    fs.readFileSync(path.join(process.cwd(), file), "utf8");
  it("preserves every multiselect native dimension or blocks an oversized cartesian product", () => {
    const config = {
      filters: {
        country: ["FR", "ES"],
        industry: ["retail", "travel"],
        company_size: ["10-49", "50-199"],
        technology: ["shopify", "magento"],
      },
    };
    const plan = buildDiscoveryPartitions(config, "APOLLO");
    expect(plan.requested_count).toBe(16);
    expect(plan.partitions).toHaveLength(16);
    expect(new Set(plan.partitions.map((row) => row.filters.country))).toEqual(
      new Set(["FR", "ES"]),
    );
    const overflow = buildDiscoveryPartitions(
      {
        filters: {
          country: Array.from({ length: 9 }, (_, index) => `C${index}`),
          industry: Array.from({ length: 8 }, (_, index) => `I${index}`),
        },
      },
      "APOLLO",
    );
    expect(overflow.overflow).toBe(true);
    expect(overflow.partitions).toEqual([]);
  });

  it("makes requested/applied/unapplied filters explicit in the accepted plan", () => {
    const plan = planDiscoveryQuery(
      {
        discovery_type: "MERCHANT",
        source_mode: "APOLLO",
        target_count: 20,
        hard_cap_minor: 500,
        filters: {
          country: ["FR", "ES"],
          industry: ["retail"],
          actual_tpv: ["high"],
        },
      },
      {
        monthly_remaining_minor: 10_000,
        estimated_api_unit_minor: 10,
        unit_cost_minor: { APOLLO: 10 },
        source_health: { APOLLO: { available: true, status: "ACTIVE" } },
      },
    );
    expect(plan.filter_execution_contract.applied).toBe(2);
    expect(plan.filter_execution_contract.unapplied).toBe(1);
    expect(
      plan.classification.find((row) => row.field === "actual_tpv"),
    ).toMatchObject({ execution_status: "REQUIRES_MERCHANT_DATA" });
    expect(plan.source_partitions).toHaveLength(2);
  });

  it("never converts an unknown score into Low or zero", () => {
    expect(classifyDiscoveryScore(null, 70)).toBe("UNKNOWN");
    expect(classifyDiscoveryScore(undefined, 70)).toBe("UNKNOWN");
    expect(classifyDiscoveryScore("", 70)).toBe("UNKNOWN");
    expect(classifyDiscoveryScore(0, 70)).toBe("LOW");
  });

  it("acquires exactly one stage lease under a concurrent race", async () => {
    const service = serviceFor(fakeRun());
    const [left, right] = await Promise.all([
      claimDiscoveryRun(service, fakeRun(), "worker-a", 1_000),
      claimDiscoveryRun(service, fakeRun(), "worker-b", 1_000),
    ]);
    expect([left, right].filter((result) => result.acquired)).toHaveLength(1);
    expect(discoveryLeaseActive(service.current(), 1_001)).toBe(true);
  });

  it("fences stale commits and permits only the claim owner to advance", async () => {
    const service = serviceFor(fakeRun());
    const claim = await claimDiscoveryRun(
      service,
      fakeRun(),
      "worker-a",
      1_000,
    );
    await expect(
      commitDiscoveryStage(
        service,
        {
          ...claim,
          token: "stale-token",
        },
        { current_stage: "COMPLETE", status: "COMPLETED" },
      ),
    ).rejects.toThrow("discovery_stage_fence_lost");
    const completed = await commitDiscoveryStage(service, claim, {
      current_stage: "COMPLETE",
      status: "COMPLETED",
    });
    expect(completed.status).toBe("COMPLETED");
    expect(completed.lease_owner).toBe("");
    expect(completed.actual_stages_json).toEqual([
      expect.objectContaining({
        stage: "SCORING",
        status: "COMPLETED",
        started_at: new Date(1_000).toISOString(),
        attempt: 1,
      }),
    ]);
  });

  it("keeps durable stage history append-only for replay reconstruction", async () => {
    const source = fakeRun({
      actual_stages_json: [{
        stage: "PLAN",
        status: "COMPLETED",
        at: "2026-01-01T00:00:00.000Z",
      }],
    });
    const service = serviceFor(source);
    const claim = await claimDiscoveryRun(service, source, "worker-a", 1_000);
    await expect(commitDiscoveryStage(service, claim, {
      current_stage: "COMPLETE",
      status: "COMPLETED",
      actual_stages_json: [],
    })).rejects.toThrow("discovery_stage_history_must_be_append_only");
  });

  it("turns an expired ambiguous paid effect into Needs Review", async () => {
    const run = fakeRun({
      current_stage: "NATIVE_DISCOVERY",
      lease_owner: "dead-worker",
      lease_expires_at: new Date(500).toISOString(),
      checkpoint_json: {
        stage: "NATIVE_DISCOVERY",
        effect_status: "STARTED",
        material_effect: true,
      },
    });
    const service = serviceFor(run);
    const result = await claimDiscoveryRun(service, run, "recovery", 1_000);
    expect(result.review_required).toBe(true);
    expect(result.run.status).toBe("NEEDS_REVIEW");
    expect(result.run.stop_reason).toBe("AMBIGUOUS_MATERIAL_STAGE_EFFECT");
    expect(result.run.actual_stages_json).toEqual([
      expect.objectContaining({
        stage: "NATIVE_DISCOVERY",
        status: "NEEDS_REVIEW",
        paid: true,
      }),
    ]);
  });

  it("uses CAS for founder stop so it cannot silently overwrite a worker transition", async () => {
    const service = serviceFor(fakeRun());
    const stopped = await requestDiscoveryStop(service, fakeRun());
    expect(stopped.stop_requested).toBe(true);
    await expect(requestDiscoveryStop(service, fakeRun())).rejects.toThrow(
      "discovery_stop_changed_concurrently",
    );
  });

  it("binds acceptance to a SHA-256 digest of filters, partitions and cost", async () => {
    const base = {
      engine_version: "v",
      source_capability_version: "c",
      configuration: { filters: { country: ["FR"] } },
      selected_source: "APOLLO",
      filter_execution_contract: { applied: 1 },
      source_partitions: [{ filters: { country: "FR" } }],
      cost: { estimated_minor: 10 },
      stages: ["PLAN"],
    };
    const first = await acceptedDiscoveryPlanHash(base);
    const changed = await acceptedDiscoveryPlanHash({
      ...base,
      source_partitions: [{ filters: { country: "ES" } }],
    });
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(changed).not.toBe(first);
  });

  it("scores every attributed merchant in bounded 50-record batches and records coverage", () => {
    const backend = read("base44/shared/discoveryV2Admin.ts");
    expect(backend).toMatch(
      /for \(let offset = 0; offset < allIds\.length; offset \+= 50\)/,
    );
    expect(backend).toContain(
      "const batch = allIds.slice(offset, offset + 50)",
    );
    expect(backend).toContain("scoring_coverage_json: coverage");
    expect(backend).toContain("result_snapshot_json: snapshots");
    expect(backend).toContain("terminal_snapshot_hash: terminalHash");
    expect(backend).not.toContain("lead_ids: list(run.result_ids, 50)");
  });

  it("removes client-driven execution and drains fairly through the existing worker host", () => {
    const backend = read("base44/shared/discoveryV2Admin.ts");
    const ui = read("src/pages/admin/AdminDiscovery.jsx");
    expect(backend).toContain("client_driven_discovery_execution_removed");
    expect(backend).toContain("OLDEST_HEARTBEAT_FIRST");
    expect(backend).toContain("executeDiscoveryRun");
    expect(backend).toContain("reconcileDiscoveryExperienceBatch");
    expect(backend).toContain("rotatedRecoveryCandidates");
    expect(backend).toContain("experience_reconciliation");
    expect(ui).not.toContain("call('advance'");
    expect(ui).toMatch(/call\(['"]run['"],\{run_id:(?:active\.id|runId)\}\)/);
  });

  it("keeps run results scoped and freezes terminal summaries", () => {
    const backend = read("base44/shared/discoveryV2Admin.ts");
    expect(backend).toContain('error: "discovery_run_id_required"');
    expect(backend).toContain("attributed.has(");
    expect(backend).toContain("run.result_snapshot_json");
    expect(backend).not.toMatch(
      /async function listResults[\s\S]{0,2500}OutboundLead\.list/,
    );
  });

  it("versions saved searches instead of mutating historical configuration", () => {
    const schema = JSON.parse(read("base44/entities/FounderSavedView.jsonc"));
    expect(schema.properties.revision).toBeTruthy();
    expect(schema.properties.immutable_config_hash).toBeTruthy();
    const backend = read("base44/shared/discoveryV2Admin.ts");
    expect(backend).toContain("previous_revision_id: existing?.id || null");
    expect(backend).toContain(
      "const saved = await service.entities.FounderSavedView.create(row)",
    );
    expect(backend).toContain("saved_view_revision");
  });

  it("allows exactly one scheduler invocation to claim a due immutable revision", async () => {
    const original = scheduledView();
    const service = scheduleServiceFor([original]);
    const [left, right] = await Promise.all([
      claimScheduledDiscoveryView(service, original, "scheduler-a", 1_000),
      claimScheduledDiscoveryView(service, original, "scheduler-b", 1_000),
    ]);
    expect([left, right].filter((claim) => claim.acquired)).toHaveLength(1);
    const observed = service.views().find((view) => view.id === original.id);
    expect(scheduledDiscoveryClaimActive(observed, 1_001)).toBe(true);
    expect(observed.config_json).toEqual(original.config_json);
    expect(observed.immutable_config_hash).toBe(original.immutable_config_hash);
  });

  it("fences a live schedule claim and permits recovery only after lease expiry", async () => {
    const original = scheduledView();
    const service = scheduleServiceFor([original]);
    const first = await claimScheduledDiscoveryView(
      service,
      original,
      "scheduler-a",
      1_000,
    );
    const current = service.views().find((view) => view.id === original.id);
    const blocked = await claimScheduledDiscoveryView(
      service,
      current,
      "scheduler-b",
      1_001,
    );
    expect(blocked.in_progress).toBe(true);
    const recovered = await claimScheduledDiscoveryView(
      service,
      current,
      "scheduler-b",
      1_000 + DISCOVERY_SCHEDULE_CLAIM_MS + 1,
    );
    expect(recovered.acquired).toBe(true);
    expect(recovered.token).not.toBe(first.token);
  });

  it("deduplicates crash recovery by the claimed saved-view revision", async () => {
    const view = scheduledView();
    const run = {
      id: "run-scheduled-1",
      saved_view_id: view.id,
      saved_view_config_hash: view.immutable_config_hash,
      initiator: "SCHEDULED",
      status: "COMPLETED",
      started_at: "2026-08-01T00:00:00.000Z",
    };
    const service = scheduleServiceFor([view], [run]);
    const observed = await findScheduledDiscoveryRun(service, view);
    expect(observed.run.id).toBe(run.id);
    expect(observed.duplicate_count).toBe(0);
    const backend = fs.readFileSync(
      path.join(process.cwd(), "base44/shared/discoveryV2Admin.ts"),
      "utf8",
    );
    const scheduler = backend.slice(
      backend.indexOf(
        "export async function processScheduledDiscoverySearches",
      ),
      backend.indexOf("export async function handleDiscoveryV2Admin"),
    );
    expect(scheduler.indexOf("claimScheduledDiscoveryView")).toBeLessThan(
      scheduler.indexOf("const started = await startRun"),
    );
    expect(scheduler).toContain("RECOVERED_EXISTING_SCHEDULED_RUN");
  });

  it("writes the next cadence as a successor revision and never rewrites historical config", async () => {
    const original = scheduledView();
    const service = scheduleServiceFor([original]);
    const claim = await claimScheduledDiscoveryView(
      service,
      original,
      "scheduler-a",
      Date.parse("2026-08-01T00:00:00.000Z"),
    );
    const run = {
      id: "run-1",
      started_at: "2026-08-01T00:00:00.000Z",
    };
    const successor = await advanceScheduledDiscoveryRevision(
      service,
      claim,
      run,
      { now_ms: Date.parse("2026-08-01T00:01:00.000Z") },
    );
    const rows = service.views();
    const historical = rows.find((view) => view.id === original.id);
    expect(historical.is_current).toBe(false);
    expect(historical.config_json).toEqual(original.config_json);
    expect(successor.revision).toBe(2);
    expect(successor.previous_revision_id).toBe(original.id);
    expect(successor.is_current).toBe(true);
    expect(successor.config_json.schedule.last_run_id).toBe(run.id);
    expect(successor.config_json.schedule.next_run_at).not.toBe(
      original.config_json.schedule.next_run_at,
    );
  });

  it("recovers a successor prepared before a crash without starting another run", async () => {
    const predecessor = scheduledView({
      is_current: false,
      scheduler_claim_state: "CLAIMED",
      scheduler_claim_token: "claim-token",
      scheduler_occurrence_key: "occurrence-1",
    });
    const successor = scheduledView({
      id: "view-2",
      revision: 2,
      is_current: false,
      previous_revision_id: predecessor.id,
      scheduler_claim_state: "SUCCESSOR_PREPARED",
      scheduler_claim_token: "claim-token",
      scheduler_occurrence_key: "occurrence-1",
    });
    const service = scheduleServiceFor([predecessor, successor]);
    const recovered = await recoverPreparedScheduledRevision(
      service,
      service.views(),
    );
    expect(recovered.recovered).toBe(true);
    expect(recovered.view.id).toBe(successor.id);
    expect(recovered.view.is_current).toBe(true);
    expect(recovered.view.scheduler_claim_token).toBe("");
  });

  it("blocks generic user writes so terminal runs and saved revisions mutate only through service boundaries", () => {
    for (const file of [
      "base44/entities/DiscoveryExecutionRun.jsonc",
      "base44/entities/FounderSavedView.jsonc",
    ]) {
      const schema = JSON.parse(read(file));
      expect(schema.rls.write.user_condition.role).toBe(
        "__service_role_only__",
      );
    }
  });
});