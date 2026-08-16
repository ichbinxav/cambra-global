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

import AdminCampaigns from "./AdminCampaigns.jsx";

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

function respondWith(map = {}) {
  invoke.mockImplementation(async (_fn, body) => {
    const action = String(body?.action || "");
    if (action === "campaign_overview") return { data: map.overview ?? OVERVIEW };
    if (action === "campaign_list") return { data: map.list ?? LIST };
    if (action === "campaign_detail") return { data: map.detail ?? DETAIL };
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

  // CAMP-FOLLOWUP (2026-08-16): this used to pin the copy "Not built yet —
  // chunk C3", which stopped being true once C3/C4 shipped. The invariant that
  // still matters is that the screen states what it CANNOT do — the editing
  // forms — instead of implying the whole flow is available.
  it("states honestly what this screen still lacks", async () => {
    await openDetail();
    await waitFor(() => expect(screen.getByText(/lacks are\s*the forms/i)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/Not built yet — chunk C3/);
  });

  it("requests the detail through the canonical campaign_detail action", async () => {
    await openDetail();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("adminSummaries", { action: "campaign_detail", campaign_id: "c1" })
    );
  });
});
