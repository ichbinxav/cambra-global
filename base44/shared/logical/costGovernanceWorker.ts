// AUDIT 2026-08-18 — moved out of base44/functions/costGovernanceWorker/entry.ts. Host functions
// import this module directly: a relative import into another function's tree
// cannot be bundled, so every host of this logical route silently failed to
// deploy and kept serving stale code.
import { safeBestEffort } from '../bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../internalGate.ts';
import { activateCostEmergencyStop, COST_CATEGORIES, costRuntimeSnapshot } from '../costGovernance.ts';
import { claimSchedulerRun, finishSchedulerRunOrThrow, markSchedulerEffectStarted, schedulerClaimDeniedResponse } from '../schedulerRun.ts';
import { recordRuntimeGateEvidence, runtimeGitSha } from '../runtimeEvidence.ts';

export async function handleCostGovernanceWorker(req: Request) {
  let svc:any = null, claim:any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.clone().json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    svc = base44.asServiceRole;
    claim = await claimSchedulerRun(svc, req, { worker_key:'costGovernanceWorker', cadence_seconds:3600 });
    { const denied = schedulerClaimDeniedResponse(claim); if (denied) return denied; }
    claim = await markSchedulerEffectStarted(svc, claim);
    { const denied = schedulerClaimDeniedResponse(claim); if (denied) return denied; }
    const snapshot = await costRuntimeSnapshot(svc);
    const percentages:(number|null)[] = [snapshot.utilization.daily_total_pct, snapshot.utilization.monthly_total_pct];
    for (const category of COST_CATEGORIES) percentages.push(snapshot.utilization.categories[category].daily_pct, snapshot.utilization.categories[category].monthly_pct);
    const finitePercentages = percentages.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const maximumPct = Math.max(0, ...finitePercentages);
    const warningPct = Number(snapshot.control?.anomaly_warning_pct || 0);
    const hardStopPct = Number(snapshot.control?.hard_stop_pct || 0);
    const now = new Date().toISOString();
    if (snapshot.validation.ok && hardStopPct > 0 && maximumPct >= hardStopPct) {
      await activateCostEmergencyStop(svc, snapshot.control, 'cost_hard_stop_threshold_reached', { maximum_utilization_pct:maximumPct, utilization:snapshot.utilization });
    } else if (snapshot.validation.ok && warningPct > 0 && maximumPct >= warningPct) {
      const old = await svc.entities.AutonomyIncident.filter({ dedupe_key:'cost-budget-anomaly-warning', status:'open' }, '-last_seen_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'costGovernanceWorker',fallback:[],severity:'secondary'}));
      const incident = { domain:'financial', severity:'warning', status:'open', subject_type:'CostBudgetControl', subject_id:snapshot.control.id, summary:'Cost utilization crossed the founder warning threshold', details_json:{ maximum_utilization_pct:maximumPct, utilization:snapshot.utilization }, first_seen_at:old[0]?.first_seen_at || now, last_seen_at:now, workflow_state:'human_review', owner_type:'founder', automation_eligibility:'human_required', financial_impact_minor:0, customer_impact:'none', legal_risk:'none' };
      if (old[0]) await svc.entities.AutonomyIncident.update(old[0].id, incident).catch((error:any)=>safeBestEffort(error,{operation:'costGovernanceWorker',fallback:null,severity:'secondary'})); else await svc.entities.AutonomyIncident.create({ dedupe_key:'cost-budget-anomaly-warning', ...incident }).catch((error:any)=>safeBestEffort(error,{operation:'costGovernanceWorker',fallback:null,severity:'secondary'}));
    }
    const gitSha = runtimeGitSha(body);
    await recordRuntimeGateEvidence(svc, { gate_key:'COST_BUDGETS', git_sha:gitSha, status:snapshot.validation.ok && !snapshot.coverage_truncated ? 'PASS':'BLOCKED', evidence_kind:'REAL_RUNTIME', source:'costGovernanceWorker', details_json:{ validation:snapshot.validation, coverage_truncated:snapshot.coverage_truncated, utilization:snapshot.utilization }, observed_at:now, expires_at:new Date(Date.now()+25*3600000).toISOString() });
    // The worker proves budget configuration and emits real alerts/stops, but it
    // must not self-certify that alert delivery and the kill-switch work. Only
    // the Founder operator exercise may satisfy COST_ANOMALY_ALERTS.
    await finishSchedulerRunOrThrow(svc, claim, { maximum_utilization_pct:maximumPct, budget_version:snapshot.control?.version || null }, true);
    return Response.json({ ok:true, snapshot, maximum_utilization_pct:maximumPct });
  } catch (error) {
    console.error('costGovernanceWorker failed', error);
    if (svc && claim) await finishSchedulerRunOrThrow(svc, claim, { error:String((error as Error)?.message || error).slice(0,300) }, false);
    return Response.json({ ok:false, error:'cost_governance_worker_failed' }, { status:500 });
  }
}
