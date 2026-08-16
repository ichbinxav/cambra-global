import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { assertEmergencyEpochUnchanged, captureEmergencyEpoch } from '../../shared/operationalControl.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';

guardedScheduledServe({"worker_key":"providerRevenueBillingWorker","cadence_seconds":300},createClientFromRequest,async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response || Response.json({ ok:false, error:'forbidden' }, { status:403 });
    const svc = base44.asServiceRole;
    let billingEpoch:any;
    try { billingEpoch=await captureEmergencyEpoch(svc, 'billing_issuance'); }
    catch (error:any) { return Response.json({ ok:false, error:error?.message || 'emergency_control_paused:billing_issuance' }, { status:409 }); }

    const rows = await svc.entities.ProviderRevenueLedger.filter({ state:{ $in:['accrued','validation_pending'] } }, '-updated_at', 3000).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueBillingWorker',fallback:[],severity:'critical'}));
    let prepared = 0, blocked = 0, reviewRequired = 0;
    const groups = new Map<string,any[]>();
    for (const row of rows) {
      const key = `${row.agreement_id}|${row.provider_id}|${row.period}|${row.currency}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    for (const [key, items] of groups) {
      const agreement = await svc.entities.DynamicAgreement.get(items[0].agreement_id).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueBillingWorker',fallback:null,severity:'critical'}));
      if (!agreement || agreement.provider_compensation_legal_status !== 'approved' || agreement.provider_compensation_activation_allowed !== true) { blocked++; continue; }
      const legal = agreement.provider_compensation_terms_json?.legal_review || {};
      const mode = String(legal.settlement_mode || '');
      if (!['cambra_invoice','provider_self_billing','other_contractual_settlement'].includes(mode) || !legal.tax_treatment_reference || !legal.legal_opinion_reference) { blocked++; continue; }
      const amount = items.reduce((sum:number, row:any) => sum + Number(row.accrued_amount_minor || 0), 0);
      const invoiceKey = `provider-invoice:${key}`;
      const old = await svc.entities.ProviderRevenueInvoice.filter({ invoice_key:invoiceKey }, '-updated_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueBillingWorker',fallback:[],severity:'critical'}));
      if (old[0]) continue;
      const statements = await svc.entities.ProviderRevenueStatement.filter({ provider_id:items[0].provider_id, agreement_id:items[0].agreement_id, period:items[0].period, status:'reconciled' }, '-reconciled_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueBillingWorker',fallback:[],severity:'critical'}));
      let status = 'validation_pending', externalNumber = '', sourceDocument = '', statementId = statements[0]?.id || '';
      if (mode === 'provider_self_billing' && statements[0]) {
        const line = Array.isArray(statements[0].line_items_json) ? statements[0].line_items_json.find((item:any) => item.external_invoice_number || item.self_billing_number) : null;
        externalNumber = String(line?.external_invoice_number || line?.self_billing_number || '');
        sourceDocument = String(statements[0].source_document_id || '');
        if (externalNumber && sourceDocument) status = 'payment_pending';
      }
      await assertEmergencyEpochUnchanged(svc,billingEpoch,`before_provider_revenue_invoice:${invoiceKey}`);
      const invoice = await svc.entities.ProviderRevenueInvoice.create({ invoice_key:invoiceKey, provider_id:items[0].provider_id, agreement_id:items[0].agreement_id, period:items[0].period, currency:items[0].currency, mode, status, amount_minor:amount, paid_amount_minor:0, external_invoice_number:externalNumber || undefined, source_document_id:sourceDocument || undefined, provider_statement_id:statementId || undefined, tax_treatment_reference:legal.tax_treatment_reference, legal_authority_reference:legal.legal_opinion_reference, issued_at:status === 'payment_pending' ? new Date().toISOString() : undefined, updated_at:new Date().toISOString() });
      try { await assertEmergencyEpochUnchanged(svc,billingEpoch,`after_provider_revenue_invoice:${invoiceKey}`); }
      catch {
        await svc.entities.ProviderRevenueInvoice.update(invoice.id,{status:'validation_pending',updated_at:new Date().toISOString()}).catch((containmentError:any)=>safeBestEffort(containmentError,{operation:'providerRevenueBillingWorker.mark_epoch_race_validation_pending',fallback:null,severity:'critical'}));
        blocked++;
        reviewRequired++;
        continue;
      }
      for (const row of items) await svc.entities.ProviderRevenueLedger.update(row.id, { state:status === 'payment_pending' ? 'payment_pending' : 'validation_pending', invoiced_amount_minor:status === 'payment_pending' ? Number(row.accrued_amount_minor || 0) : 0, updated_at:new Date().toISOString() });
      await svc.entities.Event.create({ brand_id:'_platform', event_type:'PROVIDER_REVENUE_INVOICED', source:'provider_revenue_billing', entity_type:'ProviderRevenueInvoice', entity_id:invoice.id, payload_json:{ provider_id:items[0].provider_id, agreement_id:items[0].agreement_id, period:items[0].period, amount_minor:amount, mode, status, no_invented_invoice_number:true }, status:'processed', processed_at:new Date().toISOString() }).catch((error:any)=>safeBestEffort(error,{operation:'providerRevenueBillingWorker',fallback:null,severity:'critical'}));
      prepared++;
    }
    return Response.json({ ok:true, prepared, blocked, review_required:reviewRequired, note:'CAMBRA-issued invoices remain validation_pending until an externally valid invoice number/document is supplied; provider self-billing may advance only with reconciled statement evidence.' });
  } catch (error) {
    console.error(error);
    return Response.json({ ok:false, error:'provider_revenue_billing_failed' }, { status:500 });
  }
});
