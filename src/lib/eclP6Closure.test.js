import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  P5_ALLOWLIST,
  P6_ALLOWLIST,
  STAGE_ECL_P5,
  STAGE_ECL_P6,
  STAGE_TRANSITIONS,
  allowlistForStage,
} from '../../scripts/lib/preEclFreeze.mjs';
import {
  claimRecoverInvoiceDraft,
  expectedInvoiceTotalMinor,
  recoverExecutionKey,
  stripeStatusProjection,
  validateStripeInvoiceBinding,
} from '../../base44/shared/economicExecution.ts';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const ISSUER = read('base44/functions/createEligibleRecoverInvoices/entry.ts');
const WEBHOOK = read('base44/functions/stripeBillingWebhook/entry.ts');
const RECONCILER = read('base44/functions/reconcileRecoverBilling/entry.ts');
const RECONCILER_CONFIG = read('base44/functions/reconcileRecoverBilling/function.jsonc');
const MANUAL = read('base44/functions/recordPayment/entry.ts');
const OVERRIDE = read('base44/functions/reconcileInvoice/entry.ts');
const LINK = read('base44/functions/createPaymentLink/entry.ts');
const INVOICE_SCHEMA = read('base44/entities/Invoice.jsonc');
const EVENT_SCHEMA = read('base44/entities/PaymentEvent.jsonc');
const PROD_TEST = read('src/lib/productionFunctions.static.test.js');

function localInvoice(overrides = {}) {
  return {
    id: 'inv-local-1',
    created_date: '2026-08-09T00:00:00.000Z',
    status: 'issued',
    currency: 'EUR',
    total_amount: 30,
    amount_paid: 0,
    balance_due: 30,
    processor_customer_id: 'cus_1',
    stripe_invoice_id: 'in_1',
    monthly_savings_report_id: 'r_1',
    deal_activation_id: 'a_1',
    billing_snapshot_json: { amounts_minor: { total: 3000 } },
    ...overrides,
  };
}

function remoteInvoice(overrides = {}) {
  return {
    id: 'in_1',
    customer: 'cus_1',
    currency: 'eur',
    status: 'open',
    total: 3000,
    amount_paid: 0,
    amount_due: 3000,
    metadata: {
      local_invoice_id: 'inv-local-1',
      monthly_savings_report_id: 'r_1',
      deal_activation_id: 'a_1',
    },
    ...overrides,
  };
}

