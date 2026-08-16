import { safeBestEffort } from "../../shared/bestEffort.ts";
// FX-2 Fase B (2026-08-16) — report currency comes from the measurement
// source, never from a literal. Indeterminable → review_required.
import { deriveMeasurementCurrency } from "../../shared/savingsReportCurrency.ts";
import { sha256 } from "../../shared/intelligenceCore.ts";
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { resolveRecoverEconomicMandate } from "../../shared/recoverEconomicMandate.ts";
import { requireAdminOrInternal } from "../../shared/internalGate.ts";
import { resolveFeePctForMonth } from "../../shared/billingFee.ts";
import {
  periodEconomicsV2,
  RECOVERY_ECONOMICS_V2,
  referralCountFromYear1EquivalentFee,
  reportPeriodBounds,
} from "../../shared/recoveryEconomicsV2.ts";
import { resolveContractPolicy } from "../../shared/contractPolicySnapshot.ts";
import {
  assertProductionEnabledVertical,
  ProductScopeError,
} from "../../shared/productScopeGuard.ts";
import { ensureRecoverSavingsEvidence } from "../../shared/eclRecoverEvidence.ts";
import { internalErrorResponse } from "../../shared/publicErrors.ts";
import {
  readRecoverReportAuthority,
  requireCanonicalRecoverReport,
} from "../../shared/recoverReportAuthority.ts";

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

const ACTIVE_DEAL_STATUSES = ["live", "authorized", "migrating", "monetizing"];
const STRIPE_STALE_DAYS = 35;

