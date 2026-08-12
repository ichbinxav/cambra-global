import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireUserOrInternal } from '../../shared/internalGate.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

function num(v) { const n = Number(v || 0); return isFinite(n) ? n : 0; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function pct(n, d) { return d ? n / d : 0; }
function priorityFromScore(s) { if (s >= 75) return 'high'; if (s >= 50) return 'medium'; return 'low'; }

function scoreWeights(){
  return {
    potential_savings: 0.30,
    confidence: 0.15,
    readiness: 0.20,
    data_completeness: 0.10,
    provider_fit: 0.15,
    monetization_potential: 0.20,
    complexity_penalty: 0.10 // se resta
  };
}

async function resolveBrandId(base44, payload){
  if (payload?.brandId) return payload.brandId;
  // Entity automation payloads
  const ev = payload?.event; const data = payload?.data; const old = payload?.old_data; const entity = ev?.entity_name;
  const cur = data || old || {};
  if (cur.brand_id) return cur.brand_id;
  // AnalyzerResult → map by created_by ⇒ Brand.created_by
  if (entity === 'AnalyzerResult' && cur.created_by){
    const bs = await base44.asServiceRole.entities.Brand.filter({ created_by: cur.created_by }, '-created_date', 1);
    return bs?.[0]?.id || null;
  }
  // MigrationTask has deal_activation_id
  if (entity === 'MigrationTask' && cur.deal_activation_id){
    const act = await base44.asServiceRole.entities.DealActivation.get(cur.deal_activation_id).catch((error:any)=>safeBestEffort(error,{operation:'regenerateRecommendationsForBrand',fallback:null,severity:'secondary'}));
    return act?.brand_id || null;
  }
  // Baseline may only have deal_activation_id
  if (entity === 'Baseline' && cur.deal_activation_id){
    const act = await base44.asServiceRole.entities.DealActivation.get(cur.deal_activation_id).catch((error:any)=>safeBestEffort(error,{operation:'regenerateRecommendationsForBrand',fallback:null,severity:'secondary'}));
    return act?.brand_id || null;
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let payload = {};
    try { payload = await req.json(); } catch(error){safeBestEffort(error,{operation:'regenerateRecommendationsForBrand',fallback:null,severity:'secondary'})}
    // SECURITY-2 (2026-07-24) — deny anonymous: authenticated user (owner
    // check below) OR INTERNAL_CALL_SECRET (function→function invocations).
    const gate = await requireUserOrInternal(req, base44, payload);
    if (!gate.ok) return gate.response;
    const user = gate.user;

    const brandId = await resolveBrandId(base44, payload);
    if (!brandId) {
      return Response.json({ error: 'brandId no resuelto' }, { status: 400 });
    }

    // Si viene desde frontend: asegurar permisos (propietario o admin).
    // Nota: tras el gate deny-anonymous, `user` solo es null en llamadas
    // internas con secreto (confiables) — el check de ownership no aplica.
    if (!gate.isAdmin && !gate.isInternal){
      const myBrands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 5);
      const ok = !!myBrands.find(b => b.id === brandId);
      if (!ok) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Cargar señales
    const brand = await base44.asServiceRole.entities.Brand.get(brandId);
    const brandEmail = brand?.created_by;

    const [results, activations, reports, baselines, mandates, tasks, providers] = await Promise.all([
      brandEmail
        ? base44.asServiceRole.entities.AnalyzerResult.filter({ created_by: brandEmail }, '-created_date', 50)
        : Promise.resolve([]),
      base44.asServiceRole.entities.DealActivation.filter({ brand_id: brandId }),
      base44.asServiceRole.entities.MonthlySavingsReport.filter({ brand_id: brandId }, '-month', 200),
      base44.asServiceRole.entities.Baseline.filter({ brand_id: brandId, is_current: true }, '-locked_at', 1),
      base44.asServiceRole.entities.Mandate.filter({ brand_id: brandId }, '-signed_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'regenerateRecommendationsForBrand',fallback:[],severity:'secondary'})),
      base44.asServiceRole.entities.MigrationTask.filter({ brand_id: brandId }, '-updated_date', 200).catch((error:any)=>safeBestEffort(error,{operation:'regenerateRecommendationsForBrand',fallback:[],severity:'secondary'})),
      base44.asServiceRole.entities.Provider.list().catch((error:any)=>safeBestEffort(error,{operation:'regenerateRecommendationsForBrand',fallback:[],severity:'secondary'})),
    ]);

    const latestBaseline = baselines?.[0] || null;
    const latestMandate = mandates?.[0] || null;

    // Map AnalyzerResult — already filtered by created_by in the query above
    const myResults = (results||[]).sort((a,b)=> new Date(b.created_date)-new Date(a.created_date));
    const latestResult = myResults?.[0] || null;

    // Señales verticales
    const vSaves = {
      payments: num(latestResult?.payment_savings),
      shipping: num(latestResult?.shipping_savings),
      saas: num(latestResult?.saas_savings)
    };
    const totalSavings = num(latestResult?.total_savings);

    // Confidence
    const confidenceParts = [];
    if (latestBaseline?.locked) confidenceParts.push(0.5);
    if ((reports||[]).some(r => ['verified','realized','invoiced','paid'].includes(r.verification_status||''))) confidenceParts.push(0.3);
    if ((reports||[]).some(r => (r.evidence_count||0) > 0)) confidenceParts.push(0.2);
    const confidence = clamp01(confidenceParts.reduce((s,x)=>s+x,0));

    // Readiness
    const readyParts = [];
    const liveStatuses = new Set(['authorized','migrating','live','monetizing','activated']);
    if ((activations||[]).some(a => liveStatuses.has(a.status))) readyParts.push(0.5);
    if (latestMandate?.status === 'active') readyParts.push(0.2);
    const openTasks = (tasks||[]).filter(t => !['done','canceled'].includes(t.status||''));
    if (openTasks.length === 0) readyParts.push(0.3);
    const readiness = clamp01(readyParts.reduce((s,x)=>s+x,0));

    // Data completeness
    const completenessParts = [];
    if (brand?.onboarding_complete) completenessParts.push(0.3);
    if (latestBaseline) completenessParts.push(0.3);
    if (latestResult) completenessParts.push(0.4);
    const data_completeness = clamp01(completenessParts.reduce((s,x)=>s+x,0));

    // Complexity (penalización)
    const blocked = (tasks||[]).filter(t => t.status === 'blocked');
    const requires = (tasks||[]).filter(t => t.requires_brand_input || t.requires_provider_input);
    let complexity_penalty = 0;
    if (blocked.length > 0) complexity_penalty += 0.5;
    if (requires.length > 2) complexity_penalty += 0.3;
    complexity_penalty = clamp01(complexity_penalty);

    // Monetization potential (basado en reports paid/invoiced y node_fee)
    const paidFees = (reports||[]).filter(r => r.status === 'paid').reduce((s,r)=> s + num(r.node_fee), 0);
    const invoicedFees = (reports||[]).filter(r => r.status === 'invoiced').reduce((s,r)=> s + num(r.node_fee), 0);
    const monetization_potential = clamp01(num(paidFees + invoicedFees) > 0 ? 1 : pct(num(invoicedFees), 10000));

    // Provider fit (regla simple por vertical y país si existe el campo en provider)
    function fitForVertical(v){
      const country = (brand?.country||'').toLowerCase();
      const ps = (providers||[]).filter(p => (p.vertical||p.category||'').toLowerCase() === v);
      if (ps.length === 0) return 0.4; // desconocido
      const withCountry = ps.filter(p => (p.country||'').toLowerCase() === country);
      if (withCountry.length > 0) return 1.0;
      return 0.7;
    }
    const provider_fit_by_v = {
      payments: fitForVertical('payments'),
      shipping: fitForVertical('shipping'),
      saas: fitForVertical('saas')
    };

    // Pesos
    const W = scoreWeights();

    function makeScore(v){
      const ps = num(vSaves[v]);
      const pf = provider_fit_by_v[v] || 0.5;
      const total = 100 * (
        W.potential_savings * clamp01(pct(ps, Math.max(totalSavings, ps || 1))) +
        W.confidence * confidence +
        W.readiness * readiness +
        W.data_completeness * data_completeness +
        W.provider_fit * pf +
        W.monetization_potential * monetization_potential -
        W.complexity_penalty * complexity_penalty
      );
      return { total: Math.round(total), breakdown: { potential_savings: ps, confidence, readiness, data_completeness, provider_fit: pf, monetization_potential, complexity_penalty } };
    }

    const scores = {
      payments: makeScore('payments'),
      shipping: makeScore('shipping'),
      saas: makeScore('saas')
    };

    // Build reasons & missing_data
    const reasonsBase = [];
    const missing = [];
    if (!latestBaseline) { missing.push('baseline.locked'); reasonsBase.push('Falta baseline actual.'); }
    if (!latestResult) { missing.push('analyzer.latest'); reasonsBase.push('Ejecuta el Analyzer reciente.'); }
    if (!brand?.onboarding_complete) { missing.push('onboarding'); reasonsBase.push('Completa onboarding.'); }
    if (!(reports||[]).some(r => (r.evidence_count||0) > 0)) { missing.push('evidence.files'); reasonsBase.push('Sube evidencia de ahorros.'); }
    if (!latestMandate || latestMandate.status !== 'active') { missing.push('mandate.active'); reasonsBase.push('Firmar mandato.'); }

    // Elegir vertical prioritaria
    const order = Object.entries(scores).sort((a,b)=> b[1].total - a[1].total);
    const topV = order[0]?.[0] || 'general';
    const topScore = order[0]?.[1] || { total: 0, breakdown: {} };

    // Buscar proveedor sugerido (fit simple)
    const vProviders = (providers||[]).filter(p => (p.vertical||p.category||'').toLowerCase() === topV);
    const pick = vProviders[0] || null;

    // effort_level por complejidad
    const effort_level = complexity_penalty >= 0.6 ? 'high' : (complexity_penalty >= 0.3 ? 'medium' : 'low');

    // Purga previas del brand
    const prev = await base44.asServiceRole.entities.Recommendation.filter({ brand_id: brandId }, '-created_date', 200);
    await Promise.all(prev.map(r => base44.asServiceRole.entities.Recommendation.delete(r.id)));

    const nowIso = new Date().toISOString();
    const recs = [];

    // 1) Vertical priority
    recs.push({
      brand_id: brandId,
      vertical: topV,
      type: 'vertical_priority',
      title: `Prioriza ${topV}`,
      description: `Mayor impacto estimado según señales actuales.`,
      expected_benefit: totalSavings ? `€${Math.round(totalSavings).toLocaleString()}/yr` : undefined,
      action_required: 'Abrir oportunidades',
      action_link: '/Deals',
      score_json: { total: topScore.total, ...topScore.breakdown },
      reasons: reasonsBase,
      missing_data: missing,
      effort_level,
      generated_at: nowIso
    });

    // 2) Deal suggestion
    if (pick){
      recs.push({
        brand_id: brandId,
        provider_id: pick.id,
        vertical: topV,
        type: 'deal_suggestion',
        title: `Propuesta con ${pick.name || 'proveedor'}`,
        description: `Encaje por vertical/país.`,
        expected_benefit: vSaves[topV] ? `€${Math.round(vSaves[topV]).toLocaleString()}/yr` : undefined,
        action_required: 'Activar deal',
        action_link: '/Deals',
        score_json: { total: topScore.total, ...topScore.breakdown },
        reasons: [`Mejor vertical: ${topV}`, `Fit proveedor alto`],
        missing_data: missing,
        effort_level,
        generated_at: nowIso
      });
    }

    // 3) Missing data recommendation (si hay)
    if (missing.length){
      recs.push({
        brand_id: brandId,
        vertical: topV,
        type: 'missing_data',
        title: 'Completar datos críticos',
        description: 'Estos datos aumentarán la confianza y el ROI.',
        action_required: 'Ir a Vault/Onboarding',
        action_link: '/Vault',
        score_json: { total: Math.min(60, topScore.total), ...topScore.breakdown },
        reasons: reasonsBase,
        missing_data: missing,
        effort_level: 'low',
        generated_at: nowIso
      });
    }

    // 4) Next best action (heurística)
    let nba = null;
    if (!latestBaseline) nba = { label: 'Bloquear baseline', link: '/admin/activation' };
    else if (!latestMandate || latestMandate.status !== 'active') nba = { label: 'Firmar mandato', link: '/deal/authorize' };
    else if ((reports||[]).some(r => r.status === 'calculated')) nba = { label: 'Emitir factura', link: '/admin/revenue' };
    else if (blocked.length) nba = { label: 'Desbloquear tareas', link: '/deal/migration' };
    if (nba){
      recs.push({
        brand_id: brandId,
        vertical: topV,
        type: 'next_action',
        title: 'Siguiente mejor paso',
        description: nba.label,
        action_required: nba.label,
        action_link: nba.link,
        score_json: { total: Math.max(50, topScore.total - 10), ...topScore.breakdown },
        reasons: reasonsBase,
        missing_data: missing,
        effort_level,
        generated_at: nowIso
      });
    }

    // 5) Opportunity ranking (resumen)
    recs.push({
      brand_id: brandId,
      vertical: 'general',
      type: 'opportunity_ranking',
      title: 'Top oportunidades',
      description: `1) ${order[0]?.[0]} (${order[0]?.[1].total}) · 2) ${order[1]?.[0]} (${order[1]?.[1].total}) · 3) ${order[2]?.[0]} (${order[2]?.[1].total})`,
      action_required: 'Ver detalles',
      action_link: '/Dashboard',
      score_json: { total: topScore.total, order: order.map(([k,v])=>({ vertical:k, score:v.total })) },
      reasons: reasonsBase,
      missing_data: missing,
      effort_level,
      generated_at: nowIso
    });

    // Persistir
    const created = await base44.asServiceRole.entities.Recommendation.bulkCreate(recs);
    return Response.json({ ok: true, items: created });
  } catch (error) {
    return internalErrorResponse(error, 'regenerateRecommendationsForBrand');
  }
});