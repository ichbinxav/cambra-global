// ECB daily reference-rate ingest — pure parsing + row construction.
//
// WHY THIS EXISTS (2026-08-16): `FxSnapshot` had NO writer. The table was
// empty in production, and because `analyzerFx.ts` fails closed when a rate
// cannot be resolved, EVERY verified Stripe analysis outside pure-EUR was
// blocked with `analyzer_fx_evidence_required` — GB, CH, LI and the eight
// non-EUR EU markets. That is correct behaviour (it refuses rather than
// inventing a number) but it refuses for 11 of 30 markets. This module feeds
// the table so the refusal stops being the normal case.
//
// EVIDENCE DOCTRINE: every row carries source, source_url and the effective
// date the ECB itself published. Nothing here derives, averages or
// extrapolates a rate. If the ECB did not publish a currency, no row is
// written for it and the caller is told which ones are missing — never a
// filled-in guess.
//
// DIRECTION: the ECB quotes EUR as base (1 EUR = 24.755 CZK), so rows are
// stored exactly that way: base_currency EUR, quote_currency CZK. Callers
// asking CZK→EUR are served by `resolveFX`, which detects the inverted pair
// and inverts with exact BigInt maths. Storing it as published keeps the
// stored number byte-identical to the quoted source.
//
// PUBLICATION CADENCE: the ECB publishes around 16:00 CET on TARGET business
// days only. Weekends and holidays produce no new file, so the previous rate
// legitimately stays the latest. `resolveFX` picks the newest observation at
// or before the requested date and marks it STALE past its policy window
// (7 days for the analyzer), which absorbs a normal weekend without loosening
// anything.

import { decimalRateToScaled, normalizeCurrencyCode, scaledRateToDecimal } from './marketMoney.ts';

export const ECB_DAILY_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_SOURCE = 'ECB';
// Must stay inside RELIABLE_SOURCE_TYPES in analyzerFx.ts, otherwise the rows
// are ingested but silently ignored by the analyzer.
export const ECB_SOURCE_TYPE = 'CENTRAL_BANK';
export const ECB_BASE_CURRENCY = 'EUR';
export const ECB_POLICY_VERSION = 'ecb-fx-ingest-1.0.0';

// Every non-EUR primary_currency across the 33 declared markets. Derived by
// hand from config/europe-markets.json and locked by test — if a market's
// currency changes, the test fails and this list must be revisited
// deliberately rather than drifting.
export const REQUIRED_QUOTE_CURRENCIES = Object.freeze([
  'CHF', 'CZK', 'DKK', 'GBP', 'HUF', 'ISK', 'NOK', 'PLN', 'RON', 'SEK',
]);

// <Cube time='2026-08-14'> — single or double quotes, both legal XML.
const TIME_RE = /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']/;
// <Cube currency='CZK' rate='24.755'/>
const RATE_RE = /<Cube\s+currency=["']([A-Za-z]{3})["']\s+rate=["']([0-9.]+)["']/g;

/**
 * Parse the ECB daily reference file. Pure: no IO, no clock.
 * Returns the published date and the raw decimal rate strings, untouched —
 * the string the ECB published is what gets stored, so an auditor comparing
 * the row against the source sees the same characters.
 */
export function parseEcbDailyXml(xml: any) {
  const text = typeof xml === 'string' ? xml : '';
  if (!text.trim()) return { ok: false, error: 'ecb_payload_empty' };

  const timeMatch = TIME_RE.exec(text);
  if (!timeMatch) return { ok: false, error: 'ecb_effective_date_missing' };
  const day = timeMatch[1];
  const parsedDay = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsedDay)) return { ok: false, error: 'ecb_effective_date_invalid' };

  const rates: Record<string, string> = {};
  RATE_RE.lastIndex = 0;
  for (let m = RATE_RE.exec(text); m; m = RATE_RE.exec(text)) {
    const currency = normalizeCurrencyCode(m[1]);
    const decimal = String(m[2]);
    // decimalRateToScaled is the single validator for rate shape; a rate it
    // rejects (0, malformed, negative) is dropped rather than coerced.
    if (!currency || decimalRateToScaled(decimal) === null) continue;
    rates[currency] = decimal;
  }
  if (Object.keys(rates).length === 0) return { ok: false, error: 'ecb_no_rates_parsed' };

  return { ok: true, effective_at: new Date(parsedDay).toISOString(), rates };
}

/**
 * Build FxSnapshot rows from a parsed ECB payload. Pure: the caller supplies
 * `retrieved_at` so the function stays deterministic under test.
 *
 * Currencies the ECB did not publish come back in `missing` — the caller
 * reports them. We never substitute a stale or derived value for them here.
 */
export function buildFxSnapshotRows({
  parsed,
  retrieved_at,
  quote_currencies = REQUIRED_QUOTE_CURRENCIES,
}: any) {
  if (!parsed?.ok) return { ok: false, error: parsed?.error || 'ecb_parse_required', rows: [], missing: [] };
  const retrievedAt = Date.parse(String(retrieved_at || ''));
  if (!Number.isFinite(retrievedAt)) return { ok: false, error: 'retrieved_at_required', rows: [], missing: [] };

  const effectiveAt = parsed.effective_at;
  const day = effectiveAt.slice(0, 10);
  const rows: any[] = [];
  const missing: string[] = [];

  for (const raw of quote_currencies) {
    const quote = normalizeCurrencyCode(raw);
    if (!quote || quote === ECB_BASE_CURRENCY) continue;
    const decimal = parsed.rates?.[quote];
    if (!decimal) { missing.push(quote); continue; }
    const scaled = decimalRateToScaled(decimal);
    if (scaled === null) { missing.push(quote); continue; }
    // rate_scaled_1e12 is only trusted by resolveFX when it is a SAFE integer;
    // past that it silently falls through to rate_decimal. We store the scaled
    // value only when it is safe, so the two fields can never disagree.
    const scaledNumber = Number(scaled);
    const scaledIsSafe = Number.isSafeInteger(scaledNumber);

    rows.push({
      // Deterministic identity: one row per (source, pair, published day).
      // Re-running the worker the same day updates nothing new.
      fx_key: `${ECB_SOURCE}:${ECB_BASE_CURRENCY}:${quote}:${day}`,
      base_currency: ECB_BASE_CURRENCY,
      quote_currency: quote,
      rate_kind: 'REFERENCE',
      ...(scaledIsSafe ? { rate_scaled_1e12: scaledNumber } : {}),
      // Always stored: exact, string-parsed by BigInt, no float in the path.
      rate_decimal: scaledIsSafe ? scaledRateToDecimal(scaled) : String(decimal),
      source: ECB_SOURCE,
      source_type: ECB_SOURCE_TYPE,
      source_url: ECB_DAILY_URL,
      effective_at: effectiveAt,
      resolved_effective_at: effectiveAt,
      retrieved_at: new Date(retrievedAt).toISOString(),
      status: 'CURRENT',
      source_policy_version: ECB_POLICY_VERSION,
      notes: `ECB euro foreign exchange reference rate published for ${day}. 1 ${ECB_BASE_CURRENCY} = ${decimal} ${quote}.`,
    });
  }

  return { ok: true, rows, missing, effective_at: effectiveAt };
}
