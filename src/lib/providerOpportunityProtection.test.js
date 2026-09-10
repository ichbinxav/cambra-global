import { describe, expect, it } from 'vitest';
import {
  addCalendarMonthsClamped,
  consentCoversProviderIntroduction,
  providerOpportunityDisclosureDecision,
  providerOpportunityResponseTransition,
  providerProtectionTerms,
} from '../../base44/shared/providerOpportunityProtection.ts';

describe('provider opportunity protection', () => {
  const agreement = {
    status: 'active',
    contract_document_id: 'doc-1',
    terms_hash: 'hash-1',
    legal_terms_json: { provider_opportunity_protection: {
      opportunity_registration_required: true,
      non_circumvention: true,
      preexisting_relationship_process: true,
      protection_months: 18,
      preexisting_relationship_claim_window_days: 5,
      affiliates_scope: 'named provider group entities',
    } },
  };

  it('fails closed when a signed protection control is absent', () => {
    expect(providerProtectionTerms({ ...agreement, contract_document_id: '' })).toMatchObject({ ok: false, error: 'signed_provider_agreement_evidence_required' });
    expect(providerProtectionTerms({ ...agreement, legal_terms_json: { provider_opportunity_protection: { ...agreement.legal_terms_json.provider_opportunity_protection, non_circumvention: false } } })).toMatchObject({ ok: false, error: 'non_circumvention_clause_required' });
    expect(providerProtectionTerms(agreement)).toMatchObject({ ok: true, protectionMonths: 18, claimWindowDays: 5 });
  });

  it('requires explicit provider-specific merchant consent and evidence', () => {
    const consent = { status: 'active', brand_id: 'brand-1', counterparty_provider_id: 'provider-1', purpose: 'provider_introduction', consent_text_version: 'v1', evidence_reference: 'mandate-1' };
    expect(consentCoversProviderIntroduction(consent, { brandId: 'brand-1', providerId: 'provider-1' })).toEqual({ ok: true });
    expect(consentCoversProviderIntroduction(consent, { brandId: 'brand-1', providerId: 'provider-2' })).toMatchObject({ ok: false, error: 'provider_specific_consent_required' });
  });

  it('allows one registration notice before acknowledgement and identified negotiation only after it', () => {
    expect(providerOpportunityDisclosureDecision({ status: 'PREPARED' })).toMatchObject({ registrationNoticeIdentityAllowed: true, identifiedNegotiationAllowed: false });
    expect(providerOpportunityDisclosureDecision({ status: 'PROTECTED' })).toMatchObject({ identifiedNegotiationAllowed: true });
  });

  it('requires evidence for prior-relationship claims and flags late claims as disputed', () => {
    const base = { currentStatus: 'SUBMITTED_PENDING_RESPONSE', response: 'PREEXISTING_CLAIM', responseAt: '2026-09-20T00:00:00.000Z', responseDueAt: '2026-09-15T00:00:00.000Z', evidenceReference: 'provider-email-1' };
    expect(providerOpportunityResponseTransition(base)).toMatchObject({ ok: false, error: 'preexisting_relationship_evidence_required' });
    expect(providerOpportunityResponseTransition({ ...base, preexistingEvidenceReference: 'crm-evidence-1' })).toMatchObject({ ok: true, status: 'DISPUTED', disclosure: 'WITHHELD', late: true });
  });

  it('uses clamped calendar months for the protection end', () => {
    expect(addCalendarMonthsClamped('2026-08-31T12:00:00.000Z', 18)).toBe('2028-02-29T12:00:00.000Z');
  });
});
