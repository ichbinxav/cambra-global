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
- **Auth:** Base44 built-in auth + OAuth
- **Database:** Base44 entities with RLS per brand
- **i18n:** English / French / Spanish

## Local setup

```bash
npm install
npm run dev
```

## Environment variables

Copy .env.example to .env and fill in values.
Backend secrets (APP_DOMAIN, STRIPE_*, BENCHMARK_ANON_SALT) are in Base44 secrets — never in .env.

## Validation

```bash
npm run build       # must pass
npm run lint        # must pass
npm run typecheck   # must pass (UI wrappers may be narrowly excluded)
npx vitest run      # 33 tests
npm audit --omit=dev
```

## Base44 functions (25 total)

onAnalyzerCompleted, benchmarkLearningEngine, generateMonthlySavingsReport, inferVendorsFromBankData, stripeOAuthConnect, stripeDataSync, stripeDisconnect, discoverCompanyInfrastructure, buildInfrastructureGraph, getInfrastructureGraph, runContinuousDiscovery, runPaymentsAgent, runShippingAgent, runRecommendationAgent, approveAgentRun, and 10 supporting functions.

## Security

- **Tenant isolation:** all queries scoped to brand_id or created_by
- **Benchmark privacy:** raw data admin-only, public API aggregated only (min 5 brands per cohort)
- **OAuth:** tokens without organization_id are user-scoped by user_email, never platform-level
- **API v1 / MCP:** assertTenant enforces org + user fallback with explicit deny-by-default
- **Stripe:** no raw tokens stored, only stripe_account_id + opaque reference
- **AI Agents:** requires_approval: true hardcoded
- **Typecheck:** src/components/ui excluded (shadcn auto-generated wrappers)

## Deployment

Deploy via Base44 dashboard. Frontend builds automatically when repo is connected.