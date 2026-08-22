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
//   6. Enmienda 1: intl uplift lives on the ROW, not in code. Every intl
//      test reads its expected number from the fixture — never from an
//      engine-side constant.

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
  INTL_UPLIFT_NOT_MODELED_ASSUMPTION,
  RATE_FRESHNESS_MAX_AGE_DAYS,
  rateRowFreshness,
  ENGINE_VERSION,
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
    // v1.2.0 — intl uplift fields. Test rows mirror what the seeder writes.
    intl_uplift_bps: overrides.intl_uplift_bps ?? null,
    achievable_intl_uplift_bps: overrides.achievable_intl_uplift_bps ?? null,
    verified: overrides.verified,
    verified_at: overrides.verified === true
      ? (overrides.verified_at ?? new Date().toISOString())
      : (overrides.verified_at ?? null),
    savings_band_pct: overrides.savings_band_pct,
    achievable_breakdown_json: overrides.achievable_breakdown_json ?? null,
    active: overrides.active !== false,
  };
}

// A complete-enough table for tests. Numbers mirror the seeded values from
// Chunk 1b + 1.2.0 so ratios and cross-checks against real production stay
// honest. Intl uplifts on Stripe rows use the VERIFIED numbers from stripe.com
// pricing pages (Stripe EU/UK: +175/+90; Stripe US: +150/+75). PayPal /
// Shopify rows leave intl uplift null (source-quoted absence — engine must
// emit "not modeled" when intl_pct > 0). Fallback rows carry the regional
// intl uplift (proxied from the regional Stripe number, verified=false).
const FULL_TABLE = [
  row({ cohort_key: 'stripe|ANY|EU', provider_slug: 'stripe', region: 'EU',
        percent_bps: 150, fixed_fee_minor_units: 25, fixed_fee_currency: 'EUR',
        achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 25,
        intl_uplift_bps: 175, achievable_intl_uplift_bps: 90,
        verified: true, savings_band_pct: 0.20,
        achievable_breakdown_json: { interchange_bps: 26, scheme_fees_bps: 20, processor_margin_bps: 40, processor_margin_band_bps: 20 } }),
  row({ cohort_key: 'stripe|ANY|UK', provider_slug: 'stripe', region: 'UK',
        percent_bps: 150, fixed_fee_minor_units: 20, fixed_fee_currency: 'GBP',
        achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 20,
        intl_uplift_bps: 175, achievable_intl_uplift_bps: 90,
        verified: true, savings_band_pct: 0.20 }),
  row({ cohort_key: 'stripe|ANY|US', provider_slug: 'stripe', region: 'US',
        percent_bps: 290, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 180, achievable_fixed_fee_minor_units: 30,
        intl_uplift_bps: 150, achievable_intl_uplift_bps: 75,
        verified: true, savings_band_pct: 0.25 }),
  row({ cohort_key: 'paypal|ANY|EU', provider_slug: 'paypal', region: 'EU',
        percent_bps: 290, fixed_fee_minor_units: 35, fixed_fee_currency: 'EUR',
        achievable_percent_bps: 86, achievable_fixed_fee_minor_units: 25,
        // Deliberately null — PayPal EU publishes intl as country-pair tables,
        // seeder documents "not modeled" (see seedPaymentsRateTable).
        intl_uplift_bps: null, achievable_intl_uplift_bps: null,
        verified: true, savings_band_pct: 0.20 }),
  row({ cohort_key: 'shopify_payments|ANY|US', provider_slug: 'shopify_payments', region: 'US',
        percent_bps: 290, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 180, achievable_fixed_fee_minor_units: 30,
        intl_uplift_bps: null, achievable_intl_uplift_bps: null,
        verified: true, savings_band_pct: 0.25 }),
  row({ cohort_key: 'ANY|ANY|EU', provider_slug: 'ANY', region: 'EU',
        percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: 'EUR',
        achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 25,
        intl_uplift_bps: 175, achievable_intl_uplift_bps: 90,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|UK', provider_slug: 'ANY', region: 'UK',
        percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: 'GBP',
        achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 20,
        intl_uplift_bps: 175, achievable_intl_uplift_bps: 90,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|US', provider_slug: 'ANY', region: 'US',
        percent_bps: 280, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 200, achievable_fixed_fee_minor_units: 30,
        intl_uplift_bps: 150, achievable_intl_uplift_bps: 75,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|RoW', provider_slug: 'ANY', region: 'RoW',
        percent_bps: 320, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 220, achievable_fixed_fee_minor_units: 30,
        intl_uplift_bps: 165, achievable_intl_uplift_bps: 85,
        verified: false, savings_band_pct: 0.35 }),
];

