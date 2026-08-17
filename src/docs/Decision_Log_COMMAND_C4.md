# Decision Log — CAMBRA Command C4 (tool registry, tool search, multi-step loop)

Date: 2026-08-17
Scope: C4 of `PROMPT_CAMBRA_COMMAND_V1_1.md` — the biggest functional gap.

## The gap

`chatChiefOrchestrator` made **one** model call per turn, took **at most one**
`tool_use` block, ran it through the gates, and returned that result directly.
The tool's output never went back to the model.

So a request like *"find the ES merchants on the worst rates and draft outreach to
the top three"* was not expressible: it needs search → score → draft chained, each
step seeing the previous result. The founder had to run each step by hand and
carry the context between them.

## What C4 added

| Module | Job |
|---|---|
| `commandToolRegistry.ts` | Governance metadata for all 48 tools + Tool Search |
| `commandToolLoop.ts` | The multi-step coordinator |

## Decisions worth recording

### 1. The registry is derived, not duplicated

The 48 tools are declared inline in the orchestrator with `risk_level` and
sometimes `bulk_field`. Copying those 48 schemas into a registry would guarantee
drift. Instead the registry holds a **classification keyed by tool name**, and
`src/lib/commandToolRegistryC4.test.js` parses the real orchestrator source and
asserts the two sets are **equal in both directions**:

- a declared tool with no classification fails the build (`unclassified`)
- a classification for a tool that no longer exists fails too (`orphaned`)

`buildToolRegistry` returns unclassified tools rather than defaulting them.
**Unclassified is refused, not assumed safe** — a tool nobody classified is a tool
nobody decided was safe.

The test also pins that every tool the orchestrator rates L3 is marked
`always_drafts`, so the registry can never be more permissive than the gate that
already ships.

### 2. `external_effect` can never run in the loop, and the guard is forward-looking

No tool is in that class today. The entry exists in `AUTONOMOUS_ALLOWED` set to
`false`, and a test asserts both that it is false and that the class is empty, so
adding a send primitive later cannot silently become loop-executable. Widening a
run's scope cannot re-enable it either — the global rule is checked first.

### 3. The emergency epoch is re-read before **every** step

Checking once at the start would let a loop keep acting after the founder pulled
the lever. The loop captures the revision at open, re-reads before each step, and
halts with `REVIEW_REQUIRED` / `emergency_epoch_changed_mid_run` if it moved.
Stopping is the only honest move: once the rules change we cannot know whether the
rest of the plan is still authorised.

The orchestrator **did not consult `EmergencyControl` at all** before C4. It does
now, and an unreadable control blocks rather than defaulting open.

### 4. An unconfirmed effect escalates and is never retried

`ambiguous: true` from a tool ends the run at `REVIEW_REQUIRED`. Retrying could
double a real effect; declaring success could be a lie. A step that comes back
`requires_confirmation` is treated as ambiguous for the same reason — it is not a
completed step.

### 5. Refusals leave receipts

Every step appends a receipt, including refused ones, with kind `ESCALATION`. A
refused step that left no trace is indistinguishable from a step that never
happened. Ambiguous steps get `state: REVIEW_REQUIRED`, not `OBSERVED`.

This is also the first thing that writes into the C1 ledger, though see the
carry-forward below.

### 6. Caps end a run as PARTIAL, never COMPLETED

Steps, tool calls and cost are all capped. `COMPLETED` means the model stopped
asking; hitting a cap is `PARTIAL` and says which cap.

### 7. Tool Search is lexical on purpose

Choosing which tools the model may see must not itself depend on a model. Search
is a bounded lexical match over name/description/effect class, and at equal
relevance it **ranks the tool that changes less first**, so a plan naturally starts
by looking before it acts.

### 8. The wiring is scoped to read + analysis

This is the decision most worth understanding.

The loop is wired into the orchestrator with
`autonomousEffectClasses: ['read', 'analysis']`. The moment the model proposes
anything that writes, drafts or needs approval, the loop **hands it back** and it
goes through `executeToolWithGates` exactly as before.

That means the bulk-confirmation gate, the L3 forced-draft gate and the hash-bound
material-action preview are completely untouched, and for those flows behaviour is
**identical to the single-shot path**. The new capability is real chaining across
observe/understand/analyse, which is where the gap hurt most and where the risk is
lowest.

`effect_class_outside_run_scope` is deliberately a distinct reason from a refusal:
"not inside this loop" and "not allowed" are different facts, and a receipt that
conflated them would misrepresent what happened.

Widening the scope to `internal_write` and `draft` is a one-line change once the
read/analysis chain has been exercised in production. It was not taken here
because it would change live write behaviour on the founder's chat in the same
commit that introduces the loop.

## Carried forward

- **`appendReceipt` is not yet supplied by the orchestrator.** The loop supports
  it, tests cover it, and the wiring does not pass one — so `CommandReceipt` still
  has no production writer. This is the same honest gap C3 recorded, now one step
  smaller: the loop is the writer's natural home and the hook is in place.
- The loop does not yet persist a `CommandRun`. Runs are reported in the response
  but not durable.
- Widening the autonomous scope beyond read/analysis (see §8).
