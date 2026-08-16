import { safeBestEffort } from '../../shared/bestEffort.ts';
import{createClientFromRequest}from'npm:@base44/sdk@0.8.41';
import{requireAdminOrInternal}from'../../shared/internalGate.ts';
import{legacyClassification}from'../../shared/p3RateIntelligence.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
import { ECB_DAILY_URL, buildFxSnapshotRows, parseEcbDailyXml } from '../../shared/ecbFxIngest.ts';

// FX reference ingest — hosted here rather than in a new function (rule R5:
// no new directories under base44/functions/). It belongs to the same daily
// rate-intelligence beat. It is deliberately NOT registered in
// deployment-topology.json: logical_routes describe callable actions
// ({host, route:{action}}), and this is an internal step of the worker's
// scheduled run, not an endpoint. An admin who needs it now can invoke the
// worker itself, which already gates through requireAdminOrInternal.
//
// Until this existed nothing ever wrote FxSnapshot, so the table was empty and
// analyzerFx.ts — which fails closed on an unresolved rate — blocked EVERY
// verified Stripe analysis outside pure EUR (GB, CH, LI + the eight non-EUR EU
// markets). Fail-closed was right; having nothing to resolve against was not.
//
// Failure policy: a bad fetch or an unparseable payload is reported and the
// worker continues with its legacy/P3 reconciliation. We never write a
// fabricated or carried-over rate to paper over a missed publication — a gap
// stays a gap, and resolveFX will correctly call the previous day STALE.
async function ingestEcbReferenceRates(s:any, at:string) {
  let xml:string;
  try {
    const res = await fetch(ECB_DAILY_URL, { headers:{ accept:'application/xml' } });
    if (!res.ok) return { ok:false, error:`ecb_http_${res.status}`, written:0, missing:[] };
    xml = await res.text();
  } catch (error:any) {
    return { ok:false, error:'ecb_fetch_failed', detail:String(error?.message||error), written:0, missing:[] };
  }

  const parsed = parseEcbDailyXml(xml);
  if (!parsed.ok) return { ok:false, error:parsed.error, written:0, missing:[] };

  const built = buildFxSnapshotRows({ parsed, retrieved_at:at });
  if (!built.ok) return { ok:false, error:built.error, written:0, missing:[] };

  // Idempotent by fx_key: the same published day re-ingested writes nothing.
  const existing = await s.entities.FxSnapshot
    .filter({ effective_at: built.effective_at }, '-created_date', 500)
    .catch((error:any)=>safeBestEffort(error,{operation:'intelligenceMaintenanceWorker.fxIngest',fallback:[],severity:'secondary'}));
  const seen = new Set((Array.isArray(existing)?existing:[]).map((r:any)=>String(r?.fx_key||'')));

  let written = 0;
  for (const row of built.rows) {
    if (seen.has(row.fx_key)) continue;
    const created = await s.entities.FxSnapshot.create(row)
      .catch((error:any)=>safeBestEffort(error,{operation:'intelligenceMaintenanceWorker.fxIngest',fallback:null,severity:'secondary'}));
    if (created) written++;
  }
  return { ok:true, written, skipped:built.rows.length-written, missing:built.missing, effective_at:built.effective_at };
}

