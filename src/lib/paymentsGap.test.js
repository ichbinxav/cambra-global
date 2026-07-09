// Tests for src/lib/paymentsGap.js — the pure ES6 payments savings engine.
//
// Design goals verified by these tests:
//   1. Runtime amortization of fixed fee against user's real avg_ticket
//      (the Chunk 1b structural correction — same cohort, ticket €30 vs €250
//      produces materially different effective bps).
//   2. Row-selection cascade with fallback (unknown provider → regional
//      fallback row with wide band + fallback assumption in output).
//   3. Rate-table completeness gate — engine refuses to calculate against a
//      partial table (defense against the eventual-consistency issue seen in
//      Chunk 1b spot-check).
//   4. Standard input contract — malformed inputs rejected with named errors.
//   5. Edge cases at the extremes of the seeded matrix (GMV 500 → 10M).

import { describe, it, expect } from 'vitest';
import {
  calculateGap,
  validateRateTable,
  selectRow,
  computeEffectiveBps,
  computeMonthlySavings,
  applyBand,
  REQUIRED_FALLBACK_KEYS,
  FALLBACK_ASSUMPTION,
} from './paymentsGap.js';

// ─── Test fixtures — a minimal rate table that mirrors the seeded schema ───

// A row shape mirroring PaymentsRateTable exactly. Kept in one place so if the
// schema changes, only this factory needs updating.
function row(overrides) {
  return {
    cohort_key: overrides.cohort_key,
    provider_slug: overrides.provider_slug,
    tier: 'ANY',
    region: overrides.region,
    percent_bps: overrides.percent_bps,
    fixed_fee_minor_units: overrides.fixed_fee_minor_units,
    fixed_fee_currency: overrides.fixed_fee_currency,
    achievable_percent_bps: overrides.achievable_percent_bps ?? null,
    achievable_fixed_fee_minor_units: overrides.achievable_fixed_fee_minor_units ?? null,
    verified: overrides.verified,
    savings_band_pct: overrides.savings_band_pct,
    achievable_breakdown_json: overrides.achievable_breakdown_json ?? null,
    active: overrides.active !== false,
  };
}

// A complete-enough table for tests. Numbers mirror the seeded values from
// Chunk 1b so ratios and cross-checks against real production stay honest.
const FULL_TABLE = [
  row({ cohort_key: 'stripe|ANY|EU', provider_slug: 'stripe', region: 'EU',
        percent_bps: 150, fixed_fee_minor_units: 25, fixed_fee_currency: 'EUR',
        achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 25,
        verified: true, savings_band_pct: 0.20,
        achievable_breakdown_json: { interchange_bps: 26, scheme_fees_bps: 20, processor_margin_bps: 40, processor_margin_band_bps: 20 } }),
  row({ cohort_key: 'stripe|ANY|UK', provider_slug: 'stripe', region: 'UK',
        percent_bps: 150, fixed_fee_minor_units: 20, fixed_fee_currency: 'GBP',
        achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 20,
        verified: true, savings_band_pct: 0.20 }),
  row({ cohort_key: 'stripe|ANY|US', provider_slug: 'stripe', region: 'US',
        percent_bps: 290, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 180, achievable_fixed_fee_minor_units: 30,
        verified: true, savings_band_pct: 0.25 }),
  row({ cohort_key: 'paypal|ANY|EU', provider_slug: 'paypal', region: 'EU',
        percent_bps: 290, fixed_fee_minor_units: 35, fixed_fee_currency: 'EUR',
        achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 25,
        verified: true, savings_band_pct: 0.20 }),
  row({ cohort_key: 'shopify_payments|ANY|US', provider_slug: 'shopify_payments', region: 'US',
        percent_bps: 290, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 180, achievable_fixed_fee_minor_units: 30,
        verified: true, savings_band_pct: 0.25 }),
  row({ cohort_key: 'ANY|ANY|EU', provider_slug: 'ANY', region: 'EU',
        percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: 'EUR',
        achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 25,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|UK', provider_slug: 'ANY', region: 'UK',
        percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: 'GBP',
        achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 20,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|US', provider_slug: 'ANY', region: 'US',
        percent_bps: 280, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 200, achievable_fixed_fee_minor_units: 30,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|RoW', provider_slug: 'ANY', region: 'RoW',
        percent_bps: 320, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 220, achievable_fixed_fee_minor_units: 30,
        verified: false, savings_band_pct: 0.35 }),
];

