// inboundThreadRouting — deterministic resolution of an inbound provider email
// to the negotiation thread it belongs to.
//
// WHY THIS EXISTS
// The previous matcher in outlookInboundRouter fell back to "first thread whose
// counterparty_email equals the sender" whenever the provider's conversationId
// was absent or unrecognised:
//
//   threads.find(t => t.external_thread_id === conversationId) ||
//   threads.find(t => normalizeEmail(t.counterparty_email) === from) ||  // <-- leak
//   null
//
// CAMBRA negotiates with the same PSPs — Stripe, SumUp, PayPal — on behalf of
// many merchants at once. The same person at the provider therefore has open
// threads with merchant A and merchant B simultaneously. When their reply
// arrives without a recognisable conversationId (different mail client, a
// forward, a reply from mobile), the fallback attached it to whichever thread
// happened to come first in the list.
//
// The consequence is not a routing annoyance. The negotiation agent would then
// answer merchant B's provider using merchant A's verified volumes and target
// economics. That is a cross-tenant disclosure of confidential commercial data,
// and at scale it is a matter of time rather than luck.
//
// THE RULE
// Route only on evidence that identifies ONE thread. Never guess. An unrouted
// email is an inconvenience; a misrouted one is a data breach.
//
// Strategies, strongest first:
//   1. reply_alias    reply+<threadId>@ in the recipients — we minted it, so it
//                     is authoritative even when the sender address changed
//                     (the classic "forwarded to a colleague" case).
//   2. conversation   provider conversation/thread id equals external_thread_id.
//   3. in_reply_to    In-Reply-To / References matches a message we sent.
//   4. sole_candidate sender matches exactly ONE open thread. If two or more
//                     match, this is precisely the dangerous case: refuse.
//
// Anything unresolved returns ok:false and belongs in an unrouted queue that a
// human triages — never in a thread chosen by list order.

export type InboundThreadResolution =
  | {
    ok: true;
    thread_id: string;
    strategy: "reply_alias" | "conversation" | "in_reply_to" | "sole_candidate";
  }
  | {
    ok: false;
    reason: "ambiguous_sender" | "no_match";
    candidate_thread_ids: string[];
  };

export type InboundMessageFacts = {
  /** Recipient addresses (to + cc), used to find the reply+<threadId> alias. */
  recipients?: string[];
  /** Provider-side conversation identifier, e.g. Microsoft Graph conversationId. */
  conversation_id?: string | null;
  /** RFC 5322 In-Reply-To / References values. */
  in_reply_to?: string | null;
  references?: string[];
  /** Sender address. */
  from?: string | null;
};

export type RoutableThread = {
  id: string;
  external_thread_id?: string | null;
  counterparty_email?: string | null;
  status?: string | null;
  /** Message-IDs (or provider message ids) of messages we sent on this thread. */
  sent_message_ids?: string[];
};

const CLOSED_STATUSES = new Set(["closed", "suppressed"]);

export function normalizeAddress(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  // Accept both "Name <a@b.com>" and a bare address.
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim();
}

/** Extract the thread id from a reply+<threadId>@domain alias, if present. */
export function threadIdFromAlias(recipients: unknown): string | null {
  const list = Array.isArray(recipients) ? recipients : [];
  for (const raw of list) {
    const address = normalizeAddress(raw);
    const m = address.match(/^reply\+([a-z0-9_-]+)@/i);
    if (m) return m[1];
  }
  return null;
}

function normalizeMessageId(value: unknown): string {
  return String(value ?? "").trim().replace(/^<|>$/g, "").toLowerCase();
}

/**
 * Resolve an inbound message to exactly one thread, or refuse.
 *
 * `threads` should be the candidate set already scoped by the caller. Closed and
 * suppressed threads are excluded here so a stale thread can never win over a
 * live one.
 */
export function resolveInboundThread(
  message: InboundMessageFacts,
  threads: RoutableThread[],
): InboundThreadResolution {
  const open = (Array.isArray(threads) ? threads : []).filter(
    (t) => t && t.id && !CLOSED_STATUSES.has(String(t.status || "").toLowerCase()),
  );

  // 1 — reply+<threadId> alias. We minted it; it beats everything.
  const aliasId = threadIdFromAlias(message?.recipients);
  if (aliasId) {
    const hit = open.find((t) => String(t.id) === aliasId);
    if (hit) return { ok: true, thread_id: String(hit.id), strategy: "reply_alias" };
  }

  // 2 — provider conversation id.
  const conversationId = String(message?.conversation_id ?? "").trim();
  if (conversationId) {
    const hits = open.filter(
      (t) => String(t.external_thread_id ?? "").trim() === conversationId,
    );
    if (hits.length === 1) {
      return { ok: true, thread_id: String(hits[0].id), strategy: "conversation" };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        reason: "ambiguous_sender",
        candidate_thread_ids: hits.map((t) => String(t.id)),
      };
    }
  }

  // 3 — In-Reply-To / References against message ids we sent.
  const referenced = new Set(
    [message?.in_reply_to, ...(message?.references ?? [])]
      .map(normalizeMessageId)
      .filter(Boolean),
  );
  if (referenced.size) {
    const hits = open.filter((t) =>
      (t.sent_message_ids ?? []).some((id) => referenced.has(normalizeMessageId(id)))
    );
    if (hits.length === 1) {
      return { ok: true, thread_id: String(hits[0].id), strategy: "in_reply_to" };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        reason: "ambiguous_sender",
        candidate_thread_ids: hits.map((t) => String(t.id)),
      };
    }
  }

  // 4 — sender address, but ONLY when it identifies a single open thread.
  // This is the branch that used to leak: with two open threads for the same
  // provider contact, the old code took the first. Refusing here is the fix.
  const from = normalizeAddress(message?.from);
  if (from) {
    const hits = open.filter((t) => normalizeAddress(t.counterparty_email) === from);
    if (hits.length === 1) {
      return { ok: true, thread_id: String(hits[0].id), strategy: "sole_candidate" };
    }
    if (hits.length > 1) {
      return {
        ok: false,
        reason: "ambiguous_sender",
        candidate_thread_ids: hits.map((t) => String(t.id)),
      };
    }
  }

  return { ok: false, reason: "no_match", candidate_thread_ids: [] };
}
