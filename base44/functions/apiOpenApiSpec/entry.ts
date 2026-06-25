// Public OpenAPI 3.1 spec for CAMBRA External API v1.
// Designed for direct import into ChatGPT Actions / Custom GPTs.
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const baseUrl = `${url.origin}${url.pathname.replace(/\/apiOpenApiSpec$/, "")}`;
  const apiServer = `${url.origin}/functions/apiV1`;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "CAMBRA External API",
      description:
        "Secure API to read, trigger, and update CAMBRA infrastructure intelligence. Designed for AI assistants and automation tools (ChatGPT, Claude, Make, n8n, Zapier).",
      version: "1.0.0",
      contact: { name: "CAMBRA", url: baseUrl },
    },
    servers: [{ url: apiServer, description: "Production" }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "Use your CAMBRA API key as a Bearer token. Format: `cmb_live_...`",
        },
      },
      schemas: {
        Brand: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
            category: { type: "string" },
            country: { type: "string" },
            annual_revenue: { type: "string" },
          },
        },
        Analysis: {
          type: "object",
          properties: {
            id: { type: "string" },
            brand_id: { type: "string" },
            total_savings: { type: "number" },
            infra_score: { type: "number" },
            payment_savings: { type: "number" },
            shipping_savings: { type: "number" },
            saas_savings: { type: "number" },
          },
        },
        Kpis: {
          type: "object",
          properties: {
            brands_count: { type: "integer" },
            analyses_count: { type: "integer" },
            activations_count: { type: "integer" },
            total_savings_identified: { type: "number" },
            total_activated_savings_yearly: { type: "number" },
            generated_at: { type: "string", format: "date-time" },
          },
        },
        Error: {
          type: "object",
          properties: { error: { type: "string" } },
        },
      },
    },
    paths: {
      "/?path=/brands&method=GET": {
        get: {
          operationId: "listBrands",
          summary: "List brands",
          description: "Returns up to 100 brands. Requires `read:brands`.",
          responses: {
            "200": {
              description: "OK",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { items: { type: "array", items: { $ref: "#/components/schemas/Brand" } } },
                  },
                },
              },
            },
            "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/?path=/brands/{id}&method=GET": {
        get: {
          operationId: "getBrand",
          summary: "Get brand by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Brand" } } } } },
        },
      },
      "/?path=/analyses&method=GET": {
        get: {
          operationId: "listAnalyses",
          summary: "List analyses",
          description: "Requires `read:analyses`.",
          responses: { "200": { description: "OK" } },
        },
      },
      "/?path=/analyses/{id}&method=GET": {
        get: {
          operationId: "getAnalysis",
          summary: "Get analysis by ID",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Analysis" } } } } },
        },
      },
      "/?path=/kpis&method=GET": {
        get: {
          operationId: "getKpis",
          summary: "Platform KPIs",
          description: "Aggregated KPIs across brands, analyses, activations. Requires `read:kpis`.",
          responses: { "200": { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Kpis" } } } } },
        },
      },
      "/?path=/reports&method=POST": {
        post: {
          operationId: "createReport",
          summary: "Create a report",
          description: "Stores a report document in CAMBRA. Requires `write:reports`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    content: { type: "string" },
                    metadata: { type: "object", additionalProperties: true },
                  },
                  required: ["title"],
                },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/?path=/analysis/run&method=POST": {
        post: {
          operationId: "runAnalysis",
          summary: "Trigger an analysis run",
          description: "Triggers an analyzer run on the provided brand inputs. Requires `trigger:analysis`.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
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
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
      "/?path=/trackers/{id}&method=PATCH": {
        patch: {
          operationId: "updateTracker",
          summary: "Update a savings tracker",
          description: "Updates a DealActivation savings tracker. Requires `update:trackers`.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    realized_savings_monthly: { type: "number" },
                    realized_savings_yearly: { type: "number" },
                    activated_savings_yearly: { type: "number" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "OK" } },
        },
      },
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