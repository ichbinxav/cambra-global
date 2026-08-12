# OPERATIONS_STATUS

> Living document of platform/domain configuration required for CAMBRA to operate
> correctly in production. Each section lists what is done, what is pending, and
> who must act.

---

## Release v0.96.0 — Commercial Operating System (2026-08-12)

**Repository implementation complete; authenticated runtime validation is the next gate.** The founder now has one Commercial OS for target profiles, portable discovery, canonical leads, CSV export, CAMBRA-owned campaigns, domains/mailboxes, conversations and safe agent operations. `AUTO` keeps Apollo until 2026-09-07 and then hands discovery to Instantly SuperSearch only after a real scoped capability check. Campaign creation, message/sequence preparation and capacity preview perform zero sends. Real outbound remains controlled by the existing founder preflight and master switch.

The observed Base44 runtime still needs `INSTANTLY_API_KEY` and `INSTANTLY_WEBHOOK_SECRET`, SuperSearch/transport authentication, sender/domain/warm-up evidence and a post-deployment runtime drill. See `CAMBRA_V096_COMMERCIAL_OPERATING_SYSTEM.md` for the exact architecture and activation order.

## Release v0.95.0 — Integrated Europe V1 Release (2026-08-11)

**Repository implementation complete; real Instantly validation and any pilot remain blocked.** P7 now persists an evidence-backed `CommercialStrategy` only for canonical P6 leads that are truly READY_FOR_CONTACT. P8 consumes that artifact through a replaceable outbound-provider contract. Instantly API v2 is transport only: CAMBRA retains scoring, policy, message content, thread memory, reply classification, next-best-action, approval and suppression authority. Provider-native reply AI is a hard conflict, not a second brain.

Inbound events use an authenticated webhook, deterministic event ledger, bounded retry/DLQ and a 15-minute official-API reconciliation worker. Initial queueing and replies share the central sender, idempotency, policy, cost, kill-switch and race rechecks. Founder Admin exposes zero-send E2E dry-run, provider status, DRAFT campaign/webhook setup, fresh preflight, explicit canary activation and local+remote emergency pause. Instantly capacity is zero unless all real gates pass.

`INSTANTLY_API_KEY` and `INSTANTLY_WEBHOOK_SECRET` are not configured in the observed Base44 runtime, so the honest runtime state is `NOT_CONFIGURED`. No campaign was created, no webhook was registered and no unsolicited message was sent. See `CAMBRA_V095_AUTONOMOUS_COMMERCIAL_EXECUTION.md` for architecture, tests, activation order and external blockers.

## Release v0.92.0 — Ultimate A–Z Audit & Human Communication Seal (2026-08-11)

**Local source feature-freeze ready; external blockers remain and canary stays off.**
Commercial email now converges on one fail-closed sender, approved internal
overrides are live/unexpired and bound to the same thread, Founder meetings use
governed Outlook availability and a versioned policy, post-meeting continuation
requires a structured outcome, public proof contains no invented testimonials,
and unverified/anonymous waitlist estimates are excluded from economic totals.
The navbar uses one automatic/manual language selector for EN/FR/ES. Critical
external-effect schedulers claim and report cadence slots while runtime duplicate
proof remains mandatory.

Local lint, critical/full types, all policy checks, 2,113 passing tests (2
intentional skips), clean-room `npm ci`, dependency audit and production build
are green. The authoritative status and A–Z scorecard are in
`CAMBRA_AZ_FINAL_AUDIT_2026-08-11.md`. GitHub final-SHA CI, Base44 deployment,
real sender/worker/Admin/stop-resume evidence, restore, legal/tax decisions,
extractor corpus and pilot cohorts remain unsatisfied external gates.

## Release v0.91.0 — Final Pre-Launch Remediation & Founder Control Seal (2026-08-11)

**Local implementation verified; classification remains `NOT_GO_READY`.** The
release adds a 15-gate real-evidence GO decision, fail-closed AI/API/enrichment/
email budgets, scheduler cadence/duplicate proof, real deliverability and
suppression verification, explicit sender-profile warm-up, Founder control
exercises and end-to-end emergency/cost stops. Admin becomes the activation
command plane and preserves safe Analyzer/read-only intelligence during
containment. Exact local results and the external activation runbook are in
`FINAL_PRE_LAUNCH_REMEDIATION.md`.

Remote GitHub CI, Base44 parity, production backfill/seeds, real DNS/webhook/
scheduler evidence, real restore and the anonymized multilingual extractor
corpus remain required. No local result can satisfy those gates.

## Release v0.86.0 — P6–P8 Autonomous Company Foundation (2026-08-11)

**Repository implementation complete; deployment/runtime proof pending.** The
release adds observed-only commercial-intelligence snapshots, company-level
coordination with reversible FounderDecision proposals, and
`document-extraction-2.0.0`. The extractor performs signature/hash validation,
independent Claude/OpenAI reads and deterministic cross-checks; Vault documents
in supported financial/legal categories link to the resulting StatementImport.
Only an accepted EUR payments statement may project into the active Analyzer,
and that projection is still parse evidence—not ECL verification, verified
savings or billing authority. The sanctioned frozen-file migration is recorded
in `config/freeze-change-log.json`; the ECL stage and L4 authority are unchanged.
See `docs/P6_P8_AUTONOMOUS_COMPANY_SEAL.md` for the exact static/runtime boundary.

## Release v0.70.0 — Payments V1 Final Technical Seal (2026-08-09)

**Current stage remains `ECL_P8_PRODUCTION_ADMIN_AUTOMATION_AI_OPERATIONS`.** v0.70.0 is a closure/hardening release, not a new ECL/economic stage. It closes the file-upload SSRF trust boundary, hardens direct-write RLS on contractual/economic derived entities, fixes the Stripe disconnect → active-Recover verification path, removes illustrative testimonials from public product surfaces, makes Admin source-read degradation visible, versions/gates the Recover billing digest, and adds fail-closed release requirements for Recover V2 legal approval and Stripe live validation. Full detail: `PAYMENTS_V1_FINAL_TECHNICAL_SEAL.md`.

