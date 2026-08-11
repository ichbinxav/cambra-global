import { commercialTimezone, computeInboundReplySchedule, normalizeEmail, policyIsActive, sanitizeExternalText } from './commercialAutonomy.ts';
import { InstantlyInboundConversationProvider } from './inboundConversationProvider.ts';
import { instantlyEventKey } from './outboundProvider.ts';

export const OUTBOUND_EVENT_PROCESSOR_VERSION='outbound-provider-event-1.0.0';
const MAX_ATTEMPTS=5;
const RETRY_MINUTES=[1,5,15,60,240];
const REPLY_EVENTS=new Set(['reply_received']);
const SUPPRESSION_REASON:Record<string,string>={
  email_bounced:'bounce',lead_unsubscribed:'opt_out',lead_not_interested:'not_interested',lead_wrong_person:'wrong_person',
};

async function resolveThread(svc:any,event:any){
  if(event.message_id){
    const messages=await svc.entities.CommunicationMessage.filter({provider:'instantly',provider_message_id:event.message_id},'-created_date',5).catch(()=>[]);
    if(messages[0])return svc.entities.CommunicationThread.get(messages[0].thread_id).catch(()=>null);
  }
  if(event.campaign_id&&event.lead_email){
    const exact=await svc.entities.CommunicationThread.filter({external_campaign_id:event.campaign_id,counterparty_email:event.lead_email},'-last_message_at',5).catch(()=>[]);
    if(exact[0])return exact[0];
  }
  if(event.lead_email){
    const rows=await svc.entities.CommunicationThread.filter({counterparty_email:event.lead_email},'-last_message_at',50).catch(()=>[]);
    return rows.find((row:any)=>row.external_provider==='instantly'||(event.campaign_id&&row.external_campaign_id===event.campaign_id))||null;
  }
  return null;
}

async function suppress(svc:any,thread:any,event:any,reason:string,sourceMessageId=''){
  const email=normalizeEmail(event.lead_email||thread?.counterparty_email);
  if(email){
    const existing=await svc.entities.ContactSuppression.filter({email,active:true},'-created_date',1).catch(()=>[]);
    if(!existing[0])await svc.entities.ContactSuppression.create({email,reason,source:'instantly',source_message_id:sourceMessageId||event.message_id||'',active:true,suppressed_at:new Date().toISOString()});
    const threads=await svc.entities.CommunicationThread.filter({counterparty_email:email},'-last_message_at',100).catch(()=>[]);
    for(const row of threads)await svc.entities.CommunicationThread.update(row.id,{status:'suppressed',automation_paused:true,pause_reason:reason}).catch(()=>null);
  }
  await svc.entities.OperationalLog.create({event_type:'suppression_lifecycle_event',message:event.event_type,data_json:{provider:'instantly',event_type:event.event_type,suppression_reason:reason,thread_id:thread?.id||null,signature_verified:true},actor_email:'instantly_webhook',created_at:new Date().toISOString()}).catch(()=>null);
}

async function updateSentMessage(svc:any,thread:any,event:any){
  if(!thread)return {handled:false,reason:'thread_not_found'};
  const candidates=await svc.entities.CommunicationMessage.filter({thread_id:thread.id,direction:'outbound',provider:'instantly'},'-created_date',25).catch(()=>[]);
  const message=candidates.find((row:any)=>row.send_status==='scheduled'&&(!event.email_account||normalizeEmail(row.from_email)===event.email_account))||candidates[0]||null;
  if(!message)return {handled:false,reason:'outbound_message_not_found'};
  await svc.entities.CommunicationMessage.update(message.id,{provider_message_id:event.message_id||message.provider_message_id||'',send_status:'sent',actual_sent_at:event.timestamp,raw_event_json:{...(message.raw_event_json||{}),last_provider_event:event.event_type,last_provider_event_at:event.timestamp}});
  await svc.entities.CommunicationThread.update(thread.id,{last_outbound_at:event.timestamp,last_message_at:event.timestamp,status:'awaiting_counterparty',external_provider:'instantly',external_workspace_id:event.workspace_id||thread.external_workspace_id||'',external_campaign_id:event.campaign_id||thread.external_campaign_id||''}).catch(()=>null);
  if(thread.lead_id)await svc.entities.OutboundLead.update(thread.lead_id,{stage:'contacted',revenue_stage:'contacted',reservoir_state:'queued',next_action:'Await reply; governed follow-up remains policy-controlled'}).catch(()=>null);
  return {handled:true,message_id:message.id};
}

