# CAMBRA

**Infrastructure Intelligence for independent brands.** CAMBRA analyzes a
brand's operational stack (payments, shipping, SaaS, banking, insurance,
telecom, finance ops, HR), benchmarks each vertical against network data, and
surfaces recoverable margin — presented as concrete recommendations and
auditable savings.

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
cp .env.example .env         # fill in the frontend VITE_ vars
# Backend secrets go into the Base44 dashboard, not this file.

# 3. Run
npm run dev                  # http://localhost:5173
```

Publish changes from the Base44 dashboard (**Publish** button). Every push
to the linked repo is picked up by the Base44 builder.

---

## Scripts

| Command              | What it does                                              |
|----------------------|-----------------------------------------------------------|
| `npm run dev`        | Vite dev server, hot reload                               |
| `npm run build`      | Production build (Vite)                                   |
| `npm run preview`    | Serve the production build locally                        |
| `npm run lint`       | ESLint (errors only)                                      |
| `npm run lint:fix`   | ESLint with auto-fix (imports cleanup, safe transforms)   |
| `npm run typecheck`  | TypeScript check against `jsconfig.json`                  |
| `npm test`           | Vitest, single run                                        |
| `npm run test:watch` | Vitest, watch mode                                        |

---

## Environment variables

See [`.env.example`](./.env.example) for the full, grouped list with
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
│  src/App.jsx            forms                    scoreEngine, i18n,   │
│                                                  sync-engine helpers  │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                          Base44 SDK · @/api/base44Client
                                    │
┌───────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Base44 · Deno serverless)                 │
│                                                                       │
│  base44/entities/*.jsonc         JSON-schema data model + RLS         │
│  base44/functions/*/entry.ts     HTTP handlers (Deno.serve)           │
│  base44/agents/*.jsonc           In-app AI agents (with approvals)    │
│                                                                       │
│  Key subsystems:                                                      │
│    • Sync engine — normalizes provider APIs (Stripe, Mollie, PayPal,  │
│      Shopify, WooCommerce, BigCommerce, Sendcloud, Klarna, Zettle,    │
│      Square, PayPlug, Pennylane, Holded, Xero, QuickBooks, Sage,      │
│      Lexoffice, sevDesk, Odoo, FreshBooks). Contracts documented in   │
│      src/docs/normalizers-contracts.md.                               │
│    • Benchmark engine — scoreEngine.js (frontend) + mirrors in        │
│      3 Deno functions. Sync enforced by tests (see below).            │
│    • Agent orchestration — recommendation, spend intelligence, lead   │
│      discovery, outreach. Buy-side agents require Approval before     │
│      external action (risk_level ≥ 2).                                │
└───────────────────────────────────────────────────────────────────────┘
```

Frontend routing is entirely in `src/App.jsx` (no automatic layout wrapper).
Backend function contracts and per-provider quirks live alongside the code
in `src/docs/`.

---

## Tests

The test suite is Vitest. It covers:

- **Score & savings math** (`src/lib/scoreEngine.test.js`).
- **Every normalizer** (`src/lib/normalizers/*.test.js`) against pinned
  fixtures. These validate the *shape* of the normalization contract — not
  that the numbers match a live provider (see limitations below).
- **Sync engine helpers** — paginators, date-range window computation,
  rate limit / backoff, refresh-on-401.
- **Structural drift** (`src/lib/syncEngine/__sync_check__.test.js`) —
  compares the source-of-truth JS files against the mirrored Deno copies in
  `dataSyncAgent/entry.ts`. Fails on any semantic drift.
- **Benchmark sync** (`src/lib/__benchmark_sync__.test.js`) — extracts
  benchmark values from `scoreEngine.js` and its three Deno mirrors and
  fails on any divergence (payment rate, shipping cost, SaaS %).

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

- **Tenant isolation**: every non-User entity carries `brand_id`. Backend
  functions validate that the calling user owns the brand (or is admin)
  before returning data. Row-level security rules on entities enforce the
  same at the DB layer as a second line of defense.
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
  the benchmarks are anchored to public sources (Stripe/Adyen published
  rates, PSD2 caps, BEREC telecom data), but the final claim — *"this
  brand can recover €X"* — requires a real connection, a real audit, and a
  real renegotiation outcome to be defended in front of a merchant.

Contact the Base44 team via the dashboard for platform-level questions.