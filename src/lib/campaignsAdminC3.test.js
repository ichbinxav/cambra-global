// CAMP-C3 (2026-08-16) — behavior tests for the C3 admin actions
// (build_audience, freeze_audience, validate_content, validate_sequence,
// preflight, request_approval). Every test invokes the real handler against an
// in-memory store and asserts what was written and what was refused.
import { describe, expect, it } from "vitest";
import { handleCampaignAdminAction } from "../../base44/shared/campaignAdminCore.ts";
import { MANDATORY_STOP_CONDITIONS } from "../../base44/shared/campaignSequenceValidator.ts";

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
      if (behavior.throws) throw new Error(behavior.throws);
      return store.slice(0, limit ?? store.length).map((row) => ({ ...row }));
    },
    async filter(query, _sort, limit) {
      calls.push({ op: "filter", query });
      if (behavior.throws) throw new Error(behavior.throws);
      const found = store.filter((row) => matches(row, query));
      return (typeof limit === "number" ? found.slice(0, limit) : found).map((row) => ({ ...row }));
    },
    async get(id) {
      calls.push({ op: "get", id });
      if (behavior.throws) throw new Error(behavior.throws);
      const row = store.find((candidate) => String(candidate.id) === String(id));
      return row ? { ...row } : null;
    },
    async create(value) {
      calls.push({ op: "create", value });
      const row = { id: `${value.audience_version_id || value.content_version_id || value.sequence_version_id || "row"}-${store.length + 1}`, ...value };
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

const CAMPAIGN = {
  id: "c1", campaign_key: "k1", name: "ES fashion", status: "DRAFT",
  lead_ids: ["l1", "l2", "l3"], blockers: [], market_scope: ["ES"],
  sending_profile_keys: ["p1"], budget_limit_minor: 50_000,
  target_profile_id: "policy-1", policy_version: "3",
};

const LEADS = [
  { id: "l1", contact_email: "cfo@acme.example", canonical_company_key: "acme", country: "ES", outreach_eligibility: "ELIGIBLE", compliance_status: "CLEARED" },
  { id: "l2", contact_email: "cfo@globex.example", canonical_company_key: "globex", country: "ES", outreach_eligibility: "ELIGIBLE", compliance_status: "CLEARED" },
  { id: "l3", contact_email: "cfo@paris.example", canonical_company_key: "paris", country: "FR", outreach_eligibility: "ELIGIBLE", compliance_status: "CLEARED" },
];

describe("C3 — build_audience", () => {
  it("creates a versioned audience whose reconciliation adds up and excludes the protected market", async () => {
    const svc = makeSvc({ CommercialCampaign: [CAMPAIGN], OutboundLead: LEADS, ContactSuppression: [] });
    const { status, body } = await jsonOf(
      await handleCampaignAdminAction(ADMIN, { action: "build_audience", campaign_id: "c1" }, svc),
    );
    expect(status).toBe(200);
    expect(body.reconciles).toBe(true);
    expect(body.reconciliation.selected_count).toBe(3);
    expect(body.reconciliation.protected_market_count).toBe(1);
    expect(body.reconciliation.final_eligible_count).toBe(2);
    expect(body.external_send_performed).toBe(false);

    const version = svc.entities.CampaignAudienceVersion.store[0];
    expect(version.version).toBe(1);
    expect(version.status).toBe("READY");
    expect(version.content_hash).toBeTruthy();
    expect(version.canonical_subject_ids).toEqual(["l1", "l2"]);
    // The campaign now points at the version.
    expect(svc.entities.CommercialCampaign.store[0].audience_current_version_id).toBe(version.id);
  });

  it("refuses to build when the suppression ledger cannot be read — never 'nobody is suppressed'", async () => {
    const svc = makeSvc(
      { CommercialCampaign: [CAMPAIGN], OutboundLead: LEADS },
      { ContactSuppression: { throws: "suppression_store_down" } },
    );
    const response = await handleCampaignAdminAction(ADMIN, { action: "build_audience", campaign_id: "c1" }, svc)
      .catch((error) => error);
    // requireRuntimeSource throws a 503-shaped error rather than continuing.
    expect(response?.status ?? response?.status).toBe(503);
    expect(svc.entities.CampaignAudienceVersion.store).toHaveLength(0);
  });

  it("marks an audience with zero eligible recipients as REVIEW_REQUIRED", async () => {
    const svc = makeSvc({
      CommercialCampaign: [{ ...CAMPAIGN, lead_ids: ["l3"] }],
      OutboundLead: [LEADS[2]],
      ContactSuppression: [],
    });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "build_audience", campaign_id: "c1" }, svc));
    expect(body.reconciliation.final_eligible_count).toBe(0);
    expect(svc.entities.CampaignAudienceVersion.store[0].status).toBe("REVIEW_REQUIRED");
  });

  it("increments the version instead of overwriting the previous one", async () => {
    const svc = makeSvc({
      CommercialCampaign: [CAMPAIGN], OutboundLead: LEADS, ContactSuppression: [],
      CampaignAudienceVersion: [{ id: "old", campaign_id: "c1", version: 1, status: "FROZEN" }],
    });
    await handleCampaignAdminAction(ADMIN, { action: "build_audience", campaign_id: "c1" }, svc);
    expect(svc.entities.CampaignAudienceVersion.store).toHaveLength(2);
    expect(svc.entities.CampaignAudienceVersion.store[1].version).toBe(2);
    // The old frozen version is untouched.
    expect(svc.entities.CampaignAudienceVersion.store[0].status).toBe("FROZEN");
  });
});

