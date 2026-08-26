import { describe, expect, it } from "vitest";
import {
  classifyLeadPersonas,
  filterLeadPeople,
  LEAD_LAUNCH_MARKETS,
  matchesLeadGmvBand,
  projectLeadPerson,
} from "../../base44/shared/leadPeopleProjection.ts";

describe("people-first lead projection", () => {
  it("classifies only observed title text and preserves overlapping roles", () => {
    expect(classifyLeadPersonas("Co-Founder & CFO")).toEqual(["FOUNDER", "FINANCE"]);
    expect(classifyLeadPersonas("Global Procurement Director")).toEqual(["PROCUREMENT"]);
    expect(classifyLeadPersonas("")).toEqual(["UNKNOWN"]);
  });

  it("keeps missing GMV and score unknown rather than coercing them to zero", () => {
    const person = projectLeadPerson({
      id: "lead-1",
      company_name: "Evidence Ltd",
      contact_full_name: "Ada",
      contact_title: "Chief Financial Officer",
    });
    expect(person.score).toBeNull();
    expect(person.gmv_truth_class).toBe("UNKNOWN");
    expect(person.estimated_gmv_min_eur).toBeNull();
    expect(matchesLeadGmvBand(person, "UNDER_1M")).toBe(false);
    expect(matchesLeadGmvBand(person, "UNKNOWN")).toBe(true);
  });

  it("filters people by role, country, score and overlapping GMV range", () => {
    const rows = [
      projectLeadPerson({
        id: "lead-1", company_name: "One", contact_full_name: "Ada", contact_title: "CFO",
        country: "ES", score: 82, estimated_tpv_min_eur: 4_000_000, estimated_tpv_max_eur: 7_000_000,
      }),
      projectLeadPerson({
        id: "lead-2", company_name: "Two", contact_full_name: "Grace", contact_title: "Founder",
        country: "FR", score: 91, estimated_tpv_min_eur: 120_000_000, estimated_tpv_max_eur: 140_000_000,
      }),
    ];
    expect(filterLeadPeople(rows, {
      persona: "FINANCE", country: "ES", min_score: 80, gmv_band: "FROM_5M_TO_20M", named_only: true,
    }).map((row) => row.id)).toEqual(["lead-1"]);
  });

  it("uses the canonical founder scope and blocks every non-launch market", () => {
    expect(LEAD_LAUNCH_MARKETS).toEqual(["ES", "IT", "PT", "GB", "GR", "HR", "DE", "PL", "CZ", "CY"]);
    expect(projectLeadPerson({ id: "spain", country: "Spain" })).toMatchObject({
      country: "ES", observed_country: "Spain", launch_market_eligible: true,
    });
    expect(projectLeadPerson({ id: "france", country: "France" })).toMatchObject({
      country: "FR", launch_market_eligible: false, readiness: "BLOCKED",
      blockers: expect.arrayContaining(["MARKET_OUTSIDE_ACTIVE_LAUNCH"]),
    });
  });
});
