// DASHBOARD-C8 (2026-08-17) — the Finance truth model.
//
// The invariant: savings are not revenue, merchant revenue and provider revenue are
// not one total, and a total that mixes any two counts the same euro twice.
import { describe, expect, it } from "vitest";
import {
  ACCOUNTING_BASES, buildFinanceSnapshot, checkCombination, computeMargin,
  consolidate, FINANCE_DOMAINS, figure, FORBIDDEN_SUMS,
} from "../../base44/shared/financeCore.ts";

const NOW = "2026-08-17T12:00:00.000Z";

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = { async list() { if (broken.includes(name)) throw new Error("down"); return stores[name].map((r) => ({ ...r })); } };
    return built[name];
  };
  return { stores, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

describe("C8 — the five domains never merge", () => {
  it("declares all five", () => {
    expect([...FINANCE_DOMAINS]).toEqual(["MERCHANT_SAVINGS", "MERCHANT_REVENUE", "PROVIDER_REVENUE", "COSTS", "CASH"]);
  });

  it("refuses to add savings to revenue, with the reason", () => {
    const out = checkCombination(["MERCHANT_SAVINGS", "MERCHANT_REVENUE"]);
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("counts the same euro twice");
  });

  it("refuses to add merchant and provider revenue into one total", () => {
    const out = checkCombination(["MERCHANT_REVENUE", "PROVIDER_REVENUE"]);
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("hides the concentration");
  });

  it("refuses to add accrued cost to cash", () => {
    expect(checkCombination(["COSTS", "CASH"]).allowed).toBe(false);
  });

  it("allows a single domain", () => {
    expect(checkCombination(["MERCHANT_REVENUE"]).allowed).toBe(true);
  });

  it("gives every forbidden pair a stated reason", () => {
    for (const rule of FORBIDDEN_SUMS) {
      expect(rule.why.length, `${rule.a}+${rule.b}`).toBeGreaterThan(25);
    }
  });

  it("declares all six accounting bases", () => {
    expect([...ACCOUNTING_BASES]).toEqual(["OBSERVED_CASH", "ACCRUED", "INVOICED", "COLLECTED", "FORECAST", "MODELED"]);
  });
});

describe("C8 — a figure declares its completeness and is demoted accordingly", () => {
  // C9: every row carries a currency. The C8 version of this helper did not, and that
  // omission is what let figure() sum across currencies unnoticed for a whole chunk.
  const rows = (values) => values.map((v) => ({ amount_minor: v, currency: "EUR" }));

  it("keeps VERIFIED when every row carried a value", () => {
    const out = figure({
      metric_key: "x", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
      rows: rows([100, 200]), field: "amount_minor", truth_class: "VERIFIED",
    });
    expect(out.amount_minor).toBe(300);
    expect(out.completeness).toBe("COMPLETE");
    expect(out.truth_class).toBe("VERIFIED");
  });

  it("demotes VERIFIED to DERIVED on a lower bound", () => {
    const out = figure({
      metric_key: "x", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
      rows: rows([100, null, 200]), field: "amount_minor", truth_class: "VERIFIED",
    });
    // A sum that skipped rows has not verified a total.
    expect(out.amount_minor).toBe(300);
    expect(out.completeness).toBe("LOWER_BOUND");
    expect(out.truth_class).toBe("DERIVED");
    expect(out.claim_boundary).toContain("Lower bound, not a total");
  });

  it("reports UNKNOWN with a null amount when no row carried a value", () => {
    const out = figure({
      metric_key: "x", domain: "COSTS", basis: "ACCRUED",
      rows: rows([null, null]), field: "amount_minor", truth_class: "OBSERVED",
    });
    expect(out.amount_minor).toBeNull();
    expect(out.truth_class).toBe("UNKNOWN");
    expect(out.claim_boundary).toContain("this is not zero");
  });

  it("keeps a genuine zero", () => {
    const out = figure({
      metric_key: "x", domain: "COSTS", basis: "ACCRUED",
      rows: rows([0, 0]), field: "amount_minor", truth_class: "OBSERVED",
    });
    expect(out.amount_minor).toBe(0);
    expect(out.completeness).toBe("COMPLETE");
  });
});

describe("C8 — currency is never silently summed across", () => {
  it("consolidates a single currency", () => {
    const out = consolidate([{ amount_minor: 100, currency: "EUR" }, { amount_minor: 200, currency: "EUR" }]);
    expect(out.amount_minor).toBe(300);
    expect(out.currency).toBe("EUR");
    expect(out.mixed).toBe(false);
  });

  it("refuses a consolidated total across currencies and shows the breakdown", () => {
    const out = consolidate([{ amount_minor: 100, currency: "EUR" }, { amount_minor: 200, currency: "GBP" }]);
    // Summing across currencies without a dated rate produces a figure that is not money.
    expect(out.amount_minor).toBeNull();
    expect(out.mixed).toBe(true);
    expect(out.by_currency).toEqual({ EUR: 100, GBP: 200 });
    expect(out.claim_boundary).toContain("not money");
  });

  it("refuses a total when a row carries no currency", () => {
    const out = consolidate([{ amount_minor: 100, currency: "EUR" }, { amount_minor: 50, currency: "" }]);
    expect(out.amount_minor).toBeNull();
    expect(out.claim_boundary).toContain("no currency");
  });
});

describe("C8 — margin crosses the revenue and cost planes conservatively", () => {
  const fig = (amount, completeness) => ({
    metric_key: "f", domain: "MERCHANT_REVENUE", basis: "COLLECTED",
    amount_minor: amount, currency: "EUR", counted: 1, missing: completeness === "COMPLETE" ? 0 : 1,
    completeness, truth_class: "VERIFIED", claim_boundary: "",
  });

  it("computes margin when everything is complete", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "COMPLETE"),
      providerRevenue: fig(500, "COMPLETE"),
      costs: fig(300, "COMPLETE"),
    });
    expect(out.revenue_minor).toBe(1500);
    expect(out.margin_minor).toBe(1200);
    expect(out.truth_class).toBe("DERIVED");
  });

  it("labels margin MODELED when either side is a lower bound, and says why", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "COMPLETE"),
      providerRevenue: fig(500, "COMPLETE"),
      costs: fig(300, "LOWER_BOUND"),
    });
    // A complete revenue figure against a truncated cost figure flatters reality.
    expect(out.truth_class).toBe("MODELED");
    expect(out.claim_boundary).toContain("flatters reality");
  });

  it("refuses to compute margin when cost is unknown", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "COMPLETE"),
      providerRevenue: fig(0, "COMPLETE"),
      costs: fig(null, "UNKNOWN"),
    });
    expect(out.margin_minor).toBeNull();
    expect(out.truth_class).toBe("UNKNOWN");
    expect(out.claim_boundary).toContain("not computable");
  });

  it("states that the combined revenue exists ONLY for margin", () => {
    const out = computeMargin({
      merchantRevenue: fig(1000, "COMPLETE"), providerRevenue: fig(500, "COMPLETE"), costs: fig(300, "COMPLETE"),
    });
    expect(out.claim_boundary).toContain("neither is presented as a total elsewhere");
  });
});

