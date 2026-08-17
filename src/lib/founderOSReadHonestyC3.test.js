// COMMAND-C3 (2026-08-17) — the founder's home page must never present a failed
// read as a proven zero.
//
// Before this chunk, every canonical read in founderOSData went through a `safe()`
// helper that swallowed the exception and returned []. The metrics were then
// stamped with HARDCODED confidence literals, so a failing Invoice read produced
// `collected_revenue: { value: 0, confidence: 'verified' }` — a number that was
// never observed, labelled as verified, on the founder's home page.
//
// These tests invoke the real builder against a store that throws, and assert on
// what actually comes out.
import { describe, expect, it } from "vitest";
import { buildFounderSnapshot, merchant360, provider360, searchCompany } from "../../base44/shared/founderOSData.ts";

/**
 * A store where every entity returns [] except the ones named in `throwing`,
 * which reject. `rows` seeds specific entities.
 */
function makeSvc({ throwing = [], rows = {} } = {}) {
  const broken = new Set(throwing);
  const entity = (name) => ({
    async list() {
      if (broken.has(name)) throw new Error(`${name}_store_down`);
      return (rows[name] || []).map((row) => ({ ...row }));
    },
    async filter() {
      if (broken.has(name)) throw new Error(`${name}_store_down`);
      return (rows[name] || []).map((row) => ({ ...row }));
    },
    async get(id) {
      if (broken.has(name)) throw new Error(`${name}_store_down`);
      return (rows[name] || []).find((row) => String(row.id) === String(id)) || null;
    },
  });
  return { entities: new Proxy({}, { get: (_t, name) => entity(String(name)) }) };
}

const INVOICES = [
  { id: "i1", amount_paid: 12_000, issued_at: "2026-08-01T00:00:00.000Z" },
  { id: "i2", amount_paid: 8_000, issued_at: "2026-08-02T00:00:00.000Z" },
];

describe("C3 — a failed read is never a proven zero", () => {
  it("reports collected_revenue as null/unknown when the Invoice read throws", async () => {
    const snapshot = await buildFounderSnapshot(makeSvc({ throwing: ["Invoice"] }));
    const metric = snapshot.metrics.collected_revenue;

    // The defect this test exists for: value 0 labelled 'verified'.
    expect(metric.value).toBeNull();
    expect(metric.value).not.toBe(0);
    expect(metric.confidence).toBe("unknown");
    expect(metric.confidence).not.toBe("verified");
    expect(metric.unavailable_sources).toContain("Invoice");
  });

  it("names the failure on the snapshot so every consumer can see it", async () => {
    const snapshot = await buildFounderSnapshot(makeSvc({ throwing: ["Invoice", "Brand"] }));
    expect(snapshot.data_complete).toBe(false);
    expect(snapshot.degraded_sources).toEqual(["Brand", "Invoice"]);
  });

  it("still reports a genuine zero as a real, confident zero", async () => {
    // Nothing throws; there simply are no invoices. That IS an observed zero.
    const snapshot = await buildFounderSnapshot(makeSvc());
    const metric = snapshot.metrics.collected_revenue;
    expect(metric.value).toBe(0);
    expect(metric.confidence).toBe("verified");
    expect(metric.unavailable_sources).toBeUndefined();
    expect(snapshot.data_complete).toBe(true);
    expect(snapshot.degraded_sources).toEqual([]);
  });

  it("computes a real total when the sources load", async () => {
    const snapshot = await buildFounderSnapshot(makeSvc({ rows: { Invoice: INVOICES } }));
    expect(snapshot.metrics.collected_revenue.value).toBe(20_000);
    expect(snapshot.metrics.collected_revenue.merchant).toBe(20_000);
    expect(snapshot.metrics.collected_revenue.confidence).toBe("verified");
  });

  it("degrades only the metrics that depend on the broken source", async () => {
    const snapshot = await buildFounderSnapshot(makeSvc({
      throwing: ["Invoice"], rows: { Brand: [{ id: "b1", name: "Acme" }] },
    }));
    // collected_revenue depends on Invoice and degrades.
    expect(snapshot.metrics.collected_revenue.confidence).toBe("unknown");
    // merchants depends only on Brand and must keep its real value.
    expect(snapshot.metrics.merchants.value).toBe(1);
    expect(snapshot.metrics.merchants.confidence).toBe("observed");
  });

  it("degrades a metric when ANY of its several sources is unreadable", async () => {
    // collected_revenue is Invoice + ProviderRevenueLedger. Breaking either is enough.
    const snapshot = await buildFounderSnapshot(makeSvc({
      throwing: ["ProviderRevenueLedger"], rows: { Invoice: INVOICES },
    }));
    expect(snapshot.metrics.collected_revenue.value).toBeNull();
    expect(snapshot.metrics.collected_revenue.unavailable_sources).toEqual(["ProviderRevenueLedger"]);
  });
});

