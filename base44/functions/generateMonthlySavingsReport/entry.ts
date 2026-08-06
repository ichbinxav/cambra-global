import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { resolveFeePctForMonth } from '../../shared/billingFee.ts';
import { resolveContractPolicy } from '../../shared/contractPolicySnapshot.ts';
import { assertProductionEnabledVertical, ProductScopeError } from '../../shared/productScopeGuard.ts';

/**
 * generateMonthlySavingsReport
 *
 * Measures real monthly savings for a brand against its frozen Baseline.
 * Activates only when the brand has a live DealActivation.
 *
 * Inputs: { brand_id, month? } — month YYYY-MM, defaults to previous month
 * Auth: admin or service role only
 *
 * v61 (2026-08-06, audit #4/#5/#6):
 *  • PAYMENTS-ONLY. assertProductionEnabledVertical gates every activation
 *    server-side against the generated policy. shipping/SaaS (and every other
 *    dormant vertical) return a typed product_scope_blocked error, generate no
 *    report, no savings and no fee, and the attempt is logged. The old
 *    shipping/SaaS measurement code was RETIRED from the active flow.
 *  • NO || 25 fallback. The fee comes from the month's BillingRule; the
 *    fallback is the RESOLVED CONTRACT (mandate snapshot), then a finite
 *    DealActivation.node_share_percent. If none exists the deal is blocked
 *    with fee_unresolvable — the live policy never prices an accepted contract.
 *  • Honest measurement copy: "connected Stripe data", never "live" — the
 *    Stripe integration status is implemented_live_verification_pending.
 *
 * Source hierarchy (payments):
 *  StripeConnection (fully_verified) → AnalyzerResult (fallback_projection)
 *
 * Rules:
 *  - savings_realized >= 0 always (clamped)
 *  - node_fee only on fully_verified or estimated_from_partial_data
 *  - idempotent: one non-void report per (brand_id, deal_activation_id, month)
 */

const ACTIVE_DEAL_STATUSES = ['live', 'authorized', 'migrating', 'monetizing'];
const STRIPE_STALE_DAYS = 35;

