// COMMAND-C4 (2026-08-17) — the multi-step coordinator's safety properties.
//
// Every test drives the REAL loop with injected model/tool/emergency functions,
// and asserts on what the loop did — which tools ran, which were refused, what
// receipts were written, and how the run ended.
import { describe, expect, it } from "vitest";
import {
  authoriseStep,
  DEFAULT_CAPS,
  runCommandLoop,
} from "../../base44/shared/commandToolLoop.ts";
import {
  buildToolRegistry,
  searchTools,
  TOOL_GOVERNANCE,
} from "../../base44/shared/commandToolRegistry.ts";

const NOW = "2026-08-17T12:00:00.000Z";

const DECLARED = [
  { name: "read_state", description: "Read canonical entity rows.", risk_level: 1 },
  { name: "founder_os_query", description: "Query the founder snapshot.", risk_level: 1 },
  { name: "discover_leads", description: "Search for outbound leads by topic and country.", risk_level: 1, bulk_field: "limit" },
  { name: "score_leads", description: "Score discovered leads.", risk_level: 2 },
  { name: "draft_outreach_emails", description: "Drafts cold outreach emails.", risk_level: 3 },
  { name: "pause_outbound", description: "Pause all outbound sending.", risk_level: 2 },
];

const registry = () => buildToolRegistry(DECLARED);

const PERMIT = {
  permit_id: "p1", objective: "Run ES discovery", issued_by: "founder@cambra.global",
  status: "ACTIVE", preset: "OPERATE", permit_hash: "h1",
  allowed_domains: ["discovery", "campaign", "intelligence", "emergency"],
  allowed_tool_ids: ["cambra.tool.discover_leads", "cambra.tool.score_leads", "cambra.tool.draft_outreach_emails", "cambra.tool.pause_outbound"],
  allowed_effect_classes: ["internal_write", "draft", "analysis"],
  allowed_entity_types: ["OutboundLead"],
  allowed_markets: ["ES"], allowed_environments: ["production"], explicit_denials: [],
  valid_from: "2020-01-01T00:00:00.000Z", expires_at: "2099-01-01T00:00:00.000Z",
  emergency_control_revision: 7,
};

const HEALTHY = { safe_mode: false, communications_paused: false, control_revision: 7 };

/** A model that walks a fixed script of tool calls, then stops. */
const scriptedModel = (script) => {
  let call = 0;
  return async () => {
    const next = script[call];
    call += 1;
    return next ? { text: `step ${call}`, tool: next } : { text: "done", tool: null };
  };
};

const okTool = (cost = 0) => async ({ name }) => ({ ok: true, summary: `${name} ran`, cost_minor: cost });

function harness(overrides = {}) {
  const receipts = [];
  return {
    receipts,
    args: {
      request: "find ES leads and score them",
      registry: registry(),
      permit: PERMIT,
      market: "ES",
      now: () => NOW,
      callModel: scriptedModel([{ name: "discover_leads", input: { topic: "fashion", country: "ES" } }]),
      executeTool: okTool(),
      readEmergency: async () => ({ available: true, control: HEALTHY, revision: 7 }),
      appendReceipt: async (row) => { receipts.push(row); return { receipt_id: `r${receipts.length}` }; },
      ...overrides,
    },
  };
}

describe("C4 — the loop actually chains steps, which is the gap it exists to close", () => {
  it("runs several tools in sequence and finishes COMPLETED", async () => {
    const h = harness({
      callModel: scriptedModel([
        { name: "discover_leads", input: { topic: "fashion" } },
        { name: "score_leads", input: {} },
        { name: "founder_os_query", input: {} },
      ]),
    });
    const run = await runCommandLoop(h.args);
    expect(run.outcome).toBe("COMPLETED");
    expect(run.steps.map((s) => s.tool)).toEqual(["discover_leads", "score_leads", "founder_os_query"]);
    expect(run.steps.every((s) => s.status === "EXECUTED")).toBe(true);
    expect(run.tool_calls_used).toBe(3);
  });

  it("feeds prior steps back to the model, which single-turn execution could not", async () => {
    const seen = [];
    const h = harness({
      callModel: async ({ history }) => {
        seen.push(history.map((row) => row.tool));
        return history.length === 0
          ? { tool: { name: "discover_leads", input: {} } }
          : (history.length === 1 ? { tool: { name: "score_leads", input: {} } } : { text: "done", tool: null });
      },
    });
    await runCommandLoop(h.args);
    expect(seen).toEqual([[], ["discover_leads"], ["discover_leads", "score_leads"]]);
  });

  it("stops cleanly when the model asks for no tool at all", async () => {
    const run = await runCommandLoop(harness({ callModel: async () => ({ text: "just answering", tool: null }) }).args);
    expect(run.outcome).toBe("COMPLETED");
    expect(run.steps).toEqual([]);
    expect(run.assistant_text).toBe("just answering");
  });
});

