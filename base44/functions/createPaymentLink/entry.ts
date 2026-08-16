import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import Stripe from "npm:stripe@14.25.0";
import {
  assertEmergencyEpochUnchanged,
  captureEmergencyEpoch,
  guardedEmergencyEffect,
} from "../../shared/operationalControl.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import { safeBestEffort } from "../../shared/bestEffort.ts";
import {
  effectAuthorityErrorResponse,
  requireEffectAuthorities,
} from "../../shared/effectAuthority.ts";
import { assertMarketCapabilityAllowed } from "../../shared/marketPolicyRuntime.ts";

Deno.serve(async (req) => {
  let service: any = null;
  let invoiceId = "";
  let invoiceSnapshot: any = {};
  let invoiceStatus = "";
  let priorHostedUrl = "";
  let stripeSession: any = null;
  try {
    const base44 = createClientFromRequest(req);
    service = base44.asServiceRole;
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, {
        status: 403,
      });
    }
    let billingEpoch: any;
    try {
      billingEpoch = await captureEmergencyEpoch(
        base44.asServiceRole,
        "billing_issuance",
      );
    } catch (error: any) {
      return Response.json({
        error: error?.message || "emergency_control_paused:billing_issuance",
      }, { status: 409 });
    }

    const body = await req.json();
    const { invoice_id, success_url = "/", cancel_url = "/" } = body || {};
    invoiceId = String(invoice_id || "");
    if (!invoice_id) {
      return Response.json({ error: "invoice_id is required" }, {
        status: 400,
      });
    }

    const rows = await base44.asServiceRole.entities.Invoice.filter(
      { id: invoice_id },
      "-created_date",
      2,
    );
    if (!Array.isArray(rows)) throw new Error("invoice_authority_unavailable");
    if (rows.length === 0) {
      return Response.json({ error: "Invoice not found" }, { status: 404 });
    }
    if (rows.length !== 1) {
      return Response.json({
        error: "invoice_authority_ambiguous",
        effects: false,
      }, { status: 409 });
    }
    const inv = rows[0];
    invoiceSnapshot = inv.billing_snapshot_json || {};
    invoiceStatus = String(inv.status || "draft");
    priorHostedUrl = String(inv.hosted_invoice_url || "");

    // P6 — Recover already uses Stripe Invoicing + its hosted invoice URL.
    // Creating a separate Checkout Session for the same receivable would create
    // a second payable object and a real double-charge path.
    if (
      inv.monthly_savings_report_id ||
      String(inv.payment_provider || "").toLowerCase() === "stripe" ||
      inv.stripe_invoice_id
    ) {
      return Response.json({
        error: "recover_invoice_already_has_stripe_payment_surface",
        hosted_invoice_url: inv.hosted_invoice_url || null,
        use: "existing_stripe_invoice",
      }, { status: 409 });
    }

    const key = Deno.env.get("STRIPE_API_KEY");
    if (!key) {
      return Response.json({
        error: "payment_provider_not_configured",
        details: "Set STRIPE_API_KEY to enable Stripe payment links.",
      }, { status: 400 });
    }

    const stripe = new Stripe(key, { apiVersion: "2023-10-16" });

    const amountCents = Math.round((inv.total_amount || 0) * 100);
    if (!amountCents || amountCents <= 0) {
      return Response.json({ error: "Invalid invoice amount" }, {
        status: 400,
      });
    }

    const authorityBrands = await base44.asServiceRole.entities.Brand.filter(
      { id: String(inv.brand_id || "") },
      "-created_date",
      2,
    );
    if (!Array.isArray(authorityBrands) || authorityBrands.length !== 1) {
      return Response.json({
        ok: false,
        error: "effect_authority_denied",
        effects: false,
      }, { status: 409 });
    }
    const authorityJurisdiction = String(
      authorityBrands[0].billing_country || authorityBrands[0].country || "",
    ).trim().toUpperCase();

    // R5 OTR-012 — re-read actor, invoice, tenant Brand, market policy and the
    // captured Emergency epoch at the provider boundary. The facade owns no
    // durable authority; Invoice/Brand/market policy remain authoritative.
    try {
      await requireEffectAuthorities(base44.asServiceRole, {
        effect_classes: ["BILL_CHARGE", "EXECUTE"],
        actor: { id: user.email, type: "HUMAN_ADMIN" },
        tenant: { key: inv.brand_id, scope: "tenant" },
        subject: { type: "Invoice", id: inv.id },
        context: {
          jurisdiction: authorityJurisdiction,
          market_scope_requirement: "REQUIRED",
          emergency_epoch_claim: billingEpoch,
          emergency_capabilities: ["billing_issuance"],
          expected_policy_key: "market:BILL",
          phase: `create_payment_link_provider:${inv.id}`,
        },
        revalidate: async (svc: any, exact: any) => {
          const freshActor = await base44.auth.me();
          if (
            !freshActor || freshActor.role !== "admin" ||
            String(freshActor.email || "") !== exact.actor_id
          ) {
            return {
              status: "DENIED",
              authority_available: true,
              effect_classes: exact.effect_classes,
              actor_id: String(freshActor?.email || ""),
              tenant_key: exact.tenant_key,
              subject_type: exact.subject_type,
              subject_id: exact.subject_id,
              policy_key: "market:BILL",
              policy_version: "denied",
              policy_state: "DENIED",
              authority_ref: "auth:admin",
              observed_at: new Date().toISOString(),
            };
          }
          const freshInvoices = await svc.entities.Invoice.filter(
            { id: inv.id },
            "-created_date",
            2,
          );
          if (!Array.isArray(freshInvoices) || freshInvoices.length !== 1) {
            throw new Error("invoice_effect_authority_unavailable");
          }
          const freshInvoice = freshInvoices[0];
          if (
            String(freshInvoice.brand_id || "") !== exact.tenant_key ||
            String(freshInvoice.id || "") !== exact.subject_id ||
            String(freshInvoice.status || "") !== String(inv.status || "") ||
            Number(freshInvoice.total_amount || 0) !==
              Number(inv.total_amount || 0) ||
            String(freshInvoice.currency || "") !==
              String(inv.currency || "") ||
            freshInvoice.monthly_savings_report_id ||
            freshInvoice.stripe_invoice_id ||
            String(freshInvoice.payment_provider || "").toLowerCase() ===
              "stripe"
          ) throw new Error("invoice_effect_authority_changed");
          const brands = await svc.entities.Brand.filter(
            { id: exact.tenant_key },
            "-created_date",
            2,
          );
          if (!Array.isArray(brands) || brands.length !== 1) {
            throw new Error("billing_brand_authority_unavailable");
          }
          const brand = brands[0];
          const jurisdiction = String(
            brand.billing_country || brand.country || "",
          ).trim().toUpperCase();
          // The outer request cannot supply jurisdiction. Re-run the facade
          // with the server-resolved market by requiring the verdict to bind it.
          const decision = await assertMarketCapabilityAllowed(svc, {
            brand,
            brand_id: brand.id,
            jurisdiction,
            capability: "BILL",
            enforce: true,
            actor_type: "create_payment_link",
          });
          return {
            status: "AUTHORIZED",
            authority_available: true,
            effect_classes: exact.effect_classes,
            actor_id: exact.actor_id,
            tenant_key: exact.tenant_key,
            subject_type: exact.subject_type,
            subject_id: exact.subject_id,
            policy_key: "market:BILL",
            policy_version: String(
              decision.policy_version || decision.policy_id || "",
            ),
            policy_state: "ACTIVE",
            authority_ref: `JurisdictionCapabilityPolicy:${
              String(decision.policy_id || decision.policy_version || "")
            }`,
            observed_at: new Date().toISOString(),
            market_iso2: jurisdiction,
            market_scope_version: exact.market_scope_version,
          };
        },
      });
    } catch (error) {
      const response = effectAuthorityErrorResponse(error);
      if (response) return response;
      throw error;
    }

    const session: any = await guardedEmergencyEffect(base44.asServiceRole, {
      claim: billingEpoch,
      effect_key: `stripe_checkout_session:${inv.id}`,
      effect: () =>
        stripe.checkout.sessions.create({
          mode: "payment",
          line_items: [{
            price_data: {
              currency: (inv.currency || "eur").toLowerCase(),
              product_data: { name: `Invoice ${inv.invoice_number || inv.id}` },
              unit_amount: amountCents,
            },
            quantity: 1,
          }],
          metadata: { invoice_id: String(inv.id) },
          success_url,
          cancel_url,
        }, { idempotencyKey: `cambra-payment-link-${inv.id}` }),
    });
    stripeSession = session;

    await assertEmergencyEpochUnchanged(
      base44.asServiceRole,
      billingEpoch,
      `before_payment_link_commit:${inv.id}`,
    );
    const updated = await base44.asServiceRole.entities.Invoice.update(inv.id, {
      payment_provider: "stripe",
      hosted_invoice_url: session.url,
      billing_snapshot_json: {
        ...(inv.billing_snapshot_json || {}),
        stripe_checkout_session_id: session.id,
      },
      status: inv.status === "issued" ? "sent" : inv.status,
    });
    await assertEmergencyEpochUnchanged(
      base44.asServiceRole,
      billingEpoch,
      `after_payment_link_commit:${inv.id}`,
    );

    await base44.asServiceRole.entities.PaymentEvent.create({
      invoice_id: inv.id,
      brand_id: inv.brand_id || null,
      amount: inv.total_amount || 0,
      currency: inv.currency || "EUR",
      event_type: "payment_link_created",
      processor: "stripe",
      processor_ref: session.id,
      occurred_at: new Date().toISOString(),
    });

    return Response.json({
      url: session.url,
      session_id: session.id,
      invoice: updated,
    });
  } catch (error: any) {
    if (
      [
        "EMERGENCY_EFFECT_AMBIGUOUS",
        "EMERGENCY_CONTROL_EPOCH_CHANGED",
        "EMERGENCY_CONTROL_PAUSED",
      ].includes(String(error?.code || "")) && service && invoiceId
    ) {
      const session = error?.effect_result || stripeSession;
      await service.entities.Invoice.update(invoiceId, {
        status: invoiceStatus,
        hosted_invoice_url: priorHostedUrl,
        reconciliation_status: "error",
        last_error: `emergency_epoch_race:${
          String(error?.effect_key || "stripe_checkout_session").slice(0, 160)
        }`,
        last_failed_at: new Date().toISOString(),
        billing_snapshot_json: {
          ...invoiceSnapshot,
          stripe_checkout_session_id: session?.id || null,
          emergency_review_required: true,
        },
      }).catch((auditError: any) =>
        safeBestEffort(auditError, {
          operation: "createPaymentLink.mark_external_effect_ambiguous",
          fallback: null,
          severity: "critical",
        })
      );
      return Response.json({
        error: "payment_link_effect_ambiguous_review_required",
        review_required: true,
        session_id: session?.id || null,
      }, { status: 409 });
    }
    return internalErrorResponse(error, "createPaymentLink");
  }
});
