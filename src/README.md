# CAMBRA — Infrastructure Intelligence Platform

CAMBRA is a buy-side infrastructure operating system for independent European brands. It benchmarks payment fees, shipping costs and SaaS spend against anonymized peer data, identifies savings opportunities and tracks verified monthly savings.

## What CAMBRA does

- **Infrastructure Discovery** — detects tools automatically from website and payment data
- **Benchmark Engine** — compares costs against anonymized European brand cohorts (minimum 5 brands per cohort)
- **Savings Analyzer** — 3-step frictionless flow: brand info → stack review → Stripe connect
- **Monthly Savings Measurement** — real measurement against frozen baseline using Stripe data
- **AI Agents** — payments, shipping and SaaS agents with mandatory human approval
- **Connect Everything** — 60-integration catalog, Stripe live, others coming soon
- **Infrastructure Graph** — visual map of every tool with inferred costs

## Tech stack

- **Frontend:** React + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Base44 (Deno functions)
- **Auth:** Base44 built-in auth
- **Database:** Base44 entities with RLS
- **i18n:** English / French / Spanish (`src/lib/i18n.jsx`)

## Local setup

```bash
npm install
npm run dev
```

## Environment variables

Copy `.env.example` to `.env` and fill in values. See `.env.example` for all required variables.

Backend secrets (`APP_DOMAIN`, `STRIPE_*`, `BENCHMARK_ANON_SALT`, `OPENAI_API_KEY`) are set in the Base44 secrets manager — never in `.env`.

## Validation

```bash
npm run build       # must pass
npm run lint        # must pass — zero errors
npm run typecheck   # must pass — ui/ wrappers excluded (see jsconfig.json)
npx vitest run      # all tests must pass — root vitest.config.js
npm audit --omit=dev
```

## Base44 functions

Key custom functions across M0–M8 milestones:

| Function | Purpose |
|----------|---------|
| `onAnalyzerCompleted` | Triggers full analysis chain after Analyzer runs |
| `benchmarkLearningEngine` | Pseudonymizes and ingests benchmark contributions |
| `getBenchmarkForReport` | Public-facing benchmark accessor (aggregated only) |
| `generateMonthlySavingsReport` | Real monthly savings measurement vs frozen baseline |
| `inferVendorsFromBankData` | Detects vendors from Stripe payment descriptors |
| `stripeOAuthConnect` / `stripeDataSync` / `stripeDisconnect` | Stripe Connect integration |
| `discoverCompanyInfrastructure` | Public website scanning for tool detection |
| `buildInfrastructureGraph` / `getInfrastructureGraph` | Infrastructure node/edge management |
| `runContinuousDiscovery` / `scheduledDiscoveryJob` | Scheduled re-discovery |
| `runPaymentsAgent` / `runShippingAgent` / `runRecommendationAgent` | AI agents (human approval required) |
| `approveAgentRun` | Admin approval gate for agent actions |
| `seedComplianceRules` | Seeds hard compliance rules |
| `seedIntegrationCatalog` | Seeds 60-integration catalog |
| `apiV1` / `mcpServer` | External REST + MCP interfaces with tenant isolation |

## Security notes

- **Tenant isolation:** Every query scoped to `brand_id` or `created_by`. Never use `asServiceRole` without explicit filter.
- **Benchmark privacy:** Raw contributions admin-only. Public API returns aggregates only. Minimum 5 brands per cohort.
- **`BENCHMARK_ANON_SALT`:** Never rotate without migrating all `BenchmarkContribution` records. Stored in Base44 secrets only.
- **Stripe:** Raw tokens never stored. Only `stripe_account_id` + opaque reference.
- **AI Agents:** `requires_approval: true` hardcoded. No autonomous external actions.
- **Compliance rules:** `no_guaranteed_savings` + `no_live_deal_without_signed_agreement` always active.

## Known limitations

- Stripe OAuth requires real `STRIPE_CLIENT_ID` / `STRIPE_CLIENT_SECRET` / `STRIPE_SECRET_KEY` in Base44 secrets
- All integrations except Stripe are `status: coming_soon` in the catalog
- MCP/API tenant isolation works for user-scoped tokens; org-scoped tokens require `organization_id` on entities
- `src/components/ui/**` (shadcn-generated) excluded from typecheck — see `jsconfig.json`
- `npm audit` has known vulnerabilities in dev dependencies — see [`SECURITY_NOTES.md`](./SECURITY_NOTES.md)

## Deployment

Deploy via the Base44 dashboard. The frontend builds automatically from this repo when connected to Base44.

Backend functions deploy automatically via Base44 when pushed to the connected branch.