# CAMBRA — Security Notes

## Known npm audit vulnerabilities

> **Do not trust static numbers here.** Run `npm audit` and
> `npm audit --omit=dev` in your own environment. Advisory counts change
> with every `npm install` and the database updates continuously.
> Previous versions of this file claimed all vulnerabilities were dev-only
> — that claim was not verified against `npm audit --omit=dev` and has
> been removed.

As of the last manual audit, advisories were found in both dev and
production trees:

- **Dev-only** (vite/vitest/esbuild/rollup) — do not ship to the bundle.
- **Production** (DOMPurify, PostCSS, React Router, Socket.IO parser) —
  may enter the bundle depending on the import graph. Trace each
  advisory's dependency path before deciding it is inert.

Commands:
```bash
npm audit               # full tree
npm audit --omit=dev    # production only
```

Do **not** run `npm audit fix --force` without reviewing breaking changes.

## Secrets management

All production secrets are stored in the Base44 secrets manager (not in
`.env`, git history, or the frontend bundle):

- `APP_DOMAIN`
- `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` (live)
- `STRIPE_TEST_SECRET_KEY` / `STRIPE_TEST_PUBLISHABLE_KEY` (sandbox)
- `STRIPE_WEBHOOK_SECRET` / `STRIPE_BILLING_WEBHOOK_SECRET_TEST`
- `STRIPE_CLIENT_ID` (OAuth Connect)
- `INTEGRATION_TOKEN_KEY` (master AES-256-GCM key for stored OAuth/API-key blobs)
- `BENCHMARK_ANON_SALT` (CRITICAL — never rotate without migration)
- `INTERNAL_CALL_SECRET` (gate for internal-to-internal function calls)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `APOLLO_API_KEY`
- `RESEND_API_KEY` / `RESEND_FROM` (transactional email)
- `ADMIN_NOTIFICATION_EMAIL` / `FOUNDER_EMAIL` (digest recipients)
- Rate-limit ceilings: `PAYMENTS_ANALYSIS_RATE_LIMIT_PER_HOUR`,
  `PAYMENTS_GAP_TEASER_RATE_LIMIT_PER_HOUR`

Rotate any secret that leaks. Rotating `INTEGRATION_TOKEN_KEY` invalidates
every stored integration; do not rotate without a migration plan.

## Tenant isolation status

- **Frontend** — per-brand RLS on all entities ✓
- **Backend functions** — explicit `brand_id` / `created_by` filters ✓
- **API v1 / MCP** — `assertTenant` enforced with org + user (created_by **or** owner_email) fallback ✓
- **Benchmark data** — admin-only raw data, aggregated public API only (minimum 5 contributions per cohort) ✓

## Reports tenant model

- `POST /v1/reports` persists **both** `owner_email` (Document field) and `created_by` (auto by the SDK).
- `GET /v1/reports` filters by `created_by` matching the user_email of the principal (and by `organization_id` for org-scoped tokens).
- Cross-tenant reads return `404 not_found` to avoid existence leaks.

## AI agents / orchestrators

There are **no declarative Base44 agents** (`base44/agents/*.jsonc` does not
exist). The "agent" layer is implemented as backend functions that call
`InvokeLLM` and write to `AgentRun` / `AgentTask` / `Approval`.

- `AgentRun.requires_approval` is hardcoded to `true` — no autonomous external actions.
- All orchestrator actions with `risk_level ≥ 2` create an `Approval` row and block until a human approves inline.
- `approveAgentRun` (the centralized approval handler) is in QUARANTINE — the real approval flow is inline in each orchestrator, not routed through it.
- Payments and contracts are hard-blocked (never automated).
- See `src/docs/PRODUCTION_SURFACE_INVENTORY.md` §5 for the full classification.

## Compliance rules (always active)

- `no_guaranteed_savings`
- `no_live_deal_without_signed_agreement