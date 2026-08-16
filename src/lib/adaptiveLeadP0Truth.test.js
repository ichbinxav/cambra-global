import { describe, expect, it } from "vitest";
import {
  ACQUISITION_ADVISORY_LABEL_CONTRACT,
  acquisitionAdvisoryEligible,
  evaluateAcquisitionLearningEligibility,
  evaluateOutreachExperimentEligibility,
  OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT,
  verifiedSavingsAttributionEligibility,
} from "../../base44/shared/adaptiveLeadLearning.ts";
import {
  boundedLearningMultiplier,
  cohortKey,
} from "../../base44/shared/acquisitionLearning.ts";
import { cheapDiscoveryPreScore } from "../../base44/shared/discoveryRadar.ts";
import { deterministicMerchantOpportunity } from "../../base44/shared/merchantOpportunity.ts";
import { buildResilientLeadScore } from "../../base44/shared/leadScoringResilience.ts";
import { chooseVariant } from "../../base44/shared/outreachExperiment.ts";

const scoredLead = (overrides = {}) => ({
  id: "lead-1",
  company_name: "Merchant",
  company_domain: "merchant.eu",
  country: "FR",
  industry: "ecommerce",
  stage: "scored",
  score_breakdown_json: { scoring_version: "point-in-time-v1", signals: {} },
  ...overrides,
});

const exactEconomicInput = (overrides = {}) => {
  const input = {
    lead: scoredLead({ id: "lead-1", stage: "won" }),
    thread: {
      id: "thread-1",
      lead_id: "lead-1",
      last_outbound_at: "2026-08-01T00:00:00.000Z",
    },
    attribution: {
      id: "attribution-1",
      lead_id: "lead-1",
      brand_id: "brand-1",
      thread_id: "thread-1",
      exposure_at: "2026-08-01T00:00:00.000Z",
      onboarding_observed_at: "2026-08-02T00:00:00.000Z",
      deal_activation_id: "deal-1",
      deal_activated_at: "2026-08-03T00:00:00.000Z",
      monthly_savings_report_id: "report-1",
      report_observed_at: "2026-08-10T00:00:00.000Z",
      attribution_method: "exact_lead_thread_exposure_report_lineage",
      attribution_method_version: "verified-savings-attribution-v1.0.0",
      attribution_state: "EXACT",
      economic_attribution_eligible: true,
      attributed_at: "2026-08-11T00:00:00.000Z",
    },
    verified_savings: {
      amount: 1250,
      observed_at: "2026-08-10T00:00:00.000Z",
      report_id: "report-1",
      deal_activation_id: "deal-1",
      brand_id: "brand-1",
    },
  };
  return {
    ...input,
    ...overrides,
    lead: { ...input.lead, ...(overrides.lead || {}) },
    thread: { ...input.thread, ...(overrides.thread || {}) },
    attribution: {
      ...input.attribution,
      ...(overrides.attribution || {}),
    },
    verified_savings: overrides.verified_savings === null ? null : {
      ...input.verified_savings,
      ...(overrides.verified_savings || {}),
    },
  };
};

