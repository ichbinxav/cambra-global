// referralBilling — REFERRAL-2 T2 (2026-08-03).
//
// Pushes an acquired referral discount into the BILLING system, which is where
// Terms §8 stops being a promise and becomes an amount.
//
// Non-retroactivity is structural, not a convention: the current BillingRule is
// never mutated. It is CLOSED with effective_end_date = last day of the current
// month, and a NEW rule is created with effective_start_date = first day of the
// following month. Reports for earlier months therefore keep resolving to the
// old percentage (see billingFee.resolveFeePctForMonth).
//
// Ratchet: the fee only ever goes DOWN. A rule is never rewritten upwards, so a
// referred business that later terminates cannot claw the discount back —
// exactly what Terms §8 ("a reduction already acquired is never reversed")
// requires. Task 7's "no BillingRule yet" case is covered too: we create the
// first rule so the discount is waiting when billing starts.

import { firstOfNextMonth, lastOfCurrentMonth } from './billingFee.ts';

const DEAD_ACTIVATION_STATUSES = ['closed', 'revoked'];

async function referrerBrands(svc: any, referrerEmail: string): Promise<any[]> {
  const byContact = await svc.entities.Brand.filter({ contact_email: referrerEmail }, '-created_date', 50).catch(() => []);
  const byCreator = await svc.entities.Brand.filter({ created_by: referrerEmail }, '-created_date', 50).catch(() => []);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const b of [...(byContact || []), ...(byCreator || [])]) {
    if (!b?.id || seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
  }
  return out;
}

export async function scheduleReferralFee(
  svc: any,
  { referrerEmail, feePct, activatedCount, now = new Date() }: any,
): Promise<any[]> {
  const startDate = firstOfNextMonth(now);
  const closeDate = lastOfCurrentMonth(now);
  const notes = `referral discount, activated_count=${activatedCount}`;
  const scheduled: any[] = [];

  const brands = await referrerBrands(svc, referrerEmail);
  for (const brand of brands) {
    const activations = (await svc.entities.DealActivation.filter({ brand_id: brand.id }, '-created_date', 50).catch(() => []))
      .filter((a: any) => !DEAD_ACTIVATION_STATUSES.includes(a?.status));

    // No activation yet → seed ONE brand-level rule so the discount is already
    // in place the moment billing starts for this brand (Task 7, case 1).
    const targets = activations.length
      ? activations.map((a: any) => ({ deal_activation_id: a.id, provider_id: a.provider_id || '', currency: 'EUR' }))
      : [{ deal_activation_id: '', provider_id: '', currency: 'EUR' }];

    for (const target of targets) {
      const query = target.deal_activation_id
        ? { deal_activation_id: target.deal_activation_id }
        : { brand_id: brand.id };
      const rules = await svc.entities.BillingRule.filter(query, '-effective_start_date', 25).catch(() => []);
      const live = (rules || []).filter((r: any) => r?.status === 'active');

      // Already scheduled (same fee, same start date) → idempotent no-op.
      const duplicate = live.find((r: any) =>
        Number(r.node_share_percent) === Number(feePct) && r.effective_start_date === startDate);
      if (duplicate) {
        scheduled.push({ brand_id: brand.id, billing_rule_id: duplicate.id, effective_start_date: startDate, reused: true });
        continue;
      }

      // Ratchet guard — never replace a rule that is already cheaper for the merchant.
      const cheaper = live.find((r: any) => Number(r.node_share_percent) <= Number(feePct) && !r.effective_end_date);
      if (cheaper) {
        scheduled.push({ brand_id: brand.id, billing_rule_id: cheaper.id, effective_start_date: cheaper.effective_start_date || null, skipped: 'already_lower_or_equal' });
        continue;
      }

      const current = live.find((r: any) => !r.effective_end_date) || live[0] || null;
      if (current) {
        await svc.entities.BillingRule.update(current.id, { effective_end_date: closeDate }).catch(() => null);
      }

      const created = await svc.entities.BillingRule.create({
        brand_id: brand.id,
        deal_activation_id: target.deal_activation_id || '',
        provider_id: target.provider_id || '',
        billing_model: 'monthly_success_fee',
        node_share_percent: Number(feePct),
        currency: current?.currency || target.currency,
        min_fee: current?.min_fee ?? undefined,
        cap_fee: current?.cap_fee ?? undefined,
        effective_start_date: startDate,
        status: 'active',
        notes,
      });

      scheduled.push({
        brand_id: brand.id,
        deal_activation_id: target.deal_activation_id || null,
        billing_rule_id: created?.id || null,
        closed_rule_id: current?.id || null,
        effective_start_date: startDate,
        node_share_percent: Number(feePct),
      });
    }
  }

  return scheduled;
}