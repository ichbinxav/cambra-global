import { safeBestEffort } from "../../shared/bestEffort.ts";
// createEligibleRecoverInvoices — RECOVER-4 (2026-08-04), restructured v61
// (2026-08-06, audit P0 #1/#2/#3).
//
// Turns an admin-approved, eligible MonthlySavingsReport into ONE Stripe
// invoice (variable amount, charge_automatically — NEVER a Subscription, §20)
// and its local mirror. Admin or internal (monthly scheduler).
//
// v61 FLOW GUARANTEE: every economic validation — contract policy resolution
// INCLUDED — happens inside the pure core prepareEligibleRecoverInvoice
// BEFORE any Stripe call or local economic write. Stripe only ever receives
// the validated output of that function. An unresolvable contract, a fee
// mismatch, a missing standard fee (never defaulted to 25) or an idempotency
// conflict produce ZERO Stripe side effects.
//
// IDEMPOTENCY (§28, v61): canonical identity = monthly_savings_report_id,
// validated against (deal_activation_id, month, brand_id, mandate_id,
// currency). Same report + retry → the same invoice is resumed with the same
// Stripe idempotency keys (`r4:inv:*:${report.id}`). Same activation+month
// with a DIFFERENT report → typed conflict, no reuse, no pointer repair.
// Stripe's finalized `number` is THE legal number (§19).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { resolveRecoverEconomicMandate } from "../../shared/recoverEconomicMandate.ts";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import {
  assertBillingAccount,
  resolveBillingMode,
} from "../../shared/stripeBilling.ts";
import { readLegalIdentity } from "../../shared/cambraLegalIdentity.ts";
import {
  determineTaxTreatment,
  isReverseChargeTreatment,
  normalizeVat,
  readTaxConfig,
  stripeTaxRateIdFor,
  type TaxDecision,
} from "../../shared/recoverTax.ts";
import { hashCalculation } from "../../shared/recoverBillingMath.ts";
import { monthBounds } from "../../shared/billingFee.ts";
import { prepareEligibleRecoverInvoice } from "../../shared/prepareEligibleRecoverInvoice.ts";
import { evaluateRecoverEconomicGate } from "../../shared/eclEconomicGate.ts";
import {
  claimRecoverInvoiceDraft,
  convergeRecoverInvoiceIssuance,
  executeRecoverBillingProviderRequest,
  recoverExecutionKey,
  recoverStripeBillingRequest,
} from "../../shared/economicExecution.ts";
import {
  assertEmergencyEpochUnchanged,
  captureEmergencyEpoch,
  emergencyState,
} from "../../shared/operationalControl.ts";
import { assertMarketCapabilityAllowed } from "../../shared/marketPolicyRuntime.ts";
import { evaluateLegalExecution } from "../../shared/legalExecutionRuntime.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import { requireCanonicalRecoverReport } from "../../shared/recoverReportAuthority.ts";

const BATCH = 5;

type StripeBillingEffectKind =
  | "invoice"
  | "invoice_item"
  | "customer"
  | "tax_id";

function stripeBillingObjectId(effectKey: unknown, effectResult: any) {
  const key = String(effectKey || "");
  const kind: StripeBillingEffectKind | null =
    key.includes("create_invoice_item:")
      ? "invoice_item"
      : key.includes("create_invoice:") || key.includes("finalize_invoice:")
      ? "invoice"
      : key.includes("reverse_tax:")
      ? "customer"
      : key.includes("attach_tax_id:")
      ? "tax_id"
      : null;
  const id = String(effectResult?.data?.id || "");
  const prefix: Record<StripeBillingEffectKind, string> = {
    invoice: "in_",
    invoice_item: "ii_",
    customer: "cus_",
    tax_id: "txi_",
  };
  const valid = Boolean(kind && id.startsWith(prefix[kind]));
  return {
    kind,
    id: valid ? id : null,
    invoice_id: valid && kind === "invoice" ? id : null,
    postcondition_valid: valid,
  };
}

