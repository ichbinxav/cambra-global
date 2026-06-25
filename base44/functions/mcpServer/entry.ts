// =============================================================================
// CAMBRA MCP Server — Production-grade Model Context Protocol implementation.
// Spec: https://modelcontextprotocol.io/specification (2024-11-05)
//
// Transport: HTTP (single endpoint, JSON-RPC 2.0 over POST).
// Auth:      Authorization: Bearer <cmb_live_…> (API key) OR <cmb_at_…> (OAuth token)
// Endpoint:  https://<app-host>/functions/mcpServer
//
// Supports:
//   - initialize / initialized
//   - tools/list, tools/call
//   - resources/list, resources/read
//   - prompts/list, prompts/get
//   - ping
//
// Reuses the same auth, IP allowlist, rate-limit, usage tracking and audit log
// as the REST router (/functions/apiV1), so a single API key works for both.
// =============================================================================
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "cambra-mcp", version: "1.1.0" };

// -----------------------------------------------------------------------------
// Crypto + CORS
// -----------------------------------------------------------------------------
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: "2.0", id, error: err };
}
function jsonResp(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

// -----------------------------------------------------------------------------
// Money envelope — every figure carries its provenance + confidence
// -----------------------------------------------------------------------------
function money(amount, { period = "yearly", confidence = 0.85, source = "cambra-analyzer", currency = "EUR", assumptions = [] } = {}) {
  return {
    amount: typeof amount === "number" ? Math.round(amount * 100) / 100 : null,
    currency, period, confidence, assumptions: Array.isArray(assumptions) ? assumptions : [], source,
  };
}

// Tenant isolation helpers — identical semantics to apiV1
function tenantFilter(principal, extra = {}) {
  const orgId = principal.raw?.organization_id;
  return orgId ? { ...extra, organization_id: orgId } : extra;
}
function assertTenant(principal, resource) {
  const orgId = principal.raw?.organization_id;
  if (!orgId || !resource) return resource;
  if (resource.organization_id && resource.organization_id !== orgId) {
    const e = new Error("not_found"); e.code = "not_found"; throw e;
  }
  return resource;
}

// -----------------------------------------------------------------------------
// Auth — accepts both API keys (cmb_live_) and OAuth tokens (cmb_at_)
// -----------------------------------------------------------------------------
async function authenticate(req, base44) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return { error: { code: -32001, message: "Missing Authorization: Bearer <token>", status: 401 } };
  const token = authHeader.slice(7).trim();
  if (!token) return { error: { code: -32001, message: "Empty bearer token", status: 401 } };
  const hash = await sha256Hex(token);

  if (token.startsWith("cmb_at_")) {
    const matches = await base44.asServiceRole.entities.OAuthToken.filter({ access_token_hash: hash });
    const tok = matches?.[0];
    if (!tok || tok.status !== "active") return { error: { code: -32002, message: "Invalid or revoked OAuth token", status: 401 } };
    if (tok.access_token_expires_at && new Date(tok.access_token_expires_at) < new Date()) {
      return { error: { code: -32002, message: "OAuth access token expired — refresh required", status: 401 } };
    }
    return { principal: { type: "oauth_token", id: tok.id, name: `OAuth · ${tok.user_email}`, scopes: tok.scopes || [], user_email: tok.user_email, raw: tok } };
  }

  const matches = await base44.asServiceRole.entities.ApiKey.filter({ key_hash: hash });
  const apiKey = matches?.[0];
  if (!apiKey || apiKey.status !== "active") return { error: { code: -32002, message: "Invalid or revoked API key", status: 401 } };
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return { error: { code: -32002, message: "API key expired", status: 401 } };
  }
  return { principal: { type: "api_key", id: apiKey.id, name: apiKey.name, scopes: apiKey.scopes || [], raw: apiKey } };
}

function hasScope(principal, required) {
  if (!required) return true;
  const scopes = principal.scopes || [];
  if (scopes.includes("admin")) return true;
  if (scopes.includes(required)) return true;
  const [verb] = required.split(":");
  if (scopes.includes(verb)) return true;
  return false;
}

