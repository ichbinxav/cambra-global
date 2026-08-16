// FMERC-K (2026-08-16) — behavior tests for the getFounderControlCenter
// handler: the single physical entry point shared by Founder Control, Admin
// Settings and Founder Merchants. The collectors underneath are well tested as
// pure functions; what had no test was the dispatch itself — auth, the three
// body.view paths, the http_status contract of the merchants view, and the
// promise that an uncaught collector error becomes internalErrorResponse
// instead of a raw trace. Every test INVOKES handleFounderControlCenter (the
// exact code entry.ts serves — same extraction pattern as Fase J).
import { describe, expect, it, vi } from "vitest";
import { handleFounderControlCenter } from "../../base44/shared/founderControlCenterCore.ts";
import { collectMerchantBlock, MERCHANT_BLOCKS } from "../../base44/shared/founderMerchantsV2.ts";

const ADMIN = { id: "founder-1", email: "founder@cambra.global", role: "admin" };
const SVC = { entities: {} };

function deps(overrides = {}) {
  return {
    collectFounderControlSnapshot: vi.fn(async () => ({ ok: true, view: "founder_control" })),
    collectAdminSettingsSnapshot: vi.fn(async () => ({ ok: true, view: "settings" })),
    collectFounderMerchantsV2: vi.fn(async () => ({ ok: true, view: "merchants" })),
    ...overrides,
  };
}

async function jsonOf(response) {
  return { status: response.status, body: await response.json() };
}

describe("getFounderControlCenter — authentication and authorization", () => {
  it("returns 401 without a user and never calls a collector", async () => {
    const d = deps();
    const { status, body } = await jsonOf(await handleFounderControlCenter(null, {}, SVC, d));
    expect(status).toBe(401);
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(d.collectFounderControlSnapshot).not.toHaveBeenCalled();
    expect(d.collectAdminSettingsSnapshot).not.toHaveBeenCalled();
    expect(d.collectFounderMerchantsV2).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin and never calls a collector", async () => {
    const d = deps();
    const { status, body } = await jsonOf(
      await handleFounderControlCenter({ id: "u1", email: "user@x.com", role: "user" }, { view: "merchants" }, SVC, d),
    );
    expect(status).toBe(403);
    expect(body).toEqual({ ok: false, error: "Forbidden" });
    expect(d.collectFounderMerchantsV2).not.toHaveBeenCalled();
  });
});

describe("getFounderControlCenter — view dispatch", () => {
  it("dispatches view:'settings' to collectAdminSettingsSnapshot with the svc, user and section", async () => {
    const d = deps();
    const { status, body } = await jsonOf(
      await handleFounderControlCenter(ADMIN, { view: "settings", section: "founder_profile" }, SVC, d),
    );
    expect(status).toBe(200);
    expect(body.view).toBe("settings");
    expect(d.collectAdminSettingsSnapshot).toHaveBeenCalledWith(SVC, ADMIN, "founder_profile");
    expect(d.collectFounderControlSnapshot).not.toHaveBeenCalled();
    expect(d.collectFounderMerchantsV2).not.toHaveBeenCalled();
  });

  it("returns 400 when the settings snapshot reports ok:false", async () => {
    const d = deps({ collectAdminSettingsSnapshot: vi.fn(async () => ({ ok: false, error: "unsupported_section" })) });
    const { status, body } = await jsonOf(await handleFounderControlCenter(ADMIN, { view: "settings" }, SVC, d));
    expect(status).toBe(400);
    expect(body.error).toBe("unsupported_section");
  });

  it("dispatches view:'merchants' to collectFounderMerchantsV2 with the full body", async () => {
    const d = deps();
    const requestBody = { view: "merchants", block: "overview", merchant_id: "brand-1" };
    const { status, body } = await jsonOf(await handleFounderControlCenter(ADMIN, requestBody, SVC, d));
    expect(status).toBe(200);
    expect(body.view).toBe("merchants");
    expect(d.collectFounderMerchantsV2).toHaveBeenCalledWith(SVC, ADMIN, requestBody);
    expect(d.collectFounderControlSnapshot).not.toHaveBeenCalled();
  });

  it("honors the merchants snapshot's http_status and strips it from the response body", async () => {
    const d = deps({
      collectFounderMerchantsV2: vi.fn(async () => ({ ok: false, error: "unsupported_merchant_block", http_status: 400 })),
    });
    const { status, body } = await jsonOf(await handleFounderControlCenter(ADMIN, { view: "merchants" }, SVC, d));
    expect(status).toBe(400);
    expect(body.error).toBe("unsupported_merchant_block");
    expect(body.http_status).toBeUndefined();
  });

  it("is case-insensitive on view and falls back to the Founder Control snapshot for any other value", async () => {
    for (const view of [undefined, "", "founder", "SETTINGSX", "control"]) {
      const d = deps();
      const { status, body } = await jsonOf(await handleFounderControlCenter(ADMIN, { view }, SVC, d));
      expect(status).toBe(200);
      expect(body.view).toBe("founder_control");
      expect(d.collectFounderControlSnapshot).toHaveBeenCalledWith(SVC);
    }
    // Uppercase variants of the real views still dispatch correctly.
    const d = deps();
    await handleFounderControlCenter(ADMIN, { view: "MERCHANTS" }, SVC, d);
    expect(d.collectFounderMerchantsV2).toHaveBeenCalled();
  });
});

