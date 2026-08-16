// analyzerSubmissionCurrency — merchant-selected currency for the self-report
// Analyzer wizard (FX step 2, 2026-08-16).
//
// The wizard's engine (submitPaymentsAnalysis → calculateGap) is EUR-only by
// contract: every range, every rate-table row and every savings band is EUR.
// Until now the payload fields monthly_gmv_eur / avg_ticket_eur were read as
// EUR regardless of where the merchant actually operates — a Polish merchant
// typing "50000" (thinking PLN) was treated as €50,000, ~4-5× the real value,
// and the estimate they saw was fantasy in either direction.
//
// This module converts the merchant's amounts to EUR AT THE BOUNDARY, before
// validation and before the engine, using the same evidence doctrine as the
// Stripe-verified path (analyzerFx.ts):
//   - one FX source of truth: resolveFX over FxSnapshot reference rows with
//     auditable provenance (ECB daily ingest). Never a hardcoded, remembered
//     or extrapolated rate.
//   - fail closed: no resolvable snapshot → the submission is rejected with
//     review_required, never computed with an assumed rate.
//   - the applied rate is FROZEN onto the submission (returned as an audit
//     object the caller persists), so any result is reproducible later even
//     after newer snapshots land.
//
// Staleness: ECB publishes on TARGET business days only (~16:00 CET). A
// merchant submitting on a weekend must not be blocked because Saturday has
// no fixing — Friday's official rate is real evidence, not an invention. We
// therefore accept a resolution up to STALE_AFTER_DAYS old (covers weekend +
// one bank holiday) and record the resolved date in the audit. Beyond that,
// fail closed. The Stripe-verified billing path keeps its stricter policy in
// analyzerFx.ts — estimates and invoices do not share risk tolerance.
//
// R5: this is a shared module, not a new function directory.

import { currencyMinorUnits, normalizeCurrencyCode, normalizeMoney, resolveFX } from './marketMoney.ts';
import { analyzerReliableFxSnapshots } from './analyzerFx.ts';
import { EUROPE_CURRENCIES } from './generated/europeMarkets.ts';

export const ANALYZER_SUBMISSION_FX_POLICY_VERSION = 'analyzer-submission-fx-1.0.0';
export const ANALYZER_SUBMISSION_STALE_AFTER_DAYS = 5;
export const ANALYZER_SUBMISSION_FX_PURPOSE = 'ANALYZER_SELF_REPORT';

// Currencies a merchant may declare: exactly the primary currencies of the
// canonical market registry (single source: config/europe-markets.json via
// the generated module). Anything else is not a supported market currency.
export const ANALYZER_SUBMISSION_CURRENCIES: readonly string[] = EUROPE_CURRENCIES;

type FxAudit = {
  policy_version: string;
  currency: string;
  rate_decimal: string;
  rate_scaled_1e12: number;
  source: string;
  source_url: string | null;
  source_snapshot_id: string | null;
  evidence_id: string | null;
  requested_effective_at: string;
  resolved_effective_at: string;
  resolution_method: string;
  stale_after_days: number;
};

/**
 * Convert one merchant-entered MAJOR-unit amount to EUR major units using a
 * reliable FxSnapshot resolution. EUR is the identity (fx: null). Fail-closed:
 * a currency without a resolvable snapshot returns { ok:false }.
 */
// Return shape (behavior locked by analyzerSubmissionCurrency.test.js):
//   { ok:true, amount_eur, fx: FxAudit|null } | { ok:false, error, detail? }
// Loose `any` return on purpose — the backend typecheck runs strict:false and
// cannot narrow discriminated unions; the vitest suite is the real contract.
export function convertMajorAmountToEur(
  input: { amount: number; currency: string; effective_at: string },
  snapshots: any[],
): any {
  const currency = normalizeCurrencyCode(input?.currency);
  if (!currency) return { ok: false, error: 'invalid_currency' };
  const amount = Number(input?.amount);
  if (!isFinite(amount) || amount <= 0) return { ok: false, error: 'amount_invalid' };
  if (currency === 'EUR') return { ok: true, amount_eur: amount, fx: null };

  const minorUnits = currencyMinorUnits(currency);
  if (minorUnits === null) return { ok: false, error: 'currency_precision_unknown' };

  // Merchant input is a decimal major amount; money math is integer minor
  // units only (no floating point past this line).
  const amountMinor = Math.round(amount * 10 ** minorUnits);
  if (!Number.isSafeInteger(amountMinor)) return { ok: false, error: 'amount_invalid' };

  const resolution = resolveFX(analyzerReliableFxSnapshots(snapshots), {
    base_currency: currency,
    quote_currency: 'EUR',
    effective_at: input.effective_at,
    purpose: ANALYZER_SUBMISSION_FX_PURPOSE,
    source_policy: { stale_after_days: ANALYZER_SUBMISSION_STALE_AFTER_DAYS },
  });
  if (!resolution?.ok || !['CURRENT', 'VERIFIED_REFERENCE'].includes(String(resolution?.status || ''))) {
    return { ok: false, error: 'fx_evidence_required', detail: String(resolution?.error || resolution?.status || 'fx_evidence_required') };
  }

  // `any`: the backend typecheck (strict:false) cannot narrow normalizeMoney's union.
  const normalized: any = normalizeMoney({
    amount_original: amountMinor,
    currency_original: currency,
    target_currency: 'EUR',
    effective_at: input.effective_at,
    fx_resolution: resolution,
  });
  if (!normalized?.ok || !Number.isSafeInteger(normalized.amount_normalized)) {
    return { ok: false, error: 'fx_evidence_required', detail: String((normalized as any)?.error || 'fx_normalization_failed') };
  }

  return {
    ok: true,
    amount_eur: normalized.amount_normalized / 100,
    fx: {
      policy_version: ANALYZER_SUBMISSION_FX_POLICY_VERSION,
      currency,
      rate_decimal: String(normalized.fx_rate),
      rate_scaled_1e12: Number(normalized.fx_rate_scaled_1e12),
      source: String(normalized.fx_source),
      source_url: normalized.fx_source_url || null,
      source_snapshot_id: normalized.fx_source_snapshot_id || null,
      evidence_id: normalized.fx_evidence_id || null,
      requested_effective_at: String(normalized.fx_requested_effective_at),
      resolved_effective_at: String(normalized.fx_resolved_effective_at),
      resolution_method: String(normalized.fx_resolution_method),
      stale_after_days: ANALYZER_SUBMISSION_STALE_AFTER_DAYS,
    },
  };
}

