// COMMAND-C6 (2026-08-17) — the durable executor's behaviour ACROSS invocations.
//
// The C4 loop's properties hold inside one slice. These tests cover what only
// matters between slices: compare-and-swap on run_revision, cancellation taking
// effect before work starts, the emergency epoch not being spanned by a resumed
// run, budgets bounding the whole run, and the receipt chain continuing across
// slices with a real hash function.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  advanceCommandRun,
  casRun,
  isHumanHeld,
  isTerminal,
  requestCancellation,
  runStatusForOutcome,
  startCommandRun,
} from "../../base44/shared/commandRunExecutor.ts";
import { buildToolRegistry } from "../../base44/shared/commandToolRegistry.ts";
import { verifyReceiptChain } from "../../base44/shared/commandReceiptLedger.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const DECLARED = [
  { name: "read_state", description: "Read canonical entity rows.", risk_level: 1 },
  { name: "founder_os_query", description: "Query the founder snapshot.", risk_level: 1 },
  { name: "discover_leads", description: "Search for outbound leads.", risk_level: 1 },
];
const registry = () => buildToolRegistry(DECLARED);

const PERMIT = {
  permit_id: "p1", objective: "Work the ES pipeline", issued_by: "founder@cambra.global",
  status: "ACTIVE", preset: "OPERATE", permit_hash: "hash-1",
  allowed_domains: ["discovery", "intelligence"],
  allowed_tool_ids: ["cambra.tool.discover_leads"],
  allowed_effect_classes: ["internal_write", "analysis"],
  allowed_entity_types: ["OutboundLead"], allowed_markets: ["ES"],
  allowed_environments: ["production"], explicit_denials: [],
  valid_from: "2020-01-01T00:00:00.000Z", expires_at: "2099-01-01T00:00:00.000Z",
  emergency_control_revision: 7,
};

/** In-memory store with real updateMany CAS semantics. */
function makeSvc() {
  const stores = {};
  const entity = (name) => {
    if (!stores[name]) {
      stores[name] = {
        rows: [],
        async create(value) {
          const row = { id: `${name}-${this.rows.length + 1}`, ...value };
          this.rows.push(row); return { ...row };
        },
        async filter(query, _sort, limit) {
          const found = this.rows.filter((row) =>
            Object.entries(query).every(([key, value]) => String(row[key]) === String(value)));
          return (typeof limit === "number" ? found.slice(0, limit) : found).map((row) => ({ ...row }));
        },
        async updateMany(query, patch) {
          const matched = this.rows.filter((row) =>
            Object.entries(query).every(([key, value]) => String(row[key]) === String(value)));
          for (const row of matched) {
            for (const [key, value] of Object.entries(patch)) {
              if (value !== undefined) row[key] = value;
            }
          }
          return { matched_count: matched.length, modified_count: matched.length };
        },
      };
    }
    return stores[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, name) => entity(String(name)) }) };
}

const runRow = (svc) => ({ ...svc.entities.CommandRun.rows[0] });

const scriptedModel = (script) => {
  let call = 0;
  return async () => {
    const next = script[call]; call += 1;
    return next ? { text: `step ${call}`, tool: next } : { text: "done", tool: null };
  };
};

function advanceArgs(svc, run, overrides = {}) {
  return {
    svc, run,
    registry: registry(),
    permit: PERMIT,
    caps: { max_steps: 20, max_tool_calls: 20, max_cost_minor: 10_000 },
    slice_max_steps: 2,
    now: () => NOW,
    sha256,
    market: "ES",
    callModel: scriptedModel([
      { name: "founder_os_query", input: {} },
      { name: "discover_leads", input: {} },
      { name: "read_state", input: {} },
    ]),
    executeTool: async ({ name }) => ({ ok: true, summary: `${name} ran`, cost_minor: 10 }),
    readEmergency: async () => ({
      available: true, control: { safe_mode: false, communications_paused: false }, revision: 7,
    }),
    ...overrides,
  };
}

async function openRun(svc) {
  await startCommandRun(svc, {
    conversation_id: "c1", requested_by: "founder@cambra.global",
    request_text: "work the ES pipeline", permit: PERMIT,
    now: NOW, newId: () => "run-1",
  });
  return runRow(svc);
}

describe("C6 — a run is durable and starts without executing anything", () => {
  it("persists the run in PLANNING with the permit bound and nothing done", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    expect(run.status).toBe("PLANNING");
    expect(run.permit_id).toBe("p1");
    expect(run.permit_hash).toBe("hash-1");
    expect(run.steps_completed).toBe(0);
    expect(run.tool_calls_used).toBe(0);
    expect(run.run_revision).toBe(0);
    expect(run.receipt_chain_key).toBe("run-1");
    // Opening a run is not doing the work.
    expect(svc.entities.CommandReceipt.rows).toHaveLength(0);
  });
});

