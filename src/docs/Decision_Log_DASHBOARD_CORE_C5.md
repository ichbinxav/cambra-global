# Decision Log — DASHBOARD CORE C5 (evidence review, and four founder rules applied)

Date: 2026-08-17
Scope: C5 — governed opportunity decisions and evidence review, plus four standing
rules the founder set mid-chunk that changed code already shipped.

External effects: **zero**.

## 1. The four rules, and what each changed

### Strict per-chunk barrier
Tests, gates, `verify:chunk` green and a clean tree **before** commit and before the
next chunk opens. This was set in response to a real slip: in C3 I committed with
`verify:chunk` red and amended afterwards. The barrier caught two problems in this
chunk alone — a duplicate declaration in the gate, and a stale gate assertion (below).

### No new direct writers of the OutboundLead legacy vocabularies
`pipeline:check` now walks `base44/shared` and `base44/functions`, counts every
`OutboundLead.update*` whose patch touches `stage`, `revenue_stage` or
`reservoir_state`, and **ratchets** at the measured count.

I guessed 24. The gate measured **25** across 11 files. The ratchet is set to the
measured reality, not my estimate, with the per-file breakdown recorded in the script
so a future reader knows exactly what the baseline covers. It may only go down.

### Nullable coercion centralised
`base44/shared/nullableNumber.ts` is now the single implementation.
`pipelineCore` and `auditsCore` import it and the gate fails if either re-implements
it locally (`Number.isFinite(parsed)` in a consumer is now a build failure).

It guards more than the two cases I had: null, undefined, empty string, **whitespace
string**, NaN, Infinity and **boolean** — `Number(true)` is `1`, which would have been
the third variant of this bug. `nullableSum` reports `COMPLETE` / `LOWER_BOUND` /
`UNKNOWN`, so a sum that skips rows cannot be presented as a total.

### Material transitions are fail-closed
This **changed behaviour I shipped in C3**. There, a history write failure returned
`ok: true` with `history_recorded: false` for every transition.

The registry now classifies 21 stages across the seven material kinds — contractual,
economic, verification, billing, mandate, migration, terminal — and every terminal
stage is material by definition (the gate enforces that).

For a material transition, `PipelineStageEvent` persistence is a **success condition**:

- history fails → the authority move is **rolled back** and the call returns
  `material_transition_history_unpersisted`
- the rollback itself fails → `ambiguity_state: REVIEW_REQUIRED` and
  `automatic_retry_blocked: true`, because repeating the move could double a material
  effect

Non-material transitions stay fail-open. Losing a lead's meeting timestamp is not
worth reverting a real change; losing the record of a contract going active is.

Materiality is surfaced **in the preview**, so the founder knows a transition behaves
differently on failure before deciding rather than discovering it from an error.

### Seals unchanged
No seal was altered. `productionSealEligible` remains **false** and all root seals
remain `NOT_SEALED`, because their required evidence does not exist.

## 2. Evidence review

`evidenceReviewCore.ts` adds the write side C4 deliberately withheld. It reuses
`ReviewCase` and `EvidenceAssertion` rather than inventing a decision entity.

- **Decisions are hash-bound.** Preview returns the exact state it saw; apply refuses
  on mismatch. A reviewer cannot approve one opportunity and have another change.
- **`APPROVE_FOR_RECOVER` reuses C4's `recoverEligibility`** rather than a looser local
  copy, so a bad row cannot pass one path and fail the other.
- **A settled opportunity cannot be silently re-decided.**
- **Refusing decisions require a reason.** "We rejected it" with no why teaches nothing.
- **`ReviewCase` severity separates ECONOMIC from QUALITY**, because a figure that could
  affect money must never be triaged like a poor document.
- **A brand_id is never invented.** `MerchantOpportunity` carries
  `merchant_context_reference`, not `brand_id`. When it is absent the decision still
  applies and `review_case_recorded: false` is reported — writing the opportunity key
  into `brand_id` would put a wrong identifier into the review ledger.
- **Evidence that cannot be read is UNKNOWN, not ABSENT**, and a contradiction between
  assertions is surfaced rather than resolved by preferring the newer row.

## 3. Carried forward

- The `/admin/audits` page. The registry still marks it `NOT_BUILT`, correctly.
- Methodology & Benchmarks tab.
- The 25 pre-existing legacy stage writers. The ratchet stops new ones; migrating the
  existing ones onto the registry is its own decision and its own risk.

## 4. Files

```
base44/shared/nullableNumber.ts                        (new)
base44/shared/evidenceReviewCore.ts                    (new)
src/lib/evidenceReviewC5.test.js                       (new, 20 tests)
src/lib/materialTransitionFailClosedC5.test.js         (new, 13 tests)
config/dashboard/pipeline-stage-registry.v1.json       (21 material stages classified)
base44/shared/pipelineStageRegistry.ts                 (materiality API)
base44/shared/pipelineCore.ts                          (fail-closed + shared coercion)
base44/shared/auditsCore.ts                            (shared coercion)
scripts/check-pipeline.mjs                             (3 founder rules enforced)
scripts/check-audits-opportunities.mjs                 (centralisation enforced)
```

`verify:chunk` EXIT 0 — 4120 tests, 297 files. Tree clean.
