# CAMBRA Global

An AI-native economic operating system for independent commerce — providing infrastructure cost intelligence and savings recovery across three pillars: **Payments**, **Logistics**, and **Commerce SaaS**.

> Built on [Base44](https://base44.com). This repository is a 2-way sync of the live app code.

---

## 🏗️ Architecture

- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Deno-based serverless functions (`/functions`)
- **Database**: Base44 entities (JSON Schema) with Row-Level Security
- **Auth**: Base44 platform auth + OAuth 2.0 (PKCE) for external API
- **API**: Versioned REST (`/api/v1`) + MCP server for AI agents
- **Webhooks**: HMAC SHA-256 signed, with retries + DLQ

---

## 📁 Project Structure

```
├── src/
│   ├── pages/              # Routed pages (Landing, Dashboard, Analyzer, ...)
│   ├── components/         # UI components (shadcn + custom)
│   ├── lib/                # Shared utilities (auth, query client, i18n)
│   ├── api/                # Base44 SDK client
│   └── App.jsx             # Router
├── entities/               # JSON schemas (Brand, AnalyzerResult, Invoice, ...)
├── functions/              # Backend Deno handlers (apiV1, mcpServer, oauth*, ...)
├── agents/                 # AI agent configs (in-app copilot)
└── index.html
```

---

## 🚀 Local Development

```bash
# Install deps
npm install

# Copy env template
cp .env.example .env
# Fill in real values

# Run dev server
npm run dev
```

The app uses the Base44 SDK (`@base44/sdk`) — you'll need a Base44 app ID and the platform handles auth/data automatically.

---

## 🔐 Environment Variables

See [`.env.example`](./.env.example) for the full list. Critical ones:

| Variable | Purpose |
|---|---|
| `BASE44_APP_ID` | Base44 app identifier |
| `OPENAI_API_KEY` | AI features (copilot, recommendations) |
| `STRIPE_SECRET_KEY` | Subscription billing (optional) |
| `OAUTH_ISSUER` | External API OAuth 2.0 |

---

## 🧪 Self-Tests

Admin-only smoke tests are built in:

- **API self-tests**: Admin → API & Integrations → API Self-tests (10 infra checks)
- **Flow self-tests**: Admin → API & Integrations → Flow Tests (10 end-to-end product flow checks)
- **Demo data seeder**: Admin → API & Integrations → Flow Tests → Seed

All tests are idempotent and clean up after themselves.

---

## 📡 External API

CAMBRA exposes a versioned REST API + MCP server for AI agents (Claude, ChatGPT, Make, n8n, Zapier).

- **Base URL**: `https://api.cambra.global/v1/`
- **Auth**: API keys (`Authorization: Bearer cmb_live_...`) or OAuth 2.0
- **Spec**: OpenAPI 3.1 at `/functions/apiOpenApiSpec`
- **MCP**: `/functions/mcpServer` (supports MCP 2024-11-05 spec)

See `/pages/Developers` and `/pages/DevelopersMCP` for full docs.

---

## 🪝 Webhooks

Outbound events delivered with:

- **Signature**: HMAC SHA-256 of `timestamp + event_id + body`
- **Headers**: `X-Cambra-Event`, `X-Cambra-Event-Id`, `X-Cambra-Timestamp`, `X-Cambra-Signature`
- **Retries**: 3 attempts with exponential backoff
- **Dead letter queue**: Failed deliveries land in `WebhookDeadLetter` for replay

Supported events: `new_brand_created`, `analysis_completed`, `savings_unlocked`, `report_created`, `integration_connected`, `new_document_uploaded`.

---

## 🛡️ Security

- All sensitive entities have RLS policies (19 entities scoped to admin + owner)
- API keys stored as SHA-256 hash (raw key shown only once at creation)
- OAuth uses PKCE for public clients
- Tenant isolation enforced on every API query via `organization_id`
- Idempotency keys supported on all POST/PATCH (`Idempotency-Key` header)

---

## 📜 License

Proprietary — © CAMBRA Global. All rights reserved.