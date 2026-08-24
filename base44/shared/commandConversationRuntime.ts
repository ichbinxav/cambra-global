// Runtime boundary shared by the Command chat entry point and its tests.
// Base44 reserves created_by, so conversation access must use owner_actor.

const text = (value: unknown) => String(value ?? '').trim();
const TITLE_MAX = 80;

export const COMMAND_CONVERSATION_RUNTIME_VERSION = 'command-conversation-runtime-1.0.0';

export function commandActorKey(user: any): string {
  return text(user?.email).toLowerCase() || text(user?.id);
}

export function resolveCommandConversationAccess(rows: any, actor: string) {
  if (!Array.isArray(rows)) return { ok: false, status: 503, error: 'conversations_unavailable' };
  if (rows.length === 0) return { ok: false, status: 404, error: 'conversation_not_found' };
  if (rows.length > 1) return { ok: false, status: 409, error: 'conversation_id_not_unique' };

  const conversation = rows[0];
  const owner = text(conversation?.owner_actor).toLowerCase();
  if (!owner || owner !== text(actor).toLowerCase()) {
    // Do not reveal whether another actor owns the supplied identifier.
    return { ok: false, status: 404, error: 'conversation_not_found' };
  }
  if (text(conversation?.status).toUpperCase() === 'ARCHIVED') {
    return { ok: false, status: 409, error: 'conversation_archived' };
  }
  return { ok: true, status: 200, conversation };
}

function titleFromMessages(messages: any[]): string {
  const firstUser = messages.find((row) => text(row?.role).toLowerCase() === 'user' && text(row?.content));
  const body = text(firstUser?.content).replace(/\s+/g, ' ');
  if (!body) return '';
  return body.length > TITLE_MAX ? `${body.slice(0, TITLE_MAX - 1)}…` : body;
}

export async function syncCommandConversationMetadata(
  svc: any,
  conversation: any,
  now = new Date().toISOString(),
) {
  const conversationId = text(conversation?.conversation_id);
  if (!conversation?.id || !conversationId) throw new Error('durable_conversation_required');

  const rows = await svc.entities.ChatMessage.filter({ conversation_id: conversationId }, 'created_date', 500);
  if (!Array.isArray(rows)) throw new Error('conversation_messages_unavailable');
  const ordered = [...rows].sort((left, right) =>
    Date.parse(text(left?.created_date || left?.created_at) || '1970-01-01')
    - Date.parse(text(right?.created_date || right?.created_at) || '1970-01-01'));
  const latest = ordered[ordered.length - 1];
  const currentTitle = text(conversation.title);
  const derivedTitle = titleFromMessages(ordered);
  const patch: Record<string, unknown> = {
    message_count: Math.max(Number(conversation.message_count || 0), ordered.length),
    updated_at: now,
  };
  const lastMessageAt = text(latest?.created_date || latest?.created_at || conversation.last_message_at);
  if (lastMessageAt) patch.last_message_at = lastMessageAt;
  if ((!currentTitle || currentTitle === 'New conversation') && derivedTitle) patch.title = derivedTitle;

  await svc.entities.CommandConversation.update(conversation.id, patch);
  return patch;
}
