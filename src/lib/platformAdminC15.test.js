// DASHBOARD-C15 (2026-08-17) — the last three direct browser writes.
//
// All three were worse than "direct CRUD" suggested:
//
//   1. OrganizationsPanel held a PLANS array mapping plan id to monthly_api_quota,
//      overage_price_per_1k and rate_limit_per_minute, and wrote those into the entity. Unlike
//      C11's revenue_share_pct, which nothing read, all three ARE enforced: apiV1 and mcpServer
//      gate access on the quota and rate limit, and apiUsageBilling invoices the overage.
//   2. The panel's "Suspend this organization?" wrote billing_status: 'canceled'. The enum is
//      active | past_due | canceled | trial — there is no suspended state, so it offered a
//      reversible-sounding action that performed a terminal one.
//   3. Both note creators used `author: me?.email || "admin"`. A note written when the current
//      user could not be read was stored as if a person called "admin" wrote it. That is the
//      audit-trail form of Number(null) === 0.
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyOrganization, cancelOrganization, PLAN_CATALOG, planCatalogView, previewOrganization,
  recordAdminNote, refuseDealApplicationWrite,
} from "../../base44/shared/platformAdminCore.ts";

const NOW = "2026-08-17T12:00:00.000Z";
const sha256 = async (value) => `h:${JSON.stringify(value).length}`;

