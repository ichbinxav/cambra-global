# CAMBRA P12 — Intelligence & Proprietary Moat Layer

Status: implemented foundation; production/runtime evidence is reported separately from code implementation.

## Canonical knowledge contract

P12 separates immutable `IntelligenceEvidence` from `IntelligenceObservation`, versioned `KnowledgeClaim`, privacy-safe benchmark projections, immutable `IntelligenceSnapshot`, `IntelligenceOutcome`, and derived `MoatMetric` / `KnowledgeGap`. Agents are producers and consumers, never canonical truth.

Truth levels are `verified_official`, `observed`, and `inferred`. Knowledge lifecycle is candidate → observed → corroborated → verified → active → stale → superseded → archived, with quarantine available at any unsafe point. Inferred facts cannot be promoted to verified by a simple admin override.

Bitemporal records preserve `effective_at` (external-world truth time) separately from `observed_at` / `recorded_at` (CAMBRA learning time). Pricing history is append/version oriented; a newer version does not rewrite historical Analyzer, negotiation, migration or Recover decision context.

## Provider and market intelligence

`PaymentsRateTable` remains the current production payments pricing source.

**Corrected DASHBOARD-C10 (2026-08-17).** This paragraph previously said "`intelligenceMaintenanceWorker` versions it into `ProviderPricingVersion`". That stopped being true at the P3 cutover: the worker was made projection-only and now writes only `FxSnapshot`, `PaymentsRateTable` and `Event`, and `p12Intelligence.test.js` locks that behaviour. The claim is repointed rather than deleted, because the governance question it answers — who may create a pricing version — still needs an answer.

The creator is now the C10 promotion path: `rateIntelligenceWatchWorker` detects a source change and records a `RateChangeCandidate`; `intelligencePromotionCore` adjudicates it and, only on an explicit operator promotion, creates a new `ProviderPricingVersion` that supersedes the previous one. `seedP3RateIntelligence` remains a seed, not an operational creator.

Semantic pricing hashes are intended to cover economic dimensions and not presentation or source copy, so copy-only changes do not become pricing changes. **Two C10 corrections to how that was implemented.** First, `rateIntelligenceWatchWorker` stores the normalized *content* hash in the candidate's `semantic_fingerprint` field, and a content hash changes on any wording edit, so it cannot answer whether the economics changed. Second, `semanticFingerprint` in `src/lib/p3RateIntelligence.js` includes `source_snapshot_id` in the hashed payload, so two observations with identical economics from different snapshots produce different fingerprints — the opposite of the stated property. The rule is enforced by `economicFingerprint` in `base44/shared/intelligencePromotionCore.ts`, which excludes the snapshot id and every presentation field; a candidate whose economic fingerprint matches the current version is rejected as `copy_only_change`. A change to prior verified pricing supersedes the historical version and creates an explicit conflict/impact review point rather than silently mutating the old fact.

Existing `providerMonitorAgent` / `providerResearchAgent` are reused. External web/PDF/news text is explicitly untrusted and can only enter P12 as inferred candidate evidence. It cannot directly update `PaymentsRateTable`, approve a contract, modify Recover economics, bypass L4, or become verified pricing truth. Provider monitoring is scheduled daily for the most-used providers; deeper adaptive refresh tiers can be extended from exposure/volatility once source coverage is sufficient.

## Central access and capability boundaries

`intelligenceAccess` is the canonical service boundary. Internal callers must present an allowed capability (`provider_intelligence`, `analyzer`, `negotiation`, `migration`, `verification`, `moat_curator`, `knowledge_integrity`) and can access only the actions assigned to that capability. Admin callers remain authenticated/authorized by the normal admin gate.

Analyzer and negotiation benchmark reads return aggregates only and suppress cohorts with fewer than 10 distinct merchants. Comparable outcome reads use the same `k >= 10` distinct-merchant floor and never return merchant identifiers or raw foreign-tenant records. Tenant-specific raw evidence remains admin/service internal; cross-tenant learning is through approved aggregates.

## Decision snapshots

`intelligence_snapshot_id` is additive on AnalyzerResult, NegotiationCase, MigrationTask and MonthlySavingsReport. Current production paths create immutable snapshots for anonymous Analyzer materialization, provider negotiation start, payments migration start and monthly Recover measurement. The snapshot contains the applicable versions, inputs and provenance needed to reconstruct the decision without letting future intelligence rewrite history.

## Outcomes and financial truth

