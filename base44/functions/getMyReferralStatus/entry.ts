import { safeBestEffort } from '../../shared/bestEffort.ts';
// getMyReferralStatus — REFERRAL-1 (2026-08-03).
//
// Authenticated read of the caller's OWN referral state for the /Referrals
// page: their opaque code, how many businesses used the link, and how many
// reached verified + activated savings (activated_count) — the only counter
// that moves their success fee.
//
// PRIVACY: returns ONLY aggregate numbers about the caller. It never returns
// who the referred businesses are, their emails, their sales or their savings
// (third-party data). The fee itself is derived client-side from
// activated_count (25% − 5 points per activated referral, floor 5%).
//
// Find-or-create mirrors getMyReferralLink so a merchant landing on
// /Referrals for the first time already has a shareable link.

// REFERRAL-2 T5 (2026-08-03): shares the single find-or-create implementation
// with getMyReferralLink (base44/shared/referralLink.ts) — one row per owner,
// duplicates consolidated with their counters summed.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findOrCreateReferralLink } from '../../shared/referralLink.ts';
import { ensureReferralEntryDiscount, resolveReferralEntryAttribution } from '../../shared/referralEntryDiscount.ts';
import { claimReferralAccountAttribution, validateReferralLink } from '../../shared/referralAccountAttribution.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Public, read-only invite probe. It exposes no owner identity, counters
    // or internal ids, only whether the opaque code can be claimed and the
    // public entry rate. Keeping it on this referral host avoids a new
    // physical Base44 function while preserving an explicit route boundary.
    if (body?.action === 'validate_code') {
      const result = await validateReferralLink(base44.asServiceRole, { code: body.code });
      if (!result.eligible) {
        return Response.json({ ok: true, eligible: false, reason: result.reason });
      }
      return Response.json({
        ok: true,
        eligible: true,
        entry_discount_points: result.entry_discount_points,
        entry_fee_pct: result.entry_fee_pct,
      });
    }

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;

    if (body?.action === 'claim_code') {
      const claim = await claimReferralAccountAttribution(svc, {
        recipientEmail: user.email,
        code: body.code,
        source: body.source,
      });
      if (!claim.ok) {
        return Response.json({
          ok: false,
          error: 'referral_code_not_applied',
          reason: claim.reason,
        });
      }

      const brands = await svc.entities.Brand.filter(
        { created_by: user.email },
        '-created_date',
        2,
      );
      if ((brands || []).length > 1) {
        throw Object.assign(new Error('referral_recipient_brand_ambiguous'), { status: 503 });
      }
      const brand = brands?.[0] || await svc.entities.Brand.create({
        name: String(user.full_name || user.email?.split('@')?.[0] || 'CAMBRA workspace').slice(0, 80),
        contact_email: user.email,
        contact_name: user.full_name || '',
        created_by: user.email,
      });
      const discount = await ensureReferralEntryDiscount(svc, {
        brand,
        recipientEmail: user.email,
        session: null,
      });

      return Response.json({
        ok: true,
        claimed: claim.claimed,
        reused: claim.reused,
        code: claim.code,
        entry_discount_points: claim.entry_discount_points,
        entry_fee_pct: claim.entry_fee_pct,
        billing_applied: discount.applied === true || discount.reused === true,
        billing_pending: false,
      });
    }

    const row = await findOrCreateReferralLink(svc, user.email);
    const activations = await svc.entities.DealActivation.filter({ user_email: user.email }, '-created_date', 50).catch((error:any)=>safeBestEffort(error,{operation:'getMyReferralStatus',fallback:[],severity:'secondary'}));
    const economic = (activations || []).find((a:any) => a.recovery_economics_version || a.economic_right_status === 'active') || null;
    const entry = await resolveReferralEntryAttribution(svc, user.email);
    const registered = await svc.entities.ReferralAccountAttribution.filter(
      { referrer_email: String(user.email || '').trim().toLowerCase(), status: 'active' },
      '-created_date',
      101,
    );
    if ((registered || []).length > 100) {
      throw Object.assign(new Error('referral_registration_count_truncated'), { status: 503 });
    }

    return Response.json({
      ok: true,
      code: row.code,
      times_used: Number(row.times_used) || 0,
      activated_count: Number(row.activated_count) || 0,
      registered_count: (registered || []).length,
      recovery_economics_version: economic?.recovery_economics_version || 'legacy-v1',
      entry_discount_points: entry.eligible ? Number(entry.entry_discount_points) || 0 : 0,
      entry_fee_pct: entry.eligible ? Number(entry.entry_fee_pct) : null,
    });
  } catch (error) {
    return internalErrorResponse(error, 'getMyReferralStatus');
  }
}
