import { policyIsActive } from './commercialAutonomy.ts';
import { sha256Canonical } from './legalExecution.ts';
import { evaluateLegalExecution } from './legalExecutionRuntime.ts';
import { collectGoLiveRuntime } from './goLiveRuntime.ts';
import {
  COMMERCIAL_ACTIVATION_VERSION, automaticFollowUpCandidate, commercialActionForEngine,
  sendingProfileIsValid, validateCanaryPolicy,
} from './commercialActivation.ts';

function engineProviders(scope:string):Record<string,string>{
  if(scope==='resend')return {merchant_acquisition:'resend'};
  if(scope==='outlook')return {partner_acquisition:'outlook'};
  return {merchant_acquisition:'resend',partner_acquisition:'outlook'};
}

async function policiesForScope(svc:any,scope:string,input:any){
  const suppliedIds=[...new Set([...(Array.isArray(input?.policy_ids)?input.policy_ids:[]),input?.policy_id].map((id:any)=>String(id||'').trim()).filter(Boolean))];
  const supplied:any[]=[];
  for(const id of suppliedIds){const policy=await svc.entities.CommercialPolicy.get(id).catch(()=>null);if(policy)supplied.push(policy);}
  const policies:any[]=[];const missing:string[]=[];
  for(const engine of Object.keys(engineProviders(scope))){
    let policy=supplied.find((row:any)=>row.engine===engine)||null;
    if(!policy){
      const rows=await svc.entities.CommercialPolicy.filter({engine,status:'active'},'-approved_at',20).catch(()=>[]);
      policy=rows.find((row:any)=>policyIsActive(row))||rows[0]||null;
    }
    if(policy)policies.push(policy);else missing.push(engine);
  }
  return {policies,missing};
}

