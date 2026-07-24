// paymentsCountry.test.js — M5 (2026-07-24): country-aware row resolution.
//
// Locks the M5 contract on selectRow / calculateGap:
//   1. Candidates match (slug, tier, region, channel, active) exactly as
//      pre-M5 (key-based cascade untouched).
//   2. Input country + a candidate row with row.country === input country →
//      the country row WINS over the pan-regional row.
//   3. No country match → the pan-regional (country-less) row, as today.
//   4. A row pinned to a DIFFERENT country is NEVER selected — an ES row must
//      not answer for an FR merchant (falls to pan-regional or fallback).
//   5. Regional fallback chain (ANY|ANY|<region>) stays country-agnostic.
//   6. Input without country → pan-regional only, never a country row.
//
// RETROCOMPAT INVARIANT (the heart of M5): with a table carrying no country
// rows, every result is byte-identical to pre-M5 — verified explicitly below.

import { describe, it, expect } from 'vitest';
import { calculateGap, selectRow } from './paymentsGap.js';
import { buildRecoveryRoadmap } from './paymentsRoadmap.js';

// Row factory — mirrors PaymentsRateTable (same shape as paymentsGap.test.js)
// plus the M5 `country` field (absent by default, like every pre-M5 row).
function row(overrides) {
  return {
    cohort_key: overrides.cohort_key,
    provider_slug: overrides.provider_slug,
    tier: 'ANY',
    region: overrides.region,
    ...(overrides.country !== undefined ? { country: overrides.country } : {}),
    ...(overrides.channel !== undefined ? { channel: overrides.channel } : {}),
    percent_bps: overrides.percent_bps,
    fixed_fee_minor_units: overrides.fixed_fee_minor_units ?? 0,
    fixed_fee_currency: overrides.fixed_fee_currency ?? 'EUR',
    achievable_percent_bps: overrides.achievable_percent_bps ?? null,
    achievable_fixed_fee_minor_units: overrides.achievable_fixed_fee_minor_units ?? null,
    intl_uplift_bps: overrides.intl_uplift_bps ?? null,
    achievable_intl_uplift_bps: overrides.achievable_intl_uplift_bps ?? null,
    verified: overrides.verified ?? true,
    savings_band_pct: overrides.savings_band_pct ?? 0.20,
    achievable_breakdown_json: overrides.achievable_breakdown_json ?? null,
    active: overrides.active !== false,
  };
}

// The 4 online regional fallbacks (country-less by design — rule 5).
const FALLBACKS = [
  row({ cohort_key: 'ANY|ANY|EU',  provider_slug: 'ANY', region: 'EU',
        percent_bps: 200, fixed_fee_minor_units: 25,
        achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 25,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|UK',  provider_slug: 'ANY', region: 'UK',
        percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: 'GBP',
        achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 20,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|US',  provider_slug: 'ANY', region: 'US',
        percent_bps: 280, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 200, achievable_fixed_fee_minor_units: 30,
        verified: false, savings_band_pct: 0.35 }),
  row({ cohort_key: 'ANY|ANY|RoW', provider_slug: 'ANY', region: 'RoW',
        percent_bps: 320, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
        achievable_percent_bps: 220, achievable_fixed_fee_minor_units: 30,
        verified: false, savings_band_pct: 0.35 }),
];

// Pan-EU SumUp online row (research: 1.75% — the FR published price).
// fixed fee 0 → effective_bps is exactly percent_bps at any ticket.
const SUMUP_PAN = row({
  cohort_key: 'sumup|ANY|EU', provider_slug: 'sumup', region: 'EU',
  percent_bps: 175, achievable_percent_bps: 120, achievable_fixed_fee_minor_units: 0,
});

// Country-pinned SumUp ES online row (research: 1.49% in Spain). cohort_key
// uses the M5 'REGION-CC' convention — a readable identifier the engine
// NEVER parses (resolution reads the `country` field).
const SUMUP_ES = row({
  cohort_key: 'sumup|ANY|EU-ES', provider_slug: 'sumup', region: 'EU', country: 'ES',
  percent_bps: 149, achievable_percent_bps: 120, achievable_fixed_fee_minor_units: 0,
});

const baseInput = {
  monthly_gmv_eur: 50000, avg_ticket_eur: 80,
  region: 'EU', provider_slug: 'sumup', intl_pct: 0,
};

