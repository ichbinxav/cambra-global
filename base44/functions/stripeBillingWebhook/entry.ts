// stripeBillingWebhook — RECOVER-2/4 + CAMBRA v0.65.0 P6.
// Public Stripe endpoint. Signature verification happens before ANY side effect.
// P6 never trusts webhook delivery order: once the local Recover invoice is
// resolved, it fetches the current Stripe invoice and reconciles from that
// authoritative state. Frozen invoice economics are never rewritten on mismatch.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import Stripe from "npm:stripe@17.7.0";
import {
  getSecretKey,
  resolveBillingMode,
  stripeRequest,
} from "../../shared/stripeBilling.ts";
import { getWebhookSecret } from "../../shared/stripeWebhookSecret.ts";
import {
  convergeRecoverBillingWebhook,
  convergeRecoverBillingWebhookMismatch,
  expectedInvoiceTotalMinor,
  readBoundedPaymentEvents,
  readExactEntityOrNull,
  recoverReportProjectionForInvoiceStatus,
  stripeStatusProjection,
  validateStripeInvoiceBinding,
  validateStripeWebhookInvoiceEventBinding,
} from "../../shared/economicExecution.ts";
import {
  acquireStripeConnectedAccountEventClaim,
  completeStripeConnectedAccountEventClaim,
  disconnectStripeConnectedAccount,
  ensureStripeConnectEventLedger,
  isStripeConnectedAccountLifecycleError,
  markStripeConnectedAccountEventEffectsStarted,
  quarantineStripeConnectedAccountEventClaim,
  recordStripeAccountCapabilityDrop,
  recordStripeConnectIncident,
  resolveExactStripeIntegrationForAccount,
  settleStripeConnectEventLedger,
} from "../../shared/stripeConnectedAccountLifecycle.ts";

const INVOICE_EVENTS: Record<string, string> = {
  "invoice.finalized": "invoice_issued",
  "invoice.sent": "invoice_sent",
  "invoice.paid": "payment_succeeded",
  "invoice.payment_failed": "payment_failed",
  "invoice.payment_action_required": "payment_action_required",
  "invoice.voided": "invoice_voided",
  "charge.dispute.created": "dispute_created",
  "credit_note.created": "credit_note_created",
};

// This physical endpoint must be configured in Stripe Workbench with the
// "Connected accounts" scope and explicit subscriptions to both event types.
// Stripe documents that event.account, not data.object, identifies the
// connected account; account.application.deauthorized carries an Application,
// while account.updated carries an Account.
// Primary reference: https://docs.stripe.com/connect/webhooks
const CONNECTED_ACCOUNT_EVENTS = new Set([
  "account.application.deauthorized",
  "account.updated",
]);

function stripeEventObservedAt(event: any): string {
  const seconds = Number(event?.created);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    throw new Error("stripe_event_created_invalid");
  }
  return new Date(seconds * 1000).toISOString();
}

function compactCode(error: any) {
  return String(error?.code || error?.name || "STRIPE_CONNECT_EVENT_FAILED")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 120);
}

