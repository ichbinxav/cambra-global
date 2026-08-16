# Decision Log — CAMBRA Command C1 (schemas, ledger, permit authority)

Date: 2026-08-17
Scope: C1 of `PROMPT_CAMBRA_COMMAND_V1_1.md` — the durable substrate Command runs on.
Verification: `npm run verify:chunk` EXIT 0; 3764 tests pass (280 files).

## What C1 added

Six entities, three shared modules, three test suites, and one real behaviour change
in a surface that already shipped.

| Artefact | Purpose |
|---|---|
| `FounderPermit.jsonc` | The authority object. Scope lists, ceilings, expiry, hash. |
| `CommandReceipt.jsonc` | One link of the hash chain. Hashes, never bodies. |
| `CommandRun.jsonc` | Coordinates a request. Does **not** replace `AgentTask`. |
| `CommandConversation.jsonc` | Durable conversation, replacing a sessionStorage id. |
| `CommandArtifact.jsonc` | Produced output. Holds the content the receipt only hashes. |
| `ModelRouteDecision.jsonc` | Which provider answered, why, and whether money moved. |
| `commandReceiptLedger.ts` | Chain construction and tamper detection. |
| `founderPermitAuthority.ts` | Permit evaluation, including what a permit can never lift. |
| `commandLegacyChatMigration.ts` | Plans the migration of legacy `/admin/chat` history. |

## Decisions worth recording

### 1. The permit dimension in the campaign preflight now answers, and the old test was wrong to keep

Before C1, `campaignAdminCore` reported `founder_permit: UNKNOWN` because the authority
did not exist, and a test pinned exactly that. C1 is what closes that gap, so the test was
rewritten rather than preserved. The new invariants:

- **no permit bound → `BLOCKED`** (the authority answered; the answer is "nothing covers this")
- **valid permit → `PASS`, and the campaign can finally reach `READY_FOR_APPROVAL`**
- **unreadable permit → `BLOCKED`** (a failed read is not a grant)
- **emergency stop engaged → `BLOCKED` even at `FOUNDER_ROOT`**

`UNKNOWN` is still the honest verdict inside the pure `buildCampaignPreflight` for a caller
that wires in no authority at all. A missing authority is not a granted permit.

The blockers from `evaluatePermit` are now carried into the dimension detail. Telling the
founder "no permit covers this" without saying *why* makes a fixable problem look opaque.

### 2. `created_by` is not required on `CommandConversation`; `attribution_state` is

Legacy `ChatMessage` never declared an author field. A migrated conversation therefore may
genuinely have no owner. Two bad options were rejected:

- requiring `created_by` and writing a blank or sentinel — an unverifiable claim dressed as data
- attributing the conversation to whoever ran the migration — a fabricated fact

Instead every row must declare `attribution_state` (`OBSERVED` / `UNKNOWN` / `CONFLICTED`).
A row claiming `OBSERVED` with no `created_by` is then *detectably* wrong. When legacy rows
disagree about the author, the state is `CONFLICTED` and no winner is picked: two values mean
the grouping key was reused, and choosing either asserts something no row supports.

### 3. A migrated conversation does not claim a receipt chain

Legacy turns predate the ledger and were never receipted. Migrated conversations open with an
empty `receipt_chain_key`, which keeps them out of `verifyReceiptChain` entirely. Zero receipts
verifying cleanly would read as a clean bill of health for history that was never audited.

### 4. Content and evidence are separated so retention does not break the chain

`CommandReceipt` hashes `input_hash` / `output_hash`, never raw text. Bodies live in
`CommandArtifact`. This is what lets `command_conversation_content` purge bodies on a
400-day schedule while `command_receipt_ledger` is never deleted — deleting a receipt would
destroy the ability to detect tampering in the receipts around it.

`CommandArtifact` keeps the row and its `content_hash` after purge, flagged `content_purged`,
so history reads as "produced, then purged" rather than "never existed".

Three retention categories were registered (`command_conversation_content`,
`command_receipt_ledger`, `model_route_decisions`). Two are `CONFIGURATION_REQUIRED`, not
`AUTOMATED`: C1 ships schemas, not purge jobs, and the matrix's own truth boundary says
`CONFIGURATION_REQUIRED` is not represented as implemented deletion.

### 5. `ModelRouteDecision` records refusals, not only calls

`provider_call_performed` is required. A step that produced no model call because the AI
spend emergency was engaged is written with `route_outcome: REFUSED` and
`provider_call_performed: false`. Without this, "the model declined to answer" and "we never
asked" are indistinguishable after the fact.

### 6. The migration reconciles or reports failure

`reconcileLegacyChatMigration` requires `created + already_migrated + unusable ==
conversations_found`. Messages with no grouping key are counted as `unusable_messages`
rather than dropped. A migration that cannot account for every legacy conversation does not
get to report success.

## Carried forward

- **C3 remains blocked** by the coverage debt declared in C0: the knowledge/evidence plane was
  never inventoried and must be before the Truth Context Builder opens.
- The purge jobs for the two `CONFIGURATION_REQUIRED` categories are not written. The router
  that populates `ModelRouteDecision` lands in C5.
- `intelligence:canonical:generate` requires `CAMBRA_INTELLIGENCE_SPEC_DIR` and was not run;
  its `check` variant passes and is unaffected by C1.
