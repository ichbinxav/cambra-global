# Decision Log — CAMBRA Command C6 (durable executor)

Date: 2026-08-17
Scope: C6 of `PROMPT_CAMBRA_COMMAND_V1_1.md`, redesigned after the D2 decision.

## 0. The premise C6 shipped with was not available

C6 as specified was a "personal executor" with access to the founder's personal
Codex / Claude Code / ChatGPT accounts, gated by an OAuth strategy (decision D2).

**That is not obtainable.** Neither Anthropic nor OpenAI offers a third-party
OAuth client flow that grants an application a consumer session — there is no
"connect with ChatGPT" that hands your Codex to another app. Building toward it
would have meant either faking it or storing personal credentials that cannot be
obtained legitimately.

Two further facts from the repo shaped the alternative:

- **CAMBRA is an OAuth *server*, not a client.** `OAuthApp` holds
  `client_secret_hash` / `redirect_uris` / `allowed_scopes` / `pkce_required`, and
  `OAuthToken` stores only `access_token_hash` and `access_token_last4`. It is
  built to *issue* credentials. Third-party credentials live in
  `IntegrationCredential`, encrypted and server-only.
- **The Remote MCP server already exists** (`base44/functions/mcpServer/entry.ts`,
  730 lines): JSON-RPC `initialize` / `tools/list` / `tools/call`, authenticated
  by Bearer against a CAMBRA-issued token.

**Founder decision (D2, taken 2026-08-17):** build the **own-API-key executor** —
CAMBRA executes on the founder's behalf using its own provider keys (the C5
router) and touches no personal account. Credentials: **reuse the existing OAuth
flow as-is**, adding no new issuance.

## 1. What C6 built

| Module | Job |
|---|---|
| `commandRunExecutor.ts` | Durable run: start, advance one slice, cancel |
| `commandRunAdminCore.ts` | `command_run_` logical route: start / status / cancel / advance |

This is also where **two declared debts close**: `CommandRun` and `CommandReceipt`
now have real production writers. The receipt chain is verified across slice
boundaries with a real hash function in
`src/lib/commandRunExecutorC6.test.js`.

## 2. Decisions worth recording

### Slices, not one long invocation

The C4 loop runs inside one invocation. A real request can outlive that, so a run
advances one bounded slice at a time and persists between them. Everything below
is about what happens *between* slices — the C4 properties already cover what
happens within one.

### Concurrency is compare-and-swap on `run_revision`

`casRun` throws on a lost CAS rather than returning false: a caller that ignored
it would carry on believing it owns the run. The slice is **claimed before any
work is done**, so a second worker loses immediately rather than after spending
money. `advance` translates a lost CAS into 409 `command_run_advanced_elsewhere` —
another worker owning the slice is not a failed run.

### Cancellation sets a flag; it does not kill in-flight work

A paid provider call cannot be un-made. So cancel records intent and the **next
slice refuses to start**. The API says this plainly rather than implying an
immediate stop. Cancelling an already-terminal run is refused, not silently
accepted.

### A resumed run may not span an emergency epoch change

The epoch is re-checked at the start of every slice, and a run whose
`emergency_control_revision` moved goes to `REVIEW_REQUIRED` instead of resuming.
Within a slice the C4 loop already re-reads before every step; this is the
between-slices half of the same rule.

### Budgets bound the whole run

`tool_calls_used` and `cost_minor_used` accumulate across slices and the slice
budget is derived from what remains. Capping each slice independently would let a
long run spend without limit.

### Only `RUNNING` continues

`may_continue` is false for anything terminal or human-held. A worker that kept
advancing a `REVIEW_REQUIRED` run would be working around the escalation.
`runStatusForOutcome` maps an unrecognised outcome to `REVIEW_REQUIRED`, never to
a success.

### Receipts are evidence, not a precondition

A receipt that fails to persist logs and the slice continues — but it is never
silent. A receipt the ledger *refuses to build* is logged as
`command_receipt_rejected`: the step happened and we could not record it
truthfully, which is a defect worth surfacing.

### `advance` is exposed rather than left to a scheduler

It makes the executor usable the day it ships. Every safety property is enforced
inside `advanceCommandRun`, not by whoever calls it, so a scheduler added later
calls exactly this and inherits all of it.

### Still scoped to read + analysis

`autonomousEffectClasses: ['read', 'analysis']`, same as C4. Runs bounded at 24
tool calls and 20 000 minor units, 4 steps per slice — deliberately low until runs
have been exercised.

## 3. Topology

`commandRunAdmin` is a logical route on `adminSummaries`.
`BASE44_LOGICAL_ROUTE_TARGET` 30 → 31 with all three counter sites updated
(`scripts/lib/base44Bundle.mjs`, `base44DeploymentTopology.test.js`,
`base44ReproduciblePipeline.test.js`). **Physical stays 276.**

## Carried forward

- **No scheduled worker advances runs yet.** A run progresses when `advance` is
  called. Adding an automation touches the scheduler census and was left as its
  own decision.
- **No UI.** The route works; the Command page does not yet start or show runs.
- **Still no tool-format translation layer**, so runs are Anthropic-only for
  tool use (C5 carry-forward, unchanged).
- Widening the autonomous scope beyond read/analysis remains the founder's call.
- The MCP server was **not** extended to expose the C4 governed registry. That was
  the discarded branch of D2 and is a coherent future chunk on its own.
