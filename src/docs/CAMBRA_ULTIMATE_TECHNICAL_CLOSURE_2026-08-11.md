# CAMBRA v0.94.0 — Ultimate technical closure

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
- Cross-merchant outcome calibration only for non-demo, same-currency cohorts with `k >= 10`; the output is advisory and never a public provider rate, promise, target, guarantee or authority grant.
- Removal of hardcoded operator identity from production sending logic. Automatic sends require an explicit, valid, policy-allowed sending profile.
- Growth Path Engine V1: deterministic actual-versus-plan bridges, versioned targets/assumptions, bounded scenarios, evidence-labelled forecasts and recommendation-only authority.
- Founder meeting control: deterministic policy parsing, explicit confirmation, truthful calendar state, structured outcomes and approval separation.

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