describe("C3 — freeze_audience", () => {
  it("freezes a READY version and is idempotent", async () => {
    const svc = makeSvc({
      CommercialCampaign: [{ ...CAMPAIGN, audience_current_version_id: "av1" }],
      CampaignAudienceVersion: [{ id: "av1", campaign_id: "c1", version: 1, status: "READY" }],
    });
    const first = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "freeze_audience", campaign_id: "c1" }, svc));
    expect(first.body.audience_version.status).toBe("FROZEN");
    expect(first.body.audience_version.frozen_at).toBeTruthy();
    const again = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "freeze_audience", campaign_id: "c1" }, svc));
    expect(again.body.already_frozen).toBe(true);
  });

  it("refuses to freeze a REVIEW_REQUIRED audience", async () => {
    const svc = makeSvc({
      CommercialCampaign: [{ ...CAMPAIGN, audience_current_version_id: "av1" }],
      CampaignAudienceVersion: [{ id: "av1", campaign_id: "c1", version: 1, status: "REVIEW_REQUIRED" }],
    });
    const { status, body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "freeze_audience", campaign_id: "c1" }, svc));
    expect(status).toBe(409);
    expect(body.error).toBe("audience_version_not_ready");
  });
});

describe("C3 — content and sequence versions", () => {
  const GOOD_CONTENT = {
    subject: "Card-payment costs at {{company_name}}",
    text_body: "Hi {{first_name}}, we help European brands understand card-payment costs. Reply to unsubscribe.",
    language: "en",
    variable_schema_json: { first_name: { required: true, fallback: "there" }, company_name: { required: true } },
  };

  it("promotes only a VALIDATED content version to current", async () => {
    const svc = makeSvc({ CommercialCampaign: [CAMPAIGN] });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, {
      action: "validate_content", campaign_id: "c1", persist: true,
      content: GOOD_CONTENT, sample: [{ subject_id: "l1", values: { company_name: "Acme" } }],
    }, svc));
    expect(body.validation.status).toBe("VALIDATED");
    expect(body.promoted).toBe(true);
    expect(svc.entities.CommercialCampaign.store[0].content_current_version_id).toBe(body.content_version.id);
  });

  it("stores a blocked-claims version as evidence but never promotes it", async () => {
    const svc = makeSvc({ CommercialCampaign: [CAMPAIGN] });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, {
      action: "validate_content", campaign_id: "c1", persist: true,
      content: { ...GOOD_CONTENT, text_body: "You are overpaying €80,000. Reply to unsubscribe." },
      sample: [{ subject_id: "l1", values: { company_name: "Acme", first_name: "Ana" } }],
    }, svc));
    expect(body.validation.status).toBe("REVIEW_REQUIRED");
    expect(body.promoted).toBe(false);
    expect(body.content_version.blocked_claims).toContain("SPECIFIC_ECONOMIC_CLAIM");
    expect(svc.entities.CommercialCampaign.store[0].content_current_version_id).toBeUndefined();
  });

  it("validates without persisting when persist is not requested", async () => {
    const svc = makeSvc({ CommercialCampaign: [CAMPAIGN] });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, {
      action: "validate_content", campaign_id: "c1", content: GOOD_CONTENT,
      sample: [{ values: { company_name: "Acme" } }],
    }, svc));
    expect(body.persisted).toBe(false);
    expect(svc.entities.CampaignContentVersion.store).toHaveLength(0);
  });

  it("promotes only a VALIDATED sequence version", async () => {
    const svc = makeSvc({ CommercialCampaign: [CAMPAIGN] });
    const sequence = {
      steps: [
        { step_key: "s1", ordinal: 1, delay_amount: 0, delay_unit: "HOURS", max_attempts: 1 },
        { step_key: "s2", ordinal: 2, delay_amount: 3, delay_unit: "BUSINESS_DAYS", max_attempts: 1 },
      ],
      stop_conditions: [...MANDATORY_STOP_CONDITIONS],
      business_hours_policy_json: { start: "09:00", end: "18:00" },
      timezone_policy: "RECIPIENT_LOCAL",
      out_of_office_policy_json: { max_reschedules: 1, counts_as_negative_reply: false },
      max_followups: 3,
    };
    const good = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "validate_sequence", campaign_id: "c1", persist: true, sequence }, svc));
    expect(good.body.promoted).toBe(true);

    const bad = await jsonOf(await handleCampaignAdminAction(ADMIN, {
      action: "validate_sequence", campaign_id: "c1", persist: true,
      sequence: { ...sequence, stop_conditions: ["UNSUBSCRIBE"] },
    }, svc));
    expect(bad.body.promoted).toBe(false);
    expect(bad.body.validation.missing_stop_conditions).toContain("ANY_HUMAN_REPLY");
  });
});

