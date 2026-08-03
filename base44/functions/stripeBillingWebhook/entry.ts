// stripeBillingWebhook — RECOVER-2 (2026-08-03).
//
//
// Receives events from CAMBRA's OWN Stripe billing account. PUBLIC endpoint: it is
// called by Stripe, not by a logged-in user, so there is no session to check —
// authenticity comes ENTIRELY from the signature. Anyone can reach this URL;
// nothing here runs before the signature is verified against the mode's secret.
//
// WHY THIS EXISTS AT ALL (the browser flow already works): it covers what happens
// when the merchant is no longer watching — a 3-D Secure that resolves after the
// tab is closed, a card that stops working months later, and later the invoice
// events once we actually charge. Without it, those states only heal if the
// merchant happens to come back.
//
// SCOPE, on purpose: setup_intent outcomes only. Invoice events land here when
// invoicing ships — adding handlers for events we do not yet emit would be
// untested code guarding real money.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.7.0';
import { resolveBillingMode, getSecretKey } from '../../shared/stripeBilling.ts';
import { getWebhookSecret } from '../../shared/stripeWebhookSecret.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const signature = req.headers.get('stripe-signature') || '';
    const rawBody = await req.text();
    if (!signature) return Response.json({ error: 'missing_signature' }, { status: 400 });

    const mode = resolveBillingMode();
    const stripe = new Stripe(getSecretKey(mode));

    let event: any;
    try {
      // MUST be the async variant: Web Crypto is async in this runtime, and the
      // synchronous constructEvent() throws "SubtleCryptoProvider cannot be used
      // in a synchronous context".
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, getWebhookSecret(mode));
    } catch (err) {
      // 400 with no side effects: an unverified payload is not evidence of anything.
      return Response.json({ error: `signature_invalid: ${(err as Error).message}` }, { status: 400 });
    }

    // A sandbox event must never be honoured as a live one, or vice versa.
    const eventIsLive = event.livemode === true;
    if (eventIsLive !== (mode === 'live')) {
      return Response.json({ ignored: 'livemode_mismatch', mode, livemode: event.livemode });
    }

    const handled = ['setup_intent.succeeded', 'setup_intent.setup_failed'];
    if (!handled.includes(event.type)) {
      // 200 on purpose — Stripe retries non-2xx, and an event we don't handle is
      // not a failure.
      return Response.json({ ignored: event.type });
    }

    const intent = event.data?.object || {};
    const svc = createClientFromRequest(req).asServiceRole;
    const rows = await svc.entities.DealActivation
      .filter({ stripe_setup_intent_id: intent.id }, '-created_date', 1)
      .catch(() => []);
    const activation = rows?.[0];
    if (!activation) return Response.json({ ignored: 'activation_not_found', setup_intent_id: intent.id });

    if (event.type === 'setup_intent.succeeded') {
      await svc.entities.DealActivation.update(activation.id, {
        payment_method_status: 'ready',
        stripe_payment_method_id: typeof intent.payment_method === 'string' ? intent.payment_method : '',
        stripe_billing_mode: mode,
        payment_method_ready_at: new Date().toISOString(),
      });
    } else {
      await svc.entities.DealActivation.update(activation.id, { payment_method_status: 'failed' });
    }

    return Response.json({ received: true, type: event.type, deal_activation_id: activation.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}