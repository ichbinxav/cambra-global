// Tests for the M4-TPV Fase 2A-redo IN-STORE branch of paymentsGap.js.
//
// Companion suite to paymentsGap.test.js — that file exercises the ONLINE
// branch on a legacy 4-region rate table (pre-1.4.0 shape, no in-store
// rows). It stays green as-is; this file adds the in-store coverage that
// the design of the split rate-table-validation was created for.
//
// Design contract this suite locks:
//   1. Full 8-row table (online + in_store fallbacks) validates OK for
//      either channel.
//   2. An online request against a rate table that has ONLY the 4 legacy
//      online fallbacks (i.e. pre-1.4.0 shape) still validates fine.
//      This is the retrocompat proof — validated by paymentsGap.test.js;
//      re-checked here so a future refactor can't silently regress it.
//   3. An IN-STORE request against that same online-only table fails with
//      rate_table_incomplete, and the missing[] list names the in_store
//      fallback keys — never falling back silently to an online row.
//   4. Selecting a known in-store provider (sumup) hits the verified
//      in-store row; unknown provider hits the regional in-store fallback.
//      No cross-channel leakage: sumup ONLINE (no verified online row)
//      falls back to the online regional row, not to the sumup in-store row.
//   5. Gap on a traditional-bank in-store row correctly amortizes monthly
//      terminal rental over monthly GMV (in bps), and the assumptions
//      include the terminal-rental note.
//   6. Achievable side uses the anchor breakdown shape (anchor_provider +
//      anchor_percent_bps), emitting the "anchored to X at Y%" assumption
//      — never the online interchange++/margin composition.
//   7. Clamp-at-zero: when the merchant's current in-store rate is at or
//      below the achievable anchor (SumUp low ticket, no rental), savings
//      collapse to 0 with no negative numbers.
//   8. Combined orchestration is OUT OF SCOPE here — the engine has no
//      combined entry point; that logic lives in submitPaymentsAnalysis
//      and is covered by its own backend tests. This file tests the pure
//      per-channel engine surface.
//
// Fixture policy: shape mirrors seedPaymentsRateTable's four in-store
// families (SumUp modern TPV, Stripe Terminal, Zettle, bank fallback with
// rental). Numbers are the same the seeder writes; if the seeder changes,
// mirror the update here so the fixture keeps reflecting reality.

import { describe, it, expect } from 'vitest';
import {
  calculateGap,
  validateRateTable,
  selectRow,
  REQUIRED_FALLBACK_KEYS,
  REQUIRED_FALLBACK_KEYS_ONLINE,
  REQUIRED_FALLBACK_KEYS_IN_STORE,
  FALLBACK_ASSUMPTION,
} from './paymentsGap.js';

// ─── Fixture rows ───────────────────────────────────────────────────────────
// Everything below is a subset of what seedPaymentsRateTable writes. We
// keep the fixture minimal but complete enough that every design-rule
// assertion in this suite can be evaluated deterministically.

function baseRow(overrides) {
  return {
    cohort_key: overrides.cohort_key,
    provider_slug: overrides.provider_slug,
    tier: 'ANY',
    region: overrides.region,
    channel: overrides.channel,
    percent_bps: overrides.percent_bps,
    fixed_fee_minor_units: overrides.fixed_fee_minor_units,
    fixed_fee_currency: overrides.fixed_fee_currency || 'EUR',
    terminal_rental_monthly_minor: overrides.terminal_rental_monthly_minor ?? 0,
    achievable_percent_bps: overrides.achievable_percent_bps ?? null,
    achievable_fixed_fee_minor_units: overrides.achievable_fixed_fee_minor_units ?? null,
    achievable_terminal_rental_monthly_minor: overrides.achievable_terminal_rental_monthly_minor ?? 0,
    intl_uplift_bps: overrides.intl_uplift_bps ?? null,
    achievable_intl_uplift_bps: overrides.achievable_intl_uplift_bps ?? null,
    verified: overrides.verified,
    savings_band_pct: overrides.savings_band_pct,
    achievable_breakdown_json: overrides.achievable_breakdown_json ?? null,
    active: overrides.active !== false,
  };
}

