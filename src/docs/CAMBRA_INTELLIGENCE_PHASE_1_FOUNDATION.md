# CAMBRA Intelligence v2 — Phase 1 shared-contract foundation

Status: **contract implementation only; runtime, datasets and models
unverified**\
Scope: Universal Experience projection, strict learning admission policy, and
the single shared Feature / Label / Dataset / Model / Prediction registry
contracts.

This slice does not train, evaluate, register, serve or promote a model. It does
not create a dataset, frozen holdout, feature store, new event bus, new outcome
ledger or new Base44 physical function. All Intelligence/model/production seals
remain withheld.

## ADR-INT-001 — Extend `Event`; preserve domain truth

Status: accepted for local contract implementation, runtime unverified.

### Context

CAMBRA already has:

- `Event` as a general application event;
- `IntelligenceEvidence` / `IntelligenceObservation` / `KnowledgeClaim` for
  evidence and knowledge;
- `IntelligenceSnapshot` for decision-time context;
- `IntelligenceOutcome` as the learning projection of domain outcomes;
- `AuthoritySnapshot` / `Approval` for deterministic authority;
- `CostUsageEvent` for paid-operation accounting.

Creating a second event bus or another evidence/outcome ledger would violate the
Orchestration Spec.

### Decision

`Event` is extended additively with optional Universal Experience fields. Its
original required fields remain exactly `brand_id`, `event_type`, and `source`,
so historical writers and rows remain compatible. A new producer may claim
`universal-experience.v1` only when it passes the shared validator in
`base44/shared/intelligenceFoundationContracts.ts`.

The projection links, but does not replace, domain truth:

```text
domain record committed
→ Universal Experience semantic envelope
→ existing Event projection
→ evidence / snapshot / authority / cost / outcome references
```

Exactly-once delivery is not claimed. New writers need a business idempotency
key; integration still requires a committed-event/outbox-equivalent boundary and
runtime proof.

### Alternatives rejected

- A new `UniversalExperience` entity: duplicates the existing Event role before
  Base44 cardinality/query/runtime evidence exists.
- `OperationalLog` as experience store: conflates operational diagnostics with
  durable business experience.
- `IntelligenceOutcome` as the full bus: conflates decisions/execution with
  mature outcomes.

### Migration and rollback

No backfill is performed. Legacy Event rows remain valid and are never presumed
learning-eligible. The additive Event fields can be ignored by legacy readers.
Rollback is removal of new writers/projections; historical domain records remain
authoritative.

## ADR-INT-002 — One logical registry family, zero runtime claims

Status: accepted for contract-only control-plane artifacts.

The following machine-readable registries establish the single shared schemas
for all CAMBRA domains:

- `config/intelligence/feature-registry.v1.json`
- `config/intelligence/label-registry.v1.json`
- `config/intelligence/dataset-registry.v1.json`
- `config/intelligence/model-registry.v1.json`
- `config/intelligence/prediction-registry.v1.json`

They intentionally contain `records: []`, `runtime_evidence: []`, blocking
conditions, and `registry_state: CONTRACT_ONLY`. They are the one future
authority for those concepts, but are not a Base44 online feature store or proof
of a Model Factory.

No record may become active solely by editing a feature flag or this document.
Future runtime materialization requires the existing gates, an immutable
source/runtime identity, privacy/deletion design, data sufficiency, and an ADR
if physical storage is needed.

## Universal Experience v1

The machine-readable contract is
`config/intelligence/universal-experience.v1.json`; event types live in
`config/intelligence/experience-event-registry.v1.json`.

The semantic chain remains:

```text
signal → context → decision → reason → authority
→ proposal → approval → execution → outcome
→ economic impact → evidence → learning eligibility
```

Required invariants:

- tenant and canonical subject are explicit;
- external IDs remain source references;
- occurred / observed / recorded / effective / available time remain distinct;
- decision, approval, execution and outcome are distinct;
- predictions and CAMBRA-generated text are never labels by themselves;
- corrections supersede instead of rewriting history;
- demo, synthetic, test and replay state is explicit;
- model/rule/policy/prompt versions are carried when relevant;
- estimated value cannot become billing truth.

### Discovery adapter: partial runtime integration, not runtime proof

Discovery now has one bounded `DiscoveryExecutionRun -> Universal Experience ->
Event` adapter. It reuses the existing Event entity and the existing scheduled
Discovery host; it creates neither a new physical function nor a competing
event store.

The ordering is deliberate:

1. the accepted run or stage transition is committed to
   `DiscoveryExecutionRun`;
