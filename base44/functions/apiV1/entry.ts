// CAMBRA External API v1 — production router
// =============================================================================
// TENANT ISOLATION: All endpoints must filter by organization_id or created_by.
// Never use asServiceRole.list() without explicit tenant filter.
// See assertTenant() and tenantFilter() helpers defined below.
// =============================================================================
// Versioned at /api/v1/. Modular by resource. Consistent JSON envelope on every
// response: { data, meta, error?, request_id }. Auth via API key OR OAuth 2.0
// bearer token. Rate-limited per principal. Full audit log per request.
//
// Routing (POST /functions/apiV1 with body { path, method, body? }):
//   GET    /v1/brands                      list:brands
//   GET    /v1/brands/:id                  read:brands
//   GET    /v1/analyses                    read:analyses
//   GET    /v1/analyses/:id                read:analyses
//   POST   /v1/analyses/run                trigger:analysis
//   GET    /v1/documents                   read:documents
//   GET    /v1/providers                   read:providers
//   GET    /v1/savings                     read:savings
//   GET    /v1/trackers                    read:trackers
//   PATCH  /v1/trackers/:id                DEPRECATED — economic tracker state is server-managed
//   GET    /v1/reports                     read:reports
//   POST   /v1/reports                     write:reports
//   GET    /v1/kpis                        read:kpis
//   GET    /v1/users/me                    read (any authenticated)
//   GET    /v1/integrations                read:integrations
//   POST   /v1/ai/weekly-briefing          read + write:reports
//   POST   /v1/ai/summarize-brand          read:brands
//
// Compat: legacy paths (/brands, /kpis, ...) still work — they're rewritten to /v1/*.
// =============================================================================
import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { consumeRateLimit } from '../../shared/rateLimit.ts';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function uuid() {
  return crypto.randomUUID();
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id, Idempotency-Key",
  "Access-Control-Expose-Headers": "X-Request-Id, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
  "Access-Control-Max-Age": "86400",
};

const MAX_REQUEST_BYTES = 256 * 1024; // 256 KB
const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 24; // 24h

function envelope({ data = null, meta = {}, error = null, requestId, status = 200, extraHeaders = {} }) {
  const body = { request_id: requestId, ...(error ? { error } : { data }), meta: { api_version: "v1", timestamp: new Date().toISOString(), ...meta } };
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": requestId, ...CORS_HEADERS, ...extraHeaders },
  });
}

function err({ code, message, status = 400, requestId, details }) {
  return envelope({ error: { code, message, ...(details ? { details } : {}) }, requestId, status });
}

// -----------------------------------------------------------------------------
// Authentication — API key OR OAuth bearer
// -----------------------------------------------------------------------------
async function authenticate(req, base44) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return { error: { code: "unauthorized", message: "Missing Bearer token", status: 401 } };
  const token = authHeader.slice(7).trim();
  if (!token) return { error: { code: "unauthorized", message: "Empty bearer token", status: 401 } };
  const hash = await sha256Hex(token);

  // OAuth access tokens are prefixed cmb_at_; API keys cmb_live_ / cmb_test_.
  if (token.startsWith("cmb_at_")) {
    const matches = await base44.asServiceRole.entities.OAuthToken.filter({ access_token_hash: hash });
    const tok = matches?.[0];
    if (!tok || tok.status !== "active") return { error: { code: "unauthorized", message: "Invalid or revoked OAuth token", status: 401 } };
    if (tok.access_token_expires_at && new Date(tok.access_token_expires_at) < new Date()) {
      return { error: { code: "token_expired", message: "Access token expired — refresh required", status: 401 } };
    }
    return {
      principal: {
        type: "oauth_token",
        id: tok.id,
        name: `OAuth · ${tok.user_email}`,
        scopes: tok.scopes || [],
        user_email: tok.user_email,
        client_id: tok.client_id,
        raw: tok,
      },
    };
  }

  const matches = await base44.asServiceRole.entities.ApiKey.filter({ key_hash: hash });
  const apiKey = matches?.[0];
  if (!apiKey || apiKey.status !== "active") return { error: { code: "unauthorized", message: "Invalid or revoked API key", status: 401 } };
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { error: { code: "key_expired", message: "API key expired", status: 401 } };
  }
  return {
    principal: { type: "api_key", id: apiKey.id, name: apiKey.name, scopes: apiKey.scopes || [], raw: apiKey },
  };
}

function hasScope(principal, required) {
  if (!required) return true;
  const scopes = principal.scopes || [];
  if (scopes.includes("admin")) return true;
  if (scopes.includes(required)) return true;
  // Compound: "read" implies all read:*
  const [verb] = required.split(":");
  if (scopes.includes(verb)) return true;
  return false;
}

