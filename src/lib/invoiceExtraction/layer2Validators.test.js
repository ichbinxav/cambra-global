/**
 * Layer 2 (deterministic validators) — tests.
 *
 * These tests do NOT touch the LLM. They exist because Layer 2 is the only
 * thing standing between an over-confident model and a fabricated number
 * ending up in scoreEngine. If any of these fails, the extractor is broken.
 */
import { describe, it, expect } from 'vitest';
import {
  validateProcessingRateRange,
  validateNoUnitsScaleError,
  validateShippingCostPerUnit,
  validateSaasSpendVsRevenue,
  runLayer2,
  RANGES,
} from './layer2Validators.js';

describe('Layer 2 · validateProcessingRateRange', () => {
  it('accepts a plausible Stripe rate (2.9% on €10k volume)', () => {
    const r = validateProcessingRateRange({ fees: 290, gross_volume: 10000, provider: 'Stripe' });
    expect(r.passed).toBe(true);
    expect(r.ratio).toBeCloseTo(2.9, 5);
  });

  it('rejects a 34% implied rate (the classic decimal / cents bug)', () => {
    // The example from the user prompt: LLM extracts "34%" as a rate.
    // Implied ratio 3400/10000 = 34% — must be rejected regardless of provider.
    const r = validateProcessingRateRange({ fees: 3400, gross_volume: 10000, provider: 'Stripe' });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('ratio_above_plausible_range');
  });

  it('rejects an implausibly low rate (0.01% — currency scale bug)', () => {
    const r = validateProcessingRateRange({ fees: 1, gross_volume: 1_000_000, provider: 'Stripe' });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('ratio_below_plausible_range');
  });

  it('applies provider-specific bounds (PayPal 3.5% is fine, Stripe 4.5% would be too high)', () => {
    const okPaypal = validateProcessingRateRange({ fees: 350, gross_volume: 10000, provider: 'PayPal' });
    expect(okPaypal.passed).toBe(true);
    const badStripe = validateProcessingRateRange({ fees: 450, gross_volume: 10000, provider: 'Stripe' });
    expect(badStripe.passed).toBe(false);
  });

  it('falls back to generic range when provider is unknown', () => {
    // 4% with an unknown provider is inside GENERIC_RATE_RANGE (0.3–6.0)
    const r = validateProcessingRateRange({ fees: 400, gross_volume: 10000, provider: 'NeverHeardOf' });
    expect(r.passed).toBe(true);
    expect(r.range).toEqual(RANGES.GENERIC_RATE_RANGE);
  });

  it('rejects missing / non-numeric inputs without inventing a passing verdict', () => {
    expect(validateProcessingRateRange({ fees: null, gross_volume: 10000 }).passed).toBe(false);
    expect(validateProcessingRateRange({ fees: 100, gross_volume: undefined }).passed).toBe(false);
    expect(validateProcessingRateRange({ fees: 'lots', gross_volume: 10000 }).passed).toBe(false);
  });

  it('rejects zero volume (can\'t compute ratio) and negative fees', () => {
    expect(validateProcessingRateRange({ fees: 100, gross_volume: 0 }).passed).toBe(false);
    expect(validateProcessingRateRange({ fees: -50, gross_volume: 10000 }).passed).toBe(false);
  });
});

