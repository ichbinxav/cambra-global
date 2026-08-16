# CAMBRA v0.98.0 — Master Task Prompt

> Paste this as the system/kickoff prompt for Codex. Written in English on purpose:
> the repo's code comments, identifiers and docs are English, and mixing languages
> in an agent prompt degrades output. The human-facing report is in Spanish.

---

## Who you are and what you are doing

You are working on **CAMBRA**, a payments-cost audit product for European merchants.
Stack: React/Vite frontend, Base44 (Deno serverless) backend, ~900k LOC, 1.779 source
files, 300 backend functions, 3.116 tests.

The release package `v0.98.0` self-declares `readinessLevel: NOT_GO_READY`. An
independent audit confirmed that verdict is accurate. Your job is to close
**every repository-side gap** so that the only remaining blockers are the ones that
physically cannot be closed from a repo.

### Be honest about what "sealed" means

`RELEASE.json` tracks 20 `ROOT-OTR` requirements (all `NOT_MET`) and 8 root seals
(all `NOT_SEALED`). **You cannot seal them.** They require runtime evidence: a real
deployment, real merchants, 30-day SLO windows, a live incident drill, a restore
drill. No amount of code changes them.

What you *can* do — and what you are asked to do — is move every requirement from
"blocked by missing code" to "blocked only by missing runtime evidence", and state
clearly which is which. **Never edit `RELEASE.json` by hand to make a gate look
green.** That is the single most damaging thing you could do to this project.

---

## HOUSE RULES — read before touching anything

This repo has gate machinery that punishes sloppy work. Breaking any of these makes
`npm run verify` fail in a way that looks like a repo bug and is not.

### R1 — Exact toolchain or nothing
```
Node 24.19.0    npm 11.17.0
```
`npm run toolchain:check` is the first gate and aborts on any other version. Use
`.nvmrc`. Never "update" dependencies. Always `npm ci` from the lockfile.

### R2 — NEVER hand-edit a generated file
~40 files under `config/`, `src/lib/generated/` and `base44/shared/generated/` are
generator output. Each has a `:check` that regenerates and compares. Edit the
generated file and the check fails; "fix" the hash and you have destroyed traceability.

| Edit THIS (source) | Then run | NEVER edit (generated) |
|---|---|---|
| `config/europe-markets.json` | `npm run markets:generate` | `base44/shared/generated/europeMarkets.ts` |
| `config/europe-locales.json` | `npm run locales:generate` | `base44/shared/generated/localeRegistry.ts` |
| input of `generate-product-policy.mjs` | `npm run policy:generate` | `config/product-policy.json` |
| input of `generate-ecl-policy.mjs` | `npm run ecl:generate` | `config/ecl-policy.json`, `src/lib/generated/eclPolicy.js`, `base44/shared/generated/eclPolicy.ts` |
| function / scheduler code | `npm run scheduler:generate` | `config/scheduler-inventory.json` |
| agent code | `npm run workforce:generate` | `config/agent-workforce-catalog.v1.json` |

Rule of thumb: if the file starts with `// GENERATED from … — DO NOT EDIT`, it is off
limits. When unsure: `grep -l "GENERATED" config/ src/lib/generated/ base44/shared/generated/`.

### R3 — Frozen files
`config/pre-ecl-freeze.json` freezes 12 files by hash (evidence entities,
`stripeBillingWebhook`, `processWebhookDeadLetters`, `eclProductionHealth`,
`processUploadedFile`). Changing one requires `scripts/update-freeze.mjs` with an
explicit reason and a confirmation token, logged in `config/freeze-change-log.json`.

**No task below requires touching a frozen file.** If you believe one does, stop and
ask — it almost always means the fix belongs somewhere else.

### R4 — Static tests: do not "fix" the test
~32% of tests never execute code. They `readFileSync` the source and assert
`toContain` / `not.toContain` (`*.static.test.js`, `docsCoherence.test.js`, the
`p1x*.test.js` family). A cosmetic refactor breaks them without any behaviour change.