Runtime evidence at seal preparation is intentionally distinguished from static configuration: Webhook DLQ and ECL lifecycle schedules have recent completed `AgentTask` proof; no runtime task has yet been observed for Production Health or Recover Billing Reconciliation despite valid explicit schedule configs. Those two remain a deployment/runtime verification condition and are not described as proven.

## Release v0.67.0 — ECL P8 Production Admin, Automation & AI Operations (2026-08-09)

**Current stage: `ECL_P8_PRODUCTION_ADMIN_AUTOMATION_AI_OPERATIONS` — 77 exact paths, 8 frozen entries.** P8 is the founder/admin operating closure, not a new economic authority. `/admin` is now the production cockpit: health, attention queues, P7 incidents, critical automation freshness and AI workforce runtime are visible from one surface. `/admin/agents` exposes the registered AI workforce behind an admin-only, fixed function allowlist; manual runs are logged and cannot invoke arbitrary backend functions or bypass existing Approval/ECL/billing/legal gates. `/admin/automations` exposes runtime proof for the four critical P4/P6/P7 workers.

P8 also versions four previously scheduler-ready safe jobs: Recover contract delivery retry (15 min), anonymous payments-session retention purge (24 h), inactive-lead retention purge (30 d), and benchmark cohort recompute (7 d). Human economic approval and issuance remain deliberately unscheduled: `generateMonthlySavingsReport`, `approveRecoverReportForInvoicing` and `createEligibleRecoverInvoices` do not gain automation configs. The existing four critical automations remain versioned: webhook DLQ 5 min, production health 10 min, ECL lifecycle 15 min and Stripe-read-only billing reconciliation 15 min.

Repository-wide TypeScript remains at zero and P8 closure tests lock the protected routes, closed AI invocation allowlist, read-only cockpit economics and the absence of automated human billing approval.

**Seal distinction:** local/Base44 release verification is separate from the external GitHub Actions CI seal.

## Release v0.66.0 — ECL P7 Production Operations & Incident Recovery (2026-08-09)

**Current stage: `ECL_P7_PRODUCTION_OPERATIONS_INCIDENT_RECOVERY` — 67 exact paths, 8 frozen entries.** P7 is operational containment, not a new economic authority. P5 remains the authority for whether a contractual/economic effect may happen; P6 remains the authority for replay-safe Stripe execution/reconciliation. P7 observes those paths and gives an admin a bounded way to recover failed workers or delivery attempts.

`eclProductionHealth` runs every 10 minutes from versioned Base44 automation. Its critical reads are authoritative/fail-closed: worker liveness, overdue provisional evidence, Stripe reconciliation mismatch/error, exhausted/overdue webhook dead letters and stuck resolving ReviewCases are never converted to empty-state success on read failure. Signals materialize into `OperationalIncident` using deterministic dedupe and bucketed idempotency keys. When a signal clears an authoritative sweep resolves the incident; if a human closes an incident while the signal still exists, the next sweep reopens the same episode rather than manufacturing green.

The three operational workers now have runtime proof through `AgentTask`: `ecl_lifecycle_scheduler`, `recover_billing_reconciler` and `webhook_dead_letter_processor`. P7 does not weaken P6: `reconcileRecoverBilling` remains Stripe-GET-only and only gains telemetry. The webhook DLQ worker is now versioned to run every 5 minutes, claims before delivery, preserves the stable DLQ/delivery id and keeps the bounded automatic retry budget. Replaying an exhausted delivery is a separate path requiring an authenticated admin, exact `deadLetterId` and explicit `REPLAY_EXHAUSTED` confirmation.

`eclIncidentWorkflow` is admin-only. It exposes runtime/list/get/acknowledge/recover/resolve, race-claims recovery with conditional `updateMany`, maps recovery through a closed allowlist (`eclLifecycleScheduler`, `reconcileRecoverBilling`, `processWebhookDeadLetters`) and never accepts a caller-supplied function name. `inspect_manual` incidents cannot invoke code. `/admin/ecl-operations` consumes only this workflow plus the health sweep; it has no direct Invoice/SavingsEvidence mutation path.

All P7 backend boundaries are included in `tsconfig.critical.json`, while the repository-wide `allowJs/checkJs` gate remains at zero errors. Closure tests lock stage reversibility, the nine-path P7 widening, liveness/idempotency contracts, fail-closed health reads, non-auto-recovery, admin-only replay, scheduler cadences, P6 Stripe read-only preservation and the protected admin operator surface.

**Seal distinction:** repository/Base44 verification can prove the source/runtime configuration represented here. A separate GitHub Actions run is still required before calling the release externally CI-sealed.

## Release v0.65.1 — Launch Security & Type Safety Hardening (2026-08-09)

**Current ECL stage remains `ECL_P6_ECONOMIC_EXECUTION_RECONCILIATION` — 58 exact paths, 8 frozen entries.** This is a launch-hardening patch, not P7: it changes no ECL policy, economic authorization rule, invoice calculation or Stripe reconciliation semantics. The partial P7 work was checkpointed separately and removed from the live tree before this release was sealed.

The production dependency graph was re-audited against the actual lockfile. Before remediation, the live lock exposed 13 advisories (1 critical, 6 high, 6 moderate), including the six previously triaged around PostCSS, React Router, nanoid, Socket.IO parser and DOMPurify plus transitive Vite/esbuild/js-yaml/brace-expansion findings. v0.65.1 upgrades `react-router-dom` to 7.18.2, PostCSS to 8.5.26 and Vitest to 4.1.10, and pins the vulnerable transitive branches through narrow package overrides (`socket.io-parser` 4.2.7, DOMPurify 3.4.13, js-yaml 4.3.1, brace-expansion 1.1.18). `npm audit` now reports **0 vulnerabilities at every severity**. The Browserslist database was also refreshed.

