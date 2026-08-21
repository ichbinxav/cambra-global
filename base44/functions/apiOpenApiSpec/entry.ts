// Public OpenAPI 3.1 spec for CAMBRA External API v1
// Designed for direct import into ChatGPT Actions / Swagger UI / Postman.
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const apiServer = `${url.origin}/functions/apiV1`;
  const oauthAuthorize = `${url.origin}/functions/oauthAuthorize`;
  const oauthToken = `${url.origin}/functions/oauthToken`;

  const scopes = {
    "read": "Read access to all CAMBRA resources",
    "write": "Write access to all CAMBRA resources",
    "admin": "Full administrative access",
    "platform": "Explicit platform-wide tenant boundary for unbound API keys; other scopes still limit allowed operations",
    "read:brands": "List & read brands",
    "read:analyses": "List & read analyzer results",
    "read:documents": "List & read documents",
    "read:providers": "List & read providers",
    "read:kpis": "Read aggregated KPIs",
    "read:savings": "Read savings figures",
    "read:trackers": "Read deal activation trackers",
    "read:reports": "List & read reports",
    "read:integrations": "List integrations",
    "write:reports": "Create reports",
    "trigger:analysis": "Trigger a new analyzer run",
  };

  const moneySchema = {
    type: "object",
    description: "CAMBRA money envelope: always includes currency, period, confidence, assumptions and source.",
    properties: {
      amount: { type: "number", nullable: true, example: 24600 },
      currency: { type: "string", example: "EUR" },
      period: { type: "string", enum: ["monthly", "weekly", "yearly", "one_time"], example: "yearly" },
      confidence: { type: "number", minimum: 0, maximum: 1, example: 0.85 },
      assumptions: { type: "array", items: { type: "string" }, example: ["Based on Stripe statement Q1 2026"] },
      source: { type: "string", example: "cambra-analyzer" },
    },
    required: ["amount", "currency", "period", "confidence", "assumptions", "source"],
  };

  const analysisRunRequestSchema = {
    type: "object",
    additionalProperties: false,
    description: "Creates one AnalyzerInput. Currency is normalized and validated against ISO 4217 at runtime and is mandatory whenever a monetary amount is present.",
    properties: {
      brand_id: { type: "string", pattern: "^[A-Za-z0-9_][A-Za-z0-9._:/-]{0,159}$" },
      monthly_revenue: { type: "number", minimum: 0 },
      currency: {
        type: "string",
        pattern: "^[A-Za-z]{3}$",
        description: "ISO 4217 code. Lowercase input is accepted and persisted uppercase.",
      },
      monthly_transactions: { type: "number", minimum: 0 },
      avg_order_value: { type: "number", minimum: 0 },
      payment_fee_pct: { type: "number", minimum: 0, maximum: 100 },
      monthly_shipping_cost: { type: "number", minimum: 0 },
      monthly_shipments: { type: "number", minimum: 0 },
      total_saas_spend: { type: "number", minimum: 0 },
    },
    required: ["brand_id"],
    allOf: [{
      if: {
        anyOf: [
          { required: ["monthly_revenue"] },
          { required: ["avg_order_value"] },
          { required: ["monthly_shipping_cost"] },
          { required: ["total_saas_spend"] },
        ],
      },
      then: { required: ["currency"] },
    }],
  };

  const paginationParams = [
    { name: "limit", in: "query", required: false, description: "Max results, 1–200. Default 50.", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
  ];
  const idempotencyHeader = { name: "Idempotency-Key", in: "header", required: false, description: "Client-generated UUID. Repeating the same key within 24h replays the cached response.", schema: { type: "string", format: "uuid" } };

  const envelopeMeta = {
    type: "object",
    properties: {
      api_version: { type: "string", example: "v1" },
      timestamp: { type: "string", format: "date-time" },
      count: { type: "integer", nullable: true, example: 12 },
      limit: { type: "integer", nullable: true, example: 50 },
      has_more: { type: "boolean", nullable: true, example: false },
      replayed: { type: "boolean", nullable: true, description: "true when this response was served from the idempotency cache" },
    },
  };

  const errorObj = {
    type: "object",
    properties: {
      code: { type: "string", example: "unauthorized" },
      message: { type: "string" },
      details: { type: "object", nullable: true, additionalProperties: true },
    },
  };

  const responseEnvelope = (dataSchema) => ({
    type: "object",
    properties: {
      request_id: { type: "string", format: "uuid" },
      data: dataSchema,
      meta: envelopeMeta,
    },
  });

  const path = (summary, scope, operationId, dataSchema, extra = {}) => ({
    summary,
    operationId,
    security: [{ ApiKeyAuth: [] }, { OAuth2: scope ? [scope] : [] }],
    responses: {
      "200": { description: "OK", content: { "application/json": { schema: responseEnvelope(dataSchema) } } },
      "400": { description: "Invalid request" },
      "401": { description: "Unauthorized — missing or invalid bearer token", content: { "application/json": { schema: { type: "object", properties: { error: errorObj } } } } },
      "403": { description: "Forbidden — missing scope or IP not in allowlist" },
      "404": { description: "Not found" },
      "409": { description: "Idempotency conflict — same key reused with different body" },
      "413": { description: "Request too large (>256 KB)" },
      "429": { description: "Rate limited (120/min by default)" },
      "500": { description: "Internal error — quote the request_id when contacting support" },
    },
    ...extra,
  });

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "CAMBRA API",
      version: "1.0.0",
      description: [
        "Production CAMBRA API for AI assistants, automation tools and enterprise integrations.",
        "",
        "**Authentication:** Bearer token — either an API key (`cmb_live_...`) or an OAuth 2.0 access token (`cmb_at_...`).",
        "",
        "**Versioning:** all endpoints live under `/v1/`. Older paths without the version prefix are rewritten on the fly for backward compatibility.",
        "",
        "**Response envelope:** every response includes `request_id`, `meta.api_version`, `meta.timestamp` and either `data` or `error`.",
        "",
        "**Rate limit:** 120 requests / minute / principal (configurable per key).",
      ].join("\n"),
      contact: { name: "CAMBRA Developer Relations", url: url.origin + "/developers" },
      license: { name: "Proprietary" },
    },
    servers: [{ url: apiServer, description: "Production v1" }],
    security: [{ ApiKeyAuth: [] }],
    tags: [
      { name: "Brands" }, { name: "Analyses" }, { name: "Documents" }, { name: "Providers" },
      { name: "Savings" }, { name: "Trackers" }, { name: "Reports" }, { name: "KPIs" },
      { name: "Users" }, { name: "Integrations" }, { name: "AI Actions" },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key", description: "Use a CAMBRA API key as Bearer token. Format: `cmb_live_...`" },
        OAuth2: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: oauthAuthorize,
              tokenUrl: oauthToken,
              scopes,
            },
          },
        },
      },
      schemas: {
        Money: moneySchema,
        Error: errorObj,
        Brand: {
          type: "object",
          properties: {
            id: { type: "string" }, name: { type: "string" }, category: { type: "string" },
            country: { type: "string" }, annual_revenue: { type: "string" }, sector: { type: "string" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Analysis: {
          type: "object",
          properties: {
            id: { type: "string" }, brand_id: { type: "string" }, input_id: { type: "string" },
            infra_score: { type: "number" },
            total_savings: { $ref: "#/components/schemas/Money" },
            breakdown: {
              type: "object",
              properties: {
                payments: { type: "object", properties: { savings: { $ref: "#/components/schemas/Money" }, benchmark: { type: "number" } } },
                shipping: { type: "object", properties: { savings: { $ref: "#/components/schemas/Money" }, benchmark: { type: "number" } } },
                saas:     { type: "object", properties: { savings: { $ref: "#/components/schemas/Money" }, benchmark: { type: "number" } } },
              },
            },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Tracker: {
          type: "object",
          properties: {
            id: { type: "string" }, brand_id: { type: "string" }, provider_id: { type: "string" },
            vertical: { type: "string" }, status: { type: "string" }, deal_name: { type: "string" },
            projected_savings_yearly: { $ref: "#/components/schemas/Money" },
            realized_savings_yearly: { $ref: "#/components/schemas/Money" },
          },
        },
      },
    },
    paths: {
      "/v1/brands":               { get: path("List brands",                  "read:brands",     "listBrands",     { type: "array", items: { $ref: "#/components/schemas/Brand" } }, { parameters: paginationParams }) },
      "/v1/brands/{id}":          { get: path("Get brand",                    "read:brands",     "getBrand",       { $ref: "#/components/schemas/Brand" }, { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }) },
      "/v1/analyses":             { get: path("List analyses",                "read:analyses",   "listAnalyses",   { type: "array", items: { $ref: "#/components/schemas/Analysis" } }, { parameters: [...paginationParams, { name: "brand_id", in: "query", schema: { type: "string" } }] }) },
      "/v1/analyses/{id}":        { get: path("Get analysis",                 "read:analyses",   "getAnalysis",    { $ref: "#/components/schemas/Analysis" }, { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }) },
      "/v1/analyses/run":         { post: path("Trigger analysis",            "trigger:analysis","runAnalysis",    { type: "object" }, { parameters: [idempotencyHeader], requestBody: { required: true, content: { "application/json": { schema: analysisRunRequestSchema } } } }) },
      "/v1/documents":            { get: path("List documents",               "read:documents",  "listDocuments",  { type: "array", items: { type: "object" } }, { parameters: paginationParams }) },
      "/v1/providers":            { get: path("List providers",               "read:providers",  "listProviders",  { type: "array", items: { type: "object" } }, { parameters: paginationParams }) },
      "/v1/savings":              { get: path("List savings",                 "read:savings",    "listSavings",    { type: "array", items: { type: "object" } }, { parameters: paginationParams }) },
      "/v1/trackers":             { get: path("List trackers",                "read:trackers",   "listTrackers",   { type: "array", items: { $ref: "#/components/schemas/Tracker" } }, { parameters: paginationParams }) },
      "/v1/reports":              { get: path("List reports",                 "read:reports",    "listReports",    { type: "array", items: { type: "object" } }, { parameters: paginationParams }),
                                    post: path("Create report",               "write:reports",   "createReport",   { type: "object" }, { parameters: [idempotencyHeader] }) },
      "/v1/kpis":                 { get: path("Platform KPIs",                "read:kpis",       "getKpis",        { type: "object" }) },
      "/v1/users/me":             { get: path("Current principal",            null,              "getMe",          { type: "object" }) },
      "/v1/integrations":         { get: path("List integrations",            "read:integrations","listIntegrations",{ type: "array", items: { type: "object" } }, { parameters: paginationParams }) },
      "/v1/ai/summarize-brand":   { post: path("AI · summarize brand",        "read:brands",     "aiSummarizeBrand", { type: "object" }, { parameters: [idempotencyHeader] }) },
      "/v1/ai/weekly-briefing":   { post: path("AI · weekly briefing",        "read:kpis",       "aiWeeklyBriefing", { type: "object" }, { parameters: [idempotencyHeader] }) },
    },
  };

  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
});
