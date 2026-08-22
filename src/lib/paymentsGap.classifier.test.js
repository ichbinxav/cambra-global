// paymentsGap.classifier.test.js — exhaustive coverage of v1.5.0 additions.
//
// Three families, all locked here:
//
//   1. Classifier matrix (classifyResult) — every cell in the 6-row truth
//      table from Decision_Log_Iter4, including the post-hotfix branch that
//      keeps fallback-row material gaps in `savings_opportunity` and only
//      downgrades ZEROS on fallback to `insufficient_data`. The tests use
//      the pure classifier so a table-side change never accidentally
//      masks a classifier regression.
//
//   2. Multi-anchor (selectMultiAnchorAchievable + calculateGap in-store) —
//      pool composition, current-provider exclusion, ticket-driven
//      breakpoint between Stripe Terminal and SumUp, retrocompat online
//      (multi-anchor MUST NOT run), pool-empty fallback path, and the
//      benchmark_resolution output shape.
//
//   3. Threshold semantics (≤) — the sealed boundary. A gap EXACTLY at
//      MAX(€200, 15bps × GMV × 12) is a victory (already_optimized on a
//      verified row, insufficient_data on fallback); strictly above is
//      savings_opportunity. Both sides of the threshold get a test.
//
// Fixtures below mirror the seeded PaymentsRateTable relevant subset. Kept
// inline (no import from the seeder) so a seeder change cannot silently
// invalidate the classifier oracle.

import { describe, it, expect } from "vitest";
import {
  calculateGap,
  classifyResult,
  selectMultiAnchorAchievable,
  ALREADY_OPTIMIZED_EUR_ANNUAL_THRESHOLD,
  ALREADY_OPTIMIZED_BPS_THRESHOLD,
  ENGINE_VERSION,
} from "./paymentsGap.js";

