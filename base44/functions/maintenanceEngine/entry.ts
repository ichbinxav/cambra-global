import { safeBestEffort } from '../../shared/bestEffort.ts';
import{createClientFromRequest}from'npm:@base44/sdk@0.8.41';
import{requireAdminOrInternal}from'../../shared/internalGate.ts';
import{MAINTENANCE_VERSION,healthScore,isAutomatic,learningKey,remediationFor,requiresHuman,type MaintenanceSignal,type MaintenanceAction}from'../../shared/maintenanceCore.ts';
import{dispatchIncidentAlertBatch}from'../../shared/incidentAlerting.ts';
import{evaluateSchedulerEvidence}from'../../shared/schedulerRun.ts';
import{handleCostGovernanceWorker}from'../../shared/logical/costGovernanceWorker.ts';
// COMMAND-C7: the sweep that advances durable CommandRun slices. It adds no
// authority of its own; every guard lives inside advanceCommandRun.
import{sweepCommandRuns,MAX_RUNS_PER_SWEEP}from'../../shared/commandRunWorker.ts';
import{buildToolRegistry}from'../../shared/commandToolRegistry.ts';
import{CHAT_TOOLS}from'../../shared/commandToolCatalog.ts';
import{routeToolCall}from'../../shared/commandModelRouter.ts';
import{RUN_CAPS,SLICE_MAX_STEPS}from'../../shared/commandRunAdminCore.ts';
import{handleProductionReadinessWorker}from'../../shared/logical/productionReadinessWorker.ts';
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { retentionCutoff, retentionEvidenceStart, retentionEvidenceComplete } from '../../shared/retentionPolicy.ts';
import { handleDisasterRecovery } from '../../shared/disasterRecoveryRuntime.ts';
import { readIntegrationCredential } from '../../shared/integrationCredentials.ts';

