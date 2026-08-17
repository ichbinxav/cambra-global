// AUDIT F1-F10 sweep (2026-08-17, founder-authorised): the nine reads used to swallow
// into `[]` via safeBestEffort with `severity:'secondary'`. That turned any failed read
// into `active_pools:0` / `observed_annual_volume_minor:0` while the response kept
// declaring `ok:true`. Rewritten with readRuntimeRows so every metric goes to null when
// its source is not COMPLETE — the founder sees "—" instead of a currency-formatted zero.
import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { readRuntimeRows, runtimeSourceCoverage } from '../../shared/runtimeSourceRead.ts';

const sumField = (rows: any[], k: string) => rows.reduce((a: number, x: any) => a + Number(x[k] || 0), 0);

Deno.serve(async (req) => {
  try {
    const b = createClientFromRequest(req);
    const u = await b.auth.me().catch((error: any) =>
      safeBestEffort(error, { operation: 'getAggregateCommandCenter', fallback: null, severity: 'secondary' }));
    if (!u) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (u.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    const s = b.asServiceRole;

    const [pools, rfps, bids, agreements, tiers, rates, elig, approvals, cases] = await Promise.all([
      readRuntimeRows({ source: 'aggregate_pool', read: () => s.entities.AggregatePool.list('-aggregation_power_score', 1000), limit: 1000 }),
      readRuntimeRows({ source: 'aggregate_rfp', read: () => s.entities.AggregateRFP.list('-created_at', 500), limit: 500 }),
      readRuntimeRows({ source: 'aggregate_bid', read: () => s.entities.AggregateBid.list('-created_at', 1000), limit: 1000 }),
      readRuntimeRows({ source: 'dynamic_agreement', read: () => s.entities.DynamicAgreement.list('-created_at', 500), limit: 500 }),
      readRuntimeRows({ source: 'agreement_tier', read: () => s.entities.AgreementTier.list('-updated_at', 1000), limit: 1000 }),
      readRuntimeRows({ source: 'private_rate_card', read: () => s.entities.PrivateRateCard.list('-effective_at', 1000), limit: 1000 }),
      readRuntimeRows({ source: 'merchant_rate_eligibility', read: () => s.entities.MerchantRateEligibility.list('-evaluated_at', 2000), limit: 2000 }),
      readRuntimeRows({ source: 'approval', read: () => s.entities.Approval.filter({ status: 'pending', action_type: { $in: ['aggregate_contract', 'aggregate_contract_execution', 'aggregate_procurement_review'] } }, '-created_date', 200), limit: 200 }),
      readRuntimeRows({ source: 'negotiation_case', read: () => s.entities.NegotiationCase.filter({ negotiation_scope: 'aggregate' }, '-started_at', 500), limit: 500 }),
    ]);

    const coverage = runtimeSourceCoverage({
      AggregatePool: pools, AggregateRFP: rfps, AggregateBid: bids, DynamicAgreement: agreements,
      AgreementTier: tiers, PrivateRateCard: rates, MerchantRateEligibility: elig,
      Approval: approvals, NegotiationCase: cases,
    });

    const isComplete = (r: any) => r.status === 'COMPLETE';
    const nn = (r: any, compute: () => number) => (isComplete(r) ? compute() : null);
    const activePools = pools.value.filter((x: any) => !['archived', 'terminated'].includes(x.status));

    return Response.json({
      ok: true,
      generated_at: new Date().toISOString(),
      data_complete: coverage.complete,
      degraded_sources: coverage.blockers,
      sources: coverage.sources,
      metrics: {
        active_pools: nn(pools, () => activePools.length),
        negotiation_ready_pools: nn(pools, () => activePools.filter((x: any) => Number(x.aggregation_power_score || 0) >= 65).length),
        observed_annual_volume_minor: nn(pools, () => sumField(activePools, 'observed_annual_volume_minor')),
        addressable_annual_volume_minor: nn(pools, () => sumField(activePools, 'addressable_annual_volume_minor')),
        committed_annual_volume_minor: nn(pools, () => sumField(activePools, 'committed_annual_volume_minor')),
        live_rfps: nn(rfps, () => rfps.value.filter((x: any) => ['open', 'negotiating', 'final_offer', 'contracting'].includes(x.status)).length),
        provider_bids: nn(bids, () => bids.value.length),
        active_agreements: nn(agreements, () => agreements.value.filter((x: any) => x.status === 'active').length),
        active_private_rates: nn(rates, () => rates.value.filter((x: any) => x.status === 'active').length),
        next_tier_unlocks: nn(tiers, () => tiers.value.filter((x: any) => ['locked', 'pending_confirmation'].includes(x.qualification_status) && Number(x.progress_pct || 0) >= 75).length),
        pending_approvals: nn(approvals, () => approvals.value.length),
        eligible_merchants: nn(elig, () => elig.value.filter((x: any) => x.status === 'eligible').length),
        potentially_eligible_merchants: nn(elig, () => elig.value.filter((x: any) => x.status === 'potentially_eligible').length),
      },
      pools: activePools.slice(0, 100),
      rfps: rfps.value.slice(0, 100),
      bids: bids.value.slice(0, 100),
      agreements: agreements.value.slice(0, 100),
      tiers: tiers.value.slice(0, 150),
      rates: rates.value.slice(0, 100),
      eligibility: elig.value.slice(0, 150),
      approvals: approvals.value.slice(0, 100),
      negotiations: cases.value.slice(0, 100),
      truth_boundary: {
        observed: 'measured/observed merchant demand',
        addressable: 'technically/commercially migratable estimate',
        committed: 'explicit AggregateCommitment only',
        completeness: 'a metric is null when its source failed or was truncated — a null is a read that did not happen, never a zero',
      },
    });
  } catch (e) {
    console.error(e);
    return Response.json({ ok: false, error: 'aggregate_command_center_failed' }, { status: 500 });
  }
});