// ── Fixture: minimum rate table covering online + in-store EU/UK/US/RoW ───
//
// The online rows preserve the pre-M4 3-segment cohort_key shape (retrocompat
// oracle depends on this). The in-store rows use the 4-segment shape. The
// verified in-store anchors carry an achievable_breakdown_json.anchor_provider
// so multi-anchor selection is eligible.
const TABLE = [
  // ── ONLINE (3-segment keys, legacy shape) ──
  { cohort_key: "stripe|ANY|EU", provider_slug: "stripe", tier: "ANY", region: "EU", channel: "online",
    percent_bps: 150, fixed_fee_minor_units: 25, fixed_fee_currency: "EUR",
    achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 25,
    intl_uplift_bps: 175, achievable_intl_uplift_bps: 90,
    verified: true, verified_at: new Date().toISOString(), savings_band_pct: 0.20, active: true,
    achievable_breakdown_json: { interchange_bps: 20, scheme_fees_bps: 6, processor_margin_bps: 60, processor_margin_band_bps: 15, sources: [] } },
  { cohort_key: "ANY|ANY|EU",  provider_slug: "ANY", tier: "ANY", region: "EU",  channel: "online",
    percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: "EUR",
    achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 25,
    intl_uplift_bps: 175, achievable_intl_uplift_bps: 90,
    verified: false, savings_band_pct: 0.35, active: true },
  { cohort_key: "ANY|ANY|UK",  provider_slug: "ANY", tier: "ANY", region: "UK",  channel: "online",
    percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: "GBP",
    achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 20,
    verified: false, savings_band_pct: 0.35, active: true },
  { cohort_key: "ANY|ANY|US",  provider_slug: "ANY", tier: "ANY", region: "US",  channel: "online",
    percent_bps: 280, fixed_fee_minor_units: 30, fixed_fee_currency: "USD",
    achievable_percent_bps: 200, achievable_fixed_fee_minor_units: 30,
    verified: false, savings_band_pct: 0.35, active: true },
  { cohort_key: "ANY|ANY|RoW", provider_slug: "ANY", tier: "ANY", region: "RoW", channel: "online",
    percent_bps: 320, fixed_fee_minor_units: 30, fixed_fee_currency: "USD",
    achievable_percent_bps: 220, achievable_fixed_fee_minor_units: 30,
    verified: false, savings_band_pct: 0.35, active: true },
  // ── IN-STORE (4-segment keys, M4-TPV) ──
  //  Verified anchors — EU (2, so multi-anchor confidence hits "high"):
  { cohort_key: "stripe_terminal|ANY|EU|in_store", provider_slug: "stripe_terminal", tier: "ANY", region: "EU", channel: "in_store",
    percent_bps: 140, fixed_fee_minor_units: 10, fixed_fee_currency: "EUR",
    terminal_rental_monthly_minor: 0, achievable_terminal_rental_monthly_minor: 0,
    verified: true, verified_at: new Date().toISOString(), savings_band_pct: 0.25, active: true,
    achievable_breakdown_json: { anchor_provider: "stripe_terminal", anchor_percent_bps: 140, anchor_fixed_fee_minor_units: 10 } },
  { cohort_key: "sumup|ANY|EU|in_store", provider_slug: "sumup", tier: "ANY", region: "EU", channel: "in_store",
    percent_bps: 175, fixed_fee_minor_units: 0, fixed_fee_currency: "EUR",
    terminal_rental_monthly_minor: 0, achievable_terminal_rental_monthly_minor: 0,
    verified: true, verified_at: new Date().toISOString(), savings_band_pct: 0.25, active: true,
    achievable_breakdown_json: { anchor_provider: "sumup", anchor_percent_bps: 175, anchor_fixed_fee_minor_units: 0 } },
  // Regional fallback rows — required by validateRateTable for the in-store channel.
  { cohort_key: "ANY|ANY|EU|in_store", provider_slug: "other", tier: "ANY", region: "EU", channel: "in_store",
    percent_bps: 180, fixed_fee_minor_units: 0, fixed_fee_currency: "EUR",
    terminal_rental_monthly_minor: 2500, achievable_terminal_rental_monthly_minor: 0,
    achievable_percent_bps: 140, achievable_fixed_fee_minor_units: 10,
    verified: false, savings_band_pct: 0.35, active: true,
    achievable_breakdown_json: { anchor_provider: "stripe_terminal", anchor_percent_bps: 140, anchor_fixed_fee_minor_units: 10 } },
  { cohort_key: "ANY|ANY|UK|in_store", provider_slug: "other", tier: "ANY", region: "UK", channel: "in_store",
    percent_bps: 180, fixed_fee_minor_units: 0, fixed_fee_currency: "GBP",
    terminal_rental_monthly_minor: 2500,
    achievable_percent_bps: 140, achievable_fixed_fee_minor_units: 10,
    verified: false, savings_band_pct: 0.35, active: true },
  { cohort_key: "ANY|ANY|US|in_store", provider_slug: "other", tier: "ANY", region: "US", channel: "in_store",
    percent_bps: 260, fixed_fee_minor_units: 10, fixed_fee_currency: "USD",
    achievable_percent_bps: 200, achievable_fixed_fee_minor_units: 10,
    verified: false, savings_band_pct: 0.35, active: true },
  { cohort_key: "ANY|ANY|RoW|in_store", provider_slug: "other", tier: "ANY", region: "RoW", channel: "in_store",
    percent_bps: 300, fixed_fee_minor_units: 10, fixed_fee_currency: "USD",
    achievable_percent_bps: 220, achievable_fixed_fee_minor_units: 10,
    verified: false, savings_band_pct: 0.35, active: true },
];

