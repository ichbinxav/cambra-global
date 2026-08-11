import { costRuntimeSnapshot } from './costGovernance.ts';
import { evaluateGoLiveHardGates, normalizeReleaseEvidence } from './goLiveHardGates.ts';
import { emergencyState } from './operationalControl.ts';
import { runtimeGitSha } from './runtimeEvidence.ts';

export async function collectGoLiveRuntime(svc:any, input:any = {}) {
  const finalSha = runtimeGitSha(input);
  const [runtimeEvidence, releaseRows, restores, emergency, outboundRows, costValue, openIncidents, pendingApprovals, sendingProfiles, activePolicies, providerStates, providerRetryEvents, commercialStrategies] = await Promise.all([
    svc.entities.RuntimeGateEvidence.list('-observed_at', 1000).catch(() => []),
    finalSha ? svc.entities.ReleaseVerification.filter({ git_sha:finalSha }, '-verified_at', 100).catch(() => []) : Promise.resolve([]),
    svc.entities.DisasterRecoveryExercise.filter({ exercise_type:'REAL_RESTORE' }, '-completed_at', 20).catch(() => []),
    emergencyState(svc),
    svc.entities.OutboundControl.filter({ control_key:'global' }, '-created_date', 1).catch(() => []),
    costRuntimeSnapshot(svc).catch((error:any) => ({ validation:{ ok:false, blockers:['cost_runtime_unavailable'] }, error:String(error?.message || error) })),
    svc.entities.AutonomyIncident.filter({ status:'open' }, '-last_seen_at', 500).catch(() => []),
    svc.entities.Approval.filter({ status:'pending' }, '-created_date', 500).catch(() => []),
    svc.entities.OutboundSendingProfile.list('-created_date', 100).catch(() => []),
    svc.entities.CommercialPolicy.filter({ status:'active' }, '-approved_at', 100).catch(() => []),
    svc.entities.CommercialProviderState.list('-last_checked_at', 100).catch(() => []),
    svc.entities.OutboundProviderEvent.filter({ status:{$in:['PENDING_RETRY','DEAD_LETTER']} }, '-last_attempt_at', 500).catch(() => []),
    svc.entities.CommercialStrategy.list('-created_at', 500).catch(() => []),
  ]);
  const cost:any=costValue;
  const verification = (source:string) => releaseRows.find((row:any) => row.source === source) || null;
  const normalized = normalizeReleaseEvidence({
    remote_ci:verification('GITHUB_ACTIONS'), base44_runtime:verification('BASE44_RUNTIME'),
    dependency_monitor:verification('DEPENDENCY_MONITOR'), document_extraction_eval:verification('DOCUMENT_GOLDEN_CORPUS'),
    restore_exercise:restores[0] || null,
  });
  const directBlockers:string[] = [];
  if (!finalSha) directBlockers.push('final_git_sha_not_configured');
  if (emergency.safe_mode) directBlockers.push('global_emergency_stop_active');
  if (cost?.validation?.ok !== true) directBlockers.push(...(cost?.validation?.blockers || ['active_cost_budget_required']));
  if (cost?.coverage_truncated) directBlockers.push('cost_usage_coverage_truncated');
  const instantlyState=providerStates.find((row:any)=>row.provider_key==='instantly'&&row.role==='outbound')||null;
  if(outboundRows[0]?.instantly_enabled===true&&!['AUTHENTICATED','ACTIVE'].includes(String(instantlyState?.status||'')))directBlockers.push('instantly_enabled_without_authenticated_provider_state');
  if(providerRetryEvents.some((row:any)=>row.status==='DEAD_LETTER'))directBlockers.push('outbound_provider_dead_letters_open');
  const decision = evaluateGoLiveHardGates({ evidence:[...runtimeEvidence, ...normalized], final_sha:finalSha, direct_blockers:directBlockers });
  return {
    ...decision,
    runtime:{ emergency, outbound_control:outboundRows[0] || null, cost, sending_profiles:sendingProfiles, active_policies:activePolicies, commercial_providers:providerStates, instantly_provider:instantlyState, outbound_provider_event_backlog:providerRetryEvents.slice(0,100), commercial_strategy_summary:{total:commercialStrategies.length,ready:commercialStrategies.filter((row:any)=>row.status==='READY').length,executed:commercialStrategies.filter((row:any)=>row.status==='EXECUTED').length,coverage_truncated:commercialStrategies.length>=500}, effective_instantly_capacity:outboundRows[0]?.acquisition_enabled===true&&outboundRows[0]?.instantly_enabled===true&&instantlyState?.status==='ACTIVE'?sendingProfiles.filter((row:any)=>row.provider==='instantly'&&row.status==='active').reduce((sum:number,row:any)=>sum+Math.max(0,Number(row.current_daily_cap)||0),0):0, open_incidents:openIncidents.slice(0,100), pending_approvals:pendingApprovals.slice(0,100) },
    evidence_count:runtimeEvidence.length + normalized.length,
  };
}