describe("C3 — preflight and approval", () => {
  function readySvc(overrides = {}) {
    return makeSvc({
      CommercialCampaign: [{
        ...CAMPAIGN,
        audience_current_version_id: "av1",
        content_current_version_id: "cv1",
        sequence_current_version_id: "sv1",
        ...overrides.campaign,
      }],
      CampaignAudienceVersion: [{ id: "av1", campaign_id: "c1", version: 1, status: "FROZEN", final_eligible_count: 120, content_hash: "ah1" }],
      CampaignContentVersion: [{ id: "cv1", campaign_id: "c1", version: 1, status: "VALIDATED", content_hash: "ch1", blocked_claims: [], quality_gate_json: { blockers: [] } }],
      CampaignSequenceVersion: [{ id: "sv1", campaign_id: "c1", version: 1, status: "VALIDATED", sequence_hash: "sh1" }],
      OutboundSendingProfile: [{ id: "p", profile_key: "p1", status: "active", current_daily_cap: 50, webhook_status: "ACTIVE" }],
      CommercialPolicy: [{ id: "policy-1", status: "active", policy_key: "merchant-acq", version: "3" }],
      OutboundControl: [{ id: "oc1", control_key: "global", acquisition_enabled: true }],
      EmergencyControl: [{ id: "ec1", control_key: "global", safe_mode: false, communications_paused: false, control_revision: 7 }],
      ...overrides.entities,
    }, overrides.behavior || {});
  }

  // COMMAND-C1 (2026-08-17): this used to assert the dimension was permanently
  // UNKNOWN because the FounderPermit authority did not exist. It now exists,
  // so the honest verdict for a campaign with no permit bound is BLOCKED — the
  // authority answered, and the answer is "nothing covers this". Approval is
  // still refused, which is the invariant that actually matters.
  it("refuses approval when no FounderPermit covers the campaign", async () => {
    const svc = readySvc();
    const preflight = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    expect(preflight.body.preflight.blocked_dimensions).toContain("founder_permit");
    expect(preflight.body.preflight.unknown_dimensions).not.toContain("founder_permit");
    expect(preflight.body.preflight.approvable).toBe(false);

    const approval = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "request_approval", campaign_id: "c1" }, svc));
    expect(approval.status).toBe(409);
    expect(approval.body.error).toBe("preflight_not_passed");
    // Nothing was promoted to READY_FOR_APPROVAL.
    expect(svc.entities.CommercialCampaign.store[0].status).toBe("DRAFT");
  });

  it("passes the permit dimension — and reaches approval — once a valid permit covers the campaign", async () => {
    const svc = readySvc({
      campaign: { founder_permit_id: "permit-1" },
      entities: {
        FounderPermit: [{
          id: "permit-1", permit_id: "permit-1", objective: "Launch the ES fashion campaign",
          issued_by: "founder@cambra.global", status: "ACTIVE", preset: "OPERATE",
          permit_hash: "permit-hash-1",
          allowed_domains: ["campaign"],
          allowed_tool_ids: ["cambra.campaign.request_approval"],
          allowed_effect_classes: ["campaign_config"],
          allowed_entity_types: ["CommercialCampaign"],
          allowed_markets: ["ES"],
          allowed_environments: ["production"],
          explicit_denials: [],
          valid_from: "2020-01-01T00:00:00.000Z",
          expires_at: "2099-01-01T00:00:00.000Z",
          emergency_control_revision: 7,
        }],
      },
    });
    const preflight = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    const permitDimension = preflight.body.preflight.dimensions.find((row) => row.key === "founder_permit");
    expect(permitDimension.status).toBe("PASS");
    expect(preflight.body.preflight.approvable).toBe(true);

    // The whole point of C1: a campaign can now actually reach READY_FOR_APPROVAL.
    const approval = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "request_approval", campaign_id: "c1" }, svc));
    expect(approval.status).toBe(200);
    expect(approval.body.approval.approval_hash).toBeTruthy();
    expect(svc.entities.CommercialCampaign.store[0].status).toBe("READY_FOR_APPROVAL");
    // Approving is still not sending.
    expect(approval.body.external_send_performed).toBe(false);
  });

  it("refuses the permit dimension when the emergency stop is active, even with a valid permit", async () => {
    const svc = readySvc({
      campaign: { founder_permit_id: "permit-1" },
      entities: {
        EmergencyControl: [{ id: "ec1", control_key: "global", safe_mode: true, communications_paused: true, control_revision: 9 }],
        FounderPermit: [{
          id: "permit-1", permit_id: "permit-1", objective: "Launch", issued_by: "f@c.com",
          status: "ACTIVE", preset: "FOUNDER_ROOT", permit_hash: "h",
          allowed_domains: [], allowed_tool_ids: [], allowed_effect_classes: [], allowed_entity_types: [],
          allowed_markets: [], allowed_environments: [], explicit_denials: [],
          valid_from: "2020-01-01T00:00:00.000Z", expires_at: "2099-01-01T00:00:00.000Z",
          emergency_control_revision: 9,
        }],
      },
    });
    const preflight = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    // Both the emergency dimension and the permit dimension refuse: a permit
    // never lifts the emergency stop, not even at FOUNDER_ROOT.
    expect(preflight.body.preflight.blocked_dimensions).toContain("emergency");
    expect(preflight.body.preflight.blocked_dimensions).toContain("founder_permit");
    expect(preflight.body.preflight.approvable).toBe(false);
  });

  it("treats an unreadable permit as not covering the campaign", async () => {
    const svc = readySvc({
      campaign: { founder_permit_id: "permit-1" },
      behavior: { FounderPermit: { throws: "permit_store_down" } },
    });
    const preflight = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    expect(preflight.body.preflight.blocked_dimensions).toContain("founder_permit");
    expect(preflight.body.preflight.approvable).toBe(false);
  });

  it("blocks the preflight when outbound is globally paused", async () => {
    const svc = readySvc({ entities: { OutboundControl: [{ id: "oc1", control_key: "global", acquisition_enabled: false }] } });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    expect(body.preflight.blocked_dimensions).toContain("outbound_control");
    expect(body.preflight.verdict).toBe("BLOCKED");
  });

  it("blocks the preflight under SAFE MODE", async () => {
    const svc = readySvc({ entities: { EmergencyControl: [{ id: "ec1", control_key: "global", safe_mode: true }] } });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    expect(body.preflight.blocked_dimensions).toContain("emergency");
  });

  it("requires the audience to be frozen", async () => {
    const svc = readySvc({
      entities: { CampaignAudienceVersion: [{ id: "av1", campaign_id: "c1", version: 1, status: "READY", final_eligible_count: 10 }] },
    });
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    expect(body.preflight.review_dimensions).toContain("audience");
  });

  it("never reports an external effect from a preflight", async () => {
    const svc = readySvc();
    const { body } = await jsonOf(await handleCampaignAdminAction(ADMIN, { action: "preflight", campaign_id: "c1" }, svc));
    expect(body.external_send_performed).toBe(false);
    expect(body.preflight.external_effect_performed).toBe(false);
  });
});
