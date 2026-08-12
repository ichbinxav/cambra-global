import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import {
import { guardedScheduledServe } from '../../shared/schedulerRun.ts';
  classifyHardStop,
  commercialTimezone,
  computeInboundReplySchedule,
  normalizeEmail,
  policyIsActive,
  sanitizeExternalText,
} from '../../shared/commercialAutonomy.ts';

function candidateIds(data: any) {
  const values = [
    data?.id,
    data?.resourceData?.id,
    data?.resource_data?.id,
    data?.message?.id,
    data?.email?.id,
    data?.resource?.id,
  ];
  return Array.from(new Set(values.map((value: any) => String(value || '').trim()).filter(Boolean)));
}

const MESSAGE_SELECT = 'id,conversationId,internetMessageId,subject,body,bodyPreview,from,toRecipients,receivedDateTime,isDraft,parentFolderId';
const ACTIVE_THREAD_STATUSES = ['open', 'awaiting_counterparty', 'awaiting_cambra', 'awaiting_approval'];

async function graphJson(url: string, token: string) {
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) throw new Error('outlook_graph_failed:' + response.status);
  return await response.json();
}

async function activeThreads(svc: any) {
  const groups = await Promise.all(
    ACTIVE_THREAD_STATUSES.map((status) =>
      svc.entities.CommunicationThread.filter({ status }, '-last_message_at', 250).catch((error:any)=>safeBestEffort(error,{operation:'outlookInboundRouter',fallback:[],severity:'secondary'}))
    )
  );
  const unique = new Map<string, any>();
  for (const row of groups.flat()) {
    if (row?.id && !unique.has(String(row.id))) unique.set(String(row.id), row);
  }
  return Array.from(unique.values());
}

function matchThread(msg: any, threads: any[]) {
  const conversationId = String(msg?.conversationId || '').trim();
  const from = normalizeEmail(msg?.from?.emailAddress?.address);
  return (
    threads.find(
      (thread: any) =>
        conversationId && String(thread?.external_thread_id || '') === conversationId
    ) ||
    threads.find(
      (thread: any) => from && normalizeEmail(thread?.counterparty_email) === from
    ) ||
    null
  );
}