async function storeInboundReply(svc:any,thread:any,event:any,raw:any){
  if(!thread)throw Object.assign(new Error('instantly_thread_unresolved'),{code:'INSTANTLY_THREAD_UNRESOLVED'});
  const duplicate=event.message_id?await svc.entities.CommunicationMessage.filter({provider:'instantly',provider_message_id:event.message_id,direction:'inbound'},'-created_date',1).catch(()=>[]):[];
  if(duplicate[0])return {message:duplicate[0],duplicate:true};
  const policies=await svc.entities.CommercialPolicy.filter({policy_key:thread.policy_key,status:'active'},'-created_date',5).catch(()=>[]);
  const policy=policies.find((row:any)=>row.version===thread.policy_version&&policyIsActive(row))||policies.find((row:any)=>policyIsActive(row))||null;
  const timing=computeInboundReplySchedule(event.timestamp,policy||{},event.message_id||event.timestamp,commercialTimezone(thread,policy));
  const message=await svc.entities.CommunicationMessage.create({
    thread_id:thread.id,direction:'inbound',channel:'email',provider:'instantly',provider_message_id:event.message_id||'',
    from_email:event.lead_email,to_emails:event.email_account?[event.email_account]:[],subject:sanitizeExternalText(event.subject,300),
    text_body:sanitizeExternalText(event.text,16000),html_body:sanitizeExternalText(event.html,30000),headers_json:{email_account:event.email_account,unibox_url:event.unibox_url},
    send_status:'received',received_at:event.timestamp,earliest_reply_at:timing.earliest_reply_at,scheduled_send_at:timing.scheduled_send_at,
    raw_event_json:{provider_event:raw,normalized_event:event,processor_version:OUTBOUND_EVENT_PROCESSOR_VERSION},
  });
  await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',last_inbound_at:event.timestamp,last_message_at:event.timestamp,next_action_at:timing.scheduled_send_at,counterparty_email:event.lead_email||thread.counterparty_email,external_provider:'instantly',external_workspace_id:event.workspace_id||thread.external_workspace_id||'',external_campaign_id:event.campaign_id||thread.external_campaign_id||''});
  return {message,duplicate:false};
}

