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

    const since = new Date(); since.setFullYear(since.getFullYear()-1);
    const ymSince = `${since.getFullYear()}-${String(since.getMonth()+1).padStart(2,'0')}`;
    const reports = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ brand_id: brandId });
    const last12 = reports.filter(r => r.month >= ymSince);
    const nodeRevenueYearly = last12.reduce((s,r)=> s + Number(r.node_fee || 0), 0);
    const monthlyRevenue = nodeRevenueYearly / 12;

    return Response.json({ brandId, monthlyRevenue, yearlyRevenue: nodeRevenueYearly, share: SHARE });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});