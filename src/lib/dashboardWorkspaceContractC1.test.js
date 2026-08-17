// DASHBOARD-C1 (2026-08-17) — the Operating Workspace contract.
//
// The contract exists to stop each of the five workspaces reinventing the
// envelope, and specifically to stop an unread source being rendered as a zero.
// These tests drive the real primitives.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildContext,
  buildSourceHealth,
  kpi,
  portfolioResponse,
  sortKeepingUnknownLast,
  sourceStateForRead,
  TRUTH_BOUNDARY,
  TRUTH_CLASSES,
  WORKSPACES,
} from "../../base44/shared/workspaceContract.ts";

const NOW = "2026-08-17T12:00:00.000Z";

const read = (status, records = 5, extra = {}) => ({
  ok: status === "COMPLETE", status, value: [], source: "x",
  records_read: status === "UNAVAILABLE" ? null : records,
  truncated: status === "INCOMPLETE", blockers: [], error_code: null, ...extra,
});

describe("C1 — read status projects into source state without optimism", () => {
  it("maps the three real statuses", () => {
    expect(sourceStateForRead("COMPLETE")).toBe("OBSERVED");
    expect(sourceStateForRead("INCOMPLETE")).toBe("PARTIAL");
    expect(sourceStateForRead("UNAVAILABLE")).toBe("UNAVAILABLE");
  });

  it("treats an absent or unrecognised status as ERROR, never OBSERVED", () => {
    expect(sourceStateForRead(undefined)).toBe("ERROR");
    expect(sourceStateForRead("PROBABLY_FINE")).toBe("ERROR");
  });

  it("passes records_read through, including the null on failure", () => {
    const health = buildSourceHealth({
      Invoice: read("UNAVAILABLE"),
      Brand: read("COMPLETE", 0),
    });
    const invoice = health.find((row) => row.source === "Invoice");
    const brand = health.find((row) => row.source === "Brand");
    // null vs 0 is the whole discriminator between "could not read" and "empty".
    expect(invoice.records_read).toBeNull();
    expect(brand.records_read).toBe(0);
  });

  it("sorts source health deterministically", () => {
    const health = buildSourceHealth({ Zeta: read("COMPLETE"), Alpha: read("COMPLETE") });
    expect(health.map((row) => row.source)).toEqual(["Alpha", "Zeta"]);
  });
});

describe("C1 — a KPI never claims a value its sources could not supply", () => {
  const health = buildSourceHealth({
    Invoice: read("COMPLETE"), Brand: read("COMPLETE"),
    ProviderRevenueLedger: read("UNAVAILABLE"), AgentTask: read("INCOMPLETE"),
  });

  it("reports null and UNKNOWN when a source is unavailable", () => {
    const row = kpi({
      metric_key: "provider_revenue_collected", label: "Provider revenue collected",
      value: 0, unit: "EUR", truth_class: "VERIFIED",
      sources: ["ProviderRevenueLedger"], health,
    });
    // The defect this exists to prevent: 0 labelled VERIFIED.
    expect(row.value).toBeNull();
    expect(row.value).not.toBe(0);
    expect(row.truth_class).toBe("UNKNOWN");
    expect(row.state).toBe("UNAVAILABLE");
    expect(row.unavailable_sources).toEqual(["ProviderRevenueLedger"]);
  });

  it("keeps a real value and its truth class when every source loaded", () => {
    const row = kpi({
      metric_key: "collected", label: "Collected", value: 20000, unit: "EUR",
      truth_class: "VERIFIED", sources: ["Invoice", "Brand"], health,
    });
    expect(row.value).toBe(20000);
    expect(row.truth_class).toBe("VERIFIED");
    expect(row.state).toBe("OBSERVED");
  });

  it("keeps a genuine zero as a confident zero", () => {
    const row = kpi({
      metric_key: "x", label: "X", value: 0, unit: "count",
      truth_class: "OBSERVED", sources: ["Brand"], health,
    });
    expect(row.value).toBe(0);
    expect(row.truth_class).toBe("OBSERVED");
  });

  it("demotes OBSERVED to DERIVED when a source was truncated", () => {
    const row = kpi({
      metric_key: "tasks", label: "Tasks", value: 5000, unit: "count",
      truth_class: "OBSERVED", sources: ["AgentTask"], health,
    });
    // A truncated read yields a lower bound, not an observation.
    expect(row.truth_class).toBe("DERIVED");
    expect(row.state).toBe("PARTIAL");
  });

  it("does not silently upgrade a MODELED value just because sources loaded", () => {
    const row = kpi({
      metric_key: "forecast", label: "Forecast", value: 100, unit: "EUR",
      truth_class: "MODELED", sources: ["Brand"], health,
    });
    expect(row.truth_class).toBe("MODELED");
  });

  it("degrades when ANY of several sources is missing", () => {
    const row = kpi({
      metric_key: "margin", label: "Margin", value: 1, unit: "EUR",
      truth_class: "DERIVED", sources: ["Invoice", "ProviderRevenueLedger"], health,
    });
    expect(row.value).toBeNull();
  });

  it("cannot be overwritten by a caller's extra key", () => {
    // Spreading extra last would let a caller clobber the verdict. That mistake
    // was already made once in this repo's campaign preflight.
    const row = kpi({
      metric_key: "x", label: "X", value: 5, unit: "count",
      truth_class: "OBSERVED", sources: ["ProviderRevenueLedger"], health,
      extra: { value: 999, truth_class: "VERIFIED", state: "OBSERVED" },
    });
    expect(row.value).toBeNull();
    expect(row.truth_class).toBe("UNKNOWN");
    expect(row.state).toBe("UNAVAILABLE");
  });
});