When one fails, **check whether the invariant it protects still holds**:
- Still true → update the test's string.
- No longer true → the bug is in your code, not the test.

Never delete one of these tests to pass a gate.

### R5 — 50-function ceiling on Base44
The app is grandfathered at 276 physical functions, but the current plan rejects new
names with `Maximum of 50 functions per app reached`. **Do not create new directories
under `base44/functions/`.** New endpoints go as *actions* inside an existing host
function, registered in `base44/deployment-topology.json` as a logical route.

### R6 — Definition of done
```bash
npm run verify     # must exit 0
```
30 gates + lint + typecheck + 3.116 tests + build + release manifest. Nothing ships
without it. **One task per PR.** Do not batch.

---

## TASK 0 — Version control `[DO THIS FIRST]`

The package has **no git history** (`gitSha: null`, no `.git`). The Base44 CLI has no
rollback (`functions: deploy|delete|list|pull`, `site: deploy|open`, `entities: push`).
Today a bad deploy is unrecoverable.

1. `git init`, sensible `.gitignore` (one already exists — verify it covers
   `node_modules`, `dist`, `base44/.deploy`, `.env*`).
2. Initial commit of the exact v0.98.0 tree. **Verify the tree hash still matches
   `ba99880d214eeefbf82f2a811f8ca751e3377d8a24a324f96e9fa8914dd7d0e6` before committing.**
3. Tag `v0.98.0`. Push to a private remote.
4. Work on branches from here. Never commit directly to main.

---

## TASK 1 — Three confirmed runtime bugs

Found by compiling all 300 backend functions (they are outside the current typecheck
gate — see Task 2).

**1.1** `base44/functions/resendInboundWebhook/entry.ts:62` — `lifecycle_id` does not
exist; the variable declared on line 50 is `lifecycleId`. Guaranteed `ReferenceError`.
It breaks the audit log for email bounces, complaints and suppressions, and returns
500 to Resend, which then retries indefinitely. Note the suppression itself *does*
apply (it happens before the crash) — only the compliance record is lost.

**1.2** `base44/functions/seedProviderIntelligenceFoundation/entry.ts:8` —
`catch(e){ … internalErrorResponse(error, …) }`. Must be `e`. The error handler itself
throws.

**1.3** `base44/functions/apiV1/entry.ts:605-609` — the `Document.create` in
`POST /v1/ai/weekly-briefing` persists neither `organization_id` nor `owner_email`.
Apply the same pattern as `POST /v1/reports` (lines 466-479, marked `FIX 3`). Without
it the report is orphaned and its tenant never sees it.

**1.4** While you are there: audit the other `asServiceRole.entities.*.create()` calls
in `apiV1/entry.ts` and any other function that creates tenant-owned rows, and confirm
each one denormalises ownership. Report what you find; do not silently fix unrelated
endpoints in this PR.

---

## TASK 2 — Extend typecheck to the whole backend

`tsconfig.critical.json` is a **hand-maintained allowlist of 121 files** (66 of 300
`entry.ts` + 54 shared), with `strict: false`. The other 234 backend functions have no
typecheck at all. Both bugs in Task 1 lived in that gap.

1. Generate the `include` list from all 300 `entry.ts` files.
2. Compile. Expect ~209 errors. Triage them:
   - **Real** — undefined identifiers (`TS2552`, `TS2551`), wrong arity on your own
     functions (`TS2554`), iterating a non-iterable (`TS2488`), missing modules (`TS2307`).
   - **Noise** — `TS2339` on untyped SDK shapes (`Property 'code' does not exist on
     type 'Error'`), `TS2362/TS2363` from `Date` arithmetic in sort comparators
     (valid JS, TS just complains).
3. Fix the real ones. Capture the rest via the existing baseline flow:
   `npm run typecheck:baseline:candidate` → `npm run typecheck:baseline:approve`.
4. Wire the widened config into `npm run verify` so a new `ReferenceError` can never
   reach a release again.

