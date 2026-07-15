import { describe, it, expect } from "vitest";
import { derivePaymentsTrend } from "./paymentsTrend.js";

// Factory — one AnalyzerResult-shaped row with the payments engine shape.
function row({ id, gmvMonthly, currentBps, savingsPoint = 0, channel = "online", created, verified = false }) {
  return {
    id,
    created_date: created,
    verification_status: verified ? "verified" : "estimated",
    total_savings: savingsPoint,
    details: {
      engine_result: {
        current_effective_bps: currentBps,
        annual_savings_eur: { point: savingsPoint },
        cohort: { channel },
      },
      input_snapshot: { monthly_gmv_eur: gmvMonthly },
    },
  };
}

describe("derivePaymentsTrend", () => {
  it("hides with fewer than 2 usable points", () => {
    expect(derivePaymentsTrend([]).available).toBe(false);
    expect(derivePaymentsTrend([row({ id: "a", gmvMonthly: 30000, currentBps: 230, created: "2026-07-01" })]).available).toBe(false);
  });

  it("ignores legacy rows without the payments engine shape", () => {
    const trend = derivePaymentsTrend([
      { id: "legacy", created_date: "2026-07-01", details: { payment_current_rate: 2.3 } },
      row({ id: "b", gmvMonthly: 30000, currentBps: 230, created: "2026-07-05" }),
    ]);
    expect(trend.available).toBe(false); // only 1 usable point
  });

  it("KEEPS every re-run and sorts oldest → newest", () => {
    const trend = derivePaymentsTrend([
      row({ id: "latest", gmvMonthly: 28000, currentBps: 207, savingsPoint: 2500, created: "2026-07-10" }),
      row({ id: "old",    gmvMonthly: 30000, currentBps: 230, savingsPoint: 2800, created: "2026-07-01" }),
      row({ id: "mid",    gmvMonthly: 26000, currentBps: 202, savingsPoint: 2300, created: "2026-07-05" }),
    ]);
    expect(trend.available).toBe(true);
    expect(trend.count).toBe(3); // re-runs are the point — none dropped
    expect(trend.points.map((p) => p.id)).toEqual(["old", "mid", "latest"]);
  });

  it("computes rate + savings deltas from first to latest", () => {
    const trend = derivePaymentsTrend([
      row({ id: "old",    gmvMonthly: 30000, currentBps: 230, savingsPoint: 2800, created: "2026-07-01" }),
      row({ id: "latest", gmvMonthly: 28000, currentBps: 207, savingsPoint: 2500, created: "2026-07-10" }),
    ]);
    // 2.07% - 2.30% = -0.23 (improved)
    expect(trend.rate_delta_pct).toBeCloseTo(-0.23, 4);
    expect(trend.savings_delta_eur).toBeCloseTo(2500 - 2800, 2);
    expect(trend.latest_rate_pct).toBeCloseTo(2.07, 4);
    expect(trend.latest_savings_eur).toBeCloseTo(2500, 2);
  });

  it("every point is arithmetically coherent (fees === gmv × bps)", () => {
    const trend = derivePaymentsTrend([
      row({ id: "a", gmvMonthly: 30000, currentBps: 230, created: "2026-07-01" }),
      row({ id: "b", gmvMonthly: 26000, currentBps: 202, created: "2026-07-05" }),
      row({ id: "c", gmvMonthly: 28000, currentBps: 207, created: "2026-07-10" }),
    ]);
    expect(trend._coherent).toBe(true);
    // spot-check: point b fees = 26000×12×0.0202 = 6302.40
    const b = trend.points.find((p) => p.id === "b");
    expect(b.annual_fees).toBeCloseTo(6302.4, 2);
  });

  it("marks verified points", () => {
    const trend = derivePaymentsTrend([
      row({ id: "a", gmvMonthly: 30000, currentBps: 230, created: "2026-07-01", verified: false }),
      row({ id: "b", gmvMonthly: 30000, currentBps: 210, created: "2026-07-10", verified: true }),
    ]);
    expect(trend.points.find((p) => p.id === "a").verified).toBe(false);
    expect(trend.points.find((p) => p.id === "b").verified).toBe(true);
  });
});