import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { normalizeFounderMeetingPolicy, parseFounderMeetingCommand, normalizeMeetingOutcome } from '../../shared/founderMeeting.ts';

const confirmationFor = (action:string) => action === 'command' ? 'APPLY_FOUNDER_MEETING_COMMAND' : action === 'configure_policy' ? 'APPLY_FOUNDER_MEETING_POLICY' : action === 'record_outcome' ? 'RECORD_FOUNDER_MEETING_OUTCOME' : '';
const commandKey = () => `founder-meeting:${crypto.randomUUID()}`;

async function latestPolicy(svc:any) {
  const rows = await svc.entities.FounderMeetingPolicy.filter({ status:'active' }, '-approved_at', 5).catch(() => []);
  return rows[0] || null;
}

async function applyPolicy(svc:any, user:any, current:any, patch:any, source:string, auditKey:string) {
  const now = new Date().toISOString();
  const version = `founder-meetings-${Date.now()}`;
  const normalized = normalizeFounderMeetingPolicy({ ...(current || {}), ...patch, version, status:'active', approved_by:user.email, approved_at:now, created_at:now });
  const created = await svc.entities.FounderMeetingPolicy.create({
    policy_key:normalized.policy_key, version:normalized.version, status:normalized.status, mode:normalized.mode,
    allowed_meeting_types:normalized.allowed_meeting_types, allowed_relationship_types:normalized.allowed_relationship_types,
    minimum_expected_value_minor:normalized.minimum_expected_value_minor, minimum_escalation_score:normalized.minimum_escalation_score,
    daily_meeting_cap:normalized.daily_meeting_cap, weekly_meeting_cap:normalized.weekly_meeting_cap,
    minimum_notice_hours:normalized.minimum_notice_hours, default_duration_minutes:normalized.default_duration_minutes,
    preferred_start_hour:normalized.preferred_start_hour, preferred_end_hour:normalized.preferred_end_hour,
    timezone:normalized.timezone, blocked_weekdays:normalized.blocked_weekdays, paused_until:normalized.paused_until || undefined,
    auto_book_allowed:normalized.auto_book_allowed, explicit_request_priority:normalized.explicit_request_priority,
    approval_snapshot_json:{ source, command_key:auditKey, prior_version:current?.version || null }, approved_by:user.email, approved_at:now, created_at:now,
  });
  // Create-first avoids leaving the machine without an active policy if the
  // new persistence call fails. A stale prior row is safer than no policy;
  // latestPolicy deterministically selects the newly approved version.
  if (current?.id) await svc.entities.FounderMeetingPolicy.update(current.id, { status:'superseded' });
  return created;
}

