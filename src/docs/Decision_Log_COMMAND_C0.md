# Decision Log — CAMBRA Command — C0 (baseline, inventory, gap map)

Date: 2026-08-17 · Tree: `1334820d`, working tree clean · Branch: `agent/i18n-30-markets`
Spec: `PROMPT_CAMBRA_COMMAND_V1` chunk C0. **No product code written** — C0 is inventory only.

## Baseline recalculated (do not read these from RELEASE.json)

| Metric | Value | Source |
|---|---|---|
| Node / npm | 24.19.0 / 11.17.0 | direct |
| Physical Base44 functions | **276** | `base44:functions:check` |
| Logical routes | **29** | same |
| Bundle staged files | 2885 | same |
| Entities | 257 | `ls base44/entities` |
| Git-tracked files | 1907 | `git ls-files` |
| Test files / tests | **276 / 3682**, 0 skips | fresh `npx vitest run` |

`RELEASE.json` still claims 27 logical routes and `.release-evidence/tests.json`
predates the Discovery V2 and Campaigns work. Per spec §0.3.5 this contradiction
is **reported, not silently reconciled** — the tree is authoritative.

## The four findings that change the plan

### 1. An emergency stop does not pause AI spend — CRITICAL

`base44/shared/costGovernance.ts:54-61` maps cost categories to emergency
capabilities: `email` → communications, `api`/`enrichment` → paid_discovery.
The **`ai` category maps to nothing**, so `emergencyCapabilitiesFor` returns an
empty array for every LLM call.

Today that is survivable because the only LLM caller is a single-shot chat.
CAMBRA Command would make it dangerous: Command is designed to be the largest
LLM spender in the system, running multi-step plans with fanout. Building it on
this foundation means the emergency stop would not stop it.

**Consequence for the plan:** closing this is a precondition for Command running
anything autonomously. It is listed as a PRE-C1 item in the gap map, ahead of
the chunk that would otherwise own it.

### 2. The current chat cannot do multi-step work at all

`chatChiefOrchestrator/entry.ts:720` is the only `callClaude` call site, and no
`tool_result` block is ever constructed. The model is called **once**, may emit
one tool call, the server runs it — and the model **never sees the output**. The
assistant reply after a tool run is a hand-written template.

This is the single biggest functional gap between what exists and what the spec
describes. Everything else in Command (planning, verification, fanout) is built
on the assumption that the model can read a tool result and decide the next step.

### 3. FounderPermit exists only as a named absence

No entity matches `*Permit*`. `CommercialCampaign.jsonc:51` carries a reserved
`founder_permit_id` with no reader or writer. `campaignPreflight.ts:203-207` and
`conversationAdminCore.ts:116` hardcode the permit as unavailable.

This is why, on this tree, **no campaign can reach APPROVED and CAMBRA can never
reply autonomously** — blocked by construction, not by policy. Closing it is the
load-bearing deliverable of this prompt.

### 4. The only OpenAI code in the tree is inside a frozen file

`base44/functions/processUploadedFile/entry.ts` is the sole place OpenAI is
called (the dual-reader statement cross-check), and it is listed in
`config/pre-ecl-freeze.json`. Meanwhile `commercialModelRouter.ts` hardcodes
Anthropic at several layers with Anthropic-shaped response parsing.

**Consequence:** "add a second provider" is not a refactor. It needs new
credentials, a new cost surface, and a founder-sanctioned freeze update to
extract the existing adapter. That makes it a decision, not a task.

## What to reuse rather than rebuild

- `chatChiefOrchestrator` — 48 declared tools behind four real gates (whitelist,
  bulk confirmation, risk-forced draft mode, server-side `fixed_input` override).
  This IS the control plane; extend it.
- `AgentTask` + `agentTaskEnvelope.ts` — a production-grade lifecycle with
  trace/lineage, attempt and fence tokens, effect and ambiguity state, and an
  approval-gated execution claim, already used by 8 orchestrators. `CommandRun`
  coordinates; it must not become a second task plane (spec §3.5).
- `founderOSCommand` — the two-phase preview→confirm pattern with nonce binding
  and a 10-minute preview expiry. A permit must extend this, not replace it.
- `paidProviderFetch` + `CostUsageEvent` — every Command LLM call routes here.
- The campaign primitives built in the previous prompt
  (`campaignAdminCore`, `campaignPreflight`, `campaignExecutionEngine`) — wrap,
  do not reinvent.

## Other verified gaps

- **No execution sandbox of any kind.** A repo-wide search for sandbox/container
  tooling returns only false positives. The analysis sandbox is greenfield.
- **Retention registration is voluntary** — a new entity can pass `verify`
  while being invisible to the retention matrix, and the entity↔category link is
  a free-text convention. New Command entities must be registered deliberately.
- **Outlook is delegated single-mailbox** (`/me`), with credentials outside the
  `IntegrationCredential` control plane. Per-tenant mailbox access does not exist.
- **The developer engine has no repository allowlist and no self-modification
  guard** — it can currently be pointed at CAMBRA's own repository.
- **Tenant scope is dropped for 31 of 48 chat tools** (`brand_id` is injected
  only in the forced-draft branch).

## Method note — honest about coverage

The C0 inventory ran as a 9-domain parallel read followed by a planned
adversarial pass that would try to REFUTE every claimed gap (to avoid rebuilding
something that already exists). **The refute pass did not run**: the session hit
its usage limit after the inventory phase, and two of the nine domains
(`agenttask-workforce`, `knowledge-evidence`) did not complete either.

Rather than re-run a 40-agent fanout, the load-bearing claims — the four findings
above — were verified directly with file:line reads. Everything else carries
inventory-agent evidence only and is marked `UNVERIFIED` in the gap map.

**Open coverage debt:** the knowledge/evidence plane was never inventoried. It
must be before C3 opens, because C3 is the assertion/citation layer and would
otherwise be designed blind. AgentTask was covered in depth by the
chat-orchestration reader, so that domain is not a real gap.

## Decisions the spec forbids me from taking alone (§0.3)

Recorded in `config/command/command-gap-map.v1.json` as D1–D5 and put to the
founder before C1 opens. No entity is created until they are answered.

## External effects

**Zero.** C0 wrote three files: this log and the two `config/command/` inventories.

## Chunk hash

Recorded as the C0 commit hash.
