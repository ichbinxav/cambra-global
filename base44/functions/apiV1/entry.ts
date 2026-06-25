// CAMBRA External API v1
// Auth: Authorization: Bearer <api_key>
// All requests are scope-checked and logged to ApiActivityLog.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const ROUTES = [
  { method: "GET",   path: /^\/brands$/,                 scope: "read:brands",      handler: "listBrands" },
  { method: "GET",   path: /^\/brands\/([^/]+)$/,        scope: "read:brands",      handler: "getBrand" },
  { method: "GET",   path: /^\/analyses$/,               scope: "read:analyses",    handler: "listAnalyses" },
  { method: "GET",   path: /^\/analyses\/([^/]+)$/,      scope: "read:analyses",    handler: "getAnalysis" },
  { method: "GET",   path: /^\/kpis$/,                   scope: "read:kpis",        handler: "getKpis" },
  { method: "POST",  path: /^\/reports$/,                scope: "write:reports",    handler: "createReport" },
  { method: "POST",  path: /^\/analysis\/run$/,          scope: "trigger:analysis", handler: "runAnalysis" },
  { method: "PATCH", path: /^\/trackers\/([^/]+)$/,      scope: "update:trackers",  handler: "updateTracker" },
];

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const userAgent = req.headers.get("user-agent") || "";

  // Allow path via ?path= or trailing path after function root
  const rawPath = url.searchParams.get("path") || "/";
  const path = rawPath.startsWith("/") ? rawPath : "/" + rawPath;
  const method = (url.searchParams.get("method") || req.method || "GET").toUpperCase();

  // Base44 client + service role for data access (after auth check)
  const base44 = createClientFromRequest(req);

  // Parse body
  let body = {};
  if (method === "POST" || method === "PATCH" || method === "PUT") {
    try { body = await req.json(); } catch (_) { body = {}; }
  }

  async function logRequest({ apiKey, endpoint, scope, statusCode, status, error }) {
    try {
      await base44.asServiceRole.entities.ApiActivityLog.create({
        api_key_id: apiKey?.id,
        api_key_name: apiKey?.name,
        key_prefix: apiKey?.key_prefix,
        tool_name: apiKey?.tool_name,
        endpoint,
        method,
        scope_used: scope,
        status_code: statusCode,
        status,
        ip_address: ip,
        user_agent: userAgent,
        duration_ms: Date.now() - startedAt,
        request_id: crypto.randomUUID(),
        error_message: error,
      });
      if (apiKey?.id) {
        await base44.asServiceRole.entities.ApiKey.update(apiKey.id, {
          last_used_at: new Date().toISOString(),
          last_used_ip: ip,
          usage_count: (apiKey.usage_count || 0) + 1,
        });
      }
    } catch (_) { /* logging never blocks response */ }
  }

  const endpoint = `${method} ${path}`;

  try {
    // ---- AUTH ----
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    const tokenFromHeader = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    const token = tokenFromHeader || req.headers.get("x-api-key") || "";
    if (!token) {
      await logRequest({ endpoint, statusCode: 401, status: "unauthorized", error: "Missing API key" });
      return Response.json({ error: "Missing API key. Use Authorization: Bearer <key>" }, { status: 401 });
    }

    const hash = await sha256Hex(token);
    const matches = await base44.asServiceRole.entities.ApiKey.filter({ key_hash: hash });
    const apiKey = matches?.[0];
    if (!apiKey) {
      await logRequest({ endpoint, statusCode: 401, status: "unauthorized", error: "Invalid API key" });
      return Response.json({ error: "Invalid API key" }, { status: 401 });
    }
    if (apiKey.status !== "active") {
      await logRequest({ apiKey, endpoint, statusCode: 401, status: "unauthorized", error: "Key revoked" });
      return Response.json({ error: "API key revoked" }, { status: 401 });
    }
    if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
      await logRequest({ apiKey, endpoint, statusCode: 401, status: "unauthorized", error: "Key expired" });
      return Response.json({ error: "API key expired" }, { status: 401 });
    }

    // ---- ROUTE MATCH ----
    const route = ROUTES.find(r => r.method === method && r.path.test(path));
    if (!route) {
      await logRequest({ apiKey, endpoint, statusCode: 404, status: "not_found" });
      return Response.json({ error: "Endpoint not found", endpoint }, { status: 404 });
    }

    // ---- SCOPE CHECK ----
    if (!apiKey.scopes?.includes(route.scope)) {
      await logRequest({ apiKey, endpoint, scope: route.scope, statusCode: 403, status: "forbidden", error: `Missing scope ${route.scope}` });
      return Response.json({ error: `Missing required scope: ${route.scope}` }, { status: 403 });
    }

    const params = path.match(route.path);
    const id = params?.[1];

    // ---- HANDLERS ----
    let response;
    switch (route.handler) {
      case "listBrands": {
        const items = await base44.asServiceRole.entities.Brand.list("-created_date", 100);
        response = { items: items.map(b => ({ id: b.id, name: b.name, category: b.category, country: b.country, annual_revenue: b.annual_revenue })) };
        break;
      }
      case "getBrand": {
        const b = await base44.asServiceRole.entities.Brand.get(id);
        if (!b) { await logRequest({ apiKey, endpoint, scope: route.scope, statusCode: 404, status: "not_found" }); return Response.json({ error: "Brand not found" }, { status: 404 }); }
        response = b;
        break;
      }
      case "listAnalyses": {
        const items = await base44.asServiceRole.entities.AnalyzerResult.list("-created_date", 100);
        response = { items };
        break;
      }
      case "getAnalysis": {
        const a = await base44.asServiceRole.entities.AnalyzerResult.get(id);
        if (!a) { await logRequest({ apiKey, endpoint, scope: route.scope, statusCode: 404, status: "not_found" }); return Response.json({ error: "Analysis not found" }, { status: 404 }); }
        response = a;
        break;
      }
      case "getKpis": {
        // Aggregated platform KPIs (lightweight)
        const [brands, analyses, activations] = await Promise.all([
          base44.asServiceRole.entities.Brand.list("-created_date", 1000),
          base44.asServiceRole.entities.AnalyzerResult.list("-created_date", 1000),
          base44.asServiceRole.entities.DealActivation.list("-created_date", 1000).catch(() => []),
        ]);
        const totalSavingsIdentified = analyses.reduce((s, a) => s + (a.total_savings || 0), 0);
        const totalActivatedSavings = activations.reduce((s, a) => s + (a.activated_savings_yearly || 0), 0);
        response = {
          brands_count: brands.length,
          analyses_count: analyses.length,
          activations_count: activations.length,
          total_savings_identified: totalSavingsIdentified,
          total_activated_savings_yearly: totalActivatedSavings,
          generated_at: new Date().toISOString(),
        };
        break;
      }
      case "createReport": {
        // Minimal "report" creation — stores a Document of type 'report'
        const doc = await base44.asServiceRole.entities.Document.create({
          title: body.title || "External report",
          type: "report",
          source: apiKey.tool_name || "api",
          metadata: body.metadata || {},
          content: body.content || "",
        }).catch(() => null);
        response = { created: !!doc, id: doc?.id };
        break;
      }
      case "runAnalysis": {
        // Trigger an analysis run via the existing onAnalyzerCompleted flow placeholder.
        // Here we just create an AnalyzerInput shell and return its id.
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
        response = { triggered: true, input_id: input.id };
        break;
      }
      case "updateTracker": {
        // Update a DealActivation tracker
        const updates = {};
        ["status", "realized_savings_monthly", "realized_savings_yearly", "activated_savings_yearly"].forEach(k => {
          if (body[k] !== undefined) updates[k] = body[k];
        });
        const updated = await base44.asServiceRole.entities.DealActivation.update(id, {
          ...updates,
          last_updated: new Date().toISOString(),
        });
        response = updated;
        break;
      }
      default:
        response = { error: "Handler not implemented" };
    }

    await logRequest({ apiKey, endpoint, scope: route.scope, statusCode: 200, status: "success" });
    return Response.json(response);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});