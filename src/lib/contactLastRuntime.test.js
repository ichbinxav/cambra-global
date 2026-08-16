import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  companyOnlyLeadProjection,
  contactRoleTarget,
  durableQualificationSnapshot,
  evaluateContactResolutionEligibility,
  evaluateSuppressionLookup,
  MAX_CONTACTS_PER_COMPANY,
  readCompleteContactUsageWindow,
  sameEmployer,
  validateDurableOutreachWorthySnapshot,
} from "../../base44/shared/contactLast.ts";

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const NOW = Date.parse("2026-08-13T12:00:00.000Z");
const POLICY_HASH = `sha256:${"a".repeat(64)}`;
const policyBinding = (overrides = {}) => ({
  binding_version: "merchant-acquisition-policy-binding.v1",
  authority_status: "EXACT_ACTIVE",
  engine: "merchant_acquisition",
  policy_key: "merchant-canary",
  policy_version: "7",
  policy_content_hash: POLICY_HASH,
  ...overrides,
});

const policy = (overrides = {}) => ({
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
  ...overrides,
});

const lead = (overrides = {}) => ({
  id: "lead-1",
  company_name: "Maison Marchand",
  company_domain: "maison.example",
  canonical_company_key: "domain:maison.example",
  country: "FR",
  industry: "retail ecommerce",
  stage: "scored",
  reservoir_state: "qualified",
  outreach_eligibility: "NOT_ASSESSED",
  compliance_status: "REVIEW_REQUIRED",
  score: 82,
  score_breakdown_json: {
    evidence_confidence: 0.78,
    breakdown: { commerce_fit: 21, economic_potential: 17 },
    adaptive_lead_v0: {
      decision_id: "adaptive-decision:lead-1:2026-08-13T11:55:00.000Z",
      candidate_id: "lead-1",
      canonical_company_key: "domain:maison.example",
      decision_time: "2026-08-13T11:55:00.000Z",
      disposition: "DECLARE_OUTREACH_WORTHY",
      intelligence_state_after: "OUTREACH_WORTHY",
      suppressed: false,
      compliance_blocked: false,
      company_only: true,
      contact_features_used: false,
      policy_binding: policyBinding(),
      governed_contact_eligibility: {
        eligible: true,
        score: 82,
        score_source: "merchantOpportunity.deterministicMerchantOpportunity",
        score_methodology: "DETERMINISTIC_COMPANY_ONLY_HEURISTIC",
        policy_threshold: 70,
        evidence_confidence: 0.78,
        evidence_confidence_threshold: 0.55,
        composite_or_llm_score_used: false,
        privacy_safe_aggregate_coverage: {
          status: "COMPLETE",
          coverage_complete: true,
        },
      },
    },
  },
  external_refs_json: { apollo_organization_id: "org-1" },
  ...overrides,
});

