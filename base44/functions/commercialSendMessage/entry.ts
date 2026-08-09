import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { communicationQuality, commercialTimezone, isBusinessHour, normalizeEmail, policyIsActive, routineActionAllowed, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';


const CAMBRA_LOGO='https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d62c05e68_c-mark-voltio2x.png';
const CAMBRA_WEB='https://www.cambra.global';
function signatureIdentity(provider:string, engine:string){
  if(provider==='outlook') return {name:'Xavi M. Contero',title:'Founder, CAMBRA',email:'xavi@cambra.global'};
  if(['provider_negotiation','aggregate_procurement'].includes(engine)) return {name:'CAMBRA Operations',title:'Infrastructure Operations',email:'operations@contact.cambra.global'};
  return {name:'CAMBRA Payments',title:'Infrastructure Intelligence',email:'payments@contact.cambra.global'};
}
function cambraSignature(provider:string, engine:string){const i=signatureIdentity(provider,engine);return `${i.name}\n${i.title}\nMail: ${i.email}\nWeb: www.cambra.global`;}
function ensureSignature(text:string, signature:string){const t=String(text||'').trimEnd();if(t.includes(signature))return t;return `${t}\n\n${signature}`;}
function escapeHtml(v:string){return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function signedHtml(text:string,provider:string,engine:string){const i=signatureIdentity(provider,engine);const body=escapeHtml(String(text||'').trim()).replace(/\n/g,'<br>');return `<!doctype html><html><body><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#171717">${body}<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-collapse:collapse"><tr><td style="padding-right:12px;vertical-align:top"><img src="${CAMBRA_LOGO}" width="38" height="38" alt="CAMBRA" style="display:block;border:0;width:38px;height:38px"></td><td style="vertical-align:top;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.45;color:#555"><strong style="font-size:13px;color:#171717">${escapeHtml(i.name)}</strong><br>${escapeHtml(i.title)}<br>Mail: <a href="mailto:${escapeHtml(i.email)}" style="color:#171717;text-decoration:none">${escapeHtml(i.email)}</a><br>Web: <a href="${CAMBRA_WEB}" style="color:#171717;text-decoration:none">www.cambra.global</a></td></tr></table></div></body></html>`;}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;

    const threadId = String(body?.thread_id || '');
    const action = String(body?.action || 'routine_reply');
    const classification = String(body?.classification || 'question');
    const subject = sanitizeExternalText(body?.subject, 300);
    const text = sanitizeExternalText(body?.text, 5000);
    if (!threadId || !subject || !text) return Response.json({ ok:false, error:'thread_subject_text_required' }, { status:400 });

    const thread = await svc.entities.CommunicationThread.get(threadId).catch(()=>null);
    if (!thread || ['closed','suppressed'].includes(thread.status)) return Response.json({ ok:false, error:'thread_unavailable' }, { status:409 });
    const to = normalizeEmail(body?.to || thread.counterparty_email);
    if (!to) return Response.json({ ok:false, error:'recipient_required' }, { status:400 });

    const suppressions = await svc.entities.ContactSuppression.filter({ email:to, active:true }, '-created_date', 1).catch(()=>[]);
    if (suppressions.length) {
      await svc.entities.CommunicationThread.update(thread.id, { status:'suppressed', automation_paused:true, pause_reason:'contact_suppressed' }).catch(()=>null);
      return Response.json({ ok:false, error:'contact_suppressed' }, { status:409 });
    }

    const policies = await svc.entities.CommercialPolicy.filter({ policy_key:thread.policy_key, status:'active' }, '-created_date', 5).catch(()=>[]);
    const policy = policies.find((p:any)=>p.version === thread.policy_version) || policies[0] || null;
    const manualOverride = gate.isAdmin && body?.manual_override === true;
    const timezone = commercialTimezone(thread, policy);
    const automatic = !manualOverride;
    if (automatic) {
      if (!policyIsActive(policy)) return Response.json({ ok:false, error:'active_policy_required' }, { status:409 });
      const authz = routineActionAllowed(policy, action, classification);
      if (!authz.allowed) return Response.json({ ok:false, error:authz.reason, escalation_required:true }, { status:409 });
      if (thread.automation_paused) return Response.json({ ok:false, error:'thread_automation_paused' }, { status:409 });
      if (!gate.isInternal) return Response.json({ ok:false, error:'internal_autonomy_proof_required' }, { status:403 });
      if (!isBusinessHour(policy,new Date(),timezone)) return Response.json({ok:false,error:'outside_business_hours'},{status:409});
      const inboundId=String(body?.in_reply_to_message_id||'');
      if(inboundId){ const inbound=await svc.entities.CommunicationMessage.get(inboundId).catch(()=>null); if(!inbound||inbound.thread_id!==thread.id||inbound.direction!=='inbound')return Response.json({ok:false,error:'invalid_inbound_reply_reference'},{status:409}); const earliest=Date.parse(inbound.earliest_reply_at||''); const scheduled=Date.parse(inbound.scheduled_send_at||''); const nowMs=Date.now(); if(!Number.isFinite(earliest)||nowMs<earliest)return Response.json({ok:false,error:'minimum_reply_delay_not_elapsed',earliest_reply_at:inbound.earliest_reply_at},{status:409}); if(Number.isFinite(scheduled)&&nowMs<scheduled)return Response.json({ok:false,error:'scheduled_send_not_due',scheduled_send_at:inbound.scheduled_send_at},{status:409}); }
    }

    const previousOut=await svc.entities.CommunicationMessage.filter({thread_id:thread.id,direction:'outbound'},'-created_date',6).catch(()=>[]);
    const quality=communicationQuality(text,{previous_outbound:previousOut.map((m:any)=>String(m.text_body||''))});
    if(!quality.ok)return Response.json({ok:false,error:'communication_quality_gate_failed',quality},{status:422});

    const signatureProvider=String((body?.sending_profile_key||thread.sending_profile_key||'')).startsWith('outlook:')?'outlook':'resend';const signedText=ensureSignature(text,cambraSignature(signatureProvider,String(thread.engine||'')));const signedHTML=signedHtml(text,signatureProvider,String(thread.engine||''));

    const idempotency = String(body?.idempotency_key || `cambra:${thread.id}:${action}:${thread.last_inbound_at || thread.last_message_at || 'start'}`);
    const existing = await svc.entities.CommunicationMessage.filter({ thread_id:thread.id, direction:'outbound', idempotency_key:idempotency }, '-created_date', 1).catch(()=>[]);
    if (existing.length) return Response.json({ ok:true, duplicate:true, message_id:existing[0].id, provider:existing[0].provider || null });

    const now = new Date().toISOString();
    const requestedProfileKey=String(body?.sending_profile_key||thread.sending_profile_key||'').trim();
    const profiles=requestedProfileKey?await svc.entities.OutboundSendingProfile.filter({profile_key:requestedProfileKey},'-created_date',1).catch(()=>[]):[];
    const sendingProfile=profiles[0]||null;
    if(requestedProfileKey&&!sendingProfile)return Response.json({ok:false,error:'sending_profile_not_found'},{status:409});
    const acquisitionAction=['initial_outreach','partner_outreach'].includes(action);
    if(acquisitionAction&&!manualOverride){
      const controls=await svc.entities.OutboundControl.filter({control_key:'global'},'-created_date',1).catch(()=>[]);const control=controls[0]||null;
      if(!control?.acquisition_enabled)return Response.json({ok:false,error:'outbound_master_paused'},{status:409});
      if(!sendingProfile)return Response.json({ok:false,error:'sending_profile_required'},{status:409});
      if(sendingProfile.status==='paused')return Response.json({ok:false,error:'sending_profile_paused'},{status:409});
      if(sendingProfile.provider==='outlook'&&!control.premium_outlook_enabled)return Response.json({ok:false,error:'premium_outlook_paused'},{status:409});
      if(sendingProfile.provider==='resend'&&!control.volume_resend_enabled)return Response.json({ok:false,error:'volume_resend_paused'},{status:409});
      const day=new Date();day.setUTCHours(0,0,0,0);const sent=await svc.entities.CommunicationMessage.filter({direction:'outbound',sending_profile_key:sendingProfile.profile_key,sent_at:{$gte:day.toISOString()}},'-sent_at',Math.min(Number(sendingProfile.current_daily_cap||1)+5,550)).catch(()=>[]);
      if(sent.length>=Number(sendingProfile.current_daily_cap||0))return Response.json({ok:false,error:'sending_profile_daily_cap_reached',profile:requestedProfileKey,cap:sendingProfile.current_daily_cap},{status:409});
    } else if(sendingProfile&&sendingProfile.status==='paused'&&!manualOverride){return Response.json({ok:false,error:'sending_profile_paused'},{status:409});}
    let provider=sendingProfile?.provider==='resend'?'resend':'outlook'; let providerMessageId:any=null; let fromAddress=''; let externalThreadId=thread.external_thread_id||null; let raw:any={idempotency_key:idempotency,sending_profile_key:sendingProfile?.profile_key||null};
    const outlook = await svc.connectors.getConnection('outlook').catch(()=>({accessToken:null}));
    if (provider==='outlook' && outlook?.accessToken) {
      const meRes=await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName',{headers:{Authorization:`Bearer ${outlook.accessToken}`}});const me=await meRes.json().catch(()=>({}));if(!meRes.ok)throw new Error(`outlook_me_failed:${meRes.status}`);fromAddress=normalizeEmail(me.mail||me.userPrincipalName);
      const draftRes=await fetch('https://graph.microsoft.com/v1.0/me/messages',{method:'POST',headers:{Authorization:`Bearer ${outlook.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({subject,body:{contentType:'HTML',content:signedHTML},toRecipients:[{emailAddress:{address:to}}],internetMessageHeaders:[{name:'X-CAMBRA-Thread',value:thread.id}]})});const draft=await draftRes.json().catch(()=>({}));if(!draftRes.ok)throw new Error(`outlook_draft_failed:${draftRes.status}`);
      const sendRes=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(String(draft.id))}/send`,{method:'POST',headers:{Authorization:`Bearer ${outlook.accessToken}`}});if(!sendRes.ok)throw new Error(`outlook_send_failed:${sendRes.status}`);providerMessageId=draft.id||null;externalThreadId=draft.conversationId||externalThreadId;raw={...raw,outlook_message_id:draft.id||null,conversation_id:draft.conversationId||null};
    } else {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) return Response.json({ ok:false, error:'commercial_email_not_configured', setup_required:true }, { status:503 });
      provider='resend';const resendIdentity=signatureIdentity('resend',String(thread.engine||''));const from=sendingProfile?.from_address?`${resendIdentity.name} <${sendingProfile.from_address}>`:(Deno.env.get('RESEND_FROM')||`${resendIdentity.name} <${resendIdentity.email}>`);fromAddress=String(sendingProfile?.from_address||resendIdentity.email);const inboundDomain=Deno.env.get('RESEND_INBOUND_DOMAIN')||'contact.cambra.global';const replyTo=`reply+${thread.id}@${inboundDomain}`;
      const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${resendKey}`,'Idempotency-Key':idempotency},body:JSON.stringify({from,to:[to],reply_to:replyTo,subject,text:signedText,html:signedHTML,tags:[{name:'thread_id',value:thread.id},{name:'engine',value:thread.engine}]})});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(`resend_send_failed:${res.status}`);providerMessageId=data?.id||null;raw={...raw,resend_id:data?.id||null};
    }
    const message = await svc.entities.CommunicationMessage.create({
      thread_id:thread.id, direction:'outbound', channel:'email', provider, provider_message_id:String(providerMessageId||''), idempotency_key:idempotency, sending_profile_key:sendingProfile?.profile_key||thread.sending_profile_key||null,
      from_email:fromAddress, to_emails:[to], subject, text_body:signedText, classification, agent_name:String(body?.agent_name || 'commercial_orchestrator'), policy_key:thread.policy_key,
      policy_version:thread.policy_version, approval_id:body?.approval_id || null, send_status:'sent', sent_at:now, actual_sent_at:now, quality_gate_json:quality, raw_event_json:raw
    });
    await svc.entities.CommunicationThread.update(thread.id, { status:'awaiting_counterparty', external_thread_id:externalThreadId, last_outbound_at:now, last_message_at:now, next_action_at:body?.next_action_at || null });
    return Response.json({ ok:true, message_id:message.id, provider_message_id:providerMessageId, provider, external_thread_id:externalThreadId });
  } catch (error) {
    console.error('commercialSendMessage failed', error);
    return Response.json({ ok:false, error:'commercial_send_failed' }, { status:500 });
  }
});
