import { costRuntimeSnapshot } from './costGovernance.ts';
import { evaluateGoLiveHardGates, normalizeReleaseEvidence } from './goLiveHardGates.ts';
import { emergencyState } from './operationalControl.ts';
import { runtimeGitSha } from './runtimeEvidence.ts';
import { readSingletonAuthority } from './singletonAuthority.ts';
import { requireCriticalOperation } from './criticalExecution.ts';

const AUTHORITY_BLOCKERS:Record<string,string>={
  open_incident:'open_incident_authority_unavailable',
};

async function gateRead<T>(key:string, run:()=>Promise<T>, fallback:T) {
  try { return { available:true, value:await requireCriticalOperation(`go_live_${key}_read`, run), blocker:null }; }
  catch { return { available:false, value:fallback, blocker:AUTHORITY_BLOCKERS[key]||`${key}_authority_unavailable` }; }
}

export async function collectGoLiveRuntime(svc:any, input:any = {}) {
  const finalSha = runtimeGitSha(input);
  const [runtimeRead, releaseRead, restoreRead, emergency, outboundAuthority, costValue, incidentRead, approvalRead, profileRead, policyRead, providerRead, retryRead, strategyRead] = await Promise.all([
    gateRead('runtime_evidence',()=>svc.entities.RuntimeGateEvidence.list('-observed_at', 1000),[]),
    finalSha ? gateRead('release_verification',()=>svc.entities.ReleaseVerification.filter({ git_sha:finalSha }, '-verified_at', 100),[]) : Promise.resolve({available:true,value:[],blocker:null}),
    gateRead('restore_evidence',()=>svc.entities.DisasterRecoveryExercise.filter({ exercise_type:'REAL_RESTORE' }, '-completed_at', 20),[]),
    emergencyState(svc),
    readSingletonAuthority(svc,{entity:'OutboundControl',query:{control_key:'global'},sort:'-created_date',authority:'outbound_control'}),
    costRuntimeSnapshot(svc).catch((error:any) => ({ validation:{ ok:false, blockers:['cost_runtime_unavailable'] }, error:String(error?.message || error) })),
    gateRead('open_incident',()=>svc.entities.AutonomyIncident.filter({ status:'open' }, '-last_seen_at', 500),[]),
    gateRead('pending_approval',()=>svc.entities.Approval.filter({ status:'pending' }, '-created_date', 500),[]),
    gateRead('sending_profile',()=>svc.entities.OutboundSendingProfile.list('-created_date', 100),[]),
    gateRead('commercial_policy',()=>svc.entities.CommercialPolicy.filter({ status:'active' }, '-approved_at', 100),[]),
    gateRead('commercial_provider',()=>svc.entities.CommercialProviderState.list('-last_checked_at', 100),[]),
    gateRead('outbound_provider_event',()=>svc.entities.OutboundProviderEvent.filter({ status:{$in:['PENDING_RETRY','DEAD_LETTER']} }, '-last_attempt_at', 500),[]),
    gateRead('commercial_strategy',()=>svc.entities.CommercialStrategy.list('-created_at', 500),[]),
  ]);
  const runtimeEvidence:any[]=runtimeRead.value,releaseRows:any[]=releaseRead.value,restores:any[]=restoreRead.value,openIncidents:any[]=incidentRead.value,pendingApprovals:any[]=approvalRead.value,sendingProfiles:any[]=profileRead.value,activePolicies:any[]=policyRead.value,providerStates:any[]=providerRead.value,providerRetryEvents:any[]=retryRead.value,commercialStrategies:any[]=strategyRead.value;
  const cost:any=costValue;
  const incidentRows:any[]=Array.isArray(openIncidents)?openIncidents:[];
  const verification = (source:string) => releaseRows.find((row:any) => row.source === source) || null;
  const normalized = normalizeReleaseEvidence({
    remote_ci:verification('GITHUB_ACTIONS'), base44_runtime:verification('BASE44_RUNTIME'),
    dependency_monitor:verification('DEPENDENCY_MONITOR'), document_extraction_eval:verification('DOCUMENT_GOLDEN_CORPUS'),
    restore_exercise:restores[0] || null,
  });
  const directBlockers:string[] = [];
  for(const read of [runtimeRead,releaseRead,restoreRead,incidentRead,approvalRead,profileRead,policyRead,providerRead,retryRead,strategyRead])if(!read.available&&read.blocker)directBlockers.push(read.blocker);
  if (!finalSha) directBlockers.push('final_git_sha_not_configured');
  if (emergency.safe_mode) directBlockers.push('global_emergency_stop_active');
  if(!outboundAuthority.ok)directBlockers.push(outboundAuthority.blocker||'outbound_control_authority_unavailable');
  if (cost?.validation?.ok !== true) directBlockers.push(...(cost?.validation?.blockers || ['active_cost_budget_required']));
  if (cost?.coverage_truncated) directBlockers.push('cost_usage_coverage_truncated');
  if(incidentRows.length>=500)directBlockers.push('open_incident_coverage_truncated');
  if(runtimeEvidence.length>=1000)directBlockers.push('runtime_evidence_coverage_truncated');
  if(releaseRows.length>=100)directBlockers.push('release_verification_coverage_truncated');
  if(pendingApprovals.length>=500)directBlockers.push('pending_approval_coverage_truncated');
  if(sendingProfiles.length>=100)directBlockers.push('sending_profile_coverage_truncated');
  if(activePolicies.length>=100)directBlockers.push('commercial_policy_coverage_truncated');
  if(providerStates.length>=100)directBlockers.push('commercial_provider_coverage_truncated');
  if(providerRetryEvents.length>=500)directBlockers.push('outbound_provider_event_coverage_truncated');
  if(commercialStrategies.length>=500)directBlockers.push('commercial_strategy_coverage_truncated');
  if(incidentRows.some((row:any)=>row.severity==='critical'))directBlockers.push('critical_autonomy_incident_open');
  if(incidentRows.some((row:any)=>String(row.dedupe_key||'').startsWith('emergency-containment-incomplete:')))directBlockers.push('emergency_containment_incomplete');
  const instantlyState=providerStates.find((row:any)=>row.provider_key==='instantly'&&row.role==='outbound')||null;
  const outbound=outboundAuthority.ok?outboundAuthority.row:null;
  if(outbound?.instantly_enabled===true&&!['AUTHENTICATED','ACTIVE'].includes(String(instantlyState?.status||'')))directBlockers.push('instantly_enabled_without_authenticated_provider_state');
  if(providerRetryEvents.some((row:any)=>row.status==='DEAD_LETTER'))directBlockers.push('outbound_provider_dead_letters_open');
  const decision = await evaluateGoLiveHardGates({ evidence:[...runtimeEvidence, ...normalized], final_sha:finalSha, direct_blockers:directBlockers });
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
  const incidentProjection = (row:any) => ({ id:row.id,incident_key:row.incident_key || row.dedupe_key || null,severity:row.severity,status:row.status,title:row.title || row.summary || row.message || null,last_seen_at:row.last_seen_at });
  const approvalProjection = (row:any) => ({ id:row.id,approval_key:row.approval_key || null,status:row.status,action_type:row.action_type || null,created_date:row.created_date });
  return {
    ...compactDecision,
    runtime:{ emergency, outbound_control:outbound, outbound_authority:{status:outboundAuthority.status,blocker:outboundAuthority.blocker,count:outboundAuthority.count}, cost, sending_profiles:sendingProfiles.map(profileProjection), active_policies:activePolicies.map(policyProjection), commercial_providers:providerStates.map(providerProjection), instantly_provider:instantlyState ? providerProjection(instantlyState) : null, outbound_provider_event_backlog:providerRetryEvents.slice(0,20).map((row:any)=>({ id:row.id,provider:row.provider,status:row.status,event_type:row.event_type,last_attempt_at:row.last_attempt_at })), commercial_strategy_summary:{total:commercialStrategies.length,ready:commercialStrategies.filter((row:any)=>row.status==='READY').length,executed:commercialStrategies.filter((row:any)=>row.status==='EXECUTED').length,coverage_truncated:commercialStrategies.length>=500}, effective_instantly_capacity:outbound?.acquisition_enabled===true&&outbound?.instantly_enabled===true&&instantlyState?.status==='ACTIVE'?sendingProfiles.filter((row:any)=>row.provider==='instantly'&&row.status==='active').reduce((sum:number,row:any)=>sum+Math.max(0,Number(row.current_daily_cap)||0),0):0, open_incidents:incidentRows.slice(0,20).map(incidentProjection), open_incident_count:incidentRows.length, open_incident_read_error:incidentRead.available?null:incidentRead.blocker, pending_approvals:pendingApprovals.slice(0,20).map(approvalProjection), pending_approval_count:pendingApprovals.length },
    evidence_count:runtimeEvidence.length + normalized.length,
  };
}
