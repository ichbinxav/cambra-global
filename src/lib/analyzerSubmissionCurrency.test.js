// analyzerSubmissionCurrency.test.js — FX paso 2, Fase A (R4: real behavior).
//
// The defect this guards against: a Polish merchant typing "50000" (PLN) was
// treated as €50,000 — the estimate they saw was ~4×+ fantasy. The boundary
// module must convert with a verifiable ECB snapshot, freeze the rate onto
// the submission, and fail CLOSED (review_required) when no snapshot
// resolves — never compute with an assumed rate.
//
// Every assertion here checks the OUTPUT STATE of the real module — no
// toContain over source code.

import { describe, expect, it } from 'vitest';
import {
  ANALYZER_SUBMISSION_STALE_AFTER_DAYS,
  convertMajorAmountToEur,
  prepareAnalyzerSubmissionCurrency,
} from '../../base44/shared/analyzerSubmissionCurrency.ts';

const NOW = '2026-08-16T10:00:00Z';

// ECB-shaped snapshot exactly as ecbFxIngest writes it: base EUR → quote PLN.
// resolveFX inverts it for the PLN→EUR request.
const PLN_SNAPSHOT = {
  id: 'fx-pln-1',
  fx_key: 'ECB:EUR:PLN:2026-08-14',
  base_currency: 'EUR',
  quote_currency: 'PLN',
  rate_kind: 'REFERENCE',
  rate_decimal: '4.25',
  source: 'ECB',
  source_type: 'CENTRAL_BANK',
  source_url: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',
  effective_at: '2026-08-14T14:15:00Z',
  status: 'CURRENT',
  version: 1,
};

describe('convertMajorAmountToEur', () => {
  it('converts a PLN amount to EUR with the exact inverse ECB rate', () => {
    const r = convertMajorAmountToEur({ amount: 50_000, currency: 'PLN', effective_at: NOW }, [PLN_SNAPSHOT]);
    expect(r.ok).toBe(true);
    // 50,000 PLN at EUR→PLN 4.25 = 11,764.71 EUR (BigInt half-away rounding).
    expect(r.amount_eur).toBeCloseTo(11_764.71, 2);
    // NOT the raw number treated as EUR — the original defect.
    expect(r.amount_eur).toBeLessThan(50_000 / 4);
    // The frozen audit reproduces the conversion without today's table.
    expect(r.fx).toMatchObject({
      currency: 'PLN',
      source: 'ECB',
      resolved_effective_at: '2026-08-14T14:15:00.000Z',
    });
    expect(Number(r.fx.rate_scaled_1e12)).toBeGreaterThan(0);
  });

  it('is the identity for EUR (no fx audit, amount untouched)', () => {
    const r = convertMajorAmountToEur({ amount: 1234.56, currency: 'EUR', effective_at: NOW }, []);
    expect(r).toMatchObject({ ok: true, amount_eur: 1234.56, fx: null });
  });

  it('fails closed when no snapshot resolves — never a guessed rate', () => {
    const r = convertMajorAmountToEur({ amount: 100_000, currency: 'HUF', effective_at: NOW }, [PLN_SNAPSHOT]);
    expect(r).toMatchObject({ ok: false, error: 'fx_evidence_required' });
  });

  it('rejects a snapshot older than the stale window (weekend-safe, not open-ended)', () => {
    const old = { ...PLN_SNAPSHOT, effective_at: '2026-08-08T14:15:00Z', fx_key: 'ECB:EUR:PLN:2026-08-08' };
    // Sanity on the policy constant itself: 8 days > window > 2 days.
    expect(ANALYZER_SUBMISSION_STALE_AFTER_DAYS).toBeGreaterThanOrEqual(2);
    expect(ANALYZER_SUBMISSION_STALE_AFTER_DAYS).toBeLessThan(8);
    const r = convertMajorAmountToEur({ amount: 50_000, currency: 'PLN', effective_at: NOW }, [old]);
    expect(r).toMatchObject({ ok: false, error: 'fx_evidence_required' });
  });

  it('rejects non-positive and non-finite amounts', () => {
    for (const amount of [0, -5, NaN, Infinity]) {
      expect(convertMajorAmountToEur({ amount, currency: 'PLN', effective_at: NOW }, [PLN_SNAPSHOT]).ok).toBe(false);
    }
  });
});

