// @vitest-environment jsdom
// CAMP-C2 (2026-08-16) — UI tests for the Campaigns workspace. These render the
// real page against a mocked base44 client and assert what the founder actually
// sees: honest UNKNOWN KPIs, a fail-visible unavailable state (never a silently
// empty table), canonical status with the legacy value still visible, and the
// explicit "no sends" boundary.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

globalThis.React = React;

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke } } }));

import AdminCampaigns from "../../pages/admin/AdminCampaigns.jsx";

const OVERVIEW = {
  ok: true,
  data_status: "COMPLETE",
  outbound_posture: {
    status: "PAUSED_ZERO",
    safe_mode: "NORMAL",
    truth_boundary: "Outbound posture and SAFE MODE are read from their canonical authorities",
  },
  kpis: [
    {
      key: "active_campaigns", label: "Active campaigns", value: 2, status: "OBSERVED",
      formula: "count(campaigns where canonical status = RUNNING)", denominator: "all campaigns",
      source: "CommercialCampaign", freshness: "2026-08-16T10:00:00.000Z", scope: "all lanes", blocker: null,
    },
    {
      key: "delivered_observed_today", label: "Delivered observed today", value: null, status: "UNKNOWN",
      formula: "count(enrollments with DELIVERED_OBSERVED today)", denominator: "enrollments provider-accepted today",
      source: "OutboundProviderEvent", freshness: null, scope: "today", blocker: "execution_engine_pending_c4",
    },
  ],
  needs_attention: [{ id: "c2", name: "Blocked campaign", status: "DRAFT", blockers: ["campaign_not_prepared"] }],
};

const LIST = {
  ok: true,
  data_status: "COMPLETE",
  total: 2,
  returned: 2,
  blockers: [],
  items: [
    {
      id: "c1", name: "FR fashion CFOs", status: "RUNNING", stored_status: "PILOT", status_is_legacy: true,
      lane: "MERCHANT_ACQUISITION", objective_type: "BOOK_MEETING", markets: ["ES"], owner: "founder@cambra.global",
      legacy_lead_count: 120, needs_attention: false, blockers: [],
      metrics: { provider_accepted: 40, replied: null, meetings: null, selected_leads: 120 },
    },
    {
      id: "c2", name: "Blocked campaign", status: "DRAFT", stored_status: "DRAFT", status_is_legacy: false,
      lane: "PARTNER_ACQUISITION", objective_type: null, markets: [], owner: "founder@cambra.global",
      legacy_lead_count: 0, needs_attention: true, blockers: ["campaign_not_prepared"],
      metrics: { provider_accepted: null, replied: null, meetings: null, selected_leads: 0 },
    },
  ],
};

const DETAIL = {
  ok: true,
  item: {
    id: "c1", name: "FR fashion CFOs", status: "READY_FOR_APPROVAL", stored_status: "READY_FOR_PILOT",
    status_is_legacy: true, lane: "MERCHANT_ACQUISITION", objective_type: "BOOK_MEETING",
    owner: "founder@cambra.global", policy_key: "merchant-acq", blockers: ["campaign_message_required"],
    audience_version_id: null,
  },
  audience_versions: [],
  content_versions: [],
  sequence_versions: [],
  canonical_model_gaps: ["no_versioned_audience", "no_versioned_content", "no_versioned_sequence"],
  legacy_projection: {
    lead_ids_count: 120, message_prepared: true, sequence_prepared: false,
    note: "Legacy campaigns keep lead_ids and the inline message/sequence as their only audience/content evidence",
  },
};