describe("C4 — the emergency stop is re-read before every step", () => {
  it("halts mid-run when the emergency revision changes", async () => {
    let reads = 0;
    const h = harness({
      callModel: scriptedModel([
        { name: "discover_leads", input: {} },
        { name: "score_leads", input: {} },
        { name: "founder_os_query", input: {} },
      ]),
      readEmergency: async () => {
        reads += 1;
        // Opening read + step 1, then the founder pulls the lever.
        return reads <= 2
          ? { available: true, control: HEALTHY, revision: 7 }
          : { available: true, control: { ...HEALTHY, safe_mode: true }, revision: 8 };
      },
    });
    const run = await runCommandLoop(h.args);
    expect(run.outcome).toBe("REVIEW_REQUIRED");
    expect(run.blockers).toContain("emergency_epoch_changed_mid_run");
    // Exactly one tool ran before the stop; the rest of the plan was abandoned.
    expect(run.steps.filter((s) => s.status === "EXECUTED")).toHaveLength(1);
  });

  it("refuses to start at all when the control is unreadable", async () => {
    const run = await runCommandLoop(harness({
      readEmergency: async () => ({ available: false, control: null, revision: null }),
    }).args);
    expect(run.outcome).toBe("BLOCKED");
    expect(run.blockers).toContain("emergency_control_unreadable");
    expect(run.steps).toEqual([]);
  });

  it("refuses every step while safe mode is engaged", async () => {
    const run = await runCommandLoop(harness({
      readEmergency: async () => ({ available: true, control: { ...HEALTHY, safe_mode: true }, revision: 7 }),
    }).args);
    expect(run.outcome).toBe("BLOCKED");
    expect(run.steps[0].status).toBe("REFUSED");
    expect(run.steps[0].reason).toBe("safe_mode_engaged");
  });
});

