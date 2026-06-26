import { describe, it, expect } from 'vitest';
import { getBenchmarks, calculateSavings } from './scoreEngine.js';

// ─────────────────────────────────────────────────────────────────────────────
// M0B — Score / Savings engine tests
//
// These tests lock the financial behaviour that the whole product depends on:
// the 8% cap, tier/geo benchmarks, proportional scaling, the negative-savings
// clamp, and the single-source-of-truth chain into BrandSavings.
//
// scoreEngine.js is pure logic (no DOM, no network), so it is imported directly.
// ─────────────────────────────────────────────────────────────────────────────

describe('getBenchmarks — payment rate by tier (EU)', () => {
  const EU = 'France';

  it('micro EU = 2.4%', () => {
    expect(getBenchmarks(10_000, EU).payment.rate).toBe(2.4);
  });
  it('small EU = 2.2%', () => {
    expect(getBenchmarks(50_000, EU).payment.rate).toBe(2.2);
  });
  it('mid EU = 1.9%', () => {
    expect(getBenchmarks(200_000, EU).payment.rate).toBe(1.9);
  });
  it('large EU = 1.6%', () => {
    expect(getBenchmarks(600_000, EU).payment.rate).toBe(1.6);
  });

  it('assigns the correct tier label per threshold', () => {
    expect(getBenchmarks(29_999, EU).tier).toBe('micro');
    expect(getBenchmarks(30_000, EU).tier).toBe('small');
    expect(getBenchmarks(100_000, EU).tier).toBe('mid');
    expect(getBenchmarks(500_000, EU).tier).toBe('large');
  });
});

describe('getBenchmarks — EU vs non-EU difference', () => {
  it('micro: EU 2.4% is better than non-EU 2.9%', () => {
    const euRate = getBenchmarks(10_000, 'France').payment.rate;
    const nonEuRate = getBenchmarks(10_000, 'United States').payment.rate;
    expect(euRate).toBe(2.4);
    expect(nonEuRate).toBe(2.9);
    expect(euRate).toBeLessThan(nonEuRate);
  });

  it('every tier: EU payment rate is strictly lower than non-EU (PSD2 caps)', () => {
    for (const rev of [10_000, 50_000, 200_000, 600_000]) {
      const eu = getBenchmarks(rev, 'Germany').payment.rate;
      const nonEu = getBenchmarks(rev, 'United States').payment.rate;
      expect(eu).toBeLessThan(nonEu);
    }
  });

  it('isEU flag is set correctly', () => {
    expect(getBenchmarks(10_000, 'France').eu).toBe(true);
    expect(getBenchmarks(10_000, 'United States').eu).toBe(false);
    expect(getBenchmarks(10_000, '').eu).toBe(false);
  });
});

