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

  it("sums euros ACROSS DISTINCT CHANNELS and GMV-weights the blended rate — coherent", () => {
    // A (online):   €26k/mo × 202 bps → annual GMV 312,000 · fees 6,302.40
    // B (in_store):  €50k/mo × 150 bps → annual GMV 600,000 · fees 9,000.00
    const acc = derivePaymentsAccount([
      row({ id: "A", gmvMonthly: 26000, currentBps: 202, savingsPoint: 2315, channel: "online" }),
      row({ id: "B", gmvMonthly: 50000, currentBps: 150, savingsPoint: 4000, channel: "in_store" }),
    ]);

    expect(acc.available).toBe(true);
    expect(acc.count).toBe(2);            // 2 distinct channels
    expect(acc.adds_value_over_hero).toBe(true);

    // Money = plain sums across distinct channels.
    expect(acc.total_annual_gmv).toBeCloseTo(912000, 2);
    expect(acc.total_annual_fees).toBeCloseTo(6302.4 + 9000, 2);
    expect(acc.total_annual_savings).toBeCloseTo(2315 + 4000, 2);

    // Blended rate is GMV-weighted, NOT the naive average of 202 & 150.
    const expectedBps = ((6302.4 + 9000) / 912000) * 10000;
    expect(acc.blended_effective_bps).toBeCloseTo(expectedBps, 4);
    expect(acc.blended_effective_bps).toBeGreaterThan(150);
    expect(acc.blended_effective_bps).toBeLessThan(202);

    expect(acc._coherent).toBe(true);
  });

  it("does NOT sum re-runs of the same channel — dedupes to the latest", () => {
    // Three online re-runs of the SAME business. Summing them would inflate GMV ×3.
    // Correct behavior: aggregate === the latest online analysis only.
    const acc = derivePaymentsAccount([
      row({ id: "old",    gmvMonthly: 30000, currentBps: 230, savingsPoint: 2800, channel: "online", created: "2026-07-01" }),
      row({ id: "mid",    gmvMonthly: 26000, currentBps: 202, savingsPoint: 2300, channel: "online", created: "2026-07-05" }),
      row({ id: "latest", gmvMonthly: 28000, currentBps: 207, savingsPoint: 2500, channel: "online", created: "2026-07-10" }),
    ]);

    expect(acc.count).toBe(1);            // one distinct channel
    expect(acc.raw_count).toBe(3);        // three rows before dedupe
    // GMV = the LATEST online only (28k × 12), NOT 30k+26k+28k summed.
    expect(acc.total_annual_gmv).toBeCloseTo(28000 * 12, 2);
    expect(acc.total_annual_fees).toBeCloseTo(28000 * 12 * (207 / 10000), 2);
    // Single-channel account adds nothing over the hero → UI hides it.
    expect(acc.adds_value_over_hero).toBe(false);
    expect(acc._coherent).toBe(true);
  });

  it("dedupes per channel independently (latest online + latest in_store)", () => {
    const acc = derivePaymentsAccount([
      row({ id: "on_old",  gmvMonthly: 30000, currentBps: 230, savingsPoint: 2800, channel: "online",   created: "2026-07-01" }),
      row({ id: "on_new",  gmvMonthly: 26000, currentBps: 202, savingsPoint: 2300, channel: "online",   created: "2026-07-10" }),
      row({ id: "in_old",  gmvMonthly: 10000, currentBps: 190, savingsPoint: 700,  channel: "in_store", created: "2026-07-02" }),
      row({ id: "in_new",  gmvMonthly: 12000, currentBps: 180, savingsPoint: 900,  channel: "in_store", created: "2026-07-11" }),
    ]);

    expect(acc.count).toBe(2);            // online + in_store
    expect(acc.raw_count).toBe(4);
    // GMV = latest online (26k) + latest in_store (12k), annualized.
    expect(acc.total_annual_gmv).toBeCloseTo((26000 + 12000) * 12, 2);
    expect(acc.adds_value_over_hero).toBe(true);
    expect(acc._coherent).toBe(true);
  });

  it("takes the strongest confidence across DEDUPED analyses", () => {
    const acc = derivePaymentsAccount([
      row({ id: "A", gmvMonthly: 26000, currentBps: 202, savingsPoint: 2315, status: "estimated", channel: "online" }),
      row({ id: "B", gmvMonthly: 50000, currentBps: 150, savingsPoint: 4000, status: "verified",  channel: "in_store" }),
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