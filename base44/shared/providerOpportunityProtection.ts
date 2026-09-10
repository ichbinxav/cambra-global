export const PROVIDER_OPPORTUNITY_PROTECTION_VERSION = 'provider-opportunity-protection-1.0.0';

const POSITIVE_INT = (value: unknown, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= max ? n : 0;
};

export function providerProtectionTerms(agreement: any) {
  if (!agreement || String(agreement.status || '') !== 'active') {
    return { ok: false as const, error: 'active_provider_agreement_required' };
  }
  if (!String(agreement.contract_document_id || '').trim() || !String(agreement.terms_hash || '').trim()) {
    return { ok: false as const, error: 'signed_provider_agreement_evidence_required' };
  }
  const terms = agreement.legal_terms_json?.provider_opportunity_protection || {};
  if (terms.opportunity_registration_required !== true) {
    return { ok: false as const, error: 'opportunity_registration_clause_required' };
  }
  if (terms.non_circumvention !== true) {
    return { ok: false as const, error: 'non_circumvention_clause_required' };
  }
  if (terms.preexisting_relationship_process !== true) {
    return { ok: false as const, error: 'preexisting_relationship_process_required' };
  }
  const protectionMonths = POSITIVE_INT(terms.protection_months, 60);
  const claimWindowDays = POSITIVE_INT(terms.preexisting_relationship_claim_window_days, 90);
  if (!protectionMonths) return { ok: false as const, error: 'explicit_protection_months_required' };
  if (!claimWindowDays) return { ok: false as const, error: 'explicit_claim_window_days_required' };
  return {
    ok: true as const,
    protectionMonths,
    claimWindowDays,
    affiliatesScope: String(terms.affiliates_scope || 'contracting_entity_only').slice(0, 240),
  };
}

export function consentCoversProviderIntroduction(
  consent: any,
  input: { brandId: string; providerId: string; nowIso?: string },
) {
  if (!consent || String(consent.status || '') !== 'active') {
    return { ok: false as const, error: 'active_merchant_consent_required' };
  }
  if (String(consent.brand_id || '') !== input.brandId) {
    return { ok: false as const, error: 'consent_brand_mismatch' };
  }
  if (String(consent.counterparty_provider_id || '') !== input.providerId) {
    return { ok: false as const, error: 'provider_specific_consent_required' };
  }
  const purpose = String(consent.purpose || '').toLowerCase();
  const scope = String(consent.scope || '').toLowerCase();
  if (purpose !== 'provider_introduction' && purpose !== 'provider_negotiation' &&
      !scope.includes('provider_introduction') && !scope.includes('provider_negotiation')) {
    return { ok: false as const, error: 'provider_introduction_consent_scope_required' };
  }
  const now = Date.parse(input.nowIso || new Date().toISOString());
  if (consent.expires_at && Date.parse(String(consent.expires_at)) <= now) {
    return { ok: false as const, error: 'merchant_consent_expired' };
  }
  if (!String(consent.consent_text_version || '').trim() || !String(consent.evidence_reference || '').trim()) {
    return { ok: false as const, error: 'consent_evidence_required' };
  }
  return { ok: true as const };
}

export function addCalendarMonthsClamped(iso: string, months: number) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error('invalid_protection_start');
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}

export function providerOpportunityDisclosureDecision(registration: any) {
  const status = String(registration?.status || '');
  return {
    registrationNoticeIdentityAllowed: status === 'PREPARED',
    identifiedNegotiationAllowed: status === 'PROTECTED',
    reason: status === 'PROTECTED'
      ? 'provider_acknowledged_protection'
      : status === 'PREPARED'
      ? 'registration_notice_only'
      : 'merchant_identity_withheld',
  };
}

export function providerOpportunityResponseTransition(input: {
  currentStatus: string;
  response: 'ACKNOWLEDGED' | 'PREEXISTING_CLAIM' | 'REJECTED';
  responseAt: string;
  responseDueAt: string;
  evidenceReference: string;
  preexistingEvidenceReference?: string;
}) {
  if (input.currentStatus !== 'SUBMITTED_PENDING_RESPONSE') {
    return { ok: false as const, error: 'registration_not_awaiting_provider_response' };
  }
  if (!String(input.evidenceReference || '').trim()) {
    return { ok: false as const, error: 'provider_response_evidence_required' };
  }
  const late = Date.parse(input.responseAt) > Date.parse(input.responseDueAt);
  if (input.response === 'ACKNOWLEDGED') {
    return { ok: true as const, status: 'PROTECTED' as const, disclosure: 'NEGOTIATION_ALLOWED' as const, late };
  }
  if (input.response === 'REJECTED') {
    return { ok: true as const, status: 'REJECTED' as const, disclosure: 'WITHHELD' as const, late };
  }
  if (!String(input.preexistingEvidenceReference || '').trim()) {
    return { ok: false as const, error: 'preexisting_relationship_evidence_required' };
  }
  return {
    ok: true as const,
    status: late ? 'DISPUTED' as const : 'PREEXISTING_CLAIMED' as const,
    disclosure: 'WITHHELD' as const,
    late,
  };
}
