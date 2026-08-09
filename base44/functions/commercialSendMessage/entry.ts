import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { normalizeEmail, policyIsActive, routineActionAllowed, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';

function noLlmTics(text:string) {
  const t = String(text || '');
  if (!t.trim() || t.length > 5000) return false;
  if (/\b(as an ai|language model|i hope this email finds you well|delve into|revolutionize|game-changer)\b/i.test(t)) return false;
  return true;
}

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
    if (!noLlmTics(text)) return Response.json({ ok:false, error:'communication_quality_gate_failed' }, { status:422 });

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
    const automatic = gate.isInternal && !gate.isAdmin;
    if (automatic) {
      if (!policyIsActive(policy)) return Response.json({ ok:false, error:'active_policy_required' }, { status:409 });
      const authz = routineActionAllowed(policy, action, classification);
      if (!authz.allowed) return Response.json({ ok:false, error:authz.reason, escalation_required:true }, { status:409 });
      if (thread.automation_paused) return Response.json({ ok:false, error:'thread_automation_paused' }, { status:409 });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return Response.json({ ok:false, error:'resend_not_configured', setup_required:true }, { status:503 });
    const fromAddress = Deno.env.get('RESEND_FROM') || 'CAMBRA <hello@contact.cambra.global>';
    const inboundDomain = Deno.env.get('RESEND_INBOUND_DOMAIN') || 'contact.cambra.global';
    const replyTo = `reply+${thread.id}@${inboundDomain}`;
    const idempotency = String(body?.idempotency_key || `cambra:${thread.id}:${action}:${thread.last_inbound_at || thread.last_message_at || 'start'}`);

    const existing = await svc.entities.CommunicationMessage.filter({ thread_id:thread.id, direction:'outbound', provider_message_id:idempotency }, '-created_date', 1).catch(()=>[]);
    if (existing.length) return Response.json({ ok:true, duplicate:true, message_id:existing[0].id });

    const res = await fetch('https://api.resend.com/emails', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${resendKey}`, 'Idempotency-Key':idempotency },
      body:JSON.stringify({ from:fromAddress, to:[to], reply_to:replyTo, subject, text,
        tags:[{name:'thread_id',value:thread.id},{name:'engine',value:thread.engine}] })
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(`resend_send_failed:${res.status}`);
    const now = new Date().toISOString();
    const message = await svc.entities.CommunicationMessage.create({
      thread_id:thread.id, direction:'outbound', channel:'email', provider:'resend',
      provider_message_id:String(data?.id || idempotency), from_email:fromAddress, to_emails:[to], subject, text_body:text,
      classification, agent_name:String(body?.agent_name || 'commercial_orchestrator'), policy_key:thread.policy_key,
      policy_version:thread.policy_version, approval_id:body?.approval_id || null, send_status:'sent', sent_at:now,
      raw_event_json:{ resend_id:data?.id || null, idempotency_key:idempotency }
    });
    await svc.entities.CommunicationThread.update(thread.id, { status:'awaiting_counterparty', last_outbound_at:now, last_message_at:now, next_action_at:body?.next_action_at || null });
    return Response.json({ ok:true, message_id:message.id, provider_message_id:data?.id || null });
  } catch (error) {
    console.error('commercialSendMessage failed', error);
    return Response.json({ ok:false, error:'commercial_send_failed' }, { status:500 });
  }
});