// IP allowlist — supports plain IPs and /24 /16 CIDRs
function ipMatches(ip, allowed) {
  if (!ip) return false;
  if (allowed === ip) return true;
  if (allowed.endsWith("/24")) return ip.split(".").slice(0, 3).join(".") === allowed.slice(0, -3).split(".").slice(0, 3).join(".");
  if (allowed.endsWith("/16")) return ip.split(".").slice(0, 2).join(".") === allowed.slice(0, -3).split(".").slice(0, 2).join(".");
  return false;
}
function checkIpAllowlist(principal, ip) {
  const list = principal.raw?.ip_allowlist;
  if (!list || list.length === 0) return true; // no allowlist = allow all
  return list.some((entry) => ipMatches(ip, entry));
}

// Track API usage per organization for billing
async function trackUsage(base44, principal) {
  const orgId = principal.raw?.organization_id;
  if (!orgId) return;
  const periodMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const matches = await base44.asServiceRole.entities.ApiUsageRecord.filter({ organization_id: orgId, period_month: periodMonth });
  const record = matches?.[0];
  if (!record) {
    const org = await base44.asServiceRole.entities.Organization.get(orgId).catch(() => null);
    await base44.asServiceRole.entities.ApiUsageRecord.create({
      organization_id: orgId,
      period_month: periodMonth,
      request_count: 1,
      included_quota: org?.monthly_api_quota || 10000,
      overage_count: 0,
      overage_amount_eur: 0,
      last_updated_at: new Date().toISOString(),
    });
  } else {
    const newCount = (record.request_count || 0) + 1;
    const quota = record.included_quota || 10000;
    const overage = Math.max(0, newCount - quota);
    const org = await base44.asServiceRole.entities.Organization.get(orgId).catch(() => null);
    const overagePrice = (org?.overage_price_per_1k || 0.5) * (overage / 1000);
    await base44.asServiceRole.entities.ApiUsageRecord.update(record.id, {
      request_count: newCount,
      overage_count: overage,
      overage_amount_eur: Math.round(overagePrice * 100) / 100,
      last_updated_at: new Date().toISOString(),
    });
  }
}

// -----------------------------------------------------------------------------
// Rate limiting — 120 req / 60s window per principal (configurable on the key)
// -----------------------------------------------------------------------------
async function rateLimit(base44, principal) {
  const limit = principal.raw?.rate_limit_per_minute || 120;
  return consumeRateLimit(base44.asServiceRole,{principal_id:principal.id,principal_type:principal.type,limit,window_seconds:60});
}

// -----------------------------------------------------------------------------
// Logging
// -----------------------------------------------------------------------------
async function logActivity(base44, ctx) {
  try {
    await base44.asServiceRole.entities.ApiActivityLog.create({
      api_key_id: ctx.principal?.id,
      api_key_name: ctx.principal?.name,
      key_prefix: ctx.principal?.raw?.key_prefix,
      tool_name: ctx.principal?.raw?.tool_name || ctx.principal?.type,
      endpoint: ctx.endpoint,
      method: ctx.method,
      scope_used: ctx.scope,
      status_code: ctx.status_code,
      status: ctx.status,
      ip_address: ctx.ip,
      user_agent: ctx.user_agent,
      duration_ms: ctx.duration_ms,
      request_id: ctx.request_id,
      error_message: ctx.error_message,
      payload_summary: ctx.payload_summary,
    });
    if (ctx.principal?.type === "api_key" && ctx.status === "success") {
      await base44.asServiceRole.entities.ApiKey.update(ctx.principal.id, {
        last_used_at: new Date().toISOString(),
        last_used_ip: ctx.ip,
        usage_count: (ctx.principal.raw.usage_count || 0) + 1,
      });
    } else if (ctx.principal?.type === "oauth_token" && ctx.status === "success") {
      await base44.asServiceRole.entities.OAuthToken.update(ctx.principal.id, {
        last_used_at: new Date().toISOString(),
        last_used_ip: ctx.ip,
      });
    }
  } catch (_) { /* logging never blocks */ }
}

// -----------------------------------------------------------------------------
// Tenant isolation — DENY BY DEFAULT (FIX 2 / FIX 3 / FIX 4)
//
// Rules:
//   - API keys may carry organization_id; absence is NOT platform-level unless the key explicitly carries `platform` or `admin`.
//   - OAuth tokens with organization_id → scope by organization_id.
//   - OAuth tokens WITHOUT organization_id but WITH user_email → scope by created_by/user_email.
//   - OAuth tokens with NEITHER → return an impossible filter (deny by default).
//   - OAuth tokens are NEVER treated as platform-level just because organization_id is missing.
// -----------------------------------------------------------------------------
function isPlatformPrincipal(principal) {
  // Only API keys without an org may be "platform-level" — never OAuth tokens.
  return principal.type === "api_key" && !principal.raw?.organization_id && (principal.scopes || []).some((scope) => scope === "admin" || scope === "platform");
}