describe('ECL P6 — Economic Execution & Reconciliation', () => {
  it('is reachable only after P5 and rolls back only to P5', () => {
    expect(STAGE_TRANSITIONS[STAGE_ECL_P5]).toContain(STAGE_ECL_P6);
    expect(STAGE_TRANSITIONS[STAGE_ECL_P6]).toEqual([STAGE_ECL_P5]);
    expect(allowlistForStage(STAGE_ECL_P6)).toEqual(P6_ALLOWLIST);
  });

  it('widens P5 by exactly ten execution/reconciliation paths', () => {
    expect(P6_ALLOWLIST.slice(0, P5_ALLOWLIST.length)).toEqual(P5_ALLOWLIST);
    expect(P6_ALLOWLIST.slice(P5_ALLOWLIST.length)).toEqual([
      'base44/shared/economicExecution.ts',
      'base44/entities/Invoice.jsonc',
      'base44/entities/PaymentEvent.jsonc',
      'base44/functions/stripeBillingWebhook/entry.ts',
      'base44/functions/reconcileRecoverBilling/entry.ts',
      'base44/functions/reconcileRecoverBilling/function.jsonc',
      'base44/functions/reconcileInvoice/entry.ts',
      'base44/functions/recordPayment/entry.ts',
      'base44/functions/createPaymentLink/entry.ts',
      'src/lib/eclP6Closure.test.js',
    ]);
    expect(P6_ALLOWLIST).toHaveLength(58);
  });

  it('binds a Stripe invoice to the exact frozen local identity and cents', () => {
    const inv = localInvoice();
    expect(expectedInvoiceTotalMinor(inv)).toBe(3000);
    expect(validateStripeInvoiceBinding(inv, remoteInvoice()).ok).toBe(true);
    expect(validateStripeInvoiceBinding(inv, remoteInvoice({ total: 2999 })).reasons).toContain('stripe_total_mismatch');
    expect(validateStripeInvoiceBinding(inv, remoteInvoice({ customer: 'cus_other' })).reasons).toContain('stripe_customer_mismatch');
    expect(validateStripeInvoiceBinding(inv, remoteInvoice({ metadata: { ...remoteInvoice().metadata, local_invoice_id: 'other' } })).reasons).toContain('stripe_metadata_local_invoice_mismatch');
  });

  it('projects current Stripe state without letting late invoice events erase dispute/refund state', () => {
    expect(stripeStatusProjection(localInvoice(), remoteInvoice({ status: 'paid', amount_paid: 3000, amount_due: 0 })).targetStatus).toBe('paid');
    expect(stripeStatusProjection(localInvoice({ status: 'disputed' }), remoteInvoice({ status: 'paid', amount_paid: 3000, amount_due: 0 })).targetStatus).toBe('disputed');
    expect(stripeStatusProjection(localInvoice({ status: 'refunded' }), remoteInvoice({ status: 'open' })).targetStatus).toBe('refunded');
  });

  it('claims one local draft per report and reuses it on sequential retry', async () => {
    const rows = [];
    let seq = 0;
    const svc = { entities: { Invoice: {
      filter: async ({ execution_key }) => rows.filter((r) => r.execution_key === execution_key),
      create: async (record) => { const row = { id: `i${++seq}`, created_date: `2026-08-09T00:00:0${seq}.000Z`, ...record }; rows.push(row); return row; },
      delete: async (id) => { const i = rows.findIndex((r) => r.id === id); if (i >= 0) rows.splice(i, 1); },
    } } };
    const key = recoverExecutionKey('r_1');
    const first = await claimRecoverInvoiceDraft(svc, key, { status: 'draft' });
    const second = await claimRecoverInvoiceDraft(svc, key, { status: 'draft' });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(first.invoice.id).toBe(second.invoice.id);
    expect(rows).toHaveLength(1);
  });

  it('issuer claims locally before the first Stripe POST and keeps Stripe idempotency keys', () => {
    const claim = ISSUER.indexOf('claimRecoverInvoiceDraft(');
    const stripe = ISSUER.indexOf("stripeRequest(mode, 'POST'");
    expect(claim).toBeGreaterThan(-1);
    expect(stripe).toBeGreaterThan(claim);
    expect(ISSUER).toContain('recoverExecutionKey(report.id)');
    expect(ISSUER).toContain('r4:inv:create:${report.id}');
    expect(ISSUER).toContain('appendPaymentEventOnce');
  });

  it('webhook verifies signature, dedupes authoritatively, then GETs current Stripe state before local update', () => {
    const signature = WEBHOOK.indexOf('constructEventAsync');
    const dedupe = WEBHOOK.indexOf('PaymentEvent.filter');
    const remoteGet = WEBHOOK.indexOf("stripeRequest(mode, 'GET'");
    const binding = WEBHOOK.indexOf('const binding = validateStripeInvoiceBinding');
    const update = WEBHOOK.indexOf('entities.Invoice.update(inv.id');
    expect(signature).toBeGreaterThan(-1);
    expect(dedupe).toBeGreaterThan(signature);
    expect(remoteGet).toBeGreaterThan(dedupe);
    expect(binding).toBeGreaterThan(remoteGet);
    expect(update).toBeGreaterThan(binding);
    expect(WEBHOOK).not.toMatch(/PaymentEvent\.filter\([\s\S]{0,220}\.catch\(\(\) => \[\]\)/);
    expect(WEBHOOK).toContain('reconciliation_mismatch');
  });

  it('scheduled reconciler is Stripe-read-only and runs every 15 minutes', () => {
    expect(RECONCILER).toContain("stripeRequest(mode, 'GET'");
    expect(RECONCILER).not.toContain("stripeRequest(mode, 'POST'");
    expect(RECONCILER).toContain('validateStripeInvoiceBinding');
    expect(RECONCILER).toContain('healRecoverInvoiceDuplicatesForReport');
    const cfg = JSON.parse(RECONCILER_CONFIG);
    expect(cfg.automations[0].is_active).toBe(true);
    expect(cfg.automations[0].repeat_unit).toBe('minutes');
    expect(cfg.automations[0].repeat_interval).toBe(15);
  });

  it('blocks every local/manual second source of truth for Recover Stripe invoices', () => {
    for (const src of [MANUAL, OVERRIDE]) {
      expect(src).toContain('recover_stripe_invoice_is_processor_authoritative');
      expect(src).toContain("use: 'reconcileRecoverBilling'");
    }
    expect(OVERRIDE).toContain('finalized_invoice_amounts_are_immutable_use_credit_note_or_corrective_invoice');
    expect(LINK).toContain('recover_invoice_already_has_stripe_payment_surface');
    expect(LINK.indexOf('recover_invoice_already_has_stripe_payment_surface')).toBeLessThan(LINK.indexOf("Deno.env.get('STRIPE_API_KEY')"));
  });

  it('adds only additive execution/reconciliation schema fields and ledger event types', () => {
    expect(INVOICE_SCHEMA).toContain('"execution_key"');
    expect(INVOICE_SCHEMA).toContain('"reconciliation_status"');
    expect(INVOICE_SCHEMA).toContain('"last_reconciled_at"');
    expect(INVOICE_SCHEMA).toContain('"reconciliation_error"');
    expect(EVENT_SCHEMA).toContain('"reconciliation_corrected"');
    expect(EVENT_SCHEMA).toContain('"reconciliation_mismatch"');
  });

  it('censuses the P6 reconciler as a production endpoint', () => {
    expect(PROD_TEST).toContain('"reconcileRecoverBilling"');
  });
});
