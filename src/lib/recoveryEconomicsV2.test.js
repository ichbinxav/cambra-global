import { describe, it, expect } from 'vitest';
import {
  STANDARD_FEE_PCT,
  effectiveFee,
  parisRecoveryDate,
  periodEconomicsV2,
  recoveryEconomicsSnapshot,
  recoveryTermFromActivation,
  reportPeriodBounds,
} from '../../base44/shared/recoveryEconomicsV2.ts';
import { computeInvoiceAmounts } from '../../base44/shared/recoverBillingMath.ts';

const feeForMonth = (month, activatedReferrals = 0) => {
  const [year, value] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year, value, 1)).toISOString().slice(0, 10);
  return periodEconomicsV2({
    activationIso: '2026-01-01',
    periodStart: `${month}-01`,
    periodEndExclusive: next,
    activatedReferrals,
  });
};

describe('Recover Economics V2', () => {
  it('uses the contractual Paris calendar date around UTC midnight', () => {
    expect(parisRecoveryDate('2026-10-01T22:30:00Z')).toBe('2026-10-02');
    expect(parisRecoveryDate('2026-01-01T23:30:00Z')).toBe('2026-01-02');
  });

  it('anchors one exact 24-month term without a second-year pricing boundary', () => {
    expect(recoveryTermFromActivation('2026-10-01T12:00:00Z')).toEqual({
      start: '2026-10-01',
      endExclusive: '2028-10-01',
      months: 24,
    });
    expect(recoveryTermFromActivation('2026-08-31T10:00:00Z').endExclusive).toBe('2028-08-31');
    expect(recoveryTermFromActivation('2024-02-29T10:00:00Z').endExclusive).toBe('2026-02-28');
  });

  it.each([
    ['month 1', '2026-01'],
    ['month 12', '2026-12'],
    ['month 13', '2027-01'],
    ['month 24', '2027-12'],
  ])('charges the same 25%% standard fee in %s', (_label, month) => {
    const economics = feeForMonth(month);
    expect(economics.standard_fee_pct).toBe(25);
    expect(economics.effective_fee_pct).toBe(25);
    expect(economics.merchant_share_pct).toBe(75);
  });

  it('charges 0% from month 25 onward', () => {
    const economics = feeForMonth('2028-01');
    expect(economics.standard_fee_pct).toBe(0);
    expect(economics.effective_fee_pct).toBe(0);
    expect(economics.merchant_share_pct).toBe(100);
  });

  it('does not segment or reprice a period crossing from month 12 to month 13', () => {
    const economics = periodEconomicsV2({
      activationIso: '2026-01-01',
      periodStart: '2026-12-15',
      periodEndExclusive: '2027-01-15',
    });
    expect(economics.segments.map((segment) => [segment.standard_fee_pct, segment.days])).toEqual([[25, 31]]);
    expect(economics.effective_fee_pct).toBe(25);
  });

  it('segments the month-24 expiry boundary and never applies the floor after term', () => {
    const economics = periodEconomicsV2({
      activationIso: '2026-01-01',
      periodStart: '2027-12-15',
      periodEndExclusive: '2028-01-15',
      activatedReferrals: 9,
    });
    expect(economics.segments.map((segment) => [segment.effective_fee_pct, segment.days])).toEqual([[5, 17], [0, 14]]);
  });

  it('keeps the referral ladder at -5 points per activated referral with a 5% floor', () => {
    expect([0, 1, 2, 3, 4, 9].map((count) => effectiveFee(STANDARD_FEE_PCT, count))).toEqual([25, 20, 15, 10, 5, 5]);
    expect(feeForMonth('2027-01', 2).effective_fee_pct).toBe(15);
    expect(feeForMonth('2027-12', 4).effective_fee_pct).toBe(5);
    expect(effectiveFee(0, 4)).toBe(0);
  });

  it('snapshots one unified term instead of first-year and second-year tiers', () => {
    const snapshot = recoveryEconomicsSnapshot();
    expect(snapshot.recovery_term).toEqual({ months: '1-24', standard_fee_pct: 25, merchant_share_pct: 75 });
    expect(snapshot).not.toHaveProperty('year_1');
    expect(snapshot).not.toHaveProperty('year_2');
  });

  it('scopes an activation-month period only when explicit measurement bounds are supplied', () => {
    expect(reportPeriodBounds('2026-10', '2026-10-15', '2026-10-31')).toEqual({
      start: '2026-10-15',
      endExclusive: '2026-11-01',
    });
  });
});

describe('Recover Economics V2 billing invariants', () => {
  it('charges zero on zero or negative verified savings in months 1, 12, 13 and 24', () => {
    for (const month of ['2026-01', '2026-12', '2027-01', '2027-12']) {
      const economics = feeForMonth(month);
      expect(computeInvoiceAmounts({
        savings_eur: 0,
        standard_fee_pct: economics.standard_fee_pct,
        effective_fee_pct: economics.effective_fee_pct,
        tax_rate_bps: 0,
      }).fee_net_eur).toBe(0);
      expect(computeInvoiceAmounts({
        savings_eur: -1000,
        standard_fee_pct: economics.standard_fee_pct,
        effective_fee_pct: economics.effective_fee_pct,
        tax_rate_bps: 0,
      }).fee_net_eur).toBe(0);
    }
  });

  it('rounds the 25% fee in integer cents using half-up monetary rounding', () => {
    expect(computeInvoiceAmounts({
      savings_eur: 0.01,
      standard_fee_pct: 25,
      effective_fee_pct: 25,
      tax_rate_bps: 0,
    }).fee_net_minor).toBe(0);
    expect(computeInvoiceAmounts({
      savings_eur: 0.02,
      standard_fee_pct: 25,
      effective_fee_pct: 25,
      tax_rate_bps: 0,
    }).fee_net_minor).toBe(1);
    expect(computeInvoiceAmounts({
      savings_eur: 19.99,
      standard_fee_pct: 25,
      effective_fee_pct: 25,
      tax_rate_bps: 2000,
    })).toMatchObject({
      billable_savings_minor: 1999,
      fee_net_minor: 500,
      tax_minor: 100,
      total_minor: 600,
    });
  });

  it('applies a referral acquired mid-term prospectively', () => {
    expect(feeForMonth('2026-06', 0).effective_fee_pct).toBe(25);
    expect(feeForMonth('2026-07', 1).effective_fee_pct).toBe(20);
  });
});