function makeSvc(rows = {}, broken = []) {
  const stores = {}; const built = {}; const writes = [];
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async filter(where) {
        if (broken.includes(name)) throw new Error("down");
        return stores[name].filter((r) => Object.entries(where || {}).every(([k, v]) => r[k] === v)).map((r) => ({ ...r }));
      },
      async create(row) {
        if (broken.includes(`${name}:create`)) throw new Error("refused");
        const created = { id: `${name.toLowerCase()}-${stores[name].length + 1}`, ...row };
        stores[name].push(created); writes.push({ op: "create", entity: name, row: created });
        return created;
      },
      async update(id, patch) {
        if (broken.includes(`${name}:update`)) throw new Error("refused");
        const row = stores[name].find((r) => r.id === id);
        if (row) Object.assign(row, patch);
        writes.push({ op: "update", entity: name, id, patch });
        return row;
      },
    };
    return built[name];
  };
  return { stores, writes, entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const orgPatch = (extra = {}) => ({
  name: "Acme Group", owner_email: "ops@acme.test", plan: "growth", ...extra,
});

describe("C15 — plan terms are server-side because production enforces them", () => {
  it("refuses a caller-supplied quota, price or rate limit, and names what reads it", async () => {
    for (const [field, reader] of [
      ["monthly_api_quota", "apiV1"],
      ["overage_price_per_1k", "apiUsageBilling"],
      ["rate_limit_per_minute", "enforced at the API boundary"],
    ]) {
      const out = await previewOrganization({
        svc: makeSvc(), patch: orgPatch({ [field]: 999999 }), now: NOW, sha256,
      });
      expect(out.ok, field).toBe(false);
      expect(out.error, field).toBe("server_owned_field_in_patch");
      expect(out.reason, field).toContain(reader);
    }
  });

  it("applies the catalogue terms for the named plan", async () => {
    const svc = makeSvc();
    const preview = await previewOrganization({ svc, patch: orgPatch(), now: NOW, sha256 });
    expect(preview.preview.applies_terms).toEqual(PLAN_CATALOG.growth);

    const out = await applyOrganization({
      svc, actor: "founder@cambra", patch: orgPatch(),
      expected_preview_hash: preview.preview_hash, now: NOW, sha256,
    });
    const stored = svc.stores.Organization[0];
    expect(out.ok).toBe(true);
    expect(stored.monthly_api_quota).toBe(100000);
    expect(stored.overage_price_per_1k).toBe(0.30);
    expect(stored.rate_limit_per_minute).toBe(300);
  });

  it("shows the terms back before they are applied", async () => {
    const preview = await previewOrganization({ svc: makeSvc(), patch: orgPatch(), now: NOW, sha256 });
    // The old form showed a plan name and wrote the three numbers itself.
    expect(preview.preview.terms_note).toContain("gate API access and bill overage");
  });

  it("refuses a plan that is not in the catalogue", async () => {
    const out = await previewOrganization({
      svc: makeSvc(), patch: orgPatch({ plan: "unlimited" }), now: NOW, sha256,
    });
    expect(out.error).toBe("plan_not_in_catalog");
    expect(out.reason).toContain("enforce them");
  });

  it("refuses a duplicate slug rather than giving two organizations one identifier", async () => {
    const svc = makeSvc({ Organization: [{ id: "o1", slug: "acme-group" }] });
    const out = await previewOrganization({ svc, patch: orgPatch(), now: NOW, sha256 });
    expect(out.error).toBe("slug_taken");
  });

  it("treats an unreadable uniqueness check as unverified, not as passed", async () => {
    const svc = makeSvc({ Organization: [] }, ["Organization"]);
    const out = await previewOrganization({ svc, patch: orgPatch(), now: NOW, sha256 });
    expect(out.error).toBe("slug_uniqueness_unverifiable");
  });

  it("refuses a malformed owner email", async () => {
    const out = await previewOrganization({
      svc: makeSvc(), patch: orgPatch({ owner_email: "nope" }), now: NOW, sha256,
    });
    expect(out.error).toBe("owner_email_malformed");
  });

  it("sets the trial end from the server clock, not the browser's", async () => {
    const preview = await previewOrganization({ svc: makeSvc(), patch: orgPatch(), now: NOW, sha256 });
    expect(preview.preview.trial_ends_at).toBe("2026-08-31T12:00:00.000Z");
  });

  it("reports which production code enforces each term", () => {
    const view = planCatalogView();
    expect(view.enforced_by.monthly_api_quota).toContain("apiV1");
    expect(view.enforced_by.overage_price_per_1k).toContain("apiUsageBilling");
    expect(view.plans).toHaveLength(4);
  });
});

describe("C15 — there is no suspended state, so the action is called cancel", () => {
  const entity = JSON.parse(fs.readFileSync("base44/entities/Organization.jsonc", "utf8"));

  it("confirms the entity has no suspended value", () => {
    // The reason the wording exists. If this ever changes, the cancel copy must be re-derived.
    expect(entity.properties.billing_status.enum).toEqual(["active", "past_due", "canceled", "trial"]);
  });

  it("cancels, requires a reason, and says the action is terminal", async () => {
    const svc = makeSvc({ Organization: [{ id: "o1", billing_status: "active" }] });
    const noReason = await cancelOrganization({ svc, actor: "a", organization_id: "o1", reason: "", now: NOW });
    expect(noReason.error).toBe("reason_required");
    expect(svc.writes).toHaveLength(0);

    const out = await cancelOrganization({ svc, actor: "a", organization_id: "o1", reason: "non-payment", now: NOW });
    expect(out.ok).toBe(true);
    expect(out.terminal).toBe(true);
    expect(out.reversible).toBe(false);
    expect(out.effect_note).toContain("no suspended state");
    expect(svc.stores.Organization[0].billing_status).toBe("canceled");
    expect(svc.stores.Organization[0].suspended_at).toBe(NOW);
  });

  it("refuses to cancel twice", async () => {
    const svc = makeSvc({ Organization: [{ id: "o1", billing_status: "canceled" }] });
    const out = await cancelOrganization({ svc, actor: "a", organization_id: "o1", reason: "r", now: NOW });
    expect(out.error).toBe("already_canceled");
  });
});

describe("C15 — a note author is a person or the note is refused", () => {
  it("refuses a note with no identified actor, and writes nothing", async () => {
    const svc = makeSvc();
    const out = await recordAdminNote({
      svc, actor: "", target_type: "user", target_id: "x@y.z", note: "called them", now: NOW,
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe("unidentified_author");
    // The old code stored "admin" here, which reads as attributable and is not.
    expect(out.reason).toContain("reads as attributable and is not");
    expect(svc.writes).toHaveLength(0);
  });

  it("records the authenticated actor as the author", async () => {
    const svc = makeSvc();
    const out = await recordAdminNote({
      svc, actor: "founder@cambra", target_type: "user", target_id: "x@y.z", note: "called them", now: NOW,
    });
    expect(out.ok).toBe(true);
    expect(svc.stores.AdminNote[0].author).toBe("founder@cambra");
    // Never the literal the browser used to send.
    expect(svc.stores.AdminNote[0].author).not.toBe("admin");
  });

  it("refuses an empty note and a missing target", async () => {
    const svc = makeSvc();
    expect((await recordAdminNote({ svc, actor: "a", target_type: "user", target_id: "x", note: "  ", now: NOW })).error).toBe("note_required");
    expect((await recordAdminNote({ svc, actor: "a", target_type: "", target_id: "x", note: "n", now: NOW })).error).toBe("target_type_required");
    expect(svc.writes).toHaveLength(0);
  });
});

describe("C15 — DealApplication stays retired", () => {
  it("refuses the write with the registry's own evidence", () => {
    const out = refuseDealApplicationWrite("estimated_savings");
    expect(out.ok).toBe(false);
    expect(out.error).toBe("deal_application_retired");
    expect(out.reason).toContain("ZERO_PRODUCERS");
    expect(out.reason).toContain("do not resurrect");
  });

  it("still names the field, so the refusal explains what was attempted", () => {
    expect(refuseDealApplicationWrite("provider_response").field).toBe("provider_response");
  });

  it("agrees with the pipeline registry rather than restating it", () => {
    const registry = JSON.parse(fs.readFileSync("config/dashboard/pipeline-stage-registry.v1.json", "utf8"));
    expect(registry.retired_authority.entity).toBe("DealApplication");
    expect(registry.retired_authority.state).toBe("ZERO_PRODUCERS");
  });
});
