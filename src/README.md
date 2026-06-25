# CAMBRA — Infrastructure Intelligence Platform

The economic operating system for independent commerce.

CAMBRA gives independent brands the infrastructure leverage usually reserved
for large enterprises: real-time benchmarks, automated cost recovery, and a
unified view of every system that runs the business (payments, shipping,
SaaS, banking, telecom, HR).

We don't sell software — we sell **recovered margin**.
The diagnostic is free. We earn only on verified savings.

---

## Three pillars

1. **Payments / TPV** — fee benchmarking, PSP renegotiation, terminal contract
   audits.
2. **Logistics / 3PL** — carrier mix optimisation, contract re-bidding,
   surcharge recovery.
3. **Commerce SaaS** — stack consolidation, license renegotiation, duplicate
   tooling cleanup.

All three feed a single **Infrastructure Score** and a unified savings model
backed by a network benchmark (n ≥ 5 cohorts).

---

## Stack

- **Frontend** — React 18 + Vite + Tailwind + shadcn/ui
- **Backend** — Base44 BaaS (entities, functions, automations)
- **Functions runtime** — Deno Deploy
- **AI** — OpenAI (GPT family) via `InvokeLLM`
- **Payments** — Stripe (TPV/PSP intelligence + checkout)

---

## Local development

```bash
# Install
npm install

# Dev server
npm run dev

# Production build
npm run build

# Tests (Vitest)
npx vitest run
```

Environment variables — copy `.env.example` to `.env.local` and fill in the
Base44 values from your workspace dashboard.

---

## Repository layout

```
src/
  pages/            Route components
  components/       Reusable UI + feature components
  entities/         JSON schemas (Base44 entities)
  functions/        Deno Deploy backend functions
  agents/           AI agent configs
  lib/              Shared utilities (auth, i18n, scoring)
```

Each backend function is a standalone `Deno.serve(...)` handler — no shared
local imports between functions. Cross-function calls go through
`base44.functions.invoke()`.

---

## CI

GitHub Actions runs on every push and PR:

- `npm ci`
- `npm run build`
- `npx vitest run`

See `.github/workflows/validate.yml`.

---

## Security & privacy

- No raw OAuth tokens or API keys ever land in entity fields — only opaque
  references (`credential_ref`).
- Per-brand RLS on every user-scoped entity.
- Benchmark cohorts are anonymised and only become public at n ≥ 5.
- Webhook endpoints validate provider signatures (Stripe `constructEventAsync`,
  shared-secret for others).

Sensitive operations (admin maintenance, scheduled jobs) verify
`user.role === 'admin'` server-side.

---

## Status

Private beta. Live in 🇫🇷 🇪🇸 🇮🇪 with onboarding for independent commerce brands
between €30K–€500K monthly revenue.

For support, contact the team through the in-app **Help** page.