function monthLabel(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  const intl = { en: "en-IE", fr: "fr-FR", es: "es-ES" }[locale] || "en-IE";
  const label = new Intl.DateTimeFormat(intl, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function lineDescription(month: string, locale: string): string {
  const label = monthLabel(month, locale);
  if (locale === "fr") {
    return `Commission de succès Recover Margin — économies vérifiées de ${label}`;
  }
  if (locale === "es") {
    return `Comisión de éxito Recover Margin — ahorro verificado de ${label}`;
  }
  return `Recover Margin success fee — verified savings for ${label}`;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) {
      return gate.response ||
        Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const svc = base44.asServiceRole;
    const emergency = await emergencyState(svc);
    if (emergency.safe_mode || emergency.billing_issuance_paused) {
      return Response.json({
        ok: false,
        error: "emergency_control_paused:billing_issuance",
        safe_mode: emergency.safe_mode,
        reason: emergency.reason || null,
      }, { status: 409 });
    }
    let billingEpoch: any;
    try {
      billingEpoch = await captureEmergencyEpoch(svc, "billing_issuance");
    } catch (error: any) {
      return Response.json({
        ok: false,
        error: error?.message || "emergency_control_paused:billing_issuance",
        material_effects_fail_closed: true,
      }, { status: 409 });
    }
    const mode = resolveBillingMode();
    // The key prefix proves only test/live mode. It does not prove ownership of
    // CAMBRA's pinned Stripe account. Verify the remote account before reading
    // candidates or acquiring any local invoice claim, so a wrong same-mode key
    // produces zero local economic writes and zero POST effects.
    try {
      await assertBillingAccount(mode);
    } catch (_error: any) {
      return Response.json({
        ok: false,
        error: "stripe_billing_account_authority_unavailable",
        material_effects_fail_closed: true,
      }, { status: 503 });
    }
    const now = () => new Date().toISOString();

    // Global preconditions — fail loudly BEFORE touching any report.
    const identity = readLegalIdentity();
    // `=== false`, not `!`: tsconfig.critical.json runs strict:false, where
    // truthiness narrowing does NOT discriminate the union. Same runtime branch.
    if (identity.ok === false) {
      // Destructured INSIDE the guard so the union narrows to its false arm.
      const { missing } = identity;
      return Response.json({
        ok: false,
        error: "legal_identity_missing",
        missing,
      }, { status: 409 });
    }
    const cfg = readTaxConfig();
    // `=== false` (not `!`): strict:false does not narrow on truthiness.
    if (cfg.ok === false) {
      const { missing } = cfg;
      return Response.json(
        { ok: false, error: "tax_config_missing", missing },
        { status: 409 },
      );
    }
    // French e-invoicing control (§17): when the mandatory date arrives without
    // a compliant platform integration, automatic issuance STOPS.
    if (cfg.config.einvoicing_mode === "blocked_not_ready") {
      return Response.json({
        ok: false,
        error: "french_einvoicing_blocked_not_ready",
      }, { status: 409 });
    }

    // Select work: one explicit report, or a bounded scan of eligible ones.
    let candidates: any[] = [];
    if (body?.report_id) {
      candidates = await svc.entities.MonthlySavingsReport.filter(
        { id: body.report_id },
        "-created_date",
        2,
      );
      if (!Array.isArray(candidates)) {
        throw new Error("report_authority_unavailable");
      }
      if (candidates.length === 0) {
        return Response.json({ ok: false, error: "report_not_found" }, {
          status: 404,
        });
      }
      if (candidates.length !== 1) {
        return Response.json(
          { ok: false, error: "report_authority_ambiguous" },
          {
            status: 409,
          },
        );
      }
    } else {
      candidates = await svc.entities.MonthlySavingsReport.filter(
        {
          billing_eligibility_status: { $in: ["eligible", "invoice_claimed"] },
        },
        "-created_date",
        50,
      );
    }
    candidates = (candidates || []).filter((r) =>
      (r.billing_eligibility_status === "eligible" && !r.invoice_id) ||
      (r.billing_eligibility_status === "invoice_claimed" && !!r.invoice_id)
    ).slice(0, BATCH);
    if (body?.report_id && candidates.length === 0) {
      return Response.json({
        ok: false,
        error: "report_not_eligible_for_invoice_execution",
      }, { status: 409 });
    }

    const results: any[] = [];

    for (const report of candidates) {
      const outcome: any = { report_id: report.id, month: report.month };
      let legalDecision: any = null;
      results.push(outcome);
      try {
        await requireCanonicalRecoverReport(svc, {
          dealActivationId: report.deal_activation_id,
          month: report.month,
          reportId: report.id,
        });
        // ── PHASE 1 — load context (reads only) ─────────────────────────
        const activation = (await svc.entities.DealActivation.filter(
          { id: report.deal_activation_id },
          "-created_date",
          1,
        ))?.[0];
        const brand = activation
          ? (await svc.entities.Brand.filter(
            { id: activation.brand_id },
            "-created_date",
            1,
          ))?.[0]
          : null;
        if (brand?.market_context_rollout === "production") {
          try {
            await assertMarketCapabilityAllowed(svc, {
              brand,
              brand_id: brand.id,
              capability: "BILL",
              actor_type: "recover_billing",
            });
          } catch (e: any) {
            outcome.ok = false;
            outcome.error = "market_capability_denied:BILL";
            outcome.decision = e?.decision || null;
            continue;
          }
        }
        const mandate = activation
          ? await resolveRecoverEconomicMandate(svc, activation)
          : null;
        const legalPayloadHash = report.calculation_hash ||
          await hashCalculation({
            report_id: report.id,
            deal_activation_id: report.deal_activation_id,
            month: report.month,
            brand_id: report.brand_id || activation?.brand_id || "",
            savings: report.savings,
            currency: report.currency || "EUR",
          });
        legalDecision = await evaluateLegalExecution(svc, {
          requested_action: "AUTHORIZE_CAMBRA_BILLING",
          merchant_id: activation?.brand_id,
          jurisdiction: brand?.billing_country || brand?.country,
          provider_id: activation?.provider_id || null,
          case_id: report.id,
          deal_activation_id: activation?.id,
          approval_id: report.legal_approval_id || body?.approval_id || null,
          material_payload_hash: legalPayloadHash,
          actor: {
            id: gate.isInternal
              ? "recover_billing"
              : String(gate.user?.email || "admin"),
            type: gate.isInternal ? "AUTOMATION" : "HUMAN_ADMIN",
            tool: "createEligibleRecoverInvoices",
            allowed_actions: ["AUTHORIZE_CAMBRA_BILLING"],
          },
        });
        if (!legalDecision.allowed) {
          outcome.ok = false;
          outcome.error = "legal_execution_not_authorized";
          outcome.decision = legalDecision.decision;
          outcome.reason_codes = legalDecision.reason_codes;
          outcome.authority_snapshot_id = legalDecision.authority_snapshot_id;
          continue;
        }
        // P5: exact report baseline, authoritative read. A persistence outage or
        // missing row must never become baselineLocked=false by a swallowed read.
        const baseline = report.baseline_id
          ? (await svc.entities.Baseline.filter(
            { id: report.baseline_id },
            "-created_date",
            1,
          ))?.[0] || null
          : null;
        const existing = activation
          ? (await svc.entities.Invoice
            .filter(
              { deal_activation_id: activation.id, month: report.month },
              "-created_date",
              10,
            ))
          : [];

        // Fresh tax determination at issuance (§15) — approval preview may be stale.
        // v62.2.2 — the fallback literal IS a valid TaxTreatment; annotating the
        // binding stops TS widening 'TAX_REVIEW_REQUIRED' to `string`. Same value,
        // same branches, no cast.
        const tax: TaxDecision = brand
          ? determineTaxTreatment({
            billing_country: String(brand.billing_country || "").toUpperCase(),
            legal_name: brand.billing_legal_name || "",
            billing_address_line1: brand.billing_address_line1 || "",
            billing_postal_code: brand.billing_postal_code || "",
            billing_city: brand.billing_city || "",
            vat_number: normalizeVat(
              brand.vat_number_normalized || brand.vat_number || "",
            ),
            tax_customer_type: brand.tax_customer_type || "",
            vies_status: brand.vies_status || "not_checked",
          }, cfg.config)
          : {
            treatment: "TAX_REVIEW_REQUIRED",
            tax_rate_bps: 0,
            blockers: ["context_missing"],
            mentions: [],
          };

        // ── PHASE 2 — PURE validation core. Policy resolved HERE, before
        // any Stripe call or economic write. ─────────────────────────────
        const prep = prepareEligibleRecoverInvoice({
          // invoice_claimed is an execution lease acquired only after explicit
          // approval. Revalidation still uses the frozen approved economics.
          report: report.billing_eligibility_status === "invoice_claimed"
            ? { ...report, billing_eligibility_status: "eligible" }
            : report,
          activation,
          mandate,
          brand,
          taxContext: {
            treatment: tax.treatment,
            tax_rate_bps: tax.tax_rate_bps,
            blockers: tax.blockers,
          },
          billingMode: mode,
          existingInvoices: existing || [],
        });

        if (prep.conflict) {
          // Typed idempotency conflict — same month, different report. No
          // Stripe call, no reuse, no pointer repair.
          outcome.error = prep.conflict.code;
          outcome.conflict = prep.conflict;
          continue;
        }

        if (!prep.eligible) {
          const blocker = prep.blockers[0] || "blocked";
          // Bookkeeping writes for specific blockers (pre-existing behavior) —
          // these mark the report blocked; they create no economic obligation.
          if (blocker.startsWith("tax_blocked:")) {
            await svc.entities.MonthlySavingsReport.update(report.id, {
              billing_eligibility_status: "blocked_tax",
              billing_block_reason: blocker.slice("tax_blocked:".length),
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "createEligibleRecoverInvoices",
                fallback: null,
                severity: "critical",
              })
            );
          } else if (
            blocker === "calculation_mismatch_reapprove" ||
            blocker === "standard_fee_missing_reapprove" ||
            blocker === "effective_fee_missing_reapprove"
          ) {
            await svc.entities.MonthlySavingsReport.update(report.id, {
              billing_eligibility_status: "blocked_contract",
              billing_block_reason: blocker,
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "createEligibleRecoverInvoices",
                fallback: null,
                severity: "critical",
              })
            );
          } else if (
            blocker === "contract_policy_unresolvable" ||
            blocker === "policy_version_mismatch" ||
            blocker === "snapshot_hash_mismatch"
          ) {
            await svc.entities.MonthlySavingsReport.update(report.id, {
              billing_eligibility_status: "blocked_contract",
              billing_block_reason: blocker,
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "createEligibleRecoverInvoices",
                fallback: null,
                severity: "critical",
              })
            );
          }
          outcome.error = blocker;
          outcome.blockers = prep.blockers;
          continue;
        }

        // ECL P5 — LAST fail-closed gate before a new local Invoice or Stripe
        // side effect. Existing economic validations remain necessary but can no
        // longer stand in for canonical ECL evidence.
        const eclInvoiceGate = await evaluateRecoverEconomicGate({
          svc,
          gateName: "create_invoice",
          brandId: activation.brand_id,
          dealActivationId: activation.id,
          baseline,
          now: now(),
        });
        if (!eclInvoiceGate.allowed) {
          const reason = eclInvoiceGate.reasons.join(" | ").slice(0, 1900);
          await svc.entities.MonthlySavingsReport.update(report.id, {
            billing_eligibility_status: "blocked_missing_evidence",
            billing_block_reason: `ecl_create_invoice:${reason}`,
          });
          outcome.error = "ecl_create_invoice_denied";
          outcome.ecl_gate = {
            gate: eclInvoiceGate.gateName,
            reasons: eclInvoiceGate.reasons,
            evidence_id: eclInvoiceGate.evidenceId || null,
          };
          continue;
        }

        // Eligible — frozen values from the pure core only.
        const amounts = prep.amounts!;
        const view = prep.economicView!;
        const taxRateRef = stripeTaxRateIdFor(tax, cfg.config, mode);
        // `=== false` (not `!`): strict:false does not narrow on truthiness.
        if (taxRateRef.ok === false) {
          const { blocker } = taxRateRef;
          outcome.error = blocker;
          continue;
        }

        const locale = ["en", "fr", "es"].includes(brand.locale)
          ? brand.locale
          : "en";
        const bounds = monthBounds(report.month);
        const customerVat = normalizeVat(
          brand.vat_number_normalized || brand.vat_number || "",
        );

        // Narrow the TOCTOU window again immediately before the first new
        // economic write. It must still be allowed AND bound to the same exact
        // evidence/hash that passed PHASE 2.
        const eclInvoiceGateFinal = await evaluateRecoverEconomicGate({
          svc,
          gateName: "create_invoice",
          brandId: activation.brand_id,
          dealActivationId: activation.id,
          baseline,
          now: now(),
        });
        const eclBindingChanged =
          eclInvoiceGateFinal.evidenceId !== eclInvoiceGate.evidenceId ||
          eclInvoiceGateFinal.confidenceResultHash !==
            eclInvoiceGate.confidenceResultHash;
        if (!eclInvoiceGateFinal.allowed || eclBindingChanged) {
          const reasons = [
            ...(eclInvoiceGateFinal.reasons || []),
            ...(eclBindingChanged
              ? ["ecl_binding_changed_before_invoice_write"]
              : []),
          ];
          await svc.entities.MonthlySavingsReport.update(report.id, {
            billing_eligibility_status: "blocked_missing_evidence",
            billing_block_reason: `ecl_create_invoice:${
              reasons.join(" | ").slice(0, 1900)
            }`,
          });
          outcome.error = "ecl_create_invoice_denied_final";
          outcome.ecl_gate = {
            gate: "create_invoice",
            reasons,
            evidence_id: eclInvoiceGateFinal.evidenceId || null,
          };
          continue;
        }

        // ── PHASE 3 — local execution claim before any Stripe call ───────
        // P6: Stripe idempotency already prevents a duplicate remote invoice,
        // but the local mirror also needs a deterministic claim. Sequential
        // retries reuse the same execution_key; concurrent duplicate drafts are
        // collapsed on re-read. A committed duplicate is NEVER auto-deleted.
        let inv = prep.resume
          ? (existing || []).find((i: any) =>
            String(i.id) === prep.resume!.invoice_id
          )
          : null;
        const claim = await claimRecoverInvoiceDraft(
          svc,
          recoverExecutionKey(report.id),
          {
            deal_activation_id: activation.id,
            brand_id: activation.brand_id,
            provider_id: activation.provider_id || "",
            organization_id: activation.brand_id,
            mandate_id: mandate.id,
            baseline_id: report.baseline_id || "",
            monthly_savings_report_id: report.id,
            month: report.month,
            currency: "EUR",
            status: "draft",
            reconciliation_status: "pending",
            payment_provider: "stripe",
            processor_customer_id: brand.stripe_customer_id,
            tax_treatment: tax.treatment,
            tax_rate: tax.tax_rate_bps / 100,
            supplier_legal_name: identity.identity.legal_name,
            supplier_address: identity.identity.registered_address,
            supplier_vat_number: identity.identity.vat_id,
            supplier_siren: identity.identity.siren,
            supplier_siret: identity.identity.siret,
            customer_legal_name: brand.billing_legal_name || "",
            customer_address: [
              brand.billing_address_line1,
              brand.billing_address_line2,
              `${brand.billing_postal_code || ""} ${brand.billing_city || ""}`
                .trim(),
            ].filter(Boolean).join(", "),
            customer_country: String(brand.billing_country || "").toUpperCase(),
            customer_vat_number: customerVat,
            vies_status: brand.vies_status || "not_checked",
            vies_checked_at: brand.vies_checked_at || null,
            vies_evidence_json: brand.vies_response_snapshot || {},
            service_period_start: bounds.start,
            service_period_end: bounds.end,
            subtotal_amount: amounts.fee_net_eur,
            fee_net_amount: amounts.fee_net_eur,
            tax_amount: amounts.tax_eur,
            total_amount: amounts.total_eur,
            balance_due: amounts.total_eur,
            discount_type: amounts.discount_pct > 0
              ? "referral_commercial_discount"
              : "",
            discount_amount: amounts.discount_pct > 0
              ? Math.round(
                (amounts.billable_savings_minor * amounts.discount_pct) / 100,
              ) / 100
              : 0,
            prenotification_status: "provider_managed",
            policy_version: prep.policyVersion || undefined,
            policy_source: prep.policySource || undefined,
            snapshot_hash: prep.snapshotHash || undefined,
          },
          { preferredInvoice: inv },
        );
        inv = claim.invoice;
        if (!claim.acquired) {
          if (claim.review_required) {
            outcome.ok = false;
            outcome.error = "recover_invoice_effect_unknown_review_required";
            outcome.review_required = true;
            outcome.effect_keys = claim.effect_keys || [];
            outcome.invoice_id = inv.id;
            continue;
          }
          if (claim.terminal) {
            outcome.ok = true;
            outcome.resumed = true;
            outcome.invoice_id = inv.id;
            outcome.invoice_number = inv.invoice_number || "";
            outcome.stripe_invoice_id = inv.stripe_invoice_id || "";
            continue;
          }
          // Another invocation owns the unexpired lease. This is a successful
          // idempotent deferral, not permission to call Stripe concurrently.
          outcome.ok = true;
          outcome.in_progress = true;
          outcome.invoice_id = inv.id;
          continue;
        }
        outcome.invoice_id = inv.id;
        const claimedStripeRequest = async (
          effectKey: string,
          path: string,
          params: Record<string, string>,
          idempotencyKey: string,
          responseBinding: Parameters<
            typeof recoverStripeBillingRequest
          >[0]["response_binding"] = null,
        ) => {
          // Revalidate the activation/month singleton immediately before every
          // provider effect. A duplicate generated after approval is contained
          // locally; after an earlier effect it remains review-required under
          // the existing report lease rather than authorizing another invoice.
          await requireCanonicalRecoverReport(svc, {
            dealActivationId: report.deal_activation_id,
            month: report.month,
            reportId: report.id,
          });
          return executeRecoverBillingProviderRequest(svc, claim, {
            effect_key: `stripe_billing:${effectKey}`,
            request: recoverStripeBillingRequest({
              mode,
              method: "POST",
              path,
              params,
              idempotency_key: idempotencyKey,
              response_binding: responseBinding,
            }),
            emergency_epoch_claim: billingEpoch,
            now,
          });
        };

        // ── PHASE 4 — Stripe (idempotent per step, keys from report id) ──
        let stripeInvoiceId = inv.stripe_invoice_id || "";
        if (!stripeInvoiceId) {
          // Reverse charge (EU, incl. the deprecated ES alias) and outside-scope
          // (non-EU) both print their legally-required mentions plus the
          // customer's tax identifier; FR domestic prints supplier identity only
          // (the TVA rate lives on the Stripe Tax Rate object).
          const footer = isReverseChargeTreatment(tax.treatment) || tax.treatment === "OUTSIDE_SCOPE_EU_VAT"
            ? `${
              tax.mentions.join(" — ")
            } — Supplier SIRET: ${identity.identity.siret} — Supplier VAT: ${identity.identity.vat_id} — Customer VAT: ${customerVat}`
            : `Supplier SIRET: ${identity.identity.siret} — Supplier VAT: ${identity.identity.vat_id}`;
          const created = await claimedStripeRequest(
            `create_invoice:${report.id}`,
            "invoices",
            {
              customer: brand.stripe_customer_id,
              collection_method: "charge_automatically",
              default_payment_method: activation.stripe_payment_method_id,
              currency: "eur",
              auto_advance: "false",
              footer: footer.slice(0, 500),
              // String()-coerced on purpose: URLSearchParams would otherwise send
              // the literal "undefined" to Stripe for a missing id.
              "metadata[organization_id]": String(activation.brand_id || ""),
              "metadata[brand_id]": String(activation.brand_id || ""),
              "metadata[deal_activation_id]": String(activation.id),
              "metadata[mandate_id]": String(mandate.id),
              "metadata[monthly_savings_report_id]": String(report.id),
              "metadata[local_invoice_id]": String(inv.id),
              "metadata[billing_month]": String(report.month),
              "metadata[ecl_evidence_id]": String(
                eclInvoiceGateFinal.evidenceId || "",
              ),
              "metadata[ecl_confidence_hash]": String(
                eclInvoiceGateFinal.confidenceResultHash || "",
              ),
              "metadata[ecl_policy_version]": String(
                eclInvoiceGateFinal.policyVersion || "",
              ),
            },
            `r4:inv:create:${report.id}`,
            {
              customer_id: brand.stripe_customer_id,
              currency: "eur",
              metadata: {
                local_invoice_id: String(inv.id),
                monthly_savings_report_id: String(report.id),
              },
            },
          );
          if (!created.ok) {
            outcome.error = `stripe_invoice_create_failed:${created.status}`;
            continue;
          }
          stripeInvoiceId = created.data.id;
          await svc.entities.Invoice.update(inv.id, {
            stripe_invoice_id: stripeInvoiceId,
            stripe_invoice_status: created.data.status || "draft",
            reconciliation_status: "pending",
          });
          const invoicePointerRows = await svc.entities.Invoice.filter(
            { id: inv.id },
            "-created_date",
            2,
          );
          if (
            !Array.isArray(invoicePointerRows) ||
            invoicePointerRows.length !== 1 ||
            String(invoicePointerRows[0].stripe_invoice_id || "") !==
              stripeInvoiceId
          ) {
            throw new Error("recover_invoice_stripe_pointer_readback_mismatch");
          }
          inv = invoicePointerRows[0];
        }

        // Line item (skipped if already present — resume-safe via Stripe idempotency).
        const itemParams: Record<string, string> = {
          customer: brand.stripe_customer_id,
          invoice: stripeInvoiceId,
          amount: String(amounts.fee_net_minor),
          currency: "eur",
          description: lineDescription(report.month, locale),
        };
        if (taxRateRef.tax_rate_id) {
          itemParams["tax_rates[0]"] = taxRateRef.tax_rate_id;
        }
        const item = await claimedStripeRequest(
          `create_invoice_item:${report.id}`,
          "invoiceitems",
          itemParams,
          `r4:inv:item:${report.id}`,
          {
            customer_id: brand.stripe_customer_id,
            parent_invoice_id: stripeInvoiceId,
            amount_minor: amounts.fee_net_minor,
            currency: "eur",
          },
        );
        if (!item.ok) {
          outcome.error = `stripe_item_failed:${item.status}`;
          continue;
        }

        // Reverse charge (EU, incl. the deprecated ES alias): mark the Stripe
        // Customer exempt='reverse' so the hosted invoice/PDF prints the
        // reverse-charge treatment, and attach the customer's VAT id
        // (best-effort — the mention also lives in footer).
        if (isReverseChargeTreatment(tax.treatment)) {
          await claimedStripeRequest(
            `reverse_tax:${report.id}`,
            `customers/${brand.stripe_customer_id}`,
            { tax_exempt: "reverse" },
            `r4:tax-exempt:${report.id}`,
            { object_id: brand.stripe_customer_id },
          );
          await claimedStripeRequest(
            `attach_tax_id:${report.id}`,
            `customers/${brand.stripe_customer_id}/tax_ids`,
            { type: "eu_vat", value: customerVat },
            `r4:taxid:${brand.id}`,
            { customer_id: brand.stripe_customer_id },
          );
        }

        // Outside the scope of EU VAT (NO IS LI CH GB AD): exempt, not reverse —
        // 'reverse' would print an EU reverse-charge notice that does not apply
        // outside the EU. Stripe tax-id types are per-country; GB is the only
        // one attached (gb_vat). The rest carry their identifier in the footer
        // only, on purpose: a wrong Stripe type is a validation error at
        // invoice time, and the footer already satisfies the invoice mention.
        if (tax.treatment === "OUTSIDE_SCOPE_EU_VAT") {
          await claimedStripeRequest(
            `reverse_tax:${report.id}`,
            `customers/${brand.stripe_customer_id}`,
            { tax_exempt: "exempt" },
            `r4:tax-exempt:${report.id}`,
            { object_id: brand.stripe_customer_id },
          );
          if (String(brand?.billing_country || "").toUpperCase() === "GB") {
            await claimedStripeRequest(
              `attach_tax_id:${report.id}`,
              `customers/${brand.stripe_customer_id}/tax_ids`,
              { type: "gb_vat", value: customerVat },
              `r4:taxid:${brand.id}`,
              { customer_id: brand.stripe_customer_id },
            );
          }
        }

        // Finalize — Stripe assigns THE legal number here. This is the LAST
        // Stripe side effect; every validation already happened in PHASE 2.
        const fin = await claimedStripeRequest(
          `finalize_invoice:${report.id}`,
          `invoices/${stripeInvoiceId}/finalize`,
          { auto_advance: "true" },
          `r4:inv:fin:${report.id}`,
          {
            object_id: stripeInvoiceId,
            customer_id: brand.stripe_customer_id,
            total_minor: amounts.total_minor,
            currency: "eur",
            allowed_statuses: ["open", "paid"],
            require_number: true,
            metadata: {
              local_invoice_id: String(inv.id),
              monthly_savings_report_id: String(report.id),
            },
          },
        );
        if (!fin.ok) {
          outcome.error = `stripe_finalize_failed:${fin.status}`;
          continue;
        }
        const finalized = fin.data;

        // ── PHASE 5 — persist result + provenance (frozen in PHASE 2) ───
        const snapshot = {
          report: {
            id: report.id,
            month: report.month,
            savings: report.savings,
            billable_savings: amounts.billable_savings_eur,
            calculation_hash: report.calculation_hash || null,
            calculation_version: report.calculation_version || null,
          },
          baseline_id: report.baseline_id || null,
          mandate: {
            id: mandate.id,
            document_version: mandate.document_version,
            acceptance_snapshot_hash: mandate.acceptance_snapshot_hash,
          },
          fee: {
            standard_pct: amounts.standard_fee_pct,
            discount_pct: amounts.discount_pct,
            effective_pct: amounts.effective_fee_pct,
          },
          // v61 — contract policy provenance, resolved BEFORE Stripe (PHASE 2).
          policy: {
            policy_version: prep.policyVersion,
            policy_source: prep.policySource,
            snapshot_hash: prep.snapshotHash,
            mandate_id: mandate.id,
            report_id: report.id,
            billing_rule_id: report.billing_rule_id || null,
            merchant_share_pct: view.merchantSharePct,
            fee_duration_months: view.feeDurationMonths,
            resolvable: true,
          },
          ecl: {
            gate: "create_invoice",
            policy_version: eclInvoiceGateFinal.policyVersion,
            evidence_entity_type: eclInvoiceGateFinal.evidenceEntityType,
            evidence_id: eclInvoiceGateFinal.evidenceId,
            confidence_result_hash: eclInvoiceGateFinal.confidenceResultHash,
            evidence_status: eclInvoiceGateFinal.evidenceStatus,
            confidence_level: eclInvoiceGateFinal.confidenceLevel,
            verification_method: eclInvoiceGateFinal.verificationMethod,
            baseline_id: eclInvoiceGateFinal.baselineId,
          },
          legal_execution: {
            decision: legalDecision.decision,
            policy_version: legalDecision.policy_version,
            regulatory_policy_version: legalDecision.regulatory_policy_version,
            authority_snapshot_id: legalDecision.authority_snapshot_id,
            authority_snapshot_hash: legalDecision.authority_snapshot_hash,
          },
          idempotency: prep.idempotencyIdentity,
          tax: {
            treatment: tax.treatment,
            rate_bps: tax.tax_rate_bps,
            mentions: tax.mentions,
            vies_status: brand.vies_status || "not_checked",
            vies_checked_at: brand.vies_checked_at || null,
          },
          supplier: {
            legal_name: identity.identity.legal_name,
            legal_form: identity.identity.legal_form,
            siren: identity.identity.siren,
            siret: identity.identity.siret,
            vat_id: identity.identity.vat_id,
            address: identity.identity.registered_address,
          },
          customer: {
            legal_name: brand.billing_legal_name,
            country: brand.billing_country,
            vat: customerVat,
          },
          period: bounds,
          amounts_minor: {
            fee_net: amounts.fee_net_minor,
            tax: amounts.tax_minor,
            total: amounts.total_minor,
          },
          rounding_policy: "half_up_integer_cents_v1",
          stripe: {
            mode,
            invoice_id: stripeInvoiceId,
            number: finalized.number || "",
          },
        };
        const snapshotHash = await hashCalculation(snapshot);
        const issuedAt = prep.resume?.fully_issued
          ? String(inv.invoice_finalized_at || inv.issued_at || "")
          : String(fin.execution_receipt?.observed_at || "");
        if (!Number.isFinite(new Date(issuedAt).getTime())) {
          throw new Error("recover_invoice_provider_receipt_time_missing");
        }

        await assertEmergencyEpochUnchanged(
          svc,
          billingEpoch,
          `before_local_invoice_commit:${report.id}`,
        );
        const invoicePatch = {
          status: "issued",
          invoice_number: finalized.number || "",
          issued_at: issuedAt,
          invoice_finalized_at: issuedAt,
          due_at: finalized.due_date
            ? new Date(finalized.due_date * 1000).toISOString()
            : null,
          hosted_invoice_url: finalized.hosted_invoice_url || "",
          pdf_url: finalized.invoice_pdf || "",
          stripe_invoice_status: finalized.status || "open",
          processor_payment_intent_id:
            typeof finalized.payment_intent === "string"
              ? finalized.payment_intent
              : "",
          collection_scheduled_at: now(),
          billing_snapshot_json: snapshot,
          invoice_snapshot_hash: snapshotHash,
          policy_version: prep.policyVersion || undefined,
          snapshot_hash: prep.snapshotHash || undefined,
          policy_source: prep.policySource || undefined,
          reconciliation_status: "pending",
        };
        const invoiceReadback = {
          status: "issued",
          stripe_invoice_id: stripeInvoiceId,
          invoice_number: finalized.number || "",
          issued_at: issuedAt,
          invoice_finalized_at: issuedAt,
          billing_snapshot_json: snapshot,
          invoice_snapshot_hash: snapshotHash,
        };
        const eventHash = `p6:invoice-issued:${inv.id}:${stripeInvoiceId}`;
        const eventRecord = {
          invoice_id: inv.id,
          brand_id: activation.brand_id,
          amount: amounts.total_eur,
          currency: "EUR",
          event_type: "invoice_issued",
          processor: "stripe",
          processor_ref: stripeInvoiceId,
          metadata_json: {
            month: report.month,
            number: finalized.number || "",
            mode,
            provider_receipt_hash: fin.execution_receipt?.receipt_hash ||
              inv.invoice_snapshot_hash || "",
            request_fingerprint: fin.execution_receipt?.request_fingerprint ||
              "",
          },
          occurred_at: issuedAt,
        };
        await convergeRecoverInvoiceIssuance(svc, claim, {
          invoice_patch: invoicePatch,
          invoice_readback: invoiceReadback,
          invoice_immutable_fields: [
            "stripe_invoice_id",
            "invoice_number",
            "issued_at",
            "invoice_finalized_at",
            "billing_snapshot_json",
            "invoice_snapshot_hash",
          ],
          event_hash: eventHash,
          event_record: eventRecord,
          activation_id: activation.id,
          activation_patch: {
            first_invoice_issued_at: activation.first_invoice_issued_at ||
              issuedAt,
          },
          activation_readback: {
            first_invoice_issued_at: activation.first_invoice_issued_at ||
              issuedAt,
          },
          report_patch: { status: "invoiced", verification_status: "invoiced" },
        });
        await assertEmergencyEpochUnchanged(
          svc,
          billingEpoch,
          `after_local_invoice_commit:${report.id}`,
        );
        await svc.entities.OperationalLog.create({
          deal_activation_id: activation.id,
          brand_id: activation.brand_id,
          event_type: "status_changed",
          message: "recover_invoice_finalized",
          data_json: {
            invoice_id: inv.id,
            stripe_invoice_id: stripeInvoiceId,
            number: finalized.number || "",
            total_eur: amounts.total_eur,
            tax_treatment: tax.treatment,
            mode,
            policy_version: prep.policyVersion,
            policy_source: prep.policySource,
            ecl_evidence_id: eclInvoiceGateFinal.evidenceId,
            ecl_confidence_result_hash:
              eclInvoiceGateFinal.confidenceResultHash,
            ecl_policy_version: eclInvoiceGateFinal.policyVersion,
          },
          actor_email: gate.user?.email || "internal",
          created_at: now(),
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "createEligibleRecoverInvoices",
            fallback: null,
            severity: "critical",
          })
        );

        outcome.ok = true;
        outcome.invoice_id = inv.id;
        outcome.stripe_invoice_id = stripeInvoiceId;
        outcome.invoice_number = finalized.number || "";
        outcome.total_eur = amounts.total_eur;
        outcome.tax_treatment = tax.treatment;
      } catch (e: any) {
        outcome.ok = false;
        outcome.error = String(e?.message || e);
        const raced = e?.code === "EMERGENCY_EFFECT_AMBIGUOUS" ||
          e?.code === "EMERGENCY_CONTROL_EPOCH_CHANGED" ||
          e?.code === "EMERGENCY_CONTROL_PAUSED";
        const sagaReview = e?.code === "RECOVER_BILLING_REVIEW_REQUIRED" ||
          e?.review_required === true;
        if (raced || sagaReview) {
          outcome.review_required = true;
          outcome.emergency_effect_key = e?.effect_key || e?.phase || null;
          const providerCheckpoint = stripeBillingObjectId(
            outcome.emergency_effect_key,
            e?.effect_result,
          );
          outcome.provider_object_kind = providerCheckpoint.kind;
          outcome.provider_object_id = providerCheckpoint.id;
          outcome.provider_object_postcondition_valid =
            providerCheckpoint.postcondition_valid;
          if (outcome.invoice_id) {
            await svc.entities.Invoice.update(outcome.invoice_id, {
              reconciliation_status: "error",
              last_error: `emergency_epoch_race:${
                String(outcome.emergency_effect_key || "local_invoice_commit")
                  .slice(0, 160)
              }`,
              last_failed_at: now(),
              ...(providerCheckpoint.invoice_id
                ? { stripe_invoice_id: providerCheckpoint.invoice_id }
                : {}),
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation:
                  "createEligibleRecoverInvoices.mark_emergency_reconciliation_required",
                fallback: null,
                severity: "critical",
              })
            );
          }
        }
      }
    }

    const failures = results.filter((row) => row?.ok !== true);
    const ok = failures.length === 0;
    return Response.json({
      ok,
      mode,
      scanned: candidates.length,
      failed: failures.length,
      results,
    }, { status: ok ? 200 : 409 });
  } catch (error) {
    return internalErrorResponse(error, "createEligibleRecoverInvoices");
  }
}
