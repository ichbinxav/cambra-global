import { policyIsActive } from "./commercialAutonomy.ts";
import { canonicalMarket } from "./marketContext.ts";
import { adaptiveContactGate } from "./adaptiveLeadCore.ts";
import { merchantPolicyBindingMatches } from "./commercialPolicyAuthority.ts";

export const CONTACT_LAST_CONTRACT_VERSION = "contact-last-p0-v1.1.0";
export const MAX_CONTACTS_PER_COMPANY = 2;

const text = (value: unknown) => String(value || "").trim();

function observedNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedDomain(value: unknown) {
  return text(value).toLowerCase().replace(/^https?:\/\//, "").replace(
    /^www\./,
    "",
  ).split("/")[0];
}

function normalizedEmail(value: unknown) {
  return text(value).toLowerCase();
}

/**
 * Interpret a ContactSuppression read without silently treating an unreadable
 * or contradictory result as an empty suppression set. The caller owns the
 * entity read; this pure boundary makes every failure mode explicit and
 * testable.
 */
export function evaluateSuppressionLookup(
  email: unknown,
  rows: unknown,
) {
  const expectedEmail = normalizedEmail(email);
  if (!expectedEmail) {
    return {
      allowed: true,
      suppressed: false,
      state: "NOT_APPLICABLE",
      blocker: null,
      match_count: 0,
    };
  }
  if (!Array.isArray(rows)) {
    return {
      allowed: false,
      suppressed: false,
      state: "UNAVAILABLE",
      blocker: "suppression_lookup_unavailable",
      match_count: null,
    };
  }
  const malformed = rows.some((row: any) =>
    row?.active !== true || normalizedEmail(row?.email) !== expectedEmail
  );
  if (malformed || rows.length > 1) {
    return {
      allowed: false,
      // Multiple exact active rows still prove suppression even though the
      // uniqueness violation itself requires reconciliation.
      suppressed: !malformed && rows.length > 0,
      state: "AMBIGUOUS",
      blocker: "suppression_lookup_ambiguous",
      match_count: rows.length,
    };
  }
  if (rows.length === 1) {
    return {
      allowed: false,
      suppressed: true,
      state: "SUPPRESSED",
      blocker: "known_contact_suppression",
      match_count: 1,
    };
  }
  return {
    allowed: true,
    suppressed: false,
    state: "CLEAR",
    blocker: null,
    match_count: 0,
  };
}

export function durableQualificationSnapshot(snapshot: any) {
  const adaptiveRef = text(snapshot?.adaptive_decision_ref);
  const candidateId = text(snapshot?.candidate_id);
  const policyKey = text(snapshot?.policy_key);
  const policyVersion = text(snapshot?.policy_version);
  const policyContentHash = text(snapshot?.policy_content_hash);
  const deterministicScore = observedNumber(snapshot?.company_score);
  const evaluatedAt = text(snapshot?.evaluated_at);
  return {
    ...snapshot,
    qualification_ref:
      `contact-qualification:${candidateId}:${adaptiveRef}:${policyKey}:${policyVersion}:${policyContentHash}:${deterministicScore}:${evaluatedAt}`,
    persistence_required_before_contact: true,
  };
}

/**
 * A provider call may only rely on an OUTREACH_WORTHY qualification that was
 * written to the lead and read back. `expected` is the in-memory snapshot the
 * caller attempted to persist; exact references prevent a stale/other policy
 * snapshot from satisfying the gate.
 */
