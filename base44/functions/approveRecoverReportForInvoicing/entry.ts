import { safeBestEffort } from "../../shared/bestEffort.ts";
// approveRecoverReportForInvoicing — RECOVER-4 (2026-08-04).
//
// The human gate between "measured" and "invoiceable". Admin only. Runs every
// pre-billing check (§9), computes the billable figures deterministically in
// integer cents, and writes the eligibility verdict onto the report. Only a
// report this function marked 'eligible' can ever reach Stripe — estimated or
// projected measurements are refused here, permanently (§31: no projections,
// no historical averages, no confidence scores as a substitute for evidence).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { resolveRecoverEconomicMandate } from "../../shared/recoverEconomicMandate.ts";
import { resolveFeePctForMonth } from "../../shared/billingFee.ts";
import { resolveBillingMode } from "../../shared/stripeBilling.ts";
import {
  determineTaxTreatment,
  normalizeVat,
  readTaxConfig,
} from "../../shared/recoverTax.ts";
import {
  computeInvoiceAmounts,
  hashCalculation,
  monthBillableWindow,
  RECOVER_CALCULATION_VERSION,
} from "../../shared/recoverBillingMath.ts";
import {
  buildContractEconomicView,
  resolveContractPolicy,
} from "../../shared/contractPolicySnapshot.ts";
import { evaluateRecoverEconomicGate } from "../../shared/eclEconomicGate.ts";
import {
  periodEconomicsV2,
  periodOverlapsTerm,
  RECOVERY_ECONOMICS_V2,
  recoveryTermFromActivation,
  referralCountFromYear1EquivalentFee,
  reportPeriodBounds,
} from "../../shared/recoveryEconomicsV2.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import {
  persistRecoverReportApprovalDecision,
  requireCanonicalRecoverReport,
} from "../../shared/recoverReportAuthority.ts";

function approvalAuthorityProjection(
  report: any,
  activation: any,
  brand: any,
  mandate: any,
  baseline: any,
) {
  return {
    report: {
      id: report?.id || null,
      updated_date: report?.updated_date || null,
      deal_activation_id: report?.deal_activation_id || null,
      brand_id: report?.brand_id || null,
      vertical: report?.vertical || null,
      month: report?.month || null,
      currency: report?.currency || null,
      effective_start: report?.effective_start || null,
      effective_end: report?.effective_end || null,
      billing_eligibility_status: report?.billing_eligibility_status || null,
      invoice_id: report?.invoice_id || null,
      measurement_mode: report?.measurement_mode || null,
      verification_status: report?.verification_status || null,
      verified_at: report?.verified_at || null,
      verified_by: report?.verified_by || null,
      evidence_count: Number(report?.evidence_count || 0),
      savings: Number(report?.savings || 0),
      baseline_id: report?.baseline_id || null,
      approved_for_invoicing_at: report?.approved_for_invoicing_at || null,
      effective_fee_pct: report?.effective_fee_pct ?? null,
      policy_version: report?.policy_version || null,
      snapshot_hash: report?.snapshot_hash || null,
      calculation_hash: report?.calculation_hash || null,
    },
    activation: {
      id: activation?.id || null,
      updated_date: activation?.updated_date || null,
      status: activation?.status || null,
      brand_id: activation?.brand_id || null,
      vertical: activation?.vertical || null,
      provider_id: activation?.provider_id || null,
      node_share_percent: activation?.node_share_percent ?? null,
      payment_method_status: activation?.payment_method_status || null,
      stripe_payment_method_id: activation?.stripe_payment_method_id || null,
      stripe_billing_mode: activation?.stripe_billing_mode || null,
      conditions_activated_at: activation?.conditions_activated_at || null,
      recovery_economics_version: activation?.recovery_economics_version ||
        null,
      economic_right_status: activation?.economic_right_status || null,
      recovery_mandate_id: activation?.recovery_mandate_id || null,
    },
    brand: {
      id: brand?.id || null,
      updated_date: brand?.updated_date || null,
      is_demo: brand?.is_demo === true,
      stripe_customer_id: brand?.stripe_customer_id || null,
      stripe_billing_mode: brand?.stripe_billing_mode || null,
      billing_country: brand?.billing_country || null,
      billing_legal_name: brand?.billing_legal_name || null,
      billing_address_line1: brand?.billing_address_line1 || null,
      billing_postal_code: brand?.billing_postal_code || null,
      billing_city: brand?.billing_city || null,
      vat: brand?.vat_number_normalized || brand?.vat_number || null,
      tax_customer_type: brand?.tax_customer_type || null,
      vies_status: brand?.vies_status || null,
    },
    mandate: {
      id: mandate?.id || null,
      updated_date: mandate?.updated_date || null,
      status: mandate?.status || null,
      acceptance_snapshot_hash: mandate?.acceptance_snapshot_hash || null,
      acceptance_snapshot_json: mandate?.acceptance_snapshot_json || null,
      signed_at: mandate?.signed_at || null,
    },
    baseline: {
      id: baseline?.id || null,
      updated_date: baseline?.updated_date || null,
      locked: baseline?.locked === true,
      verified_at: baseline?.verified_at || null,
      verified_by: baseline?.verified_by || null,
      brand_id: baseline?.brand_id || null,
      deal_activation_id: baseline?.deal_activation_id || null,
      vertical: baseline?.vertical || null,
      baseline_value: baseline?.baseline_value ?? null,
    },
  };
}

