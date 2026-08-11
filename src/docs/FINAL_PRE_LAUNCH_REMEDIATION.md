# CAMBRA v0.91.0 — final pre-launch remediation and activation report

Prepared 2026-08-11. This report separates repository implementation from
production evidence. Its current classification is **NOT_GO_READY**: the source
tree is locally verified, while the final-SHA GitHub, Base44 and real-world
evidence described below has not been produced from this local workspace.

## What is implemented in the source tree

### Commercial activation

- `backfillLegacySendingProfiles` remains dry-run by default, idempotent and
  evidence-only. It does not invent profiles; unresolved eligible threads are
  paused and surfaced as `REVIEW_REQUIRED`.
- Commercial policy drafts can be configured in Admin. Acquisition activation
  requires `CANARY`, an explicit 1–15/day cap, score at least 70, explicit
  profile keys and explicit markets. No country—including France—is implicit.
- Missing or invalid `daily_send_limit` means zero automatic sends.
- The canonical sending boundary still revalidates policy, profile, market,
  P10/P11, authority, suppression, emergency state and cost budget.
- A founder-configured sending profile is always saved paused. Moving it to
  `warming` is a separate confirmed action requiring fresh matching production
  SPF, DKIM, DMARC and provider-credential evidence. It can be paused again
  independently.

### Additional GO-live hard gates

`goLiveHardGates` has one binary release result: `GO_READY_FOR_CANARY` only when
all 15 gates pass; otherwise `NOT_GO_READY`. It does not average blockers into a
score and does not accept local assertions for real-runtime evidence.

1. Remote GitHub CI is green on the immutable final SHA.
2. Base44 runtime matches the final SHA/source tree.
3. SPF, explicit DKIM selectors, DMARC and sender credentials pass.
4. Signed bounce, complaint and unsubscribe/suppression flows are observed.
5. Every GO-critical scheduler is alive at its declared cadence.
6. No duplicate execution exists in a scheduler slot.
7. Positive daily/monthly AI, API, enrichment and email budgets are active.
8. The cost alert and emergency budget kill-switch are exercised by the founder.
9. Founder control (limits, profile warm-up, blockers, approvals and canary
   controls) is exercised in Admin.
10. The global emergency stop is exercised end-to-end.
11. Safe resume is exercised without silently re-enabling outbound.
12. The deployed observe → decide → act → verify loop is alive.
13. A real restore meets declared RPO/RTO.
14. A real anonymized multilingual extractor corpus passes.
15. Dependency/security alert delivery is proven.

SHA-bound actions reject a missing or mismatched `CAMBRA_GIT_SHA`. Evidence has
explicit freshness windows and may expire. Runtime, external and operator
evidence are persisted in `RuntimeGateEvidence`; release evidence remains
separate in `ReleaseVerification` and disaster-recovery exercises.

### Scheduler and observability integrity

The 11 GO-critical schedulers record deterministic cadence-slot claims through
`SchedulerRun`. A second claim for the same worker/slot is blocked and surfaced.
The verifier also reads the three legacy critical scheduler task ledgers. GO
requires all declared cadences to be fresh, no duplicate slot execution and a
live observe/decide/act/verify chain after deployment.

### Cost governance

Every known metered AI, API, enrichment and email path is behind the centralized
cost governor or commercial router. Missing/invalid limits fail closed before a
provider request. Reservations are conservative; failed attempts remain counted
until explicitly reconciled/voided. Crossing a projected limit activates the
cost emergency stop, pauses acquisition and creates a critical Founder incident.
The hourly worker emits warning incidents and enforces hard thresholds, but it
cannot self-certify the alert gate: only the real Founder kill-switch drill can.

### Emergency control

Global safe mode blocks outbound communications, negotiations, new migration
execution and new billing execution, including direct billing/payment-link paths.
It preserves Analyzer/read-only intelligence, health observation, evidence and
billing reconciliation. The drill proves stop and safe resume, and deliberately
leaves outbound and commercial policies paused after restoration.

### Founder control and product experience

- `/admin/founder-control` is the activation command plane for real blockers,
  SHA-bound verification, cost budgets, cost-stop drill, sending profiles,
  emergency drill and canary controls.
- Founder Inbox approvals and rejections now execute through the canonical
  preview/confirm/audit Founder OS command rather than direct row mutation.
- Admin navigation is grouped into Overview, Command, Inbox, Intelligence,
  Commercial, Operations, Company and System without removing underlying routes.
- Global Admin search resolves merchants, providers, markets, deals, contracts,
  invoices, agents, alerts and opportunities to their real drill-down routes.
- The merchant Dashboard surfaces Recover authorization and migration state as
  first-class steps so the customer sees what CAMBRA is doing and any action due.
- The public mobile navigation is keyboard/screen-reader stateful and no longer
  sits beneath an invisible full-width toast hit layer; empty toast viewports are
  click-through while visible toast cards retain their controls.
- Landing steps, waitlist interaction and footer are now consistently localized
  across EN/FR/ES, and the stale React image-priority warning is removed.
