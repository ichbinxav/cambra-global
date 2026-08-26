// CAMP-C2 (2026-08-16) — behavior tests for the Campaigns read/draft
// foundation (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C2).
//
// Every test INVOKES handleCampaignAdminAction against an in-memory entity
// store and asserts observable behavior: what the response says, what got
// written, and — critically — that no path performs an external effect.
import { describe, expect, it } from "vitest";
import { handleCampaignAdminAction } from "../../base44/shared/campaignAdminCore.ts";
import {
  buildCampaignsOverview,
  filterCampaignSummaries,
  projectCampaignSummary,
} from "../../base44/shared/campaignsReadModel.ts";

const ADMIN = { id: "founder-1", email: "founder@cambra.global", role: "admin" };

function matches(row, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (expected && typeof expected === "object" && Array.isArray(expected.$in)) {
      return expected.$in.includes(row[key]);
    }
    return String(row[key]) === String(expected);
  });
}

function makeEntity(rows = [], behavior = {}) {
  const store = rows.map((row) => ({ ...row }));
  const calls = [];
  return {
    store,
    calls,
    async list(_sort, limit) {
      calls.push({ op: "list" });
      if (behavior.listThrows) throw new Error(behavior.listThrows);
      return store.slice(0, typeof limit === "number" ? limit : store.length).map((row) => ({ ...row }));
    },
    async filter(query, _sort, limit) {
      calls.push({ op: "filter", query });
      if (behavior.filterThrows) throw new Error(behavior.filterThrows);
      const found = store.filter((row) => matches(row, query));
      return (typeof limit === "number" ? found.slice(0, limit) : found).map((row) => ({ ...row }));
    },
    async get(id) {
      calls.push({ op: "get", id });
      const row = store.find((candidate) => String(candidate.id) === String(id));
      return row ? { ...row } : null;
    },
    async create(value) {
      calls.push({ op: "create", value });
      if (behavior.createThrows) throw new Error(behavior.createThrows);
      const row = { id: `row-${store.length + 1}`, ...value };
      store.push(row);
      return { ...row };
    },
    async update(id, patch) {
      calls.push({ op: "update", id, patch });
      const row = store.find((candidate) => String(candidate.id) === String(id));
      if (!row) throw new Error("row_not_found");
      Object.assign(row, patch);
      return { ...row };
    },
  };
}

function makeSvc(rows = {}, behavior = {}) {
  const entities = {};
  return {
    entities: new Proxy(entities, {
      get(target, name) {
        const key = String(name);
        if (!target[key]) target[key] = makeEntity(rows[key] || [], behavior[key] || {});
        return target[key];
      },
    }),
  };
}

async function jsonOf(response) {
  return { status: response.status, body: await response.json() };
}

const GLOBAL_CONTROL = { id: "oc-1", control_key: "global", acquisition_enabled: false };
const GLOBAL_EMERGENCY = { id: "ec-1", control_key: "global", safe_mode: false };

describe("C2 — authorization", () => {
  it("refuses a non-admin before reading anything", async () => {
    const svc = makeSvc();
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction({ id: "u", email: "u@x.com", role: "user" }, { action: "list" }, svc),
    );
    expect(status).toBe(403);
    expect(body.error).toBe("admin_required");
    expect(svc.entities.CommercialCampaign.calls).toHaveLength(0);
  });

  it("refuses a missing user", async () => {
    const { status } = await jsonOf(await handleCampaignAdminAction(null, { action: "overview" }, makeSvc()));
    expect(status).toBe(403);
  });
});