// P3 cutover semantics:
// - ProviderPricingVersion + RateComponent is the canonical factual pricing ledger.
// - PaymentsRateTable is a temporary legacy Analyzer compatibility projection only.
// - Legacy estimates/placeholders never promote into canonical P3 truth.
// - Exact verified P3 facts may project DOWN into an existing exact-country legacy row.
// - Achievable/P4/P5 inference fields are never copied into P3 factual truth.
guardedScheduledServe({"worker_key":"intelligenceMaintenanceWorker","cadence_seconds":86400},createClientFromRequest,async req=>{try{const b=createClientFromRequest(req),body=await req.json().catch(()=>({})),g=await requireAdminOrInternal(req,b,body);if(!g.ok)return g.response;const s=b.asServiceRole,at=new Date().toISOString();const [legacy,p3]=await Promise.all([s.entities.PaymentsRateTable.list('-updated_date',1000).catch((error:any)=>safeBestEffort(error,{operation:'intelligenceMaintenanceWorker',fallback:[],severity:'secondary'})),s.entities.ProviderPricingVersion.filter({vertical:'payments',status:'CURRENT'},'-recorded_at',2000).catch((error:any)=>safeBestEffort(error,{operation:'intelligenceMaintenanceWorker',fallback:[],severity:'secondary'}))]);
const fxIngest=await ingestEcbReferenceRates(s,at);
const classifications:any={};let quarantinedLegacy=0,projected=0,unchanged=0,noTarget=0,precisionBlocked=0,currencyBlocked=0,unknownStructure=0;
for(const r of legacy as any[]){if(r.is_demo)continue;const c=legacyClassification(r);classifications[c.classification]=(classifications[c.classification]||0)+1;const unsafe=c.classification!=='VERIFIED_MIGRATABLE'||r.verified!==true||(r.region==='EU'&&!r.country);if(unsafe&&r.active===true){await s.entities.PaymentsRateTable.update(r.id,{active:false,source_notes:`${String(r.source_notes||'')}\n[P3 LEGACY QUARANTINE ${at}] ${c.classification}: ${c.reasons.join(',')||'not exact verified market truth'}`.trim()}).catch((error:any)=>safeBestEffort(error,{operation:'intelligenceMaintenanceWorker',fallback:null,severity:'secondary'}));quarantinedLegacy++;}}
for(const o of p3 as any[]){if(o.is_demo)continue;if(o.verification_status!=='VERIFIED_PRIMARY'||o.pricing_visibility!=='PUBLIC_COMPLETE'||!o.market||!o.provider_slug||o.access_scope==='TENANT_PRIVATE')continue;const components=await s.entities.RateComponent.filter({pricing_observation_id:o.id},'component_sequence',200).catch((error:any)=>safeBestEffort(error,{operation:'intelligenceMaintenanceWorker',fallback:[],severity:'secondary'}));if(components.some((c:any)=>c.value_mode!=='KNOWN')){unknownStructure++;continue}const pct=components.filter((c:any)=>['PROCESSING_FEE','ACQUIRER_MARGIN'].includes(c.component_type)&&c.percentage_ppm!=null);const fixed=components.filter((c:any)=>c.component_type==='FIXED_TRANSACTION_FEE'&&c.amount_minor!=null);if(pct.length!==1||pct[0].percentage_ppm%100!==0){precisionBlocked++;continue}const currencies=new Set(fixed.map((c:any)=>c.currency).filter(Boolean));if(currencies.size>1){currencyBlocked++;continue}const channel=o.channel==='IN_PERSON'?'in_store':o.channel==='ECOMMERCE'?'online':null;if(!channel)continue;const slug=o.provider_slug==='stripe'&&o.product_key==='stripe:terminal'?'stripe_terminal':o.provider_slug;const target=(legacy as any[]).find(r=>r.provider_slug===slug&&r.country===o.market&&(r.channel||'online')===channel&&r.tier==='ANY');if(!target){noTarget++;continue}const patch:any={active:true,verified:true,verified_at:o.verified_at||at,percent_bps:pct[0].percentage_ppm/100,fixed_fee_minor_units:fixed[0]?.amount_minor||0,fixed_fee_currency:fixed[0]?.currency||target.fixed_fee_currency,source_url:o.source_reference||target.source_url,source_quote:`P3 compatibility projection from ${o.pricing_key}`,intl_uplift_bps:null,achievable_percent_bps:null,achievable_fixed_fee_minor_units:null,achievable_intl_uplift_bps:null,source_notes:`P3 COMPATIBILITY PROJECTION ${at}. Canonical truth: ProviderPricingVersion ${o.id}. Legacy achievable fields intentionally cleared; P5 owns achievable inference.`};const same=Number(target.percent_bps)===Number(patch.percent_bps)&&Number(target.fixed_fee_minor_units||0)===Number(patch.fixed_fee_minor_units||0)&&target.fixed_fee_currency===patch.fixed_fee_currency&&target.active===true&&target.verified===true;if(same){unchanged++;continue}await s.entities.PaymentsRateTable.update(target.id,patch);projected++;}
await s.entities.Event.create({brand_id:'_platform',event_type:'P3_LEGACY_COMPATIBILITY_RECONCILED',source:'intelligenceMaintenanceWorker',entity_type:'PaymentsRateTable',entity_id:'legacy-adapter',payload_json:{classifications,quarantined_legacy:quarantinedLegacy,projected,unchanged,no_target:noTarget,precision_blocked:precisionBlocked,currency_blocked:currencyBlocked,unknown_structure:unknownStructure,canonical_truth:'ProviderPricingVersion+RateComponent',legacy_is_projection_only:true,fx_ingest:fxIngest},status:'processed',processed_at:at}).catch((error:any)=>safeBestEffort(error,{operation:'intelligenceMaintenanceWorker',fallback:null,severity:'secondary'}));
return Response.json({ok:true,canonical_truth:'ProviderPricingVersion+RateComponent',legacy_projection_only:true,classifications,quarantined_legacy:quarantinedLegacy,projected,unchanged,no_target:noTarget,precision_blocked:precisionBlocked,currency_blocked:currencyBlocked,unknown_structure:unknownStructure,fx_ingest:fxIngest})}catch(e){console.error(e);return Response.json({ok:false,error:'intelligence_maintenance_failed'},{status:500})}});
