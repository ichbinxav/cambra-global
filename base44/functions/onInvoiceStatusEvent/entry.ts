import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const statusToEvent = (status) => {
  switch (status) {
    case 'issued': return 'invoice_issued';
    case 'sent': return 'invoice_sent';
    case 'paid': return 'payment_succeeded';
    case 'overdue': return 'marked_overdue';
    case 'void': return 'status_overridden';
    default: return null;
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me().catch(() => null);

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
      amount: data.total_amount || data.amount || 0,
      currency: data.currency || 'EUR',
      event_type: evType,
      processor: data.payment_provider || null,
      processor_ref: data.processor_payment_intent_id || null,
      occurred_at: new Date().toISOString(),
      metadata_json: { from_status: old?.status, to_status: data.status }
    });

    return Response.json({ status: 'ok' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});