// Online fallbacks — 4 rows, same shape as paymentsGap.test.js. Kept
// minimal (just the ANY|ANY regional rows) since this file's focus is
// in-store; the online branch has its own suite.
const ONLINE_ROWS = [
  baseRow({ cohort_key: 'ANY|ANY|EU', provider_slug: 'ANY', region: 'EU', channel: 'online',
    percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: 'EUR',
    achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 25,
    intl_uplift_bps: 175, achievable_intl_uplift_bps: 90,
    verified: false, savings_band_pct: 0.35 }),
  baseRow({ cohort_key: 'ANY|ANY|UK', provider_slug: 'ANY', region: 'UK', channel: 'online',
    percent_bps: 200, fixed_fee_minor_units: 25, fixed_fee_currency: 'GBP',
    achievable_percent_bps: 100, achievable_fixed_fee_minor_units: 20,
    verified: false, savings_band_pct: 0.35 }),
  baseRow({ cohort_key: 'ANY|ANY|US', provider_slug: 'ANY', region: 'US', channel: 'online',
    percent_bps: 280, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
    achievable_percent_bps: 200, achievable_fixed_fee_minor_units: 30,
    verified: false, savings_band_pct: 0.35 }),
  baseRow({ cohort_key: 'ANY|ANY|RoW', provider_slug: 'ANY', region: 'RoW', channel: 'online',
    percent_bps: 320, fixed_fee_minor_units: 30, fixed_fee_currency: 'USD',
    achievable_percent_bps: 220, achievable_fixed_fee_minor_units: 30,
    verified: false, savings_band_pct: 0.35 }),
];

// In-store rows. Numbers reflect the M4-TPV Fase 2A-redo seed (2026-07-12):
//   • SumUp EU: 1.75% flat, no fixed fee, no rental. Achievable anchored to
//     Stripe Terminal (140 bps + 10c) — for low tickets, SumUp is already
//     the floor (clamp fires).
//   • Stripe Terminal EEA: 1.40% + 0.10 EUR fixed, no rental. Achievable
//     same-provider (no savings modeled — Stripe Terminal is one of the
//     anchors).
//   • Bank fallback EU: percent+rental typical of BNP/CA/SG-style acquirers.
//     Achievable anchored to Stripe Terminal, non-zero rental drives the
//     rental-note assumption.
//   • Regional in-store fallbacks — required by validateRateTable for
//     in_store lookups.
const IN_STORE_ROWS = [
  // SumUp EU — flat 1.75%, no fixed, no rental. Achievable anchored to Stripe Terminal.
  baseRow({ cohort_key: 'sumup|ANY|EU|in_store', provider_slug: 'sumup', region: 'EU', channel: 'in_store',
    percent_bps: 175, fixed_fee_minor_units: 0, fixed_fee_currency: 'EUR',
    terminal_rental_monthly_minor: 0,
    achievable_percent_bps: 140, achievable_fixed_fee_minor_units: 10,
    achievable_terminal_rental_monthly_minor: 0,
    verified: true, savings_band_pct: 0.25,
    achievable_breakdown_json: {
      anchor_provider: 'stripe_terminal',
      anchor_region: 'EEA',
      anchor_percent_bps: 140,
      anchor_fixed_fee_minor_units: 10,
      anchor_source_url: 'https://stripe.com/terminal',
      anchor_source_quote: 'Stripe Terminal EEA: 1.4% + €0.10 per transaction',
    },
  }),

  // Stripe Terminal EEA — the anchor itself. No savings vs itself.
  baseRow({ cohort_key: 'stripe_terminal|ANY|EU|in_store', provider_slug: 'stripe_terminal', region: 'EU', channel: 'in_store',
    percent_bps: 140, fixed_fee_minor_units: 10, fixed_fee_currency: 'EUR',
    terminal_rental_monthly_minor: 0,
    achievable_percent_bps: 140, achievable_fixed_fee_minor_units: 10,
    achievable_terminal_rental_monthly_minor: 0,
    verified: true, savings_band_pct: 0.25,
  }),

  // In-store regional fallback (bank acquirer profile). Rental drives the note.
  baseRow({ cohort_key: 'ANY|ANY|EU|in_store', provider_slug: 'ANY', region: 'EU', channel: 'in_store',
    percent_bps: 190, fixed_fee_minor_units: 0, fixed_fee_currency: 'EUR',
    terminal_rental_monthly_minor: 2500, // €25/mo — typical bank TPV rental
    achievable_percent_bps: 140, achievable_fixed_fee_minor_units: 10,
    achievable_terminal_rental_monthly_minor: 0,
    verified: false, savings_band_pct: 0.35,
    achievable_breakdown_json: {
      anchor_provider: 'stripe_terminal',
      anchor_region: 'EEA',
      anchor_percent_bps: 140,
      anchor_fixed_fee_minor_units: 10,
      anchor_source_url: 'https://stripe.com/terminal',
      anchor_source_quote: 'Stripe Terminal EEA: 1.4% + €0.10 per transaction',
    },
  }),
  baseRow({ cohort_key: 'ANY|ANY|UK|in_store', provider_slug: 'ANY', region: 'UK', channel: 'in_store',
    percent_bps: 195, fixed_fee_minor_units: 0, fixed_fee_currency: 'GBP',
    terminal_rental_monthly_minor: 2000,
    achievable_percent_bps: 140, achievable_fixed_fee_minor_units: 10,
    verified: false, savings_band_pct: 0.35,
  }),
  baseRow({ cohort_key: 'ANY|ANY|US|in_store', provider_slug: 'ANY', region: 'US', channel: 'in_store',
    percent_bps: 260, fixed_fee_minor_units: 10, fixed_fee_currency: 'USD',
    terminal_rental_monthly_minor: 2500,
    achievable_percent_bps: 210, achievable_fixed_fee_minor_units: 10,
    verified: false, savings_band_pct: 0.35,
  }),
  baseRow({ cohort_key: 'ANY|ANY|RoW|in_store', provider_slug: 'ANY', region: 'RoW', channel: 'in_store',
    percent_bps: 280, fixed_fee_minor_units: 10, fixed_fee_currency: 'USD',
    terminal_rental_monthly_minor: 2500,
    achievable_percent_bps: 220, achievable_fixed_fee_minor_units: 10,
    verified: false, savings_band_pct: 0.35,
  }),
];

