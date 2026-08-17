# Decision Log — CAMBRA Command C5 (provider router + OpenAI adapter)

Date: 2026-08-17
Scope: C5 of `PROMPT_CAMBRA_COMMAND_V1_1.md`. The founder authorised activating
OpenAI as a second provider in v1 (decision D3, §0.3).

## Decisions worth recording

### 1. Failover is legal only before transport — this is the load-bearing rule

`commercialModelRouter.ts:63` already carried the reasoning, and C5 does not relax
it:

> A non-2xx response is still post-transport. Anthropic exposes no reconciliation
> guarantee for this request, so there is no model fallback.

Adding a second provider does **not** make post-transport failover safe. Failing
over after a request has left could double-spend, and for anything with an effect
could double-act. So:

- **pre-transport failure** (provider not configured, refused before the request
  went out) → try the next provider, outcome `FAILED_OVER`
- **post-transport failure** (any non-2xx, any timeout after the socket opened) →
  `REVIEW_REQUIRED`, no failover, no retry, and `provider_call_performed: true`
  because a call genuinely was made

A **thrown adapter is assumed post-transport** unless it explicitly says
`transport_started: false`. The optimistic reading is the one that double-spends,
so it is not taken.

### 2. An explicitly requested provider is never silently swapped

If the caller asks for OpenAI and OpenAI is not configured, the router still
answers — but records `PRIMARY_UNAVAILABLE_FAILOVER` and
`rejected_providers_json.openai = 'not_configured'`. Quietly answering with a
different model would make the answer's provenance a lie.

### 3. Routing is by task class, and those are preferences not quality claims

`EXTRACTION` and `CLASSIFICATION` prefer OpenAI because the strict
`json_schema` structured-output path is what the document pipeline already relies
on. `REASONING`, `CODE`, `PLANNING`, `DRAFTING`, `SUMMARISATION` prefer Anthropic
because that is what every existing CAMBRA reasoning path uses. An unknown task
class becomes `OTHER` rather than failing.

### 4. Refusals are recorded, which is the entity's whole purpose

Every routed call writes a `ModelRouteDecision`, including the ones that never
reach a provider. `provider_call_performed: false` is the field that separates
*"the model declined"* from *"we never asked"* — without it those two are the same
row after the fact. The AI-spend emergency refusal is the case that matters most:
it writes `route_outcome: REFUSED`, `emergency_blocked: true`, and zero provider
calls.

A failed decision write logs and continues. The decision row is evidence, not a
precondition — but it is not silent either.

### 5. The OpenAI adapter is new, not extracted

`processUploadedFile/entry.ts` has a working OpenAI adapter, and it is **frozen
production evidence code**. Extracting from it would force a freeze update for no
functional gain, so C5 writes a fresh adapter against the same `/v1/responses`
API. It sets `store: false`: Command prompts carry founder business context and
must not be retained by the provider for history or training.

### 6. Two independent emergency lines, not one

Both adapters call `reservePaidOperation` with `category: 'ai'`, which
COMMAND-C0 mapped onto the `paid_discovery` emergency capability — so a safe-mode
row already blocks the spend inside the adapter. The router's own `readEmergency`
is an **earlier** refusal that avoids reserving at all. Neither is the single line
of defence.

### 7. A stale governance claim, found and corrected

Migrating one caller from `callCambraClaude` to `callCambraModel` dropped the R0
AI-caller census from 38 to 37. The generator matched only
`/\bcallCambraClaude\b/`, so **a real AI spender became invisible to the material
boundary registry the moment it was migrated.** Fixed to match both primitives.

That investigation surfaced a second, worse problem. The registry claimed:

```
emergency_capability: "NONE"
gap_codes: ["EMERGENCY_CAPABILITY_MISSING_AI", ...]
```

Both were false. COMMAND-C0 closed that gap and did not update this inventory, so
the registry has been reporting an open AI-emergency gap that the code had already
closed. Corrected to `paid_discovery`, with the gap code removed.

The self-assertion `emergency_capability === "NONE"` existed precisely to stop
anyone claiming the gap closed without doing the work. It was **repointed, not
removed** — still pinned, now to the truth, so changing it again carries the same
burden of proof. The evidence is `src/lib/aiSpendEmergencyCoverage.test.js`, which
asserts zero provider calls under safe mode end to end.

### 8. First consumer: the Chief of Staff, not the tool loop

`founderChiefOfStaff` now routes through `callCambraModel` and reports
`answered_by: { provider, model }`.

The C4 tool loop was **not** migrated. Its model calls use Anthropic `tool_use`,
and OpenAI's function-calling format differs; routing it across providers needs a
tool-format translation layer that does not exist. Callers needing tool-use stay
on their provider-specific path, and `callCambraModel`'s doc comment says so
explicitly rather than leaving it to be discovered.

## Carried forward

- **No tool-format translation layer.** Until one exists, the multi-step loop is
  Anthropic-only. This is the main thing standing between C5 and full dual-provider
  operation.
- `callCambraClaude` remains in place for its other callers, including the paths
  that use emergency epoch binding (`guardedEmergencyEffect`), which
  `callCambraModel` does not yet offer.
- `OPENAI_COMMAND_MODEL` defaults to `gpt-4.1`; no OpenAI model is pinned in
  config.
