# Decision Log — DASHBOARD CORE C0 (baseline, reconciliation, gap map)

Date: 2026-08-17
Scope: C0 of the Dashboard Core master prompt. **No code was modified.** §33 forbids
editing before this baseline is delivered, and nothing was edited — the only writes are
this log and the four JSON deliverables under `config/dashboard/`.

External effects: **zero**. Read-only inspection throughout.

## 1. Baseline — recalculated from the tree, not copied from v0.98.0

| | v0.98.0 declared | **This tree** |
|---|---|---|
| version | 0.98.0 | 0.98.0 |
| git SHA | — | `02438b33df8aac8742deed501de38fe1b258b7fb` |
| branch | — | `agent/i18n-30-markets`, worktree clean |
| node | — | v24.19.0 |
| source files | 1,779 | **1,778** |
| physical Base44 functions | 276 | **276** ✓ |
| logical routes | 27 | **32** |
| entities | — | **263** |
| admin pages | — | **49** |
| sidebar entries | — | **43** |
| test files | 247 | **290** |
| tests | 3,116 | **3,957** |

The physical count reconciles exactly: 300 directories under `base44/functions/` minus the
24 logical routes that own a directory = 276, matching `physical_function_target`.

The delta from the declared baseline is explained: CAMBRA Command C1–C7 landed in this
tree (7 commits, `e4620bca`→`02438b33`), raising logical routes 27→32 and tests
3,116→3,957.

## 2. Branch reconciliation — the founder's open question, answered

The prompt treats Campaigns and Inbox & Conversations as
`FOUNDER_DECLARED_IMPLEMENTED_PENDING_TREE_RECONCILIATION`. Both are **present**:

| Module | State | Evidence |
|---|---|---|
| Campaigns | **EXISTING** | `AdminCampaigns.jsx` (618 lines) + 12 shared modules |
| Inbox & Conversations | **EXISTING** | `AdminConversations.jsx` (282 lines) + 4 shared modules |
| CAMBRA Command | **EXISTING** | `AdminCommandChat.jsx` (529 lines) at `/admin/chat` + 8 shared modules |

**`EXTERNAL_BRANCH_DEPENDENCY` count: 0.** Nothing is to be recreated.

One naming hazard worth recording: `AdminCommand.jsx` is the **Founder OS dashboard** at
`/admin` and `/admin/command`. The conversational Command surface is
`AdminCommandChat.jsx` at `/admin/chat`. These are different pages and were confused once
during the Command work; the mistake was caught by tests and reverted.

Also relevant to this programme: the Campaigns work left two founder blockers open —
`FounderPermit` and legacy page consolidation. **The first is now closed** (Command C1
built the permit authority and wired it into the campaign preflight). The second is this
programme.

## 3. The decision that mattered most, and how it was reached

For each workspace I ran a reader over the real tree, then an **independent agent
instructed to refute its verdict**. One verdict was CONFIRMED outright; four came back
PARTLY_WRONG with corrections that **kept** the verdict and the recommended root. Every
load-bearing claim below was then re-verified by hand.

> **No new persisted aggregate is justified for any of the five workspaces.**
> Four are server-side projections over authorities that already exist. Recover has a real
> root in `DealActivation`. **Exactly one** new durable entity is justified across the
> entire programme: an append-only pipeline stage-transition event.

That result is worth more than anything else in C0, because the expensive failure mode
here was inventing five aggregates to make five frontends easier — which §16.2 forbids.

### Corrections the refutation pass produced

- **Pipeline lane 3 is not a gap.** The first reader called PROVIDER_RELATIONS a total
  gap. `Provider.provider_monetization_status` exists with enum
  `unknown|opportunity|negotiating|contracted|active|prohibited` — verified by hand.
- **Finance cost aggregator misnamed.** The real primitive is `costRuntimeSnapshot`
  (`costGovernance.ts:1338`) with `summarizeCostUsage` at `:400`. The cited
  `readGovernedUsage` does not exist.
- **Intelligence write boundary.** The claim that all creates funnel through
  `intelligenceAccess` is not supported. It is the *declared* boundary
  (`P12_INTELLIGENCE_ARCHITECTURE.md:21`) but not the only writer in practice.
- **Recover root scope.** `DealActivation` is the root for the **merchant-scoped** Recover
  lifecycle, not for provider-scoped or aggregate negotiation. Scope the claim honestly.

## 4. Findings that change the plan

### 4.1 `DealApplication` is a dead entity — verified

Eight non-generated references: one mutator, three docs, four frontend files. **No
`.create()` call exists anywhere in the tree.** `Decision_Log_PURGE2.md` records that
`submitDealApplication` was deleted in FASE 1.2 with the entity at 0 rows.

So `/admin/pipeline` and `/admin/applications` are a UI over an entity with no writer and
no rows. Consolidation has **no data to preserve** from them. Pipeline is a REPLACE, not an
extension.

The proof that the transition authority is missing is a single line:
`AdminPipeline.jsx:16` defines `daysInStage(created_date)` — "days in stage" computed from
the creation date, because no stage-entry timestamp exists. The "stuck > 7d" badge is
therefore days-since-creation.

### 4.2 Six legacy pages are already architecturally correct

`AdminFinance`, `AdminProviderEconomics`, `AdminIntelligence`, `AdminMarkets`,
`AdminGrowth` and `AdminRoutingIntelligence` already call a **single server-side
aggregator**. Their small line counts are misleading — they are minified single-line files
with 3–15 KB of real JSX (AdminGrowth is 15,101 bytes on 44 lines).

