import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { communicationQuality, isBusinessHour, policyIsActive, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';
import { callCambraClaude } from '../../shared/commercialModelRouter.ts';
import { claimSchedulerRun, finishSchedulerRunOrThrow, markSchedulerEffectStarted, schedulerClaimDeniedResponse } from '../../shared/schedulerRun.ts';

function parse(text:string) {
  const clean=String(text||'').replace(/```json\s*/gi,'').replace(/```/g,'').trim();
  try { return JSON.parse(clean); } catch(error){safeBestEffort(error,{operation:'postMeetingWorker',fallback:null,severity:'secondary'})}
  const match=clean.match(/\{[\s\S]*\}/); if(match)try{return JSON.parse(match[0]);}catch(error){safeBestEffort(error,{operation:'postMeetingWorker',fallback:null,severity:'secondary'})}
  return null;
}

async function requestOutcomeCapture(svc:any, thread:any) {
  const tasks=await svc.entities.AgentTask.filter({agent_name:'post_meeting_worker',task_type:'capture_founder_meeting_outcome',related_entity_id:thread.id,status:'waiting_input'},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'postMeetingWorker',fallback:[],severity:'secondary'}));
  if(tasks[0]) return tasks[0];
  const task=await svc.entities.AgentTask.create({brand_id:thread.related_entity_type==='Brand'?thread.related_entity_id:'_platform',agent_name:'post_meeting_worker',task_type:'capture_founder_meeting_outcome',related_entity_type:'CommunicationThread',related_entity_id:thread.id,status:'waiting_input',requires_approval:false,risk_level:2,input_summary:`Capture real outcome for founder meeting with ${thread.counterparty_name||thread.counterparty_email}`,output_summary:'Post-meeting automation is paused until a structured outcome is captured.',started_at:new Date().toISOString()});
  await svc.entities.AgentQuestion.create({brand_id:task.brand_id,agent_task_id:task.id,agent_name:'post_meeting_worker',question_text:'What was discussed, what was agreed, what remains proposed, and what needs approval?',question_type:'text',context_summary:`Founder meeting with ${thread.counterparty_name||thread.counterparty_email}. CAMBRA will not infer commitments from an empty calendar event.`,status:'pending',expires_at:new Date(Date.now()+14*86400000).toISOString()});
  await svc.entities.CommunicationThread.update(thread.id,{conversation_state:'FOUNDER_PREP_REQUIRED',automation_paused:true,pause_reason:'meeting_outcome_capture_required'});
  return task;
}

