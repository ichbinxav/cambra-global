// AUDIT I18N-07 (2026-08-17) — the payments engine amortizes a fixed_fee_minor_units
// against avg_ticket_eur WITHOUT reading fixed_fee_currency (paymentsGap.js:534 divides by
// MINOR_PER_MAJOR=100 unconditionally). Any row denominated in a currency the engine
// cannot treat as 1:1 with EUR silently mis-amortizes — a CZK 5.00 fixed fee reads as
// 5.00 EUR, a several-hundred-bps error in the merchant-facing gap with no test failing.
//
// This constant used to live only inside src/lib/paymentsRateCurrency.test.js, which
// enforced it by regex-scanning ONE writer (the seeder). The second writer
// (intelligenceMaintenanceWorker.entry.ts:67) went unguarded. Moved here so BOTH writers
// and the test read the same value, and the guard runs on the write path itself.
export const ENGINE_ONE_TO_ONE_CURRENCIES = ['EUR', 'GBP', 'USD'] as const;

export type EngineOneToOneCurrency = typeof ENGINE_ONE_TO_ONE_CURRENCIES[number];

export function isEngineOneToOneCurrency(value: unknown): value is EngineOneToOneCurrency {
  return typeof value === 'string' && (ENGINE_ONE_TO_ONE_CURRENCIES as readonly string[]).includes(value);
}
