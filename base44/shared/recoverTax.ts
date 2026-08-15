// recoverTax — RECOVER-4 (2026-08-04) · generalised to the 30 active markets (2026-08-15).
//
// Tax engine for the Recover Margin success fee. CAMBRA Global SASU is a
// FRENCH supplier of a B2B service; under the general rule of art. 44 of
// Directive 2006/112/EC the place of supply is the customer's country, with
// reverse charge (art. 196) inside the EU and outside-scope treatment for the
// non-EU markets. No per-country VAT registration is required — that is what
// makes 30 markets feasible.
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
//   "es_reverse_charge_confirmed": true,  // FR→ES B2B general-rule service OK'd (legacy flag)
//   "eu_reverse_charge_confirmed": true,  // art. 44+196 reverse charge, all 24 active EU markets
//   "non_eu_outside_scope_confirmed": true,// outside-scope treatment for NO IS LI CH GB AD
//   "country_overrides": {"XX":"BLOCK"},  // per-country kill-switch without a deploy: BLOCK | REVIEW
//   "einvoicing_mode": "pre_mandate"      // | approved_platform_ready | blocked_not_ready
// }
// The two new flags DEFAULT TO FALSE. When `eu_reverse_charge_confirmed` is
// absent, the legacy `es_reverse_charge_confirmed` is treated as equivalent so
// an already-approved ES-only config keeps invoicing Spain and nothing else.
//
// VERI*FACTU exclusion (§16): CAMBRA is a FRENCH supplier; the Spanish
// customer's own invoicing-system obligations do not make CAMBRA's French
// invoice a VERI*FACTU document. Not implemented here, on purpose.
//
// JURISDICTION NOTES (explicit decisions, not accidents):
// - Greece's VAT prefix is 'EL', not 'GR' (VAT_PREFIX_BY_COUNTRY).
// - Northern Ireland: 'XI' prefixes exist for GOODS under the Windsor
//   Framework; CAMBRA supplies B2B SERVICES, so the customer is GB and flows
//   through the non-EU branch. An XI-prefixed identifier is accepted there as
//   a registered UK tax identifier.
// - Monaco is treated as France for VAT purposes: an MC billing address flows
//   through the FR path (FR_STANDARD_TVA), never through reverse charge.
// - Andorra (AD) is neither EU nor EEA — IGI, not VAT: outside-scope group.
// - Liechtenstein (LI) uses the SWISS VAT system, not the EU one: outside-scope group.
// - The 6 non-EU markets have no VIES. That branch never requires a VIES
//   check; it requires a registered local tax identifier plus B2B confirmation.
// - FR/BE/NL are PROTECTED markets (not launched, legal reasons). FR still
//   resolves domestically (FR_STANDARD_TVA); BE and NL customers land in
//   UNSUPPORTED_JURISDICTION until the protection is lifted.

export type TaxTreatment =
  | 'FR_STANDARD_TVA'
  | 'EU_B2B_REVERSE_CHARGE'
  /** @deprecated pre-2026-08-15 alias for the ES-only engine; kept so historical
   * invoices and stored decisions keep parsing. New decisions return
   * EU_B2B_REVERSE_CHARGE for Spain too. */
  | 'ES_EU_REVERSE_CHARGE'
  | 'OUTSIDE_SCOPE_EU_VAT'
  | 'TAX_REVIEW_REQUIRED'
  | 'UNSUPPORTED_JURISDICTION';

/** Reverse-charge family — consumers must treat the deprecated ES alias and the
 * generalised EU treatment identically (invoice footer, Stripe tax_exempt). */
export function isReverseChargeTreatment(treatment: TaxTreatment | string): boolean {
  return treatment === 'EU_B2B_REVERSE_CHARGE' || treatment === 'ES_EU_REVERSE_CHARGE';
}

// The 24 ACTIVE EU markets. Consistency: 24 active + FR/BE/NL protected = EU-27.
export const EU_ACTIVE_MARKETS = Object.freeze([
  'AT', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
] as const);

// The 6 ACTIVE non-EU markets — outside the scope of EU VAT.
export const NON_EU_ACTIVE_MARKETS = Object.freeze(['NO', 'IS', 'LI', 'CH', 'GB', 'AD'] as const);