// IP allowlist (shared logic with apiV1)
function ipMatches(ip, allowed) {
  if (!ip) return false;
  if (allowed === ip) return true;
  if (allowed.endsWith("/24")) return ip.split(".").slice(0, 3).join(".") === allowed.slice(0, -3).split(".").slice(0, 3).join(".");
  if (allowed.endsWith("/16")) return ip.split(".").slice(0, 2).join(".") === allowed.slice(0, -3).split(".").slice(0, 2).join(".");
  return false;
}
function checkIpAllowlist(principal, ip) {
  const list = principal.raw?.ip_allowlist;
  if (!list || list.length === 0) return true;
  return list.some((entry) => ipMatches(ip, entry));
}

// Rate limit — shared counter table with REST
async function rateLimit(base44, principal) {
  const limit = principal.raw?.rate_limit_per_minute || 120;
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString();
  const matches = await base44.asServiceRole.entities.RateLimitCounter.filter({ principal_id: principal.id, window_start: windowStart });
  let counter = matches?.[0];
  if (!counter) {
    await base44.asServiceRole.entities.RateLimitCounter.create({
      principal_id: principal.id, principal_type: principal.type, window_start: windowStart, count: 1, limit_per_minute: limit,
    });
    return { ok: true, limit, remaining: limit - 1 };
  }
  if ((counter.count || 0) >= limit) return { ok: false, limit, remaining: 0 };
  await base44.asServiceRole.entities.RateLimitCounter.update(counter.id, { count: (counter.count || 0) + 1 });
  return { ok: true, limit, remaining: limit - (counter.count || 0) - 1 };
}

// Usage tracking for billing
async function trackUsage(base44, principal) {
  const orgId = principal.raw?.organization_id;
  if (!orgId) return;
  const periodMonth = new Date().toISOString().slice(0, 7);
  const matches = await base44.asServiceRole.entities.ApiUsageRecord.filter({ organization_id: orgId, period_month: periodMonth });
  const record = matches?.[0];
  if (!record) {
    const org = await base44.asServiceRole.entities.Organization.get(orgId).catch(() => null);
    await base44.asServiceRole.entities.ApiUsageRecord.create({
      organization_id: orgId, period_month: periodMonth, request_count: 1,
      included_quota: org?.monthly_api_quota || 10000, overage_count: 0, overage_amount_eur: 0,
      last_updated_at: new Date().toISOString(),
    });
  } else {
    const newCount = (record.request_count || 0) + 1;
    const quota = record.included_quota || 10000;
    const overage = Math.max(0, newCount - quota);
    const org = await base44.asServiceRole.entities.Organization.get(orgId).catch(() => null);
    const overagePrice = (org?.overage_price_per_1k || 0.5) * (overage / 1000);
    await base44.asServiceRole.entities.ApiUsageRecord.update(record.id, {
      request_count: newCount, overage_count: overage,
      overage_amount_eur: Math.round(overagePrice * 100) / 100,
      last_updated_at: new Date().toISOString(),
    });
  }
}

// Audit log
async function logCall(base44, ctx) {
  try {
    await base44.asServiceRole.entities.ApiActivityLog.create({
      api_key_id: ctx.principal?.id,
      api_key_name: ctx.principal?.name,
      key_prefix: ctx.principal?.raw?.key_prefix,
      tool_name: "claude-mcp",
      endpoint: `mcp:${ctx.toolName || ctx.rpcMethod || "unknown"}`,
      method: "POST",
      scope_used: ctx.scope,
      status_code: ctx.statusCode,
      status: ctx.status,
      ip_address: ctx.ip,
      user_agent: ctx.userAgent,
      duration_ms: ctx.duration_ms,
      error_message: ctx.error,
      request_id: crypto.randomUUID(),
    });
  } catch (_) { /* logging never blocks */ }
}