describe("C2 — list projects canonical state and filters honestly", () => {
  const CAMPAIGNS = [
    { id: "c1", campaign_key: "k1", name: "FR fashion CFOs", status: "PILOT", lane: "MERCHANT_ACQUISITION", market_scope: ["ES"], created_by: "founder@cambra.global", lead_ids: ["l1", "l2"], blockers: [] },
    { id: "c2", campaign_key: "k2", name: "Accountant partners", status: "DRAFT", lane: "PARTNER_ACQUISITION", market_scope: ["FR"], created_by: "other@cambra.global", lead_ids: [], blockers: ["campaign_not_prepared"] },
    { id: "c3", campaign_key: "k3", name: "Acquirer outreach", status: "READY_FOR_PILOT", lane: "PROVIDER_RELATIONS", market_scope: ["ES"], created_by: "founder@cambra.global", lead_ids: ["l3"], blockers: [] },
  ];

  it("maps legacy statuses to canonical ones without rewriting the stored value", async () => {
    const svc = makeSvc({ CommercialCampaign: CAMPAIGNS });
    const { status, body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "list" }, svc));
    expect(status).toBe(200);
    const pilot = body.items.find((row) => row.id === "c1");
    expect(pilot.status).toBe("RUNNING");
    expect(pilot.stored_status).toBe("PILOT");
    expect(pilot.status_is_legacy).toBe(true);
    // Storage untouched:
    expect(svc.entities.CommercialCampaign.store.find((row) => row.id === "c1").status).toBe("PILOT");
    expect(svc.entities.CommercialCampaign.calls.some((call) => call.op === "update")).toBe(false);
  });

  it("filters by canonical status, lane, market, owner and needs_attention", async () => {
    const svc = makeSvc({ CommercialCampaign: CAMPAIGNS });
    const run = async (filters) =>
      (await (await handleCampaignAdminAction(ADMIN, { action: "list", ...filters }, svc)).json()).items.map((row) => row.id);
    expect(await run({ status: "RUNNING" })).toEqual(["c1"]);
    expect(await run({ lane: "PARTNER_ACQUISITION" })).toEqual(["c2"]);
    expect(await run({ market: "ES" })).toEqual(["c1", "c3"]);
    expect(await run({ owner: "other@cambra.global" })).toEqual(["c2"]);
    expect(await run({ needs_attention: true })).toEqual(["c2"]);
    expect(await run({ search: "acquirer" })).toEqual(["c3"]);
  });

  it("returns 503 with an explicit blocker when the campaign source is unavailable — never an empty list", async () => {
    const svc = makeSvc({ CommercialCampaign: [] }, { CommercialCampaign: { listThrows: "db_down" } });
    const { status, body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "list" }, svc));
    expect(status).toBe(503);
    expect(body.data_status).toBe("UNAVAILABLE");
    expect(body.blockers).toContain("commercial_campaign_source_unavailable");
    expect(body.items).toEqual([]);
  });
});

describe("C2 — overview KPIs are honest", () => {
  it("reports UNKNOWN (not zero) for every KPI when the source failed", async () => {
    const svc = makeSvc({}, { CommercialCampaign: { listThrows: "db_down" } });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "overview" }, svc));
    const active = body.kpis.find((row) => row.key === "active_campaigns");
    expect(active.status).toBe("UNKNOWN");
    expect(active.value).toBeNull();
    expect(active.blocker).toBeTruthy();
    expect(body.data_status).toBe("UNAVAILABLE");
  });

  it("gives every KPI a formula, denominator, source and freshness", async () => {
    const svc = makeSvc({
      CommercialCampaign: [{ id: "c1", status: "RUNNING", updated_at: "2026-08-16T10:00:00.000Z", lead_ids: [], blockers: [] }],
      OutboundControl: [GLOBAL_CONTROL],
      EmergencyControl: [GLOBAL_EMERGENCY],
    });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "overview" }, svc));
    for (const row of body.kpis) {
      expect(row.formula, row.key).toBeTruthy();
      expect(row.denominator, row.key).toBeTruthy();
      expect(row.source, row.key).toBeTruthy();
      expect(row.scope, row.key).toBeTruthy();
      expect(["OBSERVED", "UNKNOWN"]).toContain(row.status);
    }
    expect(body.kpis.find((row) => row.key === "active_campaigns").value).toBe(1);
  });

  it("keeps delivery KPIs UNKNOWN until the C4 execution engine exists, instead of claiming zero delivered", async () => {
    const svc = makeSvc({ CommercialCampaign: [{ id: "c1", status: "RUNNING", lead_ids: [], blockers: [] }] });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "overview" }, svc));
    for (const key of ["provider_accepted_today", "delivered_observed_today", "replies_today"]) {
      const row = body.kpis.find((candidate) => candidate.key === key);
      expect(row.status, key).toBe("UNKNOWN");
      expect(row.value, key).toBeNull();
      expect(row.blocker, key).toBe("execution_engine_pending_c4");
    }
  });

  it("reports outbound posture and SAFE MODE from their authorities, UNKNOWN when ambiguous", async () => {
    const healthy = makeSvc({
      CommercialCampaign: [],
      OutboundControl: [GLOBAL_CONTROL],
      EmergencyControl: [{ ...GLOBAL_EMERGENCY, safe_mode: true }],
    });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "overview" }, healthy));
    expect(body.outbound_posture.status).toBe("PAUSED_ZERO");
    expect(body.outbound_posture.safe_mode).toBe("SAFE_MODE_ACTIVE");

    // Two rows for a singleton authority must not silently pick the first.
    const split = makeSvc({
      CommercialCampaign: [],
      OutboundControl: [GLOBAL_CONTROL, { ...GLOBAL_CONTROL, id: "oc-2", acquisition_enabled: true }],
      EmergencyControl: [GLOBAL_EMERGENCY],
    });
    const ambiguous = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "overview" }, split));
    expect(ambiguous.body.outbound_posture.status).toBe("UNKNOWN");
  });
});

