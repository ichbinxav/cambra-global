import { commercialTimezone, computeInboundReplySchedule, normalizeEmail, policyIsActive, sanitizeExternalText } from './commercialAutonomy.ts';
import { InstantlyInboundConversationProvider } from './inboundConversationProvider.ts';
import { instantlyEventKey } from './outboundProvider.ts';

export const OUTBOUND_EVENT_PROCESSOR_VERSION='outbound-provider-event-1.1.0';
const MAX_ATTEMPTS=5;
const RETRY_MINUTES=[1,5,15,60,240];
const PROCESSING_LEASE_MS=10*60_000;
const REPLY_EVENTS=new Set(['reply_received']);
const SUPPRESSION_REASON:Record<string,string>={
  email_bounced:'bounce',lead_unsubscribed:'opt_out',lead_not_interested:'not_interested',lead_wrong_person:'wrong_person',
};

type EventMutationOutcome='updated'|'conflict'|'authority_unavailable'|'authority_ambiguous';

function processorError(code:string,status=503,details:Record<string,unknown>={}){
  return Object.assign(new Error(code.toLowerCase()),{code,status,review_required:status>=500,...details});
}

async function readRows(operation:string,read:()=>Promise<any>){
  let rows:any;
  try{rows=await read();}catch(cause){throw processorError(`${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,503,{cause});}
  if(!Array.isArray(rows))throw processorError(`${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,503);
  return rows;
}

async function readValue(operation:string,read:()=>Promise<any>){
  try{return await read();}catch(cause){throw processorError(`${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,503,{cause});}
}

async function writeValue(operation:string,write:()=>Promise<any>,requireValue=true){
  let value:any;
  try{value=await write();}catch(cause){throw processorError(`${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,503,{cause});}
  if(requireValue&&!value)throw processorError(`${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,503);
  return value;
}

function eventMutationOutcome(result:any):EventMutationOutcome{
  if(!result||typeof result!=='object')return 'authority_unavailable';
  const explicitStatuses=['success','ok']
    .filter((key)=>Object.prototype.hasOwnProperty.call(result,key))
    .map((key)=>result[key]);
  if(explicitStatuses.some((value)=>value!==true))return 'authority_ambiguous';
  const counts=[result.updated,result.modified_count,result.matched_count]
    .filter((value)=>value!==undefined&&value!==null)
    .map(Number);
  if(!counts.length||counts.some((value)=>!Number.isInteger(value)||value<0))return 'authority_unavailable';
  if(new Set(counts).size>1)return 'authority_ambiguous';
  if(counts[0]===1)return 'updated';
  if(counts[0]===0)return 'conflict';
  return 'authority_ambiguous';
}

async function mutateEvent(svc:any,operation:string,filter:Record<string,unknown>,patch:Record<string,unknown>){
  let result:any;
  try{result=await svc.entities.OutboundProviderEvent.updateMany(filter,{$set:patch});}
  catch(cause){throw processorError(`${operation.toUpperCase()}_AUTHORITY_UNAVAILABLE`,503,{cause});}
  const outcome=eventMutationOutcome(result);
  if(outcome==='authority_unavailable'||outcome==='authority_ambiguous'){
    throw processorError(`${operation.toUpperCase()}_${outcome.toUpperCase()}`,503);
  }
  return outcome;
}

function eventClaimFilter(row:any){
  return {
    id:row.id,
    event_key:row.event_key,
    status:row.status,
    attempts:Number(row.attempts||0),
  };
}

function threadHasExactTenantBinding(thread:any){
  const scope=String(thread?.tenant_scope||'');
  const brandId=String(thread?.brand_id||'');
  if(thread?.tenant_resolution_status==='REVIEW_REQUIRED')return false;
  if(scope==='platform')return brandId==='_platform';
  if(scope==='tenant')return Boolean(brandId&&brandId!=='_platform');
  return false;
}

function threadMatchesProviderEvent(thread:any,event:any){
  if(!thread||thread.external_provider!=='instantly'||!threadHasExactTenantBinding(thread))return false;
  if(event.workspace_id&&String(thread.external_workspace_id||'')!==String(event.workspace_id))return false;
  if(event.campaign_id&&String(thread.external_campaign_id||'')!==String(event.campaign_id))return false;
  if(event.lead_email&&normalizeEmail(thread.counterparty_email)!==normalizeEmail(event.lead_email))return false;
  return true;
}

function exactThreadOrThrow(rows:any[],event:any){
  const exact=rows.filter((row:any)=>threadMatchesProviderEvent(row,event));
  if(exact.length>1)throw processorError('THREAD_RESOLUTION_AMBIGUOUS',409,{review_required:true,match_count:exact.length});
  return exact[0]||null;
}

async function resolveThread(svc:any,event:any){
  if(event.message_id){
    const messages=await readRows('thread_message_lookup',()=>svc.entities.CommunicationMessage.filter({provider:'instantly',provider_message_id:event.message_id},'-created_date',5));
    const threadIds=[...new Set(messages.map((message:any)=>String(message.thread_id||'')).filter(Boolean))];
    if(messages.length&&!threadIds.length)throw processorError('THREAD_MESSAGE_BINDING_INVALID',409,{review_required:true});
    const candidates=[];
    for(const threadId of threadIds){
      const candidate=await readValue('thread_read',()=>svc.entities.CommunicationThread.get(threadId));
      if(candidate)candidates.push(candidate);
    }
    if(candidates.length!==threadIds.length)throw processorError('THREAD_MESSAGE_BINDING_UNRESOLVED',409,{review_required:true});
    const exact=exactThreadOrThrow(candidates,event);
    if(exact)return exact;
    if(messages.length)throw processorError('THREAD_PROVIDER_BINDING_CONFLICT',409,{review_required:true});
  }
  if(event.campaign_id&&event.lead_email){
    const candidates=await readRows('thread_exact_lookup',()=>svc.entities.CommunicationThread.filter({external_provider:'instantly',external_campaign_id:event.campaign_id,counterparty_email:event.lead_email},'-last_message_at',10));
    const exact=exactThreadOrThrow(candidates,event);
    if(!exact&&candidates.length)throw processorError('THREAD_PROVIDER_BINDING_CONFLICT',409,{review_required:true});
    return exact;
  }
  return null;
}

async function suppress(svc:any,thread:any,event:any,reason:string,sourceMessageId=''){
  const email=normalizeEmail(event.lead_email||thread?.counterparty_email);
  if(!email)throw processorError('SUPPRESSION_TARGET_UNRESOLVED',409,{review_required:true});
  const existing=await readRows('suppression_lookup',()=>svc.entities.ContactSuppression.filter({email,active:true},'-created_date',2));
  if(existing.length>1)throw processorError('SUPPRESSION_AUTHORITY_AMBIGUOUS',409,{review_required:true});
  if(!existing[0])await writeValue('suppression_create',()=>svc.entities.ContactSuppression.create({email,reason,source:'instantly',source_message_id:sourceMessageId||event.message_id||'',active:true,suppressed_at:new Date().toISOString()}),true);
  if(thread){
    if(!threadMatchesProviderEvent(thread,event))throw processorError('SUPPRESSION_THREAD_BINDING_MISMATCH',409,{review_required:true});
    await writeValue('suppression_thread_update',()=>svc.entities.CommunicationThread.update(thread.id,{status:'suppressed',automation_paused:true,pause_reason:reason}));
  }
  await writeValue('suppression_audit_ledger',()=>svc.entities.OperationalLog.create({event_type:'suppression_lifecycle_event',message:event.event_type,data_json:{provider:'instantly',event_type:event.event_type,suppression_reason:reason,thread_id:thread?.id||null,signature_verified:true},actor_email:'instantly_webhook',created_at:new Date().toISOString()}),true);
}

async function updateSentMessage(svc:any,thread:any,event:any){
  if(!thread)return {handled:false,reason:'thread_not_found'};
  const candidates=await readRows('sent_message_lookup',()=>svc.entities.CommunicationMessage.filter({thread_id:thread.id,direction:'outbound',provider:'instantly'},'-created_date',25));
  const message=candidates.find((row:any)=>row.send_status==='scheduled'&&(!event.email_account||normalizeEmail(row.from_email)===event.email_account))||candidates[0]||null;
  if(!message)return {handled:false,reason:'outbound_message_not_found'};
  await writeValue('sent_message_update',()=>svc.entities.CommunicationMessage.update(message.id,{provider_message_id:event.message_id||message.provider_message_id||'',send_status:'sent',actual_sent_at:event.timestamp,raw_event_json:{...(message.raw_event_json||{}),last_provider_event:event.event_type,last_provider_event_at:event.timestamp}}));
  await writeValue('sent_thread_update',()=>svc.entities.CommunicationThread.update(thread.id,{last_outbound_at:event.timestamp,last_message_at:event.timestamp,status:'awaiting_counterparty',external_provider:'instantly',external_workspace_id:event.workspace_id||thread.external_workspace_id||'',external_campaign_id:event.campaign_id||thread.external_campaign_id||''}));
  if(thread.lead_id)await writeValue('sent_lead_update',()=>svc.entities.OutboundLead.update(thread.lead_id,{stage:'contacted',revenue_stage:'contacted',reservoir_state:'queued',next_action:'Await reply; governed follow-up remains policy-controlled'}));
  return {handled:true,message_id:message.id};
}

async function storeInboundReply(svc:any,thread:any,event:any,raw:any){
  if(!thread)throw Object.assign(new Error('instantly_thread_unresolved'),{code:'INSTANTLY_THREAD_UNRESOLVED'});
  const duplicate=event.message_id?await readRows('inbound_idempotency_lookup',()=>svc.entities.CommunicationMessage.filter({provider:'instantly',provider_message_id:event.message_id,direction:'inbound'},'-created_date',2)):[];
  if(duplicate.length>1)throw processorError('INBOUND_IDEMPOTENCY_AUTHORITY_AMBIGUOUS',409,{review_required:true});
  if(duplicate[0])return {message:duplicate[0],duplicate:true};
  if(!thread.policy_key||!thread.policy_version)throw processorError('INBOUND_POLICY_BINDING_REQUIRED',409,{review_required:true});
  const policies=await readRows('inbound_policy_lookup',()=>svc.entities.CommercialPolicy.filter({policy_key:thread.policy_key,status:'active'},'-created_date',20));
  const exact=policies.filter((row:any)=>row.version===thread.policy_version&&policyIsActive(row));
  if(exact.length!==1)throw processorError(exact.length?'INBOUND_POLICY_AUTHORITY_AMBIGUOUS':'INBOUND_POLICY_UNRESOLVED',409,{review_required:true});
  const policy=exact[0];
  const timing=computeInboundReplySchedule(event.timestamp,policy,event.message_id||event.timestamp,commercialTimezone(thread,policy));
  const message=await writeValue('inbound_message_create',()=>svc.entities.CommunicationMessage.create({
    thread_id:thread.id,direction:'inbound',channel:'email',provider:'instantly',provider_message_id:event.message_id||'',
    from_email:event.lead_email,to_emails:event.email_account?[event.email_account]:[],subject:sanitizeExternalText(event.subject,300),
    text_body:sanitizeExternalText(event.text,16000),html_body:sanitizeExternalText(event.html,30000),headers_json:{email_account:event.email_account,unibox_url:event.unibox_url},
    send_status:'received',received_at:event.timestamp,earliest_reply_at:timing.earliest_reply_at,scheduled_send_at:timing.scheduled_send_at,
    raw_event_json:{provider_event:raw,normalized_event:event,processor_version:OUTBOUND_EVENT_PROCESSOR_VERSION},
  }),true);
  await writeValue('inbound_thread_update',()=>svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',last_inbound_at:event.timestamp,last_message_at:event.timestamp,next_action_at:timing.scheduled_send_at,counterparty_email:event.lead_email||thread.counterparty_email,external_provider:'instantly',external_workspace_id:event.workspace_id||thread.external_workspace_id||'',external_campaign_id:event.campaign_id||thread.external_campaign_id||''}));
  return {message,duplicate:false};
}

async function handleEvent(svc:any,event:any,raw:any){
  const thread=await resolveThread(svc,event);
  if(event.event_type==='email_sent')return {...await updateSentMessage(svc,thread,event),thread};
  if(event.event_type==='email_bounced'&&thread){
    const messages=await readRows('bounce_message_lookup',()=>svc.entities.CommunicationMessage.filter({thread_id:thread.id,direction:'outbound',provider:'instantly'},'-created_date',10));
    const message=messages.find((row:any)=>row.provider_message_id===event.message_id)||messages[0];
    if(message)await writeValue('bounce_message_update',()=>svc.entities.CommunicationMessage.update(message.id,{send_status:'bounced',raw_event_json:{...(message.raw_event_json||{}),last_provider_event:event.event_type,last_provider_event_at:event.timestamp}}));
  }
  if(SUPPRESSION_REASON[event.event_type]){
    await suppress(svc,thread,event,SUPPRESSION_REASON[event.event_type]);
    return {handled:true,thread,suppressed:true};
  }
  if(REPLY_EVENTS.has(event.event_type)){
    const stored=await storeInboundReply(svc,thread,event,raw);
    if(!stored.duplicate){
      const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';
      const invoked=await svc.functions.invoke('commercialReplyAgent',{thread_id:thread.id,message_id:stored.message.id,internal_secret:internal}).catch((error:any)=>({data:{ok:false,error:String(error?.message||error)}}));
      return {handled:true,thread,message_id:stored.message.id,reply_processing:invoked?.data||invoked};
    }
    return {handled:true,thread,message_id:stored.message.id,duplicate_message:true};
  }
  if(event.event_type==='lead_out_of_office'){
    if(!thread)throw Object.assign(new Error('instantly_thread_unresolved'),{code:'INSTANTLY_THREAD_UNRESOLVED'});
    await writeValue('out_of_office_thread_update',()=>svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_counterparty',conversation_state:'WAITING_COUNTERPARTY',automation_paused:false,pause_reason:'out_of_office',next_action_at:new Date(Date.now()+7*86400000).toISOString()}));
    return {handled:true,thread,waiting:true};
  }
  if(['lead_interested','lead_meeting_booked','lead_meeting_completed','lead_closed','lead_no_show','lead_neutral'].includes(event.event_type)){
    if(!thread)throw Object.assign(new Error('instantly_thread_unresolved'),{code:'INSTANTLY_THREAD_UNRESOLVED'});
    const patch:any={classification:event.event_type.replace(/^lead_/,''),last_message_at:event.timestamp};
    if(event.event_type==='lead_interested')patch.current_intent='QUALIFY';
    if(event.event_type==='lead_meeting_booked')Object.assign(patch,{meeting_status:'booked',conversation_state:'MEETING_BOOKED',automation_paused:true,pause_reason:'meeting_booked'});
    if(event.event_type==='lead_meeting_completed')Object.assign(patch,{meeting_status:'completed',conversation_state:'MEETING_COMPLETED'});
    if(event.event_type==='lead_no_show')Object.assign(patch,{meeting_status:'no_show',automation_paused:true,pause_reason:'meeting_no_show_review'});
    if(event.event_type==='lead_closed')Object.assign(patch,{status:'closed',conversation_state:'CLOSED_WON',automation_paused:true,pause_reason:'provider_marked_closed'});
    await writeValue('provider_classification_thread_update',()=>svc.entities.CommunicationThread.update(thread.id,patch));
    return {handled:true,thread};
  }
  if(event.event_type==='account_error'){
    const profiles=await readRows('instantly_profile_lookup',()=>svc.entities.OutboundSendingProfile.filter({provider:'instantly'},'-created_date',100));
    for(const profile of profiles)await writeValue('instantly_profile_pause',()=>svc.entities.OutboundSendingProfile.update(profile.id,{status:'paused',last_provider_health_at:new Date().toISOString(),notes:`Paused automatically after Instantly account_error at ${event.timestamp}`}));
    const controls=await readRows('instantly_control_lookup',()=>svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',2));
    if(controls.length!==1)throw processorError(controls.length?'INSTANTLY_OUTBOUND_CONTROL_AMBIGUOUS':'INSTANTLY_OUTBOUND_CONTROL_UNRESOLVED',409,{review_required:true});
    await writeValue('instantly_control_pause',()=>svc.entities.OutboundControl.update(controls[0].id,{instantly_enabled:false,paused_reason:'instantly_account_error'}));
    const states=await readRows('instantly_provider_state_lookup',()=>svc.entities.CommercialProviderState.filter({provider_key:'instantly',role:'outbound'},'-last_checked_at',2));
    if(states.length>1)throw processorError('INSTANTLY_PROVIDER_STATE_AMBIGUOUS',409,{review_required:true});
    const state={provider_key:'instantly',role:'outbound',status:'ERROR',api_version:'v2',secret_present:Boolean(Deno.env.get('INSTANTLY_API_KEY')),auth_test_pass:false,last_checked_at:new Date().toISOString(),last_error_code:'ACCOUNT_ERROR'};
    if(states[0])await writeValue('instantly_provider_state_update',()=>svc.entities.CommercialProviderState.update(states[0].id,state));
    else await writeValue('instantly_provider_state_create',()=>svc.entities.CommercialProviderState.create(state),true);
    return {handled:true,thread,provider_paused:true};
  }
  return {handled:false,thread,reason:'event_type_not_actionable'};
}

export async function processInstantlyProviderEvent(svc:any,raw:any,existingRow:any=null){
  const adapter=new InstantlyInboundConversationProvider();
  const event=adapter.normalize(raw);
  const validation=adapter.validate(event);
  if(!validation.ok)throw Object.assign(new Error(validation.reason||'invalid_provider_event'),{code:'INVALID_PROVIDER_EVENT',status:400});
  const eventKey=existingRow?.event_key||await instantlyEventKey(raw);
  let row=existingRow
    ?await readValue('event_ledger_row_read',()=>svc.entities.OutboundProviderEvent.get(existingRow.id))
    :null;
  if(existingRow&&(!row||row.event_key!==eventKey))throw processorError('EVENT_LEDGER_ROW_UNRESOLVED',503);
  if(!row){
    let peers=await readRows('event_idempotency_lookup',()=>svc.entities.OutboundProviderEvent.filter({event_key:eventKey},'first_received_at',10));
    if(!peers.length){
      const created=await writeValue('event_ledger_create',()=>svc.entities.OutboundProviderEvent.create({event_key:eventKey,provider:'instantly',event_type:event.event_type,external_workspace_id:event.workspace_id,external_campaign_id:event.campaign_id,external_message_id:event.message_id,lead_email:event.lead_email,raw_event_json:raw,normalized_event_json:event,status:'RECEIVED',attempts:0,first_received_at:new Date().toISOString()}),true);
      peers=await readRows('event_ledger_create_confirmation',()=>svc.entities.OutboundProviderEvent.filter({event_key:eventKey},'first_received_at',10));
      if(!peers.some((candidate:any)=>candidate.id===created.id))throw processorError('EVENT_LEDGER_CREATE_UNCONFIRMED',503);
    }
    const ordered=[...peers].sort((a:any,b:any)=>String(a.first_received_at||a.created_date||'').localeCompare(String(b.first_received_at||b.created_date||''))||String(a.id).localeCompare(String(b.id)));
    row=ordered[0]||null;
    if(!row)throw processorError('EVENT_LEDGER_WINNER_UNRESOLVED',503);
    for(const duplicate of ordered.slice(1)){
      if(['PROCESSED','IGNORED','DEAD_LETTER'].includes(duplicate.status))continue;
      const quarantined=await mutateEvent(svc,'event_dedupe_quarantine',eventClaimFilter(duplicate),{status:'IGNORED',processed_at:new Date().toISOString(),last_error_code:'DUPLICATE_EVENT_LEDGER_ROW'});
      if(quarantined!=='updated')throw processorError('EVENT_DEDUPE_CLAIM_CONFLICT',503,{duplicate_event_id:duplicate.id});
    }
  }
  if(['PROCESSED','IGNORED','DEAD_LETTER'].includes(row.status))return {ok:true,duplicate:true,terminal:row.status==='DEAD_LETTER',event_key:eventKey,status:row.status};
  if(row.status==='PROCESSING'){
    const started=Date.parse(String(row.last_attempt_at||''));
    if(Number.isFinite(started)&&Date.now()-started<PROCESSING_LEASE_MS)return {ok:true,duplicate:true,processing:true,event_key:eventKey,status:'PROCESSING'};
  }
  if(row.status==='PENDING_RETRY'&&!existingRow)return {ok:true,duplicate:true,queued_retry:true,event_key:eventKey,status:'PENDING_RETRY',next_retry_at:row.next_retry_at||null};
  if(!['RECEIVED','PENDING_RETRY','PROCESSING'].includes(row.status))throw processorError('EVENT_LEDGER_STATE_UNRECOGNIZED',503,{ledger_status:row.status});
  const attempts=Number(row.attempts||0)+1;
  const lastAttemptAt=new Date().toISOString();
  const claimed=await mutateEvent(svc,'event_processing_claim',eventClaimFilter(row),{status:'PROCESSING',attempts,last_attempt_at:lastAttemptAt,next_retry_at:null,last_error_code:''});
  if(claimed!=='updated'){
    const current=await readValue('event_claim_conflict_read',()=>svc.entities.OutboundProviderEvent.get(row.id));
    if(current&&['PROCESSED','IGNORED','DEAD_LETTER'].includes(current.status))return {ok:true,duplicate:true,terminal:current.status==='DEAD_LETTER',event_key:eventKey,status:current.status};
    if(current?.status==='PROCESSING'&&Number(current.attempts||0)>=attempts)return {ok:true,duplicate:true,processing:true,event_key:eventKey,status:'PROCESSING'};
    throw processorError('EVENT_PROCESSING_CLAIM_CONFLICT',503,{review_required:true});
  }
  row={...row,status:'PROCESSING',attempts,last_attempt_at:lastAttemptAt,next_retry_at:null,last_error_code:''};
  let result:any;
  try{
    result=await handleEvent(svc,event,raw);
  }catch(error:any){
    const terminal=attempts>=MAX_ATTEMPTS;
    const nextRetry=new Date(Date.now()+RETRY_MINUTES[Math.min(attempts-1,RETRY_MINUTES.length-1)]*60000).toISOString();
    const errorCode=String(error?.code||error?.message||'PROVIDER_EVENT_FAILED').slice(0,160);
    try{
      const finalized=await mutateEvent(svc,'event_failure_finalization',{id:row.id,event_key:eventKey,status:'PROCESSING',attempts},{status:terminal?'DEAD_LETTER':'PENDING_RETRY',next_retry_at:terminal?null:nextRetry,last_error_code:errorCode});
      if(finalized!=='updated')return {ok:false,queued_retry:false,dead_letter:false,review_required:true,ambiguous_effect:true,event_key:eventKey,error:'EVENT_FAILURE_FINALIZATION_CONFLICT',cause:errorCode,next_retry_at:null};
    }catch(finalizationError:any){
      console.error('Instantly event failure ledger finalization unavailable',eventKey,String(finalizationError?.code||finalizationError?.message||'unknown'));
      return {ok:false,queued_retry:false,dead_letter:false,review_required:true,ambiguous_effect:true,event_key:eventKey,error:String(finalizationError?.code||'EVENT_FAILURE_FINALIZATION_UNAVAILABLE'),cause:errorCode,next_retry_at:null};
    }
    if(terminal){
      try{
        const dedupeKey=`instantly-event:${eventKey}`;
        const incidents=await readRows('event_incident_lookup',()=>svc.entities.AutonomyIncident.filter({dedupe_key:dedupeKey},'-created_date',2));
        if(incidents.length>1)throw processorError('EVENT_INCIDENT_AUTHORITY_AMBIGUOUS',503);
        if(!incidents[0])await writeValue('event_incident_create',()=>svc.entities.AutonomyIncident.create({dedupe_key:dedupeKey,domain:'webhook_delivery',severity:'critical',status:'open',subject_type:'OutboundProviderEvent',subject_id:row.id,summary:`Instantly event exhausted ${attempts} processing attempts`,details_json:{event_key:eventKey,event_type:event.event_type,error_code:errorCode},first_seen_at:row.first_received_at||new Date().toISOString(),last_seen_at:new Date().toISOString(),workflow_state:'human_review',owner_type:'engineering',automation_eligibility:'human_required',financial_impact_minor:0,customer_impact:'medium',legal_risk:'none'}),true);
      }catch(incidentError:any){
        console.error('Instantly dead-letter incident persistence unavailable',eventKey,String(incidentError?.code||incidentError?.message||'unknown'));
        return {ok:false,queued_retry:false,dead_letter:true,review_required:true,event_key:eventKey,error:String(incidentError?.code||'EVENT_INCIDENT_PERSISTENCE_UNAVAILABLE'),cause:errorCode,next_retry_at:null};
      }
    }
    return {ok:false,queued_retry:!terminal,dead_letter:terminal,event_key:eventKey,error:errorCode,next_retry_at:terminal?null:nextRetry};
  }
  const status=result.handled?'PROCESSED':'IGNORED';
  try{
    const finalized=await mutateEvent(svc,'event_success_finalization',{id:row.id,event_key:eventKey,status:'PROCESSING',attempts},{status,processed_at:new Date().toISOString(),related_thread_id:result.thread?.id||'',related_message_id:result.message_id||'',last_error_code:''});
    if(finalized!=='updated')return {ok:false,queued_retry:false,review_required:true,ambiguous_effect:true,event_key:eventKey,error:'EVENT_SUCCESS_FINALIZATION_CONFLICT',status:'REVIEW_REQUIRED'};
  }catch(finalizationError:any){
    console.error('Instantly event success ledger finalization unavailable',eventKey,String(finalizationError?.code||finalizationError?.message||'unknown'));
    return {ok:false,queued_retry:false,review_required:true,ambiguous_effect:true,event_key:eventKey,error:String(finalizationError?.code||'EVENT_SUCCESS_FINALIZATION_UNAVAILABLE'),status:'REVIEW_REQUIRED'};
  }
  return {ok:true,event_key:eventKey,status,...result};
}