export function validateDurableOutreachWorthySnapshot(
  lead: any,
  expected: any,
) {
  const blockers: string[] = [];
  const adaptiveDecision = lead?.score_breakdown_json?.adaptive_lead_v0;
  const persisted = lead?.source_evidence_json?.contact_last
    ?.company_qualification;
  const adaptiveGate = adaptiveDecision
    ? adaptiveContactGate(adaptiveDecision)
    : null;
  if (!adaptiveDecision) {
    blockers.push("adaptive_outreach_worthiness_snapshot_required");
  }
  if (!text(adaptiveDecision?.decision_id)) {
    blockers.push("adaptive_decision_identity_required");
  }
  if (adaptiveGate && !adaptiveGate.allowed) {
    blockers.push(...adaptiveGate.blockers);
  }
  if (!persisted) blockers.push("durable_outreach_worthy_snapshot_required");
  if (persisted?.decision !== "OUTREACH_WORTHY") {
    blockers.push("durable_outreach_worthy_decision_required");
  }
  if (persisted?.persistence_required_before_contact !== true) {
    blockers.push("durable_contact_gate_marker_required");
  }
  if (
    !text(persisted?.qualification_ref) ||
    text(persisted?.qualification_ref) !== text(expected?.qualification_ref)
  ) blockers.push("durable_contact_gate_reference_mismatch");
  if (
    !text(persisted?.adaptive_decision_ref) ||
    text(persisted?.adaptive_decision_ref) !==
      text(adaptiveDecision?.decision_id) ||
    text(persisted?.adaptive_decision_ref) !==
      text(expected?.adaptive_decision_ref)
  ) blockers.push("durable_adaptive_decision_reference_mismatch");
  if (
    text(persisted?.candidate_id) !== text(lead?.id) ||
    text(persisted?.candidate_id) !== text(expected?.candidate_id)
  ) blockers.push("durable_candidate_reference_mismatch");
  if (
    text(persisted?.canonical_company_key) !==
      text(lead?.canonical_company_key) ||
    text(persisted?.canonical_company_key) !==
      text(expected?.canonical_company_key)
  ) blockers.push("durable_company_reference_mismatch");
  if (
    text(persisted?.policy_key) !== text(expected?.policy_key) ||
    text(persisted?.policy_version) !== text(expected?.policy_version)
  ) blockers.push("durable_policy_reference_mismatch");
  if (
    !text(persisted?.policy_content_hash) ||
    text(persisted?.policy_content_hash) !==
      text(expected?.policy_content_hash) ||
    text(persisted?.policy_content_hash) !==
      text(adaptiveDecision?.policy_binding?.policy_content_hash)
  ) blockers.push("durable_policy_content_hash_mismatch");
  if (
    observedNumber(persisted?.company_score) !==
      observedNumber(
        adaptiveDecision?.governed_contact_eligibility?.score,
      )
  ) blockers.push("durable_deterministic_score_mismatch");
  const uniqueBlockers = [...new Set(blockers)];
  return {
    allowed: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    qualification_ref: text(persisted?.qualification_ref) || null,
  };
}

export function companyOnlyLeadProjection(lead: any) {
  return {
    id: lead?.id || null,
    company_name: lead?.company_name || null,
    company_domain: lead?.company_domain || null,
    canonical_company_key: lead?.canonical_company_key || null,
    country: lead?.country || null,
    industry: lead?.industry || null,
    employee_range: lead?.employee_range || null,
    revenue_range: lead?.revenue_range || null,
    detected_technologies: Array.isArray(lead?.detected_technologies)
      ? lead.detected_technologies
      : [],
    ecommerce_platform: lead?.ecommerce_platform || null,
    probable_payment_stack: Array.isArray(lead?.probable_payment_stack)
      ? lead.probable_payment_stack
      : [],
    score: observedNumber(lead?.score),
    evidence_confidence: observedNumber(
      lead?.score_breakdown_json?.evidence_confidence,
    ),
  };
}

export function contactRoleTarget(
  lead: any,
  policy: any,
  input: { maximum_contacts?: unknown; now?: string } = {},
) {
  const requestedMaximum = Number(input.maximum_contacts);
  const maximumContacts = Math.max(
    1,
    Math.min(
      MAX_CONTACTS_PER_COMPANY,
      Number.isFinite(requestedMaximum)
        ? Math.floor(requestedMaximum)
        : MAX_CONTACTS_PER_COMPANY,
    ),
  );
  const market = canonicalMarket(lead?.country)?.iso2 || text(lead?.country)
    .toUpperCase() ||
    null;
  const language = Array.isArray(policy?.languages) && policy.languages.length
    ? String(policy.languages[0])
    : "en";
  return {
    role_target_id: `role-target:${
      text(lead?.id) || text(lead?.canonical_company_key)
    }`,
    candidate_id: text(lead?.id),
    role_families: [
      "FINANCE",
      "PAYMENTS",
      "ECOMMERCE",
      "EXECUTIVE",
      "OPERATIONS",
    ],
    seniority: ["C_LEVEL", "VP", "HEAD", "DIRECTOR"],
    priority_logic:
      "Prefer payments/finance ownership, then ecommerce/operations, then executive ownership; person data never affects company fit.",
    market,
    language,
    maximum_contacts: maximumContacts,
    reason:
      "Company passed the point-in-time outreach-worthiness gate; resolve the minimum professional contact set only.",
    policy_version: text(policy?.version),
    created_at: input.now || new Date().toISOString(),
  };
}

