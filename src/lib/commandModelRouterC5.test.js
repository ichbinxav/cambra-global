// COMMAND-C5 (2026-08-17) — provider routing.
//
// The property that matters most: adding a second provider must NOT make
// post-transport failover possible. commercialModelRouter.ts already refused it
// ("a non-2xx response is still post-transport... so there is no model
// fallback") because failing over after a request has left could double-spend
// and, for anything with an effect, double-act. These tests pin that.
import { describe, expect, it } from "vitest";
import {
  buildRouteDecision,
  extractOpenAiText,
  resolveRoute,
  routeModelCall,
  TASK_CLASS_ROUTES,
  TASK_CLASSES,
} from "../../base44/shared/commandModelRouter.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const BOTH = { anthropic: true, openai: true };

let counter = 0;
const base = (overrides = {}) => {
  counter = 0;
  return {
    prompt: "summarise the ES pipeline",
    task_class: "REASONING",
    configured: BOTH,
    now: () => NOW,
    newId: () => `d${++counter}`,
    callProvider: async (provider) => ({
      ok: true, transport_started: true, text: `answer from ${provider}`,
      model: provider === "anthropic" ? "claude-sonnet-5" : "gpt-4.1",
      input_tokens: 100, output_tokens: 50,
    }),
    ...overrides,
  };
};

describe("C5 — routing is decided by the task, not by the provider", () => {
  it("routes reasoning to Anthropic and extraction to OpenAI by default", () => {
    expect(resolveRoute({ task_class: "REASONING", configured: BOTH }).order[0]).toBe("anthropic");
    expect(resolveRoute({ task_class: "EXTRACTION", configured: BOTH }).order[0]).toBe("openai");
    expect(resolveRoute({ task_class: "CLASSIFICATION", configured: BOTH }).order[0]).toBe("openai");
  });

  it("gives every task class a route with both providers listed", () => {
    for (const taskClass of TASK_CLASSES) {
      expect(TASK_CLASS_ROUTES[taskClass], taskClass).toHaveLength(2);
      expect(new Set(TASK_CLASS_ROUTES[taskClass]).size, taskClass).toBe(2);
    }
  });

  it("treats an unknown task class as OTHER rather than failing", () => {
    expect(resolveRoute({ task_class: "VIBES", configured: BOTH }).order)
      .toEqual(TASK_CLASS_ROUTES.OTHER);
  });

  it("honours an explicit provider request", () => {
    const route = resolveRoute({ task_class: "REASONING", requested_provider: "openai", configured: BOTH });
    expect(route.order).toEqual(["openai"]);
    expect(route.reason).toBe("EXPLICIT_REQUEST");
  });

  it("does not silently swap a requested provider that is not configured", () => {
    const route = resolveRoute({
      task_class: "REASONING", requested_provider: "openai",
      configured: { anthropic: true, openai: false },
    });
    // It still routes, but the recorded reason says the request was not honoured.
    expect(route.reason).toBe("PRIMARY_UNAVAILABLE_FAILOVER");
    expect(route.order).toEqual(["anthropic"]);
    expect(route.rejected.openai).toBe("not_configured");
  });

  it("drops an unconfigured provider from the order entirely", () => {
    const route = resolveRoute({ task_class: "EXTRACTION", configured: { anthropic: true, openai: false } });
    expect(route.order).toEqual(["anthropic"]);
  });

  it("reports no provider at all rather than guessing", async () => {
    const run = await routeModelCall(base({ configured: { anthropic: false, openai: false } }));
    expect(run.ok).toBe(false);
    expect(run.blockers).toContain("no_provider_configured");
    expect(run.decision.selected_provider).toBe("none");
    expect(run.decision.provider_call_performed).toBe(false);
  });
});

describe("C5 — failover happens only before transport", () => {
  it("fails over when the primary refuses BEFORE the request leaves", async () => {
    const attempted = [];
    const run = await routeModelCall(base({
      callProvider: async (provider) => {
        attempted.push(provider);
        if (provider === "anthropic") {
          return { ok: false, transport_started: false, error_code: "anthropic_not_configured" };
        }
        return { ok: true, transport_started: true, text: "openai answered", model: "gpt-4.1" };
      },
    }));
    expect(attempted).toEqual(["anthropic", "openai"]);
    expect(run.ok).toBe(true);
    expect(run.text).toBe("openai answered");
    expect(run.decision.route_outcome).toBe("FAILED_OVER");
    expect(run.decision.failover_from_provider).toBe("anthropic");
    expect(run.decision.selected_provider).toBe("openai");
  });

  it("NEVER fails over once the request has left — the double-spend rule", async () => {
    const attempted = [];
    const run = await routeModelCall(base({
      callProvider: async (provider) => {
        attempted.push(provider);
        // A 500 after the request went out: we cannot know if it was billed.
        return { ok: false, transport_started: true, http_status: 500, model: "claude-sonnet-5", error_code: "anthropic_http_500" };
      },
    }));
    // The second provider was never tried.
    expect(attempted).toEqual(["anthropic"]);
    expect(run.ok).toBe(false);
    expect(run.decision.route_outcome).toBe("REVIEW_REQUIRED");
    expect(run.blockers).toContain("provider_effect_review_required_no_failover");
    // Transport started, so a call WAS performed even though it failed.
    expect(run.decision.provider_call_performed).toBe(true);
  });

  it("treats a thrown adapter as post-transport unless it says otherwise", async () => {
    const attempted = [];
    const run = await routeModelCall(base({
      callProvider: async (provider) => { attempted.push(provider); throw new Error("socket exploded"); },
    }));
    // The optimistic reading is the one that double-spends, so we do not take it.
    expect(attempted).toEqual(["anthropic"]);
    expect(run.decision.route_outcome).toBe("REVIEW_REQUIRED");
  });

  it("does fail over when a thrown adapter proves nothing left the process", async () => {
    const attempted = [];
    const run = await routeModelCall(base({
      callProvider: async (provider) => {
        attempted.push(provider);
        if (provider === "anthropic") {
          throw Object.assign(new Error("key missing"), { transport_started: false });
        }
        return { ok: true, transport_started: true, text: "ok", model: "gpt-4.1" };
      },
    }));
    expect(attempted).toEqual(["anthropic", "openai"]);
    expect(run.ok).toBe(true);
  });

  it("reports all-unavailable when every provider refuses pre-transport", async () => {
    const run = await routeModelCall(base({
      callProvider: async () => ({ ok: false, transport_started: false, error_code: "not_configured" }),
    }));
    expect(run.ok).toBe(false);
    expect(run.decision.route_outcome).toBe("ERRORED");
    expect(run.blockers).toContain("all_providers_unavailable_pre_transport");
    expect(run.decision.provider_call_performed).toBe(false);
  });
});