The historical full-repo TypeScript debt is closed rather than re-baselined. `npx tsc -p jsconfig.json` moved from the approved 516-error baseline to **0 errors**, with `allowJs`/`checkJs` still active and without blanket `@ts-nocheck` or file exclusions. The largest source was incorrect inference in shared React/Radix wrappers; the remaining work corrected real context, state, browser-environment and payments-domain shapes. The critical ECL/economic typecheck remains independently at 0 errors. The sanctioned baseline is reset through `candidate → approve` to an approved count of 0, so any future TypeScript diagnostic is a release regression.

Compatibility after the dependency/type closure is verified by the full suite and production build, not assumed from package-manager output. The release remains subject to the same external distinction as P5/P6: local/Base44 `release:check` is not a GitHub Actions CI seal. A real GitHub Actions run is still required before claiming external CI sealing.

## Release v0.65.0 — ECL P6 Economic Execution & Reconciliation (2026-08-09)

**Current stage: `ECL_P6_ECONOMIC_EXECUTION_RECONCILIATION` — 58 exact paths, 8 frozen entries.** P1-P5 remain the authority for evidence, lifecycle, review and whether an economic effect is allowed. P6 starts only after P5 authorization and makes execution/reconciliation replay-safe and convergent.

Recover invoice issuance now claims a deterministic local execution identity (`recover-invoice:<monthly_savings_report_id>`) before the first Stripe POST. Sequential retries reuse the same local invoice; concurrent duplicate drafts are deterministically collapsed on re-read, while multiple committed invoices are a hard conflict and are never auto-deleted. Stripe remains the external exactly-once authority through the existing per-report idempotency keys.

`stripeBillingWebhook` still verifies the Stripe HMAC before side effects, but P6 no longer trusts webhook delivery order. After resolving the local invoice it performs a fresh Stripe GET and validates the exact remote invoice id, customer, currency, frozen total in integer cents and the local/report/activation metadata binding. A mismatch is quarantined as `reconciliation_status=mismatch`, logged append-only in `PaymentEvent`, and never rewrites the frozen invoice economics. A late event therefore cannot regress a paid/refunded/disputed invoice to a weaker state.

`reconcileRecoverBilling` is a new **Stripe-read-only** reconciler, versioned with a Base44 automation every 15 minutes. It heals transient duplicate drafts, fetches current Stripe invoice state, corrects local lifecycle drift, synchronizes the linked MonthlySavingsReport/DealActivation and writes deduplicated reconciliation ledger events. It contains no Stripe POST path: it cannot create, finalize, pay, refund, void or credit an invoice.

P6 removes secondary payment truths for Recover. `recordPayment` and `reconcileInvoice` return 409 for Stripe-managed Recover invoices, and `createPaymentLink` refuses to create a separate Checkout Session when a Recover/Stripe invoice already exists. Finalized invoice amounts cannot be manually adjusted; corrections require the legal void/credit-note/corrective-invoice path.

The `Invoice` schema widens additively with `execution_key`, `reconciliation_status`, `last_reconciled_at` and `reconciliation_error`; `PaymentEvent` adds `reconciliation_corrected` and `reconciliation_mismatch`. These fields record execution truth only and do not change P5 authorization semantics.

**Seal distinction:** repository/Base44 verification and a safe read-only runtime reconciliation can be proven here. The separate GitHub Actions CI seal remains external until the GitHub App installation is visible to this ChatGPT session.

## Release v0.64.0 — ECL P5 Economic Enforcement (2026-08-09)

**Current stage: `ECL_P5_ECONOMIC_ENFORCEMENT` — 48 exact ECL paths, 8 frozen entries.** P1/P2/P3/P4/Production Proof remain the semantic and operational authority. P5 does not invent a second confidence model: it makes the existing canonical ECL gates mandatory at the Recover boundaries where verified evidence can become a contractual or monetary effect.

The operational chain is now end-to-end. `getRecoverAcceptanceContext` refuses the Recover UI when no fresh verified payments source is available. `startRecoverAcceptance` materializes the freshest server-resolved Stripe measurement into `SavingsEvidence` and routes classification through the canonical `eclProcessEvidence` engine, then requires `freeze_baseline` before any Mandate row is created. The exact `evidence_id`, checksum, `confidence_result_hash`, current rate and measurement period are frozen into the acceptance snapshot shown to the merchant.

Acceptance has a separate explicit ECL evidence declaration. `acceptRecoverMandate` refreshes the server source, verifies that the ECL evidence binding is still byte-identical to the one shown, creates an idempotent `EvidenceAttestation` bound to that evidence id/checksum, then evaluates `freeze_baseline` and `recover_proposal` immediately before the first contractual write. A changed Stripe measurement, review case, rejection, expiry, strike threshold, missing attestation, hash mismatch or persistence failure blocks rather than falls back to legacy confidence fields.

Monthly measurement remains non-monetary and may be persisted for review, but a fully verified report attempts to refresh canonical ECL evidence. `approveRecoverReportForInvoicing` requires `approve_report`; `createEligibleRecoverInvoices` requires `create_invoice` after the existing pure Recover billing validation and rechecks the same evidence binding immediately before the first new Invoice/Stripe write. Stripe metadata and `billing_snapshot_json` freeze the ECL evidence id, confidence snapshot hash and ECL policy version for audit.

P5 widens **no economic entity schema**. `Invoice`, `MonthlySavingsReport`, `Baseline`, `Mandate` and `BillingRule` keep their existing shapes; ECL provenance is stored inside already-existing JSON/metadata surfaces. The public processing path of `eclProcessEvidence` remains admin-only; P5 adds one trusted `internal_secret` backend path so Recover can reuse that same engine instead of copying domain logic. Merchant attestation remains owner-session-only.

The production database was checked before sealing: there were **0 `SavingsEvidence` rows and 0 pending/eligible MonthlySavingsReport rows**, so P5 does not interrupt an invoice already in flight. Existing activations/mandates without a fresh verified payments source will fail closed until Stripe evidence is available; this is intentional economic enforcement, not a fallback condition.

**Seal distinction remains unchanged:** local/Base44 verification can prove repository reproducibility, but `release:check:ci` may only be called green after a real GitHub Actions execution provides its CI run id and same-run evidence.