Report the final real-vs-noise split.

---

## TASK 3 — Generalise the tax engine to 30 markets `[BLOCKING]`

### Problem
`base44/shared/recoverTax.ts:127-129`:
```ts
if (country !== 'FR' && country !== 'ES') {
  return { treatment: 'UNSUPPORTED_JURISDICTION', ... };
}
```
`FR`, `BE`, `NL` are **protected markets** — not launched, for legal reasons. So the
intersection of "can operate" and "can invoice" is **Spain only**. 29 of 30 active
markets reach the invoicing step and hard-block.

### Tax structure (advisor confirms, you implement)
CAMBRA Global SASU is a **French supplier of a B2B service**. Under the general rule
of art. 44 Directive 2006/112/EC the place of supply is the customer's country, with
**reverse charge**. Practical consequence: **no VAT registration is needed in each
country.** That is what makes 30 markets feasible.

The 30 active markets split exactly:

| Group | Count | Treatment |
|---|---|---|
| EU member states<br>`AT BG HR CY CZ DK EE FI DE GR HU IE IT LV LT LU MT PL PT RO SK SI ES SE` | 24 | EU B2B reverse charge · rate 0 · art. 44 + 196 |
| Non-EU<br>`NO IS LI CH GB AD` | 6 | Outside scope of EU VAT · rate 0 |
| `FR` `BE` `NL` | 3 | Protected — not launched |

*Consistency check: 24 active EU + FR/BE/NL protected = EU-27 exactly.*

### Implementation
1. Add to `TaxTreatment`: `'EU_B2B_REVERSE_CHARGE'`, `'OUTSIDE_SCOPE_EU_VAT'`.
   Keep `'ES_EU_REVERSE_CHARGE'` as a deprecated alias so historical invoices and
   existing tests do not break.
2. Add to `RecoverTaxConfig`, all defaulting to `false`:
   - `eu_reverse_charge_confirmed: boolean`
   - `non_eu_outside_scope_confirmed: boolean`
   - `country_overrides?: Record<string, 'BLOCK' | 'REVIEW'>` — kill-switch per country without a deploy
   - keep `es_reverse_charge_confirmed`, treated as equivalent to `eu_…` when the new flag is absent.
3. Rewrite `determineTaxTreatment` with this precedence:
   - no config → `TAX_REVIEW_REQUIRED` (**doctrine: do not touch the fail-closed**)
   - identity / address / B2B blockers → accumulate as today
   - `country_overrides[country]` present → `BLOCK` or `REVIEW`
   - `FR` → `FR_STANDARD_TVA` (unchanged)
   - country ∈ EU-27 → requires `eu_reverse_charge_confirmed` + valid VAT + VIES ok → `EU_B2B_REVERSE_CHARGE`
   - country ∈ {NO,IS,LI,CH,GB,AD} → requires `non_eu_outside_scope_confirmed` + complete identity → `OUTSIDE_SCOPE_EU_VAT`
   - anything else → `UNSUPPORTED_JURISDICTION`
4. **Preserve the existing doctrine intact.** VIES `invalid` NEVER degrades to French
   VAT — it blocks. `unavailable` / `timeout` / `not_checked` block. Nothing silently
   becomes "tax = 0".

### Traps you must handle explicitly
- **Greece's VAT prefix is `EL`, not `GR`.** The current `vat.startsWith(country)`
  check would reject every valid Greek customer. Build a `VAT_PREFIX_BY_COUNTRY` map
  with at least `GR → 'EL'`.
- **Northern Ireland** uses `XI` for goods; for B2B services the customer is GB.
  Document the decision even if not implemented.
- **Monaco** is treated as FR for VAT. Not an active market, but an `MC` address would
  arrive through the FR path.
- **Andorra (`AD`)** is neither EU nor EEA — IGI, not VAT. Belongs in the outside-scope group.
- **Liechtenstein (`LI`)** uses the Swiss VAT system, not the EU one.
- The 6 non-EU markets **have no VIES**. Do not require a VIES check there; require a
  registered local tax identifier plus B2B confirmation instead.