// ────────────────────────────────────────────────────────────────────────────
// FAMILY 1 — Classifier matrix (pure function). Six-row truth table.
// ────────────────────────────────────────────────────────────────────────────
describe("classifyResult — matrix from Decision_Log_Iter4", () => {
  it("v1.6.0 engine version pinned", () => {
    // SEED-ES-2 (2026-07-24): sanctioned version bump 1.5.0 → 1.6.0 (first
    // country=ES rows + ES anchors change real ES results; zero logic change).
    // Same pin update as paymentsGap.test.js — this second pin was missed in
    // the original chunk and caught by external verification.
    expect(ENGINE_VERSION).toBe("payments-gap-1.7.0");
  });

  const base = { monthly_gmv_eur: 40000, ticket_present: true, multi_anchor_ran: false, multi_anchor_empty: false, channel: "online" };

  it("row A — material gap + verified row → savings_opportunity", () => {
    expect(classifyResult({ ...base, annual_point_savings_eur: 5000, row_verified: true })).toBe("savings_opportunity");
  });
  it("row B — material gap + FALLBACK row → savings_opportunity (funnel preserved)", () => {
    // The post-hotfix branch. This is the regression case that motivated
    // v1.5.0's classifier correction. Before the fix this returned
    // insufficient_data — killing the estimated funnel for every bank TPV
    // and every RoW merchant.
    expect(classifyResult({ ...base, annual_point_savings_eur: 5000, row_verified: false })).toBe("savings_opportunity");
  });
  it("row C — zero/small gap + verified row → already_optimized", () => {
    expect(classifyResult({ ...base, annual_point_savings_eur: 50,  row_verified: true })).toBe("already_optimized");
  });
  it("row D — zero/small gap + FALLBACK row → insufficient_data (no victory over estimate)", () => {
    expect(classifyResult({ ...base, annual_point_savings_eur: 50,  row_verified: false })).toBe("insufficient_data");
  });
  it("row E — missing ticket → insufficient_data (arithmetic invalid)", () => {
    expect(classifyResult({ ...base, annual_point_savings_eur: 5000, row_verified: true, ticket_present: false })).toBe("insufficient_data");
  });
  it("row F — in_store + multi-anchor pool empty → insufficient_data (even w/ material gap)", () => {
    expect(classifyResult({ ...base, annual_point_savings_eur: 5000, row_verified: true, channel: "in_store", multi_anchor_ran: true, multi_anchor_empty: true })).toBe("insufficient_data");
  });
});

