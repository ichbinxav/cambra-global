import {
  computeExpectedValueV0,
  computeValueOfInformationV0,
} from "./cpicFoundation.ts";

/**
 * Adaptive Lead Intelligence V0.
 *
 * Pure, deterministic and company-only. It proposes decisions and transition
 * plans; it does not persist events, call a provider, spend, resolve a person,
 * authorize outreach, train a model or claim calibration/causality.
 */
export const ADAPTIVE_LEAD_CORE_VERSION = "adaptive-lead-core.v0";
export const ADAPTIVE_LEAD_POLICY_VERSION = "adaptive-lead-policy.v0";

export const INTELLIGENCE_STAGES = [
  "DISCOVERED",
  "NORMALIZED",
  "IDENTITY_RESOLVED",
  "CHEAP_SCREENED",
  "PLAUSIBLE_FIT",
  "GAP_ASSESSED",
  "RESEARCHING",
  "STRONG_CANDIDATE",
  "COMPANY_ENRICHMENT_WORTHY",
  "COMPANY_ENRICHED",
  "HIGH_POTENTIAL",
  "OUTREACH_WORTHY",
  "DROPPED",
  "INSUFFICIENT_EVIDENCE",
  "SOURCE_LIMITED",
  "BUDGET_STOPPED",
  "NEEDS_REVIEW",
  "SUPPRESSED_COMPANY",
  "DUPLICATE",
  "EXPIRED",
] as const;

export const CONTACT_STAGES = [
  "NOT_REQUESTED",
  "ROLE_TARGET_DEFINED",
  "RESOLUTION_AUTHORIZED",
  "RESOLUTION_IN_PROGRESS",
  "CANDIDATES_FOUND",
  "CONTACT_SELECTED",
  "CONTACTABILITY_PENDING",
  "PROFESSIONAL_VERIFIED",
  "COMPLIANCE_REVIEW",
  "CONTACT_READY",
  "NO_SUITABLE_CONTACT",
  "SOURCE_LIMITED",
  "BLOCKED",
  "SUPPRESSED",
  "STALE",
] as const;

export const COMMERCIAL_STAGES = [
  "NOT_READY",
  "READY_FOR_STRATEGY",
  "QUEUED_FOR_OUTREACH",
  "WAITING_WINDOW",
  "WAITING_CAPACITY",
  "CONTACTED",
  "ENGAGED",
  "MEETING",
  "ANALYSIS_PENDING",
  "ANALYZED",
  "PROPOSAL",
  "WON",
  "LOST",
  "NURTURE",
] as const;

export const ADAPTIVE_DISPOSITIONS = [
  "DROP",
  "KEEP",
  "RESEARCH_MORE",
  "ENRICH_COMPANY",
  "DECLARE_OUTREACH_WORTHY",
  "REQUEST_CONTACT",
  "STOP_SUFFICIENT",
  "STOP_LOW_VALUE",
  "NEEDS_REVIEW",
  "SOURCE_LIMITED",
  "BUDGET_STOPPED",
] as const;

export type IntelligenceStage = typeof INTELLIGENCE_STAGES[number];
export type ContactStage = typeof CONTACT_STAGES[number];
export type CommercialStage = typeof COMMERCIAL_STAGES[number];
export type AdaptiveDisposition = typeof ADAPTIVE_DISPOSITIONS[number];
export type TransitionDimension = "INTELLIGENCE" | "CONTACT" | "COMMERCIAL";

type JsonRecord = Record<string, any>;

const INTELLIGENCE_TRANSITIONS: Record<
  IntelligenceStage,
  readonly IntelligenceStage[]
> = {
  DISCOVERED: ["NORMALIZED", "DROPPED", "DUPLICATE", "NEEDS_REVIEW"],
  NORMALIZED: [
    "IDENTITY_RESOLVED",
    "DROPPED",
    "DUPLICATE",
    "NEEDS_REVIEW",
  ],
  IDENTITY_RESOLVED: [
    "CHEAP_SCREENED",
    "DROPPED",
    "DUPLICATE",
    "NEEDS_REVIEW",
  ],
  CHEAP_SCREENED: [
    "PLAUSIBLE_FIT",
    "DROPPED",
    "INSUFFICIENT_EVIDENCE",
    "SOURCE_LIMITED",
    "BUDGET_STOPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  PLAUSIBLE_FIT: [
    "GAP_ASSESSED",
    "DROPPED",
    "INSUFFICIENT_EVIDENCE",
    "SOURCE_LIMITED",
    "BUDGET_STOPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  GAP_ASSESSED: [
    "RESEARCHING",
    "STRONG_CANDIDATE",
    "DROPPED",
    "INSUFFICIENT_EVIDENCE",
    "SOURCE_LIMITED",
    "BUDGET_STOPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  RESEARCHING: [
    "GAP_ASSESSED",
    "STRONG_CANDIDATE",
    "DROPPED",
    "INSUFFICIENT_EVIDENCE",
    "SOURCE_LIMITED",
    "BUDGET_STOPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  STRONG_CANDIDATE: [
    "COMPANY_ENRICHMENT_WORTHY",
    "HIGH_POTENTIAL",
    "DROPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  COMPANY_ENRICHMENT_WORTHY: [
    "COMPANY_ENRICHED",
    "HIGH_POTENTIAL",
    "DROPPED",
    "SOURCE_LIMITED",
    "BUDGET_STOPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  COMPANY_ENRICHED: [
    "GAP_ASSESSED",
    "HIGH_POTENTIAL",
    "DROPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  HIGH_POTENTIAL: [
    "OUTREACH_WORTHY",
    "GAP_ASSESSED",
    "DROPPED",
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
  ],
  OUTREACH_WORTHY: [
    "NEEDS_REVIEW",
    "SUPPRESSED_COMPANY",
    "EXPIRED",
  ],
  DROPPED: [],
  INSUFFICIENT_EVIDENCE: [],
  SOURCE_LIMITED: [],
  BUDGET_STOPPED: [],
  NEEDS_REVIEW: [],
  SUPPRESSED_COMPANY: [],
  DUPLICATE: [],
  EXPIRED: [],
};

const CONTACT_TRANSITIONS: Record<ContactStage, readonly ContactStage[]> = {
  NOT_REQUESTED: ["ROLE_TARGET_DEFINED", "BLOCKED", "SUPPRESSED"],
  ROLE_TARGET_DEFINED: ["RESOLUTION_AUTHORIZED", "BLOCKED", "SUPPRESSED"],
  RESOLUTION_AUTHORIZED: [
    "RESOLUTION_IN_PROGRESS",
    "BLOCKED",
    "SUPPRESSED",
  ],
  RESOLUTION_IN_PROGRESS: [
    "CANDIDATES_FOUND",
    "NO_SUITABLE_CONTACT",
    "SOURCE_LIMITED",
    "BLOCKED",
    "SUPPRESSED",
  ],
  CANDIDATES_FOUND: [
    "CONTACT_SELECTED",
    "NO_SUITABLE_CONTACT",
    "BLOCKED",
    "SUPPRESSED",
  ],
  CONTACT_SELECTED: [
    "CONTACTABILITY_PENDING",
    "NO_SUITABLE_CONTACT",
    "BLOCKED",
    "SUPPRESSED",
  ],
  CONTACTABILITY_PENDING: [
    "PROFESSIONAL_VERIFIED",
    "NO_SUITABLE_CONTACT",
    "BLOCKED",
    "SUPPRESSED",
    "STALE",
  ],
  PROFESSIONAL_VERIFIED: [
    "COMPLIANCE_REVIEW",
    "BLOCKED",
    "SUPPRESSED",
    "STALE",
  ],
  COMPLIANCE_REVIEW: ["CONTACT_READY", "BLOCKED", "SUPPRESSED", "STALE"],
  CONTACT_READY: ["BLOCKED", "SUPPRESSED", "STALE"],
  NO_SUITABLE_CONTACT: [],
  SOURCE_LIMITED: [],
  BLOCKED: [],
  SUPPRESSED: [],
  STALE: [],
};