### Tests (real behaviour, not grep)
- All 24 EU countries with valid VIES → `EU_B2B_REVERSE_CHARGE`, `tax_rate_bps === 0`.
- Greece with `EL123456789` → valid. With `GR123456789` → blocks.
- All 6 non-EU → `OUTSIDE_SCOPE_EU_VAT` without requiring VIES.
- `FR` → `FR_STANDARD_TVA` at the configured rate.
- VIES `invalid` in any EU country → blocks, and **never** returns `FR_STANDARD_TVA`.
- Missing `eu_reverse_charge_confirmed` → `TAX_REVIEW_REQUIRED`, never rate 0.
- A country outside the 30 + FR → `UNSUPPORTED_JURISDICTION`.

---

## TASK 4 — Signable DPA `[BLOCKING for real customers]`

Three ready files are supplied: `dpa.js` (English master), `dpa.es.js`, `dpa.fr.js`.
They already match the exact object shape of `src/content/legal/en/terms.js`
(16 sections, 3 annexes, 9/12/5 annex rows each) and are validated JS.

1. Drop into `src/content/legal/{en,es,fr}/dpa.js`.
2. `src/pages/DPA.jsx`, modelled on `src/pages/Terms.jsx`. It must render `sections`
   plus the extra keys `intro`, `annexes` (key/value tables) and `signature`.
3. Routes in `src/App.jsx` alongside the other legal routes: `/DPA` with
   `withBoundary`, and `/dpa` → `Navigate` to `/DPA`.
4. Footer link in the same block as Terms / Privacy / Cookies.
5. Add the three new files to the list in `src/lib/legalIdentityConsistency.test.js`
   (lines 19-27) so legal identity — SIREN, SIRET, VAT, registered office — is
   verified in the DPA too.
6. **New test:** Annex III (sub-processors) must match §5 of `privacy.js` in all three
   languages. Divergence there is a real compliance failure.

### Electronic acceptance (what makes it *signable*, not merely published)
- Entity `DpaAcceptance`: `organization_id`, `accepted_by_email`, `accepted_at`,
  `document_version`, `locale`, `ip_fingerprint` (HMAC — never a raw IP; follow the
  pattern in `base44/shared/rateLimit.ts`).
- Acceptance action **inside an existing host function** (rule R5), not a new function.
- Block the Recover flow when there is no current `DpaAcceptance` for the active
  document version, fail-closed in the same style as `startRecoverAcceptance`.

### ⚠️ Warning you must not ignore
**Annex II is a set of binding representations about security measures.** Each line was
written from controls verified in this codebase and they do exist. But before publishing,
check every line against `config/data-retention-matrix.json`, where several categories
are still `LEGAL_REVIEW_REQUIRED` / `CONFIGURATION_REQUIRED` / `RUNTIME_PENDING`.

**Signing a DPA that promises automated deletion where none exists is worse than having
no DPA.** Any line that is not true today: delete it or reword it. Flag what you removed.

---

## TASK 5 — Anonymous funnel honesty `[HIGH PRIORITY]`

In `estimated` mode the "current rate" is the **PSP's public list price** for whatever
provider the user picked from a dropdown. There is no field where they declare what
they actually pay. And the UI presents it as fact.

1. `src/components/paymentsResults/PaymentsGapCard.jsx:257` —
   `what you pay, on {provider}` → `{provider} public list price` (i18n key, 3 locales).
2. Same file, line 198 — `You're overpaying by roughly` → mode-conditional. In
   `estimated`: *"Against list pricing, you may be overpaying"* or similar.
3. `src/components/paymentsResults/AssumptionsFootnote.jsx:33` — currently hides all
   assumptions unless mode is `verified`. Always show at least two:
   *"we assume {provider}'s public list price; your actual invoice may differ"* and
   *"premium, commercial and Amex card mix is not modelled"*.
