# CAMBRA P1–P5 Intelligence Foundation Seal

Seal date: 2026-08-11

Release: CAMBRA v0.85.0 — P1–P5 Intelligence Foundation

Scope: architectural and repository-level intelligence closure only

## Verdict

| Phase | Result | Canonical repository surface |
| --- | --- | --- |
| P1 — Country Intelligence Foundation | PASS | `config/europe-markets.json` → generated frontend/backend registries; `marketContext.ts`, `marketMoney.ts`, jurisdiction policy and evidence-backed market entities |
| P2 — Provider Intelligence | PASS | `CanonicalProvider` → `ProviderLegalEntity` → `ProviderAuthorization` → `ProviderProduct` → explicit market/product availability, currency support and merchant eligibility |
| P3 — Rate Intelligence | PASS | `ProviderPricingVersion` (compatibility name for the canonical pricing-observation ledger) + `RateComponent`, applicability conditions, source snapshots and deterministic resolver/evaluator |
| P4 — Statistical Rate Intelligence | PASS | validated `BenchmarkContribution` → versioned `BenchmarkCohort` derivation with one vote per merchant, outlier policy and k>=10; separate identifier-free retained aggregates; optional external estimator remains fail-closed |
| P5 — Opportunity Engine | PASS | pure `p5OpportunityEngine.js` → canonical `MerchantOpportunity` contract with deterministic economics, evidence/version chain and no execution authority |

## Canonical invariants

1. The P1 market registry contains exactly 33 distinct markets, including FR and separate LI/CH identities. ISO-2, ISO-3 and declared aliases canonicalize deterministically; unknown input remains unknown.
2. Country registry membership does not imply Analyzer, provider, rate, legal or commercial readiness. Original money is preserved; cross-currency normalization requires explicit FX evidence.
3. Provider identity, legal entity, authorization, product availability, currency support and merchant eligibility are separate facts. Authorization in a jurisdiction never implies product availability.
4. P3 factual pricing distinguishes public, provider-quoted, merchant-observed, contractual, negotiated and legacy-estimated observations. Statistical/benchmark inference is forbidden from the factual P3 ledger.
5. Percentage rates use integer ppm and money uses integer minor units. Missing components, FX or applicability dimensions never become zero or a guessed fallback.
6. A P4 cohort is statistical only after validation, per-merchant deduplication, verified-over-estimated precedence, deterministic outlier handling and at least ten distinct merchants. Insufficient cohorts expose no percentiles.
7. Retained cross-tenant intelligence is identifier-free, carries no stable pseudonym or reidentification mapping and requires k>=10. Pseudonymized contribution rows remain private and subject to normal retention/deletion controls.
8. P5 consumes explicit P1–P4 snapshots and versions. It cannot mutate upstream truth, grant P6+ authority, or convert a benchmark directly into an attainable offer.
9. P5 records gross theoretical, actionable and probability-adjusted expected/recoverable savings separately. Unknown transition cost, eligibility, target evidence or probability remains an explicit blocker.
10. Equivalent merchant snapshots, candidates and intelligence versions produce the same semantic opportunity key and economics. Dependency references support replay, freshness and audit.

## Legacy and compatibility boundary

- `Provider.jsonc` and `PaymentsRateTable` remain compatibility surfaces; they are not competing canonical P2/P3 truth. Unsafe generic/estimated legacy rates are classified or quarantined before promotion.
- The presentation helper `paymentsBenchmark.js` remains explicitly modeled public-pricing illustration and is never represented as an empirical merchant cohort.
- `base44/shared/merchantOpportunity.ts` is a historical P6 lead-fit score only. It is explicitly excluded from canonical P5 savings intelligence.
- Existing Analyzer and Recover fields remain backward compatible. This seal does not destructively rename historical production data.

## Migrations and rollout

- `BenchmarkCohort` receives additive derivation, sufficiency, outlier, confidence and lineage fields. `scheduledBenchmarkRecompute` idempotently refreshes existing cohort rows. Until recomputation, `getBenchmarkForReport` independently refuses any historical row with n<10 even if an old `is_public` flag is true.
- `MerchantOpportunity`, `P4EvidenceProjection` and `P4StatisticalEstimate` are additive schemas. The P4 projection/estimate functions are admin/internal-gated and idempotent/fail-closed.
- No destructive database migration or remote Base44 deployment was performed during this repository seal. Schema publication and runtime smoke tests remain activation gates.

## Repository evidence

Pre-seal validation on the completed code and documentation set:

- `npm ci`: pass using the lockfile; 648 packages installed, 0 audit vulnerabilities reported at install time.
- `npx vitest run`: 134 test files passed; 1,976 tests passed; 0 failed; 2 skipped.
- `npx eslint . --quiet`: exit 0.
- `npx tsc -p ./tsconfig.critical.json`: exit 0.
- `node scripts/check-typecheck-baseline.mjs`: exit 0, 0 diagnostics against approved baseline 0.
- `npx vite build`: exit 0.
- Product policy, 33-market registry and ECL generated-artifact checks: pass.
- Validation runtime: Node v20.20.2 and npm 10.8.2, matching repository release conventions.

The final immutable source-tree hashes and timestamps are recorded in `RELEASE.json` and `.release-evidence/` after the final repository verification run.

## Known manual and external activation gates

- A green remote GitHub Actions run for the final release SHA is not proven by this local seal.
- The Base44 entities/functions have not been pushed or smoke-tested against the remote app in this worktree.
- The optional external P4 estimator service, its secrets, real-data calibration and OOD monitoring are not production-activated.
- Stripe live-account connection/sync verification and real merchant economic validation remain pending.
- No claim is made of provider availability/rate coverage beyond evidence actually stored; unresearched facts remain unknown.
- Legal/privacy review, provider contractual activation and any manual requirements retained in `RELEASE.json` remain in force.
- P13 real routing remains prohibited; this seal does not change PCI/PSD2/SCA, SLA, reconciliation, kill-switch or liability gates.
- P6 lead discovery, outreach, negotiation and commercial execution are outside this seal and were not started.

## Change control

Any material change to the market registry, provider graph semantics, pricing classification/evaluation, P4 cohort/privacy policy or P5 economics/decision policy reopens the affected phase. The change must bump its policy/calculation version, add regression evidence, regenerate governed manifests and produce a new repository seal. Runtime activation never retroactively upgrades this architectural seal into legal, economic or production proof.

## Declaration

**CAMBRA P1–P5 INTELLIGENCE FOUNDATION: SEALED**

This declaration means the P1–P5 architecture, deterministic logic, provenance boundaries, privacy threshold and repository tests are internally consistent. It does not mean real-world production activation.
