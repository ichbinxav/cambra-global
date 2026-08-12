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

// REFERRAL-2 T5 (2026-08-03): the find-or-create was duplicated here and in
// getMyReferralStatus, and two concurrent calls could create two rows for the
// same owner. Both now share base44/shared/referralLink.ts, which also
// consolidates any pre-existing duplicates (counters summed, oldest row wins).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { findOrCreateReferralLink } from '../../shared/referralLink.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const link = await findOrCreateReferralLink(base44.asServiceRole, user.email);
    return Response.json({ ok: true, code: link.code });
  } catch (error) {
    return internalErrorResponse(error, 'getMyReferralLink');
  }
}