describe("C2 — campaign builder options", () => {
  it("returns real leads, target profiles and sender identities without performing an external effect", async () => {
    const svc = makeSvc({
      OutboundLead: [
        {
          id: "ready", company_name: "Acme", company_domain: "acme.test", contact_full_name: "Ada Lovelace",
          contact_email: "ada@acme.test", country: "ES", contactability: "PROFESSIONAL_VERIFIED",
          outreach_eligibility: "ELIGIBLE", compliance_status: "CLEARED", icp_score: 91,
        },
        { id: "needs-email", company_name: "Globex", country: "FR", outreach_eligibility: "NOT_ASSESSED", compliance_status: "REVIEW_REQUIRED" },
        { id: "blocked", company_name: "Suppressed", contact_email: "stop@example.test", reservoir_state: "suppressed" },
      ],
      CommercialPolicy: [{
        id: "policy-1", engine: "merchant_acquisition", policy_key: "merchant:1", version: "v1", status: "draft",
        countries: ["ES"], daily_send_limit: 10, icp_json: { profile_name: "Spanish merchants", provider_mode: "AUTO" },
      }],
      OutboundSendingProfile: [{
        id: "sender-1", profile_key: "instantly:acme", provider: "instantly", domain: "mail.acme.test",
        from_address: "xavi@mail.acme.test", status: "active", current_daily_cap: 5, target_daily_cap: 10,
        webhook_status: "ACTIVE", provider_config_json: { sender_ready: true, native_ai_conflict: false },
      }],
      OutboundControl: [{ id: "control-1", control_key: "global", acquisition_enabled: false }],
    });

    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "builder_options", limit: 50 }, svc),
    );

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.external_send_performed).toBe(false);
    expect(body.outbound_posture).toEqual({ status: "PAUSED_ZERO", capacity: 0 });
    expect(body.lead_counts).toEqual({ total: 3, returned: 3, ready: 1, review_required: 1, blocked: 1 });
    expect(body.leads.map((lead) => lead.id)).toEqual(["ready", "needs-email", "blocked"]);
    expect(body.target_profiles[0].name).toBe("Spanish merchants");
    expect(body.senders[0]).toMatchObject({ profile_key: "instantly:acme", from_address: "xavi@mail.acme.test", readiness: { ready: true, cap: 5 } });
  });

  it("fails visibly when a required builder source is unreadable", async () => {
    const svc = makeSvc(
      { OutboundLead: [], CommercialPolicy: [], OutboundSendingProfile: [], OutboundControl: [GLOBAL_CONTROL] },
      { OutboundSendingProfile: { listThrows: "sender_store_down" } },
    );
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "builder_options" }, svc),
    );
    expect(status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("campaign_builder_sources_unavailable");
    expect(body.source_coverage.status).toBe("UNAVAILABLE");
  });
});

