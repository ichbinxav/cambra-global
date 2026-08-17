// COMMAND-C2 (2026-08-17) — durable conversation layer for CAMBRA Command.
//
// The legacy admin chat kept its conversation id in sessionStorage, so history
// died with the browser tab and could not be listed, resumed elsewhere, or
// branched. CommandConversation replaces that identifier. Messages themselves
// stay in ChatMessage keyed by conversation_id: C2 changes who owns the
// conversation, not where turns are stored, so the existing orchestrator keeps
// working and founder history is not rewritten to prove a point.
//
// Branching does NOT copy messages. A branch records its parent and the message
// it forked at, and reading it walks the ancestor chain. Copying would duplicate
// founder history, double the retention surface, and create two rows that claim
// to be the same turn — after which "which one really happened" has no answer.

import { readRuntimeSource } from './runtimeSourceRead.ts';

export const COMMAND_CONVERSATION_CORE_VERSION = 'command-conversation-core-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const TITLE_MAX = 80;

/** How deep an ancestor walk may go before we refuse rather than loop. */
const MAX_BRANCH_DEPTH = 25;

export type ConversationRow = {
  id?: string;
  conversation_id?: string;
  title?: string;
  created_by?: string;
  attribution_state?: string;
  status?: string;
  branched_from_conversation_id?: string;
  branched_from_message_id?: string;
  message_count?: number;
  legacy_session_key?: string;
  migrated_from?: string;
  created_at?: string;
  last_message_at?: string;
};

function json(body: unknown, status = 200) {
  return Response.json(body as any, { status });
}

/**
 * Titles a conversation from its first founder turn, exactly as the legacy
 * migration does. Kept in one shape so a migrated conversation and a native one
 * are titled by the same rule.
 */
export function deriveConversationTitle(messages: Array<{ role?: string; content?: string }>): string {
  const firstUser = messages.find((row) => text(row.role).toLowerCase() === 'user' && text(row.content));
  const body = text(firstUser?.content).replace(/\s+/g, ' ');
  if (!body) return 'New conversation';
  return body.length > TITLE_MAX ? `${body.slice(0, TITLE_MAX - 1)}…` : body;
}

/**
 * Walks a conversation back to its root, newest branch first.
 *
 * Returns a `truncated` flag rather than throwing: a cycle or an over-deep
 * chain is a data defect, and the founder is better served by seeing the part
 * of the history we can prove than by an error page.
 */
export function resolveAncestry(
  conversation: ConversationRow,
  byId: Map<string, ConversationRow>,
): { chain: ConversationRow[]; truncated: boolean; cycle: boolean } {
  const chain: ConversationRow[] = [];
  const seen = new Set<string>();
  let current: ConversationRow | undefined = conversation;
  while (current) {
    const key = text(current.conversation_id);
    if (!key || seen.has(key)) return { chain, truncated: true, cycle: seen.has(key) };
    seen.add(key);
    chain.push(current);
    if (chain.length > MAX_BRANCH_DEPTH) return { chain, truncated: true, cycle: false };
    const parentKey = text(current.branched_from_conversation_id);
    if (!parentKey) break;
    current = byId.get(parentKey);
    // A branch whose parent is gone shows what it has, flagged as incomplete,
    // rather than silently presenting a partial history as the whole thing.
    if (!current) return { chain, truncated: true, cycle: false };
  }
  return { chain, truncated: false, cycle: false };
}

/**
 * Assembles the visible timeline for a conversation: inherited turns from each
 * ancestor up to its branch point, then the conversation's own turns.
 *
 * Inherited turns are marked `inherited_from`, so the UI can show that a branch
 * did not originate them. Presenting them as the branch's own would make it look
 * like the founder said things in a conversation that did not exist yet.
 */
export function assembleTimeline(input: {
  chain: ConversationRow[];
  messagesByConversation: Map<string, Array<Record<string, any>>>;
}) {
  // chain is newest-first; replay oldest-first.
  const ordered = [...input.chain].reverse();
  const timeline: Array<Record<string, any>> = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const node = ordered[index];
    const key = text(node.conversation_id);
    const own = [...(input.messagesByConversation.get(key) || [])];
    const child = ordered[index + 1];
    if (!child) { timeline.push(...own.map((row) => ({ ...row, inherited_from: null }))); continue; }
    // Inherit only up to and including the message the child forked at.
    const forkId = text(child.branched_from_message_id);
    const forkIndex = forkId ? own.findIndex((row) => text(row.id) === forkId) : -1;
    const inherited = forkIndex >= 0 ? own.slice(0, forkIndex + 1) : own;
    timeline.push(...inherited.map((row) => ({ ...row, inherited_from: key })));
  }
  return timeline;
}

