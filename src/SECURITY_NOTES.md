# CAMBRA — Security Notes

## Known npm audit vulnerabilities

These vulnerabilities exist in the dependency tree. Status as of last audit:

### Production dependencies
- Review regularly with: `npm audit --omit=dev`
- Fix with: `npm audit fix` (safe fixes only, no `--force`)

### Dev-only vulnerabilities
- Dev-only vulnerabilities do not affect production builds
- Acceptable for a pre-production codebase

### jspdf (if present)
- Severity: critical (if flagged)
- Usage: PDF export feature only
- Mitigation: not exposed to untrusted input in current implementation
- Action: update when a non-breaking patch is available

### react-router
- Severity: moderate (if flagged)
- Action: update when stable v7 is available without breaking changes

### rollup (build tool, dev only)
- Severity: high
- Production impact: none — build tool only
- Action: update Vite when the rollup patch is included

## Secrets management

All production secrets are stored in the Base44 secrets manager:
- `APP_DOMAIN`
- `STRIPE_CLIENT_ID`
- `STRIPE_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`
- `BENCHMARK_ANON_SALT` (CRITICAL — never rotate without migration)
- `OPENAI_API_KEY`

No secrets in `.env`, git history, or the frontend bundle.

## Tenant isolation status

- **Frontend** — per-brand RLS on all entities ✓
- **Backend functions** — explicit `brand_id` / `created_by` filters ✓
- **API v1 / MCP** — `assertTenant` enforced with org + user (created_by **or** owner_email) fallback ✓
- **Benchmark data** — admin-only raw data, aggregated public API only (minimum 5 contributions per cohort) ✓

## Reports tenant model

- `POST /v1/reports` persists **both** `owner_email` (Document field) and `created_by` (auto by the SDK).
- `GET /v1/reports` filters by `created_by` matching the user_email of the principal (and by `organization_id` for org-scoped tokens).
- Cross-tenant reads return `404 not_found` to avoid existence leaks.

## AI agents

- `AgentRun.requires_approval` is hardcoded to `true`. No autonomous external actions.
- All agent-proposed actions land in `actions_proposed` and require an admin to call `approveAgentRun` before any side effect.

## Compliance rules (always active)

- `no_guaranteed_savings`
- `no_live_deal_without_signed_agreement