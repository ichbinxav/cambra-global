// @vitest-environment jsdom
// DASHBOARD-C13 (2026-08-17) — the Audits & Opportunities page.
//
// Two display rules, both from defects auditsCore was written to prevent:
//
//   1. An ANONYMOUS_ESTIMATE can never be shown as verified savings.
//   2. The six opportunity figures stay six figures. Current cost, target cost, gross
//      theoretical, actionable, expected recoverable and annualized are different claims;
//      collapsing any two is the defect.
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuditCard, normalizePortfolioItems, OpportunityCard } from "../pages/admin/AdminAudits.jsx";

globalThis.React = React;

describe("C13 — missing portfolio metadata stays unknown", () => {
  it.each([undefined, null, {}])("normalizes absent items without inventing a zero count", (items) => {
    expect(normalizePortfolioItems(items)).toEqual({ rows: [], total: null, nextCursor: null });
  });

  it("preserves an observed zero and valid rows", () => {
    const rows = [{ canonical_id: "a1" }];
    expect(normalizePortfolioItems({ rows, total: 0, next_cursor: "next" })).toEqual({
      rows,
      total: 0,
      nextCursor: "next",
    });
  });
});

const audit = (extra = {}) => ({
  canonical_id: "a1", brand_id: "Acme", audit_type: "CONNECTED_ANALYSIS", status: "COMPLETE",
  truth_class: "VERIFIED", currency: "EUR", total_savings_minor: 250000,
  data_completeness: 100, engine_version: "e1", benchmark_version: "b1",
  window_provenance: "PRESENT", attention_reasons: [], claim_boundary: "Read from a connected account.",
  ...extra,
});

const opportunity = (extra = {}) => ({
  canonical_id: "o1", opportunity_key: "acme:payments", market: "FR", status: "APPROVED_FOR_RECOVER",
  currency: "EUR",
  current_annual_cost_minor: 1200000,
  target_annual_cost_minor: 900000,
  gross_theoretical_savings_minor: 300000,
  actionable_savings_minor: 250000,
  expected_recoverable_savings_minor: 200000,
  annualized_savings_minor: 180000,
  recover_eligible: true, recover_blockers: [], attention_reasons: [],
  claim_boundary: "Evidence complete.", recommended_next_action: "open_recover_case",
  ...extra,
});

describe("C13 — an estimate is never headlined as verified savings", () => {
  it("labels a verified audit as verified savings", () => {
    render(<AuditCard row={audit()} />);
    expect(screen.getByTestId("audit-a1").textContent).toContain("Verified savings");
  });

  it("labels a modelled audit as estimated, not verified", () => {
    render(<AuditCard row={audit({ truth_class: "MODELED", audit_type: "ANONYMOUS_ESTIMATE" })} />);
    const card = screen.getByTestId("audit-a1");
    expect(card.textContent).toContain("Estimated savings");
    expect(card.textContent).not.toContain("Verified savings");
    expect(card.textContent).toContain("MODELED");
  });

  it("renders an absent savings figure as an em dash, not zero", () => {
    render(<AuditCard row={audit({ total_savings_minor: null, truth_class: "UNKNOWN" })} />);
    const card = screen.getByTestId("audit-a1");
    expect(card.textContent).toContain("—");
    expect(card.textContent).not.toContain("€0");
  });

  it("says the measurement window was not recorded rather than showing nothing", () => {
    render(<AuditCard row={audit({ window_provenance: "ABSENT" })} />);
    // ABSENT is not "zero window"; it means nobody recorded one.
    expect(screen.getByTestId("audit-a1").textContent).toContain("window not recorded");
  });

  it("shows the claim boundary and the attention reasons", () => {
    render(<AuditCard row={audit({ attention_reasons: ["no_source_integration"] })} />);
    const card = screen.getByTestId("audit-a1");
    expect(card.textContent).toContain("no_source_integration");
    expect(card.textContent).toContain("Read from a connected account");
  });
});

describe("C13 — the six opportunity figures stay six figures", () => {
  it("renders each of the six with its own label", () => {
    render(<OpportunityCard row={opportunity()} />);
    const card = screen.getByTestId("opportunity-o1");
    for (const label of [
      "Current annual cost", "Target annual cost", "Gross theoretical",
      "Actionable", "Expected recoverable", "Annualized",
    ]) {
      expect(card.textContent, label).toContain(label);
    }
  });

  it("carries no total across them", () => {
    render(<OpportunityCard row={opportunity()} />);
    const card = screen.getByTestId("opportunity-o1");
    // 300000 + 250000 + 200000 + 180000 = 930000 -> €9,300. Any sum of these is the defect.
    expect(card.textContent).not.toContain("9,300");
    expect(card.textContent).not.toContain("Total");
  });

  it("shows an absent figure as an em dash", () => {
    render(<OpportunityCard row={opportunity({ expected_recoverable_savings_minor: null })} />);
    expect(screen.getByTestId("opportunity-o1").textContent).toContain("—");
  });

  it("shows Recover eligibility and its blockers", () => {
    render(<OpportunityCard row={opportunity({ recover_eligible: false, recover_blockers: ["evidence_incomplete"] })} />);
    const card = screen.getByTestId("opportunity-o1");
    expect(card.textContent).toContain("not eligible");
    expect(card.textContent).toContain("evidence_incomplete");
  });

  it("does not show an invoice or a billable amount", () => {
    render(<OpportunityCard row={opportunity()} />);
    const card = screen.getByTestId("opportunity-o1");
    // Billing is Finance's authority. Audits reports eligibility only.
    expect(card.textContent.toLowerCase()).not.toContain("invoice");
    expect(card.textContent.toLowerCase()).not.toContain("billable");
  });
});
