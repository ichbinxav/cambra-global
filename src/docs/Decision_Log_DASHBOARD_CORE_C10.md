# DASHBOARD CORE — C10 decision log

**Date:** 2026-08-17
**Scope:** Intelligence consolidation backend — the workspace projection, and the pricing
promotion path that closes INT-2.

---

## 1. C0's INT-2 was right that there was a gap, and wrong about its shape

C0 recorded: *"No live creator for ProviderPricingVersion, the canonical pricing ledger.
It is read by 13+ call sites and written by no production path."*

Verified against the code, the truth is more specific and considerably more useful:

| What C0 said | What is actually there |
| --- | --- |
| written by no production path | written by `seedP3RateIntelligence` (a seed) and quarantined by `knowledgeIntegrityWorker`. Neither is an operational creator, so the conclusion holds — but a fix that just "adds a writer" would collide with existing locks. |
| — | `rateIntelligenceWatchWorker` runs every 6h, detects that a provider's pricing page changed, and writes a `RateChangeCandidate`. **Nothing reads that table.** Not one call site. |
| — | `canAutoPromote` — the predicate that decides whether a candidate may become pricing truth — is exported, tested, and **called by no production code**. |
| — | `P12_INTELLIGENCE_ARCHITECTURE.md:15` claimed `intelligenceMaintenanceWorker` versions pricing into `ProviderPricingVersion`. It does not: the P3 cutover made it projection-only (it writes `FxSnapshot`, `PaymentsRateTable`, `Event`) and `p12Intelligence.test.js` locks that. |

So the chain was: **detect → nothing → pricing truth**. Change detection has been running
into a dead-end table for as long as it has been scheduled, and the promotion gate that
should have stood in the middle was dead code. That is the same shape as the C8 defect
where `consolidate` was written and never wired — a guard that guards nothing.

C10 builds the missing middle rather than a new writer.

---

## 2. The watcher was already honest. That mattered.

`rateIntelligenceWatchWorker` creates candidates directly in `REVIEW_REQUIRED` with the
reason codes `SOURCE_CONTENT_CHANGED` and `NO_DETERMINISTIC_RATE_EXTRACTION_PROMOTION`,
and marks the payload `semantic_extraction_status: UNSTRUCTURED_CHANGE_ONLY`. It refuses
to derive a price from unstructured text and says so in the record.

That refusal is now load-bearing, so C10 makes it structural rather than conventional:

- `classifyCandidate` tests the unstructured status **first**, before any validation or
  promotion logic, so no later branch can reach a promotable verdict.
- `previewPromotion` refuses a non-promotable candidate before computing a hash, so
  `applyPromotion` cannot be reached by supplying a hand-made hash.
- `intelligence:check` fails if `canAutoPromote` appears in the source *before* the
  unstructured guard, which is what a careless reordering would look like.
- A test sets every promotion signal to true on an unstructured candidate — perfect
  signals, no numbers — and asserts it is still refused.

**A changed page is not a price.** Promoting one would have CAMBRA quoting a rate it
invented from an HTML diff.

---

## 3. Two findings about the fingerprint, which the whole copy-only rule rests on

`P12_INTELLIGENCE_ARCHITECTURE.md` states: *"semantic pricing hashes include economic
dimensions, not presentation/source copy, so copy-only changes do not become pricing
changes."* Neither implementation delivers that.

1. **The watcher stores the normalized content hash in the candidate's
   `semantic_fingerprint` field.** A content hash is a value from the wrong domain: it
   changes on any wording edit, so it cannot answer whether the economics changed.
2. **`semanticFingerprint` in `src/lib/p3RateIntelligence.js` includes
   `source_snapshot_id` in the hashed payload.** Two observations with *identical*
   economics from two different snapshots therefore produce different fingerprints —
   the exact opposite of the stated property. The existing test asserts only determinism
   and order-stability, so it never had a chance of catching this. There is no fingerprint
   function in the backend module at all.

**Decision:** add `economicFingerprint` as a **new, differently named** function rather
than changing `semanticFingerprint`. The existing value may already be persisted, and
silently redefining a stored hash is its own defect. `economicFingerprint` excludes the
snapshot id, the source url and every presentation field.

A test pins the distinction explicitly: identical economics from different snapshots get
the **same** economic fingerprint and **different** semantic fingerprints. The defect is
recorded in a passing test rather than in a comment.

---

## 4. Promotion is additive

A promoted observation creates a **new** `ProviderPricingVersion` and marks the previous
one `SUPERSEDED` with `superseded_by_observation_id`. The old row's economics are never
touched. A corrected price does not erase the price that was true last month — decisions
were made on it, and a Recover case may still cite it.

