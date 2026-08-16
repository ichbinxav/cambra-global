# CAMBRA CPIC Phase 2 Foundation

Status: **implemented locally, not runtime-verified, no CPIC seal issued**  
Contracts: legacy `cpic-foundation.v0` + additive `cpic-estimate.v1`  
Scope: bounded Phase 2 foundation; no model training, deployment or feature expansion.

## Reuse decision

| Capability | Repository authority | Decision | Current truth |
|---|---|---|---|
| Evidence, claims and outcomes | Existing Intelligence v2 entities and Universal Experience adapter | REUSE | Partial/runtime-unverified |
| Cohort benchmark baseline | `p4BenchmarkIntelligence.ts` | EXTEND | Deterministic robust descriptive statistics |
| External P4 transport | `p4Bridge.ts` + `requestP4Estimate` | EXTEND | Fail-closed external transport; runtime service unverified |
| Model/dataset/prediction registries | `config/intelligence/*-registry.v1.json` | REUSE | Contract-only, empty records, no approved model |
| Authority, privacy and costs | Existing shared controls | REUSE | No authority is granted by CPIC |
| CPIC semantic/calculation layer | `cpicFoundation.ts` | NEW SHARED MODULE | Pure code only; no entity or physical function added |

No new evidence store, outcome ledger, model registry, dataset registry,
authority service, cost ledger, entity, worker or physical backend function was
created.

## Implemented contract surface

`base44/shared/cpicFoundation.ts` now provides:

- the legacy mixed V0 truth vocabulary for compatibility, plus the V1
  orthogonal value/verification/evidence/temporal/support/realization/dispute/
  causal status contract required by the canonical specification;
- a distribution-first estimate envelope preserving quantiles, intervals,
  variance, threshold probabilities, raw `n` and effective `n`;
- decision-time provenance and effective/observed/available/prediction/training
  times;
- explicit aleatoric, epistemic, model, data and total-uncertainty slots;
- a deterministic V0 support *screen*:
  `IN_DISTRIBUTION`, `EDGE_OF_SUPPORT`, `LOW_SUPPORT`,
  `OUT_OF_DISTRIBUTION`, `UNKNOWN_SUPPORT`; its result is retained as
  `heuristic_status`, while canonical support remains `UNKNOWN_SUPPORT` until a
  registered detector is resolved;
- honest calibration/model status: caller booleans and references are lineage
  only and cannot establish registry approval, calibration or authority;
- deterministic truth precedence so inference cannot overwrite observed or
  verified facts and unknown cannot become zero;
- Expected Value V0 over explicit joint scenarios;
- Value of Information V0 including source success, API/LLM, latency,
  privacy/compliance and other acquisition costs;
- fail-closed abstention and permanent `authority_granted: false` /
  `billing_eligible: false` boundaries;
- a conservative external-P4 adapter and loss-aware V0→V1 adapter that store
  model/calibration names as lineage but refuse to treat them as local
  registry/evaluation proof.

## P4 integration

The existing robust cohort derivation now also emits `p90`, min/max, population
variance, effective sample size, support status and explicit methodology/
calibration truth. `adaptP4BenchmarkCohortToCpicV0` maps an eligible cohort into
the canonical envelope without exposing merchant pseudonyms.

The existing `requestP4Estimate` function persists both compatible V0 and V1
CPIC envelopes inside the existing `P4StatisticalEstimate.estimate_json`. This
reuses the same physical entry point and entity. It now:

- resolves Brand, Integration and one CURRENT evidence projection server-side;
- rejects arbitrary caller context and cross-brand projection binding;
- requires exact deployment/model/target/perimeter/population/horizon/unit and
  availability/expiry gates;
- looks up the semantic idempotency cache before credentials, cost reservation
  or provider execution, and records a fresh non-billable cache-access receipt;
- recursively allowlists provider output and validates deployment, currency and
  temporal continuity before persistence;
- preserves provider OOD/support only as source-reported lineage and forces
  canonical `UNKNOWN_SUPPORT`/`ABSTAIN` without a registered detector.

External P4 output remains internal statistical evidence and is forced to
`ABSTAIN` for serving/material automation until independently registered
artifact, deployment, support and calibration evidence exist.

## Formula boundaries

Expected Value V0 uses only explicitly supplied joint-scenario probabilities:

`EV(action) = Σ P(joint scenario) × utility(scenario) − direct action cost`

It rejects probabilities that do not sum to one and does not multiply marginal
probabilities into a fabricated joint probability.

Value of Information V0 uses:

`net EVI = E[best utility after research] − current best utility − acquisition cost`

The failure branch retains the current best utility. The source-success
probability, expected uncertainty reduction and all cost terms are explicit
caller assumptions. The action-change probability is derived from the supplied
joint research outcomes and source-success branch; it is not calibrated.
Output is `SIMULATED_ADVISORY`; it neither triggers research nor authorizes
spend.

## Evidence from executable tests

`src/lib/cpicFoundation.test.js` covers:

- unknown versus zero and deterministic-truth precedence;
- quantile order, time leakage and provenance rejection;
- separate uncertainty slots and unsupported decomposition rejection;
- all heuristic support/OOD screen states plus canonical UNKNOWN behavior;
- rejection of caller-supplied model/calibration authority references;
- V1 orthogonal status decomposition and cross-tenant binding failure;
- server-built P4 context, recursive response filtering, exact deployment gates
  and cache-before-provider ordering;
- unsupported external calibration/model claims;
- expected-value scenario validation;
- positive, negative and policy-blocked VOI;
- P4 cohort adaptation, privacy-safe output and insufficient/mixed cohort
  abstention;
- reuse of the existing P4 physical function/entity.

## Deliberately withheld claims and remaining gates

The following remain blocked and are not implied by this implementation:

- no Bayesian or hierarchical model exists;
- no approved feature, label or sealed dataset exists;
- no CAMBRA-trained model, artifact, holdout or model card exists;
- no calibration report, Brier/ECE/coverage evidence or segment evaluation
  exists;
- no runtime serving, shadow, canary, drift, retraining or rollback evidence
  exists;
- no Analyzer uncertainty propagation or probabilistic-savings integration is
  completed by this slice;
- no runtime parity or production evidence was collected.

Therefore `PROBABILISTIC_FOUNDATION_VERIFIED`, `CPIC_INTEGRATED`,
`CPIC_MODEL_READY` and `CPIC_PRODUCTION_READY` remain **BLOCKED**. Local tests
prove source-level contract/calculation behavior only. No CPIC acceptance-test
manifest or production seal is emitted by this bounded slice; all unexecuted
runtime/model/data acceptance tests remain `NOT_RUN`, never PASS.