function convertibleNumber(v: any): number | null {
  const n = Number(v);
  return v !== undefined && v !== null && v !== '' && isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve the declared submission currency and, when it is not EUR, convert
 * every monetary field of the payload (single or combined shape) to EUR.
 *
 * Contract:
 *  - `currency` absent/empty → legacy behavior: amounts are EUR ({converted:false}).
 *    An old client that never learned about currency keeps working unchanged.
 *  - `currency` present but not a market currency → validation failure
 *    (field 'currency'), same shape as the wizard's other field failures.
 *  - non-EUR market currency → all convertible amounts are converted with ONE
 *    resolution (same currency, same effective date). Non-numeric amounts are
 *    passed through untouched so validateInput reports the right field.
 *  - no resolvable FxSnapshot → { ok:false, review_required:true } — the
 *    caller must reject the submission, never compute with a guessed rate.
 *
 * The returned payload is a clone; the caller's `raw` is never mutated.
 */
// Return shape (behavior locked by analyzerSubmissionCurrency.test.js):
//   | { ok:true,  currency, converted:false, payload }
//   | { ok:true,  currency, converted:true,  payload, original_amounts, fx }
//   | { ok:false, failure:{field,reason} }
//   | { ok:false, review_required:true, error:'fx_evidence_required', currency, detail }
export function prepareAnalyzerSubmissionCurrency(
  raw: any,
  snapshots: any[],
  nowIso: string,
): any {
  const declared = raw?.currency;
  if (declared === undefined || declared === null || declared === '') {
    return { ok: true, currency: 'EUR', converted: false, payload: raw };
  }
  const currency = normalizeCurrencyCode(declared);
  if (!currency || !ANALYZER_SUBMISSION_CURRENCIES.includes(currency)) {
    return { ok: false, failure: { field: 'currency', reason: 'not_in_enum' } };
  }
  if (currency === 'EUR') {
    return { ok: true, currency: 'EUR', converted: false, payload: raw };
  }

  // One resolution serves the whole submission: same currency, same date.
  // Probe with 1 major unit to obtain the audit, then convert each field.
  const probe = convertMajorAmountToEur({ amount: 1, currency, effective_at: nowIso }, snapshots);
  if (!probe.ok) {
    return { ok: false, review_required: true, error: 'fx_evidence_required', currency, detail: probe.error === 'fx_evidence_required' ? (probe.detail || probe.error) : probe.error };
  }
  const fx: FxAudit = probe.fx;

  const convert = (v: any): { value: any; original: number | null } => {
    const n = convertibleNumber(v);
    if (n === null) return { value: v, original: null };
    const res = convertMajorAmountToEur({ amount: n, currency, effective_at: nowIso }, snapshots);
    // Same snapshots + same date as the probe — cannot fail differently.
    return res.ok ? { value: res.amount_eur, original: n } : { value: v, original: null };
  };

  const payload = { ...raw };
  const original_amounts: any = { currency };

  const gmv = convert(raw?.monthly_gmv_eur);
  const ticket = convert(raw?.avg_ticket_eur);
  payload.monthly_gmv_eur = gmv.value;
  payload.avg_ticket_eur = ticket.value;
  if (gmv.original !== null) original_amounts.monthly_gmv = gmv.original;
  if (ticket.original !== null) original_amounts.avg_ticket = ticket.original;

  if (Array.isArray(raw?.channels)) {
    original_amounts.channels = [];
    payload.channels = raw.channels.map((ch: any) => {
      if (!ch || typeof ch !== 'object') {
        original_amounts.channels.push(null);
        return ch;
      }
      const cGmv = convert(ch.monthly_gmv_eur);
      const cTicket = convert(ch.avg_ticket_eur);
      original_amounts.channels.push({
        ...(typeof ch.channel === 'string' ? { channel: ch.channel } : {}),
        ...(cGmv.original !== null ? { monthly_gmv: cGmv.original } : {}),
        ...(cTicket.original !== null ? { avg_ticket: cTicket.original } : {}),
      });
      return { ...ch, monthly_gmv_eur: cGmv.value, avg_ticket_eur: cTicket.value };
    });
  }

  return { ok: true, currency, converted: true, payload, original_amounts, fx };
}