describe("C4 — authority is checked per step, not once per run", () => {
  it("refuses a tool that is not in the registry", async () => {
    const run = await runCommandLoop(harness({
      callModel: scriptedModel([{ name: "delete_everything", input: {} }]),
    }).args);
    expect(run.outcome).toBe("BLOCKED");
    expect(run.steps[0].reason).toBe("tool_not_in_registry");
  });

  it("refuses a declared tool nobody classified — unclassified is not safe-by-default", () => {
    const withUnknown = buildToolRegistry([...DECLARED, { name: "mystery_tool", description: "?", risk_level: 1 }]);
    expect(withUnknown.complete).toBe(false);
    expect(withUnknown.unclassified).toContain("mystery_tool");

    const decision = authoriseStep({
      toolName: "mystery_tool", registry: withUnknown,
      emergency: HEALTHY, emergencyAvailable: true, permit: PERMIT, now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("tool_unclassified_refused");
  });

  it("refuses a write tool when no permit covers the run", async () => {
    const run = await runCommandLoop(harness({ permit: null }).args);
    expect(run.outcome).toBe("BLOCKED");
    expect(run.steps[0].reason).toBe("no_founder_permit");
  });

  it("still allows a pure read with no permit at all", async () => {
    const run = await runCommandLoop(harness({
      permit: null,
      callModel: scriptedModel([{ name: "read_state", input: { entity: "Brand" } }]),
    }).args);
    expect(run.outcome).toBe("COMPLETED");
    expect(run.steps[0].status).toBe("EXECUTED");
  });

  it("refuses a tool the permit does not name", async () => {
    const decision = authoriseStep({
      toolName: "score_leads",
      registry: registry(), emergency: HEALTHY, emergencyAvailable: true, now: NOW, market: "ES",
      permit: { ...PERMIT, allowed_tool_ids: ["cambra.tool.discover_leads"] },
    });
    expect(decision.allowed).toBe(false);
  });

  it("never runs a tool whose effect class reaches a third party", () => {
    // No tool is in this class today; the guard must hold when one appears.
    const external = buildToolRegistry([{ name: "send_it", description: "sends", risk_level: 4 }]);
    external.tools.push({
      name: "send_it", description: "sends", risk_level: 4, bulk_field: null,
      effect_class: "external_effect", read_or_write: "WRITE",
      permit_domain: "campaign", always_drafts: false,
    });
    external.unclassified = [];
    const decision = authoriseStep({
      toolName: "send_it", registry: external, emergency: HEALTHY,
      emergencyAvailable: true, permit: { ...PERMIT, preset: "FOUNDER_ROOT" }, now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("effect_class_never_autonomous");
  });

  it("pauses campaign work when communications are paused, but leaves reads alone", () => {
    const paused = { ...HEALTHY, communications_paused: true };
    expect(authoriseStep({ toolName: "draft_outreach_emails", registry: registry(), emergency: paused, emergencyAvailable: true, permit: PERMIT, now: NOW, market: "ES" }).allowed).toBe(false);
    expect(authoriseStep({ toolName: "read_state", registry: registry(), emergency: paused, emergencyAvailable: true, permit: PERMIT, now: NOW }).allowed).toBe(true);
  });
});

describe("C4 — a draft hands back to the human instead of continuing", () => {
  it("stops at AWAITING_APPROVAL and does not run the rest of the plan", async () => {
    const run = await runCommandLoop(harness({
      callModel: scriptedModel([
        { name: "discover_leads", input: {} },
        { name: "draft_outreach_emails", input: {} },
        { name: "score_leads", input: {} },
      ]),
    }).args);
    expect(run.outcome).toBe("AWAITING_APPROVAL");
    expect(run.steps.map((s) => s.status)).toEqual(["EXECUTED", "HANDED_BACK"]);
    // The third step never ran.
    expect(run.steps.find((s) => s.tool === "score_leads")).toBeUndefined();
    expect(run.external_effect_performed).toBe(false);
  });
});

describe("C4 — an unconfirmed effect escalates and is never retried", () => {
  it("stops at REVIEW_REQUIRED without repeating the step", async () => {
    let calls = 0;
    const run = await runCommandLoop(harness({
      callModel: scriptedModel([
        { name: "discover_leads", input: {} },
        { name: "score_leads", input: {} },
      ]),
      executeTool: async ({ name }) => { calls += 1; return { ok: true, ambiguous: true, summary: name }; },
    }).args);
    expect(run.outcome).toBe("REVIEW_REQUIRED");
    expect(run.blockers).toContain("effect_outcome_unconfirmed_no_retry");
    // Executed exactly once. A blind retry could double a real effect.
    expect(calls).toBe(1);
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0].status).toBe("AMBIGUOUS");
  });
});

describe("C4 — caps end a run as PARTIAL, never as COMPLETED", () => {
  it("stops at the step cap", async () => {
    const run = await runCommandLoop(harness({
      caps: { max_steps: 2 },
      callModel: async () => ({ tool: { name: "founder_os_query", input: {} } }),
    }).args);
    expect(run.outcome).toBe("PARTIAL");
    expect(run.blockers).toContain("max_steps_reached");
    expect(run.steps).toHaveLength(2);
  });

  it("stops at the cost cap", async () => {
    const run = await runCommandLoop(harness({
      caps: { max_cost_minor: 100, max_steps: 8 },
      callModel: async () => ({ tool: { name: "discover_leads", input: {} } }),
      executeTool: okTool(60),
    }).args);
    expect(run.outcome).toBe("PARTIAL");
    expect(run.blockers).toContain("max_cost_reached");
    expect(run.cost_minor_used).toBe(120);
  });

  it("ships sane defaults", () => {
    expect(DEFAULT_CAPS.max_steps).toBeGreaterThan(1);
    expect(DEFAULT_CAPS.max_tool_calls).toBeGreaterThan(1);
    expect(DEFAULT_CAPS.max_cost_minor).toBeGreaterThan(0);
  });
});

describe("C4 — every step leaves a receipt, including refusals", () => {
  it("writes a receipt for an executed step", async () => {
    const h = harness();
    await runCommandLoop(h.args);
    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0].kind).toBe("EFFECT");
    expect(h.receipts[0].tool_id).toBe("cambra.tool.discover_leads");
    // The loop never claims an external effect on its own word.
    expect(h.receipts[0].external_effect_performed).toBe(false);
  });

  it("writes a receipt for a REFUSED step — a silent refusal looks like nothing happened", async () => {
    const h = harness({ callModel: scriptedModel([{ name: "delete_everything", input: {} }]) });
    await runCommandLoop(h.args);
    expect(h.receipts).toHaveLength(1);
    expect(h.receipts[0].kind).toBe("ESCALATION");
    expect(h.receipts[0].note).toBe("tool_not_in_registry");
  });

  it("marks an ambiguous step's receipt REVIEW_REQUIRED, not OBSERVED", async () => {
    const h = harness({ executeTool: async () => ({ ok: true, ambiguous: true }) });
    await runCommandLoop(h.args);
    expect(h.receipts[0].state).toBe("REVIEW_REQUIRED");
  });

  it("runs without a receipt writer, so the ledger is not a hard dependency", async () => {
    const run = await runCommandLoop({ ...harness().args, appendReceipt: undefined });
    expect(run.outcome).toBe("COMPLETED");
  });
});