const COMMERCIAL_TRANSITIONS: Record<
  CommercialStage,
  readonly CommercialStage[]
> = {
  NOT_READY: ["READY_FOR_STRATEGY"],
  READY_FOR_STRATEGY: [
    "QUEUED_FOR_OUTREACH",
    "WAITING_WINDOW",
    "WAITING_CAPACITY",
    "NURTURE",
  ],
  QUEUED_FOR_OUTREACH: [
    "WAITING_WINDOW",
    "WAITING_CAPACITY",
    "CONTACTED",
    "NURTURE",
  ],
  WAITING_WINDOW: [
    "QUEUED_FOR_OUTREACH",
    "WAITING_CAPACITY",
    "CONTACTED",
    "NURTURE",
  ],
  WAITING_CAPACITY: [
    "QUEUED_FOR_OUTREACH",
    "WAITING_WINDOW",
    "CONTACTED",
    "NURTURE",
  ],
  CONTACTED: ["ENGAGED", "NURTURE", "LOST"],
  ENGAGED: ["MEETING", "NURTURE", "LOST"],
  MEETING: ["ANALYSIS_PENDING", "NURTURE", "LOST"],
  ANALYSIS_PENDING: ["ANALYZED", "NURTURE", "LOST"],
  ANALYZED: ["PROPOSAL", "NURTURE", "LOST"],
  PROPOSAL: ["WON", "LOST", "NURTURE"],
  WON: [],
  LOST: ["NURTURE"],
  NURTURE: ["READY_FOR_STRATEGY", "LOST"],
};

const TERMINAL_INTELLIGENCE = new Set<IntelligenceStage>([
  "DROPPED",
  "INSUFFICIENT_EVIDENCE",
  "SOURCE_LIMITED",
  "BUDGET_STOPPED",
  "NEEDS_REVIEW",
  "SUPPRESSED_COMPANY",
  "DUPLICATE",
  "EXPIRED",
]);

const finite = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const bounded = (value: unknown, min: number, max: number): number | null => {
  const parsed = finite(value);
  return parsed === null ? null : Math.min(max, Math.max(min, parsed));
};

const text = (value: unknown): string | null => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const list = (value: unknown): any[] => Array.isArray(value) ? value : [];

const iso = (value: unknown): string | null => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

const nowIso = (value: unknown): string =>
  iso(value) || new Date().toISOString();

const round = (value: number, digits = 4): number => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

const unique = (values: unknown[]): string[] =>
  [...new Set(values.map((value) => text(value)).filter(Boolean) as string[])]
    .sort();

function normalizedDomain(value: unknown): string | null {
  return text(value)?.toLowerCase().replace(/^https?:\/\//, "").replace(
    /^www\./,
    "",
  ).split("/")[0] || null;
}

function companyOnlyProjection(lead: JsonRecord) {
  const enrichment = lead?.enrichment_json || {};
  const rawOrganization = lead?.raw_json?.organization || {};
  return {
    candidate_id: text(lead?.id),
    canonical_company_key: text(lead?.canonical_company_key),
    company_name: text(lead?.company_name),
    company_domain: normalizedDomain(lead?.company_domain),
    country: text(lead?.country),
    industry: text(lead?.industry),
    employee_range: text(lead?.employee_range),
    revenue_range: text(lead?.revenue_range),
    employee_count: finite(
      enrichment?.employee_count ?? rawOrganization?.estimated_num_employees ??
        rawOrganization?.num_employees,
    ),
    annual_revenue: finite(
      enrichment?.annual_revenue ?? rawOrganization?.annual_revenue,
    ),
    ecommerce_platform: text(lead?.ecommerce_platform),
    detected_technologies: unique([
      ...list(lead?.detected_technologies),
      ...list(enrichment?.technologies),
      ...list(rawOrganization?.technologies),
    ]),
    probable_payment_stack: unique(list(lead?.probable_payment_stack)),
    markets: unique([
      ...list(enrichment?.markets),
      ...list(rawOrganization?.markets),
    ]),
    currencies: unique([
      ...list(enrichment?.currencies),
      ...list(rawOrganization?.currencies),
    ]),
    source: text(lead?.source),
    source_evidence_ref: text(lead?.source_evidence_json?.evidence_ref),
    // Intentionally no person name, email, title, LinkedIn or contact fields.
    company_only: true,
    contact_features_used: false,
  };
}

function transitionTable(dimension: TransitionDimension) {
  if (dimension === "INTELLIGENCE") return INTELLIGENCE_TRANSITIONS;
  if (dimension === "CONTACT") return CONTACT_TRANSITIONS;
  return COMMERCIAL_TRANSITIONS;
}

function stateSet(dimension: TransitionDimension): readonly string[] {
  if (dimension === "INTELLIGENCE") return INTELLIGENCE_STAGES;
  if (dimension === "CONTACT") return CONTACT_STAGES;
  return COMMERCIAL_STAGES;
}

export class IllegalAdaptiveLeadTransition extends Error {
  code = "ILLEGAL_ADAPTIVE_LEAD_TRANSITION";
  constructor(message: string) {
    super(message);
    this.name = "IllegalAdaptiveLeadTransition";
  }
}

/** Validates a proposed transition. No state is persisted here. */
export function createAdaptiveTransition(input: JsonRecord) {
  const dimension = String(input?.dimension || "") as TransitionDimension;
  if (
    !(["INTELLIGENCE", "CONTACT", "COMMERCIAL"] as string[]).includes(
      dimension,
    )
  ) {
    throw new IllegalAdaptiveLeadTransition("transition_dimension_invalid");
  }
  const fromState = String(input?.from_state || "");
  const toState = String(input?.to_state || "");
  const validStates = stateSet(dimension);
  if (!validStates.includes(fromState) || !validStates.includes(toState)) {
    throw new IllegalAdaptiveLeadTransition("transition_state_invalid");
  }
  if (!text(input?.candidate_id)) {
    throw new IllegalAdaptiveLeadTransition("candidate_id_required");
  }
  if (!list(input?.reason_codes).length) {
    throw new IllegalAdaptiveLeadTransition("transition_reason_required");
  }
  if (!text(input?.decision_snapshot_ref)) {
    throw new IllegalAdaptiveLeadTransition("decision_snapshot_ref_required");
  }
  if (input?.suppressed === true) {
    const safeTargets = dimension === "INTELLIGENCE"
      ? ["SUPPRESSED_COMPANY"]
      : dimension === "CONTACT"
      ? ["SUPPRESSED", "BLOCKED"]
      : ["NURTURE", "LOST"];
    if (!safeTargets.includes(toState)) {
      throw new IllegalAdaptiveLeadTransition(
        "suppression_precedes_transition",
      );
    }
  }
  if (
    dimension === "CONTACT" && toState !== "NOT_REQUESTED" &&
    !["BLOCKED", "SUPPRESSED"].includes(toState) &&
    input?.intelligence_state !== "OUTREACH_WORTHY"
  ) {
    throw new IllegalAdaptiveLeadTransition(
      "contact_requires_outreach_worthy",
    );
  }
  if (
    dimension === "COMMERCIAL" &&
    [
      "QUEUED_FOR_OUTREACH",
      "WAITING_WINDOW",
      "WAITING_CAPACITY",
      "CONTACTED",
    ].includes(toState) && input?.contact_state !== "CONTACT_READY"
  ) {
    throw new IllegalAdaptiveLeadTransition(
      "commercial_queue_requires_contact_ready",
    );
  }

  const reopening = dimension === "INTELLIGENCE" && input?.reopen === true &&
    TERMINAL_INTELLIGENCE.has(fromState as IntelligenceStage) &&
    toState === "GAP_ASSESSED" &&
    unique(input?.reopen_evidence_refs || []).length > 0;
  const allowed = (transitionTable(dimension) as Record<string, string[]>)[
    fromState
  ]?.includes(toState);
  if (!allowed && !reopening) {
    throw new IllegalAdaptiveLeadTransition(
      `illegal_${dimension.toLowerCase()}_transition:${fromState}->${toState}`,
    );
  }
  const occurredAt = nowIso(input?.occurred_at);
  const transitionId = text(input?.transition_id) ||
    `${dimension.toLowerCase()}:${input.candidate_id}:${fromState}:${toState}:${occurredAt}`;
  return {
    transition_id: transitionId,
    candidate_id: String(input.candidate_id),
    dimension,
    from_state: fromState,
    to_state: toState,
    reason_codes: unique(input.reason_codes),
    decision_snapshot_ref: String(input.decision_snapshot_ref),
    evidence_refs: unique(input?.evidence_refs || []),
    cost_to_date: input?.cost_to_date || {},
    rule_or_model_version: text(input?.rule_or_model_version) ||
      ADAPTIVE_LEAD_POLICY_VERSION,
    actor: input?.actor || { type: "DETERMINISTIC_POLICY" },
    occurred_at: occurredAt,
    supersedes: text(input?.supersedes),
    idempotency_key: text(input?.idempotency_key) || transitionId,
    reopened: reopening,
    persisted: false,
  };
}