// Full 8-row table (online + in_store). Every in-store test that expects
// a valid rate-table read uses this.
const FULL_TABLE = [...ONLINE_ROWS, ...IN_STORE_ROWS];

// Online-only table — pre-1.4.0 shape. This is THE shape historical seeds
// carry, and the shape paymentsGap.test.js's FULL_TABLE uses. Included
// here so the design-rule assertions can point at both possibilities.
const ONLINE_ONLY_TABLE = [...ONLINE_ROWS];

// ─── Exported required-key lists ────────────────────────────────────────────

describe('REQUIRED_FALLBACK_KEYS_ONLINE / _IN_STORE — split lists', () => {
  it('REQUIRED_FALLBACK_KEYS_ONLINE lists exactly the 4 legacy 3-segment keys', () => {
    expect(REQUIRED_FALLBACK_KEYS_ONLINE).toEqual([
      'ANY|ANY|EU', 'ANY|ANY|UK', 'ANY|ANY|US', 'ANY|ANY|RoW',
    ]);
  });

  it('REQUIRED_FALLBACK_KEYS_IN_STORE lists exactly the 4 new 4-segment keys', () => {
    expect(REQUIRED_FALLBACK_KEYS_IN_STORE).toEqual([
      'ANY|ANY|EU|in_store', 'ANY|ANY|UK|in_store',
      'ANY|ANY|US|in_store', 'ANY|ANY|RoW|in_store',
    ]);
  });

  it('legacy REQUIRED_FALLBACK_KEYS still equals the online list (retrocompat contract)', () => {
    // External callers that snapshot REQUIRED_FALLBACK_KEYS must see the
    // pre-1.4.0 shape. In-store keys live under the separate export.
    expect(REQUIRED_FALLBACK_KEYS).toEqual(REQUIRED_FALLBACK_KEYS_ONLINE);
    expect(REQUIRED_FALLBACK_KEYS).toHaveLength(4);
  });
});

// ─── Channel-aware validateRateTable ────────────────────────────────────────