describe("Company-before-person / Contact Last runtime", () => {
  it("projects only company evidence and never exposes person fields pre-fit", () => {
    const projection = companyOnlyLeadProjection(lead({
      contact_full_name: "Ada CFO",
      contact_title: "CFO",
      contact_email: "ada@maison.example",
      linkedin_url: "https://linkedin.example/ada",
    }));
    expect(projection).not.toHaveProperty("contact_full_name");
    expect(projection).not.toHaveProperty("contact_title");
    expect(projection).not.toHaveProperty("contact_email");
    expect(projection).not.toHaveProperty("linkedin_url");
  });

  it("requires a scored, policy-authorized, evidence-supported company before contact", () => {
    const allowed = evaluateContactResolutionEligibility(lead(), policy(), {
      now: NOW,
      policy_binding: policyBinding(),
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.snapshot).toMatchObject({
      decision: "OUTREACH_WORTHY",
      company_only: true,
      contact_features_used: false,
      company_score: 82,
    });
    expect(allowed.role_target.maximum_contacts).toBe(2);

    const preScore = evaluateContactResolutionEligibility(
      lead({ stage: "lead", score: null }),
      policy(),
      { now: NOW, policy_binding: policyBinding() },
    );
    expect(preScore.allowed).toBe(false);
    expect(preScore.blockers).toContain("company_scoring_required");

    const unbudgeted = evaluateContactResolutionEligibility(
      lead(),
      policy({ countries: [], icp_json: {} }),
      { now: NOW, policy_binding: policyBinding() },
    );
    expect(unbudgeted.allowed).toBe(false);
    expect(unbudgeted.blockers).toEqual(expect.arrayContaining([
      "policy_market_scope_required",
      "contact_resolution_policy_required",
      "contact_resolution_budget_required",
    ]));
  });

  it("requires an Adaptive Lead OUTREACH_WORTHY snapshot for legacy rows", () => {
    const legacy = lead({
      score_breakdown_json: {
        evidence_confidence: 0.78,
        breakdown: { commerce_fit: 21, economic_potential: 17 },
      },
    });
    const result = evaluateContactResolutionEligibility(legacy, policy(), {
      now: NOW,
      policy_binding: policyBinding(),
    });
    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      "adaptive_outreach_worthiness_snapshot_required",
      "rescore_or_backfill_required",
    ]));
  });

  it("fails closed when a suppression result is unavailable or ambiguous", () => {
    expect(evaluateSuppressionLookup("ada@maison.example", undefined))
      .toMatchObject({
        allowed: false,
        state: "UNAVAILABLE",
        blocker: "suppression_lookup_unavailable",
      });
    expect(evaluateSuppressionLookup("ada@maison.example", [
      { email: "ada@maison.example", active: true },
      { email: "ada@maison.example", active: true },
    ])).toMatchObject({
      allowed: false,
      suppressed: true,
      state: "AMBIGUOUS",
      blocker: "suppression_lookup_ambiguous",
    });
    expect(evaluateSuppressionLookup("ada@maison.example", []))
      .toMatchObject({ allowed: true, state: "CLEAR" });
  });

  it("requires the exact Adaptive decision and persisted qualification references", () => {
    const candidate = lead();
    const eligible = evaluateContactResolutionEligibility(
      candidate,
      policy(),
      { now: NOW, policy_binding: policyBinding() },
    );
    const qualification = durableQualificationSnapshot(eligible.snapshot);
    const persisted = lead({
      source_evidence_json: {
        contact_last: { company_qualification: qualification },
      },
    });
    expect(validateDurableOutreachWorthySnapshot(persisted, qualification))
      .toMatchObject({ allowed: true });
    expect(validateDurableOutreachWorthySnapshot(persisted, {
      ...qualification,
      qualification_ref: "stale-or-other-policy",
    })).toMatchObject({
      allowed: false,
      blockers: expect.arrayContaining([
        "durable_contact_gate_reference_mismatch",
      ]),
    });
  });

  it("blocks policy content drift even when key and version are unchanged", () => {
    const result = evaluateContactResolutionEligibility(
      lead(),
      policy(),
      {
        now: NOW,
        policy_binding: policyBinding({
          policy_content_hash: `sha256:${"b".repeat(64)}`,
        }),
      },
    );
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain("commercial_policy_content_hash_mismatch");
  });

  it("never lets a 65+ composite or LLM score authorize contact when the governed deterministic score is below policy", () => {
    const candidate = lead({
      score: 96,
      score_breakdown_json: {
        evidence_confidence: 0.99,
        breakdown: { commerce_fit: 29, economic_potential: 29 },
        adaptive_lead_v0: {
          ...lead().score_breakdown_json.adaptive_lead_v0,
          governed_contact_eligibility: {
            ...lead().score_breakdown_json.adaptive_lead_v0
              .governed_contact_eligibility,
            eligible: false,
            score: 65,
            blockers: ["deterministic_eligibility_score_below_policy"],
          },
        },
      },
    });
    const result = evaluateContactResolutionEligibility(
      candidate,
      policy(),
      { now: NOW, policy_binding: policyBinding() },
    );
    expect(result.allowed).toBe(false);
    expect(result.snapshot).toMatchObject({
      company_score: 65,
      legacy_composite_or_llm_advisory_score: 96,
      composite_or_llm_score_used: false,
    });
    expect(result.blockers).toEqual(expect.arrayContaining([
      "deterministic_company_score_below_policy_threshold",
      "governed_deterministic_contact_eligibility_required",
    ]));
  });

  it("paginates the full 1,250 contact cap and fails closed on ledger read errors", async () => {
    const occurredAt = "2026-08-13T11:00:00.000Z";
    const rows = Array.from({ length: 1250 }, (_, index) => ({
      id: `usage-${index}`,
      provider: "apollo",
      source: "leadEnrichmentAgent",
      status: "OBSERVED",
      occurred_at: occurredAt,
    }));
    const calls = [];
    const service = {
      entities: {
        CostUsageEvent: {
          filter: async (query, sort, limit, skip) => {
            calls.push({ query, sort, limit, skip });
            return rows.slice(skip, skip + limit);
          },
        },
      },
    };
    const capped = await readCompleteContactUsageWindow(service, {
      window_start: "2026-08-06T12:00:00.000Z",
      limit: 1250,
      page_size: 500,
    });
    expect(capped).toMatchObject({
      allowed: true,
      complete: true,
      exhausted: true,
      used: 1250,
      remaining: 0,
      pages: 3,
      coverage: "COMPLETE_TO_POLICY_CAP",
    });
    expect(calls.map((call) => call.skip)).toEqual([0, 500, 1000]);
    expect(calls.map((call) => call.limit)).toEqual([500, 500, 250]);
    expect(calls[0].query.status).toEqual({
      $in: ["RESERVED", "OBSERVED", "RECONCILED"],
    });

    const failed = await readCompleteContactUsageWindow({
      entities: {
        CostUsageEvent: {
          filter: async () => {
            throw new Error("ledger unavailable");
          },
        },
      },
    }, {
      window_start: "2026-08-13T00:00:00.000Z",
      limit: 15,
    });
    expect(failed).toMatchObject({
      allowed: false,
      complete: false,
      exhausted: true,
      remaining: 0,
      blocker: "contact_usage_ledger_read_unavailable",
    });
  });

  it("makes DROP/suppression terminal for contact spend", () => {
    for (
      const dropped of [
        lead({ stage: "disqualified", reservoir_state: "disqualified" }),
        lead({ reservoir_state: "suppressed" }),
        lead({ outreach_eligibility: "BLOCKED" }),
        lead({ company_domain: "blocked.example" }),
      ]
    ) {
      const result = evaluateContactResolutionEligibility(
        dropped,
        policy({ excluded_domains: ["blocked.example"] }),
        { now: NOW, policy_binding: policyBinding() },
      );
      expect(result.allowed).toBe(false);
      expect(result.blockers).toContain("suppression_or_terminal_exclusion");
      expect(result.role_target).toBeNull();
    }
  });

  it("does not let person attributes influence the company gate", () => {
    const finance = evaluateContactResolutionEligibility(
      lead({
        contact_full_name: "Ada",
        contact_title: "Chief Financial Officer",
        contact_email: "ada@maison.example",
      }),
      policy(),
      { now: NOW, policy_binding: policyBinding() },
    );
    const unknown = evaluateContactResolutionEligibility(
      lead({
        contact_full_name: null,
        contact_title: null,
        contact_email: null,
      }),
      policy(),
      { now: NOW, policy_binding: policyBinding() },
    );
    expect(finance.allowed).toBe(unknown.allowed);
    expect(finance.snapshot).toEqual(unknown.snapshot);
  });

  it("caps the role target at two and requires a current employer match", () => {
    expect(contactRoleTarget(lead(), policy(), { maximum_contacts: 99 }))
      .toMatchObject({ maximum_contacts: MAX_CONTACTS_PER_COMPANY });
    expect(sameEmployer(lead(), { organization_id: "org-1" })).toBe(true);
    expect(sameEmployer(lead(), {
      organization_id: "other",
      organization: { primary_domain: "other.example" },
    })).toBe(false);
  });

  it("keeps broad provider discovery company-only", () => {
    const discovery = read("base44/functions/leadDiscoveryAgent/entry.ts");
    expect(discovery).not.toContain("mixed_people/api_search");
    expect(discovery).not.toContain("providerAdapter.searchPeople");
    expect(discovery).not.toContain("apollo_person_id:");
    expect(discovery).toContain("titles: []");
    expect(discovery).toContain(
      "DISCARDED_NOT_PERSISTED_NOT_SCORED_PRE_CONTACT_GATE",
    );
    expect(discovery).toContain("contact_endpoint_called: false");
  });

  it("fails closed on duplicate paid discovery reservations before provider calls", () => {
    const discovery = read("base44/functions/leadDiscoveryAgent/entry.ts");
    const instantly = discovery.slice(
      discovery.indexOf("async function runInstantlyPreviewDiscovery"),
      discovery.indexOf("Deno.serve"),
    );
    expect(instantly.indexOf("if (reservation.duplicate)"))
      .toBeLessThan(instantly.indexOf("adapter.searchCompanies"));
    expect(instantly).toContain(
      "DUPLICATE_PAID_DISCOVERY_EFFECT_REVIEW_REQUIRED",
    );
    const apollo = discovery.slice(
      discovery.indexOf("const costReservation = await reservePaidOperation"),
    );
    expect(apollo.indexOf("if (costReservation.duplicate)"))
      .toBeLessThan(apollo.indexOf("providerAdapter.searchCompanies"));
    expect(apollo).toContain("review_required: true");
  });

  it("orders scoring before explicit contact resolution and never double-runs both chains", () => {
    const orchestrator = read("base44/functions/leadOrchestrator/entry.ts");
    const target = orchestrator.slice(
      orchestrator.indexOf('mode: "CONTACT_LAST"'),
    );
    expect(target.indexOf('phase: "COMPANY_SCORING"')).toBeGreaterThan(-1);
    expect(target.indexOf('phase: "CONTACT_RESOLUTION"')).toBeGreaterThan(
      target.indexOf('phase: "COMPANY_SCORING"'),
    );
    expect(orchestrator).toContain("LEAD_ORCHESTRATOR_LEGACY_CHAIN_ENABLED");
    expect(orchestrator).toContain("double_run_prevented: true");
  });

  it("blocks duplicate paid contact effects before either person endpoint", () => {
    const enrichment = read("base44/functions/leadEnrichmentAgent/entry.ts");
    const loop = enrichment.slice(
      enrichment.indexOf("for (const queuedLead of leads)"),
    );
    const knownSuppression = loop.indexOf("strictSuppressionLookup");
    const gate = loop.indexOf("evaluateContactResolutionEligibility");
    const reserve = loop.indexOf("reservePaidOperation");
    const duplicate = loop.indexOf("if (reservation.duplicate)");
    const provider = loop.indexOf("searchApolloContacts");
    expect(knownSuppression).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThan(knownSuppression);
    expect(reserve).toBeGreaterThan(gate);
    expect(duplicate).toBeGreaterThan(reserve);
    expect(provider).toBeGreaterThan(duplicate);
    expect(enrichment).toContain("NEEDS_REVIEW_DUPLICATE_EFFECT");
    expect(enrichment).toContain(
      "DUPLICATE_PAID_CONTACT_EFFECT_REVIEW_REQUIRED",
    );
  });

  it("requires exactly one active policy and never converts suppression errors to an empty set", () => {
    const enrichment = read("base44/functions/leadEnrichmentAgent/entry.ts");
    const runtime = enrichment.slice(enrichment.indexOf("Deno.serve"));
    expect(runtime).toContain("readExactActiveMerchantAcquisitionPolicy");
    expect(runtime).toContain("policyAuthority.allowed");
    expect(runtime).toContain("AMBIGUOUS_ACTIVE_COMMERCIAL_POLICIES");
    expect(runtime).toContain("EXACTLY_ONE_ACTIVE_COMMERCIAL_POLICY_REQUIRED");
    expect(enrichment).toContain("async function strictCurrentPolicy");
    expect(enrichment).toContain("commercial_policy_snapshot_changed");
    expect(runtime.indexOf("if (policyGateError)"))
      .toBeLessThan(runtime.indexOf("reservePaidOperation(service"));
    const suppressionHelper = enrichment.slice(
      enrichment.indexOf("async function strictSuppressionLookup"),
      enrichment.indexOf("function contactGateBlockPatch"),
    );
    expect(suppressionHelper).toContain("rows = undefined");
    expect(suppressionHelper).not.toContain("fallback: []");
    expect(runtime).toContain("IMMEDIATELY_BEFORE_PROVIDER");
    expect(runtime).toContain("AFTER_PROVIDER_BEFORE_PERSON_PERSISTENCE");
    expect(runtime).toContain("IMMEDIATELY_BEFORE_PERSON_PERSISTENCE");
    expect(runtime).toContain("AFTER_PERSON_PERSISTENCE");
    expect(runtime).toContain("PERSON_PERSISTENCE_REVERTED_FAIL_CLOSED");
  });

  it("blocks real SEND when the final outbound suppression read is unavailable or ambiguous", () => {
    const worker = read(
      "base44/functions/outboundVolumeWorker/entry.ts",
    );
    const helperStart = worker.indexOf(
      "async function strictOutboundSuppressionClear",
    );
    const suppressionHelper = worker.slice(
      helperStart,
      worker.indexOf("async function draft", helperStart),
    );
    const compactHelper = suppressionHelper.replace(/\s+/g, "").replaceAll(
      '"',
      "'",
    );
    expect(compactHelper).toContain("'-created_date',2");
    expect(compactHelper).toContain("rows=undefined");
    expect(compactHelper).toContain("fallback:null");
    expect(compactHelper).not.toContain("fallback:[]");
    const firstGate = worker.indexOf("const initialSuppression");
    const finalGate = worker.indexOf("const finalSuppression");
    expect(firstGate)
      .toBeLessThan(worker.indexOf("CommunicationThread.create"));
    // The worker rechecks before thread creation so an unavailable suppression
    // authority cannot leave a misleading canonical thread behind. The actual
    // transport boundary performs an additional independent recheck.
    expect(finalGate).toBeLessThan(worker.indexOf("CommunicationThread.create"));
    expect(finalGate).toBeLessThan(worker.indexOf("commercialSendMessage"));
    expect(
      worker.slice(finalGate, worker.indexOf("commercialSendMessage"))
        .replace(/\s+/g, ""),
    ).toMatch(/if\(!finalSuppression\.allowed\|\|!finalContactGate\.allowed/);
    const sender = read("base44/functions/commercialSendMessage/entry.ts");
    const boundarySuppression = sender.indexOf("const boundarySuppression");
    const providerBoundary = sender.indexOf(
      "markCommercialSendTransportStarted",
      boundarySuppression,
    );
    expect(boundarySuppression).toBeGreaterThan(-1);
    expect(providerBoundary).toBeGreaterThan(boundarySuppression);
  });

  it("blocks outbound volume before lead reads or SEND unless exactly one active policy exists", () => {
    const worker = read("base44/functions/outboundVolumeWorker/entry.ts");
    const compact = worker.replace(/\s+/g, "").replaceAll('"', "'");
    expect(compact).toContain("activePolicies.length!==1");
    expect(compact).toContain("ambiguous_active_commercial_policies");
    expect(compact).toContain("exactly_one_active_commercial_policy_required");
    expect(compact).toContain("commercial_policy_lookup_unavailable");
    expect(compact).not.toContain(".find((p:any)=>policyIsActive(p))");
    const gate = compact.indexOf("if(activePolicies.length!==1)");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(compact.indexOf("strictRows(svc,'OutboundLead'"));
    expect(gate).toBeLessThan(compact.indexOf("commercialSendMessage"));
  });
});
