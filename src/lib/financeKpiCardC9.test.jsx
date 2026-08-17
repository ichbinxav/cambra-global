// @vitest-environment jsdom
// DASHBOARD-C9 (2026-08-17) — the display rule the server's honesty depends on.
//
// The server decides that an unknown figure is null. The display can undo that in one
// line: `€${Math.round(value).toLocaleString()}` renders null as "€0", which is what
// AdminRevenue did. These tests drive the rendered output rather than reading the file.
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceKpiCard, money } from "../components/admin/finance/FinanceKpiGrid";

globalThis.React = React;

const kpi = (extra = {}) => ({
  metric_key: "merchant_revenue_collected", label: "Collected", value: 80000,
  unit: "EUR_minor", truth_class: "VERIFIED", state: "OBSERVED", ...extra,
});

describe("C9 — a null figure renders an em dash, never a zero", () => {
  it("renders an unknown value as an em dash", () => {
    render(<FinanceKpiCard kpi={kpi({ value: null, truth_class: "UNKNOWN", state: "UNAVAILABLE" })} />);
    const card = screen.getByTestId("finance-kpi-merchant_revenue_collected");
    expect(card.textContent).toContain("—");
    expect(card.textContent).not.toContain("€0");
    expect(card.textContent).toContain("source unavailable");
  });

  it("renders a genuine zero as a zero", () => {
    render(<FinanceKpiCard kpi={kpi({ value: 0 })} />);
    // A real zero and a missing value are different facts and both must survive.
    expect(screen.getByTestId("finance-kpi-merchant_revenue_collected").textContent).toContain("€0");
  });

  it("shows the truth class on every figure", () => {
    render(<FinanceKpiCard kpi={kpi({ truth_class: "MODELED" })} />);
    expect(screen.getByTestId("finance-kpi-merchant_revenue_collected").textContent).toContain("MODELED");
  });

  it("shows the per-currency breakdown and no total for a mixed figure", () => {
    render(<FinanceKpiCard kpi={kpi({
      value: null, truth_class: "UNKNOWN", mixed_currency: true, by_currency: { EUR: 10000, GBP: 5000 },
    })} />);
    const card = screen.getByTestId("finance-kpi-merchant_revenue_collected");
    expect(card.textContent).toContain("mixed currency");
    expect(card.textContent).toContain("EUR");
    expect(card.textContent).toContain("GBP");
    // 15000 minor would be the invented total.
    expect(card.textContent).not.toContain("150");
  });

  it("renders the claim boundary so the figure carries its own limits", () => {
    render(<FinanceKpiCard kpi={kpi({ claim_boundary: "Lower bound, not a total." })} />);
    expect(screen.getByTestId("finance-kpi-merchant_revenue_collected").textContent).toContain("Lower bound");
  });
});

describe("C9 — money() does not price an unknown currency in euros silently", () => {
  it("formats in the stated currency", () => {
    expect(money(80000, "GBP")).toContain("£");
  });

  it("returns an em dash for an absent amount", () => {
    expect(money(null, "EUR")).toBe("—");
    expect(money(undefined, "EUR")).toBe("—");
    expect(money("", "EUR")).toBe("—");
  });

  it("keeps a real zero", () => {
    expect(money(0, "EUR")).toContain("0");
  });
});