describe("classifyResult — threshold semantics (≤)", () => {
  // Sealed threshold: MAX(€200/year absolute, 15 bps × monthly_gmv × 12 relative).
  // ≤ means AT the threshold counts as a victory (or "we don't know" on fallback).
  // > means the merchant has an actionable gap.

  it("small brand — absolute floor dominates (relative = 15bps × €50k/mo × 12 = €900 < €200? No, €900 > €200 → relative wins). Test tiny brand where absolute wins.", () => {
    // €1k/mo × 15bps × 12 = €18/yr → below €200 absolute floor. Absolute dominates.
    const gmv = 1000;
    const relativeThresholdEur = (ALREADY_OPTIMIZED_BPS_THRESHOLD / 10000) * gmv * 12; // €18
    const threshold = Math.max(ALREADY_OPTIMIZED_EUR_ANNUAL_THRESHOLD, relativeThresholdEur); // €200
    expect(threshold).toBe(200);
    // EXACTLY at threshold — verified row → victory (≤ semantics).
    expect(classifyResult({ annual_point_savings_eur: 200, monthly_gmv_eur: gmv, row_verified: true, ticket_present: true, multi_anchor_ran: false, multi_anchor_empty: false, channel: "online" })).toBe("already_optimized");
    // One euro above — savings_opportunity.
    expect(classifyResult({ annual_point_savings_eur: 201, monthly_gmv_eur: gmv, row_verified: true, ticket_present: true, multi_anchor_ran: false, multi_anchor_empty: false, channel: "online" })).toBe("savings_opportunity");
  });

  it("large brand — relative floor dominates. At-threshold verified → already_optimized; above → savings_opportunity", () => {
    // €10M/yr → €833,333/mo × 15bps × 12 = €15,000. Relative dominates over €200 absolute.
    const gmv = 10_000_000 / 12;
    const relativeThresholdEur = (ALREADY_OPTIMIZED_BPS_THRESHOLD / 10000) * gmv * 12; // €15,000
    const threshold = Math.max(ALREADY_OPTIMIZED_EUR_ANNUAL_THRESHOLD, relativeThresholdEur);
    expect(threshold).toBeCloseTo(15000, 2);
    expect(classifyResult({ annual_point_savings_eur: threshold,         monthly_gmv_eur: gmv, row_verified: true, ticket_present: true, multi_anchor_ran: false, multi_anchor_empty: false, channel: "online" })).toBe("already_optimized");
    expect(classifyResult({ annual_point_savings_eur: threshold + 0.01,  monthly_gmv_eur: gmv, row_verified: true, ticket_present: true, multi_anchor_ran: false, multi_anchor_empty: false, channel: "online" })).toBe("savings_opportunity");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FAMILY 2 — Multi-anchor selection, in-store branch of calculateGap.
// ────────────────────────────────────────────────────────────────────────────
describe("selectMultiAnchorAchievable + calculateGap in-store", () => {
  it("EU pool composition — both anchors eligible (verified in-store, region match)", () => {
    const r = selectMultiAnchorAchievable(TABLE, "EU", 50, 40000, "other");
    expect(r).not.toBeNull();
    expect(r.candidates.map(c => c.provider).sort()).toEqual(["stripe_terminal", "sumup"]);
    expect(r.confidence).toBe("high"); // ≥2 candidates
  });

  it("EU current-provider exclusion — asking as sumup drops sumup from the pool", () => {
    const r = selectMultiAnchorAchievable(TABLE, "EU", 50, 40000, "sumup");
    expect(r.candidates.map(c => c.provider)).toEqual(["stripe_terminal"]);
    expect(r.confidence).toBe("reduced"); // 1 candidate only
    expect(r.winner).toBe("stripe_terminal");
  });

  it("BREAKPOINT — low ticket €10 → SumUp wins (fixed-fee drag on Stripe Terminal at low tickets)", () => {
    // At €10 ticket:
    //   Stripe Terminal: 140 + (0.10/10)*10000 = 140 + 100 = 240 bps
    //   SumUp:           175 + 0                = 175 bps
    // Winner = SumUp.
    const r = selectMultiAnchorAchievable(TABLE, "EU", 10, 40000, "other");
    expect(r.winner).toBe("sumup");
    expect(r.winner_effective_bps).toBeCloseTo(175, 2);
  });

  it("BREAKPOINT — high ticket €100 → Stripe Terminal wins (fixed fee amortized away)", () => {
    // At €100 ticket:
    //   Stripe Terminal: 140 + (0.10/100)*10000 = 140 + 10 = 150 bps
    //   SumUp:           175 bps
    // Winner = Stripe Terminal.
    const r = selectMultiAnchorAchievable(TABLE, "EU", 100, 40000, "other");
    expect(r.winner).toBe("stripe_terminal");
    expect(r.winner_effective_bps).toBeCloseTo(150, 2);
  });

  it("BREAKPOINT boundary — around ticket €4 the two anchors cross (0.10/T×10000 = 35 → T=~2.857€ isn't allowed by validator; use €5)", () => {
    // Cheapest-ticket boundary the validator ALLOWS is €5:
    //   Stripe Terminal: 140 + (0.10/5)*10000 = 140 + 200 = 340 bps
    //   SumUp:           175 bps
    // SumUp wins by a lot. Sanity: at ticket €5 the low-ticket regime holds.
    const r = selectMultiAnchorAchievable(TABLE, "EU", 5, 40000, "other");
    expect(r.winner).toBe("sumup");
  });

  it("UK pool empty (no verified in-store anchors seeded) → returns null → engine falls back to row.achievable_*", () => {
    const p = selectMultiAnchorAchievable(TABLE, "UK", 50, 40000, "other");
    expect(p).toBeNull();
    // End-to-end: calculateGap for UK in_store must still produce a number
    // and mark the result as insufficient_data (pool empty branch of classifier).
    const r = calculateGap({ monthly_gmv_eur: 40000, avg_ticket_eur: 50, region: "UK", provider_slug: "other", intl_pct: 0, channel: "in_store" }, TABLE);
    expect(r.ok).toBe(true);
    expect(r.classification).toBe("insufficient_data");
    // benchmark_resolution is NOT emitted when the pool was empty.
    expect(r.benchmark_resolution).toBeUndefined();
  });

  it("ONLINE call — multi-anchor NEVER runs → benchmark_resolution absent (retrocompat)", () => {
    const r = calculateGap({ monthly_gmv_eur: 83333.33, avg_ticket_eur: 50, region: "EU", provider_slug: "stripe", intl_pct: 15, channel: "online" }, TABLE);
    expect(r.ok).toBe(true);
    expect(r.benchmark_resolution).toBeUndefined();
  });

  it("full calculateGap in-store EU low ticket → SumUp winner + benchmark_resolution shape", () => {
    // Bank TPV in EU with €40k GMV, €10 ticket, rental €25/mo.
    // Current: 180 + 0 + (25/40000)*10000 = 180 + 6.25 = 186.25 bps
    // Achievable (SumUp winner @ €10): 175 bps.
    // Gap: 11.25 bps × 40000 / 10000 = €45/mo × 12 = €540/yr point.
    // Fallback row (verified=false), so classification = savings_opportunity
    // (funnel-preserving branch — material > MAX(€200, 15bps × 40k × 12 = €720) → 720).
    // 540 ≤ 720 → below threshold, BUT row is fallback → classifier returns
    // insufficient_data (zero-on-fallback branch). Good test: forces the
    // reader to see the branch triggers correctly at low tickets.
    const r = calculateGap({ monthly_gmv_eur: 40000, avg_ticket_eur: 10, region: "EU", provider_slug: "other", intl_pct: 0, channel: "in_store" }, TABLE);
    expect(r.ok).toBe(true);
    expect(r.current_effective_bps).toBeCloseTo(186.25, 2);
    expect(r.achievable_effective_bps).toBeCloseTo(175, 2);
    expect(r.benchmark_resolution).toBeDefined();
    expect(r.benchmark_resolution.winner).toBe("sumup");
    expect(r.benchmark_resolution.method).toBe("multi_anchor_min_effective");
    expect(r.benchmark_resolution.ticket_source).toBe("declared");
    expect(r.benchmark_resolution.confidence).toBe("reduced"); // row itself is fallback
    // Below threshold on fallback row → insufficient_data (not already_optimized).
    expect(r.classification).toBe("insufficient_data");
  });

  it("full calculateGap in-store EU high ticket → Stripe Terminal winner, material gap → savings_opportunity", () => {
    // Same brand, ticket €100:
    //   Current:    186.25 bps (same rental amortization)
    //   Achievable: Stripe Terminal winner @ €100 = 150 bps
    //   Gap: 36.25 bps × 40000 / 10000 = €145/mo × 12 = €1,740/yr point
    //   Threshold: MAX(200, 15bps × 40k × 12 = 720) = 720
    //   1740 > 720 → material → savings_opportunity (even on fallback row)
    const r = calculateGap({ monthly_gmv_eur: 40000, avg_ticket_eur: 100, region: "EU", provider_slug: "other", intl_pct: 0, channel: "in_store" }, TABLE);
    expect(r.benchmark_resolution.winner).toBe("stripe_terminal");
    expect(r.classification).toBe("savings_opportunity");
    // FALLBACK_ASSUMPTION must be present.
    expect(r.assumptions.some(a => a.includes("regional averages"))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// FAMILY 3 — Retrocompat oracle (locks 1.5.0 online numbers to 1.4.0's).
// ────────────────────────────────────────────────────────────────────────────
describe("online retrocompat oracle — Stripe EU / GMV€1M-yr / ticket€50 / intl15%", () => {
  it("byte-identical current/achievable/annual to 1.4.0", () => {
    const r = calculateGap({ monthly_gmv_eur: 1_000_000 / 12, avg_ticket_eur: 50, region: "EU", provider_slug: "stripe", intl_pct: 15, channel: "online" }, TABLE);
    expect(r.current_effective_bps).toBeCloseTo(226.25, 6);
    expect(r.achievable_effective_bps).toBeCloseTo(149.5, 6);
    expect(r.annual_savings_eur.point).toBeCloseTo(7675, 1);
    expect(r.annual_savings_eur.lo).toBeCloseTo(6140, 1);
    expect(r.annual_savings_eur.hi).toBeCloseTo(9210, 1);
    expect(r.benchmark_resolution).toBeUndefined();
    // 7675 > MAX(200, 15bps × 83k × 12 = ~1500) → material → savings_opportunity
    expect(r.classification).toBe("savings_opportunity");
  });
});
