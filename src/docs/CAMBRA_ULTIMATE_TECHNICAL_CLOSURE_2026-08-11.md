# CAMBRA v0.95.0 — Ultimate technical closure

Status vocabulary is deliberately narrow: `PASS`, `PASS WITH EXTERNAL VALIDATION PENDING`, or `NOT READY`. The source release verdict is computed in `RELEASE.json`; the commercial GO verdict is independently computed from real-runtime evidence and may remain `NOT_GO_READY` when the source release is technically sound.

## Historical v0.92 integrity incident

The v0.92 archive was re-extracted and assessed with its own declared hashing algorithm. Its internal `RELEASE.json` claimed 1,438 source files and source hash `270a686b…`; the re-extracted payload produced 1,437 source files and hash `74a9e6c…`. The historical exact missing filename cannot be established from the surviving evidence.

`historical_missing_file_root_cause = UNKNOWN`

The systemic cause is established: the archive file selector and the source-hash selector were not mechanically identical. v0.94 removes that class of failure by using one canonical collector for hashing and packaging, normalizing archive metadata, re-extracting every package, comparing the exact source path set, recomputing the source hash and count, and emitting an external package SHA-256/integrity record. A mismatch is a hard failure.

## Internal closure delivered

- Exact release toolchain: Node 20.20.2 and npm 10.8.2, enforced locally and in CI.
- Source-bound evidence for lint, critical/full typecheck, tests, build, dependency audit and environment.
- Secret scan over the canonical source set with high-confidence credential detectors and explicit fake-example handling.
- Dependency audit with zero-vulnerability requirement.
- Product analytics with explicit local consent, closed event taxonomy, scalar allowlist and PII/URL rejection.
- UI interaction tests for automatic/manual language selection and Recover acceptance integrity.
- Shared fail-closed rate limiting for exposed submit/teaser/API surfaces.
- CAS-backed paid-operation reservations and idempotent cost event claims.
- Explicit data-retention matrix; non-automated, legal-review and platform-unknown categories remain visible.
- Runtime incident alert delivery ledger with deduplication, retry and configuration-required states.
- Scheduler inventory for every repository-declared automation. Exactly-once semantics are not claimed; Base44 triggers are treated as at-least-once and only workers with an explicit slot guard are labelled guarded.
- Cross-merchant descriptive outcome heuristics only for non-demo, same-currency cohorts with `k >= 10` distinct merchants; the output is advisory, not statistically/probabilistically calibrated, and never a public provider rate, promise, target, guarantee or authority grant.
- Removal of hardcoded operator identity from production sending logic. Automatic sends require an explicit, valid, policy-allowed sending profile.
- Growth Path Engine V1: deterministic actual-versus-plan bridges, versioned targets/assumptions, bounded scenarios, evidence-labelled forecasts and recommendation-only authority.
- Founder meeting control: deterministic policy parsing, explicit confirmation, truthful calendar state, structured outcomes and approval separation.

## Landing 0–365 public-experience closure

The public experience now positions CAMBRA as European Infrastructure Intelligence with payments as the first operational wedge. The implementation keeps the existing brand system and replaces unsupported public outcomes with source, confidence and authority language.

- `App` now provides one canonical market context to every public route.
- Market and language remain separate choices. Browser detection is a suggestion; an explicit visitor choice wins and is persisted locally.
- The public registry exposes all 33 canonical European markets and their display currencies. Product UI remains EN/FR/ES only; unsupported market languages are labelled as English fallback rather than presented as native translations.
- The payments Analyzer is public-action enabled only for France and Spain under the current source policy. Other markets remain informational and route to a market-access review. Missing policy, legal state or market resolution fails closed.
- CTA routing, desktop/mobile navigation and Analyzer submission use the same capability decision, preventing a limited-market visitor from bypassing the landing gate through a different entry point.
- Public payment claims distinguish market context, provider evidence, rate observations and opportunity ranges. Missing evidence produces a limitation; it does not produce a benchmark, saving or customer result.
- Cookie controls keep analytics and marketing off by default, provide equally available accept/reject/manage choices, record a versioned decision and allow reopening or withdrawal from the Cookies page.
- A deterministic 33-market release matrix and machine-readable readiness report are generated from canonical market, locale and capability sources. The release check fails if those artifacts drift.
- Localized URLs and server-rendered locale documents do not yet exist. Consequently, no `hreflang` set is emitted: publishing 33 language alternates that resolve to one mutable SPA URL would be misleading.
- Legal copy is implemented but no market is marked legally approved by this source change. Qualified market-specific validation remains `LEGAL_REVIEW_REQUIRED` before regulated, contractual or outbound activity.

Canonical evidence for this closure is generated in `src/docs/CAMBRA_LANDING_RELEASE_MATRIX.md` and `src/docs/CAMBRA_LANDING_READINESS.json`.

## Runtime truth boundary

Source verification cannot prove external state. The real-runtime GO evaluator therefore requires fresh final-SHA evidence for deployment parity, email deliverability, suppression lifecycle, scheduler activity and duplicate execution, cost controls, founder control, emergency stop/safe resume, observability, restore, document golden corpus and dependency monitoring.

The command plane keeps outbound paused unless every required gate passes. Analyzer and safe read-only intelligence remain separately available during emergency containment. Missing or stale runtime evidence is a blocker, never an inferred pass.

The Base44 application is above the current new-function creation allowance. New command handlers are therefore routed through already-deployed canonical functions (`getEuropeMarketsCommandCenter`, `founderOSCommand`, `outboundControlAdmin`, and `adminSummaries`) rather than relying on additional standalone endpoints. This preserves the feature while avoiding a false deployment claim.

## Required external completion before GO

- Immutable final Git SHA and green remote GitHub Actions evidence.
- Base44 production parity with that SHA.
- Valid production sending identity with SPF, DKIM and DMARC evidence; provider credentials; bounce, complaint, unsubscribe and suppression proof.
- Founder-approved active CANARY policy with explicit 1–15/day limit, action-ready markets and valid sending-profile allowlist.
- Fresh scheduler cadence/duplicate evidence from the real runtime.
- Founder control drill: inspect blockers, change limits, pause, resume, approve and reject.
- Global emergency-stop and safe-resume drill while Analyzer/read-only intelligence remains available.
- Real restore/RPO/RTO exercise.
- Redacted multilingual real-document golden corpus with field-level extractor metrics and review/false-accept evidence.
- Qualified legal/privacy/tax/regulatory approvals for each activated market and activity.
- Stripe live-account connect/sync proof and genuine merchant pilots before claiming economic autonomy.

Until those gates are evidenced, CAMBRA may be technically verified and deployed while remaining operationally `NOT_GO_READY`. That distinction is intentional.