describe('validateRateTable — channel-aware requirements', () => {
  it('online request against an online-only table validates fine (retrocompat)', () => {
    // This is the reason the split exists: pre-1.4.0 rate tables are
    // ONLINE-ONLY. They must keep validating fine when the caller asks an
    // online question. If this test fails, every historical session and
    // every legacy test fixture breaks.
    const result = validateRateTable(ONLINE_ONLY_TABLE, { channels: ['online'] });
    expect(result.ok).toBe(true);
  });

  it('validateRateTable with no opts defaults to online — pre-1.4.0 call shape stays valid', () => {
    // Pre-1.4.0 code called validateRateTable(rows) with no second arg.
    // The new implementation defaults opts.channels to ['online'], so
    // that exact call shape keeps working.
    const result = validateRateTable(ONLINE_ONLY_TABLE);
    expect(result.ok).toBe(true);
  });

  it('in_store request against an online-only table fails rate_table_incomplete', () => {
    // The design rule: never silently fall back to an online row for a
    // card-present cohort. An online-only table cannot answer in-store
    // questions.
    const result = validateRateTable(ONLINE_ONLY_TABLE, { channels: ['in_store'] });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('rate_table_incomplete');
    // Every in_store fallback key should be listed as missing.
    expect(result.missing).toEqual(expect.arrayContaining([
      'ANY|ANY|EU|in_store',
      'ANY|ANY|UK|in_store',
      'ANY|ANY|US|in_store',
      'ANY|ANY|RoW|in_store',
    ]));
    // And NONE of the online keys — the table has them all.
    expect(result.missing).not.toContain('ANY|ANY|EU');
  });

  it('in_store request against the full 8-row table validates fine', () => {
    const result = validateRateTable(FULL_TABLE, { channels: ['in_store'] });
    expect(result.ok).toBe(true);
  });

  it('online + in_store request together requires both sides of the table', () => {
    const both = validateRateTable(FULL_TABLE, { channels: ['online', 'in_store'] });
    expect(both.ok).toBe(true);
    // Same call against the online-only table fails on the in_store side.
    const onlyOnline = validateRateTable(ONLINE_ONLY_TABLE, { channels: ['online', 'in_store'] });
    expect(onlyOnline.ok).toBe(false);
    expect(onlyOnline.missing).toEqual(expect.arrayContaining([
      'ANY|ANY|EU|in_store',
    ]));
  });

  it('unknown channel names are silently dropped and treated as online default', () => {
    // Defense against a caller smuggling in a bogus channel and getting an
    // unexpected required-keys list. Dropping unknowns and falling back to
    // ['online'] is safer than trusting the input.
    const result = validateRateTable(ONLINE_ONLY_TABLE, { channels: ['garbage', 'zzz'] });
    expect(result.ok).toBe(true); // effectively online-default
  });
});

// ─── selectRow — channel-aware cascade ──────────────────────────────────────

describe('selectRow — channel-aware cascade', () => {
  it('sumup in_store hits the verified in-store row (no cross-channel leak)', () => {
    const { row, matched } = selectRow(FULL_TABLE, 'sumup', 'EU', 'in_store');
    expect(row.cohort_key).toBe('sumup|ANY|EU|in_store');
    expect(row.verified).toBe(true);
    expect(matched).toBe('exact');
  });

  it('sumup online falls back to the ONLINE regional row (never the in-store sumup row)', () => {
    // Cross-channel isolation: no verified online sumup row exists in the
    // fixture, so an online sumup call must NOT accidentally match the
    // in-store row (which lives on the SAME provider slug).
    const { row, matched } = selectRow(FULL_TABLE, 'sumup', 'EU', 'online');
    expect(row.cohort_key).toBe('ANY|ANY|EU');
    expect(row.channel).toBe('online');
    expect(matched).toBe('fallback');
  });

  it('unknown provider in_store falls back to the in-store regional row', () => {
    const { row, matched } = selectRow(FULL_TABLE, 'my_local_bank', 'EU', 'in_store');
    expect(row.cohort_key).toBe('ANY|ANY|EU|in_store');
    expect(row.channel).toBe('in_store');
    expect(matched).toBe('fallback');
  });

  it('online lookup defaults when channel is omitted', () => {
    // Retrocompat: pre-1.4.0 callers pass no channel. The cascade must
    // fall into the online branch and hit the 3-segment key first.
    const { row, matched } = selectRow(FULL_TABLE, 'stripe', 'EU', undefined);
    // Note: our online fixture only has ANY|ANY|EU (no stripe-specific).
    // A caller that added stripe|ANY|EU would hit it first — the test in
    // paymentsGap.test.js covers that path. Here we just verify the
    // channel-aware default routes correctly.
    expect(row.channel).toBe('online');
    expect(matched).toBe('fallback');
  });
});

