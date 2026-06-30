// ─── stripe_transactions normalizer tests ────────────────────────────────────
//
// Lock the contract for Stripe /v1/balance_transactions → CAMBRA spend rows.
// Decisiones D1–D5 (granularidad, type semántico, GMV, multi-currency,
// application_fee) están blindadas aquí. Si alguna se rompe accidentalmente
// (incluida la copia duplicada en dataSyncAgent/entry.ts), estos tests fallan.
//
// Pure logic. No DOM, no network. Fixtures locales sintéticos basados en docs
// públicas de Stripe — no hay payload real todavía.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizeStripeBalanceTransactions } from './stripe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const loadFixture = (name) =>
  JSON.parse(readFileSync(path.join(__dirname, '__fixtures__', 'stripe', name), 'utf8'));

describe('normalizeStripeBalanceTransactions — D1 granularidad (1 fila por balance_transaction)', () => {
  it('emite exactamente una fila por entrada en raw.data', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('charges.json'));
    expect(rows).toHaveLength(2);
    expect(rows[0].external_id).toBe('txn_1Charge001');
    expect(rows[1].external_id).toBe('txn_1Charge002');
  });

  it('no agrupa, no parea (cada balance_transaction es independiente)', () => {
    // Mezclamos 3 tipos en un solo array y esperamos 3 filas — sin agrupar.
    const raw = {
      data: [
        { id: 'a', amount: 100, fee: 5, net: 95, currency: 'eur', created: 1735689600, reporting_category: 'charge' },
        { id: 'b', amount: -100, fee: 0, net: -100, currency: 'eur', created: 1735776000, reporting_category: 'refund' },
        { id: 'c', amount: -100, fee: 1500, net: -1600, currency: 'eur', created: 1735862400, reporting_category: 'dispute' },
      ],
    };
    expect(normalizeStripeBalanceTransactions(raw)).toHaveLength(3);
  });
});

describe('normalizeStripeBalanceTransactions — D2 type semántico whitelisted', () => {
  it('charge → type:"charge"', () => {
    const [row] = normalizeStripeBalanceTransactions(loadFixture('charges.json'));
    expect(row.type).toBe('charge');
  });

  it('refund preserva signo negativo en amount (entra a GMV con signo)', () => {
    const [row] = normalizeStripeBalanceTransactions(loadFixture('refunds.json'));
    expect(row.type).toBe('refund');
    expect(row.amount).toBe(-50); // -5000 cents / 100
    expect(row.amount).toBeLessThan(0);
  });

  it('reporting_category gana sobre type cuando ambos están presentes', () => {
    // En el fixture de disputes, type es "adjustment" pero reporting_category
    // es "dispute". Esperamos "dispute" — la semántica de negocio prima.
    const [row] = normalizeStripeBalanceTransactions(loadFixture('disputes.json'));
    expect(row.type).toBe('dispute');
  });

  it('payout, transfer y stripe_fee preservan su tipo (NO entran a GMV — eso es responsabilidad del cerebro)', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('payouts_and_transfers.json'));
    const types = rows.map(r => r.type);
    expect(types).toEqual(['payout', 'transfer', 'stripe_fee']);
  });

  it('reporting_category desconocido → type:null (NO inventa label)', () => {
    const raw = { data: [{ id: 'x', amount: 100, fee: 0, net: 100, currency: 'eur', created: 1735689600, type: 'totally_new_thing' }] };
    const [row] = normalizeStripeBalanceTransactions(raw);
    expect(row.type).toBeNull();
  });
});

describe('normalizeStripeBalanceTransactions — D3 disputes', () => {
  it('emite una fila type:"dispute" con amount negativo y fee de Stripe', () => {
    const [row] = normalizeStripeBalanceTransactions(loadFixture('disputes.json'));
    expect(row.type).toBe('dispute');
    expect(row.amount).toBeLessThan(0);
    expect(row.fee).toBeGreaterThan(0); // Stripe cobra fee por dispute (~15€)
    expect(row.fee).toBe(15); // 1500 cents / 100
  });
});

describe('normalizeStripeBalanceTransactions — D4 multi-currency sin conversión', () => {
  it('preserva la currency original de cada fila (uppercased)', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('multi_currency.json'));
    const currencies = rows.map(r => r.currency);
    expect(currencies).toEqual(['EUR', 'USD', 'GBP']);
  });

  it('NO convierte amounts entre currencies — cada fila es independiente', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('multi_currency.json'));
    expect(rows[0].amount).toBe(100); // 10000 cents EUR
    expect(rows[1].amount).toBe(150); // 15000 cents USD (NO traducido a EUR)
    expect(rows[2].amount).toBe(80);  // 8000 cents GBP
  });

  it('currency llega lowercase y se emite uppercase', () => {
    const raw = { data: [{ id: 'x', amount: 100, fee: 0, net: 100, currency: 'eur', created: 1735689600, reporting_category: 'charge' }] };
    const [row] = normalizeStripeBalanceTransactions(raw);
    expect(row.currency).toBe('EUR');
  });

  it('currency ausente → fallback "EUR"', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('edge_cases.json'));
    const noCurr = rows.find(r => r.external_id === 'txn_1NoCurrency001');
    expect(noCurr.currency).toBe('EUR');
  });
});

