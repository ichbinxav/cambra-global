import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { L4_CLASSIFICATIONS, SAFE_ROUTINE_CLASSIFICATIONS, classifyHardStop, communicationQuality, policyIsActive, routineActionAllowed, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';
import { callCambraClaude, commercialNeedsHighReasoning } from '../../shared/commercialModelRouter.ts';

async function callClaude(prompt:string,tier:'standard'|'high_reasoning'='standard'){return (await callCambraClaude(prompt,{tier,maxTokens:2200})).text}
function parseJson(text:string) {
  const clean=text.replace(/```json\s*/gi,'').replace(/```/g,'').trim();
  try{return JSON.parse(clean)}catch{}
  const m=clean.match(/\{[\s\S]*\}/); if(m){try{return JSON.parse(m[0])}catch{}}
  return null;
}

Deno.serve(async (req)=>{
  let task:any=null;
  try{
    const base44=createClientFromRequest(req); const body=await req.json().catch(()=>({}));
    const gate=await requireAdminOrInternal(req,base44,body); if(!gate.ok)return gate.response;
    const svc=base44.asServiceRole;
    const thread=await svc.entities.CommunicationThread.get(String(body?.thread_id||'')).catch(()=>null);
    const message=await svc.entities.CommunicationMessage.get(String(body?.message_id||'')).catch(()=>null);
    if(!thread||!message||message.thread_id!==thread.id||message.direction!=='inbound')return Response.json({ok:false,error:'thread_message_not_found'},{status:404});
    task=await svc.entities.AgentTask.create({ brand_id:thread.related_entity_type==='Brand'?thread.related_entity_id:'_platform', agent_name:'commercial_reply', task_type:'classify_and_reply', related_entity_type:'CommunicationThread', related_entity_id:thread.id, status:'running', requires_approval:false, risk_level:2, input_summary:`Inbound ${thread.engine} reply from ${message.from_email||'counterparty'}`, started_at:new Date().toISOString() });

    const hard=classifyHardStop(message.text_body||message.subject||'');
    let result:any;
    if(hard){ result={ classification:hard, confidence:1, response_required:false, action:'stop', escalation_reason:hard, reply_subject:'', reply_body:'' }; }
    else{
      const previous=await svc.entities.CommunicationMessage.filter({thread_id:thread.id},'-created_date',12).catch(()=>[]);
      const transcript=[...previous].reverse().map((m:any)=>({direction:m.direction,subject:m.subject,text:String(m.text_body||'').slice(0,3000)}));
      const prompt=[
        'You are CAMBRA commercial operations. Classify the latest real email and draft the next response only when routine.',
        `Engine: ${thread.engine}. Language: ${thread.language||'en'}. Preserve thread language.`,
        'Never invent merchant fees, GMV, savings, provider responses, people, contract terms or authority.',
        'Escalate anything involving final pricing acceptance, custom economics, contract/legal/security/complaint, lock-in, minimum volume, termination fees, migration go-live, sensitive-document disclosure, press/investor/strategic partnership.',
        'For merchant or partner acquisition classifications use: interested, question, objection, not_interested, wrong_person, referral, meeting, unsubscribe, ooo, bounce, legal, security, complaint, custom_economics. Ordinary partner interest is NOT strategic_partnership; use interested/question/referral/meeting unless terms are genuinely unusual or materially strategic.',
        'For provider negotiations use: acknowledgement, information_request, document_request, offer, counteroffer, rejection, manager_approval, contact_referral, contract, clarification, final_offer, technical_question, implementation_question, legal, security, complaint.',
        'Return ONLY JSON: {"classification":"...","confidence":0-1,"response_required":true|false,"action":"routine_reply|meeting_offer|pricing_request|clarification|technical_question|implementation_question|contract_request|contact_referral|escalate|stop","reply_subject":"...","reply_body":"...","referred_email":"...","referred_name":"...","referred_title":"...","escalation_reason":"...","material_commitment":true|false}',
        'For merchant_acquisition: when the person is interested, curious, uncertain or raises a routine objection, gently prefer the free Analyzer as the next proof step: let them see the gap with their own payment numbers before asking for a meeting. Never force the CTA and never claim savings before evidence.','Writing: concise, specific, natural, human-sounding, no fake human identity, no generic enthusiasm, no AI meta language, no formulaic opener, no unnecessary bullets or em-dash-heavy prose.',
        'THREAD:',JSON.stringify(transcript)
      ].join('\n');
      const tier=commercialNeedsHighReasoning(thread.engine,String(message.subject||'')+' '+String(message.text_body||''))?'high_reasoning':'standard';result=parseJson(await callClaude(prompt,tier));
      if(!result||!result.classification)throw new Error('reply_classification_unparseable');
    }
    const classification=String(result.classification||'unknown');
    if(thread.engine==='partner_acquisition'&&thread.related_entity_id) await svc.entities.PartnerProspect.update(thread.related_entity_id,{stage:classification==='meeting'?'replied':'replied'}).catch(()=>null);
    await svc.entities.CommunicationMessage.update(message.id,{ classification, classification_confidence:Math.max(0,Math.min(1,Number(result.confidence)||0)), classification_reason:sanitizeExternalText(result.escalation_reason||'',1000), agent_name:'commercial_reply' });

    if(['unsubscribe','not_interested'].includes(classification)){
      if(message.from_email){const e=String(message.from_email).toLowerCase();const ex=await svc.entities.ContactSuppression.filter({email:e,active:true},'-created_date',1).catch(()=>[]);if(!ex.length)await svc.entities.ContactSuppression.create({email:e,reason:'opt_out',source:'reply_classification',source_message_id:message.id,active:true,suppressed_at:new Date().toISOString()});}
      await svc.entities.CommunicationThread.update(thread.id,{status:'suppressed',automation_paused:true,pause_reason:classification,classification});
      await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Hard stop: ${classification}`,output_payload_json:{classification},completed_at:new Date().toISOString()});
      return Response.json({ok:true,task_id:task.id,classification,stopped:true});
    }

    if(['merchant_acquisition','partner_acquisition','aggregate_procurement'].includes(thread.engine)&&classification==='meeting'){
      const due=Date.parse(message.scheduled_send_at||message.earliest_reply_at||''); if(!Number.isFinite(due)||Date.now()<due){await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',next_action_at:message.scheduled_send_at||message.earliest_reply_at});await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:'Meeting intent queued behind deterministic reply timing gate',output_payload_json:{classification,earliest_reply_at:message.earliest_reply_at,scheduled_send_at:message.scheduled_send_at},completed_at:new Date().toISOString()});return Response.json({ok:true,task_id:task.id,classification,automatic:true,queued:true,scheduled_send_at:message.scheduled_send_at});}
      const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';
      const scheduled=await svc.functions.invoke('outlookMeetingCoordinator',{thread_id:thread.id,attendee_email:message.from_email,internal_secret:internal}).catch((e:any)=>({data:{ok:false,error:String(e?.message||e)}}));
      const sd=scheduled?.data||scheduled||{};
      if(sd.ok===false){
        await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',automation_paused:true,pause_reason:sd.error||'meeting_scheduling_failed',classification});
        await svc.entities.AgentTask.update(task.id,{status:'waiting_input',output_summary:`Meeting requested but real calendar scheduling is unavailable`,output_payload_json:{classification,scheduling:sd},completed_at:new Date().toISOString()});
        return Response.json({ok:true,task_id:task.id,classification,automatic:false,meeting:sd});
      }
      await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:'Meeting booked automatically from real Outlook availability',output_payload_json:{classification,meeting:sd},completed_at:new Date().toISOString()});
      return Response.json({ok:true,task_id:task.id,classification,automatic:true,meeting:sd});
    }

    if(['provider_negotiation','aggregate_procurement'].includes(thread.engine)&&classification==='contact_referral'){
      const raw=String(message.text_body||'');const proposed=String(result.referred_email||'').trim().toLowerCase();const escaped=proposed.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const appears=proposed&&new RegExp(`(^|[^A-Z0-9._%+-])${escaped}([^A-Z0-9._%+-]|$)`,'i').test(raw);const valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(proposed);if(!valid||!appears){await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',automation_paused:true,pause_reason:'unverified_provider_referral'});await svc.entities.AgentTask.update(task.id,{status:'waiting_input',output_summary:'Provider referral could not be verified from inbound email',output_payload_json:{classification,proposed_email:proposed},completed_at:new Date().toISOString()});return Response.json({ok:true,automatic:false,escalated:true,error:'unverified_provider_referral'});}
      const c=await svc.entities.NegotiationCase.get(thread.related_entity_id).catch(()=>null);if(!c)return Response.json({ok:false,error:'negotiation_case_not_found'},{status:404});const now=new Date().toISOString();const existing=await svc.entities.ProviderContact.filter({provider_id:c.provider_id,email:proposed,active:true},'-created_date',1).catch(()=>[]);if(!existing.length)await svc.entities.ProviderContact.create({provider_id:c.provider_id,provider_name:c.provider_name,brand_id:c.brand_id,recover_id:c.recover_id,name:String(result.referred_name||''),email:proposed,title:String(result.referred_title||''),department:'commercial',source:'provider_referral',source_reference:message.id,source_evidence_json:{message_id:message.id,from_email:message.from_email},confidence:'high',merchant_specific:true,validated:true,active:true,last_verified_at:now});await svc.entities.Provider.update(c.provider_id,{contact_email:proposed,account_manager:String(result.referred_name||'')||undefined,contact_resolution_status:'resolved'}).catch(()=>null);await svc.entities.CommunicationThread.update(thread.id,{counterparty_email:proposed,counterparty_name:String(result.referred_name||'')||proposed,status:'open',automation_paused:false,pause_reason:null});const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';const rerun=await svc.functions.invoke(thread.engine==='aggregate_procurement'?'collectiveNegotiationAgent':'providerNegotiationAgent',{action:'initial_contact',case_id:c.id,internal_secret:internal}).catch((e:any)=>({data:{ok:false,error:String(e?.message||e)}}));await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Provider redirected CAMBRA to ${proposed}; negotiation continued automatically`,output_payload_json:{classification,referred_email:proposed,rerun:rerun?.data||rerun},completed_at:now});return Response.json({ok:true,automatic:true,classification,referred_email:proposed,continued:true});
    }

    if(['provider_negotiation','aggregate_procurement'].includes(thread.engine)&&['offer','counteroffer'].includes(classification)){
      const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';
      const currentCase=await svc.entities.NegotiationCase.get(thread.related_entity_id).catch(()=>null);
      const monetizationReply=thread.engine==='aggregate_procurement'&&currentCase?.next_action==='await_provider_monetization_response';
      const run=await svc.functions.invoke(monetizationReply?'providerMonetizationAgent':thread.engine==='aggregate_procurement'?'collectiveNegotiationAgent':'providerNegotiationAgent',monetizationReply?{action:'process_offer',case_id:thread.related_entity_id,bid_id:currentCase?.aggregate_bid_id,message_id:message.id,internal_secret:internal}:{action:'process_offer',case_id:thread.related_entity_id,message_id:message.id,internal_secret:internal}).catch((e:any)=>({data:{ok:false,error:String(e?.message||e)}}));
      const rd=run?.data||run||{};
      if(rd.ok===false){
        await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',automation_paused:true,pause_reason:'provider_offer_processing_failed',classification});
        await svc.entities.AgentTask.update(task.id,{status:'failed',error:'provider_offer_processing_failed',output_payload_json:{classification,provider_negotiation:rd},completed_at:new Date().toISOString()});
        return Response.json({ok:false,task_id:task.id,error:'provider_offer_processing_failed'},{status:500});
      }
      await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Provider ${classification} handed to persistent negotiation case`,output_payload_json:{classification,provider_negotiation:rd},completed_at:new Date().toISOString()});
      return Response.json({ok:true,task_id:task.id,classification,negotiation:rd});
    }

    if(['provider_negotiation','aggregate_procurement'].includes(thread.engine)&&classification==='contract'){
      const c=await svc.entities.NegotiationCase.get(thread.related_entity_id).catch(()=>null);
      if(c) await svc.entities.NegotiationCase.update(c.id,{status:'contract_received',contract_match_status:'pending_review',next_action:'ingest_and_compare_contract'}).catch(()=>null);
    }

    const l4=L4_CLASSIFICATIONS.has(classification)||result.material_commitment===true||String(result.action)==='escalate'||classification==='manager_approval';
    if(l4){
      const approval=await svc.entities.Approval.create({ brand_id:thread.related_entity_type==='Brand'?thread.related_entity_id:'_platform', agent_task_id:task.id, action_type:thread.engine==='provider_negotiation'?'provider_negotiation_review':thread.engine==='aggregate_procurement'?'aggregate_procurement_review':'commercial_reply_exception', related_entity_type:'CommunicationThread', related_entity_id:thread.id, risk_level:4, draft_content:`Classification: ${classification}\n\n${sanitizeExternalText(result.reply_body||'',5000)}`, draft_payload_json:{thread_id:thread.id,message_id:message.id,classification,proposed_action:result.action,proposed_reply:result.reply_body||'',reason:result.escalation_reason||'',material_commitment:!!result.material_commitment}, status:'pending', expires_at:new Date(Date.now()+7*86400000).toISOString() });
      await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_approval',automation_paused:true,pause_reason:`l4:${classification}`,classification});
      await svc.entities.AgentTask.update(task.id,{status:'waiting_approval',requires_approval:true,risk_level:4,approval_id:approval.id,output_summary:`${classification} requires founder approval`,output_payload_json:{classification,approval_id:approval.id},completed_at:new Date().toISOString()});
      return Response.json({ok:true,task_id:task.id,classification,approval_id:approval.id,escalated:true});
    }

    let quality=communicationQuality(String(result.reply_body||''));
    if(result.response_required&& !quality.ok){ const retryPrompt=['Rewrite this CAMBRA reply so it is concise, contextual and natural. Preserve facts, intent and language. No generic opener, no corporate filler, no unnecessary list, no invented identity. Return ONLY JSON {\"reply_subject\":\"...\",\"reply_body\":\"...\"}.',JSON.stringify({subject:result.reply_subject,body:result.reply_body,quality_reasons:quality.reasons})].join('\n'); const retry=parseJson(await callClaude(retryPrompt,commercialNeedsHighReasoning(thread.engine,String(message.text_body||''))?'high_reasoning':'standard')); if(retry?.reply_body){result.reply_body=retry.reply_body;result.reply_subject=retry.reply_subject||result.reply_subject;quality=communicationQuality(String(result.reply_body||''));} if(!quality.ok){await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',automation_paused:true,pause_reason:'communication_quality_gate_failed'});await svc.entities.AgentTask.update(task.id,{status:'waiting_input',output_summary:'Reply failed communication quality gate after regeneration',output_payload_json:{classification,quality},completed_at:new Date().toISOString()});return Response.json({ok:true,automatic:false,escalated:true,error:'communication_quality_gate_failed',quality});}}

    const policies=await svc.entities.CommercialPolicy.filter({policy_key:thread.policy_key,status:'active'},'-created_date',5).catch(()=>[]); const policy=policies.find((p:any)=>p.version===thread.policy_version)||policies[0]||null;
    const action=String(result.action||'routine_reply'); const authz=routineActionAllowed(policy,action,classification);
    if(!policyIsActive(policy)||!SAFE_ROUTINE_CLASSIFICATIONS.has(classification)||!authz.allowed||!result.response_required){
      await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',automation_paused:true,pause_reason:authz.reason||'manual_review',classification});
      await svc.entities.AgentTask.update(task.id,{status:'waiting_input',output_summary:`Reply needs review: ${classification}`,output_payload_json:{classification,reason:authz.reason,proposal:result},completed_at:new Date().toISOString()});
      return Response.json({ok:true,task_id:task.id,classification,automatic:false,reason:authz.reason});
    }

    const due=Date.parse(message.scheduled_send_at||message.earliest_reply_at||'');
    if(!Number.isFinite(due)||Date.now()<due){await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',automation_paused:false,pause_reason:null,next_action_at:message.scheduled_send_at||message.earliest_reply_at});await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Autonomous ${classification} reply drafted and queued behind deterministic timing gate`,output_payload_json:{classification,action,earliest_reply_at:message.earliest_reply_at,scheduled_send_at:message.scheduled_send_at,quality},completed_at:new Date().toISOString()});return Response.json({ok:true,task_id:task.id,classification,automatic:true,queued:true,scheduled_send_at:message.scheduled_send_at});}
    const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';
    const send=await svc.functions.invoke('commercialSendMessage',{ thread_id:thread.id, action, classification, subject:sanitizeExternalText(result.reply_subject||`Re: ${message.subject||''}`,300), text:sanitizeExternalText(result.reply_body||'',5000), agent_name:'commercial_reply', idempotency_key:`reply:${message.id}:${policy.version}`, in_reply_to_message_id:message.id, internal_secret:internal });
    const sendData=send?.data||send||{};
    if(sendData?.ok===false)throw new Error(`commercial_send_rejected:${sendData?.error||'unknown'}`);
    await svc.entities.CommunicationThread.update(thread.id,{classification,automation_paused:false,pause_reason:null});
    await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Autonomous ${classification} reply sent inside policy ${policy.version}`,output_payload_json:{classification,action,send:sendData},completed_at:new Date().toISOString()});
    return Response.json({ok:true,task_id:task.id,classification,automatic:true});
  }catch(error){
    console.error('commercialReplyAgent failed',error);
    if(task?.id){try{const b=createClientFromRequest(req);await b.asServiceRole.entities.AgentTask.update(task.id,{status:'failed',error:'commercial_reply_failed',completed_at:new Date().toISOString()});}catch{}}
    return Response.json({ok:false,error:'commercial_reply_failed',task_id:task?.id||null},{status:500});
  }
});
