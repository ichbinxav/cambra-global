# OPERATIONS_STATUS

> Living document of platform/domain configuration required for CAMBRA to operate
> correctly in production. Each section lists what is done, what is pending, and
> who must act.

---

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
- **Upload-supported formats:** PDF, CSV, Excel (.xls/.xlsx), PNG, JPG (max 20MB).
  Statement upload works for any PSP or TPV provider, including those not on the
  connected list.
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