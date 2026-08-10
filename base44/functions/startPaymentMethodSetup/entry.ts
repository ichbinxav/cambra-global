// startPaymentMethodSetup — RECOVER-2 (2026-08-03).
//
//
// Prepares the merchant to pay future success-fee invoices: ensures a Stripe
// Customer exists for their Brand in CAMBRA's OWN billing account, and returns a
// SetupIntent client_secret the browser can confirm with Stripe.js.
//
// WHAT THIS FUNCTION DELIBERATELY DOES NOT DO
//  • It does not charge anything. A SetupIntent stores a payment method for
//    FUTURE use; the success fee is invoiced later, against verified savings.
//  • It does not mark the activation as ready. Completion is proven by reading
//    the SetupIntent server-side (refreshPaymentMethodStatus) — a browser saying
//    "it worked" is not evidence.
//  • It never touches the merchant's own Stripe (StripeConnection / read-only
//    OAuth). Those two relationships never cross (see shared/stripeBilling.ts).
//
// ORDER OF OPERATIONS: the mandate comes first. Collecting a payment method for
// an activation with no ACTIVE mandate would be collecting means of payment for
// something the merchant has not authorized, so that is refused with 409.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
  resolveBillingMode,
  assertBillingAccount,
  getPublishableKey,
  stripeRequest,
} from '../../shared/stripeBilling.ts';
import { resolveOwnedActivation } from '../../shared/recoverAcceptance.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dealActivationId = String(body?.deal_activation_id || '');

    const svc = base44.asServiceRole;
    const owned = await resolveOwnedActivation(svc, user, dealActivationId);
    if (!owned.ok) return Response.json({ error: owned.error }, { status: owned.status });

    const { activation, brand } = owned;
    if (!brand) return Response.json({ error: 'brand_not_found' }, { status: 404 });

    // Mandate first — no authorization, no payment method.
    const mandates = await svc.entities.Mandate.filter(
      { deal_activation_id: activation.id, status: 'active' }, '-created_date', 1,
    ).catch(() => []);
    if (!mandates?.length) {
      return Response.json({ error: 'mandate_not_active' }, { status: 409 });
    }

    const mode = resolveBillingMode();
    // Fails loudly if the configured key is not CAMBRA's billing account for this
    // mode — the check that already caught one wrong key.
    await assertBillingAccount(mode);

    // Reuse the Brand's Customer only when it belongs to THIS mode: a sandbox
    // customer id does not exist in live, and vice versa.
    let customerId = brand.stripe_billing_mode === mode ? (brand.stripe_customer_id || '') : '';
    if (customerId) {
      const check = await stripeRequest(mode, 'GET', `customers/${customerId}`);
      if (!check.ok || check.data?.deleted) customerId = '';
    }

    if (!customerId) {
      const created = await stripeRequest(mode, 'POST', 'customers', {
        name: brand.name || 'CAMBRA merchant',
        ...(brand.contact_email ? { email: brand.contact_email } : {}),
        'metadata[brand_id]': brand.id,
        'metadata[app]': 'cambra',
      }, `cambra-customer-${brand.id}-${mode}`);
      if (!created.ok) {
        console.error('startPaymentMethodSetup Stripe customer creation failed', created.status, created.data?.error?.type || 'unknown');
        return Response.json({ error: 'stripe_customer_unavailable' }, { status: 502 });
      }
      customerId = created.data.id;
      await svc.entities.Brand.update(brand.id, { stripe_customer_id: customerId, stripe_billing_mode: mode });
    }

    // Resume the existing SetupIntent while it is still usable, so a page reload
    // does not create a new intent every time.
    let intent: any = null;
    if (activation.stripe_setup_intent_id && activation.stripe_billing_mode === mode) {
      const existing = await stripeRequest(mode, 'GET', `setup_intents/${activation.stripe_setup_intent_id}`);
      const reusable = existing.ok
        && existing.data?.customer === customerId
        && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(existing.data?.status);
      if (reusable) intent = existing.data;
    }

    if (!intent) {
      const createdIntent = await stripeRequest(mode, 'POST', 'setup_intents', {
        customer: customerId,
        usage: 'off_session',
        'payment_method_types[0]': 'card',
        'metadata[deal_activation_id]': activation.id,
        'metadata[brand_id]': brand.id,
      });
      if (!createdIntent.ok) {
        console.error('startPaymentMethodSetup SetupIntent creation failed', createdIntent.status, createdIntent.data?.error?.type || 'unknown');
        return Response.json({ error: 'stripe_setup_unavailable' }, { status: 502 });
      }
      intent = createdIntent.data;
    }

    await svc.entities.DealActivation.update(activation.id, {
      stripe_setup_intent_id: intent.id,
      stripe_billing_mode: mode,
      payment_method_status: activation.payment_method_status === 'ready' ? 'ready' : 'setup_started',
    });

    return Response.json({
      mode,
      publishable_key: getPublishableKey(mode),
      customer_id: customerId,
      setup_intent_id: intent.id,
      client_secret: intent.client_secret,
      status: intent.status,
    });
  } catch (error) {
    console.error('startPaymentMethodSetup failed', error);
    return Response.json({ error: 'payment_method_setup_failed' }, { status: 500 });
  }
}