describe('Layer 2 · validateNoUnitsScaleError (100x cents/euros detection)', () => {
  it('accepts a value inside the plausible band', () => {
    const r = validateNoUnitsScaleError({ value: 3200, plausibleMin: 1000, plausibleMax: 10000 });
    expect(r.passed).toBe(true);
  });

  it('detects "cents_as_euros" — value is ~100x too big', () => {
    // Real value should be around 3,200 EUR. LLM extracted 320,000 (cents).
    const r = validateNoUnitsScaleError({ value: 320_000, plausibleMin: 1000, plausibleMax: 10000 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('likely_units_100x');
    expect(r.direction).toBe('cents_as_euros');
  });

  it('detects "euros_as_cents" — value is ~100x too small', () => {
    // Real value should be around 3,200 EUR. LLM extracted 32 (divided by 100).
    const r = validateNoUnitsScaleError({ value: 32, plausibleMin: 1000, plausibleMax: 10000 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('likely_units_100x');
    expect(r.direction).toBe('euros_as_cents');
  });

  it('reports out_of_band when the error is not a clean 100x', () => {
    // value=250, band=1000..10000 → neither ÷100 (2.5) nor ×100 (25000) lands
    // inside the band, so this is a real out-of-band value, not a units bug.
    const r = validateNoUnitsScaleError({ value: 250, plausibleMin: 1000, plausibleMax: 10000 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('out_of_band');
  });

  it('never silently "fixes" the value — rejection is the only outcome for a 100x mismatch', () => {
    // This is the whole point: we do NOT return { passed: true, value: value/100 }.
    // We reject, so downstream code cannot use a corrected number by accident.
    const r = validateNoUnitsScaleError({ value: 320_000, plausibleMin: 1000, plausibleMax: 10000 });
    expect(r).not.toHaveProperty('value');
    expect(r).not.toHaveProperty('corrected');
  });

  it('rejects non-numeric input and invalid bounds', () => {
    expect(validateNoUnitsScaleError({ value: 'lots', plausibleMin: 1, plausibleMax: 10 }).passed).toBe(false);
    expect(validateNoUnitsScaleError({ value: 5, plausibleMin: 10, plausibleMax: 1 }).passed).toBe(false);
  });
});

describe('Layer 2 · validateShippingCostPerUnit', () => {
  it('accepts €5/shipment', () => {
    const r = validateShippingCostPerUnit({ total_cost: 500, shipment_count: 100 });
    expect(r.passed).toBe(true);
    expect(r.perUnit).toBe(5);
  });

  it('rejects €0.30/shipment (units bug)', () => {
    const r = validateShippingCostPerUnit({ total_cost: 30, shipment_count: 100 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('per_unit_below_plausible_range');
  });

  it('rejects €80/shipment (total-as-per-unit misread)', () => {
    const r = validateShippingCostPerUnit({ total_cost: 8000, shipment_count: 100 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('per_unit_above_plausible_range');
  });

  it('rejects zero shipments and missing inputs', () => {
    expect(validateShippingCostPerUnit({ total_cost: 500, shipment_count: 0 }).passed).toBe(false);
    expect(validateShippingCostPerUnit({ total_cost: null, shipment_count: 100 }).passed).toBe(false);
  });
});

describe('Layer 2 · validateSaasSpendVsRevenue', () => {
  it('accepts €800 SaaS on €25k revenue', () => {
    expect(validateSaasSpendVsRevenue({ monthly_saas_spend: 800, monthly_revenue: 25000 }).passed).toBe(true);
  });

  it('rejects SaaS > revenue (annual misread as monthly)', () => {
    const r = validateSaasSpendVsRevenue({ monthly_saas_spend: 30000, monthly_revenue: 25000 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('saas_exceeds_revenue');
  });

  it('rejects an implausibly small spend (% misread)', () => {
    const r = validateSaasSpendVsRevenue({ monthly_saas_spend: 0.05, monthly_revenue: 25000 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('implausibly_small_spend');
  });

  it('refuses to certify when revenue is missing', () => {
    // No revenue context → we can't cross-check → we don't stamp as passed.
    const r = validateSaasSpendVsRevenue({ monthly_saas_spend: 500, monthly_revenue: 0 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('no_revenue_context');
  });
});

describe('Layer 2 · runLayer2 combinator', () => {
  it('runs only the rules for which inputs are provided', () => {
    const { results, anyRejected } = runLayer2({
      provider: 'Stripe',
      fees: 290,
      gross_volume: 10000,
    });
    expect(results.fees_and_volume.passed).toBe(true);
    expect(results.shipping_per_unit).toBeNull();
    expect(results.saas_spend).toBeNull();
    expect(anyRejected).toBe(false);
  });

  it('flags anyRejected=true when even one rule fails', () => {
    // Stripe at "34 %" — Layer 2 must catch this even though everything else is fine.
    const { results, anyRejected } = runLayer2({
      provider: 'Stripe',
      fees: 3400,
      gross_volume: 10000,
      shipping_total_cost: 500,
      shipping_shipment_count: 100,
    });
    expect(results.fees_and_volume.passed).toBe(false);
    expect(results.shipping_per_unit.passed).toBe(true);
    expect(anyRejected).toBe(true);
  });
});