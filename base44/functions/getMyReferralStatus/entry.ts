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

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await base44.asServiceRole.entities.ReferralLink
      .filter({ owner_email: user.email }, '-created_date', 1);

    let row = rows?.[0] || null;
    if (!row?.code) {
      const bytes = new Uint8Array(10);
      crypto.getRandomValues(bytes);
      const code = Array.from(bytes).map((b) => (b % 36).toString(36)).join('');
      row = await base44.asServiceRole.entities.ReferralLink.create({
        code,
        owner_email: user.email,
        times_used: 0,
        activated_count: 0,
      });
    }

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