describe('M5 — country-aware row resolution', () => {
  it('(a) FR merchant + pan-EU row only → resolves the pan-European row (pre-M5 behavior)', () => {
    const table = [...FALLBACKS, SUMUP_PAN];
    const r = calculateGap({ ...baseInput, country: 'FR' }, table);
    expect(r.ok).toBe(true);
    expect(r.cohort.key).toBe('sumup|ANY|EU');
    expect(r.cohort.matched).toBe('exact');
    expect(r.current_effective_bps).toBeCloseTo(175, 8);
  });

  it('(b) ES merchant + pan-EU row AND country=ES row → the ES row wins', () => {
    const table = [...FALLBACKS, SUMUP_PAN, SUMUP_ES];
    const r = calculateGap({ ...baseInput, country: 'ES' }, table);
    expect(r.ok).toBe(true);
    expect(r.cohort.key).toBe('sumup|ANY|EU-ES');
    expect(r.cohort.matched).toBe('exact');
    expect(r.current_effective_bps).toBeCloseTo(149, 8);
    // Same table, FR merchant → still the pan row (no cross-country leakage).
    const fr = calculateGap({ ...baseInput, country: 'FR' }, table);
    expect(fr.cohort.key).toBe('sumup|ANY|EU');
    expect(fr.current_effective_bps).toBeCloseTo(175, 8);
  });

  it('(c) FR merchant + ONLY a country=ES sumup row → NEVER uses it; falls to regional fallback', () => {
    const table = [...FALLBACKS, SUMUP_ES];
    const r = calculateGap({ ...baseInput, country: 'FR' }, table);
    expect(r.ok).toBe(true);
    expect(r.cohort.key).toBe('ANY|ANY|EU');
    expect(r.cohort.matched).toBe('fallback');
  });

  it('(c-candado) a country-pinned row hiding under a LEGACY pan cohort_key is still refused for a mismatched country', () => {
    // Defensive rule 4: even if a seeder mistakenly pins country on a row
    // keyed with the pan-regional shape, the field-based guard skips it.
    const esWithPanKey = { ...SUMUP_ES, cohort_key: 'sumup|ANY|EU' };
    const table = [...FALLBACKS, esWithPanKey];
    const r = calculateGap({ ...baseInput, country: 'FR' }, table);
    expect(r.ok).toBe(true);
    expect(r.cohort.key).toBe('ANY|ANY|EU'); // fallback, never the ES row
  });

  it('(d) input WITHOUT country → pan-European row, never a country row', () => {
    const both = [...FALLBACKS, SUMUP_PAN, SUMUP_ES];
    const r = calculateGap(baseInput, both);
    expect(r.ok).toBe(true);
    expect(r.cohort.key).toBe('sumup|ANY|EU');
    // Only the ES row available → fallback (never served without a country).
    const onlyEs = calculateGap(baseInput, [...FALLBACKS, SUMUP_ES]);
    expect(onlyEs.cohort.key).toBe('ANY|ANY|EU');
  });

  it('(e) classifier: already_optimized works identically on a country-specific verified row', () => {
    // ES row flat (achievable == current) → zero gap on a VERIFIED row →
    // already_optimized, exactly as it would on a pan row.
    const flatEs = {
      ...SUMUP_ES,
      achievable_percent_bps: SUMUP_ES.percent_bps,
      achievable_fixed_fee_minor_units: SUMUP_ES.fixed_fee_minor_units,
    };
    const r = calculateGap({ ...baseInput, country: 'ES' }, [...FALLBACKS, SUMUP_PAN, flatEs]);
    expect(r.ok).toBe(true);
    expect(r.cohort.key).toBe('sumup|ANY|EU-ES');
    expect(r.monthly_savings_eur.point).toBe(0);
    expect(r.classification).toBe('already_optimized');
  });

  it('(e) roadmap: builds normally from a country-specific savings_opportunity result', () => {
    const table = [...FALLBACKS, SUMUP_PAN, SUMUP_ES];
    const r = calculateGap({ ...baseInput, country: 'ES' }, table);
    expect(r.ok).toBe(true);
    // Gap 149 → 120 = 29 bps on €50k/mo → €1,740/yr > max(€200, 15bps floor €900).
    expect(r.classification).toBe('savings_opportunity');
    const roadmap = buildRecoveryRoadmap(
      r,
      { monthly_gmv_eur: 50000, avg_ticket_eur: 80, provider_slug: 'sumup', country: 'ES' },
      table,
    );
    expect(roadmap.state).toBe('savings_opportunity');
    expect(roadmap.recoverable_annual.point).toBeCloseTo(r.annual_savings_eur.point, 6);
    expect(roadmap.recommendations.length).toBeGreaterThanOrEqual(2);
    expect(roadmap.target_bps).toBeCloseTo(r.achievable_effective_bps, 8);
  });

  it('RETROCOMPAT — with a country-less table, results with and without input country are byte-identical', () => {
    // The sealed invariant: the current production table has NO country rows,
    // so passing country must change NOTHING.
    const table = [...FALLBACKS, SUMUP_PAN];
    const without = calculateGap(baseInput, table);
    const withFr = calculateGap({ ...baseInput, country: 'FR' }, table);
    const withEs = calculateGap({ ...baseInput, country: 'ES' }, table);
    for (const r of [withFr, withEs]) {
      expect(r.ok).toBe(true);
      expect(r.cohort.key).toBe(without.cohort.key);
      expect(r.cohort.matched).toBe(without.cohort.matched);
      expect(r.current_effective_bps).toBe(without.current_effective_bps);
      expect(r.achievable_effective_bps).toBe(without.achievable_effective_bps);
      expect(r.monthly_savings_eur).toEqual(without.monthly_savings_eur);
      expect(r.annual_savings_eur).toEqual(without.annual_savings_eur);
      expect(r.assumptions).toEqual(without.assumptions);
      expect(r.classification).toBe(without.classification);
      expect(r.engine_version).toBe(without.engine_version);
    }
  });

  it('RETROCOMPAT — legacy 3/4-arg selectRow calls (no country) behave exactly as before', () => {
    const table = [...FALLBACKS, SUMUP_PAN, SUMUP_ES];
    const legacy = selectRow(table, 'sumup', 'EU');
    expect(legacy.row.cohort_key).toBe('sumup|ANY|EU');
    expect(legacy.matched).toBe('exact');
    const withChannel = selectRow(table, 'sumup', 'EU', 'online');
    expect(withChannel.row.cohort_key).toBe('sumup|ANY|EU');
  });
});