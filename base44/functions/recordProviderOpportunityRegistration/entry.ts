import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  PROVIDER_OPPORTUNITY_PROTECTION_VERSION,
  addCalendarMonthsClamped,
  consentCoversProviderIntroduction,
  providerOpportunityResponseTransition,
  providerProtectionTerms,
} from '../../shared/providerOpportunityProtection.ts';

const text = (value: unknown, max = 500) => String(value || '').trim().slice(0, max);
const addDays = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400000).toISOString();

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return Response.json({ ok: false, error: 'method_not_allowed' }, { status: 405 });
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = text(body.action, 40);
    const now = new Date().toISOString();

    if (action === 'prepare') {
      const brandId = text(body.brand_id, 160);
      const providerId = text(body.provider_id, 160);
      const agreementId = text(body.agreement_id, 160);
      const consentRecordId = text(body.consent_record_id, 160);
      if (!brandId || !providerId || !agreementId || !consentRecordId) {
        return Response.json({ ok: false, error: 'brand_provider_agreement_consent_required' }, { status: 400 });
      }
      const [brand, provider, agreement, consent] = await Promise.all([
        svc.entities.Brand.get(brandId).catch(() => null),
        svc.entities.Provider.get(providerId).catch(() => null),
        svc.entities.DynamicAgreement.get(agreementId).catch(() => null),
        svc.entities.ConsentRecord.get(consentRecordId).catch(() => null),
      ]);
      if (!brand) return Response.json({ ok: false, error: 'brand_not_found' }, { status: 404 });
      if (!provider) return Response.json({ ok: false, error: 'provider_not_found' }, { status: 404 });
      if (!agreement || String(agreement.provider_id || '') !== providerId) {
        return Response.json({ ok: false, error: 'provider_agreement_mismatch' }, { status: 409 });
      }
      const agreementCheck = providerProtectionTerms(agreement);
      if (!agreementCheck.ok) return Response.json({ ok: false, error: agreementCheck.error }, { status: 409 });
      const consentCheck = consentCoversProviderIntroduction(consent, { brandId, providerId, nowIso: now });
      if (!consentCheck.ok) return Response.json({ ok: false, error: consentCheck.error }, { status: 409 });
      const prior = await svc.entities.ProviderOpportunityRegistration.filter(
        { brand_id: brandId, provider_id: providerId, status: { $in: ['PREPARED', 'SUBMITTED_PENDING_RESPONSE', 'PROTECTED'] } },
        '-prepared_at',
        5,
      ).catch(() => []);
      if (prior[0]) return Response.json({ ok: true, duplicate: true, registration: prior[0] });
      const externalReference = `CAMBRA-OPP-${crypto.randomUUID().toUpperCase()}`;
      const registration = await svc.entities.ProviderOpportunityRegistration.create({
        registration_key: `provider-opportunity:${brandId}:${providerId}:${crypto.randomUUID()}`,
        external_reference: externalReference,
        brand_id: brandId,
        provider_id: providerId,
        agreement_id: agreementId,
        consent_record_id: consentRecordId,
        market: text(body.market || brand.billing_country || brand.country, 16),
        channel: text(body.channel, 40),
        status: 'PREPARED',
        merchant_identity_disclosure: 'WITHHELD',
        protection_months: agreementCheck.protectionMonths,
        claim_window_days: agreementCheck.claimWindowDays,
        affiliates_scope: agreementCheck.affiliatesScope,
        prepared_at: now,
        terms_hash: String(agreement.terms_hash),
        protection_version: PROVIDER_OPPORTUNITY_PROTECTION_VERSION,
        prepared_by: String(user.email || user.id || 'admin'),
        updated_by: String(user.email || user.id || 'admin'),
        audit_json: { events: [{ action: 'PREPARED', at: now, by: String(user.email || user.id || 'admin') }] },
      });
      return Response.json({
        ok: true,
        registration_id: registration.id,
        external_reference: externalReference,
        status: registration.status,
        next_action: 'send_registration_notice_then_record_submission',
      });
    }

    const registrationId = text(body.registration_id, 160);
    const registration = registrationId
      ? await svc.entities.ProviderOpportunityRegistration.get(registrationId).catch(() => null)
      : null;
    if (!registration) return Response.json({ ok: false, error: 'registration_not_found' }, { status: 404 });
    const actor = String(user.email || user.id || 'admin');
    const events = Array.isArray(registration.audit_json?.events) ? registration.audit_json.events.slice(-99) : [];

    if (action === 'mark_submitted') {
      if (registration.status !== 'PREPARED') {
        return Response.json({ ok: false, error: 'registration_not_prepared' }, { status: 409 });
      }
      const evidence = text(body.submission_evidence_reference, 1000);
      if (!evidence) return Response.json({ ok: false, error: 'submission_evidence_required' }, { status: 400 });
      const consent = await svc.entities.ConsentRecord.get(registration.consent_record_id).catch(() => null);
      const consentCheck = consentCoversProviderIntroduction(consent, {
        brandId: registration.brand_id,
        providerId: registration.provider_id,
        nowIso: now,
      });
      if (!consentCheck.ok) return Response.json({ ok: false, error: consentCheck.error }, { status: 409 });
      const due = addDays(now, Number(registration.claim_window_days));
      const protectionEnd = addCalendarMonthsClamped(now, Number(registration.protection_months));
      await svc.entities.ProviderOpportunityRegistration.update(registration.id, {
        status: 'SUBMITTED_PENDING_RESPONSE',
        merchant_identity_disclosure: 'REGISTRATION_NOTICE_ONLY',
        submitted_at: now,
        provider_response_due_at: due,
        protection_starts_at: now,
        protection_ends_at: protectionEnd,
        submission_evidence_reference: evidence,
        updated_by: actor,
        audit_json: { events: [...events, { action: 'SUBMITTED', at: now, by: actor, evidence_reference: evidence }] },
      });
      return Response.json({ ok: true, status: 'SUBMITTED_PENDING_RESPONSE', provider_response_due_at: due });
    }

    if (action === 'record_response') {
      const response = text(body.response, 40) as 'ACKNOWLEDGED' | 'PREEXISTING_CLAIM' | 'REJECTED';
      if (!['ACKNOWLEDGED', 'PREEXISTING_CLAIM', 'REJECTED'].includes(response)) {
        return Response.json({ ok: false, error: 'invalid_provider_response' }, { status: 400 });
      }
      const evidence = text(body.provider_response_evidence_reference, 1000);
      const preexistingEvidence = text(body.preexisting_relationship_evidence_reference, 1000);
      const transition = providerOpportunityResponseTransition({
        currentStatus: registration.status,
        response,
        responseAt: now,
        responseDueAt: registration.provider_response_due_at,
        evidenceReference: evidence,
        preexistingEvidenceReference: preexistingEvidence,
      });
      if (!transition.ok) return Response.json({ ok: false, error: transition.error }, { status: 409 });
      await svc.entities.ProviderOpportunityRegistration.update(registration.id, {
        status: transition.status,
        merchant_identity_disclosure: transition.disclosure,
        provider_acknowledged_at: response === 'ACKNOWLEDGED' ? now : undefined,
        provider_response_evidence_reference: evidence,
        preexisting_relationship_evidence_reference: preexistingEvidence || undefined,
        preexisting_relationship_notes: response === 'PREEXISTING_CLAIM' ? text(body.preexisting_relationship_notes, 2000) : undefined,
        updated_by: actor,
        audit_json: { events: [...events, { action: response, at: now, by: actor, evidence_reference: evidence, late: transition.late }] },
      });
      return Response.json({
        ok: true,
        status: transition.status,
        identified_negotiation_allowed: transition.disclosure === 'NEGOTIATION_ALLOWED',
        late_response: transition.late,
      });
    }

    return Response.json({ ok: false, error: 'invalid_action' }, { status: 400 });
  } catch (error) {
    console.error('recordProviderOpportunityRegistration failed', error);
    return Response.json({ ok: false, error: 'provider_opportunity_registration_failed' }, { status: 500 });
  }
});