/**
 * The Command conversation admin. Every action is a read or a metadata write;
 * nothing here sends anything or touches a commercial surface.
 */
export async function handleCommandConversationAction(
  user: any,
  body: any,
  svc: any,
  deps: { now?: () => string; newId?: (seed: string) => string } = {},
) {
  const now = deps.now ? deps.now() : new Date().toISOString();
  const newId = deps.newId || ((seed: string) => `conv_${seed}`);
  const action = text(body?.action);
  const actor = text(user?.email) || text(user?.id);
  if (!actor) return json({ error: 'unidentified_actor' }, 401);

  const readConversations = async () => {
    const read = await readRuntimeSource<ConversationRow[]>({
      source: 'command_conversations',
      read: () => svc.entities.CommandConversation.filter({ created_by: actor }, '-last_message_at', 200),
      fallback: [],
    });
    return read;
  };

  if (action === 'list') {
    const read = await readConversations();
    if (read.status === 'UNAVAILABLE') {
      // An unreadable list is reported as unavailable, never as "you have no
      // conversations" — those mean very different things to a founder.
      return json({ error: 'conversations_unavailable', source_status: read.status }, 503);
    }
    const rows = read.value || [];
    return json({
      ok: true,
      conversations: rows.map((row) => ({
        conversation_id: row.conversation_id,
        title: row.title || 'Untitled',
        status: row.status || 'ACTIVE',
        message_count: Number(row.message_count || 0),
        branched_from_conversation_id: row.branched_from_conversation_id || null,
        migrated_from: row.migrated_from || null,
        attribution_state: row.attribution_state || 'OBSERVED',
        last_message_at: row.last_message_at || null,
        created_at: row.created_at || null,
      })),
      external_send_performed: false,
    });
  }

  if (action === 'create') {
    const conversationId = text(body?.conversation_id) || newId(`${now}`);
    // AUDIT SEC-08 (2026-08-17): the caller supplies conversation_id, so a caller could
    // claim an id already owned by another actor. Refuse if any row already carries it,
    // regardless of created_by — same claim pattern the migration module uses.
    const claimed = await svc.entities.CommandConversation.filter({ conversation_id: conversationId }, '-created_at', 1)
      .catch(() => { throw Object.assign(new Error('conversation_claim_check_unavailable'), { status: 503 }); });
    if (Array.isArray(claimed) && claimed.length > 0) {
      return json({ error: 'conversation_id_already_claimed' }, 409);
    }
    const created = await svc.entities.CommandConversation.create({
      conversation_id: conversationId,
      title: text(body?.title) || 'New conversation',
      created_by: actor,
      attribution_state: 'OBSERVED',
      status: 'ACTIVE',
      message_count: 0,
      receipt_chain_key: conversationId,
      created_at: now,
      updated_at: now,
    });
    return json({ ok: true, conversation: created, external_send_performed: false }, 201);
  }

  if (action === 'get') {
    const conversationId = text(body?.conversation_id);
    if (!conversationId) return json({ error: 'conversation_id_required' }, 400);
    const read = await readConversations();
    if (read.status === 'UNAVAILABLE') return json({ error: 'conversations_unavailable' }, 503);
    const rows = read.value || [];
    const byId = new Map(rows.map((row) => [text(row.conversation_id), row]));
    const conversation = byId.get(conversationId);
    if (!conversation) return json({ error: 'conversation_not_found' }, 404);

    const { chain, truncated, cycle } = resolveAncestry(conversation, byId);
    const messagesByConversation = new Map<string, Array<Record<string, any>>>();
    let messagesUnavailable = false;
    for (const node of chain) {
      const key = text(node.conversation_id);
      const messageRead = await readRuntimeSource<Array<Record<string, any>>>({
        source: 'command_conversation_messages',
        read: () => svc.entities.ChatMessage.filter({ conversation_id: key }, 'created_date', 500),
        fallback: [],
      });
      if (messageRead.status === 'UNAVAILABLE') messagesUnavailable = true;
      messagesByConversation.set(key, messageRead.value || []);
    }
    if (messagesUnavailable) return json({ error: 'conversation_messages_unavailable' }, 503);

    return json({
      ok: true,
      conversation,
      timeline: assembleTimeline({ chain, messagesByConversation }),
      // An incomplete ancestry is stated, not hidden. A branch missing its
      // parent shows fewer turns than really happened.
      history_complete: !truncated,
      history_truncated_reason: cycle ? 'branch_cycle_detected' : (truncated ? 'ancestor_unavailable' : null),
      ancestry: chain.map((row) => text(row.conversation_id)).reverse(),
      external_send_performed: false,
    });
  }

  if (action === 'rename') {
    const conversationId = text(body?.conversation_id);
    const title = text(body?.title);
    if (!conversationId) return json({ error: 'conversation_id_required' }, 400);
    if (!title) return json({ error: 'title_required' }, 400);
    const rows = (await readConversations()).value || [];
    const target = rows.find((row) => text(row.conversation_id) === conversationId);
    if (!target) return json({ error: 'conversation_not_found' }, 404);
    const updated = await svc.entities.CommandConversation.update(target.id, {
      title: title.slice(0, TITLE_MAX), updated_at: now,
    });
    return json({ ok: true, conversation: updated, external_send_performed: false });
  }

  if (action === 'set_status') {
    const conversationId = text(body?.conversation_id);
    const status = text(body?.status).toUpperCase();
    if (!conversationId) return json({ error: 'conversation_id_required' }, 400);
    if (!['ACTIVE', 'PINNED', 'ARCHIVED'].includes(status)) return json({ error: 'unsupported_status' }, 400);
    const rows = (await readConversations()).value || [];
    const target = rows.find((row) => text(row.conversation_id) === conversationId);
    if (!target) return json({ error: 'conversation_not_found' }, 404);
    // Archiving is a status change, never a delete: founder history is not
    // removed by tidying a sidebar.
    const updated = await svc.entities.CommandConversation.update(target.id, { status, updated_at: now });
    return json({ ok: true, conversation: updated, external_send_performed: false });
  }

  if (action === 'branch') {
    const parentId = text(body?.conversation_id);
    const messageId = text(body?.branch_from_message_id);
    if (!parentId) return json({ error: 'conversation_id_required' }, 400);
    if (!messageId) return json({ error: 'branch_from_message_id_required' }, 400);
    const rows = (await readConversations()).value || [];
    const parent = rows.find((row) => text(row.conversation_id) === parentId);
    if (!parent) return json({ error: 'conversation_not_found' }, 404);

    // The fork point must be a real message in the parent. Branching from an id
    // we cannot see would produce a conversation whose history silently starts
    // from nothing.
    const parentMessages = await readRuntimeSource<Array<Record<string, any>>>({
      source: 'command_conversation_messages',
      read: () => svc.entities.ChatMessage.filter({ conversation_id: parentId }, 'created_date', 500),
      fallback: [],
    });
    if (parentMessages.status === 'UNAVAILABLE') return json({ error: 'conversation_messages_unavailable' }, 503);
    if (!(parentMessages.value || []).some((row) => text(row.id) === messageId)) {
      return json({ error: 'branch_point_not_found_in_conversation' }, 409);
    }

    const conversationId = newId(`${now}_branch`);
    const created = await svc.entities.CommandConversation.create({
      conversation_id: conversationId,
      title: `${text(parent.title) || 'Conversation'} (branch)`.slice(0, TITLE_MAX),
      created_by: actor,
      attribution_state: 'OBSERVED',
      status: 'ACTIVE',
      branched_from_conversation_id: parentId,
      branched_from_message_id: messageId,
      // A branch owns no turns yet. Inherited history is resolved on read, not
      // copied, so this count stays honest.
      message_count: 0,
      receipt_chain_key: conversationId,
      created_at: now,
      updated_at: now,
    });
    return json({ ok: true, conversation: created, external_send_performed: false }, 201);
  }

  return json({ error: 'command_conversation_action_not_implemented', action }, 400);
}
