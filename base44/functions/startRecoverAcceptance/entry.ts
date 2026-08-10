// startRecoverAcceptance — RECOVER-1 (2026-08-03).
//
// Creates the Mandate row in 'acceptance_started' when the merchant opens the
// acceptance popup. An 'acceptance_started' row is NOT an authorization: every
// consumer that gates on a live mandate filters status === 'active'.
//
// Idempotent by construction: the claim key is (activation, owner, terms hash), so
// re-opening the popup returns the SAME row, while a popup opened after the fee or
// baseline moved produces a different hash — and therefore a different, honest
// acceptance instead of quietly reusing stale terms.
import { PRODUCT_POLICY } from '../../shared/generated/productPolicy.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveFeePctForMonth } from '../../shared/billingFee.ts';
import { getSuccessFeePct, getFeeDurationMonths } from '../../shared/generated/productPolicy.ts';
import { rejectClientTerms } from '../../shared/contractPolicySnapshot.ts';
import { economicGateDeniedResponse, evaluateRecoverEconomicGate } from '../../shared/eclEconomicGate.ts';
import { ensureRecoverSavingsEvidence, projectRecoverEvidenceBinding } from '../../shared/eclRecoverEvidence.ts';
import {
  ACCEPTABLE_ACTIVATION_STATES,
  MANDATE_DOCUMENT_VERSION,
  acceptanceEvidence,
  buildAcceptanceSnapshot,
  currentMonth,
  findVerifiedBaseline,
  hashSnapshot,
  idempotencyKeyFor,
  resolveOwnedActivation,
} from '../../shared/recoverAcceptance.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // The instant the SERVER validated this session. We cannot know how long ago
    // the user authenticated — accepted platform limitation, documented on the entity.
    const authenticatedAt = new Date().toISOString();

    const body = await req.json().catch(() => ({}));
    if (PRODUCT_POLICY.economicTerms.recoveryEconomicsVersion === 'recover-economics-v2' && PRODUCT_POLICY.economicTerms.recoverEconomicsV2LegalApproved !== true) return Response.json({ error: 'recover_v2_legal_review_required' }, { status: 409 });
    // v61 (Checkpoint C) — the client may never carry economic-term keys. Any
    // attempt to inject fee/share/duration/policy fields rejects the request.
    const termsGuard = rejectClientTerms(body);
    // `=== false`, not `!`: tsconfig.critical.json runs strict:false, where
    // truthiness narrowing does NOT discriminate the union. Same runtime branch.
    if (termsGuard.ok === false) {
      // Destructured INSIDE the guard so the union narrows to its false arm.
      const { keys } = termsGuard;
      return Response.json({ error: 'client_terms_forbidden', keys }, { status: 400 });
    }
    const svc = base44.asServiceRole;

    const owned = await resolveOwnedActivation(svc, user, body?.deal_activation_id);
    if (!owned.ok) return Response.json({ error: owned.error }, { status: owned.status });
    const { activation, ownerEmail, brand } = owned;
    if (brand?.service_status === 'cancelled') return Response.json({ error: 'cambra_service_cancelled' }, { status: 409 });

    if (!ACCEPTABLE_ACTIVATION_STATES.includes(activation.status)) {
      return Response.json({ error: 'activation_not_acceptable', activation_status: activation.status }, { status: 409 });
    }

    const month = currentMonth();
    const baseline = await findVerifiedBaseline(svc, activation);
    if (!baseline) return Response.json({ error: 'no_verified_baseline' }, { status: 409 });

    // ECL P5 — materialize the freshest server-resolved Stripe measurement
    // through the canonical ECL engine before the baseline can enter a Recover
    // acceptance. Opening the modal is NOT an attestation, so recover_proposal
    // is deliberately deferred to acceptRecoverMandate after the merchant ticks
    // the explicit evidence-declaration checkbox.
    const eclNow = new Date().toISOString();
    const materialized = await ensureRecoverSavingsEvidence({
      base44, svc, activation, baseline, ownerEmail, now: eclNow,
    });
    if (materialized.ok === false) {
      return Response.json({ ok: false, error: materialized.code || 'ecl_evidence_materialization_failed' }, { status: 409 });
    }
    const freezeGate = await evaluateRecoverEconomicGate({
      svc, gateName: 'freeze_baseline', brandId: activation.brand_id,
      dealActivationId: activation.id, baseline, now: eclNow,
    });
    if (!freezeGate.allowed) return economicGateDeniedResponse(freezeGate);
    const evidenceBinding = projectRecoverEvidenceBinding(materialized.evidence);
    if (!evidenceBinding) return Response.json({ ok: false, error: 'ecl_evidence_binding_unavailable' }, { status: 409 });

    const fee = await resolveFeePctForMonth(
      svc,
      {
        deal_activation_id: activation.id,
        brand_id: activation.brand_id,
        provider_id: activation.provider_id,
        fallbackPct: activation.node_share_percent ?? getSuccessFeePct(),
      },
      month,
    );

    const snapshot = buildAcceptanceSnapshot({ activation, baseline, fee, month, evidenceBinding, brand });
    const snapshot_hash = await hashSnapshot(snapshot);
    const idempotency_key = idempotencyKeyFor(activation.id, ownerEmail, snapshot_hash);

    // Claim lookup BEFORE any write.
    const claimed = await svc.entities.Mandate.filter({ idempotency_key }, '-created_date', 5).catch(() => []);
    const reusable = (claimed || []).find((m: any) => m.status === 'acceptance_started');
    if (reusable) {
      return Response.json({ ok: true, reused: true, mandate_id: reusable.id, snapshot_hash, fee_pct: Number(fee.pct), acceptance_snapshot: reusable.acceptance_snapshot_json || snapshot, evidence_preview: (reusable.acceptance_snapshot_json || snapshot).ecl_evidence_binding || evidenceBinding });
    }
    const alreadyActive = (claimed || []).find((m: any) => m.status === 'active');
    if (alreadyActive) {
      return Response.json({ ok: true, already_active: true, mandate_id: alreadyActive.id, snapshot_hash, acceptance_snapshot: alreadyActive.acceptance_snapshot_json || snapshot, evidence_preview: (alreadyActive.acceptance_snapshot_json || snapshot).ecl_evidence_binding || evidenceBinding });
    }

    const evidence = acceptanceEvidence(req, authenticatedAt);
    const mandate = await svc.entities.Mandate.create({
      organization_id: activation.brand_id || '',
      brand_id: activation.brand_id || '',
      deal_activation_id: activation.id,
      provider_id: activation.provider_id || '',
      catalog_deal_id: activation.catalog_deal_id || '',
      owner_email: ownerEmail,
      baseline_id: baseline.id,
      vertical: activation.vertical || 'payments',
      scope_type: 'deal_specific',
      authorized_actions_json: {
        recover_margin: true,
        renegotiate_with_provider: true,
        migrate_provider: true,
        success_fee_pct: Number(fee.pct),
        duration_months: getFeeDurationMonths(),
      },
      document_version: MANDATE_DOCUMENT_VERSION,
      status: 'acceptance_started',
      acceptance_started_at: new Date().toISOString(),
      acceptance_snapshot_json: snapshot,
      acceptance_snapshot_hash: snapshot_hash,
      idempotency_key,
      authenticated_at: evidence.authenticated_at,
      ip_address: evidence.ip_address,
      user_agent: evidence.user_agent,
    });

    // Collapse a concurrent double-open: oldest claim wins, ours is dropped.
    const recheck = await svc.entities.Mandate.filter({ idempotency_key }, 'created_date', 5).catch(() => []);
    const winner = (recheck || []).find((m: any) => m.status === 'acceptance_started') || mandate;
    if (winner.id !== mandate.id) {
      await svc.entities.Mandate.delete(mandate.id).catch(() => null);
    }

    return Response.json({
      ok: true,
      mandate_id: winner.id,
      snapshot_hash,
      fee_pct: Number(fee.pct),
      document_version: MANDATE_DOCUMENT_VERSION,
      acceptance_snapshot: snapshot,
      evidence_preview: evidenceBinding,
    });
  } catch (error) {
    console.error('startRecoverAcceptance failed', error);
    return Response.json({ error: 'recover_acceptance_start_failed' }, { status: 500 });
  }
}