describe("C6 — concurrency is compare-and-swap on run_revision", () => {
  it("advances the revision on every write", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    const next = await casRun(svc, run, { status: "RUNNING", updated_at: NOW }, "test");
    expect(next).toBe(1);
    expect(runRow(svc).run_revision).toBe(1);
  });

  it("refuses a write against a stale revision", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    await casRun(svc, run, { status: "RUNNING", updated_at: NOW }, "test");
    // `run` still carries revision 0 — a second worker holding the old read.
    await expect(casRun(svc, run, { status: "COMPLETED", updated_at: NOW }, "test"))
      .rejects.toThrow(/revision_conflict/);
  });

  it("stops a second worker from advancing the same slice", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    const first = await advanceCommandRun(advanceArgs(svc, run));
    expect(first.advanced).toBe(true);
    // The stale handle loses.
    await expect(advanceCommandRun(advanceArgs(svc, run))).rejects.toThrow(/revision_conflict/);
  });
});

describe("C6 — cancellation takes effect before work starts", () => {
  it("sets the flag rather than killing an in-flight slice", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    const result = await requestCancellation(svc, run, { reason: "changed my mind", now: NOW });
    expect(result.ok).toBe(true);
    expect(runRow(svc).cancellation_requested).toBe(true);
    expect(runRow(svc).cancellation_reason).toBe("changed my mind");
    // Still not terminal — a slice may be mid-flight and a paid call cannot be un-made.
    expect(runRow(svc).status).toBe("PLANNING");
  });

  it("refuses the next slice and runs no tool at all", async () => {
    const svc = makeSvc();
    let run = await openRun(svc);
    await requestCancellation(svc, run, { reason: "stop", now: NOW });
    run = runRow(svc);

    let toolCalls = 0;
    const result = await advanceCommandRun(advanceArgs(svc, run, {
      executeTool: async () => { toolCalls += 1; return { ok: true }; },
    }));
    expect(result.status).toBe("CANCELLED");
    expect(result.advanced).toBe(false);
    expect(result.may_continue).toBe(false);
    expect(toolCalls).toBe(0);
    expect(runRow(svc).blockers).toContain("cancelled_by_founder");
  });

  it("will not cancel a run that already finished", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    await casRun(svc, run, { status: "COMPLETED", updated_at: NOW }, "test");
    const result = await requestCancellation(svc, runRow(svc), { reason: "too late", now: NOW });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("run_already_terminal");
  });
});

describe("C6 — a resumed run may not span an emergency epoch change", () => {
  it("halts at REVIEW_REQUIRED when the revision moved between slices", async () => {
    const svc = makeSvc();
    let run = await openRun(svc);
    await advanceCommandRun(advanceArgs(svc, run));
    run = runRow(svc);
    expect(run.emergency_control_revision).toBe(7);

    let toolCalls = 0;
    const result = await advanceCommandRun(advanceArgs(svc, run, {
      readEmergency: async () => ({ available: true, control: { safe_mode: true }, revision: 8 }),
      executeTool: async () => { toolCalls += 1; return { ok: true }; },
    }));
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toBe("emergency_epoch_changed_between_slices");
    expect(toolCalls).toBe(0);
  });

  it("blocks when the control cannot be read at slice start", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    const result = await advanceCommandRun(advanceArgs(svc, run, {
      readEmergency: async () => ({ available: false, control: null, revision: null }),
    }));
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.reason).toBe("emergency_control_unreadable");
  });

  it("refuses to resume a run that is held for a human", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    await casRun(svc, run, { status: "REVIEW_REQUIRED", updated_at: NOW }, "test");
    const result = await advanceCommandRun(advanceArgs(svc, runRow(svc)));
    expect(result.advanced).toBe(false);
    expect(result.reason).toBe("run_held_for_human");
  });
});

describe("C6 — budgets bound the whole run, not each slice", () => {
  it("accumulates usage across slices", async () => {
    const svc = makeSvc();
    let run = await openRun(svc);
    await advanceCommandRun(advanceArgs(svc, run));
    const afterFirst = runRow(svc);
    expect(afterFirst.tool_calls_used).toBe(2);   // slice_max_steps: 2
    expect(afterFirst.cost_minor_used).toBe(20);

    run = afterFirst;
    await advanceCommandRun(advanceArgs(svc, run));
    expect(runRow(svc).tool_calls_used).toBeGreaterThan(2);
  });

  it("ends the run PARTIAL once the run-level budget is spent", async () => {
    const svc = makeSvc();
    let run = await openRun(svc);
    await casRun(svc, run, { tool_calls_used: 20, updated_at: NOW }, "test");
    run = runRow(svc);

    let toolCalls = 0;
    const result = await advanceCommandRun(advanceArgs(svc, run, {
      executeTool: async () => { toolCalls += 1; return { ok: true }; },
    }));
    expect(result.status).toBe("PARTIAL");
    expect(result.reason).toBe("run_budget_exhausted");
    expect(toolCalls).toBe(0);
    expect(runRow(svc).blockers).toContain("run_tool_call_budget_exhausted");
  });
});

