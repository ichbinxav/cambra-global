import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { Webhook } from 'npm:svix';
import { classifyHardStop, commercialTimezone, computeInboundReplySchedule, normalizeEmail, policyIsActive, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';

function threadIdFromRecipients(to:any[]) {
  for (const raw of Array.isArray(to) ? to : []) {
    const email = normalizeEmail(raw);
    const m = email.match(/^reply\+([a-z0-9_-]+)@/i);
    if (m) return m[1];
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    const raw = await req.text();
    const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (!secret) return Response.json({ ok:false, error:'webhook_not_configured' }, { status:503 });
    let event:any;
    try {
      const wh = new Webhook(secret);
      event = wh.verify(raw, {
        'svix-id': req.headers.get('svix-id') || '',
        'svix-timestamp': req.headers.get('svix-timestamp') || '',
        'svix-signature': req.headers.get('svix-signature') || ''
      });
    } catch {
      return Response.json({ ok:false, error:'invalid_signature' }, { status:400 });
    }

    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const type = String(event?.type || '');
    const data = event?.data || {};
    const lifecycleId=String(data?.email_id||'');
    if(lifecycleId && ['email.delivered','email.bounced','email.complained','email.failed','email.suppressed'].includes(type)){const rows=await svc.entities.CommunicationMessage.filter({provider:'resend',provider_message_id:lifecycleId,direction:'outbound'},'-created_date',1).catch(()=>[]);if(rows.length){const status=type==='email.delivered'?'delivered':type==='email.bounced'?'bounced':type==='email.complained'?'complained':type==='email.suppressed'?'suppressed':'failed';await svc.entities.CommunicationMessage.update(rows[0].id,{send_status:status,raw_event_json:{...(rows[0].raw_event_json||{}),last_resend_event:type,last_resend_event_at:event?.created_at||new Date().toISOString()}}).catch(()=>null);}}

    if (['email.bounced','email.complained','email.suppressed'].includes(type)) {
      const emails = [...(Array.isArray(data?.to) ? data.to : []), data?.email].map(normalizeEmail).filter(Boolean);
      const reason = type === 'email.complained' ? 'complaint' : 'bounce';
      for (const email of new Set(emails)) {
        const existing = await svc.entities.ContactSuppression.filter({ email, active:true }, '-created_date', 1).catch(()=>[]);
        if (!existing.length) await svc.entities.ContactSuppression.create({ email, reason, source:'resend', source_message_id:String(data?.email_id || ''), active:true, suppressed_at:new Date().toISOString() });
        const threads = await svc.entities.CommunicationThread.filter({ counterparty_email:email }, '-last_message_at', 50).catch(()=>[]);
        for (const t of threads) await svc.entities.CommunicationThread.update(t.id, { status:'suppressed', automation_paused:true, pause_reason:reason }).catch(()=>null);
      }
      return Response.json({ ok:true, handled:type, suppressed:emails.length });
    }

    if (type !== 'email.received') return Response.json({ ok:true, ignored:type });
    const emailId = String(data?.email_id || '');
    if (!emailId) return Response.json({ ok:false, error:'email_id_missing' }, { status:400 });
    const duplicate = await svc.entities.CommunicationMessage.filter({ provider:'resend', provider_message_id:emailId }, '-created_date', 1).catch(()=>[]);
    if (duplicate.length) return Response.json({ ok:true, duplicate:true });

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) return Response.json({ ok:false, error:'resend_api_not_configured' }, { status:503 });
    const emailRes = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, { headers:{ Authorization:`Bearer ${resendKey}` } });
    const email = await emailRes.json().catch(()=>({}));
    if (!emailRes.ok) throw new Error(`resend_receive_fetch_failed:${emailRes.status}`);

    const threadId = threadIdFromRecipients(email?.to || data?.to || []);
    if (!threadId) {
      await svc.entities.OperationalLog.create({ event_type:'commercial_inbound_unroutable', message:'Inbound Resend email had no CAMBRA thread alias', data_json:{ email_id:emailId, from:normalizeEmail(email?.from), to:email?.to || [] }, created_at:new Date().toISOString() }).catch(()=>null);
      return Response.json({ ok:true, routed:false });
    }
    const thread = await svc.entities.CommunicationThread.get(threadId).catch(()=>null);
    if (!thread) return Response.json({ ok:true, routed:false, reason:'thread_not_found' });

    const now = new Date().toISOString();
    const receivedAt = String(email?.created_at || data?.created_at || event?.created_at || now);
    const policies=await svc.entities.CommercialPolicy.filter({policy_key:thread.policy_key,status:'active'},'-created_date',5).catch(()=>[]);
    const policy=policies.find((p:any)=>p.version===thread.policy_version&&policyIsActive(p))||policies.find((p:any)=>policyIsActive(p))||null;
    const timing=computeInboundReplySchedule(receivedAt,policy||{},emailId,commercialTimezone(thread,policy));
    const from = normalizeEmail(email?.from || data?.from);
    const text = sanitizeExternalText(email?.text || '', 12000);
    const hardStop = classifyHardStop(text || email?.subject || '');
    const msg = await svc.entities.CommunicationMessage.create({
      thread_id:thread.id, direction:'inbound', channel:'email', provider:'resend', provider_message_id:emailId,
      internet_message_id:String(email?.message_id || data?.message_id || ''), from_email:from,
      to_emails:Array.isArray(email?.to) ? email.to.map(normalizeEmail) : [], subject:sanitizeExternalText(email?.subject || data?.subject,300),
      text_body:text, html_body:sanitizeExternalText(email?.html || '',20000), attachments_json:Array.isArray(email?.attachments) ? email.attachments : [],
      headers_json:email?.headers || {}, classification:hardStop || null, send_status:'received', received_at:receivedAt, earliest_reply_at:timing.earliest_reply_at, scheduled_send_at:timing.scheduled_send_at,
      raw_event_json:{ type, event_created_at:event?.created_at || null }
    });
    await svc.entities.CommunicationThread.update(thread.id, { status:'awaiting_cambra', last_inbound_at:receivedAt, last_message_at:receivedAt, next_action_at:timing.scheduled_send_at, counterparty_email:from || thread.counterparty_email });

    if (hardStop === 'unsubscribe' || hardStop === 'complaint') {
      if (from) {
        const rows = await svc.entities.ContactSuppression.filter({ email:from, active:true }, '-created_date', 1).catch(()=>[]);
        if (!rows.length) await svc.entities.ContactSuppression.create({ email:from, reason:hardStop === 'unsubscribe' ? 'opt_out':'complaint', source:'inbound_email', source_message_id:msg.id, active:true, suppressed_at:now });
      }
      await svc.entities.CommunicationThread.update(thread.id, { status:'suppressed', automation_paused:true, pause_reason:hardStop });
      return Response.json({ ok:true, routed:true, hard_stop:hardStop });
    }

    const internalSecret = Deno.env.get('INTERNAL_CALL_SECRET') || '';
    const invoke = await svc.functions.invoke('commercialReplyAgent', { thread_id:thread.id, message_id:msg.id, internal_secret:internalSecret }).catch((e:any)=>({ data:{ ok:false, error:String(e?.message || e) } }));
    return Response.json({ ok:true, routed:true, message_id:msg.id, reply_processing:invoke?.data || invoke || null });
  } catch (error) {
    console.error('resendInboundWebhook failed', error);
    return Response.json({ ok:false, error:'inbound_processing_failed' }, { status:500 });
  }
});
