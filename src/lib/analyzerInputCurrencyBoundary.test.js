import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import {
  createAuthorizedPublicAnalyzerInput,
  createTenantAuthorizedPublicAnalyzerInput,
  createTenantAuthorizedPublicAnalyzerInputFromServiceRole,
  isAnalyzerInputCurrencyError,
  validateAnalyzerInputCurrency,
} from "../../base44/shared/analyzerInputCurrency.ts";
import {
  handleApiV1TransportRequest,
} from "../../base44/shared/apiV1Transport.ts";

const read = (file) => fs.readFileSync(file, "utf8");

describe("AnalyzerInput currency ingress boundary", () => {
  it("normalizes ISO 4217 input and requires a unit with monthly revenue", () => {
    expect(validateAnalyzerInputCurrency({
      monthly_revenue: 100,
      currency: "eur",
    })).toBe("EUR");
    expect(validateAnalyzerInputCurrency({
      monthly_revenue: 100,
      currency: "USD",
    })).toBe("USD");
    expect(validateAnalyzerInputCurrency({
      avg_order_value: 100,
      currency: "mxn",
    })).toBe("MXN");
    expect(validateAnalyzerInputCurrency({ currency: "GBP" })).toBe("GBP");
    expect(validateAnalyzerInputCurrency({})).toBeNull();
    expect(() => validateAnalyzerInputCurrency({ monthly_revenue: 100 }))
      .toThrowError(expect.objectContaining({
        code: "ANALYZER_INPUT_CURRENCY_REQUIRED_WITH_MONETARY_FIELDS",
        status: 400,
      }));
    for (const input of [
      { avg_order_value: 50 },
      { monthly_shipping_cost: 5000 },
      { total_saas_spend: 1000 },
      { saas_tools: [{ name: "Shopify", monthly_cost: 100 }] },
    ]) {
      expect(() => validateAnalyzerInputCurrency(input)).toThrowError(
        expect.objectContaining({
          code: "ANALYZER_INPUT_CURRENCY_REQUIRED_WITH_MONETARY_FIELDS",
        }),
      );
    }
    expect(() => validateAnalyzerInputCurrency({
      monthly_revenue: 100,
      currency: "EURO",
    })).toThrowError(expect.objectContaining({
      code: "ANALYZER_INPUT_CURRENCY_INVALID",
    }));
    expect(() => validateAnalyzerInputCurrency({
      monthly_revenue: 100,
      currency: ["EUR"],
    })).toThrowError(expect.objectContaining({
      code: "ANALYZER_INPUT_CURRENCY_INVALID",
    }));
    try {
      validateAnalyzerInputCurrency({
        monthly_revenue: 100,
        currency: "ZZZ",
      });
      throw new Error("expected invalid ISO currency");
    } catch (error) {
      expect(isAnalyzerInputCurrencyError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "ANALYZER_INPUT_CURRENCY_INVALID",
        status: 400,
      });
    }
    expect(validateAnalyzerInputCurrency({
      monthly_revenue: 100,
      currency: "XCG",
    })).toBe("XCG");
    for (const nonTransactionalCode of ["XXX", "XTS"]) {
      expect(() => validateAnalyzerInputCurrency({
        monthly_revenue: 100,
        currency: nonTransactionalCode,
      })).toThrowError(expect.objectContaining({
        code: "ANALYZER_INPUT_CURRENCY_INVALID",
      }));
    }
  });

  it("rejects mass assignment before authorization or persistence", async () => {
    const authorizeBrand = vi.fn(async () => {});
    const create = vi.fn(async (payload) => ({ id: "input-1", ...payload }));
    await expect(createAuthorizedPublicAnalyzerInput({
      brand_id: "brand-1",
      monthly_revenue: 100,
      currency: "EUR",
      created_by: "attacker@example.test",
    }, { authorizeBrand, create })).rejects.toMatchObject({
      code: "ANALYZER_INPUT_UNKNOWN_FIELD",
      status: 400,
    });
    expect(authorizeBrand).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();

    const result = await createAuthorizedPublicAnalyzerInput({
      brand_id: "brand-1",
      monthly_revenue: 100,
      currency: "eur",
      monthly_transactions: 2,
    }, { authorizeBrand, create });
    expect(authorizeBrand).toHaveBeenCalledWith("brand-1");
    expect(create).toHaveBeenCalledWith({
      brand_id: "brand-1",
      monthly_revenue: 100,
      monthly_transactions: 2,
      currency: "EUR",
    });
    expect(result.payload).not.toHaveProperty("created_by");
  });

  it("fails closed on missing, duplicate, unavailable, and cross-tenant Brand authority", async () => {
    const input = { brand_id: "brand-1", monthly_revenue: 100, currency: "EUR" };
    const cases = [
      {
        readBrandsExact: async () => [],
        authorizeBrandRecord: async () => {},
        code: "ANALYZER_INPUT_BRAND_NOT_FOUND",
      },
      {
        readBrandsExact: async () => [{ id: "brand-1" }, { id: "brand-1" }],
        authorizeBrandRecord: async () => {},
        code: "ANALYZER_INPUT_BRAND_AUTHORITY_AMBIGUOUS",
      },
      {
        readBrandsExact: async () => { throw new Error("postgres://secret"); },
        authorizeBrandRecord: async () => {},
        code: "ANALYZER_INPUT_BRAND_AUTHORITY_UNAVAILABLE",
      },
      {
        readBrandsExact: async () => [{ id: "brand-1", created_by: "other@example.test" }],
        authorizeBrandRecord: async () => {
          throw Object.assign(new Error("not_found"), { code: "not_found", status: 404 });
        },
        code: "not_found",
      },
    ];
    for (const testCase of cases) {
      const create = vi.fn(async () => ({ id: "must-not-exist" }));
      await expect(createTenantAuthorizedPublicAnalyzerInput(input, {
        readBrandsExact: testCase.readBrandsExact,
        authorizeBrandRecord: testCase.authorizeBrandRecord,
        create,
      })).rejects.toMatchObject({ code: testCase.code });
      expect(create, testCase.code).not.toHaveBeenCalled();
    }

    const create = vi.fn(async (payload) => ({ id: "input-1", ...payload }));
    await expect(createTenantAuthorizedPublicAnalyzerInput(input, {
      readBrandsExact: async () => [{ id: "brand-1", created_by: "owner@example.test" }],
      authorizeBrandRecord: async () => {},
      create,
    })).resolves.toMatchObject({ created: { id: "input-1" } });
    expect(create).toHaveBeenCalledOnce();
  });

  it("executes the shared API/MCP service-role handler fail-closed", async () => {
    const input = { brand_id: "brand-1", monthly_revenue: 100, currency: "EUR" };
    for (const testCase of [
      { rows: [], code: "ANALYZER_INPUT_BRAND_NOT_FOUND" },
      {
        rows: [{ id: "brand-1" }, { id: "brand-1" }],
        code: "ANALYZER_INPUT_BRAND_AUTHORITY_AMBIGUOUS",
      },
    ]) {
      const filter = vi.fn(async () => testCase.rows);
      const create = vi.fn();
      await expect(createTenantAuthorizedPublicAnalyzerInputFromServiceRole(
        input,
        {
          serviceRole: {
            entities: {
              Brand: { filter },
              AnalyzerInput: { create },
            },
          },
          authorizeBrandRecord: async () => {},
        },
      )).rejects.toMatchObject({ code: testCase.code });
      expect(filter).toHaveBeenCalledWith(
        { id: "brand-1" },
        "-created_date",
        2,
      );
      expect(create).not.toHaveBeenCalled();
    }

    const unavailableCreate = vi.fn();
    await expect(createTenantAuthorizedPublicAnalyzerInputFromServiceRole(
      input,
      {
        serviceRole: {
          entities: {
            Brand: { filter: async () => { throw new Error("token=raw-secret"); } },
            AnalyzerInput: { create: unavailableCreate },
          },
        },
        authorizeBrandRecord: async () => {},
      },
    )).rejects.toMatchObject({
      code: "ANALYZER_INPUT_BRAND_AUTHORITY_UNAVAILABLE",
    });
    expect(unavailableCreate).not.toHaveBeenCalled();

    const crossTenantCreate = vi.fn();
    await expect(createTenantAuthorizedPublicAnalyzerInputFromServiceRole(
      input,
      {
        serviceRole: {
          entities: {
            Brand: { filter: async () => [{ id: "brand-1", created_by: "other@example.test" }] },
            AnalyzerInput: { create: crossTenantCreate },
          },
        },
        authorizeBrandRecord: async () => {
          throw Object.assign(new Error("not_found"), {
            code: "not_found",
            status: 404,
          });
        },
      },
    )).rejects.toMatchObject({ code: "not_found", status: 404 });
    expect(crossTenantCreate).not.toHaveBeenCalled();
  });

  it("wires API and MCP writers to the executable allowlist boundary", () => {
    for (const name of ["apiV1", "mcpServer"]) {
      const source = read(`base44/functions/${name}/entry.ts`);
      expect(source).toContain(
        "createTenantAuthorizedPublicAnalyzerInputFromServiceRole",
      );
      expect(source).not.toContain("if (!resource) return null");
    }
    const mcp = read("base44/functions/mcpServer/entry.ts");
    expect(mcp).toContain("additionalProperties: false");
    expect(mcp).not.toContain("const inputPayload = { ...args }");
    expect(mcp).toContain('minLength: 1');
    expect(mcp).toContain('maxLength: 160');
    expect(mcp).toContain('minLength: 3');
    expect(mcp).toContain('maxLength: 3');
    expect(mcp).toContain('then: { required: ["currency"] }');
    expect(mcp).toContain("isAnalyzerInputCurrencyError(e)");
    expect(mcp).toContain("const rpcCode = invalidCurrencyParams || statusCode === 400");
    expect(mcp).toContain('monthly_revenue: { type: "number", minimum: 0 }');
    expect(mcp).toContain('payment_fee_pct: { type: "number", minimum: 0, maximum: 100 }');
    expect(mcp).toContain("error: safeCode");
    expect(mcp).not.toContain("error: e.message");
    expect(mcp).toContain('message: "mcp_secondary_failure"');
    const api = read("base44/functions/apiV1/entry.ts");
    expect(api).toContain("handleApiV1TransportRequest(");
    expect(api).not.toContain('payload.path || "/v1/users/me"');
    expect(api).toContain("error_message: code");
    expect(api).not.toContain("error_message: e.message");
    expect(api).toContain('message: "api_v1_secondary_failure"');
  });

  it("serves an OpenAPI 3.1 request body with conditional currency", async () => {
    let handler;
    const previousDeno = globalThis.Deno;
    globalThis.Deno = { serve: (value) => { handler = value; } };
    try {
      vi.resetModules();
      await import("../../base44/functions/apiOpenApiSpec/entry.ts");
      expect(handler).toBeTypeOf("function");
      const response = await handler(new Request(
        "https://api.example.test/functions/apiOpenApiSpec",
      ));
      const spec = await response.json();
      const requestBody = spec.paths["/v1/analyses/run"].post.requestBody;
      const schema = requestBody.content["application/json"].schema;
      expect(requestBody.required).toBe(true);
      expect(schema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["brand_id"],
        properties: {
          currency: { type: "string", pattern: "^[A-Za-z]{3}$" },
          monthly_revenue: { type: "number", minimum: 0 },
        },
      });
      expect(schema.allOf).toContainEqual({
        if: {
          anyOf: [
            { required: ["monthly_revenue"] },
            { required: ["avg_order_value"] },
            { required: ["monthly_shipping_cost"] },
            { required: ["total_saas_spend"] },
          ],
        },
        then: { required: ["currency"] },
      });

      const directBody = {
        brand_id: "brand-1",
        monthly_revenue: 100,
        currency: "EUR",
      };
      const dispatch = vi.fn(async (transport) => transport);
      const direct = await handleApiV1TransportRequest(
        new Request(`${spec.servers[0].url}/v1/analyses/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(directBody),
        }),
        dispatch,
      );
      expect(direct).toEqual({
        path: "/v1/analyses/run",
        method: "POST",
        body: directBody,
        query: {},
        transport: "openapi_direct",
      });
      expect(dispatch).toHaveBeenCalledOnce();

      const mismatchDispatch = vi.fn();
      await expect(handleApiV1TransportRequest(
        new Request(`${spec.servers[0].url}/v1/analyses/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "/v1/users/me",
            method: "GET",
            body: directBody,
          }),
        }),
        mismatchDispatch,
      )).rejects.toMatchObject({
        code: "api_transport_contract_mismatch",
        status: 400,
      });
      expect(mismatchDispatch).not.toHaveBeenCalled();

      await expect(handleApiV1TransportRequest(
        new Request(spec.servers[0].url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(directBody),
        }),
        mismatchDispatch,
      )).rejects.toMatchObject({
        code: "api_transport_contract_mismatch",
        status: 400,
      });

      const legacy = await handleApiV1TransportRequest(
        new Request(spec.servers[0].url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "/v1/analyses/run",
            method: "POST",
            body: directBody,
          }),
        }),
        async (transport) => transport,
      );
      expect(legacy).toMatchObject({
        path: "/v1/analyses/run",
        method: "POST",
        body: directBody,
        transport: "legacy_envelope",
      });
    } finally {
      if (previousDeno === undefined) delete globalThis.Deno;
      else globalThis.Deno = previousDeno;
    }
  });

  it("keeps owner reads but disables every direct mutation", () => {
    const entity = JSON.parse(read("base44/entities/AnalyzerInput.jsonc"));
    expect(entity.rls.read.$or).toContainEqual({
      created_by: "{{user.email}}",
    });
    for (const operation of ["create", "update", "delete"]) {
      expect(entity.rls[operation]).toBe(false);
    }
    expect(entity.rls).not.toHaveProperty("write");
  });

  it("makes internal demo/self-test AnalyzerInput revenue explicitly EUR", () => {
    for (const name of ["seedDemoData", "runFlowSelfTests"]) {
      const source = read(`base44/functions/${name}/entry.ts`);
      const create = source.indexOf("entities.AnalyzerInput.create");
      expect(create, name).toBeGreaterThan(-1);
      expect(source.slice(create, create + 700), name).toContain('currency: "EUR"');
    }
  });
});
