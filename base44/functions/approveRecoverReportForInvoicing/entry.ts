// approveRecoverReportForInvoicing — RECOVER-4 (2026-08-04).
//
// The human gate between "measured" and "invoiceable". Admin only. Runs every
// pre-billing check (§9), computes the billable figures deterministically in
// integer cents, and writes the eligibility verdict onto the report. Only a
// report this function marked 'eligible' can ever reach Stripe — estimated or
// projected measurements are refused here, permanently (§31: no projections,
// no historical averages, no confidence scores as a substitute for evidence).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { resolveFeePctForMonth } from '../../shared/billingFee.ts';
import { resolveBillingMode } from '../../shared/stripeBilling.ts';
import { determineTaxTreatment, normalizeVat, readTaxConfig } from '../../shared/recoverTax.ts';
import {
  computeInvoiceAmounts,
  hashCalculation,
  monthBillableWindow,
  RECOVER_CALCULATION_VERSION,
} from '../../shared/recoverBillingMath.ts';

const STANDARD_FEE_PCT = 25;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user?.role !== 'admin') return Response.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { report_id } = body || {};
    if (!report_id) return Response.json({ error: 'report_id required' }, { status: 400 });

    const svc = base44.asServiceRole;
    const reports = await svc.entities.MonthlySavingsReport.filter({ id: report_id }, '-created_date', 1).catch(() => []);
    const report = reports?.[0];
    if (!report) return Response.json({ error: 'report not found' }, { status: 404 });
    if (report.billing_eligibility_status === 'invoiced' || report.invoice_id) {
      return Response.json({ error: 'already_invoiced', invoice_id: report.invoice_id || null }, { status: 409 });
    }

    const activations = await svc.entities.DealActivation.filter({ id: report.deal_activation_id }, '-created_date', 1).catch(() => []);
    const activation = activations?.[0];
    if (!activation) return Response.json({ error: 'activation not found' }, { status: 404 });
    const brands = await svc.entities.Brand.filter({ id: report.brand_id || activation.brand_id }, '-created_date', 1).catch(() => []);
    const brand = brands?.[0];
    const mandates = await svc.entities.Mandate.filter({ deal_activation_id: activation.id, status: 'active' }, '-created_date', 1).catch(() => []);
    const mandate = mandates?.[0] || null;

    const blockers: { status: string; reason: string }[] = [];
    const block = (status: string, reason: string) => blockers.push({ status, reason });

    // ── Contract / mandate ────────────────────────────────────────────────
    if (!mandate) block('blocked_contract', 'no_active_mandate');
    if (report.vertical !== 'payments') block('blocked_contract', `unsupported_vertical:${report.vertical}`);
    if ((report.currency || 'EUR') !== 'EUR') block('blocked_contract', `unsupported_currency:${report.currency}`);
    if (brand?.is_demo) block('blocked_contract', 'demo_brand_never_billed');

    // Accepted baseline, not "any current baseline" (§8).
    const snapshotBaselineId = mandate?.acceptance_snapshot_json?.baseline_id || null;
    if (mandate && !snapshotBaselineId) block('blocked_contract', 'mandate_snapshot_missing_baseline');
    if (mandate && snapshotBaselineId && report.baseline_id !== snapshotBaselineId) {
      block('blocked_contract', `baseline_mismatch:report=${report.baseline_id || 'none'};accepted=${snapshotBaselineId}`);
    }

    // Contractual calendar (§6–§7).
    if (!activation.conditions_activated_at) {
      block('blocked_contract', 'conditions_activated_at_missing');
    } else {
      const window = monthBillableWindow(report.month, activation.conditions_activated_at);
      if (!window.billable) block('blocked_contract', window.reason);
    }

    // ── Measurement quality (§9) ──────────────────────────────────────────
    if (report.measurement_mode === 'manual_override') {
      block('blocked_missing_evidence', 'manual_override_requires_documented_dual_approval_flow_not_implemented');
    } else if (report.measurement_mode !== 'fully_verified') {
      block('blocked_missing_evidence', `measurement_mode_not_billable:${report.measurement_mode}`);
    }
    if (!['verified', 'realized'].includes(report.verification_status)) {
      block('blocked_missing_evidence', `verification_status_not_billable:${report.verification_status}`);
    }
    if (!report.verified_at || !report.verified_by) block('blocked_missing_evidence', 'verified_at_or_verified_by_missing');
    if (!(Number(report.evidence_count) > 0)) block('blocked_missing_evidence', 'evidence_count_zero');

    // ── Payment method (RECOVER-2) ────────────────────────────────────────
    const mode = resolveBillingMode();
    if (activation.payment_method_status !== 'ready') block('blocked_payment_method', `payment_method_status:${activation.payment_method_status || 'none'}`);
    if (activation.stripe_billing_mode && activation.stripe_billing_mode !== mode) block('blocked_payment_method', `stripe_mode_mismatch:pm=${activation.stripe_billing_mode};billing=${mode}`);
    if (!brand?.stripe_customer_id) block('blocked_payment_method', 'stripe_customer_missing');
    if (brand?.stripe_billing_mode && brand.stripe_billing_mode !== mode) block('blocked_payment_method', `stripe_mode_mismatch:customer=${brand.stripe_billing_mode};billing=${mode}`);

    // ── Tax (§13–§15) ─────────────────────────────────────────────────────
    const cfg = readTaxConfig();
    const taxDecision = determineTaxTreatment({
      billing_country: String(brand?.billing_country || '').toUpperCase(),
      legal_name: brand?.billing_legal_name || '',
      billing_address_line1: brand?.billing_address_line1 || '',
      billing_postal_code: brand?.billing_postal_code || '',
      billing_city: brand?.billing_city || '',
      vat_number: normalizeVat(brand?.vat_number_normalized || brand?.vat_number || ''),
      tax_customer_type: brand?.tax_customer_type || '',
      vies_status: brand?.vies_status || 'not_checked',
    }, cfg.ok ? cfg.config : null);
    if (!cfg.ok) block('blocked_tax', `tax_config_missing:${cfg.missing.join(',')}`);
    if (taxDecision.blockers.length) block('blocked_tax', taxDecision.blockers.join(','));

    // ── Fee (§11): mandate-accepted pct is the CEILING; the month's
    // BillingRule may lower it (acquired referral discount, non-retroactive)
    // but can never raise it above what was accepted. ─────────────────────
    const acceptedPct = Number(mandate?.acceptance_snapshot_json?.fee_pct);
    if (mandate && !Number.isFinite(acceptedPct)) block('blocked_contract', 'accepted_fee_pct_unresolvable');
    const monthFee = await resolveFeePctForMonth(svc, {
      deal_activation_id: activation.id,
      brand_id: activation.brand_id,
      provider_id: activation.provider_id || null,
      fallbackPct: Number.isFinite(acceptedPct) ? acceptedPct : Number(activation.node_share_percent || STANDARD_FEE_PCT),
    }, report.month);
    const effectivePct = Math.min(
      Number.isFinite(acceptedPct) ? acceptedPct : STANDARD_FEE_PCT,
      Number(monthFee.pct),
    );

    // ── Amounts (integer cents, §10) ──────────────────────────────────────
    const savings = Number(report.savings || 0);
    const amounts = computeInvoiceAmounts({
      savings_eur: savings,
      standard_fee_pct: STANDARD_FEE_PCT,
      effective_fee_pct: effectivePct,
      tax_rate_bps: 0, // tax is decided at invoice time; the report stores the NET fee only
    });

    const now = new Date().toISOString();

    // No positive savings → realized month, no invoice, no fee (§30). Not an error.
    if (blockers.length === 0 && (amounts.billable_savings_minor <= 0 || amounts.fee_net_minor <= 0)) {
      await svc.entities.MonthlySavingsReport.update(report.id, {
        billing_eligibility_status: 'no_positive_savings',
        billing_block_reason: '',
        billable_savings_amount: amounts.billable_savings_eur,
        fee_net_amount: 0,
        standard_fee_pct: STANDARD_FEE_PCT,
        discount_pct: amounts.discount_pct,
        effective_fee_pct: effectivePct,
        calculation_version: RECOVER_CALCULATION_VERSION,
        verification_status: 'realized',
        approved_for_invoicing_by: user.email,
        approved_for_invoicing_at: now,
      });
      return Response.json({ ok: true, report_id: report.id, billing_eligibility_status: 'no_positive_savings', fee_net_amount: 0 });
    }

    if (blockers.length) {
      const primary = blockers[0].status;
      const reason = blockers.map(b => b.reason).join(' | ').slice(0, 1900);
      await svc.entities.MonthlySavingsReport.update(report.id, {
        billing_eligibility_status: primary,
        billing_block_reason: reason,
      });
      await svc.entities.OperationalLog.create({
        deal_activation_id: activation.id,
        brand_id: activation.brand_id || '',
        event_type: 'status_changed',
        message: 'recover_billing_blocked',
        data_json: { report_id: report.id, month: report.month, blockers },
        actor_email: user.email,
        created_at: now,
      }).catch(() => null);
      return Response.json({ ok: false, report_id: report.id, billing_eligibility_status: primary, blockers });
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
      standard_fee_pct: STANDARD_FEE_PCT,
      discount_pct: amounts.discount_pct,
      effective_fee_pct: effectivePct,
      fee_net_minor: amounts.fee_net_minor,
      fee_source: monthFee.source,
      billing_rule_id: monthFee.rule_id,
      accepted_fee_pct: acceptedPct,
      tax_treatment_preview: taxDecision.treatment,
    };
    const calcHash = await hashCalculation(calcPayload);

    await svc.entities.MonthlySavingsReport.update(report.id, {
      billing_eligibility_status: 'eligible',
      billing_block_reason: '',
      billable_savings_amount: amounts.billable_savings_eur,
      fee_net_amount: amounts.fee_net_eur,
      standard_fee_pct: STANDARD_FEE_PCT,
      discount_pct: amounts.discount_pct,
      effective_fee_pct: effectivePct,
      calculation_version: RECOVER_CALCULATION_VERSION,
      calculation_hash: calcHash,
      verification_status: 'realized',
      approved_for_invoicing_by: user.email,
      approved_for_invoicing_at: now,
      supporting_snapshot_json: {
        ...(report.supporting_snapshot_json || {}),
        recover4_calculation: calcPayload,
      },
    });

    await svc.entities.OperationalLog.create({
      deal_activation_id: activation.id,
      brand_id: activation.brand_id || '',
      event_type: 'status_changed',
      message: 'recover_savings_verified',
      data_json: { report_id: report.id, month: report.month, fee_net_eur: amounts.fee_net_eur, effective_fee_pct: effectivePct, calculation_hash: calcHash },
      actor_email: user.email,
      created_at: now,
    }).catch(() => null);

    // RECOVER-3 admin alert (non-blocking, §2): first invoice with a permanently
    // failed contract PDF deserves a loud warning.
    const warnings: string[] = [];
    if (!activation.first_invoice_issued_at && mandate.contract_pdf_status === 'failed_permanent') {
      warnings.push('contract_pdf_failed_permanent_before_first_invoice');
    }

    return Response.json({
      ok: true,
      report_id: report.id,
      billing_eligibility_status: 'eligible',
      billable_savings_eur: amounts.billable_savings_eur,
      fee_net_eur: amounts.fee_net_eur,
      standard_fee_pct: STANDARD_FEE_PCT,
      discount_pct: amounts.discount_pct,
      effective_fee_pct: effectivePct,
      tax_treatment_preview: taxDecision.treatment,
      calculation_hash: calcHash,
      warnings,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}