2. the adapter derives immutable projection descriptors from durable source
   facts (`actual_stages_json`, accepted-plan identity and terminal snapshots);
3. Event append uses a deterministic business idempotency key and payload hash;
4. same key/same hash is a harmless retry, while same key/different hash is an
   explicit integrity conflict;
5. the existing Discovery scheduler scans the recent window on every tick and
   a deterministic rotating paginated backlog window, then reconstructs missing
   projections after a crash or transient Event failure without a new worker.

Projection delivery never edits a terminal Discovery run and never converts an
Event write failure into a failed Discovery result. Errors are returned and
logged for retry; the authoritative run remains intact. All six Discovery event
contracts are therefore `ADAPTER_PARTIAL`, never `RUNTIME_VERIFIED`: no deployed
Base44 trace, parity proof, service-role isolation proof or cross-domain golden
trace has been supplied. Their learning state remains `QUARANTINED`, with
`training_allowed: false`.

## Strict learning eligibility

`evaluateLearningEligibility` v2 returns the compatibility state plus a
purpose-specific status:

- `INELIGIBLE`: a known policy disqualifier exists;
- `QUARANTINED`: mandatory truth is missing, ambiguous, conflicting or not
  runtime-proven;
- `CLEARED`: this policy's gate is satisfied for the returned scope.

Statuses distinguish `PENDING_PROVENANCE`, `PENDING_EXECUTION`,
`PENDING_OUTCOME`, `PENDING_LABEL_MATURITY`, aggregate/evaluation-only use,
training eligibility and revocation. Descriptive and advisory records remain
separate from model evaluation, training and calibration.

`CLEARED` does not mean a dataset is sealed or a model is approved. It requires,
at minimum:

1. every mandatory and domain gate is `PASSED` with attributable runtime
   evidence;
2. explicit tenant scope and resolved identity;
3. evidence/source refs, verified provenance and sufficient verification tier;
4. explicit purpose, legal basis, retention and training permission;
5. confirmed execution and mature verified/reconciled outcome;
6. versioned, non-self-referential label;
7. point-in-time-safe timestamps;
8. exact Experience, Evidence, Observation, Claim, Outcome and executed-receipt
   references, loaded and tenant/purpose-bound by the service-side append path;
9. cross-tenant aggregation only when explicitly allowed, irreversible, without
   a reidentification map, and with `k >= 10`.

`appendLearningEligibilityDecision` writes a content-addressed immutable receipt
to the existing Event ledger. It re-loads every referenced row, the context
snapshot and the latest runtime gate evidence; caller-supplied provenance,
execution, outcome, eligibility flags and gate claims are not authority. A
second generic eligibility entity is deliberately not introduced.

Claim promotion is independently enforced by
`assessClaimPromotionLineage`: both canonical and admin/manual paths require
exact server-loaded evidence/observation refs, the same tenant/domain/purpose,
valid temporal/semantic links and non-inferred support. Manual state changes
always persist `training_eligible=false`, `model_eligible=false` and
`calibration_eligible=false`.

The current real gate registry has no passed gate and no runtime evidence.
Therefore the current system cannot emit a truthful `CLEARED` learning decision.

## Verification

Run:

```bash
node scripts/check-intelligence-foundation-contracts.mjs
npx vitest run src/lib/intelligenceFoundationContracts.test.js
```

The checker verifies:

- Universal Experience reuses Event;
- legacy Event required fields did not change;
- event contracts are unique/versioned;
- eligibility stays fail-closed;
- shared registry records are empty;
- model/dataset/prediction readiness is not claimed.

## Open blockers

- immutable clean source identity and Base44 parity;
- committed event adapters for each domain;
- service-role tenant isolation runtime tests;
- canonical contact/company/thread identity completion;
- a production caller plus real Event eligibility receipts (source wiring now
  exists, but no runtime decision rows or same-release parity evidence exist);
- an approved feature and label definition;
- point-in-time dataset builder, sealed dataset and frozen holdout;
- reproducible training/evaluation artifact;
- prediction serving, shadow/canary, outcome lineage and rollback;
- real cross-domain golden trace.

Consequently, `INTELLIGENCE_FOUNDATION_INTEGRATED`, `LEARNING_DATA_READY`,
`AI_MODEL_READY`, `CPIC_MODEL_READY`, `ADAPTIVE_LEAD_MODEL_READY` and
`FULL_CAMBRA_INTELLIGENCE_LOOP_VERIFIED` remain blocked.
