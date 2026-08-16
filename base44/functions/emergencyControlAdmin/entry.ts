import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { buildEmergencyStopPreview, evaluateSafeResume, FOUNDER_CONTROL_V2_VERSION, RESUMABLE_CAPABILITIES } from '../../shared/founderControlV2.ts';
import { pauseAllInstantlyCampaigns } from '../../shared/instantlyRuntime.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { containCommunicationTransport, persistEmergencyTransportContainment } from '../../shared/operationalControl.ts';
import { bootstrapContainedSingleton, readAuthorityRowsForContainment, readSingletonAuthority } from '../../shared/singletonAuthority.ts';
import { safeBestEffort } from '../../shared/bestEffort.ts';

const CONFIRM_ON='ACTIVATE_CAMBRA_SAFE_MODE';
const CONFIRM_OFF='RESTORE_CAMBRA_AUTONOMY'; // Legacy token retained, but now also requires a fresh selective-resume preflight.
const CONFIRM_RESUME='RESUME_SELECTED_CAPABILITIES';
const now=()=>new Date().toISOString();
const commandKey=()=>`founder-control:${crypto.randomUUID()}`;
const text=(value:any,max=500)=>String(value||'').trim().slice(0,max);
const updatedExactlyOne=(result:any)=>Boolean(result&&(result.updated===1||result.modified_count===1||result.matched_count===1));

async function getOrCreate(svc:any){
  const authority=await bootstrapContainedSingleton(svc,{entity:'EmergencyControl',query:{control_key:'global'},sort:'-updated_at',authority:'emergency_control',containedCandidate:()=>({control_key:'global',safe_mode:true,communications_paused:true,negotiations_paused:true,migrations_paused:true,billing_issuance_paused:true,paid_discovery_paused:true,resume_check_required:true,control_revision:0,reason:'Emergency authority initialized fail-closed; Founder Safe Resume required.',updated_at:now(),updated_by:'system'})});
  const row:any=authority.row;
  if(!authority.ok||!row)return authority;
  if(!Number.isInteger(Number(row.control_revision))){
    await svc.entities.EmergencyControl.update(row.id,{control_revision:0});
    const verified=await readSingletonAuthority(svc,{entity:'EmergencyControl',query:{control_key:'global'},sort:'-updated_at',authority:'emergency_control'});
    if(!verified.ok||!verified.row)return verified;
    return {...verified,row:{...verified.row,control_revision:0}};
  }
  return authority;
}

// Emergency Stop owns the safety race. Bumping the outbound CAS revision
// invalidates any in-flight START_SCOPE claim before remote state can be
// projected as enabled. The start path also re-checks EmergencyControl around
// each provider effect and performs targeted remote containment.
async function containOutboundForEmergency(svc:any,seed:any){
  if(!seed)return {ok:true,reason:'outbound_control_missing'};
  const stopped={acquisition_enabled:false,premium_outlook_enabled:false,volume_resend_enabled:false,instantly_enabled:false,paused_reason:'founder_global_emergency_stop',transition_key:'',transition_action:'',transition_actor:'',transition_preflight_hash:'',transition_emergency_revision:null,transition_started_at:null,transition_expires_at:null};
  for(let attempt=0;attempt<4;attempt++){
    const current=attempt===0?seed:await svc.entities.OutboundControl.get(seed.id).catch((error:any)=>safeBestEffort(error,{operation:'emergencyControlAdmin.outbound_containment_read',fallback:null,severity:'critical'}));
    if(!current)return {ok:false,reason:'outbound_control_unavailable'};
    const revision=Number.isInteger(Number(current.control_revision))?Number(current.control_revision):0;
    const changed=await svc.entities.OutboundControl.updateMany({id:current.id,control_revision:revision},{$set:{...stopped,control_revision:revision+1}}).catch((error:any)=>safeBestEffort(error,{operation:'emergencyControlAdmin.outbound_containment_cas',fallback:null,severity:'critical'}));
    if(updatedExactlyOne(changed))return {ok:true,control_revision:revision+1};
  }
  const current=await svc.entities.OutboundControl.get(seed.id).catch((error:any)=>safeBestEffort(error,{operation:'emergencyControlAdmin.outbound_containment_fallback_read',fallback:null,severity:'critical'}));
  if(!current)return {ok:false,reason:'outbound_control_unavailable'};
  const revision=Number.isInteger(Number(current.control_revision))?Number(current.control_revision):0;
  try{
    await svc.entities.OutboundControl.update(current.id,{...stopped,control_revision:revision+1});
    return {ok:true,control_revision:revision+1,fallback:true};
  }catch(error){safeBestEffort(error,{operation:'emergencyControlAdmin.outbound_containment_fallback_write',fallback:null,severity:'critical'});return {ok:false,reason:'outbound_containment_write_failed'}}
}