function prevMonthYM() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysSince(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // SECURITY-2 (2026-07-24) — an auth FAILURE never grants privilege.
    // Canonical gate: admin OR INTERNAL_CALL_SECRET.
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const { brand_id } = body || {};
    const month = body?.month || prevMonthYM();
    if (!brand_id) return Response.json({ ok: false, error: 'brand_id required' }, { status: 400 });
    if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ ok: false, error: 'month must be YYYY-MM' }, { status: 400 });

    const svc = base44.asServiceRole;

    // Find live DealActivation
    const allActivations = await svc.entities.DealActivation.filter({ brand_id }).catch(() => []);
    const liveActivations = allActivations.filter(a => ACTIVE_DEAL_STATUSES.includes(a.status));
    if (!liveActivations.length) {
      return Response.json({ ok: false, reason: 'No active deal for this brand' });
    }

    const reports = [];
    const errors = [];

    for (const deal of liveActivations) {
      try {
        // ── v61 PRODUCT SCOPE GATE — payments only ────────────────────
        try {
          assertProductionEnabledVertical(deal.vertical);
        } catch (e) {
          if (e instanceof ProductScopeError) {
            errors.push({ deal_id: deal.id, reason: e.code });
            await svc.entities.OperationalLog.create({
              deal_activation_id: deal.id,
              brand_id,
              event_type: 'status_changed',
              message: 'product_scope_blocked_report_attempt',
              data_json: { vertical: deal.vertical, month, blocked_by: 'productScopeGuard' },
              actor_email: gate.user?.email || 'internal',
              created_at: new Date().toISOString(),
            }).catch(() => null);
            continue;
          }
          throw e;
        }

        // Idempotency check
        const existing = await svc.entities.MonthlySavingsReport
          .filter({ brand_id, deal_activation_id: deal.id, month }, '-created_date', 5).catch(() => []);
        const liveExisting = existing.find(r => r.status !== 'void');
        if (liveExisting) {
          errors.push({ deal_id: deal.id, reason: 'Report already exists for this month' });
          continue;
        }

        // Find current Baseline for this vertical
        let baselines = await svc.entities.Baseline
          .filter({ brand_id, vertical: deal.vertical, is_current: true }, '-locked_at', 1).catch(() => []);
        if (!baselines.length) {
          baselines = await svc.entities.Baseline
            .filter({ deal_activation_id: deal.id, is_current: true }, '-locked_at', 1).catch(() => []);
        }
        const baseline = baselines[0];
        if (!baseline) {
          errors.push({ deal_id: deal.id, reason: 'No baseline found — cannot measure savings' });
          continue;
        }

        const baselineValue = Number(baseline.baseline_value || 0);
        let currentValue = baselineValue;
        let savingsMonthly = 0;
        let volume = 0;
        let measurementSource = 'manual_review';
        let measurementMode = 'fallback_projection';
        let verificationStatus = 'proposed';
        let notes = '';
        let snapshot = {};

        // ── PAYMENTS (the only production-enabled vertical) ───────────
        // Try Stripe first
        let stripe = (await svc.entities.StripeConnection
          .filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1).catch(() => []))[0];

        // Refresh if stale
        if (stripe && daysSince(stripe.data_as_of) > STRIPE_STALE_DAYS) {
          try {
            await base44.functions.invoke('stripeDataSync', { brand_id });
            stripe = (await svc.entities.StripeConnection
              .filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1).catch(() => []))[0];
          } catch (_) { /* non-fatal */ }
        }

        if (stripe && stripe.effective_fee_pct != null && stripe.monthly_volume != null && daysSince(stripe.data_as_of) <= STRIPE_STALE_DAYS) {
          currentValue = Number(stripe.effective_fee_pct);
          volume = Number(stripe.monthly_volume);
          measurementSource = 'api';
          measurementMode = 'fully_verified';
          verificationStatus = 'verified';
          // v61 (audit #6) — honest copy: the Stripe integration status is
          // implemented_live_verification_pending, so the note says
          // "connected Stripe data", never "live".
          notes = `Payments measured from connected Stripe data (effective_fee_pct=${currentValue}%, volume=€${Math.round(volume).toLocaleString()}).`;
          snapshot = { source: 'stripe_connected', stripe_account_id: stripe.stripe_account_id, data_as_of: stripe.data_as_of };
        } else {
          // Fallback to AnalyzerResult
          const latestResult = (await svc.entities.AnalyzerResult
            .filter({ brand_id }, '-created_date', 1).catch(() => []))[0];
          const latestInput = (await svc.entities.AnalyzerInput
            .filter({ brand_id }, '-created_date', 1).catch(() => []))[0];
          if (!latestResult || !latestInput) {
            errors.push({ deal_id: deal.id, reason: 'No payment data available for measurement' });
            continue;
          }
          currentValue = Number(latestResult.details?.payment_current_rate ?? baselineValue);
          volume = Number(latestInput.monthly_revenue || 0);
          measurementSource = 'manual_review';
          measurementMode = 'fallback_projection';
          verificationStatus = 'proposed';
          notes = `Payments measured from AnalyzerResult (estimated — Stripe not connected).`;
          snapshot = { source: 'analyzer_manual', analyzer_result_id: latestResult.id };
        }

        const rateDelta = baselineValue - currentValue; // bps in %
        savingsMonthly = Math.max(0, (rateDelta / 100) * volume);

        // Clamp note for above-baseline months
        if (currentValue > baselineValue) {
          notes += ' Costs above baseline this month — reviewing.';
        }

        // v60.2 — resolve the contractual terms for provenance persistence.
        const mandateRow = (await svc.entities.Mandate
          .filter({ deal_activation_id: deal.id, status: 'active' }, '-created_date', 1).catch(() => []))?.[0] || null;
        const contractResolved = resolveContractPolicy({ mandate: mandateRow });

        // ── Fee resolution — NO || 25 (v61, audit #5) ─────────────────
        // Chain: BillingRule for the month (resolveFeePctForMonth) →
        // resolved contract terms → finite DealActivation.node_share_percent.
        // If none exists, the deal is BLOCKED: the live policy never prices
        // an accepted contract, and a missing fee is never invented.
        const dealShare = Number(deal.node_share_percent);
        const fallbackPct = contractResolved.resolvable
          ? contractResolved.successFeePct
          : (Number.isFinite(dealShare) ? dealShare : null);
        const feeRes = await resolveFeePctForMonth(svc, {
          deal_activation_id: deal.id,
          brand_id,
          provider_id: deal.provider_id || null,
          // NaN sentinel: resolveFeePctForMonth's own default would fall back
          // to the LIVE policy — the NaN makes that path detectable below.
          fallbackPct: fallbackPct === null ? Number.NaN : fallbackPct,
        }, month);
        const nodeSharePct = Number(feeRes.pct);
        if (!Number.isFinite(nodeSharePct)) {
          errors.push({ deal_id: deal.id, reason: 'fee_unresolvable_no_rule_no_contract' });
          continue;
        }
        const billable = (measurementMode === 'fully_verified' || measurementMode === 'estimated_from_partial_data');
        const nodeFee = billable ? Math.max(0, savingsMonthly * (nodeSharePct / 100)) : 0;
        snapshot = {
          ...snapshot,
          fee_pct: nodeSharePct,
          fee_source: feeRes.source,
          billing_rule_id: feeRes.rule_id,
        };

        // Confidence score
        const confidence = measurementMode === 'fully_verified' ? 0.95
          : measurementMode === 'estimated_from_partial_data' ? 0.7
          : 0.4;

        const report = await svc.entities.MonthlySavingsReport.create({
          brand_id,
          deal_activation_id: deal.id,
          provider_id: deal.provider_id || '',
          vertical: deal.vertical,
          month,
          baseline_id: baseline.id,
          baseline_cost: Number(baselineValue.toFixed(2)),
          actual_cost: Number(currentValue.toFixed(2)),
          savings: Number(savingsMonthly.toFixed(2)),
          node_fee: Number(nodeFee.toFixed(2)),
          measurement_source: measurementSource,
          measurement_mode: measurementMode,
          verification_status: verificationStatus,
          status: 'calculated',
          confidence_score: confidence,
          currency: 'EUR',
          gmv_real: volume,
          notes: notes.trim(),
          supporting_snapshot_json: snapshot,
          // v60.2 — contract policy provenance. Only written when the contract
          // resolved safely; legacy reports stay absent so no value is invented.
          ...(contractResolved.resolvable ? {
            policy_version: contractResolved.policyVersion,
            snapshot_hash: contractResolved.snapshotHash || undefined,
            policy_source: contractResolved.policySource,
            mandate_id: mandateRow?.id || undefined,
            billing_rule_id: feeRes.rule_id || undefined,
            applied_fee_pct: nodeSharePct,
            merchant_share_pct: contractResolved.merchantSharePct,
            fee_duration_months: contractResolved.feeDurationMonths,
            contract_template_version: contractResolved.templateVersion || undefined,
            resolution_warnings: contractResolved.warnings.length ? contractResolved.warnings.join('; ') : undefined,
          } : {}),
          generated_by: gate.user?.email || (gate.isInternal ? 'internal' : 'generateMonthlySavingsReport'),
        });

        reports.push({
          report_id: report.id,
          deal_id: deal.id,
          vertical: deal.vertical,
          savings_monthly: Number(savingsMonthly.toFixed(2)),
          measurement_mode: measurementMode,
          node_fee: Number(nodeFee.toFixed(2)),
          fee_pct: nodeSharePct,
          fee_source: feeRes.source,
        });
      } catch (e) {
        errors.push({ deal_id: deal.id, reason: e.message || String(e) });
      }
    }

    return Response.json({ ok: true, month, reports, errors });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});