// ─── validateRateTable ──────────────────────────────────────────────────────

describe('validateRateTable', () => {
  it('accepts a table with all 4 regional fallback keys active', () => {
    const result = validateRateTable(FULL_TABLE);
    expect(result.ok).toBe(true);
  });

  it('rejects a table missing ANY|ANY|EU as rate_table_incomplete', () => {
    const partial = FULL_TABLE.filter(r => r.cohort_key !== 'ANY|ANY|EU');
    const result = validateRateTable(partial);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('rate_table_incomplete');
    expect(result.missing).toContain('ANY|ANY|EU');
  });

  it('rejects a table where a required fallback is present but inactive', () => {
    // Deep-clone so we don't mutate the shared FULL_TABLE.
    const withInactive = FULL_TABLE.map(r =>
      r.cohort_key === 'ANY|ANY|UK' ? { ...r, active: false } : r
    );
    const result = validateRateTable(withInactive);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('ANY|ANY|UK');
  });

  it('rejects a non-array input as rate_table_not_array', () => {
    const result = validateRateTable(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('rate_table_not_array');
  });

  it('exposes REQUIRED_FALLBACK_KEYS with exactly the 4 canonical keys', () => {
    // Snapshot the contract publicly — the seeder + engine share this list.
    expect(REQUIRED_FALLBACK_KEYS).toEqual([
      'ANY|ANY|EU', 'ANY|ANY|UK', 'ANY|ANY|US', 'ANY|ANY|RoW',
    ]);
  });
});

// ─── computeEffectiveBps — runtime amortization ─────────────────────────────

describe('computeEffectiveBps — runtime amortization of fixed fee', () => {
  it('for Stripe EU (150 bps + 25 EUR) at avg_ticket €30 yields ~233 bps', () => {
    // 150 + (0.25 / 30) * 10000 = 150 + 83.33 = 233.33
    const bps = computeEffectiveBps(
      { percent_bps: 150, fixed_fee_minor_units: 25 }, 30
    );
    expect(bps).toBeGreaterThan(230);
    expect(bps).toBeLessThan(235);
  });

  it('for Stripe EU (150 bps + 25 EUR) at avg_ticket €250 yields ~160 bps', () => {
    // 150 + (0.25 / 250) * 10000 = 150 + 10 = 160
    const bps = computeEffectiveBps(
      { percent_bps: 150, fixed_fee_minor_units: 25 }, 250
    );
    expect(bps).toBeGreaterThan(159);
    expect(bps).toBeLessThan(161);
  });

  it('same cohort, different ticket → different effective rate (structural correction proof)', () => {
    // This is the exact test the user asked for: prove the fixed fee is not
    // pre-blended, and that the engine uses the user's real ticket at runtime.
    const bps30  = computeEffectiveBps({ percent_bps: 150, fixed_fee_minor_units: 25 }, 30);
    const bps250 = computeEffectiveBps({ percent_bps: 150, fixed_fee_minor_units: 25 }, 250);
    // The difference should be dominated by the amortization delta:
    //   (0.25 / 30 - 0.25 / 250) * 10000 ≈ 73.33 bps
    expect(bps30 - bps250).toBeGreaterThan(70);
    expect(bps30 - bps250).toBeLessThan(76);
  });
});

// ─── selectRow — cascade fallback ───────────────────────────────────────────

describe('selectRow — provider → regional fallback cascade', () => {
  it('exact match: stripe|EU returns the verified stripe|ANY|EU row', () => {
    const { row: r, matched } = selectRow(FULL_TABLE, 'stripe', 'EU');
    expect(r.cohort_key).toBe('stripe|ANY|EU');
    expect(r.verified).toBe(true);
    expect(matched).toBe('exact');
  });

  it('unknown provider (adyen) on EU falls back to ANY|ANY|EU with verified=false', () => {
    // The exact behavior the user asked to test: adyen|ANY|EU is not seeded
    // → the engine picks up ANY|ANY|EU (unverified, wide band).
    const { row: r, matched } = selectRow(FULL_TABLE, 'adyen', 'EU');
    expect(r.cohort_key).toBe('ANY|ANY|EU');
    expect(r.verified).toBe(false);
    expect(r.savings_band_pct).toBe(0.35);
    expect(matched).toBe('fallback');
  });

  it('unknown provider on RoW falls back to ANY|ANY|RoW', () => {
    const { row: r, matched } = selectRow(FULL_TABLE, 'mollie', 'RoW');
    expect(r.cohort_key).toBe('ANY|ANY|RoW');
    expect(matched).toBe('fallback');
  });

  it('unrecognized provider on a known region does NOT accidentally hit a same-region verified row', () => {
    // Regression guard: a merchant on 'checkout_com' must NOT be scored using
    // stripe|ANY|EU just because they're in the same region.
    const { row: r } = selectRow(FULL_TABLE, 'checkout_com', 'EU');
    expect(r.cohort_key).not.toBe('stripe|ANY|EU');
    expect(r.cohort_key).toBe('ANY|ANY|EU');
  });
});

// ─── calculateGap — end-to-end contract ─────────────────────────────────────

describe('calculateGap — end-to-end', () => {
  it('rejects malformed input (missing GMV) with monthly_gmv_eur_invalid', () => {
    const result = calculateGap({ avg_ticket_eur: 100, region: 'EU', provider_slug: 'stripe' }, FULL_TABLE);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('monthly_gmv_eur_invalid');
  });

  it('rejects malformed input (negative ticket) with avg_ticket_eur_invalid', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: -1, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('avg_ticket_eur_invalid');
  });

  it('refuses to calculate against a rate table missing a fallback row', () => {
    // The eventual-consistency defense: if the table lands with any of the 4
    // fallback rows missing, the engine must return rate_table_incomplete.
    const partial = FULL_TABLE.filter(r => r.cohort_key !== 'ANY|ANY|US');
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'US', provider_slug: 'stripe' },
      partial
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rate_table_incomplete');
    expect(result.missing).toContain('ANY|ANY|US');
  });

  it('Stripe EU with €30 ticket vs €250 ticket → different savings (amortization proof, E2E)', () => {
    // Structural correction proven at the ENGINE boundary, not just the helper.
    const base = { monthly_gmv_eur: 50000, region: 'EU', provider_slug: 'stripe' };
    const r30 = calculateGap({ ...base, avg_ticket_eur: 30 }, FULL_TABLE);
    const r250 = calculateGap({ ...base, avg_ticket_eur: 250 }, FULL_TABLE);
    expect(r30.ok).toBe(true);
    expect(r250.ok).toBe(true);
    // Effective rate for low-ticket merchant is materially higher, and so is
    // the gap vs achievable — hence savings monotonically bigger.
    expect(r30.current_effective_bps).toBeGreaterThan(r250.current_effective_bps);
    expect(r30.monthly_savings_eur.point).toBeGreaterThan(r250.monthly_savings_eur.point);
  });

  it('exact-match cohort (Stripe EU, verified) → narrow band ±20%', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.verified).toBe(true);
    expect(result.cohort.matched).toBe('exact');
    // Band is ±20% around the point estimate.
    const point = result.monthly_savings_eur.point;
    expect(result.monthly_savings_eur.hi - point).toBeCloseTo(point * 0.20, 2);
    // Assumptions must NOT include the fallback disclaimer.
    expect(result.assumptions).not.toContain(FALLBACK_ASSUMPTION);
  });

  it('fallback cohort (Adyen EU → ANY|ANY|EU) → wide band ±35% + fallback assumption present', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'adyen' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.verified).toBe(false);
    expect(result.cohort.matched).toBe('fallback');
    expect(result.cohort.key).toBe('ANY|ANY|EU');
    // ±35% band
    const point = result.monthly_savings_eur.point;
    expect(result.monthly_savings_eur.hi - point).toBeCloseTo(point * 0.35, 2);
    // Fallback assumption must be present verbatim.
    expect(result.assumptions).toContain(FALLBACK_ASSUMPTION);
  });

  it('achievable breakdown assumption is included when present on the row', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    // Stripe EU row carries interchange/scheme/margin breakdown; the string
    // must reference that composition.
    const hasBreakdownAssumption = result.assumptions.some(a => a.includes('interchange 26 bps'));
    expect(hasBreakdownAssumption).toBe(true);
  });

  it('annual savings is 12× monthly (lo, point, hi consistent)', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.annual_savings_eur.lo).toBeCloseTo(result.monthly_savings_eur.lo * 12, 2);
    expect(result.annual_savings_eur.point).toBeCloseTo(result.monthly_savings_eur.point * 12, 2);
    expect(result.annual_savings_eur.hi).toBeCloseTo(result.monthly_savings_eur.hi * 12, 2);
  });

  it('unknown region routes to RoW fallback', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'Antarctica', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.key).toBe('ANY|ANY|RoW');
  });

  it('provider capitalized/whitespaced is normalized ("  Stripe  " → "stripe")', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'EU', provider_slug: '  Stripe  ' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.matched).toBe('exact');
  });
});