async function executedCommand(svc:any,key:string,actor:string){
  if(!key)return null;
  // Never turn an unavailable replay ledger into permission to execute the
  // material command again.
  const rows=await svc.entities.FounderCommandAudit.filter({command_key:key,status:'executed'},'-created_at',2);
  return rows[0]&&rows[0].actor_email===actor?rows[0]:null;
}

async function previewCommand(svc:any,key:string,action:string,actor:string){
  if(!key)return null;
  const rows=await svc.entities.FounderCommandAudit.filter({command_key:key,action,status:'previewed'},'-created_at',5);
  return rows[0]&&rows[0].actor_email===actor?rows[0]:null;
}

async function recordPreview(svc:any,user:any,action:string,preview:any,scope:any={}){
  const key=commandKey();
  await svc.entities.FounderCommandAudit.create({command_key:key,actor_email:String(user.email||user.id||'admin'),intent:'founder_control',action,scope_json:scope,risk_level:4,material:true,requires_confirmation:true,confirmed:false,preview_json:preview,status:'previewed',result_json:{},policy_json:{founder_control_version:FOUNDER_CONTROL_V2_VERSION},created_at:now()});
  return key;
}

async function recordExecution(svc:any,user:any,input:any){
  const at=now();
  const audit=await svc.entities.FounderCommandAudit.create({command_key:input.command_key,actor_email:String(user.email||user.id||'admin'),intent:'founder_control',action:input.action,scope_json:{reason:input.reason,selected_capabilities:input.selected_capabilities||[],correlation_id:input.correlation_id},risk_level:4,material:true,requires_confirmation:true,confirmed:true,preview_json:input.preview||{},status:'executed',result_json:input.result||{},policy_json:{founder_control_version:FOUNDER_CONTROL_V2_VERSION},created_at:at});
  await svc.entities.OperationalLog.create({event_type:'emergency_control_changed',message:input.action,data_json:{correlation_id:input.correlation_id,command_key:input.command_key,action:input.action,reason:input.reason,capability:'global_safety',previous_state:input.previous_state,resulting_state:input.result?.control||input.result,selected_capabilities:input.selected_capabilities||[],audit_id:audit.id},actor_email:String(user.email||user.id||'admin'),created_at:at});
  return audit;
}

