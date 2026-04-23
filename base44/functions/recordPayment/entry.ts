import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function computeStatus(total, paid) {
  if (paid <= 0) return 'due';
  if (paid > 0 && paid < total) return 'partially_paid';
  return 'paid';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    // For manual reconciliation require admin; webhooks may come without user
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { invoice_id, amount, processor = null, processor_ref = null, received_at = null, method = 'manual', note = null } = body || {};
    if (!invoice_id || !amount) return Response.json({ error: 'invoice_id and amount are required' }, { status: 400 });

    const rows = await base44.asServiceRole.entities.Invoice.filter({ id: invoice_id }, '-created_date', 1);
    const inv = rows?.[0];
    if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });
    const blockedStatuses = ['draft','void','refunded','failed'];
    if (blockedStatuses.includes(inv.status)) {
      return Response.json({ error: `Payments not allowed from status ${inv.status}` }, { status: 400 });
    }

    const total = Number(inv.total_amount || 0);
    const newPaid = Math.round(((Number(inv.amount_paid || 0) + Number(amount)) + Number.EPSILON) * 100) / 100;
    const newBalance = Math.max(0, Math.round(((total - newPaid) + Number.EPSILON) * 100) / 100);
    const newStatus = computeStatus(total, newPaid);

    const updated = await base44.asServiceRole.entities.Invoice.update(inv.id, {
      amount_paid: newPaid,
      balance_due: newBalance,
      status: newStatus,
      paid_at: newStatus === 'paid' ? (received_at || new Date().toISOString()) : inv.paid_at || null,
      billing_snapshot_json: { ...(inv.billing_snapshot_json||{}), last_payment_method: method }
    });

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || null,
      amount: Number(amount),
      currency: inv.currency || 'EUR',
      event_type: newStatus === 'paid' ? 'payment_succeeded' : 'payment_partially_succeeded',
      processor: processor,
      processor_ref: processor_ref,
      occurred_at: received_at || new Date().toISOString(),
      metadata_json: { method, note }
    });

    if (inv.monthly_savings_report_id) {
      const target = newStatus === 'paid' ? 'paid' : 'invoiced';
      await base44.asServiceRole.entities.MonthlySavingsReport.update(inv.monthly_savings_report_id, { status: target });
    }

    return Response.json({ invoice: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});