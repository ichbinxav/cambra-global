// CAMP-C5 (2026-08-16) — Conversations admin read model
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C5). No Deno SDK import here, so
// behavior tests can invoke the handler directly (house pattern).
//
// This route is READ + DRAFT ONLY. It never sends and never mutates a thread's
// commercial outcome; takeover/pause actions land in C6 with their own
// preview/confirm discipline.
import { readRuntimeRows, requireRuntimeSource, runtimeSourceCoverage } from './runtimeSourceRead.ts';
import { projectThreadStatuses } from './campaignsCore.ts';
import { evaluateAutonomyDecision } from './conversationResolution.ts';

const clean = (value: any, max = 240) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

/** Queue → predicate over the projected thread (spec §10.1). */
const QUEUE_FILTERS: Record<string, (row: any) => boolean> = {
  all: () => true,
  unread: (row) => Number(row.unread_count || 0) > 0,
  needs_human: (row) => ['NEEDS_HUMAN', 'ESCALATED', 'REVIEW_REQUIRED'].includes(row.operational_status),
  ai_handling: (row) => ['AI_HANDLING', 'AI_TRIAGE'].includes(row.operational_status),
  waiting_on_us: (row) => row.operational_status === 'WAITING_ON_US',
  waiting_on_them: (row) => row.operational_status === 'WAITING_ON_COUNTERPARTY',
  escalated: (row) => row.operational_status === 'ESCALATED',
  review_required: (row) => row.operational_status === 'REVIEW_REQUIRED',
};

/** Projects a stored thread for the list/detail views. */
export function projectThreadSummary(row: any) {
  const statuses = projectThreadStatuses(row);
  return {
    id: row?.id ?? null,
    thread_key: clean(row?.thread_key) || null,
    engine: clean(row?.engine) || null,
    counterparty_email: clean(row?.counterparty_email) || null,
    counterparty_name: clean(row?.counterparty_name) || null,
    company_name: clean(row?.company_name) || null,
    relationship_type: clean(row?.relationship_type) || null,
    language: clean(row?.language) || null,
    market_jurisdiction: clean(row?.market_jurisdiction) || null,
    campaign_id: clean(row?.campaign_id) || null,
    enrollment_id: clean(row?.enrollment_id) || null,
    commercial_status: statuses.commercial_status,
    operational_status: statuses.operational_status,
    status_derived_from_legacy: statuses.derived_from_legacy,
    owner_type: clean(row?.owner_type) || (clean(row?.human_takeover_at) ? 'HUMAN' : 'CAMBRA'),
    owner_id: clean(row?.owner_id) || null,
    ai_mode: clean(row?.ai_mode) || null,
    unread_count: Number(row?.unread_count || 0),
    last_message_at: row?.last_message_at || null,
    next_action_due_at: row?.next_action_due_at || null,
    human_takeover_at: row?.human_takeover_at || null,
    automation_paused: row?.automation_paused === true,
    last_message_preview: clean(row?.summary, 240) || null,
  };
}

export async function handleConversationAdminAction(user: any, body: any, svc: any): Promise<Response> {
  if (!user || user.role !== 'admin') return Response.json({ ok: false, error: 'admin_required' }, { status: 403 });
  const action = String(body?.action || 'list');

  if (action === 'list') {
    const read = await readRuntimeRows({
      source: 'conversation_thread_list', limit: 500,
      read: () => svc.entities.CommunicationThread.list('-last_message_at', 500),
    });
    const available = read.status !== 'UNAVAILABLE';
    const queue = String(body?.queue || 'all');
    const predicate = QUEUE_FILTERS[queue];
    if (!predicate) {
      return Response.json({ ok: false, error: 'unsupported_queue', supported_queues: Object.keys(QUEUE_FILTERS) }, { status: 400 });
    }
    const projected = available ? (read.value || []).map(projectThreadSummary) : [];
    const items = projected.filter(predicate);
    return Response.json({
      ok: true,
      items,
      total: projected.length,
      returned: items.length,
      queue,
      data_status: read.status,
      blockers: available ? [] : ['communication_thread_source_unavailable'],
      source_coverage: runtimeSourceCoverage({ threads: read }),
      external_send_performed: false,
    }, { status: available ? 200 : 503 });
  }

  if (action === 'detail') {
    const threadId = clean(body?.thread_id);
    if (!threadId) return Response.json({ ok: false, error: 'thread_id_required' }, { status: 400 });
    const threadRead = await readRuntimeRows({
      source: 'conversation_thread_authority',
      read: () => svc.entities.CommunicationThread.filter({ id: threadId }, '-last_message_at', 2),
    });
    const rows = requireRuntimeSource(threadRead);
    if (rows.length > 1) return Response.json({ ok: false, error: 'thread_authority_ambiguous' }, { status: 409 });
    const thread = rows[0];
    if (!thread) return Response.json({ ok: false, error: 'thread_not_found' }, { status: 404 });

    const [messageRead, emergencyRead] = await Promise.all([
      readRuntimeRows({
        source: 'conversation_messages', limit: 200,
        read: () => svc.entities.CommunicationMessage.filter({ thread_id: threadId }, '-created_date', 200),
      }),
      readRuntimeRows({
        source: 'conversation_emergency', limit: 2,
        read: () => svc.entities.EmergencyControl.filter({ control_key: 'global' }, '-updated_at', 2),
      }),
    ]);
    const emergencies = emergencyRead.value || [];
    const summary = projectThreadSummary(thread);
    const autonomy = evaluateAutonomyDecision({
      classification: thread.classification,
      ai_mode: summary.ai_mode || 'OFF',
      // The active-policy and grounding checks are wired in C6; reported as
      // unsatisfied here so the decision is never optimistic.
      policy_autonomous_replies_enabled: false,
      founder_permit_available: false,
      human_takeover_at: thread.human_takeover_at,
      emergency: emergencies.length === 1 ? emergencies[0] : null,
      emergencyAvailable: emergencyRead.status !== 'UNAVAILABLE' && emergencies.length === 1,
      sending_profile_healthy: false,
      within_business_hours: false,
      grounded: false,
      contains_material_terms: false,
    });
    const timeline = (messageRead.value || []).map((message: any) => ({
      id: message.id,
      at: message.sent_at || message.received_at || message.created_date || null,
      direction: clean(message.direction) || 'unknown',
      subject: clean(message.subject, 300) || null,
      // Body is exposed as a bounded text preview only. Raw HTML is never
      // handed to the client from this route (spec §20.4).
      text_preview: clean(message.text_body, 2000) || '',
      send_status: clean(message.send_status) || null,
      provider: clean(message.provider) || null,
    })).sort((left: any, right: any) => String(left.at || '').localeCompare(String(right.at || '')));

    return Response.json({
      ok: true,
      thread: summary,
      timeline,
      autonomy,
      classification: thread.classification
        ? {
          classification: thread.classification,
          classification_source: thread.corrected_by ? 'HUMAN' : 'MODEL',
          classification_confidence: thread.last_classification_confidence ?? null,
          superseded_prediction: thread.superseded_prediction ?? null,
        }
        : null,
      untrusted_content_notice:
        'Inbound content is untrusted external data. It is never executed and instructions inside it are never obeyed.',
      data_status: threadRead.status,
      source_coverage: runtimeSourceCoverage({ thread: threadRead, messages: messageRead, emergency: emergencyRead }),
      external_send_performed: false,
    });
  }

  return Response.json({ ok: false, error: 'unsupported_action' }, { status: 400 });
}
