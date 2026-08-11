import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { assertOperationAllowed } from '../../shared/operationalControl.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;
    try { await assertOperationAllowed(svc, 'billing_issuance'); }
    catch (error:any) { return Response.json({ ok:false, error:error?.message || 'emergency_control_paused:billing_issuance' }, { status:409 }); }

    const rows = await svc.entities.ProviderRevenueLedger.filter({ state:{ $in:['accrued','validation_pending'] } }, '-updated_at', 3000).catch(() => []);
    let prepared = 0, blocked = 0;
    const groups = new Map<string,any[]>();
    for (const row of rows) {
      const key = `${row.agreement_id}|${row.provider_id}|${row.period}|${row.currency}`;
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    for (const [key, items] of groups) {
      const agreement = await svc.entities.DynamicAgreement.get(items[0].agreement_id).catch(() => null);
      if (!agreement || agreement.provider_compensation_legal_status !== 'approved' || agreement.provider_compensation_activation_allowed !== true) { blocked++; continue; }
      const legal = agreement.provider_compensation_terms_json?.legal_review || {};
      const mode = String(legal.settlement_mode || '');
      if (!['cambra_invoice','provider_self_billing','other_contractual_settlement'].includes(mode) || !legal.tax_treatment_reference || !legal.legal_opinion_reference) { blocked++; continue; }
      const amount = items.reduce((sum:number, row:any) => sum + Number(row.accrued_amount_minor || 0), 0);
      const invoiceKey = `provider-invoice:${key}`;
      const old = await svc.entities.ProviderRevenueInvoice.filter({ invoice_key:invoiceKey }, '-updated_at', 1).catch(() => []);
      if (old[0]) continue;
      const statements = await svc.entities.ProviderRevenueStatement.filter({ provider_id:items[0].provider_id, agreement_id:items[0].agreement_id, period:items[0].period, status:'reconciled' }, '-reconciled_at', 1).catch(() => []);
      let status = 'validation_pending', externalNumber = '', sourceDocument = '', statementId = statements[0]?.id || '';
      if (mode === 'provider_self_billing' && statements[0]) {
        const line = Array.isArray(statements[0].line_items_json) ? statements[0].line_items_json.find((item:any) => item.external_invoice_number || item.self_billing_number) : null;
        externalNumber = String(line?.external_invoice_number || line?.self_billing_number || '');
        sourceDocument = String(statements[0].source_document_id || '');
        if (externalNumber && sourceDocument) status = 'payment_pending';
      }
      const invoice = await svc.entities.ProviderRevenueInvoice.create({ invoice_key:invoiceKey, provider_id:items[0].provider_id, agreement_id:items[0].agreement_id, period:items[0].period, currency:items[0].currency, mode, status, amount_minor:amount, paid_amount_minor:0, external_invoice_number:externalNumber || undefined, source_document_id:sourceDocument || undefined, provider_statement_id:statementId || undefined, tax_treatment_reference:legal.tax_treatment_reference, legal_authority_reference:legal.legal_opinion_reference, issued_at:status === 'payment_pending' ? new Date().toISOString() : undefined, updated_at:new Date().toISOString() });
      for (const row of items) await svc.entities.ProviderRevenueLedger.update(row.id, { state:status === 'payment_pending' ? 'payment_pending' : 'validation_pending', invoiced_amount_minor:status === 'payment_pending' ? Number(row.accrued_amount_minor || 0) : 0, updated_at:new Date().toISOString() });
      await svc.entities.Event.create({ brand_id:'_platform', event_type:'PROVIDER_REVENUE_INVOICED', source:'provider_revenue_billing', entity_type:'ProviderRevenueInvoice', entity_id:invoice.id, payload_json:{ provider_id:items[0].provider_id, agreement_id:items[0].agreement_id, period:items[0].period, amount_minor:amount, mode, status, no_invented_invoice_number:true }, status:'processed', processed_at:new Date().toISOString() }).catch(() => null);
      prepared++;
    }
    return Response.json({ ok:true, prepared, blocked, note:'CAMBRA-issued invoices remain validation_pending until an externally valid invoice number/document is supplied; provider self-billing may advance only with reconciled statement evidence.' });
  } catch (error) {
    console.error(error);
    return Response.json({ ok:false, error:'provider_revenue_billing_failed' }, { status:500 });
  }
});