function tenantFilter(principal, extra = {}) {
  const orgId = principal.raw?.organization_id;
  if (orgId) return { ...extra, organization_id: orgId };
  if (isPlatformPrincipal(principal)) return extra; // explicit platform API key
  // OAuth without org_id → fall through to created_by below; if neither works, deny.
  const userEmail = principal.user_email || principal.raw?.user_email;
  if (!userEmail) return { ...extra, _impossible_tenant_match: "__no_identity__" };
  return { ...extra, created_by: userEmail };
}

function tenantFilterByCreatedBy(principal, extra = {}) {
  if (isPlatformPrincipal(principal)) return extra;
  const userEmail = principal.user_email || principal.raw?.user_email || principal.raw?.owner_email;
  if (!userEmail) return { ...extra, _impossible_tenant_match: "__no_identity__" }; // deny-by-default
  return { ...extra, created_by: userEmail };
}

// Validate that a single fetched resource belongs to the principal's tenant.
// Throws not_found if it doesn't (so cross-tenant probing leaks nothing).
//
// FIX 8 — Hardened ownership fallback:
//   - Org-scoped principal + resource has organization_id → exact match required.
//   - Org-scoped principal + resource lacks organization_id → allow only if
//     resource.created_by OR resource.owner_email matches principal.user_email.
//   - User-scoped (OAuth) principal → allow if created_by OR owner_email match.
//   - Platform API keys → pass through.
//   - No identity at all → deny.
function assertTenant(principal, resource) {
  if (!resource) return null;
  const deny = () => { const err = new Error("not_found"); err.code = "not_found"; err.status = 404; throw err; };
  const userEmail = principal.user_email || principal.raw?.user_email;
  const orgId = principal.raw?.organization_id;
  const ownsResource =
    (!!userEmail) && (
      (resource.created_by && resource.created_by === userEmail) ||
      (resource.owner_email && resource.owner_email === userEmail)
    );

  if (orgId) {
    if (resource.organization_id && resource.organization_id === orgId) return resource;
    if (!resource.organization_id && ownsResource) return resource;
    deny();
  }
  if (isPlatformPrincipal(principal)) return resource;
  if (!userEmail) deny();
  if (ownsResource) return resource;
  deny();
}

// -----------------------------------------------------------------------------
// Financial envelope — consistent shape for any money figure
// -----------------------------------------------------------------------------
function money(amount, { period = "yearly", confidence = 0.85, assumptions = [], source = "cambra-analyzer", currency = "EUR" } = {}) {
  return {
    amount: typeof amount === "number" ? Math.round(amount * 100) / 100 : null,
    currency, period, confidence, assumptions: Array.isArray(assumptions) ? assumptions : [], source,
  };
}