describe("C2 — create draft", () => {
  const LEADS = [
    { id: "l1", canonical_company_key: "acme", outreach_eligibility: "ELIGIBLE", compliance_status: "CLEARED" },
    { id: "l2", canonical_company_key: "globex", outreach_eligibility: "ELIGIBLE", compliance_status: "CLEARED" },
    { id: "blocked", canonical_company_key: "bad", reservoir_state: "suppressed" },
  ];

  it("creates a DRAFT with the lane and never performs an external effect", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, {
        action: "create_draft",
        name: "Barcelona fashion",
        lane: "MERCHANT_ACQUISITION",
        objective_type: "BOOK_MEETING",
        market_scope: ["ES"],
        lead_ids: ["l1", "l2"],
      }, svc),
    );
    expect(status).toBe(200);
    expect(body.external_send_performed).toBe(false);
    const stored = svc.entities.CommercialCampaign.store[0];
    expect(stored.status).toBe("DRAFT");
    expect(stored.lane).toBe("MERCHANT_ACQUISITION");
    expect(stored.market_scope).toEqual(["ES"]);
    expect(stored.blockers).toContain("founder_pilot_authorization_required");
    expect(body.item.status).toBe("DRAFT");
    expect(body.item.lane).toBe("MERCHANT_ACQUISITION");
    expect(body.item.engine).toBe("merchant_acquisition");
  });

  it("rejects an unsupported lane before writing anything", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "create_draft", lane: "SOMETHING_ELSE", lead_ids: ["l1"] }, svc),
    );
    expect(status).toBe(400);
    expect(body.error).toBe("unsupported_campaign_lane");
    expect(svc.entities.CommercialCampaign.store).toHaveLength(0);
  });

  it("refuses a campaign containing a suppressed lead", async () => {
    const svc = makeSvc({ OutboundLead: LEADS });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "create_draft", lead_ids: ["l1", "blocked"] }, svc),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("campaign_contains_blocked_leads");
    expect(body.blocked_lead_ids).toEqual(["blocked"]);
    expect(svc.entities.CommercialCampaign.store).toHaveLength(0);
  });

  it("fails closed (503) and flags the campaign when the audit log cannot be written", async () => {
    const svc = makeSvc({ OutboundLead: LEADS }, { OperationalLog: { createThrows: "audit_down" } });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "create_draft", lead_ids: ["l1"] }, svc),
    );
    expect(status).toBe(503);
    expect(body.error).toBe("campaign_audit_persistence_failed");
    expect(body.review_required).toBe(true);
    expect(svc.entities.CommercialCampaign.store[0].blockers).toContain("campaign_audit_persistence_failed");
  });
});

describe("C2 — detail reports canonical-model gaps instead of inventing versions", () => {
  it("marks a legacy campaign's missing versioned authorities as gaps", async () => {
    const svc = makeSvc({
      CommercialCampaign: [{
        id: "c1", campaign_key: "k1", name: "Legacy", status: "READY_FOR_PILOT",
        lead_ids: ["l1", "l2"], audience_snapshot_json: { lead_count: 2 },
        message_json: { subject: "hi" }, sequence_json: { status: "NOT_PREPARED" }, blockers: [],
      }],
    });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "detail", campaign_id: "c1" }, svc),
    );
    expect(status).toBe(200);
    expect(body.canonical_model_gaps).toEqual([
      "no_versioned_audience", "no_versioned_content", "no_versioned_sequence",
    ]);
    expect(body.item.audience_version_id).toBeNull();
    expect(body.legacy_projection.lead_ids_count).toBe(2);
    expect(body.legacy_projection.message_prepared).toBe(true);
    expect(body.legacy_projection.sequence_prepared).toBe(false);
    expect(body.item.status).toBe("READY_FOR_APPROVAL");
  });

  it("surfaces real versioned authorities when they exist", async () => {
    const svc = makeSvc({
      CommercialCampaign: [{ id: "c1", name: "Modern", status: "DRAFT", lead_ids: [], blockers: [], audience_current_version_id: "av-1" }],
      CampaignAudienceVersion: [{ id: "av-1", campaign_id: "c1", version: 1, status: "FROZEN", final_eligible_count: 42 }],
      CampaignContentVersion: [{ id: "cv-1", campaign_id: "c1", version: 1, status: "APPROVED" }],
      CampaignSequenceVersion: [{ id: "sv-1", campaign_id: "c1", version: 1, status: "APPROVED" }],
    });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "detail", campaign_id: "c1" }, svc));
    expect(body.canonical_model_gaps).toEqual([]);
    expect(body.audience_versions[0].final_eligible_count).toBe(42);
    expect(body.item.audience_version_id).toBe("av-1");
  });

  it("returns 404 for an unknown campaign and 409 for an ambiguous authority", async () => {
    const missing = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "detail", campaign_id: "nope" }, makeSvc({ CommercialCampaign: [] })),
    );
    expect(missing.status).toBe(404);
    const duplicated = makeSvc({
      CommercialCampaign: [{ id: "dup", status: "DRAFT", lead_ids: [] }, { id: "dup", status: "DRAFT", lead_ids: [] }],
    });
    const ambiguous = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "detail", campaign_id: "dup" }, duplicated),
    );
    expect(ambiguous.status).toBe(409);
    expect(ambiguous.body.error).toBe("campaign_authority_ambiguous");
  });
});