## Release v0.63.3 — ECL P4 Production Scheduler (2026-08-08)

**Current stage remains `ECL_P4_PRODUCTION_PROOF`, now with 39 exact ECL paths.** The native Base44 scheduler configuration is versioned in `base44/functions/eclLifecycleScheduler/function.jsonc`: one active recurring automation, `ECL Lifecycle Sweep`, every 15 minutes with `function_args.limit = 25`. The schedule is deployed atomically with the function, so a later function deploy cannot silently erase or overwrite an out-of-band dashboard cron. P4 historical scope remains unchanged at 36 paths.

The production scheduler still has the same boundaries as v0.63.2: reminder delivery is `intent_only`; runtime proof is written best-effort to `AgentTask`; due discovery/retry/escalation remain fail-closed; and there are no billing, invoice, Stripe settlement, collection, payout or success-fee side effects. A manual one-shot run remains available in Admin Evidence Review for operator diagnostics.

## Release v0.63.2 — ECL P4 Production Proof (2026-08-08)

**Current stage: `ECL_P4_PRODUCTION_PROOF` — 38 exact ECL paths, 8 frozen entries.** P1/P2/P3/P4 remain authoritative. This release adds no new economic semantics: it exposes the already-closed P4 review workflow to an admin operator and adds runtime proof for lifecycle-scheduler invocation. The stage is directly reversible to `ECL_P4_OPERATIONAL_WORKFLOW`; no earlier-stage shortcut exists.

The admin app now exposes `/admin/evidence-review` inside the existing `AdminRoute` shell. The page never reads or mutates `ReviewCase` or `AgentTask` directly: runtime/list/get/resolve all go through the admin-only `eclReviewWorkflow`. Human resolutions bind to the server-returned evidence checksum when available. Approve/dismiss re-enter the canonical P3 engine, reject follows the lifecycle transition graph, and request-more-evidence parks the case on the merchant. The UI has no direct `verified` override and no Invoice/Stripe/payment path.

P4 persistence is fail-closed at the material boundaries: due discovery and retry history cannot turn read outages into empty state, permanent failures are unscheduled only after a ReviewCase is durably ensured, failure telemetry cannot claim `recorded=true` after a failed write, review-list outages do not look like an empty queue, canonical P3 sibling/attestation/strike/review/Baseline reads do not default to empty, and supersession materialization is not best-effort. Shared `createOnce` treats idempotency reads as authoritative and heals later duplicate claims on replay.

`referenceFeeRateBps` can alter E-07 and therefore the decision, so the canonical persisted snapshot now carries versioned `evaluationContext`. Review reprocessing restores that exact material context. Legacy snapshots without the versioned context fail closed with `reprocess_context_unavailable` rather than silently omitting a reference that could make the result more favorable. The three ECL I/O boundaries use Base44 SDK 0.8.41 and remain in critical typecheck.

`eclLifecycleScheduler` records each invocation as a best-effort `AgentTask` named `ecl_lifecycle_scheduler` with its deterministic P4 summary. Observability is deliberately non-blocking: an AgentTask write outage cannot suppress lifecycle work. The Evidence Review page can invoke one bounded admin run and display the latest runtime proof. Reminder delivery remains `intent_only`.

**External proofs remain distinct.** The available exported repo and Base44 CLI do not expose creation of a recurring platform automation, so recurring cron configuration is an external Base44 setting even though the function is scheduler-ready. Likewise a GitHub CI seal requires a real GitHub Actions run; local/Base44 validation is never labeled CI.

## Release v0.62.4 — ECL P1/P2 Closure (2026-08-06)

**ECL P1: CLOSED (schemas only). ECL P2: CLOSED (domain contracts only).
ECL P3: NOT STARTED.** Current stage: `ECL_P2_DOMAIN_CONTRACTS` — reversible
to P1 by design (`PRE_ECL ⇄ ECL_P1_SCHEMA_ONLY ⇄ ECL_P2_DOMAIN_CONTRACTS`;
`PRE_ECL → P2` is invalid). What exists: the six P1 schemas (storage shapes,
no writers), the canonical ECL policy (`config/ecl-policy.json`,
`policyVersion ecl-2026.08`) with byte-identical generated frontend/backend
artifacts, and the pure P2 domain modules (normalized evidence, confidence
contract, deterministic gate evaluation, stable serialization). What does NOT
exist (all P3): rule engines (P-01…P-08), reconciliation R-01, FEC parser,
lifecycle handlers, scheduler/cron, reminders, functional strikes,
`ReviewQueue`, ECL UI, billing integration. The allowlist is 21 exact paths,
code-owned; only StatementImport and SavingsEvidence may carry ECL fields.
The 8 frozen files remain hash-identical (`Baseline.jsonc` and
`processUploadedFile/entry.ts` at zero diff). `npm run ecl:check` guards
artifact drift and runs in `verify` and in the CI template. CI execution
remains ⏳ MANUAL REQUIRED (workflow runs on GitHub Actions, outside this
environment; the installed `ci.yml` must be updated from the template to gain
the `ecl:check` step).

## Release v62.2 — Pre-ECL Gate Hardening (2026-08-06) [HISTORICAL — superseded by v0.62.4 above]

**ECL P1 / ECL P2 status in this section is HISTORICAL** (they were NOT
STARTED at v62.2; both are now closed — see the v0.62.4 section). At v62.2 no
ECL entity, config, cron, attestation, strike, lifecycle or rules-engine code
existed in the repo, and the pre-ECL freeze was machine-enforced.

### Pre-ECL freeze (zero-diff mandate)

`config/pre-ecl-freeze.json` freezes the 3 schemas (`StatementImport`,
`SavingsEvidence`, `Baseline`) **and** `processUploadedFile/entry.ts`
(functional freeze) by full SHA-256. `npm run clean:check` verifies hashes,
missing/moved files, ECL fields in schemas, ECL imports in the frozen handler,
and ECL-named artifacts repo-wide. Changing a frozen hash requires
`scripts/update-freeze.mjs` (explicit reason + confirmation token) and is
logged in `config/freeze-change-log.json` — no generic `--force` exists.

