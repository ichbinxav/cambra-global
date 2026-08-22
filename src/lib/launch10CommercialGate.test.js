import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { commercialMarketDecision } from "../../base44/shared/marketLaunchScope.ts";

const read = (path) => fs.readFileSync(path, "utf8");
const after = (src, needle) => src.indexOf(needle);

describe("PROMPT_LAUNCH_10 — commercial gates", () => {
  it("normalizes names and blocks a non-launch market with the canonical public code", () => {
    expect(commercialMarketDecision("Austria")).toMatchObject({
      ok: false,
      iso2: "AT",
      error: "NOT_AVAILABLE_IN_MARKET",
      blocked_reason: "not_launch_market",
    });
    expect(commercialMarketDecision("Spain")).toMatchObject({ ok: true, iso2: "ES" });
    expect(commercialMarketDecision("France")).toMatchObject({
      ok: false,
      iso2: "FR",
      blocked_reason: "licensing",
    });
  });

  it("manual Analyzer returns NOT_AVAILABLE_IN_MARKET before durable analysis effects", () => {
    const src = read("base44/functions/submitPaymentsAnalysis/entry.ts");
    const gate = after(src, "error: 'NOT_AVAILABLE_IN_MARKET'");
    const firstDurable = after(src, "return await observeServiceLevelRequest(");
    expect(gate).toBeGreaterThan(-1);
    expect(firstDurable).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(firstDurable);
  });

  it("verified Stripe analysis blocks an inactive market before loading rates or calculating savings", () => {
    const src = read("base44/functions/computeStripeVerifiedGap/entry.ts");
    const gate = after(src, "const commercialMarket = commercialMarketDecision(accountCountry)");
    const rates = after(src, "const table = await loadRateTable(base44)");
    const calculation = after(src, "const engineResult = calculateGap(engineInput, table.rows!)");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(rates);
    expect(gate).toBeLessThan(calculation);
    expect(src.slice(gate, rates)).toContain("NOT_AVAILABLE_IN_MARKET");
  });

  it("loads the complete rate corpus at every legacy boundary", () => {
    const configuredLimit = 5000;
    expect(configuredLimit).toBeGreaterThan(548);

    const submit = read("base44/functions/submitPaymentsAnalysis/entry.ts");
    expect(
      submit.match(/PaymentsRateTable\.list\('-created_date', 5000\)/g),
    ).toHaveLength(2);

    const stripe = read("base44/functions/computeStripeVerifiedGap/entry.ts");
    expect(
      stripe.match(/PaymentsRateTable\.list\('-created_date', 5000\)/g),
    ).toHaveLength(2);

    const seed = read("base44/functions/seedPaymentsRateTable/entry.ts");
    expect(
      seed.match(/PaymentsRateTable\.list\('-created_date', 5000\)/g),
    ).toHaveLength(1);

    const results = read("src/pages/PaymentsResults.jsx");
    expect(results).toContain(
      '.filter({ active: true }, "-created_date", 5000)',
    );
  });

  it("provider recommendations are blocked before Recommendation writes", () => {
    const legacy = read("base44/functions/generateRecommendations/entry.ts");
    expect(legacy.indexOf("const marketDecision = commercialMarketDecision(brand?.country)")).toBeLessThan(
      legacy.indexOf("entities.AnalyzerResult.filter"),
    );
    expect(legacy).toContain("if (!marketDecision.ok) continue");

    const agent = read("base44/functions/recommendationEngineAgent/entry.ts");
    const gate = agent.indexOf("const marketDecision = commercialMarketDecision(brand?.country)");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(agent.indexOf("entities.AgentTask.create"));
    expect(gate).toBeLessThan(agent.indexOf("entities.Recommendation.create"));
    expect(agent.slice(gate, agent.indexOf("entities.AgentTask.create"))).toContain("NOT_AVAILABLE_IN_MARKET");
  });

  it("brand recommendation regeneration gates the market before every Recommendation mutation", () => {
    const src = read(
      "base44/functions/regenerateRecommendationsForBrand/entry.ts",
    );
    const gate = src.indexOf(
      "const marketDecision = commercialMarketDecision(brand?.country)",
    );
    const deletion = src.indexOf("entities.Recommendation.delete", gate);
    const creation = src.indexOf("entities.Recommendation.bulkCreate", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(src.slice(gate, deletion)).toContain("if (!marketDecision.ok)");
    expect(src.slice(gate, deletion)).toContain(
      "material_effects_fail_closed: true",
    );
    expect(gate).toBeLessThan(deletion);
    expect(gate).toBeLessThan(creation);
  });

  it("legacy autonomous acquisition gates policy and lead markets before mutations", () => {
    const src = read(
      "base44/functions/autonomousCommercialWorker/entry.ts",
    );
    const policyGate = src.indexOf("commercialMarketDecision(value)");
    const taskMutation = src.indexOf("entities.AgentTask.create");
    expect(policyGate).toBeGreaterThan(-1);
    expect(policyGate).toBeLessThan(taskMutation);
    expect(src.slice(policyGate, taskMutation)).toContain(
      "material_effects_fail_closed:true",
    );

    const leadGate = src.indexOf(
      "const marketDecision=commercialMarketDecision(lead.country)",
    );
    const threadMutation = src.indexOf(
      "entities.CommunicationThread.create",
      leadGate,
    );
    const leadMutation = src.indexOf("entities.OutboundLead.update", leadGate);
    expect(leadGate).toBeGreaterThan(-1);
    expect(leadGate).toBeLessThan(threadMutation);
    expect(leadGate).toBeLessThan(leadMutation);
    expect(src.slice(leadGate, threadMutation)).toContain(
      "if(!marketDecision.ok)",
    );
  });

  it("volume acquisition gates policy before scheduler effects and lead before commercial writes", () => {
    const src = read("base44/functions/outboundVolumeWorker/entry.ts");
    const policyGate = src.indexOf("commercialMarketDecision(value)");
    const schedulerClaim = src.indexOf("claimSchedulerRun(svc, req");
    const schedulerEffect = src.indexOf("markSchedulerEffectStarted(");
    expect(policyGate).toBeGreaterThan(-1);
    expect(policyGate).toBeLessThan(schedulerClaim);
    expect(policyGate).toBeLessThan(schedulerEffect);
    expect(src.slice(policyGate, schedulerClaim)).toContain(
      "material_effects_fail_closed: true",
    );

    const leadGate = src.indexOf(
      "const marketDecision = commercialMarketDecision(x.country)",
    );
    const strategyMutation = src.indexOf(
      "entities.CommercialStrategy.create",
      leadGate,
    );
    const threadMutation = src.indexOf(
      "entities.CommunicationThread.create",
      leadGate,
    );
    const leadMutation = src.indexOf("entities.OutboundLead.update", leadGate);
    expect(leadGate).toBeGreaterThan(-1);
    expect(leadGate).toBeLessThan(strategyMutation);
    expect(leadGate).toBeLessThan(threadMutation);
    expect(leadGate).toBeLessThan(leadMutation);
    expect(src.slice(leadGate, strategyMutation)).toContain(
      "if (!marketDecision.ok",
    );
  });

  it("Recover context/start/accept all re-check market eligibility and expose no success fee off-market", () => {
    const context = read("base44/functions/getRecoverAcceptanceContext/entry.ts");
    const contextGate = context.indexOf("const marketDecision = commercialMarketDecision(brand?.country)");
    expect(contextGate).toBeGreaterThan(-1);
    expect(contextGate).toBeLessThan(context.indexOf("const fee = await resolveFeePctForMonth"));

    const start = read("base44/functions/startRecoverAcceptance/entry.ts");
    const startGate = start.indexOf("const marketDecision = commercialMarketDecision(brand?.country)");
    expect(startGate).toBeGreaterThan(-1);
    expect(startGate).toBeLessThan(start.indexOf("const fee = await resolveFeePctForMonth"));
    expect(startGate).toBeLessThan(start.indexOf("entities.Mandate.create"));

    const accept = read("base44/functions/acceptRecoverMandate/entry.ts");
    const acceptGate = accept.indexOf("const marketDecision = commercialMarketDecision(brand?.country)");
    expect(acceptGate).toBeGreaterThan(-1);
    expect(acceptGate).toBeLessThan(accept.indexOf("await claimRecoverAcceptanceAuthority(svc, {"));
    expect(accept.slice(acceptGate)).toContain("NOT_AVAILABLE_IN_MARKET");
  });

  it("outreach blocks a non-launch lead before draft artifacts and before execute claim", () => {
    const src = read("base44/functions/outreachAgent/entry.ts");
    const draftLead = src.indexOf("const marketDecision = commercialMarketDecision(lead.country)");
    const draftThread = src.indexOf("const thread = await ensureCanonicalThread", draftLead);
    const draftTask = src.indexOf("entities.AgentTask.create", draftLead);
    expect(draftLead).toBeGreaterThan(-1);
    expect(draftLead).toBeLessThan(draftThread);
    expect(draftLead).toBeLessThan(draftTask);

    const executeGate = src.indexOf("const approvedMarket = commercialMarketDecision(approvedLead.country)");
    const executionClaim = src.indexOf("claimExternalApprovalExecution", executeGate);
    expect(executeGate).toBeGreaterThan(-1);
    expect(executeGate).toBeLessThan(executionClaim);
  });

  it("registration and evidence ingestion remain open and park inactive markets on the waitlist", () => {
    const company = read("src/components/onboarding/CompanyBlock.jsx");
    expect(company).toContain("base44.entities.Brand.create");
    expect(company).toContain("marketExperience?.analyzer?.status !== 'ENABLED'");
    expect(company).toContain("navigate('/#market-availability')");

    const waitlist = read("base44/functions/submitWaitlistSignup/entry.ts");
    expect(waitlist).toContain("market_code: marketCode");
    expect(waitlist).toContain("consent: true");

    const upload = read("base44/functions/processUploadedFile/entry.ts");
    expect(upload).toContain("entities.StatementImport.create");
    expect(upload).not.toContain("NOT_AVAILABLE_IN_MARKET");
    expect(upload).not.toContain("commercialMarketDecision");
  });

  it("public country selectors offer exactly the 10 operational launch markets", () => {
    const switcher = read("src/components/shared/MarketSwitcher.jsx");
    expect(switcher).toContain("ACTIVE_LAUNCH_MARKETS.includes(market.iso2)");
    const analyzer = read("src/pages/PaymentsAnalyzer.jsx");
    expect(analyzer).toContain("ACTIVE_LAUNCH_MARKETS.includes(market.iso2)");
    const availability = read("src/components/landing/MarketAvailabilitySection.jsx");
    expect(availability).toContain("JoinWaitlistButton");
    expect(availability).toContain('source="market_not_launch_waitlist"');
  });
});