async function pollRoutableMessages(token: string, threads: any[]) {
  if (!threads.length) return [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let url =
    'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$select=' +
    encodeURIComponent(MESSAGE_SELECT) +
    '&$orderby=receivedDateTime%20desc&$top=100';
  const routed: any[] = [];
  for (let page = 0; url && page < 5; page += 1) {
    const body = await graphJson(url, token);
    const rows = Array.isArray(body?.value) ? body.value : [];
    for (const msg of rows) {
      const received = Date.parse(String(msg?.receivedDateTime || ''));
      if (Number.isFinite(received) && received < cutoff) return routed;
      const thread = matchThread(msg, threads);
      if (thread) routed.push({ msg, thread });
    }
    url = typeof body?.['@odata.nextLink'] === 'string' ? body['@odata.nextLink'] : '';
  }
  return routed;
}

async function processMessage(
  svc: any,
  msg: any,
  self: string,
  threadHint: any = null,
  logUnroutable = false
) {
  if (!msg || msg.isDraft) return { ok: true, ignored: true, reason: 'not_email_or_draft' };
  const from = normalizeEmail(msg?.from?.emailAddress?.address);
  if (!from || from === self) {
    return { ok: true, ignored: true, reason: 'self_or_missing_sender' };
  }
  const duplicate = await svc.entities.CommunicationMessage.filter(
    { provider: 'outlook', provider_message_id: String(msg.id) },
    '-created_date',
    1
  ).catch((error:any)=>safeBestEffort(error,{operation:'outlookInboundRouter',fallback:[],severity:'secondary'}));
  if (duplicate.length) return { ok: true, duplicate: true, message_id: String(msg.id) };

  let thread: any = threadHint;
  if (!thread && msg.conversationId) {
    const rows = await svc.entities.CommunicationThread.filter(
      { external_thread_id: String(msg.conversationId) },
      '-last_message_at',
      5
    ).catch((error:any)=>safeBestEffort(error,{operation:'outlookInboundRouter',fallback:[],severity:'secondary'}));
    thread =
      rows.find((item: any) => !['closed', 'suppressed'].includes(item.status)) ||
      rows[0] ||
      null;
  }
  if (!thread) {
    const rows = await svc.entities.CommunicationThread.filter(
      { counterparty_email: from },
      '-last_message_at',
      20
    ).catch((error:any)=>safeBestEffort(error,{operation:'outlookInboundRouter',fallback:[],severity:'secondary'}));
    thread = rows.find((item: any) => ACTIVE_THREAD_STATUSES.includes(item.status)) || null;
  }
  if (!thread) {
    if (logUnroutable) {
      await svc.entities.OperationalLog.create({
        event_type: 'outlook_inbound_unroutable',
        message: 'Outlook email not associated with a CAMBRA commercial thread',
        data_json: {
          message_id: msg.id,
          conversation_id: msg.conversationId || null,
          from,
          subject: String(msg.subject || '').slice(0, 200),
        },
        created_at: new Date().toISOString(),
      }).catch((error:any)=>safeBestEffort(error,{operation:'outlookInboundRouter',fallback:null,severity:'secondary'}));
    }
    return { ok: true, routed: false, message_id: String(msg.id) };
  }

  const policies = await svc.entities.CommercialPolicy.filter(
    { policy_key: thread.policy_key, status: 'active' },
    '-created_date',
    5
  ).catch((error:any)=>safeBestEffort(error,{operation:'outlookInboundRouter',fallback:[],severity:'secondary'}));
  const policy =
    policies.find(
      (item: any) => item.version === thread.policy_version && policyIsActive(item)
    ) ||
    policies[0] ||
    null;
  const now = new Date().toISOString();
  const receivedAt = msg.receivedDateTime || now;
  const timing = computeInboundReplySchedule(
    receivedAt,
    policy || {},
    String(msg.id),
    commercialTimezone(thread, policy)
  );
  const messageText = sanitizeExternalText(msg?.body?.content || msg?.bodyPreview || '', 12000);
  const hardStop = classifyHardStop(messageText || msg.subject || '');
  const row = await svc.entities.CommunicationMessage.create({
    thread_id: thread.id,
    direction: 'inbound',
    channel: 'email',
    provider: 'outlook',
    provider_message_id: String(msg.id),
    internet_message_id: String(msg.internetMessageId || ''),
    from_email: from,
    to_emails: Array.isArray(msg.toRecipients)
      ? msg.toRecipients
          .map((recipient: any) => normalizeEmail(recipient?.emailAddress?.address))
          .filter(Boolean)
      : [],
    subject: sanitizeExternalText(msg.subject || '', 300),
    text_body: messageText,
    classification: hardStop || null,
    send_status: 'received',
    received_at: receivedAt,
    earliest_reply_at: timing.earliest_reply_at,
    scheduled_send_at: timing.scheduled_send_at,
    raw_event_json: { conversation_id: msg.conversationId || null },
  });
  await svc.entities.CommunicationThread.update(thread.id, {
    status: 'awaiting_cambra',
    external_thread_id: msg.conversationId || thread.external_thread_id,
    last_inbound_at: receivedAt,
    last_message_at: receivedAt,
    next_action_at: timing.scheduled_send_at,
    counterparty_email: from,
  });

  if (['unsubscribe', 'complaint'].includes(hardStop || '')) {
    const existing = await svc.entities.ContactSuppression.filter(
      { email: from, active: true },
      '-created_date',
      1
    ).catch((error:any)=>safeBestEffort(error,{operation:'outlookInboundRouter',fallback:[],severity:'secondary'}));
    if (!existing.length) {
      await svc.entities.ContactSuppression.create({
        email: from,
        reason: hardStop === 'unsubscribe' ? 'opt_out' : 'complaint',
        source: 'outlook_inbound',
        source_message_id: row.id,
        active: true,
        suppressed_at: now,
      });
    }
    await svc.entities.CommunicationThread.update(thread.id, {
      status: 'suppressed',
      automation_paused: true,
      pause_reason: hardStop,
    });
    return { ok: true, routed: true, hard_stop: hardStop, message_id: String(msg.id) };
  }

  const internal = Deno.env.get('INTERNAL_CALL_SECRET') || '';
  const run = await svc.functions
    .invoke('commercialReplyAgent', {
      thread_id: thread.id,
      message_id: row.id,
      internal_secret: internal,
    })
    .catch((error: any) => ({ data: { ok: false, error: String(error?.message || error) } }));
  return {
    ok: true,
    routed: true,
    message_id: String(msg.id),
    reply_processing: run?.data || run || null,
  };
}

guardedScheduledServe({"worker_key":"outlookInboundRouter","cadence_seconds":300},createClientFromRequest,async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const payload = body?.payload || body || {};
    const event = payload?.event || null;
    if (event && (event.integration_type !== 'outlook' || event.type !== 'created')) {
      return Response.json({ ok: true, ignored: true, reason: 'unsupported_event' });
    }

    const svc = base44.asServiceRole;
    const conn = await svc.connectors
      .getConnection('outlook')
      .catch(() => ({ accessToken: null }));
    if (!conn?.accessToken) {
      return Response.json({ ok: false, error: 'outlook_connector_required' }, { status: 503 });
    }
    const me = await graphJson(
      'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',
      conn.accessToken
    );
    const self = normalizeEmail(me.mail || me.userPrincipalName);

    if (event) {
      const ids = candidateIds(payload?.data || {});
      if (!ids.length) {
        return Response.json({ ok: true, ignored: true, reason: 'no_resource_id' });
      }
      let msg: any = null;
      for (const id of ids) {
        try {
          msg = await graphJson(
            'https://graph.microsoft.com/v1.0/me/messages/' +
              encodeURIComponent(id) +
              '?$select=' +
              encodeURIComponent(MESSAGE_SELECT),
            conn.accessToken
          );
          break;
        } catch (error) {
          if (!String(error).includes(':404')) throw error;
        }
      }
      return Response.json(await processMessage(svc, msg, self, null, true));
    }

    const threads = await activeThreads(svc);
    const candidates = await pollRoutableMessages(conn.accessToken, threads);
    const results = [];
    for (const candidate of candidates) {
      results.push(await processMessage(svc, candidate.msg, self, candidate.thread, false));
    }
    return Response.json({
      ok: true,
      mode: 'scheduled_poll',
      active_threads: threads.length,
      candidates: candidates.length,
      processed: results.filter((item: any) => item?.routed).length,
      duplicates: results.filter((item: any) => item?.duplicate).length,
    });
  } catch (error) {
    console.error('outlookInboundRouter failed', error);
    return Response.json({ ok: false, error: 'outlook_inbound_processing_failed' }, { status: 500 });
  }
});