### Release identity (sourceTreeHash)

`RELEASE.json` identifies the source by a deterministic **sha256-tree-v1**
hash (`scripts/lib/sourceTreeHash.mjs`): sorted relative paths + per-file
SHA-256, RELEASE.json itself excluded (no circularity).
`sourceArchiveShaExternal` is null by default, filled OUTSIDE the archive, and
never used as internal evidence.

### Evidence-based gate

Every gate command writes `.release-evidence/*.json` stamped with the current
sourceTreeHash (`scripts/run-with-evidence.mjs`): environment, lint, typecheck
critical/baseline, tests (via vitest JSON reporter), build (dist hash +
artifact count). `release:check` FAILS on missing/stale/failed/null evidence —
hand-written numbers cannot pass. `release:check:ci` (strict) additionally
requires releaseBuild, gitSha, a CI run id and evidence produced in that run.
A local pass is labeled **LOCAL VALIDATION — not release CI**.

### Typecheck gates

- **typecheck:critical** (0 errors mandatory): covers the full economic path —
  acceptance/report/approval/invoice handlers, PDF/email + template registry,
  merchant getters, trust gates, webhook boundary, and their shared modules.
  Pinned `npm:@base44/sdk@…` / `npm:jspdf@…` specifiers are typed against the
  REAL installed package types (no blanket `npm:*` any-shim). The JSX frontend
  (Reports/Invoices/AdminRoute) is exercised by vitest + baseline gate — tsc
  JSX+checkJs coverage remains open debt, stated here, not hidden.
- **typecheck:baseline** — three states: SENTINEL (fails with instructions),
  CANDIDATE (`typecheck:baseline:candidate`, full per-error detail incl.
  critical-set/modified-this-release flags), APPROVED
  (`typecheck:baseline:approve -- --review-token=<sourceTreeHash>
  --confirm=APPROVE`; refuses critical-set or modified-file errors, archives
  the previous baseline; no generic --force). The gate fails on any new
  fingerprint, worsened count, or error in critical/modified files.
  ⏳ MANUAL REQUIRED (once): approval needs a real tsc run.

### CI (TEMPLATE_READY / WORKFLOW_INSTALLED / WORKFLOW_EXECUTED)

State today: **TEMPLATE_READY**. `.github/workflows/` is unwritable by the
Base44 GitHub sync (external platform blocker, re-verified 2026-08-06).
`npm run ci:install` copies `ci/github-workflow-ci.yml` byte-identically to
`.github/workflows/ci.yml` (refuses to overwrite a different file without
--confirm); `npm run ci:check` reports the state and only passes when
installed. WORKFLOW_EXECUTED is proven exclusively by CI evidence consumed by
`release:check:ci` — a template is never declared CI PASS.

### Secret sanitization (v62.2 CP6 — completed)

`internalSecret.ts`: normalized-key allowlist (lowercase, strip `_`/`-`/space)
covering snake/camel/SCREAMING/kebab variants of internal_secret,
authorization, api_key, access/refresh tokens, client/stripe/webhook secrets,
password/passwd — exact normalized match, so passwordPolicy / tokenCount /
authorizationStatus / apiKeyLabel / secretDescription are never over-redacted.
`sanitizeString` scrubs explicit patterns (Bearer tokens, `key=value`
credentials, sensitive URL query params) including inside `Error.message` and
`Error.cause`. Depth>8 → `[REDACTED_MAX_DEPTH]`, cycles → `[circular]`.
`dispatchWebhook` builds OUTBOUND payloads by per-event ALLOWLIST
(`base44/shared/webhookPublicPayload.ts`) — undocumented fields are omitted,
the same public payload is sent, persisted and retried.

### Execution status (this environment cannot run npm)

npm ci / eslint / tsc / vitest / vite cannot execute inside the Base44 build
sandbox. Every gate is scripted and deterministic; the final sequence
(npm ci → clean:check → policy:check → typecheck:critical → baseline
candidate/review/approve → lint:evidence → *:evidence → release:manifest →
release:check → ci:install/push → release:check:ci) is ⏳ MANUAL REQUIRED from
a clean working copy. Until that run is recorded: **CONDITIONAL PASS**, and
PRE_ECL_READINESS is **FAIL** — by design, `release:check` refuses to pass
with null/stale evidence, so a false green is not possible.

### Deferred (deliberately, per stop rules)

- SDK unification (6 executable versions across backend functions: 0.8.21/25/
  26/31/38/40 vs canonical ^0.8.41) — inventory done; blind mass-migration
  without an executable test loop is prohibited by the release's own rules.
- Modularization of the >500-line handlers (dataSyncAgent 2369,
  submitPaymentsAnalysis 2079, computeStripeVerifiedGap 1941, oauthConnector
  1566, seedPaymentsRateTable 1580, apiV1 866, mcpServer 777,
  processUploadedFile 727, chatChiefOrchestrator 750) — gated on billing/
  tenant/SDK/release-gate being green first.
- Correlation-ID propagation across economic flows.
- Prerender/SSR for public routes — platform blocker unchanged (see SEO
  section); MANUAL REQUIRED.

---

## Product scope (v59, 2026-08-05)

**Source of truth:** `config/product-policy.json` → generated artifacts →
`src/lib/featureScope.js` (adapter). The `FEATURE_SCOPE` object no longer holds
its own booleans; it derives them from the policy registry (v60). The public API
of `featureScope.js` is unchanged, so the Help Center (`getVisibleCategories` in
`helpCenterData.js`) and the Help SEO dynamic resolver keep consuming it without
change. See the **Product Policy Registry** section below.
**Rule:** a surface may show a category only when its vertical is both
`productionEnabled` and `merchantVisible`.

