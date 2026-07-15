import { describe, it, expect } from "vitest";
import { derivePaymentsAccount } from "@/lib/paymentsAccount.js";

// Build a minimal AnalyzerResult row with the payments engine shape.
function row({ id, gmvMonthly, currentBps, savingsPoint, status = "estimated", channel = "online", provider = "stripe", country = "FR", created = "2026-07-01" }) {
  return {
    id,
    created_date: created,
    verification_status: status,
    total_savings: savingsPoint,
    details: {
      engine_result: {
        current_effective_bps: currentBps,
        annual_savings_eur: { point: savingsPoint },
        cohort: { channel },
      },
      input_snapshot: { monthly_gmv_eur: gmvMonthly, provider_slug: provider, country },
    },
  };
}

describe("derivePaymentsAccount", () => {
  it("returns unavailable for empty / legacy-only input", () => {
    expect(derivePaymentsAccount([]).available).toBe(false);
    // Legacy scoreEngine row (no engine_result) is skipped.
    expect(derivePaymentsAccount([{ id: "x", details: {} }]).available).toBe(false);
  });

  it("sums euros and GMV-weights the blended rate — and is coherent", () => {
    // A: €26k/mo × 202 bps  → annual GMV 312,000 · fees 6,302.40
    // B: €50k/mo × 150 bps  → annual GMV 600,000 · fees 9,000.00
    const acc = derivePaymentsAccount([
      row({ id: "A", gmvMonthly: 26000, currentBps: 202, savingsPoint: 2315 }),
      row({ id: "B", gmvMonthly: 50000, currentBps: 150, savingsPoint: 4000 }),
    ]);

    expect(acc.available).toBe(true);
    expect(acc.count).toBe(2);

    // Money = plain sums.
    expect(acc.total_annual_gmv).toBeCloseTo(912000, 2);
    expect(acc.total_annual_fees).toBeCloseTo(6302.4 + 9000, 2);
    expect(acc.total_annual_savings).toBeCloseTo(2315 + 4000, 2);

    // Blended rate is GMV-weighted, NOT the naive average of 202 & 150.
    // = totalFees / totalGmv = 15302.4 / 912000 = 167.79... bps
    const expectedBps = ((6302.4 + 9000) / 912000) * 10000;
    expect(acc.blended_effective_bps).toBeCloseTo(expectedBps, 4);
    expect(acc.blended_effective_bps).toBeGreaterThan(150);
    expect(acc.blended_effective_bps).toBeLessThan(202);

    // The aggregate must pass its own sum check.
    expect(acc._coherent).toBe(true);
  });

  it("takes the strongest confidence across analyses", () => {
    const acc = derivePaymentsAccount([
      row({ id: "A", gmvMonthly: 26000, currentBps: 202, savingsPoint: 2315, status: "estimated" }),
      row({ id: "B", gmvMonthly: 50000, currentBps: 150, savingsPoint: 4000, status: "verified" }),
    ]);
    expect(acc.confidence).toBe("verified");
  });

  it("collects distinct channels, providers and countries", () => {
    const acc = derivePaymentsAccount([
      row({ id: "A", gmvMonthly: 26000, currentBps: 202, savingsPoint: 2315, channel: "online", provider: "stripe", country: "FR" }),
      row({ id: "B", gmvMonthly: 12000, currentBps: 180, savingsPoint: 900, channel: "in_store", provider: "sumup", country: "FR" }),
    ]);
    expect(acc.channels.sort()).toEqual(["in_store", "online"]);
    expect(acc.providers.sort()).toEqual(["stripe", "sumup"]);
    expect(acc.countries).toEqual(["FR"]);
  });
});