async function handleConnectedAccountEvent(svc: any, event: any) {
  const eventId = String(event?.id || "");
  const eventType = String(event?.type || "");
  const accountId = String(event?.account || "");
  const effectKey = eventId && accountId
    ? `stripe-connect:${eventId}:${accountId}`
    : `stripe-connect-invalid:${eventId || "missing"}:${
      accountId || "missing"
    }`;
  let integration: any = null;
  let claim: any = null;
  let ledger: any = null;
  let receipt: any = null;
  let ledgerSettled = false;

  try {
    if (!eventId) {
      throw Object.assign(new Error("stripe_event_id_missing"), {
        code: "STRIPE_CONNECT_EVENT_ID_MISSING",
      });
    }
    if (!accountId) {
      throw Object.assign(new Error("stripe_event_account_missing"), {
        code: "STRIPE_CONNECT_ACCOUNT_ID_MISSING",
      });
    }
    const deliveredObject = event?.data?.object || {};
    if (eventType === "account.application.deauthorized") {
      if (String(deliveredObject?.object || "") !== "application") {
        throw Object.assign(
          new Error("stripe_deauthorization_object_invalid"),
          {
            code: "STRIPE_CONNECT_DEAUTHORIZATION_OBJECT_INVALID",
          },
        );
      }
    } else if (
      String(deliveredObject?.object || "") !== "account" ||
      String(deliveredObject?.id || "") !== accountId
    ) {
      throw Object.assign(new Error("stripe_account_update_binding_invalid"), {
        code: "STRIPE_CONNECT_ACCOUNT_UPDATE_BINDING_INVALID",
      });
    }

    integration = await resolveExactStripeIntegrationForAccount(svc, accountId);
    const acquired = await acquireStripeConnectedAccountEventClaim(
      svc,
      integration,
      {
        effect_key: effectKey,
        owner: `stripe_webhook:${eventId}`,
      },
    );
    if (acquired.duplicate) {
      return Response.json({
        received: true,
        deduplicated: eventId,
        account: accountId,
      });
    }
    if (!acquired.acquired) {
      return Response.json({
        error: acquired.review_required
          ? "stripe_connect_review_required"
          : "stripe_connect_event_in_progress",
        retry: true,
        review_required: acquired.review_required === true,
        event_id: eventId,
      }, { status: 503 });
    }
    claim = acquired.claim;
    ledger = await ensureStripeConnectEventLedger(svc, {
      effect_key: effectKey,
      event_id: eventId,
      event_type: eventType === "account.application.deauthorized"
        ? "stripe.connect.application.deauthorized"
        : "stripe.connect.account.updated",
      account_id: accountId,
      brand_id: integration.brand_id,
      integration_id: integration.id,
      livemode: event.livemode === true,
    });

    if (String(ledger?.status || "") === "processed") {
      claim = await markStripeConnectedAccountEventEffectsStarted(svc, claim);
      receipt = ledger.execution_json?.receipt || {
        event_id: eventId,
        event_type: eventType,
        account_id: accountId,
        duplicate_ledger_reconciled: true,
      };
      await completeStripeConnectedAccountEventClaim(svc, claim, receipt);
      return Response.json({
        received: true,
        deduplicated: eventId,
        reconciled: true,
        account: accountId,
      });
    }

    claim = await markStripeConnectedAccountEventEffectsStarted(svc, claim);
    if (eventType === "account.application.deauthorized") {
      receipt = await disconnectStripeConnectedAccount(svc, {
        integration,
        provider_account_id: accountId,
        reason: "stripe_account_application_deauthorized",
        source: "stripe_webhook",
        event_id: eventId,
        event_type: eventType,
        actor_email: "stripe_webhook",
      });
    } else {
      receipt = await recordStripeAccountCapabilityDrop(svc, {
        integration,
        account: event.data.object,
        event_id: eventId,
        event_type: eventType,
        account_id: accountId,
      });
    }
    await settleStripeConnectEventLedger(svc, ledger, {
      status: "processed",
      receipt,
    });
    ledgerSettled = true;
    await completeStripeConnectedAccountEventClaim(svc, claim, receipt);
    return Response.json({
      received: true,
      type: eventType,
      account: accountId,
      reconciled: true,
      capability_changed: receipt?.changed !== false,
    });
  } catch (error) {
    const errorCode = compactCode(error);
    const failureReceipt =
      (isStripeConnectedAccountLifecycleError(error) && error.receipt)
        ? error.receipt
        : receipt || {
          event_id: eventId || null,
          event_type: eventType || null,
          account_id: accountId || null,
          integration_id: integration?.id || null,
          brand_id: integration?.brand_id || null,
        };
    if (ledger && !ledgerSettled) {
      try {
        await settleStripeConnectEventLedger(svc, ledger, {
          status: "failed",
          receipt: failureReceipt,
          error_code: errorCode,
        });
      } catch (ledgerError) {
        console.error(JSON.stringify({
          event: "stripe_connect_event_ledger_settle_failed",
          stripe_event_id: eventId || null,
          error_code: compactCode(ledgerError),
        }));
      }
    }
    if (claim) {
      await quarantineStripeConnectedAccountEventClaim(
        svc,
        claim,
        errorCode,
        failureReceipt,
      );
    }
    await recordStripeConnectIncident(svc, {
      dedupe_key: `stripe-connect-review:${effectKey}`,
      account_id: accountId,
      event_id: eventId,
      event_type: eventType,
      error_code: errorCode,
      integration_id: integration?.id,
      brand_id: integration?.brand_id,
      receipt: failureReceipt,
    });
    return Response.json({
      error: "stripe_connect_reconciliation_required",
      retry: true,
      review_required: true,
      event_id: eventId || null,
    }, { status: 503 });
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    const signature = req.headers.get("stripe-signature") || "";
    const rawBody = await req.text();
    if (!signature) {
      return Response.json({ error: "missing_signature" }, { status: 400 });
    }

    const mode = resolveBillingMode();
    const stripe = new Stripe(getSecretKey(mode));
    let event: any;
    try {
      event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        getWebhookSecret(mode),
      );
    } catch (err) {
      console.warn(
        "stripeBillingWebhook signature verification failed",
        (err as Error)?.name || "Error",
      );
      return Response.json({ error: "signature_invalid" }, { status: 400 });
    }
    if (typeof event.livemode !== "boolean") {
      return Response.json({ error: "livemode_missing" }, { status: 400 });
    }
    if ((event.livemode === true) !== (mode === "live")) {
      return Response.json({
        ignored: "livemode_mismatch",
        mode,
        livemode: event.livemode,
      });
    }

    const svc = createClientFromRequest(req).asServiceRole;

    if (CONNECTED_ACCOUNT_EVENTS.has(event.type)) {
      return handleConnectedAccountEvent(svc, event);
    }

    // RECOVER-2 setup-intent lifecycle. Never trust delivery order: reconcile
    // the CURRENT Stripe object before mutating local payment-method state.
    if (
      event.type === "setup_intent.succeeded" ||
      event.type === "setup_intent.setup_failed"
    ) {
      const deliveredIntent = event.data?.object || {};
      const intentId = String(deliveredIntent.id || "");
      if (!intentId) {
        return Response.json({ ignored: "setup_intent_id_missing" });
      }
      const activation = (await svc.entities.DealActivation.filter(
        { stripe_setup_intent_id: intentId },
        "-created_date",
        1,
      ))?.[0];
      if (!activation) {
        return Response.json({ ignored: "activation_not_found" });
      }

      const current = await stripe.setupIntents.retrieve(intentId);
      const currentStatus = String(current?.status || "");
      if (currentStatus === "succeeded") {
        const paymentMethodId = typeof current.payment_method === "string"
          ? current.payment_method
          : current.payment_method?.id || "";
        if (!paymentMethodId) {
          throw new Error("setup_intent_succeeded_without_payment_method");
        }
        await svc.entities.DealActivation.update(activation.id, {
          payment_method_status: "ready",
          stripe_payment_method_id: paymentMethodId,
          stripe_billing_mode: mode,
          payment_method_ready_at: activation.payment_method_ready_at ||
            new Date().toISOString(),
        });
      } else if (["canceled"].includes(currentStatus)) {
        // Only a terminal CURRENT Stripe state may regress local readiness.
        await svc.entities.DealActivation.update(activation.id, {
          payment_method_status: "failed",
          stripe_payment_method_id: "",
        });
      }
      // processing/requires_* states are intentionally no-ops: a stale failure
      // delivery must never overwrite a newer successful authorization.
      return Response.json({
        received: true,
        type: event.type,
        reconciled: true,
        deal_activation_id: activation.id,
      });
    }

    if (!(event.type in INVOICE_EVENTS)) {
      return Response.json({ ignored: event.type });
    }
    const obj = event.data?.object || {};
    const stripeInvoiceId = event.type.startsWith("invoice.")
      ? String(obj.id || "")
      : (typeof obj.invoice === "string" ? obj.invoice : "");

    let inv: any = null;
    const metaLocal = obj.metadata?.local_invoice_id ||
      obj.lines?.data?.[0]?.metadata?.local_invoice_id || "";
    if (metaLocal) {
      inv = await readExactEntityOrNull(
        svc.entities.Invoice,
        { id: metaLocal },
        "stripe_webhook_local_invoice",
      );
    }
    if (!inv && stripeInvoiceId) {
      inv = await readExactEntityOrNull(svc.entities.Invoice, {
        stripe_invoice_id: stripeInvoiceId,
      }, "stripe_webhook_stripe_invoice");
    }
    if (
      !inv && event.type === "charge.dispute.created" &&
      typeof obj.payment_intent === "string"
    ) {
      inv = await readExactEntityOrNull(svc.entities.Invoice, {
        processor_payment_intent_id: obj.payment_intent,
      }, "stripe_webhook_payment_intent_invoice");
    }
    if (!inv) {
      return Response.json({
        ignored: "local_invoice_not_found",
        type: event.type,
      });
    }

    const signedObjectBinding = validateStripeWebhookInvoiceEventBinding(
      inv,
      event.type,
      obj,
      stripeInvoiceId,
    );
    if (!signedObjectBinding.ok) {
      throw new Error(
        `stripe_webhook_event_invoice_binding_failed:${
          signedObjectBinding.reasons.join("|")
        }`,
      );
    }

    // Existing evidence is not a terminal outcome. A prior attempt may have
    // crashed before report/activation convergence, so every replay re-reads
    // current Stripe state and completes all local projections.
    const duplicates = await readBoundedPaymentEvents(svc, {
      invoice_id: inv.id,
      processor_event_id: event.id,
    }, 5);
    const duplicateReplay = duplicates.length > 0;
    const eventOccurredAt = duplicates[0]?.occurred_at ||
      stripeEventObservedAt(event);

    if (!inv.stripe_invoice_id) {
      await svc.entities.Invoice.update(inv.id, {
        reconciliation_status: "mismatch",
        reconciliation_error: "missing_local_stripe_invoice_id",
      });
      const quarantined = await readExactEntityOrNull(svc.entities.Invoice, {
        id: inv.id,
      }, "stripe_webhook_missing_pointer_invoice");
      if (
        !quarantined || quarantined.reconciliation_status !== "mismatch" ||
        quarantined.reconciliation_error !== "missing_local_stripe_invoice_id"
      ) {
        throw new Error(
          "stripe_webhook_missing_pointer_quarantine_readback_mismatch",
        );
      }
      return Response.json({
        received: true,
        quarantined: "missing_local_stripe_invoice_id",
        invoice_id: inv.id,
      });
    }

    // P6 out-of-order defense: fetch CURRENT Stripe state. A stale webhook can
    // therefore never regress paid→due or void→open.
    const remoteRes = await stripeRequest(
      mode,
      "GET",
      `invoices/${inv.stripe_invoice_id}`,
    );
    if (!remoteRes.ok) {
      throw new Error(
        `stripe_invoice_reconcile_failed:${remoteRes.status}:${
          remoteRes.data?.error?.code || "unknown"
        }`,
      );
    }
    const remote = remoteRes.data;
    const binding = validateStripeInvoiceBinding(inv, remote);
    const nowIso = new Date().toISOString();

    if (!binding.ok) {
      const reason = binding.reasons.join("|").slice(0, 1500);
      const mismatchPatch = {
        reconciliation_status: "mismatch",
        reconciliation_error: reason,
        last_reconciled_at: nowIso,
        stripe_event_last_processed: event.id,
      };
      await convergeRecoverBillingWebhookMismatch(svc, {
        invoice_id: inv.id,
        invoice_patch: mismatchPatch,
        invoice_readback: {
          reconciliation_status: "mismatch",
          reconciliation_error: reason,
          stripe_event_last_processed: event.id,
        },
        event_hash: `p6:webhook-mismatch:${event.id}:${inv.id}`,
        event_record: {
          invoice_id: inv.id,
          brand_id: inv.brand_id || "",
          amount: expectedInvoiceTotalMinor(inv) / 100,
          currency: inv.currency || "EUR",
          event_type: "reconciliation_mismatch",
          processor: "stripe",
          processor_ref: inv.stripe_invoice_id,
          processor_event_id: event.id,
          error_code: reason.slice(0, 100),
          metadata_json: {
            stripe_event_type: event.type,
            mode,
            reasons: binding.reasons,
          },
          occurred_at: eventOccurredAt,
        },
      });
      // 200 prevents a poison event from retrying forever; scheduled P6
      // reconciliation keeps the invoice quarantined until the mismatch is fixed.
      return Response.json({
        received: true,
        quarantined: "reconciliation_mismatch",
        invoice_id: inv.id,
      });
    }

    const projection = stripeStatusProjection(inv, remote, nowIso);
    const patch: Record<string, unknown> = {
      ...projection.patch,
      stripe_event_last_processed: event.id,
      reconciliation_status: projection.changed ? "drift_corrected" : "ok",
    };

    if (event.type === "invoice.payment_failed") {
      patch.retry_count = inv.stripe_event_last_processed === event.id
        ? Number(inv.retry_count || 0)
        : Number(inv.retry_count || 0) + 1;
      patch.last_failed_at =
        inv.stripe_event_last_processed === event.id && inv.last_failed_at
          ? inv.last_failed_at
          : eventOccurredAt;
      patch.last_error = String(
        obj.last_finalization_error?.code || obj.status || "payment_failed",
      ).slice(0, 100);
    }
    if (event.type === "charge.dispute.created") patch.status = "disputed";
    if (event.type === "credit_note.created") {
      patch.credit_note_id = obj.id || "";
      const creditedMinor = Number(obj.amount || 0);
      if (creditedMinor >= expectedInvoiceTotalMinor(inv)) {
        patch.status = "refunded";
        patch.balance_due = 0;
      }
    }
    if (event.type === "invoice.finalized" && !inv.invoice_number) {
      patch.invoice_number = remote.number || "";
      patch.issued_at = inv.issued_at || eventOccurredAt;
      patch.invoice_finalized_at = inv.invoice_finalized_at || eventOccurredAt;
      patch.hosted_invoice_url = remote.hosted_invoice_url ||
        inv.hosted_invoice_url || "";
      patch.pdf_url = remote.invoice_pdf || inv.pdf_url || "";
    }
    if (typeof remote.charge === "string") {
      patch.stripe_charge_id = remote.charge;
    }

    const eventAmount = Number.isInteger(Number(remote.total))
      ? Number(remote.total) / 100
      : Number(inv.total_amount || 0);
    const finalStatus = String(patch.status || inv.status);
    const reportPatch = recoverReportProjectionForInvoiceStatus(finalStatus);
    let activationId: string | null = null;
    let activationPatch: Record<string, unknown> | undefined;
    let activationReadback: Record<string, unknown> | undefined;
    if (finalStatus === "paid" && inv.deal_activation_id) {
      const activation = await readExactEntityOrNull(
        svc.entities.DealActivation,
        { id: inv.deal_activation_id },
        "stripe_webhook_activation",
      );
      if (!activation) throw new Error("stripe_webhook_activation_not_found");
      activationId = String(activation.id);
      const activationStatus = activation.status === "live"
        ? "monetizing"
        : String(activation.status || "");
      activationPatch = activation.status === "live"
        ? { status: "monetizing", last_updated: nowIso }
        : {};
      activationReadback = { status: activationStatus };
    }
    await convergeRecoverBillingWebhook(svc, {
      invoice_id: inv.id,
      invoice_patch: patch,
      invoice_readback: Object.fromEntries(
        Object.entries(patch).filter(([key]) => key !== "last_reconciled_at"),
      ),
      event_hash: `p6:webhook:${event.id}:${inv.id}`,
      event_record: {
        invoice_id: inv.id,
        brand_id: inv.brand_id || "",
        amount: eventAmount,
        currency: inv.currency || "EUR",
        event_type: INVOICE_EVENTS[event.type],
        processor: "stripe",
        processor_ref: inv.stripe_invoice_id,
        processor_event_id: event.id,
        error_code: event.type === "invoice.payment_failed"
          ? String(patch.last_error || "")
          : "",
        metadata_json: {
          stripe_event_type: event.type,
          mode,
          reconciled_from_current_stripe_state: true,
        },
        occurred_at: eventOccurredAt,
      },
      report_id: inv.monthly_savings_report_id || null,
      report_patch: inv.monthly_savings_report_id ? reportPatch : undefined,
      report_readback: inv.monthly_savings_report_id ? reportPatch : undefined,
      activation_id: activationId,
      activation_patch: activationPatch,
      activation_readback: activationReadback,
    });

    return Response.json({
      received: true,
      type: event.type,
      invoice_id: inv.id,
      reconciled: true,
      deduplicated: duplicateReplay ? event.id : null,
    });
  } catch (error) {
    console.error("stripeBillingWebhook failed", error);
    return Response.json({ error: "webhook_processing_failed" }, {
      status: 500,
    });
  }
}
