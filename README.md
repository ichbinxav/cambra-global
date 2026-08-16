# CAMBRA

**CAMBRA audits online and in-store card payment costs for independent
European brands.** It compares a merchant's effective rate (online PSP and
physical terminal) against European payment benchmarks built from public
pricing and regulatory interchange floors, quantifies the recoverable gap,
and drives the recovery — free analysis, success fee only on verified
savings.

The app is built on [Base44](https://base44.com): a React/Vite frontend, a
Deno-runtime backend of serverless functions, an entity-driven database with
row-level security, and a set of AI agents that operate under explicit
approval gates.

---

## Quick start

```bash
# 1. Install from the pinned lockfile
npm ci

# 2. Build and verify the complete Base44 function deployment tree
npm run base44:functions:bundle   # 276 physical functions / 28 logical routes

# 3. Configure environment
cp env.example .env          # fill in the frontend VITE_ vars
# Backend secrets go into the Base44 dashboard, not this file.
# (The template is named env.example without a leading dot because the
#  Base44 sandbox silently drops dotfiles from the repo.)

# 4. Run
npm run dev                  # http://localhost:5173
```

The 300 directories under `base44/functions` are canonical source modules, not
300 direct Base44 deployables. `base44/config.jsonc` deliberately points to the
ignored, generated `base44/.deploy/functions` tree. A clean checkout or release
ZIP must run `npm run base44:functions:bundle` before any deployment operation.
Do not use a dashboard publish flow that skips this compiler boundary.

---

## Scripts

| Command                   | What it does                                              |
|---------------------------|-----------------------------------------------------------|
| `npm run dev`             | Vite dev server, hot reload                               |
| `npm run build`           | Production build (Vite)                                   |
| `npm run base44:functions:bundle` | Deterministically stage and verify 276 physical functions plus 28 logical routes under `base44/.deploy` |
| `npm run base44:functions:deploy` | Rebuild first, then invoke only the locally installed Base44 CLI; never downloads `latest` |
| `npm run release:package` | After canonical verification, create and re-extract a ZIP containing the exact Base44 bundle and separate source/topology/bundle identities |
| `npm run preview`         | Serve the production build locally                        |
| `npm run lint`            | ESLint (errors only)                                      |
| `npm run lint:fix`        | ESLint with auto-fix (imports cleanup, safe transforms)   |
| `npm run typecheck`       | TypeScript check of every frontend JS/JSX module under `src/` (except Vite build plugins) |
| `npm run typecheck:noise` | Compatibility alias for the same zero-error frontend check |
| `npm test`                | Vitest, single run                                        |
| `npm run test:watch`      | Vitest, watch mode                                        |

---

## Environment variables

See [`env.example`](./env.example) for the full, grouped list with
placeholder values. Two groups exist:

- **Frontend (`VITE_*`)** — compiled into the bundle by Vite; safe to expose.
  Live in `.env` / `.env.local`.
- **Backend (Deno)** — never bundled into the frontend. Set in the Base44
  dashboard → **Settings → Environment Variables**. Includes AI provider
  keys, Stripe secrets, `INTEGRATION_TOKEN_KEY` (the master key that
  encrypts every stored OAuth/API-key blob), and outbound tooling keys.

Rotate any secret that leaks. Rotating `INTEGRATION_TOKEN_KEY` invalidates
every stored integration; do not rotate without a migration plan.

---

## Architecture overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Vite + React)                      │
│  src/pages/*            src/components/*         src/lib/*            │
│  Route table:           UI + charts +            Pure logic:          │
│  src/App.jsx            forms                    paymentsGap, i18n,   │
│                                                  score/roadmap/bench  │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                          Base44 SDK · @/api/base44Client
                                    │
┌───────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Base44 · Deno serverless)                 │
│                                                                       │
│  base44/entities/*.jsonc         JSON-schema data model + RLS         │
│  base44/functions/*/entry.ts     Canonical source handlers             │
│  base44/.deploy/functions/*      Generated physical deploy tree        │
│                                                                       │
│  NOTE: there is no base44/agents/*.jsonc directory. The "agent"       │
│  layer is implemented entirely as backend functions (38+ *Agent +     │
│  orchestrator entry.ts files) that call InvokeLLM and write to the     │
│  AgentRun / AgentTask / Approval entities. No declarative Base44      │
│  agent configs exist. See PRODUCTION_SURFACE_INVENTORY.md §5.         │
│                                                                       │
│  Key subsystems (payments-only product):                              │
│    • Payments gap engine — anonymous form analysis                    │
│      (submitPaymentsAnalysis → getPaymentsGapTeaser) and verified     │
│      Stripe analysis (stripeOAuthConnect → stripeDataSync →           │
│      computeStripeVerifiedGap). Rates come from PaymentsRateTable     │
│      (public pricing, source-quoted rows).                            │
│    • Benchmark intelligence — privacy-safe statistical cohorts use   │
│      BenchmarkContribution → BenchmarkCohort with k>=10 distinct      │
│      merchants. Public-pricing curves remain explicitly modeled.     │
│    • AI orchestrators (backend functions, not declarative agents) —  │
│      recommendation, spend intelligence, lead discovery, outreach.     │
│      Buy-side orchestrators require an Approval row before any        │
│      external action (risk_level ≥ 2). Payments/contracts are         │
│      hard-blocked (never automated).                                 │
└───────────────────────────────────────────────────────────────────────┘
```

Frontend routing is entirely in `src/App.jsx` (no automatic layout wrapper).
Backend function contracts and per-provider quirks live alongside the code
in `src/docs/`.

---

## Roadmap / NOT implemented

The following verticals appear in dormant code paths (deprecated pages,
V1-era entities kept for historical data, sync-engine normalizers written
ahead of need) but are **not part of the live product** and are not offered
to users: **shipping, SaaS, banking, insurance, telecom, finance ops, HR**.
CAMBRA has been payments-only since the product refocus. The multi-provider
sync normalizers (Mollie, Shopify, WooCommerce, BigCommerce, Sendcloud,
Klarna, Zettle, Square, accounting suites…) exist as tested library code but
only Stripe is wired end-to-end; contracts are documented in
`src/docs/normalizers-contracts.md` with *"verify at first real connect"*
markers.

---

## Tests

The test suite is Vitest. It covers:

- **Payments gap math** (`src/lib/paymentsGap.test.js` and the classifier,
  in-store, roadmap, score, trend and benchmark suites next to it).
- **Every normalizer** (`src/lib/normalizers/*.test.js`) against pinned
  fixtures. These validate the *shape* of the normalization contract — not
  that the numbers match a live provider (see limitations below).
- **Sync engine helpers** — paginators, date-range window computation,
  rate limit / backoff, refresh-on-401.
- **Structural drift** (`src/lib/syncEngine/__sync_check__.test.js`) —
  compares the source-of-truth JS files against the mirrored Deno copies in
  `dataSyncAgent/entry.ts`. Fails on any semantic drift.
- **Contract tests** (`src/pages/__contracts__/`) — analyzer → results
  handoff fields, route aliases, brand-metadata normalization.
- **Tenant-isolation static check** (`src/lib/tenantGuard.static.test.js`)
  — scans every backend function and fails if one touches a tenant entity
  via service role without an approved guard mechanism (see KNOWN_DEBT
  BUG-6).

Run: `npm test`. Full suite completes in seconds.

---

## Deploy

Canonical source remains under `base44/functions/**`, while Base44 discovers
functions only from `base44/.deploy/functions` through
`base44/config.jsonc#functionsDir`. The supported backend deployment entry point
is therefore the guarded package script:

```bash
npm ci
npm run base44:functions:bundle
npm run base44:functions:deploy
```

`base44:functions:deploy` always rebuilds the bundle before it can execute
`functions deploy --force`, and uses the exact lockfile-pinned
`base44@0.1.5` CLI through `npx --no-install`; it never downloads an implicit
version. Real deployment and the production smoke remain `RUNTIME_PENDING`
until an authenticated operator performs the separately authorized run. This
remediation performs no deploy.

`npm run release:package` includes the ignored `.deploy` bundle in the ZIP,
re-extracts it, verifies source-tree, topology, manifest and physical bundle
hashes against `RELEASE.json`, rebuilds the extracted bundle, and requires the
rebuild to be byte-identical. CI uploads both the release artifact and the raw
`base44/.deploy` directory for independent inspection.

---

## Security notes

- **Tenant isolation**: enforced in backend functions — each function that
  touches tenant data validates that the calling user owns the brand (or is
  admin) before returning data. Note: for the 10 entities whose writes go
  through service role, the `created_by` RLS rule is inert (fails closed);
  isolation relies on the per-function checks, now verified automatically
  by the static test above (KNOWN_DEBT BUG-6).
- **Stored credentials are encrypted at rest**. OAuth `access_token` /
  `refresh_token` and API-key blobs in `Integration.access_token` are
  encrypted with AES-256-GCM using `INTEGRATION_TOKEN_KEY`. The plaintext
  never leaves a function response — `getIntegrationStatus` and similar
  return only status metadata.
- **Agent approval gates**: any agent action with `risk_level ≥ 2`
  (client-visible drafts, external actions, financial/legal) creates an
  `Approval` row and blocks execution until a human approves. Payments and
  contracts are hard-blocked (never automated).
- **Copilot rate limit**: `copilotChat` requires a valid user session and
  caps calls per user via `COPILOT_RATE_LIMIT_PER_HOUR` (default 60/h).
- **Public endpoints by design**: `oauthRevoke` (RFC 7009 — token in body
  as proof-of-possession) and `getBenchmarkForReport` (aggregate-only,
  never per-brand). All other functions authenticate the caller.

---

## Known limitations

The test suite covers *structural* correctness (shapes, invariants, drift).
Two categories remain that only real data can close:

- **Normalizer field mappings against live provider APIs**. Every
  normalizer has a documented set of assumptions in
  `src/docs/normalizers-contracts.md`; several field-level details are
  marked *"verify at first real connect"* and cannot be validated without
  a paying merchant on the other side.
- **End-to-end savings defensibility**. The math is exhaustively tested and
  the benchmarks are anchored to public sources (published PSP pricing,
  interchange regulation floors), but the final claim — *"this brand can
  recover €X"* — requires a real connection, a real audit, and a real
  renegotiation outcome to be defended in front of a merchant.

### Known dependency vulnerabilities

> **Do not trust the numbers below blindly.** Run `npm audit` and
> `npm audit --omit=dev` in your own environment and compare. The counts
> change with every `npm install` and the advisory database updates
> continuously. Previous versions of this README claimed all
> vulnerabilities were dev-only — that claim was **not verified against
> `npm audit --omit=dev`** and has been removed.

As of the last manual audit, advisories were found in both dev and
production trees. The dev-side advisories (vite/vitest/esbuild) do not
ship to the production bundle. The production-side advisories (DOMPurify,
PostCSS, React Router, Socket.IO parser) may enter the bundle depending
on the import graph — verify with `npm audit --omit=dev` and trace each
advisory's dependency path before deciding it is inert.

To get the current, authoritative status:
```bash
npm audit                # full tree
npm audit --omit=dev     # production only
```

Do **not** run `npm audit fix --force` without reviewing breaking changes.

### Support

Contact the Base44 team via the dashboard for platform-level questions.
<!-- CI activo desde v62.3 -->
<!-- CI activo desde v62.3.1 -->