// -----------------------------------------------------------------------------
// Resource modules — each returns { data, meta }
// -----------------------------------------------------------------------------
const RESOURCES = {
  // ---------- BRANDS ----------
  "GET /v1/brands": {
    scope: "read:brands",
    handler: async (base44, { query, principal }) => {
      const limit = Math.min(parseInt(query.limit || "50", 10), 200);
      const filter = tenantFilter(principal);
      const items = Object.keys(filter).length
        ? await base44.asServiceRole.entities.Brand.filter(filter, "-created_date", limit)
        : await base44.asServiceRole.entities.Brand.list("-created_date", limit);
      return { data: items.map(serializeBrand), meta: { count: items.length, limit, has_more: items.length === limit } };
    },
  },
  "GET /v1/brands/:id": {
    scope: "read:brands",
    handler: async (base44, { params, principal }) => {
      const b = await base44.asServiceRole.entities.Brand.get(params.id);
      return { data: serializeBrand(assertTenant(principal, b)) };
    },
  },

  // ---------- ANALYSES ----------
  "GET /v1/analyses": {
    scope: "read:analyses",
    handler: async (base44, { query, principal }) => {
      const limit = Math.min(parseInt(query.limit || "50", 10), 200);
      const filter = tenantFilter(principal, query.brand_id ? { brand_id: query.brand_id } : {});
      const items = Object.keys(filter).length
        ? await base44.asServiceRole.entities.AnalyzerResult.filter(filter, "-created_date", limit)
        : await base44.asServiceRole.entities.AnalyzerResult.list("-created_date", limit);
      return { data: items.map(serializeAnalysis), meta: { count: items.length, limit, has_more: items.length === limit } };
    },
  },
  "GET /v1/analyses/:id": {
    scope: "read:analyses",
    handler: async (base44, { params, principal }) => {
      const a = await base44.asServiceRole.entities.AnalyzerResult.get(params.id);
      return { data: serializeAnalysis(assertTenant(principal, a)) };
    },
  },
  "POST /v1/analyses/run": {
    scope: "trigger:analysis",
    handler: async (base44, { body, principal }) => {
      if (!body.brand_id) {
        const e = new Error("brand_id is required"); e.code = "invalid_request"; e.status = 400; throw e;
      }
      // FIX 3 — assert the caller owns this brand before creating the input
      const brand = await base44.asServiceRole.entities.Brand.get(body.brand_id).catch(() => null);
      assertTenant(principal, brand);
      const input = await base44.asServiceRole.entities.AnalyzerInput.create({
        brand_id: body.brand_id,
        monthly_revenue: body.monthly_revenue,
        monthly_transactions: body.monthly_transactions,
        avg_order_value: body.avg_order_value,
        payment_fee_pct: body.payment_fee_pct,
        monthly_shipping_cost: body.monthly_shipping_cost,
        monthly_shipments: body.monthly_shipments,
        total_saas_spend: body.total_saas_spend,
      });
      return { data: { triggered: true, input_id: input.id, brand_id: body.brand_id, status: "queued" } };
    },
  },

  // ---------- DOCUMENTS ----------
  "GET /v1/documents": {
    scope: "read:documents",
    handler: async (base44, { query, principal }) => {
      const limit = Math.min(parseInt(query.limit || "50", 10), 200);
      // FIX 13 — tenant isolation: Document has no organization_id; scope by created_by
      const filter = tenantFilterByCreatedBy(principal);
      const items = Object.keys(filter).length
        ? await base44.asServiceRole.entities.Document.filter(filter, "-created_date", limit)
        : await base44.asServiceRole.entities.Document.list("-created_date", limit);
      return { data: items, meta: { count: items.length } };
    },
  },

  // ---------- PROVIDERS ----------
  "GET /v1/providers": {
    scope: "read:providers",
    handler: async (base44, { query }) => {
      const limit = Math.min(parseInt(query.limit || "50", 10), 200);
      const items = await base44.asServiceRole.entities.Provider.list("-created_date", limit);
      return { data: items, meta: { count: items.length } };
    },
  },

  // ---------- SAVINGS ----------
  "GET /v1/savings": {
    scope: "read:savings",
    handler: async (base44, { query, principal }) => {
      const limit = Math.min(parseInt(query.limit || "50", 10), 200);
      // FIX 13 — tenant isolation: BrandSavings has no organization_id; scope by created_by
      const filter = tenantFilterByCreatedBy(principal);
      const items = Object.keys(filter).length
        ? await base44.asServiceRole.entities.BrandSavings.filter(filter, "-computed_at", limit)
        : await base44.asServiceRole.entities.BrandSavings.list("-computed_at", limit);
      return {
        data: items.map((s) => ({
          id: s.id,
          brand_id: s.brand_id,
          monthly: money(s.estimated_savings_monthly, { period: "monthly" }),
          yearly: money(s.estimated_savings_yearly, { period: "yearly" }),
          current_cost_monthly: money(s.estimated_current_cost_monthly, { period: "monthly" }),
          optimized_cost_monthly: money(s.estimated_optimized_cost_monthly, { period: "monthly" }),
          computed_at: s.computed_at,
        })),
        meta: { count: items.length },
      };
    },
  },

  // ---------- TRACKERS (DealActivation) ----------
  "GET /v1/trackers": {
    scope: "read:trackers",
    handler: async (base44, { query, principal }) => {
      const limit = Math.min(parseInt(query.limit || "50", 10), 200);
      // FIX 13 — tenant isolation: DealActivation has no organization_id; scope by created_by
      const filter = tenantFilterByCreatedBy(principal);
      const items = Object.keys(filter).length
        ? await base44.asServiceRole.entities.DealActivation.filter(filter, "-created_date", limit)
        : await base44.asServiceRole.entities.DealActivation.list("-created_date", limit);
      return { data: items.map(serializeTracker), meta: { count: items.length } };
    },
  },
  "PATCH /v1/trackers/:id": {
    scope: "read:trackers",
    handler: async (_base44, _ctx) => {
      // P10 CRITICAL: DealActivation status and realized savings are economic
      // authority. External API principals — including AI clients — may read
      // them but must never bypass Recover/P9/ECL verification by writing them.
      const e = new Error("economic_tracker_state_is_server_managed");
      e.code = "forbidden"; e.status = 403; throw e;
    },
  },

  // ---------- REPORTS ----------
  "GET /v1/reports": {
    scope: "read:reports",
    handler: async (base44, { query, principal }) => {
      const limit = Math.min(parseInt(query.limit || "50", 10), 200);
      // FIX 7 — match POST /v1/reports persistence: a report stored with both
      // owner_email AND created_by must be retrievable by either field, within
      // the correct tenant scope (org-scoped principals are filtered first by
      // organization_id; user-scoped principals match created_by OR owner_email).
      const orgId = principal.raw?.organization_id;
      const userEmail = principal.user_email || principal.raw?.user_email;

      if (orgId) {
        // Org-scoped token: org_id must match.
        const filter = { source_type: "report", organization_id: orgId };
        const items = await base44.asServiceRole.entities.Document
          .filter(filter, "-created_date", limit).catch(() => []);
        return { data: items, meta: { count: items.length } };
      }

      if (isPlatformPrincipal(principal)) {
        const items = await base44.asServiceRole.entities.Document
          .filter({ source_type: "report" }, "-created_date", limit).catch(() => []);
        return { data: items, meta: { count: items.length } };
      }

      if (!userEmail) {
        // No identity → deny by default (return empty, never list everything).
        return { data: [], meta: { count: 0 } };
      }

      // User-scoped: match created_by OR owner_email.
      const [byCreated, byOwner] = await Promise.all([
        base44.asServiceRole.entities.Document
          .filter({ source_type: "report", created_by: userEmail }, "-created_date", limit)
          .catch(() => []),
        base44.asServiceRole.entities.Document
          .filter({ source_type: "report", owner_email: userEmail }, "-created_date", limit)
          .catch(() => []),
      ]);
      // De-duplicate by id, preserve newest-first ordering.
      const seen = new Set();
      const merged = [];
      for (const doc of [...byCreated, ...byOwner]) {
        if (!doc || seen.has(doc.id)) continue;
        seen.add(doc.id);
        merged.push(doc);
      }
      merged.sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));
      const items = merged.slice(0, limit);
      return { data: items, meta: { count: items.length } };
    },
  },
  "POST /v1/reports": {
    scope: "write:reports",
    handler: async (base44, { body, principal }) => {
      if (!body.title) {
        const e = new Error("title is required"); e.code = "invalid_request"; e.status = 400; throw e;
      }
      // FIX 3 — persist tenant/user ownership on the created report
      const userEmail = principal.user_email || principal.raw?.user_email;
      const orgId = principal.raw?.organization_id;
      const doc = await base44.asServiceRole.entities.Document.create({
        title: body.title,
        source_type: "report",
        organization_id: orgId || undefined,
        owner_email: userEmail || undefined,
        metadata_json: {
          ...(body.metadata || {}),
          content: body.content,
          created_by_principal: principal.name,
          ...(orgId ? { organization_id: orgId } : {}),
          ...(userEmail ? { owner_email: userEmail } : {}),
        },
      });
      return { data: { id: doc.id, title: doc.title, created_at: doc.created_date } };
    },
  },

  // ---------- KPIS ----------
  "GET /v1/kpis": {
    scope: "read:kpis",
    handler: async (base44, { principal }) => {
      // FIX 13 — tenant isolation: org-scoped principals see only their tenant
      const brandFilter = tenantFilter(principal);
      const createdByFilter = tenantFilterByCreatedBy(principal);
      const [brands, analyses, activations] = await Promise.all([
        Object.keys(brandFilter).length
          ? base44.asServiceRole.entities.Brand.filter(brandFilter, "-created_date", 1000)
          : base44.asServiceRole.entities.Brand.list("-created_date", 1000),
        Object.keys(createdByFilter).length
          ? base44.asServiceRole.entities.AnalyzerResult.filter(createdByFilter, "-created_date", 1000)
          : base44.asServiceRole.entities.AnalyzerResult.list("-created_date", 1000),
        (Object.keys(createdByFilter).length
          ? base44.asServiceRole.entities.DealActivation.filter(createdByFilter, "-created_date", 1000)
          : base44.asServiceRole.entities.DealActivation.list("-created_date", 1000)
        ).catch(() => []),
      ]);
      const totalIdentified = analyses.reduce((s, a) => s + (a.total_savings || 0), 0);
      const totalActivated = activations.reduce((s, a) => s + (a.activated_savings_yearly || 0), 0);
      return {
        data: {
          brands_count: brands.length,
          analyses_count: analyses.length,
          activations_count: activations.length,
          total_savings_identified: money(totalIdentified, { period: "yearly", confidence: 0.8, source: "aggregated-analyzer" }),
          total_activated_savings: money(totalActivated, { period: "yearly", confidence: 0.95, source: "verified-deal-activation" }),
        },
        meta: { generated_at: new Date().toISOString() },
      };
    },
  },

  // ---------- USERS ----------
  "GET /v1/users/me": {
    scope: null, // any authenticated principal
    handler: async (_base44, { principal }) => ({
      data: {
        type: principal.type,
        id: principal.id,
        name: principal.name,
        scopes: principal.scopes,
        user_email: principal.user_email || null,
      },
    }),
  },

  // ---------- INTEGRATIONS ----------
  "GET /v1/integrations": {
    scope: "read:integrations",
    handler: async (base44, { principal }) => {
      // FIX 13 — tenant isolation: IntegrationConnection scoped by created_by
      const filter = tenantFilterByCreatedBy(principal);
      const items = Object.keys(filter).length
        ? await base44.asServiceRole.entities.IntegrationConnection.filter(filter, "-created_date", 200)
        : await base44.asServiceRole.entities.IntegrationConnection.list("-created_date", 200);
      return {
        data: items.map((c) => ({
          id: c.id,
          type: c.integration_type,
          name: c.integration_name,
          status: c.status,
          last_sync: c.last_sync,
          data_freshness_hours: c.data_freshness_hours,
        })),
        meta: { count: items.length },
      };
    },
  },

  // ---------- AI ACTIONS ----------
  "POST /v1/ai/summarize-brand": {
    scope: "read:brands",
    handler: async (base44, { body, principal }) => {
      if (!body.brand_id) throw new Error("brand_id is required");
      const [brand, analyses] = await Promise.all([
        base44.asServiceRole.entities.Brand.get(body.brand_id),
        base44.asServiceRole.entities.AnalyzerResult.filter({ brand_id: body.brand_id }, "-created_date", 5),
      ]);
      // FIX 13 — verify the requested brand belongs to the principal's tenant before responding
      assertTenant(principal, brand);
      const latest = analyses[0];
      return {
        data: {
          brand: serializeBrand(brand),
          latest_analysis: latest ? serializeAnalysis(latest) : null,
          summary: latest
            ? `${brand?.name || "Brand"} carries ${money(latest.total_savings).amount} EUR/yr of recoverable margin across payments (${money(latest.payment_savings).amount}), logistics (${money(latest.shipping_savings).amount}) and SaaS (${money(latest.saas_savings).amount}). Infrastructure score: ${latest.infra_score || "n/a"}/100.`
            : "No analysis yet for this brand.",
        },
      };
    },
  },
  "POST /v1/ai/weekly-briefing": {
    scope: "read:kpis",
    handler: async (base44, { body, principal }) => {
      // FIX 13 — when caller passes a brand_id, verify it belongs to the principal's tenant
      if (body?.brand_id) {
        const brand = await base44.asServiceRole.entities.Brand.get(body.brand_id).catch(() => null);
        assertTenant(principal, brand);
      }
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      // FIX 13 — tenant isolation: scope analyses by created_by, brands by organization_id
      const brandFilter = tenantFilter(principal, { created_date: { $gte: since } });
      const createdByFilter = tenantFilterByCreatedBy(principal, { created_date: { $gte: since } });
      const [newAnalyses, newBrands] = await Promise.all([
        base44.asServiceRole.entities.AnalyzerResult.filter(createdByFilter, "-created_date", 200).catch(() => []),
        base44.asServiceRole.entities.Brand.filter(brandFilter, "-created_date", 200).catch(() => []),
      ]);
      const savingsThisWeek = newAnalyses.reduce((s, a) => s + (a.total_savings || 0), 0);
      const briefing = {
        period: "last_7_days",
        new_brands: newBrands.length,
        new_analyses: newAnalyses.length,
        recoverable_margin_identified: money(savingsThisWeek, { period: "weekly", confidence: 0.8, source: "aggregated-analyzer" }),
        top_opportunities: newAnalyses.slice(0, 5).map((a) => ({ brand_id: a.brand_id, total_savings: money(a.total_savings) })),
      };
      // Persist as a report if principal has write:reports
      if (principal.scopes.includes("write:reports") || principal.scopes.includes("admin")) {
        await base44.asServiceRole.entities.Document.create({
          title: `Weekly briefing · ${new Date().toISOString().slice(0, 10)}`,
          source_type: "report",
          metadata_json: { briefing, generated_by: principal.name },
        });
      }
      return { data: briefing };
    },
  },
};