async function handleEvent(svc:any,event:any,raw:any){
  const thread=await resolveThread(svc,event);
  if(event.event_type==='email_sent')return {...await updateSentMessage(svc,thread,event),thread};
  if(event.event_type==='email_bounced'&&thread){
    const messages=await svc.entities.CommunicationMessage.filter({thread_id:thread.id,direction:'outbound',provider:'instantly'},'-created_date',10).catch(()=>[]);
    const message=messages.find((row:any)=>row.provider_message_id===event.message_id)||messages[0];
    if(message)await svc.entities.CommunicationMessage.update(message.id,{send_status:'bounced',raw_event_json:{...(message.raw_event_json||{}),last_provider_event:event.event_type,last_provider_event_at:event.timestamp}}).catch(()=>null);
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
    await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_counterparty',conversation_state:'WAITING_COUNTERPARTY',automation_paused:false,pause_reason:'out_of_office',next_action_at:new Date(Date.now()+7*86400000).toISOString()});
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
    await svc.entities.CommunicationThread.update(thread.id,patch);
    return {handled:true,thread};
  }
  if(event.event_type==='account_error'){
    const profiles=await svc.entities.OutboundSendingProfile.filter({provider:'instantly'},'-created_date',100).catch(()=>[]);
    for(const profile of profiles)await svc.entities.OutboundSendingProfile.update(profile.id,{status:'paused',last_provider_health_at:new Date().toISOString(),notes:`Paused automatically after Instantly account_error at ${event.timestamp}`}).catch(()=>null);
    const controls=await svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch(()=>[]);
    if(controls[0])await svc.entities.OutboundControl.update(controls[0].id,{instantly_enabled:false,paused_reason:'instantly_account_error'}).catch(()=>null);
    const states=await svc.entities.CommercialProviderState.filter({provider_key:'instantly',role:'outbound'},'-last_checked_at',1).catch(()=>[]);
    const state={provider_key:'instantly',role:'outbound',status:'ERROR',api_version:'v2',secret_present:Boolean(Deno.env.get('INSTANTLY_API_KEY')),auth_test_pass:false,last_checked_at:new Date().toISOString(),last_error_code:'ACCOUNT_ERROR'};
    if(states[0])await svc.entities.CommercialProviderState.update(states[0].id,state);else await svc.entities.CommercialProviderState.create(state);
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
  let row=existingRow;
  if(!row){
    const duplicate=await svc.entities.OutboundProviderEvent.filter({event_key:eventKey},'-first_received_at',1).catch(()=>[]);
    row=duplicate[0]||null;
    if(row&&['PROCESSED','IGNORED','DEAD_LETTER'].includes(row.status))return {ok:true,duplicate:true,terminal:row.status==='DEAD_LETTER',event_key:eventKey,status:row.status};
    if(!row){
      row=await svc.entities.OutboundProviderEvent.create({event_key:eventKey,provider:'instantly',event_type:event.event_type,external_workspace_id:event.workspace_id,external_campaign_id:event.campaign_id,external_message_id:event.message_id,lead_email:event.lead_email,raw_event_json:raw,normalized_event_json:event,status:'RECEIVED',attempts:0,first_received_at:new Date().toISOString()});
      const peers=await svc.entities.OutboundProviderEvent.filter({event_key:eventKey},'first_received_at',10).catch(()=>[row]);
      const winner=[...peers].sort((a:any,b:any)=>String(a.first_received_at||a.created_date||'').localeCompare(String(b.first_received_at||b.created_date||''))||String(a.id).localeCompare(String(b.id)))[0]||row;
      if(winner.id!==row.id){await svc.entities.OutboundProviderEvent.update(row.id,{status:'IGNORED',processed_at:new Date().toISOString(),last_error_code:'DUPLICATE_EVENT_LEDGER_ROW'}).catch(()=>null);return {ok:true,duplicate:true,event_key:eventKey,status:'IGNORED',winner_id:winner.id};}
    }
  }
  const attempts=Number(row.attempts||0)+1;
  await svc.entities.OutboundProviderEvent.update(row.id,{status:'PROCESSING',attempts,last_attempt_at:new Date().toISOString(),last_error_code:''});
  try{
    const result=await handleEvent(svc,event,raw);
    const status=result.handled?'PROCESSED':'IGNORED';
    await svc.entities.OutboundProviderEvent.update(row.id,{status,processed_at:new Date().toISOString(),related_thread_id:result.thread?.id||'',related_message_id:result.message_id||'',last_error_code:''});
    return {ok:true,event_key:eventKey,status,...result};
  }catch(error:any){
    const terminal=attempts>=MAX_ATTEMPTS;
    const nextRetry=new Date(Date.now()+RETRY_MINUTES[Math.min(attempts-1,RETRY_MINUTES.length-1)]*60000).toISOString();
    await svc.entities.OutboundProviderEvent.update(row.id,{status:terminal?'DEAD_LETTER':'PENDING_RETRY',next_retry_at:terminal?null:nextRetry,last_error_code:String(error?.code||error?.message||'PROVIDER_EVENT_FAILED').slice(0,160)}).catch(()=>null);
    if(terminal)await svc.entities.AutonomyIncident.create({dedupe_key:`instantly-event:${eventKey}`,domain:'webhook_delivery',severity:'critical',status:'open',subject_type:'OutboundProviderEvent',subject_id:row.id,summary:`Instantly event exhausted ${attempts} processing attempts`,details_json:{event_key:eventKey,event_type:event.event_type,error_code:String(error?.code||error?.message||'PROVIDER_EVENT_FAILED').slice(0,160)},first_seen_at:row.first_received_at||new Date().toISOString(),last_seen_at:new Date().toISOString(),workflow_state:'human_review',owner_type:'engineering',automation_eligibility:'human_required',financial_impact_minor:0,customer_impact:'medium',legal_risk:'none'}).catch(()=>null);
    return {ok:false,queued_retry:!terminal,dead_letter:terminal,event_key:eventKey,error:String(error?.code||error?.message||'provider_event_failed'),next_retry_at:terminal?null:nextRetry};
  }
}
