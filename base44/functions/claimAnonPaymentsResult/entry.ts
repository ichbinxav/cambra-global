import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { sha256 } from '../../shared/intelligenceCore.ts';
import {
  ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE,
  acquireAnonymousPaymentsClaim,
  anonymousPaymentsResultMatches,
  assertAnonymousPaymentsClaimOwned,
  markAnonymousPaymentsClaimRetryable,
  normalizeAnonymousClaimEmail,
  readCanonicalAnonymousPaymentsResult,
  readCanonicalAnonymousPaymentsSnapshot,
  selectAnonymousPaymentsClaimSession,
  transitionAnonymousPaymentsClaim,
} from '../../shared/anonymousPaymentsClaim.ts';
// DPA-1 (2026-08-16) — legal acceptance evidence. Hosted here as an ACTION
// (logical route `recordLegalAcceptance`, see base44/deployment-topology.json)
// because R5 forbids new physical function directories: the plan is sealed at
// 276. This is the right host on the merits too — this endpoint is the point
// where an anonymous visitor materialises into an account holder (it creates
// the Brand), i.e. the registration moment the acceptance belongs to.
import {
  buildLegalAcceptanceRecord,
  coversCurrentVersions,
  validateLegalAcceptance,
} from '../../shared/legalAcceptance.ts';

// The PaymentsAnalysisSession CAS claim is the only ownership authority and
// is acquired before any Brand, AnalyzerResult or snapshot materialization.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function blocked() {
  return Response.json(ANONYMOUS_PAYMENTS_BLOCKED_RESPONSE, { status: 404 });
}

function internalError() {
  return Response.json({ ok: false, error: 'claim_temporarily_unavailable' }, { status: 503 });
}

function readAnnualRange(engineResult: any): { lo: number; point: number; hi: number } {
  const annual = engineResult?.annual_savings_eur || {};
  const number = (value: any) => isFinite(Number(value)) ? Number(value) : 0;
  return { lo: number(annual.lo), point: number(annual.point), hi: number(annual.hi) };
}

function claimResponse(session: any, claimed: boolean) {
  return Response.json({
    ok: true,
    claimed,
    analyzer_result_id: session.claim_analyzer_result_id,
    brand_id: session.claim_brand_id,
  });
}