const BUILDER_OPTIONS = {
  ok: true,
  leads: [
    {
      id: "lead-1", company_name: "Acme Payments", company_domain: "acme.example",
      contact_full_name: "Ada Founder", contact_title: "Founder", contact_email: "ada@acme.example",
      country: "ES", industry: "SaaS", score: 91, readiness: "READY", blockers: [],
    },
    {
      id: "lead-2", company_name: "Review Retail", company_domain: "review.example",
      contact_full_name: "", contact_title: "CFO", contact_email: "", country: "IT",
      industry: "Retail", score: 70, readiness: "REVIEW_REQUIRED", blockers: ["VERIFIED_EMAIL_REQUIRED"],
    },
  ],
  lead_counts: { total: 2, returned: 2, ready: 1, review_required: 1, blocked: 0 },
  target_profiles: [{
    id: "policy-1", policy_key: "merchant-acq", version: "v1", name: "Founder pilot",
    status: "paused", countries: ["ES"], daily_send_limit: 0,
    provider_mode: "INSTANTLY", sending_profile_keys: ["instantly-xavi"],
  }],
  senders: [{
    id: "sender-1", profile_key: "instantly-xavi", provider: "instantly", domain: "trycambraglobal.com",
    from_address: "xavi@trycambraglobal.com", status: "paused", current_daily_cap: 0,
    target_daily_cap: 10, webhook_status: "ACTIVE", readiness: { ready: false, cap: 0 },
  }],
  outbound_posture: { status: "PAUSED_ZERO", capacity: 0 },
  source_coverage: {},
  external_send_performed: false,
};

function respondWith(map = {}) {
  invoke.mockImplementation(async (_fn, body) => {
    const action = String(body?.action || "");
    if (action === "campaign_overview") return { data: map.overview ?? OVERVIEW };
    if (action === "campaign_list") return { data: map.list ?? LIST };
    if (action === "campaign_builder_options") return { data: map.builderOptions ?? BUILDER_OPTIONS };
    if (action === "campaign_create_draft") return { data: { ok: true, campaign: { id: "c-new" }, external_send_performed: false } };
    if (action === "campaign_build_audience") return { data: { ok: true, audience_version: { id: "av1", status: "READY" }, external_send_performed: false } };
    if (action === "campaign_freeze_audience") return { data: { ok: true, audience_version: { id: "av1", status: "FROZEN" }, external_send_performed: false } };
    if (action === "campaign_validate_content") return { data: { ok: true, validation: { status: "VALIDATED" }, content_version: { id: "cv1" }, external_send_performed: false } };
    if (action === "campaign_validate_sequence") return { data: { ok: true, validation: { status: "VALIDATED" }, sequence_version: { id: "sv1" }, external_send_performed: false } };
    if (action === "campaign_update_draft") return { data: { ok: true, external_send_performed: false } };
    if (action === "campaign_preflight") return { data: { ok: true, preflight: { verdict: "BLOCKED" }, external_send_performed: false } };
    if (action === "campaign_detail") {
      const detail = map.detail ?? DETAIL;
      return { data: body.campaign_id === "c-new" ? { ...detail, item: { ...detail.item, id: "c-new", name: "New campaign" } } : detail };
    }
    return { data: { ok: false, error: "unsupported_action" } };
  });
}

/** Renders, waits for the overview, then navigates to a tab. */
async function openTab(label) {
  render(<AdminCampaigns />);
  await screen.findByTestId("campaign-kpi-active_campaigns");
  fireEvent.click(screen.getByRole("button", { name: label }));
}

beforeEach(() => {
  invoke.mockReset();
  respondWith();
});
afterEach(cleanup);

describe("AdminCampaigns — overview", () => {
  it("shows an UNKNOWN KPI as Unknown with its blocker, never as zero", async () => {
    render(<AdminCampaigns />);
    const card = await screen.findByTestId("campaign-kpi-delivered_observed_today");
    expect(card.textContent).toContain("Unknown");
    expect(card.textContent).toContain("execution_engine_pending_c4");
    // The value slot must not render a numeric zero for an unmeasured KPI.
    expect(card.textContent).not.toMatch(/\b0\b/);
  });

  it("declares formula, denominator, source and freshness for every KPI", async () => {
    render(<AdminCampaigns />);
    const observed = await screen.findByTestId("campaign-kpi-active_campaigns");
    for (const label of ["Formula:", "Denominator:", "Source:", "Freshness:"]) {
      expect(observed.textContent).toContain(label);
    }
    expect(observed.textContent).toContain("2");
    expect(observed.textContent).toContain("OBSERVED");
  });

  it("surfaces the global outbound posture and SAFE MODE state", async () => {
    render(<AdminCampaigns />);
    const posture = await screen.findByTestId("campaigns-posture");
    expect(posture.textContent).toContain("PAUSED_ZERO");
    expect(posture.textContent).toContain("NORMAL");
  });

  it("always states that this workspace performs no sends", async () => {
    render(<AdminCampaigns />);
    await screen.findByTestId("campaign-kpi-active_campaigns");
    expect(screen.getByText(/No sends from this workspace/i)).toBeTruthy();
  });
});