describe("Adaptive Lead P0 operational truth", () => {
  it("company cheap pre-fit is invariant to person title", () => {
    const organization = {
      name: "Merchant",
      primary_domain: "merchant.eu",
      industry: "DTC ecommerce retail",
      estimated_num_employees: 120,
      technologies: ["Shopify", "Stripe"],
    };
    const cfo = cheapDiscoveryPreScore({ title: "CFO", organization });
    const intern = cheapDiscoveryPreScore({ title: "Intern", organization });
    expect(cfo).toEqual(intern);
    expect(cfo).toMatchObject({
      company_only: true,
      contact_features_used: false,
    });
    expect(cfo.reasons).not.toContain("relevant_decision_maker");
  });

  it("company opportunity never reads contact identity/title/email into pre-fit", () => {
    const company = {
      id: "lead-1",
      company_name: "Merchant",
      company_domain: "merchant.eu",
      country: "FR",
      industry: "ecommerce",
      source: "apollo",
      raw_json: {
        organization: {
          name: "Merchant",
          industry: "retail ecommerce",
          estimated_num_employees: 120,
          technologies: ["Shopify", "Stripe"],
        },
      },
    };
    const cfo = deterministicMerchantOpportunity({
      ...company,
      contact_full_name: "Ada CFO",
      contact_title: "Chief Financial Officer",
      contact_email: "ada@merchant.eu",
    });
    const intern = deterministicMerchantOpportunity({
      ...company,
      contact_full_name: "Ivo Intern",
      contact_title: "Intern",
      contact_email: null,
    });
    expect(cfo.opportunity_score).toBe(intern.opportunity_score);
    expect(cfo.evidence_confidence).toBe(intern.evidence_confidence);
    expect(cfo.breakdown.decision_maker).toBe(0);
    expect(cfo).toMatchObject({
      company_only: true,
      contact_features_used: false,
      probabilistic_calibration: false,
    });
    expect(cfo.contact_role_advisory.status).toBe(
      "NOT_AVAILABLE_PRE_CONTACT_GATE",
    );
  });

  it("retains a 0-100 compatibility score without the former missing-email penalty", () => {
    const lead = scoredLead({
      raw_json: {
        organization: {
          industry: "retail ecommerce",
          estimated_num_employees: 300,
          technologies: ["Shopify", "Stripe"],
        },
      },
    });
    const withoutEmail = buildResilientLeadScore(
      lead,
      null,
      "UNAVAILABLE_OR_UNPARSEABLE",
    );
    const withEmail = buildResilientLeadScore(
      { ...lead, contact_email: "cfo@merchant.eu", contact_title: "CFO" },
      null,
      "UNAVAILABLE_OR_UNPARSEABLE",
    );
    expect(withoutEmail.score).toBe(withEmail.score);
    expect(withoutEmail.score_breakdown_json).toMatchObject({
      company_only: true,
      contact_features_used: false,
      email_cap_applied: false,
      legacy_contact_cap_removed: true,
    });
  });

  it("keeps unexecuted and immature candidates out of the negative denominator", () => {
    const lead = scoredLead();
    const unexecuted = evaluateAcquisitionLearningEligibility(
      { lead, thread: { id: "thread-1" } },
      new Date("2026-08-20T00:00:00Z"),
    );
    expect(unexecuted).toMatchObject({
      status: "PENDING_EXECUTION",
      actual_exposure: false,
      negative: false,
    });
    expect(acquisitionAdvisoryEligible(unexecuted)).toBe(false);

    const immature = evaluateAcquisitionLearningEligibility(
      {
        lead,
        thread: { id: "thread-1", last_outbound_at: "2026-08-01T00:00:00Z" },
      },
      new Date("2026-08-20T00:00:00Z"),
    );
    expect(immature).toMatchObject({
      status: "PENDING_LABEL_MATURITY",
      actual_exposure: true,
      negative: false,
    });
    expect(acquisitionAdvisoryEligible(immature)).toBe(false);
  });

  it("allows a negative only after confirmed exposure and the complete horizon", () => {
    const result = evaluateAcquisitionLearningEligibility(
      {
        lead: scoredLead(),
        thread: { id: "thread-1", last_outbound_at: "2026-08-01T00:00:00Z" },
      },
      new Date("2026-09-02T00:00:00Z"),
    );
    expect(result).toMatchObject({
      status: "ELIGIBLE_AGGREGATE_ONLY",
      actual_exposure: true,
      positive: false,
      negative: true,
      training_eligible: false,
      probabilistic_calibration: false,
    });
    expect(acquisitionAdvisoryEligible(result)).toBe(true);
  });

  it("accepts only post-exposure observed progression as an early positive", () => {
    const lead = scoredLead();
    const valid = evaluateAcquisitionLearningEligibility(
      {
        lead,
        thread: {
          id: "thread-1",
          last_outbound_at: "2026-08-01T00:00:00Z",
          last_inbound_at: "2026-08-02T00:00:00Z",
          classification: "interested",
        },
      },
      new Date("2026-08-03T00:00:00Z"),
    );
    expect(valid).toMatchObject({
      status: "ELIGIBLE_AGGREGATE_ONLY",
      positive: true,
      negative: false,
      outcomes: ["reply", "positive_reply"],
    });

    const impossibleHistory = evaluateAcquisitionLearningEligibility(
      {
        lead,
        thread: {
          id: "thread-1",
          last_outbound_at: "2026-08-03T00:00:00Z",
          last_inbound_at: "2026-08-02T00:00:00Z",
          classification: "interested",
        },
      },
      new Date("2026-08-04T00:00:00Z"),
    );
    expect(impossibleHistory.status).toBe("PENDING_LABEL_MATURITY");
    expect(impossibleHistory.outcomes).toEqual([]);
  });

  it("labels verified savings only for one exact post-exposure/onboarding report lineage", () => {
    const input = exactEconomicInput();
    const result = evaluateAcquisitionLearningEligibility(
      input,
      new Date("2026-08-12T00:00:00Z"),
    );
    expect(result.outcomes).toEqual(["won", "verified_savings"]);
    expect(verifiedSavingsAttributionEligibility(
      input.lead,
      input.thread,
      input.attribution,
      input.verified_savings,
    )).toMatchObject({
      eligible: true,
      reason: "EXACT_POST_EXPOSURE_ONBOARDING_REPORT_LINEAGE",
      report_id: "report-1",
      amount: 1250,
    });
  });

  it("never relabels a pre-existing savings outcome as acquisition progression", () => {
    const input = exactEconomicInput({
      verified_savings: { observed_at: "2026-07-31T23:59:59.000Z" },
    });
    const result = evaluateAcquisitionLearningEligibility(
      input,
      new Date("2026-08-12T00:00:00Z"),
    );
    expect(result.outcomes).toContain("won");
    expect(result.outcomes).not.toContain("verified_savings");

    const beforeOnboarding = exactEconomicInput({
      verified_savings: { observed_at: "2026-08-01T12:00:00.000Z" },
    });
    expect(
      evaluateAcquisitionLearningEligibility(
        beforeOnboarding,
        new Date("2026-08-12T00:00:00Z"),
      ).outcomes,
    ).not.toContain("verified_savings");
  });

  it("preserves reply, meeting and won when savings attribution is ambiguous or missing", () => {
    const input = exactEconomicInput({
      thread: {
        last_inbound_at: "2026-08-04T00:00:00.000Z",
        classification: "meeting",
        meeting_status: "completed",
        meeting_end_at: "2026-08-05T00:00:00.000Z",
      },
      attribution: {
        attribution_state: "AMBIGUOUS",
        economic_attribution_eligible: false,
        monthly_savings_report_id: null,
      },
      verified_savings: null,
    });
    const result = evaluateAcquisitionLearningEligibility(
      input,
      new Date("2026-08-12T00:00:00Z"),
    );
    expect(result.outcomes).toEqual([
      "reply",
      "positive_reply",
      "meeting",
      "won",
    ]);
    expect(result.outcomes).not.toContain("verified_savings");
  });

  it("does not leak one Brand report onto a second lead", () => {
    const input = exactEconomicInput({
      lead: { id: "lead-2" },
      thread: { id: "thread-2", lead_id: "lead-2" },
    });
    const result = evaluateAcquisitionLearningEligibility(
      input,
      new Date("2026-08-12T00:00:00Z"),
    );
    expect(result.outcomes).not.toContain("verified_savings");
    expect(verifiedSavingsAttributionEligibility(
      input.lead,
      input.thread,
      input.attribution,
      input.verified_savings,
    )).toMatchObject({ eligible: false });
  });

  it("keeps legacy/unknown cohorts neutral and allows only contracted advisory cohorts", () => {
    expect(
      boundedLearningMultiplier({ sample_size: 100, mean_outcome_value: 1 }),
    ).toBe(1);
    const contracted = {
      sample_size: 100,
      eligible_sample_size: 100,
      mean_outcome_value: 1,
      label_contract_version: ACQUISITION_ADVISORY_LABEL_CONTRACT.label_version,
      methodology_class: ACQUISITION_ADVISORY_LABEL_CONTRACT.methodology_class,
      probabilistic_calibration: false,
      training_eligible: false,
    };
    expect(boundedLearningMultiplier(contracted)).toBeGreaterThan(1);
    expect(boundedLearningMultiplier(contracted)).toBeLessThanOrEqual(1.15);
  });

  it("uses contact role only after the company/contact gate, never in pre-fit cohorts", () => {
    const before = cohortKey(scoredLead({ contact_title: "CFO" }));
    const after = cohortKey(scoredLead({
      contact_title: "CFO",
      stage: "outreach_ready",
      reservoir_state: "ready",
    }));
    expect(before).toContain("pre_contact_not_available");
    expect(before).not.toContain("finance");
    expect(after).toContain("finance");
  });

  it("does not exploit legacy outreach stats with unknown exposure denominators", () => {
    const legacy = [{
      engine: "merchant_acquisition",
      variant_key: "diagnostic",
      sample_size: 1000,
      performance_score: 1,
    }];
    for (let index = 0; index < 25; index++) {
      expect(
        chooseVariant("merchant_acquisition", `legacy-${index}`, legacy).mode,
      ).toBe("explore");
    }

    const eligible = [{
      engine: "merchant_acquisition",
      variant_key: "diagnostic",
      sample_size: 40,
      eligible_sample_size: 40,
      performance_score: 1,
      label_contract_version:
        OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.label_version,
      methodology_class:
        OUTREACH_EXPERIMENT_ADVISORY_LABEL_CONTRACT.methodology_class,
      probabilistic_calibration: false,
      training_eligible: false,
    }];
    expect(
      Array.from(
        { length: 100 },
        (_, index) =>
          chooseVariant("merchant_acquisition", `eligible-${index}`, eligible)
            .mode,
      ),
    ).toContain("exploit");
  });

  it("applies the same exposure/maturity gate to outreach variant evaluation", () => {
    const pending = evaluateOutreachExperimentEligibility({
      thread: { last_outbound_at: "2026-08-01T00:00:00Z" },
    }, new Date("2026-08-10T00:00:00Z"));
    const mature = evaluateOutreachExperimentEligibility({
      thread: { last_outbound_at: "2026-08-01T00:00:00Z" },
    }, new Date("2026-09-02T00:00:00Z"));
    expect(pending).toMatchObject({
      status: "PENDING_LABEL_MATURITY",
      negative: false,
    });
    expect(mature).toMatchObject({
      status: "ELIGIBLE_AGGREGATE_ONLY",
      negative: true,
    });
  });
});