Deno.serve(async (req) => {
  let service: any = null;
  let durableClaim: any = null;
  try {
    const base44 = createClientFromRequest(req);
    service = base44.asServiceRole;
    let user: any;
    try {
      user = await base44.auth.me();
    } catch (error) {
      console.error(JSON.stringify({
        event: 'anonymous_claim_auth_authority_unavailable',
        error_name: error instanceof Error ? error.name : typeof error,
      }));
      return internalError();
    }
    const userEmail = normalizeAnonymousClaimEmail(user?.email);
    if (!userEmail) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any;
    try {
      body = await req.json();
    } catch (error) {
      console.warn(JSON.stringify({
        event: 'anonymous_claim_request_invalid',
        error_name: error instanceof Error ? error.name : typeof error,
      }));
      return blocked();
    }
    // ── DPA-1 — logical route `recordLegalAcceptance` ────────────────────
    // Distinct action, distinct contract: it never touches an anonymous
    // session. Errors are explicit (not the claim's deliberately opaque 404)
    // because the caller is an authenticated user who must be able to act on
    // the failure — and because the acceptance gate FAILS CLOSED: if this
    // returns anything but ok, the UI blocks and shows the error instead of
    // letting the user into an app they have not accepted the terms for.
    if (body?.action === 'record_legal_acceptance') {
      const validated = validateLegalAcceptance(body);
      if (!validated.ok) {
        return Response.json({ ok: false, error: validated.error, expected: validated.expected ?? null }, { status: 400 });
      }
      // Idempotency: re-accepting the same versions is a no-op, not a
      // duplicate legal record.
      const existing = await service.entities.LegalAcceptance.filter(
        { user_email: userEmail },
        '-accepted_at',
        10,
      ).catch((error: any) => safeBestEffort(error, {
        operation: 'claimAnonPaymentsResult:record_legal_acceptance',
        fallback: null,
        severity: 'critical',
      }));
      if (!Array.isArray(existing)) {
        // Authority unavailable — never report an acceptance we cannot verify.
        return Response.json({ ok: false, error: 'legal_acceptance_unavailable' }, { status: 503 });
      }
      const already = existing.find((row: any) => coversCurrentVersions(row));
      if (already) {
        return Response.json({ ok: true, already_accepted: true, acceptance_id: already.id });
      }
      // brand_id is optional evidence (acceptance can legitimately precede
      // brand creation), so a lookup failure degrades the record rather than
      // failing it — but it is still reported, never swallowed.
      const brands = await service.entities.Brand
        .filter({ created_by: userEmail }, '-created_date', 1)
        .catch((error: any) => safeBestEffort(error, {
          operation: 'claimAnonPaymentsResult:record_legal_acceptance',
          fallback: [],
          severity: 'secondary',
        }));
      const record = buildLegalAcceptanceRecord({
        user_email: userEmail,
        accepted_at: new Date().toISOString(),
        terms_version: validated.terms_version,
        dpa_version: validated.dpa_version,
        locale: validated.locale,
        // Observed server-side. Never read from the request body.
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: req.headers.get('user-agent'),
        brand_id: Array.isArray(brands) && brands[0]?.id ? brands[0].id : null,
      });
      let created: any = null;
      try {
        created = await service.entities.LegalAcceptance.create(record);
      } catch (error) {
        console.error(JSON.stringify({
          event: 'legal_acceptance_persist_failed',
          error_name: error instanceof Error ? error.name : typeof error,
        }));
        created = null;
      }
      if (!created?.id) {
        // FAIL CLOSED. A "phantom acceptance" — the user believing they
        // accepted while no evidence exists — is the exact failure this whole
        // feature is meant to prevent.
        return Response.json({ ok: false, error: 'legal_acceptance_not_persisted' }, { status: 503 });
      }
      return Response.json({ ok: true, already_accepted: false, acceptance_id: created.id });
    }

    const anonymousSessionId = body?.anon_session_id || body?.session_id || null;
    if (typeof anonymousSessionId !== 'string' || !UUID_V4.test(anonymousSessionId)) {
      return blocked();
    }

    const sessions = await service.entities.PaymentsAnalysisSession.filter(
      { anon_session_id: anonymousSessionId },
      '-created_date',
      2,
    );
    // Missing, ambiguous, wrong-email and incomplete sessions share one exact
    // non-enumerable response contract.
    const eligibility = selectAnonymousPaymentsClaimSession(sessions, userEmail);
    if (!eligibility.eligible) return blocked();
    let session = eligibility.session;

    const acquisition = await acquireAnonymousPaymentsClaim(service, session, {
      authenticated_email: userEmail,
    });
    if (!acquisition.claim) return blocked();
    durableClaim = acquisition.claim;
    session = acquisition.session;

    if (durableClaim.state === 'COMPLETED') {
      const completedResult = await readCanonicalAnonymousPaymentsResult(service, session, durableClaim);
      const completedSnapshot = completedResult
        ? await readCanonicalAnonymousPaymentsSnapshot(service, session, durableClaim, completedResult)
        : null;
      if (!completedResult || !completedSnapshot) {
        throw new Error('anonymous_claim_completed_binding_missing');
      }
      return claimResponse(session, false);
    }

    if (durableClaim.state === 'MATERIALIZING') {
      if (!acquisition.materialization_stale) return internalError();
      const recovered = await transitionAnonymousPaymentsClaim(service, durableClaim, {
        from: 'MATERIALIZING',
        to: 'RECONCILE_REQUIRED',
        patch: { claim_error_code: 'stale_materialization_lease_recovered' },
      });
      if (!recovered.ok) return internalError();
      durableClaim = recovered.claim;
      session = recovered.session;
    }

    if (['CLAIMED', 'RECONCILE_REQUIRED'].includes(durableClaim.state)) {
      const transition = await transitionAnonymousPaymentsClaim(service, durableClaim, {
        from: durableClaim.state,
        to: 'MATERIALIZING',
        patch: { claim_error_code: '' },
      });
      if (!transition.ok) return internalError();
      durableClaim = transition.claim;
      session = transition.session;
    }
    if (durableClaim.state !== 'MATERIALIZING') return internalError();

    await assertAnonymousPaymentsClaimOwned(service, durableClaim);
    let result = await readCanonicalAnonymousPaymentsResult(service, session, durableClaim);
    let brand: any = null;
    if (session.claim_brand_id) {
      brand = await service.entities.Brand.get(String(session.claim_brand_id));
      if (
        !brand?.id ||
        normalizeAnonymousClaimEmail(brand.created_by) !== userEmail ||
        normalizeAnonymousClaimEmail(brand.contact_email) !== userEmail
      ) throw new Error('anonymous_claim_brand_binding_mismatch');
    }
    if (!brand && result?.brand_id) {
      brand = await service.entities.Brand.get(String(result.brand_id));
      if (!brand?.id || normalizeAnonymousClaimEmail(brand.created_by) !== userEmail) {
        throw new Error('anonymous_claim_result_brand_tenant_mismatch');
      }
    }
    if (!brand) {
      const ownedBrands = await base44.entities.Brand.filter(
        { contact_email: userEmail },
        '-created_date',
        2,
      );
      if (!Array.isArray(ownedBrands) || ownedBrands.length > 1) {
        throw new Error('anonymous_claim_brand_authority_ambiguous');
      }
      brand = ownedBrands[0] || await base44.entities.Brand.create({
        name: typeof session.input_snapshot?.brand_name === 'string' && session.input_snapshot.brand_name.trim()
          ? session.input_snapshot.brand_name.trim()
          : 'My brand',
        contact_email: userEmail,
        contact_name: user.full_name || undefined,
        website: typeof session.input_snapshot?.website === 'string'
          ? session.input_snapshot.website
          : undefined,
        country: typeof session.input_snapshot?.country === 'string'
          ? session.input_snapshot.country
          : undefined,
        category: typeof session.input_snapshot?.sector === 'string'
          ? session.input_snapshot.sector
          : undefined,
        locale: typeof session.locale === 'string' ? session.locale : undefined,
      });
      if (!brand?.id || normalizeAnonymousClaimEmail(brand.created_by) !== userEmail) {
        throw new Error('anonymous_claim_brand_tenant_mismatch');
      }
    }

    if (!session.claim_brand_id) {
      const bound = await transitionAnonymousPaymentsClaim(service, durableClaim, {
        from: 'MATERIALIZING',
        to: 'MATERIALIZING',
        patch: { claim_brand_id: String(brand.id) },
      });
      if (!bound.ok) return internalError();
      durableClaim = bound.claim;
      session = bound.session;
    }
    if (String(session.claim_brand_id || '') !== String(brand.id)) {
      throw new Error('anonymous_claim_brand_fence_lost');
    }

    await assertAnonymousPaymentsClaimOwned(service, durableClaim);
    if (!result) {
      const engineResult = session.engine_result;
      const engineVersion = session.engine_version || engineResult.engine_version || null;
      const inputSnapshot = session.input_snapshot || {};
      const range = readAnnualRange(engineResult);
      result = await base44.entities.AnalyzerResult.create({
        brand_id: brand.id,
        anon_session_id: anonymousSessionId,
        anonymous_claim_session_id: String(session.id),
        anonymous_claim_token: String(durableClaim.token),
        anonymous_claim_revision: Number(durableClaim.revision),
        anonymous_claim_owner: userEmail,
        was_anonymous: true,
        verification_status: 'estimated',
        savings_model_version: engineVersion || undefined,
        score_engine_version: engineVersion || undefined,
        total_savings: range.point,
        payment_savings: range.point,
        // FX-2 (2026-08-16) — the gap engine is EUR-only; non-EUR merchant
        // input was converted at the submit boundary. Explicit, never default.
        currency: 'EUR',
        assumptions: Array.isArray(engineResult.assumptions) ? engineResult.assumptions : [],
        methodology: 'Materialized from anonymous payments analysis (estimated). Connect your PSP to verify.',
        confidence_level: 'medium',
        benchmark_source: 'provider_published',
        details: {
          details_shape: 'payments-v1',
          savings_range: range,
          engine_result: engineResult,
          engine_version: engineVersion,
          cohort: engineResult.cohort || null,
          input_snapshot: {
            monthly_gmv_eur: inputSnapshot.monthly_gmv_eur ?? null,
            avg_ticket_eur: inputSnapshot.avg_ticket_eur ?? null,
            provider_slug: inputSnapshot.provider_slug ?? null,
            country: inputSnapshot.country ?? null,
          },
        },
      });
      if (!anonymousPaymentsResultMatches(result, session, durableClaim)) {
        throw new Error('anonymous_claim_created_result_binding_mismatch');
      }
    }

    if (!session.claim_analyzer_result_id) {
      const bound = await transitionAnonymousPaymentsClaim(service, durableClaim, {
        from: 'MATERIALIZING',
        to: 'MATERIALIZING',
        patch: { claim_analyzer_result_id: String(result.id) },
      });
      if (!bound.ok) return internalError();
      durableClaim = bound.claim;
      session = bound.session;
    }
    if (!anonymousPaymentsResultMatches(result, session, durableClaim)) {
      throw new Error('anonymous_claim_result_fence_lost');
    }

    await assertAnonymousPaymentsClaimOwned(service, durableClaim);
    let intelligenceSnapshot = await readCanonicalAnonymousPaymentsSnapshot(service, session, durableClaim, result);
    if (!intelligenceSnapshot) {
      const engineResult = session.engine_result;
      const engineVersion = session.engine_version || engineResult.engine_version || null;
      const inputSnapshot = session.input_snapshot || {};
      const snapshotPayload = {
        engine_version: engineVersion,
        cohort: engineResult.cohort || null,
        input_snapshot: {
          monthly_gmv_eur: inputSnapshot.monthly_gmv_eur ?? null,
          avg_ticket_eur: inputSnapshot.avg_ticket_eur ?? null,
          provider_slug: inputSnapshot.provider_slug ?? null,
          country: inputSnapshot.country ?? null,
        },
        assumptions: Array.isArray(engineResult.assumptions) ? engineResult.assumptions : [],
        source: 'anonymous_estimated',
        claim_session_id: String(session.id),
        claim_owner: userEmail,
      };
      const snapshotHash = await sha256(snapshotPayload);
      intelligenceSnapshot = await service.entities.IntelligenceSnapshot.create({
        snapshot_key: `analyzer-claim:${session.id}:${durableClaim.token}`,
        snapshot_type: 'analyzer_result',
        related_entity_type: 'AnalyzerResult',
        related_entity_id: result.id,
        brand_id: brand.id,
        vertical: 'payments',
        anonymous_claim_session_id: String(session.id),
        anonymous_claim_token: String(durableClaim.token),
        anonymous_claim_owner: userEmail,
        claim_ids: [String(session.id)],
        pricing_version_ids: [],
        benchmark_refs_json: { cohort: engineResult.cohort || null },
        calculation_version: engineVersion || undefined,
        snapshot_json: snapshotPayload,
        snapshot_hash: snapshotHash,
        captured_at: new Date().toISOString(),
      });
      if (
        !intelligenceSnapshot?.id ||
        String(intelligenceSnapshot.related_entity_id) !== String(result.id) ||
        String(intelligenceSnapshot.brand_id) !== String(brand.id)
      ) throw new Error('anonymous_claim_snapshot_tenant_mismatch');
    }

    if (!session.claim_intelligence_snapshot_id) {
      const bound = await transitionAnonymousPaymentsClaim(service, durableClaim, {
        from: 'MATERIALIZING',
        to: 'MATERIALIZING',
        patch: { claim_intelligence_snapshot_id: String(intelligenceSnapshot.id) },
      });
      if (!bound.ok) return internalError();
      durableClaim = bound.claim;
      session = bound.session;
    }
    if (String(session.claim_intelligence_snapshot_id || '') !== String(intelligenceSnapshot.id)) {
      throw new Error('anonymous_claim_snapshot_fence_lost');
    }
    if (String(result.intelligence_snapshot_id || '') !== String(intelligenceSnapshot.id)) {
      await assertAnonymousPaymentsClaimOwned(service, durableClaim);
      result = await base44.entities.AnalyzerResult.update(result.id, {
        intelligence_snapshot_id: intelligenceSnapshot.id,
      });
      if (!anonymousPaymentsResultMatches(result, session, durableClaim)) {
        throw new Error('anonymous_claim_result_snapshot_binding_lost');
      }
    }

    const completed = await transitionAnonymousPaymentsClaim(service, durableClaim, {
      from: 'MATERIALIZING',
      to: 'COMPLETED',
      patch: { claim_error_code: '' },
    });
    if (!completed.ok) return internalError();
    return claimResponse(completed.session, acquisition.acquired === true);
  } catch (error) {
    console.error('claimAnonPaymentsResult:', (error as any)?.message);
    if (service && durableClaim && durableClaim.state !== 'COMPLETED') {
      try {
        await markAnonymousPaymentsClaimRetryable(
          service,
          durableClaim,
          (error as any)?.code || (error as any)?.message || 'materialization_failed',
        );
      } catch (reconciliationError) {
        console.error(JSON.stringify({
          event: 'anonymous_claim_reconciliation_persist_failed',
          claim_session_id: durableClaim.session_id || null,
          error_name: reconciliationError instanceof Error ? reconciliationError.name : typeof reconciliationError,
        }));
      }
    }
    return internalError();
  }
});
