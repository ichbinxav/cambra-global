import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

const SHARE = 0.25;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId } = await req.json().catch(() => ({}));
    if (!brandId) return Response.json({ error: 'brandId required' }, { status: 400 });

    const brands = await base44.entities.Brand.filter({ id: brandId });
    const brand = brands?.[0];
    if (!brand) return Response.json({ error: 'Brand not found' }, { status: 404 });
    const allowed = brand.created_by === user.email || user.role === 'admin';
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const activations = await base44.asServiceRole.entities.DealActivation.filter({ brand_id: brandId });
    const realizedYearly = activations.reduce((s, a) => s + Number(a.realized_savings_yearly || 0), 0);

    const yearlyRevenue = realizedYearly * SHARE;
    const monthlyRevenue = yearlyRevenue / 12;

    return Response.json({ brandId, monthlyRevenue, yearlyRevenue, share: SHARE });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});