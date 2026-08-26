import { describe, expect, it } from "vitest";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("admin intelligence usability", () => {
  it("renders a real loading state before presenting an intelligence snapshot", () => {
    const overview = read("src/pages/admin/AdminIntelligence.jsx");
    const workspace = read("src/pages/admin/AdminIntelligenceWorkspace.jsx");
    expect(overview).toContain('data-testid="intelligence-snapshot-loading"');
    expect(overview).toMatch(/!data \? \(/);
    expect(workspace).toContain('embedded={active === "overview"}');
    expect(workspace).toContain('Cambios de precios');
  });

  it("separates P1 operational coverage from P10 and P11 legal layers", () => {
    const command = read("base44/functions/getEuropeMarketsCommandCenter/entry.ts");
    const page = read("src/pages/admin/AdminMarkets.jsx");
    expect(command).toContain("MARKET_CAPABILITIES");
    expect(command).toContain("LegalExecutionPolicy.filter({ active:true }");
    expect(command).toContain("p1_matrix_policy_rows");
    expect(command).toContain("p10_expected_policy_rows");
    expect(command).toContain("p11_expected_policy_rows");
    expect(page).toContain('code="P1"');
    expect(page).toContain('code="P10"');
    expect(page).toContain('code="P11"');
  });

  it("shows governed benchmark cohorts without reading individual contributions", () => {
    const page = read("src/pages/admin/AdminBenchmarks.jsx");
    expect(page).toContain("BenchmarkCohort.list");
    expect(page).toContain("observed_contributions");
    expect(page).toContain("synthetic_seed");
    expect(page).toContain("PUBLISHABLE");
    expect(page).toContain("is_public === true");
    expect(page).not.toContain("BenchmarkContribution");
  });

  it("projects human brand names for routing and recommendation queues", () => {
    const routing = read("base44/functions/getRoutingIntelligenceCommandCenter/entry.ts");
    const recommendations = read("base44/functions/getAdminRecommendationQueue/entry.ts");
    expect(routing).toContain("brand_name");
    expect(routing).toContain("Brand.list");
    expect(recommendations).toContain("brand_name");
    expect(recommendations).toContain("brand_is_demo");
  });

  it("loads ECL operator pages through one server snapshot", () => {
    const review = read("src/pages/admin/ReviewQueue.jsx");
    const incidents = read("src/pages/admin/EclOperations.jsx");
    expect(review).toContain('{ action: "snapshot" }');
    expect(incidents).toContain('{ action: "snapshot" }');
    expect(review).not.toContain("ACTIVE_STATUSES.map((status) => invokeReview");
    expect(incidents).not.toContain("ACTIVE.map((status) => invoke");
  });

  it("does not display an unsubmitted GMV as if it were real input", () => {
    const slider = read("src/components/paymentsAnalyzer/GmvSlider.jsx");
    expect(slider).toContain("const displayValue = isSet ? numericValue : 0");
    expect(slider).not.toContain("DEFAULT_DISPLAY_EUR");
  });
});
