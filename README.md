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
# 1. Install
npm install

# 2. Configure environment
cp env.example .env          # fill in the frontend VITE_ vars
# Backend secrets go into the Base44 dashboard, not this file.
# (The template is named env.example without a leading dot because the
#  Base44 sandbox silently drops dotfiles from the repo.)

# 3. Run
npm run dev                  # http://localhost:5173
```

Publish changes from the Base44 dashboard (**Publish** button). Every push
to the linked repo is picked up by the Base44 builder.

---

## Scripts

| Command                   | What it does                                              |
|---------------------------|-----------------------------------------------------------|
| `npm run dev`             | Vite dev server, hot reload                               |
| `npm run build`           | Production build (Vite)                                   |
| `npm run preview`         | Serve the production build locally                        |
| `npm run lint`            | ESLint (errors only)                                      |
| `npm run lint:fix`        | ESLint with auto-fix (imports cleanup, safe transforms)   |
| `npm run typecheck`       | TypeScript check against `jsconfig.json` — currently reports ~487 preexisting errors (see `src/docs/TYPECHECK_NOISE.md`); the Vite build does not run this check |
| `npm run typecheck:noise` | Same check, prefixed with the known-noise warning         |
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
│  base44/functions/*/entry.ts     HTTP handlers (Deno.serve)           │
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
│    • Benchmark engine — PaymentsRateTable-derived cohort curves       │
│      (src/lib/paymentsBenchmark.js); modeled curves are labeled as    │
│      modeled, never presented as empirical.                           │
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

Deployment is handled by the Base44 builder — the linked repo is the source
of truth, and pressing **Publish** in the dashboard promotes the current
commit. There is no separate CI/CD pipeline to configure. Function code
under `base44/functions/**` is auto-discovered and deployed as
`{function-name}` for each subdirectory containing an `entry.ts`.

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

