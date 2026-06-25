import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * monthlySavingsJob
 *
 * Iterates all live DealActivations and invokes generateMonthlySavingsReport
 * to produce a MonthlySavingsReport for the previous month per brand.
 *
 * Replaces the prior mathematical-ramp logic. Real measurement only.
 */

const ACTIVE_DEAL_STATUSES = ['live', 'authorized', 'migrating', 'monetizing'];

function prevMonthYM() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    let isServiceRole = false;
    let user = null;
    try { user = await base44.auth.me(); } catch (_) { isServiceRole = true; }
    if (!isServiceRole && (!user || user.role !== 'admin')) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const month = prevMonthYM();
    const deals = await base44.asServiceRole.entities.DealActivation.list('-activated_at', 1000).catch(() => []);
    const liveDeals = deals.filter(d => ACTIVE_DEAL_STATUSES.includes(d.status));

    // Group by brand (one report-run per brand handles all its verticals)
    const brandIds = Array.from(new Set(liveDeals.map(d => d.brand_id).filter(Boolean)));

    let processed = 0;
    let skipped = 0;
    const errors = [];
    const results = [];

    for (const brand_id of brandIds) {
      try {
        const res = await base44.functions.invoke('generateMonthlySavingsReport', { brand_id, month });
        const payload = res?.data || res;
        if (payload?.ok && Array.isArray(payload.reports)) {
          processed += payload.reports.length;
          skipped += (payload.errors || []).length;
          results.push({ brand_id, reports: payload.reports.length, errors: (payload.errors || []).length });
        } else {
          skipped += 1;
          errors.push({ brand_id, reason: payload?.reason || payload?.error || 'unknown' });
        }
      } catch (e) {
        errors.push({ brand_id, reason: e.message || String(e) });
      }
      await sleep(200);
    }

    return Response.json({ ok: true, month, brands: brandIds.length, processed, skipped, errors, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});