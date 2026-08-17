// AUDIT (2026-08-17) — the two CRITICAL findings from the audit fan-out, fixed and pinned.
//
// R4: both drive the real functions. Neither asserts on source text.
import { describe, expect, it } from "vitest";
import { normalizeBidForPool, pricingCostMinor } from "../../base44/shared/aggregateCore.ts";

const POOL = { addressable_annual_volume_minor: 1_000_000_000, transaction_count_annualized: 100_000 };

describe("P3-01 — an unquoted rate is not a rate of zero", () => {
  it("refuses to price a proposal that states no per-transaction rate", () => {
    // The exact scenario: a provider quotes EUR 500/month and NO rate. Extraction preserves the
    // absence as null under a prompt that says "do not invent absent terms".
    const bid = { variable_rate_bps: null, fixed_fee_minor: null, monthly_fee_minor: 50_000 };
    expect(pricingCostMinor(POOL.addressable_annual_volume_minor, POOL.transaction_count_annualized, bid)).toBeNull();
  });

  it("used to price that proposal at 6 effective bps — now it prices at nothing", () => {
    const bid = { variable_rate_bps: null, fixed_fee_minor: null, monthly_fee_minor: 50_000 };
    const normalized = normalizeBidForPool(POOL, bid);
    // The old value was 600_000 minor -> 6.00 bps -> score 94 -> passed the >= 70 gate.
    expect(normalized.normalized_annual_cost_minor).toBeNull();
    expect(normalized.estimated_effective_bps).toBeNull();
    expect(normalized.cost_unknown).toBe(true);
  });

  it("names which component was never stated", () => {
    const normalized = normalizeBidForPool(POOL, { variable_rate_bps: null, fixed_fee_minor: 10, monthly_fee_minor: 0 });
    expect(normalized.blockers).toContain("provider_variable_rate_bps_not_stated");
  });

  it("prices a fully quoted proposal exactly as before", () => {
    const bid = { variable_rate_bps: 150, fixed_fee_minor: 10, monthly_fee_minor: 0 };
    // 1_000_000_000 * 150/10000 + 100_000 * 10 = 15_000_000 + 1_000_000 = 16_000_000
    expect(pricingCostMinor(POOL.addressable_annual_volume_minor, POOL.transaction_count_annualized, bid)).toBe(16_000_000);
    const normalized = normalizeBidForPool(POOL, bid);
    expect(normalized.estimated_effective_bps).toBe(160);
    expect(normalized.cost_unknown).toBe(false);
    expect(normalized.blockers).toEqual([]);
  });

  it("keeps a genuine zero rate as a real zero", () => {
    // A provider that explicitly quotes 0 bps has stated a rate. That is different from silence.
    const bid = { variable_rate_bps: 0, fixed_fee_minor: 0, monthly_fee_minor: 50_000 };
    expect(pricingCostMinor(POOL.addressable_annual_volume_minor, POOL.transaction_count_annualized, bid)).toBe(600_000);
    expect(normalizeBidForPool(POOL, bid).cost_unknown).toBe(false);
  });

  it("does not require a rate when there is no volume to apply it to", () => {
    const emptyPool = { addressable_annual_volume_minor: 0, transaction_count_annualized: 0 };
    const bid = { variable_rate_bps: null, fixed_fee_minor: null, monthly_fee_minor: 50_000 };
    expect(pricingCostMinor(0, 0, bid)).toBe(600_000);
  });

  it("refuses when nothing at all was quoted", () => {
    expect(pricingCostMinor(0, 0, {})).toBeNull();
    expect(pricingCostMinor(0, 0, { variable_rate_bps: null, fixed_fee_minor: null, monthly_fee_minor: null })).toBeNull();
  });
});

describe("P3-01 — the suitability gate cannot be satisfied by an uncomputable score", () => {
  // Mirrors the gate in collectiveNegotiationAgent/entry.ts so the rule is driven, not read.
  const gate = (bid) => {
    const known = bid.merchant_outcome_score !== null && bid.merchant_outcome_score !== undefined
      && Number.isFinite(Number(bid.merchant_outcome_score)) && bid.cost_unknown !== true;
    return known && Number(bid.merchant_outcome_score) >= 70;
  };

  it("refuses a null score", () => {
    expect(gate({ merchant_outcome_score: null, cost_unknown: true })).toBe(false);
  });

  it("refuses a score that came with cost_unknown, even if the number looks fine", () => {
    expect(gate({ merchant_outcome_score: 94, cost_unknown: true })).toBe(false);
  });

  it("still admits a real, high score", () => {
    expect(gate({ merchant_outcome_score: 84, cost_unknown: false })).toBe(true);
  });

  it("still refuses a real, low score", () => {
    expect(gate({ merchant_outcome_score: 69, cost_unknown: false })).toBe(false);
  });
});
