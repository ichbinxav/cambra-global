import { safeBestEffort } from '../../shared/bestEffort.ts';
import{createClientFromRequest}from'npm:@base44/sdk@0.8.41';import{requireAdminOrInternal}from'../../shared/internalGate.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
async function incident(s:any,key:string,summary:string,details:any){const old=await s.entities.AutonomyIncident.filter({dedupe_key:key,status:'open'},'-last_seen_at',1).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueReconciliationWorker',fallback:[],severity:'critical'})),row={dedupe_key:key,domain:'provider_revenue',severity:'warning',status:'open',workflow_state:'investigating',owner_type:'finance',automation_eligibility:'bounded_auto',summary,details_json:details,financial_impact_minor:Math.abs(Number(details.delta_minor||0)),customer_impact:'none',legal_risk:'low',first_seen_at:old[0]?.first_seen_at||new Date().toISOString(),last_seen_at:new Date().toISOString()};if(old[0])await s.entities.AutonomyIncident.update(old[0].id,row);else await s.entities.AutonomyIncident.create(row)}
// AUDIT MB-01 + MB-02 (2026-08-17):
//
// The ledger read was scoped to {provider_id, period} ONLY, ignoring agreement_id, currency and
// is_demo. A provider with two agreements in one period had both agreements' rows summed against
// a statement that covers ONE agreement — mismatch almost guaranteed. And a USD statement was
// compared with a EUR ledger with no currency check.
//
// The reduce was `accrued_amount_minor || expected_amount_minor || 0`. `expected` is the
// forecast; `accrued` is work delivered. When accrued was legitimately zero (nothing happened)
// the || fell through to the forecast, so a statement had to match a forecast to reconcile.
//
// Fixed: scope by agreement_id and currency; refuse to reconcile a statement with no
// agreement_id or no currency; expected uses accrued_amount_minor ONLY; demo rows excluded.
guardedScheduledServe({"worker_key":"providerRevenueReconciliationWorker","cadence_seconds":86400},createClientFromRequest,async req=>{try{
  const b=createClientFromRequest(req),body=await req.json().catch(()=>({})),g=await requireAdminOrInternal(req,b,body);
  if(!g.ok)return g.response;
  const s=b.asServiceRole,stmts=await s.entities.ProviderRevenueStatement.filter({status:{$in:['received','parsed','mismatch']}},'-received_at',1000).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueReconciliationWorker',fallback:[],severity:'critical'}));
  let reconciled=0,mismatches=0,skipped=0;
  for(const st of stmts){
    const stmtCurrency=String(st.currency||'').toUpperCase();
    if(!st.agreement_id){
      skipped++;
      await incident(s,`provider-revenue-unscoped:${st.id}`,'Provider revenue statement has no agreement_id; refusing to reconcile against every agreement of the provider',{provider_id:st.provider_id,period:st.period,statement_id:st.id});
      continue;
    }
    if(!stmtCurrency){
      skipped++;
      await incident(s,`provider-revenue-unscoped:${st.id}`,'Provider revenue statement has no currency; refusing to reconcile a currency-less amount',{provider_id:st.provider_id,period:st.period,agreement_id:st.agreement_id,statement_id:st.id});
      continue;
    }
    const rows=await s.entities.ProviderRevenueLedger.filter({provider_id:st.provider_id,agreement_id:st.agreement_id,period:st.period,currency:stmtCurrency},'-updated_at',5000).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueReconciliationWorker',fallback:[],severity:'critical'}));
    const productionRows=rows.filter((x:any)=>x.is_demo!==true);
    const expected=productionRows.reduce((a:number,x:any)=>a+Number(x.accrued_amount_minor||0),0);
    const reported=Number(st.reported_amount_minor||0);
    const delta=reported-expected;
    const tolerance=Math.max(100,Math.round(expected*.005));
    if(Math.abs(delta)<=tolerance){
      await s.entities.ProviderRevenueStatement.update(st.id,{status:'reconciled',reconciled_at:new Date().toISOString()});
      for(const r of productionRows.filter((x:any)=>['accrued','validation_pending'].includes(x.state)))
        await s.entities.ProviderRevenueLedger.update(r.id,{state:'validation_pending',provider_statement_id:st.id,updated_at:new Date().toISOString()});
      reconciled++;
    }else{
      await s.entities.ProviderRevenueStatement.update(st.id,{status:'mismatch',reconciled_at:new Date().toISOString()});
      await incident(s,`provider-revenue-mismatch:${st.id}`,'Provider revenue statement does not reconcile to CAMBRA attribution/accrual',{provider_id:st.provider_id,agreement_id:st.agreement_id,currency:stmtCurrency,period:st.period,expected_minor:expected,reported_minor:reported,delta_minor:delta,statement_id:st.id});
      await s.entities.Event.create({brand_id:'_platform',event_type:'PROVIDER_REVENUE_MISMATCH',source:'provider_revenue_reconciliation',entity_type:'ProviderRevenueStatement',entity_id:st.id,payload_json:{provider_id:st.provider_id,agreement_id:st.agreement_id,currency:stmtCurrency,period:st.period,expected_minor:expected,reported_minor:reported,delta_minor:delta},status:'processed',processed_at:new Date().toISOString()}).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueReconciliationWorker',fallback:null,severity:'critical'}));
      mismatches++;
    }
  }
  return Response.json({ok:true,reconciled,mismatches,skipped});
}catch(e){console.error(e);return Response.json({ok:false,error:'provider_revenue_reconciliation_failed'},{status:500})}});