describe("AdminCampaigns — all campaigns", () => {
  it("shows the canonical status while keeping the stored legacy value visible", async () => {
    await openTab("All Campaigns");
    const row = await screen.findByTestId("campaign-row-c1");
    expect(row.textContent).toContain("RUNNING");
    expect(row.textContent).toContain("legacy: PILOT");
  });

  it("renders an absent metric as a dash rather than zero", async () => {
    await openTab("All Campaigns");
    const row = await screen.findByTestId("campaign-row-c1");
    expect(row.textContent).toContain("40");
    expect(row.textContent).toContain("—");
  });

  it("shows a fail-visible state when the source is unavailable instead of an empty table", async () => {
    respondWith({
      list: { ok: true, data_status: "UNAVAILABLE", items: [], blockers: ["commercial_campaign_source_unavailable"] },
    });
    await openTab("All Campaigns");
    const unavailable = await screen.findByTestId("campaigns-data-unavailable");
    expect(unavailable.textContent).toContain("Data unavailable");
    expect(unavailable.textContent).toContain("commercial_campaign_source_unavailable");
    expect(screen.queryByTestId("campaign-row-c1")).toBeNull();
  });

  it("flags a campaign with blockers as needing attention", async () => {
    await openTab("All Campaigns");
    const row = await screen.findByTestId("campaign-row-c2");
    expect(row.textContent).toContain("needs attention");
  });
});

describe("AdminCampaigns — campaign studio", () => {
  it("builds a complete draft without scheduling, approving or sending", async () => {
    render(<AdminCampaigns />);
    await screen.findByTestId("campaign-kpi-active_campaigns");
    fireEvent.click(screen.getByRole("button", { name: "Create Campaign" }));

    expect(await screen.findByTestId("campaign-builder")).toBeTruthy();
    expect(screen.getByText("PAUSED_ZERO")).toBeTruthy();
    expect(screen.getByLabelText("Campaign subject")).toBeTruthy();
    expect(screen.getByLabelText("Campaign message")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Add Acme Payments"));
    fireEvent.click(screen.getByLabelText("Use xavi@trycambraglobal.com"));
    fireEvent.click(screen.getByTestId("save-campaign-draft"));

    await screen.findByText(/Campaign draft, audience, message and sequence were saved/i);
    const actions = invoke.mock.calls.map(([, body]) => body.action);
    expect(actions).toEqual(expect.arrayContaining([
      "campaign_create_draft", "campaign_build_audience", "campaign_freeze_audience",
      "campaign_validate_content", "campaign_validate_sequence", "campaign_update_draft",
      "campaign_preflight", "campaign_detail",
    ]));
    expect(actions.some((action) => /send|schedule|launch|execute|approve/.test(action))).toBe(false);
  });
});

describe("AdminCampaigns — detail", () => {
  async function openDetail() {
    await openTab("All Campaigns");
    fireEvent.click(await screen.findByTestId("campaign-row-c1"));
  }

  it("declares the canonical-model gaps of a legacy campaign instead of faking versions", async () => {
    await openDetail();
    const model = await screen.findByTestId("campaign-canonical-model");
    expect(model.textContent).toContain("not versioned");
    expect(model.textContent).toContain("120 lead id(s)");
    expect(model.textContent).toContain("message prepared");
    expect(model.textContent).toContain("sequence not prepared");
  });

  it("links the immutable detail boundary to the campaign studio", async () => {
    await openDetail();
    await waitFor(() => expect(document.body.textContent).toMatch(/Create Campaign.*builds a real versioned audience/i));
    expect(document.body.textContent).not.toMatch(/Not built yet — chunk C3/);
    expect(document.body.textContent).toMatch(/never schedules or sends anything/i);
  });

  it("requests the detail through the canonical campaign_detail action", async () => {
    await openDetail();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("adminSummaries", { action: "campaign_detail", campaign_id: "c1" })
    );
  });
});