describe("C2 — existing lifecycle actions keep working after the refactor", () => {
  it("update_draft still edits a legacy READY_FOR_PILOT campaign", async () => {
    const svc = makeSvc({ CommercialCampaign: [{ id: "c1", status: "READY_FOR_PILOT", name: "Old", lead_ids: [], blockers: [] }] });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "update_draft", campaign_id: "c1", name: "New name", lane: "MERCHANT_LIFECYCLE" }, svc),
    );
    expect(status).toBe(200);
    expect(svc.entities.CommercialCampaign.store[0].name).toBe("New name");
    expect(svc.entities.CommercialCampaign.store[0].lane).toBe("MERCHANT_LIFECYCLE");
    expect(body.external_send_performed).toBe(false);
  });

  it("update_draft refuses a running campaign and reports the canonical status", async () => {
    const svc = makeSvc({ CommercialCampaign: [{ id: "c1", status: "ACTIVE", lead_ids: [], blockers: [] }] });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "update_draft", campaign_id: "c1", name: "x" }, svc),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("active_campaign_not_editable");
    expect(body.status).toBe("RUNNING");
  });

  it("prepare_pilot still requires its confirmation token", async () => {
    const svc = makeSvc({ CommercialCampaign: [{ id: "c1", status: "DRAFT", lead_ids: [], blockers: [] }] });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "prepare_pilot", campaign_id: "c1" }, svc),
    );
    expect(status).toBe(409);
    expect(body.error).toBe("confirmation_required");
    expect(body.expected_confirmation).toBe("PREPARE_CAMPAIGN_FOR_PILOT");
  });

  it("pause records the founder pause without claiming a transport-wide stop", async () => {
    const svc = makeSvc({ CommercialCampaign: [{ id: "c1", status: "ACTIVE", lead_ids: [], blockers: [] }] });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "pause", campaign_id: "c1" }, svc));
    expect(svc.entities.CommercialCampaign.store[0].status).toBe("PAUSED");
    expect(svc.entities.CommercialCampaign.store[0].blockers).toContain("paused_by_founder");
    expect(body.note).toContain("Founder Control");
    expect(body.external_send_performed).toBe(false);
  });

  it("rejects an unsupported action", async () => {
    const svc = makeSvc({ CommercialCampaign: [{ id: "c1", status: "DRAFT", lead_ids: [] }] });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "launch_now", campaign_id: "c1" }, svc),
    );
    expect(status).toBe(400);
    expect(body.error).toBe("unsupported_action");
  });
});

describe("C2 — read-model projections (pure)", () => {
  it("never reports a metric as zero when the counter is absent", () => {
    const projected = projectCampaignSummary({ id: "c1", status: "DRAFT", metrics_json: {} });
    expect(projected.metrics.replied).toBeNull();
    expect(projected.metrics.meetings).toBeNull();
    const withData = projectCampaignSummary({ id: "c2", status: "DRAFT", metrics_json: { replied: 0 } });
    expect(withData.metrics.replied).toBe(0);
  });

  it("does not treat an inline NOT_PREPARED message as prepared content", () => {
    expect(projectCampaignSummary({ status: "DRAFT", message_json: { status: "NOT_PREPARED" } }).legacy_message_prepared).toBe(false);
    expect(projectCampaignSummary({ status: "DRAFT", message_json: { subject: "hi" } }).legacy_message_prepared).toBe(true);
  });

  it("an unknown filter value matches nothing rather than everything", () => {
    const rows = [projectCampaignSummary({ id: "c1", status: "DRAFT", lane: "MERCHANT_ACQUISITION" })];
    expect(filterCampaignSummaries(rows, { lane: "NOT_A_LANE" })).toEqual([]);
    expect(filterCampaignSummaries(rows, { lane: "ALL" })).toHaveLength(1);
    expect(filterCampaignSummaries(rows, {})).toHaveLength(1);
  });

  it("an overview built from an unavailable source exposes no campaign rows", () => {
    const overview = buildCampaignsOverview({ campaigns: [{ id: "leaked" }], campaignsAvailable: false });
    expect(overview.needs_attention).toEqual([]);
    expect(overview.data_status).toBe("UNAVAILABLE");
    expect(overview.kpis.every((row) => row.value === null)).toBe(true);
  });
});