4. Consider an optional "what rate do you pay today?" field. When filled it takes
   precedence over list price and the figure becomes real rather than assumed.

**Why this is high priority:** the high-volume segment is precisely the one that already
negotiated a custom rate, and it is the one that will see a non-existent overpayment.
Going from 1 to 30 markets multiplies that exposure by 30, and multiplies the number of
consumer-protection authorities who could look at it.

---

## TASK 6 — Rate and language coverage for 30 markets

**Rates.** 41 cohort rows today (18 verified), per-country granularity only for `EU-ES`
and `EU-FR`. The other 28 markets fall back to `ANY|ANY|EU` (`verified:false`, ±35% band).
- Minimum: verify the fallback-row warning is **always** shown in those markets and the
  ±35% band appears in the result.
- Better: seed per-country rows for the 5-6 priority markets in
  `seedPaymentsRateTable/entry.ts`, keeping the existing standard of `source_url` +
  verbatim quote. **Never invent a rate. No source, no row.**

**Languages.** `config/europe-locales.json` declares
`legalDocumentLocales: ["en-GB","fr-FR","es-ES"]` and 24 of 33 markets are
`FALLBACK_ONLY`. Priority additions: DE, IT, PT, PL, NL. Edit
`config/europe-locales.json` and run `npm run locales:generate` (rule R2).

---

## TASK 7 — Closure report

After tasks 0-6, produce `docs/REPOSITORY_CLOSURE_2026.md` with, for each of the 20
`ROOT-OTR` requirements and 12 `pendingProductionRequirements` in `RELEASE.json`:

| Requirement | Repo-side status | What remains | Who closes it |
|---|---|---|---|

Use exactly three values for repo-side status: `REPO_COMPLETE`,
`REPO_PARTIAL (reason)`, `NOT_REPO_CLOSABLE`.

Then regenerate the manifest with `npm run release:manifest` — **do not hand-edit
`RELEASE.json`.** If `readinessLevel` stays `NOT_GO_READY` because runtime evidence is
missing, that is the correct and expected outcome. Say so plainly.

---

## Execution order

| # | Task | Why this position |
|---|---|---|
| 0 | Git | Without it you have no diffs, no PRs, no revert |
| 1 | Three bugs | Warm-up; validates your environment and the gate chain |
| 2 | Typecheck | Prevents recurrence before you write more backend code |
| 3 | Tax engine | Unblocks 29 markets |
| 4 | DPA | Unblocks signing real customers |
| 5 | Funnel honesty | Claims exposure, scales ×30 with the launch |
| 6 | Rates + languages | Launch quality |
| 7 | Closure report | Tells the founder exactly what is left |

One PR per task. `npm run verify` green before every merge.

---

## What you cannot do — do not attempt, do not fake

State these as blocked and move on:

- **Legal approval** of Recover V2 and of the FR/ES mandate translations.
- **Advisor-validated `RECOVER_TAX_CONFIG_JSON`.** You write the engine; the tax advisor
  confirms the flags. Without them the engine blocks every invoice — that is correct.
- **Lawyer review of the DPA**, especially Annex II.
- **Deploying to Base44** and proving 276-function parity.
- **SPF / DKIM / DMARC** and the email suppression lifecycle.
- **A real backup/restore drill** with measured RPO/RTO.
- **A controlled production incident** to prove alert delivery.
- **30-day SLO windows.**
- **The first real merchant** completing Connect → Sync → Analyzer → Recover →
  Verified Savings → Billing → Stripe → Reconciliation.

The last one is the actual bottleneck of this project, and it is not code.

---

## Reporting format

For each task, report:
1. Files changed (paths).
2. `npm run verify` exit code.
3. Tests added and what behaviour they assert (not what strings they grep).
4. Anything you found that was not in this brief.
5. Anything you chose not to do, and why.

If a gate fails and you do not understand why, **stop and report**. Do not modify a
generated file, a frozen file or `RELEASE.json` to make it pass.
