import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { automaticSendGovernorDecision, communicationQuality, commercialTimezone, isBusinessHour, normalizeEmail, policyIsActive, routineActionAllowed, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';
import { emergencyState } from '../../shared/operationalControl.ts';
import { assertMarketCapabilityAllowed } from '../../shared/marketPolicyRuntime.ts';
import { authorityForAgent } from '../../shared/agentAuthority.ts';
import { commercialLegalAction, enforceLegalExecution, legalBlockResponse } from '../../shared/legalExecutionRuntime.ts';
import { canonicalMarket } from '../../shared/marketContext.ts';
import { acquisitionEngine } from '../../shared/commercialActivation.ts';
import { reservePaidOperation, settlePaidOperation } from '../../shared/costGovernance.ts';
import { InstantlyOutboundProvider, instantlyProfileReady } from '../../shared/outboundProvider.ts';


const CAMBRA_LOGO='https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d62c05e68_c-mark-voltio2x.png';
const CAMBRA_WEB='https://www.cambra.global';
function signatureIdentity(provider:string, engine:string, configuredEmail=''){
  const email=normalizeEmail(configuredEmail);
  if(provider==='outlook') return {name:'CAMBRA',title:'Founder Office',email};
  if(['provider_negotiation','aggregate_procurement'].includes(engine)) return {name:'CAMBRA Operations',title:'Infrastructure Operations',email};
  return {name:'CAMBRA Payments',title:'Infrastructure Intelligence',email};
}
function cambraSignature(provider:string, engine:string, email:string){const i=signatureIdentity(provider,engine,email);return [i.name,i.title,i.email?`Mail: ${i.email}`:null,'Web: www.cambra.global'].filter(Boolean).join('\n');}
function ensureSignature(text:string, signature:string){const t=String(text||'').trimEnd();if(t.includes(signature))return t;return `${t}\n\n${signature}`;}
function escapeHtml(v:string){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function signedHtml(text:string,provider:string,engine:string,email:string){const i=signatureIdentity(provider,engine,email);const body=escapeHtml(String(text||'').trim()).replace(/\n/g,'<br>');const mail=i.email?`<br>Mail: <a href="mailto:${escapeHtml(i.email)}" style="color:#171717;text-decoration:none">${escapeHtml(i.email)}</a>`:'';return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#171717">${body}<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-collapse:collapse"><tr><td style="padding-right:12px;vertical-align:top"><img src="${CAMBRA_LOGO}" width="38" height="38" alt="CAMBRA" style="display:block;border:0;width:38px;height:38px"></td><td style="vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#555"><strong style="font-size:13px;color:#171717">${escapeHtml(i.name)}</strong><br>${escapeHtml(i.title)}${mail}<br>Web: <a href="${CAMBRA_WEB}" style="color:#171717;text-decoration:none">www.cambra.global</a></td></tr></table></div></body></html>`;}
function mailboxFromSetting(value:string){const match=String(value||'').match(/<([^>]+)>/);return normalizeEmail(match?.[1]||value);}
function approvalBoundToThread(approval:any,thread:any){
  const payload=approval?.draft_payload_json||{};
  const threadBindings=new Set([thread?.id,thread?.related_entity_id,thread?.lead_id,thread?.recover_id].map(String).filter(Boolean));
  const approvalBindings=[approval?.related_entity_id,payload?.thread_id,payload?.communication_thread_id,payload?.related_entity_id].map(String).filter(Boolean);
  return approvalBindings.some((id:string)=>threadBindings.has(id));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;
    const emergency = await emergencyState(svc);
    if (emergency.safe_mode || emergency.communications_paused) return Response.json({ ok:false, error:'emergency_control_paused:communications', safe_mode:emergency.safe_mode, reason:emergency.reason || null }, { status:409 });

    const threadId = String(body?.thread_id || '');
    const action = String(body?.action || 'routine_reply');
    const classification = String(body?.classification || 'question');
    const subject = sanitizeExternalText(body?.subject, 300);
    const text = sanitizeExternalText(body?.text, 5000);
    if (!threadId || !subject || !text) return Response.json({ ok:false, error:'thread_subject_text_required' }, { status:400 });

    const thread = await svc.entities.CommunicationThread.get(threadId).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));
    if (!thread || ['closed','suppressed'].includes(thread.status)) return Response.json({ ok:false, error:'thread_unavailable' }, { status:409 });
    let brandId='';
    if(thread.recover_id){const activation=await svc.entities.DealActivation.get(String(thread.recover_id)).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));brandId=String(activation?.brand_id||'')}
    let jurisdiction=canonicalMarket(thread.market_jurisdiction)?.iso2||'';
    if(!jurisdiction&&thread.lead_id){const lead=await svc.entities.OutboundLead.get(String(thread.lead_id)).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));jurisdiction=canonicalMarket(lead?.country)?.iso2||'';}
    if(!jurisdiction&&thread.related_entity_type==='PartnerProspect'){const partner=await svc.entities.PartnerProspect.get(String(thread.related_entity_id||'')).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));jurisdiction=canonicalMarket(partner?.country)?.iso2||'';}
    if(!jurisdiction&&brandId){const brand=await svc.entities.Brand.get(brandId).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));jurisdiction=canonicalMarket(brand?.billing_country||brand?.country)?.iso2||'';}
    if(thread.market_policy_rollout==='production'){const cap=['provider_negotiation','aggregate_procurement'].includes(String(thread.engine||''))?'NEGOTIATE':'OUTREACH';try{await assertMarketCapabilityAllowed(svc,{brand_id:brandId||undefined,jurisdiction:jurisdiction||undefined,capability:cap,enforce:true,actor_type:String(body?.agent_name||thread.engine||'commercial_send'),ai_requested_bypass:body?.ai_requested_bypass===true})}catch(e:any){return Response.json({ok:false,error:`market_capability_denied:${cap}`,decision:e?.decision||null},{status:409})}}
    const to = normalizeEmail(body?.to || thread.counterparty_email);
    if (!to) return Response.json({ ok:false, error:'recipient_required' }, { status:400 });

    const suppressions = await svc.entities.ContactSuppression.filter({ email:to, active:true }, '-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));
    if (suppressions.length) {
      await svc.entities.CommunicationThread.update(thread.id, { status:'suppressed', automation_paused:true, pause_reason:'contact_suppressed' }).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));
      return Response.json({ ok:false, error:'contact_suppressed' }, { status:409 });
    }

    const manualOverrideRequested=body?.manual_override === true;
    let approvedOverride:any=null;
    if(manualOverrideRequested&&!gate.isAdmin&&gate.isInternal&&body?.approval_id){
      approvedOverride=await svc.entities.Approval.get(String(body.approval_id)).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));
      const expired=approvedOverride?.expires_at&&Date.parse(String(approvedOverride.expires_at))<=Date.now();
      if(approvedOverride?.status!=='approved'||expired||!approvalBoundToThread(approvedOverride,thread))approvedOverride=null;
    }
    if(manualOverrideRequested&&!gate.isAdmin&&!approvedOverride)return Response.json({ok:false,error:'admin_or_approved_internal_manual_override_required'},{status:403});
    const manualOverride=manualOverrideRequested&&(gate.isAdmin||Boolean(approvedOverride));
    const automatic=!manualOverride;
    const agentName=String(body?.agent_name||thread.engine||'commercial_orchestrator').toLowerCase();
    const authority=authorityForAgent(agentName);
    const legalAction=commercialLegalAction(thread,action);
    if(automatic&&!authority.CAN_SEND)return Response.json({ok:false,error:'agent_send_authority_required',agent_name:agentName},{status:403});
    if(automatic&&legalAction==='NEGOTIATE_PRICING'&&!authority.CAN_NEGOTIATE)return Response.json({ok:false,error:'agent_negotiate_authority_required',agent_name:agentName},{status:403});
    let legalDecision:any=null;
    try{
      legalDecision=await enforceLegalExecution(svc,{
        requested_action:legalAction,merchant_id:brandId,jurisdiction,
        provider_id:thread.provider_id||null,case_id:thread.related_entity_id||thread.recover_id||null,
        deal_activation_id:thread.recover_id||null,approval_id:body?.approval_id||null,
        actor:{id:manualOverride?String(gate.user?.email||'admin'):agentName,type:manualOverride?'HUMAN_ADMIN':'AUTOMATION',tool:'commercialSendMessage',allowed_actions:[legalAction]},
        emergency_state:{legal_execution_paused:emergency.safe_mode===true},
      });
    }catch(error){const response=legalBlockResponse(error);if(response)return response;throw error;}

    const policies = await svc.entities.CommercialPolicy.filter({ policy_key:thread.policy_key, status:'active' }, '-created_date', 5).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));
    const policy = policies.find((p:any)=>p.version === thread.policy_version) || policies[0] || null;
    const timezone = commercialTimezone(thread, policy);
    if (automatic) {
      if (!policyIsActive(policy)) return Response.json({ ok:false, error:'active_policy_required' }, { status:409 });
      if(acquisitionEngine(thread.engine)&&(!jurisdiction||!Array.isArray(policy.countries)||!policy.countries.includes(jurisdiction)))return Response.json({ok:false,error:'market_not_enabled_by_commercial_policy',jurisdiction:jurisdiction||null},{status:409});
      const authz = routineActionAllowed(policy, action, classification);
      if (!authz.allowed) return Response.json({ ok:false, error:authz.reason, escalation_required:true }, { status:409 });
      if (thread.automation_paused) return Response.json({ ok:false, error:'thread_automation_paused' }, { status:409 });
      if (!gate.isInternal) return Response.json({ ok:false, error:'internal_autonomy_proof_required' }, { status:403 });
      if (!isBusinessHour(policy,new Date(),timezone)) return Response.json({ok:false,error:'outside_business_hours'},{status:409});
      const inboundId=String(body?.in_reply_to_message_id||'');
      if(inboundId){ const inbound=await svc.entities.CommunicationMessage.get(inboundId).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'})); if(!inbound||inbound.thread_id!==thread.id||inbound.direction!=='inbound')return Response.json({ok:false,error:'invalid_inbound_reply_reference'},{status:409}); const earliest=Date.parse(inbound.earliest_reply_at||''); const scheduled=Date.parse(inbound.scheduled_send_at||''); const nowMs=Date.now(); if(!Number.isFinite(earliest)||nowMs<earliest)return Response.json({ok:false,error:'minimum_reply_delay_not_elapsed',earliest_reply_at:inbound.earliest_reply_at},{status:409}); if(Number.isFinite(scheduled)&&nowMs<scheduled)return Response.json({ok:false,error:'scheduled_send_not_due',scheduled_send_at:inbound.scheduled_send_at},{status:409}); }
    }

    const previousOut=await svc.entities.CommunicationMessage.filter({thread_id:thread.id,direction:'outbound'},'-created_date',6).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));
    const quality=communicationQuality(text,{previous_outbound:previousOut.map((m:any)=>String(m.text_body||''))});
    if(!quality.ok)return Response.json({ok:false,error:'communication_quality_gate_failed',quality},{status:422});

    const idempotency = String(body?.idempotency_key || `cambra:${thread.id}:${action}:${thread.last_inbound_at || thread.last_message_at || 'start'}`);
    const existing = await svc.entities.CommunicationMessage.filter({ thread_id:thread.id, direction:'outbound', idempotency_key:idempotency }, '-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));
    if (existing.length) return Response.json({ ok:true, duplicate:true, message_id:existing[0].id, provider:existing[0].provider || null });

    const now = new Date().toISOString();
    const requestedProfileKey=String(body?.sending_profile_key||thread.sending_profile_key||'').trim();
    const profiles=requestedProfileKey?await svc.entities.OutboundSendingProfile.filter({profile_key:requestedProfileKey},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'})):[];
    const sendingProfile=profiles[0]||null;
    if(requestedProfileKey&&!sendingProfile)return Response.json({ok:false,error:'sending_profile_not_found'},{status:409});
    if(approvedOverride&&['initial_outreach','follow_up','partner_outreach'].includes(action)&&!sendingProfile)return Response.json({ok:false,error:'approved_send_profile_required',review_required:true},{status:409});
    const signatureProvider=String(sendingProfile?.provider||'outlook');
    const configuredSignatureEmail=mailboxFromSetting(String(sendingProfile?.from_address||(signatureProvider==='outlook'?Deno.env.get('CAMBRA_OUTLOOK_SIGNATURE_EMAIL'):signatureProvider==='resend'?Deno.env.get('RESEND_FROM'):'')||''));
    const signedText=ensureSignature(text,cambraSignature(signatureProvider,String(thread.engine||''),configuredSignatureEmail));
    const signedHTML=signedHtml(text,signatureProvider,String(thread.engine||''),configuredSignatureEmail);
    if(sendingProfile&&!manualOverride){const minuteAgo=new Date(Date.now()-60000).toISOString();const recentBurst=await svc.entities.CommunicationMessage.filter({direction:'outbound',sending_profile_key:sendingProfile.profile_key,sent_at:{$gte:minuteAgo}},'-sent_at',100).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));const burst=Math.max(1,Math.min(60,Number(sendingProfile.burst_per_minute|| (sendingProfile.provider==='outlook'?12:30))));if(recentBurst.length>=burst)return Response.json({ok:false,error:'sending_profile_burst_limit',profile:sendingProfile.profile_key,burst_per_minute:burst,retry_after_seconds:60},{status:429});}
    const acquisitionAction=['initial_outreach','partner_outreach'].includes(action);
    if(acquisitionAction&&!manualOverride){
      const controls=await svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));const control=controls[0]||null;
      if(!control?.acquisition_enabled)return Response.json({ok:false,error:'outbound_master_paused'},{status:409});
      if(!sendingProfile)return Response.json({ok:false,error:'sending_profile_required'},{status:409});
      if(sendingProfile.provider==='outlook'&&!control.premium_outlook_enabled)return Response.json({ok:false,error:'premium_outlook_paused'},{status:409});
      if(sendingProfile.provider==='resend'&&!control.volume_resend_enabled)return Response.json({ok:false,error:'volume_resend_paused'},{status:409});
      if(sendingProfile.provider==='instantly'&&!control.instantly_enabled)return Response.json({ok:false,error:'instantly_outbound_paused'},{status:409});
    }
    let governor:any={allowed:true,reason:'admin_manual_override'};
    if(automatic){
      if(sendingProfile&&acquisitionEngine(thread.engine)&&(!Array.isArray(policy?.sending_profile_keys)||!policy.sending_profile_keys.includes(sendingProfile.profile_key)))return Response.json({ok:false,error:'policy_sending_profile_not_allowed'},{status:409});
      if(!sendingProfile)governor=automaticSendGovernorDecision({automatic:true,sendingProfile:null,profileSentToday:0,policy,policySentToday:0});
      else{
        const day=new Date();day.setUTCHours(0,0,0,0);const since=day.toISOString();
        const [profileSent,policySent]=await Promise.all([
          svc.entities.CommunicationMessage.filter({direction:'outbound',sending_profile_key:sendingProfile.profile_key,sent_at:{$gte:since}},'-sent_at',550).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'})),
          svc.entities.CommunicationMessage.filter({direction:'outbound',policy_key:thread.policy_key,sent_at:{$gte:since}},'-sent_at',550).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'})),
        ]);
        governor=automaticSendGovernorDecision({automatic:true,sendingProfile,profileSentToday:profileSent.length,policy,policySentToday:policySent.length});
      }
      if(!governor.allowed){const governorError=String(governor.reason||'sending_profile_daily_cap_reached');return Response.json({ok:false,error:governorError,profile:sendingProfile?.profile_key||null,limit:governor.limit||null},{status:409});}
    }
    let manualOverrideAudit:any=null;
    if(manualOverride){
      manualOverrideAudit=await svc.entities.AuthorizationLog.create({action_type:'commercial_send_manual_override',description:`Approved override for ${action} on thread ${thread.id}`,approved_by:String(gate.user?.email||approvedOverride?.approved_by||''),approved_at:new Date().toISOString(),source:'commercialSendMessage',document_version:'commercial-send-governor-1.1.0'}).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));
      if(!manualOverrideAudit)return Response.json({ok:false,error:'manual_override_audit_required'},{status:409});
    }
    const liveThread=await svc.entities.CommunicationThread.get(thread.id).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));
    if(!liveThread||['closed','suppressed'].includes(liveThread.status)||liveThread.automation_paused===true)return Response.json({ok:false,error:'thread_state_changed_before_send'},{status:409});
    const liveSuppressions=await svc.entities.ContactSuppression.filter({email:to,active:true},'-created_date',1).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));if(liveSuppressions.length)return Response.json({ok:false,error:'contact_suppressed_before_send'},{status:409});
    if(action==='follow_up'){
      if(['MEETING_BOOKED','MEETING_COMPLETED','CLOSED_WON','CLOSED_LOST'].includes(String(liveThread.conversation_state||''))||['booked','completed'].includes(String(liveThread.meeting_status||'')))return Response.json({ok:false,error:'follow_up_cancelled_by_meeting_or_closed_state'},{status:409});
      const latest=await svc.entities.CommunicationMessage.filter({thread_id:thread.id},'-created_date',10).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:[],severity:'critical'}));const latestInbound=latest.find((message:any)=>message.direction==='inbound');const latestOutbound=latest.find((message:any)=>message.direction==='outbound');if(latestInbound&&(!latestOutbound||Date.parse(latestInbound.received_at||latestInbound.created_date||0)>=Date.parse(latestOutbound.actual_sent_at||latestOutbound.sent_at||latestOutbound.created_date||0)))return Response.json({ok:false,error:'follow_up_cancelled_by_new_reply'},{status:409});
    }
    let provider=String(sendingProfile?.provider||'outlook'); let providerMessageId:any=null; let fromAddress=''; let externalThreadId=thread.external_thread_id||null; let externalLeadId=thread.external_lead_id||null; let sendStatus='sent'; let actualSentAt:any=now; let raw:any={idempotency_key:idempotency,sending_profile_key:sendingProfile?.profile_key||null,central_governor:governor,legal_execution:{decision:legalDecision?.decision,authority_snapshot_id:legalDecision?.authority_snapshot_id,authority_snapshot_hash:legalDecision?.authority_snapshot_hash},manual_override:manualOverride,manual_override_approval_id:approvedOverride?.id||null,manual_override_audit_id:manualOverrideAudit?.id||null};
    const costReservation=await reservePaidOperation(svc,{event_key:`email:${idempotency}`,category:'email',provider,source:'commercialSendMessage',related_entity_type:'CommunicationThread',related_entity_id:thread.id});
    try{
      if(provider==='instantly'){
        if(!instantlyProfileReady(sendingProfile))throw Object.assign(new Error('instantly_profile_not_ready'),{status:409});
        const instantlyKey=Deno.env.get('INSTANTLY_API_KEY')||'';if(!instantlyKey)throw Object.assign(new Error('instantly_not_configured'),{status:503});
        const transport=new InstantlyOutboundProvider(instantlyKey);fromAddress=mailboxFromSetting(String(sendingProfile.from_address||''));
        if(acquisitionAction){
          const lead=thread.lead_id?await svc.entities.OutboundLead.get(String(thread.lead_id)).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'})):null;
          const queued=await transport.queueInitial({campaign_id:sendingProfile.external_campaign_id,to,contact_name:thread.counterparty_name||lead?.contact_full_name||'',contact_title:thread.counterparty_role||lead?.contact_title||'',company_name:thread.company_name||lead?.company_name||'',company_domain:lead?.company_domain||'',personalization:(thread.personalization_json?.facts||[]).slice(0,5).join('; '),subject,text:signedText,thread_id:thread.id,idempotency_key:idempotency});
          externalLeadId=queued.provider_lead_id||externalLeadId;sendStatus='scheduled';actualSentAt=null;raw={...raw,instantly_lead_id:queued.provider_lead_id||null,instantly_campaign_id:queued.campaign_id,queued:true,provider_response:queued.raw};
        }else{
          const inboundId=String(body?.in_reply_to_message_id||'');const inbound=inboundId?await svc.entities.CommunicationMessage.get(inboundId).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'})):null;
          if(!inbound?.provider_message_id)throw Object.assign(new Error('instantly_reply_reference_required'),{status:409});
          const sent=await transport.sendReply({eaccount:fromAddress,reply_to_uuid:inbound.provider_message_id,subject,text:signedText,html:signedHTML});
          providerMessageId=sent.provider_message_id||null;externalThreadId=sent.external_thread_id||externalThreadId;raw={...raw,instantly_email_id:providerMessageId,instantly_thread_id:externalThreadId,provider_response:sent.raw};
        }
      }else if(provider==='outlook'){
        const outlook=await svc.connectors.getConnection('outlook').catch(()=>({accessToken:null}));if(!outlook?.accessToken)throw Object.assign(new Error('outlook_connector_required'),{status:503});
        const meRes=await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName',{headers:{Authorization:`Bearer ${outlook.accessToken}`}});const me=await meRes.json().catch(()=>({}));if(!meRes.ok)throw new Error(`outlook_me_failed:${meRes.status}`);fromAddress=normalizeEmail(me.mail||me.userPrincipalName);
        const draftRes=await fetch('https://graph.microsoft.com/v1.0/me/messages',{method:'POST',headers:{Authorization:`Bearer ${outlook.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({subject,body:{contentType:'HTML',content:signedHTML},toRecipients:[{emailAddress:{address:to}}],internetMessageHeaders:[{name:'X-CAMBRA-Thread',value:thread.id}]})});const draft=await draftRes.json().catch(()=>({}));if(!draftRes.ok)throw new Error(`outlook_draft_failed:${draftRes.status}`);
        const sendRes=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(String(draft.id))}/send`,{method:'POST',headers:{Authorization:`Bearer ${outlook.accessToken}`}});if(!sendRes.ok)throw new Error(`outlook_send_failed:${sendRes.status}`);providerMessageId=draft.id||null;externalThreadId=draft.conversationId||externalThreadId;raw={...raw,outlook_message_id:draft.id||null,conversation_id:draft.conversationId||null};
      }else if(provider==='resend'){
        const resendKey=Deno.env.get('RESEND_API_KEY');if(!resendKey)throw Object.assign(new Error('commercial_email_not_configured'),{status:503});
        const resendIdentity=signatureIdentity('resend',String(thread.engine||''),configuredSignatureEmail);const fromSetting=String(sendingProfile?.from_address||Deno.env.get('RESEND_FROM')||'').trim();if(!fromSetting)throw Object.assign(new Error('resend_from_identity_required'),{status:503});const from=fromSetting.includes('<')?fromSetting:`${resendIdentity.name} <${fromSetting}>`;fromAddress=mailboxFromSetting(fromSetting);const inboundDomain=Deno.env.get('RESEND_INBOUND_DOMAIN')||'contact.cambra.global';const replyTo=`reply+${thread.id}@${inboundDomain}`;
        const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${resendKey}`,'Idempotency-Key':idempotency},body:JSON.stringify({from,to:[to],reply_to:replyTo,subject,text:signedText,html:signedHTML,tags:[{name:'thread_id',value:thread.id},{name:'engine',value:thread.engine}]})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(`resend_send_failed:${res.status}`);providerMessageId=data?.id||null;raw={...raw,resend_id:data?.id||null};
      }else throw Object.assign(new Error('unsupported_outbound_provider'),{status:409});
    }catch(error:any){await settlePaidOperation(svc,costReservation,{ok:false,usage_json:{thread_id:thread.id,error_code:String(error?.code||error?.message||'transport_failed').slice(0,160)}}).catch((error:any)=>safeBestEffort(error,{operation:'commercialSendMessage',fallback:null,severity:'critical'}));throw error;}
    const message = await svc.entities.CommunicationMessage.create({
      thread_id:thread.id, direction:'outbound', channel:'email', provider, provider_message_id:String(providerMessageId||''), idempotency_key:idempotency, sending_profile_key:sendingProfile?.profile_key||thread.sending_profile_key||null,
      from_email:fromAddress, to_emails:[to], subject, text_body:signedText, classification, agent_name:String(body?.agent_name || 'commercial_orchestrator'), policy_key:thread.policy_key,
      policy_version:thread.policy_version, approval_id:body?.approval_id || null, message_intent:String(body?.message_intent||action).toUpperCase(), thread_context_snapshot_json:{thread_id:thread.id,engine:thread.engine,policy_key:thread.policy_key,policy_version:thread.policy_version,market_jurisdiction:jurisdiction||null}, send_status:sendStatus, sent_at:now, actual_sent_at:actualSentAt, quality_gate_json:quality, raw_event_json:raw
    });
    const threadPatch:any={status:'awaiting_counterparty',external_provider:provider,last_message_at:now,next_action_at:body?.next_action_at||null};
    if(externalThreadId)threadPatch.external_thread_id=externalThreadId;
    if(provider==='instantly'&&sendingProfile?.external_campaign_id)threadPatch.external_campaign_id=sendingProfile.external_campaign_id;
    if(externalLeadId)threadPatch.external_lead_id=externalLeadId;
    if(sendStatus==='sent')threadPatch.last_outbound_at=now;
    await svc.entities.CommunicationThread.update(thread.id,threadPatch);
    await settlePaidOperation(svc,costReservation,{ok:true,usage_json:{provider_message_id:providerMessageId,thread_id:thread.id}});
    return Response.json({ ok:true, queued:sendStatus==='scheduled', message_id:message.id, provider_message_id:providerMessageId, provider, external_thread_id:externalThreadId, external_lead_id:externalLeadId });
  } catch (error:any) {
    console.error('commercialSendMessage failed', error);
    const safe=String(error?.message||'commercial_send_failed').slice(0,160);
    return Response.json({ ok:false, error:safe }, { status:Number(error?.status||500) });
  }
});
