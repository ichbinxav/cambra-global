import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const fallback = (operation:string) => (error:any) => safeBestEffort(error, {
  operation: `getRoutingIntelligenceCommandCenter.${operation}`,
  fallback: [],
  severity: 'secondary',
});

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch((error:any) => safeBestEffort(error, {
    operation: 'getRoutingIntelligenceCommandCenter.auth', fallback: null, severity: 'secondary',
  }));
  if (!user) return Response.json({ ok:false, error:'Unauthorized' }, { status:401 });
  if (user.role !== 'admin') return Response.json({ ok:false, error:'Forbidden' }, { status:403 });

  const svc = base44.asServiceRole;
  const [observations, decisions, opportunities, performance, readiness, simulations, policies, brands] = await Promise.all([
    svc.entities.PaymentRoutingObservation.list('-created_date', 1000).catch(fallback('observations')),
    svc.entities.ShadowRoutingDecision.list('-evaluated_at', 1000).catch(fallback('decisions')),
    svc.entities.RoutingOpportunity.list('-created_at', 500).catch(fallback('opportunities')),
    svc.entities.RoutingProviderPerformance.list('-calculated_at', 500).catch(fallback('performance')),
    svc.entities.RoutingReadinessAssessment.list('-calculated_at', 500).catch(fallback('readiness')),
    svc.entities.RoutingSimulation.list('-completed_at', 500).catch(fallback('simulations')),
    svc.entities.RoutingPolicy.list('-created_at', 500).catch(fallback('policies')),
    svc.entities.Brand.list('-updated_date', 500).catch(fallback('brands')),
  ]);

  const brandById = new Map(brands.map((brand:any) => [String(brand.id), brand]));
  const withBrand = (row:any) => {
    const brand:any = brandById.get(String(row.brand_id || '')) || null;
    return { ...row, brand_name: brand?.name || null, brand_is_demo: brand?.is_demo === true };
  };

  return Response.json({
    ok:true,
    shadow_only:true,
    real_routing_allowed:false,
    metrics:{
      observations:observations.length,
      transaction_level:observations.filter((row:any) => row.granularity === 'transaction').length,
      aggregate_windows:observations.filter((row:any) => row.granularity === 'aggregate_window').length,
      shadow_decisions:decisions.length,
      opportunities:opportunities.filter((row:any) => ['candidate','qualified','recommended'].includes(row.status)).length,
      high_confidence_decisions:decisions.filter((row:any) => Number(row.confidence || 0) >= .7).length,
      approval_segments:performance.filter((row:any) => Number(row.sample_size || 0) >= 50).length,
      simulations:simulations.length,
      shadow_policies:policies.filter((row:any) => ['draft','shadow','recommended'].includes(row.status)).length,
    },
    brands:brands.filter((brand:any) => brand.is_demo !== true).map((brand:any) => ({ id:brand.id, name:brand.name || brand.contact_email || 'Unnamed brand' })),
    decisions:decisions.slice(0, 100).map(withBrand),
    opportunities:opportunities.slice(0, 100).map(withBrand),
    performance:performance.slice(0, 100),
    readiness:readiness.slice(0, 100).map(withBrand),
    simulations:simulations.slice(0, 100).map(withBrand),
    policies:policies.slice(0, 100).map(withBrand),
  });
});
