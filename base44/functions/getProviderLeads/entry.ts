import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { providerId } = await req.json().catch(() => ({}));
    if (!providerId) return Response.json({ error: 'providerId required' }, { status: 400 });

    const activations = await base44.asServiceRole.entities.DealActivation.filter({ provider_id: providerId });

    const leads = [];
    for (const a of activations) {
      const brand = a.brand_id ? (await base44.asServiceRole.entities.Brand.filter({ id: a.brand_id }))[0] : null;
      const inputs = a.brand_id ? await base44.asServiceRole.entities.AnalyzerInput.filter({ brand_id: a.brand_id }, '-created_date', 1) : [];
      const monthlyRevenue = inputs?.[0]?.monthly_revenue || null;
      leads.push({
        brand_id: a.brand_id || null,
        brand_name: brand?.name || null,
        deal_id: a.deal_id,
        deal_name: a.deal_name,
        estimated_savings_yearly: Number(a.estimated_savings_yearly || 0),
        potential_volume_yearly: monthlyRevenue ? Number(monthlyRevenue) * 12 : null,
        activated_at: a.activated_at
      });
    }

    const totals = {
      total_leads: leads.length,
      total_estimated_savings_yearly: leads.reduce((s, l) => s + Number(l.estimated_savings_yearly || 0), 0),
    };

    return Response.json({ providerId, totals, leads });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});