// -----------------------------------------------------------------------------
// Serializers
// -----------------------------------------------------------------------------
function serializeBrand(b) {
  if (!b) return null;
  return { id: b.id, name: b.name, category: b.category, country: b.country, annual_revenue: b.annual_revenue, sector: b.sector, created_at: b.created_date };
}
function serializeAnalysis(a) {
  if (!a) return null;
  return {
    id: a.id, brand_id: a.brand_id, infra_score: a.infra_score,
    total_savings: money(a.total_savings),
    breakdown: {
      payments: { savings: money(a.payment_savings), benchmark: a.payment_benchmark },
      shipping: { savings: money(a.shipping_savings), benchmark: a.shipping_benchmark },
      saas:     { savings: money(a.saas_savings),     benchmark: a.saas_benchmark },
    },
    details: a.details, created_at: a.created_date,
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
// TOOLS — complete CAMBRA surface area exposed to AI assistants
// -----------------------------------------------------------------------------
const TOOLS = [
  // -------- BRANDS --------
  {
    name: "list_brands",
    description: "List CAMBRA brands. Returns id, name, category, country, annual_revenue, sector.",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 50, description: "Max results, up to 200" } } },
    scope: "read:brands",
    handler: async (base44, args, principal) => {
      const limit = Math.min(args.limit || 50, 200);
      const filter = tenantFilter(principal);
      const items = Object.keys(filter).length
        ? await base44.asServiceRole.entities.Brand.filter(filter, "-created_date", limit)
        : await base44.asServiceRole.entities.Brand.list("-created_date", limit);
      return { brands: items.map(serializeBrand), count: items.length };
    },
  },
  {
    name: "get_brand",
    description: "Get a brand by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    scope: "read:brands",
    handler: async (base44, args, principal) => serializeBrand(assertTenant(principal, await base44.asServiceRole.entities.Brand.get(args.id))),
  },
  {
    name: "summarize_brand",
    description: "AI summary of a brand: latest infrastructure analysis, recoverable margin across payments / logistics / SaaS, and infrastructure score.",
    inputSchema: { type: "object", properties: { brand_id: { type: "string" } }, required: ["brand_id"] },
    scope: "read:brands",
    handler: async (base44, args) => {
      const [brand, analyses] = await Promise.all([
        base44.asServiceRole.entities.Brand.get(args.brand_id),
        base44.asServiceRole.entities.AnalyzerResult.filter({ brand_id: args.brand_id }, "-created_date", 5),
      ]);
      const latest = analyses[0];
      return {
        brand: serializeBrand(brand),
        latest_analysis: latest ? serializeAnalysis(latest) : null,
        summary: latest
          ? `${brand?.name || "Brand"} carries €${money(latest.total_savings).amount}/yr of recoverable margin across payments (€${money(latest.payment_savings).amount}), logistics (€${money(latest.shipping_savings).amount}) and SaaS (€${money(latest.saas_savings).amount}). Infrastructure score: ${latest.infra_score || "n/a"}/100.`
          : "No analysis yet for this brand.",
      };
    },
  },

  // -------- ANALYSES --------
  {
    name: "list_analyses",
    description: "List the latest infrastructure analyses with savings breakdown.",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 50 }, brand_id: { type: "string" } } },
    scope: "read:analyses",
    handler: async (base44, args) => {
      const limit = Math.min(args.limit || 50, 200);
      const items = args.brand_id
        ? await base44.asServiceRole.entities.AnalyzerResult.filter({ brand_id: args.brand_id }, "-created_date", limit)
        : await base44.asServiceRole.entities.AnalyzerResult.list("-created_date", limit);
      return { analyses: items.map(serializeAnalysis), count: items.length };
    },
  },
  {
    name: "get_analysis",
    description: "Get one analysis by id (includes infra score, payment/shipping/SaaS breakdown).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    scope: "read:analyses",
    handler: async (base44, args) => serializeAnalysis(await base44.asServiceRole.entities.AnalyzerResult.get(args.id)),
  },
  {
    name: "trigger_analysis",
    description: "Trigger a fresh analyzer run for a brand.",
    inputSchema: {
      type: "object",
      properties: {
        brand_id: { type: "string" },
        monthly_revenue: { type: "number" },
        monthly_transactions: { type: "number" },
        avg_order_value: { type: "number" },
        payment_fee_pct: { type: "number" },
        monthly_shipping_cost: { type: "number" },
        monthly_shipments: { type: "number" },
        total_saas_spend: { type: "number" },
      },
      required: ["brand_id"],
    },
    scope: "trigger:analysis",
    handler: async (base44, args) => {
      const input = await base44.asServiceRole.entities.AnalyzerInput.create({ ...args });
      return { triggered: true, input_id: input.id, brand_id: args.brand_id, status: "queued" };
    },
  },

  // -------- SAVINGS --------
  {
    name: "list_savings",
    description: "List per-brand savings (monthly / yearly current vs optimized cost).",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 50 }, brand_id: { type: "string" } } },
    scope: "read:savings",
    handler: async (base44, args) => {
      const limit = Math.min(args.limit || 50, 200);
      const items = args.brand_id
        ? await base44.asServiceRole.entities.BrandSavings.filter({ brand_id: args.brand_id }, "-computed_at", limit)
        : await base44.asServiceRole.entities.BrandSavings.list("-computed_at", limit);
      return {
        savings: items.map((s) => ({
          id: s.id, brand_id: s.brand_id,
          monthly: money(s.estimated_savings_monthly, { period: "monthly" }),
          yearly: money(s.estimated_savings_yearly, { period: "yearly" }),
          current_cost_monthly: money(s.estimated_current_cost_monthly, { period: "monthly" }),
          optimized_cost_monthly: money(s.estimated_optimized_cost_monthly, { period: "monthly" }),
          computed_at: s.computed_at,
        })),
        count: items.length,
      };
    },
  },

  // -------- TRACKERS (DealActivation) --------
  {
    name: "list_trackers",
    description: "List deal activation trackers (projected vs realized savings, status).",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 50 }, brand_id: { type: "string" } } },
    scope: "read:trackers",
    handler: async (base44, args) => {
      const limit = Math.min(args.limit || 50, 200);
      const items = args.brand_id
        ? await base44.asServiceRole.entities.DealActivation.filter({ brand_id: args.brand_id }, "-created_date", limit)
        : await base44.asServiceRole.entities.DealActivation.list("-created_date", limit);
      return { trackers: items.map(serializeTracker), count: items.length };
    },
  },
  {
    name: "update_tracker",
    description: "Update a deal activation tracker (status, realized savings).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string" },
        realized_savings_monthly: { type: "number" },
        realized_savings_yearly: { type: "number" },
        activated_savings_yearly: { type: "number" },
      },
      required: ["id"],
    },
    scope: "update:trackers",
    handler: async (base44, args) => {
      const allowed = ["status", "realized_savings_monthly", "realized_savings_yearly", "activated_savings_yearly"];
      const updates = { last_updated: new Date().toISOString() };
      for (const k of allowed) if (args[k] !== undefined) updates[k] = args[k];
      return serializeTracker(await base44.asServiceRole.entities.DealActivation.update(args.id, updates));
    },
  },

  // -------- PROVIDERS --------
  {
    name: "list_providers",
    description: "List provider partners (payment, shipping, SaaS).",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 50 } } },
    scope: "read:providers",
    handler: async (base44, args) => {
      const items = await base44.asServiceRole.entities.Provider.list("-created_date", Math.min(args.limit || 50, 200));
      return { providers: items, count: items.length };
    },
  },

  // -------- DOCUMENTS --------
  {
    name: "list_documents",
    description: "List uploaded documents (invoices, statements, contracts).",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 50 } } },
    scope: "read:documents",
    handler: async (base44, args) => {
      const items = await base44.asServiceRole.entities.Document.list("-created_date", Math.min(args.limit || 50, 200));
      return { documents: items, count: items.length };
    },
  },

  // -------- REPORTS --------
  {
    name: "create_report",
    description: "Create a report in CAMBRA (a Document marked as report).",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, content: { type: "string" }, metadata: { type: "object" } },
      required: ["title"],
    },
    scope: "write:reports",
    handler: async (base44, args, principal) => {
      const doc = await base44.asServiceRole.entities.Document.create({
        title: args.title, source_type: "report",
        metadata_json: { ...(args.metadata || {}), content: args.content || "", created_by_principal: principal.name },
      });
      return { id: doc.id, title: doc.title, created_at: doc.created_date };
    },
  },

  // -------- KPIS / BRIEFING --------
  {
    name: "get_platform_kpis",
    description: "Aggregated platform KPIs: brands, analyses, activations, total identified savings, total activated savings.",
    inputSchema: { type: "object", properties: {} },
    scope: "read:kpis",
    handler: async (base44) => {
      const [brands, analyses, activations] = await Promise.all([
        base44.asServiceRole.entities.Brand.list("-created_date", 1000),
        base44.asServiceRole.entities.AnalyzerResult.list("-created_date", 1000),
        base44.asServiceRole.entities.DealActivation.list("-created_date", 1000).catch(() => []),
      ]);
      return {
        brands_count: brands.length,
        analyses_count: analyses.length,
        activations_count: activations.length,
        total_savings_identified: money(analyses.reduce((s, a) => s + (a.total_savings || 0), 0), { period: "yearly", confidence: 0.8 }),
        total_activated_savings: money(activations.reduce((s, a) => s + (a.activated_savings_yearly || 0), 0), { period: "yearly", confidence: 0.95, source: "verified-deal-activation" }),
        generated_at: new Date().toISOString(),
      };
    },
  },
  {
    name: "weekly_briefing",
    description: "Generate an executive briefing for the last 7 days: new brands, new analyses, top recoverable margin opportunities.",
    inputSchema: { type: "object", properties: {} },
    scope: "read:kpis",
    handler: async (base44, _args, principal) => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [newAnalyses, newBrands] = await Promise.all([
        base44.asServiceRole.entities.AnalyzerResult.filter({ created_date: { $gte: since } }, "-created_date", 200).catch(() => []),
        base44.asServiceRole.entities.Brand.filter({ created_date: { $gte: since } }, "-created_date", 200).catch(() => []),
      ]);
      const total = newAnalyses.reduce((s, a) => s + (a.total_savings || 0), 0);
      const briefing = {
        period: "last_7_days",
        new_brands: newBrands.length,
        new_analyses: newAnalyses.length,
        recoverable_margin_identified: money(total, { period: "weekly", confidence: 0.8 }),
        top_opportunities: newAnalyses.slice(0, 5).map((a) => ({ brand_id: a.brand_id, total_savings: money(a.total_savings) })),
      };
      if (principal.scopes.includes("write:reports") || principal.scopes.includes("admin")) {
        await base44.asServiceRole.entities.Document.create({
          title: `Weekly briefing · ${new Date().toISOString().slice(0, 10)}`,
          source_type: "report",
          metadata_json: { briefing, generated_by: principal.name },
        });
      }
      return briefing;
    },
  },

  // -------- INTEGRATIONS --------
  {
    name: "list_integrations",
    description: "List third-party integrations connected to CAMBRA (Stripe, Shopify, carriers…).",
    inputSchema: { type: "object", properties: {} },
    scope: "read:integrations",
    handler: async (base44) => {
      const items = await base44.asServiceRole.entities.IntegrationConnection.list("-created_date", 200);
      return {
        integrations: items.map((c) => ({ id: c.id, type: c.integration_type, name: c.integration_name, status: c.status, last_sync: c.last_sync, data_freshness_hours: c.data_freshness_hours })),
        count: items.length,
      };
    },
  },
];