`outcomeLearningWorker` links fully verified `MonthlySavingsReport` rows to `IntelligenceOutcome`. It copies deterministic realized savings; it does not approve a report, calculate billing eligibility, create invoices, alter the baseline or invent financial truth. An explicit measured zero is retained as negative knowledge; a missing amount remains unknown and is excluded from financial outcome aggregates.

Comparable-outcome and lead-outcome outputs are bounded **descriptive aggregate heuristics** for advisory context. They consume only append-only `AnonymizedIntelligenceAggregate` snapshots whose source scan is explicitly `COMPLETE`, with one latest declared observation per distinct merchant and k ≥ 10. Financial cohorts include native currency in their identity; mixed or unknown currencies are suppressed and are never renamed EUR or silently converted. The legacy function/field names containing `Calibration` remain only for API compatibility. These outputs are not statistical or probabilistic calibration, probabilities, provider rates, promises, targets or authority grants.

## Integrity, conflicts and admin override

`knowledgeIntegrityWorker` quarantines impossible future dates, invalid confidence and impossible pricing rather than silently correcting raw evidence. `KnowledgeConflict` makes contradictions explicit. `intelligenceAdmin` requires an admin and a reason, records before/after state in OperationalLog, and cannot promote inferred claims to verified without evidence.

## Moat and gaps

`moatCuratorWorker` uses a transparent bounded formula over sample depth, coverage/diversity, freshness, source quality, verified outcomes, contradiction rate and a concentration penalty. It never reads raw tenant `IntelligenceOutcome` rows: financial-outcome depth comes exclusively from complete, native-currency, privacy-safe k ≥ 10 snapshots. An incomplete/capped aggregate read blocks publication and creates review evidence. `KnowledgeGap` ranks strategic value × uncertainty × expected reuse. The worker never contacts merchants/providers merely to farm data.

The initial formula is deliberately simple and versioned (`moat-p12-1.0.0`). It is an internal decision aid, not a valuation metric. Future tuning must be sample-backed and bounded.

## Supervisor and observability

P11 `autonomousOperationsSupervisor` is extended to surface stale verified provider pricing and unresolved knowledge conflicts that affect active operations. Safe repair stays separate from economic/material authority. Scheduled P12 maintenance includes provider monitoring, provider-pricing normalization, knowledge integrity, outcome learning and moat curation.

## Legacy benchmark coexistence

The old benchmark loop (`BenchmarkContribution` → `BenchmarkCohort` / `BenchmarkSnapshot`) remains live and privacy-thresholded. `scoreEngine.js` remains explicitly frozen until a dedicated benchmark migration. P12 does not duplicate or silently replace that engine; it provides a governed intelligence layer around it and uses its aggregate projection through the central access boundary.

## Legal / privacy boundary

P12 separates three layers deliberately:

1. **Tenant operational data** — identifiable merchant records needed to operate CAMBRA. Normal retention/deletion, tenant isolation and purpose limitation apply.
2. **Pseudonymized benchmark contributions** — `BenchmarkContribution.source_anon_id = SHA-256(secret salt + brand_id)`. These are explicitly **not anonymous under GDPR while the salt/mapping capability exists**, remain admin/service internal, and are never treated as indefinitely retainable anonymous data.
3. **Privacy-safe retained intelligence** — `privacySafeIntelligenceWorker` produces append-only, versioned `AnonymizedIntelligenceAggregate` snapshots only when at least 10 distinct merchants contribute. It paginates to a terminal page against a fixed snapshot and publishes nothing when coverage is incomplete. Outcome history collapses to one latest declared observation per merchant before metric-specific denominators are evaluated. Financial output retains one explicit native currency per cohort, records that no FX conversion occurred, and suppresses mixed/unknown currency. Output is coarsened/rounded, contains no merchant ID, stable pseudonym, email, document/thread/source ID or reidentification mapping, and is checked by a forbidden-identifier policy before write. This layer is the only cross-tenant derived intelligence CAMBRA is designed to retain after merchant-level deletion where legally permitted.

The privacy policy reflects this distinction: merely pseudonymized data does not become anonymous by naming it so. Aggregates that do not pass the minimum-diversity/privacy gate are suppressed rather than retained as anonymous intelligence.

## Deliberately deferred

No graph database is introduced. The existing relational/event model is sufficient for the current query patterns. No new production vertical is enabled: Product Policy remains authoritative and payments remains the production wedge. No autonomous internet-wide crawling is added. No low-confidence source can overwrite verified knowledge. No learning component can change authority, billing, legal gates or L4 requirements.
