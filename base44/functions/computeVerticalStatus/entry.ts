import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireUserOrInternal } from '../../shared/internalGate.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

function presence(v){
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return !isNaN(v) && isFinite(v);
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return !!v;
}

function scoreFrom(required, data){
  const missing = [];
  let have = 0;
  for (const f of required){ if (presence(data?.[f])) have++; else missing.push(f); }
  const completeness = required.length ? Math.round((have/required.length)*100) : 0;
  return { completeness, missing };
}

async function upsertProfile(base44, entity, id, patch){
  if (!id) return;
  await base44.asServiceRole.entities[entity].update(id, patch);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json().catch(()=>({}));
    // SECURITY-2 (2026-07-24) — deny anonymous: authenticated user (ownership
    // enforced below) OR INTERNAL_CALL_SECRET (function→function invocations).
    const gate = await requireUserOrInternal(req, base44, payload);
    if (!gate.ok) return gate.response;
    const user = gate.user;
    let { brandId, vertical } = payload || {};

    // Resolve from automation event
    if (!brandId && payload?.data?.brand_id) brandId = payload.data.brand_id;

    if (!brandId) {
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1);
      brandId = brands?.[0]?.id;
      if (!brandId) return Response.json({ error: 'No brand' }, { status: 400 });
    }

    // SECURITY-2 — a non-admin user may only compute status for a brand they
    // own (user-scoped read: RLS filters to visible brands).
    if (!gate.isAdmin && !gate.isInternal) {
      const owned = await base44.entities.Brand.filter({ id: brandId }, '-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'computeVerticalStatus',fallback:[],severity:'secondary'}));
      if (!owned.length) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sr = base44.asServiceRole; // operate with service role for updates

    const [pp] = await sr.entities.PaymentsProfile.filter({ brand_id: brandId }, '-updated_date', 1);
    const [sp] = await sr.entities.ShippingProfile.filter({ brand_id: brandId }, '-updated_date', 1);
    const [sa] = await sr.entities.SaaSProfile.filter({ brand_id: brandId }, '-updated_date', 1);

    const statuses = {};

    if (!vertical || vertical === 'payments'){
      const reqP = ['psp_actual','blended_rate','canales','paises','monedas','vol_mensual','tx_mensuales','aov'];
      const { completeness, missing } = scoreFrom(reqP, pp||{});
      const readiness = Math.min(100, Math.round(completeness*0.8 + (presence(pp?.contrato?.renovacion_en)?10:0) + (presence(pp?.payout_timing)?10:0)));
      statuses.payments = { completeness, readiness, missing_fields: missing, id: pp?.id||null };
      if (pp?.id) await upsertProfile(base44, 'PaymentsProfile', pp.id, { completeness_score: completeness, readiness_score: readiness, missing_fields: missing });
    }

    if (!vertical || vertical === 'shipping'){
      const reqS = ['carriers','modelo','three_pl','in_house','paises_serv','domestic_vs_intl','pedidos_mensuales','avg_weight'];
      const { completeness, missing } = scoreFrom(reqS, sp||{});
      const readiness = Math.min(100, Math.round(completeness*0.85 + (presence(sp?.warehouse_model)?10:0)));
      statuses.shipping = { completeness, readiness, missing_fields: missing, id: sp?.id||null };
      if (sp?.id) await upsertProfile(base44, 'ShippingProfile', sp.id, { completeness_score: completeness, readiness_score: readiness, missing_fields: missing });
    }

    if (!vertical || vertical === 'saas'){
      const reqSa = ['plataforma','crm','email_sms','analytics'];
      const { completeness, missing } = scoreFrom(reqSa, sa||{});
      const readiness = Math.min(100, Math.round(completeness*0.9 + (presence(sa?.renovaciones_map)?10:0)));
      statuses.saas = { completeness, readiness, missing_fields: missing, id: sa?.id||null };
      if (sa?.id) await upsertProfile(base44, 'SaaSProfile', sa.id, { completeness_score: completeness, readiness_score: readiness, missing_fields: missing });
    }

    // Optional: trigger recs when good enough
    const good = (x)=> x && x.completeness >= 70 && x.readiness >= 70;
    if (good(statuses.payments) || good(statuses.shipping) || good(statuses.saas)){
      try { await sr.functions.invoke('regenerateRecommendationsForBrand', { brandId }); } catch (e) { /* non-fatal */ }
    }

    return Response.json({ brandId, statuses });
  } catch (error) {
    return internalErrorResponse(error, 'computeVerticalStatus');
  }
});