// CAMBRA MCP (Model Context Protocol) server wrapper.
// Exposes CAMBRA tools to Claude over JSON-RPC 2.0.
// Spec: https://modelcontextprotocol.io/specification
//
// Auth: Authorization: Bearer <CAMBRA_API_KEY>
// Transport: HTTP (single endpoint, JSON-RPC over POST).
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const TOOLS = [
  {
    name: "list_brands",
    description: "List brands in CAMBRA. Returns id, name, category, country, annual_revenue.",
    inputSchema: { type: "object", properties: {}, required: [] },
    scope: "read:brands",
  },
  {
    name: "get_brand",
    description: "Get a single brand by id.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    scope: "read:brands",
  },
  {
    name: "list_analyses",
    description: "List the latest analyzer results.",
    inputSchema: { type: "object", properties: {}, required: [] },
    scope: "read:analyses",
  },
  {
    name: "get_analysis",
    description: "Get a single analyzer result by id (includes savings breakdown).",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    scope: "read:analyses",
  },
  {
    name: "get_kpis",
    description: "Get aggregated platform KPIs: brands, analyses, activations, total savings.",
    inputSchema: { type: "object", properties: {}, required: [] },
    scope: "read:kpis",
  },
  {
    name: "create_report",
    description: "Create a report document inside CAMBRA.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        metadata: { type: "object" },
      },
      required: ["title"],
    },
    scope: "write:reports",
  },
  {
    name: "trigger_analysis",
    description: "Trigger a new analyzer run for a brand.",
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
    },
    scope: "trigger:analysis",
  },
  {
    name: "update_tracker",
    description: "Update a savings activation tracker.",
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
  },
];

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  const base44 = createClientFromRequest(req);
  const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  const userAgent = req.headers.get("user-agent") || "claude-mcp";

  // Auth: Bearer <CAMBRA API KEY>
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  let body;
  try { body = await req.json(); } catch { return Response.json(rpcError(null, -32700, "Parse error"), { status: 400 }); }

  const { id, method, params = {} } = body || {};

  // initialize & tools/list don't require auth — Claude calls them on connect.
  if (method === "initialize") {
    return Response.json(rpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "cambra-mcp", version: "1.0.0" },
    }));
  }
  if (method === "tools/list") {
    return Response.json(rpcResult(id, {
      tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    }));
  }

  // All other methods require API key
  if (!token) return Response.json(rpcError(id, -32001, "Missing Authorization Bearer token"), { status: 401 });
  const hash = await sha256Hex(token);
  const matches = await base44.asServiceRole.entities.ApiKey.filter({ key_hash: hash });
  const apiKey = matches?.[0];
  if (!apiKey || apiKey.status !== "active") {
    return Response.json(rpcError(id, -32002, "Invalid or revoked API key"), { status: 401 });
  }

  async function logCall({ toolName, scope, status, statusCode, error }) {
    try {
      await base44.asServiceRole.entities.ApiActivityLog.create({
        api_key_id: apiKey.id,
        api_key_name: apiKey.name,
        key_prefix: apiKey.key_prefix,
        tool_name: "claude-mcp",
        endpoint: `mcp:${toolName}`,
        method: "POST",
        scope_used: scope,
        status_code: statusCode,
        status,
        ip_address: ip,
        user_agent: userAgent,
        duration_ms: Date.now() - startedAt,
        error_message: error,
        request_id: crypto.randomUUID(),
      });
      await base44.asServiceRole.entities.ApiKey.update(apiKey.id, {
        last_used_at: new Date().toISOString(),
        last_used_ip: ip,
        usage_count: (apiKey.usage_count || 0) + 1,
      });
    } catch (_) { /* logging never blocks */ }
  }

  if (method === "tools/call") {
    const { name, arguments: args = {} } = params;
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) {
      await logCall({ toolName: name, status: "not_found", statusCode: 404 });
      return Response.json(rpcError(id, -32601, `Unknown tool: ${name}`));
    }
    if (!apiKey.scopes?.includes(tool.scope)) {
      await logCall({ toolName: name, scope: tool.scope, status: "forbidden", statusCode: 403, error: "Missing scope" });
      return Response.json(rpcError(id, -32003, `Missing scope: ${tool.scope}`));
    }

    try {
      let data;
      switch (name) {
        case "list_brands": {
          const items = await base44.asServiceRole.entities.Brand.list("-created_date", 100);
          data = items.map(b => ({ id: b.id, name: b.name, category: b.category, country: b.country, annual_revenue: b.annual_revenue }));
          break;
        }
        case "get_brand":
          data = await base44.asServiceRole.entities.Brand.get(args.id); break;
        case "list_analyses":
          data = await base44.asServiceRole.entities.AnalyzerResult.list("-created_date", 100); break;
        case "get_analysis":
          data = await base44.asServiceRole.entities.AnalyzerResult.get(args.id); break;
        case "get_kpis": {
          const [brands, analyses, activations] = await Promise.all([
            base44.asServiceRole.entities.Brand.list("-created_date", 1000),
            base44.asServiceRole.entities.AnalyzerResult.list("-created_date", 1000),
            base44.asServiceRole.entities.DealActivation.list("-created_date", 1000).catch(() => []),
          ]);
          data = {
            brands_count: brands.length,
            analyses_count: analyses.length,
            activations_count: activations.length,
            total_savings_identified: analyses.reduce((s, a) => s + (a.total_savings || 0), 0),
            total_activated_savings_yearly: activations.reduce((s, a) => s + (a.activated_savings_yearly || 0), 0),
            generated_at: new Date().toISOString(),
          };
          break;
        }
        case "create_report": {
          const doc = await base44.asServiceRole.entities.Document.create({
            title: args.title,
            type: "report",
            source: "claude-mcp",
            metadata: args.metadata || {},
            content: args.content || "",
          }).catch(() => null);
          data = { created: !!doc, id: doc?.id };
          break;
        }
        case "trigger_analysis": {
          const input = await base44.asServiceRole.entities.AnalyzerInput.create({
            brand_id: args.brand_id,
            monthly_revenue: args.monthly_revenue,
            monthly_transactions: args.monthly_transactions,
            avg_order_value: args.avg_order_value,
            payment_fee_pct: args.payment_fee_pct,
            monthly_shipping_cost: args.monthly_shipping_cost,
            monthly_shipments: args.monthly_shipments,
            total_saas_spend: args.total_saas_spend,
          });
          data = { triggered: true, input_id: input.id };
          break;
        }
        case "update_tracker": {
          const updates = {};
          ["status", "realized_savings_monthly", "realized_savings_yearly", "activated_savings_yearly"].forEach(k => {
            if (args[k] !== undefined) updates[k] = args[k];
          });
          data = await base44.asServiceRole.entities.DealActivation.update(args.id, {
            ...updates,
            last_updated: new Date().toISOString(),
          });
          break;
        }
      }

      await logCall({ toolName: name, scope: tool.scope, status: "success", statusCode: 200 });
      return Response.json(rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      }));
    } catch (err) {
      await logCall({ toolName: name, scope: tool.scope, status: "error", statusCode: 500, error: err.message });
      return Response.json(rpcError(id, -32000, err.message));
    }
  }

  return Response.json(rpcError(id, -32601, `Method not found: ${method}`));
});