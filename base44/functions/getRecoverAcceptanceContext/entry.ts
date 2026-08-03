// getRecoverAcceptanceContext — RECOVER-1 (2026-08-03).
//
// READ-ONLY. Everything the acceptance popup needs: is this merchant eligible,
// at what success fee, against which verified baseline, and the exact terms hash
// that startRecoverAcceptance / acceptRecoverMandate will re-verify.
//
// Uses the service role for Baseline and BillingRule ONLY: both are admin-RLS, so
// the merchant cannot read their own rows directly. Ownership is proven first, and
// the verified-baseline criterion is applied inside the shared module before
// anything leaves this function — Baseline's RLS stays untouched by design.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveFeePctForMonth } from '../../shared/billingFee.ts';
import {
  ACCEPTABLE_ACTIVATION_STATES,
  MANDATE_DOCUMENT_VERSION,
  buildAcceptanceSnapshot,
  currentMonth,
  findVerifiedBaseline,
  hashSnapshot,
  resolveOwnedActivation,
} from '../../shared/recoverAcceptance.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;

    const owned = await resolveOwnedActivation(svc, user, body?.deal_activation_id);
    if (!owned.ok) return Response.json({ error: owned.error }, { status: owned.status });
    const { activation, ownerEmail } = owned;

    const month = currentMonth();
    const baseline = await findVerifiedBaseline(svc, activation);
    const fee = await resolveFeePctForMonth(
      svc,
      {
        deal_activation_id: activation.id,
        brand_id: activation.brand_id,
        provider_id: activation.provider_id,
        fallbackPct: activation.node_share_percent ?? 25,
      },
      month,
    );

    const existingMandates = await svc.entities.Mandate
      .filter({ deal_activation_id: activation.id }, '-created_date', 25)
      .catch(() => []);
    const activeMandate = (existingMandates || []).find((m: any) => m.status === 'active') || null;
    const pending = (existingMandates || []).find(
      (m: any) => m.status === 'acceptance_started' && String(m.owner_email || '').toLowerCase() === ownerEmail,
    ) || null;

    const blockers: string[] = [];
    if (!baseline) blockers.push('no_verified_baseline');
    if (!ACCEPTABLE_ACTIVATION_STATES.includes(activation.status)) blockers.push(`activation_status:${activation.status}`);
    if (activeMandate) blockers.push('mandate_already_active');

    const snapshot = buildAcceptanceSnapshot({ activation, baseline, fee, month });
    const snapshot_hash = await hashSnapshot(snapshot);

    return Response.json({
      ok: true,
      eligible: blockers.length === 0,
      blockers,
      document_version: MANDATE_DOCUMENT_VERSION,
      organization_id: activation.brand_id || '',
      deal_activation_id: activation.id,
      activation_status: activation.status,
      fee_pct: Number(fee.pct),
      month,
      baseline: baseline
        ? {
            id: baseline.id,
            baseline_type: baseline.baseline_type,
            baseline_value: baseline.baseline_value,
            currency: baseline.currency || 'EUR',
            verified_at: baseline.verified_at,
          }
        : null,
      snapshot,
      snapshot_hash,
      pending_mandate_id: pending?.id || null,
      active_mandate_id: activeMandate?.id || null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}