- **Active category:** payments (card payments — online PSP + in-store TPV).
- **Active channels:** online (PSP) and in-store (TPV / physical terminal).
- **Stripe connection (honest classification):** read-only OAuth (balance
  transactions, charges, fee breakdown). It is implemented but NOT yet verified
  with a real account in the deployed environment, so it is classified as
  **"Implemented — live verification pending"** (FR: « Implémenté — validation
  en production en attente » · ES: « Implementado — validación en producción
  pendiente »). Do NOT describe Stripe as "live" in any merchant-facing copy,
  operational inventory, or internal doc until the manual checklist below
  records PASS on every item. The Help Center integrations FAQ and the
  "Can CAMBRA analyze Stripe directly?" FAQ already use the honest wording.
- **Extraction-supported formats (v2):** PDF, CSV, JSON, PNG, JPG/JPEG, WebP
  and GIF (max 15MB; CSV/JSON max 1MB on the independent text-reader path).
  XLS/XLSX are rejected until a verified workbook parser exists. Files are
  signature-checked, hashed and read independently by Claude and OpenAI; a
  disagreement creates a review record and applies no amount. Invoice, contract,
  proposal, tax and bank documents are auditable but do not become Analyzer
  inputs. Only an accepted EUR payments statement may populate the estimated
  Analyzer input; it still does not create verified savings or authorize billing.
- **Code-level connectors (not live / not merchant-presented):** Shopify, WooCommerce,
  BigCommerce (commerce platforms whose data could feed the payments analysis),
  Google Drive, Google Sheets, Gmail, Slack. These remain in code (registry /
  normalizers) as dormant infrastructure and MUST NOT appear in Help, onboarding,
  navigation, pricing, or any merchant-facing claim as available integrations.
- **Future categories (roadmap, not currently available):** shipping, SaaS,
  insurance, telecom, energy, banking, financing. These may be presented only as
  explicit roadmap — no launch dates, no activation CTA.
- **Retired Help slugs:** `shipping`, `saas`, `insurance`, `telecom`, `energy`,
  `banking`, `financing`, `cambra-pro`, `founding-period`, `logistics`
  (see `RETIRED_HELP_SLUGS` in `helpCenterData.js`). `/Help/<retired-slug>`
  redirects to `/Help`; SeoMeta emits `noindex,nofollow` for them.
- **Prohibited merchant-facing claims:** "CAMBRA Pro", "Founding period",
  "Founding membership", "membership plan", "connect all your tools",
  "all your infrastructure", "all providers", "production-ready" for unproven
  connectors, presenting dormant verticals as active services.
- **Allowed vision framing:** "CAMBRA starts with card payments", "Payments are
  the first infrastructure category", "Additional categories may be introduced
  only after validation", "Future infrastructure categories are not currently
  available". "Infrastructure Intelligence" may remain as corporate positioning
  when explained as long-term vision.
- **Review date:** 2026-08-05. **Owner:** product/engineering (no per-file owners
  in repo).

### Stripe live-verification checklist (manual, blocks any "live" claim)

Until every item below is PASS, Stripe remains "Implemented — live verification
pending". A single FAIL or MANUAL REQUIRED re-asserts the honest classification
and blocks the word "live" in copy. Run with a real Stripe account in the
**deployed** environment (not just the sandbox).

| # | Step | Expected | Status |
|---|------|----------|--------|
| 1 | OAuth start — merchant clicks "Connect Stripe", redirect to Stripe authorize URL | Redirects to `connect.stripe.com/...` with the read-only scope | ⏳ MANUAL REQUIRED |
| 2 | OAuth callback — Stripe redirects back to CAMBRA with `code` | `StripeConnection` row created, tokens persisted, `api_status` = connected | ⏳ MANUAL REQUIRED |
| 3 | Cancel — merchant denies on Stripe | Graceful return, no `StripeConnection` row, no error page | ⏳ MANUAL REQUIRED |
| 4 | Connection with a real account | Real `acct_...` id stored, non-test `livemode` on data objects | ⏳ MANUAL REQUIRED |
| 5 | Read data — balance transactions / charges / fees | Real fee breakdown surfaces in the Analyzer, non-zero volume | ⏳ MANUAL REQUIRED |
| 6 | Refresh / reconnect on expired token | Silent refresh (or clean re-auth) keeps the connection usable | ⏳ MANUAL REQUIRED |
| 7 | Disconnect — merchant revokes | `StripeConnection` removed/disconnected, no further reads | ⏳ MANUAL REQUIRED |
| 8 | Tenant isolation — merchant A cannot read merchant B's data | Cross-tenant reads return empty / 403 | ⏳ MANUAL REQUIRED |
| 9 | No write scopes — only read-only OAuth scope requested | Scope list contains no `write_*` / `*_:write` | ⏳ MANUAL REQUIRED |

**Status legend:** PASS / FAIL / ⏳ MANUAL REQUIRED (not yet run). When all nine
read PASS, update the "Stripe connection" bullet above to "Live — verified
<date>" and lift the "live" copy restriction for Stripe only.

### Documents marked historical (do not treat as a current checklist)

The following docs describe earlier phases or the pre-pivot multi-vertical
product. They are kept for history; where they contradict this section, this
section wins:

- `src/docs/LAUNCH_CHECKLIST.md`, `src/docs/PENDING_KEYS.md`,
  `src/docs/OAUTH_SETUP_PENDING.md`, `src/docs/KNOWN_DEBT.md`, `README.md`,
  `src/README.md`, and `src/docs/Decision_Log_*.md`.

---

## SEO — Centralized per-route metadata (SEO-1, 2026-08-05)

### What is implemented

- **Single source of truth:** `src/lib/seoConfig.js` defines canonical path,
  title (EN/FR/ES), description (EN/FR/ES), `og:type`, robots and JSON-LD for
  every public route.
- **Single writer:** `src/components/shared/SeoMeta.jsx` renders inside
  `<Router>` and updates `document.title`, meta description, Open Graph
  (title/description/type/url/image/locale), Twitter, canonical link, robots
  and the per-route JSON-LD (`#cambra-route-jsonld`) on every route **and**
  language change.
