# Decision Log — CAMBRA Command C7 (closing the declared debts)

Date: 2026-08-17
Scope: the four items C4, C5 and C6 recorded as carried forward.

## What was closed

| Debt (declared in) | Closed by |
|---|---|
| No tool-format translation → loop was Anthropic-only (C5) | `commandToolFormat.ts` + `routeToolCall` |
| Loop scoped to read + analysis (C4, C6) | widened to include `internal_write` |
| No scheduler advanced runs (C6) | `commandRunWorker.ts` + a 5-minute automation |
| No runs UI (C6) | `RunPanel` in `AdminCommandChat.jsx` |

## Decisions worth recording

### 1. Translation is outward-only, never provider-to-provider

One canonical tool shape (the catalogue's) is projected per provider, and both
providers' responses are normalised into one canonical call shape. Nothing is ever
translated provider-to-provider, so there is no round-trip that can silently lose
a field. The loop never learns which provider answered.

Conversation state stays **provider-native and is rebuilt per call** from canonical
history. Translating an accumulated transcript on every turn is exactly where a
field goes missing; rebuilding from one source cannot drift.

`strict: false` on OpenAI function tools is deliberate. Strict mode requires every
property in `required` and forbids optional fields; the catalogue has genuinely
optional inputs, and rewriting the schemas to satisfy a wire format would change
what the tools accept. **A tool contract must not bend to a wire format.**

### 2. An unparseable tool call yields NO call

OpenAI sends `arguments` as a JSON string. If it does not parse, the reader returns
no call and sets `parse_failed`. Running the tool with `{}` because we could not
read its arguments would execute something nobody asked for, and would look
identical to the model choosing those arguments.

### 3. Widening the loop is safe by construction, not by trust

`autonomousEffectClasses` now includes `internal_write`, so a real chain
(discover → enrich → score) completes in one turn.

`draft` is deliberately **not** in the list, and every tool the orchestrator rates
L3 carries `always_drafts`, so `authoriseStep` hands those back before executing.
The bulk gate, the L3 forced-draft gate and the hash-bound material preview are
untouched. `external_effect` can never run in a loop, and widening a run's scope
cannot re-enable it — the global rule is checked first.

### 4. The tool catalogue was extracted, and that fixed two things

The 48 declarations lived inline in `chatChiefOrchestrator`. That meant the
scheduled sweep could not read them (importing a `Deno.serve` entry point starts a
server), so a swept run would have had an **empty registry and refused every step
as `tool_not_in_registry`** — and the registry drift test had to parse source text.

`commandToolCatalog.ts` is data only, no SDK import, no side effects. The sweep
reads the same catalogue the founder's chat offers the model, and the drift test
now **imports** it instead of scraping. Three older tests that scraped the
orchestrator for tool declarations were repointed at the new location; the
assertions still check the tool exists and carries its fixed authority — only the
file moved.

### 5. A caught mistake worth recording

The first version of the sweep dispatch wired `callModel` to throw
`model_transport_not_configured`. That would have **failed every run every five
minutes** — worse than having no sweep at all. It was replaced with the real
`routeToolCall` transport before anything shipped. The lesson: a scheduled worker
with a stub transport is not a placeholder, it is a failure generator.

### 6. Sweep rules that are the worker's own

The worker adds **no authority** — CAS, cancellation, epoch and budgets all live in
`advanceCommandRun`. What is its own:

- **one slice per run per sweep**, so a single plan cannot starve every other run
- **oldest first**, so no run is starved by newer arrivals
- **bounded at 5 runs**, with `queued_not_swept` reported so a backlog is visible
- **terminal and human-held runs are never touched** — those mean "a person decides
  next", and advancing them routes around the escalation
- **one bad run does not abort the sweep**; a lost CAS is contention, not failure
- **an unreadable queue is reported as unavailable**, never as "no work"

### 7. The runs UI states what a run is waiting for

A run at `REVIEW_REQUIRED` with no reason shown reads as a hang rather than an
escalation, so `RunPanel` says *"waiting on you, not on a worker"* and lists the
blockers. An unreadable receipt chain shows "unreadable", not `0`. A pending
cancellation says plainly that in-flight work is not killed.

## Topology

`commandRunWorker` is a logical route on `maintenanceEngine`.
`BASE44_LOGICAL_ROUTE_TARGET` 31 → 32, all three counter sites updated. **Physical
stays 276.** Scheduler census 69 → 70 (active and guarded both moved to 68, so an
unguarded active schedule still fails), and `periodic_heartbeat_proven_count`
57 → 58.

## What remains — and cannot be closed by writing code

The repo-wide `runtime-verified` evidence states (`0 CLOSED; 0 runtime-verified`
across R0/R4/R5, `8/8 root seals NOT_SEALED`, OTR rows at `PASSED_LOCAL`) are
**not** Command debts and were not touched. They require real production
executions to produce `RuntimeGateEvidence` with a genuine deployment identity.
Fabricating them is exactly what `runtimeEvidence.ts` and the go-live gates exist
to prevent. They stay open, honestly, until CAMBRA runs in production.

Two smaller Command items are genuinely open and stated rather than hidden:

- `callCambraClaude` still serves callers that use emergency **epoch binding**
  (`guardedEmergencyEffect`), which `callCambraModel` does not offer. Migrating
  those needs the epoch-binding path ported first.
- The MCP server was not extended to expose the C4 governed registry. That was the
  discarded branch of D2 and is a coherent chunk of its own.
