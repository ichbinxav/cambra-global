import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Stripe from 'npm:stripe@14.25.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { invoice_id, success_url = '/', cancel_url = '/' } = body || {};
    if (!invoice_id) return Response.json({ error: 'invoice_id is required' }, { status: 400 });

    const rows = await base44.asServiceRole.entities.Invoice.filter({ id: invoice_id }, '-created_date', 1);
    const inv = rows?.[0];
    if (!inv) return Response.json({ error: 'Invoice not found' }, { status: 404 });

    const key = Deno.env.get('STRIPE_API_KEY');
    if (!key) {
      return Response.json({ error: 'payment_provider_not_configured', details: 'Set STRIPE_API_KEY to enable Stripe payment links.' }, { status: 400 });
    }

    const stripe = new Stripe(key, { apiVersion: '2023-10-16' });

    const amountCents = Math.round((inv.total_amount || inv.amount || 0) * 100);
    if (!amountCents || amountCents <= 0) return Response.json({ error: 'Invalid invoice amount' }, { status: 400 });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: (inv.currency || 'eur').toLowerCase(),
          product_data: { name: `Invoice ${inv.invoice_number || inv.id}` },
          unit_amount: amountCents
        },
        quantity: 1
      }],
      metadata: { invoice_id: String(inv.id) },
      success_url,
      cancel_url
    });

    const updated = await base44.asServiceRole.entities.Invoice.update(inv.id, {
      payment_provider: 'stripe',
      hosted_invoice_url: session.url,
      billing_snapshot_json: { ...(inv.billing_snapshot_json||{}), stripe_checkout_session_id: session.id },
      status: inv.status === 'issued' ? 'sent' : inv.status
    });

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || null,
      amount: inv.total_amount || inv.amount || 0,
      currency: inv.currency || 'EUR',
      event_type: 'payment_link_created',
      processor: 'stripe',
      processor_ref: session.id,
      occurred_at: new Date().toISOString()
    });

    return Response.json({ url: session.url, session_id: session.id, invoice: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});