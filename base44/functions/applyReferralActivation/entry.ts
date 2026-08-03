// applyReferralActivation — REFERRAL-2 T1 (2026-08-03).
//
// Credits a referrer when the business THEY referred reaches verified AND
// activated savings (Terms §7(c) / §8): increments activated_count by exactly
// one and schedules the referrer's reduced success fee in BillingRule from the
// first day of the following month.
//
// AUTHORITY: admin or INTERNAL_CALL_SECRET only. The caller ASSERTS that the
// referred business's savings are verified and activated — this endpoint never
// infers it. That is deliberate: the decision is a human reconciliation against
// real provider statements, and it moves money.
//
// Payload: { brand_id?, referred_email?, dry_run? }
//   brand_id       — the REFERRED business (preferred; gives a stable key)
//   referred_email — fallback when no Brand row exists yet
//   dry_run        — resolve and report what WOULD happen, changing nothing
//
// Idempotent by construction: a ReferralActivation claim row is created before
// any counter moves, so replaying this call is a no-op (reason 'already_counted').

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { applyReferralActivation } from '../../shared/referralActivation.ts';
import { feeForActivated } from '../../shared/referralProgram.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const { brand_id = null, referred_email = null, dry_run = false } = body || {};
    if (!brand_id && !referred_email) {
      return Response.json({ ok: false, error: 'brand_id or referred_email required' }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    if (dry_run) {
      // Resolve the attribution chain WITHOUT writing anything.
      const brand = brand_id
        ? (await svc.entities.Brand.filter({ id: brand_id }, '-created_date', 1).catch(() => []))?.[0] || null
        : null;
      const emails = [...new Set([referred_email, brand?.contact_email, brand?.created_by]
        .map((e: any) => String(e || '').trim().toLowerCase()).filter(Boolean))];
      let session = null;
      for (const email of emails) {
        const rows = await svc.entities.PaymentsAnalysisSession
          .filter({ contact_email: email }, '-created_date', 25).catch(() => []);
        session = (rows || []).find((r: any) => r?.referred_by_code) || null;
        if (session) break;
      }
      const link = session?.referred_by_code
        ? (await svc.entities.ReferralLink.filter({ code: session.referred_by_code }, 'created_date', 1).catch(() => []))?.[0] || null
        : null;
      const key = brand?.id || emails[0] || null;
      const prior = key
        ? await svc.entities.ReferralActivation.filter({ referred_key: key }, '-created_date', 1).catch(() => [])
        : [];
      return Response.json({
        ok: true,
        dry_run: true,
        referred_key: key,
        referral_code: session?.referred_by_code || null,
        referrer_email: link?.owner_email || null,
        already_counted: (prior?.length || 0) > 0,
        current_activated_count: Number(link?.activated_count) || 0,
        would_become: link ? (Number(link.activated_count) || 0) + 1 : null,
        would_fee_pct: link ? feeForActivated((Number(link.activated_count) || 0) + 1) : null,
      });
    }

    const actor = gate.isAdmin ? (gate.user?.email || 'admin') : 'internal';
    const result = await applyReferralActivation(svc, { brand_id, referred_email, actor });
    return Response.json(result);
  } catch (error) {
    return Response.json({ ok: false, error: (error as any)?.message || 'internal_error' }, { status: 500 });
  }
});