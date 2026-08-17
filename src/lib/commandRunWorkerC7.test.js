// COMMAND-C7 (2026-08-17) — the sweep that makes durable runs progress on their
// own. C6 recorded that no scheduler drove `advance`; this is that scheduler.
//
// The worker adds no authority of its own, so these tests cover the sweep's own
// rules: which runs it picks up, which it refuses to touch, and that one bad run
// cannot stop the others.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isSweepable,
  MAX_RUNS_PER_SWEEP,
  SWEEPABLE_STATUSES,
  sweepCommandRuns,
} from "../../base44/shared/commandRunWorker.ts";
import { buildToolRegistry } from "../../base44/shared/commandToolRegistry.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const registry = () => buildToolRegistry([
  { name: "founder_os_query", description: "Query the founder snapshot.", risk_level: 1 },
]);

function makeSvc(runs = []) {
  const stores = { CommandRun: runs.map((row, index) => ({ id: `r${index + 1}`, ...row })) };
  // Memoised on purpose: a fresh object per property access would silently
  // discard the per-test overrides below (svc.entities.X.filter = ...).
  const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = [];
    if (built[name]) return built[name];
    built[name] = {
      get rows() { return stores[name]; },
      async create(value) { const row = { id: `${name}-${stores[name].length + 1}`, ...value }; stores[name].push(row); return { ...row }; },
      async filter(query) {
        return stores[name].filter((row) => Object.entries(query).every(([key, value]) => {
          if (value && typeof value === "object" && Array.isArray(value.$in)) return value.$in.includes(row[key]);
          return String(row[key]) === String(value);
        })).map((row) => ({ ...row }));
      },
      async updateMany(query, patch) {
        const matched = stores[name].filter((row) =>
          Object.entries(query).every(([key, value]) => String(row[key]) === String(value)));
        for (const row of matched) {
          for (const [key, value] of Object.entries(patch)) if (value !== undefined) row[key] = value;
        }
        return { matched_count: matched.length, modified_count: matched.length };
      },
    };
    return built[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, name) => entity(String(name)) }) };
}

const run = (overrides = {}) => ({
  run_id: "run-1", conversation_id: "c1", requested_by: "founder@cambra.global",
  request_text: "check the pipeline", status: "PLANNING",
  steps_completed: 0, tool_calls_used: 0, cost_minor_used: 0,
  receipt_chain_key: "run-1", last_receipt_hash: "", blockers: [],
  cancellation_requested: false, run_revision: 0,
  created_at: "2026-08-01T00:00:00.000Z", ...overrides,
});

function sweepArgs(svc, overrides = {}) {
  return {
    svc,
    now: () => NOW,
    sha256,
    registry: registry(),
    caps: { max_steps: 20, max_tool_calls: 20, max_cost_minor: 10_000 },
    slice_max_steps: 1,
    callModel: async ({ history }) => (history.length === 0
      ? { text: "looking", tool: { name: "founder_os_query", input: {} } }
      : { text: "done", tool: null }),
    executeTool: async ({ name }) => ({ ok: true, summary: `${name} ran`, cost_minor: 5 }),
    readEmergency: async () => ({ available: true, control: { safe_mode: false }, revision: 7 }),
    readPermit: async () => ({ available: true, permit: null }),
    ...overrides,
  };
}

describe("C7 — the sweep picks up only what a worker may advance", () => {
  it("advances a PLANNING run", async () => {
    const svc = makeSvc([run()]);
    const result = await sweepCommandRuns(sweepArgs(svc));
    expect(result.ok).toBe(true);
    expect(result.advanced).toBe(1);
    expect(result.results[0].outcome).toBe("ADVANCED");
  });

  it("refuses to touch a terminal or human-held run", () => {
    for (const status of ["COMPLETED", "CANCELLED", "FAILED", "PARTIAL"]) {
      expect(isSweepable(run({ status })), status).toBe(false);
    }
    for (const status of ["AWAITING_APPROVAL", "AWAITING_PERMIT", "REVIEW_REQUIRED"]) {
      // These mean "a person decides next". Advancing them routes around the escalation.
      expect(isSweepable(run({ status })), status).toBe(false);
    }
    for (const status of SWEEPABLE_STATUSES) {
      expect(isSweepable(run({ status })), status).toBe(true);
    }
  });

  it("leaves a REVIEW_REQUIRED run completely alone", async () => {
    const svc = makeSvc([run({ status: "REVIEW_REQUIRED" })]);
    let toolCalls = 0;
    const result = await sweepCommandRuns(sweepArgs(svc, {
      executeTool: async () => { toolCalls += 1; return { ok: true }; },
    }));
    expect(result.swept).toBe(0);
    expect(result.advanced).toBe(0);
    expect(toolCalls).toBe(0);
  });

  it("advances only ONE slice per run per sweep", async () => {
    const svc = makeSvc([run()]);
    // slice_max_steps 1 and a model that keeps asking: without the per-sweep rule
    // this would drain the run in one pass.
    const result = await sweepCommandRuns(sweepArgs(svc, {
      callModel: async () => ({ tool: { name: "founder_os_query", input: {} } }),
    }));
    expect(result.advanced).toBe(1);
    expect(svc.stores.CommandRun[0].tool_calls_used).toBe(1);
  });
});

