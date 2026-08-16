import { describe, expect, it } from "vitest";
import {
  adaptiveContactGate,
  allocateAdaptiveQueueV0,
  assessCompanyGapsV0,
  buildAdaptiveLeadDecisionV0,
  buildAdaptiveLeadScoreCardV0,
  buildAdaptiveQueueDecisionV0,
  buildDropAuditPlanV0,
  createAdaptiveTransition,
  evaluateGapValueOfInformationV0,
  IllegalAdaptiveLeadTransition,
} from "../../base44/shared/adaptiveLeadCore.ts";
import { evaluateContactResolutionEligibility } from "../../base44/shared/contactLast.ts";
import { buildResilientLeadScore } from "../../base44/shared/leadScoringResilience.ts";

const TIME = "2026-08-13T12:00:00.000Z";
const POLICY_HASH = `sha256:${"a".repeat(64)}`;

const company = (overrides = {}) => ({
  id: "lead-1",
  company_name: "Maison Marchand",
  company_domain: "maison.example",
  canonical_company_key: "domain:maison.example",
  country: "FR",
  industry: "retail ecommerce",
  employee_range: "51-200",
  revenue_range: "EUR 10m-50m",
  detected_technologies: ["Shopify"],
  probable_payment_stack: ["Stripe"],
  enrichment_json: { markets: ["FR", "ES"], currencies: ["EUR"] },
  source: "apollo",
  stage: "scored",
  reservoir_state: "qualified",
  score: 84,
  score_breakdown_json: {
    breakdown: { commerce_fit: 22, economic_potential: 18 },
    opportunity_score: 84,
    evidence_confidence: 0.82,
    evidence_count: 6,
    scoring_version: "merchant-company-opportunity-v3",
  },
  ...overrides,
});

const highDecision = (lead = company(), overrides = {}) =>
  buildAdaptiveLeadDecisionV0({
    lead,
    score_snapshot: {
      breakdown: { commerce_fit: 22, economic_potential: 18 },
      opportunity_score: 84,
      evidence_confidence: 0.82,
      evidence_count: 6,
    },
    current_intelligence_state: "CHEAP_SCREENED",
    decision_time: TIME,
    policy: {
      policy_key: "merchant-canary",
      version: "adaptive-canary-1",
      engine: "merchant_acquisition",
      min_lead_score: 65,
      min_confidence: 0.55,
      min_fit_score: 60,
      min_opportunity_score: 65,
      min_evidence_confidence: 0.55,
    },
    policy_binding: {
      binding_version: "merchant-acquisition-policy-binding.v1",
      authority_status: "EXACT_ACTIVE",
      engine: "merchant_acquisition",
      policy_key: "merchant-canary",
      policy_version: "adaptive-canary-1",
      policy_content_hash: POLICY_HASH,
      content_scope:
        "FULL_POLICY_CONTENT_EXCLUDING_BASE44_SYSTEM_ID_AND_AUDIT_METADATA",
    },
    aggregate_coverage: {
      status: "COMPLETE",
      coverage_complete: true,
    },
    ...overrides,
  });

const commercialPolicy = {
  policy_key: "merchant-canary",
  version: "7",
  engine: "merchant_acquisition",
  status: "active",
  approved_at: "2026-08-01T00:00:00.000Z",
  approved_by: "founder@cambra-global.com",
  effective_at: "2026-08-01T00:00:00.000Z",
  expires_at: "2026-09-01T00:00:00.000Z",
  countries: ["FR", "ES"],
  languages: ["fr", "es", "en"],
  min_lead_score: 70,
  min_confidence: 0.55,
  excluded_domains: [],
  icp_json: {
    contact_resolution_enabled: true,
    enrichment_daily_limit: 15,
    enrichment_weekly_limit: 60,
  },
};

