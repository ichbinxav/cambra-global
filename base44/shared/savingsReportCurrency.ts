// savingsReportCurrency — derive the REAL currency of a MonthlySavingsReport
// measurement (FX step 2, Fase B, 2026-08-16).
//
// Before this module, generateMonthlySavingsReport wrote the literal
// `currency: "EUR"` on every report, unconditionally. That made the
// downstream billing lock in prepareEligibleRecoverInvoice.ts
// (`if (currency !== 'EUR') return blocked(...)`) mathematically unreachable:
// a real lock on a door that could never open the wrong way. The lock only
// protects anything if the value it checks can genuinely vary — so the
// currency must come from the measurement source, never from a literal.
//
// Sources and their currency authority:
//   - Stripe path: StripeConnection.currency — the account's settlement
//     currency reported by Stripe. monthly_volume is denominated in it.
//   - Analyzer fallback path: AnalyzerInput.currency — set explicitly to
//     'EUR' by every writer whose figures are EUR-normalized
//     (buildAnalyzerProjection output, engine results). Legacy rows predate
//     the field and are honestly indeterminable.
//
// Doctrine: if the source has no determinable currency we return
// { determinable: false } and the caller must mark the report
// status='review_required' — a report is NEVER 'calculated' with a guessed
// currency. That is the same fail-closed posture as the FX evidence rules.

import { normalizeCurrencyCode } from './marketMoney.ts';

export type MeasurementCurrency =
  | { determinable: true; currency: string; source: 'stripe_connection' | 'analyzer_input' }
  | { determinable: false; currency: null; reason: string };

export function deriveMeasurementCurrency(input: {
  measurement_source: string;
  stripe?: { currency?: unknown } | null;
  analyzer_input?: { currency?: unknown } | null;
}): MeasurementCurrency {
  if (input.measurement_source === 'api') {
    const currency = normalizeCurrencyCode(input.stripe?.currency);
    if (currency) return { determinable: true, currency, source: 'stripe_connection' };
    return { determinable: false, currency: null, reason: 'stripe_connection_currency_missing' };
  }
  // Analyzer fallback (manual_review) — the AnalyzerInput row is the source
  // of monthly_revenue, so its currency field is the authority.
  const currency = normalizeCurrencyCode(input.analyzer_input?.currency);
  if (currency) return { determinable: true, currency, source: 'analyzer_input' };
  return { determinable: false, currency: null, reason: 'analyzer_input_currency_missing' };
}