describe("C8 — the snapshot reads the cost plane C0 found orphaned", () => {
  // C9: the REAL field names and units. MonthlySavingsReport.savings and
  // Invoice.amount_paid are MAJOR-unit numbers; there is no savings_minor or
  // amount_paid_minor on either entity. The C8 fixture invented both, so these tests
  // passed against a shape the database would never return.
  const rows = {
    MonthlySavingsReport: [{ id: "r1", verification_status: "realized", savings: 4000, currency: "EUR" }],
    Invoice: [{ id: "i1", status: "paid", amount_paid: 800, currency: "EUR" }],
    ProviderRevenueLedger: [{ id: "p1", state: "paid", paid_amount_minor: 20000, currency: "EUR" }],
    CostUsageEvent: [
      { id: "c1", state: "OBSERVED", amount_minor: 15000, currency: "EUR" },
      { id: "c2", state: "FAILED", amount_minor: 500, currency: "EUR" },
    ],
  };

  it("reports each domain separately and never a merged total", async () => {
    const out = await buildFinanceSnapshot({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    const byKey = new Map(out.kpis.map((k) => [k.metric_key, k]));
    expect(byKey.get("verified_savings").value).toBe(400000);
    expect(byKey.get("merchant_revenue_collected").value).toBe(80000);
    expect(byKey.get("provider_revenue_collected").value).toBe(20000);
    // 400000 + 80000 would be the double count. No KPI carries it.
    expect(out.kpis.some((k) => k.value === 480000)).toBe(false);
  });

  it("includes FAILED cost attempts and says why", async () => {
    const out = await buildFinanceSnapshot({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    const costs = out.kpis.find((k) => k.metric_key === "governed_costs");
    // A provider can charge for a request our transport reported as failed.
    expect(costs.value).toBe(15500);
    expect(costs.claim_boundary).toContain("FAILED attempts are included");
  });

  it("computes margin across the two planes", async () => {
    const out = await buildFinanceSnapshot({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    const margin = out.kpis.find((k) => k.metric_key === "margin_after_governed_costs");
    expect(margin.value).toBe(80000 + 20000 - 15500);
  });

  it("labels every KPI with its domain and basis", async () => {
    const out = await buildFinanceSnapshot({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    for (const k of out.kpis) {
      if (k.metric_key === "margin_after_governed_costs") continue;
      expect(k.claim_boundary, k.metric_key).toMatch(/^\[[A-Z_]+ · [A-Z_]+\]/);
    }
  });

  it("refuses margin when the cost plane could not be read", async () => {
    const out = await buildFinanceSnapshot({ svc: makeSvc(rows, ["CostUsageEvent"]), now: NOW, contextId: "c" });
    const margin = out.kpis.find((k) => k.metric_key === "margin_after_governed_costs");
    expect(margin.value).toBeNull();
    expect(out.context.degraded_sources).toContain("CostUsageEvent");
  });

  it("declares nothing was sent and no invoice was issued", async () => {
    const out = await buildFinanceSnapshot({ svc: makeSvc(rows), now: NOW, contextId: "c" });
    expect(out.external_send_performed).toBe(false);
    expect(out.permissions.operate).toBe(false);
  });
});
