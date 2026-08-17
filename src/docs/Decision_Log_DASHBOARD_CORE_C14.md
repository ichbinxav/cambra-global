# DASHBOARD CORE — C14 decision log and programme close

**Date:** 2026-08-17
**Scope:** Final verification, the founder's ten destination decisions, and the consolidation
they unblocked.

---

## 1. The ten decisions, as given

C13 stopped with ten admin routes that had no declared home and refused to cut the sidebar
around them. The founder decided all ten. Eight are mappings, **two are retirements**, and one
changes the declared architecture.

| Route | Decision | Implemented as |
| --- | --- | --- |
| `/admin/overview` | Becomes the **body** of Founder OS | default tab of `/admin` |
| `/admin/inbox` | Tab of Founder OS | `/admin?tab=queue` |
| `/admin/approvals` | Merged with Inbox into **one** founder queue | `/admin?tab=queue` |
| `/admin/copilot` | **Remove** | unrouted; functions kept |
| `/admin/commercial` | Tab of Campaigns | `/admin/campaigns?tab=commercial` |
| `/admin/commercial-autonomy` | **Settings**, not Campaigns | `/admin/settings?tab=autonomy` |
| `/admin/users` | Settings | `/admin/settings?tab=users` |
| `/admin/waitlist` | Tab of Discovery | `/admin/discovery?tab=waitlist` |
| `/admin/founder-control` | **Its own entry**, not a tab | 13th sidebar entry |
| `/admin/aggregate` | **Defer**; remove the surface for now | unrouted; entities kept |

### The architecture is thirteen entries, not twelve

The founder accepted that Founder Control keeps its own entry because it carries
`emergencyControlAdmin` and `goLiveControlAdmin` — two clicks to an emergency stop is one too
many. So the "twelve-entry sidebar" the whole programme was built toward is **thirteen**.

That is recorded as `invariants.target_entry_count: 13`, and both the gate and the C1 test now
read it from there instead of hard-coding twelve. A gate with the old number hard-coded would
have fought the architecture it exists to protect.

### Two retirements, and what was not deleted

`/admin/copilot` and `/admin/aggregate` lose their route and their sidebar entry. **Neither
deletes a backend.** `founderCopilotAgent`, `investorUpdateAgent` and `qaAgent` remain inside the
276 physical quota, unrouted; `AggregatePool`, `AggregateRFP`, `AggregateBid`,
`PrivateRateCard`, `MerchantRateEligibility` and `getAggregateCommandCenter` are untouched. The
founder's reason for Aggregate was explicit — the KPIs are available elsewhere, and the surface
returns when there is a collective negotiation to run. Both page files are kept with a header
saying they are unrouted and where the decision lives.

### One honest limit on decision 3

Merging Inbox and Approvals puts both surfaces in one place, which is the navigation decision.
It does **not** merge them into a single ranked list: that needs one ordering across three
differently-shaped sources (`AgentQuestion`, `AgentTask`, `Approval`), and inventing that
ordering would be a guess about which item a founder should see first. The tab renders a note
saying so, so the label "Queue" does not imply a fusion that has not happened.

---

## 2. What C14 verified before touching anything

The full release pipeline — `npm run verify`, not `verify:chunk` — passed end to end, producing
the lint, typecheck, test, build and dependency evidence and regenerating `RELEASE.json`:
**CAMBRA v0.98.0 — 30/33 Verified Repository Package (No Production Seal)**.

Two findings in the release manifest itself:

**A completed requirement had gone false.** It read *"exactly 276 physical functions behind 27
logical routes"*. The programme added eleven logical routes and the statement never moved. A
*completed* requirement that no longer matches reality is worse than a pending one — it is a
claim of doneness over a changed fact. The count is now interpolated from the bundle the
generator already inspects, so it cannot go stale again.

**The programme's own debts were absent from the release ledger.** The ten decisions, the two
unretired routes and the sidebar state are now `pendingProductionRequirements`, **derived from
`navigation.v1.json`** rather than restated — so they clear themselves when the registry does and
cannot be declared done while the registry says otherwise.

