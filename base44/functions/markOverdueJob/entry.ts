import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Allow scheduled/service calls; block non-admin interactive calls
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    // Scheduled job, no end-user auth required; operate with service role
    const nowIso = new Date().toISOString();

    const batch = await base44.asServiceRole.entities.Invoice.filter({ status: ['sent','due','partially_paid'] }, '-due_at', 500);
    const overdue = (batch || []).filter(i => i.due_at && new Date(i.due_at).getTime() < Date.now());

    for (const inv of overdue) {
      await base44.asServiceRole.entities.Invoice.update(inv.id, { status: 'overdue' });
      await base44.asServiceRole.entities.PaymentEvent.create({
        invoice_id: inv.id,
        brand_id: inv.brand_id || null,
        amount: inv.balance_due || (inv.total_amount || 0),
        currency: inv.currency || 'EUR',
        event_type: 'marked_overdue',
        occurred_at: nowIso
      });
    }

    return Response.json({ updated: overdue.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});