// ─── Edge cases at extremes of the seeded matrix ────────────────────────────

describe('calculateGap — edge cases at GMV extremes', () => {
  it('tiny GMV (€500/mo) still produces a positive, sensible savings figure', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 500, avg_ticket_eur: 40, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.monthly_savings_eur.point).toBeGreaterThan(0);
    // Savings should never exceed the entire GMV — sanity ceiling.
    expect(result.monthly_savings_eur.hi).toBeLessThan(500);
  });

  it('very large GMV (€10M/mo) scales the same gap linearly (no overflow / no clamp)', () => {
    const small = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    const huge = calculateGap(
      { monthly_gmv_eur: 10000000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(small.ok).toBe(true);
    expect(huge.ok).toBe(true);
    // 100× GMV → 100× savings (same cohort, same ticket).
    expect(huge.monthly_savings_eur.point / small.monthly_savings_eur.point).toBeCloseTo(100, 1);
  });

  it('PayPal EU (highest verified current rate) shows the largest gap-to-achievable', () => {
    // PayPal EU 290 bps + 35c vs Stripe-EU-benchmark achievable 86 bps + 25c
    // → the PayPal gap is dramatically larger than the Stripe gap at same GMV.
    const paypal = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'paypal' },
      FULL_TABLE
    );
    const stripe = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(paypal.ok).toBe(true);
    expect(stripe.ok).toBe(true);
    expect(paypal.monthly_savings_eur.point).toBeGreaterThan(stripe.monthly_savings_eur.point);
  });

  it('merchant already at benchmark → zero savings, no negative numbers', () => {
    // Custom row where current == achievable: gap is 0, savings must be 0.
    const flatTable = FULL_TABLE.map(r =>
      r.cohort_key === 'stripe|ANY|EU'
        ? { ...r, achievable_percent_bps: r.percent_bps, achievable_fixed_fee_minor_units: r.fixed_fee_minor_units }
        : r
    );
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' },
      flatTable
    );
    expect(result.ok).toBe(true);
    expect(result.monthly_savings_eur.point).toBe(0);
    expect(result.monthly_savings_eur.lo).toBe(0);
    expect(result.annual_savings_eur.hi).toBe(0);
  });
});

// ─── Helper unit tests ──────────────────────────────────────────────────────

describe('helpers', () => {
  it('applyBand handles band=0 (point estimate collapses)', () => {
    const { lo, point, hi } = applyBand(1000, 0);
    expect(lo).toBe(1000);
    expect(point).toBe(1000);
    expect(hi).toBe(1000);
  });

  it('applyBand clamps lo at 0 (never negative)', () => {
    const { lo } = applyBand(50, 5.0); // absurd 500% band
    expect(lo).toBe(0);
  });

  it('computeMonthlySavings returns 0 when achievable >= current (never negative)', () => {
    const savings = computeMonthlySavings({
      current_bps: 100, achievable_bps: 200, monthly_gmv_eur: 100000,
    });
    expect(savings).toBe(0);
  });
});