const now=()=>new Date().toISOString();
const DAY=86400000,HOUR=3600000;
const activeIncident=async(s:any,key:string)=>{const r=await s.entities.AutonomyIncident.filter({dedupe_key:key,status:'open'},'-last_seen_at',1);return r?.[0]||null};
async function purgeExpiredSchedulerRuns(s:any){
 const policy=retentionCutoff('scheduler_runs');if(!policy.ok)return{ok:false,error:policy.error};
 const rows=(await s.entities.SchedulerRun.filter({started_at:{$lt:policy.cutoff},status:{$in:['COMPLETED','DUPLICATE_BLOCKED']}},'started_at',200)).filter((row:any)=>String(row.record_kind||'ATTEMPT')!=='CONTROL');
 if(!rows.length)return{ok:true,candidates:0,deleted:0};
 const start=retentionEvidenceStart({run_key:`scheduler-runs:${new Date().toISOString()}:${crypto.randomUUID()}`,policy_key:'scheduler_runs',action:'DELETE',cutoff_at:policy.cutoff,scope:'SchedulerRun terminal evidence'});
 if(!start.ok||!('row' in start))return{ok:false,error:(start as any).error||'retention_evidence_start_failed'};
 const evidence=await s.entities.RetentionExecutionEvidence.create(start.row);let deleted=0,failed=0;
 for(const row of rows){try{await s.entities.SchedulerRun.delete(row.id);deleted++}catch(error){failed++;safeBestEffort(error,{operation:'maintenanceEngine.schedulerRetention',fallback:null,severity:'secondary'})}}
 await s.entities.RetentionExecutionEvidence.update(evidence.id,retentionEvidenceComplete(start,{candidate_count:rows.length,succeeded_count:deleted,failed_count:failed,batches_processed:1}));
 return{ok:failed===0,candidates:rows.length,deleted,failed,cutoff:policy.cutoff};
}
async function upsertIncident(s:any,signal:MaintenanceSignal,action:MaintenanceAction,workflow:string='investigating'){
 const old=await activeIncident(s,signal.key),t=now();
 const row={dedupe_key:signal.key,domain:signal.domain,severity:signal.severity,status:'open',subject_type:signal.subjectType||'Platform',subject_id:signal.subjectId||'_platform',summary:signal.summary,details_json:{...(signal.details||{}),maintenance_action:action,maintenance_version:MAINTENANCE_VERSION},workflow_state:workflow,owner_type:requiresHuman(signal,action)?(signal.domain==='security'?'engineering':'founder'):'automation',automation_eligibility:requiresHuman(signal,action)?'human_required':'safe_auto',financial_impact_minor:Math.max(0,Number(signal.financialImpactMinor||0)),customer_impact:signal.customerImpact||'none',legal_risk:signal.domain==='security'?'high':'none',first_seen_at:old?.first_seen_at||t,last_seen_at:t};
 if(old){await s.entities.AutonomyIncident.update(old.id,row);return{...old,...row,id:old.id}}return s.entities.AutonomyIncident.create(row);
}
async function learn(s:any,signal:MaintenanceSignal,action:MaintenanceAction,incidentId:string,ok:boolean){
 const key=learningKey(signal,action),old=(await s.entities.RemediationKnowledge.filter({knowledge_key:key},'-last_verified_at',1).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:[],severity:'secondary'})))[0]||null,t=now(),validation=Number(old?.validation_count||0)+1,success=Number(old?.success_count||0)+(ok?1:0),failure=Number(old?.failure_count||0)+(ok?0:1),row={knowledge_key:key,domain:signal.domain,incident_type:signal.type,successful_action:action,root_cause:String(signal.details?.root_cause||old?.root_cause||'not_yet_confirmed'),validation_count:validation,success_count:success,failure_count:failure,confidence:Number((success/Math.max(1,validation)).toFixed(3)),last_verified_at:t,source_incident_ids:[...new Set([...(old?.source_incident_ids||[]),incidentId])].slice(-100),prevention_json:old?.prevention_json||{},active:true};
 if(old)await s.entities.RemediationKnowledge.update(old.id,row);else await s.entities.RemediationKnowledge.create(row);return row;
}
async function safeRepair(s:any,internal:string,signal:MaintenanceSignal,action:MaintenanceAction){
 if(!isAutomatic(action))return{attempted:false,verified:false,error:'human_authority_required'};
 try{
  if(action==='refresh_oauth'){
   const before=await s.entities.Integration.get(signal.subjectId);const r=await s.functions.invoke('oauthConnector',{mode:'refresh',integration_id:signal.subjectId,internal_secret:internal});const body=r?.data||r;if(!body?.ok)throw new Error(body?.error||'oauth_refresh_failed');const after=await s.entities.Integration.get(signal.subjectId);const verified=after?.status==='connected'&&(!after?.access_token_expires_at||Date.parse(after.access_token_expires_at)>Date.now());return{attempted:true,verified,before:{expires_at:before?.access_token_expires_at},after:{expires_at:after?.access_token_expires_at,status:after?.status},result:{ok:!!body?.ok}};
  }
  if(action==='replay_webhooks'){const before=(await s.entities.WebhookDeadLetter.filter({status:{$in:['pending_retry','exhausted']}},'-created_date',500)).length;const r=await s.functions.invoke('processWebhookDeadLetters',{limit:50,internal_secret:internal});const body=r?.data||r;const after=(await s.entities.WebhookDeadLetter.filter({status:{$in:['pending_retry','exhausted']}},'-created_date',500)).length;return{attempted:true,verified:body?.ok!==false&&after<=before,before:{backlog:before},after:{backlog:after},result:body}};
  if(action==='reconcile_billing'){const before=(await s.entities.Invoice.filter({reconciliation_status:{$in:['mismatch','error']}},'-created_date',500)).length;const r=await s.functions.invoke('reconcileRecoverBilling',{limit:50,internal_secret:internal});const body=r?.data||r;const after=(await s.entities.Invoice.filter({reconciliation_status:{$in:['mismatch','error']}},'-created_date',500)).length;return{attempted:true,verified:body?.ok!==false&&after<=before,before:{mismatches:before},after:{mismatches:after},result:body}};
  if(action==='refresh_provider_intelligence'){const r=await s.functions.invoke('intelligenceMaintenanceWorker',{internal_secret:internal});const body=r?.data||r;return{attempted:true,verified:body?.ok===true,result:body}};
  if(action==='close_stale_task'){const task=await s.entities.AgentTask.get(signal.subjectId);if(!task||task.status!=='running')return{attempted:true,verified:true,result:{already_terminal:true}};await s.entities.AgentTask.update(task.id,{status:'failed',error:'maintenance_stale_task_closed_after_6h',completed_at:now()});const after=await s.entities.AgentTask.get(task.id);return{attempted:true,verified:after?.status==='failed',result:{status:after?.status}}}
  return{attempted:false,verified:false,error:'unsupported_safe_action'};
 }catch(e){return{attempted:true,verified:false,error:String((e as Error)?.message||e).slice(0,500)}}
}

