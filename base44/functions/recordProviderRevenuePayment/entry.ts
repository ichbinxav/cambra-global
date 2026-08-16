import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { assertEmergencyEpochUnchanged, captureEmergencyEpoch } from '../../shared/operationalControl.ts';

Deno.serve(async (req) => {
  try {
    const base44=createClientFromRequest(req), body=await req.json().catch(()=>({}));
    const gate=await requireAdminOrInternal(req,base44,body);
    if(!gate.ok)return gate.response || Response.json({ok:false,error:'forbidden'},{status:403});
    const svc=base44.asServiceRole;
    const epoch=await captureEmergencyEpoch(svc,'billing_issuance');
    const inv=await svc.entities.ProviderRevenueInvoice.get(String(body.invoice_id||'')).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenuePayment',fallback:null,severity:'critical'}));
    if(!inv)return Response.json({ok:false,error:'provider_revenue_invoice_not_found'},{status:404});
    const amount=Math.max(0,Number(body.amount_minor||0)), ref=String(body.payment_ref||'').trim(), evidence=String(body.evidence_reference||'').trim();
    if(!amount||!ref||!evidence)return Response.json({ok:false,error:'amount_payment_ref_and_evidence_required'},{status:400});
    const prior=await svc.entities.ProviderRevenueInvoice.filter({payment_ref:ref},'-updated_at',10).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenuePayment',fallback:[],severity:'critical'}));
    if(prior.some((row:any)=>row.id!==inv.id))return Response.json({ok:false,error:'duplicate_provider_payment_ref'},{status:409});
    const paid=Math.min(Number(inv.amount_minor||0),Number(inv.paid_amount_minor||0)+amount), status=paid>=Number(inv.amount_minor||0)?'paid':'partially_paid', now=new Date().toISOString();
    const rows=await svc.entities.ProviderRevenueLedger.filter({agreement_id:inv.agreement_id,provider_id:inv.provider_id,period:inv.period},'-updated_at',5000).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenuePayment',fallback:[],severity:'critical'}));
    await assertEmergencyEpochUnchanged(svc,epoch,'before_provider_revenue_payment_record');
    await svc.entities.ProviderRevenueInvoice.update(inv.id,{paid_amount_minor:paid,payment_ref:ref,status,paid_at:status==='paid'?now:undefined,updated_at:now});
    try {
      let remaining=paid;
      for(const row of rows){const due=Math.max(0,Number(row.accrued_amount_minor||0)),apply=Math.min(due,remaining);remaining-=apply;await svc.entities.ProviderRevenueLedger.update(row.id,{paid_amount_minor:apply,provider_payment_ref:ref,state:apply>=due&&due>0?'paid':apply>0?'partially_paid':row.state,updated_at:now});}
      await assertEmergencyEpochUnchanged(svc,epoch,'after_provider_revenue_payment_record');
    } catch(error:any) {
      // This function records evidence; it does not initiate the payment. Its
      // local changes are reversible, so restore the exact prior mirrors and
      // require an operator to retry under a new epoch.
      await svc.entities.ProviderRevenueInvoice.update(inv.id,{paid_amount_minor:Number(inv.paid_amount_minor||0),payment_ref:inv.payment_ref||undefined,status:inv.status,paid_at:inv.paid_at||undefined,updated_at:new Date().toISOString()}).catch((rollbackError:any)=>safeBestEffort(rollbackError,{operation:'recordProviderRevenuePayment.restore_invoice_after_epoch_race',fallback:null,severity:'critical'}));
      for(const row of rows)await svc.entities.ProviderRevenueLedger.update(row.id,{paid_amount_minor:Number(row.paid_amount_minor||0),provider_payment_ref:row.provider_payment_ref||undefined,state:row.state,updated_at:new Date().toISOString()}).catch((rollbackError:any)=>safeBestEffort(rollbackError,{operation:'recordProviderRevenuePayment.restore_ledger_after_epoch_race',fallback:null,severity:'critical'}));
      return Response.json({ok:false,error:'provider_revenue_payment_epoch_race_retry_required',invoice_id:inv.id,retry_required:true,detail:String(error?.message||error)},{status:409});
    }
    await svc.entities.Event.create({brand_id:'_platform',event_type:'PROVIDER_REVENUE_PAID',source:'provider_revenue_payment',entity_type:'ProviderRevenueInvoice',entity_id:inv.id,payload_json:{provider_id:inv.provider_id,agreement_id:inv.agreement_id,period:inv.period,amount_minor:amount,total_paid_minor:paid,status,payment_ref:ref,evidence_reference:evidence},status:'processed',processed_at:now}).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenuePayment',fallback:null,severity:'critical'}));
    return Response.json({ok:true,invoice_id:inv.id,status,paid_amount_minor:paid});
  } catch(error:any) {
    console.error(error);
    const emergency=String(error?.message||'').startsWith('emergency_control_');
    return Response.json({ok:false,error:emergency?String(error.message):'provider_revenue_payment_failed'},{status:emergency?409:500});
  }
});