function statePath(
  from: IntelligenceStage,
  to: IntelligenceStage,
): IntelligenceStage[] {
  if (from === to) return [from];
  if (TERMINAL_INTELLIGENCE.has(from)) return [];
  const queue: IntelligenceStage[][] = [[from]];
  const visited = new Set<IntelligenceStage>([from]);
  while (queue.length) {
    const path = queue.shift()!;
    const current = path[path.length - 1];
    for (const next of INTELLIGENCE_TRANSITIONS[current]) {
      if (next === to) return [...path, next];
      if (!visited.has(next) && !TERMINAL_INTELLIGENCE.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [];
}

function scoreValue(
  value: unknown,
  scoreName: string,
  estimand: string,
  unknownReason: string,
) {
  const observed = bounded(value, 0, 100);
  return {
    score_name: scoreName,
    score_version: ADAPTIVE_LEAD_POLICY_VERSION,
    business_estimand: estimand,
    value: observed,
    scale: "0_100_HEURISTIC_RANK",
    is_probability: false,
    status: observed === null ? "UNKNOWN" : "HEURISTIC_RULE_OUTPUT",
    null_semantics: unknownReason,
    calibration_status: "HEURISTIC",
    probabilistic_calibration: false,
    trained_model: false,
  };
}

/** Builds separate company-only score dimensions. Missing values stay null. */
export function buildAdaptiveLeadScoreCardV0(input: JsonRecord) {
  const lead = input?.lead || input || {};
  const company = companyOnlyProjection(lead);
  const breakdown = input?.score_snapshot?.breakdown ||
    lead?.score_breakdown_json?.breakdown || {};
  const commerceFit = finite(breakdown?.commerce_fit);
  const companyText = [
    company.industry,
    company.ecommerce_platform,
    ...company.detected_technologies,
  ].filter(Boolean).join(" ").toLowerCase();
  const commerceObserved = Boolean(
    company.industry || company.ecommerce_platform ||
      company.detected_technologies.length,
  );
  const fit = input?.score_snapshot?.fit_score !== undefined
    ? bounded(input.score_snapshot.fit_score, 0, 100)
    : commerceObserved && commerceFit !== null
    ? bounded(round((commerceFit / 25) * 100, 2), 0, 100)
    : /ecommerce|e-commerce|retail|dtc/.test(companyText)
    ? 60
    : null;
  const opportunity = input?.score_snapshot?.opportunity_score !== undefined
    ? bounded(input.score_snapshot.opportunity_score, 0, 100)
    : lead?.score_breakdown_json?.opportunity_score !== undefined
    ? bounded(lead.score_breakdown_json.opportunity_score, 0, 100)
    : bounded(lead?.score, 0, 100);
  const confidence = input?.score_snapshot?.evidence_confidence !== undefined
    ? bounded(input.score_snapshot.evidence_confidence, 0, 1)
    : bounded(lead?.score_breakdown_json?.evidence_confidence, 0, 1);
  const conversionInput = input?.conversion_score || {};
  const conversionHasContract = Boolean(
    text(conversionInput?.endpoint) && text(conversionInput?.horizon) &&
      text(conversionInput?.eligible_population),
  );
  const conversion = conversionHasContract
    ? bounded(conversionInput?.value, 0, 100)
    : null;
  const evidenceItems = [
    company.company_domain,
    company.country,
    company.industry,
    company.employee_range || company.employee_count,
    company.revenue_range || company.annual_revenue,
    company.ecommerce_platform || company.detected_technologies[0],
    company.probable_payment_stack[0],
    company.source,
  ].filter((value) => value !== null && value !== undefined && value !== "");
  const evidenceCountInput = finite(
    input?.score_snapshot?.evidence_count ??
      lead?.score_breakdown_json?.evidence_count,
  );
  const evidenceCount = Math.max(
    evidenceItems.length,
    evidenceCountInput === null ? 0 : Math.floor(evidenceCountInput),
  );
  const supportStatus = evidenceCount === 0
    ? "UNKNOWN_SUPPORT"
    : evidenceCount < 3
    ? "LOW_SUPPORT"
    : "IN_DISTRIBUTION";
  return {
    contract_version: ADAPTIVE_LEAD_CORE_VERSION,
    prediction_time: nowIso(input?.decision_time),
    eligible_population:
      "company candidates evaluated before any person/contact feature",
    fit: scoreValue(
      fit,
      "company_fit",
      "alignment with the approved company ICP using company-only evidence",
      "UNKNOWN means company fit evidence was not observed; it is not score zero.",
    ),
    opportunity: scoreValue(
      opportunity,
      "payments_opportunity",
      "heuristic materiality/rank of a possible payments optimization opportunity",
      "UNKNOWN means opportunity evidence was not observed; it is not score zero or verified savings.",
    ),
    conversion: {
      ...scoreValue(
        conversion,
        "commercial_progression",
        text(conversionInput?.endpoint) ||
          "no endpoint declared; conversion is unavailable",
        "UNKNOWN means no endpoint+horizon+population-bounded score exists.",
      ),
      endpoint: text(conversionInput?.endpoint),
      horizon: text(conversionInput?.horizon),
      eligible_population: text(conversionInput?.eligible_population),
    },
    evidence_confidence: {
      value: confidence,
      scale: "0_1_EVIDENCE_QUALITY",
      status: confidence === null ? "UNKNOWN" : "HEURISTIC_RULE_OUTPUT",
      is_probability: false,
      calibration_status: "NOT_APPLICABLE",
      null_semantics: "UNKNOWN is not zero evidence confidence.",
    },
    support: {
      status: supportStatus,
      support_kind: "DETERMINISTIC_RULE_INPUT_COVERAGE_NOT_MODEL_DISTRIBUTION",
      observed_company_evidence_count: evidenceCount,
      company_only: true,
      contact_features_used: false,
      model_support_claimed: false,
      automatic_action_allowed: false,
    },
    expected_savings: {
      status: "UNKNOWN",
      low: null,
      mid: null,
      high: null,
      currency: null,
      billing_eligible: false,
      reason_codes: ["MERCHANT_ANALYSIS_NOT_AVAILABLE"],
    },
    methodology_class: "DETERMINISTIC_COMPANY_ONLY_HEURISTIC",
    probabilistic_calibration: false,
    trained_model: false,
    causal_claim: false,
    company_only: true,
    contact_features_used: false,
  };
}

const DEFAULT_GAP_ACTION: JsonRecord = {
  action_type: "REVIEW_EXISTING_PUBLIC_COMPANY_EVIDENCE",
  source_class: "PUBLIC_OR_ALREADY_HELD_COMPANY_EVIDENCE",
  executable: false,
  rights_allowed: true,
  source_success_band: { low: 0.2, mid: 0.45, high: 0.7 },
  decision_change_band: { low: 0.05, mid: 0.25, high: 0.5 },
  decision_value_improvement_band: { low: 2, mid: 12, high: 30 },
  acquisition_costs: {
    api: 0,
    llm: 0,
    latency: 1,
    privacy_compliance: 0,
    other: 0,
  },
  source_refs: ["adaptive-lead-policy.v0:company-evidence-review"],
};

function knowledgeForGap(company: JsonRecord, gapKey: string) {
  if (gapKey === "company_identity") {
    return {
      domain: company.company_domain,
      canonical_company_key: company.canonical_company_key,
    };
  }
  if (gapKey === "commerce_presence") {
    return {
      industry: company.industry,
      ecommerce_platform: company.ecommerce_platform,
      technologies: company.detected_technologies,
    };
  }
  if (gapKey === "company_scale") {
    return {
      employee_range: company.employee_range,
      employee_count: company.employee_count,
      revenue_range: company.revenue_range,
      annual_revenue: company.annual_revenue,
    };
  }
  if (gapKey === "payment_stack") {
    return { probable_payment_stack: company.probable_payment_stack };
  }
  return { markets: company.markets, currencies: company.currencies };
}

function knownKnowledge(value: JsonRecord): boolean {
  return Object.values(value).some((item) =>
    Array.isArray(item)
      ? item.length > 0
      : item !== null && item !== undefined &&
        item !== ""
  );
}

/** Company-only, decision-sensitive gap assessment; contact gaps do not exist. */
export function assessCompanyGapsV0(input: JsonRecord) {
  const lead = input?.lead || {};
  const company = companyOnlyProjection(lead);
  const scoreCard = input?.score_card || buildAdaptiveLeadScoreCardV0(input);
  const policy = input?.policy || {};
  const fitThreshold = bounded(policy?.min_fit_score, 0, 100) ?? 60;
  const opportunityThreshold = bounded(policy?.min_opportunity_score, 0, 100) ??
    65;
  const robustMargin = bounded(policy?.robust_margin, 0, 100) ?? 12;
  const fit = finite(scoreCard?.fit?.value);
  const opportunity = finite(scoreCard?.opportunity?.value);
  const decisionRobust = fit !== null && opportunity !== null &&
    fit >= fitThreshold + robustMargin &&
    opportunity >= opportunityThreshold + robustMargin;
  const specs = [
    ["company_identity", "CRITICAL", ["NORMALIZE", "SCORE", "CONTACT"]],
    ["commerce_presence", "CRITICAL", ["FIT", "DROP", "OUTREACH_WORTHY"]],
    ["company_scale", "HIGH", ["OPPORTUNITY", "ENRICH_COMPANY"]],
    ["payment_stack", "HIGH", ["OPPORTUNITY", "OUTREACH_WORTHY"]],
    ["market_complexity", "MEDIUM", ["OPPORTUNITY", "OUTREACH_WORTHY"]],
  ] as const;
  const sourceActions = policy?.source_actions || {};
  const attempts = input?.gap_attempts || {};
  const maxAttempts = Math.max(
    0,
    Math.floor(finite(policy?.max_gap_attempts) ?? 2),
  );
  return specs.map(([gapKey, importance, affectedDecisions]) => {
    const knowledge = knowledgeForGap(company, gapKey);
    const known = knownKnowledge(knowledge);
    const configuredActions = Array.isArray(sourceActions?.[gapKey])
      ? sourceActions[gapKey]
      : policy?.default_company_research_enabled === false
      ? []
      : [{ ...DEFAULT_GAP_ACTION, action_id: `company-review:${gapKey}` }];
    const attemptCount = Math.max(
      0,
      Math.floor(finite(attempts?.[gapKey]) ?? 0),
    );
    let status = "RESOLVED";
    let closeReason: string | null = "COMPANY_EVIDENCE_PRESENT";
    if (!known && decisionRobust && gapKey !== "company_identity") {
      status = "NON_MATERIAL";
      closeReason = "PLAUSIBLE_VALUE_DOES_NOT_CROSS_CURRENT_DECISION_BOUNDARY";
    } else if (!known && attemptCount >= maxAttempts) {
      status = "UNRESOLVABLE";
      closeReason = "MAX_ATTEMPTS_REACHED";
    } else if (!known && configuredActions.length) {
      status = "RESOLVABLE";
      closeReason = null;
    } else if (!known) {
      status = "SOURCE_LIMITED";
      closeReason = "NO_DECLARED_COMPANY_SOURCE_ACTION";
    }
    return {
      gap_id: `gap:${text(lead?.id) || "unknown"}:${gapKey}`,
      candidate_id: text(lead?.id),
      gap_key: gapKey,
      gap_version: ADAPTIVE_LEAD_CORE_VERSION,
      status,
      current_knowledge: knowledge,
      importance,
      affected_decisions: affectedDecisions,
      decision_sensitivity: {
        method: "DETERMINISTIC_THRESHOLD_BRANCH_V0",
        value: status === "NON_MATERIAL" || status === "RESOLVED" ? 0 : 1,
        confidence: finite(scoreCard?.evidence_confidence?.value),
        version: ADAPTIVE_LEAD_POLICY_VERSION,
        current_fit_margin: fit === null ? null : round(fit - fitThreshold),
        current_opportunity_margin: opportunity === null
          ? null
          : round(opportunity - opportunityThreshold),
        calibrated_probability: false,
      },
      possible_source_actions: configuredActions.map((action: JsonRecord) => ({
        ...action,
        action_id: text(action?.action_id) || `company-review:${gapKey}`,
        contact_data_requested: false,
        execution_authorized: false,
      })),
      selected_action_ref: null,
      estimated_value: {},
      estimated_cost: {},
      attempt_count: attemptCount,
      max_attempts: maxAttempts,
      resolved_signal_refs: known
        ? unique([
          company.source_evidence_ref,
          company.source ? `source:${company.source}` : null,
        ])
        : [],
      resolution_quality: known ? "OBSERVED_OR_ALREADY_HELD" : null,
      opened_at: nowIso(input?.decision_time),
      closed_at: ["RESOLVED", "NON_MATERIAL", "UNRESOLVABLE"].includes(status)
        ? nowIso(input?.decision_time)
        : null,
      close_reason: closeReason,
      company_only: true,
      contact_gap: false,
    };
  });
}

function band(value: unknown, fallback: JsonRecord) {
  const raw = value && typeof value === "object" ? value as JsonRecord : {};
  const low = finite(raw.low) ?? finite(fallback.low) ?? 0;
  const mid = finite(raw.mid) ?? finite(fallback.mid) ?? low;
  const high = finite(raw.high) ?? finite(fallback.high) ?? mid;
  return {
    low: Math.min(low, mid, high),
    mid,
    high: Math.max(low, mid, high),
  };
}

/** Deterministic, explicitly heuristic and non-executing gap VoI V0. */
export function evaluateGapValueOfInformationV0(input: JsonRecord) {
  const gap = input?.gap || {};
  const action = input?.action || gap?.possible_source_actions?.[0] || null;
  const policy = input?.policy || {};
  const decisionTime = nowIso(input?.decision_time);
  const base = {
    voi_decision_id: `voi:${
      text(input?.candidate_id) || text(gap?.candidate_id) || "unknown"
    }:${text(gap?.gap_key) || "unknown"}:${decisionTime}`,
    candidate_id: text(input?.candidate_id) || text(gap?.candidate_id),
    gap_id: text(gap?.gap_id),
    decision_time: decisionTime,
    policy_version: text(policy?.version) || ADAPTIVE_LEAD_POLICY_VERSION,
    methodology_class: "DETERMINISTIC_HEURISTIC_BANDED_VOI_V0",
    probabilistic_calibration: false,
    trained_model: false,
    causal_claim: false,
    authority_granted: false,
    execution_requested: false,
    predicted_information_value: true,
    realized_information_value: null,
  };
  if (["RESOLVED", "NON_MATERIAL", "REDUNDANT"].includes(gap?.status)) {
    return {
      ...base,
      available_actions: action ? [action] : [],
      selected_action: "NO_RESEARCH",
      selected_source_action_id: null,
      gross_value_band: { low: 0, mid: 0, high: 0 },
      cost: { low: 0, mid: 0, high: 0, quality: "NOT_APPLICABLE" },
      risk: { class: "NONE" },
      net_value_band: { low: 0, mid: 0, high: 0 },
      confidence: finite(gap?.decision_sensitivity?.confidence),
      stop_if: ["GAP_NON_MATERIAL_OR_ALREADY_RESOLVED"],
      reason_codes: [
        gap?.status === "NON_MATERIAL"
          ? "NON_MATERIAL_GAP_STOP"
          : "GAP_ALREADY_RESOLVED",
      ],
      cpic_midpoint_advisory: null,
    };
  }
  if (!action || gap?.status !== "RESOLVABLE") {
    return {
      ...base,
      available_actions: action ? [action] : [],
      selected_action: "NO_RESEARCH",
      selected_source_action_id: null,
      gross_value_band: { low: null, mid: null, high: null },
      cost: { low: null, mid: null, high: null, quality: "UNKNOWN" },
      risk: { class: "UNKNOWN" },
      net_value_band: { low: null, mid: null, high: null },
      confidence: finite(gap?.decision_sensitivity?.confidence),
      stop_if: ["NO_ELIGIBLE_SOURCE_ACTION"],
      reason_codes: ["SOURCE_LIMITED_OR_GAP_NOT_RESOLVABLE"],
      cpic_midpoint_advisory: null,
    };
  }
  const success = band(action?.source_success_band, {
    low: 0.2,
    mid: 0.45,
    high: 0.7,
  });
  const decisionChange = band(action?.decision_change_band, {
    low: 0.05,
    mid: 0.25,
    high: 0.5,
  });
  const improvement = band(action?.decision_value_improvement_band, {
    low: 2,
    mid: 12,
    high: 30,
  });
  const costs = action?.acquisition_costs || {};
  const costKeys = ["api", "llm", "latency", "privacy_compliance", "other"];
  const midpointCosts = Object.fromEntries(
    costKeys.map((key) => [key, Math.max(0, finite(costs?.[key]) ?? 0)]),
  );
  const totalCost = Object.values(midpointCosts).reduce(
    (sum: number, value) => sum + Number(value),
    0,
  );
  const costRange = band(action?.cost_utility_band, {
    low: totalCost,
    mid: totalCost,
    high: totalCost,
  });
  const gross = {
    low: round(success.low * decisionChange.low * improvement.low),
    mid: round(success.mid * decisionChange.mid * improvement.mid),
    high: round(success.high * decisionChange.high * improvement.high),
  };
  const net = {
    low: round(gross.low - costRange.high),
    mid: round(gross.mid - costRange.mid),
    high: round(gross.high - costRange.low),
  };
  const minimumNet = Math.max(0, finite(policy?.minimum_net_voi) ?? 0);
  const candidateCostCap = Math.max(
    0,
    finite(policy?.candidate_cost_cap_utility) ?? Number.POSITIVE_INFINITY,
  );
  const rightsAllowed = action?.rights_allowed === true &&
    input?.suppressed !== true && input?.compliance_blocked !== true;
  const budgetAllowed = input?.budget_authorized !== false &&
    costRange.high <= candidateCostCap;
  const midpoint = computeValueOfInformationV0({
    research_action: text(action?.action_id) || text(action?.action_type),
    utility_unit: text(policy?.utility_unit) || "HEURISTIC_UTILITY_POINT",
    assumptions: [
      "All likelihood inputs are explicit uncalibrated heuristic scenario assumptions.",
      "This advisory does not authorize execution or provider spend.",
    ],
    source_refs: unique(
      action?.source_refs || [
        `${ADAPTIVE_LEAD_POLICY_VERSION}:voi-scenario`,
      ],
    ),
    source_success_probability: success.mid,
    expected_uncertainty_reduction: decisionChange.mid,
    current_options: [{ action: "KEEP_CURRENT_DECISION", expected_utility: 0 }],
    research_outcomes: [
      {
        outcome_id: "DECISION_CHANGES",
        probability: decisionChange.mid,
        best_action_after: "REDECIDE_WITH_NEW_COMPANY_EVIDENCE",
        best_expected_utility_after: improvement.mid,
      },
      {
        outcome_id: "DECISION_UNCHANGED",
        probability: round(1 - decisionChange.mid),
        best_action_after: "KEEP_CURRENT_DECISION",
        best_expected_utility_after: 0,
      },
    ],
    acquisition_costs: midpointCosts,
    controls: {
      privacy_allowed: rightsAllowed,
      budget_authorized: budgetAllowed,
    },
    minimum_net_information_value: minimumNet,
  });
  const selectedAction = !rightsAllowed || !budgetAllowed
    ? "NO_RESEARCH"
    : net.low > minimumNet
    ? "RESEARCH"
    : net.high <= minimumNet
    ? "NO_RESEARCH"
    : "REVIEW";
  return {
    ...base,
    available_actions: [action],
    selected_action: selectedAction,
    selected_source_action_id: selectedAction === "RESEARCH"
      ? text(action?.action_id)
      : null,
    gross_value_band: gross,
    cost: {
      ...costRange,
      components: midpointCosts,
      quality: action?.cost_quality || "HEURISTIC_ESTIMATE",
    },
    risk: {
      class: text(action?.risk_class) ||
        (rightsAllowed ? "LOW_COMPANY_ONLY" : "BLOCKED"),
      rights_allowed: rightsAllowed,
      compliance_blocked: input?.compliance_blocked === true,
      suppressed: input?.suppressed === true,
    },
    net_value_band: net,
    confidence: finite(gap?.decision_sensitivity?.confidence),
    stop_if: [
      "MARGINAL_VOI_NON_POSITIVE",
      "MAX_COST_REACHED",
      "MAX_ATTEMPTS_REACHED",
      "SUPPRESSED",
      "COMPLIANCE_BLOCK",
    ],
    reason_codes: !rightsAllowed
      ? ["RIGHTS_COMPLIANCE_OR_SUPPRESSION_BLOCK"]
      : !budgetAllowed
      ? ["CANDIDATE_COST_CAP_OR_BUDGET_BLOCK"]
      : selectedAction === "RESEARCH"
      ? ["POSITIVE_CONSERVATIVE_NET_VOI"]
      : selectedAction === "REVIEW"
      ? ["NET_VOI_BAND_CROSSES_DECISION_THRESHOLD"]
      : ["MARGINAL_VOI_NON_POSITIVE"],
    cpic_midpoint_advisory: midpoint,
  };
}

function legacyIntelligenceStage(lead: JsonRecord): IntelligenceStage {
  const stored = String(
    lead?.score_breakdown_json?.adaptive_lead_v0?.intelligence_state_after ||
      "",
  );
  if (INTELLIGENCE_STAGES.includes(stored as IntelligenceStage)) {
    return stored as IntelligenceStage;
  }
  const stage = String(lead?.stage || "").toLowerCase();
  if (stage === "disqualified") return "DROPPED";
  if (stage === "suppressed") return "SUPPRESSED_COMPANY";
  if (
    ["outreach_ready", "waiting_window", "waiting_capacity"].includes(stage)
  ) {
    return "OUTREACH_WORTHY";
  }
  if (["contacted", "meeting", "won", "lost"].includes(stage)) {
    return "OUTREACH_WORTHY";
  }
  if (stage === "enriched") return "COMPANY_ENRICHED";
  if (stage === "scored") return "CHEAP_SCREENED";
  return "DISCOVERED";
}

function stableBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

function addDays(timestamp: string, days: number): string {
  return new Date(Date.parse(timestamp) + days * 86_400_000).toISOString();
}

export function buildDropAuditPlanV0(input: JsonRecord) {
  const snapshot = input?.decision_snapshot || input || {};
  const decisionTime = nowIso(snapshot?.decision_time || input?.decision_time);
  const rate = bounded(input?.audit_rate, 0, 1) ?? 0.05;
  const candidateKey = text(snapshot?.canonical_company_key) ||
    text(snapshot?.candidate_id) || "unknown";
  const drop = snapshot?.disposition === "DROP" ||
    snapshot?.intelligence_state_after === "DROPPED";
  const suppressed = snapshot?.suppressed === true ||
    snapshot?.intelligence_state_after === "SUPPRESSED_COMPANY";
  const eligible = drop && !suppressed &&
    snapshot?.compliance_blocked !== true &&
    snapshot?.company_only !== false;
  return {
    contract_version: ADAPTIVE_LEAD_CORE_VERSION,
    candidate_id: text(snapshot?.candidate_id),
    canonical_company_key: text(snapshot?.canonical_company_key),
    eligible,
    selected: eligible &&
      stableBucket(`${candidateKey}:${input?.audit_seed || "v0"}`) < rate,
    selection_method: "STABLE_COMPANY_HASH_BERNOULLI_V0",
    assignment_propensity: eligible ? rate : null,
    audit_action: eligible ? "LAWFUL_COMPANY_ONLY_EVIDENCE_RECHECK" : null,
    contact_allowed: false,
    personal_data_requested: false,
    spend_authorized: false,
    negative_training_label: false,
    causal_claim: false,
    review_after: addDays(
      decisionTime,
      Math.max(1, Math.floor(finite(input?.review_after_days) ?? 30)),
    ),
    reason_codes: !drop
      ? ["DROP_DECISION_REQUIRED"]
      : suppressed
      ? ["SUPPRESSION_PRECEDES_FALSE_NEGATIVE_AUDIT"]
      : snapshot?.compliance_blocked === true
      ? ["COMPLIANCE_BLOCK"]
      : ["POLICY_RELATIVE_DROP_FALSE_NEGATIVE_OBSERVATION"],
  };
}

/** Full V0 company decision snapshot. It is advisory until a runtime writer commits it. */
export function buildAdaptiveLeadDecisionV0(input: JsonRecord) {
  const lead = input?.lead || input || {};
  const policy = input?.policy || {};
  const policyBinding = input?.policy_binding || {};
  const decisionTime = nowIso(input?.decision_time);
  const candidateId = text(lead?.id);
  const company = companyOnlyProjection(lead);
  const scoreCard = buildAdaptiveLeadScoreCardV0({
    ...input,
    lead,
    decision_time: decisionTime,
  });
  const gaps = assessCompanyGapsV0({
    ...input,
    lead,
    score_card: scoreCard,
    decision_time: decisionTime,
  });
  const suppressed = input?.suppressed === true ||
    ["suppressed"].includes(String(lead?.stage || "").toLowerCase()) ||
    ["suppressed"].includes(
      String(lead?.reservoir_state || "").toLowerCase(),
    ) ||
    String(lead?.outreach_eligibility || "").toUpperCase() === "BLOCKED" ||
    String(lead?.compliance_status || "").toUpperCase() === "BLOCKED";
  const explicitDrop = Boolean(
    text(input?.explicit_disqualification_reason) ||
      text(lead?.disqualification_reason) ||
      String(lead?.stage || "").toLowerCase() === "disqualified" ||
      String(lead?.reservoir_state || "").toLowerCase() === "disqualified",
  );
  const complianceBlocked = input?.compliance_blocked === true ||
    String(lead?.compliance_status || "").toUpperCase() === "BLOCKED";
  const voiDecisions = gaps.map((gap: JsonRecord) =>
    evaluateGapValueOfInformationV0({
      candidate_id: candidateId,
      gap,
      action: gap?.possible_source_actions?.[0],
      policy,
      decision_time: decisionTime,
      suppressed,
      compliance_blocked: complianceBlocked,
      budget_authorized: input?.budget_authorized !== false,
    })
  );
  const fit = finite(scoreCard.fit.value);
  const opportunity = finite(scoreCard.opportunity.value);
  const confidence = finite(scoreCard.evidence_confidence.value);
  const minFit = bounded(policy?.min_fit_score, 0, 100) ?? 60;
  const minOpportunity = bounded(policy?.min_opportunity_score, 0, 100) ?? 65;
  const minConfidence = bounded(policy?.min_evidence_confidence, 0, 1) ?? 0.55;
  const scorePass = fit !== null && opportunity !== null &&
    fit >= minFit && opportunity >= minOpportunity;
  const confidencePass = confidence !== null && confidence >= minConfidence;
  const supportPass = scoreCard.support.status !== "UNKNOWN_SUPPORT";
  const materialUnresolved = gaps.filter((gap: JsonRecord) =>
    ["RESOLVABLE", "SOURCE_LIMITED", "UNRESOLVABLE"].includes(gap.status)
  );
  const researchRecommended = voiDecisions.some((decision: JsonRecord) =>
    decision.selected_action === "RESEARCH"
  );
  const reviewRecommended = voiDecisions.some((decision: JsonRecord) =>
    decision.selected_action === "REVIEW"
  );
  const budgetStopped = materialUnresolved.length > 0 &&
    voiDecisions.some((decision: JsonRecord) =>
      list(decision?.reason_codes).includes(
        "CANDIDATE_COST_CAP_OR_BUDGET_BLOCK",
      )
    );
  const sourceLimited = materialUnresolved.length > 0 &&
    materialUnresolved.every((gap: JsonRecord) =>
      ["SOURCE_LIMITED", "UNRESOLVABLE"].includes(gap.status)
    );

  // The compatibility score can contain an optional LLM/advisory component.
  // It is never the score that grants contact authority. The governed score is
  // the deterministic company-only opportunity output, bound to the exact
  // active merchant-acquisition policy content that existed at prediction.
  const governedScore = opportunity;
  const governedThreshold = bounded(policy?.min_lead_score, 0, 100);
  const governedConfidenceThreshold = bounded(policy?.min_confidence, 0, 1);
  const governedBlockers: string[] = [];
  if (policyBinding?.authority_status !== "EXACT_ACTIVE") {
    governedBlockers.push("exact_active_commercial_policy_binding_required");
  }
  if (
    text(policyBinding?.engine) !== "merchant_acquisition" ||
    text(policy?.engine) !== "merchant_acquisition"
  ) governedBlockers.push("merchant_acquisition_policy_binding_required");
  if (
    !text(policyBinding?.policy_key) ||
    text(policyBinding?.policy_key) !== text(policy?.policy_key)
  ) governedBlockers.push("commercial_policy_key_binding_mismatch");
  if (
    !text(policyBinding?.policy_version) ||
    text(policyBinding?.policy_version) !== text(policy?.version)
  ) governedBlockers.push("commercial_policy_version_binding_mismatch");
  if (!/^(?:sha256:)[a-f0-9]{64}$/i.test(
    text(policyBinding?.policy_content_hash) || "",
  )) governedBlockers.push("commercial_policy_content_hash_required");
  if (governedThreshold === null || governedThreshold <= 0) {
    governedBlockers.push("explicit_deterministic_score_threshold_required");
  }
  if (governedScore === null) {
    governedBlockers.push("deterministic_eligibility_score_required");
  } else if (
    governedThreshold !== null && governedScore < governedThreshold
  ) governedBlockers.push("deterministic_eligibility_score_below_policy");
  if (governedConfidenceThreshold === null) {
    governedBlockers.push("explicit_evidence_confidence_threshold_required");
  } else if (
    confidence === null || confidence < governedConfidenceThreshold
  ) governedBlockers.push("evidence_confidence_below_policy");
  if (input?.aggregate_coverage?.coverage_complete !== true) {
    governedBlockers.push("privacy_safe_aggregate_coverage_incomplete");
  }

  let disposition: AdaptiveDisposition;
  let targetState: IntelligenceStage;
  let stoppingReason: string | null = null;
  const reasonCodes: string[] = [];
  if (suppressed || complianceBlocked) {
    disposition = "DROP";
    targetState = "SUPPRESSED_COMPANY";
    stoppingReason = suppressed ? "SUPPRESSED" : "COMPLIANCE_BLOCK";
    reasonCodes.push("SUPPRESSION_OR_COMPLIANCE_PRECEDENCE");
  } else if (explicitDrop) {
    disposition = "DROP";
    targetState = "DROPPED";
    stoppingReason = "POLICY_TERMINAL_DROP";
    reasonCodes.push("EXPLICIT_POLICY_DISQUALIFICATION");
  } else if (
    scorePass && confidencePass && supportPass &&
    materialUnresolved.length === 0
  ) {
    disposition = "DECLARE_OUTREACH_WORTHY";
    targetState = "OUTREACH_WORTHY";
    stoppingReason = "DECISION_ROBUST";
    reasonCodes.push("COMPANY_ONLY_THRESHOLDS_AND_SUPPORT_PASS");
  } else if (researchRecommended) {
    disposition = "RESEARCH_MORE";
    targetState = "RESEARCHING";
    reasonCodes.push("MATERIAL_GAP_WITH_POSITIVE_CONSERVATIVE_NET_VOI");
  } else if (reviewRecommended) {
    disposition = "NEEDS_REVIEW";
    targetState = "NEEDS_REVIEW";
    stoppingReason = "CONTRADICTION_REVIEW";
    reasonCodes.push("VOI_OR_DECISION_BOUNDARY_AMBIGUOUS");
  } else if (budgetStopped) {
    disposition = "BUDGET_STOPPED";
    targetState = "BUDGET_STOPPED";
    stoppingReason = "MAX_COST_REACHED";
    reasonCodes.push("MATERIAL_GAP_RESEARCH_BLOCKED_BY_BUDGET_OR_COST_CAP");
  } else if (sourceLimited) {
    disposition = "SOURCE_LIMITED";
    targetState = "SOURCE_LIMITED";
    stoppingReason = "SOURCE_EXHAUSTED";
    reasonCodes.push("MATERIAL_GAP_HAS_NO_ELIGIBLE_SOURCE_ACTION");
  } else if (
    fit !== null && opportunity !== null && confidencePass && supportPass &&
    fit < minFit && opportunity < minOpportunity
  ) {
    disposition = "DROP";
    targetState = "DROPPED";
    stoppingReason = "DECISION_ROBUST";
    reasonCodes.push("ROBUST_COMPANY_ONLY_LOW_FIT_AND_OPPORTUNITY");
  } else {
    disposition = "NEEDS_REVIEW";
    targetState = "INSUFFICIENT_EVIDENCE";
    stoppingReason = "INSUFFICIENT_EVIDENCE";
    reasonCodes.push("REQUIRED_SCORE_CONFIDENCE_OR_SUPPORT_UNKNOWN");
  }

  const currentState = input?.current_intelligence_state &&
      INTELLIGENCE_STAGES.includes(input.current_intelligence_state)
    ? input.current_intelligence_state as IntelligenceStage
    : legacyIntelligenceStage(lead);
  const decisionId = `adaptive-decision:${
    candidateId || "unknown"
  }:${decisionTime}`;
  const path = statePath(currentState, targetState);
  const transitionPlan = path.slice(1).map((toState, index) => ({
    dimension: "INTELLIGENCE",
    from_state: path[index],
    to_state: toState,
    candidate_id: candidateId,
    decision_snapshot_ref: decisionId,
    reason_codes: reasonCodes,
    rule_or_model_version: ADAPTIVE_LEAD_POLICY_VERSION,
    persisted: false,
  }));
  const unknowns = [
    fit === null ? "fit_score" : null,
    opportunity === null ? "opportunity_score" : null,
    scoreCard.conversion.value === null ? "conversion_score" : null,
    confidence === null ? "evidence_confidence" : null,
    scoreCard.support.status === "UNKNOWN_SUPPORT" ? "support" : null,
    ...gaps.filter((gap: JsonRecord) => gap.status !== "RESOLVED").map(
      (gap: JsonRecord) => `gap:${gap.gap_key}`,
    ),
  ];
  const snapshot: JsonRecord = {
    decision_id: decisionId,
    candidate_id: candidateId,
    canonical_company_key: company.canonical_company_key,
    decision_time: decisionTime,
    policy_version: text(policy?.version) || null,
    policy_binding: {
      binding_version: text(policyBinding?.binding_version) || null,
      authority_status: text(policyBinding?.authority_status) || "BLOCKED",
      engine: text(policyBinding?.engine) || null,
      policy_key: text(policyBinding?.policy_key) || null,
      policy_version: text(policyBinding?.policy_version) || null,
      policy_content_hash: text(policyBinding?.policy_content_hash) || null,
      content_scope: text(policyBinding?.content_scope) || null,
    },
    rule_or_model_version: ADAPTIVE_LEAD_POLICY_VERSION,
    methodology_class: "DETERMINISTIC_COMPANY_ONLY_HEURISTIC",
    disposition,
    intelligence_state_before: currentState,
    intelligence_state_after: targetState,
    reason_codes: unique(reasonCodes),
    stopping_reason: stoppingReason,
    scores: scoreCard,
    gaps,
    voi_decisions: voiDecisions,
    evidence_refs: unique([
      company.source_evidence_ref,
      company.source ? `source:${company.source}` : null,
    ]),
    unknowns: unique(unknowns),
    budget_state: {
      authorized_for_evaluation: input?.budget_authorized !== false,
      execution_authorized: false,
      candidate_cost_cap_utility: finite(policy?.candidate_cost_cap_utility),
    },
    capacity_state: {
      target_count_semantics: "CAP_ONLY_NOT_OBLIGATION",
      requested_target_count: finite(input?.target_count),
      affected_qualification: false,
    },
    suppressed,
    compliance_blocked: complianceBlocked,
    company_only: true,
    contact_features_used: false,
    governed_contact_eligibility: {
      eligible: disposition === "DECLARE_OUTREACH_WORTHY" &&
        targetState === "OUTREACH_WORTHY" && !suppressed &&
        !complianceBlocked && governedBlockers.length === 0,
      score: governedScore,
      score_name: "deterministic_company_opportunity_score",
      score_source: "merchantOpportunity.deterministicMerchantOpportunity",
      score_methodology: "DETERMINISTIC_COMPANY_ONLY_HEURISTIC",
      policy_threshold: governedThreshold,
      evidence_confidence: confidence,
      evidence_confidence_threshold: governedConfidenceThreshold,
      composite_or_llm_score_used: false,
      policy_content_bound: policyBinding?.authority_status === "EXACT_ACTIVE",
      privacy_safe_aggregate_coverage: input?.aggregate_coverage || {
        status: "INCOMPLETE",
        coverage_complete: false,
        blocker: "aggregate_coverage_not_supplied",
      },
      blockers: unique([
        ...governedBlockers,
        ...(disposition !== "DECLARE_OUTREACH_WORTHY" ||
            targetState !== "OUTREACH_WORTHY"
          ? ["adaptive_outreach_worthiness_required"]
          : []),
      ]),
    },
    contact_resolution_eligible: disposition === "DECLARE_OUTREACH_WORTHY" &&
      targetState === "OUTREACH_WORTHY" && !suppressed &&
      !complianceBlocked && governedBlockers.length === 0,
    contact_resolution_authorized: false,
    paid_action_authorized: false,
    automatic_outreach_authorized: false,
    training_label: false,
    probabilistic_calibration: false,
    trained_model: false,
    causal_claim: false,
  };
  snapshot.drop_audit = buildDropAuditPlanV0({
    decision_snapshot: snapshot,
    audit_rate: policy?.false_negative_audit_rate,
    review_after_days: policy?.drop_review_after_days,
    audit_seed: policy?.audit_seed,
  });
  return {
    contract_version: ADAPTIVE_LEAD_CORE_VERSION,
    ...snapshot,
    transition_plan: transitionPlan,
    transition_plan_complete: currentState === targetState || path.length > 1,
    runtime_persisted: false,
    runtime_verified: false,
  };
}

export function adaptiveContactGate(decision: JsonRecord) {
  const blockers: string[] = [];
  if (decision?.disposition !== "DECLARE_OUTREACH_WORTHY") {
    blockers.push("adaptive_outreach_worthiness_required");
  }
  if (decision?.intelligence_state_after !== "OUTREACH_WORTHY") {
    blockers.push("adaptive_intelligence_state_not_outreach_worthy");
  }
  if (decision?.suppressed === true || decision?.compliance_blocked === true) {
    blockers.push("suppression_or_compliance_block");
  }
  if (
    decision?.company_only !== true || decision?.contact_features_used !== false
  ) {
    blockers.push("company_only_decision_snapshot_required");
  }
  if (decision?.policy_binding?.authority_status !== "EXACT_ACTIVE") {
    blockers.push("adaptive_exact_active_policy_binding_required");
  }
  if (decision?.policy_binding?.engine !== "merchant_acquisition") {
    blockers.push("adaptive_merchant_acquisition_policy_binding_required");
  }
  if (!/^(?:sha256:)[a-f0-9]{64}$/i.test(
    text(decision?.policy_binding?.policy_content_hash) || "",
  )) blockers.push("adaptive_policy_content_hash_required");
  if (decision?.governed_contact_eligibility?.eligible !== true) {
    blockers.push("governed_deterministic_contact_eligibility_required");
  }
  if (
    decision?.governed_contact_eligibility?.composite_or_llm_score_used !==
      false ||
    decision?.governed_contact_eligibility?.score_methodology !==
      "DETERMINISTIC_COMPANY_ONLY_HEURISTIC"
  ) blockers.push("deterministic_company_score_contract_required");
  return {
    allowed: blockers.length === 0,
    blockers: unique(blockers),
    contact_spend_allowed: blockers.length === 0,
    authority_granted: false,
  };
}

function expectedValueForQueue(input: JsonRecord) {
  if (!input?.expected_value_input) {
    return {
      status: "UNKNOWN",
      selected_expected_net_utility: null,
      reason_codes: ["EXPECTED_VALUE_SCENARIO_NOT_PROVIDED"],
      authority_granted: false,
    };
  }
  return computeExpectedValueV0(input.expected_value_input);
}

/** Eligibility and priority are separate; capacity never changes eligibility. */
export function buildAdaptiveQueueDecisionV0(input: JsonRecord) {
  const lead = input?.lead || {};
  const decision = input?.adaptive_decision ||
    lead?.score_breakdown_json?.adaptive_lead_v0 || null;
  const policy = input?.policy || {};
  const blockers: string[] = [];
  const suppressed = input?.suppressed === true ||
    ["suppressed"].includes(
      String(lead?.reservoir_state || "").toLowerCase(),
    ) ||
    String(lead?.outreach_eligibility || "").toUpperCase() === "BLOCKED";
  // Suppression is intentionally evaluated before every value/priority input.
  if (suppressed) blockers.push("SUPPRESSED");
  if (!decision || !adaptiveContactGate(decision).allowed) {
    blockers.push("OUTREACH_WORTHY_DECISION_REQUIRED");
  }
  if (String(lead?.contactability || "") !== "PROFESSIONAL_VERIFIED") {
    blockers.push("VALID_PROFESSIONAL_CONTACT_REQUIRED");
  }
  if (String(lead?.compliance_status || "") !== "CLEARED") {
    blockers.push("COMPLIANCE_CLEARANCE_REQUIRED");
  }
  if (String(lead?.outreach_eligibility || "") !== "ELIGIBLE") {
    blockers.push("OUTREACH_ELIGIBILITY_REQUIRED");
  }
  if (input?.policy_active !== true) blockers.push("ACTIVE_POLICY_REQUIRED");
  const allowedMarkets = unique(policy?.markets || policy?.countries || []);
  if (
    allowedMarkets.length &&
    !allowedMarkets.includes(String(lead?.country || "").toUpperCase())
  ) blockers.push("MARKET_NOT_AUTHORIZED");
  if (input?.fresh_enough !== true) blockers.push("FRESH_EVIDENCE_REQUIRED");
  if (input?.strategy_ready !== true) blockers.push("STRATEGY_READY_REQUIRED");
  if (input?.prior_duplicate_contact === true) {
    blockers.push("PRIOR_DUPLICATE_CONTACT");
  }

  const scores = decision?.scores || {};
  const expectedValue: any = expectedValueForQueue(input);
  const expectedUtility = finite(expectedValue?.selected_expected_net_utility);
  const scale = Math.max(
    1,
    finite(policy?.expected_value_priority_scale) ?? 100,
  );
  const rawComponents = [
    ["opportunity", finite(scores?.opportunity?.value), 0.35],
    ["fit", finite(scores?.fit?.value), 0.2],
    [
      "evidence_confidence",
      finite(scores?.evidence_confidence?.value) === null
        ? null
        : finite(scores?.evidence_confidence?.value)! * 100,
      0.2,
    ],
    ["conversion", finite(scores?.conversion?.value), 0.1],
    [
      "expected_value",
      expectedUtility === null
        ? null
        : Math.max(0, Math.min(100, (expectedUtility / scale) * 100)),
      0.1,
    ],
    ["freshness", finite(input?.freshness_score), 0.03],
    ["strategic_learning", finite(input?.strategic_learning_score), 0.02],
  ] as const;
  const knownComponents = rawComponents.filter(([, value]) => value !== null);
  const knownWeight = knownComponents.reduce(
    (sum, [, , weight]) => sum + weight,
    0,
  );
  const costPenalty = Math.max(0, finite(input?.cost_penalty) ?? 0);
  const priority = knownWeight > 0
    ? Math.max(
      0,
      Math.min(
        100,
        knownComponents.reduce(
              (sum, [, value, weight]) => sum + Number(value) * weight,
              0,
            ) / knownWeight - costPenalty,
      ),
    )
    : null;
  if (priority === null) blockers.push("PRIORITY_EVIDENCE_UNKNOWN");
  const eligible = blockers.length === 0;
  return {
    queue_decision_id: `queue:${text(lead?.id) || "unknown"}:${
      nowIso(input?.assigned_at)
    }`,
    candidate_id: text(lead?.id),
    canonical_company_key: text(lead?.canonical_company_key) ||
      normalizedDomain(lead?.company_domain),
    eligible,
    priority_score: priority === null ? null : round(priority, 3),
    components: Object.fromEntries(
      rawComponents.map(([key, value, weight]) => [key, {
        value,
        weight,
        included: value !== null,
        null_semantics: value === null ? "UNKNOWN_EXCLUDED_NOT_ZERO" : null,
      }]),
    ),
    expected_value_advisory: expectedValue,
    constraints: unique(blockers),
    policy_version: text(policy?.version) || ADAPTIVE_LEAD_POLICY_VERSION,
    calibration_status: "HEURISTIC",
    probabilistic_calibration: false,
    assigned_at: nowIso(input?.assigned_at),
    expires_at: iso(input?.expires_at),
    experiment_ref: text(input?.experiment_ref),
    capacity_affects_eligibility: false,
    authority_granted: false,
  };
}

export function allocateAdaptiveQueueV0(
  candidates: JsonRecord[],
  options: JsonRecord = {},
) {
  const capacity = Math.max(0, Math.floor(finite(options?.capacity) ?? 0));
  const decisions = candidates.map((candidate) =>
    candidate?.queue_decision_id
      ? candidate
      : buildAdaptiveQueueDecisionV0({ ...candidate, policy: options?.policy })
  );
  const eligible = decisions.filter((decision) => decision.eligible).sort(
    (left, right) =>
      Number(right.priority_score ?? -1) - Number(left.priority_score ?? -1) ||
      String(left.canonical_company_key || left.candidate_id).localeCompare(
        String(right.canonical_company_key || right.candidate_id),
      ),
  );
  const allocatedIds = new Set(
    eligible.slice(0, capacity).map((decision) => decision.queue_decision_id),
  );
  return {
    contract_version: ADAPTIVE_LEAD_CORE_VERSION,
    capacity,
    eligible_count: eligible.length,
    allocated_count: allocatedIds.size,
    qualification_threshold_changed: false,
    capacity_role: "RANK_AFTER_ELIGIBILITY",
    decisions: decisions.map((decision) => ({
      ...decision,
      allocation_status: !decision.eligible
        ? "INELIGIBLE"
        : allocatedIds.has(decision.queue_decision_id)
        ? "QUEUED_FOR_OUTREACH"
        : "WAITING_CAPACITY",
      allocated: allocatedIds.has(decision.queue_decision_id),
    })),
  };
}
