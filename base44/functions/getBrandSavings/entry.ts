import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { brandId } = await req.json().catch(() => ({}));
    if (!brandId) return Response.json({ error: 'brandId required' }, { status: 400 });

    // Latest analyzer result for identified savings
    const results = await base44.asServiceRole.entities.AnalyzerResult.filter({ brand_id: brandId }, '-created_date', 1);
    const latestResult = results?.[0] || null;
    const identifiedYearly = Number(latestResult?.total_savings || 0);

    // BrandSavings history
    const savingsRows = await base44.asServiceRole.entities.BrandSavings.filter({ brand_id: brandId }, '-created_date', 100);

    // Deal activations
    const activations = await base44.asServiceRole.entities.DealActivation.filter({ brand_id: brandId });
    const activatedYearly = activations.reduce((s, a) => s + Number(a.estimated_savings_yearly || 0), 0);
    const realizedYearly = activations.reduce((s, a) => s + Number(a.realized_savings_yearly || 0), 0);

    return Response.json({
      brandId,
      identified: { yearly: identifiedYearly, monthly: identifiedYearly / 12 },
      activated: { yearly: activatedYearly, monthly: activatedYearly / 12 },
      realized: { yearly: realizedYearly, monthly: realizedYearly / 12 },
      history: savingsRows
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});