import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { providerId } = await req.json().catch(() => ({}));
    if (!providerId) return Response.json({ error: 'providerId required' }, { status: 400 });

    const provs = await base44.entities.Provider.filter({ id: providerId });
    const provider = provs?.[0];
    if (!provider) return Response.json({ error: 'Provider not found' }, { status: 404 });
    const allowed = (provider.contact_email && provider.contact_email === user.email) || user.role === 'admin';
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const activations = await base44.asServiceRole.entities.DealActivation.filter({ provider_id: providerId });

    const leads = [];
    for (const a of activations) {
      const brand = a.brand_id ? (await base44.asServiceRole.entities.Brand.filter({ id: a.brand_id })).shift() : null;
      const inputs = a.brand_id ? await base44.asServiceRole.entities.AnalyzerInput.filter({ brand_id: a.brand_id }, '-created_date', 1) : [];
      const monthlyRevenue = inputs?.[0]?.monthly_revenue || null;
      leads.push({
        brand_id: a.brand_id || null,
        brand_name: brand?.name || null,
        deal_activation_id: a.id,
        deal_application_id: a.deal_application_id || null,
        catalog_deal_id: a.catalog_deal_id || null,
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