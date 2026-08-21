// COMMAND-PRE-C1 (2026-08-17) — an emergency stop must pause LLM spend.
//
// Found in the CAMBRA Command C0 inventory: the `ai` cost category mapped to no
// EmergencyControl capability at all, so SAFE MODE did not stop AI spend. This
// is a precondition for CAMBRA Command, which is designed to be the largest LLM
// spender in the system — the founder must be able to stop it with the same
// button that stops everything else.
import { describe, expect, it } from "vitest";
import { paidProviderEmergencyCapabilities } from "../../base44/shared/costGovernance.ts";
import { callCambraClaude } from "../../base44/shared/commercialModelRouter.ts";

describe("AI spend is covered by the emergency stop", () => {
  it("maps an LLM call to a real emergency capability", () => {
    const capabilities = paidProviderEmergencyCapabilities({
      category: "ai", provider: "anthropic", source: "chatChiefOrchestrator",
    });
    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities).toContain("paid_discovery");
  });

  it("covers every LLM provider, not an allow-listed few", () => {
    // A future provider must not bypass the pause through a missing entry.
    for (const provider of ["anthropic", "openai", "some-future-vendor", ""]) {
      const capabilities = paidProviderEmergencyCapabilities({
        category: "ai", provider, source: "commandRuntime",
      });
      expect(capabilities, provider).toContain("paid_discovery");
    }
  });

  it("reuses an existing capability so emergencies already in force cover AI immediately", () => {
    // A NEW capability field would be absent on every EmergencyControl row that
    // already exists, and would therefore read as false — failing OPEN. Reusing
    // paid_discovery means any safe-mode row ever written already covers this.
    const capabilities = paidProviderEmergencyCapabilities({ category: "ai", provider: "anthropic" });
    expect(capabilities.every((value) => ["communications", "paid_discovery"].includes(value))).toBe(true);
  });

  it("still covers the categories it covered before — no regression", () => {
    expect(paidProviderEmergencyCapabilities({ category: "email", provider: "resend" })).toContain("communications");
    expect(paidProviderEmergencyCapabilities({ category: "api", provider: "apollo" })).toContain("paid_discovery");
    expect(paidProviderEmergencyCapabilities({ category: "enrichment", provider: "apollo" })).toContain("paid_discovery");
    // A communication provider keeps its stricter transport boundary.
    expect(paidProviderEmergencyCapabilities({ category: "api", provider: "instantly" }))
      .toEqual(expect.arrayContaining(["communications", "paid_discovery"]));
  });

  it("keeps the read-only reconciliation escape hatch intact", () => {
    // Monitoring and reconciliation are explicitly allowed to continue under
    // safe mode; closing the AI gap must not break that.
    expect(paidProviderEmergencyCapabilities({
      category: "ai", provider: "anthropic",
      source: "instantlyReconciliationWorker",
      emergency_effect_mode: "read_only_reconciliation",
    })).toEqual([]);
  });

  it("does not grant the escape hatch to an arbitrary source claiming it", () => {
    expect(paidProviderEmergencyCapabilities({
      category: "ai", provider: "anthropic",
      source: "someRandomCaller",
      emergency_effect_mode: "read_only_reconciliation",
    })).toContain("paid_discovery");
  });
});

describe("End to end: an emergency stops a real LLM call before the provider is contacted", () => {
  const DAY = new Date().toISOString().slice(0, 10);
  const MONTH = DAY.slice(0, 7);
  const CATEGORIES = ["ai", "api", "enrichment", "email"];

  function svcWith(control) {
    const budget = {
      id: "budget", control_key: "global", status: "active", currency: "EUR", version: "v1",
      daily_total_limit_minor: 1000, monthly_total_limit_minor: 10000,
      category_limits_json: Object.fromEntries(CATEGORIES.map((c) => [c, { daily_limit_minor: 500, monthly_limit_minor: 5000 }])),
      estimated_unit_cost_minor_json: { ai: 1 }, anomaly_warning_pct: 70, hard_stop_pct: 95,
      emergency_stop_active: false, reservation_revision: 0,
      reservation_day_key: DAY, reservation_month_key: MONTH,
      reserved_daily_total_minor: 0, reserved_monthly_total_minor: 0,
      reserved_category_json: Object.fromEntries(CATEGORIES.map((c) => [c, { daily_minor: 0, monthly_minor: 0 }])),
      reservation_recent_event_keys: [],
    };
    let current = { ...budget };
    let costEvent = null;
    return {
      entities: {
        EmergencyControl: { filter: async () => [structuredClone(control)] },
        CostBudgetControl: {
          filter: async () => [structuredClone(current)],
          get: async () => structuredClone(current),
          updateMany: async (query, operation) => {
            if (query.id !== current.id || query.reservation_revision !== current.reservation_revision) return { updated: 0 };
            current = { ...current, ...structuredClone(operation.$set) };
            return { updated: 1 };
          },
        },
        CostUsageEvent: {
          filter: async () => [],
          create: async (value) => {
            costEvent = { id: "cost-e2e", ...structuredClone(value) };
            return structuredClone(costEvent);
          },
          update: async (id, patch) => {
            costEvent = { ...costEvent, id, ...structuredClone(patch) };
            return structuredClone(costEvent);
          },
          get: async (id) =>
            costEvent?.id === id ? structuredClone(costEvent) : null,
        },
      },
    };
  }

  const PAUSED = {
    id: "emergency-global", control_key: "global", control_revision: 9,
    safe_mode: true, communications_paused: true, negotiations_paused: true,
    migrations_paused: true, billing_issuance_paused: true, paid_discovery_paused: true,
    resume_check_required: true,
  };

  async function withStubbedRuntime(run) {
    const originalDeno = globalThis.Deno;
    const originalFetch = globalThis.fetch;
    let providerCalls = 0;
    globalThis.Deno = { env: { get: (name) => (name === "ANTHROPIC_API_KEY" ? "test-key" : undefined) } };
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ type: "message", id: "msg_e2e_real", content: [{ type: "text", text: "should never happen" }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    };
    try {
      await run();
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.Deno = originalDeno;
    }
    return providerCalls;
  }

  it("refuses the LLM call while SAFE MODE is active, and never reaches Anthropic", async () => {
    const svc = svcWith(PAUSED);
    const providerCalls = await withStubbedRuntime(async () => {
      await expect(
        callCambraClaude("anything", { svc, eventKey: "emergency-blocked", source: "aiSpendEmergencyCoverageTest" }),
      ).rejects.toMatchObject({ code: "EMERGENCY_CONTROL_PAUSED" });
    });
    // The decisive assertion: no money was spent and no provider was contacted.
    expect(providerCalls).toBe(0);
  });

  it("allows the same call once the emergency is cleared", async () => {
    const svc = svcWith({ ...PAUSED, safe_mode: false, paid_discovery_paused: false, communications_paused: false, resume_check_required: false });
    let inference;
    const providerCalls = await withStubbedRuntime(async () => {
      inference = await callCambraClaude("anything", { svc, eventKey: "emergency-cleared", source: "aiSpendEmergencyCoverageTest" });
    });
    expect(providerCalls).toBe(1);
    expect(inference.agent_task_evidence).toMatchObject({
      cost_record_refs: [{ type: "CostUsageEvent", id: "cost-e2e" }],
      effect_refs: [{ type: "AnthropicMessage", id: "msg_e2e_real" }],
      receipt_refs: [{ type: "AnthropicMessage", id: "msg_e2e_real" }],
      transport_started: true,
      transport_evidence_persisted: true,
      provider_http_status: 200,
    });
  });
});
