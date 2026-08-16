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
    const inv=await svc.entities.ProviderRevenueInvoice.get(String(body.invoice_id||'')).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenueInvoiceIssued',fallback:null,severity:'critical'}));
    if(!inv)return Response.json({ok:false,error:'provider_revenue_invoice_not_found'},{status:404});
    if(inv.mode!=='cambra_invoice')return Response.json({ok:false,error:'cambra_invoice_mode_required'},{status:409});
    const number=String(body.external_invoice_number||'').trim(), documentId=String(body.source_document_id||'').trim();
    if(!number||!documentId)return Response.json({ok:false,error:'externally_valid_invoice_number_and_document_required'},{status:400});
    const duplicate=await svc.entities.ProviderRevenueInvoice.filter({external_invoice_number:number},'-updated_at',10).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenueInvoiceIssued',fallback:[],severity:'critical'}));
    if(duplicate.some((row:any)=>row.id!==inv.id))return Response.json({ok:false,error:'duplicate_provider_invoice_number'},{status:409});
    const now=new Date().toISOString();
    const rows=await svc.entities.ProviderRevenueLedger.filter({agreement_id:inv.agreement_id,provider_id:inv.provider_id,period:inv.period},'-updated_at',5000).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenueInvoiceIssued',fallback:[],severity:'critical'}));
    await assertEmergencyEpochUnchanged(svc,epoch,'before_provider_revenue_invoice_issuance_record');
    await svc.entities.ProviderRevenueInvoice.update(inv.id,{external_invoice_number:number,source_document_id:documentId,status:'payment_pending',issued_at:now,updated_at:now});
    try {
      for(const row of rows)await svc.entities.ProviderRevenueLedger.update(row.id,{state:'payment_pending',invoiced_amount_minor:Number(row.accrued_amount_minor||0),updated_at:now});
      await assertEmergencyEpochUnchanged(svc,epoch,'after_provider_revenue_invoice_issuance_record');
    } catch(error:any) {
      // The externally valid document remains referenced, but no automatic
      // payment-state transition may survive a STOP race without review.
      await svc.entities.ProviderRevenueInvoice.update(inv.id,{external_invoice_number:number,source_document_id:documentId,status:'validation_pending',issued_at:undefined,updated_at:new Date().toISOString()}).catch((containmentError:any)=>safeBestEffort(containmentError,{operation:'recordProviderRevenueInvoiceIssued.mark_invoice_validation_pending',fallback:null,severity:'critical'}));
      for(const row of rows)await svc.entities.ProviderRevenueLedger.update(row.id,{state:'validation_pending',invoiced_amount_minor:Number(row.invoiced_amount_minor||0),updated_at:new Date().toISOString()}).catch((containmentError:any)=>safeBestEffort(containmentError,{operation:'recordProviderRevenueInvoiceIssued.mark_ledger_validation_pending',fallback:null,severity:'critical'}));
      return Response.json({ok:false,error:'provider_revenue_invoice_issuance_epoch_race_review_required',invoice_id:inv.id,review_required:true,detail:String(error?.message||error)},{status:409});
    }
    await svc.entities.Event.create({brand_id:'_platform',event_type:'PROVIDER_REVENUE_INVOICED',source:'provider_revenue_invoice_issuance',entity_type:'ProviderRevenueInvoice',entity_id:inv.id,payload_json:{provider_id:inv.provider_id,agreement_id:inv.agreement_id,period:inv.period,amount_minor:inv.amount_minor,invoice_number:number,source_document_id:documentId},status:'processed',processed_at:now}).catch((error:any)=>safeBestEffort(error,{operation:'recordProviderRevenueInvoiceIssued',fallback:null,severity:'critical'}));
    return Response.json({ok:true,invoice_id:inv.id,status:'payment_pending',external_invoice_number:number});
  } catch(error:any) {
    console.error(error);
    const emergency=String(error?.message||'').startsWith('emergency_control_');
    return Response.json({ok:false,error:emergency?String(error.message):'provider_revenue_invoice_issuance_failed'},{status:emergency?409:500});
  }
});
