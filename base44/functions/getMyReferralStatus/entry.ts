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

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { findOrCreateReferralLink } from '../../shared/referralLink.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const row = await findOrCreateReferralLink(base44.asServiceRole, user.email);

    return Response.json({
      ok: true,
      code: row.code,
      times_used: Number(row.times_used) || 0,
      activated_count: Number(row.activated_count) || 0,
    });
  } catch (error) {
    return Response.json({ error: (error as any)?.message || 'internal_error' }, { status: 500 });
  }
}