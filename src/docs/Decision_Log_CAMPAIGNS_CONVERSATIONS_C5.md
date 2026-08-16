# Decision Log — Campaigns + Inbox & Conversations — C5 (Conversations read and inbound foundation)

Date: 2026-08-16 · Opened on tree `2bbfa442` (C4) · Branch: `agent/i18n-30-markets`
Spec: PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C5. **Read and draft only — no sends.**

## Baseline al abrir → al cerrar

- Entities 257 → 257 (none added).
- Physical Base44 functions **276 → 276** (none added).
- Logical routes **28 → 29** — `conversationAdmin` on the existing
  `adminSummaries` host, action prefix `conversation_`. Deliberate bump of
  `BASE44_LOGICAL_ROUTE_TARGET` plus both topology invariant tests, exactly as
  the house rule requires. `base44:functions:check` confirms
  "276 physical functions, 29 logical routes".

## Decisiones no triviales

- **`/admin/conversations` is a NEW route; `/admin/inbox` is untouched.** The
  existing AdminInbox is the approvals inbox and stays exactly where it is —
  no redirect, no reuse, nothing removed. Consolidating the two is a C9
  decision with its own founder check-in, precisely because real bookmarks
  point at `/admin/inbox`.
- **Ambiguity resolves to REVIEW_REQUIRED, never to a best guess.** The
  resolution ladder (provider thread id → internet message references →
  enrollment ref → normalized email + campaign + open thread) returns a thread
  only when exactly ONE candidate matches at a given strategy. Two candidates
  at the same confidence yields `REVIEW_REQUIRED` with the candidate ids and
  no mutation. Attaching a reply to the wrong conversation leaks one
  counterparty's words into another's history, so a wrong attach is strictly
  worse than no attach.
- **Email matching is deliberately last and deliberately narrow.** It requires
  a campaign scope and an open thread. Without the campaign scope the same
  address would match every historical conversation, so an unscoped envelope
  resolves to UNRESOLVED rather than picking one. Tested in both directions.
- **A cross-tenant match is refused even on an exact provider thread id.**
  Technical strength never overrides the tenant boundary (spec §3.6).
- **A human classification supersedes the model WITHOUT deleting it.** The
  correction records `classification_source: HUMAN`, confidence 1, and keeps
  the original prediction under `superseded_prediction` so evaluation still
  has the model's answer. The UI shows it explicitly and says it was kept, not
  deleted (spec §10.3).
- **An unsupported classification value becomes REVIEW_REQUIRED** while
  keeping the raw input visible — an unknown label never silently becomes a
  known one.
- **Autonomy fails closed on every dimension.** Legal, security, complaint,
  provider-proposal and invoice classifications can never be handled
  autonomously; an UNKNOWN classification blocks; a missing FounderPermit
  blocks (that authority does not exist on this tree — C0). Consequence: on
  this tree CAMBRA can DRAFT but can never auto-send, and the UI shows the
  exact blockers rather than a bare "human required".
- **`may_draft` is separated from `may_send_autonomously`.** Drafting for a
  human to review is the safe middle ground and stays available when sending
  is blocked — except under an emergency or an unreadable emergency authority,
  where even drafting stops.
- **Takeover blocks auto-send immediately; returning control does not.**
  `TAKE_OVER` sets `ai_mode: OFF` and pauses automation in the same patch. An
  in-flight effect is flagged `reconciliation_required` because a sent message
  cannot be un-sent. `RETURN_TO_CAMBRA` is REFUSED while an effect is in
  flight or an escalation is unresolved, and when it does succeed it returns
  in `DRAFT_ONLY` — never straight back to autonomous.
- **The detail route exposes a bounded text preview, never raw HTML.** Message
  bodies are truncated text; the raw HTML is not handed to the client from
  this route (spec §20.4). The response and the UI both state that inbound
  content is untrusted and is never executed or obeyed.
- **The C5 detail reports autonomy pessimistically on purpose.** Policy,
  grounding, profile health and business hours are wired in C6; until then
  they are reported as unsatisfied so the decision is never optimistic about
  a check that has not run.

## Archivos

Created: `base44/shared/conversationResolution.ts`,
`base44/shared/conversationAdminCore.ts`,
`src/pages/admin/AdminConversations.jsx`,
`src/pages/admin/AdminConversations.test.jsx`,
`src/lib/conversationsC5.test.js`, this decision log.
Modified: `base44/functions/adminSummaries/entry.ts` (conversation_ dispatch),
`base44/deployment-topology.json` (+conversationAdmin),
`scripts/lib/base44Bundle.mjs` (28 → 29), both topology invariant tests,
`src/App.jsx`, `src/pages/admin/AdminLayout.jsx` (nav, group, doc topic,
EN/FR/ES labels), plus regenerated artifacts.

## Tests (literales)

`src/lib/conversationsC5.test.js` — 26 tests: each rung of the resolution
ladder resolves correctly · email matching only with a campaign scope and never
on a closed thread · duplicate candidates ⇒ REVIEW_REQUIRED with no thread ·
cross-tenant match refused · unmatched ⇒ UNRESOLVED · provider mismatch does
not match · model classification keeps provenance · human correction preserves
the superseded prediction · unsupported value ⇒ REVIEW_REQUIRED with the raw
input · escalation flagged for all five escalation classifications · autonomy
allows only when every condition holds · refuses for each escalation
classification, for UNKNOWN, without a FounderPermit, after takeover, under
emergency, outside business hours, ungrounded and with material terms · may
still draft when sending is blocked but not during an emergency · unreadable
emergency authority blocks · takeover blocks auto-send and records the actor ·
in-flight effect flags reconciliation · RETURN_TO_CAMBRA refused with an
effect in flight and on an unresolved escalation · returns in DRAFT_ONLY ·
pause/resume/escalate/close supported and unknown action rejected.

`src/pages/admin/AdminConversations.test.jsx` — 10 jsdom tests: commercial and
operational status shown separately · owner shown as CAMBRA or human · unread
badge only where there is one · unavailable source renders the fail-visible
panel and no rows · selecting a queue re-queries with that queue · the
"draft only · no sends" boundary is always visible · the detail explains WHY
autonomy is blocked · the superseded model prediction stays visible after a
human correction · the timeline is chronological and carries the untrusted
content notice · detail fetched through the canonical action.

## External effects

**Zero.** This workspace reads and drafts; it has no send path.

## Blockers / runtime pending

- Reply drafting, the follow-up queue and SLA computation are C6.
- Domains/mailboxes, suppression management and provider events are C7.
- Real inbound webhook verification and real thread resolution against live
  provider payloads remain `RUNTIME_PENDING`.
- `/admin/inbox` (approvals) consolidation stays deferred to C9 with a founder
  check-in, because real bookmarks point at it.

## Chunk hash

Recorded as the C5 commit hash.
