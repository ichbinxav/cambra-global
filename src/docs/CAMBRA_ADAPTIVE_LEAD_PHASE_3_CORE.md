# CAMBRA Adaptive Lead Intelligence — bounded Phase 3 core

Status: **code-complete for the bounded V0 contract; runtime unverified**.

This slice implements the minimum deterministic company-only core required by
ALI §§10, 12, 13 and 17–19. It does not claim that the full Adaptive Lead
master specification, its runtime migration, 3k/10k load gate, provider
execution, trained models, calibration, causal learning or production seal are
complete.

## Reuse and physical topology

- `OutboundLead` remains the candidate master. No entity was added.
- `score_breakdown_json.adaptive_lead_v0` stores the point-in-time V0 decision
  snapshot written by the existing `leadScoringAgent` path.
- `contactLast.ts` consumes that snapshot when present and blocks person lookup
  for `DROP`, `RESEARCH_MORE`, `NEEDS_REVIEW` or any state other than
  `OUTREACH_WORTHY`. Legacy rows keep the earlier fail-closed company gate until
  rescored/backfilled.
- `cpicFoundation.ts` remains the Expected Value / Value of Information
  calculation authority. The Adaptive module supplies explicit heuristic
  scenarios and preserves CPIC's no-authority boundary.
- Existing cost, suppression, commercial policy and contact resolution systems
  remain authoritative. This slice reserves or spends nothing.
- Added physical Base44 functions: **0**.
- Added physical Base44 entities: **0**.

## Implemented V0 contracts

`base44/shared/adaptiveLeadCore.ts` provides:

1. Typed Intelligence, Contact and Commercial state taxonomies with explicit
   legal predecessor maps, terminal behavior, evidence-backed reopening and
   rejection of illegal transitions.
2. A strict contact predecessor: contact transitions require
   `OUTREACH_WORTHY`; suppression always wins.
3. Company-only projection and gap assessment. Contact/person/email/title data
   is absent from the assessment and contact gaps are not instantiated.
4. Separate Fit, Opportunity, Conversion, Evidence Confidence and Support
   records. Missing values stay `null`/`UNKNOWN`; they do not become zero.
5. Deterministic banded VoI V0 with explicit uncalibrated assumptions, source
   and cost inputs, conservative research decisions, stopping rules and no
   execution authority.
6. Deterministic dispositions for `DROP`, `RESEARCH_MORE`,
   `DECLARE_OUTREACH_WORTHY`, `NEEDS_REVIEW` and `SOURCE_LIMITED`, with a
   complete decision snapshot and legal transition plan.
7. Durable DROP projection through the existing score update: robust or
   explicit DROP writes the snapshot, marks the legacy stage/reservoir
   disqualified (or suppressed), stops later contact and never creates a
   negative training label.
8. A lawful company-only delayed false-negative audit plan with stable
   assignment/propensity, no contact, no personal data, no spend authority and
   no causal claim.
9. Expected-value queue eligibility and explainable priority. Eligibility is
   computed before capacity; capacity is only a post-eligibility cap and never
   weakens quality thresholds. Unknown conversion/EV components are excluded
   explicitly, not treated as zero.

Every envelope says:

- `probabilistic_calibration: false`;
- `trained_model: false`;
- `causal_claim: false`;
- `authority_granted: false` or its stricter equivalent;
- pre-analysis expected savings are `UNKNOWN` and never billing eligible.

## Executable acceptance evidence

`src/lib/adaptiveLeadPhase3Core.test.js` covers:

- legal and illegal state transitions;
- prohibited contact before `OUTREACH_WORTHY`;
- suppression precedence;
- evidence-required reopening;
- unknown-not-zero score semantics;
- person-invariant company gap assessment;
- positive and cost-blocked VoI decisions;
- `RESEARCH_MORE` from a material gap;
- durable DROP and no-contact behavior;
- false-negative audit without contact/label/causal claims;
- scoring-path integration;
- expected-value priority with unknown conversion preserved;
- capacity as a cap after eligibility.

The focal suite also re-runs CPIC, Contact Last and Adaptive Lead P0 truth tests.

## Open gates retained

- Runtime persistence/event/outbox proof and one-writer state migration.
- Backfill/reconciliation of legacy candidates and impossible state
  combinations.
- Candidate-level provider request/receipt/cost reconciliation and realized
  information value.
- Runtime suppression/authority/tenant proof.
- 3k/10k load, retry, crash-window, cancellation and fairness evidence.
- Admin explanation surface and runtime observability.
- Registered models, point-in-time datasets, calibration and controlled causal
  evaluation. None is claimed by V0.
- Base44 deployment and source/runtime parity. No deployment was performed in
  this slice.

Therefore the honest capability state remains **PARTIAL / IMPLEMENTED IN SOURCE
ONLY / RUNTIME_UNVERIFIED**.
