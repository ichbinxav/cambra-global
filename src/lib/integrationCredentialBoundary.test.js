import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  INTEGRATION_TENANT_ROUTE_INVENTORY,
  createIntegrationCredential,
  readIntegrationCredential,
  resolveOwnedBrandForIntegrationActor,
  resolveOwnedIntegrationForActor,
  revokeIntegrationCredential,
  rotateIntegrationCredential,
} from "../../base44/shared/integrationCredentials.ts";

const ACCESS_A = "v1:YWJjZGVmZ2hpamts:YWNjZXNzLWNpcGhlcnRleHQtYQ==";
const ACCESS_B = "v1:bW5vcHFyc3R1dnd4:YWNjZXNzLWNpcGhlcnRleHQtYg==";
const REFRESH_A = "v1:eHl6YWJjZGVmZ2hp:cmVmcmVzaC1jaXBoZXJ0ZXh0LWE=";

function memoryService(input = {}) {
  const integrations = new Map((input.integrations || []).map((row) => [row.id, { ...row }]));
  const credentials = new Map((input.credentials || []).map((row) => [row.id, { ...row }]));
  const brands = new Map((input.brands || []).map((row) => [row.id, { ...row }]));
  let sequence = credentials.size;
  const clone = (value) => (value ? structuredClone(value) : value);
  return {
    state: { integrations, credentials, brands },
    entities: {
      Brand: { get: async (id) => clone(brands.get(id) || null) },
      Integration: {
        get: async (id) => clone(integrations.get(id) || null),
        update: async (id, patch) => {
          const row = integrations.get(id);
          if (!row) throw new Error("missing_integration");
          integrations.set(id, { ...row, ...clone(patch) });
          return clone(integrations.get(id));
        },
        filter: async (query) => [...integrations.values()]
          .filter((row) => Object.entries(query).every(([key, value]) => row[key] === value))
          .map(clone),
      },
      IntegrationCredential: {
        get: async (id) => clone(credentials.get(id) || null),
        filter: async (query) => [...credentials.values()]
          .filter((row) => Object.entries(query).every(([key, value]) => row[key] === value))
          .map(clone),
        create: async (row) => {
          const created = { id: `cred-${++sequence}`, ...clone(row) };
          credentials.set(created.id, created);
          return clone(created);
        },
        update: async (id, patch) => {
          const row = credentials.get(id);
          if (!row) throw new Error("missing_credential");
          credentials.set(id, { ...row, ...clone(patch) });
          return clone(credentials.get(id));
        },
      },
    },
  };
}

const brand = { id: "brand-1", created_by: "owner@example.com", contact_email: "owner@example.com" };
const integration = {
  id: "integration-1",
  brand_id: "brand-1",
  provider: "stripe",
  status: "connected",
  scopes: ["read"],
  metadata_json: { auth_method: "oauth" },
};

