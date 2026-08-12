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
  // Base44 has a strict response-size ceiling. Gate evaluation still consumes
  // the complete immutable evidence above, but Admin only needs provenance and
  // status—not every historical details_json blob in every refresh response.
  const compactDecision = {
    ...decision,
    gates:decision.gates.map((gate:any) => ({
      key:gate.key,
      label:gate.label,
      category:gate.category,
      status:gate.status,
      blockers:gate.blockers,
      evidence:gate.evidence ? {
        id:gate.evidence.id || null,
        evidence_key:gate.evidence.evidence_key || gate.evidence.verification_key || null,
        status:gate.evidence.status || null,
        evidence_kind:gate.evidence.evidence_kind || null,
        source:gate.evidence.source || null,
        git_sha:gate.evidence.git_sha || null,
        observed_at:gate.evidence.observed_at || gate.evidence.verified_at || gate.evidence.completed_at || null,
        expires_at:gate.evidence.expires_at || null,
      } : null,
    })),
  };
  const profileProjection = (row:any) => ({ id:row.id,profile_key:row.profile_key,provider:row.provider,from_address:row.from_address,domain:row.domain,status:row.status,current_daily_cap:row.current_daily_cap,target_daily_cap:row.target_daily_cap,external_campaign_id:row.external_campaign_id || null,webhook_status:row.webhook_status || null });
  const policyProjection = (row:any) => ({ id:row.id,policy_key:row.policy_key,engine:row.engine,status:row.status,mode:row.mode,daily_send_limit:row.daily_send_limit,min_lead_score:row.min_lead_score,markets:row.markets || row.countries || [],sending_profile_keys:row.sending_profile_keys || [] });
  const providerProjection = (row:any) => ({ id:row.id,provider_key:row.provider_key,role:row.role,status:row.status,auth_test_pass:row.auth_test_pass,last_checked_at:row.last_checked_at,last_error_code:row.last_error_code || null });
  const incidentProjection = (row:any) => ({ id:row.id,incident_key:row.incident_key || null,severity:row.severity,status:row.status,title:row.title || row.message || null,last_seen_at:row.last_seen_at });
  const approvalProjection = (row:any) => ({ id:row.id,approval_key:row.approval_key || null,status:row.status,action_type:row.action_type || null,created_date:row.created_date });
  return {
    ...compactDecision,
    runtime:{ emergency, outbound_control:outboundRows[0] || null, cost, sending_profiles:sendingProfiles.map(profileProjection), active_policies:activePolicies.map(policyProjection), commercial_providers:providerStates.map(providerProjection), instantly_provider:instantlyState ? providerProjection(instantlyState) : null, outbound_provider_event_backlog:providerRetryEvents.slice(0,20).map((row:any)=>({ id:row.id,provider:row.provider,status:row.status,event_type:row.event_type,last_attempt_at:row.last_attempt_at })), commercial_strategy_summary:{total:commercialStrategies.length,ready:commercialStrategies.filter((row:any)=>row.status==='READY').length,executed:commercialStrategies.filter((row:any)=>row.status==='EXECUTED').length,coverage_truncated:commercialStrategies.length>=500}, effective_instantly_capacity:outboundRows[0]?.acquisition_enabled===true&&outboundRows[0]?.instantly_enabled===true&&instantlyState?.status==='ACTIVE'?sendingProfiles.filter((row:any)=>row.provider==='instantly'&&row.status==='active').reduce((sum:number,row:any)=>sum+Math.max(0,Number(row.current_daily_cap)||0),0):0, open_incidents:openIncidents.slice(0,20).map(incidentProjection), open_incident_count:openIncidents.length, pending_approvals:pendingApprovals.slice(0,20).map(approvalProjection), pending_approval_count:pendingApprovals.length },
    evidence_count:runtimeEvidence.length + normalized.length,
  };
}