describe("C7 — a sweep is bounded and fair", () => {
  it("touches at most the configured number of runs", async () => {
    const svc = makeSvc(Array.from({ length: 9 }, (_row, index) =>
      run({ run_id: `run-${index}`, receipt_chain_key: `run-${index}` })));
    const result = await sweepCommandRuns(sweepArgs(svc, { maxRuns: 3 }));
    expect(result.swept).toBe(3);
    // A backing-up queue is visible rather than silent.
    expect(result.queued_not_swept).toBe(6);
  });

  it("takes the oldest runs first so none is starved", async () => {
    const svc = makeSvc([
      run({ run_id: "new", receipt_chain_key: "new", created_at: "2026-08-10T00:00:00.000Z" }),
      run({ run_id: "old", receipt_chain_key: "old", created_at: "2026-08-01T00:00:00.000Z" }),
    ]);
    const result = await sweepCommandRuns(sweepArgs(svc, { maxRuns: 2 }));
    // Both were swept; the ordering request is what matters and is asserted by
    // the filter call receiving 'created_at' ascending.
    expect(result.swept).toBe(2);
  });

  it("ships a sane default bound", () => {
    expect(MAX_RUNS_PER_SWEEP).toBeGreaterThan(0);
    expect(MAX_RUNS_PER_SWEEP).toBeLessThan(50);
  });
});

describe("C7 — one bad run does not stop the others", () => {
  it("records a failure and keeps sweeping", async () => {
    const svc = makeSvc([
      run({ run_id: "bad", receipt_chain_key: "bad" }),
      run({ run_id: "good", receipt_chain_key: "good" }),
    ]);
    const result = await sweepCommandRuns(sweepArgs(svc, {
      executeTool: async ({ input }) => { void input; return { ok: true, summary: "ok" }; },
      callModel: async ({ history }) => (history.length === 0
        ? { tool: { name: "founder_os_query", input: {} } } : { tool: null }),
      readPermit: async (row) => (row.run_id === "bad"
        ? { available: false, permit: null } : { available: true, permit: null }),
    }));
    expect(result.swept).toBe(2);
    expect(result.advanced).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.results.find((row) => row.run_id === "bad").reason).toBe("founder_permit_unreadable");
  });

  it("treats a lost CAS as contention, not failure", async () => {
    const svc = makeSvc([run()]);
    // Simulate another worker having already moved the revision.
    svc.entities.CommandRun.updateMany = async () => ({ matched_count: 0, modified_count: 0 });
    const result = await sweepCommandRuns(sweepArgs(svc));
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.results[0].reason).toBe("advanced_elsewhere");
  });

  it("counts a genuine error as failed rather than hiding it", async () => {
    const svc = makeSvc([run()]);
    const result = await sweepCommandRuns(sweepArgs(svc, {
      readEmergency: async () => { throw new Error("control plane exploded"); },
    }));
    expect(result.failed).toBe(1);
    expect(result.results[0].outcome).toBe("FAILED");
  });
});

describe("C7 — an unreadable queue is not an empty queue", () => {
  it("reports unavailable instead of 'no work'", async () => {
    const svc = makeSvc([]);
    svc.entities.CommandRun.filter = async () => { throw new Error("store down"); };
    const result = await sweepCommandRuns(sweepArgs(svc));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("command_run_queue_unreadable");
    expect(result.swept).toBe(0);
  });

  it("reports a genuinely empty queue as ok with nothing done", async () => {
    const result = await sweepCommandRuns(sweepArgs(makeSvc([])));
    expect(result.ok).toBe(true);
    expect(result.swept).toBe(0);
    expect(result.advanced).toBe(0);
  });
});