Three further rules:

- **A promoted observation is never born VERIFIED.** It is created as `RESEARCHED` /
  `truth_level: observed`. Verification is a separate act with its own evidence.
- **Superseding VERIFIED pricing raises a `KnowledgeConflict`** with
  `affects_active_operation: true`, per the doctrine already in the architecture doc. It
  is a review point, not a silent write, however clean the signals look.
- **If the old version cannot be retired, the response says so** (`superseded_previous:
  false`, `two_rows_claim_current: true`). Two rows claiming CURRENT is a real state and
  hiding it would leave the resolver picking arbitrarily.

---

## 5. Rejecting is a first-class action

An unstructured candidate can never be promoted. Without a way to close one, the queue
would fill with rows nobody can clear — which is what has been happening. `rejectCandidate`
requires a stated reason (a dismissal with no reason is indistinguishable from an accident
six months on) and reports `pricing_changed: false`, so closing a candidate is never
mistaken for a decision about the price.

---

## 6. The workspace stays a projection

C0's verdict was `AUTHORITY_EXISTS_BUT_FRAGMENTED` / `PROJECTION_ONLY`, and that holds.
`intelligenceWorkspaceCore` reads the knowledge planes and owns nothing. It declares the
five existing aggregators, and the gate fails if it writes.

The coverage KPI is the one most easily made to lie: *"markets with verified pricing: 0"*
and *"pricing coverage could not be read"* look nearly identical on a dashboard and mean
opposite things. Every count is null when its source failed, demo rows are excluded, and
per-market coverage distinguishes three states — `VERIFIED_PRESENT`, `OBSERVED_ONLY` and
`NO_PRICING_RECORDED`. The third is not "this market has no pricing"; it is "nobody has
looked".

The unresolved-queue KPI reports the **age** of the oldest open candidate as well as the
count, because a backlog nobody could clear is invisible in a count and obvious in an age.

---

## 7. Two drifts caught while writing this chunk

I wrote the tab registry from the workspace's own shape and then checked it against
`navigation.v1.json`, which is the declared source of truth. Two mismatches:

- **`/admin/providers` redirects to `?tab=providers`** and I had declared no such tab. An
  operator following that redirect would have landed on a blank page.
- **`/admin/growth` redirects to `?tab=markets&view=growth`** — growth is a *view* of
  markets, not a tab. I had declared it as a seventh tab.

The registry won in both cases. `intelligence:check` now fails if any intelligence
redirect names a tab or view the workspace does not declare, so this class of drift cannot
recur silently.

---

## 8. A file I overwrote and restored

I wrote the workspace projection to `base44/shared/intelligenceCore.ts`, which already
existed: it holds the P12 primitives (`moatScore`, `benchmarkVisibility`, `pricingAt`,
`canPromoteToVerified`) and is imported by ten other modules. Restored from git
immediately; the projection lives in `intelligenceWorkspaceCore.ts` with a header noting
the distinction, since the two names are one word apart.

Noted in passing: `intelligenceCore.ts` carries a fourth local implementation of the
nullable numeric read (`observedFiniteNumber`). That one is **correct** — it guards
null/undefined/empty before `Number()` — so it is not the `Number(null) === 0` defect.
Consolidating it would touch ten importers and belongs to its own change.

---

## 9. Counters

- Logical routes 36 → **37** (`intelligenceWorkspaceAdmin` on `adminSummaries` behind the
  `intelligence_` prefix). Physical functions stay **276**.
- **No new entity.** The promotion path writes `ProviderPricingVersion`,
  `RateChangeCandidate` and `KnowledgeConflict`, all of which already existed with the
  exact enums this lifecycle needs (`CANDIDATE → CURRENT → SUPERSEDED`,
  `supersedes_observation_id`, `DETECTED → … → PROMOTED`). The schema anticipated this
  path; only the code was missing.
- No seal changed. `productionSealEligible` remains `false`.

---

## 10. Carried forward to C11

- The Intelligence tab shell and the seven tab bodies.
- **`AdminProviders.jsx:36-42` sets `revenue_share_pct` from a browser form via generic
  CRUD.** The navigation registry marks this HIGHEST SEVERITY, and it is worse than a CRUD
  defect: provider compensation set from a browser form is the input the §4.11 firewall
  exists to protect. A governed handler must land before that redirect.
- **`AdminBenchmarks.jsx` claims to control ranges with no write path.** The claim must be
  corrected, not carried into the new workspace.
- The `pricing-queue` tab is where the promotion queue becomes reachable by a human. Until
  C11 the backend exists and only an API caller can use it.
