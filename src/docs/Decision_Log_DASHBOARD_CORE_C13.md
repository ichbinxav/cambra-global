# DASHBOARD CORE — C13 decision log

**Date:** 2026-08-17
**Scope:** Migration and retirement — build the last workspace, wire the redirects, cut the
sidebar after parity.

---

## 1. Headline: the sidebar cut is BLOCKED, and it should be

C13's target was 43 sidebar entries down to 12. **Cutting it today would remove navigation to
ten pages that still exist and are reachable from nowhere else.**

The registry tracks 12 legacy redirects and 11 Advanced System children. Against the current
sidebar that leaves ten entries with no declared destination:

`/admin/inbox` · `/admin/approvals` · `/admin/founder-control` · `/admin/copilot` ·
`/admin/commercial` · `/admin/commercial-autonomy` · `/admin/aggregate` · `/admin/overview` ·
`/admin/users` · `/admin/waitlist`

Prompt section 2.5 forbids retiring a route before parity, and a route whose only navigation
entry is deleted has been retired whether or not the route still resolves.

**None of the ten mappings is mine to make.** They are decisions about where an operator finds
a surface, and several have two defensible answers that mean different things:

| Route | Evidence | Proposed | Why I did not decide |
| --- | --- | --- | --- |
| `/admin/inbox` | calls `founderOSCommand`; reads AgentQuestion, AgentTask, Approval | Founder OS | The target's "Inbox & Conversations" is the *merchant* thread surface. This is the founder queue. Merging two different inboxes under one label is a product call. |
| `/admin/approvals` | calls `founderOSCommand`; reads Approval; pending badge | Founder OS | A blocking approval queue may warrant its own entry. |
| `/admin/founder-control` | calls `getFounderControlCenter`, `emergencyControlAdmin`, `goLiveControlAdmin` | Founder OS | This is where the **emergency controls** live. Burying an emergency stop inside a tab must be chosen, not inferred. |
| `/admin/copilot` | calls `founderCopilotAgent`, `investorUpdateAgent`, `qaAgent` | CAMBRA Command | Whether Command supersedes Copilot or they coexist is a call about which one is the real one. |
| `/admin/commercial` | reads `CLUSTERS`, `lib/commercialOS.js`; lead filtering and CSV export | Campaigns | — |
| `/admin/commercial-autonomy` | calls `commercialPolicyAdmin`, `outboundControlAdmin` | Campaigns | Autonomy policy governs *sending*. Campaigns or Settings both work, and they differ in who is expected to change it. |
| `/admin/aggregate` | 2-line minified page, one aggregator | **UNKNOWN** | I could not determine what it is for. Proposing a home would be a guess. |
| `/admin/overview` | reads Brand, AnalyzerResult, DealActivation, DealApplication | Founder OS | Founder OS is already the overview; whether this holds anything it lacks needs a look at both. |
| `/admin/users` | reads User, Brand, UserDeal | Settings | Merchants is the *client* surface; platform user administration is a different concern. |
| `/admin/waitlist` | calls `getWaitlistLeads` | Discovery | A waitlist is inbound, Discovery is outbound. Both top-of-funnel, not the same motion. |

All ten are declared in `unmapped_routes` with `decision_required: true`, and
`dashboard:navigation:check` **fails if the sidebar is ever cut to twelve while any of them is
still undecided.** The cut cannot be completed dishonestly, by me or by anyone else.

What C13 did deliver: the sidebar went 43 → **35**, by removing exactly the ten routes that now
redirect. Nothing is orphaned by that.

---

## 2. Four real problems found by writing the parity check

The `blocker_cleared` flags from C9–C11 said the destinations were ready. Verifying that claim
per row rather than trusting it found four failures.

**`/admin/revenue` pointed at the wrong tab.** The registry sent it to
`/admin/finance?tab=overview` — the C8 five-domain snapshot — while the revenue *content* (the
per-provider breakdown, the monthly collected series) lives in the `revenue` tab. I noted this
mismatch in C9, said I would correct the query, and did not. Corrected now, and a test pins it.