describe("C1 — the context envelope declares coverage honestly", () => {
  it("marks the context incomplete and names the degraded sources", () => {
    const { context, source_health } = buildContext({
      workspace: "finance", now: NOW, contextId: "ctx-1",
      reads: { Invoice: read("COMPLETE"), ProviderRevenueLedger: read("UNAVAILABLE") },
    });
    expect(context.data_complete).toBe(false);
    expect(context.degraded_sources).toEqual(["ProviderRevenueLedger"]);
    expect(context.epistemic_state).toBe("UNKNOWN");
    expect(source_health).toHaveLength(2);
  });

  it("reports complete coverage when everything loaded", () => {
    const { context } = buildContext({
      workspace: "pipeline", now: NOW, contextId: "ctx-2",
      reads: { OutboundLead: read("COMPLETE") },
    });
    expect(context.data_complete).toBe(true);
    expect(context.degraded_sources).toEqual([]);
    expect(context.epistemic_state).toBe("OBSERVED");
  });

  it("carries the truth boundary on every context", () => {
    const { context } = buildContext({
      workspace: "audits", now: NOW, contextId: "c", reads: {},
    });
    expect(context.truth_boundary).toBe(TRUTH_BOUNDARY);
    expect(context.truth_boundary).toContain("Missing evidence remains unknown");
  });
});

describe("C1 — the portfolio response cannot omit what makes it trustworthy", () => {
  it("always includes source health, the truth boundary and a send declaration", () => {
    const { context, source_health } = buildContext({
      workspace: "recover", now: NOW, contextId: "c", reads: { DealActivation: read("COMPLETE") },
    });
    const response = portfolioResponse({ context, source_health, kpis: [] });
    expect(response.source_health).toHaveLength(1);
    expect(response.context.truth_boundary).toBeTruthy();
    expect(response.external_send_performed).toBe(false);
  });

  it("reports an uncomputable total as null, never 0", () => {
    const { context, source_health } = buildContext({
      workspace: "recover", now: NOW, contextId: "c", reads: {},
    });
    expect(portfolioResponse({ context, source_health, kpis: [] }).items.total).toBeNull();
    expect(portfolioResponse({ context, source_health, kpis: [], total: 0 }).items.total).toBe(0);
  });
});

describe("C1 — unknown values sort last in both directions", () => {
  const rows = [
    { id: "a", v: 10 }, { id: "b", v: null }, { id: "c", v: 30 },
    { id: "d", v: undefined }, { id: "e", v: 20 },
  ];

  it("descending keeps unknowns at the end", () => {
    expect(sortKeepingUnknownLast(rows, (r) => r.v, "desc").map((r) => r.id))
      .toEqual(["c", "e", "a", "b", "d"]);
  });

  it("ascending ALSO keeps unknowns at the end", () => {
    // A null sorted as zero is how an unread merchant looks like the cheapest.
    expect(sortKeepingUnknownLast(rows, (r) => r.v, "asc").map((r) => r.id))
      .toEqual(["a", "e", "c", "b", "d"]);
  });

  it("treats an empty string as unknown", () => {
    expect(sortKeepingUnknownLast([{ id: "x", v: "" }, { id: "y", v: "b" }], (r) => r.v).map((r) => r.id))
      .toEqual(["y", "x"]);
  });
});

describe("C1 — the navigation registry is the single source of truth", () => {
  const registry = JSON.parse(fs.readFileSync("config/dashboard/navigation.v1.json", "utf8"));

  it("declares exactly the twelve target entries in the founder's architecture", () => {
    expect(registry.target_navigation).toHaveLength(12);
    expect(registry.target_navigation.map((row) => row.label)).toEqual([
      "Founder OS", "CAMBRA Command", "Discovery", "Campaigns", "Inbox & Conversations",
      "Pipeline", "Merchants", "Audits & Opportunities", "Recover", "Finance",
      "Intelligence", "Settings",
    ]);
  });

  it("uses the five groups in order", () => {
    expect(registry.target_group_order).toEqual(["COMMAND", "GROWTH", "CLIENTS", "BUSINESS", "SYSTEM"]);
  });

  it("declares the two unbuilt workspaces rather than implying they exist", () => {
    const notBuilt = registry.target_navigation.filter((row) => row.state === "NOT_BUILT");
    expect(notBuilt.map((row) => row.path)).toEqual(["/admin/audits", "/admin/recover"]);
  });

  it("gives every pending redirect a stated blocker", () => {
    for (const row of registry.legacy_redirects) {
      if (row.ready !== true) expect(row.blocker, row.from).toBeTruthy();
    }
  });

  it("keeps the physical function target at 276", () => {
    expect(registry.invariants.physical_function_target).toBe(276);
  });

  it("names Merchants as the reference and forbids browser CRUD", () => {
    expect(registry.invariants.reference_pattern).toContain("AdminMerchants.jsx");
    expect(registry.invariants.no_direct_browser_crud).toContain("zero base44.entities writes");
  });
});

describe("C1 — vocabularies are complete", () => {
  it("carries all five workspaces", () => {
    expect([...WORKSPACES]).toEqual(["pipeline", "audits", "recover", "finance", "intelligence"]);
  });

  it("carries all nine truth classes from prompt section 4.4", () => {
    expect([...TRUTH_CLASSES]).toEqual([
      "OBSERVED", "DERIVED", "MODELED", "INFERRED",
      "CONTRACTUAL", "VERIFIED", "UNVERIFIED", "CONFLICTED", "UNKNOWN",
    ]);
  });
});
