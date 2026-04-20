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
    const activatedYearly = activations.reduce((s, a) => s + Number(a.estimated_savings_yearly || 0), 0);
    const realizedYearly = activations.reduce((s, a) => s + Number(a.realized_savings_yearly || 0), 0);

    return Response.json({
      identified: { yearly: identifiedYearly, monthly: identifiedYearly / 12 },
      activated: { yearly: activatedYearly, monthly: activatedYearly / 12 },
      realized: { yearly: realizedYearly, monthly: realizedYearly / 12 },
      node_revenue: { yearly: realizedYearly * SHARE, monthly: (realizedYearly * SHARE) / 12, share: SHARE }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});