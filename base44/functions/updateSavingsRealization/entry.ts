import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function monthsSince(iso) {
  const start = new Date(iso);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + (now.getDate() >= start.getDate() ? 0 : -1);
  return Math.max(0, months);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId } = await req.json().catch(() => ({}));

    const filter = brandId ? { brand_id: brandId } : {};
    const activations = await base44.asServiceRole.entities.DealActivation.filter(filter);

    let updated = 0;
    for (const a of activations) {
      const estYear = Number(a.estimated_savings_yearly || a.potential_savings_yearly || 0);
      const m = monthsSince(a.activated_at);
      const ramp = Math.min(1, m / 6); // reach full savings after 6 months
      const realizedMonthly = (estYear / 12) * ramp;
      const realizedYearly = realizedMonthly * 12;
      await base44.asServiceRole.entities.DealActivation.update(a.id, {
        realized_savings_monthly: Number(realizedMonthly.toFixed(2)),
        realized_savings_yearly: Number(realizedYearly.toFixed(2)),
        last_updated: new Date().toISOString()
      });
      updated += 1;
    }

    return Response.json({ ok: true, updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});