describe("C4 — the registry is drift-proof and tool search prefers looking over acting", () => {
  it("classifies every declared tool and carries no stale entries", () => {
    const built = registry();
    expect(built.unclassified).toEqual([]);
    // These fixtures are a subset, so orphans are expected here; the real
    // orchestrator-wide check lives in commandToolRegistryC4.test.js.
    expect(built.tools).toHaveLength(DECLARED.length);
  });

  it("gives every governance entry a permit domain unless it is a pure read", () => {
    for (const [name, row] of Object.entries(TOOL_GOVERNANCE)) {
      if (row.effect_class === "read") expect(row.permit_domain, name).toBeNull();
      else expect(row.permit_domain, name).toBeTruthy();
    }
  });

  it("finds tools by name and description", () => {
    const found = searchTools(registry(), "leads");
    expect(found.map((t) => t.name)).toContain("discover_leads");
    expect(found.map((t) => t.name)).toContain("score_leads");
  });

  it("ranks the less consequential tool first at equal relevance", () => {
    const found = searchTools(registry(), "outreach emails drafts");
    const draftIndex = found.findIndex((t) => t.effect_class === "draft");
    const readIndex = found.findIndex((t) => t.effect_class === "read");
    if (readIndex >= 0 && draftIndex >= 0) expect(readIndex).toBeLessThan(draftIndex);
  });

  it("returns nothing rather than guessing on an unmatched query", () => {
    expect(searchTools(registry(), "zzzz-nothing-matches")).toEqual([]);
  });
});

describe("C4 — a run can narrow what it chains, and hands the rest back", () => {
  it("chains reads and analysis, then hands back the first write instead of running it", async () => {
    const h = harness({
      autonomousEffectClasses: ["read", "analysis"],
      callModel: scriptedModel([
        { name: "founder_os_query", input: {} },
        { name: "discover_leads", input: {} },   // internal_write — out of scope
        { name: "score_leads", input: {} },
      ]),
    });
    const run = await runCommandLoop(h.args);
    expect(run.outcome).toBe("AWAITING_APPROVAL");
    expect(run.blockers).toContain("effect_class_outside_run_scope");
    expect(run.steps.map((s) => s.status)).toEqual(["EXECUTED", "HANDED_BACK"]);
    // The caller is told exactly what to run through its own gates.
    expect(run.hand_back_tool).toEqual({ name: "discover_leads", input: {} });
    // And the loop did NOT execute it.
    expect(run.tool_calls_used).toBe(1);
  });

  it("distinguishes 'not in this run' from 'never allowed'", () => {
    const scoped = { registry: registry(), emergency: HEALTHY, emergencyAvailable: true, permit: PERMIT, now: NOW, market: "ES" };
    const narrowed = authoriseStep({ ...scoped, toolName: "discover_leads", autonomousEffectClasses: ["read"] });
    expect(narrowed.allowed).toBe(false);
    expect(narrowed.reason).toBe("effect_class_outside_run_scope");
    expect(narrowed.hand_back).toBe(true);

    // Same tool, no narrowing: perfectly allowed.
    expect(authoriseStep({ ...scoped, toolName: "discover_leads" }).allowed).toBe(true);
  });

  it("keeps the never-autonomous rule above the run scope", () => {
    // Widening the run scope cannot re-enable an external effect.
    const external = buildToolRegistry([]);
    external.tools.push({
      name: "send_it", description: "sends", risk_level: 4, bulk_field: null,
      effect_class: "external_effect", read_or_write: "WRITE",
      permit_domain: "campaign", always_drafts: false,
    });
    const decision = authoriseStep({
      toolName: "send_it", registry: external, emergency: HEALTHY, emergencyAvailable: true,
      permit: PERMIT, now: NOW, autonomousEffectClasses: ["read", "external_effect"],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("effect_class_never_autonomous");
  });
});