- **No competing systems:** the language provider (`src/lib/i18n.jsx`) no longer
  writes meta tags — it keeps only `<html lang>`. The old `RobotsMeta` component
  was removed; `SeoMeta` is the only decision point for the robots meta.
- **Safe default:** any route not listed in `seoConfig.js` is rendered
  `noindex,nofollow`. This covers Dashboard, Results, Account, Reports, Vault,
  Invoices, ConnectTools, ConnectIntegrations, admin, LoginGate, HealthCheck
  and every alias/redirect route.
- **Canonical hygiene:** canonical and `og:url` are normalized to
  `https://cambra.global` + canonical path (root keeps a trailing slash, all
  others none). Query strings, tokens and hashes are ignored.

### Public canonical routes (indexable)

```
/                /Analyzer       /HowItWorks   /Pricing       /Partners
/ForProviders    /Testimonials   /Contact      /Security      /Help
/Help/:slug      /Privacy        /Terms        /Cookies
```

### SPA limitation (IMPORTANT — not faked)

CAMBRA is a React + Vite SPA served by Base44. There is **no server-side render
and no per-route prerender** on the platform today. `index.html` is a single
shell with homepage metadata; `SeoMeta` rewrites the head **client-side after
JavaScript executes**.

Consequences:

- ✅ **Google (and any JS-executing crawler):** per-route title, description,
  canonical, Open Graph, JSON-LD and robots are applied correctly. This is the
  primary SEO surface.
- ⚠️ **Social scrapers that do NOT execute JavaScript** (LinkedIn, WhatsApp,
  Facebook, Slack, X card crawlers, some preview tools): these read the static
  `index.html` head. They will see the **homepage** title/description/OG image
  for **every** shared URL. Per-route social previews will NOT work for them
  until a server-side solution is in place.

### Manual configuration required (to enable per-route social previews)

Pick **one** of the following when the platform supports it. Do NOT pretend it
works today.

1. **Base44 prerender / SSR** (preferred): if Base44 ships a per-route
   server-render or prerender feature for public pages, enable it for the 13
   canonical public routes listed above so the head is correct in the raw HTML.
   Then `SeoMeta` becomes a progressive enhancement rather than the only writer.
2. **Edge/CDN prerender** (e.g. Cloudflare, Vercel, Netlify prerender): if the
   `cambra.global` domain is fronted by a CDN that supports prerendering for
   bots, configure it to serve a rendered snapshot for the public routes to
   known social-user-agents. This is a **DNS / proxy** change, not an app
   change.
3. **Static per-route HTML** (manual fallback): generate per-route
   `index.html`-equivalent heads for the 13 public routes and serve them at the
   canonical paths. Not currently available through Base44's single-shell
   model — would require a build-time prerender step (`react-snap` /
   `vite-plugin-ssg`). Out of scope for now.

### hreflang

Not emitted. The app switches language client-side without independent
`/en`, `/fr`, `/es` URL paths, so hreflang would point three languages at the
same URL — a false signal. `SeoMeta` is structured to add hreflang the day
localized routes exist. No migration is planned in this phase.

### Domain configuration

- `cambra.global` must be the primary domain in the Base44 app settings
  (canonical origin is hard-coded to `https://cambra.global` in `seoConfig.js`).
- `https://cambra.global` → the Base44 app (DNS A/CNAME or Base44 domain
  mapping). The `sitemap.xml` and `robots.txt` reference this origin.
- Verify SPF/DKIM for `@cambra.global` email (separate, see email config).

### Files

- `src/lib/seoConfig.js` — per-route config (edit titles/descriptions here).
- `src/components/shared/SeoMeta.jsx` — the writer component.
- `public/sitemap.xml` — kept in sync with `CANONICAL_PUBLIC_PATHS` (verified by
  tests).
- `public/robots.txt` — `Allow: /`, `Disallow: /functions/`, `Disallow: /auth/`.
- `src/lib/seoSurface.test.js` — invariant tests for the SEO surface.

---

## Product Policy Registry (v60, 2026-08-05)

The single source of truth for economic terms, functional scope and
product-level parameters is **`config/product-policy.json`**. Frontend and
backend both derive from it through generated, byte-identical artifacts, so the
two can never silently diverge. Full guide: `src/docs/PRODUCT_POLICY.md`.

### Current policy

- **policyVersion:** `2026.08.01` · **effectiveDate:** `2026-08-01`.
- **Economic terms:** Analyzer free (€0) · success fee 25% · merchant share 75%
  (sum = 1) · duration 24 months · fee base "positive verified savings" ·
  recovery optional.
- **Referral ladder:** start 25% · step 5 points · floor 5%.
- **Product scope:** `payments` is the only production-enabled, merchant-visible
  vertical; shipping/SaaS/insurance/telecom/energy/banking/financing are dormant.
- **Channels:** online PSP + in-store TPV.
- **Integration status:** Stripe = `implemented_live_verification_pending`.

### Files

- `config/product-policy.json` — canonical, human-edited.
- `src/lib/productPolicySchema.js` — Zod schema + deterministic `buildArtifacts`.
- `scripts/generate-product-policy.mjs` — generator + drift checker.
- `src/lib/generated/productPolicy.js` · `base44/shared/generated/productPolicy.ts`
  — generated artifacts (do not edit; byte-identical).
- `src/lib/productPolicy.js` — public helper facade.
- `src/lib/economicTerms.js` · `src/lib/featureScope.js` — backward-compatible
  adapters (v59.1 API preserved; values now derive from the policy).

### Commands

- `npm run policy:generate` — validate + (re)write both artifacts.
- `npm run policy:check` — validate + fail on drift (no writes). Also runs
  inside `npm run verify` (before `typecheck`) and is asserted by
  `src/lib/productPolicyDrift.test.js` inside `npm test`.

### What it governs / does not govern

- **Governed:** the structured economic constants and the scope booleans above.
- **Not governed:** benchmarks, analysis results, provider rates, variable tax
  rates, agent/partner commissions with different logic, financial scenarios,
  illustrative examples, negotiated per-account fees, and legal prose. The
  registry feeds numbers into versioned, localized legal templates; it does not
  generate the wording.