describe("Adaptive Lead Phase 3 typed state machine", () => {
  it("accepts only legal typed transitions and requires decision lineage", () => {
    const transition = createAdaptiveTransition({
      candidate_id: "lead-1",
      dimension: "INTELLIGENCE",
      from_state: "CHEAP_SCREENED",
      to_state: "PLAUSIBLE_FIT",
      reason_codes: ["COMPANY_SCREEN_PASS"],
      decision_snapshot_ref: "decision-1",
      occurred_at: TIME,
    });
    expect(transition).toMatchObject({
      from_state: "CHEAP_SCREENED",
      to_state: "PLAUSIBLE_FIT",
      persisted: false,
    });
    expect(() =>
      createAdaptiveTransition({
        candidate_id: "lead-1",
        dimension: "INTELLIGENCE",
        from_state: "CHEAP_SCREENED",
        to_state: "OUTREACH_WORTHY",
        reason_codes: ["SKIP_GATES"],
        decision_snapshot_ref: "decision-1",
      })
    ).toThrow(IllegalAdaptiveLeadTransition);
  });

  it("rejects contact before OUTREACH_WORTHY and suppression beats transitions", () => {
    expect(() =>
      createAdaptiveTransition({
        candidate_id: "lead-1",
        dimension: "CONTACT",
        from_state: "NOT_REQUESTED",
        to_state: "ROLE_TARGET_DEFINED",
        intelligence_state: "GAP_ASSESSED",
        reason_codes: ["PREMATURE_CONTACT"],
        decision_snapshot_ref: "decision-1",
      })
    ).toThrow(/contact_requires_outreach_worthy/);
    expect(() =>
      createAdaptiveTransition({
        candidate_id: "lead-1",
        dimension: "INTELLIGENCE",
        from_state: "CHEAP_SCREENED",
        to_state: "PLAUSIBLE_FIT",
        suppressed: true,
        reason_codes: ["SUPPRESSED"],
        decision_snapshot_ref: "decision-1",
      })
    ).toThrow(/suppression_precedes_transition/);
  });

  it("requires explicit new evidence to reopen a terminal decision", () => {
    expect(() =>
      createAdaptiveTransition({
        candidate_id: "lead-1",
        dimension: "INTELLIGENCE",
        from_state: "DROPPED",
        to_state: "GAP_ASSESSED",
        reopen: true,
        reason_codes: ["REOPEN"],
        decision_snapshot_ref: "decision-2",
      })
    ).toThrow(/illegal_intelligence_transition/);
    expect(createAdaptiveTransition({
      candidate_id: "lead-1",
      dimension: "INTELLIGENCE",
      from_state: "DROPPED",
      to_state: "GAP_ASSESSED",
      reopen: true,
      reopen_evidence_refs: ["evidence:new"],
      reason_codes: ["NEW_ELIGIBLE_EVIDENCE"],
      decision_snapshot_ref: "decision-2",
      occurred_at: TIME,
    })).toMatchObject({ reopened: true, persisted: false });
  });
});

