// @vitest-environment jsdom
// CAMP-FOLLOWUP (2026-08-16) — UI tests for the preflight check and the
// approval request wired into the Campaigns detail view.
//
// The preflight fixtures are produced by the REAL buildCampaignPreflight()
// rather than hand-written JSON, so a change to the engine's shape breaks
// these tests instead of letting the UI drift away from it.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildCampaignPreflight } from "../../../base44/shared/campaignPreflight.ts";

globalThis.React = React;

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke } } }));

import AdminCampaigns from "./AdminCampaigns.jsx";

/** Everything healthy except the FounderPermit authority, which is absent on this tree. */
const CLEAN_INPUT = {
  campaign: { id: "c1", market_scope: ["ES"] },
  audienceAvailable: true,
  audienceVersion: { status: "FROZEN", final_eligible_count: 120 },
  contentValidation: { status: "VALIDATED", blockers: [] },
  sequenceValidation: { status: "VALIDATED", blockers: [] },
  sendingProfilesAvailable: true,
  sendingProfiles: [{ status: "active", current_daily_cap: 50, webhook_status: "ACTIVE" }],
  policyAvailable: true,
  policy: { status: "active", policy_key: "merchant-acq", version: "3" },
  outboundControlAvailable: true,
  outboundControl: { acquisition_enabled: true },
  emergencyAvailable: true,
  emergency: { safe_mode: false, communications_paused: false, control_revision: 7 },
  budget: { available: true, remaining_minor: 50_000 },
  founderPermit: null,
};

const PREFLIGHT_PERMIT_ONLY = buildCampaignPreflight(CLEAN_INPUT);
const PREFLIGHT_BLOCKED = buildCampaignPreflight({
  ...CLEAN_INPUT,
  outboundControl: { acquisition_enabled: false },
  founderPermit: { authority_available: true, present: true },
});
const PREFLIGHT_PASS = buildCampaignPreflight({
  ...CLEAN_INPUT,
  founderPermit: { authority_available: true, present: true },
});

const LIST = {
  ok: true, data_status: "COMPLETE", total: 1, returned: 1, blockers: [],
  items: [{
    id: "c1", name: "ES fashion CFOs", status: "DRAFT", stored_status: "DRAFT",
    status_is_legacy: false, lane: "MERCHANT_ACQUISITION", objective_type: "BOOK_MEETING",
    markets: ["ES"], owner: "founder@cambra.global", legacy_lead_count: 120,
    needs_attention: false, blockers: [],
    metrics: { provider_accepted: null, replied: null, meetings: null, selected_leads: 120 },
  }],
};

const DETAIL = {
  ok: true,
  item: {
    id: "c1", name: "ES fashion CFOs", status: "DRAFT", stored_status: "DRAFT",
    status_is_legacy: false, lane: "MERCHANT_ACQUISITION", objective_type: "BOOK_MEETING",
    owner: "founder@cambra.global", policy_key: "merchant-acq", blockers: [],
    audience_version_id: "av1",
  },
  audience_versions: [{ id: "av1", version: 1 }],
  content_versions: [{ id: "cv1", version: 1 }],
  sequence_versions: [{ id: "sv1", version: 1 }],
  canonical_model_gaps: [],
  legacy_projection: { lead_ids_count: 120, message_prepared: true, sequence_prepared: true, note: "n/a" },
};

const OVERVIEW = {
  ok: true, data_status: "COMPLETE",
  outbound_posture: { status: "PAUSED_ZERO", safe_mode: "NORMAL", truth_boundary: "read from canonical authorities" },
  kpis: [{
    key: "active_campaigns", label: "Active campaigns", value: 1, status: "OBSERVED",
    formula: "count(...)", denominator: "all campaigns", source: "CommercialCampaign",
    freshness: "2026-08-16T10:00:00.000Z", scope: "all lanes", blocker: null,
  }],
  needs_attention: [],
};