### Changing a policy

Edit `config/product-policy.json` only → bump `policyVersion` + `effectiveDate`
→ `npm run policy:check` then `policy:generate` → review the generated diff →
**legal review** for fee/duration/share/fee-base/referral changes → `npm test` →
release. A policyVersion already effective is never mutated in place.

### Historical contracts

New policy versions govern **new acceptances only**. They never recalculate an
accepted Mandate, an issued Invoice, or a generated contract PDF. Accepted terms
live on the Mandate record (`acceptance_snapshot_json`,
`acceptance_snapshot_hash`, `document_version`); invoices derive their fee from
`MonthlySavingsReport.effective_fee_pct` resolved via the BillingRule active for
the measured month. Legacy mandates (no `policyVersion` in the snapshot) use
provenance `legacy_pre_policy_registry` — no retroactive reconstruction.

### Backend consumption (v60.1 — wired, 2026-08-05)

The backend artifact `base44/shared/generated/productPolicy.ts` is consumed by
the economic backend:

- `billingFee.ts` — `getSuccessFeePct()` fallback (no `25` literal).
- `referralProgram.ts` / `referralProgram.js` — ladder imported from generated
  policy (SYNC block preserved verbatim).
- `recoverAcceptance.ts` — `acceptance_snapshot_json` enriched with
  `policy_version`, `standard_fee_pct`, `merchant_share_pct`,
  `fee_duration_months`, `fee_base`, `template_version`.
- `recoverContractPdf.ts` — standard fee from snapshot/policy (no `25` literal).
- `startRecoverAcceptance` / `acceptRecoverMandate` — generated fallbacks.
- `referralBilling.ts` — `policy_version` stamped on new BillingRules.
- `base44/shared/contractPolicySnapshot.ts` — builder, resolver, legacy handler.

**Snapshot on acceptance:** implemented (new mandates carry policy_version +
economic terms in `acceptance_snapshot_json`).

**Invoice snapshot resolution:** the resolver (`resolveContractPolicy`) reads
mandate snapshot → BillingRule → MonthlySavingsReport → legacy, in that order.
The live policy is never used to bill an accepted contract. v60.2 added a
`resolvable: boolean` flag so callers BLOCK generation when a contract cannot
be resolved safely (instead of silently applying the live policy), and
`buildContractEconomicView` produces the single economic structure consumed by
PDF, email and invoice metadata — no second resolver, no local fallback
inside the document builders.

**PDF / email parity:** both read from `acceptance_snapshot_json` via
`resolveContractPolicy` + `buildContractEconomicView`. A contractual fee of 0
is preserved (no `|| 25` fallback replaces it with the policy default). An
unresolvable contract blocks PDF generation. No divergence is possible.

**Monthly report provenance (v60.2):** `generateMonthlySavingsReport` now
resolves the active mandate and persists contract-policy provenance on every
report (`policy_version`, `snapshot_hash`, `policy_source`, `mandate_id`,
`billing_rule_id`, `applied_fee_pct`, `merchant_share_pct`,
`fee_duration_months`, `resolution_warnings`, `generated_by`). The approval
flow (`approveRecoverReportForInvoicing`) re-resolves via the mandate and
enforces immutability: a provenance mismatch between the report and the
mandate blocks approval with `provenance_mismatch`.

**Invoice provenance (v60.2):** `createEligibleRecoverInvoices` freezes
`policy_version`, `policy_source` and `snapshot_hash` into both
`billing_snapshot_json` and the Invoice record at finalization. The invoice
never re-reads the live policy after creation.

**Legacy resolver:** implemented (`resolveLegacyContractTerms`). Legacy records
are marked `legacy_pre_policy_registry`; no policyVersion is invented. The
resolver emits `resolvable=false` (provenance `unresolvable`) when no fee can
be recovered from any source, so callers block instead of billing 0.

### Owner / last review

- Owner: CAMBRA product + legal.
- Last review: 2026-08-05 (v60.2 — contract policy wiring closed end-to-end).

## v0.95 Base44 runtime deployment — 2026-08-11

- Entity sync: PASS, including `CommercialStrategy`, `CommercialProviderState` and `OutboundProviderEvent`.
- Existing function updates: PASS. The P7/P8/Instantly routes are deployed through `outboundControlAdmin`, `resendInboundWebhook` and `processWebhookDeadLetters` because the app rejects new function names at its current quota.
- Founder Admin provider status: PASS and honestly `NOT_CONFIGURED`; no API key, no profiles, acquisition off, Instantly off, secret value not exposed.
- Controlled P7→P8→reply dry-run: PASS with zero real provider calls and zero unsolicited sends.
- Hosted provider maintenance proof: PASS. The isolated run processed 0 legacy webhook deliveries, event retry completed with 0 due/0 DLQ, reconciliation completed honestly as `NOT_CONFIGURED`, and both logical worker keys recorded `COMPLETED` SchedulerRun rows.
- P6 model-response remediation: PASS. A real one-lead run first reproduced an Anthropic multi-block response as `UNAVAILABLE_OR_UNPARSEABLE`; the shared boundary now joins every `text` block while excluding thinking/tool blocks. The same runtime probe then completed `PARSED`, non-degraded, with zero outbound sends. All 38 functions that consume the shared commercial model router were flattened, deployed individually and reported success.
- P6 scoring continuity: PASS. Missing, partial, failed or malformed model output no longer strands `leadOrchestrator`: every requested lead receives an evidence-only deterministic score, the model weight becomes zero, missing usable email caps the score at 59, and `lead_scoring_model_degraded` is written without persisting raw model output. A controlled deterministic-only runtime task completed successfully.
- Site: deployed to `https://cambra-global-d7ac1fab.base44.app`.
- Production outbound: intentionally DRAFT/effective capacity 0 pending scoped secrets, real auth, authenticated webhook, warm-up/domain evidence, cost configuration, controlled drills and explicit founder pilot authorization.
