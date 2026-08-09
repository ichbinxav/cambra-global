import { describe, it, expect } from 'vitest';
import { recoveryTermFromActivation, periodEconomicsV2, effectiveFee, parisRecoveryDate, reportPeriodBounds } from '../../base44/shared/recoveryEconomicsV2.ts';

describe('Recover Economics V2', () => {
  it('uses the contractual Paris calendar date around UTC midnight', () => {
    expect(parisRecoveryDate('2026-10-01T22:30:00Z')).toBe('2026-10-02');
    expect(parisRecoveryDate('2026-01-01T23:30:00Z')).toBe('2026-01-02');
  });
  it('anchors exact 12/24 month boundaries', () => {
    expect(recoveryTermFromActivation('2026-10-01T12:00:00Z')).toEqual({start:'2026-10-01',year2Start:'2027-10-01',endExclusive:'2028-10-01',months:24});
  });
  it('applies referral ladder with absolute floor', () => {
    expect([0,1,2,3,4,9].map(n=>effectiveFee(25,n))).toEqual([25,20,15,10,5,5]);
    expect([0,1,2,3].map(n=>effectiveFee(15,n))).toEqual([15,10,5,5]);
    expect(effectiveFee(0,4)).toBe(0);
  });
  it('uses 25 in year 1, 15 in year 2, 0 after 24 months', () => {
    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2027-09-01',periodEndExclusive:'2027-10-01'}).effective_fee_pct).toBe(25);
    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2027-10-01',periodEndExclusive:'2027-11-01'}).effective_fee_pct).toBe(15);
    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-10-01',periodEndExclusive:'2028-11-01'}).effective_fee_pct).toBe(0);
  });
  it('segments a period crossing the 12-month boundary deterministically', () => {
    const x=periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2027-09-15',periodEndExclusive:'2027-10-15'});
    expect(x.segments.map(s=>[s.standard_fee_pct,s.days])).toEqual([[25,16],[15,14]]);
    expect(x.effective_fee_pct).toBeCloseTo((25*16+15*14)/30,10);
  });
  it('segments a period crossing the 24-month boundary and never applies floor after term', () => {
    const x=periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-09-15',periodEndExclusive:'2028-10-15',activatedReferrals:9});
    expect(x.segments.map(s=>[s.effective_fee_pct,s.days])).toEqual([[5,16],[0,14]]);
  });
  it('handles month-end activation safely', () => {
    expect(recoveryTermFromActivation('2026-08-31T10:00:00Z').year2Start).toBe('2027-08-31');
    expect(recoveryTermFromActivation('2024-02-29T10:00:00Z').year2Start).toBe('2025-02-28');
  });
});

import { computeInvoiceAmounts } from '../../base44/shared/recoverBillingMath.ts';

describe('Recover Economics V2 billing invariants', () => {
  it('charges zero on zero or negative verified savings regardless of phase', () => {
    expect(computeInvoiceAmounts({ savings_eur: 0, standard_fee_pct: 25, effective_fee_pct: 25, tax_rate_bps: 0 }).fee_net_eur).toBe(0);
    expect(computeInvoiceAmounts({ savings_eur: -1000, standard_fee_pct: 15, effective_fee_pct: 5, tax_rate_bps: 0 }).fee_net_eur).toBe(0);
  });
  it('applies a referral acquired mid-term prospectively when the later period resolves a larger count', () => {
    const before=periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2027-03-01',periodEndExclusive:'2027-04-01',activatedReferrals:0});
    const after=periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2027-04-01',periodEndExclusive:'2027-05-01',activatedReferrals:1});
    expect(before.effective_fee_pct).toBe(25);
    expect(after.effective_fee_pct).toBe(20);
  });
  it('applies referrals acquired in Year 2 against 15%, not against the old 25% absolute fee', () => {
    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-01-01',periodEndExclusive:'2028-02-01',activatedReferrals:0}).effective_fee_pct).toBe(15);
    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-02-01',periodEndExclusive:'2028-03-01',activatedReferrals:1}).effective_fee_pct).toBe(10);
    expect(periodEconomicsV2({activationIso:'2026-10-01',periodStart:'2028-03-01',periodEndExclusive:'2028-04-01',activatedReferrals:2}).effective_fee_pct).toBe(5);
  });
  it('scopes an activation-month period only when explicit measurement bounds are supplied', () => {
    expect(reportPeriodBounds('2026-10','2026-10-15','2026-10-31')).toEqual({start:'2026-10-15',endExclusive:'2026-11-01'});
  });
});