async function approvalAuthorityHash(
  report: any,
  activation: any,
  brand: any,
  mandate: any,
  baseline: any,
) {
  return hashCalculation(
    approvalAuthorityProjection(report, activation, brand, mandate, baseline),
  );
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error: any) =>
      safeBestEffort(error, {
        operation: "approveRecoverReportForInvoicing",
        fallback: null,
        severity: "critical",
      })
    );
    if (user?.role !== "admin") {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { report_id } = body || {};
    if (!report_id) {
      return Response.json({ error: "report_id required" }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const reports = await svc.entities.MonthlySavingsReport.filter(
      { id: report_id },
      "-created_date",
      2,
    );
    if (!Array.isArray(reports)) {
      throw new Error("report_authority_unavailable");
    }
    if (reports.length === 0) {
      return Response.json({ error: "report not found" }, { status: 404 });
    }
    if (reports.length !== 1) {
      return Response.json({ error: "report_authority_ambiguous" }, {
        status: 409,
      });
    }
    const report = reports[0];
    try {
      await requireCanonicalRecoverReport(svc, {
        dealActivationId: report.deal_activation_id,
        month: report.month,
        reportId: report.id,
      });
    } catch (error: any) {
      return Response.json({
        error: error?.message || "recover_report_authority_blocked",
        effects: false,
      }, { status: 409 });
    }
    if (report.billing_eligibility_status === "invoiced" || report.invoice_id) {
      return Response.json({
        error: "already_invoiced",
        invoice_id: report.invoice_id || null,
      }, { status: 409 });
    }

    const activations = await svc.entities.DealActivation.filter(
      { id: report.deal_activation_id },
      "-created_date",
      2,
    );
    if (!Array.isArray(activations)) {
      throw new Error("activation_authority_unavailable");
    }
    if (activations.length === 0) {
      return Response.json({ error: "activation not found" }, { status: 404 });
    }
    if (activations.length !== 1) {
      return Response.json({ error: "activation_authority_ambiguous" }, {
        status: 409,
      });
    }
    const activation = activations[0];
    const brands = await svc.entities.Brand.filter(
      { id: report.brand_id || activation.brand_id },
      "-created_date",
      2,
    );
    if (!Array.isArray(brands)) throw new Error("brand_authority_unavailable");
    if (brands.length !== 1) {
      return Response.json({
        error: brands.length === 0
          ? "brand_authority_missing"
          : "brand_authority_ambiguous",
      }, { status: 409 });
    }
    const brand = brands[0];
    const mandate = await resolveRecoverEconomicMandate(svc, activation);

    const blockers: { status: string; reason: string }[] = [];
    const block = (status: string, reason: string) =>
      blockers.push({ status, reason });

    // ── Contract / mandate ────────────────────────────────────────────────
    if (!mandate) block("blocked_contract", "no_active_mandate");
    if (report.vertical !== "payments") {
      block("blocked_contract", `unsupported_vertical:${report.vertical}`);
    }
    if ((report.currency || "EUR") !== "EUR") {
      block("blocked_contract", `unsupported_currency:${report.currency}`);
    }
    if (brand?.is_demo) block("blocked_contract", "demo_brand_never_billed");

    // Accepted baseline, not "any current baseline" (§8).
    const snapshotBaselineId = mandate?.acceptance_snapshot_json?.baseline_id ||
      null;
    if (mandate && !snapshotBaselineId) {
      block("blocked_contract", "mandate_snapshot_missing_baseline");
    }
    if (
      mandate && snapshotBaselineId && report.baseline_id !== snapshotBaselineId
    ) {
      block(
        "blocked_contract",
        `baseline_mismatch:report=${
          report.baseline_id || "none"
        };accepted=${snapshotBaselineId}`,
      );
    }
    // P5 reads the exact accepted baseline; no "current baseline" substitution.
    const acceptedBaselineRows = snapshotBaselineId
      ? await svc.entities.Baseline.filter(
        { id: snapshotBaselineId },
        "-created_date",
        2,
      )
      : [];
    if (!Array.isArray(acceptedBaselineRows)) {
      throw new Error("accepted_baseline_authority_unavailable");
    }
    if (acceptedBaselineRows.length > 1) {
      return Response.json({ error: "accepted_baseline_authority_ambiguous" }, {
        status: 409,
      });
    }
    const acceptedBaseline = acceptedBaselineRows[0] || null;
    if (snapshotBaselineId && !acceptedBaseline) {
      block("blocked_contract", "accepted_baseline_not_found");
    }
    const initialAuthorityHash = await approvalAuthorityHash(
      report,
      activation,
      brand,
      mandate,
      acceptedBaseline,
    );
    const authorityStillStable = async () => {
      try {
        await requireCanonicalRecoverReport(svc, {
          dealActivationId: report.deal_activation_id,
          month: report.month,
          reportId: report.id,
        });
      } catch (_) {
        return false;
      }
      const freshReports = await svc.entities.MonthlySavingsReport.filter(
        { id: report.id },
        "-created_date",
        2,
      );
      const freshActivations = await svc.entities.DealActivation.filter(
        { id: activation.id },
        "-created_date",
        2,
      );
      const freshBrands = await svc.entities.Brand.filter(
        { id: brand?.id || report.brand_id },
        "-created_date",
        2,
      );
      if (
        freshReports.length !== 1 || freshActivations.length !== 1 ||
        freshBrands.length !== 1
      ) return false;
      const freshActivation = freshActivations[0];
      const freshMandate = await resolveRecoverEconomicMandate(
        svc,
        freshActivation,
      );
      const freshBaseline = snapshotBaselineId
        ? (await svc.entities.Baseline.filter(
          { id: snapshotBaselineId },
          "-created_date",
          2,
        ))
        : [];
      if (snapshotBaselineId && freshBaseline.length !== 1) return false;
      return (await approvalAuthorityHash(
        freshReports[0],
        freshActivation,
        freshBrands[0],
        freshMandate,
        freshBaseline[0] || null,
      )) === initialAuthorityHash;
    };

    // ECL P5 — report approval is the first point a measured result can become
    // invoiceable. Gate the server-resolved activation evidence before any
    // eligibility write; legacy report fields never substitute for ECL.
    const eclApproveGate = await evaluateRecoverEconomicGate({
      svc,
      gateName: "approve_report",
      brandId: report.brand_id || activation.brand_id,
      dealActivationId: activation.id,
      baseline: acceptedBaseline,
      now: new Date().toISOString(),
    });
    if (!eclApproveGate.allowed) {
      for (const reason of eclApproveGate.reasons) {
        block("blocked_missing_evidence", `ecl_approve_report:${reason}`);
      }
    }

    // Contractual calendar. V1 keeps its original full-month calendar.
    // V2 is an exact 24-month term from verified conditions activation and can
    // segment a verified partial period at activation / month 12 / month 24.
    const isEconomicsV2 =
      mandate?.acceptance_snapshot_json?.recovery_economics?.version ===
        RECOVERY_ECONOMICS_V2;
    const reportPeriod = reportPeriodBounds(
      report.month,
      report.effective_start || null,
      report.effective_end || null,
    );
    if (!activation.conditions_activated_at) {
      block("blocked_contract", "conditions_activated_at_missing");
    } else if (isEconomicsV2) {
      const v2TermForCalendar = recoveryTermFromActivation(
        activation.conditions_activated_at,
      );
      if (
        !periodOverlapsTerm(
          reportPeriod.start,
          reportPeriod.endExclusive,
          activation.conditions_activated_at,
        )
      ) {
        block("blocked_contract", "outside_recovery_term");
      }
      // Activation-month savings cannot be safely day-prorated from a full-month aggregate:
      // the pre-activation days were still on the old conditions. Require the report
      // itself to be scoped to the post-activation interval.
      if (
        reportPeriod.start < v2TermForCalendar.start && !report.effective_start
      ) {
        block(
          "blocked_contract",
          "partial_activation_requires_scoped_measurement",
        );
      }
    } else {
      const window = monthBillableWindow(
        report.month,
        activation.conditions_activated_at,
      );
      if (window.billable === false) {
        const { reason } = window;
        block("blocked_contract", reason);
      }
    }

    // ── Measurement quality (§9) ──────────────────────────────────────────
    if (report.measurement_mode === "manual_override") {
      block(
        "blocked_missing_evidence",
        "manual_override_requires_documented_dual_approval_flow_not_implemented",
      );
    } else if (report.measurement_mode !== "fully_verified") {
      block(
        "blocked_missing_evidence",
        `measurement_mode_not_billable:${report.measurement_mode}`,
      );
    }
    if (!["verified", "realized"].includes(report.verification_status)) {
      block(
        "blocked_missing_evidence",
        `verification_status_not_billable:${report.verification_status}`,
      );
    }
    if (!report.verified_at || !report.verified_by) {
      block("blocked_missing_evidence", "verified_at_or_verified_by_missing");
    }
    if (!(Number(report.evidence_count) > 0)) {
      block("blocked_missing_evidence", "evidence_count_zero");
    }

    // ── Payment method (RECOVER-2) ────────────────────────────────────────
    const mode = resolveBillingMode();
    if (activation.payment_method_status !== "ready") {
      block(
        "blocked_payment_method",
        `payment_method_status:${activation.payment_method_status || "none"}`,
      );
    }
    if (
      activation.stripe_billing_mode && activation.stripe_billing_mode !== mode
    ) {
      block(
        "blocked_payment_method",
        `stripe_mode_mismatch:pm=${activation.stripe_billing_mode};billing=${mode}`,
      );
    }
    if (!brand?.stripe_customer_id) {
      block("blocked_payment_method", "stripe_customer_missing");
    }
    if (brand?.stripe_billing_mode && brand.stripe_billing_mode !== mode) {
      block(
        "blocked_payment_method",
        `stripe_mode_mismatch:customer=${brand.stripe_billing_mode};billing=${mode}`,
      );
    }

    // ── Tax (§13–§15) ─────────────────────────────────────────────────────
    const cfg = readTaxConfig();
    const taxDecision = determineTaxTreatment({
      billing_country: String(brand?.billing_country || "").toUpperCase(),
      legal_name: brand?.billing_legal_name || "",
      billing_address_line1: brand?.billing_address_line1 || "",
      billing_postal_code: brand?.billing_postal_code || "",
      billing_city: brand?.billing_city || "",
      vat_number: normalizeVat(
        brand?.vat_number_normalized || brand?.vat_number || "",
      ),
      tax_customer_type: brand?.tax_customer_type || "",
      vies_status: brand?.vies_status || "not_checked",
    }, cfg.ok ? cfg.config : null);
    // `=== false` (not `!`): strict:false does not narrow on truthiness.
    if (cfg.ok === false) {
      const { missing } = cfg;
      block("blocked_tax", `tax_config_missing:${missing.join(",")}`);
    }
    if (taxDecision.blockers.length) {
      block("blocked_tax", taxDecision.blockers.join(","));
    }

    // ── Fee (§11): mandate-accepted pct is the CEILING; the month's
    // BillingRule may lower it (acquired referral discount, non-retroactive)
    // but can never raise it above what was accepted. ─────────────────────
    // v60.2 — the accepted fee and the standard fee both come from
    // resolveContractPolicy + buildContractEconomicView, not from a local
    // `|| 25` fallback. An unresolvable contract blocks approval.
    const contractResolved = resolveContractPolicy({ mandate });
    if (!contractResolved.resolvable) {
      block("blocked_contract", "contract_unresolvable");
    }
    const acceptedPct = contractResolved.resolvable
      ? contractResolved.successFeePct
      : Number.NaN;
    if (!Number.isFinite(acceptedPct)) {
      block("blocked_contract", "accepted_fee_pct_unresolvable");
    }
    const monthFee = contractResolved.resolvable
      ? await resolveFeePctForMonth(svc, {
        deal_activation_id: activation.id,
        brand_id: activation.brand_id,
        provider_id: activation.provider_id || null,
        fallbackPct: acceptedPct,
      }, report.month)
      : { pct: Number.NaN, rule_id: null, source: "contract_unresolvable" };
    const v2Economics =
      contractResolved.resolvable && isEconomicsV2 &&
        activation.conditions_activated_at
        ? periodEconomicsV2({
          activationIso: activation.conditions_activated_at,
          periodStart: reportPeriod.start,
          periodEndExclusive: reportPeriod.endExclusive,
          activatedReferrals: referralCountFromYear1EquivalentFee(monthFee.pct),
        })
        : null;
    const effectivePct = contractResolved.resolvable
      ? (v2Economics
        ? v2Economics.effective_fee_pct
        : Math.min(acceptedPct, Number(monthFee.pct)))
      : 0;
    // v60.2 immutability guard — a re-approval must not silently change the
    // provenance. If the report was already approved with a fee, the new
    // effective fee must match; a mismatch means the contract moved underneath
    // an approved report, which blocks instead of silently re-pricing.
    if (
      report.approved_for_invoicing_at &&
      Number.isFinite(Number(report.effective_fee_pct)) &&
      Number(report.effective_fee_pct) !== effectivePct
    ) {
      block(
        "blocked_contract",
        `provenance_mismatch:approved=${report.effective_fee_pct};recomputed=${effectivePct}`,
      );
    }

    // v60.2 — standard_fee_pct from the accepted snapshot (via the economic
    // view), not the hardcoded 25. For current contracts this is 25; for a
    // future policy B contract it would be 30. A contractual 0 is preserved.
    const econView = buildContractEconomicView({
      resolvedContractPolicy: contractResolved,
      mandate,
    });
    const standardFeePctForAmounts = contractResolved.resolvable
      ? (v2Economics ? v2Economics.standard_fee_pct : econView.standardFeePct)
      : 0;

    // ── Amounts (integer cents, §10) ──────────────────────────────────────
    const savings = Number(report.savings || 0);
    const amounts = computeInvoiceAmounts({
      savings_eur: savings,
      standard_fee_pct: standardFeePctForAmounts,
      effective_fee_pct: effectivePct,
      tax_rate_bps: 0, // tax is decided at invoice time; the report stores the NET fee only
    });

    const now = new Date().toISOString();

    // No positive savings → realized month, no invoice, no fee (§30). Not an error.
    if (
      blockers.length === 0 &&
      (amounts.billable_savings_minor <= 0 || amounts.fee_net_minor <= 0)
    ) {
      if (!(await authorityStillStable())) {
        return Response.json({
          ok: false,
          error: "approval_context_changed_retry",
        }, { status: 409 });
      }
      const persisted = await persistRecoverReportApprovalDecision(
        svc,
        report,
        {
          billing_eligibility_status: "no_positive_savings",
          billing_block_reason: "",
          billable_savings_amount: amounts.billable_savings_eur,
          fee_net_amount: 0,
          standard_fee_pct: standardFeePctForAmounts,
          discount_pct: amounts.discount_pct,
          effective_fee_pct: effectivePct,
          calculation_version: RECOVER_CALCULATION_VERSION,
          verification_status: "realized",
          approved_for_invoicing_by: user.email,
          approved_for_invoicing_at: now,
        },
      );
      if (!persisted.ok) {
        return Response.json({ ok: false, error: persisted.reason }, {
          status: 409,
        });
      }
      return Response.json({
        ok: true,
        report_id: report.id,
        billing_eligibility_status: "no_positive_savings",
        fee_net_amount: 0,
      });
    }

    if (blockers.length) {
      const primary = blockers[0].status;
      const reason = blockers.map((b) => b.reason).join(" | ").slice(0, 1900);
      if (!(await authorityStillStable())) {
        return Response.json({
          ok: false,
          error: "approval_context_changed_retry",
        }, { status: 409 });
      }
      const persisted = await persistRecoverReportApprovalDecision(
        svc,
        report,
        {
          billing_eligibility_status: primary,
          billing_block_reason: reason,
        },
      );
      if (!persisted.ok) {
        return Response.json({ ok: false, error: persisted.reason }, {
          status: 409,
        });
      }
      await svc.entities.OperationalLog.create({
        deal_activation_id: activation.id,
        brand_id: activation.brand_id || "",
        event_type: "status_changed",
        message: "recover_billing_blocked",
        data_json: { report_id: report.id, month: report.month, blockers },
        actor_email: user.email,
        created_at: now,
      }).catch((error: any) =>
        safeBestEffort(error, {
          operation: "approveRecoverReportForInvoicing",
          fallback: null,
          severity: "critical",
        })
      );
      return Response.json({
        ok: false,
        report_id: report.id,
        billing_eligibility_status: primary,
        blockers,
      });
    }

    // Eligible — freeze the calculation.
    const calcPayload = {
      calculation_version: RECOVER_CALCULATION_VERSION,
      report_id: report.id,
      deal_activation_id: activation.id,
      month: report.month,
      baseline_id: report.baseline_id,
      mandate_id: mandate.id,
      savings_eur: savings,
      billable_savings_minor: amounts.billable_savings_minor,
      standard_fee_pct: standardFeePctForAmounts,
      discount_pct: amounts.discount_pct,
      effective_fee_pct: effectivePct,
      fee_net_minor: amounts.fee_net_minor,
      fee_source: monthFee.source,
      billing_rule_id: monthFee.rule_id,
      accepted_fee_pct: acceptedPct,
      recovery_economics: v2Economics || undefined,
      tax_treatment_preview: taxDecision.treatment,
    };
    const calcHash = await hashCalculation(calcPayload);

    if (!(await authorityStillStable())) {
      return Response.json({
        ok: false,
        error: "approval_context_changed_retry",
      }, { status: 409 });
    }
    const persisted = await persistRecoverReportApprovalDecision(svc, report, {
      billing_eligibility_status: "eligible",
      billing_block_reason: "",
      billable_savings_amount: amounts.billable_savings_eur,
      fee_net_amount: amounts.fee_net_eur,
      standard_fee_pct: standardFeePctForAmounts,
      discount_pct: amounts.discount_pct,
      effective_fee_pct: effectivePct,
      calculation_version: RECOVER_CALCULATION_VERSION,
      calculation_hash: calcHash,
      verification_status: "realized",
      approved_for_invoicing_by: user.email,
      approved_for_invoicing_at: now,
      // v60.2 — freeze contract provenance at approval. Only set when absent
      // so a re-approval never overwrites the generation-time values.
      ...(contractResolved.resolvable && !report.policy_version
        ? {
          policy_version: contractResolved.policyVersion,
          snapshot_hash: contractResolved.snapshotHash || undefined,
          policy_source: contractResolved.policySource,
          mandate_id: mandate?.id || undefined,
          merchant_share_pct: contractResolved.merchantSharePct,
          fee_duration_months: contractResolved.feeDurationMonths,
          contract_template_version: contractResolved.templateVersion ||
            undefined,
        }
        : {}),
      supporting_snapshot_json: {
        ...(report.supporting_snapshot_json || {}),
        recover4_calculation: calcPayload,
      },
    });
    if (!persisted.ok) {
      return Response.json({ ok: false, error: persisted.reason }, {
        status: 409,
      });
    }

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || "",
      event_type: "status_changed",
      message: "recover_savings_verified",
      data_json: {
        report_id: report.id,
        month: report.month,
        fee_net_eur: amounts.fee_net_eur,
        effective_fee_pct: effectivePct,
        calculation_hash: calcHash,
      },
      actor_email: user.email,
      created_at: now,
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "approveRecoverReportForInvoicing",
        fallback: null,
        severity: "critical",
      })
    );

    // RECOVER-3 admin alert (non-blocking, §2): first invoice with a permanently
    // failed contract PDF deserves a loud warning.
    const warnings: string[] = [];
    if (
      !activation.first_invoice_issued_at &&
      mandate.contract_pdf_status === "failed_permanent"
    ) {
      warnings.push("contract_pdf_failed_permanent_before_first_invoice");
    }

    return Response.json({
      ok: true,
      report_id: report.id,
      billing_eligibility_status: "eligible",
      billable_savings_eur: amounts.billable_savings_eur,
      fee_net_eur: amounts.fee_net_eur,
      standard_fee_pct: standardFeePctForAmounts,
      discount_pct: amounts.discount_pct,
      effective_fee_pct: effectivePct,
      tax_treatment_preview: taxDecision.treatment,
      calculation_hash: calcHash,
      warnings,
    });
  } catch (error) {
    return internalErrorResponse(error, "approveRecoverReportForInvoicing");
  }
}