And a number I had stored went stale inside one chunk: `sidebar_cut.current_entries` was written
as 43 in C13 and was wrong by the end of C13. It is now **not stored at all** — counted from the
layout by both the gate and the manifest — and the gate fails if anyone puts it back.

---

## 3. The consolidation

Four shells absorb the mapped routes: Founder OS, Campaigns, Discovery and Settings. Each mounts
the existing pages unchanged, the pattern used since C9 — rewriting a correct page is how a
correct page stops being correct. The fifth copy of the tab shell became the shared
`WorkspaceTabs` component instead.

**The Advanced System nesting.** The eleven `advanced_system_children` were eleven top-level
sidebar entries. They now render nested and collapsed under a single Advanced System block. I
briefly had them excluded from the top-level list *without* the nested block rendered — which
made eleven routes unreachable, exactly the orphaning C13 refused to do. The gate did not catch
it because the paths were still in `NAV`; the test that now does asserts both the paths and the
rendered `ADVANCED_NAV.map`.

Final state: **26 sidebar entries — 15 top level, 11 nested.** Thirteen of the fifteen are the
declared architecture; the remaining two are `/admin/deals` and `/admin/applications`, still
pending with the blockers C13 corrected.

---

## 4. Programme close: C0 → C14

**Built:** five canonical workspaces (Pipeline, Audits & Opportunities, Recover, Finance,
Intelligence) plus the Founder OS, Campaigns, Discovery and Settings shells. Logical routes
27 → **38**; physical functions **276**, untouched throughout. **One** new entity in the whole
programme (`PipelineStageEvent`) — the C0 conclusion that four of five workspaces are projections
over existing authorities held for all fourteen chunks.

**Browser CRUD:** 12 sites → **4 open, zero CRITICAL**.

**Eight gates added:** navigation, workspace contract, legacy routes, pipeline, audits,
recover, finance, intelligence, integrations.

**The defect that recurred most:** `Number(null) === 0`. It appeared in `founderOSData`,
`auditsCore` and `pipelineCore` before being centralised in `nullableNumber.ts`, and the display
layer could still undo it — `€${Math.round(value)}` renders null as €0.

**The lesson worth carrying:** five separate times a gate was satisfiable without checking
anything — a comment quoting the forbidden pattern (C4, C9), a check satisfied by the corrective
comment I had just written (C11), a marker matching a pointer instead of the claim (C11), two
empty extractions compared as equal (C12), and a comment making a gate report "renders from
registry" when it did not (C13). **A check that greps text will eventually be satisfied by text
about the check.** The three defences that work: strip comments before structural checks, assert
on something only the implementation can render, and require a syntactic form rather than a
substring — with an extraction that throws when it finds nothing.

---

## 5. The production seal stays false

`productionSealEligible: false`. All eight canonical root seals remain `NOT_SEALED`.

Nothing in C0–C14 produced runtime evidence. Every chunk was repository work verified locally:
the tests prove behaviour against fixtures, the gates prove structure against source, and
neither proves a deployed system did anything. The seals require exact source, runtime, privacy,
cost and lineage evidence from a real deployment, and **21 pending production requirements** name
what is still missing — starting with a green remote CI run for the final SHA, which this
manifest was not generated inside.

Changing any of that without the evidence would be the one failure this programme was built to
prevent.

---

## 6. Open after C14

- `/admin/deals` — the "edit" claim over a hard-coded array must be corrected, and the
  destination re-chosen; a deal catalogue is not a pipeline.
- `/admin/applications` — deciding whether to delete a surface over an entity with zero
  producers.
- The single ranked founder queue (decision 3's remaining half).
- Three non-critical CRUD sites: `OrganizationsPanel`, `AdminApplicationDetail`,
  `AdminUserDetail`.
- `AdminLayout` still renders from an inline array rather than the registry.
- Legacy `Provider.revenue_share_pct` values still exist in data; C11 stopped new ones and
  surfaces divergence.
- Existing OAuth apps and webhooks that predate C12's governed registration; the registry
  surfaces which.
- **Aggregate returns when there is a negotiation to run.**