// Protected markets — not launched, for legal reasons. FR is also CAMBRA's own
// establishment, so FR (and MC, VAT-wise France) still resolves domestically.
export const PROTECTED_MARKETS = Object.freeze(['FR', 'BE', 'NL'] as const);

/** VAT-number prefix expected per country when it differs from the ISO code.
 * Greece is the one active-market divergence (EL); XI is documented above. */
export const VAT_PREFIX_BY_COUNTRY: Readonly<Record<string, string>> = Object.freeze({
  GR: 'EL',
});

export type ViesStatus =
  | 'valid'
  | 'invalid'
  | 'unavailable'
  | 'timeout'
  | 'not_checked'
  | 'manual_review_approved'
  | 'manual_review_rejected';

export type CountryOverride = 'BLOCK' | 'REVIEW';

export type RecoverTaxConfig = {
  approved_by: string;
  approved_at: string;
  fr_regime_confirmed: boolean;
  fr_standard_rate_bps: number;
  fr_stripe_tax_rate_id_test?: string;
  fr_stripe_tax_rate_id_live?: string;
  /** Legacy ES-only flag. Equivalent to `eu_reverse_charge_confirmed` when the
   * new flag is absent, so an already-approved config keeps invoicing ES only. */
  es_reverse_charge_confirmed: boolean;
  /** art. 44+196 reverse charge across the 24 active EU markets. DEFAULT FALSE. */
  eu_reverse_charge_confirmed?: boolean;
  /** outside-scope treatment for NO IS LI CH GB AD. DEFAULT FALSE. */
  non_eu_outside_scope_confirmed?: boolean;
  /** Per-country kill-switch without a deploy. BLOCK ⇒ unsupported; REVIEW ⇒ hold. */
  country_overrides?: Record<string, CountryOverride>;
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
  // New flags are OPTIONAL (absent ⇒ false) but, when present, must be booleans:
  // a typo'd "true" string must fail loudly, never silently widen invoicing scope.
  if (p?.eu_reverse_charge_confirmed !== undefined && typeof p.eu_reverse_charge_confirmed !== 'boolean') missing.push('eu_reverse_charge_confirmed:not_boolean');
  if (p?.non_eu_outside_scope_confirmed !== undefined && typeof p.non_eu_outside_scope_confirmed !== 'boolean') missing.push('non_eu_outside_scope_confirmed:not_boolean');
  let overrides: Record<string, CountryOverride> | undefined;
  if (p?.country_overrides !== undefined) {
    if (!p.country_overrides || typeof p.country_overrides !== 'object' || Array.isArray(p.country_overrides)) {
      missing.push('country_overrides:not_object');
    } else {
      overrides = {};
      for (const [k, v] of Object.entries(p.country_overrides)) {
        const iso = String(k).trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(iso) || (v !== 'BLOCK' && v !== 'REVIEW')) {
          missing.push(`country_overrides:${k}`);
          continue;
        }
        overrides[iso] = v;
      }
    }
  }
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
      eu_reverse_charge_confirmed: p.eu_reverse_charge_confirmed === true,
      non_eu_outside_scope_confirmed: p.non_eu_outside_scope_confirmed === true,
      country_overrides: overrides,
      einvoicing_mode: p.einvoicing_mode,
    },
  };
}

/** Normalize a VAT number: uppercase, strip spaces/dots/dashes. */
export function normalizeVat(raw: unknown): string {
  return String(raw ?? '').toUpperCase().replace(/[\s.\-]/g, '');
}