Deno.serve(async(req)=>{
  let schedulerSvc:any=null;let schedulerClaim:any=null;let schedulerOk=true;
  try{
    const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));const gate=await requireAdminOrInternal(req,base44,body);if(!gate.ok)return gate.response;
    const svc=base44.asServiceRole;schedulerSvc=svc;schedulerClaim=await claimSchedulerRun(svc,req,{worker_key:'postMeetingWorker',cadence_seconds:3600});{const denied=schedulerClaimDeniedResponse(schedulerClaim);if(denied)return denied;}schedulerClaim=await markSchedulerEffectStarted(svc,schedulerClaim);{const denied=schedulerClaimDeniedResponse(schedulerClaim);if(denied)return denied;}const now=new Date();
    const rows=await svc.entities.CommunicationThread.filter({post_meeting_status:'pending',meeting_end_at:{$lte:now.toISOString()}},'meeting_end_at',50).catch((error:any)=>safeBestEffort(error,{operation:'postMeetingWorker',fallback:[],severity:'secondary'}));
    let sent=0,skipped=0,waitingOutcome=0;
    for(const thread of rows){
      const outcome=thread.meeting_outcome_json||null;
      const noShow=thread.meeting_status==='no_show';
      if(!outcome&&!noShow){await requestOutcomeCapture(svc,thread);waitingOutcome++;continue;}
      if(thread.automation_paused&&thread.pause_reason==='post_meeting_approval_required'){skipped++;continue;}
      const due=Date.parse(thread.meeting_follow_up_due_at||thread.meeting_end_at||'');if(Number.isFinite(due)&&Date.now()<due){skipped++;continue;}
      const suppression=await svc.entities.ContactSuppression.filter({email:thread.counterparty_email,active:true},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'postMeetingWorker',fallback:[],severity:'secondary'}));
      if(suppression.length){await svc.entities.CommunicationThread.update(thread.id,{post_meeting_status:'suppressed',conversation_state:'PAUSED',automation_paused:true,pause_reason:'suppressed'});skipped++;continue;}
      const policies=await svc.entities.CommercialPolicy.filter({policy_key:thread.policy_key,status:'active'},'-approved_at',5).catch((error:any)=>safeBestEffort(error,{operation:'postMeetingWorker',fallback:[],severity:'secondary'}));
      const policy=policies.find((item:any)=>item.version===thread.policy_version&&policyIsActive(item))||null;
      if(!policy||!isBusinessHour(policy,now)){skipped++;continue;}
      const messages=await svc.entities.CommunicationMessage.filter({thread_id:thread.id},'created_date',30).catch((error:any)=>safeBestEffort(error,{operation:'postMeetingWorker',fallback:[],severity:'secondary'}));
      const prompt=[
        'Write one concise post-meeting follow-up from CAMBRA in the thread language. Return ONLY JSON {"subject":"","body":""}.',
        'Use only the supplied real thread and structured outcome. Never convert discussed or proposed items into agreed commitments. Never execute or imply legal, contractual, billing, migration or bank-detail authority. If approval is still required, say so plainly. Do not claim Xavi personally wrote this message. Do not add a signature. Maximum 120 words.',
        noShow?'The counterparty did not attend. Offer one reasonable reschedule only; do not invent a reason and do not create an endless booking loop.':'The meeting happened and the founder captured the structured outcome below.',
        'OUTCOME:',JSON.stringify(outcome||{outcome:'NURTURE',next_step:'Offer one reschedule if worthwhile',no_show:true}),
        'THREAD:',JSON.stringify(messages.map((message:any)=>({direction:message.direction,subject:message.subject,text:String(message.text_body||'').slice(0,1800)})))
      ].join('\n');
      const draft=parse((await callCambraClaude(prompt,{tier:'standard',maxTokens:900,svc,eventKey:`postmeeting:${thread.id}:${outcome?.captured_at||thread.meeting_no_show_count||0}`,source:'postMeetingWorker'})).text);
      const previousOutbound=messages.filter((message:any)=>message.direction==='outbound').map((message:any)=>String(message.text_body||''));
      const quality=communicationQuality(String(draft?.body||''),{previous_outbound:previousOutbound});
      if(!draft?.subject||!draft?.body||!quality.ok){await svc.entities.CommunicationThread.update(thread.id,{conversation_state:'WAITING_APPROVAL',automation_paused:true,pause_reason:'post_meeting_quality_review_required'});skipped++;continue;}
      const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';
      const response=await svc.functions.invoke('commercialSendMessage',{thread_id:thread.id,action:'routine_reply',classification:'follow_up',subject:sanitizeExternalText(draft.subject,300),text:sanitizeExternalText(draft.body,5000),agent_name:'post_meeting_worker',idempotency_key:`postmeeting:${thread.id}:${outcome?.captured_at||thread.meeting_no_show_count||0}`,sending_profile_key:thread.sending_profile_key,internal_secret:internal}).catch((error:any)=>({data:{ok:false,error:String(error?.message||error)}}));
      const data=response?.data||response||{};
      if(data.ok===false){await svc.entities.CommunicationThread.update(thread.id,{automation_paused:true,pause_reason:data.error||'post_meeting_send_failed'});skipped++;continue;}
      const finalState=outcome?.outcome&&['CLOSED_WON','CLOSED_LOST','PAUSED','NURTURE','LEGAL_BLOCKED','WAITING_COUNTERPARTY','WAITING_APPROVAL'].includes(outcome.outcome)?outcome.outcome:'AI_RESUMED';
      await svc.entities.CommunicationThread.update(thread.id,{post_meeting_status:'sent',conversation_state:finalState,status:finalState==='CLOSED_WON'||finalState==='CLOSED_LOST'?'closed':'awaiting_counterparty',automation_paused:['PAUSED','LEGAL_BLOCKED','WAITING_APPROVAL'].includes(finalState),pause_reason:['PAUSED','LEGAL_BLOCKED','WAITING_APPROVAL'].includes(finalState)?`post_meeting:${finalState.toLowerCase()}`:null,current_intent:'POST_MEETING_FOLLOWUP'});
      await svc.entities.OperationalLog.create({event_type:'AI_NEGOTIATION_RESUMED',message:'CAMBRA resumed after founder meeting',data_json:{thread_id:thread.id,outcome:finalState,send_id:data.message_id||null},created_at:new Date().toISOString()}).catch((error:any)=>safeBestEffort(error,{operation:'postMeetingWorker',fallback:null,severity:'secondary'}));
      sent++;
    }
    return Response.json({ok:true,due:rows.length,sent,skipped,waiting_outcome:waitingOutcome});
  }catch(error){schedulerOk=false;console.error('postMeetingWorker failed',error);return Response.json({ok:false,error:'post_meeting_worker_failed'},{status:500});}
  finally{if(schedulerSvc&&schedulerClaim)await finishSchedulerRunOrThrow(schedulerSvc,schedulerClaim,{worker_key:'postMeetingWorker'},schedulerOk);}
});
