# CAMBRA Global

**Infrastructure Cost Intelligence for independent European brands.**
CAMBRA benchmarks payment fees, shipping costs and SaaS spend against
anonymized European peers, identifies recoverable margin, and tracks
verified savings — across **Payments**, **Logistics**, and **Commerce SaaS**.

> Built on [Base44](https://base44.com). This repository is a 2-way sync of the live app code.

---

## 🏗️ Architecture

- **Frontend** — React + Vite + Tailwind + shadcn/ui
- **Backend** — Deno-based serverless functions (`/functions`)
- **Database** — Base44 entities (JSON Schema) with Row-Level Security
- **Auth** — Base44 platform auth (web) + OAuth 2.0 / API keys (external API)
- **External API** — Versioned REST (`/v1`) + MCP server (Claude / GPT)
- **Webhooks** — HMAC SHA-256 signed, with retries + dead-letter queue
- **i18n** — Flat-key dictionaries in `lib/i18n.jsx` (EN / FR / ES)

---

## 📁 Project Structure

```
├── pages/              # Routed pages (Landing, Analyzer, Results, Dashboard, …)
├── components/         # UI components (shadcn + custom)
├── lib/                # Shared utilities (i18n, auth, query-client, scoring)
├── api/                # Base44 SDK client
├── entities/           # JSON schemas (Brand, AnalyzerResult, OAuthToken, …)
├── functions/          # Deno backend handlers (apiV1, mcpServer, oauth*, …)
├── agents/             # In-app AI agent configs
├── App.jsx             # Router
└── index.html
```

---

## 🚀 Local Development

```bash
npm install
cp .env.example .env       # then fill in real values
npm run dev
```

You'll need a Base44 app ID; the SDK handles auth and data.

---

## 🔐 Environment Variables

See [`.env.example`](./.env.example) for the full list. Critical:

| Variable                | Purpose                                            |
|-------------------------|----------------------------------------------------|
| `BASE44_APP_ID`         | Base44 app identifier                              |
| `APP_DOMAIN`            | Public canonical URL (used in emails, OG, etc.)    |
| `OPENAI_API_KEY`        | AI copilot / recommendations / agents              |
| `STRIPE_CLIENT_ID`      | Stripe Connect OAuth platform app                  |
| `STRIPE_SECRET_KEY`     | Stripe API key (server)                            |
| `BENCHMARK_ANON_SALT`   | Salt for anonymizing benchmark contributions       |

---

## 🌐 External API

- **Base URL** — `https://api.cambra.global/v1/`
- **Auth** — API keys (`Authorization: Bearer cmb_live_...`) or OAuth 2.0 (`cmb_at_...`)
- **Spec** — OpenAPI 3.1 at `/functions/apiOpenApiSpec`
- **MCP** — `/functions/mcpServer` (MCP 2024-11-05 spec)

See `/Developers` and `/Developers/MCP` in-app for full docs.

---

## 🛡️ Security & Tenant Isolation

- All sensitive entities have RLS policies scoped to admin + owner.
- API keys & OAuth tokens stored as SHA-256 hashes only.
- OAuth uses **PKCE** for public clients.
- **Tenant isolation** enforced on every API query: `organization_id` first,
  then `created_by`/`user_email` fallback, then **deny by default**. A missing
  `organization_id` on an OAuth token is **never** treated as platform-level.
- Idempotency keys supported on `POST`/`PATCH` (`Idempotency-Key` header).

---

## 🪝 Webhooks

- Signature: HMAC SHA-256 of `timestamp + event_id + body`
- Headers: `X-Cambra-Event`, `X-Cambra-Event-Id`, `X-Cambra-Timestamp`, `X-Cambra-Signature`
- Retries: 3 attempts, exponential backoff; failures → `WebhookDeadLetter`

---

## 🧪 Self-Tests (admin-only)

- API self-tests: Admin → API & Integrations → API Self-tests
- Flow self-tests: Admin → API & Integrations → Flow Tests
- Demo data seeder: Admin → API & Integrations → Flow Tests → Seed

All tests are idempotent.

---

## 📜 License

Proprietary — © CAMBRA Global. All rights reserved.