describe("Adaptive Lead company scores, gaps and VoI", () => {
  it("keeps fit, opportunity, conversion, confidence and support separate and preserves unknown", () => {
    const scores = buildAdaptiveLeadScoreCardV0({
      lead: { id: "unknown", company_name: "Unknown" },
      decision_time: TIME,
    });
    expect(scores.fit.value).toBeNull();
    expect(scores.opportunity.value).toBeNull();
    expect(scores.conversion.value).toBeNull();
    expect(scores.evidence_confidence.value).toBeNull();
    expect(scores.support.status).toBe("UNKNOWN_SUPPORT");
    expect(scores.expected_savings).toMatchObject({
      status: "UNKNOWN",
      low: null,
      mid: null,
      high: null,
      billing_eligible: false,
    });
  });

  it("assesses company gaps identically regardless of person data", () => {
    const input = {
      score_snapshot: {
        breakdown: { commerce_fit: 15 },
        opportunity_score: 55,
        evidence_confidence: 0.6,
        evidence_count: 3,
      },
      current_intelligence_state: "CHEAP_SCREENED",
      decision_time: TIME,
    };
    const a = assessCompanyGapsV0({
      ...input,
      lead: company({
        probable_payment_stack: [],
        contact_full_name: "Ada CFO",
        contact_email: "ada@maison.example",
        contact_title: "CFO",
      }),
    });
    const b = assessCompanyGapsV0({
      ...input,
      lead: company({
        probable_payment_stack: [],
        contact_full_name: "Ivo Intern",
        contact_email: null,
        contact_title: "Intern",
      }),
    });
    expect(a).toEqual(b);
    expect(a.some((gap) => /contact|email|person/.test(gap.gap_key))).toBe(false);
    expect(a.find((gap) => gap.gap_key === "payment_stack").status).toBe(
      "RESOLVABLE",
    );
  });

  it("chooses research only when conservative net VoI is positive and stops costly research", () => {
    const gap = {
      gap_id: "gap:1:payment_stack",
      candidate_id: "lead-1",
      gap_key: "payment_stack",
      status: "RESOLVABLE",
      decision_sensitivity: { confidence: 0.7 },
    };
    const action = {
      action_id: "company-psp-check",
      rights_allowed: true,
      source_success_band: { low: 1, mid: 1, high: 1 },
      decision_change_band: { low: 1, mid: 1, high: 1 },
      decision_value_improvement_band: { low: 20, mid: 20, high: 20 },
      acquisition_costs: {
        api: 1,
        llm: 0,
        latency: 0,
        privacy_compliance: 0,
        other: 0,
      },
      source_refs: ["source-action:psp-check-v1"],
    };
    const useful = evaluateGapValueOfInformationV0({
      candidate_id: "lead-1",
      gap,
      action,
      decision_time: TIME,
      budget_authorized: true,
      policy: { candidate_cost_cap_utility: 10, minimum_net_voi: 0 },
    });
    expect(useful).toMatchObject({
      selected_action: "RESEARCH",
      net_value_band: { low: 19, mid: 19, high: 19 },
      probabilistic_calibration: false,
      authority_granted: false,
      execution_requested: false,
    });

    const costly = evaluateGapValueOfInformationV0({
      candidate_id: "lead-1",
      gap,
      action: {
        ...action,
        acquisition_costs: {
          api: 25,
          llm: 0,
          latency: 0,
          privacy_compliance: 0,
          other: 0,
        },
      },
      decision_time: TIME,
      budget_authorized: true,
      policy: { candidate_cost_cap_utility: 10, minimum_net_voi: 0 },
    });
    expect(costly.selected_action).toBe("NO_RESEARCH");
    expect(costly.reason_codes).toContain(
      "CANDIDATE_COST_CAP_OR_BUDGET_BLOCK",
    );
  });

  it("emits RESEARCH_MORE for a material gap with bounded positive VoI", () => {
    const action = {
      action_id: "company-psp-check",
      rights_allowed: true,
      source_success_band: { low: 1, mid: 1, high: 1 },
      decision_change_band: { low: 1, mid: 1, high: 1 },
      decision_value_improvement_band: { low: 20, mid: 20, high: 20 },
      acquisition_costs: {
        api: 1,
        llm: 0,
        latency: 0,
        privacy_compliance: 0,
        other: 0,
      },
      source_refs: ["source-action:psp-check-v1"],
    };
    const lead = company({
      probable_payment_stack: [],
      score: 50,
      score_breakdown_json: {
        breakdown: { commerce_fit: 15, economic_potential: 10 },
        opportunity_score: 50,
        evidence_confidence: 0.7,
        evidence_count: 4,
      },
    });
    const decision = buildAdaptiveLeadDecisionV0({
      lead,
      score_snapshot: {
        breakdown: { commerce_fit: 15 },
        opportunity_score: 50,
        evidence_confidence: 0.7,
        evidence_count: 4,
      },
      current_intelligence_state: "CHEAP_SCREENED",
      decision_time: TIME,
      budget_authorized: true,
      policy: {
        min_fit_score: 70,
        min_opportunity_score: 70,
        candidate_cost_cap_utility: 10,
        source_actions: { payment_stack: [action] },
      },
    });
    expect(decision.disposition).toBe("RESEARCH_MORE");
    expect(decision.intelligence_state_after).toBe("RESEARCHING");
    expect(decision.contact_resolution_eligible).toBe(false);
  });

  it("stops at BUDGET_STOPPED instead of converting missing research into DROP", () => {
    const decision = buildAdaptiveLeadDecisionV0({
      lead: company({
        probable_payment_stack: [],
        score: 45,
        score_breakdown_json: {
          breakdown: { commerce_fit: 12 },
          opportunity_score: 45,
          evidence_confidence: 0.75,
          evidence_count: 4,
        },
      }),
      score_snapshot: {
        breakdown: { commerce_fit: 12 },
        opportunity_score: 45,
        evidence_confidence: 0.75,
        evidence_count: 4,
      },
      current_intelligence_state: "CHEAP_SCREENED",
      decision_time: TIME,
      budget_authorized: false,
      policy: { min_fit_score: 70, min_opportunity_score: 70 },
    });
    expect(decision).toMatchObject({
      disposition: "BUDGET_STOPPED",
      intelligence_state_after: "BUDGET_STOPPED",
      stopping_reason: "MAX_COST_REACHED",
      contact_resolution_eligible: false,
    });
  });
});

