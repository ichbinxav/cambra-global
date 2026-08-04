// recoverTax — RECOVER-4 (2026-08-04).
//
// Minimal FR/ES tax engine for the Recover Margin success fee.
//
// DOCTRINE (spec §1, §15): this module AUTOMATES advisor-approved rules; it is
// never the legal source of those rules. Nothing here assumes CAMBRA's TVA
// regime: every treatment other than a BLOCK requires the corresponding flag in
// RECOVER_TAX_CONFIG_JSON, a configuration the fiscal advisor approves and the
// founder sets. Without it, EVERY invoice is blocked with TAX_REVIEW_REQUIRED —
// a missing config can never silently become "tax = 0".
//
// RECOVER_TAX_CONFIG_JSON shape (all advisor-approved):
// {
//   "approved_by": "advisor name / reference",
//   "approved_at": "2026-09-01",
//   "fr_regime_confirmed": true,          // CAMBRA under régime réel normal
//   "fr_standard_rate_bps": 2000,         // 20.00% — the confirmed domestic rate
//   "fr_stripe_tax_rate_id_test": "txr_…",// Stripe Tax Rate object, test mode
//   "fr_stripe_tax_rate_id_live": "txr_…",// Stripe Tax Rate object, live mode
//   "es_reverse_charge_confirmed": true,  // FR→ES B2B general-rule service OK'd
//   "einvoicing_mode": "pre_mandate"      // | approved_platform_ready | blocked_not_ready
// }
//
// VERI*FACTU exclusion (§16): CAMBRA is a FRENCH supplier; the Spanish
// customer's own invoicing-system obligations do not make CAMBRA's French
// invoice a VERI*FACTU document. Not implemented here, on purpose.

export type TaxTreatment =
  | 'FR_STANDARD_TVA'
  | 'ES_EU_REVERSE_CHARGE'
  | 'TAX_REVIEW_REQUIRED'
  | 'UNSUPPORTED_JURISDICTION';

export type ViesStatus =
  | 'valid'
  | 'invalid'
  | 'unavailable'
  | 'timeout'
  | 'not_checked'
  | 'manual_review_approved'
  | 'manual_review_rejected';

export type RecoverTaxConfig = {
  approved_by: string;
  approved_at: string;
  fr_regime_confirmed: boolean;
  fr_standard_rate_bps: number;
  fr_stripe_tax_rate_id_test?: string;
  fr_stripe_tax_rate_id_live?: string;
  es_reverse_charge_confirmed: boolean;
  einvoicing_mode: 'pre_mandate' | 'approved_platform_ready' | 'blocked_not_ready';
};

export function readTaxConfig():
  | { ok: true; config: RecoverTaxConfig }
  | { ok: false; missing: string[] } {
  const raw = Deno.env.get('RECOVER_TAX_CONFIG_JSON') || '';
  if (!raw.trim()) return { ok: false, missing: ['RECOVER_TAX_CONFIG_JSON'] };
  let p: any;
  try { p = JSON.parse(raw); } catch { return { ok: false, missing: ['RECOVER_TAX_CONFIG_JSON:invalid_json'] }; }
  const missing: string[] = [];
  if (!String(p?.approved_by || '').trim()) missing.push('approved_by');
  if (!String(p?.approved_at || '').trim()) missing.push('approved_at');
  if (typeof p?.fr_regime_confirmed !== 'boolean') missing.push('fr_regime_confirmed');
  if (typeof p?.es_reverse_charge_confirmed !== 'boolean') missing.push('es_reverse_charge_confirmed');
  if (!['pre_mandate', 'approved_platform_ready', 'blocked_not_ready'].includes(p?.einvoicing_mode)) missing.push('einvoicing_mode');
  if (p?.fr_regime_confirmed === true && !Number.isFinite(Number(p?.fr_standard_rate_bps))) missing.push('fr_standard_rate_bps');
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      approved_by: String(p.approved_by).trim(),
      approved_at: String(p.approved_at).trim(),
      fr_regime_confirmed: p.fr_regime_confirmed,
      fr_standard_rate_bps: Number(p.fr_standard_rate_bps || 0),
      fr_stripe_tax_rate_id_test: p.fr_stripe_tax_rate_id_test ? String(p.fr_stripe_tax_rate_id_test).trim() : undefined,
      fr_stripe_tax_rate_id_live: p.fr_stripe_tax_rate_id_live ? String(p.fr_stripe_tax_rate_id_live).trim() : undefined,
      es_reverse_charge_confirmed: p.es_reverse_charge_confirmed,
      einvoicing_mode: p.einvoicing_mode,
    },
  };
}

/** Normalize a VAT number: uppercase, strip spaces/dots/dashes. */
export function normalizeVat(raw: unknown): string {
  return String(raw ?? '').toUpperCase().replace(/[\s.\-]/g, '');
}