These must be **consolidated under tabs, not rewritten**. Rewriting them is regression risk
for no gain.

### 4.3 Five sites write material entities directly from the browser

This is the §4.9 defect class. Two are serious:

- `AdminContracts.jsx:49` — `Contract.update(form.id, form)` writes the **entire form
  object** with no validation, tenant check, policy check or receipt. On contracts.
- `AdminProviders.jsx:36-42` — builds `revenue_share_pct` (**provider compensation**) from
  a browser form and writes it via generic CRUD. Provider rows feed Intelligence and
  recommendations, so this touches both §4.9 and the §4.11 firewall. **Highest-severity
  item in the migration matrix.**

Plus `FiscalIdentityCard.jsx:47` (Brand), and `AdminApplicationDetail.jsx:25,33,115`
(writes the dead entity).

### 4.4 Two pages make claims the code does not back

- `AdminDeals` offers editing in its subtitle and shows pencil icons, but renders a
  hard-coded array from `src/lib/deals.js`. Nothing persists.
- `AdminBenchmarks` says it controls the ranges used to calculate savings, but only
  displays values computed client-side. **No write path exists.**

Both claims must be corrected during consolidation rather than carried forward.

### 4.5 `DealActivation` has no production creator — verified

`DealActivation.create` appears in exactly three places, all non-production:
`seedDemoData/entry.ts:112` and `:123`, and `runFlowSelfTests/entry.ts:86`. Every real
writer only UPDATEs.

So the Recover root exists and is unusually well-guarded for transitions — the direct
mutator returns HTTP 410, a guard reverts illegal transitions, and every real move uses CAS
— but **nothing in production opens a case**. That is genuine new work, and it is a create
path, not a new entity.

### 4.6 None of the eight gate scripts §25 names exist

`dashboard:navigation:check`, `dashboard:workspace-contract:check`, `pipeline:check`,
`audits-opportunities:check`, `recover:check`, `finance:check`,
`intelligence:workspace:check`, `legacy-routes:check` — all absent. They must be created,
and `verify:chunk` extended.

## 5. The reference pattern, verified

`AdminMerchants.jsx:118-124` — one function, a `view` + `action` discriminator, and **zero**
`base44.entities` calls in the page:

```js
async function callMerchants(action, body={}) {
  const data = payload(await base44.functions.invoke("getFounderControlCenter", { view:"merchants", action, ...body }));
  if (data?.ok === false) throw Object.assign(new Error(data.error || "merchant_portfolio_operation_failed"), { data });
  return data;
}
```

Actions: `portfolio`, `list`, `kpi_detail`, `merchant_block`, `export`, `compare`,
`save_view`, `delete_view`. Even the mutations go through the function.

This shape solves the Base44 quota problem at the same time: each workspace becomes a
`view` on an existing host, so it is a **logical route** and the 276 physical functions stay
untouched.

## 6. Adjusted chunk plan

The prompt's C1–C14 shape holds. Adjustments justified by the findings above:

| Chunk | Adjustment |
|---|---|
| C1 | Extract the shared framework **from AdminMerchants** rather than designing it. Create the 8 gate scripts. |
| C2 | Pipeline: build the one justified entity (stage-transition event) + projection. Do **not** extend DealApplication. |
| C3 | Pipeline UI is a REPLACE. No data migration needed. |
| C4–C5 | Audits: fully new surface, but every authority already exists. |
| C6 | Recover root = `DealActivation`. New work is the **create path**, not a new entity. |
| C7 | Recover UI must land the governed Contract handler before `/admin/contracts` can redirect. |
| C8–C9 | Finance: the real gap is the revenue↔cost join. Do not rewrite the four correct pages. |
| C10–C11 | Intelligence: consolidate six aggregators; close the ProviderPricingVersion creator gap and the provider CRUD defect. |
| C12–C13 | Handoffs, Founder OS exceptions, then legacy removal **only** after parity. |
| C14 | Release candidate. Production seal stays **false**. |

## 7. Blockers

1. **`revenue_share_pct` editable from the browser** (`AdminProviders.jsx:36`). Must be
   replaced with a governed handler before `/admin/providers` redirects.
2. **Contract written wholesale from the browser** (`AdminContracts.jsx:49`). Same, before
   `/admin/contracts` redirects.
3. **No production creator for `DealActivation`**, so Recover cannot open a case today.
4. **OutboundLead carries three competing progression vocabularies.** The projection must
   declare one canonical reading and its mapping; it must not add a fourth.

## 8. Runtime pending

Unchanged and not closeable by writing code: production seal, all root seals
(8/8 `NOT_SEALED`), and every live proof in §28 — real pipeline transitions, real
connection handoff, real migration and go-live, real invoice and payment, real
reconciliation, SLO windows, backup/restore, Emergency drill, FounderPermit proof.

`productionSealEligible` remains **false**.

## 9. Deliverables

```
src/docs/Decision_Log_DASHBOARD_CORE_C0.md
config/dashboard/Dashboard_Page_Responsibility_Matrix.json
config/dashboard/Dashboard_Legacy_Route_Migration_Matrix.json
config/dashboard/Dashboard_Authority_Map.json
config/dashboard/Dashboard_Gap_Map.json
```

Classification totals: **5 EXISTING · 7 REUSE · 16 GAP · 2 RUNTIME_ONLY · 0
EXTERNAL_BRANCH_DEPENDENCY**.

Tree at C0 close: `02438b33`, unchanged. No code modified.