describe('prepareAnalyzerSubmissionCurrency', () => {
  it('legacy payload without currency passes through untouched as EUR', () => {
    const raw = { monthly_gmv_eur: 50_000, avg_ticket_eur: 40, country: 'ES' };
    const r = prepareAnalyzerSubmissionCurrency(raw, [], NOW);
    expect(r).toMatchObject({ ok: true, currency: 'EUR', converted: false });
    expect(r.payload).toBe(raw); // same reference — nothing cloned or mutated
  });

  it('explicit EUR behaves like legacy', () => {
    const r = prepareAnalyzerSubmissionCurrency({ currency: 'EUR', monthly_gmv_eur: 900 }, [], NOW);
    expect(r).toMatchObject({ ok: true, currency: 'EUR', converted: false });
  });

  it('rejects a currency outside the market registry as a field failure', () => {
    const r = prepareAnalyzerSubmissionCurrency({ currency: 'JPY', monthly_gmv_eur: 900 }, [PLN_SNAPSHOT], NOW);
    expect(r).toMatchObject({ ok: false, failure: { field: 'currency', reason: 'not_in_enum' } });
  });

  it('converts a single-channel PLN payload and freezes the rate + originals', () => {
    const raw = { currency: 'PLN', monthly_gmv_eur: 50_000, avg_ticket_eur: 170, intl_pct: 10, country: 'PL' };
    const r = prepareAnalyzerSubmissionCurrency(raw, [PLN_SNAPSHOT], NOW);
    expect(r.ok).toBe(true);
    expect(r.converted).toBe(true);
    expect(r.payload.monthly_gmv_eur).toBeCloseTo(11_764.71, 2);
    expect(r.payload.avg_ticket_eur).toBeCloseTo(40, 0);
    // Non-monetary fields untouched.
    expect(r.payload.intl_pct).toBe(10);
    expect(r.payload.country).toBe('PL');
    // The caller's object is never mutated.
    expect(raw.monthly_gmv_eur).toBe(50_000);
    // Originals + frozen audit persisted for reproducibility.
    expect(r.original_amounts).toMatchObject({ currency: 'PLN', monthly_gmv: 50_000, avg_ticket: 170 });
    expect(r.fx).toMatchObject({ currency: 'PLN', source: 'ECB' });
  });

  it('converts every channel of a combined payload', () => {
    const raw = {
      currency: 'PLN',
      channels: [
        { channel: 'online', monthly_gmv_eur: 42_500, avg_ticket_eur: 170, intl_pct: 5 },
        { channel: 'in_store', monthly_gmv_eur: 8_500, avg_ticket_eur: 85 },
      ],
    };
    const r = prepareAnalyzerSubmissionCurrency(raw, [PLN_SNAPSHOT], NOW);
    expect(r.ok).toBe(true);
    expect(r.payload.channels[0].monthly_gmv_eur).toBeCloseTo(10_000, 0);
    expect(r.payload.channels[0].avg_ticket_eur).toBeCloseTo(40, 0);
    expect(r.payload.channels[1].monthly_gmv_eur).toBeCloseTo(2_000, 0);
    expect(r.original_amounts.channels).toEqual([
      { channel: 'online', monthly_gmv: 42_500, avg_ticket: 170 },
      { channel: 'in_store', monthly_gmv: 8_500, avg_ticket: 85 },
    ]);
    // Original channel objects untouched.
    expect(raw.channels[0].monthly_gmv_eur).toBe(42_500);
  });

  it('fails closed with review_required when the declared currency has no snapshot', () => {
    const r = prepareAnalyzerSubmissionCurrency({ currency: 'SEK', monthly_gmv_eur: 100_000 }, [PLN_SNAPSHOT], NOW);
    expect(r).toMatchObject({ ok: false, review_required: true, error: 'fx_evidence_required', currency: 'SEK' });
  });

  it('passes non-numeric amounts through so field validation names the right field', () => {
    const r = prepareAnalyzerSubmissionCurrency({ currency: 'PLN', monthly_gmv_eur: 'abc', avg_ticket_eur: 170 }, [PLN_SNAPSHOT], NOW);
    expect(r.ok).toBe(true);
    expect(r.payload.monthly_gmv_eur).toBe('abc'); // validateInput will reject it
    expect(r.payload.avg_ticket_eur).toBeCloseTo(40, 0);
  });
});
