import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * updateSavingsRealization
 *
 * Recomputes realized_savings_monthly / realized_savings_yearly on every
 * DealActivation for a given brand from real MonthlySavingsReport data.
 * No mathematical ramp — sums actual measured savings from last 12 months.
 *
 * Admin-only. brand_id required.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { brandId } = await req.json().catch(() => ({}));
    if (!brandId) return Response.json({ error: 'brand_id is required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const activations = await svc.entities.DealActivation.filter({ brand_id: brandId });

    // Build 12-month window cutoff (YYYY-MM)
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const ymSince = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}`;

    let updated = 0;
    let totalRealizedYearly = 0;

    for (const a of activations) {
      const reports = await svc.entities.MonthlySavingsReport
        .filter({ deal_activation_id: a.id }).catch(() => []);
      const valid = reports.filter(r => r.status !== 'void' && r.month >= ymSince);
      const realizedYearly = valid.reduce((s, r) => s + Number(r.savings || 0), 0);
      const realizedMonthly = realizedYearly / 12;

      await svc.entities.DealActivation.update(a.id, {
        realized_savings_monthly: Number(realizedMonthly.toFixed(2)),
        realized_savings_yearly: Number(realizedYearly.toFixed(2)),
        last_updated: new Date().toISOString(),
      });
      totalRealizedYearly += realizedYearly;
      updated += 1;
    }

    return Response.json({ ok: true, updated, total_realized_yearly: Number(totalRealizedYearly.toFixed(2)) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});