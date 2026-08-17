# Decision Log — CAMBRA Command C3 (read honesty + citation layer)

Date: 2026-08-17
Scope: C3 of `PROMPT_CAMBRA_COMMAND_V1_1.md`, rescoped. Also closes the coverage
debt C0 declared: the knowledge/evidence plane is now inventoried (§1 below).

## 0. The defect C3 found, and fixed first

`base44/shared/founderOSData.ts` opened with:

```ts
const safe=async<T>(fn:()=>Promise<T>,fallback:any=[]):Promise<any>=>{try{return await fn()}catch{return fallback}};
```

All 25 canonical reads went through it, including `Invoice.list('-issued_at',5000)`.
`merchantCollected` is `sum(invoices,'amount_paid')`, so a failed read summed `[]` to
`0`. That `0` was then stamped `confidence:'verified'` — a hardcoded literal, one of
eleven in a twelve-metric block. `AdminCommand.jsx` rendered it raw.

**If the Invoice read threw, the founder's home page showed €0 labelled `verified`.**

`founderOSData` feeds four functions (`getFounderOSCommandCenter`, `founderChiefOfStaff`,
`founderOSQuery`, `founderOSSimulation`), so the AI narrative was built on those zeros too.

The renderer had the mirror defect: `Number(null)` is `0` and `Number.isFinite(0)` is
`true`, so an honest `value: null` would still have printed `€0`. Fixing the producer
alone would have achieved nothing.

Both halves are fixed, and `src/lib/founderOSReadHonestyC3.test.js` asserts the exact
failure: a throwing Invoice read now yields `value: null, confidence: 'unknown',
unavailable_sources: ['Invoice']`, and a genuine empty store still yields a confident `0`.

`searchCompany`, `merchant360` and `provider360` had the same swallowing helper and now
report `data_complete` / `degraded_sources` — search in particular can now distinguish
"no results" from "could not look".

## 1. Knowledge/evidence plane inventory (closes the C0 debt)

Verified by a three-lens adversarial refutation pass; four of six claims survived, one was
corrected, and the ninth vocabulary below was found by the scoping pass, not the inventory.

**Already exists — do not rebuild:**

| Thing | Where | State |
|---|---|---|
| Assertion primitive | `base44/entities/EvidenceAssertion.jsonc` (subject/predicate/object, `SUPPORTS\|CONTRADICTS\|SUPERSEDES`) | written only by `seedP3RateIntelligence`; no live reader |
| Citation record | `ResearchKnowledgeCitation`, `base44/shared/researchKnowledge.ts:132` | real: `document_sha256`, `locator`, `source_urls`, corpus SHA256 validated |
| Citation ref format | `entity:id`, `CommandArtifact.source_refs` | adopted by C3 |
| Honest read primitive | `base44/shared/runtimeSourceRead.ts` | healthy; adoption was NOT universal — that was the defect above |
| Immutable evidence ledger | `IntelligenceEvidence` / `IntelligenceObservation` / `KnowledgeClaim` / `KnowledgeConflict` | live, written via `intelligenceAccess` |
| `evidence_refs` satellite | 31 entities, 13 with the full `evidence_refs + confidence + last_verified_at` triple | extend, never replace |

**Competing epistemic vocabularies: nine.** `RECEIPT_STATES` (C1), the CPIC axis family,
`truth_class`, `GROWTH_PROVENANCE`, `ResolutionStatus`, `TraceContextState`,
`count_semantics`, `CONFIDENCE_LEVELS`, and the one that actually reached the founder's
screen — the hardcoded literals in `founderOSData.ts`.

A correction worth recording: the inventory claimed the field `confidence` carries four
incompatible types, citing four sites. Checking found two of those citations wrong — the
0–100 integer is carried by `data_confidence`, not `confidence`, and the lowercase
categorical set belongs to `confidenceLevel`. The phenomenon is real; the framing was
inflated. It is recorded here as three, not four.

