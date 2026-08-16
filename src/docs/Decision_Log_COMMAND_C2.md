# Decision Log — CAMBRA Command C2 (durable conversations, branching, context)

Date: 2026-08-17
Scope: C2 of `PROMPT_CAMBRA_COMMAND_V1_1.md` — the conversational surface.

## What C2 replaced

The previous `/admin/chat` generated its conversation id in the browser and kept it in
`sessionStorage`. Consequences, all real: history died with the tab, could not be listed or
searched, could not be resumed on another device, and could not be branched. C2 makes the
conversation a durable `CommandConversation` row.

Sending is unchanged — it still goes through `chatChiefOrchestrator`, and every governance
gate that applied before still applies. C2 changes who owns the conversation, not what
Command is allowed to do. The multi-step tool coordinator is C4.

## Decisions worth recording

### 1. Naming and route: this is `/admin/chat`, not `/admin/command`

`AdminCommand.jsx` already exists and is the Founder OS dashboard, routed at both `/admin`
and `/admin/command`. The new conversational workspace is therefore `AdminCommandChat.jsx`
and keeps the `/admin/chat` route.

Keeping the route stable means every existing link, nav entry, `?ask=` deep link and i18n
navigation key in the admin shell keeps working with no churn — including
`AdminLayout`'s quick-command bar and the "Ask CAMBRA" buttons on the Founder OS and
Commercial OS pages. A redirect would have worked but bought nothing.

The old `AdminChat.jsx` is left on disk (it is read by `founderApprovalRegistry.test.js`)
but is no longer routed.

### 2. Branching references history; it does not copy it

A branch stores `branched_from_conversation_id` and `branched_from_message_id`. Reading it
walks the ancestor chain and inherits turns **up to and including the fork point**.

Copying was rejected: it duplicates founder history, doubles the retention surface, and
creates two rows claiming to be the same turn — after which "which one really happened" has
no answer. The `message_count` on a fresh branch is therefore `0`, which is true: it owns no
turns yet.

Inherited turns are returned with `inherited_from` set and are labelled in the UI. Showing
them as the branch's own would suggest the founder said things in a conversation that did
not exist yet.

### 3. Incomplete history is stated, never hidden

`resolveAncestry` returns a `truncated` flag instead of throwing. A branch whose parent is
unreadable, or a chain with a cycle, renders what can be proven plus an explicit banner:
*"What you see below is less than what was said."*

Silently rendering a partial timeline would be the worst outcome — it looks exactly like a
complete one.

The walk is bounded at 25 ancestors and detects cycles, so a data defect degrades instead of
hanging the page.

### 4. A failed read is never an empty history

`list` returns 503 `conversations_unavailable` rather than an empty array, and the page shows
*"This is a failed read, not an empty history — nothing has been lost."* A founder who sees
an empty sidebar after a transient failure would reasonably conclude their work was gone.

### 5. Archiving is a status change

`set_status` accepts only `ACTIVE` / `PINNED` / `ARCHIVED`. There is no delete action.
Tidying a sidebar does not destroy founder history.

### 6. Hosted as a logical route, not a new function

`commandConversationAdmin` runs on the existing `adminSummaries` entry point under the
`command_conversation_` action prefix. `BASE44_LOGICAL_ROUTE_TARGET` was raised 29 → 30 and
both topology invariant tests updated — deliberately, as that counter is a deliberateness
gate. **Physical function count is unchanged at 276**, which is what actually protects the
Base44 quota.

### 7. English only, deliberately

The spec asked for EN/FR/ES on this page. It ships in English instead.

The locale registry enforces key parity across **23 product locales**, not three. Adding
workspace copy for one admin page would either break parity or require translating it into
23 languages. 46 of the 54 admin pages are English-only; the 8 that use `useTranslation`
consume shared shell keys (`nav.*`, sidebar chrome), not workspace copy.

This is a declared deviation, not an oversight. Translating this workspace means running the
full locale protocol across 23 languages, and it should be a decision taken on its own.

## Carried forward

- The legacy `ChatMessage` migration planned in C1 (`commandLegacyChatMigration.ts`) is not
  yet executed — the plan exists and is tested; nothing has been written.
- `AdminChat.jsx` remains on disk unrouted. Removing it means updating
  `founderApprovalRegistry.test.js`, which is C9 consolidation work.
- Search across conversations is not built. The sidebar lists; it does not query.