describe("getFounderControlCenter — uncaught errors stay private", () => {
  it("maps a collector crash to internalErrorResponse (500, request_id, no trace)", async () => {
    const boom = new Error("db exploded at row 42 with secret=abc");
    const d = deps({ collectFounderControlSnapshot: vi.fn(async () => { throw boom; }) });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { status, body } = await jsonOf(await handleFounderControlCenter(ADMIN, {}, SVC, d));
      expect(status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error).toBe("internal_error");
      expect(typeof body.request_id).toBe("string");
      expect(JSON.stringify(body)).not.toContain("db exploded");
      expect(JSON.stringify(body)).not.toContain("secret=abc");
    } finally {
      consoleSpy.mockRestore();
    }
  });
});

describe("founderMerchantsV2 — technical_audit block routing (FMERC-K.2)", () => {
  function unavailableEntity() {
    return {
      async filter() {
        throw new Error("source_unavailable");
      },
    };
  }

  it("serves technical_audit through its now-explicit branch with the same projection shape", async () => {
    const calls = [];
    const svc = {
      entities: new Proxy({}, {
        get(_target, entity) {
          return {
            async filter(query, sort, limit) {
              calls.push({ entity: String(entity), query, sort, limit });
              return [];
            },
          };
        },
      }),
    };
    const result = await collectMerchantBlock(svc, { id: "brand-1" }, "technical_audit");
    expect(result.ok).toBe(true);
    expect(result.block).toBe("technical_audit");
    expect(result.data).toMatchObject({ merchant_id: "brand-1", events: [], agent_tasks: [], direct_merchant_incidents: [], integrations: [] });
    expect(result.incident_coverage.status).toBe("PARTIAL");
    expect(result.secret_values_exposed).toBe(false);
    const entitiesRead = new Set(calls.map((call) => call.entity));
    expect([...entitiesRead].sort()).toEqual(["AgentTask", "AutonomyIncident", "Event", "Integration"]);
  });

  it("still rejects a block outside the whitelist with unsupported_merchant_block (400)", async () => {
    const svc = { entities: new Proxy({}, { get: () => unavailableEntity() }) };
    const result = await collectMerchantBlock(svc, { id: "brand-1" }, "some_future_block");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("unsupported_merchant_block");
    expect(result.http_status).toBe(400);
  });

  it("every MERCHANT_BLOCKS entry has an explicit branch — none falls into the fail-closed tail", async () => {
    // The tail returns merchant_block_not_implemented; a whitelisted block
    // reaching it would mean a 13th block shipped without its own branch.
    const svc = { entities: new Proxy({}, { get: () => unavailableEntity() }) };
    for (const block of MERCHANT_BLOCKS) {
      let result;
      try {
        result = await collectMerchantBlock(svc, { id: "brand-1" }, block);
      } catch {
        continue; // scope assertions may throw on unavailable sources — that is still an explicit branch, not the tail
      }
      if (result && result.error === "merchant_block_not_implemented") {
        throw new Error(`block ${block} fell into the fail-closed tail — add its explicit branch`);
      }
    }
  });
});
