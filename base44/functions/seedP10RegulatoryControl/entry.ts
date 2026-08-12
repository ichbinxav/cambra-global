import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { EUROPE_MARKETS } from '../../shared/generated/europeMarkets.ts';
import { conservativePolicy, REGULATORY_ACTIVITIES, REGULATORY_CONTROL_VERSION } from '../../shared/regulatoryControl.ts';

export async function handleSeedP10RegulatoryControl(req: Request) {
  try {
    const base44 = createClientFromRequest(req); const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body); if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole; const now = new Date().toISOString(); let created = 0, existing = 0;
    for (const market of EUROPE_MARKETS as any[]) for (const activity of REGULATORY_ACTIVITIES) {
      const policy = conservativePolicy(market.iso2, activity, now);
      const rows = await svc.entities.RegulatoryPolicyVersion.filter({ policy_key:policy.policy_key }, '-effective_from', 1).catch((error:any)=>safeBestEffort(error,{operation:'seedP10RegulatoryControl',fallback:[],severity:'secondary'}));
      if (rows[0]) { existing++; continue; }
      await svc.entities.RegulatoryPolicyVersion.create(policy); created++;
    }
    await svc.entities.Event.create({ brand_id:'_platform',event_type:'REGULATORY_POLICY_MATRIX_SEEDED',source:'p10_conservative_seed',entity_type:'RegulatoryPolicyVersion',entity_id:'europe-33',payload_json:{ markets:EUROPE_MARKETS.length,activities:REGULATORY_ACTIVITIES.length,created,existing,policy_version:REGULATORY_CONTROL_VERSION,permission_claims_created:0 },status:'processed',processed_at:now }).catch((error:any)=>safeBestEffort(error,{operation:'seedP10RegulatoryControl',fallback:null,severity:'secondary'}));
    return Response.json({ ok:true,markets:EUROPE_MARKETS.length,activities:REGULATORY_ACTIVITIES.length,expected_policies:EUROPE_MARKETS.length * REGULATORY_ACTIVITIES.length,created,existing,status:'LEGAL_REVIEW_REQUIRED',note:'Coverage is complete; legal clearance is not claimed.' });
  } catch (error) { console.error(error); return Response.json({ ok:false,error:'p10_regulatory_seed_failed' }, { status:500 }); }
}