// ─── calculateGap end-to-end — in-store ─────────────────────────────────────

describe('calculateGap — in-store branch', () => {
  it('in_store call against an online-only table refuses cleanly (rate_table_incomplete)', () => {
    // The new-contract test: a pre-1.4.0-shaped rate table cannot answer
    // in-store questions. The engine must refuse rather than borrow an
    // online rate. This is the safety of the design split, made explicit
    // as a test contract.
    const result = calculateGap(
      { monthly_gmv_eur: 30000, avg_ticket_eur: 30, region: 'EU', provider_slug: 'sumup', channel: 'in_store' },
      ONLINE_ONLY_TABLE
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBe('rate_table_incomplete');
    expect(result.missing).toEqual(expect.arrayContaining(['ANY|ANY|EU|in_store']));
  });

  it('bank in_store fallback: rental amortization shows up in the effective rate and the assumptions', () => {
    // €25/mo rental over €30k monthly GMV = (25 / 30000) × 10000 = 8.33 bps.
    // Percent 190 bps + amortized fee 0 + rental 8.33 ≈ 198.33 bps.
    const result = calculateGap(
      { monthly_gmv_eur: 30000, avg_ticket_eur: 40, region: 'EU', provider_slug: 'my_local_bank', channel: 'in_store' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.channel).toBe('in_store');
    expect(result.cohort.matched).toBe('fallback');
    // Current effective rate reflects the rental drag.
    expect(result.current_effective_bps).toBeGreaterThan(196);
    expect(result.current_effective_bps).toBeLessThan(200);
    // Rental note is emitted.
    const rentalNote = result.assumptions.find(a => a.includes('Monthly terminal rental'));
    expect(rentalNote).toBeDefined();
    expect(rentalNote).toContain('25.00 EUR');
    expect(rentalNote).toContain('30000.00');
    // Fallback assumption present (verified: false on the regional row).
    expect(result.assumptions).toContain(FALLBACK_ASSUMPTION);
  });

  it('achievable side emits the ANCHOR breakdown note, never the online interchange split', () => {
    // Design rule: in-store rows carry an anchor_breakdown, not an
    // interchange++/margin breakdown — the blended TPV market doesn't
    // publish one. Achievable is anchored to Stripe Terminal in the fixture.
    const result = calculateGap(
      { monthly_gmv_eur: 30000, avg_ticket_eur: 40, region: 'EU', provider_slug: 'my_local_bank', channel: 'in_store' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    const anchorNote = result.assumptions.find(a => a.startsWith('Achievable rate anchored'));
    expect(anchorNote).toBeDefined();
    expect(anchorNote).toContain('stripe terminal');
    expect(anchorNote).toContain('1.40%');
    expect(anchorNote).toContain('0.10 per transaction');
    // Online-shape breakdown MUST NOT be present.
    expect(result.assumptions.some(a => a.startsWith('Achievable rate composition:'))).toBe(false);
  });

  it('SumUp low ticket clamps at zero savings (merchant is already at the floor)', () => {
    // SumUp EU: 1.75% flat, no fixed, no rental → effective 175 bps at any ticket.
    // Achievable (Stripe Terminal): 140 bps + (0.10/ticket) × 10000 bps amortized.
    // At ticket = €10 → amortized 100 bps → achievable ≈ 240 bps > current 175 bps.
    // computeMonthlySavings clamps at 0 when gap ≤ 0 — that's exactly this case.
    const result = calculateGap(
      { monthly_gmv_eur: 20000, avg_ticket_eur: 10, region: 'EU', provider_slug: 'sumup', channel: 'in_store' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.key).toBe('sumup|ANY|EU|in_store');
    // Current: 175 bps (SumUp flat, no fixed/rental).
    expect(result.current_effective_bps).toBeCloseTo(175, 4);
    // Achievable: 140 + (0.10/10)*10000 = 240 bps.
    expect(result.achievable_effective_bps).toBeCloseTo(240, 4);
    // Clamp at zero: current < achievable → no savings.
    expect(result.monthly_savings_eur.point).toBe(0);
    expect(result.monthly_savings_eur.lo).toBe(0);
    expect(result.monthly_savings_eur.hi).toBe(0);
    expect(result.annual_savings_eur.hi).toBe(0);
  });

  it('SumUp higher ticket: achievable Stripe Terminal DOES beat SumUp, savings > 0', () => {
    // At ticket = €100 → amortized fixed = 10 bps → achievable = 150 bps < 175 → gap ≈ 25 bps.
    // Over €50k GMV → 25 bps × 50k / 10000 = €125/mo (point).
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: 100, region: 'EU', provider_slug: 'sumup', channel: 'in_store' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.current_effective_bps).toBeCloseTo(175, 4);
    expect(result.achievable_effective_bps).toBeCloseTo(150, 4);
    // Point ≈ 25 bps × 50k / 10000 = €125/mo.
    expect(result.monthly_savings_eur.point).toBeCloseTo(125, 0);
    expect(result.monthly_savings_eur.point).toBeGreaterThan(0);
    // Verified row → narrower band (0.25 in the fixture).
    const half = result.monthly_savings_eur.hi - result.monthly_savings_eur.point;
    expect(half).toBeCloseTo(result.monthly_savings_eur.point * 0.25, 2);
    // Annual is 12× monthly.
    expect(result.annual_savings_eur.point).toBeCloseTo(result.monthly_savings_eur.point * 12, 2);
  });

  it('Stripe Terminal against itself → zero gap, zero savings (self is the anchor)', () => {
    // Stripe Terminal is one of the anchors — using it as the caller
    // provider means achievable = current, so gap is exactly 0.
    const result = calculateGap(
      { monthly_gmv_eur: 50000, avg_ticket_eur: 50, region: 'EU', provider_slug: 'stripe_terminal', channel: 'in_store' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.current_effective_bps).toBeCloseTo(result.achievable_effective_bps, 4);
    expect(result.monthly_savings_eur.point).toBe(0);
  });

  it('cohort output surfaces channel=in_store on the response for the UI badge', () => {
    // The Results.jsx pill reads cohort.channel to decide whether to
    // render the "In-store" badge. The engine must surface it verbatim.
    const result = calculateGap(
      { monthly_gmv_eur: 30000, avg_ticket_eur: 50, region: 'EU', provider_slug: 'sumup', channel: 'in_store' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.channel).toBe('in_store');
  });

  it('in_store request with an unknown region routes to RoW in_store fallback', () => {
    const result = calculateGap(
      { monthly_gmv_eur: 30000, avg_ticket_eur: 40, region: 'Antarctica', provider_slug: 'sumup', channel: 'in_store' },
      FULL_TABLE
    );
    expect(result.ok).toBe(true);
    expect(result.cohort.key).toBe('ANY|ANY|RoW|in_store');
    expect(result.cohort.channel).toBe('in_store');
  });

  it('online request against the FULL 8-row table still behaves byte-identically to online-only', () => {
    // Cross-channel isolation from the caller side: adding in-store rows
    // to the table must NEVER change the answer for an online call.
    const online = { monthly_gmv_eur: 50000, avg_ticket_eur: 80, region: 'EU', provider_slug: 'adyen' };
    const onFull = calculateGap(online, FULL_TABLE);
    const onOnly = calculateGap(online, ONLINE_ONLY_TABLE);
    expect(onFull.ok).toBe(true);
    expect(onOnly.ok).toBe(true);
    expect(onFull.current_effective_bps).toBeCloseTo(onOnly.current_effective_bps, 10);
    expect(onFull.achievable_effective_bps).toBeCloseTo(onOnly.achievable_effective_bps, 10);
    expect(onFull.monthly_savings_eur.point).toBeCloseTo(onOnly.monthly_savings_eur.point, 6);
    expect(onFull.cohort.key).toBe(onOnly.cohort.key);
    expect(onFull.cohort.channel).toBe('online');
  });
});