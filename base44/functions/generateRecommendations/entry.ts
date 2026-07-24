import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';

function sum(arr){ return (arr||[]).reduce((s,v)=>s+(Number(v)||0),0); }
function byLatest(arr, key='created_date'){ return (arr||[]).sort((a,b)=> new Date(b[key]) - new Date(a[key])); }
function pickTop(opps, n=3){ return (opps||[]).sort((a,b)=> (b.totalScore||0) - (a.totalScore||0)).slice(0,n); }

function computeScores({ brand, latestResult, reports, activations, tasks, providers }){
  const res = [];
  const potential = {
    payments: Number(latestResult?.payment_savings||0),
    shipping: Number(latestResult?.shipping_savings||0),
    saas: Number(latestResult?.saas_savings||0)
  };
  const vertical = Object.entries(potential).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'general';

  // Confidence from reports statuses
  const ORDER = ['estimated','proposed','evidence_submitted','under_review','verified','realized','invoiced','paid'];
  const lastReport = byLatest(reports, 'month')[0];
  const confIdx = lastReport?.verification_status ? ORDER.indexOf(lastReport.verification_status) : 0;
  const confidence = Math.max(0, confIdx) / (ORDER.length-1); // 0..1

  // Readiness
  const readiness = (brand?.onboarding_complete ? 0.6 : 0.3) + (latestResult ? 0.4 : 0);

  // Data completeness: ratio of present fields in AnalyzerInput criticals
  const ai = latestResult ? null : null; // we don't fetch AnalyzerInput here to keep light
  const completeness = latestResult ? 0.8 : 0.3;

  // Complexity penalty if blocked tasks exist
  const blocked = (tasks||[]).filter(t=>t.status==='blocked').length;
  const complexityPenalty = Math.min(0.4, blocked*0.1);

  const monetizationPotential = sum((reports||[]).map(r=> r.node_fee || 0)) > 0 ? 0.7 : 0.3;

  const baseScore = (p)=> (
    (Number(p)||0) / Math.max(1, Number(brand?.annual_revenue==='20m_plus' ? 20000000 : 5000000)) // normalize
  ) * 0.5 + confidence*0.2 + readiness*0.15 + completeness*0.1 + monetizationPotential*0.05 - complexityPenalty;

  // 1) Vertical priority
  const vp = {
    type: 'vertical_priority', vertical,
    title: `Prioriza ${vertical}`,
    description: `El mayor potencial de ahorro actual está en ${vertical}.` + (blocked?` Hay ${blocked} tareas bloqueadas que podrían afectar el tiempo de implementación.`:''),
    expected_benefit: latestResult ? `Ahorro potencial ≈ €${(potential[vertical]||0).toLocaleString()}/año` : 'Ejecuta Analyzer para cuantificar.',
    action_required: latestResult ? 'Revisar y activar el mejor proveedor' : 'Ejecutar Analyzer',
    action_link: latestResult ? `/Deals?vertical=${vertical}` : '/Analyzer',
    scoreBreakdown: {
      potential_savings: potential[vertical]||0,
      confidence, readiness, data_completeness: completeness,
      provider_fit: 0, complexity: complexityPenalty, monetization: monetizationPotential
    }
  };
  vp.totalScore = baseScore(potential[vertical]||0);
  res.push(vp);

  // 2) Deal/Provider suggestion candidates (heuristic): active providers in vertical/region not yet activated
  const region = brand?.country || 'global';
  const providerOpps = (providers||[]).filter(p=> (p.vertical===vertical)).map(p=>({
    provider: p,
    fit: 0.6 + (p.regions_served?.includes(region)?0.3:0),
    potential: potential[vertical]||0,
  })).filter(o=>o.fit>=0.6);

  providerOpps.forEach(o=>{
    const item = {
      type: 'deal_suggestion', vertical,
      title: `Explorar ${o.provider.name}`,
      description: `Buen encaje por vertical ${vertical}` + (o.provider.regions_served?.includes(region)?` y región ${region}`:''),
      expected_benefit: latestResult ? `Potencial ≈ €${(o.potential||0).toLocaleString()}/año` : 'Ejecuta Analyzer para cuantificar.',
      action_required: 'Abrir detalle del deal y solicitar oferta',
      action_link: `/Deals?provider=${encodeURIComponent(o.provider.name||o.provider.id)}`,
      scoreBreakdown: {
        potential_savings: o.potential||0,
        confidence, readiness, data_completeness: completeness,
        provider_fit: o.fit, complexity: complexityPenalty, monetization: monetizationPotential
      }
    };
    item.totalScore = baseScore(o.potential||0) + (o.fit*0.2);
    res.push(item);
  });

  // 3) Missing data
  if (!latestResult) {
    res.push({
      type: 'missing_data', vertical: 'general',
      title: 'Completar datos para afinar recomendaciones',
      description: 'Falta un análisis reciente. Ejecuta el Analizador para estimar ahorros por vertical.',
      expected_benefit: 'Recomendaciones más precisas y priorización automática',
      action_required: 'Ejecutar Analyzer', action_link: '/Analyzer',
      totalScore: 0.4, scoreBreakdown: { potential_savings: 0, confidence: 0, readiness, data_completeness: 0.2, provider_fit: 0, complexity: complexityPenalty, monetization: monetizationPotential }
    });
  }

  // 4) Next best action (simple rules)
  if (blocked>0) {
    res.push({ type: 'next_action', vertical: 'general', title: 'Desbloquear tareas de migración', description: `Hay ${blocked} tareas bloqueadas. Resolver bloqueos aumenta la probabilidad de monetización.`, expected_benefit: 'Acelera el go-live', action_required: 'Abrir Migration Hub', action_link: '/Deals', totalScore: 0.5, scoreBreakdown: { potential_savings: sum(Object.values(potential)), confidence, readiness, data_completeness: completeness, provider_fit: 0.5, complexity: complexityPenalty, monetization: monetizationPotential } });
  }

  return pickTop(res, 6);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // SECURITY-2 (2026-07-24) — canonical gate: admin OR INTERNAL_CALL_SECRET.
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const brands = await base44.asServiceRole.entities.Brand.list('-created_date', 500);
    const providers = await base44.asServiceRole.entities.Provider.list();

    for (const brand of (brands||[])) {
      const results = await base44.asServiceRole.entities.AnalyzerResult.filter({ created_by: brand.created_by }, '-created_date', 1);
      const latestResult = results?.[0] || null;
      const reports = await base44.asServiceRole.entities.MonthlySavingsReport.filter({ brand_id: brand.id }, '-month', 6);
      const activations = await base44.asServiceRole.entities.DealActivation.filter({ brand_id: brand.id }, '-created_date', 50);
      const tasks = await base44.asServiceRole.entities.MigrationTask.filter({ brand_id: brand.id }, '-updated_date', 100);

      const recs = computeScores({ brand, latestResult, reports, activations, tasks, providers });

      // clear previous recs for brand (archive by dismissing)
      const existing = await base44.asServiceRole.entities.Recommendation.filter({ brand_id: brand.id }, '-created_date', 500);
      for (const r of (existing||[])) {
        await base44.asServiceRole.entities.Recommendation.delete(r.id);
      }

      const now = new Date().toISOString();
      for (const r of recs) {
        await base44.asServiceRole.entities.Recommendation.create({
          brand_id: brand.id,
          provider_id: r.provider?.id,
          vertical: r.vertical || 'general',
          type: r.type,
          title: r.title,
          description: r.description,
          expected_benefit: r.expected_benefit,
          action_required: r.action_required,
          action_link: r.action_link,
          score_json: {
            total: r.totalScore || 0,
            ...r.scoreBreakdown
          },
          generated_at: now
        });
      }
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});