describe('normalizeStripeBalanceTransactions — D5 application_fee como tipo aparte', () => {
  it('application_fee NO se mezcla con processing fee — emite su propia fila', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('application_fees.json'));
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.type === 'application_fee')).toBe(true);
  });

  it('application_fee_refund se colapsa a "application_fee" — el signo del amount indica devolución', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('application_fees.json'));
    const refund = rows.find(r => r.external_id === 'txn_1AppFeeRefund001');
    expect(refund.type).toBe('application_fee');
    expect(refund.amount).toBeLessThan(0);
  });
});

describe('normalizeStripeBalanceTransactions — mecánica (cents, fechas, currency)', () => {
  it('amounts en cents se dividen /100 a major units', () => {
    const [row] = normalizeStripeBalanceTransactions(loadFixture('charges.json'));
    expect(row.amount).toBe(120.50); // 12050 / 100
    expect(row.fee).toBe(3.65);      // 365 / 100
    expect(row.net).toBe(116.85);    // 11685 / 100
  });

  it('created (Unix seconds) → ISO string en UTC', () => {
    const [row] = normalizeStripeBalanceTransactions(loadFixture('charges.json'));
    expect(row.occurred_at).toBe(new Date(1735689600 * 1000).toISOString());
    expect(row.occurred_at).toMatch(/Z$/); // ISO con Z al final
  });

  it('created <= 0 → occurred_at:null (no inventa fecha)', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('edge_cases.json'));
    const noDate = rows.find(r => r.external_id === 'txn_1NoCreated001');
    expect(noDate.occurred_at).toBeNull();
  });
});

describe('normalizeStripeBalanceTransactions — defensividad (skip-no-id, tolera basura)', () => {
  it('filas sin id se descartan (skip silencioso, no error)', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('edge_cases.json'));
    // El fixture tiene una entrada sin id (la 2ª) y un null.
    // Ninguna debe aparecer en la salida.
    expect(rows.every(r => r.external_id)).toBe(true);
    expect(rows.every(r => r.external_id !== 'null')).toBe(true);
  });

  it('entradas null en raw.data se ignoran (no crash)', () => {
    const raw = { data: [null, undefined, { id: 'ok', amount: 100, fee: 5, net: 95, currency: 'eur', created: 1735689600, reporting_category: 'charge' }] };
    const rows = normalizeStripeBalanceTransactions(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].external_id).toBe('ok');
  });

  it('raw.data ausente o no-array → []', () => {
    expect(normalizeStripeBalanceTransactions({})).toEqual([]);
    expect(normalizeStripeBalanceTransactions(null)).toEqual([]);
    expect(normalizeStripeBalanceTransactions({ data: 'not an array' })).toEqual([]);
    expect(normalizeStripeBalanceTransactions({ data: null })).toEqual([]);
  });

  it('amount/fee/net como string se parsean a number (no NaN)', () => {
    const raw = { data: [{ id: 'x', amount: '10050', fee: '305', net: '9745', currency: 'eur', created: 1735689600, reporting_category: 'charge' }] };
    const [row] = normalizeStripeBalanceTransactions(raw);
    expect(row.amount).toBe(100.50);
    expect(row.fee).toBe(3.05);
    expect(row.net).toBe(97.45);
  });

  it('campos numéricos ausentes → 0 (no NaN, no undefined)', () => {
    const raw = { data: [{ id: 'x', currency: 'eur', created: 1735689600, reporting_category: 'charge' }] };
    const [row] = normalizeStripeBalanceTransactions(raw);
    expect(row.amount).toBe(0);
    expect(row.fee).toBe(0);
    expect(row.net).toBe(0);
  });
});

describe('normalizeStripeBalanceTransactions — invariantes del output schema', () => {
  it('toda fila lleva vertical:"payments"', () => {
    const rows = normalizeStripeBalanceTransactions(loadFixture('multi_currency.json'));
    expect(rows.every(r => r.vertical === 'payments')).toBe(true);
  });

  it('campos del schema: vertical, external_id, amount, fee, net, currency, occurred_at, type', () => {
    const [row] = normalizeStripeBalanceTransactions(loadFixture('charges.json'));
    expect(Object.keys(row).sort()).toEqual(
      ['amount', 'currency', 'external_id', 'fee', 'net', 'occurred_at', 'type', 'vertical'].sort()
    );
  });
});