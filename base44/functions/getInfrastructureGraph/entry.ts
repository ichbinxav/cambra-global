import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M6 — getInfrastructureGraph
 *
 * Returns the full infrastructure graph for a brand:
 *   { ok, nodes, edges, summary }
 *
 * Payment nodes are enriched with benchmark comparison + savings_opportunity.
 * Auth: caller must own the brand (admin bypass). No cross-tenant data.
 */

// Inline copy of getBenchmarkForReport tier logic — light dependency-free lookup
function tierFromMonthlyVolume(monthlyVolume) {
  const annual = (monthlyVolume || 0) * 12;
  if (annual < 250_000) return 'micro';
  if (annual < 1_500_000) return 'small';
  if (annual < 10_000_000) return 'mid';
  return 'large';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let { brand_id } = body;

    // Fallback: caller's latest brand
    if (!brand_id) {
      const brands = await base44.entities.Brand.list('-created_date', 1).catch(() => []);
      brand_id = brands[0]?.id || null;
    }
    if (!brand_id) {
      return Response.json({ ok: true, nodes: [], edges: [], summary: emptySummary() });
    }

    // Ownership (admin bypass)
    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const owned = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
      if (!owned.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const svc = base44.asServiceRole;
    const [nodes, edges, brand, stripeConns] = await Promise.all([
      svc.entities.InfrastructureNode.filter({ brand_id }).catch(() => []),
      svc.entities.InfrastructureEdge.filter({ brand_id }).catch(() => []),
      svc.entities.Brand.filter({ id: brand_id }).catch(() => []),
      svc.entities.StripeConnection.filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1).catch(() => []),
    ]);

    const country = brand[0]?.country || 'unknown';
    const monthlyVolume = stripeConns[0]?.monthly_volume || 0;
    const tier = tierFromMonthlyVolume(monthlyVolume);

    // Enrich payment nodes with benchmark comparison
    let totalSavings = 0;
    const enrichedNodes = await Promise.all(nodes.map(async (n) => {
      if (n.node_type === 'payment_provider' && Number(n.effective_rate || 0) > 0) {
        try {
          const benchRes = await svc.functions.invoke('getBenchmarkForReport', {
            vertical:     'payments',
            revenue_tier: tier,
            country,
          });
          const bench = benchRes?.data || benchRes;
          const median = Number(bench?.median || 0);
          let savings = null;
          if (median > 0 && monthlyVolume > 0 && n.effective_rate > median) {
            const gapPct = (n.effective_rate - median) / 100;
            savings = Math.round(gapPct * monthlyVolume * 12);
            totalSavings += savings;
          }
          return {
            ...n,
            benchmark: {
              median,
              confidence: bench?.confidence || 'static',
              source:     bench?.source || 'static',
              n:          bench?.n || 0,
            },
            savings_opportunity: savings,
          };
        } catch (_) {
          return { ...n, benchmark: null, savings_opportunity: null };
        }
      }
      return { ...n, benchmark: null, savings_opportunity: null };
    }));

    // Summary
    const connected = enrichedNodes.filter(n => n.status === 'connected' || n.status === 'verified').length;
    const estimatedMonthlyCost = enrichedNodes
      .filter(n => n.cost_confidence === 'estimated' && n.monthly_cost > 0)
      .reduce((s, n) => s + Number(n.monthly_cost || 0), 0);
    const verifiedMonthlyCost = enrichedNodes
      .filter(n => (n.cost_confidence === 'connected' || n.cost_confidence === 'verified') && n.monthly_cost > 0)
      .reduce((s, n) => s + Number(n.monthly_cost || 0), 0);

    return Response.json({
      ok: true,
      brand_id,
      nodes: enrichedNodes,
      edges,
      summary: {
        total_nodes:                enrichedNodes.length,
        connected_nodes:            connected,
        estimated_monthly_cost:     Math.round(estimatedMonthlyCost),
        verified_monthly_cost:      Math.round(verifiedMonthlyCost),
        total_savings_opportunity:  totalSavings,
      },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});

function emptySummary() {
  return {
    total_nodes: 0,
    connected_nodes: 0,
    estimated_monthly_cost: 0,
    verified_monthly_cost: 0,
    total_savings_opportunity: 0,
  };
}