export type CustomerTaxProfile = {
  billing_country: string;          // 'FR' | 'ES' — legal establishment, never IP/language
  legal_name: string;
  billing_address_line1: string;
  billing_postal_code: string;
  billing_city: string;
  vat_number: string;               // normalized
  tax_customer_type: string;        // must be 'business_taxable_person'
  vies_status: ViesStatus;
};

export type TaxDecision = {
  treatment: TaxTreatment;
  tax_rate_bps: number;             // 2000 for FR standard, 0 for reverse charge
  blockers: string[];               // non-empty ⇒ DO NOT invoice
  mentions: string[];               // legally required invoice mentions
};

/**
 * The FR/ES decision matrix (§15). Supplier is CAMBRA, established in FR
 * (asserted by the caller against CAMBRA_LEGAL_IDENTITY_JSON).
 * Any blocker present means: no invoice until resolved — never "tax = 0 by
 * accident", never "French TVA because VIES said invalid" (§14).
 */
export function determineTaxTreatment(
  customer: CustomerTaxProfile,
  config: RecoverTaxConfig | null,
): TaxDecision {
  const blockers: string[] = [];
  const country = String(customer.billing_country || '').toUpperCase();

  if (!config) {
    return { treatment: 'TAX_REVIEW_REQUIRED', tax_rate_bps: 0, blockers: ['tax_config_missing'], mentions: [] };
  }
  if (!customer.legal_name) blockers.push('customer_legal_name_missing');
  if (!customer.billing_address_line1 || !customer.billing_postal_code || !customer.billing_city) blockers.push('customer_billing_address_missing');
  if (customer.tax_customer_type !== 'business_taxable_person') blockers.push('customer_not_confirmed_b2b');

  if (country !== 'FR' && country !== 'ES') {
    return { treatment: 'UNSUPPORTED_JURISDICTION', tax_rate_bps: 0, blockers: [...blockers, 'billing_blocked_unsupported_jurisdiction'], mentions: [] };
  }

  if (country === 'FR') {
    if (!config.fr_regime_confirmed) blockers.push('fr_tva_regime_not_confirmed');
    if (config.fr_regime_confirmed && !(config.fr_standard_rate_bps > 0)) blockers.push('fr_rate_not_configured');
    if (blockers.length) return { treatment: 'TAX_REVIEW_REQUIRED', tax_rate_bps: 0, blockers, mentions: [] };
    return {
      treatment: 'FR_STANDARD_TVA',
      tax_rate_bps: config.fr_standard_rate_bps,
      blockers: [],
      mentions: [`TVA ${(config.fr_standard_rate_bps / 100).toFixed(2).replace(/\.00$/, '')}%`],
    };
  }

  // ES — reverse charge only with a VALID or manually-approved VIES check and
  // an ES-prefixed VAT number. invalid ≠ "apply French TVA" (§14): it blocks.
  if (!config.es_reverse_charge_confirmed) blockers.push('es_reverse_charge_not_confirmed');
  const vat = normalizeVat(customer.vat_number);
  if (!vat) blockers.push('customer_vat_missing');
  else if (!vat.startsWith('ES')) blockers.push('customer_vat_prefix_mismatch');
  if (customer.vies_status === 'valid' || customer.vies_status === 'manual_review_approved') {
    // ok
  } else if (customer.vies_status === 'invalid' || customer.vies_status === 'manual_review_rejected') {
    blockers.push('vies_invalid_unresolved');
  } else if (customer.vies_status === 'unavailable' || customer.vies_status === 'timeout') {
    blockers.push('vies_unavailable_unresolved');
  } else {
    blockers.push('vies_not_checked');
  }
  if (blockers.length) return { treatment: 'TAX_REVIEW_REQUIRED', tax_rate_bps: 0, blockers, mentions: [] };
  return {
    treatment: 'ES_EU_REVERSE_CHARGE',
    tax_rate_bps: 0,
    blockers: [],
    mentions: [
      'Autoliquidación por el destinatario',
      'Reverse charge — Article 196, Directive 2006/112/EC',
    ],
  };
}

/** The Stripe Tax Rate id required for a treatment, per mode. Null when none applies. */
export function stripeTaxRateIdFor(
  decision: TaxDecision,
  config: RecoverTaxConfig,
  mode: 'test' | 'live',
): { ok: true; tax_rate_id: string | null } | { ok: false; blocker: string } {
  if (decision.treatment !== 'FR_STANDARD_TVA') return { ok: true, tax_rate_id: null };
  const id = mode === 'live' ? config.fr_stripe_tax_rate_id_live : config.fr_stripe_tax_rate_id_test;
  if (!id) return { ok: false, blocker: `fr_stripe_tax_rate_id_${mode}_missing` };
  return { ok: true, tax_rate_id: id };
}