/** Read-only readiness apart from the immutable P10/P11 decision evidence it intentionally creates. */
export async function evaluateCommercialGoLiveReadiness(svc:any,input:any={}){
  const checkedAt=new Date().toISOString();
  const providerScope=['resend','outlook','all'].includes(String(input?.provider_scope||''))?String(input.provider_scope):'all';
  const blockers:string[]=[];
  const policySet=await policiesForScope(svc,providerScope,input);
  for(const engine of policySet.missing)blockers.push(`active_acquisition_policy_required:${engine}`);
  if(!policySet.policies.length)return {allowed:false,blockers,checked_at:checkedAt,provider_scope:providerScope,policy_ids:[],version:COMMERCIAL_ACTIVATION_VERSION};

  const validated=policySet.policies.map((policy:any)=>({policy,validation:validateCanaryPolicy(policy)}));
  for(const {policy,validation} of validated){
    blockers.push(...validation.blockers.map((blocker:string)=>`${policy.engine}:${blocker}`));
    if(!policyIsActive(policy))blockers.push(`${policy.engine}:policy_approval_or_effective_window_invalid`);
  }

  const allProfiles=await svc.entities.OutboundSendingProfile.list('-created_date',500).catch(()=>[]);
  const profileByKey=new Map<string,any>();
  for(const profile of allProfiles)if(!profileByKey.has(String(profile.profile_key)))profileByKey.set(String(profile.profile_key),profile);
  const selectedKeys=[...new Set(validated.flatMap(({validation}:any)=>validation.sending_profile_keys))];
  const selectedProfiles=selectedKeys.map((key:string)=>profileByKey.get(key)||null);
  for(const key of selectedKeys)if(!sendingProfileIsValid(profileByKey.get(key)))blockers.push(`sending_profile_invalid:${key}`);
  const expectedProviders=engineProviders(providerScope);
  for(const {policy,validation} of validated){
    const provider=expectedProviders[policy.engine];
    if(provider&&!validation.sending_profile_keys.some((key:string)=>sendingProfileIsValid(profileByKey.get(key))&&profileByKey.get(key)?.provider===provider))blockers.push(`${policy.engine}:policy_profile_required:${provider}`);
  }

  const needsResend=Object.values(expectedProviders).includes('resend');
  const needsOutlook=Object.values(expectedProviders).includes('outlook');
  const resendConfigured=!needsResend||Boolean(Deno.env.get('RESEND_API_KEY'));
  const outlook=needsOutlook?await svc.connectors.getConnection('outlook').catch(()=>null):null;
  const outlookConfigured=!needsOutlook||Boolean(outlook?.accessToken);
  if(!resendConfigured)blockers.push('resend_credentials_required');
  if(!outlookConfigured)blockers.push('outlook_connector_required');

  const controls=await svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch(()=>[]);
  const control=controls[0]||null;
  if(!control)blockers.push('outbound_control_required');
  if(control?.acquisition_enabled===true)blockers.push('outbound_must_remain_paused_during_preflight');

  const marketDecisions:any[]=[];
  for(const {policy,validation} of validated){
    const requestedAction=commercialActionForEngine(policy.engine);
    for(const market of validation.markets){
      try{
        const decision=await evaluateLegalExecution(svc,{
          requested_action:requestedAction,jurisdiction:market,
          actor:{id:'commercial_go_live_preflight',type:'AUTOMATION',tool:'commercialGoLiveReadiness',allowed_actions:[requestedAction]},
        });
        marketDecisions.push({policy_id:policy.id,engine:policy.engine,market,allowed:decision.allowed===true,decision:decision.decision,reason_codes:decision.reason_codes||[],p10_version:decision.regulatory_policy_version||null,p11_version:decision.policy_version||null,authority_snapshot_id:decision.authority_snapshot_id||null});
        if(!decision.allowed)blockers.push(`${policy.engine}:market_not_ready:${market}:${decision.decision}`);
      }catch(error){
        marketDecisions.push({policy_id:policy.id,engine:policy.engine,market,allowed:false,decision:'PREFLIGHT_ERROR',reason_codes:['LEGAL_EXECUTION_PREFLIGHT_FAILED']});
        blockers.push(`${policy.engine}:market_readiness_error:${market}`);
      }
    }
  }

  const [awaitingCounterparty,awaitingCambra,reviewRows]=await Promise.all([
    svc.entities.CommunicationThread.filter({status:'awaiting_counterparty',automation_paused:false},'-next_action_at',1000).catch(()=>[]),
    svc.entities.CommunicationThread.filter({status:'awaiting_cambra',automation_paused:false},'-next_action_at',1000).catch(()=>[]),
    svc.entities.CommunicationThread.filter({sending_profile_resolution_status:'REVIEW_REQUIRED'},'-created_date',1000).catch(()=>[]),
  ]);
  const candidates=[...awaitingCounterparty,...awaitingCambra].filter((thread:any,index:number,rows:any[])=>rows.findIndex((row:any)=>row.id===thread.id)===index).filter(automaticFollowUpCandidate);
  const invalidCandidates=candidates.filter((thread:any)=>!sendingProfileIsValid(profileByKey.get(String(thread.sending_profile_key||''))));
  const legacyCoverageTruncated=awaitingCounterparty.length>=1000||awaitingCambra.length>=1000||reviewRows.length>=1000;
  if(invalidCandidates.length)blockers.push('eligible_legacy_threads_without_valid_profile');
  if(legacyCoverageTruncated)blockers.push('legacy_thread_coverage_truncated');

  const goLive=await collectGoLiveRuntime(svc,input).catch((error:any)=>({allowed:false,classification:'NOT_GO_READY',blockers:[`go_live_runtime_unavailable:${String(error?.message||error).slice(0,120)}`],gates:[]}));
  if(goLive.allowed!==true)blockers.push(...(goLive.blockers||['go_live_hard_gates_not_ready']).map((blocker:string)=>`go_live_hard_gate:${blocker}`));

  const evidence={
    version:COMMERCIAL_ACTIVATION_VERSION,provider_scope:providerScope,
    policies:validated.map(({policy,validation}:any)=>({id:policy.id,key:policy.policy_key,version:policy.version,engine:policy.engine,mode:policy.mode,daily_send_limit:policy.daily_send_limit,min_lead_score:policy.min_lead_score,countries:validation.markets,sending_profile_keys:validation.sending_profile_keys})),
    profiles:selectedProfiles.filter(Boolean).map((profile:any)=>({profile_key:profile.profile_key,provider:profile.provider,status:profile.status,current_daily_cap:profile.current_daily_cap,domain:profile.domain})),
    credentials:{resend_configured:resendConfigured,outlook_configured:outlookConfigured},
    markets:marketDecisions.map(({authority_snapshot_id,...decision})=>decision),
    legacy_threads:{automatic_follow_up_candidates:candidates.length,eligible_without_valid_profile:invalidCandidates.length,review_required:reviewRows.length,coverage_truncated:legacyCoverageTruncated},
    outbound_paused:control?.acquisition_enabled!==true,
    go_live:{classification:goLive.classification,allowed:goLive.allowed,passed:goLive.passed,total:goLive.total,final_sha:goLive.final_sha},
  };
  const hash=await sha256Canonical(evidence);
  const policyIds=policySet.policies.map((policy:any)=>String(policy.id));
  return {
    allowed:blockers.length===0,blockers:[...new Set(blockers)],preflight_hash:hash,checked_at:checkedAt,
    expires_at:new Date(Date.now()+15*60*1000).toISOString(),provider_scope:providerScope,policy_ids:policyIds,policy_id:policyIds.length===1?policyIds[0]:null,
    evidence,market_decisions:marketDecisions,
    unresolved_legacy_threads:reviewRows.slice(0,100).map((thread:any)=>({thread_id:thread.id,thread_key:thread.thread_key||null,reason:thread.sending_profile_resolution_reason||null,paused:thread.automation_paused===true})),
    invalid_eligible_threads:invalidCandidates.slice(0,100).map((thread:any)=>({thread_id:thread.id,thread_key:thread.thread_key||null,sending_profile_key:thread.sending_profile_key||null})),
    go_live,
    version:COMMERCIAL_ACTIVATION_VERSION,
  };
}