// -----------------------------------------------------------------------------
// RESOURCES — addressable read-only context an AI can pull
// -----------------------------------------------------------------------------
const RESOURCES = [
  { uri: "cambra://kpis/platform",    name: "Platform KPIs",    description: "Live platform-wide KPIs", mimeType: "application/json", scope: "read:kpis" },
  { uri: "cambra://briefing/weekly",  name: "Weekly Briefing",  description: "Executive briefing for the last 7 days", mimeType: "application/json", scope: "read:kpis" },
];

async function readResource(base44, uri, principal) {
  if (uri === "cambra://kpis/platform") {
    return await TOOLS.find((t) => t.name === "get_platform_kpis").handler(base44);
  }
  if (uri === "cambra://briefing/weekly") {
    return await TOOLS.find((t) => t.name === "weekly_briefing").handler(base44, {}, principal);
  }
  throw new Error(`Unknown resource: ${uri}`);
}

// -----------------------------------------------------------------------------
// PROMPTS — reusable instructions Claude can surface to the user
// -----------------------------------------------------------------------------
const PROMPTS = [
  {
    name: "audit_brand",
    description: "Run a complete infrastructure audit on a brand and produce an executive summary with recoverable margin.",
    arguments: [{ name: "brand_id", description: "CAMBRA brand id", required: true }],
  },
  {
    name: "weekly_review",
    description: "Generate this week's executive briefing covering new brands, analyses and top opportunities.",
    arguments: [],
  },
];