export function evaluateContactResolutionEligibility(
  lead: any,
  policy: any,
  input: {
    now?: number;
    maximum_contacts?: unknown;
    policy_binding?: any;
  } = {},
) {
  const blockers: string[] = [];
  const domain = normalizedDomain(lead?.company_domain);
  const adaptiveDecision = lead?.score_breakdown_json?.adaptive_lead_v0;
  const governed = adaptiveDecision?.governed_contact_eligibility || {};
  const score = observedNumber(governed?.score);
  const legacyCompositeScore = observedNumber(lead?.score);
  const confidence = observedNumber(governed?.evidence_confidence);
  const commerceFit = observedNumber(
    lead?.score_breakdown_json?.breakdown?.commerce_fit,
  );
  const economicPotential = observedNumber(
    lead?.score_breakdown_json?.breakdown?.economic_potential,
  );
  const scoreThreshold = observedNumber(policy?.min_lead_score);
  const boundScoreThreshold = observedNumber(governed?.policy_threshold);
  const confidenceThreshold = observedNumber(policy?.min_confidence);
  const boundConfidenceThreshold = observedNumber(
    governed?.evidence_confidence_threshold,
  );
  const contactDailyLimit = observedNumber(
    policy?.icp_json?.enrichment_daily_limit,
  );
  const contactWeeklyLimit = observedNumber(
    policy?.icp_json?.enrichment_weekly_limit,
  );
  const leadMarket = canonicalMarket(lead?.country)?.iso2 || null;
  const policyMarkets = new Set(
    (Array.isArray(policy?.countries) ? policy.countries : []).map(
      (value: any) => canonicalMarket(value)?.iso2,
    ).filter(Boolean),
  );
  const excludedDomains = new Set(
    (Array.isArray(policy?.excluded_domains) ? policy.excluded_domains : [])
      .map(normalizedDomain).filter(Boolean),
  );

  if (!text(lead?.id)) blockers.push("candidate_identity_required");
  if (!text(lead?.canonical_company_key) || !domain) {
    blockers.push("resolved_company_identity_required");
  }
  if (!leadMarket) blockers.push("eligible_market_required");
  if (!policyMarkets.size) blockers.push("policy_market_scope_required");
  if (policyMarkets.size && leadMarket && !policyMarkets.has(leadMarket)) {
    blockers.push("market_not_authorized_by_policy");
  }
  if (!policyIsActive(policy, input.now ?? Date.now())) {
    blockers.push("active_commercial_policy_required");
  }
  const bindingMatch = merchantPolicyBindingMatches(
    adaptiveDecision?.policy_binding,
    input.policy_binding,
  );
  if (!bindingMatch.allowed) blockers.push(...bindingMatch.blockers);
  if (policy?.icp_json?.contact_resolution_enabled !== true) {
    blockers.push("contact_resolution_policy_required");
  }
  if (
    contactDailyLimit === null || contactDailyLimit <= 0 ||
    contactWeeklyLimit === null || contactWeeklyLimit <= 0
  ) blockers.push("contact_resolution_budget_required");
  if (scoreThreshold === null || scoreThreshold < 0 || scoreThreshold > 100) {
    blockers.push("valid_company_score_threshold_required");
  }
  if (
    boundScoreThreshold === null || boundScoreThreshold !== scoreThreshold
  ) blockers.push("adaptive_policy_score_threshold_mismatch");
  if (score === null) blockers.push("deterministic_company_score_required");
  else if (scoreThreshold !== null && score < scoreThreshold) {
    blockers.push("deterministic_company_score_below_policy_threshold");
  }
  if (
    confidenceThreshold === null || confidenceThreshold < 0 ||
    confidenceThreshold > 1
  ) blockers.push("valid_company_confidence_threshold_required");
  if (
    boundConfidenceThreshold === null ||
    boundConfidenceThreshold !== confidenceThreshold
  ) blockers.push("adaptive_policy_confidence_threshold_mismatch");
  if (confidence === null) {
    blockers.push("company_evidence_confidence_required");
  } else if (
    confidenceThreshold !== null && confidence < confidenceThreshold
  ) {
    blockers.push("company_evidence_confidence_below_threshold");
  }
  if (
    governed?.score_methodology !== "DETERMINISTIC_COMPANY_ONLY_HEURISTIC" ||
    governed?.composite_or_llm_score_used !== false
  ) blockers.push("deterministic_company_score_contract_required");
  if (governed?.eligible !== true) {
    blockers.push("governed_deterministic_contact_eligibility_required");
  }
  if (commerceFit === null || commerceFit < 10) {
    blockers.push("material_commerce_fit_required");
  }
  if (economicPotential === null || economicPotential < 8) {
    blockers.push("material_economic_potential_required");
  }
  if (text(lead?.stage) !== "scored") blockers.push("company_scoring_required");
  if (
    ["suppressed", "disqualified", "converted"].includes(
      text(lead?.reservoir_state).toLowerCase(),
    ) || ["suppressed", "disqualified", "lost"].includes(
      text(lead?.stage).toLowerCase(),
    ) || text(lead?.outreach_eligibility).toUpperCase() === "BLOCKED" ||
    text(lead?.compliance_status).toUpperCase() === "BLOCKED" ||
    excludedDomains.has(domain)
  ) blockers.push("suppression_or_terminal_exclusion");

  // New scoring writes a company-only Adaptive Lead decision snapshot. It is a
  // mandatory predecessor: legacy rows must be rescored/backfilled and cannot
  // fall through the older numeric-only qualification path.
  const adaptiveGate = adaptiveDecision
    ? adaptiveContactGate(adaptiveDecision)
    : null;
  if (!adaptiveDecision) {
    blockers.push("adaptive_outreach_worthiness_snapshot_required");
    blockers.push("rescore_or_backfill_required");
  } else if (!text(adaptiveDecision?.decision_id)) {
    blockers.push("adaptive_decision_identity_required");
  }
  if (
    adaptiveDecision &&
    text(adaptiveDecision?.candidate_id) !== text(lead?.id)
  ) blockers.push("adaptive_candidate_reference_mismatch");
  if (
    adaptiveDecision &&
    text(adaptiveDecision?.canonical_company_key) !==
      text(lead?.canonical_company_key)
  ) blockers.push("adaptive_company_reference_mismatch");
  if (adaptiveGate && !adaptiveGate.allowed) {
    blockers.push(...adaptiveGate.blockers);
  }

  const uniqueBlockers = [...new Set(blockers)];
  const snapshot = {
    contract_version: CONTACT_LAST_CONTRACT_VERSION,
    decision: uniqueBlockers.length ? "NOT_OUTREACH_WORTHY" : "OUTREACH_WORTHY",
    candidate_id: text(lead?.id),
    canonical_company_key: text(lead?.canonical_company_key),
    company_domain: domain || null,
    market: leadMarket,
    company_score: score,
    legacy_composite_or_llm_advisory_score: legacyCompositeScore,
    company_score_source: governed?.score_source || null,
    company_score_methodology: governed?.score_methodology || null,
    composite_or_llm_score_used: false,
    minimum_company_score: scoreThreshold,
    evidence_confidence: confidence,
    minimum_evidence_confidence: confidenceThreshold,
    contact_daily_limit: contactDailyLimit,
    contact_weekly_limit: contactWeeklyLimit,
    commerce_fit: commerceFit,
    economic_potential: economicPotential,
    company_only: true,
    contact_features_used: false,
    policy_key: text(policy?.policy_key),
    policy_version: text(policy?.version),
    policy_content_hash: text(input?.policy_binding?.policy_content_hash),
    policy_binding_version: text(input?.policy_binding?.binding_version),
    adaptive_decision_ref: text(adaptiveDecision?.decision_id),
    adaptive_disposition: text(adaptiveDecision?.disposition),
    adaptive_gate_evaluated: Boolean(adaptiveDecision),
    evaluated_at: new Date(input.now ?? Date.now()).toISOString(),
    blockers: uniqueBlockers,
  };
  return {
    allowed: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    snapshot,
    role_target: uniqueBlockers.length
      ? null
      : contactRoleTarget(lead, policy, {
        maximum_contacts: input.maximum_contacts,
        now: snapshot.evaluated_at,
      }),
  };
}