## 2. Converge the vocabularies, or build on top? — Neither, globally

Convergence was rejected: `cpicFoundation.ts` alone is 1633 lines with 15 axes and five
live consumers, in domains C3 has no test authority over. Remapping a CPIC state changes
what a downstream gate permits, with no test that fails. Adapters-everywhere was also
rejected: the adapter set becomes the tenth vocabulary.

`adaptCpicEstimateV0ToV1` was treated as a **warning with one piece worth stealing**. Steal:
it emits its own lossiness as data on the output. Do not repeat: it is open-ended, so V0
survives inside V1 and the repo now carries both.

**The rule C3 adopts.** Projection into the closed 7-value `RECEIPT_STATES` set is:
one-way, total (unrecognised input yields `UNKNOWN`, never passthrough), demote-only, and
defined **only** for vocabularies that actually reach the founder's screen. That is two
today. The other seven are deliberately not written.

`epistemicStateForRead` / `epistemicStateForReads` in `runtimeSourceRead.ts` are that
bridge, and the fold takes the weakest input — a claim can never be stronger than its
weakest source.

## 3. The citation hole in the Chief of Staff

`founderChiefOfStaff` asked the model for `evidence_refs[]` on every item of
`changed_since_last_view` and `founder_actions`. Nothing validated them, nothing resolved
them, and the page rendering that brief contained zero occurrences of `evidence_refs` —
while labelling the panel *"Evidence-bounded narrative."* The binding between claim and
evidence was model-authored free text that nobody checked and nobody saw.

`base44/shared/commandCitationGuard.ts` closes it:

- the citable set is built from the **same snapshot handed to the model**, so a ref is
  valid only if it names something the model was actually shown. This is stronger than a
  row lookup: it also catches a real id the model could not have reasoned from.
- the prompt now lists `CITABLE_REFS` and instructs that a fabricated reference is worse
  than no reference.
- every claim is judged: all refs resolve → `DERIVED`; any ref does not → `CONFLICTED`;
  nothing cited → `UNVERIFIED`.
- **a model claim can never be `OBSERVED`.** Observation is what the canonical read did,
  not what the narrative did.
- badly-cited claims are **annotated, not deleted**. Silently dropping one would hide that
  the model invented a reference — which is exactly the signal worth keeping.
- `citation_audit.all_claims_backed` is the single field a caller gates on.

## 4. The ledger now resolves referents, not strings

`buildNextReceipt` only checked that `domain_receipt_refs` was non-empty when an external
effect was claimed — that a *string* existed, never that the row did. A receipt citing
`CostUsageEvent:does-not-exist` passed chain verification, and the chain verifying cleanly
made it look proven.

`resolveSourceRefs()` resolves each ref, and deliberately distinguishes `referent_not_found`
from `referent_unreadable`: saying "this citation is fake" when the store was merely down
would be its own false claim. `stateForCitations()` demotes but never promotes — perfect
citations do not upgrade an `INFERRED` claim.

## 5. What C3 deliberately did not do

- **No convergence of the seven vocabularies that do not reach the founder.** Out of scope
  and high risk; see §2.
- **No writer for `CommandReceipt`.** The ledger is still inert. This is honest sequencing,
  not a punt: until C4 builds the multi-step tool loop there is nothing to receipt. C3
  supplies the two primitives that writer will need (`resolveSourceRefs`,
  `stateForCitations`).
- **No change to `cpicFoundation.ts`, `discoveryV2Admin.ts`, the merchant money engine or
  any go-live gate.**

## Carried forward

- `CommandRun`, `CommandArtifact` and `ModelRouteDecision` remain schema-only.
  `ModelRouteDecision` is correct to be empty — its router lands in C5.
- `founderMerchantsV2.ts` still runs a private parallel `readSource()` with a fourth
  spelling of the read states. It was left alone: it is the merchant money surface, and
  C3's mandate is the Command surface.