function getPrompt(name, args) {
  if (name === "audit_brand") {
    return {
      description: "Audit a brand's infrastructure stack.",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Use the CAMBRA tools to: (1) call summarize_brand with brand_id="${args?.brand_id || "<MISSING>"}", (2) call list_analyses to find the latest analysis, (3) call list_savings, (4) produce a 5-bullet executive summary with the total recoverable margin in EUR/year, the breakdown across Payments / Logistics / SaaS, the infrastructure score, and 3 concrete next actions.`,
          },
        },
      ],
    };
  }
  if (name === "weekly_review") {
    return {
      description: "This week in CAMBRA.",
      messages: [
        { role: "user", content: { type: "text", text: "Call weekly_briefing, then summarize as a 3-paragraph executive note for leadership: trend vs last week, top 3 opportunities by recoverable margin, recommended actions." } },
      ],
    };
  }
  throw new Error(`Unknown prompt: ${name}`);
}

// -----------------------------------------------------------------------------
// MAIN HANDLER
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  const startedAt = Date.now();

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  // GET → health check / discovery
  if (req.method === "GET") {
    return jsonResp({
      server: SERVER_INFO,
      protocol: PROTOCOL_VERSION,
      transport: "http",
      authentication: "Bearer token (CAMBRA API key or OAuth access token)",
      endpoint: new URL(req.url).origin + new URL(req.url).pathname,
      tools_count: TOOLS.length,
      docs: "https://cambra.global/Developers",
      status: "ok",
    });
  }

  if (req.method !== "POST") {
    return jsonResp(rpcError(null, -32600, "Only POST and GET are supported"), 405);
  }

  const base44 = createClientFromRequest(req);
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const userAgent = req.headers.get("user-agent") || "claude-mcp";

  // Enforce request size limit
  const cl = parseInt(req.headers.get("content-length") || "0", 10);
  if (cl > 256 * 1024) return jsonResp(rpcError(null, -32600, "Request too large (max 256 KB)"), 413);

  // Parse JSON-RPC body — support both single objects and batched arrays
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 256 * 1024) return jsonResp(rpcError(null, -32600, "Request too large (max 256 KB)"), 413);
    body = JSON.parse(raw);
  } catch { return jsonResp(rpcError(null, -32700, "Parse error"), 400); }
  const isBatch = Array.isArray(body);
  const requests = isBatch ? body : [body];

  const responses = [];
  for (const request of requests) {
    const { id, method, params = {} } = request || {};

    // Unauthenticated methods: initialize, initialized, ping
    if (method === "initialize") {
      responses.push(rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false, subscribe: false },
          prompts: { listChanged: false },
        },
        serverInfo: SERVER_INFO,
        instructions: "CAMBRA exposes brands, infrastructure analyses, savings, trackers, integrations and executive briefings. Call tools/list to discover available actions. Use the `audit_brand` prompt for end-to-end brand reviews.",
      }));
      continue;
    }
    if (method === "notifications/initialized" || method === "initialized") {
      // Notification — no response
      continue;
    }
    if (method === "ping") {
      responses.push(rpcResult(id, {}));
      continue;
    }

    // tools/list, resources/list, prompts/list are public discovery — no auth required.
    // Claude calls these on connect, before sending the bearer token.
    if (method === "tools/list") {
      responses.push(rpcResult(id, { tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) }));
      continue;
    }
    if (method === "resources/list") {
      responses.push(rpcResult(id, { resources: RESOURCES.map((r) => ({ uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType })) }));
      continue;
    }
    if (method === "prompts/list") {
      responses.push(rpcResult(id, { prompts: PROMPTS }));
      continue;
    }

    // All other methods require auth
    const authRes = await authenticate(req, base44);
    if (authRes.error) {
      await logCall(base44, { rpcMethod: method, status: "unauthorized", statusCode: authRes.error.status, ip, userAgent, duration_ms: Date.now() - startedAt, error: authRes.error.message });
      responses.push(rpcError(id, authRes.error.code, authRes.error.message));
      continue;
    }
    const principal = authRes.principal;

    // IP allowlist
    if (!checkIpAllowlist(principal, ip)) {
      await logCall(base44, { principal, rpcMethod: method, status: "forbidden", statusCode: 403, ip, userAgent, duration_ms: Date.now() - startedAt, error: "ip_not_allowed" });
      responses.push(rpcError(id, -32003, "Request IP is not in the key's allowlist"));
      continue;
    }

    // Rate limit
    const rl = await rateLimit(base44, principal);
    if (!rl.ok) {
      await logCall(base44, { principal, rpcMethod: method, status: "error", statusCode: 429, ip, userAgent, duration_ms: Date.now() - startedAt, error: "rate_limited" });
      responses.push(rpcError(id, -32005, `Rate limit exceeded (${rl.limit}/min)`));
      continue;
    }

    try {
      if (method === "tools/call") {
        const { name, arguments: args = {} } = params;
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
          await logCall(base44, { principal, toolName: name, status: "not_found", statusCode: 404, ip, userAgent, duration_ms: Date.now() - startedAt });
          responses.push(rpcError(id, -32601, `Unknown tool: ${name}`));
          continue;
        }
        if (!hasScope(principal, tool.scope)) {
          await logCall(base44, { principal, toolName: name, scope: tool.scope, status: "forbidden", statusCode: 403, ip, userAgent, duration_ms: Date.now() - startedAt, error: "missing_scope" });
          responses.push(rpcError(id, -32004, `Missing scope: ${tool.scope}`));
          continue;
        }
        const data = await tool.handler(base44, args, principal);
        await trackUsage(base44, principal);
        await logCall(base44, { principal, toolName: name, scope: tool.scope, status: "success", statusCode: 200, ip, userAgent, duration_ms: Date.now() - startedAt });
        responses.push(rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          isError: false,
        }));
        continue;
      }

      if (method === "resources/read") {
        const { uri } = params;
        const resource = RESOURCES.find((r) => r.uri === uri);
        if (!resource) { responses.push(rpcError(id, -32601, `Unknown resource: ${uri}`)); continue; }
        if (!hasScope(principal, resource.scope)) {
          responses.push(rpcError(id, -32004, `Missing scope: ${resource.scope}`));
          continue;
        }
        const data = await readResource(base44, uri, principal);
        await trackUsage(base44, principal);
        await logCall(base44, { principal, toolName: `resource:${uri}`, scope: resource.scope, status: "success", statusCode: 200, ip, userAgent, duration_ms: Date.now() - startedAt });
        responses.push(rpcResult(id, { contents: [{ uri, mimeType: resource.mimeType, text: JSON.stringify(data, null, 2) }] }));
        continue;
      }

      if (method === "prompts/get") {
        const { name, arguments: args } = params;
        responses.push(rpcResult(id, getPrompt(name, args)));
        continue;
      }

      responses.push(rpcError(id, -32601, `Method not found: ${method}`));
    } catch (e) {
      await logCall(base44, { principal, rpcMethod: method, status: "error", statusCode: 500, ip, userAgent, duration_ms: Date.now() - startedAt, error: e.message });
      responses.push(rpcError(id, -32000, e.message));
    }
  }

  // Strip notifications (no id, no response)
  const out = responses.filter((r) => r !== undefined && r !== null);
  if (out.length === 0) return new Response(null, { status: 204, headers: CORS_HEADERS });
  return jsonResp(isBatch ? out : out[0]);
});