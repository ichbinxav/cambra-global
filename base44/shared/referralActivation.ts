// referralActivation — REFERRAL-2 T1 (2026-08-03).
//
// THE MISSING LINK. REFERRAL-1 created activated_count and never incremented it,
// so every merchant stayed at 25% forever while Terms §8 promised otherwise.
// This module credits a referrer when THEIR referred business reaches verified
// AND activated savings — the same standard as Terms §7(c).
//
// WHERE THE EVENT COMES FROM (declared, not invented): the app has no single
// "savings activated" event today. The closest truthful signals are
//   (a) MonthlySavingsReport reaching verification_status 'verified'/'realized'
//       with savings > 0 — measured against a frozen Baseline, reconciled by
//       CAMBRA, and
//   (b) an admin confirming activation by hand.
// So this module is deliberately TRIGGER-AGNOSTIC: it takes the referred
// business and does the crediting. applyReferralActivation (the function) is
// callable by an admin today and is the single place to wire an automation on
// MonthlySavingsReport later — see Decision_Log_REFERRAL2.md. It NEVER decides
// on its own that savings are verified; the caller asserts that.
//
// IDEMPOTENCY (this decides real money): the ReferralActivation row is CLAIMED
// BEFORE the counter moves. A replayed event finds the claim and stops, so
// activated_count can only ever rise once per referred business.
//
// times_used (link clicks / analyses) is never read here — only activated
// referrals move the fee, exactly as declared in Terms §8.

import { feeForActivated } from './referralProgram.ts';
import { scheduleReferralFee } from './referralBilling.ts';
import { resolveReferralEntryAttribution } from './referralEntryDiscount.ts';
import { readRuntimeRows, requireRuntimeSource } from './runtimeSourceRead.ts';

function lower(v: any): string { return String(v || '').trim().toLowerCase(); }

async function resolveBrand(svc: any, brand_id?: string): Promise<any | null> {
  if (!brand_id) return null;
  const rows=requireRuntimeSource(await readRuntimeRows({source:'referral_activation_brand',read:()=>svc.entities.Brand.filter({ id: brand_id }, '-created_date', 2)}));
  if(rows.length>1)throw Object.assign(new Error('referral_brand_authority_ambiguous'),{status:503});
  return rows[0] || null;
}

// The attribution evidence lives on the referred business's analysis session
// (referred_by_code, written by submitPaymentsAnalysis).
async function findReferralSession(svc: any, emails: string[]): Promise<any | null> {
  for (const email of emails) {
    const rows=requireRuntimeSource(await readRuntimeRows({source:'referral_analysis_sessions',limit:25,read:()=>svc.entities.PaymentsAnalysisSession.filter({ contact_email: email }, '-created_date', 25)}));
    const hit = rows.find((r: any) => r?.referred_by_code);
    if (hit) return hit;
  }
  return null;
}

export async function applyReferralActivation(
  svc: any,
  { brand_id = null, referred_email = null, actor = 'system', now = new Date() }: any = {},
): Promise<any> {
  const brand = await resolveBrand(svc, brand_id);
  const emails = [...new Set([referred_email, brand?.contact_email, brand?.created_by].map(lower).filter(Boolean))];
  if (!emails.length) return { ok: true, applied: false, reason: 'no_referred_identity' };

  const session = await findReferralSession(svc, emails);
  if (!session) return { ok: true, applied: false, reason: 'no_referral' };

  const code = session.referred_by_code;
  const linkRows=requireRuntimeSource(await readRuntimeRows({source:'referral_link_authority',read:()=>svc.entities.ReferralLink.filter({ code }, 'created_date', 2)}));
  if(linkRows.length>1)throw Object.assign(new Error('referral_link_authority_ambiguous'),{status:503});
  const link = linkRows[0] || null;
  if (!link) return { ok: true, applied: false, reason: 'unknown_code' };
  if (emails.includes(lower(link.owner_email))) {
    return { ok: true, applied: false, reason: 'self_referral' };
  }
  const referrerEntry = await resolveReferralEntryAttribution(svc, link.owner_email);
  const entryDiscountPoints = referrerEntry.eligible ? Number(referrerEntry.entry_discount_points) || 0 : 0;

  // ── Idempotency claim ───────────────────────────────────────────────────
  const referred_key = brand?.id || emails[0];
  const prior=requireRuntimeSource(await readRuntimeRows({source:'referral_activation_idempotency',read:()=>svc.entities.ReferralActivation.filter({ referred_key }, '-created_date', 2)}));
  if(prior.length>1)throw Object.assign(new Error('referral_activation_authority_ambiguous'),{status:503});
  if (prior?.length) {
    return {
      ok: true,
      applied: false,
      reason: 'already_counted',
      code,
      activated_count: Number(link.activated_count) || 0,
      fee_pct: feeForActivated(Number(link.activated_count) || 0, entryDiscountPoints),
      entry_discount_points: entryDiscountPoints,
    };
  }

  const activated_count = (Number(link.activated_count) || 0) + 1;
  const fee_pct = feeForActivated(activated_count, entryDiscountPoints);

  const claim = await svc.entities.ReferralActivation.create({
    code,
    referrer_email: link.owner_email,
    referred_key,
    referred_brand_id: brand?.id || '',
    source_session: session.anon_session_id || '',
    activated_at: new Date(now).toISOString(),
    activated_count_after: activated_count,
    applied_fee_pct: fee_pct,
    actor,
  });

  await svc.entities.ReferralLink.update(link.id, { activated_count });

  const scheduled = await scheduleReferralFee(svc, {
    referrerEmail: link.owner_email,
    feePct: fee_pct,
    activatedCount: activated_count,
    now: new Date(now),
  });

  if (claim?.id) {
    await svc.entities.ReferralActivation.update(claim.id, { scheduled_rules_json: { rules: scheduled } });
  }

  return { ok: true, applied: true, code, referrer_email: link.owner_email, activated_count, fee_pct, entry_discount_points: entryDiscountPoints, scheduled };
}