/** `approvalResponse` may be a success payload or a thrown-shaped 409 body. */
function respondWith({ preflight = PREFLIGHT_PERMIT_ONLY, approvalResponse } = {}) {
  invoke.mockImplementation(async (_fn, body) => {
    const action = String(body?.action || "");
    if (action === "campaign_overview") return { data: OVERVIEW };
    if (action === "campaign_list") return { data: LIST };
    if (action === "campaign_detail") return { data: DETAIL };
    if (action === "campaign_preflight") return { data: { ok: true, preflight, external_send_performed: false } };
    if (action === "campaign_request_approval") {
      return { data: approvalResponse ?? { ok: false, error: "preflight_not_passed", preflight, external_send_performed: false } };
    }
    return { data: { ok: false, error: "unsupported_action" } };
  });
}

/** Renders, navigates to the campaign detail and returns once it is on screen. */
async function openDetail() {
  render(<AdminCampaigns />);
  await screen.findByTestId("campaign-kpi-active_campaigns");
  fireEvent.click(screen.getByRole("button", { name: "All Campaigns" }));
  fireEvent.click(await screen.findByTestId("campaign-row-c1"));
  return screen.findByTestId("check-status-button");
}

async function openPreflightDialog() {
  const button = await openDetail();
  fireEvent.click(button);
  return screen.findByTestId("preflight-dimensions");
}

const actionsCalled = () =>
  invoke.mock.calls.map(([, body]) => String(body?.action || ""));

beforeEach(() => { invoke.mockReset(); respondWith(); });
afterEach(cleanup);

describe("Check status — read-only by construction", () => {
  it("invokes the preflight action and never a mutating one", async () => {
    await openPreflightDialog();
    expect(actionsCalled()).toContain("campaign_preflight");
    // The read-only check must not have touched approval or any other mutation.
    expect(actionsCalled()).not.toContain("campaign_request_approval");
    expect(actionsCalled()).not.toContain("campaign_prepare_pilot");
    expect(actionsCalled()).not.toContain("campaign_update_draft");
  });

  it("asks the backend about the campaign currently open", async () => {
    await openPreflightDialog();
    expect(invoke).toHaveBeenCalledWith("adminSummaries", { action: "campaign_preflight", campaign_id: "c1" });
  });

  it("is never pre-disabled — the answer decides what blocks, not the client", async () => {
    const button = await openDetail();
    expect(button.hasAttribute("disabled")).toBe(false);
  });
});

describe("Preflight dialog — the breakdown a founder reads", () => {
  it("renders every dimension the engine returned, with a plain-language phrase", async () => {
    const list = await openPreflightDialog();
    for (const dimension of PREFLIGHT_PERMIT_ONLY.dimensions) {
      const row = await screen.findByTestId(`preflight-dimension-${dimension.key}`);
      expect(row.textContent, dimension.key).toContain(dimension.status);
      // Not only the raw code: a sentence explaining what that status means.
      expect(row.textContent.length, dimension.key).toBeGreaterThan(dimension.status.length + 10);
    }
    expect(list).toBeTruthy();
  });

  it("shows the overall verdict from the engine, not a recomputed one", async () => {
    await openPreflightDialog();
    const verdict = await screen.findByTestId("preflight-verdict");
    expect(verdict.textContent).toContain(PREFLIGHT_PERMIT_ONLY.verdict);
    expect(PREFLIGHT_PERMIT_ONLY.verdict).toBe("UNKNOWN");
  });

  it("gives the missing Founder permit its own prominent notice, not just a table row", async () => {
    await openPreflightDialog();
    const notice = await screen.findByTestId("preflight-founder-permit-notice");
    expect(notice.textContent).toContain("PROMPT_CAMBRA_COMMAND_V1.md");
    expect(notice.textContent).toMatch(/not available on this platform yet/i);
    // And it explains the consequence rather than only naming the gap.
    expect(notice.textContent).toMatch(/never counts as passed/i);
  });

  it("does not show the permit notice when that authority is satisfied", async () => {
    respondWith({ preflight: PREFLIGHT_PASS });
    await openPreflightDialog();
    expect(screen.queryByTestId("preflight-founder-permit-notice")).toBeNull();
  });

  it("explains a blocked dimension using the engine's own detail text", async () => {
    respondWith({ preflight: PREFLIGHT_BLOCKED });
    await openPreflightDialog();
    const row = await screen.findByTestId("preflight-dimension-outbound_control");
    expect(row.textContent).toContain("BLOCKED");
    expect(row.textContent).toMatch(/globally paused/i);
  });
});