**`/admin/contracts` would have made Contracts unreachable.** It redirected to
`/admin/recover?tab=contracts` and `AdminRecover` had no tab handling at all — no
`useSearchParams`, no tab list. The operator would have landed on the cases view and the entire
Contracts surface (295 lines, converted to a governed handler in C7) would have disappeared. A
two-tab shell was added to Recover and `AdminContracts` is mounted unchanged.

**`/admin/recover` was never in the sidebar.** The reverse-coverage check — every LIVE target
entry must appear in the sidebar — found that Recover has been reachable only by typing the URL
**since C7 built it**. So has `/admin/audits`, from the moment it existed. Both added.

**Two blockers were stale, and their real problems are different.** Both said "Pipeline
replacement lands in C3", which C3 delivered:

- `/admin/deals` reads `DEALS` from `src/lib/deals.js` — a hard-coded array — and offers "Edit
  deal metadata and status" over a **compile-time constant**. There is no persistence at all.
  Same class as the Benchmarks claim in C11: the claim must be corrected before the route is
  retired. And a deal catalogue is not a pipeline, so `/admin/pipeline` is the wrong destination.
- `/admin/applications` is an admin page over `DealApplication`, which the pipeline registry
  declares `ZERO_PRODUCERS` with evidence: *"No .create() exists anywhere in the tree.
  submitDealApplication was deleted in FASE 1.2 with the entity at 0 rows"*, and the rule *"Do
  not extend, do not project, do not resurrect."* Retiring this is a **deletion**, not a
  migration, and needs the founder rather than a redirect.

Both rows now carry the verified finding instead of the stale text, and stay `ready: false`.

---

## 3. The last unbuilt workspace

`/admin/audits` existed as a backend from C4 and as a logical route since then; only the page was
missing, so entry 8 of the twelve-entry target pointed at nothing. Built now, which is why the
gate reports **0 workspaces not built** for the first time.

Two display rules carry it, both from defects `auditsCore` was written to prevent: an
`ANONYMOUS_ESTIMATE` is headlined "Estimated savings" and never "Verified savings"; and the six
opportunity figures render as six labelled rows with **no total and no control that would
produce one**, because adding any two of them is the defect. A test asserts the card carries
neither a sum of them nor the word "Total", and that it shows no invoice or billable amount —
billing is Finance's authority.

---

## 4. A check my own comment made lie

After trimming the sidebar I added a comment referencing
`config/dashboard/navigation.v1.json`, and the gate began reporting *"layout renders from
registry"*. It does not — the inline `NAV` array is still the source. The check was
`layout.includes('navigation.v1.json')`, which a **comment** satisfied.

It now requires an actual `import` statement, and correctly reports "inline NAV".

This is the fifth instance in this programme, and the shape is now unmistakable: **a check that
greps text will eventually be satisfied by text about the check.** The three defences that work
are: strip comments before structural checks (C9), assert on something only the implementation
can render such as a `data-testid` (C11), and require a syntactic form rather than a substring
(here, and the empty-extraction throw in C12).

---

## 5. Counters

- Sidebar 43 → **35** entries. Target 12, cut **BLOCKED** on ten declared decisions.
- Redirects: 0 → **10 ready and wired**; 2 pending with corrected blockers.
- Target entries: 11 LIVE + 1 NOT_BUILT → **12 LIVE, 0 not built**.
- Logical routes **38**, physical functions **276** — unchanged, no new route in C13.
- Direct browser CRUD unchanged at 4 open, zero CRITICAL.
- No new entity. No seal changed. `productionSealEligible` remains `false`.

---

## 6. What C14 inherits

- **The ten destination decisions.** Until they are made the sidebar cannot reach twelve
  entries, and no amount of code changes that.
- `/admin/deals` — correct the "edit" claim over a hard-coded array, then choose a destination.
- `/admin/applications` — decide whether to delete a surface over an entity with zero producers.
- The three remaining non-critical CRUD sites: `OrganizationsPanel`, `AdminApplicationDetail`,
  `AdminUserDetail`.
- `AdminLayout` still renders from an inline array. Rendering from the registry is the last
  consolidation step and is only worth doing once the twelve entries are settled.
- The production seal stays **false**. Nothing in C0–C13 produced runtime evidence, and the
  eight root seals remain `NOT_SEALED` for that reason.