describe("C3 — every money metric is covered, not just the one that was reported", () => {
  const MONEY = [
    ["provider_accrued", "ProviderRevenueLedger"],
    ["verified_savings", "MonthlySavingsReport"],
    ["aggregate_addressable", "AggregatePool"],
    ["aggregate_committed", "AggregatePool"],
    ["provider_outstanding", "ProviderRevenueLedger"],
  ];

  for (const [key, source] of MONEY) {
    it(`${key} refuses to claim a value when ${source} is unreadable`, async () => {
      const snapshot = await buildFounderSnapshot(makeSvc({ throwing: [source] }));
      expect(snapshot.metrics[key].value).toBeNull();
      expect(snapshot.metrics[key].confidence).toBe("unknown");
    });
  }

  it("leaves no metric carrying a hardcoded confidence when everything is broken", async () => {
    const ALL = [
      "Brand", "OutboundLead", "RevenueLifecycle", "MonthlySavingsReport", "Invoice",
      "ProviderRevenueLedger", "AggregatePool", "Approval", "AutonomyIncident",
      "CommunicationThread", "Integration", "OperatingHealthAssessment",
    ];
    const snapshot = await buildFounderSnapshot(makeSvc({ throwing: ALL }));
    const claimed = Object.entries(snapshot.metrics)
      .filter(([, metric]) => metric.confidence !== "unknown");
    expect(claimed).toEqual([]);
    // And not one of them invented a number.
    for (const [, metric] of Object.entries(snapshot.metrics)) expect(metric.value).toBeNull();
  });
});

describe("C3 — the 360 views and search declare their own coverage", () => {
  it("merchant360 says which sources it could not read", async () => {
    const view = await merchant360(makeSvc({ throwing: ["Invoice"] }), "b1");
    expect(view.data_complete).toBe(false);
    expect(view.degraded_sources).toContain("Invoice");
  });

  it("merchant360 reports complete coverage when nothing failed", async () => {
    const view = await merchant360(makeSvc(), "b1");
    expect(view.data_complete).toBe(true);
    expect(view.degraded_sources).toEqual([]);
  });

  it("provider360 says which sources it could not read", async () => {
    const view = await provider360(makeSvc({ throwing: ["NegotiationCase"] }), "p1");
    expect(view.data_complete).toBe(false);
    expect(view.degraded_sources).toContain("NegotiationCase");
  });

  it("search distinguishes 'no results' from 'could not look'", async () => {
    const broken = await searchCompany(makeSvc({ throwing: ["Brand"] }), "acme");
    expect(broken.results).toEqual([]);
    expect(broken.searched_complete).toBe(false);
    expect(broken.unavailable_sources).toContain("Brand");

    const empty = await searchCompany(makeSvc(), "acme");
    expect(empty.results).toEqual([]);
    // Same empty result list, but this one actually searched.
    expect(empty.searched_complete).toBe(true);
    expect(empty.unavailable_sources).toEqual([]);
  });
});