// Helper — resolve a row from FULL_TABLE by cohort_key so intl_pct tests read
// their expected numbers from the fixture, not from local constants. This is
// the Enmienda 1 guarantee at the TEST layer: no intl uplift number is
// duplicated between the row and the assertion.
function getRow(cohort_key) {
  const r = FULL_TABLE.find(x => x.cohort_key === cohort_key);
  if (!r) throw new Error(`fixture missing cohort ${cohort_key}`);
  return r;
}

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
    expect(REQUIRED_FALLBACK_KEYS).toEqual([
      'ANY|ANY|EU', 'ANY|ANY|UK', 'ANY|ANY|US', 'ANY|ANY|RoW',
    ]);
  });
});

describe('verified rate freshness', () => {
  it('uses a non-reducible 90-day boundary', () => {
    expect(RATE_FRESHNESS_MAX_AGE_DAYS).toBe(90);
    const nowMs = Date.parse('2026-08-22T00:00:00.000Z');
    expect(rateRowFreshness({ active: true, verified: true, verified_at: '2026-05-24T00:00:00.000Z' }, nowMs).status).toBe('CURRENT');
    expect(rateRowFreshness({ active: true, verified: true, verified_at: '2026-05-23T23:59:59.999Z' }, nowMs)).toMatchObject({
      current: false,
      status: 'STALE',
      reason: 'verification_older_than_90_days',
    });
  });

  it('fails closed when the selected verified rate lacks fresh verification', () => {
    const staleTable = FULL_TABLE.map((candidate) => candidate.cohort_key === 'stripe|ANY|EU'
      ? { ...candidate, verified_at: '2020-01-01T00:00:00.000Z' }
      : candidate);
    expect(calculateGap({
      monthly_gmv_eur: 10_000,
      avg_ticket_eur: 50,
      region: 'EU',
      provider_slug: 'stripe',
    }, staleTable)).toMatchObject({
      ok: false,
      error: 'rate_table_stale',
      stale: ['stripe|ANY|EU'],
    });
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
    const partial = FULL_TABLE.filter(r => r.cohort_key !== 'ANY|ANY|US');
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'US', provider_slug: 'stripe' },
      partial
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rate_table_incomplete');
    expect(result.missing).toContain('ANY|ANY|US');
  });

  it('Stripe EU (achievable_fixed == current_fixed) → different effective rates, IDENTICAL savings', () => {
    const base = { monthly_gmv_eur: 50000, region: 'EU', provider_slug: 'stripe' };
    const r30 = calculateGap({ ...base, avg_ticket_eur: 30 }, FULL_TABLE);
    const r250 = calculateGap({ ...base, avg_ticket_eur: 250 }, FULL_TABLE);
    expect(r30.ok).toBe(true);
    expect(r250.ok).toBe(true);
    // Effective rate for the low-ticket merchant is materially higher — the
    // amortization delta between €30 and €250 on a 25c fixed is ~73 bps.
    expect(r30.current_effective_bps - r250.current_effective_bps).toBeGreaterThan(70);
    expect(r30.current_effective_bps - r250.current_effective_bps).toBeLessThan(76);
    // Savings are IDENTICAL because the same 25c fixed appears in both
    // current and achievable — the fee cancels in the subtraction.
    expect(r30.monthly_savings_eur.point).toBeCloseTo(r250.monthly_savings_eur.point, 6);
  });

  it('Stripe EU with achievable_fixed < current_fixed → savings DO differ across tickets (complementary case)', () => {
    const asymTable = FULL_TABLE.map(r =>
      r.cohort_key === 'stripe|ANY|EU'
        ? { ...r, achievable_fixed_fee_minor_units: 10 }
        : r
    );
    const base = { monthly_gmv_eur: 50000, region: 'EU', provider_slug: 'stripe' };
    const r30 = calculateGap({ ...base, avg_ticket_eur: 30 }, asymTable);
    const r250 = calculateGap({ ...base, avg_ticket_eur: 250 }, asymTable);
    expect(r30.ok).toBe(true);
    expect(r250.ok).toBe(true);
    expect(r30.current_effective_bps).toBeGreaterThan(r250.current_effective_bps);
    expect(r30.monthly_savings_eur.point).toBeGreaterThan(r250.monthly_savings_eur.point);
    // Delta ≈ 44 bps of extra gap at €30 vs €250 → on 50k GMV ≈ €220/mo.
    const delta = r30.monthly_savings_eur.point - r250.monthly_savings_eur.point;
    expect(delta).toBeGreaterThan(200);
    expect(delta).toBeLessThan(240);
  });

  it('exact-match cohort (Stripe EU, verified) → narrow band ±20%', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.verified).toBe(true);
    expect(result.cohort.matched).toBe('exact');
    const point = result.monthly_savings_eur.point;
    expect(result.monthly_savings_eur.hi - point).toBeCloseTo(point * 0.20, 2);
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
    const point = result.monthly_savings_eur.point;
    expect(result.monthly_savings_eur.hi - point).toBeCloseTo(point * 0.35, 2);
    expect(result.assumptions).toContain(FALLBACK_ASSUMPTION);
  });

  it('achievable breakdown assumption is included when present on the row', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    const hasBreakdownAssumption = result.assumptions.some(a => a.includes('interchange 26 bps'));
    expect(hasBreakdownAssumption).toBe(true);
  });

  // ─── Two-bands contract (M3.6) ────────────────────────────────────────────
  //
  // Locks the outcome of Decision_Log 2026-07-10 M3.6: the engine emits TWO
  // independent ± that measure different things, and they must not be
  // silently reconciled. The savings range comes from `savings_band_pct`
  // (editorial per cohort, applied by applyBand); the "±N bps assumption"
  // inside ACHIEVABLE_NOTE comes from `processor_margin_band_bps` on the
  // row's achievable_breakdown_json. These tests are the candado.
  //
  // ALSO CRITICAL: the frontend FeeBreakdownCard parses ACHIEVABLE_NOTE with
  // a strict regex to render the interchange / scheme / margin bars. The
  // regex requires the "(±N bps assumption)" trailer to be preserved. If a
  // future edit collapses that trailer into free text, the card silently
  // falls back to the "no public breakdown" copy — a visible regression the
  // suite currently would not catch. The parseable-shape test below is the
  // candado against that specific rot.

  it('ACHIEVABLE_NOTE stays parseable by FeeBreakdownCard.parseAchievableBreakdown() — candado copy↔parser', () => {
    // Same regex FeeBreakdownCard uses. If someone rewrites ACHIEVABLE_NOTE
    // in paymentsGap.js and drops the "(±N bps assumption)" trailer, this
    // will fail — before the visual regression makes it into a build.
    const PARSER_RE = /interchange (\d+(?:\.\d+)?) bps \+ scheme fees (\d+(?:\.\d+)?) bps \+ assumed processor margin (\d+(?:\.\d+)?) bps \(±(\d+(?:\.\d+)?) bps assumption\)/;
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    const line = result.assumptions.find(a => typeof a === 'string' && a.startsWith('Achievable rate composition:'));
    expect(line).toBeDefined();
    const m = line.match(PARSER_RE);
    expect(m).not.toBeNull();
    // Numbers extract to the fixture's breakdown values, verbatim.
    const breakdown = getRow('stripe|ANY|EU').achievable_breakdown_json;
    expect(Number(m[1])).toBe(breakdown.interchange_bps);           // 26
    expect(Number(m[2])).toBe(breakdown.scheme_fees_bps);           // 20
    expect(Number(m[3])).toBe(breakdown.processor_margin_bps);      // 40
    expect(Number(m[4])).toBe(breakdown.processor_margin_band_bps); // 20
  });

  it('ACHIEVABLE_NOTE carries the two-bands clarifier — savings range vs component ± are called out as different', () => {
    // Second candado (weaker but complementary): the free-text clarifier
    // that lives AFTER the parseable segment must remain, so a reader of
    // just the assumption line understands the two ± are not the same
    // uncertainty. If someone deletes it without also updating
    // AssumptionsFootnote's contextual line, both signals would vanish.
    const result = calculateGap(
      { monthly_gmv_eur: 100000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    const line = result.assumptions.find(a => typeof a === 'string' && a.startsWith('Achievable rate composition:'));
    expect(line).toBeDefined();
    expect(line).toMatch(/separate from the savings range/);
  });

  it('two-bands sanity: monthly range width and processor_margin ± come from DIFFERENT sources', () => {
    // Empirical verification of the M3.6 invariant on the FR/stripe cohort
    // shape (verified row, band_pct=0.20, breakdown band=20 bps). Over
    // GMV=€432k (Xavi's FR reference case), the two half-widths should
    // NOT coincide — proving they measure different things and are not
    // reconciled by the engine.
    const gmv = 432000;
    const result = calculateGap(
      { monthly_gmv_eur: gmv, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    const point = result.monthly_savings_eur.point;
    const savingsRangeHalfEur = result.monthly_savings_eur.hi - point;
    // Editorial band = 20% × point (the Stripe EU verified row).
    expect(savingsRangeHalfEur).toBeCloseTo(point * 0.20, 2);
    // Processor-margin ± = 20 bps ABSOLUTE. Sanity check that this does NOT
    // equal the savings range half-width when we translate it back to EUR
    // over the merchant's GMV (20 bps × €432k = €864, materially different
    // from 0.20 × point).
    const processorMarginBandEur = (getRow('stripe|ANY|EU').achievable_breakdown_json.processor_margin_band_bps / 10000) * gmv;
    expect(Math.abs(processorMarginBandEur - savingsRangeHalfEur)).toBeGreaterThan(1);
    // Annual is 12× monthly on BOTH endpoints (invariant re-affirmed under
    // the M3.6 lens — the range is applied once, at the monthly point).
    expect(result.annual_savings_eur.lo).toBeCloseTo(result.monthly_savings_eur.lo * 12, 2);
    expect(result.annual_savings_eur.hi).toBeCloseTo(result.monthly_savings_eur.hi * 12, 2);
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

  // ─── Enmienda 1 — intl uplift reads from row, not from code ───────────────
  //
  // Contract:
  //   • intl_pct = 0  → behavior IDENTICAL to v1.0.0 (regression guard).
  //   • intl_pct > 0 AND row.intl_uplift_bps set → current/achievable both
  //     climb by their ROW-specified uplift. Gap widens by
  //     (intl_uplift_bps − achievable_intl_uplift_bps) on the intl portion.
  //   • intl_pct > 0 AND row.intl_uplift_bps null → engine emits
  //     "intl uplift not modeled" assumption, does NOT invent an uplift.
  //   • Fixed fees are NEVER scaled by intl_pct.

  it('intl_pct=0 is unchanged from pre-1.1.0 behavior (regression guard)', () => {
    const base = { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' };
    const unset = calculateGap(base, FULL_TABLE);
    const zero = calculateGap({ ...base, intl_pct: 0 }, FULL_TABLE);
    expect(unset.ok).toBe(true);
    expect(zero.ok).toBe(true);
    expect(zero.current_effective_bps).toBeCloseTo(unset.current_effective_bps, 8);
    expect(zero.achievable_effective_bps).toBeCloseTo(unset.achievable_effective_bps, 8);
    expect(zero.monthly_savings_eur.point).toBeCloseTo(unset.monthly_savings_eur.point, 6);
    expect(zero.assumptions.some(a => a.includes('cross-border'))).toBe(false);
    expect(zero.assumptions).not.toContain(INTL_UPLIFT_NOT_MODELED_ASSUMPTION);
  });

  it('intl_pct=100 raises both rates by exactly the ROW-specified uplift (Enmienda 1 contract)', () => {
    // Read the expected numbers FROM the fixture row — never duplicate them
    // in the assertion. This is the guarantee that intl uplifts live on the
    // row and only on the row.
    const stripeEu = getRow('stripe|ANY|EU');
    const expectedCurrentDelta = stripeEu.intl_uplift_bps;           // 175
    const expectedAchievableDelta = stripeEu.achievable_intl_uplift_bps; // 90
    const base = { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' };
    const domestic = calculateGap({ ...base, intl_pct: 0 }, FULL_TABLE);
    const intl = calculateGap({ ...base, intl_pct: 100 }, FULL_TABLE);
    expect(domestic.ok).toBe(true);
    expect(intl.ok).toBe(true);
    expect(intl.current_effective_bps - domestic.current_effective_bps).toBeCloseTo(expectedCurrentDelta, 6);
    expect(intl.achievable_effective_bps - domestic.achievable_effective_bps).toBeCloseTo(expectedAchievableDelta, 6);
    // Gap widens by (current_uplift − achievable_uplift) on 100% of GMV.
    const expectedExtraSavings = ((expectedCurrentDelta - expectedAchievableDelta) / 10000) * 100000;
    const extra = intl.monthly_savings_eur.point - domestic.monthly_savings_eur.point;
    expect(extra).toBeCloseTo(expectedExtraSavings, 0);
    expect(intl.assumptions.some(a => a.includes('cross-border'))).toBe(true);
  });

  it('intl_pct scales linearly between 0 and 100 (25% → quarter of the extra gap)', () => {
    const base = { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' };
    const p0 = calculateGap({ ...base, intl_pct: 0 }, FULL_TABLE);
    const p25 = calculateGap({ ...base, intl_pct: 25 }, FULL_TABLE);
    const p100 = calculateGap({ ...base, intl_pct: 100 }, FULL_TABLE);
    const g0 = p0.monthly_savings_eur.point;
    const g25 = p25.monthly_savings_eur.point;
    const g100 = p100.monthly_savings_eur.point;
    expect(g25 - g0).toBeCloseTo((g100 - g0) * 0.25, 4);
  });

  it('Stripe EU vs Stripe US produce DIFFERENT intl-driven gap deltas (per-row uplift proof)', () => {
    // Stripe EU: +175/+90 → 85 bps gap delta.
    // Stripe US: +150/+75 → 75 bps gap delta.
    // If the engine used a single hardcoded constant, both would produce
    // the same intl delta on equal GMV. The Enmienda 1 fix REQUIRES them to
    // differ, and to differ in the direction the seeder dictates.
    const stripeEu = getRow('stripe|ANY|EU');
    const stripeUs = getRow('stripe|ANY|US');
    const expectedEuDelta = stripeEu.intl_uplift_bps - stripeEu.achievable_intl_uplift_bps;   // 85
    const expectedUsDelta = stripeUs.intl_uplift_bps - stripeUs.achievable_intl_uplift_bps;   // 75
    expect(expectedEuDelta).toBeGreaterThan(expectedUsDelta);

    const gmv = 100000;
    const euDom = calculateGap({ monthly_gmv_eur: gmv, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe', intl_pct: 0 }, FULL_TABLE);
    const euIntl = calculateGap({ monthly_gmv_eur: gmv, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe', intl_pct: 100 }, FULL_TABLE);
    const usDom = calculateGap({ monthly_gmv_eur: gmv, avg_ticket_eur: 80, region: 'US', provider_slug: 'stripe', intl_pct: 0 }, FULL_TABLE);
    const usIntl = calculateGap({ monthly_gmv_eur: gmv, avg_ticket_eur: 80, region: 'US', provider_slug: 'stripe', intl_pct: 100 }, FULL_TABLE);
    const euExtra = euIntl.monthly_savings_eur.point - euDom.monthly_savings_eur.point;
    const usExtra = usIntl.monthly_savings_eur.point - usDom.monthly_savings_eur.point;
    // Expected: EU extra = 85 bps × 100k GMV = €850/mo; US extra = 75 bps × 100k = €750/mo.
    expect(euExtra).toBeCloseTo((expectedEuDelta / 10000) * gmv, 0);
    expect(usExtra).toBeCloseTo((expectedUsDelta / 10000) * gmv, 0);
    // AND the EU extra is strictly larger than the US extra — the direct
    // evidence that per-row uplifts are being read.
    expect(euExtra).toBeGreaterThan(usExtra);
  });

  it('intl_pct > 0 on a row with intl_uplift_bps=null → engine emits "not modeled" assumption, no invented uplift', () => {
    // PayPal EU fixture leaves intl_uplift_bps null (source-quoted absence).
    // The engine MUST NOT invent a value — savings against intl_pct=0 must
    // be effectively identical (only floating-point noise from an intl
    // contribution of zero), and the assumption must be present.
    const base = { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'paypal' };
    const domestic = calculateGap({ ...base, intl_pct: 0 }, FULL_TABLE);
    const intl = calculateGap({ ...base, intl_pct: 100 }, FULL_TABLE);
    expect(domestic.ok).toBe(true);
    expect(intl.ok).toBe(true);
    // No hidden uplift: both current & achievable are unchanged by intl_pct.
    expect(intl.current_effective_bps).toBeCloseTo(domestic.current_effective_bps, 8);
    expect(intl.achievable_effective_bps).toBeCloseTo(domestic.achievable_effective_bps, 8);
    // Assumption present.
    expect(intl.assumptions).toContain(INTL_UPLIFT_NOT_MODELED_ASSUMPTION);
    // And the modeled-uplift assumption is ABSENT (double-guard).
    expect(intl.assumptions.some(a => a.includes('cross-border interchange is not negotiable'))).toBe(false);
  });

  it('engine_version reports the SemVer-tagged 1.4.0 name', () => {
    // Explicit contract check — this string is persisted verbatim on every
    // PaymentsAnalysisSession row. Downstream benchmark aggregators filter
    // by engine_version, so silent renames would corrupt cohorts.
    // Bumped 1.3.0 → 1.4.0 with the M4-TPV Fase 2A-redo in-store channel
    // work (2026-07-12). The FULL_TABLE fixture below is unchanged — every
    // online assertion in this file still holds byte-identical to 1.3.0.
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    // v1.5.0 (M4-refinado): multi-anchor + 3-state classification. See
    // src/docs/Decision_Log_Iter4.md for the version-bump rationale. Online
    // arithmetic is byte-identical to 1.4.0 (retrocompat oracle in the
    // dedicated classifier test file), so THIS test only pins the version
    // string; the numeric oracle lives in paymentsGap.classifier.test.js.
    // v1.6.0 (SEED-ES-2, 2026-07-24): version bump with ZERO logic change —
    // first country=ES rows + ES anchors in the multi-anchor pool change real
    // results for ES merchants, so the version gets a trace. Every numeric
    // assertion in this file is untouched (fixture has no country rows).
    expect(result.engine_version).toBe('payments-gap-1.7.0');
    expect(ENGINE_VERSION).toBe('payments-gap-1.7.0');
  });
});

// ─── v1.3.0 verified path ───────────────────────────────────────────────────
//
// Contract (sealed 2026-07-10, corazón de M3):
//   1. measured_current_bps present → current_effective_bps = measured EXACT.
//      NO composition on top: no fixed amortization, no intl uplift added.
//   2. Achievable always composed from the table. Uses measured_intl_pct when
//      supplied, else falls back to the form intl_pct.
//   3. Verified mode emits MEASURED_CURRENT_NOTE (mandatory) naming the rate
//      and, when provided, N charges over M days.
//   4. mode field is "verified" | "estimated" — persisted verbatim.
//   5. measured_current_bps absent → BYTE-IDENTICAL 1.2.0 behavior (anti-
//      regression lock for anonymous submitPaymentsAnalysis path).
//   6. Anti-double-counting lock: if caller passes back the result of an
//      estimated 1.2.0 calc as measured_current_bps, current MUST be that
//      exact number — not stacked with extras.

describe('calculateGap — v1.3.0 verified path', () => {
  it('regression: absent measured_current_bps behaves byte-identical to 1.2.0 across 3 scenarios', () => {
    // Anti-regression lock: submitPaymentsAnalysis (Chunk 3) does NOT pass
    // measured_current_bps. Every current output must equal what 1.2.0 produced.
    // We verify against the same fixture + explicit expected values derived
    // from the fixture rows (no engine-side constants).
    const scenarios = [
      { monthly_gmv_eur: 50000,  avg_ticket_eur: 80,  region: 'EU', provider_slug: 'stripe', intl_pct: 10 },
      { monthly_gmv_eur: 100000, avg_ticket_eur: 250, region: 'US', provider_slug: 'stripe', intl_pct: 0 },
      { monthly_gmv_eur: 25000,  avg_ticket_eur: 30,  region: 'EU', provider_slug: 'paypal', intl_pct: 50 },
    ];
    for (const s of scenarios) {
      const withoutMeasured = calculateGap(s, FULL_TABLE);
      const withNull        = calculateGap({ ...s, measured_current_bps: null }, FULL_TABLE);
      const withUndefined   = calculateGap({ ...s, measured_current_bps: undefined }, FULL_TABLE);
      expect(withoutMeasured.ok).toBe(true);
      expect(withNull.ok).toBe(true);
      expect(withUndefined.ok).toBe(true);
      // Current, achievable, savings, assumptions — ALL identical to omitted.
      expect(withNull.current_effective_bps).toBeCloseTo(withoutMeasured.current_effective_bps, 10);
      expect(withNull.achievable_effective_bps).toBeCloseTo(withoutMeasured.achievable_effective_bps, 10);
      expect(withNull.monthly_savings_eur.point).toBeCloseTo(withoutMeasured.monthly_savings_eur.point, 6);
      expect(withUndefined.current_effective_bps).toBeCloseTo(withoutMeasured.current_effective_bps, 10);
      expect(withNull.mode).toBe('estimated');
      expect(withoutMeasured.mode).toBe('estimated');
      // No verified-path assumption in estimated mode.
      expect(withNull.assumptions.some(a => a.includes('measured rate'))).toBe(false);
    }
  });

  it('CANDADO — measured_current_bps=170.625 (exactly what 1.2.0 would have output) → current=170.625 EXACT', () => {
    // Setup: Stripe EU cohort, percent=150, intl_pct=10, uplift_current=175,
    //        fixed=25c, ticket=€800. 1.2.0 estimated arithmetic:
    //   150 + (10/100 × 175) + (0.25 / 800 × 10000)
    //     = 150 + 17.5 + 3.125
    //     = 170.625 bps
    // If the operator ever re-introduces composition on top of measured (i.e.
    // "current = measured + fixed_amortization + intl_uplift"), a caller who
    // passed measured=170.625 would get 170.625 + 17.5 + 3.125 = 191.25 back.
    // This test asserts current MUST be 170.625 EXACT — the anti-double-
    // counting lock. If someone breaks the contract, this test fails loud.
    const base = { monthly_gmv_eur: 50000, avg_ticket_eur: 800, region: 'EU', provider_slug: 'stripe', intl_pct: 10 };

    // First: sanity — 1.2.0 estimated arithmetic really does produce 170.625.
    const estimated = calculateGap(base, FULL_TABLE);
    expect(estimated.ok).toBe(true);
    expect(estimated.current_effective_bps).toBeCloseTo(170.625, 6);

    // Now the candado: pass 170.625 as measured, current must be 170.625 EXACT.
    const verified = calculateGap({ ...base, measured_current_bps: 170.625 }, FULL_TABLE);
    expect(verified.ok).toBe(true);
    expect(verified.current_effective_bps).toBe(170.625); // strict equality — no floating-point slop
    expect(verified.mode).toBe('verified');
  });

  it('measured takes precedence — a wildly different measured overrides the table completely', () => {
    // Same Stripe EU inputs. 1.2.0 estimated current ≈ 181.25 bps.
    // Caller passes measured=250 bps (much higher than the estimate). The
    // engine must accept 250 verbatim, not blend or clamp.
    const base = { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe', intl_pct: 0 };
    const verified = calculateGap({ ...base, measured_current_bps: 250 }, FULL_TABLE);
    expect(verified.ok).toBe(true);
    expect(verified.current_effective_bps).toBe(250);
  });

  it('achievable side stays composed from the table when measured is set', () => {
    // Stripe EU: achievable_percent=86, achievable_fixed=25c → at ticket=€80
    // and intl_pct=0 (measured), achievable_effective = 86 + 0 + 31.25 = 117.25 bps.
    const base = { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe', intl_pct: 0 };
    const verified = calculateGap({ ...base, measured_current_bps: 300 }, FULL_TABLE);
    expect(verified.ok).toBe(true);
    expect(verified.achievable_effective_bps).toBeCloseTo(117.25, 4);
    // Savings = (300 - 117.25) / 10000 × 100000 = €1827.5/mo.
    expect(verified.monthly_savings_eur.point).toBeCloseTo(1827.5, 1);
  });

  it('measured_intl_pct (real intl share from PSP) overrides form intl_pct on the achievable side', () => {
    // Form said intl_pct=0. Measured revealed 40% intl. Achievable side must
    // use 40 (the truth) to build its composed rate — not 0 (the form guess).
    // Stripe EU achievable: 86 + (40/100 × 90) + (0.25/80 × 10000)
    //                     = 86 + 36 + 31.25 = 153.25 bps.
    const base = { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe', intl_pct: 0 };
    const verified = calculateGap({ ...base, measured_current_bps: 250, measured_intl_pct: 40 }, FULL_TABLE);
    expect(verified.ok).toBe(true);
    expect(verified.achievable_effective_bps).toBeCloseTo(153.25, 4);
  });

  it('MANDATORY assumption — measured mode always emits MEASURED_CURRENT_NOTE with rate and sample', () => {
    const base = { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' };
    const verified = calculateGap({
      ...base,
      measured_current_bps: 170.625,
      measured_sample: { charge_count: 1247, days_covered: 90 },
    }, FULL_TABLE);
    expect(verified.ok).toBe(true);
    const measuredNote = verified.assumptions.find(a => a.includes('measured rate'));
    expect(measuredNote).toBeDefined();
    expect(measuredNote).toContain('1.71%'); // 170.625 bps = 1.71% (2dp)
    expect(measuredNote).toContain('1247 charges');
    expect(measuredNote).toContain('90 days');
    expect(measuredNote).toContain('Achievable is composed from published floors');
  });

  it('MEASURED_CURRENT_NOTE emits shorter form when sample descriptor is absent', () => {
    const base = { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' };
    const verified = calculateGap({ ...base, measured_current_bps: 170.625 }, FULL_TABLE);
    expect(verified.ok).toBe(true);
    const measuredNote = verified.assumptions.find(a => a.includes('measured rate'));
    expect(measuredNote).toBeDefined();
    expect(measuredNote).toContain('1.71%');
    expect(measuredNote).toContain('from your synced PSP data');
    expect(measuredNote).not.toContain('charges over');
  });

  it('mode field is "verified" | "estimated" and matches measured presence', () => {
    const base = { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'stripe' };
    expect(calculateGap(base, FULL_TABLE).mode).toBe('estimated');
    expect(calculateGap({ ...base, measured_current_bps: 200 }, FULL_TABLE).mode).toBe('verified');
    expect(calculateGap({ ...base, measured_current_bps: null }, FULL_TABLE).mode).toBe('estimated');
    // Non-finite measured (NaN, Infinity, string) → treated as absent.
    expect(calculateGap({ ...base, measured_current_bps: NaN }, FULL_TABLE).mode).toBe('estimated');
    expect(calculateGap({ ...base, measured_current_bps: 'garbage' }, FULL_TABLE).mode).toBe('estimated');
  });

  it('measured mode on a paypal row (intl uplift NOT modeled) → still emits not-modeled assumption when achievable intl > 0', () => {
    // PayPal EU: intl_uplift_bps=null. If measured_intl_pct=30, the achievable
    // side needs to emit the not-modeled assumption (the achievable arithmetic
    // has to work with 0 uplift — it never invents a number).
    const base = { monthly_gmv_eur: 100000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'paypal', intl_pct: 0 };
    const verified = calculateGap({
      ...base,
      measured_current_bps: 350,
      measured_intl_pct: 30,
    }, FULL_TABLE);
    expect(verified.ok).toBe(true);
    expect(verified.assumptions).toContain(INTL_UPLIFT_NOT_MODELED_ASSUMPTION);
    // And still emits the measured-current note.
    expect(verified.assumptions.some(a => a.includes('measured rate'))).toBe(true);
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
    expect(huge.monthly_savings_eur.point / small.monthly_savings_eur.point).toBeCloseTo(100, 1);
  });

  it('PayPal EU (highest verified current rate) shows the largest gap-to-achievable', () => {
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
    const flatTable = FULL_TABLE.map(r =>
      r.cohort_key === 'stripe|ANY|EU'
        ? {
            ...r,
            achievable_percent_bps: r.percent_bps,
            achievable_fixed_fee_minor_units: r.fixed_fee_minor_units,
            // Also flatten the intl uplift — otherwise the +175/+90 delta
            // creates a residual intl gap the caller doesn't want.
            achievable_intl_uplift_bps: r.intl_uplift_bps,
          }
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
    const { lo } = applyBand(50, 5.0);
    expect(lo).toBe(0);
  });

  it('computeMonthlySavings returns 0 when achievable >= current (never negative)', () => {
    const savings = computeMonthlySavings({
      current_bps: 100, achievable_bps: 200, monthly_gmv_eur: 100000,
    });
    expect(savings).toBe(0);
  });
});
