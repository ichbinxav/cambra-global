// savingsReportCurrency.test.js — FX paso 2, Fase B (R4: real behavior).
//
// Chain under guard: generateMonthlySavingsReport used to write the literal
// currency:"EUR" on every report, which made the billing currency lock in
// prepareEligibleRecoverInvoice unreachable. The derivation module + the
// hardened lock make the whole chain real: a PLN-settling Stripe account
// produces a PLN report, and that report is genuinely blocked from invoicing.

import { describe, expect, it } from 'vitest';
import { deriveMeasurementCurrency } from '../../base44/shared/savingsReportCurrency.ts';
import { prepareEligibleRecoverInvoice } from '../../base44/shared/prepareEligibleRecoverInvoice.ts';

describe('deriveMeasurementCurrency', () => {
  it('Stripe path: takes the connection settlement currency as measured', () => {
    expect(deriveMeasurementCurrency({ measurement_source: 'api', stripe: { currency: 'pln' } }))
      .toEqual({ determinable: true, currency: 'PLN', source: 'stripe_connection' });
  });

  it('Stripe path without a currency is indeterminable — never silent EUR', () => {
    expect(deriveMeasurementCurrency({ measurement_source: 'api', stripe: {} }))
      .toMatchObject({ determinable: false, currency: null, reason: 'stripe_connection_currency_missing' });
    expect(deriveMeasurementCurrency({ measurement_source: 'api', stripe: { currency: 'not-a-code' } }))
      .toMatchObject({ determinable: false });
  });

  it('Analyzer path: takes the AnalyzerInput currency', () => {
    expect(deriveMeasurementCurrency({ measurement_source: 'manual_review', analyzer_input: { currency: 'EUR' } }))
      .toEqual({ determinable: true, currency: 'EUR', source: 'analyzer_input' });
  });

  it('legacy AnalyzerInput rows (no currency field) are indeterminable', () => {
    expect(deriveMeasurementCurrency({ measurement_source: 'manual_review', analyzer_input: {} }))
      .toMatchObject({ determinable: false, reason: 'analyzer_input_currency_missing' });
  });
});

// ─── End-to-end: derived non-EUR currency reaches the billing lock ─────────
// Fixture mirrors src/lib/prepareEligibleRecoverInvoice.test.js verbatim —
// everything valid EXCEPT what each case varies, so the blocker observed is
// the one under test.

const NOW = new Date('2026-04-10T12:00:00Z');

function modernSnap(overrides = {}) {
  return {
    policy_version: '2026.08.01',
    policy_source: 'product_policy_registry',
    fee_pct: 25,
    standard_fee_pct: 25,
    merchant_share_pct: 75,
    fee_duration_months: 24,
    currency: 'EUR',
    ...overrides,
  };
}

function fixtures(over = {}) {
  const snap = over.snap ?? modernSnap();
  const mandate = {
    id: 'm1',
    deal_activation_id: 'a1',
    status: 'active',
    acceptance_snapshot_json: snap,
    acceptance_snapshot_hash: 'hashA',
    document_version: 'recover-mandate-v1',
    ...over.mandate,
  };
  const activation = {
    id: 'a1',
    brand_id: 'b1',
    vertical: 'payments',
    conditions_activated_at: '2026-01-15T10:00:00Z',
    payment_method_status: 'ready',
    stripe_payment_method_id: 'pm_1',
    ...over.activation,
  };
  const brand = { id: 'b1', stripe_customer_id: 'cus_1', stripe_billing_mode: 'test', ...over.brand };
  const report = {
    id: 'r1',
    deal_activation_id: 'a1',
    brand_id: 'b1',
    month: '2026-03',
    billing_eligibility_status: 'eligible',
    currency: 'EUR',
    savings: 1000,
    standard_fee_pct: 25,
    effective_fee_pct: 25,
    fee_net_amount: 250,
    policy_version: '2026.08.01',
    snapshot_hash: 'hashA',
    ...over.report,
  };
  return {
    report,
    activation,
    mandate,
    brand,
    taxContext: over.taxContext ?? { treatment: 'FR_STANDARD_TVA', tax_rate_bps: 2000, blockers: [] },
    billingMode: over.billingMode ?? 'test',
    existingInvoices: over.existingInvoices ?? [],
    now: NOW,
  };
}

describe('billing currency lock is genuinely reachable (FX paso 2)', () => {
  it('a report whose currency was DERIVED from a PLN Stripe connection is blocked', () => {
    // The derivation, not a hand-typed literal, feeds the lock.
    const measured = deriveMeasurementCurrency({ measurement_source: 'api', stripe: { currency: 'PLN' } });
    expect(measured.determinable).toBe(true);
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { currency: measured.currency } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain('currency_mismatch:PLN');
  });

  it('an indeterminable currency (null) blocks — the old || "EUR" fallback is dead', () => {
    const measured = deriveMeasurementCurrency({ measurement_source: 'api', stripe: {} });
    expect(measured.determinable).toBe(false);
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { currency: measured.currency } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain('currency_indeterminable');
  });

  it('a review_required report blocks even if someone forces eligibility', () => {
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { status: 'review_required', currency: null } }));
    expect(prep.eligible).toBe(false);
    expect(prep.blockers).toContain('report_review_required');
  });

  it('a derived EUR measurement still passes the currency gate', () => {
    const measured = deriveMeasurementCurrency({ measurement_source: 'manual_review', analyzer_input: { currency: 'EUR' } });
    const prep = prepareEligibleRecoverInvoice(fixtures({ report: { currency: measured.currency } }));
    expect(prep.eligible).toBe(true);
    expect(prep.blockers).toEqual([]);
  });
});
