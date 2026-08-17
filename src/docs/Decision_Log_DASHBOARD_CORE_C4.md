# Decision Log — DASHBOARD CORE C4 (Audits & Opportunities backend)

Date: 2026-08-17
Scope: C4 — the audit/opportunity projection, the Recover-handoff preview, the logical
route, and `audits-opportunities:check`.

External effects: **zero**.

## 1. No new entity, and C0's verdict held

`MerchantOpportunity` already carries the **complete §9.15 truth model** — current cost,
target cost, gross theoretical, actionable, expected recoverable, annualized, realization
probability, confidence and evidence completeness, all as separate fields. C0 said no new
authority was needed; reading the schema confirmed it exactly.

The gate now pins all nine fields, so a future migration cannot collapse two of them
without failing the build. If those figures merge, this workspace's honesty merges with
them.

## 2. What this workspace refuses to compute

There is **no verified-savings figure and no billable-savings figure** anywhere in
`auditsCore`. Verified savings belong to Recover, billable savings to Finance. Both a test
and the gate assert their absence — the test checks no returned key matches
`/verified|billable/`, and the gate greps the source.

## 3. An estimate can never be labelled verified

`AnalyzerResult` declares an **empty `required` list**: every field is optional, so
`verification_status` can say anything. `ANONYMOUS_ESTIMATE` and `MANUAL_REVIEW` are
therefore capped at `MODELED` regardless of what the row claims, and a row that says
verified while being an unverifiable type raises
`claims_verified_but_type_cannot_be_verified` — because something upstream mislabelled it
and that is worth surfacing, not swallowing.

Type derivation is conservative by construction: a row that does not prove it was connected
is an `ANONYMOUS_ESTIMATE`, the weakest claim and the one that cannot mislead.

## 4. Absent provenance is recorded

`measurement_window` and `sample_metrics` are properties of `PaymentsAnalysisVerified` but
**not required**, so window provenance is reported as `PRESENT` / `ABSENT` rather than
assumed. Unknown completeness reports `completeness_unknown`, not 100%.

## 5. A Recover handoff defaults to refusal

Five conditions, all required. The one worth stating: an opportunity with **no evidence
completeness recorded is not eligible**, because absence of a completeness reading is not
evidence of completeness. An empty row is refused rather than defaulting through.

The only action C4 exposes is a **preview** that creates nothing and says so. Approving an
opportunity is a review decision and belongs with the evidence-review surface in C5.

## 6. The same bug, twice — and it mattered here

My numeric helper was:

```ts
const parsed = Number(value);
return Number.isFinite(parsed) ? parsed : null;
```

`Number(null)` is `0` and `Number.isFinite(0)` is `true`, so an **absent** figure came back
as a confident **zero**. Four tests caught it.

The consequence in this workspace was serious: an opportunity with no expected recoverable
savings reported **€0 recoverable AND passed the Recover eligibility check** — exactly the
class of defect this workspace exists to prevent.

This is the second time `Number(null)` has bitten this repo. The first was
`founderOSData` in Command C3, where it turned a failed read into a €0 labelled
"verified". I wrote a memory note about it and then reproduced it in a new file.
`pipelineCore` had the same helper and was fixed in the same pass, and the gate now checks
the null guard exists in **both** cores so it cannot come back a third time.

## 7. Topology

`auditsWorkspaceAdmin` is a logical route on `adminSummaries`.
`BASE44_LOGICAL_ROUTE_TARGET` 33 → 34, all three counter sites updated. **Physical stays
276.**

## 8. Carried forward to C5

- The `/admin/audits` page itself. The route registry still marks it `NOT_BUILT`, correctly.
- Evidence review actions (accept, reject, request information, mark conflict, supersede)
  and the ReviewCase wiring.
- Methodology & Benchmarks tab, which needs the benchmark cohort authority read.
- Opportunity qualify/reject/defer/approve, which are the governed writes.

## 9. Files

```
base44/shared/auditsCore.ts                (new)
base44/shared/auditsAdminCore.ts           (new)
scripts/check-audits-opportunities.mjs     (new)
src/lib/auditsCoreC4.test.js               (new, 32 tests)
base44/shared/pipelineCore.ts              (null guard fixed)
+ route, topology, 3 counter sites, package.json
```