describe("C6 — the C1 ledger finally has a production writer", () => {
  it("writes a verifiable receipt chain and continues it across slices", async () => {
    const svc = makeSvc();
    let run = await openRun(svc);

    const first = await advanceCommandRun(advanceArgs(svc, run));
    expect(first.receipts_written).toBeGreaterThan(0);
    const afterFirst = runRow(svc);
    expect(afterFirst.last_receipt_hash).toBeTruthy();

    run = afterFirst;
    await advanceCommandRun(advanceArgs(svc, run));

    const chain = svc.entities.CommandReceipt.rows;
    expect(chain.length).toBeGreaterThan(2);
    // Sequence continues across the slice boundary rather than restarting.
    expect(chain.map((row) => row.sequence)).toEqual(chain.map((_row, index) => index + 1));
    // And the whole chain verifies with a real hash function.
    const verified = await verifyReceiptChain(sha256, chain);
    expect(verified.ok).toBe(true);
    expect(verified.verified).toBe(chain.length);
  });

  it("binds every receipt to the run, the permit and the emergency revision", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    await advanceCommandRun(advanceArgs(svc, run));
    const receipt = svc.entities.CommandReceipt.rows[0];
    expect(receipt.run_id).toBe("run-1");
    expect(receipt.conversation_id).toBe("c1");
    expect(receipt.actor).toBe("founder@cambra.global");
    expect(receipt.permit_hash).toBe("hash-1");
    expect(receipt.emergency_control_revision).toBe(7);
    // The executor never claims an external effect on its own word.
    expect(receipt.external_effect_performed).toBe(false);
  });

  it("keeps running when a receipt cannot be persisted — evidence is not a precondition", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    svc.entities.CommandReceipt.create = async () => { throw new Error("ledger down"); };
    const result = await advanceCommandRun(advanceArgs(svc, run));
    expect(result.advanced).toBe(true);
    expect(result.receipts_written).toBe(0);
  });
});

describe("C6 — run status mapping never turns a problem into a success", () => {
  it("maps loop outcomes conservatively", () => {
    expect(runStatusForOutcome("COMPLETED")).toBe("COMPLETED");
    expect(runStatusForOutcome("PARTIAL")).toBe("RUNNING");
    expect(runStatusForOutcome("AWAITING_APPROVAL")).toBe("AWAITING_APPROVAL");
    expect(runStatusForOutcome("REVIEW_REQUIRED")).toBe("REVIEW_REQUIRED");
    expect(runStatusForOutcome("BLOCKED")).toBe("FAILED");
    expect(runStatusForOutcome("FAILED")).toBe("FAILED");
    // An outcome nobody defined is not a success.
    expect(runStatusForOutcome("SOMETHING_NEW")).toBe("REVIEW_REQUIRED");
    expect(runStatusForOutcome("")).toBe("REVIEW_REQUIRED");
  });

  it("classifies terminal and human-held states", () => {
    for (const status of ["COMPLETED", "PARTIAL", "CANCELLED", "FAILED"]) {
      expect(isTerminal(status), status).toBe(true);
      expect(isHumanHeld(status), status).toBe(false);
    }
    for (const status of ["AWAITING_APPROVAL", "AWAITING_PERMIT", "REVIEW_REQUIRED"]) {
      expect(isHumanHeld(status), status).toBe(true);
      expect(isTerminal(status), status).toBe(false);
    }
    expect(isTerminal("RUNNING")).toBe(false);
    expect(isHumanHeld("RUNNING")).toBe(false);
  });

  it("does not schedule another slice after a human-held outcome", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    const result = await advanceCommandRun(advanceArgs(svc, run, {
      // An ambiguous tool escalates the loop to REVIEW_REQUIRED.
      executeTool: async () => ({ ok: true, ambiguous: true }),
    }));
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.may_continue).toBe(false);
  });

  it("lets a RUNNING slice continue", async () => {
    const svc = makeSvc();
    const run = await openRun(svc);
    const result = await advanceCommandRun(advanceArgs(svc, run));
    // slice_max_steps 2 with a 3-step script → PARTIAL → RUNNING → continue.
    expect(result.status).toBe("RUNNING");
    expect(result.may_continue).toBe(true);
  });
});
