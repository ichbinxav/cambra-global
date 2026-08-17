import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// I18N-30M Fase D (2026-08-16) — CURRENCY SAFETY LOCK.
//
// Why this file exists: `computeEffectiveBps()` in src/lib/paymentsGap.js
// amortizes a row's fixed fee against `avg_ticket_eur` WITHOUT reading
// `fixed_fee_currency`. Its own comment states the assumption verbatim:
// "we treat EUR/GBP/USD as ~1:1 at the magnitudes involved (fees under
// €0.50)". That approximation holds for those three currencies and for
// nothing else.
//
// Seeding a row in a local currency whose EUR parity is far from 1:1 does
// NOT fail loudly — it silently multiplies the amortized fixed fee by the
// parity factor and inflates the merchant-facing gap:
//
//   CZK ~25x · ISK ~148x · HUF ~395x  (measured at a 40 EUR ticket)
//
// So the honest position, recorded in
// src/docs/Decision_Log_I18N_30_MERCADOS.md ("Fase D — BLOQUEADA"), is that
// local-currency rows stay UNSEEDED until the engine gets an explicit FX
// path. This test is the guard rail for that decision: it fails the moment
// anyone seeds a currency the engine cannot honestly consume.
//
// R4 — this invariant is deliberate, not incidental. To seed a new currency
// you must FIRST give computeEffectiveBps a real FX path, then widen
// ENGINE_ONE_TO_ONE_CURRENCIES in the same PR, with the rationale written
// into the Decision Log. Never widen the set to make a red test green.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// AUDIT I18N-07 (2026-08-17): the allowlist is now owned by
// base44/shared/engineCurrencyAllowlist.ts so every writer AND this test read the same
// constant. Re-declared inline for backward compatibility of the assertions below.
const ENGINE_ONE_TO_ONE_CURRENCIES = ['EUR', 'GBP', 'USD'];

describe('payments rate table — currency safety lock (Fase D)', () => {
  it('seeds no currency the gap engine would silently mis-amortize', () => {
    const seeder = read('base44/functions/seedPaymentsRateTable/entry.ts');
    const declared = [...seeder.matchAll(/fixed_fee_currency:\s*'([A-Z]{3})'/g)].map((m) => m[1]);
    // Sanity: the seeder must actually declare currencies, otherwise this
    // test would pass vacuously if the field were ever renamed.
    expect(declared.length).toBeGreaterThan(0);
    const offenders = [...new Set(declared)].filter((c) => !ENGINE_ONE_TO_ONE_CURRENCIES.includes(c)).sort();
    expect(offenders, 'seeded currencies outside the engine\'s ~1:1 assumption — see Decision_Log_I18N_30_MERCADOS.md, Fase D').toEqual([]);
  });

  it('keeps the engine assumption documented at the point of computation', () => {
    // If someone deletes or rewrites the comment, the assumption becomes
    // invisible to the next reader and this lock loses its justification.
    const engine = read('src/lib/paymentsGap.js');
    expect(engine).toContain('We do NOT do FX here');
    expect(engine).toContain('avg_ticket_eur');
  });

  it('the second writer (intelligenceMaintenanceWorker) also enforces the allowlist', () => {
    // AUDIT I18N-07 (2026-08-17): the seeder used to be the only writer this suite
    // guarded; the P3 compatibility projection wrote to the same field via a different
    // code path. Both must import the shared allowlist and refuse non-1:1 currencies.
    const worker = read('base44/functions/intelligenceMaintenanceWorker/entry.ts');
    expect(worker).toContain("from '../../shared/engineCurrencyAllowlist.ts'");
    expect(worker).toContain('isEngineOneToOneCurrency(fixedCurrency)');
    const shared = read('base44/shared/engineCurrencyAllowlist.ts');
    for (const currency of ENGINE_ONE_TO_ONE_CURRENCIES) {
      expect(shared).toContain(`'${currency}'`);
    }
  });

  it('states the blocked-market decision in the decision log', () => {
    // The gap is declared, not hidden. Keep the record findable.
    const log = read('src/docs/Decision_Log_I18N_30_MERCADOS.md');
    expect(log).toContain('Fase D');
    expect(log).toContain('BLOQUEADA');
  });
});