describe("C5 — the AI spend emergency refuses before any money moves", () => {
  it("records a REFUSED decision with no provider call", async () => {
    let called = 0;
    const run = await routeModelCall(base({
      callProvider: async () => { called += 1; return { ok: true, transport_started: true, text: "x" }; },
      readEmergency: async () => ({ available: true, blocked: true, revision: 9 }),
    }));
    // The decisive assertion: nothing was asked.
    expect(called).toBe(0);
    expect(run.ok).toBe(false);
    expect(run.decision.route_outcome).toBe("REFUSED");
    expect(run.decision.route_reason).toBe("EMERGENCY_REFUSAL");
    expect(run.decision.provider_call_performed).toBe(false);
    expect(run.decision.emergency_blocked).toBe(true);
    expect(run.decision.emergency_control_revision).toBe(9);
  });

  it("blocks when the emergency control cannot be read — never defaults open", async () => {
    let called = 0;
    const run = await routeModelCall(base({
      callProvider: async () => { called += 1; return { ok: true, transport_started: true, text: "x" }; },
      readEmergency: async () => ({ available: false, blocked: false, revision: null }),
    }));
    expect(called).toBe(0);
    expect(run.blockers).toContain("emergency_control_unreadable");
    expect(run.decision.provider_call_performed).toBe(false);
  });

  it("proceeds and records the revision it checked against when healthy", async () => {
    const run = await routeModelCall(base({
      readEmergency: async () => ({ available: true, blocked: false, revision: 7 }),
    }));
    expect(run.ok).toBe(true);
    expect(run.decision.emergency_blocked).toBe(false);
    expect(run.decision.emergency_control_revision).toBe(7);
  });
});

describe("C5 — every decision is recorded, refusals included", () => {
  it("persists a row on a successful answer", async () => {
    const rows = [];
    const run = await routeModelCall(base({ persistDecision: async (row) => { rows.push(row); } }));
    expect(rows).toHaveLength(1);
    expect(rows[0].route_outcome).toBe("ANSWERED");
    expect(rows[0].provider_call_performed).toBe(true);
    expect(rows[0].input_tokens).toBe(100);
    expect(run.decision.decision_id).toBe("d1");
  });

  it("persists a row on a refusal too, which is the whole point", async () => {
    const rows = [];
    await routeModelCall(base({
      persistDecision: async (row) => { rows.push(row); },
      readEmergency: async () => ({ available: true, blocked: true, revision: 9 }),
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].route_outcome).toBe("REFUSED");
    // Without this field, "declined to answer" and "never asked" are the same row.
    expect(rows[0].provider_call_performed).toBe(false);
  });

  it("carries the reason a provider was rejected", async () => {
    const rows = [];
    await routeModelCall(base({
      configured: { anthropic: true, openai: false },
      persistDecision: async (row) => { rows.push(row); },
    }));
    expect(rows[0].rejected_providers_json.openai).toBe("not_configured");
  });

  it("does not fail the call when persistence fails", async () => {
    const run = await routeModelCall(base({ persistDecision: async () => { throw new Error("store down"); } }));
    expect(run.ok).toBe(true);
  });

  it("builds a decision with every required field populated", () => {
    const row = buildRouteDecision({
      decision_id: "d1", task_class: "REASONING", selected_provider: "anthropic",
      route_reason: "TASK_CLASS_DEFAULT", route_outcome: "ANSWERED",
      considered: ["anthropic", "openai"], rejected: {},
      provider_call_performed: true, now: NOW,
    });
    for (const field of [
      "decision_id", "task_class", "selected_provider", "route_reason",
      "route_outcome", "provider_call_performed", "created_at",
    ]) expect(row[field], field).not.toBeUndefined();
    expect(row.created_at).toBe(NOW);
  });
});

describe("C5 — the OpenAI adapter reads the real response shapes", () => {
  it("reads output_text", () => {
    expect(extractOpenAiText({ output_text: "hello" })).toBe("hello");
  });

  it("reads the structured output array", () => {
    expect(extractOpenAiText({
      output: [{ content: [{ text: "first" }, { text: "second" }] }],
    })).toBe("first\nsecond");
  });

  it("falls back to the chat-completions shape", () => {
    expect(extractOpenAiText({ choices: [{ message: { content: "legacy" } }] })).toBe("legacy");
  });

  it("returns empty rather than inventing text", () => {
    expect(extractOpenAiText({})).toBe("");
    expect(extractOpenAiText(null)).toBe("");
    expect(extractOpenAiText({ output: [{ content: [] }] })).toBe("");
  });
});
