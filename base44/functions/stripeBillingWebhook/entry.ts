// stripeBillingWebhook — RECOVER-2/4 + CAMBRA v0.65.0 P6.
// Public Stripe endpoint. Signature verification happens before ANY side effect.
// P6 never trusts webhook delivery order: once the local Recover invoice is
// resolved, it fetches the current Stripe invoice and reconciles from that
// authoritative state. Frozen invoice economics are never rewritten on mismatch.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import Stripe from 'npm:stripe@17.7.0';
import { resolveBillingMode, getSecretKey, stripeRequest } from '../../shared/stripeBilling.ts';
import { getWebhookSecret } from '../../shared/stripeWebhookSecret.ts';
import {
  appendPaymentEventOnce,
  expectedInvoiceTotalMinor,
  stripeStatusProjection,
  validateStripeInvoiceBinding,
} from '../../shared/economicExecution.ts';

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

export default async function (req: Request): Promise<Response> {
  try {
    const signature = req.headers.get('stripe-signature') || '';
    const rawBody = await req.text();
    if (!signature) return Response.json({ error: 'missing_signature' }, { status: 400 });

    const mode = resolveBillingMode();
    const stripe = new Stripe(getSecretKey(mode));
    let event: any;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, getWebhookSecret(mode));
    } catch (err) {
      return Response.json({ error: `signature_invalid: ${(err as Error).message}` }, { status: 400 });
    }
    if ((event.livemode === true) !== (mode === 'live')) {
      return Response.json({ ignored: 'livemode_mismatch', mode, livemode: event.livemode });
    }

    const svc = createClientFromRequest(req).asServiceRole;

    // RECOVER-2 setup-intent lifecycle remains independent from invoice P6.
    if (event.type === 'setup_intent.succeeded' || event.type === 'setup_intent.setup_failed') {
      const intent = event.data?.object || {};
      const activation = (await svc.entities.DealActivation.filter({ stripe_setup_intent_id: intent.id }, '-created_date', 1))?.[0];
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

    if (!(event.type in INVOICE_EVENTS)) return Response.json({ ignored: event.type });
    const obj = event.data?.object || {};
    const stripeInvoiceId = event.type.startsWith('invoice.')
      ? String(obj.id || '')
      : (typeof obj.invoice === 'string' ? obj.invoice : '');

    let inv: any = null;
    const metaLocal = obj.metadata?.local_invoice_id || obj.lines?.data?.[0]?.metadata?.local_invoice_id || '';
    if (metaLocal) inv = (await svc.entities.Invoice.filter({ id: metaLocal }, '-created_date', 1))?.[0] || null;
    if (!inv && stripeInvoiceId) inv = (await svc.entities.Invoice.filter({ stripe_invoice_id: stripeInvoiceId }, '-created_date', 1))?.[0] || null;
    if (!inv && event.type === 'charge.dispute.created' && typeof obj.payment_intent === 'string') {
      inv = (await svc.entities.Invoice.filter({ processor_payment_intent_id: obj.payment_intent }, '-created_date', 1))?.[0] || null;
    }
    if (!inv) return Response.json({ ignored: 'local_invoice_not_found', type: event.type });

    // Critical dedupe read is authoritative: a persistence outage must fail the
    // webhook and let Stripe retry, never masquerade as "not seen".
    const duplicate = await svc.entities.PaymentEvent.filter({ invoice_id: inv.id, processor_event_id: event.id }, '-created_date', 1);
    if (duplicate?.length) return Response.json({ received: true, deduplicated: event.id });

    if (!inv.stripe_invoice_id) {
      await svc.entities.Invoice.update(inv.id, { reconciliation_status: 'mismatch', reconciliation_error: 'missing_local_stripe_invoice_id' });
      return Response.json({ received: true, quarantined: 'missing_local_stripe_invoice_id', invoice_id: inv.id });
    }

    // P6 out-of-order defense: fetch CURRENT Stripe state. A stale webhook can
    // therefore never regress paid→due or void→open.
    const remoteRes = await stripeRequest(mode, 'GET', `invoices/${inv.stripe_invoice_id}`);
    if (!remoteRes.ok) throw new Error(`stripe_invoice_reconcile_failed:${remoteRes.status}:${remoteRes.data?.error?.code || 'unknown'}`);
    const remote = remoteRes.data;
    const binding = validateStripeInvoiceBinding(inv, remote);
    const nowIso = new Date().toISOString();

    if (!binding.ok) {
      const reason = binding.reasons.join('|').slice(0, 1500);
      await svc.entities.Invoice.update(inv.id, {
        reconciliation_status: 'mismatch',
        reconciliation_error: reason,
        last_reconciled_at: nowIso,
        stripe_event_last_processed: event.id,
      });
      await appendPaymentEventOnce(svc, `p6:webhook-mismatch:${event.id}:${inv.id}`, {
        invoice_id: inv.id,
        brand_id: inv.brand_id || '',
        amount: expectedInvoiceTotalMinor(inv) / 100,
        currency: inv.currency || 'EUR',
        event_type: 'reconciliation_mismatch',
        processor: 'stripe',
        processor_ref: inv.stripe_invoice_id,
        processor_event_id: event.id,
        error_code: reason.slice(0, 100),
        metadata_json: { stripe_event_type: event.type, mode, reasons: binding.reasons },
        occurred_at: nowIso,
      });
      // 200 prevents a poison event from retrying forever; scheduled P6
      // reconciliation keeps the invoice quarantined until the mismatch is fixed.
      return Response.json({ received: true, quarantined: 'reconciliation_mismatch', invoice_id: inv.id });
    }

    const projection = stripeStatusProjection(inv, remote, nowIso);
    const patch: Record<string, unknown> = {
      ...projection.patch,
      stripe_event_last_processed: event.id,
      reconciliation_status: projection.changed ? 'drift_corrected' : 'ok',
    };

    if (event.type === 'invoice.payment_failed') {
      patch.retry_count = Number(inv.retry_count || 0) + 1;
      patch.last_failed_at = nowIso;
      patch.last_error = String(obj.last_finalization_error?.code || obj.status || 'payment_failed').slice(0, 100);
    }
    if (event.type === 'charge.dispute.created') patch.status = 'disputed';
    if (event.type === 'credit_note.created') {
      patch.credit_note_id = obj.id || '';
      const creditedMinor = Number(obj.amount || 0);
      if (creditedMinor >= expectedInvoiceTotalMinor(inv)) {
        patch.status = 'refunded';
        patch.balance_due = 0;
      }
    }
    if (event.type === 'invoice.finalized' && !inv.invoice_number) {
      patch.invoice_number = remote.number || '';
      patch.issued_at = inv.issued_at || nowIso;
      patch.invoice_finalized_at = inv.invoice_finalized_at || nowIso;
      patch.hosted_invoice_url = remote.hosted_invoice_url || inv.hosted_invoice_url || '';
      patch.pdf_url = remote.invoice_pdf || inv.pdf_url || '';
    }
    if (typeof remote.charge === 'string') patch.stripe_charge_id = remote.charge;

    await svc.entities.Invoice.update(inv.id, patch);

    const eventAmount = Number.isInteger(Number(remote.total)) ? Number(remote.total) / 100 : Number(inv.total_amount || 0);
    await appendPaymentEventOnce(svc, `p6:webhook:${event.id}:${inv.id}`, {
      invoice_id: inv.id,
      brand_id: inv.brand_id || '',
      amount: eventAmount,
      currency: inv.currency || 'EUR',
      event_type: INVOICE_EVENTS[event.type],
      processor: 'stripe',
      processor_ref: inv.stripe_invoice_id,
      processor_event_id: event.id,
      error_code: event.type === 'invoice.payment_failed' ? String(patch.last_error || '') : '',
      metadata_json: { stripe_event_type: event.type, mode, reconciled_from_current_stripe_state: true },
      occurred_at: nowIso,
    });

    const finalStatus = String(patch.status || inv.status);
    if (inv.monthly_savings_report_id) {
      const target = finalStatus === 'paid' ? 'paid' : (['refunded', 'void'].includes(finalStatus) ? 'calculated' : 'invoiced');
      await svc.entities.MonthlySavingsReport.update(inv.monthly_savings_report_id, {
        status: target,
        ...(target === 'paid' ? { verification_status: 'paid' } : {}),
      });
    }
    if (finalStatus === 'paid' && inv.deal_activation_id) {
      const act = (await svc.entities.DealActivation.filter({ id: inv.deal_activation_id }, '-created_date', 1))?.[0];
      if (act?.status === 'live') await svc.entities.DealActivation.update(act.id, { status: 'monetizing', last_updated: nowIso });
    }

    return Response.json({ received: true, type: event.type, invoice_id: inv.id, reconciled: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}
