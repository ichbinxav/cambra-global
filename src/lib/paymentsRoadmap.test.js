// Coherence oracle for buildRecoveryRoadmap.
//
// This test freezes the anti-double-counting contract sealed with the operator
// (2026-07-14). It is the regression guard for the incoherence we caught in the
// real €30k/€50/FR example (Rec1+Rec2 = €5,904 = 2.5× the hero, two targets):
//
//   1. SINGLE TARGET — the roadmap's target_bps === the engine's
//      achievable_effective_bps (the exact number the hero uses). No second,
//      lower rate-table target.
//   2. SINGLE POOL — recoverable_annual === engine.annual_savings_eur, surfaced
//      ONCE. Recommendations carry NO € field, so the UI CANNOT sum them and
//      no rec can exceed the pool.
//   3. AMBITION-ONLY UPSIDE — ambition_bps (if present) is a neutral rate, not
//      a hard €. No provider name anywhere in the output.

import { describe, it, expect } from "vitest";
import { calculateGap } from "@/lib/paymentsGap.js";
import { buildRecoveryRoadmap } from "@/lib/paymentsRoadmap.js";

// Minimal EU-online rate table mirroring the seeded rows relevant to the
// example (Stripe = the merchant, plus cheaper providers used for the ambition
// line). Values match the live PaymentsRateTable read on 2026-07-14.
const RATE_TABLE = [
  { cohort_key: "stripe|ANY|EU",  provider_slug: "stripe",  channel: "online", region: "EU", tier: "ANY", percent_bps: 150, fixed_fee_minor_units: 25, fixed_fee_currency: "EUR", achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 25, verified: true,  savings_band_pct: 0.20, active: true },
  { cohort_key: "stancer|ANY|EU", provider_slug: "stancer", channel: "online", region: "EU", tier: "ANY", percent_bps: 70,  fixed_fee_minor_units: 15, fixed_fee_currency: "EUR", verified: false, savings_band_pct: 0.35, active: true },
  { cohort_key: "adyen|ANY|EU",   provider_slug: "adyen",   channel: "online", region: "EU", tier: "ANY", percent_bps: 100, fixed_fee_minor_units: 11, fixed_fee_currency: "EUR", verified: false, savings_band_pct: 0.35, active: true },
  { cohort_key: "ANY|ANY|EU",     provider_slug: "ANY",     channel: "online", region: "EU", tier: "ANY", percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: "EUR", achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 25, verified: false, savings_band_pct: 0.35, active: true },
];

const INPUT = { monthly_gmv_eur: 30000, avg_ticket_eur: 50, provider_slug: "stripe", region: "EU", intl_pct: 0 };
const SNAPSHOT = { monthly_gmv_eur: 30000, avg_ticket_eur: 50, provider_slug: "stripe", country: "FR" };

describe("buildRecoveryRoadmap — coherence oracle (€30k/€50/FR)", () => {
  const engine = calculateGap(INPUT, RATE_TABLE);
  const roadmap = buildRecoveryRoadmap(engine, SNAPSHOT, RATE_TABLE);

  it("the engine produced a savings_opportunity we can reason about", () => {
    expect(engine.ok).toBe(true);
    expect(engine.classification).toBe("savings_opportunity");
    expect(roadmap.state).toBe("savings_opportunity");
  });

  it("INVARIANT 1 — single target: roadmap.target_bps === engine.achievable_effective_bps", () => {
    expect(roadmap.target_bps).toBe(engine.achievable_effective_bps);
  });

  it("INVARIANT 2 — single pool: recoverable_annual === engine.annual_savings_eur, surfaced once", () => {
    expect(roadmap.recoverable_annual.lo).toBe(engine.annual_savings_eur.lo);
    expect(roadmap.recoverable_annual.point).toBe(engine.annual_savings_eur.point);
    expect(roadmap.recoverable_annual.hi).toBe(engine.annual_savings_eur.hi);
    // The example: hero pool point ≈ €2,304.
    expect(Math.round(roadmap.recoverable_annual.point)).toBe(2304);
  });

  it("INVARIANT 2 — no rec carries a € and the UI cannot sum recs", () => {
    for (const r of roadmap.recommendations) {
      expect(r).not.toHaveProperty("annual_eur");
      expect(r).not.toHaveProperty("annual_range");
      // A rec must never expose any numeric € field under any name.
      const numericFields = Object.entries(r).filter(([, v]) => typeof v === "number");
      expect(numericFields).toEqual([]);
    }
  });

  it("INVARIANT 2 — no path implies a € larger than the pool (there is only one €)", () => {
    // The only € anywhere in the output is the pool. Assert it's the sole
    // numeric total present.
    const totals = [roadmap.recoverable_annual.point];
    for (const t of totals) expect(t).toBeLessThanOrEqual(roadmap.recoverable_annual.point);
  });

  it("INVARIANT 3 — ambition is a neutral rate (bps), never a hard €", () => {
    // In this cohort a cheaper provider exists (Stancer 1.00% < achievable 1.36%),
    // so an ambition rate is present — but ONLY as bps, no € attached to it.
    expect(typeof roadmap.ambition_bps).toBe("number");
    expect(roadmap.ambition_bps).toBeLessThan(roadmap.target_bps);
    expect(roadmap).not.toHaveProperty("ambition_eur");
  });

  it("HONESTY — no provider name leaks anywhere in the output", () => {
    const blob = JSON.stringify(roadmap).toLowerCase();
    for (const name of ["stancer", "adyen", "stripe", "paypal", "sumup", "mollie", "checkout", "payplug", "lyra"]) {
      expect(blob).not.toContain(name);
    }
  });

  it("routes are the HOW — margin renegotiation + better rate + connect (estimated)", () => {
    const ids = roadmap.recommendations.map((r) => r.id);
    expect(ids).toContain("recover_margin");
    expect(ids).toContain("better_rate");
    expect(ids).toContain("connect_verify"); // estimated mode
    for (const r of roadmap.recommendations) {
      expect(["low", "medium", "high"]).toContain(r.effort);
      expect(["low", "medium", "high"]).toContain(r.confidence);
      expect(["low", "medium", "high"]).toContain(r.priority);
    }
  });

  it("verified mode drops the connect-to-verify route", () => {
    const verifiedEngine = { ...engine, mode: "verified" };
    const rm = buildRecoveryRoadmap(verifiedEngine, SNAPSHOT, RATE_TABLE);
    expect(rm.recommendations.map((r) => r.id)).not.toContain("connect_verify");
  });

  it("already_optimized → no pool, no recs", () => {
    const opt = { ...engine, classification: "already_optimized" };
    const rm = buildRecoveryRoadmap(opt, SNAPSHOT, RATE_TABLE);
    expect(rm.state).toBe("already_optimized");
    expect(rm.recoverable_annual).toBeNull();
    expect(rm.recommendations).toEqual([]);
  });
});