function controlProjection(row:any){return{safe_mode:row.safe_mode===true,communications_paused:row.communications_paused===true,negotiations_paused:row.negotiations_paused===true,migrations_paused:row.migrations_paused===true,billing_issuance_paused:row.billing_issuance_paused===true,paid_discovery_paused:row.paid_discovery_paused===true,resume_check_required:row.resume_check_required===true,control_revision:Number(row.control_revision||0),reason:String(row.reason||''),updated_at:row.updated_at||null,updated_by:row.updated_by||null,last_correlation_id:row.last_correlation_id||null,transport_containment_status:row.transport_containment_status||null,transport_containment_observed_at:row.transport_containment_observed_at||null,transport_containment:row.transport_containment_json||null};}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);
    const user=await base44.auth.me();
    if(!user)return Response.json({ok:false,error:'Unauthorized'},{status:401});
    if(user.role!=='admin')return Response.json({ok:false,error:'Forbidden'},{status:403});
    const body=await req.json().catch(()=>({}));
    const action=String(body.action||'status');
    const svc=base44.asServiceRole;
    const emergencyAuthority=await getOrCreate(svc);
    if(!emergencyAuthority.ok||!emergencyAuthority.row)return Response.json({ok:false,error:emergencyAuthority.blocker||'emergency_control_authority_unavailable',authority_status:emergencyAuthority.status,conflicting_control_ids:(emergencyAuthority.rows||[]).map((candidate:any)=>String(candidate.id||'')).filter(Boolean),material_effects_fail_closed:true},{status:409});
    const row:any=emergencyAuthority.row;
    const actor=String(user.email||user.id||'admin');
    if(action==='status')return Response.json({ok:true,control:controlProjection(row),semantics:{safe_mode:'Pauses new external communications, negotiations, migrations, paid Discovery/enrichment and new billing issuance. Monitoring, reconciliation, evidence and already-earned obligations continue.',billing:'Only NEW invoice issuance is paused. Reconciliation and payment-state observation remain active.',routing:'Real payment routing is already disabled elsewhere and is unaffected.',resume:'Safe Resume is selective, dependency-aware and never reactivates outbound or CommercialPolicy automatically.'}});

    if(action==='safe_mode_preview'){
      const prepared=await buildEmergencyStopPreview(svc);
      const key=await recordPreview(svc,user,'safe_mode_on',prepared.preview);
      return Response.json({...prepared,command_key:key,confirmation_required:CONFIRM_ON});
    }

    if(action==='resume_preflight'){
      const preflight=await evaluateSafeResume(svc,body.selected_capabilities);
      const key=await recordPreview(svc,user,'resume_selected',preflight,{selected_capabilities:preflight.selected_capabilities});
      return Response.json({ok:true,preflight,command_key:key,confirmation_required:CONFIRM_RESUME});
    }

    const key=text(body.command_key,200);
    const replay=await executedCommand(svc,key,actor);
    if(replay){
      const replayResult=replay.result_json||{};
      const incompleteStop=String(replay.action||action)==='safe_mode_on'&&replayResult.containment_status!=='CONTAINED';
      return Response.json({ok:!incompleteStop,idempotent_replay:true,command_key:key,result:replayResult,control:replayResult?.control||controlProjection(row),...(incompleteStop?{error:'emergency_containment_incomplete',containment_status:'CONTAINMENT_INCOMPLETE',containment_blockers:replayResult.containment_blockers||['stored_containment_not_proven']}: {})},{status:incompleteStop?503:200});
    }
    const reason=text(body.reason);
    if(reason.length<3)return Response.json({ok:false,error:'founder_reason_required'},{status:400});
    const correlationId=text(body.correlation_id,200)||`emergency:${crypto.randomUUID()}`;
    const previous=controlProjection(row);

    if(action==='safe_mode_on'){
      if(body.confirmation!==CONFIRM_ON)return Response.json({ok:false,error:'confirmation_required',required:CONFIRM_ON},{status:409});
      const stored=await previewCommand(svc,key,'safe_mode_on',actor);
      if(!stored)return Response.json({ok:false,error:'fresh_stop_preview_required'},{status:409});
      if(body.preview_hash!==stored.preview_json?.state_fingerprint||Date.parse(stored.preview_json?.expires_at||'')<=Date.now())return Response.json({ok:false,error:'stop_preview_stale'},{status:409});
      const [outboundAuthority,policyAuthority,discoveryAuthority]=await Promise.all([
        readAuthorityRowsForContainment(svc,{entity:'OutboundControl',query:{control_key:'global'},sort:'-created_date',authority:'outbound_control',limit:1000}),
        readAuthorityRowsForContainment(svc,{entity:'CommercialPolicy',query:{status:'active'},sort:'-approved_at',authority:'active_commercial_policy',limit:1000}),
        readAuthorityRowsForContainment(svc,{entity:'DiscoveryExecutionRun',query:{status:{$in:['QUEUED','RUNNING']}},sort:'-started_at',authority:'active_discovery_run',limit:1000}),
      ]);
      const outboundRows:any[]=outboundAuthority.rows||[];
      const activePolicies:any[]=policyAuthority.rows||[];
      const activeDiscoveryRuns:any[]=discoveryAuthority.rows||[];
      const at=now();
      const nextRevision=Number(row.control_revision||0)+1;
      const changed=await svc.entities.EmergencyControl.updateMany({id:row.id,control_revision:Number(row.control_revision||0)},{$set:{safe_mode:true,communications_paused:true,negotiations_paused:true,migrations_paused:true,billing_issuance_paused:true,paid_discovery_paused:true,resume_check_required:true,control_revision:nextRevision,reason,activated_at:at,updated_at:at,updated_by:actor,last_correlation_id:correlationId,previous_state_json:{...previous,outbound_controls:outboundRows.map((candidate:any)=>({id:candidate.id,acquisition_enabled:candidate.acquisition_enabled,premium_outlook_enabled:candidate.premium_outlook_enabled,volume_resend_enabled:candidate.volume_resend_enabled,instantly_enabled:candidate.instantly_enabled})),active_commercial_policy_ids:activePolicies.map((policy:any)=>policy.id),active_discovery_run_ids:activeDiscoveryRuns.map((run:any)=>run.id),containment_read_coverage:{outbound:outboundAuthority.complete,commercial_policies:policyAuthority.complete,discovery_runs:discoveryAuthority.complete},captured_at:at}}}).catch((error:any)=>safeBestEffort(error,{operation:'emergencyControlAdmin.activate_safe_mode_cas',fallback:null,severity:'critical'}));
      if(!updatedExactlyOne(changed))return Response.json({ok:false,error:'emergency_control_changed_concurrently'},{status:409});
      const updated=await svc.entities.EmergencyControl.get(row.id);
      const containmentResults=[];
      for(const outbound of outboundRows)containmentResults.push({control_id:String(outbound.id||''),...(await containOutboundForEmergency(svc,outbound))});
      const localOutboundContainment={ok:outboundAuthority.complete&&containmentResults.every((result:any)=>result.ok),authority_row_count:outboundRows.length,duplicate_authority_detected:outboundRows.length>1,coverage_complete:outboundAuthority.complete,read_blocker:outboundAuthority.blocker,results:containmentResults};
      const policyContainmentResults=[];
      for(const policy of activePolicies){
        try{await svc.entities.CommercialPolicy.update(policy.id,{status:'paused'});policyContainmentResults.push({id:String(policy.id||''),ok:true});}
        catch(error){safeBestEffort(error,{operation:'emergencyControlAdmin.pause_commercial_policy',fallback:null,severity:'critical'});policyContainmentResults.push({id:String(policy.id||''),ok:false,error:text((error as any)?.code||(error as any)?.message,120)});}
      }
      const discoveryContainmentResults=[];
      for(const run of activeDiscoveryRuns){
        try{await svc.entities.DiscoveryExecutionRun.update(run.id,{stop_requested:true,stop_reason:'GLOBAL_EMERGENCY_STOP'});discoveryContainmentResults.push({id:String(run.id||''),ok:true});}
        catch(error){safeBestEffort(error,{operation:'emergencyControlAdmin.stop_discovery_run',fallback:null,severity:'critical'});discoveryContainmentResults.push({id:String(run.id||''),ok:false,error:text((error as any)?.code||(error as any)?.message,120)});}
      }
      const policyContainment={ok:policyAuthority.complete&&policyContainmentResults.every((result:any)=>result.ok),coverage_complete:policyAuthority.complete,read_blocker:policyAuthority.blocker,results:policyContainmentResults};
      const discoveryContainment={ok:discoveryAuthority.complete&&discoveryContainmentResults.every((result:any)=>result.ok),coverage_complete:discoveryAuthority.complete,read_blocker:discoveryAuthority.blocker,results:discoveryContainmentResults};
      // Persist an explicit result for every physical outbound transport. This
      // also pauses every visible sending profile; unreadable/truncated rows
      // make the whole containment result incomplete rather than a false PASS.
      const transportContainmentResults=[];
      for(const transport of ['outlook','resend','instantly'] as const){
        const contained=await containCommunicationTransport(svc,transport,'founder_global_emergency_stop').catch((error:any)=>({ok:false,transport,error:text(error?.code||error?.message,120)}));
        transportContainmentResults.push(contained);
      }
      const transportContainment={ok:transportContainmentResults.every((result:any)=>result.ok),status:transportContainmentResults.every((result:any)=>result.ok)?'LOCALLY_CONTAINED':'CONTAINMENT_INCOMPLETE',results:transportContainmentResults};
      const remotePause:any=await pauseAllInstantlyCampaigns(svc,'global_emergency_stop').catch((error:any)=>({ok:false,error:text(error?.code||error?.message,120),campaigns:[]}));
      const transportFields:any={outlook:'premium_outlook_enabled',resend:'volume_resend_enabled',instantly:'instantly_enabled'};
      const configuredTransports=(['outlook','resend','instantly'] as const).filter((transport)=>{
        const local=transportContainmentResults.find((candidate:any)=>candidate.transport===transport);
        return outboundRows.some((candidate:any)=>candidate?.[transportFields[transport]]===true)||Number(local?.profile_results?.length||0)>0;
      });
      // Instantly exposes a remote campaign-pause API. Outlook and Resend are
      // one-shot delivery transports: a sent message cannot be recalled and no
      // provider-wide pause receipt exists. Therefore a configured Outlook or
      // Resend transport can be locally contained, but OTR-003 must remain
      // incomplete rather than presenting local containment as remote proof.
      const remoteTransportContainment=(['outlook','resend','instantly'] as const).map((transport)=>{
        const configured=configuredTransports.includes(transport);
        const local=transportContainmentResults.find((candidate:any)=>candidate.transport===transport);
        const instantlyReceipts=Array.isArray(remotePause?.campaigns)?remotePause.campaigns:[];
        const remoteVerified=transport==='instantly'&&remotePause?.ok===true&&instantlyReceipts.length>0&&instantlyReceipts.every((receipt:any)=>String(receipt?.id||'')&&receipt?.paused===true);
        return{
          transport,
          configured,
          local_blocked:local?.ok===true,
          remote_pause_supported:transport==='instantly',
          remote_verified_paused:remoteVerified,
          evidence:{local,remote:transport==='instantly'?remotePause:null,remote_limitation:transport==='instantly'?null:'one_shot_delivery_transport_has_no_provider_wide_remote_pause_receipt'},
        };
      });
      const localContainmentBlockers=[
        ...(!localOutboundContainment.ok?['local_outbound_containment_incomplete']:[]),
        ...(!policyContainment.ok?['commercial_policy_containment_incomplete']:[]),
        ...(!discoveryContainment.ok?['discovery_containment_incomplete']:[]),
        ...(!transportContainment.ok?['local_transport_containment_incomplete']:[]),
      ];
      const transportEvidence:any=await persistEmergencyTransportContainment(svc,{control_id:String(updated.id||row.id),control_revision:nextRevision,correlation_id:correlationId,observed_at:at,observations:remoteTransportContainment,additional_blockers:localContainmentBlockers}).catch((error:any)=>({ok:false,persisted:false,containment_status:'CONTAINMENT_INCOMPLETE',blockers:[...localContainmentBlockers,'transport_evidence_persistence_failed'],transports:[],control:null,error:text(error?.code||error?.message,120)}));
      const remoteContainmentComplete=transportEvidence.ok&&transportEvidence.containment_status==='CONTAINED';
      const containmentComplete=localOutboundContainment.ok&&policyContainment.ok&&discoveryContainment.ok&&transportContainment.ok&&remoteContainmentComplete;
      const containmentIncident=!containmentComplete?await svc.entities.AutonomyIncident.create({dedupe_key:`emergency-containment-incomplete:${correlationId}`,domain:'commercial',severity:'critical',status:'open',subject_type:'EmergencyControl',subject_id:String(updated.id||row.id),summary:'Global emergency stop containment is incomplete',details_json:{correlation_id:correlationId,local_outbound_containment:localOutboundContainment,commercial_policy_containment:policyContainment,discovery_run_containment:discoveryContainment,transport_containment:transportContainment,remote_transport_containment:transportEvidence.transports,transport_evidence_persisted:transportEvidence.persisted===true,transport_evidence_error:transportEvidence.error||null,instantly_remote_pause:remotePause},first_seen_at:at,last_seen_at:at,workflow_state:'human_review',owner_type:'founder',automation_eligibility:'human_required',financial_impact_minor:0,customer_impact:'high',legal_risk:'medium'}).catch((error:any)=>safeBestEffort(error,{operation:'emergencyControlAdmin.persist_incomplete_containment_incident',fallback:null,severity:'critical'})):null;
      const result={control:controlProjection(transportEvidence.control||updated),local_containment_effective:localOutboundContainment.ok,local_outbound_containment:localOutboundContainment,commercial_policy_containment:policyContainment,discovery_run_containment:discoveryContainment,transport_containment:transportContainment,remote_transport_containment:transportEvidence.transports,transport_evidence_persisted:transportEvidence.persisted===true,containment_blockers:transportEvidence.blockers||localContainmentBlockers,instantly_remote_pause:remotePause,containment_status:containmentComplete?'CONTAINED':'CONTAINMENT_INCOMPLETE',containment_incident_id:containmentIncident?.id||null,outbound_remains_off:localOutboundContainment.ok&&transportContainment.ok,commercial_policies_paused:policyContainmentResults.filter((item:any)=>item.ok).length,commercial_policies_targeted:activePolicies.length,discovery_runs_stop_requested:discoveryContainmentResults.filter((item:any)=>item.ok).length,discovery_runs_targeted:activeDiscoveryRuns.length};
      const audit=await recordExecution(svc,user,{command_key:key,action,reason,correlation_id:correlationId,previous_state:previous,preview:stored.preview_json,result});
      return Response.json({ok:containmentComplete,action,command_key:key,correlation_id:correlationId,audit_id:audit.id,...result},{status:containmentComplete?200:503});
    }

    if(action==='resume_selected'||action==='safe_mode_off'){
      const required=action==='safe_mode_off'?CONFIRM_OFF:CONFIRM_RESUME;
      if(body.confirmation!==required)return Response.json({ok:false,error:'confirmation_required',required},{status:409});
      const stored=await previewCommand(svc,key,'resume_selected',actor);
      if(!stored)return Response.json({ok:false,error:'fresh_safe_resume_preflight_required'},{status:409});
      const selected=[...new Set((Array.isArray(body.selected_capabilities)?body.selected_capabilities:[]).map(String).filter((value:string)=>RESUMABLE_CAPABILITIES.includes(value)))];
      const preflight=await evaluateSafeResume(svc,selected);
      if(!preflight.allowed)return Response.json({ok:false,error:'safe_resume_blocked',preflight},{status:409});
      if(body.preflight_hash!==stored.preview_json?.preflight_hash||body.preflight_hash!==preflight.preflight_hash||Date.parse(stored.preview_json?.expires_at||'')<=Date.now())return Response.json({ok:false,error:'safe_resume_preflight_stale',preflight},{status:409});
      const selectedSet=new Set(selected);
      const pauseFields:any={communications:'communications_paused',negotiations:'negotiations_paused',migrations:'migrations_paused',billing_issuance:'billing_issuance_paused',paid_discovery:'paid_discovery_paused'};
      const patch:any={safe_mode:false,control_revision:Number(row.control_revision||0)+1,reason,updated_at:now(),updated_by:actor,last_correlation_id:correlationId};
      for(const capability of RESUMABLE_CAPABILITIES)patch[pauseFields[capability]]=selectedSet.has(capability)?false:true;
      patch.resume_check_required=RESUMABLE_CAPABILITIES.some((capability)=>patch[pauseFields[capability]]===true);
      const changed=await svc.entities.EmergencyControl.updateMany({id:row.id,control_revision:Number(row.control_revision||0)},{$set:patch}).catch((error:any)=>safeBestEffort(error,{operation:'emergencyControlAdmin.safe_resume_cas',fallback:null,severity:'critical'}));
      if(!updatedExactlyOne(changed))return Response.json({ok:false,error:'emergency_control_changed_concurrently'},{status:409});
      const updated=await svc.entities.EmergencyControl.get(row.id);
      const result={control:controlProjection(updated),resumed_capabilities:selected,outbound_remains_off:true,commercial_policies_remain_paused:true,no_blind_global_restart:true};
      const audit=await recordExecution(svc,user,{command_key:key,action:'resume_selected',reason,correlation_id:correlationId,previous_state:previous,selected_capabilities:selected,preview:preflight,result});
      return Response.json({ok:true,action:'resume_selected',command_key:key,correlation_id:correlationId,audit_id:audit.id,...result});
    }

    const pauseMap:any={pause_communications:'communications_paused',pause_negotiations:'negotiations_paused',pause_migrations:'migrations_paused',pause_billing_issuance:'billing_issuance_paused',pause_paid_discovery:'paid_discovery_paused'};
    if(pauseMap[action]){
      return Response.json({ok:false,error:'preview_bound_founder_control_action_required',instruction:'Use Founder Control Emergency Stop or a supported capability-specific canonical control.'},{status:409});
    }
    if(action.startsWith('resume_'))return Response.json({ok:false,error:'selective_safe_resume_preflight_required',instruction:'Call resume_preflight, review blockers, then resume_selected with the fresh hash.'},{status:409});
    return Response.json({ok:false,error:'unsupported_action'},{status:400});
  }catch(error){
    console.error('emergencyControlAdmin failed',error);
    return internalErrorResponse(error,'emergencyControlAdmin');
  }
});
