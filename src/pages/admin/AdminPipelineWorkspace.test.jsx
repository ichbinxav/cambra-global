// @vitest-environment jsdom
// DASHBOARD-C3 (2026-08-17) — what the founder actually sees in Pipeline.
//
// Fixtures come from the REAL buildPipelinePortfolio, not hand-written to match
// the component. If the projection's shape changes these break, which is the point.
import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPipelinePortfolio } from "../../../base44/shared/pipelineCore.ts";

globalThis.React = React;
const NOW = "2026-08-17T12:00:00.000Z";

function makeSvc(rows = {}, broken = []) {
  const stores = {};
  const built = {};
  const entity = (name) => {
    if (!stores[name]) stores[name] = (rows[name] || []).map((r) => ({ ...r }));
    if (built[name]) return built[name];
    built[name] = {
      async list() { if (broken.includes(name)) throw new Error(`${name}_down`); return stores[name].map((r) => ({ ...r })); },
    };
    return built[name];
  };
  return { entities: new Proxy({}, { get: (_t, n) => entity(String(n)) }) };
}

const LEADS = [
  { id: "l1", company_name: "Acme", country: "ES", stage: "contacted", revenue_stage: "contacted",
    sales_owner: "founder@cambra.global", next_action: "follow up", expected_revenue_value_minor: 500000, updated_date: NOW },
  { id: "l2", company_name: "Globex", country: "ES", stage: "contacted", reservoir_state: "converted", updated_date: NOW },
];

const real = (svc, lanes = ["MERCHANT_ACQUISITION"]) =>
  buildPipelinePortfolio({ svc, lanes, now: NOW, contextId: "ctx" });

let Page;
beforeEach(async () => {
  vi.resetModules();
  vi.doMock("@/api/base44Client", () => ({ base44: { functions: { invoke: vi.fn() } } }));
  Page = await import("./AdminPipelineWorkspace.jsx");
});
afterEach(() => { vi.resetModules(); vi.restoreAllMocks(); });

describe("C3 — a KPI whose source failed does not render a number", () => {
  it("says the source is unavailable and that it is not a zero", async () => {
    const out = await real(makeSvc({ OutboundLead: LEADS }, ["OutboundLead"]));
    const kpi = out.kpis.find((row) => row.metric_key === "active_relationships");
    expect(kpi.value).toBeNull();

    render(React.createElement(Page.KpiCard, { kpi }));
    const card = screen.getByTestId("kpi-active_relationships");
    expect(card.textContent).toContain("—");
    expect(card.textContent).not.toMatch(/\b0\b/);
    expect(screen.getByTestId("kpi-active_relationships-unavailable").textContent)
      .toContain("This is not a zero");
  });

  it("renders a genuine value with its truth class", async () => {
    const out = await real(makeSvc({ OutboundLead: LEADS }));
    const kpi = out.kpis.find((row) => row.metric_key === "active_relationships");
    render(React.createElement(Page.KpiCard, { kpi }));
    const card = screen.getByTestId("kpi-active_relationships");
    expect(card.textContent).toContain("2");
    expect(card.textContent).toContain("OBSERVED");
  });

  it("shows the claim boundary on a lower-bound total", async () => {
    const out = await real(makeSvc({ OutboundLead: LEADS }));
    const kpi = out.kpis.find((row) => row.metric_key === "weighted_pipeline");
    render(React.createElement(Page.KpiCard, { kpi }));
    expect(screen.getByTestId("kpi-weighted_pipeline").textContent).toContain("lower bound");
  });
});

describe("C3 — source health states what is missing", () => {
  it("names the unreadable source and explains the hidden total", async () => {
    const out = await real(makeSvc({ OutboundLead: LEADS, PartnerProspect: [] }, ["PartnerProspect"]),
      ["MERCHANT_ACQUISITION", "PARTNER_ACQUISITION"]);
    render(React.createElement(Page.SourceHealthBar, { context: out.context, sourceHealth: out.source_health }));
    const bar = screen.getByTestId("source-degraded");
    expect(bar.textContent).toContain("PartnerProspect");
    expect(bar.textContent).toContain("absent, not zero");
  });

  it("carries the truth boundary", async () => {
    const out = await real(makeSvc({ OutboundLead: LEADS }));
    render(React.createElement(Page.SourceHealthBar, { context: out.context, sourceHealth: out.source_health }));
    expect(screen.getByTestId("source-health").textContent).toContain("Missing evidence remains unknown");
  });
});

describe("C3 — a disagreement between stage sources is visible", () => {
  it("marks the row and explains why the weaker reading is shown", async () => {
    const out = await real(makeSvc({ OutboundLead: LEADS }));
    const globex = out.items.rows.find((row) => row.canonical_id === "l2");
    expect(globex.stage).toBe("CONTACTED");

    render(React.createElement(Page.PipelineRowCard, { row: globex, onPreview: () => {}, busy: false }));
    const note = screen.getByTestId("conflict-l2");
    expect(note.textContent).toContain("Stage sources disagree");
    expect(note.textContent).toContain("least-advanced");
  });

  it("does not warn on a row whose sources agree", async () => {
    const out = await real(makeSvc({ OutboundLead: LEADS }));
    const acme = out.items.rows.find((row) => row.canonical_id === "l1");
    render(React.createElement(Page.PipelineRowCard, { row: acme, onPreview: () => {}, busy: false }));
    expect(screen.queryByTestId("conflict-l1")).toBeNull();
  });
});

describe("C3 — the transition preview names what it will not touch", () => {
  const preview = {
    lane: "MERCHANT_ACQUISITION", subject_type: "OutboundLead", subject_id: "l1",
    from_stage: "CONTACTED", to_stage: "MEETING_BOOKED", direction: "FORWARD",
    writes_column: "stage", other_columns_untouched: ["revenue_stage", "reservoir_state"],
    allowed: true, blockers: [],
  };

  it("shows the single column that moves and the ones left alone", () => {
    render(React.createElement(Page.TransitionPreview, { preview, onClose: () => {}, onApply: () => {}, busy: false }));
    const panel = screen.getByTestId("transition-preview");
    expect(panel.textContent).toContain("OutboundLead.stage");
    expect(panel.textContent).toContain("revenue_stage, reservoir_state");
    expect(panel.textContent).toContain("assert values nobody supplied");
  });

  it("shows the refusal and disables applying when blocked", () => {
    render(React.createElement(Page.TransitionPreview, {
      preview: { ...preview, allowed: false, blockers: ["reason_code_required"] },
      onClose: () => {}, onApply: () => {}, busy: false,
    }));
    expect(screen.getByTestId("preview-blocked").textContent).toContain("Reason Code Required");
  });

  it("renders nothing without a preview", () => {
    render(React.createElement(Page.TransitionPreview, { preview: null }));
    expect(screen.queryByTestId("transition-preview")).toBeNull();
  });
});