describe("Adaptive Lead stopping, contact-last and false-negative audit", () => {
  it("suppression wins over high score, value, capacity and contact", () => {
    const decision = highDecision(company({
      reservoir_state: "suppressed",
      outreach_eligibility: "BLOCKED",
    }));
    expect(decision).toMatchObject({
      disposition: "DROP",
      intelligence_state_after: "SUPPRESSED_COMPANY",
      contact_resolution_eligible: false,
      paid_action_authorized: false,
      automatic_outreach_authorized: false,
    });
    expect(adaptiveContactGate(decision).allowed).toBe(false);
    expect(decision.drop_audit).toMatchObject({
      eligible: false,
      selected: false,
      contact_allowed: false,
    });
  });

  it("makes a robust DROP durable in the decision snapshot and never a negative label", () => {
    const decision = buildAdaptiveLeadDecisionV0({
      lead: company({
        industry: "business consulting",
        detected_technologies: ["HubSpot"],
        probable_payment_stack: ["none_observed"],
      }),
      score_snapshot: {
        breakdown: { commerce_fit: 0 },
        fit_score: 0,
        opportunity_score: 10,
        evidence_confidence: 0.9,
        evidence_count: 8,
      },
      current_intelligence_state: "CHEAP_SCREENED",
      decision_time: TIME,
      policy: { min_fit_score: 60, min_opportunity_score: 65 },
    });
    expect(decision).toMatchObject({
      disposition: "DROP",
      intelligence_state_after: "DROPPED",
      contact_resolution_eligible: false,
      training_label: false,
    });
    expect(decision.transition_plan.at(-1)).toMatchObject({
      to_state: "DROPPED",
      persisted: false,
    });
    const audit = buildDropAuditPlanV0({
      decision_snapshot: decision,
      audit_rate: 1,
      audit_seed: "test",
    });
    expect(audit).toMatchObject({
      eligible: true,
      selected: true,
      contact_allowed: false,
      personal_data_requested: false,
      spend_authorized: false,
      negative_training_label: false,
      causal_claim: false,
    });
  });

  it("lets the existing contact-last gate consume an adaptive DROP snapshot", () => {
    const adaptiveDrop = highDecision(company(), {
      explicit_disqualification_reason: "OUT_OF_SCOPE_BUSINESS_MODEL",
    });
    const lead = company({
      outreach_eligibility: "NOT_ASSESSED",
      compliance_status: "REVIEW_REQUIRED",
      score_breakdown_json: {
        ...company().score_breakdown_json,
        adaptive_lead_v0: adaptiveDrop,
      },
    });
    const result = evaluateContactResolutionEligibility(lead, commercialPolicy, {
      now: Date.parse(TIME),
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("adaptive_outreach_worthiness_required");
    expect(result.role_target).toBeNull();
  });

  it("integrates the bounded snapshot after scoring without model/calibration claims", () => {
    const result = buildResilientLeadScore(
      company({ stage: "lead", score_breakdown_json: {} }),
      null,
      "UNAVAILABLE_OR_UNPARSEABLE",
    );
    expect(result.score_breakdown_json.adaptive_lead_v0).toMatchObject({
      company_only: true,
      contact_features_used: false,
      probabilistic_calibration: false,
      trained_model: false,
      causal_claim: false,
      runtime_persisted: false,
      runtime_verified: false,
    });
    expect(JSON.stringify(result.score_breakdown_json.adaptive_lead_v0))
      .not.toContain('"probabilistic_calibration":true');
  });
});

describe("Adaptive expected-value queue", () => {
  const queueLead = (id, opportunity = 84) => {
    const lead = company({
      id,
      canonical_company_key: `domain:${id}.example`,
      company_domain: `${id}.example`,
      contact_email: `finance@${id}.example`,
      contactability: "PROFESSIONAL_VERIFIED",
      compliance_status: "CLEARED",
      outreach_eligibility: "ELIGIBLE",
    });
    const decision = highDecision(lead);
    decision.scores.opportunity.value = opportunity;
    return { lead, decision };
  };

  const queueInput = (id, opportunity = 84) => {
    const { lead, decision } = queueLead(id, opportunity);
    return {
      lead,
      adaptive_decision: decision,
      policy_active: true,
      fresh_enough: true,
      strategy_ready: true,
      assigned_at: TIME,
      freshness_score: 90,
      policy: { version: "queue-v0", markets: ["FR"] },
      expected_value_input: {
        decision_id: `expected-value:${id}`,
        utility_unit: "HEURISTIC_UTILITY_POINT",
        assumptions: ["Founder-approved queue scenario."],
        source_refs: ["queue-scenario:v0"],
        options: [{
          action: "QUEUE",
          direct_cost_utility: 1,
          outcomes: [{ outcome_id: "bounded", probability: 1, utility: 50 }],
        }],
      },
    };
  };

  it("keeps unknown conversion separate while producing explainable priority", () => {
    const decision = buildAdaptiveQueueDecisionV0(queueInput("lead-a"));
    expect(decision).toMatchObject({
      eligible: true,
      calibration_status: "HEURISTIC",
      probabilistic_calibration: false,
      capacity_affects_eligibility: false,
      authority_granted: false,
    });
    expect(decision.priority_score).toBeTypeOf("number");
    expect(decision.components.conversion).toMatchObject({
      value: null,
      included: false,
      null_semantics: "UNKNOWN_EXCLUDED_NOT_ZERO",
    });
    expect(decision.expected_value_advisory.status).toBe(
      "SIMULATED_ADVISORY",
    );
  });

  it("uses capacity only after eligibility and never lowers quality", () => {
    const inputs = [queueInput("lead-a", 90), queueInput("lead-b", 70)];
    const none = allocateAdaptiveQueueV0(inputs, {
      capacity: 0,
      policy: { version: "queue-v0", markets: ["FR"] },
    });
    expect(none).toMatchObject({
      eligible_count: 2,
      allocated_count: 0,
      qualification_threshold_changed: false,
      capacity_role: "RANK_AFTER_ELIGIBILITY",
    });
    expect(none.decisions.every((row) => row.eligible)).toBe(true);
    expect(none.decisions.every((row) => row.allocation_status === "WAITING_CAPACITY"))
      .toBe(true);

    const one = allocateAdaptiveQueueV0(inputs, {
      capacity: 1,
      policy: { version: "queue-v0", markets: ["FR"] },
    });
    expect(one.eligible_count).toBe(2);
    expect(one.allocated_count).toBe(1);
    expect(one.decisions.find((row) => row.allocated).candidate_id).toBe(
      "lead-a",
    );
  });

  it("makes suppression an eligibility blocker regardless of expected value", () => {
    const input = queueInput("lead-suppressed", 100);
    input.suppressed = true;
    const decision = buildAdaptiveQueueDecisionV0(input);
    expect(decision.eligible).toBe(false);
    expect(decision.constraints).toContain("SUPPRESSED");
  });
});
