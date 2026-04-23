import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const statusToEvent = (status) => {
  switch (status) {
    case 'issued': return 'invoice_issued';
    case 'sent': return 'invoice_sent';
    case 'paid': return 'payment_succeeded';
    case 'partially_paid': return 'payment_partially_succeeded';
    case 'overdue': return 'marked_overdue';
    case 'refunded': return 'refund_issued';
    case 'void': return 'status_overridden';
    default: return null;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json();
    const event = payload?.event || {};
    const data = payload?.data || null;
    const old = payload?.old_data || null;

    if (event?.type !== 'update' || !data) return Response.json({ status: 'skipped' });

    const changed = (payload?.changed_fields || []);
    if (!changed.includes('status')) return Response.json({ status: 'skipped' });

    const evType = statusToEvent(data.status);
    if (!evType) return Response.json({ status: 'skipped' });

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: data.id,
      brand_id: data.brand_id || null,
      amount: data.total_amount || 0,
      currency: data.currency || 'EUR',
      event_type: evType,
      processor: data.payment_provider || null,
      processor_ref: data.processor_payment_intent_id || null,
      occurred_at: new Date().toISOString(),
      metadata_json: { from_status: old?.status, to_status: data.status }
    });

    // Sync linked report status (if automation is wired)
    if (data.monthly_savings_report_id) {
      let target = null;
      if (["issued","sent","due","overdue"].includes(data.status)) target = 'invoiced';
      else if (data.status === 'paid') target = 'paid';
      else if (data.status === 'refunded' || data.status === 'void') target = 'calculated';
      if (target) {
        await base44.asServiceRole.entities.MonthlySavingsReport.update(data.monthly_savings_report_id, { status: target });
      }
    }

    return Response.json({ status: 'ok' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});