guardedScheduledServe({"worker_key":"maintenanceEngine","cadence_seconds":600,"routes":{"cost_governance":{"worker_key":"costGovernanceWorker","cadence_seconds":3600},"production_readiness":{"worker_key":"productionReadinessWorker","cadence_seconds":86400},"disaster_recovery_backup":{"worker_key":"disasterRecoveryBackup","cadence_seconds":86400},"command_run_sweep":{"worker_key":"commandRunWorker","cadence_seconds":300}}},createClientFromRequest,async req=>{const alertRequest=req.clone();const routed=await req.clone().json().catch(()=>({}));if(routed.host_action==='command_run_sweep'){
  // AUDIT SEC-01 (2026-08-17) — this branch ran with NO authentication.
  //
  // guardedScheduledServe (schedulerRun.ts:72) is `if (invocationKind(req) !== 'SCHEDULED') return
  // handler(req)`: a non-scheduled request goes straight to the handler, unauthenticated, by
  // design — because every hosted route is expected to gate itself. The three sibling routes do
  // (costGovernanceWorker:13, productionReadinessWorker:147, disasterRecoveryRuntime:306). This
  // one, added in COMMAND-C7, did not: it took asServiceRole and ran sweepCommandRuns before the
  // requireAdminOrInternal call further down the file was ever reached.
  //
  // So an unauthenticated POST of {"host_action":"command_run_sweep"} advanced up to five founder
  // CommandRuns per call, spending CAMBRA's ANTHROPIC_API_KEY/OPENAI_API_KEY through routeToolCall
  // and invoking any CHAT_TOOLS entry with service-role authority — repeatable until every run's
  // cost cap was drained, and concurrent with the real 5-minute automation because it also
  // bypassed the scheduler lease.
  //
  // Gated here, at the top of the branch, in the same shape the siblings use.
  const sweepClient = createClientFromRequest(req);
  const sweepGate = await requireAdminOrInternal(req, sweepClient, routed);
  if (!sweepGate.ok) {
    return sweepGate.response || Response.json({
      ok: false,
      error: 'authorization_failed',
      material_effects_fail_closed: true,
    }, { status: 503 });
  }
  // Service-role authority is deliberately materialized only after the
  // canonical gate has returned an affirmative verdict.
  const svc = sweepClient.asServiceRole;
  const sha=async(value:any)=>{const bytes=new TextEncoder().encode(JSON.stringify(value));const digest=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map((b)=>b.toString(16).padStart(2,'0')).join('')};
  const registry=buildToolRegistry(CHAT_TOOLS as any[]);
  const result=await sweepCommandRuns({
    svc,now:()=>new Date().toISOString(),sha256:sha,
    registry,caps:RUN_CAPS,slice_max_steps:SLICE_MAX_STEPS,maxRuns:MAX_RUNS_PER_SWEEP,
    // Routed across both providers through the C7 tool-format layer, so a swept
    // run is not pinned to one vendor. Canonical history in, canonical call out.
    callModel:async({request,history})=>{
      const canonical:any[]=[{kind:'user',text:request}];
      for(const step of history){
        canonical.push({kind:'assistant',text:'',call:{name:step.tool,input:step.input,call_id:`step-${step.index}`}});
        canonical.push({kind:'tool_result',call_id:`step-${step.index}`,tool_name:step.tool,result:step.result_summary||step.status,is_error:step.status!=='EXECUTED'});
      }
      const answer=await routeToolCall({
        svc,history:canonical,tools:CHAT_TOOLS as any[],task_class:'PLANNING',
        eventKey:`run_sweep:${crypto.randomUUID()}`,source:'commandRunWorker',
      });
      // A tool we could not parse is reported as no tool, never guessed at.
      return {text:answer.text,tool:answer.call?{name:answer.call.name,input:answer.call.input}:null};
    },
    executeTool:async({name,input})=>{
      const tool=(CHAT_TOOLS as any[]).find((row:any)=>row.name===name);
      if(!tool)return{ok:false,summary:'tool_not_found'};
      try{
        const res=await svc.functions.invoke(tool.function,{...(tool.fixed_input||{}),...input});
        const data=res?.data||res;
        if(data?.requires_confirmation)return{ok:true,ambiguous:true,summary:'requires_confirmation'};
        return{ok:data?.ok!==false,summary:String(data?.summary||data?.status||'ok').slice(0,300)};
      }catch(error:any){return{ok:false,summary:String(error?.message||'invoke_failed').slice(0,300)}}
    },
    readEmergency:async()=>{try{const rows=await svc.entities.EmergencyControl.filter({control_key:'global'},'-updated_date',1);const control=rows?.[0]||null;if(!control)return{available:false,control:null,revision:null};return{available:true,control,revision:Number(control.control_revision??0)}}catch{return{available:false,control:null,revision:null}}},
    readPermit:async(run:any)=>{const permitId=String(run?.permit_id||'').trim();if(!permitId)return{available:true,permit:null};try{const rows=await svc.entities.FounderPermit.filter({permit_id:permitId},'-created_at',1);return{available:true,permit:rows?.[0]||null}}catch{return{available:false,permit:null}}},
    autonomousEffectClasses:['read','analysis','internal_write'],
  });
  return Response.json(result);
}
if(routed.host_action==='cost_governance')return (await handleCostGovernanceWorker(req))||Response.json({ok:false,error:'cost_governance_response_missing'},{status:500});if(routed.host_action==='production_readiness')return (await handleProductionReadinessWorker(req))||Response.json({ok:false,error:'production_readiness_response_missing'},{status:500});if(routed.host_action==='disaster_recovery_backup'||String(routed.action||'').startsWith('dr_'))return (await handleDisasterRecovery(req))||Response.json({ok:false,error:'disaster_recovery_response_missing'},{status:500});const b=createClientFromRequest(req);const body=await req.json().catch(()=>({}));const gate=await requireAdminOrInternal(req,b,body);if(!gate.ok)return gate.response||Response.json({error:'forbidden'},{status:403});const s=b.asServiceRole,started=now(),run=await s.entities.MaintenanceRun.create({run_key:`maintenance:${started}`,engine_version:MAINTENANCE_VERSION,status:'running',started_at:started});try{
 const [integrations,deadLetters,tasks,pricing,invoices,securityAudits,providerStatements,schedulerRuns]=await Promise.all([
  s.entities.Integration.list('-created_date',2000),s.entities.WebhookDeadLetter.list('-created_date',1000),s.entities.AgentTask.list('-created_date',3000),s.entities.ProviderPricingVersion.list('-observed_at',2000),s.entities.Invoice.list('-created_date',3000),s.entities.SecurityAudit.list('-created_date',1000),s.entities.ProviderRevenueStatement.list('-received_at',1000),s.entities.SchedulerRun.list('-started_at',5000).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:[],severity:'secondary'}))
 ]);
 const signals:MaintenanceSignal[]=[],t=Date.now(),internal=Deno.env.get('INTERNAL_CALL_SECRET')||'',schedulerRetention=await purgeExpiredSchedulerRuns(s);
 const schedulerHealth=evaluateSchedulerEvidence(schedulerRuns,t);for(const row of schedulerHealth.rows.filter((item:any)=>item.status!=='HEALTHY'))signals.push({key:`final:scheduler:${row.worker_key}:${String(row.status).toLowerCase()}`,domain:'worker',type:`scheduler_${String(row.status).toLowerCase()}`,severity:row.status==='FAILED'?'critical':'warning',subjectType:'SchedulerRun',subjectId:row.worker_key,summary:`GO-critical scheduler ${row.worker_key} is ${row.status}`,customerImpact:row.status==='FAILED'?'high':'medium',details:{status:row.status,cadence_seconds:row.cadence_seconds,age_seconds:row.age_seconds,duplicate_executions:row.duplicate_executions,responsibility:row.responsibility,root_cause:'runtime_scheduler_evidence_not_healthy'}});
 const docMaintenance=await s.functions.invoke('documentationMaintenanceWorker',{internal_secret:internal}).catch((e:any)=>({data:{ok:false,error:String(e?.message||e)}}));const docBody=docMaintenance?.data||docMaintenance;if(docBody?.ok===false)signals.push({key:'p18:documentation_maintenance_failed',domain:'documentation',type:'documentation_maintenance_failed',severity:'warning',subjectType:'DocumentationHealthAssessment',subjectId:'_platform',summary:'Living Documentation maintenance failed and requires investigation',details:{error:String(docBody?.error||'unknown').slice(0,300)}});
 for(const i of integrations){
  if(i.status==='connected'&&i.access_token_expires_at&&Date.parse(i.access_token_expires_at)<t-5*60000){
   try{const credential=await readIntegrationCredential(s,{integration_id:i.id,brand_id:i.brand_id});if(credential.encrypted_refresh_token)signals.push({key:`p17:oauth_expired:${i.id}`,domain:'integration',type:'oauth_token_expired',severity:'warning',subjectType:'Integration',subjectId:i.id,summary:`OAuth token expired for ${i.provider}`,customerImpact:'medium',details:{provider:i.provider,brand_id:i.brand_id,expired_at:i.access_token_expires_at}})}
   catch{signals.push({key:`p17:credential_authority:${i.id}`,domain:'integration',type:'integration_credential_authority_unavailable',severity:'warning',subjectType:'Integration',subjectId:i.id,summary:`Credential authority unavailable for ${i.provider}`,customerImpact:'medium',details:{provider:i.provider,brand_id:i.brand_id,credential_boundary:'fail_closed'}})}
  }
  if(i.status==='error')signals.push({key:`p17:integration_error:${i.id}`,domain:'integration',type:'external_api_or_integration_error',severity:'warning',subjectType:'Integration',subjectId:i.id,summary:`Integration ${i.provider} is in error state`,customerImpact:'medium',details:{provider:i.provider,brand_id:i.brand_id,last_error_present:Boolean(i.last_error)}})
 }
 const retryBacklog=deadLetters.filter((x:any)=>['pending_retry','exhausted'].includes(x.status));if(retryBacklog.length)signals.push({key:'p17:webhook_retry_backlog',domain:'webhook',type:'webhook_retry_backlog',severity:retryBacklog.some((x:any)=>x.status==='exhausted')?'critical':'warning',subjectType:'WebhookDeadLetter',subjectId:'_backlog',summary:`${retryBacklog.length} webhook dead-letter item(s) require recovery`,customerImpact:'medium',details:{count:retryBacklog.length,exhausted:retryBacklog.filter((x:any)=>x.status==='exhausted').length}});
 for(const x of tasks.filter((x:any)=>x.status==='running'&&t-Date.parse(x.started_at||x.created_date||'')>6*HOUR))signals.push({key:`p17:stuck_task:${x.id}`,domain:'worker',type:'agent_task_stuck',severity:'warning',subjectType:'AgentTask',subjectId:x.id,summary:`Agent task ${x.agent_name||x.id} has been running for >6h`,details:{agent_name:x.agent_name,task_type:x.task_type,started_at:x.started_at}});
 const recent=tasks.filter((x:any)=>t-Date.parse(x.created_date||x.started_at||'')<7*DAY);const byAgent=new Map<string,any[]>();for(const x of recent){const k=String(x.agent_name||'unknown');byAgent.set(k,[...(byAgent.get(k)||[]),x])}for(const[a,rows]of byAgent){const last=rows.slice(0,5),failed=last.filter((x:any)=>x.status==='failed').length;if(last.length>=3&&failed/last.length>=.8)signals.push({key:`p17:agent_degraded:${a}`,domain:'worker',type:'agent_degraded',severity:failed===last.length?'critical':'warning',subjectType:'AgentTask',subjectId:a,summary:`Agent ${a} is degraded (${failed}/${last.length} recent runs failed)`,details:{agent_name:a,failed,recent:last.length}})}
 for(const p of pricing.filter((x:any)=>x.truth_level==='verified_official'&&x.knowledge_state==='active'&&t-Date.parse(x.observed_at||'')>90*DAY))signals.push({key:`p17:pricing_stale:${p.id}`,domain:'intelligence',type:'provider_pricing_stale',severity:'warning',subjectType:'ProviderPricingVersion',subjectId:p.id,summary:`Verified provider pricing is stale: ${p.provider_slug}`,details:{provider_slug:p.provider_slug,country:p.country,observed_at:p.observed_at}});
 const mismatch=invoices.filter((x:any)=>['mismatch','error'].includes(x.reconciliation_status));if(mismatch.length)signals.push({key:'p17:billing_reconciliation_error',domain:'billing',type:'billing_reconciliation_error',severity:mismatch.some((x:any)=>x.reconciliation_status==='mismatch')?'critical':'warning',subjectType:'Invoice',subjectId:'_reconciliation',summary:`${mismatch.length} Recover invoice(s) have reconciliation mismatch/error`,financialImpactMinor:Math.round(mismatch.reduce((a:number,x:any)=>a+Math.max(0,Number(x.balance_due||0))*100,0)),customerImpact:'high',details:{invoice_ids:mismatch.map((x:any)=>x.id).slice(0,50)}});
 for(const st of providerStatements.filter((x:any)=>x.status==='mismatch'))signals.push({key:`p17:provider_revenue_mismatch:${st.id}`,domain:'billing',type:'provider_revenue_mismatch',severity:'warning',subjectType:'ProviderRevenueStatement',subjectId:st.id,summary:'Provider revenue statement mismatch requires deterministic reconciliation',details:{provider_id:st.provider_id,period:st.period}});
 const recentSecurityFailures=securityAudits.filter((x:any)=>x.success===false&&t-Date.parse(x.created_date||'')<24*HOUR);if(recentSecurityFailures.length>=3)signals.push({key:'p17:security_repeated_failures',domain:'security',type:'security_anomaly',severity:'critical',subjectType:'SecurityAudit',subjectId:'_platform',summary:`${recentSecurityFailures.length} security audit failures observed in 24h`,details:{count:recentSecurityFailures.length,connectors:[...new Set(recentSecurityFailures.map((x:any)=>x.connector))]}});
 const reservoir=(await s.entities.LeadReservoirSnapshot.list('-captured_at',2).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:[],severity:'secondary'})))[0]||null;if(!reservoir||t-Date.parse(reservoir.captured_at||'')>3*HOUR)signals.push({key:'p19:lead_discovery_worker_stale',domain:'worker',type:'lead_discovery_worker_stopped',severity:'warning',subjectType:'LeadReservoirSnapshot',subjectId:reservoir?.id||'_missing',summary:'Always-on lead discovery has no fresh reservoir snapshot',details:{last_snapshot_at:reservoir?.captured_at||null}});if(reservoir?.coverage_status==='LOW')signals.push({key:'p19:qualified_reservoir_low',domain:'worker',type:'qualified_reservoir_low',severity:'warning',subjectType:'LeadReservoirSnapshot',subjectId:reservoir.id,summary:`Qualified lead reservoir coverage is low (${reservoir.coverage_days} days)`,details:{coverage_days:reservoir.coverage_days,target_coverage_days:reservoir.target_coverage_days,outreach_ready:reservoir.outreach_ready,safe_daily_send_capacity:reservoir.safe_daily_send_capacity}});if(Number(reservoir?.stale||0)>Math.max(25,Number(reservoir?.outreach_ready||0)))signals.push({key:'p19:lead_staleness_high',domain:'intelligence',type:'lead_staleness_high',severity:'warning',subjectType:'LeadReservoirSnapshot',subjectId:reservoir.id,summary:'Stale lead inventory is elevated',details:{stale:reservoir.stale,outreach_ready:reservoir.outreach_ready}});
 const orphanLogs=await s.entities.OperationalLog.filter({event_type:'outlook_inbound_unroutable',created_at:{$gte:new Date(t-24*HOUR).toISOString()}},'-created_at',200).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:[],severity:'secondary'}));if(orphanLogs.length>=3)signals.push({key:'final:outlook_orphan_inbound_spike',domain:'webhook',type:'outlook_orphan_inbound_spike',severity:orphanLogs.length>=10?'critical':'warning',subjectType:'OperationalLog',subjectId:'_outlook',summary:`${orphanLogs.length} Outlook inbound message(s) were unroutable in 24h`,customerImpact:'medium',details:{count:orphanLogs.length,log_ids:orphanLogs.map((x:any)=>x.id).slice(0,30),root_cause:'thread_mapping_requires_review'}});const missingInfo=await s.entities.MerchantInformationRequest.filter({state:{$in:['merchant_input_required','validation_required','unresolvable']}},'-requested_at',500).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:[],severity:'secondary'}));const dead=missingInfo.filter((x:any)=>x.state==='unresolvable'||(x.next_retry_at&&Date.parse(x.next_retry_at)<t-72*HOUR));if(dead.length)signals.push({key:'final:missing_information_dead_end',domain:'worker',type:'missing_information_dead_end',severity:'warning',subjectType:'MerchantInformationRequest',subjectId:'_backlog',summary:`${dead.length} missing-information request(s) need exception handling`,details:{request_ids:dead.map((x:any)=>x.id).slice(0,50)}});
 const results:any[]=[];let automatic=0,verified=0,failed=0,escalations=0,learned=0;
 for(const signal of signals){const action=remediationFor(signal),human=requiresHuman(signal,action);const incident=await upsertIncident(s,signal,action,human?'human_review':'auto_resolution');if(human){escalations++;if(action==='developer_investigation'||signal.severity==='critical'&&signal.domain!=='billing'&&signal.domain!=='security'){await s.functions.invoke('developerSignalWorker',{incident_id:incident.id,internal_secret:internal}).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:null,severity:'secondary'}))}results.push({signal,action,status:'escalated',incident_id:incident.id});continue}
  automatic++;const repair=await safeRepair(s,internal,signal,action);if(repair.verified){verified++;await s.entities.AutonomyIncident.update(incident.id,{status:'resolved',workflow_state:'resolved',resolved_at:now(),root_cause:String(signal.details?.root_cause||'automatic_diagnosis'),actions_taken_json:[{at:now(),action,verified:true}],recovery_json:{action,verified:true,evidence:repair},prevention_json:{reuse_validated_remediation:true}});await learn(s,signal,action,incident.id,true);learned++;results.push({signal,action,status:'repaired_verified',incident_id:incident.id,evidence:repair})}else{failed++;escalations++;await s.entities.AutonomyIncident.update(incident.id,{workflow_state:'human_review',owner_type:signal.domain==='billing'?'finance':'engineering',automation_eligibility:'human_required',actions_taken_json:[{at:now(),action,verified:false,error:repair.error||null}],recovery_json:{action,verified:false,evidence:repair}});await learn(s,signal,action,incident.id,false);learned++;if(['worker','integration','webhook','intelligence'].includes(signal.domain))await s.functions.invoke('developerSignalWorker',{incident_id:incident.id,internal_secret:internal}).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:null,severity:'secondary'}));results.push({signal,action,status:'repair_failed_escalated',incident_id:incident.id,evidence:repair})}}
 const alertBatch=await dispatchIncidentAlertBatch(s,alertRequest);
 const critical=signals.filter(x=>x.severity==='critical').length,warning=signals.length-critical,score=healthScore({critical,warning,stale:signals.filter(x=>x.type.includes('stale')).length,failedRepairs:failed}),completed=now(),summary={health_score:score,signals:signals.length,critical,warning,automatic_repairs:automatic,repairs_verified:verified,repairs_failed:failed,escalations,learning_updates:learned,scheduler_retention:schedulerRetention,scheduler_health:{active:schedulerHealth.active,no_duplicate_execution:schedulerHealth.no_duplicate_execution,missing_or_stale:schedulerHealth.missing_or_stale,duplicate_workers:schedulerHealth.duplicate_workers},external_alerts:{mode:'AGGREGATED_15_MINUTE_WINDOW',eligible:Number(alertBatch?.eligible_count||0),status:String(alertBatch?.status||'UNKNOWN'),delivery_id:alertBatch?.delivery_id||null,provider_effects:Number(alertBatch?.provider_effects||0),accepted:alertBatch?.status==='ACCEPTED'?1:0,observed:alertBatch?.status==='OBSERVED'?1:0,review_required:alertBatch?.status==='REVIEW_REQUIRED'?1:0,blocked:['BLOCKED','CONFIGURATION_REQUIRED','COOLDOWN'].includes(String(alertBatch?.status||''))?1:0,incident_ids:Array.isArray(alertBatch?.incident_ids)?alertBatch.incident_ids:[],delivery_semantics:'ACCEPTED is not DELIVERED; OBSERVED requires receipt/reconciliation'},guarantees:{material_domains_never_auto_repaired:true,financial_state_remains_deterministic:true,developer_code_changes_remain_approval_gated:true,incident_alerts_do_not_bypass_emergency_or_outbound_containment:true}};
 await s.entities.MaintenanceRun.update(run.id,{status:failed?'degraded':'completed',completed_at:completed,health_score:score,signals_detected:signals.length,automatic_repairs:automatic,repairs_verified:verified,repairs_failed:failed,escalations,learning_updates:learned,summary_json:summary,evidence_json:{results:results.slice(0,200)}});
 return Response.json({ok:true,run_id:run.id,engine_version:MAINTENANCE_VERSION,...summary,results});
}catch(e){await s.entities.MaintenanceRun.update(run.id,{status:'failed',completed_at:now(),summary_json:{error:String((e as Error)?.message||e).slice(0,500)}}).catch((error:any)=>safeBestEffort(error,{operation:'maintenanceEngine',fallback:null,severity:'secondary'}));return internalErrorResponse(e, 'maintenanceEngine');}});