/**
 * Reads enough of the governed contact-usage ledger to prove either the full
 * time window is complete or the explicit policy cap has already been
 * reached. Reads are paginated with SDK skip; any read/shape/query-contract
 * failure blocks contact spend.
 */
export async function readCompleteContactUsageWindow(
  service: any,
  input: {
    window_start: string;
    limit: number;
    page_size?: number;
  },
) {
  const limit = Number(input?.limit);
  const start = String(input?.window_start || "");
  const startMs = Date.parse(start);
  const pageSize = Math.max(
    1,
    Math.min(500, Math.floor(Number(input?.page_size || 500))),
  );
  if (
    !Number.isInteger(limit) || limit <= 0 || limit > 1250 ||
    !Number.isFinite(startMs)
  ) {
    return {
      allowed: false,
      complete: false,
      exhausted: true,
      used: null,
      remaining: 0,
      pages: 0,
      blocker: "contact_usage_window_configuration_invalid",
    };
  }
  let used = 0;
  let skip = 0;
  let pages = 0;
  while (used < limit) {
    const requested = Math.min(pageSize, limit - used);
    let rows: unknown;
    try {
      rows = await service.entities.CostUsageEvent.filter(
        {
          provider: "apollo",
          source: "leadEnrichmentAgent",
          status: { $in: ["RESERVED", "OBSERVED", "RECONCILED"] },
          occurred_at: { $gte: new Date(startMs).toISOString() },
        },
        "-occurred_at",
        requested,
        skip,
      );
    } catch (error: any) {
      return {
        allowed: false,
        complete: false,
        exhausted: true,
        used: null,
        remaining: 0,
        pages,
        blocker: "contact_usage_ledger_read_unavailable",
        error: String(error?.code || error?.message || "usage_read_failed")
          .slice(0, 160),
      };
    }
    if (!Array.isArray(rows) || rows.length > requested) {
      return {
        allowed: false,
        complete: false,
        exhausted: true,
        used: null,
        remaining: 0,
        pages,
        blocker: "contact_usage_ledger_read_invalid",
      };
    }
    const malformed = rows.some((row: any) =>
      text(row?.provider).toLowerCase() !== "apollo" ||
      text(row?.source) !== "leadEnrichmentAgent" ||
      !["RESERVED", "OBSERVED", "RECONCILED"].includes(
        text(row?.status).toUpperCase(),
      ) || Date.parse(String(row?.occurred_at || "")) < startMs
    );
    if (malformed) {
      return {
        allowed: false,
        complete: false,
        exhausted: true,
        used: null,
        remaining: 0,
        pages,
        blocker: "contact_usage_ledger_query_contract_violated",
      };
    }
    pages++;
    used += rows.length;
    skip += rows.length;
    if (rows.length < requested) {
      return {
        allowed: true,
        complete: true,
        exhausted: false,
        used,
        remaining: Math.max(0, limit - used),
        pages,
        coverage: "FULL_WINDOW",
        blocker: null,
      };
    }
  }
  return {
    allowed: true,
    complete: true,
    exhausted: true,
    used,
    remaining: 0,
    pages,
    coverage: "COMPLETE_TO_POLICY_CAP",
    blocker: null,
  };
}

export function sameEmployer(
  lead: any,
  person: any,
  organization: any = person?.organization || {},
) {
  const expectedOrganizationId = text(
    lead?.external_refs_json?.apollo_organization_id,
  );
  const observedOrganizationId = text(
    person?.organization_id || organization?.id ||
      organization?.organization_id,
  );
  const expectedDomain = normalizedDomain(lead?.company_domain);
  const observedDomain = normalizedDomain(
    organization?.primary_domain || organization?.website_url,
  );
  if (
    expectedOrganizationId && observedOrganizationId &&
    expectedOrganizationId === observedOrganizationId
  ) return true;
  return Boolean(
    expectedDomain && observedDomain &&
      (expectedDomain === observedDomain ||
        observedDomain.endsWith(`.${expectedDomain}`) ||
        expectedDomain.endsWith(`.${observedDomain}`)),
  );
}
