import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  APOLLO_EXPIRY_AT,
  canonicalCompanyKey,
  cheapDiscoveryPreScore,
  classifyProfessionalEmail,
  discoveryProviderStatus,
  normalizeDiscoveryEmployeeRange,
  selectDiscoveryPolicies,
} from "../../base44/shared/discoveryRadar.ts";
import { buildResilientLeadScore } from "../../base44/shared/leadScoringResilience.ts";

const read = (path) => fs.readFileSync(path, "utf8");

describe("P6 autonomous discovery radar", () => {
  it("keeps canonical company identity provider-independent", () => {
    expect(canonicalCompanyKey("https://www.Example.com/shop")).toBe(
      "domain:example.com",
    );
    expect(read("base44/entities/OutboundLead.jsonc")).toContain(
      "external_refs_json",
    );
    expect(read("base44/entities/LeadDiscoveryCheckpoint.jsonc")).toContain(
      "Provider-agnostic",
    );
  });

  it("pre-scores company evidence before any contact resolution", () => {
    const result = cheapDiscoveryPreScore({
      title: "Head of Payments",
      organization: {
        name: "Merchant",
        primary_domain: "merchant.eu",
        industry: "DTC ecommerce retail",
        estimated_num_employees: 120,
        technologies: ["Shopify", "Stripe"],
      },
    });
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.enrichment_worthy).toBe(true);
    const filteredResult = cheapDiscoveryPreScore({
      organization: {
        name: "Filtered Merchant",
        primary_domain: "filtered-merchant.eu",
        industry: "retail",
        estimated_num_employees: null,
        employee_range: "50-200",
        technologies: ["shopify"],
      },
    });
    expect(filteredResult.enrichment_worthy).toBe(true);
    expect(filteredResult.reasons).toContain("employee_range_filter_matched");
    const discovery = read("base44/functions/leadDiscoveryAgent/entry.ts");
    const enrichment = read("base44/functions/leadEnrichmentAgent/entry.ts");
    expect(discovery.indexOf("canonical_company_key")).toBeLessThan(
      discovery.indexOf("bulkCreate"),
    );
    expect(discovery).toContain("providerAdapter.searchCompanies");
    expect(discovery).not.toContain("providerAdapter.searchPeople");
    expect(discovery).not.toContain("mixed_people/api_search");
    expect(discovery).toContain("new ApolloLeadProvider");
    expect(discovery).toContain("refresh_existing_company_evidence");
    expect(discovery).toContain("updateOutboundLeadEvidence");
    const evidenceWriter = read("base44/shared/outboundLeadEvidence.ts");
    expect(evidenceWriter).toContain("laneAuthority(MERCHANT_LANE)");
    expect(evidenceWriter).toContain(
      "outbound_lead_evidence_patch_refused_stage_fields",
    );
    expect(discovery).toMatch(/provider_credit_cost_documented:\s*1/);
    expect(enrichment).toContain('operation !== "CONTACT_RESOLUTION"');
    expect(enrichment).toContain("evaluateContactResolutionEligibility");
    expect(enrichment.indexOf("evaluateContactResolutionEligibility"))
      .toBeLessThan(enrichment.indexOf("reservePaidOperation(service"));
    expect(enrichment).toContain("enrichment_daily_limit");
    expect(enrichment).toContain("enrichment_weekly_limit");
    expect(enrichment).toContain("rollingWeekStart");
    expect(enrichment).toContain("readCompleteContactUsageWindow");
  });

  it("rejects generic, personal and company-mismatched emails", () => {
    expect(
      classifyProfessionalEmail("info@merchant.eu", "merchant.eu").accepted,
    ).toBe(false);
    expect(classifyProfessionalEmail("cfo@gmail.com", "merchant.eu").accepted)
      .toBe(false);
    expect(classifyProfessionalEmail("cfo@other.eu", "merchant.eu").accepted)
      .toBe(false);
    expect(classifyProfessionalEmail("cfo@merchant.eu", "merchant.eu"))
      .toMatchObject({ accepted: true, status: "PROFESSIONAL_VERIFIED" });
  });

  it("translates founder-facing company sizes into provider-native ranges", () => {
    expect(normalizeDiscoveryEmployeeRange("51_200_employees", "APOLLO"))
      .toBe("51,200");
    expect(normalizeDiscoveryEmployeeRange("1,001–5,000 employees", "APOLLO"))
      .toBe("1001,5000");
    expect(normalizeDiscoveryEmployeeRange("201,500", "INSTANTLY"))
      .toBe("201 - 500");
  });

  it("scores a provider-matched employee range without inventing an exact count", () => {
    const result = buildResilientLeadScore({
      id: "lead-range",
      company_name: "Range Merchant",
      company_domain: "range-merchant.eu",
      country: "ES",
      industry: "retail",
      employee_range: "200-1000",
      detected_technologies: ["shopify", "stripe"],
      probable_payment_stack: ["stripe"],
      source: "apollo",
    }, null, "SKIPPED_DETERMINISTIC_ONLY");
    expect(result.score_breakdown_json.signals.employees).toBeNull();
    expect(result.score_breakdown_json.signals.employee_range).toBe("200-1000");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("sunsets Apollo without deleting or breaking the canonical warehouse", () => {
    expect(APOLLO_EXPIRY_AT).toContain("2026-09-07");
    expect(discoveryProviderStatus(true, new Date("2026-09-08T00:00:00Z")))
      .toMatchObject({ status: "EXPIRED", available: false });
    expect(discoveryProviderStatus(false, new Date("2026-08-11T00:00:00Z")))
      .toMatchObject({ status: "UNAVAILABLE", available: false });
  });

  it("keeps discovery separate from outbound activation", () => {
    const worker = read(
      "base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts",
    );
    const orchestrator = read("base44/functions/leadOrchestrator/entry.ts");
    const policy = read("base44/functions/commercialPolicyAdmin/entry.ts");
    expect(worker).toContain("selectDiscoveryPolicy");
    expect(worker).not.toMatch(
      /commercialSendMessage|resend\.emails|outlook.*send/i,
    );
    expect(policy).toContain("outbound_policy_status_unchanged");
    expect(policy).toContain("START_AUTONOMOUS_DISCOVERY");
    expect(orchestrator).toContain("discovery_summary");
    expect(worker).toContain(
      "decision_makers_found:discoveryResult.decision_makers_found",
    );
    expect(worker).toContain("base44.functions.invoke('leadOrchestrator'");
    expect(worker).not.toContain("service.functions.invoke('leadOrchestrator'");
  });

  it("requires an active policy before autonomous discovery can run", () => {
    const base = {
      engine: "merchant_acquisition",
      countries: ["ES"],
      icp_json: { discovery_enabled: true },
    };
    expect(selectDiscoveryPolicies([
      { ...base, status: "draft" },
      { ...base, status: "paused" },
    ])).toEqual([]);
    expect(selectDiscoveryPolicies([{ ...base, status: "active" }])).toHaveLength(1);
    const worker = read("base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts");
    expect(worker.indexOf("scheduledDiscoveryWorkPresent")).toBeLessThan(
      worker.lastIndexOf("markSchedulerEffectStarted"),
    );
    expect(worker).toContain("!policy&&!scheduledDiscoveryMayWrite");
  });

  it("degrades model scoring safely without stranding the discovery chain", () => {
    const lead = {
      id: "lead-1",
      company_name: "Merchant",
      company_domain: "merchant.eu",
      contact_title: "CEO",
      industry: "ecommerce",
      raw_json: {
        organization: {
          estimated_num_employees: 120,
          technologies: ["Shopify", "Stripe"],
        },
      },
    };
    const result = buildResilientLeadScore(
      lead,
      null,
      "UNAVAILABLE_OR_UNPARSEABLE",
    );
    expect(result.id).toBe("lead-1");
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score_breakdown_json).toMatchObject({
      model_status: "UNAVAILABLE_OR_UNPARSEABLE",
      weights: { deterministic: 1, llm: 0 },
      company_only: true,
      contact_features_used: false,
      email_cap_applied: false,
      legacy_contact_cap_removed: true,
    });
    const scorer = read("base44/functions/leadScoringAgent/entry.ts");
    expect(scorer).toContain("lead_scoring_model_degraded");
    expect(scorer).toMatch(/raw_model_output_persisted:\s*false/);
    expect(scorer).not.toContain("Claude returned unparseable response");
  });

  it("exposes the canonical Discovery V2 Founder UX without losing P6 truth boundaries", () => {
    const ui = read("src/pages/admin/AdminDiscovery.jsx");
    expect(ui).toContain("['overview','Overview']");
    expect(ui).toContain("['merchants','Merchants']");
    expect(ui).toContain("without wasting enrichment spend");
    expect(ui).toContain("No matching results in this Run");
    expect(ui).toContain(
      "CAMBRA will not substitute unrelated warehouse records",
    );
    expect(ui).toContain("Pre-Run Plan");
    expect(ui).toContain("Discovery has no outbound side effect");
  });
});