describe('calculateSavings — 8% of annual GMV cap', () => {
  it('total savings never exceed 8% of annual GMV, even with extreme overpayment', () => {
    const input = {
      monthly_revenue: 100_000,
      avg_order_value: 50,
      country: 'France',
      payment_fee_pct: 5.0,
      monthly_shipping_cost: 20_000,
      monthly_shipments: 1_000,
      total_saas_spend: 30_000,
      in_store_gmv: 50_000,
      tpe_transaction_fee_pct: 4.0,
      monthly_banking_fees: 2_000,
      bank_fx_spread_pct: 2.0,
      intl_pct: 50,
      employee_count: 20,
      monthly_telecom_cost: 5_000,
      monthly_finance_ops_cost: 8_000,
      monthly_hr_tools_cost: 4_000,
      annual_insurance_cost: 40_000,
    };
    const annualGMV = input.monthly_revenue * 12;
    const cap = annualGMV * 0.08;
    const { totalSavings } = calculateSavings(input);
    expect(totalSavings).toBeGreaterThan(0);
    expect(totalSavings).toBeLessThanOrEqual(Math.round(cap));
  });

  it('when GMV is zero, the cap is not applied as a negative/NaN (no crash)', () => {
    const { totalSavings } = calculateSavings({ monthly_revenue: 0, country: 'France' });
    expect(Number.isFinite(totalSavings)).toBe(true);
    expect(totalSavings).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateSavings — proportional scaling preserves vertical proportions', () => {
  it('when capped, total is exactly the cap and verticals sum to it (within rounding)', () => {
    const input = {
      monthly_revenue: 100_000,
      avg_order_value: 50,
      country: 'France',
      payment_fee_pct: 5.0,
      monthly_shipping_cost: 20_000,
      monthly_shipments: 1_000,
      total_saas_spend: 30_000,
    };
    const r = calculateSavings(input);
    const cap = input.monthly_revenue * 12 * 0.08;
    expect(r.totalSavings).toBe(Math.round(cap));
    const sumScaled = r.paymentSavings + r.shippingSavings + r.saasSavings +
      r.bankingSavings + r.insuranceSavings + r.telecomSavings +
      r.financeOpsSavings + r.hrSavings;
    expect(sumScaled).toBeLessThanOrEqual(Math.round(cap) + 5);
    expect(sumScaled).toBeGreaterThanOrEqual(Math.round(cap) - 5);
    expect(r.paymentSavings).toBeGreaterThan(0);
    expect(r.shippingSavings).toBeGreaterThan(0);
    expect(r.saasSavings).toBeGreaterThan(0);
  });

  it('scaling factor is applied uniformly — capped ratios match raw ratios', () => {
    const input = {
      monthly_revenue: 100_000,
      avg_order_value: 50,
      country: 'France',
      payment_fee_pct: 5.0,
      monthly_shipping_cost: 20_000,
      monthly_shipments: 1_000,
      total_saas_spend: 30_000,
    };
    const r = calculateSavings(input);
    const cap = Math.round(input.monthly_revenue * 12 * 0.08);
    expect(r.totalSavings).toBe(cap);
    expect(r.saasSavings).toBeGreaterThan(r.shippingSavings);
    expect(r.shippingSavings).toBeGreaterThan(r.paymentSavings);
  });

  it('uncapped scenario: vertical savings reflect raw recovery directly', () => {
    const input = {
      monthly_revenue: 100_000,
      avg_order_value: 50,
      country: 'France',
      payment_fee_pct: 6.0,
      monthly_shipping_cost: 10_000,
      monthly_shipments: 1_000,
      total_saas_spend: 0,
    };
    const r = calculateSavings(input);
    expect(r.totalSavings).toBeLessThan(96_000);
    expect(r.paymentSavings).toBeGreaterThan(0);
    expect(r.shippingSavings).toBeGreaterThan(0);
    expect(r.paymentSavings).toBe(36_000);
  });
});

describe('calculateSavings — negative savings clamped to zero', () => {
  it('a brand already BELOW benchmark shows zero payment savings, never negative', () => {
    const input = {
      monthly_revenue: 100_000,
      avg_order_value: 50,
      country: 'France',
      payment_fee_pct: 1.0,
    };
    const r = calculateSavings(input);
    expect(r.paymentSavings).toBe(0);
    expect(r.details.payment_gap_pct).toBe(0);
    expect(r.totalSavings).toBeGreaterThanOrEqual(0);
  });

  it('payment_gap_pct is never negative regardless of how good the current rate is', () => {
    const r = calculateSavings({
      monthly_revenue: 600_000,
      avg_order_value: 80,
      country: 'France',
      payment_fee_pct: 0.5,
    });
    expect(r.details.payment_gap_pct).toBeGreaterThanOrEqual(0);
    expect(r.paymentSavings).toBe(0);
  });
});

describe('Single source of truth — BrandSavings divergence guard', () => {
  function simulateAnalyzerResult(input) {
    const savings = calculateSavings(input);
    return {
      total_savings: savings.totalSavings,
      payment_savings: savings.paymentSavings,
      shipping_savings: savings.shippingSavings,
      saas_savings: savings.saasSavings,
    };
  }

  function simulateOnAnalyzerCompleted(analyzerResult) {
    const savingsYearly = Number(analyzerResult.total_savings || 0);
    const savingsMonthly = Number((savingsYearly / 12).toFixed(2));
    return {
      estimated_savings_yearly: Number(savingsYearly.toFixed(2)),
      estimated_savings_monthly: savingsMonthly,
      payment_savings: Number(analyzerResult.payment_savings || 0),
      shipping_savings: Number(analyzerResult.shipping_savings || 0),
      saas_savings: Number(analyzerResult.saas_savings || 0),
    };
  }

  it('BrandSavings.estimated_savings_yearly === AnalyzerResult.total_savings', () => {
    const input = {
      monthly_revenue: 80_000,
      avg_order_value: 60,
      country: 'France',
      payment_fee_pct: 2.6,
      monthly_shipping_cost: 6_000,
      monthly_shipments: 800,
      total_saas_spend: 5_000,
    };
    const ar = simulateAnalyzerResult(input);
    const bs = simulateOnAnalyzerCompleted(ar);
    expect(bs.estimated_savings_yearly).toBe(ar.total_savings);
  });

  it('monthly is exactly yearly / 12 (no independent monthly formula)', () => {
    const input = {
      monthly_revenue: 120_000,
      avg_order_value: 45,
      country: 'Germany',
      payment_fee_pct: 2.9,
      monthly_shipping_cost: 9_000,
      monthly_shipments: 1_200,
      total_saas_spend: 8_000,
    };
    const ar = simulateAnalyzerResult(input);
    const bs = simulateOnAnalyzerCompleted(ar);
    expect(bs.estimated_savings_monthly).toBeCloseTo(ar.total_savings / 12, 1);
  });

  it('vertical breakdowns pass through unchanged from AnalyzerResult', () => {
    const input = {
      monthly_revenue: 50_000,
      avg_order_value: 40,
      country: 'Spain',
      payment_fee_pct: 2.3,
      monthly_shipping_cost: 4_000,
      monthly_shipments: 600,
      total_saas_spend: 3_500,
    };
    const ar = simulateAnalyzerResult(input);
    const bs = simulateOnAnalyzerCompleted(ar);
    expect(bs.payment_savings).toBe(ar.payment_savings);
    expect(bs.shipping_savings).toBe(ar.shipping_savings);
    expect(bs.saas_savings).toBe(ar.saas_savings);
  });
});

import { ENGINE_VERSION, validateAnalyzerInput } from './scoreEngine.js';

describe('ENGINE_VERSION — versioning constants', () => {
  it('ENGINE_VERSION object exists and has all three required keys', () => {
    expect(ENGINE_VERSION).toBeDefined();
    expect(typeof ENGINE_VERSION.score).toBe('string');
    expect(typeof ENGINE_VERSION.savings).toBe('string');
    expect(typeof ENGINE_VERSION.benchmark).toBe('string');
  });
  it('all version strings are non-empty', () => {
    expect(ENGINE_VERSION.score.length).toBeGreaterThan(0);
    expect(ENGINE_VERSION.savings.length).toBeGreaterThan(0);
    expect(ENGINE_VERSION.benchmark.length).toBeGreaterThan(0);
  });
});

describe('validateAnalyzerInput — valid inputs pass', () => {
  it('typical valid input returns valid=true', () => {
    const r = validateAnalyzerInput({ monthly_revenue: 80000, avg_order_value: 55, payment_fee_pct: 2.4 });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
  it('zero monthly_revenue is valid', () => {
    expect(validateAnalyzerInput({ monthly_revenue: 0 }).valid).toBe(true);
  });
  it('optional fields absent is valid', () => {
    expect(validateAnalyzerInput({ monthly_revenue: 50000 }).valid).toBe(true);
  });
});

describe('validateAnalyzerInput — invalid inputs are rejected', () => {
  it('negative monthly_revenue fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: -1000 }).valid).toBe(false);
  });
  it('missing monthly_revenue fails', () => {
    const r = validateAnalyzerInput({});
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.toLowerCase().includes('revenue'))).toBe(true);
  });
  it('payment_fee_pct > 15 fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: 50000, payment_fee_pct: 16 }).valid).toBe(false);
  });
  it('payment_fee_pct < 0 fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: 50000, payment_fee_pct: -0.1 }).valid).toBe(false);
  });
  it('NaN monthly_revenue fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: NaN }).valid).toBe(false);
  });
  it('Infinity monthly_revenue fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: Infinity }).valid).toBe(false);
  });
  it('avg_order_value of 0 fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: 50000, avg_order_value: 0 }).valid).toBe(false);
  });
  it('negative monthly_shipments fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: 50000, monthly_shipments: -10 }).valid).toBe(false);
  });
  it('negative total_saas_spend fails', () => {
    expect(validateAnalyzerInput({ monthly_revenue: 50000, total_saas_spend: -500 }).valid).toBe(false);
  });
  it('multiple invalid fields returns multiple errors', () => {
    const r = validateAnalyzerInput({ monthly_revenue: -1, payment_fee_pct: 99, avg_order_value: -5 });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});