export async function handleFounderMeetingAdmin(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ ok:false, error:'Forbidden' }, { status:403 });
    const svc = base44.asServiceRole;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'status');
    const current = await latestPolicy(svc);

    if (action === 'status') {
      const now = new Date().toISOString();
      const [upcoming, outcomes, recommendations, captureRequired] = await Promise.all([
        svc.entities.CommunicationThread.filter({ meeting_start_at:{ $gte:now }, meeting_status:{ $in:['booked','scheduling','proposed'] } }, 'meeting_start_at', 100).catch(() => []),
        svc.entities.CommunicationThread.filter({ meeting_status:'completed', post_meeting_status:'pending' }, '-meeting_end_at', 100).catch(() => []),
        svc.entities.CommunicationThread.filter({ conversation_state:{ $in:['HUMAN_MEETING_RECOMMENDED','MEETING_PROPOSED','WAITING_APPROVAL'] } }, '-last_message_at', 100).catch(() => []),
        svc.entities.CommunicationThread.filter({ meeting_end_at:{ $lte:now }, meeting_status:'booked' }, '-meeting_end_at', 100).catch(() => []),
      ]);
      return Response.json({ ok:true, policy:normalizeFounderMeetingPolicy(current || {}), policy_persisted:!!current, upcoming, outcomes_pending:outcomes, recommendations, capture_required:captureRequired.filter((item:any)=>!item.meeting_outcome_json) });
    }

    if (action === 'configure_policy' || action === 'command') {
      const key = String(body.command_key || commandKey());
      const parsed = action === 'command' ? parseFounderMeetingCommand(body.command, current || {}) : { ok:true, patch:body.policy || {}, matched:['structured_policy'] };
      if (!parsed.ok) return Response.json({ ok:false, error:parsed.error, deterministic_only:true }, { status:400 });
      let preview:any;
      try { preview = normalizeFounderMeetingPolicy({ ...(current || {}), ...parsed.patch, version:'preview', status:'active' }); }
      catch (error) { return Response.json({ ok:false, error:String(error?.message || error) }, { status:400 }); }
      const expected = confirmationFor(action);
      if (body.confirmation !== expected) {
        await svc.entities.FounderCommandAudit.create({ command_key:key, actor_email:user.email, intent:'founder_meeting_policy', action, scope_json:{ matched:parsed.matched }, risk_level:3, material:false, requires_confirmation:true, confirmed:false, preview_json:preview, status:'previewed', result_json:{}, policy_json:{ prior_version:current?.version || null }, created_at:new Date().toISOString() });
        return Response.json({ ok:true, requires_confirmation:true, confirmation:expected, command_key:key, matched:parsed.matched, preview });
      }
      const created = await applyPolicy(svc, user, current, parsed.patch, action, key);
      await svc.entities.FounderCommandAudit.create({ command_key:key, actor_email:user.email, intent:'founder_meeting_policy', action, scope_json:{ matched:parsed.matched }, risk_level:3, material:false, requires_confirmation:true, confirmed:true, preview_json:preview, status:'executed', result_json:{ policy_id:created.id, version:created.version }, policy_json:{ prior_version:current?.version || null }, created_at:new Date().toISOString() });
      await svc.entities.OperationalLog.create({ event_type:'founder_meeting_policy_changed', message:`Founder meeting policy ${created.version}`, data_json:{ command_key:key, source:action, matched:parsed.matched, mode:created.mode }, actor_email:user.email, created_at:new Date().toISOString() }).catch(() => null);
      return Response.json({ ok:true, policy:created, command_key:key });
    }

    if (action === 'record_outcome') {
      if (body.confirmation !== confirmationFor(action)) return Response.json({ ok:false, error:'confirmation_required', confirmation:confirmationFor(action) }, { status:400 });
      const thread = await svc.entities.CommunicationThread.get(String(body.thread_id || '')).catch(() => null);
      if (!thread || !thread.meeting_event_id) return Response.json({ ok:false, error:'booked_meeting_thread_required' }, { status:404 });
      let outcome:any;
      try { outcome = normalizeMeetingOutcome(body.outcome || {}); }
      catch (error) { return Response.json({ ok:false, error:String(error?.message || error) }, { status:400 }); }
      const now = new Date().toISOString();
      const requiresApproval = outcome.requires_approval.length > 0;
      let approval:any = null;
      if (requiresApproval) {
        const task = await svc.entities.AgentTask.create({ brand_id:thread.related_entity_type === 'Brand' ? thread.related_entity_id : '_platform', agent_name:'post_meeting_worker', task_type:'review_post_meeting_commitments', related_entity_type:'CommunicationThread', related_entity_id:thread.id, status:'waiting_approval', requires_approval:true, risk_level:4, input_summary:`Review post-meeting items requiring approval for ${thread.counterparty_name || thread.counterparty_email}`, output_summary:'Structured outcome captured; no commitment has been executed.', output_payload_json:{ outcome }, started_at:now });
        approval = await svc.entities.Approval.create({ brand_id:task.brand_id, agent_task_id:task.id, action_type:'post_meeting_commitment_review', related_entity_type:'CommunicationThread', related_entity_id:thread.id, risk_level:4, draft_content:`Meeting outcome captured. Items requiring approval:\n${outcome.requires_approval.join('\n')}`, draft_payload_json:{ thread_id:thread.id, outcome, execution:false }, status:'pending', expires_at:new Date(Date.now()+7*86400000).toISOString() });
        await svc.entities.AgentTask.update(task.id, { approval_id:approval.id });
      }
      await svc.entities.CommunicationThread.update(thread.id, { meeting_status:'completed', conversation_state:requiresApproval?'WAITING_APPROVAL':'MEETING_COMPLETED', meeting_outcome_json:outcome, meeting_outcome_captured_at:now, meeting_follow_up_due_at:outcome.follow_up_at || now, post_meeting_status:requiresApproval?'pending':'pending', automation_paused:requiresApproval, pause_reason:requiresApproval?'post_meeting_approval_required':null });
      await svc.entities.OperationalLog.create({ event_type:'FOUNDER_MEETING_OUTCOME_CAPTURED', message:`Meeting outcome: ${outcome.outcome}`, data_json:{ thread_id:thread.id, meeting_event_id:thread.meeting_event_id, outcome, approval_id:approval?.id || null }, actor_email:user.email, created_at:now }).catch(() => null);
      return Response.json({ ok:true, thread_id:thread.id, outcome, approval_id:approval?.id || null, ai_resume_allowed:!requiresApproval });
    }

    if (action === 'mark_no_show') {
      const thread = await svc.entities.CommunicationThread.get(String(body.thread_id || '')).catch(() => null);
      if (!thread?.meeting_event_id) return Response.json({ ok:false, error:'meeting_thread_required' }, { status:404 });
      const count = Number(thread.meeting_no_show_count || 0) + 1;
      const mayReschedule = count < 2;
      await svc.entities.CommunicationThread.update(thread.id, { meeting_status:'no_show', conversation_state:mayReschedule?'NURTURE':'PAUSED', meeting_no_show_count:count, post_meeting_status:mayReschedule?'pending':'not_applicable', automation_paused:!mayReschedule, pause_reason:mayReschedule?null:'repeated_meeting_no_show' });
      await svc.entities.OperationalLog.create({ event_type:'FOUNDER_MEETING_NO_SHOW', message:`Counterparty no-show ${count}`, data_json:{ thread_id:thread.id, may_reschedule:mayReschedule }, actor_email:user.email, created_at:new Date().toISOString() }).catch(() => null);
      return Response.json({ ok:true, count, may_reschedule:mayReschedule });
    }

    if (action === 'cancel_meeting') {
      const thread = await svc.entities.CommunicationThread.get(String(body.thread_id || '')).catch(() => null);
      if (!thread?.meeting_event_id) return Response.json({ ok:false, error:'meeting_thread_required' }, { status:404 });
      const result = await base44.functions.invoke('outlookMeetingCoordinator', { action:'cancel', thread_id:thread.id, reason:String(body.reason || 'Founder unavailable') });
      return Response.json(result?.data || result);
    }

    return Response.json({ ok:false, error:'unsupported_action', actions:['status','configure_policy','command','record_outcome','mark_no_show','cancel_meeting'] }, { status:400 });
  } catch (error) {
    console.error('founderMeetingAdmin failed', error);
    return Response.json({ ok:false, error:'founder_meeting_admin_failed', detail:String(error?.message || error) }, { status:500 });
  }
}
