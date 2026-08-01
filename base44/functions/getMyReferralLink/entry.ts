// getMyReferralLink — GROWTH-1 T2 (2026-08-01).
//
// Authenticated find-or-create of the caller's invite link. One ReferralLink
// row per owner_email; the code is an OPAQUE random token (crypto RNG),
// deliberately NOT derivable from the email or any brand id — a leaked code
// reveals nothing about its owner.
//
// The frontend builds the invite URL as `${origin}/Analyzer?ref=<code>`.
// Attribution happens in submitPaymentsAnalysis (referred_by_code on the
// session + times_used increment). NO reward mechanics in this chunk.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const existing = await base44.asServiceRole.entities.ReferralLink
      .filter({ owner_email: user.email }, '-created_date', 1);
    if (existing?.[0]?.code) {
      return Response.json({ ok: true, code: existing[0].code });
    }

    // 10 lowercase base36 chars from crypto RNG (~51 bits) — opaque, ample
    // for our volume, and short enough for a clean WhatsApp URL.
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes).map((b) => (b % 36).toString(36)).join('');

    await base44.asServiceRole.entities.ReferralLink.create({
      code,
      owner_email: user.email,
      times_used: 0,
    });

    return Response.json({ ok: true, code });
  } catch (error) {
    return Response.json({ error: (error as any)?.message || 'internal_error' }, { status: 500 });
  }
}