// -----------------------------------------------------------------------------
// Serializers — consistent shape, no internal noise
// -----------------------------------------------------------------------------
function serializeBrand(b) {
  if (!b) return null;
  return {
    id: b.id, name: b.name, category: b.category, country: b.country,
    annual_revenue: b.annual_revenue, sector: b.sector,
    created_at: b.created_date,
  };
}
function serializeAnalysis(a) {
  if (!a) return null;
  return {
    id: a.id, brand_id: a.brand_id, input_id: a.input_id,
    infra_score: a.infra_score,
    total_savings: money(a.total_savings),
    breakdown: {
      payments: { savings: money(a.payment_savings), benchmark: a.payment_benchmark },
      shipping: { savings: money(a.shipping_savings), benchmark: a.shipping_benchmark },
      saas:     { savings: money(a.saas_savings),     benchmark: a.saas_benchmark },
    },
    details: a.details,
    created_at: a.created_date,
  };
}
function serializeTracker(t) {
  if (!t) return null;
  return {
    id: t.id, brand_id: t.brand_id, provider_id: t.provider_id, vertical: t.vertical,
    status: t.status, deal_name: t.deal_name,
    projected_savings_yearly: money(t.projected_savings_annual || t.estimated_savings_yearly),
    realized_savings_yearly: money(t.realized_savings_yearly, { confidence: 0.98, source: "verified" }),
    activated_at: t.activated_at, last_updated: t.last_updated,
  };
}

