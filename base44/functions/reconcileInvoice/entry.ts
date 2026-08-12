import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { invoice_id, target_status, adjustments = null, reason = '' } = body || {};
    if (!invoice_id || !target_status) return Response.json({ error: 'invoice_id and target_status are required' }, { status: 400 });

    const rows = await base44.asServiceRole.entities.Invoice.filter({ id: invoice_id }, '-created_date', 1);
    const inv = rows?.[0];
    if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    // P6 — finalized Recover invoices are Stripe-authoritative. Local status or
    // amount overrides would create a second ledger and can no longer be used.
    if (inv.monthly_savings_report_id && inv.payment_provider === 'stripe') {
      return Response.json({ error: 'recover_stripe_invoice_is_processor_authoritative', use: 'reconcileRecoverBilling' }, { status: 409 });
    }
    // Enforce valid state transitions
    const ALLOWED = {
      draft: ['issued','void'],
      issued: ['sent','void','failed','due','disputed'],
      sent: ['due','void','failed','disputed'],
      due: ['overdue','void','failed','disputed'],
      overdue: ['paid','void','failed','disputed'],
      partially_paid: ['paid','void','failed','disputed'],
      paid: ['refunded'],
      failed: [],
      void: [],
      disputed: []
    };
    const allowedNext = ALLOWED[inv.status] || [];
    if (!allowedNext.includes(target_status)) {
      return Response.json({ error: `Invalid transition ${inv.status} -> ${target_status}` }, { status: 400 });
    }

    const patch: Record<string, unknown> = { status: target_status };
    if (adjustments && (typeof adjustments.amount_delta === 'number' || typeof adjustments.tax_delta === 'number')) {
      // Finalized/issued invoices are immutable. Legacy draft-only adjustment
      // remains available for non-Recover invoices before legal issuance.
      if (inv.status !== 'draft') {
        return Response.json({ error: 'finalized_invoice_amounts_are_immutable_use_credit_note_or_corrective_invoice' }, { status: 409 });
      }
      const subtotal = Number(inv.subtotal_amount || 0) + Number(adjustments.amount_delta || 0);
      const tax = Number(inv.tax_amount || 0) + Number(adjustments.tax_delta || 0);
      const total = subtotal + tax;
      const balance_due = Math.max(0, total - Number(inv.amount_paid || 0));
      Object.assign(patch, { subtotal_amount: subtotal, tax_amount: tax, total_amount: total, balance_due });
    }

    if (target_status === 'refunded') {
      patch.paid_at = null;
    }

    const updated = await base44.asServiceRole.entities.Invoice.update(inv.id, patch);

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || null,
      amount: 0,
      currency: inv.currency || 'EUR',
      event_type: 'status_overridden',
      occurred_at: new Date().toISOString(),
      metadata_json: { target_status, reason, adjustments }
    });

    if (inv.monthly_savings_report_id) {
      if (target_status === 'void' || target_status === 'failed') {
        await base44.asServiceRole.entities.MonthlySavingsReport.update(inv.monthly_savings_report_id, { status: 'calculated' });
      }
    }

    return Response.json({ invoice: updated });
  } catch (error) {
    return internalErrorResponse(error, 'reconcileInvoice');
  }
});