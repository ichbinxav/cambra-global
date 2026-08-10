// refreshPaymentMethodStatus — RECOVER-2 (2026-08-03).
//
//
// Reads the activation's SetupIntent FROM STRIPE and records the outcome. This
// exists because "the merchant's browser said the setup succeeded" is not proof:
// only Stripe's own view of the intent decides whether CAMBRA can charge later.
// payment_method_status → 'ready' is therefore written HERE, never from a client
// payload, and never by startPaymentMethodSetup.
//
// Idempotent by construction: it derives state from Stripe on every call, so it
// can be invoked on page load, after a redirect, or twice in a row, safely. When
// the Stripe webhook lands it will call the same logic — which is why the write
// is a plain projection of the intent's status and not a state machine.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { resolveBillingMode, assertBillingAccount, stripeRequest } from '../../shared/stripeBilling.ts';
import { resolveOwnedActivation } from '../../shared/recoverAcceptance.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;
    const owned = await resolveOwnedActivation(svc, user, String(body?.deal_activation_id || ''));
    if (!owned.ok) return Response.json({ error: owned.error }, { status: owned.status });

    const { activation } = owned;
    if (!activation.stripe_setup_intent_id) {
      return Response.json({ payment_method_status: activation.payment_method_status || 'none', setup_intent_id: null });
    }

    const mode = resolveBillingMode();
    // A stored intent from the other mode does not exist in this one. Say so
    // instead of reporting a misleading 'failed'.
    if (activation.stripe_billing_mode && activation.stripe_billing_mode !== mode) {
      return Response.json({ error: 'stripe_mode_changed: payment setup must be redone in this environment', mode }, { status: 409 });
    }
    await assertBillingAccount(mode);

    const { ok, status, data } = await stripeRequest(mode, 'GET', `setup_intents/${activation.stripe_setup_intent_id}`);
    if (!ok) {
      console.error('refreshPaymentMethodStatus Stripe read failed', status, data?.error?.type || 'unknown');
      return Response.json({ error: 'stripe_setup_status_unavailable' }, { status: 502 });
    }

    const patch: Record<string, unknown> = {};
    if (data.status === 'succeeded' && data.payment_method) {
      if (activation.payment_method_status !== 'ready') {
        patch.payment_method_status = 'ready';
        patch.payment_method_ready_at = new Date().toISOString();
      }
      if (activation.stripe_payment_method_id !== data.payment_method) {
        patch.stripe_payment_method_id = data.payment_method;
      }
    } else if (data.status === 'canceled' || data.last_setup_error) {
      if (activation.payment_method_status !== 'failed') patch.payment_method_status = 'failed';
    }

    if (Object.keys(patch).length) await svc.entities.DealActivation.update(activation.id, patch);

    return Response.json({
      mode,
      setup_intent_id: data.id,
      setup_intent_status: data.status,
      payment_method_status: patch.payment_method_status || activation.payment_method_status || 'setup_started',
      error_message: data.last_setup_error?.message || null,
    });
  } catch (error) {
    console.error('refreshPaymentMethodStatus failed', error);
    return Response.json({ error: 'payment_method_refresh_failed' }, { status: 500 });
  }
}