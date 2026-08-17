// AUDIT F1-F10 sweep (2026-08-17, founder-authorised): same defect shape as F1 —
// seven safeBestEffort→[] reads turned a failed ProviderRevenueLedger read into
// `provider_revenue_paid_minor:0` while the response kept its truth_boundary claim.
// Rewritten with readRuntimeRows; metrics demote to null when their source isn't COMPLETE.
import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { readRuntimeRows, runtimeSourceCoverage } from '../../shared/runtimeSourceRead.ts';

const sum = (rows: any[], f: string) => rows.reduce((a: number, x: any) => a + Number(x[f] || 0), 0);

Deno.serve(async (req) => {
  try {
    const b = createClientFromRequest(req);
    const u = await b.auth.me().catch((error: any) =>
      safeBestEffort(error, { operation: 'getProviderEconomicsCommandCenter', fallback: null, severity: 'secondary' }));
    if (!u || u.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    const s = b.asServiceRole;

    const [ledger, agreements, tiers, attrs, assessments, stmts, providers] = await Promise.all([
      readRuntimeRows({ source: 'provider_revenue_ledger', read: () => s.entities.ProviderRevenueLedger.list('-updated_at', 5000), limit: 5000 }),
      readRuntimeRows({ source: 'dynamic_agreement', read: () => s.entities.DynamicAgreement.list('-activated_at', 1000), limit: 1000 }),
      readRuntimeRows({ source: 'provider_compensation_tier', read: () => s.entities.ProviderCompensationTier.list('-updated_at', 2000), limit: 2000 }),
      readRuntimeRows({ source: 'provider_revenue_attribution', read: () => s.entities.ProviderRevenueAttribution.list('-updated_at', 5000), limit: 5000 }),
      readRuntimeRows({ source: 'provider_economic_assessment', read: () => s.entities.ProviderEconomicAssessment.list('-calculated_at', 3000), limit: 3000 }),
      readRuntimeRows({ source: 'provider_revenue_statement', read: () => s.entities.ProviderRevenueStatement.list('-received_at', 2000), limit: 2000 }),
      readRuntimeRows({ source: 'provider', read: () => s.entities.Provider.list('-created_date', 1000), limit: 1000 }),
    ]);

    const coverage = runtimeSourceCoverage({
      ProviderRevenueLedger: ledger, DynamicAgreement: agreements,
      ProviderCompensationTier: tiers, ProviderRevenueAttribution: attrs,
      ProviderEconomicAssessment: assessments, ProviderRevenueStatement: stmts,
      Provider: providers,
    });

    const isComplete = (r: any) => r.status === 'COMPLETE';
    const nn = (r: any, compute: () => number) => (isComplete(r) ? compute() : null);
    const ledgerRows = ledger.value;
    const paid = ledgerRows.filter((x: any) => x.state === 'paid');
    const outstanding = ledgerRows.filter((x: any) => ['accrued', 'validation_pending', 'invoiced', 'payment_pending', 'partially_paid', 'disputed'].includes(x.state));

    return Response.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data_complete: coverage.complete,
      degraded_sources: coverage.blockers,
      sources: coverage.sources,
      metrics: {
        provider_revenue_expected_minor: nn(ledger, () => sum(ledgerRows, 'expected_amount_minor')),
        provider_revenue_accrued_minor: nn(ledger, () => sum(ledgerRows, 'accrued_amount_minor')),
        provider_revenue_paid_minor: nn(ledger, () => sum(paid, 'paid_amount_minor')),
        provider_revenue_outstanding_minor: nn(ledger, () => outstanding.reduce((a: number, x: any) => a + Math.max(0, Number(x.accrued_amount_minor || 0) - Number(x.paid_amount_minor || 0)), 0)),
        active_provider_compensation_agreements: nn(agreements, () => agreements.value.filter((x: any) => x.status === 'active' && x.provider_compensation_activation_allowed === true).length),
        current_provider_tiers: nn(tiers, () => tiers.value.filter((x: any) => x.qualification_status === 'active').length),
        next_tier_unlocks: nn(tiers, () => tiers.value.filter((x: any) => ['locked', 'pending_confirmation'].includes(x.qualification_status) && Number(x.progress_pct || 0) >= 75).length),
        attributed_merchants: isComplete(attrs) ? new Set(attrs.value.filter((x: any) => x.status === 'active').map((x: any) => x.brand_id)).size : null,
        open_reconciliation_mismatches: nn(stmts, () => stmts.value.filter((x: any) => x.status === 'mismatch').length),
        material_conflicts: nn(assessments, () => assessments.value.filter((x: any) => ['conflict_material', 'conflict_critical'].includes(x.conflict_classification)).length),
      },
      revenue_by_provider: (isComplete(ledger) && isComplete(providers))
        ? providers.value.map((p: any) => ({
            provider_id: p.id, provider_name: p.name,
            expected_minor: sum(ledgerRows.filter((x: any) => x.provider_id === p.id), 'expected_amount_minor'),
            accrued_minor: sum(ledgerRows.filter((x: any) => x.provider_id === p.id), 'accrued_amount_minor'),
            paid_minor: sum(paid.filter((x: any) => x.provider_id === p.id), 'paid_amount_minor'),
          })).filter((x: any) => x.expected_minor || x.accrued_minor || x.paid_minor)
        : null,
      agreements: agreements.value.slice(0, 100),
      tiers: tiers.value.slice(0, 200),
      assessments: assessments.value.slice(0, 200),
      ledger: ledgerRows.slice(0, 300),
      statements: stmts.value.slice(0, 100),
      truth_boundary: {
        merchant_revenue: 'success fee/platform billing ledger',
        provider_revenue: 'separate ProviderRevenueLedger',
        recommendation: 'merchant outcome ranking is independent of provider compensation',
        production_activation: 'requires explicit legal/disclosure approval; currently fail-closed',
        completeness: 'a metric is null when its source failed or was truncated — never a zero',
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: 'provider_economics_command_center_failed' }, { status: 500 });
  }
});
