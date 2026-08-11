import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { normalizeEmail, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';
import { assertOperationAllowed } from '../../shared/operationalControl.ts';
import { buildFounderMeetingBrief, founderMeetingCapacityDecision, normalizeFounderMeetingPolicy } from '../../shared/founderMeeting.ts';

const SLOT_MS_MINIMUM = 15 * 60 * 1000;
const roundUp = (ms:number, slotMs:number) => Math.ceil(ms / slotMs) * slotMs;

function zonedParts(date:Date, timeZone:string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(date);
  const get = (type:string) => parts.find((part) => part.type === type)?.value || '';
  return { weekday:get('weekday'), hour:Number(get('hour')), minute:Number(get('minute')) };
}

function isPreferredSlot(date:Date, policy:any) {
  const parts = zonedParts(date, policy.timezone);
  const dayIndex = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  return !policy.blocked_weekdays.includes(dayIndex) && parts.hour >= policy.preferred_start_hour && parts.hour < policy.preferred_end_hour;
}

function overlaps(start:number, end:number, busy:any[]) {
  return busy.some((event:any) => start < Date.parse(event.end?.dateTime || event.end) && end > Date.parse(event.start?.dateTime || event.start));
}

async function activePolicy(svc:any) {
  const rows = await svc.entities.FounderMeetingPolicy.filter({ status:'active' }, '-approved_at', 5).catch(() => []);
  return normalizeFounderMeetingPolicy(rows[0] || {});
}

async function graphConnection(svc:any) {
  const connection = await svc.connectors.getConnection('outlook').catch(() => ({ accessToken:null }));
  return connection?.accessToken || null;
}

Deno.serve(async (req) => {
  let task:any = null;
  try {
    const base44 = createClientFromRequest(req);
    const originalBody = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, originalBody);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;
    await assertOperationAllowed(svc, 'communications');

    let body:any = originalBody;
    let approvedByFounder = false;
    let approval:any = null;
    if (body.mode === 'execute') {
      approval = await svc.entities.Approval.get(String(body.approval_id || '')).catch(() => null);
      if (!approval || approval.action_type !== 'schedule_founder_meeting' || approval.status !== 'approved') return Response.json({ ok:false, error:'approved_founder_meeting_required' }, { status:403 });
      body = { ...(approval.draft_payload_json || {}), mode:'execute', approval_id:approval.id, selected_slot:body.selected_slot || approval.draft_payload_json?.selected_slot };
      approvedByFounder = true;
      task = approval.agent_task_id ? await svc.entities.AgentTask.get(approval.agent_task_id).catch(() => null) : null;
    }

    const thread = await svc.entities.CommunicationThread.get(String(body.thread_id || '')).catch(() => null);
    if (!thread || !['merchant_acquisition','partner_acquisition','provider_negotiation','aggregate_procurement'].includes(thread.engine)) return Response.json({ ok:false, error:'schedulable_commercial_thread_required' }, { status:400 });

    if (body.action === 'cancel') {
      if (!thread.meeting_event_id) return Response.json({ ok:true, cancelled:false, reason:'meeting_not_booked' });
      const token = await graphConnection(svc);
      if (!token) return Response.json({ ok:false, error:'outlook_connector_required', setup_required:true }, { status:409 });
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(thread.meeting_event_id)}`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` } });
      if (!response.ok && response.status !== 404) return Response.json({ ok:false, error:`outlook_event_cancel_failed:${response.status}` }, { status:502 });
      const now = new Date().toISOString();
      await svc.entities.CommunicationThread.update(thread.id, { meeting_status:'cancelled', conversation_state:'AI_RESUMED', automation_paused:false, pause_reason:null, post_meeting_status:'not_applicable' });
      await svc.entities.OperationalLog.create({ event_type:'FOUNDER_MEETING_CANCELLED', message:'Founder meeting cancelled', data_json:{ thread_id:thread.id, meeting_event_id:thread.meeting_event_id, reason:sanitizeExternalText(body.reason || 'Founder unavailable', 300) }, created_at:now }).catch(() => null);
      return Response.json({ ok:true, cancelled:true, thread_id:thread.id });
    }

    if (thread.meeting_event_id && thread.meeting_status === 'booked') return Response.json({ ok:true, already_booked:true, event_id:thread.meeting_event_id, start:thread.meeting_start_at, end:thread.meeting_end_at });
    const attendee = normalizeEmail(body.attendee_email || thread.counterparty_email);
    if (!attendee) return Response.json({ ok:false, error:'attendee_email_required' }, { status:400 });

    const policy = await activePolicy(svc);
    if (policy.status !== 'active' || policy.mode === 'DISABLED' || (policy.paused_until && Date.parse(policy.paused_until) > Date.now())) return Response.json({ ok:false, error:'founder_meeting_policy_paused' }, { status:409 });
    if (!approvedByFounder && !(policy.mode === 'AUTO_BOOK_WITHIN_POLICY' && policy.auto_book_allowed && body.policy_authorized === true)) return Response.json({ ok:false, error:'founder_approval_required', policy_mode:policy.mode }, { status:409 });
    if (!policy.allowed_meeting_types.includes(String(body.meeting_type || 'MERCHANT_SALES_CALL'))) return Response.json({ ok:false, error:'meeting_type_not_allowed' }, { status:409 });

    const meetings = await svc.entities.CommunicationThread.filter({ meeting_start_at:{ $ne:null } }, '-meeting_start_at', 200).catch(() => []);
    const capacity = founderMeetingCapacityDecision(policy, meetings, new Date());
    if (!capacity.allowed) return Response.json({ ok:false, error:'founder_meeting_capacity_reached', blockers:capacity.blockers, capacity }, { status:409 });

    if (!task) task = await svc.entities.AgentTask.create({ brand_id:thread.related_entity_type === 'Brand' ? thread.related_entity_id : '_platform', agent_name:'founder_meeting', task_type:'schedule_founder_meeting', related_entity_type:'CommunicationThread', related_entity_id:thread.id, status:'running', requires_approval:!approvedByFounder, risk_level:3, input_summary:`Schedule founder meeting with ${attendee}`, started_at:new Date().toISOString() });
    else await svc.entities.AgentTask.update(task.id, { status:'running' });

    const token = await graphConnection(svc);
    if (!token) {
      await svc.entities.AgentTask.update(task.id, { status:'waiting_input', output_summary:'Outlook founder calendar connection unavailable', output_payload_json:{ blocker:'outlook_connector_required' }, completed_at:new Date().toISOString() });
      return Response.json({ ok:false, error:'outlook_connector_required', setup_required:true, task_id:task.id }, { status:409 });
    }

    const meResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', { headers:{ Authorization:`Bearer ${token}` } });
    const me = await meResponse.json().catch(() => ({}));
    if (!meResponse.ok) throw new Error(`outlook_me_failed:${meResponse.status}`);
    const organizer = normalizeEmail(me.mail || me.userPrincipalName);
    const durationMs = Math.max(SLOT_MS_MINIMUM, policy.default_duration_minutes * 60 * 1000);
    const startWindow = new Date(roundUp(Date.now() + policy.minimum_notice_hours * 3600000, SLOT_MS_MINIMUM));
    const endWindow = new Date(startWindow.getTime() + 14 * 86400000);
    const viewUrl = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startWindow.toISOString())}&endDateTime=${encodeURIComponent(endWindow.toISOString())}&$select=start,end,isCancelled&$top=1000`;
    const viewResponse = await fetch(viewUrl, { headers:{ Authorization:`Bearer ${token}`,'Prefer':`outlook.timezone="${policy.timezone}"` } });
    const view = await viewResponse.json().catch(() => ({}));
    if (!viewResponse.ok) throw new Error(`outlook_calendar_view_failed:${viewResponse.status}`);
    const busy = (Array.isArray(view.value) ? view.value : []).filter((event:any) => !event.isCancelled);
    const slots:string[] = [];
    for (let cursor=roundUp(startWindow.getTime(), SLOT_MS_MINIMUM); cursor+durationMs<=endWindow.getTime() && slots.length<3; cursor+=30*60*1000) {
      const date = new Date(cursor);
      if (!isPreferredSlot(date, policy) || overlaps(cursor, cursor+durationMs, busy)) continue;
      slots.push(date.toISOString());
    }
    if (!slots.length) {
      await svc.entities.AgentTask.update(task.id, { status:'waiting_input', output_summary:'No real founder calendar slot available inside policy', output_payload_json:{ blocker:'no_calendar_slot', policy_version:policy.version }, completed_at:new Date().toISOString() });
      return Response.json({ ok:false, error:'no_calendar_slot', task_id:task.id }, { status:409 });
    }

    if (body.action === 'availability') return Response.json({ ok:true, slots, timezone:policy.timezone, duration_minutes:policy.default_duration_minutes, privacy:'Only free slots are returned; calendar event details are never exposed.' });
    const selected = body.selected_slot && slots.includes(String(body.selected_slot)) ? String(body.selected_slot) : slots[0];
    const start = new Date(selected);
    const end = new Date(start.getTime()+durationMs);
    const meetingType = String(body.meeting_type || (thread.engine === 'provider_negotiation' || thread.engine === 'aggregate_procurement' ? 'PROVIDER_NEGOTIATION_CALL' : thread.engine === 'partner_acquisition' ? 'PARTNERSHIP_CALL' : 'MERCHANT_SALES_CALL'));
    const brief = buildFounderMeetingBrief(thread, body.context || {});
    const transactionId = `cambra-founder-${thread.id}-${start.toISOString().slice(0,16)}`.replace(/[^a-zA-Z0-9-]/g,'').slice(0,120);
    const subject = sanitizeExternalText(body.subject || 'CAMBRA — Conversation with Xavi', 160);
    const eventResponse = await fetch('https://graph.microsoft.com/v1.0/me/events', { method:'POST', headers:{ Authorization:`Bearer ${token}`,'Content-Type':'application/json' }, body:JSON.stringify({ subject, body:{ contentType:'text', content:'Conversation with Xavi, Founder & CEO of CAMBRA. Commercial and confidential details remain in CAMBRA.' }, start:{ dateTime:start.toISOString(),timeZone:'UTC' }, end:{ dateTime:end.toISOString(),timeZone:'UTC' }, attendees:[{ emailAddress:{ address:attendee,name:sanitizeExternalText(thread.counterparty_name || attendee,120) },type:'required' }], allowNewTimeProposals:true, transactionId }) });
    const event = await eventResponse.json().catch(() => ({}));
    if (!eventResponse.ok) throw new Error(`outlook_event_create_failed:${eventResponse.status}`);

    const now = new Date().toISOString();
    await svc.entities.CommunicationThread.update(thread.id, { status:'awaiting_cambra', conversation_state:'MEETING_BOOKED', automation_paused:true, pause_reason:'founder_meeting_booked', next_action_at:null, meeting_event_id:event.id || '', meeting_start_at:start.toISOString(), meeting_end_at:end.toISOString(), meeting_status:'booked', meeting_type:meetingType, meeting_mode:policy.mode, meeting_classification:['PROVIDER_NEGOTIATION_CALL','PARTNERSHIP_CALL','STRATEGIC_RELATIONSHIP_CALL','LEGAL_COMMERCIAL_CALL'].includes(meetingType)?'strategic':'commercial', founder_required:true, founder_meeting_policy_version:policy.version, founder_meeting_policy_snapshot_json:{ mode:policy.mode, daily_cap:policy.daily_meeting_cap, weekly_cap:policy.weekly_meeting_cap, minimum_notice_hours:policy.minimum_notice_hours }, meeting_brief_json:brief, post_meeting_status:'pending', summary:`Founder meeting booked ${start.toISOString()} · ${attendee}` });
    if (thread.engine === 'merchant_acquisition' && thread.lead_id) await svc.entities.OutboundLead.update(thread.lead_id, { stage:'meeting', next_action:`Founder meeting booked ${start.toISOString()}` }).catch(() => null);
    if (thread.engine === 'partner_acquisition' && thread.related_entity_id) await svc.entities.PartnerProspect.update(thread.related_entity_id, { stage:'meeting', next_action_at:null }).catch(() => null);
    await svc.entities.OperationalLog.create({ event_type:'FOUNDER_MEETING_BOOKED', message:`Founder meeting with ${attendee}`, data_json:{ thread_id:thread.id, event_id:event.id || null, start:start.toISOString(), end:end.toISOString(), organizer, attendee, meeting_type:meetingType, policy_version:policy.version, approved_by_founder:approvedByFounder }, created_at:now }).catch(() => null);
    await svc.entities.AgentTask.update(task.id, { status:'completed', output_summary:`Founder meeting booked ${start.toISOString()} with ${attendee}`, output_payload_json:{ event_id:event.id || null,start:start.toISOString(),end:end.toISOString(),organizer,attendee,meeting_type:meetingType,policy_version:policy.version }, completed_at:now });
    return Response.json({ ok:true, task_id:task.id, event_id:event.id || null, start:start.toISOString(), end:end.toISOString(), organizer, attendee, meeting_type:meetingType, meeting_brief:brief, policy_version:policy.version });
  } catch (error) {
    console.error('outlookMeetingCoordinator failed', error);
    if (task?.id) {
      try { const base44=createClientFromRequest(req); await base44.asServiceRole.entities.AgentTask.update(task.id, { status:'failed', error:'outlook_meeting_failed', completed_at:new Date().toISOString() }); } catch {}
    }
    return Response.json({ ok:false, error:'outlook_meeting_failed', detail:String(error?.message || error), task_id:task?.id || null }, { status:500 });
  }
});
