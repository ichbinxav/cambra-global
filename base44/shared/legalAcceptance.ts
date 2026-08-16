// legalAcceptance — versions of the public legal documents a merchant accepts,
// and the pure validation of an acceptance record (DPA-1, 2026-08-16).
//
// WHY THIS EXISTS. Before this, the platform had NO acceptance mechanism at
// all: LoginGate showed a passive "by continuing you accept our Terms and
// Privacy Policy" line (browsewrap) and nothing was ever recorded. Nobody
// could answer "which version of which document did this customer accept, and
// when?" — the question a supervisory authority or a court actually asks.
//
// The evidence shape mirrors the one the Recover mandate already uses
// (signed_by_email / signed_at / ip_address / user_agent / document_version,
// see acceptRecoverMandate) rather than inventing a second evidence plane.
//
// SINGLE SOURCE OF TRUTH: the constants below are the authoritative versions.
// src/lib/legalAcceptance.test.js locks them against the published content in
// src/content/legal/en/{terms,dpa,subprocessors}.js — publishing a new text
// without bumping the version here (or vice versa) fails that test.
//
// This module is pure: no IO, no clock, no SDK.

export const LEGAL_ACCEPTANCE_POLICY_VERSION = 'legal-acceptance-1.0.0';

// Terms are versioned by the date of their last substantive edit — they had no
// version number before, and inventing a semantic one would be arbitrary.
export const CURRENT_TERMS_VERSION = '2026-08-16';
// The DPA declares "Version 1.0" in its own visible text.
export const CURRENT_DPA_VERSION = '1.0';

export const REQUIRED_DOCUMENTS = Object.freeze(['terms', 'dpa']);

export type LegalAcceptanceInput = {
  terms_version?: unknown;
  dpa_version?: unknown;
  locale?: unknown;
};

/**
 * Validate a merchant's declared acceptance against the versions currently
 * published. Fail-closed on purpose: an acceptance of an unknown or stale
 * version is NOT recorded as an acceptance of the current one — it is
 * rejected, so the client re-displays the current text.
 */
export function validateLegalAcceptance(input: LegalAcceptanceInput): any {
  const terms = String((input?.terms_version ?? '')).trim();
  const dpa = String((input?.dpa_version ?? '')).trim();
  if (!terms) return { ok: false, error: 'terms_version_required' };
  if (!dpa) return { ok: false, error: 'dpa_version_required' };
  if (terms !== CURRENT_TERMS_VERSION) {
    return { ok: false, error: 'terms_version_stale', expected: CURRENT_TERMS_VERSION, received: terms };
  }
  if (dpa !== CURRENT_DPA_VERSION) {
    return { ok: false, error: 'dpa_version_stale', expected: CURRENT_DPA_VERSION, received: dpa };
  }
  const localeRaw = typeof input?.locale === 'string' ? input.locale.trim().toLowerCase() : '';
  const locale = /^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(localeRaw) ? localeRaw : null;
  return { ok: true, terms_version: terms, dpa_version: dpa, locale };
}

/**
 * Build the durable evidence row. Every field is either server-observed
 * (email, timestamp, ip, user agent) or validated above — nothing is taken on
 * trust from the client except the locale it was displayed in.
 */
export function buildLegalAcceptanceRecord(params: {
  user_email: string;
  accepted_at: string;
  terms_version: string;
  dpa_version: string;
  locale?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  brand_id?: string | null;
}): any {
  return {
    user_email: String(params.user_email || '').trim().toLowerCase(),
    accepted_at: params.accepted_at,
    terms_version: params.terms_version,
    dpa_version: params.dpa_version,
    document_versions_json: {
      terms: params.terms_version,
      dpa: params.dpa_version,
      policy_version: LEGAL_ACCEPTANCE_POLICY_VERSION,
    },
    acceptance_method: 'in_app_checkbox',
    ...(params.locale ? { locale: params.locale } : {}),
    ...(params.ip_address ? { ip_address: params.ip_address } : {}),
    ...(params.user_agent ? { user_agent: String(params.user_agent).slice(0, 500) } : {}),
    ...(params.brand_id ? { brand_id: params.brand_id } : {}),
  };
}

/**
 * True when an existing row already covers the CURRENT versions of every
 * required document. Used for idempotency (re-accepting changes nothing) and
 * by the gate to decide whether to prompt.
 */
export function coversCurrentVersions(row: any): boolean {
  return String(row?.terms_version || '') === CURRENT_TERMS_VERSION
    && String(row?.dpa_version || '') === CURRENT_DPA_VERSION;
}
