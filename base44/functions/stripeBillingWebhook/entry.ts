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
// SCOPE: setup_intent outcomes (RECOVER-2) + the invoice lifecycle
// (RECOVER-4: finalized/sent/paid/payment_failed/payment_action_required/
// voided, disputes, credit notes). Invoice events are deduplicated per Stripe
// event.id and verified against the local Invoice's customer before any state
// moves.
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

    const svc = createClientFromRequest(req).asServiceRole;

    // ── Setup intents (RECOVER-2) ─────────────────────────────────────────
    if (event.type === 'setup_intent.succeeded' || event.type === 'setup_intent.setup_failed') {
      const intent = event.data?.object || {};
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
    }

    // ── Invoice lifecycle (RECOVER-4) ─────────────────────────────────────
    // Deduplicated per Stripe event.id: a replayed webhook produces zero new
    // rows and re-applies nothing. Relations are verified (local invoice ↔
    // stripe invoice ↔ customer) before any state moves; an event for another
    // account's object simply doesn't resolve and is ignored.
    const INVOICE_EVENTS: Record<string, string> = {
      'invoice.finalized': 'invoice_issued',
      'invoice.sent': 'invoice_sent',
      'invoice.paid': 'payment_succeeded',
      'invoice.payment_failed': 'payment_failed',
      'invoice.payment_action_required': 'payment_action_required',
      'invoice.voided': 'invoice_voided',
      'charge.dispute.created': 'dispute_created',
      'credit_note.created': 'credit_note_created',
    };
    if (!(event.type in INVOICE_EVENTS)) {
      // 200 on purpose — Stripe retries non-2xx, and an event we don't handle
      // is not a failure.
      return Response.json({ ignored: event.type });
    }

    const obj = event.data?.object || {};
    // Resolve the Stripe invoice id for each event family.
    const stripeInvoiceId =
      event.type.startsWith('invoice.') ? obj.id
      : event.type === 'credit_note.created' ? (typeof obj.invoice === 'string' ? obj.invoice : '')
      : /* charge.dispute.created */ (typeof obj.charge === 'string' ? '' : '') || (typeof obj.invoice === 'string' ? obj.invoice : '');

    // Prefer metadata (we always set local_invoice_id), fall back to lookup.
    let inv: any = null;
    const metaLocal = obj.metadata?.local_invoice_id || obj.lines?.data?.[0]?.metadata?.local_invoice_id || '';
    if (metaLocal) {
      inv = (await svc.entities.Invoice.filter({ id: metaLocal }, '-created_date', 1).catch(() => []))?.[0] || null;
    }
    if (!inv && stripeInvoiceId) {
      inv = (await svc.entities.Invoice.filter({ stripe_invoice_id: stripeInvoiceId }, '-created_date', 1).catch(() => []))?.[0] || null;
    }
    if (!inv && event.type === 'charge.dispute.created' && typeof obj.payment_intent === 'string') {
      inv = (await svc.entities.Invoice.filter({ processor_payment_intent_id: obj.payment_intent }, '-created_date', 1).catch(() => []))?.[0] || null;
    }
    if (!inv) return Response.json({ ignored: 'local_invoice_not_found', type: event.type });

    // Cross-account/customer guard: the Stripe customer on the event must be
    // the one this local invoice was issued to.
    const evCustomer = typeof obj.customer === 'string' ? obj.customer : '';
    if (evCustomer && inv.processor_customer_id && evCustomer !== inv.processor_customer_id) {
      return Response.json({ ignored: 'customer_mismatch' });
    }

    // Idempotency: one logical PaymentEvent per Stripe event.
    const dup = await svc.entities.PaymentEvent
      .filter({ invoice_id: inv.id, processor_event_id: event.id }, '-created_date', 1).catch(() => []);
    if (dup?.length) return Response.json({ received: true, deduplicated: event.id });

    const nowIso = new Date().toISOString();
    const totalEur = obj.total != null ? Math.round(Number(obj.total)) / 100 : Number(inv.total_amount || 0);
    const updates: Record<string, unknown> = { stripe_event_last_processed: event.id };
    let errorCode = '';

    switch (event.type) {
      case 'invoice.finalized':
        if (!inv.invoice_number) {
          updates.status = inv.status === 'draft' ? 'issued' : inv.status;
          updates.invoice_number = obj.number || '';
          updates.issued_at = inv.issued_at || nowIso;
          updates.invoice_finalized_at = inv.invoice_finalized_at || nowIso;
          updates.hosted_invoice_url = obj.hosted_invoice_url || inv.hosted_invoice_url || '';
          updates.pdf_url = obj.invoice_pdf || inv.pdf_url || '';
        }
        updates.stripe_invoice_status = obj.status || 'open';
        break;
      case 'invoice.sent':
        if (['draft', 'issued'].includes(inv.status)) updates.status = 'sent';
        break;
      case 'invoice.paid': {
        updates.status = 'paid';
        updates.paid_at = nowIso;
        updates.amount_paid = totalEur;
        updates.balance_due = 0;
        updates.stripe_invoice_status = 'paid';
        updates.stripe_charge_id = typeof obj.charge === 'string' ? obj.charge : inv.stripe_charge_id || '';
        break;
      }
      case 'invoice.payment_failed':
        // SEPA/card failure. The SAME invoice stays open for retry/manual pay
        // via hosted_invoice_url — never a second invoice for the same month.
        updates.status = 'due';
        updates.retry_count = Number(inv.retry_count || 0) + 1;
        updates.last_failed_at = nowIso;
        errorCode = String(obj.last_finalization_error?.code || obj.status || 'payment_failed').slice(0, 100);
        updates.last_error = errorCode;
        updates.stripe_invoice_status = obj.status || 'open';
        break;
      case 'invoice.payment_action_required':
        // SCA: NOT paid; invoice stays open, merchant completes authentication
        // on the hosted invoice. Reconciled later by invoice.paid.
        updates.status = 'due';
        updates.stripe_invoice_status = obj.status || 'open';
        break;
      case 'invoice.voided':
        updates.status = 'void';
        updates.stripe_invoice_status = 'void';
        updates.void_reason = inv.void_reason || 'voided_in_stripe';
        break;
      case 'charge.dispute.created':
        updates.status = 'disputed';
        break;
      case 'credit_note.created':
        updates.credit_note_id = obj.id || '';
        break;
    }
    await svc.entities.Invoice.update(inv.id, updates);

    await svc.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || '',
      amount: totalEur,
      currency: 'EUR',
      event_type: INVOICE_EVENTS[event.type],
      processor: 'stripe',
      processor_ref: stripeInvoiceId || obj.id || '',
      processor_event_id: event.id,
      error_code: errorCode,
      metadata_json: { stripe_event_type: event.type, mode },
      occurred_at: nowIso,
    }).catch(() => null);

    // First valid PAID invoice: live → monetizing (§26). Idempotent — never
    // moved when already monetizing, never touched on any other status.
    if (event.type === 'invoice.paid' && inv.deal_activation_id) {
      const act = (await svc.entities.DealActivation.filter({ id: inv.deal_activation_id }, '-created_date', 1).catch(() => []))?.[0];
      if (act?.status === 'live') {
        await svc.entities.DealActivation.update(act.id, { status: 'monetizing', last_updated: nowIso }).catch(() => null);
      }
      if (inv.monthly_savings_report_id) {
        await svc.entities.MonthlySavingsReport.update(inv.monthly_savings_report_id, { status: 'paid', verification_status: 'paid' }).catch(() => null);
      }
    }

    return Response.json({ received: true, type: event.type, invoice_id: inv.id });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}