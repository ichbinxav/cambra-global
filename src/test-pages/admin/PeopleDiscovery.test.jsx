// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke: vi.fn() } } }));
import PeopleDiscovery from "../../components/admin/discovery/PeopleDiscovery.jsx";

globalThis.React = React;

afterEach(cleanup);

const portfolio = {
  ok: true,
  items: [{
    id: "lead-1",
    person_name: "Ada Lovelace",
    person_title: "Chief Financial Officer",
    person_email: "",
    personas: ["FINANCE"],
    company_name: "Evidence Commerce",
    company_domain: "evidence.example",
    country: "ES",
    industry: "Ecommerce",
    estimated_gmv_min_eur: 5_000_000,
    estimated_gmv_max_eur: 8_000_000,
    gmv_truth_class: "ESTIMATED",
    score: 86,
    score_truth_class: "DERIVED",
    score_breakdown: { role_fit: 20 },
    reasons: ["Observed role: Chief Financial Officer", "role fit: 20"],
    source_evidence: {},
    pipeline_state: "DISCOVERED",
    readiness: "REVIEW_REQUIRED",
    blockers: ["VERIFIED_EMAIL_REQUIRED"],
  }],
  matched_ids: ["lead-1"],
  total: 1,
  returned: 1,
  metrics: { named_contacts: 1, high_fit: 1, send_ready: 0, gmv_known: 1 },
  filter_options: {
    personas: ["FINANCE"], countries: ["ES"],
    gmv_bands: ["FROM_5M_TO_20M"], readiness: ["REVIEW_REQUIRED"], pipeline_state: ["DISCOVERED"],
  },
  facet_counts: { personas: { FINANCE: 1 } },
  truth_boundary: "Observed values stay observed.",
};

describe("PeopleDiscovery", () => {
  it("shows people, score reasons and saves an explicit reusable audience", async () => {
    const call = vi.fn(async (action, payload) => {
      if (action === "people") return portfolio;
      if (action === "save_audience") return {
        ok: true,
        audience: { id: "aud-1", name: payload.name, member_count: payload.lead_ids.length },
      };
      throw new Error(`Unexpected ${action}`);
    });
    render(<PeopleDiscovery call={call} />);

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Chief Financial Officer")).toBeTruthy();
    expect(screen.getByText("86")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View why" }));
    expect(screen.getByText("Why this score")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Ada Lovelace" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Audience name" }), { target: { value: "ES CFOs · €5M+" } });
    fireEvent.click(screen.getByRole("button", { name: "Save audience" }));

    await waitFor(() => expect(call).toHaveBeenCalledWith("save_audience", expect.objectContaining({
      name: "ES CFOs · €5M+", lead_ids: ["lead-1"],
    })));
    expect(await screen.findByText(/Audience saved with 1 people/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Use in campaign" }).getAttribute("href")).toContain("audience=aud-1");
  });
});
