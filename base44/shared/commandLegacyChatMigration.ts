// COMMAND-C1 (2026-08-17) — migration harness for the legacy admin chat.
//
// The old /admin/chat grouped messages by a client-generated identifier held in
// sessionStorage ("cambra_chat_conv"). Those rows are real founder history and
// must not be orphaned when CAMBRA Command takes over. This module PLANS the
// migration; the caller performs the writes. Planning separately is what makes
// it testable and what makes a dry run meaningful.
//
// Three things this harness deliberately refuses to do:
//
//  1. Invent authorship. ChatMessage never declared an author field. If the
//     platform's created_by is absent, the conversation is migrated with
//     attribution UNKNOWN rather than credited to whoever ran the migration.
//  2. Claim a receipt chain. Legacy turns were never receipted. A migrated
//     conversation opens with no chain and is marked so, because an empty
//     chain that reads as "verified" would be a lie about the history.
//  3. Duplicate. Re-running is a no-op for anything already migrated, matched
//     on legacy_session_key — the only durable link that exists.

export const LEGACY_CHAT_MIGRATION_VERSION = 'command-legacy-chat-migration-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

export type LegacyChatMessage = {
  id?: string;
  conversation_id?: string;
  role?: string;
  content?: string;
  created_by?: string;
  created_date?: string;
};

export type MigrationPlanEntry = {
  legacy_session_key: string;
  action: 'CREATE' | 'SKIP_ALREADY_MIGRATED' | 'SKIP_UNUSABLE';
  reason?: string;
  conversation?: Record<string, unknown>;
  message_ids: string[];
};

/** Longest sensible title drawn from the first founder turn. */
const TITLE_MAX = 80;

/**
 * Titles a migrated conversation from its first user message. Falls back to a
 * neutral label rather than to the assistant's reply — the assistant's wording
 * is the model's, and using it would put words in the founder's mouth.
 */
export function deriveLegacyTitle(messages: LegacyChatMessage[]): string {
  const firstUser = messages.find((row) => text(row.role).toLowerCase() === 'user' && text(row.content));
  const body = text(firstUser?.content).replace(/\s+/g, ' ');
  if (!body) return 'Untitled legacy conversation';
  return body.length > TITLE_MAX ? `${body.slice(0, TITLE_MAX - 1)}…` : body;
}

/**
 * Resolves who owned a legacy conversation. Returns null when the rows do not
 * say, so the caller stores an explicit unknown instead of a wrong name.
 *
 * A conversation whose rows disagree about the author is also unknown: two
 * different created_by values mean the grouping key was reused across accounts,
 * and picking either one would assert something no row supports.
 */
export function resolveLegacyOwner(messages: LegacyChatMessage[]): { owner: string | null; conflicted: boolean } {
  const owners = new Set(messages.map((row) => text(row.created_by)).filter(Boolean));
  if (owners.size === 0) return { owner: null, conflicted: false };
  if (owners.size > 1) return { owner: null, conflicted: true };
  return { owner: [...owners][0], conflicted: false };
}

/**
 * Builds the migration plan.
 *
 * `existing` is the set of CommandConversation rows already present; anything
 * whose legacy_session_key is already claimed is skipped, which is what makes
 * the migration safe to re-run after a partial failure.
 */
export function planLegacyChatMigration(input: {
  messages: LegacyChatMessage[];
  existing: Array<{ legacy_session_key?: string }>;
  now: string;
}) {
  const claimed = new Set(
    (Array.isArray(input.existing) ? input.existing : [])
      .map((row) => text(row?.legacy_session_key))
      .filter(Boolean),
  );

  const grouped = new Map<string, LegacyChatMessage[]>();
  let unusableMessages = 0;
  for (const row of Array.isArray(input.messages) ? input.messages : []) {
    const key = text(row?.conversation_id);
    // A message with no grouping key cannot be attached to any conversation
    // without guessing which one. It is counted and left alone.
    if (!key) { unusableMessages += 1; continue; }
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(row);
  }

  const entries: MigrationPlanEntry[] = [];
  for (const [key, rows] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const messageIds = rows.map((row) => text(row.id)).filter(Boolean);
    if (claimed.has(key)) {
      entries.push({ legacy_session_key: key, action: 'SKIP_ALREADY_MIGRATED', message_ids: messageIds });
      continue;
    }
    if (!rows.some((row) => text(row.content))) {
      entries.push({
        legacy_session_key: key, action: 'SKIP_UNUSABLE',
        reason: 'no_message_body', message_ids: messageIds,
      });
      continue;
    }

    const { owner, conflicted } = resolveLegacyOwner(rows);
    const timestamps = rows.map((row) => text(row.created_date)).filter(Boolean).sort();

    entries.push({
      legacy_session_key: key,
      action: 'CREATE',
      message_ids: messageIds,
      conversation: {
        conversation_id: `conv:legacy:${key}`,
        title: deriveLegacyTitle(rows),
        // These fields are deliberately separate from Base44's reserved
        // created_by, which service-role writes replace with a service identity.
        // Unknown source ownership remains blank rather than being attributed
        // to the migration operator.
        owner_actor: owner ?? '',
        attributed_actor: owner ?? '',
        attribution_state: conflicted ? 'CONFLICTED' : (owner ? 'OBSERVED' : 'UNKNOWN'),
        status: 'ARCHIVED',
        legacy_session_key: key,
        message_count: rows.length,
        // No receipt chain: these turns predate the ledger and were never
        // receipted. An empty chain_key keeps them out of verifyReceiptChain
        // rather than presenting zero receipts as a clean bill of health.
        receipt_chain_key: '',
        last_receipt_hash: '',
        migrated_from: 'legacy_admin_chat',
        migrated_at: input.now,
        last_message_at: timestamps[timestamps.length - 1] || '',
        created_at: timestamps[0] || input.now,
      },
    });
  }

  const created = entries.filter((entry) => entry.action === 'CREATE');
  return {
    version: LEGACY_CHAT_MIGRATION_VERSION,
    entries,
    summary: {
      conversations_found: grouped.size,
      to_create: created.length,
      already_migrated: entries.filter((entry) => entry.action === 'SKIP_ALREADY_MIGRATED').length,
      unusable_conversations: entries.filter((entry) => entry.action === 'SKIP_UNUSABLE').length,
      unusable_messages: unusableMessages,
      unattributed: created.filter((entry) => entry.conversation!.attribution_state === 'UNKNOWN').length,
      conflicted_attribution: created.filter((entry) => entry.conversation!.attribution_state === 'CONFLICTED').length,
    },
  };
}

/**
 * Reconciles a completed migration. The count of legacy conversations must be
 * fully accounted for by created + already-migrated + unusable; anything else
 * means rows were silently dropped, and the caller must not report success.
 */
export function reconcileLegacyChatMigration(summary: {
  conversations_found: number;
  to_create: number;
  already_migrated: number;
  unusable_conversations: number;
}) {
  const accounted = Number(summary.to_create) + Number(summary.already_migrated) + Number(summary.unusable_conversations);
  const found = Number(summary.conversations_found);
  return {
    reconciles: accounted === found,
    accounted,
    found,
    unaccounted: found - accounted,
  };
}