// -----------------------------------------------------------------------------
// Path matching
// -----------------------------------------------------------------------------
function normalizePath(path) {
  if (!path.startsWith("/v1/") && !path.startsWith("/v1") && path !== "/") {
    // Legacy compat — rewrite /brands → /v1/brands, /analysis/run → /v1/analyses/run, etc.
    const map = {
      "/brands": "/v1/brands", "/analyses": "/v1/analyses", "/kpis": "/v1/kpis",
      "/analysis/run": "/v1/analyses/run", "/reports": "/v1/reports",
    };
    if (map[path]) path = map[path];
    else if (path.startsWith("/brands/")) path = "/v1" + path;
    else if (path.startsWith("/analyses/")) path = "/v1" + path;
    else if (path.startsWith("/trackers/")) path = "/v1" + path;
    else if (!path.startsWith("/v1")) path = "/v1" + path;
  }
  return path.replace(/\/$/, "");
}

function matchRoute(method, path) {
  path = normalizePath(path);
  for (const [pattern, route] of Object.entries(RESOURCES)) {
    const [pMethod, pPath] = pattern.split(" ");
    if (pMethod !== method) continue;
    const pSeg = pPath.split("/"), aSeg = path.split("/");
    if (pSeg.length !== aSeg.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pSeg.length; i++) {
      if (pSeg[i].startsWith(":")) params[pSeg[i].slice(1)] = decodeURIComponent(aSeg[i]);
      else if (pSeg[i] !== aSeg[i]) { match = false; break; }
    }
    if (match) return { route, params };
  }
  return null;
}

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  const startedAt = Date.now();
  const requestId = req.headers.get("x-request-id") || uuid();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const base44 = createClientFromRequest(req);
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const userAgent = req.headers.get("user-agent") || "";

  try {
    // Enforce request size limit
    const cl = parseInt(req.headers.get("content-length") || "0", 10);
    if (cl > MAX_REQUEST_BYTES) {
      return err({ code: "request_too_large", message: "Request body exceeds 256 KB limit", status: 413, requestId });
    }

    // Body parsing — supports both { path, method, body } and direct routing via URL query
    let path, method, body, query = {};
    const idempotencyKey = req.headers.get("idempotency-key") || req.headers.get("Idempotency-Key") || null;
    if (req.method === "POST") {
      const raw = await req.text();
      if (raw.length > MAX_REQUEST_BYTES) {
        return err({ code: "request_too_large", message: "Request body exceeds 256 KB limit", status: 413, requestId });
      }
      const payload = raw ? JSON.parse(raw) : {};
      path = payload.path || "/v1/users/me";
      method = (payload.method || "GET").toUpperCase();
      body = payload.body || {};
      query = payload.query || {};
    } else {
      const url = new URL(req.url);
      path = url.searchParams.get("path") || "/v1/users/me";
      method = (url.searchParams.get("method") || "GET").toUpperCase();
      url.searchParams.forEach((v, k) => { if (k !== "path" && k !== "method") query[k] = v; });
      body = {};
    }

    // Auth
    const authRes = await authenticate(req, base44);
    if (authRes.error) {
      const e = authRes.error;
      await logActivity(base44, { endpoint: path, method, status: "unauthorized", status_code: e.status, ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId, error_message: e.message });
      return err({ code: e.code, message: e.message, status: e.status, requestId });
    }
    const principal = authRes.principal;

    // IP allowlist check (per-key)
    if (!checkIpAllowlist(principal, ip)) {
      await logActivity(base44, { principal, endpoint: path, method, status: "forbidden", status_code: 403, ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId, error_message: "ip_not_allowed" });
      return err({ code: "ip_not_allowed", message: "Request IP is not in the key's allowlist", status: 403, requestId });
    }

    // Rate limit
    const rl = await rateLimit(base44, principal);
    if (!rl.ok) {
      await logActivity(base44, { principal, endpoint: path, method, status: "error", status_code: 429, ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId, error_message: "rate_limited" });
      return err({ code: "rate_limited", message: `Rate limit exceeded (${rl.limit}/min)`, status: 429, requestId });
    }
    const rlHeaders = {
      "X-RateLimit-Limit": String(rl.limit),
      "X-RateLimit-Remaining": String(rl.remaining),
      "X-RateLimit-Reset": rl.reset,
    };

    // Routing
    const matched = matchRoute(method, path);
    if (!matched) {
      await logActivity(base44, { principal, endpoint: path, method, status: "not_found", status_code: 404, ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId });
      return envelope({ error: { code: "not_found", message: `No route for ${method} ${path}` }, requestId, status: 404, extraHeaders: rlHeaders });
    }

    // Scope check
    if (!hasScope(principal, matched.route.scope)) {
      await logActivity(base44, { principal, endpoint: path, method, scope: matched.route.scope, status: "forbidden", status_code: 403, ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId, error_message: "missing_scope" });
      return envelope({ error: { code: "forbidden", message: `Missing scope: ${matched.route.scope}` }, requestId, status: 403, extraHeaders: rlHeaders });
    }

    // Idempotency check — replay cached response for repeated POST/PATCH within 24h
    if (idempotencyKey && (method === "POST" || method === "PATCH")) {
      const requestHash = await sha256Hex(`${method}:${path}:${JSON.stringify(body || {})}`);
      const cached = await base44.asServiceRole.entities.IdempotencyKey.filter({
        key: idempotencyKey, principal_id: principal.id,
      }).catch(() => []);
      const existing = cached?.[0];
      if (existing) {
        if (existing.request_hash !== requestHash) {
          return err({ code: "idempotency_conflict", message: "Idempotency-Key already used with a different request body", status: 409, requestId });
        }
        if (existing.expires_at && new Date(existing.expires_at) > new Date()) {
          await logActivity(base44, { principal, endpoint: path, method, scope: matched.route.scope, status: "success", status_code: 200, ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId, payload_summary: { replayed: true } });
          return envelope({ data: existing.response_body?.data, meta: { ...(existing.response_body?.meta || {}), replayed: true }, requestId, status: existing.response_status || 200, extraHeaders: { ...rlHeaders, "Idempotency-Replayed": "true" } });
        }
      }
      // Execute then cache
      const result = await matched.route.handler(base44, { params: matched.params, query, body, principal });
      const responsePayload = { data: result.data, meta: result.meta || {} };
      await base44.asServiceRole.entities.IdempotencyKey.create({
        key: idempotencyKey,
        principal_id: principal.id,
        endpoint: path,
        method,
        request_hash: requestHash,
        response_status: 200,
        response_body: responsePayload,
        expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000).toISOString(),
      }).catch(() => null);
      await trackUsage(base44, principal);
      await logActivity(base44, {
        principal, endpoint: path, method, scope: matched.route.scope, status: "success", status_code: 200,
        ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId,
        payload_summary: { params: matched.params, idempotency_key: idempotencyKey },
      });
      return envelope({ data: result.data, meta: result.meta || {}, requestId, status: 200, extraHeaders: rlHeaders });
    }

    // Execute (non-idempotent path)
    const result = await matched.route.handler(base44, { params: matched.params, query, body, principal });
    await trackUsage(base44, principal);
    await logActivity(base44, {
      principal, endpoint: path, method, scope: matched.route.scope, status: "success", status_code: 200,
      ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId,
      payload_summary: { params: matched.params },
    });
    return envelope({ data: result.data, meta: result.meta || {}, requestId, status: 200, extraHeaders: rlHeaders });
  } catch (e) {
    const status = e.status || 500;
    const code = e.code || "internal_error";
    // Never leak internal stack traces in 5xx responses
    const message = status >= 500 ? "An internal error occurred. Reference the request_id when contacting support." : e.message;
    await logActivity(base44, { endpoint: "error", method: req.method, status: "error", status_code: status, ip, user_agent: userAgent, duration_ms: Date.now() - startedAt, request_id: requestId, error_message: e.message });
    return err({ code, message, status, requestId });
  }
});