- The existing CAMBRA navy/cyan/mint/coral visual language and P1–P13 business
  truth remain unchanged.

## Local verification completed

- Full unit/static suite: 2,095 passed, 2 skipped, 0 failed.
- ESLint: passed.
- Full `allowJs/checkJs` TypeScript surface: 0 errors.
- Production Vite build: passed.
- In-app browser smoke: Landing/Help/Analyzer/Results loaded; Dashboard/Admin
  stayed protected; EN/FR/ES interaction copy passed; mobile 390×844 had no
  horizontal overflow; mobile menu opened and navigated after the toast-layer
  fix; animated canonical example values reached their declared totals.
- Frozen extractor change was updated only through `scripts/update-freeze.mjs`;
  the append-only reason is in `config/freeze-change-log.json`.
- Durability, documentation and release manifests are regenerated during the
  final `npm run verify` and sealed into the archive.

These results are local repository evidence only. They are not remote CI or
Base44 runtime evidence.

## Production activation runbook

Keep acquisition and all active commercial policies paused while completing:

1. Deploy the immutable final tree to Base44 and set `CAMBRA_GIT_SHA` to that
   exact commit.
2. Configure extraction flags/model and secrets in Base44; never put secrets in
   source or in this report.
3. Seed P10 and P11, verify 33 markets, conservative defaults, preserved manual
   decisions and the real P10 → P11 chain.
4. Configure a valid cost budget and sending profiles in Founder Control.
5. Run the legacy profile backfill dry-run; inspect planned, unresolved, skipped,
   invalid and coverage-truncated results. Apply only with explicit confirmation.
6. Resolve every eligible unresolved thread or leave it explicitly paused as
   `REVIEW_REQUIRED`.
7. Run real runtime verification. Correct DNS/credentials, scheduler cadence,
   duplicate runs, suppression events and observability blockers.
8. Enable verified profile warm-up. Create and activate only evidence-backed
   CANARY policies with 10–15 total acquisition sends/day.
9. Run the cost kill-switch, global emergency-stop/safe-resume and Founder
   approve/reject/control exercises from Admin.
10. Complete remote GitHub CI, dependency alert delivery, real restore, real
    anonymized document corpus and pilot/shadow evidence.
11. Run the fresh commercial preflight and use its exact hash for the explicit
    canary start. Observe deliverability, quality, cost, legal and operational
    health before any new policy raises a limit.

## Evidence still required before GO

| Area | Current truth | Required production evidence |
|---|---|---|
| Final GitHub | Local tree only | Remote Actions run on final immutable SHA |
| Base44 parity | Not accessible from this workspace | Deployed entities/functions/schedules/secrets and matching SHA |
| Legacy backfill | Code ready | Dry-run counts, reviewed apply and unresolved-thread ledger |
| CommercialPolicy | Admin/config code ready | Active 10–15/day policy for exact P10/P11-ready market/action cells |
| Sending profiles | Config/warm-up controls ready | Real profiles, SPF/DKIM/DMARC, provider credentials and webhook secret |
| Extraction | Dual-model fail-closed code ready | Production flags/secrets plus anonymized multilingual golden corpus |
| P10/P11 | Conservative engines/seeds ready | Real deployed seed chain and qualified market × action evidence |
| Localization | EN/FR/ES implemented; other markets fallback/partial | Native review before any `NATIVE_PRODUCT` claim |
| Pilot | Journey code ready | Genuine merchant sandbox/shadow and later production evidence |
| Backup/restore | RPO 24h/RTO 8h targets | Real restore with backup identity and integrity checks |
| Deliverability/suppression | Handlers and verifier ready | Signed bounce, complaint and opt-out events in real runtime |
| Schedulers/loop | Claims and verifier ready | Fresh deployed cadence, uniqueness and observe/decide/act/verify proof |
| Cost controls | Governor and drill ready | Founder-approved limits and successful real-runtime drill |
| Founder control | Command plane ready | Founder exercises all required controls in deployed Admin |

## Market × action boundary

Repository membership in Europe-33 is not permission. `ANALYZE` can remain
available where product/data rules permit; external actions such as
`REQUEST_INFO`, `REQUEST_QUOTE`, `NEGOTIATE`, `ACCEPT_CONTRACT`,
`COORDINATE_MIGRATION`, `AUTHORIZE_MIGRATION` and `BILL` require their exact,
current P10/P11 outcome. `UNKNOWN`, `LEGAL_REVIEW_REQUIRED`, registration or
authorization gaps never become `ALLOW` through a UI or commercial policy.

## Remaining post-launch technical debt

- Finish semantic consolidation of historical AI clients/prompts into one model
  router after corpus/telemetry validation. Cost governance is centralized now;
  client behavior is not fully homogenized.
- Vite chunks above 500 kB are a performance improvement, not a canary safety
  bypass.
- Broader native localization, due-diligence expansion and non-payments product
  scope remain separate work.

## Classification

**NOT_GO_READY**

The archive is implementation-complete for this remediation, but no canary may
start until the founder can control and stop the deployed machine from Admin and
all real/external evidence gates above pass on the final release.
