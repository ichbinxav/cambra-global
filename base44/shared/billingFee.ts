// billingFee — REFERRAL-2 T2 (2026-08-03).
//
// Resolves the success-fee percentage that applies to a GIVEN MONTH, honouring
// BillingRule.effective_start_date / effective_end_date. This is what makes
// Terms §8's non-retroactivity real: a referral activated in August lowers the
// fee from 1 September, so the August report must still be measured at the old
// percentage even though it is generated in September.
//
// Before this module, generateMonthlySavingsReport read the LIVE
// DealActivation.node_share_percent, which has no date window at all — any
// discount would have silently applied to past months, and any BillingRule
// would have been ignored entirely.

import { getSuccessFeePct } from './generated/productPolicy.ts';
import { requireCriticalOperation } from './criticalExecution.ts';

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = String(month).split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

export function firstOfNextMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 0-indexed → next month
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}

export function lastOfCurrentMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return d.toISOString().slice(0, 10);
}

function appliesTo(rule: any, bounds: { start: string; end: string }): boolean {
  if (rule?.status === 'archived' || rule?.status === 'inactive') return false;
  const from = rule?.effective_start_date || null;
  const to = rule?.effective_end_date || null;
  if (from && from > bounds.end) return false;   // starts after the month ends
  if (to && to < bounds.start) return false;     // ended before the month began
  return true;
}

/**
 * Fee percentage for one month.
 * Picks the applicable BillingRule with the LATEST effective_start_date;
 * falls back to `fallbackPct` (historically DealActivation.node_share_percent)
 * when the brand has no rule yet — Task 7's "no BillingRule" case.
 */
export async function resolveFeePctForMonth(
  svc: any,
  { deal_activation_id, brand_id, provider_id, fallbackPct = getSuccessFeePct() }: any,
  month: string,
): Promise<{ pct: number; rule_id: string | null; source: string }> {
  const bounds = monthBounds(month);
  const queries: any[] = [];
  if (deal_activation_id) queries.push({ deal_activation_id });
  if (brand_id && provider_id) queries.push({ brand_id, provider_id });
  if (brand_id) queries.push({ brand_id });

  for (const q of queries) {
    const rules = await requireCriticalOperation(
      'billing_rule_authority_read',
      () => svc.entities.BillingRule.filter(q, '-effective_start_date', 25),
    );
    const applicable = (rules || []).filter((r: any) => appliesTo(r, bounds));
    if (applicable.length) {
      const winner = applicable.reduce((best: any, r: any) =>
        String(r.effective_start_date || '') > String(best.effective_start_date || '') ? r : best);
      return {
        pct: Number(winner.node_share_percent ?? fallbackPct),
        rule_id: winner.id || null,
        source: 'billing_rule',
      };
    }
  }

  return { pct: Number(fallbackPct ?? getSuccessFeePct()), rule_id: null, source: 'deal_activation_fallback' };
}