describe("Integration credential boundary", () => {
  it("creates, reads, rotates and revokes only exact brand-bound ciphertext", async () => {
    const service = memoryService({ brands: [brand], integrations: [integration] });
    const created = await createIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
      credential_type: "oauth_token",
      encrypted_access_token: ACCESS_A,
      encrypted_refresh_token: REFRESH_A,
    });
    expect(created).toMatchObject({ credential_version: 1, status: "active", source: "credential" });
    expect(await readIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
    })).toMatchObject({ id: created.id, encrypted_access_token: ACCESS_A });

    const rotated = await rotateIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
      encrypted_access_token: ACCESS_B,
    });
    expect(rotated).toMatchObject({ credential_version: 2, encrypted_access_token: ACCESS_B });

    const revoked = await revokeIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
    });
    expect(revoked).toMatchObject({ status: "revoked", credential_version: 3 });
    const persisted = service.state.credentials.get(created.id);
    expect(persisted.encrypted_access_token).toBeNull();
    expect(persisted.encrypted_refresh_token).toBeNull();
    expect(await revokeIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
    })).toEqual(revoked);
    expect(service.state.credentials.size).toBe(1);
  });

  it("migrates a legacy encrypted Integration only after credential readback and then scrubs", async () => {
    const service = memoryService({
      brands: [brand],
      integrations: [{ ...integration, access_token: ACCESS_A, refresh_token: REFRESH_A }],
    });
    const migrated = await readIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
    });
    expect(migrated).toMatchObject({ source: "legacy_migrated", encrypted_access_token: ACCESS_A });
    expect(service.state.integrations.get(integration.id)).toMatchObject({
      access_token: null,
      refresh_token: null,
    });
    expect(service.state.credentials.size).toBe(1);
  });

  it("does not scrub legacy ciphertext when credential readback is unavailable", async () => {
    const service = memoryService({
      brands: [brand],
      integrations: [{ ...integration, access_token: ACCESS_A, refresh_token: REFRESH_A }],
    });
    service.entities.IntegrationCredential.filter = async () => [];
    await expect(readIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
    })).rejects.toThrow("integration_credential_create_readback_ambiguous");
    expect(service.state.integrations.get(integration.id).access_token).toBe(ACCESS_A);
  });

  it("fails closed on foreign, duplicate and conflicting authorities", async () => {
    const foreign = {
      id: "cred-foreign",
      integration_id: integration.id,
      brand_id: "brand-2",
      credential_type: "oauth_token",
      credential_version: 1,
      status: "active",
      encrypted_access_token: ACCESS_A,
    };
    const service = memoryService({ brands: [brand], integrations: [integration], credentials: [foreign] });
    await expect(readIntegrationCredential(service, {
      integration_id: integration.id,
      brand_id: brand.id,
    })).rejects.toThrow("integration_credential_binding_ambiguous");

    const conflictService = memoryService({
      brands: [brand],
      integrations: [{ ...integration, access_token: ACCESS_B }],
      credentials: [{ ...foreign, id: "cred-1", brand_id: brand.id, encrypted_access_token: ACCESS_A }],
    });
    await expect(readIntegrationCredential(conflictService, {
      integration_id: integration.id,
      brand_id: brand.id,
    })).rejects.toThrow("integration_credential_source_conflict");
  });

  it("uses an identical non-enumerable contract for unknown and non-owner tenant paths", async () => {
    const service = memoryService({ brands: [brand], integrations: [integration] });
    const actor = { email: "attacker@example.com", role: "user" };
    const codes = [];
    for (const input of [
      { brand_id: brand.id, actor },
      { brand_id: "missing-brand", actor },
      { brand_id: brand.id, actor: null },
    ]) {
      try { await resolveOwnedBrandForIntegrationActor(service, input); }
      catch (error) { codes.push([error.code, error.status]); }
    }
    expect(codes).toEqual([
      ["integration_tenant_resource_not_available", 404],
      ["integration_tenant_resource_not_available", 404],
      ["integration_tenant_resource_not_available", 404],
    ]);
    await expect(resolveOwnedIntegrationForActor(service, {
      integration_id: integration.id,
      actor,
    })).rejects.toMatchObject({ code: "integration_tenant_resource_not_available", status: 404 });
    await expect(resolveOwnedIntegrationForActor(service, {
      integration_id: integration.id,
      actor: { email: brand.created_by, role: "user" },
    })).resolves.toMatchObject({ id: integration.id, brand_id: brand.id });
  });

  it("declares every material Integration tenant route and server-only RLS", () => {
    expect(INTEGRATION_TENANT_ROUTE_INVENTORY.map((row) => row.route)).toEqual([
      "oauthConnector",
      "dataSyncAgent",
      "getIntegrationStatus",
      "stripeConnectionDisconnect",
      "maintenanceEngine",
    ]);
    for (const entity of ["Integration", "IntegrationCredential"]) {
      const schema = JSON.parse(fs.readFileSync(`base44/entities/${entity}.jsonc`, "utf8"));
      expect(schema.rls.read.user_condition.role).toBe("__service_role_only__");
      expect(schema.rls.write.user_condition.role).toBe("__service_role_only__");
    }
  });

  it("keeps secrets out of Integration writes, AgentTask/Event/log and responses", () => {
    const files = [
      "base44/functions/oauthConnector/entry.ts",
      "base44/functions/dataSyncAgent/entry.ts",
      "base44/functions/maintenanceEngine/entry.ts",
      "base44/functions/stripeConnectionDisconnect/entry.ts",
      "base44/functions/getIntegrationStatus/entry.ts",
    ];
    const sources = Object.fromEntries(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
    for (const route of INTEGRATION_TENANT_ROUTE_INVENTORY.map((row) => row.route)) {
      const source = sources[`base44/functions/${route}/entry.ts`];
      expect(source).toMatch(
        /resolveOwned(?:Brand|Integration)ForIntegrationActor|resolveOwned(?:Brand|Integration)ForActor|readIntegrationCredential|revokeIntegrationCredential|functions\.invoke\('oauthConnector'/,
      );
    }
    expect(sources["base44/functions/oauthConnector/entry.ts"]).not.toMatch(
      /entities\.Integration\.(?:create|update)\([^;]{0,1000}\b(?:access_token|refresh_token)\s*:/s,
    );
    expect(sources["base44/functions/dataSyncAgent/entry.ts"]).not.toMatch(
      /(?:AgentTask|Event)\.(?:create|update)\([^;]{0,1600}\b(?:encrypted_access_token|encrypted_refresh_token|plaintextToken)\b/s,
    );
    for (const source of Object.values(sources)) {
      expect(source).not.toMatch(/console\.(?:log|warn|error)\([^\n]*(?:access_token|refresh_token|plaintextToken)/);
      expect(source).not.toMatch(/Response\.json\([^;]{0,1000}\b(?:encrypted_access_token|encrypted_refresh_token|plaintextToken)\b/s);
    }
  });
});