describe("Request approval — the server is the authority", () => {
  it("always calls the backend rather than pre-judging from the cached preflight", async () => {
    await openPreflightDialog();
    // The cached preflight is not approvable, yet the button still asks the server.
    expect(PREFLIGHT_PERMIT_ONLY.approvable).toBe(false);
    fireEvent.click(screen.getByTestId("request-approval-button"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("adminSummaries", { action: "campaign_request_approval", campaign_id: "c1" })
    );
  });

  it("renders a refusal as the per-dimension breakdown, not as a generic error", async () => {
    await openPreflightDialog();
    fireEvent.click(screen.getByTestId("request-approval-button"));
    const rejection = await screen.findByTestId("approval-rejected");
    expect(rejection.textContent).toMatch(/Approval was not granted/i);
    expect(rejection.textContent).toMatch(/Nothing was changed and nothing was sent/i);
    // The reason is shown as dimensions, and the raw error code is not surfaced.
    expect(await screen.findByTestId("preflight-founder-permit-notice")).toBeTruthy();
    expect(screen.queryByTestId("preflight-error")).toBeNull();
    expect(document.body.textContent).not.toContain("preflight_not_passed");
  });

  it("on success shows the approval hash, the bound scope and that this is not a send", async () => {
    respondWith({
      preflight: PREFLIGHT_PASS,
      approvalResponse: {
        ok: true,
        preflight: PREFLIGHT_PASS,
        approval: { approval_hash: "hash-abc123", scope: { campaign_id: "c1", nonce: "n1" } },
        item: { ...DETAIL.item, status: "READY_FOR_APPROVAL" },
        external_send_performed: false,
      },
    });
    await openPreflightDialog();
    fireEvent.click(screen.getByTestId("request-approval-button"));
    const granted = await screen.findByTestId("approval-granted");
    expect(granted.textContent).toContain("hash-abc123");
    expect(granted.textContent).toContain("READY_FOR_APPROVAL");
    expect(granted.textContent).toMatch(/does\s*not\s*send anything/i);
    expect(granted.textContent).toMatch(/still requires the founder permit/i);
  });

  it("surfaces a genuine failure as an error rather than as a refusal", async () => {
    respondWith({ approvalResponse: { ok: false, error: "campaign_not_found" } });
    await openPreflightDialog();
    fireEvent.click(screen.getByTestId("request-approval-button"));
    const error = await screen.findByTestId("preflight-error");
    expect(error.textContent).toContain("campaign_not_found");
    expect(screen.queryByTestId("approval-rejected")).toBeNull();
  });
});

describe("Honest copy", () => {
  it("no longer claims audience/content/sequence/preflight are unbuilt", async () => {
    await openDetail();
    expect(document.body.textContent).not.toMatch(/Not built yet — chunk C3/);
    expect(document.body.textContent).toMatch(/Create Campaign.*builds a real versioned audience/i);
    expect(document.body.textContent).toMatch(/never schedules or sends anything/i);
  });

  it("states that approving is not sending", async () => {
    render(<AdminCampaigns />);
    await screen.findByTestId("campaign-kpi-active_campaigns");
    expect(screen.getByText(/approving is not sending/i)).toBeTruthy();
  });
});
