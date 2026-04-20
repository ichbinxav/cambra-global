import { createClientFromRequest } from 'npm:@base44/sdk@0.8.26';

const SHARE = 0.25;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const results = await base44.asServiceRole.entities.AnalyzerResult.list();
    const identifiedYearly = results.reduce((s, r) => s + Number(r.total_savings || 0), 0);

    const activations = await base44.asServiceRole.entities.DealActivation.list();
    const activatedYearly = activations.reduce((s, a) => s + Number(a.estimated_savings_yearly || a.projected_savings_annual || 0), 0);

    const since = new Date(); since.setFullYear(since.getFullYear()-1);
    const ymSince = `${since.getFullYear()}-${String(since.getMonth()+1).padStart(2,'0')}`;
    const reports = await base44.asServiceRole.entities.MonthlySavingsReport.list();
    const last12 = reports.filter(r => r.month >= ymSince);
    const realizedYearly = last12.reduce((s,r)=> s + Number(r.savings || 0), 0);
    const nodeRevenueYearly = last12.reduce((s,r)=> s + Number(r.node_fee || 0), 0);

    return Response.json({
      identified: { yearly: identifiedYearly, monthly: identifiedYearly / 12 },
      activated: { yearly: activatedYearly, monthly: activatedYearly / 12 },
      realized: { yearly: realizedYearly, monthly: realizedYearly / 12 },
      node_revenue: { yearly: nodeRevenueYearly, monthly: nodeRevenueYearly / 12, share: SHARE }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});