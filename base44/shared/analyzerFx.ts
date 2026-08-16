import { normalizeCurrencyCode, normalizeMoney, resolveFX } from './marketMoney.ts';

export const ANALYZER_FX_POLICY_VERSION = 'analyzer-fx-1.0.0';
export const ANALYZER_FX_TARGET_CURRENCY = 'EUR';

const RELIABLE_SOURCE_TYPES = new Set([
  'CENTRAL_BANK', 'OFFICIAL_REFERENCE', 'PRIMARY_REFERENCE',
  'MANUAL_VERIFIED', 'OTHER_PRIMARY',
]);

function isoFromStripeRow(row:any) {
  if (Number.isFinite(Number(row?.created)) && Number(row.created) > 0) {
    return new Date(Number(row.created) * 1000).toISOString();
  }
  const parsed = Date.parse(String(row?.effective_at || row?.occurred_at || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function evidenceAnchor(row:any) {
  return row?.evidence_id || row?.source_snapshot_id || row?.source_url || row?.content_hash || null;
}

export function analyzerReliableFxSnapshots(rows:any[]) {
  return (Array.isArray(rows) ? rows : []).filter((row:any) =>
    row?.rate_kind === 'REFERENCE' &&
    ['CURRENT','VERIFIED_REFERENCE'].includes(String(row?.status || '')) &&
    RELIABLE_SOURCE_TYPES.has(String(row?.source_type || '')) &&
    String(row?.source || '').trim().length > 0 &&
    Number.isFinite(Date.parse(String(row?.resolved_effective_at || row?.effective_at || ''))) &&
    Boolean(evidenceAnchor(row))
  );
}

function originalBucket(target:Record<string,any>, currency:string) {
  if (!target[currency]) target[currency] = { amount_minor:0, fee_minor:0, rows:0, charge_rows:0 };
  return target[currency];
}

/**
 * Convert canonical Stripe integer minor-unit rows to EUR using only reference
 * observations with auditable provenance. One unresolved row blocks the whole
 * verified analysis; mixed currencies are never added before normalization.
 */
export function normalizeAnalyzerStripeRows(rows:any[], snapshots:any[], targetCurrency=ANALYZER_FX_TARGET_CURRENCY) {
  const target = normalizeCurrencyCode(targetCurrency);
  if (target !== ANALYZER_FX_TARGET_CURRENCY) return { ok:false, error:'analyzer_target_currency_unsupported', blockers:[] };
  const reliable = analyzerReliableFxSnapshots(snapshots);
  const original_totals_by_currency:Record<string,any> = {};
  const fxAudit = new Map<string,any>();
  const charge_amounts_eur_minor:number[] = [];
  let amount_eur_minor = 0;
  let fee_eur_minor = 0;

  for (let index=0; index<(Array.isArray(rows)?rows:[]).length; index++) {
    const row = rows[index];
    const currency = normalizeCurrencyCode(row?.currency);
    const amount = Number(row?.amount);
    const fee = Number(row?.fee);
    const effectiveAt = isoFromStripeRow(row);
    const rowRef = String(row?.id || row?.source || `row:${index}`);
    if (!currency || !Number.isSafeInteger(amount) || !Number.isSafeInteger(fee) || !effectiveAt) {
      return { ok:false, error:'analyzer_money_observation_invalid', blockers:[{ row_ref:rowRef,currency:currency||null,reason:!effectiveAt?'effective_date_required':'integer_minor_units_required' }], original_totals_by_currency };
    }

    const bucket = originalBucket(original_totals_by_currency,currency);
    bucket.amount_minor += amount;
    bucket.fee_minor += fee;
    bucket.rows += 1;
    if (row?.reporting_category === 'charge') bucket.charge_rows += 1;

    const resolution = resolveFX(reliable,{
      base_currency:currency,
      quote_currency:target,
      effective_at:effectiveAt,
      purpose:'ANALYZER_VERIFIED_PAYMENTS',
      source_policy:{ stale_after_days:7 },
    });
    if (!resolution?.ok || !['CURRENT','VERIFIED_REFERENCE'].includes(String(resolution?.status || ''))) {
      return { ok:false,error:'analyzer_fx_evidence_required',blockers:[{ row_ref:rowRef,currency,requested_effective_at:effectiveAt,reason:resolution?.error||resolution?.status||'fx_evidence_required' }],original_totals_by_currency };
    }
    // `any`: the critical typecheck cannot narrow normalizeMoney's union (FX-2).
    const normalizedAmount:any = normalizeMoney({ amount_original:amount,currency_original:currency,target_currency:target,effective_at:effectiveAt,fx_resolution:resolution });
    const normalizedFee:any = normalizeMoney({ amount_original:fee,currency_original:currency,target_currency:target,effective_at:effectiveAt,fx_resolution:resolution });
    if (!normalizedAmount?.ok || !normalizedFee?.ok) {
      return { ok:false,error:'analyzer_fx_evidence_required',blockers:[{ row_ref:rowRef,currency,requested_effective_at:effectiveAt,reason:normalizedAmount?.error||normalizedFee?.error||'fx_normalization_failed' }],original_totals_by_currency };
    }
    amount_eur_minor += normalizedAmount.amount_normalized;
    fee_eur_minor += normalizedFee.amount_normalized;
    if (row?.reporting_category === 'charge') charge_amounts_eur_minor.push(normalizedAmount.amount_normalized);

    const audit = {
      currency_original:currency,
      currency_normalized:target,
      rate:normalizedAmount.fx_rate,
      rate_scaled_1e12:normalizedAmount.fx_rate_scaled_1e12,
      source:normalizedAmount.fx_source,
      source_url:normalizedAmount.fx_source_url||null,
      source_snapshot_id:normalizedAmount.fx_source_snapshot_id||null,
      evidence_id:normalizedAmount.fx_evidence_id||null,
      version:normalizedAmount.fx_version??null,
      requested_effective_at:normalizedAmount.fx_requested_effective_at,
      resolved_effective_at:normalizedAmount.fx_resolved_effective_at,
      resolution_method:normalizedAmount.fx_resolution_method,
    };
    fxAudit.set(JSON.stringify(audit),audit);
  }

  const fx_provenance = Array.from(fxAudit.values()).sort((a,b) =>
    `${a.currency_original}:${a.requested_effective_at}:${a.source}`.localeCompare(`${b.currency_original}:${b.requested_effective_at}:${b.source}`)
  );
  return {
    ok:true,
    policy_version:ANALYZER_FX_POLICY_VERSION,
    currency_normalized:target,
    amount_eur_minor,
    fee_eur_minor,
    charge_amounts_eur_minor,
    original_totals_by_currency,
    fx_provenance,
    fx_fingerprint:JSON.stringify({ policy_version:ANALYZER_FX_POLICY_VERSION,original_totals_by_currency,fx_provenance }),
  };
}