function prevMonthYM() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
    if (!brand_id) {
      return Response.json({ ok: false, error: "brand_id required" }, {
        status: 400,
      });
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return Response.json({ ok: false, error: "month must be YYYY-MM" }, {
        status: 400,
      });
    }

    const svc = base44.asServiceRole;

    // Find live DealActivation
    const allActivations = await svc.entities.DealActivation.filter({
      brand_id,
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "generateMonthlySavingsReport",
        fallback: [],
        severity: "secondary",
      })
    );
    const liveActivations = allActivations.filter((a) =>
      ACTIVE_DEAL_STATUSES.includes(a.status)
    );
    if (!liveActivations.length) {
      return Response.json({
        ok: false,
        reason: "No active deal for this brand",
      });
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
              event_type: "status_changed",
              message: "product_scope_blocked_report_attempt",
              data_json: {
                vertical: deal.vertical,
                month,
                blocked_by: "productScopeGuard",
              },
              actor_email: gate.user?.email || "internal",
              created_at: new Date().toISOString(),
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "generateMonthlySavingsReport",
                fallback: null,
                severity: "secondary",
              })
            );
            continue;
          }
          throw e;
        }

        // Idempotency check
        const existingAuthority = await readRecoverReportAuthority(svc, {
          dealActivationId: deal.id,
          month,
        });
        if (existingAuthority.status !== "MISSING") {
          errors.push({
            deal_id: deal.id,
            reason: existingAuthority.ok
              ? "Report already exists for this month"
              : (existingAuthority.blocker ||
                "recover_report_authority_unavailable"),
          });
          continue;
        }

        // Find current Baseline for this vertical
        let baselines = await svc.entities.Baseline
          .filter(
            { brand_id, vertical: deal.vertical, is_current: true },
            "-locked_at",
            1,
          ).catch((error: any) =>
            safeBestEffort(error, {
              operation: "generateMonthlySavingsReport",
              fallback: [],
              severity: "secondary",
            })
          );
        if (!baselines.length) {
          baselines = await svc.entities.Baseline
            .filter(
              { deal_activation_id: deal.id, is_current: true },
              "-locked_at",
              1,
            ).catch((error: any) =>
              safeBestEffort(error, {
                operation: "generateMonthlySavingsReport",
                fallback: [],
                severity: "secondary",
              })
            );
        }
        const baseline = baselines[0];
        if (!baseline) {
          errors.push({
            deal_id: deal.id,
            reason: "No baseline found — cannot measure savings",
          });
          continue;
        }

        const baselineValue = Number(baseline.baseline_value || 0);
        let currentValue = baselineValue;
        let savingsMonthly = 0;
        let volume = 0;
        let measurementSource = "manual_review";
        // FX-2 Fase B — currency of the measurement, derived per branch below.
        // `any`: the backend typecheck (strict:false) can't narrow the union.
        let measuredCurrency: any = {
          determinable: false, currency: null, reason: "measurement_branch_not_reached",
        };
        let measurementMode = "fallback_projection";
        let verificationStatus = "proposed";
        let notes = "";
        let snapshot = {};

        // ── PAYMENTS (the only production-enabled vertical) ───────────
        // Try Stripe first
        let stripe = (await svc.entities.StripeConnection
          .filter(
            { brand_id, connection_status: "connected" },
            "-last_sync_at",
            1,
          ).catch((error: any) =>
            safeBestEffort(error, {
              operation: "generateMonthlySavingsReport",
              fallback: [],
              severity: "secondary",
            })
          ))[0];

        // Refresh if stale
        if (stripe && daysSince(stripe.data_as_of) > STRIPE_STALE_DAYS) {
          try {
            await base44.functions.invoke("stripeDataSync", { brand_id });
            stripe = (await svc.entities.StripeConnection
              .filter(
                { brand_id, connection_status: "connected" },
                "-last_sync_at",
                1,
              ).catch((error: any) =>
                safeBestEffort(error, {
                  operation: "generateMonthlySavingsReport",
                  fallback: [],
                  severity: "secondary",
                })
              ))[0];
          } catch (_) { /* non-fatal */ }
        }

        if (
          stripe && stripe.effective_fee_pct != null &&
          stripe.monthly_volume != null &&
          daysSince(stripe.data_as_of) <= STRIPE_STALE_DAYS
        ) {
          currentValue = Number(stripe.effective_fee_pct);
          volume = Number(stripe.monthly_volume);
          measurementSource = "api";
          measurementMode = "fully_verified";
          verificationStatus = "verified";
          // v61 (audit #6) — honest copy: the Stripe integration status is
          // implemented_live_verification_pending, so the note says
          // "connected Stripe data", never "live".
          notes =
            `Payments measured from connected Stripe data (effective_fee_pct=${currentValue}%, volume=€${
              Math.round(volume).toLocaleString()
            }).`;
          snapshot = {
            source: "stripe_connected",
            stripe_account_id: stripe.stripe_account_id,
            data_as_of: stripe.data_as_of,
          };
          measuredCurrency = deriveMeasurementCurrency({ measurement_source: "api", stripe });
        } else {
          // Fallback to AnalyzerResult
          const latestResult = (await svc.entities.AnalyzerResult
            .filter({ brand_id }, "-created_date", 1).catch((error: any) =>
              safeBestEffort(error, {
                operation: "generateMonthlySavingsReport",
                fallback: [],
                severity: "secondary",
              })
            ))[0];
          const latestInput = (await svc.entities.AnalyzerInput
            .filter({ brand_id }, "-created_date", 1).catch((error: any) =>
              safeBestEffort(error, {
                operation: "generateMonthlySavingsReport",
                fallback: [],
                severity: "secondary",
              })
            ))[0];
          if (!latestResult || !latestInput) {
            errors.push({
              deal_id: deal.id,
              reason: "No payment data available for measurement",
            });
            continue;
          }
          currentValue = Number(
            latestResult.details?.payment_current_rate ?? baselineValue,
          );
          volume = Number(latestInput.monthly_revenue || 0);
          measurementSource = "manual_review";
          measurementMode = "fallback_projection";
          verificationStatus = "proposed";
          notes =
            `Payments measured from AnalyzerResult (estimated — Stripe not connected).`;
          snapshot = {
            source: "analyzer_manual",
            analyzer_result_id: latestResult.id,
          };
          measuredCurrency = deriveMeasurementCurrency({ measurement_source: "manual_review", analyzer_input: latestInput });
        }

        if (!measuredCurrency.determinable) {
          notes += ` Measurement currency indeterminable (${measuredCurrency.reason}) — report held for review, not calculated.`;
        }

        const rateDelta = baselineValue - currentValue; // bps in %
        savingsMonthly = Math.max(0, (rateDelta / 100) * volume);

        // Clamp note for above-baseline months
        if (currentValue > baselineValue) {
          notes += " Costs above baseline this month — reviewing.";
        }

        // v60.2 — resolve the contractual terms for provenance persistence.
        const mandateRow = await resolveRecoverEconomicMandate(svc, deal);
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
        let nodeSharePct = Number(feeRes.pct);
        if (!Number.isFinite(nodeSharePct)) {
          errors.push({
            deal_id: deal.id,
            reason: "fee_unresolvable_no_rule_no_contract",
          });
          continue;
        }
        const isEconomicsV2 =
          mandateRow?.acceptance_snapshot_json?.recovery_economics?.version ===
            RECOVERY_ECONOMICS_V2;
        let recoveryEconomics: any = null;
        if (isEconomicsV2 && deal.conditions_activated_at) {
          const period = reportPeriodBounds(month);
          recoveryEconomics = periodEconomicsV2({
            activationIso: deal.conditions_activated_at,
            periodStart: period.start,
            periodEndExclusive: period.endExclusive,
            activatedReferrals: referralCountFromYear1EquivalentFee(feeRes.pct),
          });
          nodeSharePct = recoveryEconomics.effective_fee_pct;
        }
        const billable = measurementMode === "fully_verified" ||
          measurementMode === "estimated_from_partial_data";
        const nodeFee = billable
          ? Math.max(0, savingsMonthly * (nodeSharePct / 100))
          : 0;
        snapshot = {
          ...snapshot,
          fee_pct: nodeSharePct,
          fee_source: feeRes.source,
          billing_rule_id: feeRes.rule_id,
          ...(recoveryEconomics
            ? { recovery_economics: recoveryEconomics }
            : {}),
        };

        // Confidence score
        const confidence = measurementMode === "fully_verified"
          ? 0.95
          : measurementMode === "estimated_from_partial_data"
          ? 0.7
          : 0.4;

        const reportSnapshotPayload = {
          deal_activation_id: deal.id,
          brand_id,
          provider_id: deal.provider_id || "",
          vertical: deal.vertical,
          month,
          baseline: {
            id: baseline.id,
            value: Number(baselineValue.toFixed(2)),
          },
          measurement: {
            source: measurementSource,
            mode: measurementMode,
            current_value: Number(currentValue.toFixed(2)),
            volume,
            confidence,
          },
          contract: {
            policy_version: contractResolved.policyVersion || null,
            snapshot_hash: contractResolved.snapshotHash || null,
            billing_rule_id: feeRes.rule_id || null,
            fee_pct: nodeSharePct,
          },
          supporting_snapshot: snapshot,
        };
        const reportSnapshotHash = await sha256(reportSnapshotPayload);
        const intelligenceSnapshot = await svc.entities.IntelligenceSnapshot
          .create({
            snapshot_key: `recover-report:${deal.id}:${month}:${
              reportSnapshotHash.slice(0, 16)
            }`,
            snapshot_type: "recover_measurement",
            related_entity_type: "DealActivation",
            related_entity_id: deal.id,
            brand_id,
            vertical: deal.vertical,
            claim_ids: [],
            pricing_version_ids: [],
            benchmark_refs_json: {},
            policy_version: contractResolved.policyVersion || undefined,
            calculation_version: "recover-billing",
            snapshot_json: reportSnapshotPayload,
            snapshot_hash: reportSnapshotHash,
            captured_at: new Date().toISOString(),
          }).catch((error: any) =>
            safeBestEffort(error, {
              operation: "generateMonthlySavingsReport",
              fallback: null,
              severity: "secondary",
            })
          );

        const report = await svc.entities.MonthlySavingsReport.create({
          brand_id,
          intelligence_snapshot_id: intelligenceSnapshot?.id || undefined,
          deal_activation_id: deal.id,
          provider_id: deal.provider_id || "",
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
          // FX-2 Fase B — a report whose measurement currency cannot be
          // determined is NEVER 'calculated': it goes to review_required with
          // currency null (visible unknown), and the billing pipeline ignores
          // it (approval gates only act on calculated reports). When the
          // currency IS determinable it is persisted as measured — the
          // prepareEligibleRecoverInvoice currency lock is now genuinely
          // reachable for non-EUR measurements.
          status: measuredCurrency.determinable ? "calculated" : "review_required",
          confidence_score: confidence,
          currency: measuredCurrency.determinable ? measuredCurrency.currency : null,
          gmv_real: volume,
          notes: notes.trim(),
          supporting_snapshot_json: snapshot,
          // v60.2 — contract policy provenance. Only written when the contract
          // resolved safely; legacy reports stay absent so no value is invented.
          ...(contractResolved.resolvable
            ? {
              policy_version: contractResolved.policyVersion,
              snapshot_hash: contractResolved.snapshotHash || undefined,
              policy_source: contractResolved.policySource,
              mandate_id: mandateRow?.id || undefined,
              billing_rule_id: feeRes.rule_id || undefined,
              applied_fee_pct: nodeSharePct,
              merchant_share_pct: contractResolved.merchantSharePct,
              fee_duration_months: contractResolved.feeDurationMonths,
              contract_template_version: contractResolved.templateVersion ||
                undefined,
              resolution_warnings: contractResolved.warnings.length
                ? contractResolved.warnings.join("; ")
                : undefined,
            }
            : {}),
          generated_by: gate.user?.email ||
            (gate.isInternal ? "internal" : "generateMonthlySavingsReport"),
        });

        // A successful empty read authorizes creation, but it cannot serialize
        // two concurrent creators. The post-create singleton proof makes that
        // race fail closed: duplicate rows remain non-invoiceable (`not_ready`)
        // and neither invocation advertises a canonical report.
        await requireCanonicalRecoverReport(svc, {
          dealActivationId: deal.id,
          month,
          reportId: report.id,
        });

        // ECL P5 — a report itself is not an economic side effect, so evidence
        // materialization failure does NOT delete the report. Instead we try to
        // refresh the canonical SavingsEvidence from the same Stripe source;
        // approve_report/create_invoice will fail closed later if this cannot be
        // produced or processed.
        if (measurementMode === "fully_verified") {
          const eclEvidence = await ensureRecoverSavingsEvidence({
            base44,
            svc,
            activation: deal,
            baseline,
            ownerEmail: null,
            now: new Date().toISOString(),
          }).catch((e) => ({
            ok: false as const,
            code: e?.message || "ecl_materialization_error",
          }));
          if (eclEvidence.ok === false) {
            await svc.entities.OperationalLog.create({
              deal_activation_id: deal.id,
              brand_id,
              event_type: "status_changed",
              message: "ecl_savings_evidence_materialization_failed",
              data_json: {
                report_id: report.id,
                code: eclEvidence.code || "unknown",
              },
              actor_email: gate.user?.email || "internal",
              created_at: new Date().toISOString(),
            }).catch((error: any) =>
              safeBestEffort(error, {
                operation: "generateMonthlySavingsReport",
                fallback: null,
                severity: "secondary",
              })
            );
          }
        }

        // Re-read again after any evidence materialization. This catches the
        // concrete interleaving where this invocation passed its first
        // post-create proof and a concurrent creator inserted a contender while
        // the optional ECL work was running. Billing still independently
        // revalidates this authority before approval and every provider POST.
        await requireCanonicalRecoverReport(svc, {
          dealActivationId: deal.id,
          month,
          reportId: report.id,
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
    return internalErrorResponse(error, "generateMonthlySavingsReport");
  }
});