export type CustomerTaxProfile = {
  billing_country: string;          // ISO-3166 alpha-2 — legal establishment, never IP/language
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
 * The 30-market decision matrix (§15, generalised). Supplier is CAMBRA,
 * established in FR (asserted by the caller against CAMBRA_LEGAL_IDENTITY_JSON).
 * Any blocker present means: no invoice until resolved — never "tax = 0 by
 * accident", never "French TVA because VIES said invalid" (§14).
 *
 * Precedence (each step only reached when the previous one did not decide):
 *   1. no config                → TAX_REVIEW_REQUIRED (fail-closed doctrine)
 *   2. identity/address/B2B     → accumulate blockers (never silently skipped)
 *   3. country_overrides[cc]    → BLOCK ⇒ UNSUPPORTED · REVIEW ⇒ TAX_REVIEW_REQUIRED
 *   4. FR (and MC, VAT-France)  → FR_STANDARD_TVA at the configured rate
 *   5. 24 active EU markets     → eu flag + prefixed VAT + VIES ⇒ EU_B2B_REVERSE_CHARGE
 *   6. NO IS LI CH GB AD        → non-EU flag + local tax id (no VIES) ⇒ OUTSIDE_SCOPE_EU_VAT
 *   7. anything else            → UNSUPPORTED_JURISDICTION (BE/NL land here: protected)
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

  // Per-country kill-switch — wins over every treatment branch below so a
  // problem market can be stopped by config alone, without a deploy.
  const override = config.country_overrides ? config.country_overrides[country] : undefined;
  if (override === 'BLOCK') {
    return { treatment: 'UNSUPPORTED_JURISDICTION', tax_rate_bps: 0, blockers: [...blockers, 'billing_blocked_country_override'], mentions: [] };
  }
  if (override === 'REVIEW') {
    return { treatment: 'TAX_REVIEW_REQUIRED', tax_rate_bps: 0, blockers: [...blockers, 'country_override_review'], mentions: [] };
  }

  // FR — domestic TVA, unchanged. MC is France for VAT purposes (see header).
  if (country === 'FR' || country === 'MC') {
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

  // 24 active EU markets — reverse charge only with the advisor flag, a
  // correctly-prefixed VAT number and a VALID or manually-approved VIES check.
  // invalid ≠ "apply French TVA" (§14): it blocks. The legacy ES-only flag is
  // honoured as equivalent when the EU-wide flag is absent, but only for ES —
  // an ES-approved config never silently widens to 23 more countries.
  if ((EU_ACTIVE_MARKETS as readonly string[]).includes(country)) {
    const euConfirmed = config.eu_reverse_charge_confirmed === true
      || (country === 'ES' && config.es_reverse_charge_confirmed === true);
    if (!euConfirmed) blockers.push('eu_reverse_charge_not_confirmed');
    const vat = normalizeVat(customer.vat_number);
    const expectedPrefix = VAT_PREFIX_BY_COUNTRY[country] || country;
    if (!vat) blockers.push('customer_vat_missing');
    else if (!vat.startsWith(expectedPrefix)) blockers.push('customer_vat_prefix_mismatch');
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
      treatment: 'EU_B2B_REVERSE_CHARGE',
      tax_rate_bps: 0,
      blockers: [],
      mentions: [
        ...(country === 'ES' ? ['Autoliquidación por el destinatario'] : []),
        'Reverse charge — Articles 44 & 196, Directive 2006/112/EC',
      ],
    };
  }

  // 6 active non-EU markets — outside the scope of EU VAT. No VIES exists for
  // these countries, so none is required; instead a registered local tax
  // identifier is mandatory on top of the identity/B2B blockers above.
  // GB accepts GB- or XI-prefixed identifiers (services ⇒ customer is GB).
  if ((NON_EU_ACTIVE_MARKETS as readonly string[]).includes(country)) {
    if (config.non_eu_outside_scope_confirmed !== true) blockers.push('non_eu_outside_scope_not_confirmed');
    const taxId = normalizeVat(customer.vat_number);
    if (!taxId) blockers.push('customer_local_tax_id_missing');
    if (blockers.length) return { treatment: 'TAX_REVIEW_REQUIRED', tax_rate_bps: 0, blockers, mentions: [] };
    return {
      treatment: 'OUTSIDE_SCOPE_EU_VAT',
      tax_rate_bps: 0,
      blockers: [],
      mentions: ['Outside the scope of EU VAT — Article 44, Directive 2006/112/EC'],
    };
  }

  // Everything else — including protected BE/NL and any non-market country.
  return { treatment: 'UNSUPPORTED_JURISDICTION', tax_rate_bps: 0, blockers: [...blockers, 'billing_blocked_unsupported_jurisdiction'], mentions: [] };
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