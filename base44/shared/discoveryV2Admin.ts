import { costRuntimeSnapshot } from "./costGovernance.ts";
import {
  classifyDiscoveryScore,
  DISCOVERY_CAPABILITY_VERSION,
  DISCOVERY_FILTER_CATALOG,
  DISCOVERY_SOURCE_REGISTRY,
  DISCOVERY_V2_ENGINE_VERSION,
  normalizeDiscoveryConfiguration,
  planDiscoveryQuery,
  terminalDiscoveryStatus,
} from "./discoveryV2Planner.ts";
import { emergencyState } from "./operationalControl.ts";
import { sha256 } from "./intelligenceCore.ts";
import { updatedExactlyOne } from "./approvalResolutionSaga.ts";
import {
  acceptedDiscoveryPlanHash,
  assertDiscoveryClaimActive,
  checkpointDiscoveryMaterialEffect,
  claimDiscoveryRun,
  commitDiscoveryStage,
  markDiscoveryMaterialEffect,
  requestDiscoveryStop,
} from "./discoveryV2Execution.ts";
import {
  reconcileDiscoveryExperienceBatch,
  reconcileDiscoveryRunExperiences,
} from "./intelligenceFoundationContracts.ts";
import {
  readRuntimeRows,
  requireRuntimeSource,
  runtimeSourceCoverage,
} from "./runtimeSourceRead.ts";
import {
  APOLLO_PROVIDER_KEY,
  INSTANTLY_SUPERSEARCH_PROVIDER_KEY,
  selectLeadIntelligenceProvider,
} from "./leadIntelligenceProvider.ts";
import { safeBestEffort } from "./bestEffort.ts";
import {
  filterLeadPeople,
  LEAD_LAUNCH_MARKETS,
  LEAD_PERSONA_GROUPS,
  projectLeadPerson,
} from "./leadPeopleProjection.ts";

const now = () => new Date().toISOString();
const text = (value: any) => String(value ?? "").trim();
const number = (value: any) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const optionalNumber = (value: any): number | null =>
  value !== null && value !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
const list = (value: any, max = 1000) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : []).map((item) => text(item)).filter(
        Boolean,
      ),
    ),
  ].slice(0, max);
const response = (data: any, status = 200) => Response.json(data, { status });
const responsePayload = async (value: Response) => {
  try {
    return await value.json();
  } catch (error: any) {
    throw Object.assign(new Error("discovery_internal_response_invalid"), {
      code: "DISCOVERY_INTERNAL_RESPONSE_INVALID",
      status: 502,
      cause: error,
    });
  }
};
const unwrap = (value: any) => value?.data ?? value ?? {};
const TERMINAL = new Set([
  "COMPLETED",
  "COMPLETED_PARTIAL",
  "BUDGET_STOPPED",
  "FOUNDER_STOPPED",
  "SOURCE_LIMITED",
  "FAILED",
  "NEEDS_REVIEW",
]);
export const DISCOVERY_SCHEDULE_CLAIM_MS = 120_000;
const DISCOVERY_SCHEDULE_RETRY_MS = 60 * 60_000;
const SCHEDULE_CLAIMED = "CLAIMED";
const SCHEDULE_SUCCESSOR_PREPARED = "SUCCESSOR_PREPARED";
const DISCOVERY_PROJECTION_RECOVERY_PAGE_SIZE = 12;
const DISCOVERY_PROJECTION_RECOVERY_PAGES = 4096;

async function reconcileCommittedDiscoveryRun(
  service: any,
  run: any,
  origin: string,
) {
  try {
    const result = await reconcileDiscoveryRunExperiences(service, run);
    if (!result.ok) {
      console.error("discovery_experience_projection_incomplete", {
        origin,
        run_id: run?.id || null,
        errors: result.errors,
      });
    }
    return result;
  } catch (error: any) {
    const result = {
      ok: false,
      run_id: run?.id || null,
      expected: 0,
      created: 0,
      duplicate: 0,
      errors: [{
        projection_key: "RECONCILIATION",
        event_type: "discovery.plan.accepted",
        code: text(error?.message || error || "UNKNOWN"),
      }],
    };
    console.error("discovery_experience_projection_failed", {
      origin,
      run_id: run?.id || null,
      error: result.errors[0].code,
    });
    return result;
  }
}
const monthStart = () => `${now().slice(0, 7)}-01T00:00:00.000Z`;
const periodStart = (period: any) => {
  const days =
    { week: 7, month: 30, quarter: 90 }[text(period).toLowerCase()] || 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
};
const compactError = (error: any) => ({
  code: text(error?.code || error?.message || error || "UNKNOWN").slice(0, 120),
  at: now(),
});
const firstNumericMetric = (
  value: any,
  keys: string[],
  depth = 0,
): number | null => {
  if (!value || typeof value !== "object" || depth > 5) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (
      candidate !== null && candidate !== "" &&
      Number.isFinite(Number(candidate))
    ) return Number(candidate);
  }
  for (const child of Object.values(value)) {
    const found = firstNumericMetric(child, keys, depth + 1);
    if (found !== null) return found;
  }
  return null;
};

function matchesValue(observed: any, requested: any) {
  const requests = Array.isArray(requested) ? requested : [requested];
  const haystack = Array.isArray(observed)
    ? observed.join(" ").toLowerCase()
    : text(observed).toLowerCase();
  return requests.some((value) => haystack.includes(text(value).toLowerCase()));
}
function merchantMatches(row: any, filters: any) {
  if (filters.country && !matchesValue(row.country, filters.country)) {
    return false;
  }
  if (filters.industry && !matchesValue(row.industry, filters.industry)) {
    return false;
  }
  if (
    filters.technology &&
    !matchesValue([
      ...(row.detected_technologies || []),
      row.ecommerce_platform,
      ...(row.probable_payment_stack || []),
      ...(row.stack || []),
    ], filters.technology)
  ) return false;
  if (
    filters.company_size &&
    !matchesValue(
      [row.employee_range, row.company_size],
      filters.company_size,
    )
  ) return false;
  if (
    filters.revenue &&
    !matchesValue([row.revenue_range, row.revenue], filters.revenue)
  ) {
    return false;
  }
  return true;
}
function partnerMatches(row: any, filters: any) {
  if (filters.country && !matchesValue(row.country, filters.country)) {
    return false;
  }
  if (
    filters.partner_type &&
    !matchesValue(row.partner_type, filters.partner_type)
  ) return false;
  if (
    filters.expertise &&
    !matchesValue(
      [
        ...(row.specialisms || []),
        ...(row.details?.partner_overview?.specialisms || []),
      ],
      filters.expertise,
    )
  ) {
    return false;
  }
  return true;
}
function providerMatches(row: any, filters: any) {
  if (
    filters.provider_type &&
    !matchesValue(
      [
        row.category,
        row.provider_type,
        ...(row.provider_roles || []),
        ...(row.capabilities || []),
      ],
      filters.provider_type,
    )
  ) return false;
  if (
    filters.capabilities &&
    !matchesValue(
      [
        ...(row.provider_roles || []),
        ...(row.capabilities || []),
        row.commercial_category,
      ],
      filters.capabilities,
    )
  ) return false;
  return true;
}

function merchantSummary(row: any, threshold = 70) {
  const score = optionalNumber(row.score ?? row.pre_score);
  return {
    id: row.id,
    entity_type: "OutboundLead",
    name: row.company_name || row.company_domain || "Unnamed company",
    subtitle: [row.industry, row.country].filter(Boolean).join(" · "),
    country: row.country || null,
    industry: row.industry || null,
    company_size: row.employee_range || null,
    revenue: row.revenue_range || null,
    stack: [row.ecommerce_platform, ...(row.probable_payment_stack || [])]
      .filter(Boolean),
    score,
    fit_band: classifyDiscoveryScore(score, threshold),
    opportunity: {
      status: row.estimation_status || "UNKNOWN",
      min_eur: row.estimated_opportunity_min_eur ?? null,
      max_eur: row.estimated_opportunity_max_eur ?? null,
    },
    tpv: {
      status: row.estimation_status || "UNKNOWN",
      min_eur: row.estimated_tpv_min_eur ?? null,
      max_eur: row.estimated_tpv_max_eur ?? null,
    },
    confidence: optionalNumber(
      row.score_breakdown_json?.evidence_confidence || row.revenue_confidence,
    ),
    contact: {
      availability: row.contactability || "UNKNOWN",
      name: row.contact_full_name || null,
      title: row.contact_title || null,
      email: row.contactability === "PROFESSIONAL_VERIFIED"
        ? row.contact_email || null
        : null,
    },
    relationship_status: row.revenue_stage || row.stage || "discovered",
    // DSCV2-F: explicit two-part enrichment state — firmography and contact
    // are distinct facts, never one generic boolean. "Fully enriched" requires
    // both (see stageScore / companyEnrichment.ts).
    enrichment: {
      firmography: row.enrichment_json?.company_enrichment
        ? "ENRICHED"
        : (row.employee_range || (row.detected_technologies || []).length
          ? "OBSERVED_PRE_EXISTING"
          : "NOT_ENRICHED"),
      firmography_at: row.enrichment_json?.company_enrichment?.enriched_at ||
        null,
      contact: text(row.contact_email)
        ? (row.contactability || "RESOLVED_UNVERIFIED")
        : "NOT_RESOLVED",
      fully_enriched: Boolean(
        row.enrichment_json?.company_enrichment && text(row.contact_email),
      ),
      pipeline_stage: row.stage || null,
    },
    source: row.source || null,
    reason: row.score_breakdown_json?.reasoning ||
      row.source_evidence_json?.pre_score_reasons?.slice?.(0, 2)?.join(" · ") ||
      "Evidence is not yet sufficient for a stronger claim.",
    evidence_status: row.source_evidence_json ? "OBSERVED" : "LIMITED",
    freshness: row.last_enriched_at || row.last_source_checked_at ||
      row.discovered_at || row.created_date || null,
    details: {
      company_overview: {
        domain: row.company_domain || null,
        industry: row.industry || null,
        country: row.country || null,
        employees: row.employee_range || null,
        revenue: row.revenue_range || null,
      },
      fit_opportunity: {
        score,
        breakdown: row.score_breakdown_json || {},
        predicted_opportunity: {
          min_eur: row.estimated_opportunity_min_eur ?? null,
          max_eur: row.estimated_opportunity_max_eur ?? null,
          status: row.estimation_status || "UNKNOWN",
        },
      },
      payments_stack: {
        technologies: row.detected_technologies || [],
        ecommerce_platform: row.ecommerce_platform || null,
        probable_payment_stack: row.probable_payment_stack || [],
        truth_boundary:
          "Probable stack is discovery intelligence, not merchant-verified payment evidence.",
      },
      contacts: {
        availability: row.contactability || "UNKNOWN",
        name: row.contact_full_name || null,
        title: row.contact_title || null,
        email: row.contactability === "PROFESSIONAL_VERIFIED"
          ? row.contact_email || null
          : null,
      },
      evidence: row.source_evidence_json || {},
      history: {
        discovered_at: row.discovered_at || row.created_date || null,
        last_source_checked_at: row.last_source_checked_at || null,
        last_enriched_at: row.last_enriched_at || null,
      },
    },
  };
}
function partnerSummary(row: any, threshold = 70) {
  const score = optionalNumber(row.score);
  const reach = optionalNumber(row.businesses_supported_estimate);
  return {
    id: row.id,
    entity_type: "PartnerProspect",
    name: row.organization_name || "Unnamed partner",
    subtitle: [row.partner_type, row.country].filter(Boolean).join(" · "),
    country: row.country || null,
    partner_type: row.partner_type || null,
    markets: row.raw_json?.markets_served || [],
    portfolio: {
      value: reach,
      status: reach !== null ? "ESTIMATED" : "UNKNOWN",
    },
    score,
    fit_band: classifyDiscoveryScore(score, threshold),
    reach: {
      value: reach,
      status: reach !== null ? "ESTIMATED" : "UNKNOWN",
    },
    contact: {
      availability: row.contact_email ? "UNVERIFIED" : "UNAVAILABLE",
      name: row.contact_name || null,
      title: row.contact_title || null,
      email: row.contact_email || null,
    },
    relationship_status: row.stage || "discovered",
    source: row.source || null,
    reason: row.score_breakdown_json?.reasoning ||
      `Partner fit is based on ${
        Object.keys(row.score_breakdown_json || {}).join(", ") ||
        "limited observed evidence"
      }.`,
    evidence_status: row.raw_json ? "OBSERVED" : "LIMITED",
    freshness: row.updated_date || row.created_date || null,
    details: {
      partner_overview: {
        domain: row.organization_domain || null,
        type: row.partner_type || null,
        country: row.country || null,
        specialisms: row.specialisms || [],
      },
      fit_potential: {
        score,
        breakdown: row.score_breakdown_json || {},
        estimated_reach: reach,
      },
      client_portfolio: {
        estimate: reach,
        status: reach !== null ? "ESTIMATED" : "UNKNOWN",
        truth_boundary:
          "Portfolio and referral reach remain estimates until source evidence is verified.",
      },
      contacts: {
        name: row.contact_name || null,
        title: row.contact_title || null,
        email: row.contact_email || null,
      },
      evidence: {
        source: row.source || null,
        legal_basis: row.legal_basis || null,
      },
      history: {
        created_at: row.created_date || null,
        last_contacted_at: row.last_contacted_at || null,
        next_action_at: row.next_action_at || null,
      },
    },
  };
}
function providerSummary(row: any, extras: any = {}) {
  const evidenceCount = list(row.evidence_refs).length;
  const score = Math.min(
    100,
    20 + (row.verification_status === "VERIFIED" ? 30 : 0) +
      (row.corporate_status === "ACTIVE" ? 15 : 0) +
      Math.min(20, (row.provider_roles || []).length * 4) +
      Math.min(15, number(extras.pricing_count)),
  );
  const gaps = [];
  if (!row.last_verified_at) gaps.push("Identity freshness not verified");
  if (!number(extras.pricing_count)) gaps.push("Pricing intelligence missing");
  if (!number(extras.authorization_count)) {
    gaps.push("Authorization evidence missing");
  }
  if (!text(row.contact_email)) gaps.push("Relationship contact unresolved");
  return {
    id: row.id,
    entity_type: "Provider",
    name: row.canonical_name || row.name || "Unnamed provider",
    subtitle: [row.category, (row.provider_roles || [])[0], row.significance]
      .filter(Boolean).join(" · "),
    provider_type: row.category || null,
    hq: row.aggregate_relationship_json?.headquarters || null,
    markets: extras.markets || [],
    capabilities: row.provider_roles || [],
    score,
    fit_band: classifyDiscoveryScore(score, 70),
    relevance: {
      score,
      explanation:
        "Derived from canonical verification, roles and current intelligence coverage.",
    },
    coverage: {
      pricing_count: number(extras.pricing_count),
      authorization_count: number(extras.authorization_count),
      evidence_count: evidenceCount,
      gaps,
      status: gaps.length ? "GAPS" : "CURRENT",
    },
    status: extras.is_candidate ? "New Provider" : "Existing Provider",
    source: "CAMBRA_PROVIDER_INTELLIGENCE",
    reason: gaps.length
      ? `${gaps.length} intelligence gap${
        gaps.length === 1 ? "" : "s"
      } should be resolved selectively.`
      : "Canonical identity and core evidence are current.",
    evidence_status: row.verification_status || "UNKNOWN",
    freshness: row.last_verified_at || row.updated_date || row.created_date ||
      null,
    details: {
      provider_overview: {
        website: row.official_website || row.website || null,
        roles: row.provider_roles || [],
        corporate_status: row.corporate_status || "UNKNOWN",
      },
      provider_relevance: {
        score,
        significance: row.significance || "UNKNOWN",
      },
      products_capabilities: {
        roles: row.provider_roles || [],
        commercial_category: row.commercial_category || null,
      },
      pricing_rate_intelligence: {
        pricing_observations: number(extras.pricing_count),
        gaps: gaps.filter((gap) => gap.includes("Pricing")),
      },
      authorization_market_presence: {
        authorization_count: number(extras.authorization_count),
        markets: extras.markets || [],
      },
      contacts_relationships: {
        email: row.contact_email || null,
        manager: row.account_manager || null,
        resolution: row.contact_resolution_status || "unknown",
      },
      evidence_history: {
        evidence_refs: row.evidence_refs || [],
        last_verified_at: row.last_verified_at || null,
      },
    },
  };
}
function providerCandidateSummary(row: any) {
  const evidenceCount = list(row.evidence_refs).length;
  const score = Math.min(
    55,
    15 + Math.min(30, evidenceCount * 10) +
      (row.state === "VERIFICATION" ? 10 : 0),
  );
  return {
    id: row.id,
    entity_type: "ProviderCandidate",
    name: row.candidate_name || "Unnamed provider candidate",
    subtitle: [row.market, "Unverified candidate"].filter(Boolean).join(" · "),
    provider_type: null,
    hq: null,
    markets: [row.market].filter(Boolean),
    capabilities: [],
    score,
    fit_band: classifyDiscoveryScore(score, 70),
    relevance: {
      score,
      explanation:
        "Candidate priority only; this is not a canonical Provider score.",
    },
    coverage: {
      pricing_count: 0,
      authorization_count: 0,
      evidence_count: evidenceCount,
      gaps: [
        "Canonical identity not resolved",
        "Pricing intelligence not verified",
        "Authorization evidence not verified",
      ],
      status: "GAPS",
    },
    status: "New Provider",
    source: "CAMBRA_PROVIDER_CANDIDATE_QUEUE",
    reason:
      "Candidate evidence requires identity resolution and verification before CAMBRA may treat this organization as a canonical provider.",
    evidence_status: row.state || "DISCOVERED",
    freshness: row.researched_at || row.created_date || null,
    details: {
      provider_overview: {
        candidate_key: row.candidate_key || null,
        market: row.market || null,
        state: row.state || "DISCOVERED",
        canonical_provider_id: row.resolved_provider_id || null,
        truth_boundary:
          "ProviderCandidate is discovery evidence, not canonical Provider truth.",
      },
      provider_relevance: {
        score,
        explanation:
          "Priority derives only from candidate state and evidence count.",
      },
      products_capabilities: { status: "UNKNOWN" },
      pricing_rate_intelligence: {
        pricing_observations: 0,
        gaps: ["Candidate has no canonical evidenced pricing"],
      },
      authorization_market_presence: {
        authorization_count: 0,
        markets: [row.market].filter(Boolean),
      },
      contacts_relationships: { status: "UNKNOWN" },
      evidence_history: {
        evidence_refs: row.evidence_refs || [],
        researched_at: row.researched_at || null,
        verified_at: row.verified_at || null,
      },
    },
  };
}

async function providerRunRows(service: any, refs: any) {
  const values = list(refs);
  const providerIds = values.filter((value) => value.startsWith("provider:"))
    .map((value) => value.slice(9));
  const candidateIds = values.filter((value) => value.startsWith("candidate:"))
    .map((value) => value.slice(10));
  const [providerRead, candidateRead] = await Promise.all([
    providerIds.length
      ? readRuntimeRows({
        source: "discovery_v2_run_providers",
        read: () => service.entities.Provider.filter(
          { id: { $in: providerIds } },
          "-last_verified_at",
          providerIds.length,
        ),
      })
      : Promise.resolve({ ok: true, status: "COMPLETE", value: [], blockers: [] }),
    candidateIds.length
      ? readRuntimeRows({
        source: "discovery_v2_run_provider_candidates",
        read: () => service.entities.ProviderCandidate.filter(
          { id: { $in: candidateIds } },
          "-researched_at",
          candidateIds.length,
        ),
      })
      : Promise.resolve({ ok: true, status: "COMPLETE", value: [], blockers: [] }),
  ]);
  const providers = requireRuntimeSource(providerRead as any) as any[];
  const candidates = requireRuntimeSource(candidateRead as any) as any[];
  return [
    ...providers.map((row: any) => ({
      ...row,
      __discovery_ref: `provider:${row.id}`,
      __candidate: false,
    })),
    ...candidates.map((row: any) => ({
      ...row,
      __discovery_ref: `candidate:${row.id}`,
      __candidate: true,
    })),
  ];
}

async function plannerContext(service: any) {
  const [cost, providerStates, checkpoints, runs, costEvents] = await Promise
    .all([
      costRuntimeSnapshot(service),
      service.entities.CommercialProviderState.list("-last_checked_at", 100),
      service.entities.LeadDiscoveryCheckpoint.list("-last_attempt_at", 1000),
      service.entities.DiscoveryExecutionRun.filter(
        { status: { $in: ["COMPLETED", "COMPLETED_PARTIAL"] } },
        "-completed_at",
        500,
      ),
      service.entities.CostUsageEvent.filter(
        { occurred_at: { $gte: monthStart() } },
        "-occurred_at",
        5000,
      ),
    ]);
  const costState: any = cost;
  const control = costState?.control || null;
  const monthlyLimit = number(control?.monthly_total_limit_minor);
  const used = number(
    costState?.governed_usage?.monthly_total_minor ??
      Math.max(
        number(costState?.usage?.monthly_total_minor),
        number(costState?.reservation_usage?.monthly_total_minor),
      ),
  );
  const apolloRows = checkpoints.filter((row: any) =>
    text(row.source_key).toLowerCase() === "apollo"
  );
  const apolloCheckpoint =
    apolloRows.find((row: any) =>
      row.checkpoint_key === "apollo:provider:diagnostic"
    ) || apolloRows.find((row: any) => row.provider_status === "ACTIVE") ||
    apolloRows[0];
  const instantly =
    providerStates.find((row: any) =>
      row.provider_key === "instantly_supersearch" &&
      row.role === "lead_intelligence"
    ) || providerStates.find((row: any) => row.provider_key === "instantly");
  const performance: any = {};
  for (
    const key of ["APOLLO", "INSTANTLY", "CAMBRA", "PROVIDER_INTELLIGENCE"]
  ) {
    const matching = runs.filter((run: any) =>
      (run.selected_sources || []).includes(key)
    );
    const spend = matching.reduce(
      (sum: number, run: any) => sum + number(run.reserved_cost_minor),
      0,
    );
    const high = matching.reduce(
      (sum: number, run: any) => sum + number(run.funnel_json?.high_fit),
      0,
    );
    performance[key] = {
      runs: matching.length,
      high_fit: high,
      high_fit_per_eur: spend > 0 ? high / (spend / 100) : 0,
    };
  }
  const providerCredits = (provider: string) => {
    const events = costEvents.filter((event: any) =>
      text(event.provider).toLowerCase().includes(provider) &&
      !["VOID", "FAILED"].includes(text(event.status).toUpperCase())
    );
    const documented = events.map((event: any) =>
      firstNumericMetric(event.usage_json, [
        "provider_credit_cost_documented",
        "source_credit_cost_documented",
        "credits_consumed",
      ])
    ).filter((value: any) => value !== null);
    return {
      consumed: documented.length
        ? documented.reduce((sum: number, value: any) => sum + number(value), 0)
        : null,
      events: events.length,
    };
  };
  const apolloCredits = providerCredits("apollo"),
    instantlyCredits = providerCredits("instantly");
  const apolloUsage = apolloCheckpoint?.provider_usage_json?.usage || {};
  const instantlyUsage = instantly?.metrics_json || {};
  const providerUsage = {
    APOLLO: {
      status: apolloCheckpoint?.provider_status || "NOT_EVIDENCED",
      remaining_credits: firstNumericMetric(apolloUsage, [
        "credits_remaining",
        "remaining_credits",
        "credit_balance",
      ]),
      consumed_credits_month: apolloCredits.consumed,
      high_fit_per_credit: apolloCredits.consumed
        ? number(performance.APOLLO?.high_fit) / apolloCredits.consumed
        : null,
      observed_events: apolloCredits.events,
      last_checked_at: apolloCheckpoint?.last_attempt_at || null,
      expires_at: "2026-09-07T23:59:59.999Z",
      balance_note: firstNumericMetric(apolloUsage, [
          "credits_remaining",
          "remaining_credits",
          "credit_balance",
        ]) === null
        ? "Apollo API usage is monitored, but this plan has not exposed a verifiable account credit balance. Check the Apollo billing UI for the contractual balance."
        : "Live balance reported by the Apollo usage response.",
    },
    INSTANTLY: {
      status: instantly?.status || "NOT_EVIDENCED",
      remaining_credits: firstNumericMetric(instantlyUsage, [
        "credits_remaining",
        "remaining_credits",
        "credit_balance",
      ]),
      consumed_credits_month: instantlyCredits.consumed,
      high_fit_per_credit: instantlyCredits.consumed
        ? number(performance.INSTANTLY?.high_fit) / instantlyCredits.consumed
        : null,
      observed_events: instantlyCredits.events,
      last_checked_at: instantly?.last_checked_at || null,
      balance_note: firstNumericMetric(instantlyUsage, [
          "credits_remaining",
          "remaining_credits",
          "credit_balance",
        ]) === null
        ? "Instantly has not reported a verifiable SuperSearch credit balance to CAMBRA. Observed governed usage is still tracked."
        : "Live balance reported by Instantly.",
    },
  };
  return {
    cost,
    monthly_remaining_minor: Math.max(0, monthlyLimit - used),
    unit_cost_minor: {
      APOLLO: number(control?.estimated_unit_cost_minor_json?.api),
      INSTANTLY: number(control?.estimated_unit_cost_minor_json?.api),
      CAMBRA: 0,
      PROVIDER_INTELLIGENCE: 0,
    },
    estimated_api_unit_minor: number(
      control?.estimated_unit_cost_minor_json?.api,
    ),
    estimated_enrichment_unit_minor: number(
      control?.estimated_unit_cost_minor_json?.enrichment,
    ),
    source_health: {
      APOLLO: {
        available: Boolean(Deno.env.get("APOLLO_API_KEY")) &&
          Date.now() < Date.parse("2026-09-07T23:59:59.999Z"),
        status: apolloCheckpoint?.provider_status || "NOT_EVIDENCED",
      },
      INSTANTLY: {
        available: Boolean(Deno.env.get("INSTANTLY_API_KEY")) &&
          instantly?.metrics_json?.supersearch_permission_verified === true,
        status: instantly?.status || "NOT_EVIDENCED",
      },
      CAMBRA: { available: true, status: "ACTIVE" },
      PROVIDER_INTELLIGENCE: { available: true, status: "ACTIVE" },
    },
    source_performance: performance,
    provider_usage: providerUsage,
  };
}

async function buildOverview(service: any, body: any) {
  const since = periodStart(body.period);
  const [
    leadsRead,
    partnersRead,
    providersRead,
    runsRead,
    costEventsRead,
    viewsRead,
    pricingRead,
    candidatesRead,
    context,
  ] = await Promise.all([
    readRuntimeRows({ source: "discovery_v2_overview_leads", limit: 5000,
      read: () => service.entities.OutboundLead.list("-created_date", 5000) }),
    readRuntimeRows({ source: "discovery_v2_overview_partners", limit: 3000,
      read: () => service.entities.PartnerProspect.list("-created_date", 3000) }),
    readRuntimeRows({ source: "discovery_v2_overview_providers", limit: 2000,
      read: () => service.entities.Provider.list("-created_date", 2000) }),
    readRuntimeRows({ source: "discovery_v2_overview_runs", limit: 500,
      read: () => service.entities.DiscoveryExecutionRun.list("-started_at", 500) }),
    readRuntimeRows({ source: "discovery_v2_overview_cost_events", limit: 5000,
      read: () => service.entities.CostUsageEvent.filter(
        { occurred_at: { $gte: monthStart() } }, "-occurred_at", 5000) }),
    readRuntimeRows({ source: "discovery_v2_overview_saved_views", limit: 200,
      read: () => service.entities.FounderSavedView.filter(
        { view_type: "discovery_saved_search" }, "-updated_at", 200) }),
    readRuntimeRows({ source: "discovery_v2_overview_pricing", limit: 2000,
      read: () => service.entities.ProviderPricingVersion.filter(
        { observed_at: { $gte: since } }, "-observed_at", 2000) }),
    readRuntimeRows({ source: "discovery_v2_overview_candidates", limit: 500,
      read: () => service.entities.ProviderCandidate.filter(
        { state: { $in: ["CANDIDATE", "UNRESOLVED", "VERIFICATION"] } },
        "-researched_at", 500) }),
    plannerContext(service),
  ]);
  const sourceCoverage = runtimeSourceCoverage({
    leads: leadsRead,
    partners: partnersRead,
    providers: providersRead,
    runs: runsRead,
    cost_events: costEventsRead,
    saved_views: viewsRead,
    pricing: pricingRead,
    candidates: candidatesRead,
  });
  const leads = leadsRead.value;
  const partners = partnersRead.value;
  const providers = providersRead.value;
  const runs = runsRead.value;
  const costEvents = costEventsRead.value;
  const views = viewsRead.value;
  const pricing = pricingRead.value;
  const candidates = candidatesRead.value;
  const uniqueMerchants = new Set(
    leads.map((row: any) =>
      row.canonical_company_key || row.company_domain || row.id
    ),
  ).size;
  const uniquePartners =
    new Set(partners.map((row: any) => row.organization_domain || row.id)).size;
  const total = uniqueMerchants + uniquePartners + providers.length;
  const recent =
    [...leads, ...partners, ...providers].filter((row: any) =>
      text(row.discovered_at || row.created_date || row.last_verified_at) >=
        since
    ).length;
  const highFit =
    leads.filter((row: any) => number(row.score ?? row.pre_score) >= 70)
      .length + partners.filter((row: any) => number(row.score) >= 70).length;
  const added = leads.filter((row: any) =>
    !["lead", "discovered"].includes(
      text(row.stage || row.revenue_stage).toLowerCase(),
    )
  ).length + partners.filter((row: any) =>
    !["discovered", "enriched", "scored"].includes(
      text(row.stage).toLowerCase(),
    )
  ).length;
  const opportunityMin = leads.reduce(
    (sum: number, row: any) => sum + number(row.estimated_opportunity_min_eur),
    0,
  );
  const opportunityMax = leads.reduce(
    (sum: number, row: any) => sum + number(row.estimated_opportunity_max_eur),
    0,
  );
  const partnerReach = partners.reduce(
    (sum: number, row: any) => sum + number(row.businesses_supported_estimate),
    0,
  );
  const discoveryEvents = costEvents.filter((event: any) =>
    text(event.related_entity_type) === "DiscoveryExecutionRun" ||
    ["leadDiscoveryAgent", "leadEnrichmentAgent", "providerResearchAgent"]
      .includes(text(event.source))
  );
  const spend = discoveryEvents.filter((event: any) =>
    ["RESERVED", "OBSERVED", "RECONCILED", "FAILED"].includes(
      text(event.status).toUpperCase(),
    )
  ).reduce((sum: number, event: any) => sum + number(event.amount_minor), 0);
  const completed = runs.filter((run: any) => TERMINAL.has(run.status));
  const needsAttention =
    runs.filter((run: any) =>
      ["FAILED", "NEEDS_REVIEW", "SOURCE_LIMITED", "BUDGET_STOPPED"].includes(
        run.status,
      )
    ).length + candidates.length;
  const kpis = [
    {
      key: "total_discovered",
      label: "Total Discovered",
      value: total,
      context:
        `${uniqueMerchants} merchants · ${uniquePartners} partners · ${providers.length} providers`,
    },
    {
      key: "new_discoveries",
      label: "New Discoveries",
      value: recent,
      context: `First seen in selected ${text(body.period || "month")}`,
    },
    {
      key: "high_fit",
      label: "High Fit",
      value: highFit,
      context: "Current canonical threshold ≥70",
    },
    {
      key: "added_to_pipelines",
      label: "Added to Pipelines",
      value: added,
      context: "Explicit accepted transitions only",
    },
    {
      key: "qualification_rate",
      label: "Qualification Rate",
      value: total ? highFit / total : null,
      format: "percent",
      context: "High Fit ÷ canonical discoveries",
    },
    {
      key: "estimated_merchant_opportunity",
      label: "Estimated Merchant Opportunity",
      value: { min: opportunityMin, max: opportunityMax },
      format: "money_band",
      context: "Predicted, never verified savings",
    },
    {
      key: "partner_reach",
      label: "Partner Reach",
      value: partnerReach || null,
      context: "Estimated; unknown values excluded",
    },
    {
      key: "intelligence_added",
      label: "Intelligence Added",
      value: pricing.length,
      context: "Accepted provider pricing observations",
    },
    {
      key: "discovery_spend",
      label: "Discovery Spend",
      value: spend,
      format: "money_minor",
      context: "Known governed spend this month",
    },
    {
      key: "cost_per_high_fit",
      label: "Cost per High Fit",
      value: highFit ? spend / highFit : null,
      format: "money_minor",
      context: "Known spend ÷ current High Fit",
    },
    {
      key: "discovery_runs",
      label: "Discovery Runs",
      value: runs.length,
      context: `${
        runs.filter((run: any) => run.status === "RUNNING").length
      } running`,
    },
    {
      key: "needs_attention",
      label: "Needs Attention",
      value: needsAttention,
      context: "Actionable unresolved items",
    },
  ].map((kpi) => ({
    ...kpi,
    value: sourceCoverage.complete ? kpi.value : null,
    status: sourceCoverage.complete ? "OBSERVED" : "UNKNOWN",
    drawer: {
      overview: kpi.context,
      breakdown: {
        period: text(body.period || "month"),
        definition: kpi.context,
      },
      insights: [],
      recommendations: needsAttention && kpi.key === "needs_attention"
        ? ["Review source-limited and failed runs before increasing spend."]
        : [],
      actions: kpi.key === "discovery_spend"
        ? ["Review expensive runs", "Reduce hard caps"]
        : ["Open related results"],
    },
    suggested_prompts: kpi.key === "discovery_spend"
      ? [
        "Where are we overspending?",
        "Cheapest source",
        "Worst runs",
        "Optimize budget",
      ]
      : [`Explain ${kpi.label}`, `What changed?`, `What needs attention?`],
  }));
  return {
    ok: true,
    data_status: sourceCoverage.status,
    source_coverage: sourceCoverage,
    engine_version: DISCOVERY_V2_ENGINE_VERSION,
    kpis,
    budget: {
      spent_minor: sourceCoverage.complete ? spend : null,
      monthly_limit_minor: number(
        (context.cost as any)?.control?.monthly_total_limit_minor,
      ),
      remaining_minor: sourceCoverage.complete
        ? context.monthly_remaining_minor
        : null,
      currency: "EUR",
      status: !sourceCoverage.complete
        ? "UNKNOWN"
        : (context.cost as any)?.validation?.ok === false
        ? "BLOCKED"
        : "GOVERNED",
    },
    source_health: context.source_health,
    running: runs.filter((run: any) => run.status === "RUNNING").slice(0, 5)
      .map(compactRun),
    recent_wins: completed.filter((run: any) =>
      number(run.funnel_json?.high_fit) > 0
    ).slice(0, 5).map(compactRun),
    needs_attention: runs.filter((run: any) =>
      ["FAILED", "NEEDS_REVIEW", "SOURCE_LIMITED", "BUDGET_STOPPED"].includes(
        run.status,
      )
    ).slice(0, 10).map(compactRun),
    saved_searches: views.filter((view: any) => view.is_current !== false).map(
      compactSavedView,
    ),
    capability_version: DISCOVERY_CAPABILITY_VERSION,
  };
}

function compactRun(run: any) {
  const scoringCoverage = run.scoring_coverage_json || {};
  const truthReady = run.status === "COMPLETED" &&
    scoringCoverage.status === "COMPLETE" &&
    number(scoringCoverage.missing) === 0 &&
    Boolean(run.terminal_snapshot_hash);
  return {
    id: run.id,
    name: run.name,
    type: run.discovery_type,
    status: run.status,
    source: (run.selected_sources || []).join(" + ") || "CAMBRA",
    stage: run.current_stage,
    target: run.target_count,
    found: number(run.funnel_json?.found),
    unique: number(run.funnel_json?.unique),
    high_fit: number(run.funnel_json?.high_fit),
    spend_minor: number(run.reserved_cost_minor),
    actual_cost_minor: optionalNumber(run.actual_cost_minor),
    cost_status: run.cost_reconciliation_json?.status || "UNKNOWN",
    hard_cap_minor: number(run.hard_cap_minor),
    started_at: run.started_at,
    completed_at: run.completed_at,
    stop_reason: run.stop_reason || null,
    quality: run.quality_json || {},
    truth_eligibility: {
      status: "INELIGIBLE",
      training_eligible: false,
      data_quality_ready: truthReady,
      reasons: [
        "DISCOVERY_OPERATIONAL_TRUTH_RUNTIME_GATE_NOT_YET_VERIFIED",
        ...(!truthReady
          ? [
            !run.terminal_snapshot_hash ? "TERMINAL_SNAPSHOT_REQUIRED" : null,
            scoringCoverage.status !== "COMPLETE"
              ? "COMPLETE_SCORING_COVERAGE_REQUIRED"
              : null,
            run.status !== "COMPLETED" ? "COMPLETED_RUN_REQUIRED" : null,
          ].filter(Boolean)
          : []),
      ],
    },
  };
}
function compactSavedView(view: any) {
  const config = view.config_json || {};
  return {
    id: view.id,
    view_key: view.view_key,
    revision: number(view.revision) || 1,
    is_current: view.is_current !== false,
    immutable_config_hash: view.immutable_config_hash || null,
    name: view.name,
    discovery_type: config.discovery_type || "MERCHANT",
    summary: config.summary ||
      Object.values(config.filters || {}).flat().slice(0, 5).join(" · "),
    source_mode: config.source_mode || "AUTO",
    target_count: config.target_count || 100,
    hard_cap_minor: number(config.hard_cap_minor),
    schedule: config.schedule || null,
    last_run: config.last_run || null,
    updated_at: view.updated_at || view.created_at,
    configuration: config,
  };
}

function snapshotSummary(row: any) {
  return {
    id: row.id,
    entity_type: row.entity_type,
    name: row.name,
    subtitle: row.subtitle || null,
    country: row.country || null,
    industry: row.industry || null,
    provider_type: row.provider_type || null,
    partner_type: row.partner_type || null,
    markets: row.markets || [],
    specialisms: row.specialisms ||
      row.details?.partner_overview?.specialisms || [],
    portfolio: row.portfolio || null,
    reach: row.reach || null,
    category: row.provider_type || row.category || null,
    provider_roles: row.capabilities || row.provider_roles || [],
    commercial_category: row.commercial_category || null,
    score: row.score ?? null,
    fit_band: row.fit_band || "UNKNOWN",
    source: row.source || null,
    relationship_status: row.relationship_status || row.status || null,
    reason: row.reason || null,
    evidence_status: row.evidence_status || "UNKNOWN",
    freshness: row.freshness || null,
    opportunity: row.opportunity || null,
    tpv: row.tpv || null,
    confidence: row.confidence ?? null,
    contact: row.contact || null,
    stack: row.stack || [],
    capabilities: row.capabilities || [],
    relevance: row.relevance || null,
    coverage: row.coverage || null,
    details: row.details || {},
  };
}

async function canonicalRunSummaries(service: any, run: any) {
  const ids = list(run.result_ids);
  const threshold = Math.max(
    1,
    Math.min(100, number(run.configuration_json?.high_fit_threshold) || 70),
  );
  if (!ids.length) return [];
  if (run.discovery_type === "MERCHANT") {
    const rows = await service.entities.OutboundLead.filter(
      { id: { $in: ids } },
      "-score",
      ids.length,
    );
    return rows.map((row: any) => merchantSummary(row, threshold));
  }
  if (run.discovery_type === "PARTNER") {
    const rows = await service.entities.PartnerProspect.filter(
      { id: { $in: ids } },
      "-score",
      ids.length,
    );
    return rows.map((row: any) => partnerSummary(row, threshold));
  }
  const rows = await providerRunRows(service, ids);
  return rows.map((row: any) =>
    row.__candidate
      ? providerCandidateSummary(row)
      : providerSummary(row, { is_candidate: false })
  );
}

async function listResults(service: any, input: any): Promise<any> {
  const runId = text(input.run_id);
  if (!runId) {
    return response({
      ok: false,
      error: "discovery_run_id_required",
      truth_boundary:
        "A run result list can only contain records durably attributed to that run.",
    }, 400);
  }
  const run = await service.entities.DiscoveryExecutionRun.get(runId);
  if (!run) {
    return response({ ok: false, error: "discovery_run_not_found" }, 404);
  }
  const type = text(input.discovery_type || "MERCHANT").toUpperCase();
  if (type !== run.discovery_type) {
    return response({ ok: false, error: "discovery_run_type_mismatch" }, 409);
  }
  const limit = Math.max(1, Math.min(250, number(input.limit) || 100));
  const offset = Math.max(0, number(input.offset));
  const threshold = Math.max(
    1,
    Math.min(100, number(input.high_fit_threshold) || 70),
  );
  const filters = input.filters || {};
  let rows: any[] = Array.isArray(run.result_snapshot_json) &&
      run.result_snapshot_json.length
    ? run.result_snapshot_json.map((row: any) => ({ ...row }))
    : await canonicalRunSummaries(service, run);
  // Results are always bounded by run attribution. Canonical fallback is
  // allowed only for the exact immutable result_ids already recorded by run.
  const attributed = new Set(list(run.result_ids));
  rows = rows.filter((row: any) =>
    attributed.has(
      row.entity_type === "Provider"
        ? `provider:${row.id}`
        : row.entity_type === "ProviderCandidate"
        ? `candidate:${row.id}`
        : row.id,
    )
  );
  if (type === "MERCHANT") {
    rows = rows.filter((row: any) => merchantMatches(row, filters));
  } else if (type === "PARTNER") {
    rows = rows.filter((row: any) => partnerMatches(row, filters));
  } else rows = rows.filter((row: any) => providerMatches(row, filters));
  const band = text(input.fit_band).toUpperCase();
  if (["HIGH", "MEDIUM", "LOW"].includes(band)) {
    rows = rows.filter((row: any) => row.fit_band === band);
  }
  const query = text(input.query).toLowerCase();
  if (query) {
    rows = rows.filter((row: any) =>
      `${row.name} ${row.subtitle} ${
        (row.stack || row.capabilities || []).join(" ")
      }`.toLowerCase().includes(query)
    );
  }
  rows.sort((a: any, b: any) => number(b.score) - number(a.score));
  return {
    ok: true,
    run_id: runId,
    run_status: run.status,
    type,
    total: rows.length,
    offset,
    limit,
    items: rows.slice(offset, offset + limit),
    truth_boundary:
      "Unknown remains Unknown. Predicted, observed and verified values are never merged.",
  };
}

async function plan(service: any, input: any) {
  const context = await plannerContext(service);
  return {
    ok: true,
    plan: planDiscoveryQuery(input, context),
    capability_registry: {
      version: DISCOVERY_CAPABILITY_VERSION,
      sources: DISCOVERY_SOURCE_REGISTRY,
      filters: DISCOVERY_FILTER_CATALOG,
    },
    budget: {
      remaining_minor: context.monthly_remaining_minor,
      currency: "EUR",
    },
    source_health: context.source_health,
    provider_usage: context.provider_usage,
  };
}

async function startRun(service: any, user: any, input: any) {
  const planned = await plan(service, input);
  const emergency = await emergencyState(service);
  if (
    number(planned.plan.cost?.estimated_minor) > 0 &&
    (emergency.safe_mode || emergency.paid_discovery_paused)
  ) {
    return response({
      ok: false,
      error: "emergency_control_paused:paid_discovery",
      safe_mode: emergency.safe_mode,
      reason: emergency.reason || null,
      zero_cost_manual_intelligence_still_available: true,
    }, 409);
  }
  const accepted = text(input.accepted_plan_fingerprint);
  if (!accepted || accepted !== planned.plan.plan_fingerprint) {
    return response({
      ok: false,
      error: "accepted_current_plan_required",
      plan: planned.plan,
    }, 409);
  }
  if ((planned.plan.execution_blockers || []).length) {
    return response({
      ok: false,
      error: "discovery_plan_has_execution_blockers",
      blockers: planned.plan.execution_blockers,
      plan: planned.plan,
    }, 409);
  }
  if (
    planned.plan.cost.estimated_minor > planned.plan.cost.hard_cap_minor &&
    planned.plan.cost.hard_cap_minor >= 0
  ) {
    return response({
      ok: false,
      error: "estimated_cost_exceeds_hard_cap",
      plan: planned.plan,
    }, 409);
  }
  if (planned.plan.cost.estimated_minor > planned.budget.remaining_minor) {
    return response({
      ok: false,
      error: "monthly_discovery_budget_insufficient",
      plan: planned.plan,
    }, 409);
  }
  const timestamp = now();
  const planHash = await acceptedDiscoveryPlanHash(planned.plan);
  const savedView = text(input.saved_view_id)
    ? await service.entities.FounderSavedView.get(text(input.saved_view_id))
    : null;
  if (
    text(input.saved_view_id) &&
    (!savedView || savedView.view_type !== "discovery_saved_search")
  ) {
    return response(
      { ok: false, error: "saved_search_revision_not_found" },
      404,
    );
  }
  if (savedView && text(input.initiator).toUpperCase() === "SCHEDULED") {
    const existing = await findScheduledDiscoveryRun(service, savedView);
    if (existing.duplicate_count > 0) {
      return response({
        ok: false,
        error: "duplicate_scheduled_discovery_runs_review_required",
        saved_view_id: savedView.id,
        run_id: existing.run?.id || null,
        duplicate_count: existing.duplicate_count,
      }, 409);
    }
    if (existing.run) {
      return response({
        ok: true,
        reused_existing_run: true,
        run: compactRun(existing.run),
        run_id: existing.run.id,
        terminal: terminalDiscoveryStatus(existing.run.status),
        next_action: terminalDiscoveryStatus(existing.run.status)
          ? "inspect_results"
          : "poll_status",
        execution_owner: "BACKEND",
      }, 200);
    }
  }
  const run = await service.entities.DiscoveryExecutionRun.create({
    run_key: `discovery:${crypto.randomUUID()}`,
    name: planned.plan.configuration.name,
    discovery_type: planned.plan.configuration.discovery_type,
    initiator: text(input.initiator || "FOUNDER").toUpperCase(),
    saved_view_id: text(input.saved_view_id) || null,
    saved_view_revision: savedView ? number(savedView.revision) || 1 : null,
    saved_view_config_hash: savedView?.immutable_config_hash || null,
    status: "QUEUED",
    current_stage: "PLAN",
    run_revision: 0,
    lease_owner: "",
    lease_expires_at: "",
    heartbeat_at: timestamp,
    stage_attempt: 0,
    stage_attempt_token: "",
    checkpoint_json: {},
    stop_requested: false,
    configuration_json: planned.plan.configuration,
    execution_plan_json: planned.plan,
    accepted_plan_hash: planHash,
    source_capability_version: planned.plan.source_capability_version,
    selected_sources: [planned.plan.selected_source].filter(Boolean),
    target_count: planned.plan.configuration.target_count,
    hard_cap_minor: planned.plan.configuration.hard_cap_minor,
    reserved_cost_minor: 0,
    actual_cost_minor: 0,
    cost_reconciliation_json: {
      status: planned.plan.cost.estimated_minor > 0
        ? "PENDING_PROVIDER_OBSERVATION"
        : "NO_INCREMENTAL_EXTERNAL_COST",
      reserved_minor: 0,
      observed_minor: 0,
      event_count: 0,
    },
    cost_reservation_revision: 0,
    monthly_budget_snapshot_json: {
      remaining_minor: planned.budget.remaining_minor,
      captured_at: timestamp,
    },
    actual_stages_json: [{
      stage: "PLAN",
      status: "COMPLETED",
      at: timestamp,
      paid: false,
    }],
    funnel_json: {
      requested: planned.plan.configuration.target_count,
      found: 0,
      unique: 0,
      enriched: 0,
      scored: 0,
      high_fit: 0,
      medium_fit: 0,
      low_fit: 0,
      excluded: 0,
    },
    quality_json: { status: "PENDING" },
    result_entity_type: planned.plan.configuration.discovery_type === "MERCHANT"
      ? "OutboundLead"
      : planned.plan.configuration.discovery_type === "PARTNER"
      ? "PartnerProspect"
      : "ProviderOrCandidate",
    result_ids: [],
    result_snapshot_json: [],
    result_attribution_json: [],
    scoring_coverage_json: {
      status: "NOT_STARTED",
      requested: 0,
      scored: 0,
      missing: 0,
      batches: [],
    },
    correction_refs: [],
    pipeline_transition_json: { accepted: 0, rejected: 0 },
    intelligence_contribution_json: {
      accepted: 0,
      rate_intelligence_only: 0,
      benchmark_eligible: 0,
    },
    errors_json: [],
    created_by_email: user?.email || user?.id || "admin",
    started_at: timestamp,
    engine_version: DISCOVERY_V2_ENGINE_VERSION,
  });
  await reconcileCommittedDiscoveryRun(service, run, "RUN_CREATED");
  const execution = await executeDiscoveryRun(service, run.id, {
    owner: `manual:${
      user?.email || user?.id || "admin"
    }:${crypto.randomUUID()}`,
    max_stages: 8,
    max_wall_ms: 20_000,
  });
  return response({
    ok: true,
    run: compactRun(execution.run || run),
    run_id: run.id,
    terminal: terminalDiscoveryStatus((execution.run || run).status),
    next_action: terminalDiscoveryStatus((execution.run || run).status)
      ? "inspect_results"
      : "poll_status",
    execution_owner: "BACKEND",
  }, 202);
}

// DSCV2-A/B (2026-08-16): the dashboard engine used to hardcode the provider
// from run.selected_sources and never consulted selectLeadIntelligenceProvider,
// so the Apollo→Instantly contract cutover (APOLLO_CONTRACT_EXPIRES_AT) could
// never apply here. This helper asks the selector with the SAME availability
// evidence runInstantlyPreviewDiscovery enforces at runtime: INSTANTLY_API_KEY
// plus the founder-verified CommercialProviderState permission row. A run whose
// founder explicitly chose INSTANTLY forces that provider; APOLLO means "paid
// discovery" and follows the automatic cutover (mode AUTO), so no deploy is
// needed on the cutover date.
export async function resolveDiscoveryLeadProvider(service: any, requestedSource: string) {
  const instantlyStates = await service.entities.CommercialProviderState.filter(
    { provider_key: "instantly_supersearch", role: "lead_intelligence" },
    "-last_checked_at",
    1,
  ).catch((error: any) =>
    safeBestEffort(error, {
      operation: "discoveryV2Admin.instantly_permission_read",
      fallback: [],
      severity: "secondary",
    })
  );
  return selectLeadIntelligenceProvider({
    mode: requestedSource === "INSTANTLY" ? "INSTANTLY" : "AUTO",
    apolloConfigured: Boolean(Deno.env.get("APOLLO_API_KEY")),
    instantlyConfigured: Boolean(Deno.env.get("INSTANTLY_API_KEY")),
    instantlySuperSearchPermission:
      instantlyStates?.[0]?.metrics_json?.supersearch_permission_verified ===
        true,
  });
}

const apolloAuthFailure = (value: any) =>
  /(^|[^0-9])(401|403)([^0-9]|$)|auth|unauthorized|forbidden|api_key/i.test(
    text(value),
  );

export async function stageDiscovery(service: any, run: any, claim: any) {
  const config = run.configuration_json || {};
  const internal = Deno.env.get("INTERNAL_CALL_SECRET") || "";
  let ids: string[] = [];
  let found = 0;
  let sourceLimited = false;
  let providerSelectionEvidence: any = null;
  if (
    run.discovery_type === "MERCHANT" &&
    ["APOLLO", "INSTANTLY"].includes(run.selected_sources?.[0])
  ) {
    const selection = await resolveDiscoveryLeadProvider(
      service,
      run.selected_sources[0],
    );
    // DSCV2-B.3: with no available provider (Apollo expired AND Instantly not
    // verified/configured), fail loudly — never keep calling Apollo silently.
    if (!selection.selected) {
      throw Object.assign(
        new Error(text(selection.reason) || "no_available_lead_provider"),
        { code: (text(selection.reason) || "no_available_lead_provider").toUpperCase() },
      );
    }
    let activeProviderKey = selection.selected;
    let providerFailover = false;
    providerSelectionEvidence = {
      requested_source: run.selected_sources[0],
      selected: activeProviderKey,
      reason: selection.reason,
    };
    const partitions = Array.isArray(run.execution_plan_json?.source_partitions)
      ? run.execution_plan_json.source_partitions
      : [];
    if (!partitions.length) {
      throw Object.assign(new Error("source_partition_plan_required"), {
        code: "SOURCE_PARTITION_PLAN_REQUIRED",
      });
    }
    const perCountry = Math.max(
      1,
      Math.min(100, Math.ceil(run.target_count / partitions.length)),
    );
    for (const partition of partitions) {
      const native = partition.filters || {};
      const country = text(native.country).toUpperCase();
      if (!LEAD_LAUNCH_MARKETS.includes(country)) {
        throw Object.assign(
          new Error(country
            ? `merchant_market_outside_active_launch:${country}`
            : "merchant_active_launch_market_required"),
          { code: "MERCHANT_MARKET_OUTSIDE_ACTIVE_LAUNCH" },
        );
      }
      const freshRun = await assertDiscoveryClaimActive(service, claim);
      const priorReceipt = freshRun.checkpoint_json?.partition_receipts?.[
        partition.key
      ];
      if (priorReceipt) {
        ids.push(...list(priorReceipt.created_ids, 1000));
        ids.push(...list(priorReceipt.matched_existing_ids, 1000));
        found += number(priorReceipt.scanned);
        continue;
      }
      await markDiscoveryMaterialEffect(service, claim, {
        partition_key: partition.key,
        partition_filters: native,
      });
      const invokeDiscovery = (providerKey: string) =>
        service.functions.invoke("leadDiscoveryAgent", {
          provider: providerKey === INSTANTLY_SUPERSEARCH_PROVIDER_KEY
            ? "instantly_supersearch"
            : "apollo",
          checkpoint_key: `discovery-v2:${run.id}:native:${partition.key}`,
          country,
          country_code: country,
          industry: native.industry || "ecommerce",
          employee_range: native.company_size || null,
          technology: native.technology || null,
          per_page: perCountry,
          limit: perCountry,
          enrichment_threshold: config.high_fit_threshold,
          discovery_run_id: run.id,
          max_related_spend_minor: run.hard_cap_minor,
          cost_stage: "NATIVE_DISCOVERY",
          cost_reason:
            `Founder accepted native company discovery plan for ${country}`,
          internal_secret: internal,
        }).catch((error: any) => ({
          ok: false,
          error: text(error?.message || error),
        }));
      let result = unwrap(await invokeDiscovery(activeProviderKey));
      // DSCV2-B.2: if Apollo fails with an auth-shaped error BEFORE its
      // contract expiry, fall over to Instantly when it is genuinely
      // available, and leave a founder-visible OperationalLog record that the
      // cutover happened earlier than planned. Never fail over silently.
      if (
        result.ok === false && activeProviderKey === APOLLO_PROVIDER_KEY &&
        apolloAuthFailure(result.error)
      ) {
        const fallback = await resolveDiscoveryLeadProvider(
          service,
          "INSTANTLY",
        );
        if (fallback.selected === INSTANTLY_SUPERSEARCH_PROVIDER_KEY) {
          await service.entities.OperationalLog.create({
            event_type: "lead_provider_failover",
            message:
              "Apollo failed before contract expiry; Discovery fell over to Instantly SuperSearch",
            data_json: {
              run_id: run.id,
              partition_key: partition.key,
              apollo_error: text(result.error),
              failed_over_to: INSTANTLY_SUPERSEARCH_PROVIDER_KEY,
            },
            created_at: now(),
          }).catch((error: any) =>
            safeBestEffort(error, {
              operation: "discoveryV2Admin.provider_failover_log",
              fallback: null,
              severity: "critical",
            })
          );
          providerFailover = true;
          activeProviderKey = INSTANTLY_SUPERSEARCH_PROVIDER_KEY;
          providerSelectionEvidence = {
            ...providerSelectionEvidence,
            failover: {
              at: now(),
              from: APOLLO_PROVIDER_KEY,
              to: INSTANTLY_SUPERSEARCH_PROVIDER_KEY,
              apollo_error: text(result.error),
            },
          };
          result = unwrap(await invokeDiscovery(activeProviderKey));
        }
      }
      if (result.ok === false) {
        throw Object.assign(
          new Error(result.error || "source_discovery_failed"),
          { code: result.error || "SOURCE_DISCOVERY_FAILED" },
        );
      }
      await checkpointDiscoveryMaterialEffect(service, claim, {
        partition_key: partition.key,
        provider: activeProviderKey,
        task_id: result.task_id || null,
        checkpoint_id: result.checkpoint_id || null,
        created_ids: list(result.created_ids, 1000),
        matched_existing_ids: list(result.matched_existing_ids, 1000),
        scanned: optionalNumber(result.scanned ?? result.previewed),
      });
      ids.push(...list(result.created_ids, 1000));
      ids.push(...list(result.matched_existing_ids, 1000));
      found += number(
        result.scanned ?? result.previewed ?? result.created_ids?.length,
      );
      sourceLimited = sourceLimited ||
        ["circuit_open", "provider_unavailable"].includes(text(result.status));
    }
    ids = list(ids, 1000).slice(0, run.target_count);
    providerSelectionEvidence = {
      ...providerSelectionEvidence,
      effective_provider: activeProviderKey,
      failover_occurred: providerFailover,
    };
  } else if (run.discovery_type === "MERCHANT") {
    const rows = await service.entities.OutboundLead.list(
      "-created_date",
      Math.min(5000, run.target_count * 10),
    );
    const matches = rows.filter((row: any) =>
      merchantMatches(row, config.filters || {})
    );
    ids = matches.slice(0, run.target_count).map((row: any) => row.id);
    found = matches.length;
  } else if (run.discovery_type === "PARTNER") {
    const rows = await service.entities.PartnerProspect.list(
      "-created_date",
      Math.min(3000, run.target_count * 10),
    );
    const matches = rows.filter((row: any) =>
      partnerMatches(row, config.filters || {})
    );
    ids = matches.slice(0, run.target_count).map((row: any) => row.id);
    found = matches.length;
    sourceLimited = run.selected_sources?.[0] !== "CAMBRA";
  } else {
    const mode = config.provider_mode || "NEW_AND_EXISTING";
    const [providers, candidates] = await Promise.all([
      mode === "NEW" ? [] : service.entities.Provider.list(
        "-last_verified_at",
        Math.min(2000, run.target_count * 10),
      ),
      mode === "REFRESH" ? [] : service.entities.ProviderCandidate.filter(
        {
          state: {
            $in: [
              "DISCOVERED",
              "CANDIDATE",
              "IDENTITY_RESOLUTION",
              "VERIFICATION",
              "UNRESOLVED",
            ],
          },
        },
        "-researched_at",
        Math.min(2000, run.target_count * 10),
      ),
    ]);
    const canonical = providers.filter((row: any) =>
      providerMatches(row, config.filters || {})
    ).map((row: any) => `provider:${row.id}`);
    const pending = candidates.filter((row: any) =>
      !config.filters?.markets_served ||
      matchesValue(row.market, config.filters.markets_served)
    ).map((row: any) => `candidate:${row.id}`);
    const matches = [...canonical, ...pending];
    ids = matches.slice(0, run.target_count);
    found = matches.length;
  }
  const at = now();
  const attribution = ids.map((id) => ({
    result_ref: id,
    relationship: "DISCOVERED_OR_MATCHED",
    attributed_at: at,
    source: run.selected_sources?.[0] || "CAMBRA",
    run_id: run.id,
  }));
  return commitDiscoveryStage(service, claim, {
    status: "RUNNING",
    current_stage: "LOCAL_PREFIT",
    result_ids: ids,
    result_attribution_json: attribution,
    funnel_json: { ...(run.funnel_json || {}), found, unique: ids.length },
    actual_stages_json: [...(run.actual_stages_json || []), {
      stage: "NATIVE_DISCOVERY",
      status: sourceLimited ? "SOURCE_LIMITED" : "COMPLETED",
      at,
      paid: ["APOLLO", "INSTANTLY"].includes(run.selected_sources?.[0]),
      ...(providerSelectionEvidence
        ? { provider_selection: providerSelectionEvidence }
        : {}),
    }],
    errors_json: sourceLimited
      ? [...(run.errors_json || []), { code: "SOURCE_LIMITED", at }]
      : run.errors_json || [],
  });
}

export async function stagePrefit(service: any, run: any, claim: any) {
  const config = run.configuration_json || {};
  let rows: any[] = [];
  if (run.discovery_type === "MERCHANT") {
    rows = await service.entities.OutboundLead.filter(
      { id: { $in: list(run.result_ids) } },
      "-pre_score",
      Math.max(1, list(run.result_ids).length),
    );
  } else if (run.discovery_type === "PARTNER") {
    rows = await service.entities.PartnerProspect.filter(
      { id: { $in: list(run.result_ids) } },
      "-score",
      Math.max(1, list(run.result_ids).length),
    );
  } else rows = await providerRunRows(service, run.result_ids);
  const seen = new Set();
  const accepted = rows.filter((row: any) => {
    const key = run.discovery_type === "MERCHANT"
      ? text(row.canonical_company_key || row.company_domain || row.id)
      : run.discovery_type === "PARTNER"
      ? text(row.organization_domain || row.id)
      : text(row.provider_key || row.candidate_key || row.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    const exclusions = [
      ...(config.exclusions || []),
      ...(config.filters?.exclusions || []),
    ].map((value: any) => text(value).toLowerCase());
    const haystack = JSON.stringify(row).toLowerCase();
    return !exclusions.some((value: string) =>
      value && haystack.includes(value)
    );
  });
  const scored = accepted.map((row: any) =>
    run.discovery_type === "PROVIDER"
      ? (row.__candidate
        ? Math.min(55, 15 + list(row.evidence_refs).length * 10)
        : 20 + (row.verification_status === "VERIFIED" ? 30 : 0) +
          (row.corporate_status === "ACTIVE" ? 15 : 0))
      : optionalNumber(row.score ?? row.pre_score)
  ).filter((score: number | null): score is number => score !== null);
  const high =
    scored.filter((score) => score >= config.high_fit_threshold).length;
  const medium = scored.filter((score) =>
    score < config.high_fit_threshold &&
    score >= Math.max(40, config.high_fit_threshold - 25)
  ).length;
  const next =
    run.discovery_type === "MERCHANT" && config.enrichment_policy !== "NONE" &&
      run.hard_cap_minor > 0 &&
      accepted.some((row: any) =>
        row.enrichment_worthy === true ||
        number(row.pre_score) >= config.high_fit_threshold
      )
      ? "SELECTIVE_COMPANY_ENRICHMENT"
      : "SCORING";
  return commitDiscoveryStage(service, claim, {
    current_stage: next,
    result_ids: accepted.map((row: any) => row.__discovery_ref || row.id),
    funnel_json: {
      ...(run.funnel_json || {}),
      unique: accepted.length,
      excluded: Math.max(0, rows.length - accepted.length),
      high_fit: high,
      medium_fit: medium,
      low_fit: Math.max(0, accepted.length - high - medium),
    },
    actual_stages_json: [...(run.actual_stages_json || []), {
      stage: "LOCAL_PREFIT",
      status: "COMPLETED",
      at: now(),
      paid: false,
      input: rows.length,
      output: accepted.length,
    }],
  });
}

export async function stageEnrich(service: any, run: any, claim: any) {
  const config = run.configuration_json || {};
  const rows = await service.entities.OutboundLead.filter(
    { id: { $in: list(run.result_ids) } },
    "-pre_score",
    Math.max(1, list(run.result_ids).length),
  );
  const candidateIds = rows.filter((row: any) =>
    row.enrichment_worthy === true ||
    number(row.pre_score) >= config.high_fit_threshold
  ).slice(0, Math.min(100, Math.ceil(run.target_count * .25))).map((row: any) =>
    row.id
  );
  if (!candidateIds.length) {
    return commitDiscoveryStage(service, claim, {
      current_stage: "SCORING",
      actual_stages_json: [...(run.actual_stages_json || []), {
        stage: "SELECTIVE_COMPANY_ENRICHMENT",
        status: "SKIPPED_NO_ELIGIBLE_CANDIDATES",
        at: now(),
        paid: false,
      }],
    });
  }
  await assertDiscoveryClaimActive(service, claim);
  await markDiscoveryMaterialEffect(service, claim, {
    candidate_ids: candidateIds,
    operation: "SELECTIVE_COMPANY_ENRICHMENT",
  });
  const result = unwrap(
    await service.functions.invoke("leadEnrichmentAgent", {
      operation: "COMPANY_ENRICHMENT",
      lead_ids: candidateIds,
      limit: candidateIds.length,
      discovery_run_id: run.id,
      max_related_spend_minor: run.hard_cap_minor,
      cost_stage: "SELECTIVE_COMPANY_ENRICHMENT",
      cost_reason: "Candidate survived dedupe, exclusions and local pre-fit",
      internal_secret: Deno.env.get("INTERNAL_CALL_SECRET") || "",
    }).catch((error: any) => ({
      ok: false,
      error: text(error?.message || error),
    })),
  );
  if (result.ok === false) {
    const code = text(result.error || "SELECTIVE_ENRICHMENT_FAILED");
    const status = code.includes("BUDGET")
      ? "BUDGET_STOPPED"
      : "COMPLETED_PARTIAL";
    return commitDiscoveryStage(service, claim, {
      status,
      current_stage: "COMPLETE",
      stop_reason: code,
      errors_json: [...(run.errors_json || []), { code, at: now() }],
      completed_at: now(),
    });
  }
  await checkpointDiscoveryMaterialEffect(service, claim, {
    requested: candidateIds.length,
    enriched: optionalNumber(result.enriched),
    skipped: optionalNumber(result.skipped),
  });
  return commitDiscoveryStage(service, claim, {
    current_stage: "SCORING",
    funnel_json: {
      ...(run.funnel_json || {}),
      enriched: number(result.enriched),
    },
    actual_stages_json: [...(run.actual_stages_json || []), {
      stage: "SELECTIVE_COMPANY_ENRICHMENT",
      // DSCV2-C: COMPANY_ENRICHMENT is a real Apollo organizations/enrich
      // adapter now. A partial outcome stays visible instead of pretending
      // the whole batch enriched.
      status: number(result.failed) > 0 ? "COMPLETED_PARTIAL" : "COMPLETED",
      at: now(),
      paid: number(result.provider_calls ?? result.contact_calls) > 0,
      requested: candidateIds.length,
      enriched: number(result.enriched),
      skipped: number(result.skipped),
      failed: number(result.failed),
    }],
  });
}

export async function stageScore(service: any, run: any, claim: any) {
  const scoringBatches: any[] = [];
  let scoringFailed = false;
  if (run.discovery_type === "MERCHANT" && list(run.result_ids).length) {
    const allIds = list(run.result_ids);
    for (let offset = 0; offset < allIds.length; offset += 50) {
      await assertDiscoveryClaimActive(service, claim);
      const batch = allIds.slice(offset, offset + 50);
      const result = unwrap(
        await service.functions.invoke("leadScoringAgent", {
          lead_ids: batch,
          limit: batch.length,
          deterministic_only: true,
          internal_secret: Deno.env.get("INTERNAL_CALL_SECRET") || "",
        }).catch((error: any) => ({
          ok: false,
          error: text(error?.message || error),
        })),
      );
      scoringBatches.push({
        offset,
        requested: batch.length,
        scored: number(result.scored),
        ok: result.ok !== false,
        task_id: result.task_id || null,
      });
      if (result.ok === false || number(result.scored) !== batch.length) {
        scoringFailed = true;
      }
    }
  }
  // DSCV2-C.3/D.2 (2026-08-16): contact resolution is deliberately
  // contact-LAST — its eligibility gate (contactLast.ts) requires the governed
  // scoring snapshot written by the batches above, so it cannot run inside
  // SELECTIVE_COMPANY_ENRICHMENT. Immediately after scoring, resolve a real
  // named contact (name, email, title) for the same leads the run selected
  // for enrichment. A blocked/partial contact pass is recorded honestly and
  // never terminates the run — the governed gates inside leadEnrichmentAgent
  // are authoritative on which leads may spend contact budget.
  let contactResolution: any = null;
  if (run.discovery_type === "MERCHANT" && list(run.result_ids).length) {
    const scoredRows = await service.entities.OutboundLead.filter(
      { id: { $in: list(run.result_ids) } },
      "-score",
      Math.max(1, list(run.result_ids).length),
    );
    for (const row of scoredRows) {
      if (
        optionalNumber(row.score) !== null &&
        ["lead", "enriched"].includes(text(row.stage))
      ) {
        await service.entities.OutboundLead.update(row.id, {
          stage: "scored",
        }).catch((error: any) =>
          safeBestEffort(error, {
            operation: "discoveryV2Admin.stage_scored_transition",
            fallback: null,
            severity: "secondary",
          })
        );
      }
    }
    const scoreConfig = run.configuration_json || {};
    const contactCandidates = scoredRows.filter((row: any) =>
      row.enrichment_worthy === true ||
      number(row.pre_score) >= scoreConfig.high_fit_threshold ||
      number(row.score) >= scoreConfig.high_fit_threshold
    ).slice(0, Math.min(100, Math.ceil(run.target_count * .25))).map((
      row: any,
    ) => row.id);
    if (
      contactCandidates.length && scoreConfig.enrichment_policy !== "NONE" &&
      run.hard_cap_minor > 0
    ) {
      await assertDiscoveryClaimActive(service, claim);
      const contactResult = unwrap(
        await service.functions.invoke("leadEnrichmentAgent", {
          operation: "CONTACT_RESOLUTION",
          lead_ids: contactCandidates,
          limit: contactCandidates.length,
          discovery_run_id: run.id,
          max_related_spend_minor: run.hard_cap_minor,
          cost_stage: "CONTACT_RESOLUTION",
          cost_reason:
            "Scored Discovery V2 candidate cleared for governed contact-last resolution",
          internal_secret: Deno.env.get("INTERNAL_CALL_SECRET") || "",
        }).catch((error: any) => ({
          ok: false,
          error: text(error?.message || error),
        })),
      );
      contactResolution = {
        requested: contactCandidates.length,
        ok: contactResult.ok !== false,
        resolved: number(contactResult.resolved),
        no_contact: number(contactResult.no_contact),
        skipped: number(contactResult.skipped),
        failed: number(contactResult.failed),
        review_required: number(contactResult.review_required),
        provider_calls: number(contactResult.provider_calls),
        task_id: contactResult.task_id || null,
        error: contactResult.ok === false ? text(contactResult.error) : null,
      };
    }
  }
  let rows: any[] = [];
  if (run.discovery_type === "MERCHANT") {
    rows = await service.entities.OutboundLead.filter(
      { id: { $in: list(run.result_ids) } },
      "-score",
      Math.max(1, list(run.result_ids).length),
    );
  } else if (run.discovery_type === "PARTNER") {
    rows = await service.entities.PartnerProspect.filter(
      { id: { $in: list(run.result_ids) } },
      "-score",
      Math.max(1, list(run.result_ids).length),
    );
  } else rows = await providerRunRows(service, run.result_ids);
  const threshold = number(run.configuration_json?.high_fit_threshold) || 70;
  const scores = rows.map((row: any) =>
    run.discovery_type === "PROVIDER"
      ? (row.__candidate
        ? Math.min(55, 15 + list(row.evidence_refs).length * 10)
        : 20 + (row.verification_status === "VERIFIED" ? 30 : 0) +
          (row.corporate_status === "ACTIVE" ? 15 : 0))
      : optionalNumber(row.score ?? row.pre_score)
  );
  const knownScores = scores.filter(
    (score: number | null): score is number => score !== null,
  );
  const high = knownScores.filter((score) => score >= threshold).length;
  const medium =
    knownScores.filter((score) =>
      score < threshold && score >= Math.max(40, threshold - 25)
    ).length;
  const duplicateRate = number(run.funnel_json?.found)
    ? 1 - number(run.funnel_json?.unique) / number(run.funnel_json?.found)
    : 0;
  const highRate = rows.length ? high / rows.length : 0;
  const quality = {
    duplicate_rate: duplicateRate,
    high_fit_rate: highRate,
    evidence_confidence: "MIXED_OBSERVED",
    explanation: highRate >= .25
      ? "Strong run: a material share survived local pre-fit with low unnecessary enrichment."
      : rows.length
      ? "Run completed, but the High Fit yield was limited; refine native filters before adding budget."
      : "No canonical results matched. No paid expansion was attempted silently.",
  };
  const completedAt = now();
  const costEvents = await service.entities.CostUsageEvent.filter(
    {
      related_entity_type: "DiscoveryExecutionRun",
      related_entity_id: run.id,
    },
    "occurred_at",
    5000,
  );
  const billableEvents = costEvents.filter((event: any) =>
    ["RESERVED", "OBSERVED", "RECONCILED", "FAILED"].includes(
      text(event.status).toUpperCase(),
    )
  );
  const actualCostMinor = billableEvents.reduce(
    (sum: number, event: any) => sum + number(event.amount_minor),
    0,
  );
  const costReconciliation = {
    status:
      costEvents.some((event: any) =>
          ["RESERVED"].includes(text(event.status).toUpperCase())
        )
        ? "PENDING_PROVIDER_OBSERVATION"
        : "RECONCILED_FROM_COST_LEDGER",
    reserved_minor: number(run.reserved_cost_minor),
    observed_minor: actualCostMinor,
    event_count: costEvents.length,
    event_keys: costEvents.map((event: any) => event.event_key).filter(Boolean),
    statuses: costEvents.reduce((counts: any, event: any) => {
      const key = text(event.status).toUpperCase() || "UNKNOWN";
      counts[key] = number(counts[key]) + 1;
      return counts;
    }, {}),
    reconciled_at: completedAt,
  };
  const summaries = await canonicalRunSummaries(service, {
    ...run,
    result_ids: rows.map((row: any) => row.__discovery_ref || row.id),
  });
  const snapshots = summaries.map(snapshotSummary);
  const missing = scores.filter((score) => score === null).length;
  const coverage = {
    status: scoringFailed || missing
      ? "PARTIAL"
      : rows.length
      ? "COMPLETE"
      : "NO_RESULTS",
    requested: rows.length,
    scored: knownScores.length,
    missing,
    batches: scoringBatches,
    scoring_version: "lead-scoring-resilience:deterministic",
    decision_time: completedAt,
  };
  const terminalSnapshot = {
    run_id: run.id,
    accepted_plan_hash: run.accepted_plan_hash,
    result_ids: run.result_ids,
    result_snapshot_json: snapshots,
    scoring_coverage_json: coverage,
    actual_cost_minor: actualCostMinor,
    cost_reconciliation_json: costReconciliation,
    funnel_json: {
      ...(run.funnel_json || {}),
      scored: knownScores.length,
      unscored: missing,
      high_fit: high,
      medium_fit: medium,
      low_fit: Math.max(0, knownScores.length - high - medium),
    },
    completed_at: completedAt,
  };
  const terminalHash = await sha256(terminalSnapshot);
  // DSCV2-C.4/D.2: "fully enriched" is firmography evidence AND a resolved
  // contact on the same lead. Partial success is counted separately, never
  // presented as complete.
  const fullyEnriched = run.discovery_type === "MERCHANT"
    ? rows.filter((row: any) =>
      row?.enrichment_json?.company_enrichment &&
      text(row?.contact_email)
    ).length
    : 0;
  const contactsResolved = run.discovery_type === "MERCHANT"
    ? rows.filter((row: any) => text(row?.contact_email)).length
    : 0;
  return commitDiscoveryStage(service, claim, {
    status: rows.length
      ? scoringFailed || missing ? "COMPLETED_PARTIAL" : "COMPLETED"
      : "SOURCE_LIMITED",
    current_stage: "COMPLETE",
    funnel_json: {
      ...(run.funnel_json || {}),
      scored: knownScores.length,
      unscored: missing,
      high_fit: high,
      medium_fit: medium,
      low_fit: Math.max(0, knownScores.length - high - medium),
      contacts_resolved: contactsResolved,
      fully_enriched: fullyEnriched,
    },
    scoring_coverage_json: coverage,
    result_snapshot_json: snapshots,
    terminal_snapshot_json: terminalSnapshot,
    terminal_snapshot_hash: terminalHash,
    quality_json: quality,
    // DSCV2-G: this run's real contribution back to the intelligence layer —
    // reconstructed quality, scoring coverage and the contact-last outcome.
    // Populated at completion instead of staying an initialized-empty field.
    intelligence_contribution_json: {
      quality,
      scoring_coverage: coverage,
      contact_resolution: contactResolution,
      contributed_at: completedAt,
    },
    actual_stages_json: [...(run.actual_stages_json || []), {
      stage: "SCORING",
      status: scoringFailed || missing ? "COMPLETED_PARTIAL" : "COMPLETED",
      at: completedAt,
      paid: false,
      deterministic: true,
    }, ...(contactResolution
      ? [{
        stage: "CONTACT_RESOLUTION",
        status: contactResolution.ok
          ? (contactResolution.resolved >= contactResolution.requested
            ? "COMPLETED"
            : "COMPLETED_PARTIAL")
          : "BLOCKED",
        at: completedAt,
        paid: contactResolution.provider_calls > 0,
        requested: contactResolution.requested,
        resolved: contactResolution.resolved,
        no_contact: contactResolution.no_contact,
        skipped: contactResolution.skipped,
        review_required: contactResolution.review_required,
        error: contactResolution.error,
      }]
      : [])],
    stop_reason: rows.length
      ? scoringFailed || missing ? "SCORING_COVERAGE_PARTIAL" : null
      : "NO_MATCHING_CANONICAL_RESULTS",
    completed_at: completedAt,
  });
}

export async function advanceRun(service: any, input: any, options: any = {}) {
  const run = await service.entities.DiscoveryExecutionRun.get(
    text(input.run_id),
  );
  if (!run) {
    return response({ ok: false, error: "discovery_run_not_found" }, 404);
  }
  if (terminalDiscoveryStatus(run.status)) {
    const projection = await reconcileCommittedDiscoveryRun(
      service,
      run,
      "TERMINAL_RUN_OBSERVED",
    );
    return response({
      ok: true,
      run: compactRun(run),
      terminal: true,
      experience_projection: projection,
    });
  }
  const owner = text(options.owner) ||
    `discovery-worker:${crypto.randomUUID()}`;
  const claim = await claimDiscoveryRun(service, run, owner);
  if (!claim.acquired) {
    return response({
      ok: true,
      run: compactRun(claim.run || run),
      terminal: terminalDiscoveryStatus((claim.run || run).status),
      in_progress: claim.in_progress === true,
      review_required: claim.review_required === true,
    }, claim.review_required ? 409 : 202);
  }
  const ownedRun = claim.run;
  await reconcileCommittedDiscoveryRun(
    service,
    ownedRun,
    "STAGE_CLAIM_COMMITTED",
  );
  const emergency = await emergencyState(service);
  const paidStage = ownedRun.current_stage ===
      "SELECTIVE_COMPANY_ENRICHMENT" ||
    ownedRun.current_stage === "NATIVE_DISCOVERY" &&
      ["APOLLO", "INSTANTLY"].includes(ownedRun.selected_sources?.[0]) ||
    ownedRun.current_stage === "PLAN" &&
      number(ownedRun.execution_plan_json?.cost?.estimated_minor) > 0;
  if (paidStage && (emergency.safe_mode || emergency.paid_discovery_paused)) {
    const stopped = await commitDiscoveryStage(service, claim, {
      status: "FOUNDER_STOPPED",
      current_stage: "COMPLETE",
      stop_requested: true,
      stop_reason: "GLOBAL_EMERGENCY_STOP",
      completed_at: now(),
      actual_stages_json: [...(ownedRun.actual_stages_json || []), {
        stage: ownedRun.current_stage,
        status: "FOUNDER_STOPPED",
        at: now(),
        paid: true,
      }],
    });
    const projection = await reconcileCommittedDiscoveryRun(
      service,
      stopped,
      "EMERGENCY_STOP_COMMITTED",
    );
    return response({
      ok: false,
      error: "emergency_control_paused:paid_discovery",
      run: compactRun(stopped),
      terminal: true,
      experience_projection: projection,
    }, 409);
  }
  if (ownedRun.stop_requested === true) {
    const stopped = await commitDiscoveryStage(service, claim, {
      status: "FOUNDER_STOPPED",
      current_stage: "COMPLETE",
      stop_reason: ownedRun.stop_reason || "FOUNDER_STOP_REQUESTED",
      completed_at: now(),
      actual_stages_json: [...(ownedRun.actual_stages_json || []), {
        stage: ownedRun.current_stage,
        status: "FOUNDER_STOPPED",
        at: now(),
      }],
    });
    const projection = await reconcileCommittedDiscoveryRun(
      service,
      stopped,
      "FOUNDER_STOP_COMMITTED",
    );
    return response({
      ok: true,
      run: compactRun(stopped),
      terminal: true,
      experience_projection: projection,
    });
  }
  try {
    let updated;
    if (ownedRun.current_stage === "PLAN") {
      updated = await commitDiscoveryStage(service, claim, {
        status: "RUNNING",
        current_stage: "NATIVE_DISCOVERY",
        actual_stages_json: [...(ownedRun.actual_stages_json || []), {
          stage: "PLAN_ACCEPTED",
          status: "COMPLETED",
          at: now(),
          paid: false,
        }],
      });
    } else if (ownedRun.current_stage === "NATIVE_DISCOVERY") {
      updated = await stageDiscovery(service, ownedRun, claim);
    } else if (ownedRun.current_stage === "LOCAL_PREFIT") {
      updated = await stagePrefit(service, ownedRun, claim);
    } else if (
      ownedRun.current_stage === "SELECTIVE_COMPANY_ENRICHMENT"
    ) {
      updated = await stageEnrich(service, ownedRun, claim);
    } else updated = await stageScore(service, ownedRun, claim);
    const projection = await reconcileCommittedDiscoveryRun(
      service,
      updated,
      "STAGE_COMMITTED",
    );
    return response({
      ok: true,
      run: compactRun(updated),
      terminal: terminalDiscoveryStatus(updated.status),
      poll_after_ms: terminalDiscoveryStatus(updated.status) ? null : 450,
      experience_projection: projection,
    });
  } catch (error: any) {
    const code = text(
      error?.code || error?.message || "DISCOVERY_STAGE_FAILED",
    );
    const budget = code.includes("BUDGET") || code.includes("COST_");
    const review = code.includes("REVIEW_REQUIRED") ||
      code.includes("AMBIGUOUS");
    const failed = await commitDiscoveryStage(service, claim, {
      status: review ? "NEEDS_REVIEW" : budget ? "BUDGET_STOPPED" : "FAILED",
      current_stage: "COMPLETE",
      stop_reason: code,
      errors_json: [...(ownedRun.errors_json || []), compactError(error)],
      completed_at: now(),
    });
    const projection = await reconcileCommittedDiscoveryRun(
      service,
      failed,
      "STAGE_FAILURE_COMMITTED",
    );
    return response(
      {
        ok: false,
        error: code,
        run: compactRun(failed),
        experience_projection: projection,
      },
      budget || review ? 409 : 500,
    );
  }
}

export async function executeDiscoveryRun(
  service: any,
  runId: string,
  options: any = {},
) {
  const owner = text(options.owner) ||
    `discovery-worker:${crypto.randomUUID()}`;
  const maxStages = Math.max(1, Math.min(12, number(options.max_stages) || 6));
  const maxWallMs = Math.max(
    1_000,
    Math.min(25_000, number(options.max_wall_ms) || 15_000),
  );
  const started = Date.now();
  let latest = await service.entities.DiscoveryExecutionRun.get(runId);
  if (!latest) return { ok: false, error: "discovery_run_not_found" };
  await reconcileCommittedDiscoveryRun(
    service,
    latest,
    "EXECUTOR_RESUME",
  );
  for (let step = 0; step < maxStages; step++) {
    if (terminalDiscoveryStatus(latest.status)) break;
    if (Date.now() - started >= maxWallMs) break;
    const result = await advanceRun(
      service,
      { run_id: runId },
      { owner },
    );
    const payload = await responsePayload(result);
    latest = await service.entities.DiscoveryExecutionRun.get(runId);
    if (
      payload.in_progress || payload.review_required ||
      result.status >= 400 || terminalDiscoveryStatus(latest.status)
    ) break;
  }
  return {
    ok: true,
    run: latest,
    terminal: terminalDiscoveryStatus(latest.status),
    continuation: terminalDiscoveryStatus(latest.status)
      ? "NONE"
      : "EXISTING_SCHEDULER_HOST",
  };
}

async function saveSearch(service: any, user: any, input: any) {
  const config: any = normalizeDiscoveryConfiguration(
    input.configuration || input,
  );
  const schedule = input.schedule || null;
  if (schedule?.enabled) {
    const cadence = Math.max(1, number(schedule.runs_per_month) || 4);
    const theoretical = cadence * number(config.hard_cap_minor);
    const context = await plannerContext(service);
    const monthlyLimit = number(
      (context.cost as any)?.control?.monthly_total_limit_minor,
    );
    if (monthlyLimit <= 0 || theoretical > monthlyLimit) {
      return response({
        ok: false,
        error: "schedule_theoretical_spend_exceeds_authorized_budget",
        theoretical_monthly_minor: theoretical,
        authorized_monthly_minor: monthlyLimit,
      }, 409);
    }
    config.schedule = {
      ...schedule,
      theoretical_monthly_minor: theoretical,
      status: "ACTIVE",
    };
  }
  const viewKey = text(input.view_key) || `discovery:${crypto.randomUUID()}`;
  const existing = (await service.entities.FounderSavedView.filter(
    { view_key: viewKey },
    "-updated_at",
    100,
  )).find((row: any) => row.is_current !== false) || null;
  const nextRevision = existing ? number(existing.revision) + 1 : 1;
  const configJson = {
    ...config,
    summary: Object.values(config.filters || {}).flat().slice(0, 6).join(
      " · ",
    ),
  };
  const row = {
    view_key: viewKey,
    name: text(input.name || config.name),
    view_type: "discovery_saved_search",
    config_json: configJson,
    revision: nextRevision,
    is_current: true,
    previous_revision_id: existing?.id || null,
    immutable_config_hash: await sha256({
      view_key: viewKey,
      revision: nextRevision,
      config_json: configJson,
    }),
    created_by: user?.email || user?.id || "admin",
    created_at: now(),
    updated_at: now(),
  };
  const saved = await service.entities.FounderSavedView.create(row);
  if (existing) {
    await service.entities.FounderSavedView.update(existing.id, {
      is_current: false,
      updated_at: now(),
    });
  }
  return response({ ok: true, saved_search: compactSavedView(saved) });
}

async function runList(service: any, input: any) {
  const runRead = await readRuntimeRows({
    source: "discovery_v2_run_list",
    limit: 500,
    read: () => service.entities.DiscoveryExecutionRun.list("-started_at", 500),
  });
  let runs = runRead.value;
  const type = text(input.discovery_type).toUpperCase();
  if (["MERCHANT", "PARTNER", "PROVIDER"].includes(type)) {
    runs = runs.filter((run: any) => run.discovery_type === type);
  }
  const status = text(input.status).toUpperCase();
  if (status) runs = runs.filter((run: any) => run.status === status);
  const query = text(input.query).toLowerCase();
  if (query) {
    runs = runs.filter((run: any) =>
      `${run.name} ${run.discovery_type} ${
        (run.selected_sources || []).join(" ")
      }`.toLowerCase().includes(query)
    );
  }
  return {
    ok: true,
    data_status: runRead.status,
    source_coverage: runtimeSourceCoverage({ runs: runRead }),
    runs: runs.map(compactRun),
    stats: runRead.status === "COMPLETE" ? {
      month:
        runs.filter((run: any) => text(run.started_at) >= monthStart()).length,
      running: runs.filter((run: any) => run.status === "RUNNING").length,
      success_rate: runs.filter((run: any) => TERMINAL.has(run.status)).length
        ? runs.filter((run: any) =>
          ["COMPLETED", "COMPLETED_PARTIAL"].includes(run.status)
        ).length / runs.filter((run: any) => TERMINAL.has(run.status)).length
        : null,
      spend_minor: runs.reduce(
        (sum: number, run: any) => sum + number(run.reserved_cost_minor),
        0,
      ),
      high_fit: runs.reduce(
        (sum: number, run: any) => sum + number(run.funnel_json?.high_fit),
        0,
      ),
      failed_review:
        runs.filter((run: any) =>
          ["FAILED", "NEEDS_REVIEW"].includes(run.status)
        ).length,
    } : null,
  };
}

async function compareRuns(service: any, input: any) {
  const ids = list(input.run_ids, 5);
  if (ids.length < 2) {
    return response({ ok: false, error: "select_between_2_and_5_runs" }, 400);
  }
  const runRead = await readRuntimeRows({
    source: "discovery_v2_compare_runs",
    read: () => service.entities.DiscoveryExecutionRun.filter(
      { id: { $in: ids } }, "-started_at", 5),
  });
  const runs = runRead.value;
  const rows = runs.map((run: any) => {
    const high = number(run.funnel_json?.high_fit),
      unique = number(run.funnel_json?.unique),
      spend = number(run.reserved_cost_minor);
    return {
      ...compactRun(run),
      qualification_rate: unique ? high / unique : null,
      cost_per_high_fit_minor: high ? spend / high : null,
      evidence_quality: run.quality_json?.evidence_confidence || "UNKNOWN",
      pipeline_acceptance: number(run.pipeline_transition_json?.accepted),
    };
  });
  const best =
    [...rows].sort((a: any, b: any) =>
      (number(b.high_fit) / (number(b.spend_minor) || 1)) -
      (number(a.high_fit) / (number(a.spend_minor) || 1))
    )[0];
  return response({
    ok: true,
    data_status: runRead.status,
    source_coverage: runtimeSourceCoverage({ runs: runRead }),
    runs: rows,
    explanation: best
      ? `${best.name} produced the strongest observed High Fit yield per governed euro. Differences may reflect native filter precision, duplicate rate and source coverage; no causal claim is made.`
      : "Insufficient comparable evidence.",
    optimized_draft: best
      ? {
        ...runs.find((run: any) => run.id === best.id)?.configuration_json,
        name: `Optimized from ${best.name}`,
      }
      : null,
  });
}

export async function resultAction(service: any, input: any) {
  const type = text(input.discovery_type).toUpperCase(),
    id = text(input.id),
    action = text(input.result_action).toUpperCase();
  if (!id || !action) {
    return response({ ok: false, error: "result_action_and_id_required" }, 400);
  }
  const runId = text(input.run_id);
  if (!runId) {
    return response({ ok: false, error: "discovery_run_id_required" }, 400);
  }
  const run = await service.entities.DiscoveryExecutionRun.get(runId);
  if (!run) {
    return response({ ok: false, error: "discovery_run_not_found" }, 404);
  }
  if (run.discovery_type !== type) {
    return response({ ok: false, error: "discovery_run_type_mismatch" }, 409);
  }
  if (!terminalDiscoveryStatus(run.status)) {
    return response({ ok: false, error: "discovery_run_not_terminal" }, 409);
  }
  const references = new Set(list(run.result_ids));
  const attributed = type === "PROVIDER"
    ? references.has(`provider:${id}`) || references.has(`candidate:${id}`)
    : references.has(id);
  if (!attributed) {
    return response({
      ok: false,
      error: "result_not_attributed_to_discovery_run",
    }, 409);
  }
  // DSCV2-E (2026-08-16): founder actions now move the REAL OutboundLead.stage
  // enum (lead → enriched → scored → outreach_ready → ... → won/lost), not
  // only revenue_stage/reservoir_state, and every transition leaves immutable
  // evidence in DiscoveryExecutionRun.pipeline_transition_json. Mapping:
  //   ADD_TO_GROWTH → stage 'outreach_ready' (eligible for the governed
  //     outreach worker; sending itself stays separately gated)
  //   REJECT        → stage 'disqualified'
  // Frontier with legacy workers: Discovery V2 owns stage up to
  // outreach_ready/disqualified for leads attributed to a run;
  // autonomousCommercialWorker takes over from there (scored/outreach_ready →
  // contacted → ...) once outreach actually sends.
  let stageTransition: any = null;
  if (type === "MERCHANT") {
    const row = await service.entities.OutboundLead.get(id);
    if (!row) return response({ ok: false, error: "merchant_not_found" }, 404);
    if (action === "ADD_TO_GROWTH") {
      await service.entities.OutboundLead.update(id, {
        stage: "outreach_ready",
        revenue_stage: "qualified",
        next_action:
          "Founder accepted into Growth; outbound remains separately governed.",
        reservoir_state: "qualified",
        reservoir_updated_at: now(),
      });
      stageTransition = { from: text(row.stage) || null, to: "outreach_ready" };
    } else if (action === "REJECT") {
      await service.entities.OutboundLead.update(id, {
        stage: "disqualified",
        reservoir_state: "disqualified",
        suppression_reason: "founder_rejected_discovery_result",
        reservoir_updated_at: now(),
      });
      stageTransition = { from: text(row.stage) || null, to: "disqualified" };
    } else {return response(
        { ok: false, error: "unsupported_result_action" },
        400,
      );}
  } else if (type === "PARTNER") {
    const row = await service.entities.PartnerProspect.get(id);
    if (!row) return response({ ok: false, error: "partner_not_found" }, 404);
    const nextStage = action === "ADD_TO_GROWTH"
      ? "qualified"
      : action === "REJECT"
      ? "lost"
      : row.stage;
    await service.entities.PartnerProspect.update(id, { stage: nextStage });
    if (nextStage !== row.stage) {
      stageTransition = { from: text(row.stage) || null, to: nextStage };
    }
  } else {return response({
      ok: false,
      error: "provider_changes_require_intelligence_review",
    }, 409);}
  if (stageTransition) {
    const at = now();
    const priorTransitions = Array.isArray(
        run.pipeline_transition_json?.transitions,
      )
      ? run.pipeline_transition_json.transitions
      : [];
    await service.entities.DiscoveryExecutionRun.update(run.id, {
      pipeline_transition_json: {
        transitions: [...priorTransitions, {
          at,
          action,
          subject_type: type,
          subject_id: id,
          from_stage: stageTransition.from,
          to_stage: stageTransition.to,
        }].slice(-500),
        last_transition_at: at,
      },
    }).catch((error: any) =>
      safeBestEffort(error, {
        operation: "discoveryV2Admin.pipeline_transition_evidence",
        fallback: null,
        severity: "critical",
      })
    );
  }
  return response({
    ok: true,
    outbound_effect: "NONE",
    ...(stageTransition
      ? {
        stage_transition: stageTransition,
      }
      : {}),
  });
}

async function benchmarkPreview(service: any, input: any) {
  const providerId = text(input.provider_id);
  const pricingRead = await readRuntimeRows({
    source: "discovery_v2_benchmark_pricing",
    limit: 1000,
    read: () => service.entities.ProviderPricingVersion.filter(
      { provider_id: providerId }, "-observed_at", 1000),
  });
  const rows = pricingRead.value;
  const rateOnly = rows.filter((row: any) =>
    row.truth_level !== "inferred" && row.source_evidence_id &&
    row.is_demo !== true
  );
  const rejected = rows.filter((row: any) => !rateOnly.includes(row));
  return response({
    ok: true,
    data_status: pricingRead.status,
    source_coverage: runtimeSourceCoverage({ pricing: pricingRead }),
    provider_id: providerId,
    observations: rows.length,
    benchmark_eligible: 0,
    rate_intelligence_only: rateOnly.length,
    rejected: rejected.length,
    reasons: [
      "Provider pricing observations can strengthen Rate Intelligence when evidenced.",
      "They cannot enter privacy-safe merchant outcome benchmarks without a verified merchant contribution and cohort k-threshold.",
    ],
    blind_add_allowed: false,
  });
}

function scheduledAt(view: any) {
  return text(
    view?.config_json?.schedule?.next_run_at ||
      view?.config_json?.schedule?.scheduled_for ||
      view?.created_at,
  );
}

export function scheduledDiscoveryOccurrenceKey(view: any) {
  return [
    "discovery-schedule",
    text(view?.view_key || view?.id),
    number(view?.revision) || 1,
    scheduledAt(view) || "initial",
  ].join(":");
}

export function scheduledDiscoveryClaimActive(
  view: any,
  nowMs = Date.now(),
) {
  const expiresAt = Date.parse(text(view?.scheduler_claim_expires_at));
  return view?.scheduler_claim_state === SCHEDULE_CLAIMED &&
    Boolean(view?.scheduler_claim_token) && Number.isFinite(expiresAt) &&
    expiresAt > nowMs;
}

function scheduledDiscoveryDue(view: any, nowMs = Date.now()) {
  const schedule = view?.config_json?.schedule || {};
  const dueAt = Date.parse(text(schedule.next_run_at));
  return view?.is_current !== false && schedule.enabled === true &&
    schedule.status === "ACTIVE" &&
    (!Number.isFinite(dueAt) || dueAt <= nowMs);
}

/**
 * Claims one immutable saved-search revision. Only operational claim metadata
 * changes; config_json and immutable_config_hash remain untouched.
 */
export async function claimScheduledDiscoveryView(
  service: any,
  observed: any,
  owner: string,
  nowMs = Date.now(),
) {
  if (!observed || observed.is_current === false) {
    return { acquired: false, stale: true, view: observed };
  }
  if (scheduledDiscoveryClaimActive(observed, nowMs)) {
    return { acquired: false, in_progress: true, view: observed };
  }
  const previousToken = text(observed.scheduler_claim_token);
  const compare: any = {
    id: observed.id,
    revision: number(observed.revision) || 1,
    is_current: true,
  };
  if (previousToken) {
    compare.scheduler_claim_token = previousToken;
    compare.scheduler_claim_state = text(observed.scheduler_claim_state);
  } else if (observed.updated_at) {
    compare.updated_at = observed.updated_at;
  } else {
    return {
      acquired: false,
      review_required: true,
      error: "saved_search_revision_has_no_cas_etag",
      view: observed,
    };
  }
  const token = `discovery-schedule:${crypto.randomUUID()}`;
  const occurrenceKey = text(observed.scheduler_occurrence_key) ||
    scheduledDiscoveryOccurrenceKey(observed);
  let claimedAt = new Date(nowMs).toISOString();
  if (claimedAt === observed.updated_at) {
    claimedAt = new Date(nowMs + 1).toISOString();
  }
  const changed = await service.entities.FounderSavedView.updateMany(
    compare,
    {
      $set: {
        scheduler_claim_state: SCHEDULE_CLAIMED,
        scheduler_claim_token: token,
        scheduler_claim_owner: owner,
        scheduler_claim_expires_at: new Date(
          nowMs + DISCOVERY_SCHEDULE_CLAIM_MS,
        ).toISOString(),
        scheduler_occurrence_key: occurrenceKey,
        updated_at: claimedAt,
      },
    },
  );
  if (!updatedExactlyOne(changed)) {
    return {
      acquired: false,
      in_progress: true,
      view: await service.entities.FounderSavedView.get(observed.id),
    };
  }
  const claimed = await service.entities.FounderSavedView.get(observed.id);
  return {
    acquired: true,
    view: claimed,
    owner,
    token,
    occurrence_key: occurrenceKey,
  };
}

export async function findScheduledDiscoveryRun(service: any, view: any) {
  const runs = await service.entities.DiscoveryExecutionRun.filter(
    { saved_view_id: view.id, initiator: "SCHEDULED" },
    "-started_at",
    20,
  );
  const matching = runs.filter((run: any) =>
    !view.immutable_config_hash ||
    run.saved_view_config_hash === view.immutable_config_hash
  );
  return {
    run: matching[0] || null,
    duplicate_count: Math.max(0, matching.length - 1),
  };
}

function nextScheduleAt(view: any, nowMs: number, retry: boolean) {
  if (retry) return new Date(nowMs + DISCOVERY_SCHEDULE_RETRY_MS).toISOString();
  const schedule = view?.config_json?.schedule || {};
  const cadenceDays = Math.max(
    1,
    number(schedule.cadence_days) ||
      Math.round(30 / Math.max(1, number(schedule.runs_per_month) || 4)),
  );
  const dueMs = Date.parse(scheduledAt(view));
  return new Date(
    Math.max(nowMs, Number.isFinite(dueMs) ? dueMs : nowMs) +
      cadenceDays * 86_400_000,
  ).toISOString();
}

/**
 * Advances cadence by creating a new immutable revision. A prepared successor
 * is written before the current pointer moves so a crash can be recovered.
 */
export async function advanceScheduledDiscoveryRevision(
  service: any,
  claim: any,
  run: any,
  options: any = {},
) {
  const nowMs = number(options.now_ms) || Date.now();
  const source = await service.entities.FounderSavedView.get(claim.view.id);
  if (
    source.scheduler_claim_token !== claim.token ||
    source.scheduler_claim_state !== SCHEDULE_CLAIMED ||
    source.scheduler_occurrence_key !== claim.occurrence_key
  ) throw new Error("discovery_schedule_claim_fence_lost");

  const retry = options.retry === true;
  const config = source.config_json || {};
  const configJson = {
    ...config,
    schedule: {
      ...(config.schedule || {}),
      enabled: true,
      status: "ACTIVE",
      last_occurrence_key: claim.occurrence_key,
      last_attempt_at: new Date(nowMs).toISOString(),
      last_run_id: run?.id || null,
      last_run_at: run?.started_at || null,
      last_error: retry ? text(options.error || "SCHEDULE_START_FAILED") : null,
      next_run_at: nextScheduleAt(source, nowMs, retry),
    },
  };
  const nextRevision = number(source.revision) + 1;
  let successors = await service.entities.FounderSavedView.filter(
    { previous_revision_id: source.id },
    "-created_at",
    100,
  );
  let successor = successors.find((candidate: any) =>
    candidate.scheduler_claim_state === SCHEDULE_SUCCESSOR_PREPARED &&
    candidate.scheduler_claim_token === claim.token &&
    candidate.scheduler_occurrence_key === claim.occurrence_key
  );
  if (!successor) {
    const preparedAt = new Date(nowMs).toISOString();
    successor = await service.entities.FounderSavedView.create({
      view_key: source.view_key,
      name: source.name,
      view_type: "discovery_saved_search",
      config_json: configJson,
      revision: nextRevision,
      is_current: false,
      previous_revision_id: source.id,
      immutable_config_hash: await sha256({
        view_key: source.view_key,
        revision: nextRevision,
        config_json: configJson,
      }),
      scheduler_claim_state: SCHEDULE_SUCCESSOR_PREPARED,
      scheduler_claim_token: claim.token,
      scheduler_claim_owner: claim.owner,
      scheduler_claim_expires_at: source.scheduler_claim_expires_at,
      scheduler_occurrence_key: claim.occurrence_key,
      created_by: "scheduled-discovery@cambra.internal",
      created_at: preparedAt,
      updated_at: preparedAt,
    });
  }

  if (source.is_current !== false) {
    const retired = await service.entities.FounderSavedView.updateMany(
      {
        id: source.id,
        revision: source.revision,
        is_current: true,
        scheduler_claim_state: SCHEDULE_CLAIMED,
        scheduler_claim_token: claim.token,
        scheduler_occurrence_key: claim.occurrence_key,
      },
      {
        $set: { is_current: false, updated_at: new Date(nowMs).toISOString() },
      },
    );
    if (!updatedExactlyOne(retired)) {
      const observed = await service.entities.FounderSavedView.get(source.id);
      if (
        observed.is_current !== false ||
        observed.scheduler_claim_token !== claim.token
      ) throw new Error("discovery_schedule_claim_fence_lost");
    }
  }

  if (successor.is_current !== true) {
    const lineage = await service.entities.FounderSavedView.filter(
      { view_key: source.view_key },
      "-revision",
      100,
    );
    const competingCurrent = lineage.find((candidate: any) =>
      candidate.is_current !== false && candidate.id !== successor.id
    );
    if (competingCurrent) {
      throw new Error("discovery_schedule_successor_competing_revision");
    }
    const activated = await service.entities.FounderSavedView.updateMany(
      {
        id: successor.id,
        revision: successor.revision,
        is_current: false,
        scheduler_claim_state: SCHEDULE_SUCCESSOR_PREPARED,
        scheduler_claim_token: claim.token,
        scheduler_occurrence_key: claim.occurrence_key,
      },
      {
        $set: {
          is_current: true,
          scheduler_claim_state: "",
          scheduler_claim_token: "",
          scheduler_claim_owner: "",
          scheduler_claim_expires_at: "1970-01-01T00:00:00.000Z",
          scheduler_occurrence_key: "",
          updated_at: new Date(nowMs).toISOString(),
        },
      },
    );
    if (!updatedExactlyOne(activated)) {
      const observed = await service.entities.FounderSavedView.get(
        successor.id,
      );
      if (observed.is_current !== true) {
        throw new Error("discovery_schedule_successor_activation_failed");
      }
    }
  }
  return service.entities.FounderSavedView.get(successor.id);
}

export async function recoverPreparedScheduledRevision(
  service: any,
  views: any[],
) {
  const prepared = views.filter((view: any) =>
    view.is_current === false &&
    view.scheduler_claim_state === SCHEDULE_SUCCESSOR_PREPARED &&
    Boolean(view.scheduler_claim_token)
  ).sort((left: any, right: any) =>
    number(right.revision) - number(left.revision)
  );
  for (const candidate of prepared) {
    if (
      views.some((view: any) =>
        view.view_key === candidate.view_key && view.is_current !== false &&
        view.id !== candidate.id
      )
    ) continue;
    const predecessor = await service.entities.FounderSavedView.get(
      candidate.previous_revision_id,
    );
    if (
      !predecessor || predecessor.is_current !== false ||
      predecessor.scheduler_claim_token !== candidate.scheduler_claim_token ||
      predecessor.scheduler_occurrence_key !==
        candidate.scheduler_occurrence_key
    ) continue;
    const activated = await service.entities.FounderSavedView.updateMany(
      {
        id: candidate.id,
        revision: candidate.revision,
        is_current: false,
        scheduler_claim_state: SCHEDULE_SUCCESSOR_PREPARED,
        scheduler_claim_token: candidate.scheduler_claim_token,
      },
      {
        $set: {
          is_current: true,
          scheduler_claim_state: "",
          scheduler_claim_token: "",
          scheduler_claim_owner: "",
          scheduler_claim_expires_at: "1970-01-01T00:00:00.000Z",
          scheduler_occurrence_key: "",
          updated_at: now(),
        },
      },
    );
    if (updatedExactlyOne(activated)) {
      return {
        recovered: true,
        view: await service.entities.FounderSavedView.get(candidate.id),
      };
    }
  }
  return { recovered: false, view: null };
}

export async function processScheduledDiscoverySearches(service: any) {
  const recoveryPage = Math.floor(Date.now() / 60_000) %
    DISCOVERY_PROJECTION_RECOVERY_PAGES;
  const projectionScanErrors: string[] = [];
  const listProjectionCandidates = async (skip: number) => {
    try {
      return await service.entities.DiscoveryExecutionRun.list(
        "-heartbeat_at",
        DISCOVERY_PROJECTION_RECOVERY_PAGE_SIZE,
        skip,
      );
    } catch (error: any) {
      projectionScanErrors.push(
        text(error?.message || error || "DISCOVERY_PROJECTION_SCAN_FAILED"),
      );
      return [];
    }
  };
  const [recentProjectionCandidates, rotatedRecoveryCandidates] =
    typeof service.entities.DiscoveryExecutionRun.list === "function"
      ? await Promise.all([
        listProjectionCandidates(0),
        listProjectionCandidates(
          recoveryPage * DISCOVERY_PROJECTION_RECOVERY_PAGE_SIZE,
        ),
      ])
      : [[], []];
  const reconciliationCandidates = [
    ...new Map(
      [...recentProjectionCandidates, ...rotatedRecoveryCandidates].map((
        run,
      ) => [run.id, run]),
    ).values(),
  ];
  const experienceReconciliation = await reconcileDiscoveryExperienceBatch(
    service,
    reconciliationCandidates,
    24,
  );
  if (projectionScanErrors.length) {
    experienceReconciliation.ok = false;
    experienceReconciliation.errors.push(
      ...projectionScanErrors.map((code) => ({
        run_id: "*",
        projection_key: "BACKLOG_SCAN",
        event_type: "discovery.plan.accepted" as const,
        code,
      })),
    );
  }
  if (!experienceReconciliation.ok) {
    console.error("discovery_experience_backlog_incomplete", {
      errors: experienceReconciliation.errors,
    });
  }
  const active = await service.entities.DiscoveryExecutionRun.filter(
    { status: { $in: ["QUEUED", "RUNNING"] } },
    "heartbeat_at",
    20,
  );
  const eligible = active.filter((run: any) =>
    !run.next_eligible_at || Date.parse(run.next_eligible_at) <= Date.now()
  ).sort((left: any, right: any) =>
    Date.parse(left.heartbeat_at || left.started_at || "1970-01-01") -
      Date.parse(right.heartbeat_at || right.started_at || "1970-01-01") ||
    text(left.id).localeCompare(text(right.id))
  );
  if (eligible.length) {
    const results: any[] = [];
    const started = Date.now();
    for (const run of eligible.slice(0, 8)) {
      if (Date.now() - started > 22_000) break;
      const executed = await executeDiscoveryRun(service, run.id, {
        owner: `scheduler:${crypto.randomUUID()}`,
        max_stages: 8,
        max_wall_ms: Math.max(2_000, 22_000 - (Date.now() - started)),
      });
      results.push({
        run_id: run.id,
        status: executed.run?.status || "UNKNOWN",
        terminal: executed.terminal === true,
      });
    }
    return {
      ok: true,
      action: "DRAINED_ACTIVE_RUNS",
      fair_order: "OLDEST_HEARTBEAT_FIRST",
      results,
      experience_reconciliation: experienceReconciliation,
    };
  }
  const views = await service.entities.FounderSavedView.filter(
    { view_type: "discovery_saved_search" },
    "-updated_at",
    500,
  );
  const preparedRecovery = await recoverPreparedScheduledRevision(
    service,
    views,
  );
  if (preparedRecovery.recovered) {
    return {
      ok: true,
      action: "RECOVERED_SCHEDULE_SUCCESSOR",
      saved_view_id: preparedRecovery.view?.id || null,
    };
  }
  const currentViews = views.filter((view: any) => view.is_current !== false);
  const claimed = currentViews.filter((view: any) =>
    view.scheduler_claim_state === SCHEDULE_CLAIMED &&
    Boolean(view.scheduler_claim_token)
  ).sort((left: any, right: any) =>
    Date.parse(left.scheduler_claim_expires_at || "1970-01-01") -
      Date.parse(right.scheduler_claim_expires_at || "1970-01-01") ||
    text(left.id).localeCompare(text(right.id))
  );
  const due = claimed[0] ||
    currentViews.filter((view: any) => scheduledDiscoveryDue(view)).sort((
      left: any,
      right: any,
    ) =>
      Date.parse(left.config_json?.schedule?.next_run_at || "1970-01-01") -
        Date.parse(right.config_json?.schedule?.next_run_at || "1970-01-01") ||
      text(left.id).localeCompare(text(right.id))
    )[0];
  if (!due) {
    return {
      ok: true,
      action: "NO_DUE_SAVED_SEARCH",
      experience_reconciliation: experienceReconciliation,
    };
  }

  const existingBeforeClaim = await findScheduledDiscoveryRun(service, due);
  if (existingBeforeClaim.duplicate_count > 0) {
    return {
      ok: false,
      action: "DUPLICATE_SCHEDULED_RUNS_REVIEW_REQUIRED",
      saved_view_id: due.id,
      run_id: existingBeforeClaim.run?.id || null,
      duplicate_count: existingBeforeClaim.duplicate_count,
    };
  }
  if (existingBeforeClaim.run) {
    const existingClaim = {
      view: due,
      owner: text(due.scheduler_claim_owner),
      token: text(due.scheduler_claim_token),
      occurrence_key: text(due.scheduler_occurrence_key),
    };
    if (!existingClaim.token || !existingClaim.occurrence_key) {
      return {
        ok: false,
        action: "SCHEDULE_RUN_WITHOUT_DURABLE_CLAIM_REVIEW_REQUIRED",
        saved_view_id: due.id,
        run_id: existingBeforeClaim.run.id,
      };
    }
    const successor = await advanceScheduledDiscoveryRevision(
      service,
      existingClaim,
      existingBeforeClaim.run,
    );
    return {
      ok: true,
      action: "RECOVERED_EXISTING_SCHEDULED_RUN",
      saved_view_id: due.id,
      successor_saved_view_id: successor.id,
      run_id: existingBeforeClaim.run.id,
    };
  }
  if (scheduledDiscoveryClaimActive(due)) {
    return {
      ok: true,
      action: "SCHEDULE_CLAIM_IN_PROGRESS",
      saved_view_id: due.id,
      lease_expires_at: due.scheduler_claim_expires_at,
    };
  }

  const config = due.config_json || {};
  const planned = await plan(service, config);
  if (planned.plan.cost.estimated_minor > planned.budget.remaining_minor) {
    return { ok: true, action: "BUDGET_BLOCKED", saved_view_id: due.id };
  }
  const claim = await claimScheduledDiscoveryView(
    service,
    due,
    `scheduler:${crypto.randomUUID()}`,
  );
  if (!claim.acquired) {
    return {
      ok: !claim.review_required,
      action: claim.review_required
        ? "SCHEDULE_CLAIM_REVIEW_REQUIRED"
        : "SCHEDULE_CLAIM_LOST_OR_IN_PROGRESS",
      saved_view_id: due.id,
      error: claim.error || null,
    };
  }
  const existingAfterClaim = await findScheduledDiscoveryRun(
    service,
    claim.view,
  );
  if (existingAfterClaim.duplicate_count > 0) {
    return {
      ok: false,
      action: "DUPLICATE_SCHEDULED_RUNS_REVIEW_REQUIRED",
      saved_view_id: due.id,
      run_id: existingAfterClaim.run?.id || null,
      duplicate_count: existingAfterClaim.duplicate_count,
    };
  }
  if (existingAfterClaim.run) {
    const successor = await advanceScheduledDiscoveryRevision(
      service,
      claim,
      existingAfterClaim.run,
    );
    return {
      ok: true,
      action: "RECOVERED_EXISTING_SCHEDULED_RUN",
      saved_view_id: due.id,
      successor_saved_view_id: successor.id,
      run_id: existingAfterClaim.run.id,
    };
  }
  const started = await startRun(service, {
    email: "scheduled-discovery@cambra.internal",
  }, {
    ...config,
    saved_view_id: claim.view.id,
    initiator: "SCHEDULED",
    accepted_plan_fingerprint: planned.plan.plan_fingerprint,
  });
  const payload = await responsePayload(started);
  let successor: any = null;
  if (payload.ok) {
    const run = await service.entities.DiscoveryExecutionRun.get(
      text(payload.run_id),
    );
    if (!run) {
      return {
        ok: false,
        action: "SCHEDULE_START_MISSING_DURABLE_RUN_REVIEW_REQUIRED",
        saved_view_id: due.id,
      };
    }
    successor = await advanceScheduledDiscoveryRevision(service, claim, run);
  } else {
    successor = await advanceScheduledDiscoveryRevision(
      service,
      claim,
      null,
      { retry: true, error: payload.error || "SCHEDULE_START_FAILED" },
    );
  }
  return {
    ok: true,
    action: payload.ok ? "STARTED_DUE_SEARCH" : "START_FAILED",
    saved_view_id: due.id,
    successor_saved_view_id: successor?.id || null,
    result: payload,
    experience_reconciliation: experienceReconciliation,
  };
}

function compactLeadAudience(view: any) {
  const config = view?.config_json || {};
  return {
    id: text(view?.id),
    view_key: text(view?.view_key),
    revision: number(view?.revision) || 1,
    name: text(view?.name) || "Untitled audience",
    member_count: number(config.member_count ?? config.lead_ids?.length),
    lead_ids: list(config.lead_ids, 1000),
    filters: config.filters && typeof config.filters === "object"
      ? config.filters
      : {},
    readiness_counts: config.readiness_counts || {},
    summary: text(config.summary),
    source: text(config.source) || "DISCOVERY_PEOPLE",
    created_at: view?.created_at || null,
    updated_at: view?.updated_at || view?.created_at || null,
  };
}

async function peoplePortfolio(service: any, input: any) {
  const leadRead = await readRuntimeRows({
    source: "discovery_people_leads",
    limit: 5000,
    read: () => service.entities.OutboundLead.list("-created_date", 5000),
  });
  if (leadRead.status === "UNAVAILABLE") {
    return {
      ok: false,
      error: "discovery_people_source_unavailable",
      data_status: leadRead.status,
      source_coverage: runtimeSourceCoverage({ leads: leadRead }),
    };
  }
  const projected = (leadRead.value || []).map(projectLeadPerson);
  const all = projected.filter((row: any) => row.launch_market_eligible === true);
  const excludedNonLaunch = projected.filter((row: any) => row.launch_market_eligible !== true);
  const filtered = filterLeadPeople(all, input).sort((left: any, right: any) =>
    Number(right.score ?? -1) - Number(left.score ?? -1)
    || Number(Boolean(right.person_name)) - Number(Boolean(left.person_name))
    || String(left.company_name || "").localeCompare(String(right.company_name || ""), "en")
    || String(left.person_name || "").localeCompare(String(right.person_name || ""), "en")
  );
  const requestedLimit = Math.max(1, Math.min(250, number(input.limit) || 120));
  const personaCounts = Object.fromEntries(LEAD_PERSONA_GROUPS.map((persona) => [
    persona,
    all.filter((row: any) => row.personas.includes(persona)).length,
  ]));
  return {
    ok: true,
    data_status: leadRead.status,
    source_coverage: runtimeSourceCoverage({ leads: leadRead }),
    items: filtered.slice(0, requestedLimit),
    matched_ids: filtered.slice(0, 1000).map((row: any) => row.id),
    total: filtered.length,
    returned: Math.min(filtered.length, requestedLimit),
    selection_limit: 1000,
    metrics: {
      people_rows: all.filter((row: any) => row.person_name).length,
      named_contacts: all.filter((row: any) => row.person_name && row.person_title).length,
      high_fit: all.filter((row: any) => row.score !== null && row.score >= 70).length,
      send_ready: all.filter((row: any) => row.readiness === "READY").length,
      gmv_known: all.filter((row: any) => row.gmv_truth_class === "ESTIMATED").length,
      excluded_non_launch: excludedNonLaunch.length,
    },
    filter_options: {
      personas: LEAD_PERSONA_GROUPS,
      countries: LEAD_LAUNCH_MARKETS,
      gmv_bands: [
        "UNDER_1M", "FROM_1M_TO_5M", "FROM_5M_TO_20M",
        "FROM_20M_TO_100M", "OVER_100M", "UNKNOWN",
      ],
      readiness: ["READY", "REVIEW_REQUIRED", "BLOCKED"],
      pipeline_state: ["DISCOVERED", "IN_PIPELINE", "WON", "EXCLUDED"],
    },
    facet_counts: { personas: personaCounts },
    market_scope: {
      decision: "FOUNDER_DECIDED",
      active_launch_count: LEAD_LAUNCH_MARKETS.length,
      active_launch_markets: LEAD_LAUNCH_MARKETS,
      excluded_non_launch: excludedNonLaunch.length,
    },
    truth_boundary: "People and titles are observed OutboundLead fields. Persona labels and scores are derived. GMV/TPV is shown only when an explicit estimate exists; unknown remains unknown. Operational discovery is limited to the 10 founder-approved launch markets.",
  };
}

async function listLeadAudiences(service: any) {
  const viewRead = await readRuntimeRows({
    source: "discovery_people_audiences",
    limit: 500,
    read: () => service.entities.FounderSavedView.filter(
      { view_type: "lead_audience" }, "-updated_at", 500,
    ),
  });
  return {
    ok: viewRead.status !== "UNAVAILABLE",
    ...(viewRead.status === "UNAVAILABLE"
      ? { error: "lead_audience_source_unavailable" }
      : {}),
    data_status: viewRead.status,
    source_coverage: runtimeSourceCoverage({ audiences: viewRead }),
    audiences: (viewRead.value || []).filter((view: any) => view.is_current !== false)
      .map(compactLeadAudience),
  };
}

async function saveLeadAudience(service: any, user: any, input: any) {
  const name = text(input.name).slice(0, 120);
  const leadIds = list(input.lead_ids, 1000).sort();
  if (!name || !leadIds.length) {
    return response({ ok: false, error: "audience_name_and_leads_required" }, 400);
  }
  const leadRead = await readRuntimeRows({
    source: "discovery_people_audience_members",
    limit: 5000,
    read: () => service.entities.OutboundLead.list("-created_date", 5000),
  });
  const allLeads = requireRuntimeSource(leadRead);
  const byId = new Map(allLeads.map((lead: any) => [text(lead.id), lead]));
  const selected = leadIds.map((id) => byId.get(id)).filter(Boolean);
  if (selected.length !== leadIds.length) {
    return response({
      ok: false,
      error: "audience_contains_unknown_leads",
      requested: leadIds.length,
      resolved: selected.length,
    }, 409);
  }
  const projected = selected.map(projectLeadPerson);
  const nonLaunch = projected.filter((row: any) => row.launch_market_eligible !== true);
  if (nonLaunch.length) {
    return response({
      ok: false,
      error: "audience_contains_non_launch_leads",
      blocked_lead_ids: nonLaunch.map((row: any) => row.id),
      active_launch_markets: LEAD_LAUNCH_MARKETS,
    }, 409);
  }
  const filters = input.filters && typeof input.filters === "object"
    ? input.filters
    : {};
  const configJson = {
    source: "DISCOVERY_PEOPLE",
    audience_kind: "PEOPLE_SNAPSHOT",
    lead_ids: leadIds,
    member_count: leadIds.length,
    filters,
    readiness_counts: {
      READY: projected.filter((row: any) => row.readiness === "READY").length,
      REVIEW_REQUIRED: projected.filter((row: any) => row.readiness === "REVIEW_REQUIRED").length,
      BLOCKED: projected.filter((row: any) => row.readiness === "BLOCKED").length,
    },
    market_scope: {
      decision: "FOUNDER_DECIDED",
      active_launch_markets: LEAD_LAUNCH_MARKETS,
    },
    summary: [
      text(filters.persona), text(filters.country), text(filters.gmv_band),
      filters.min_score ? `score >= ${number(filters.min_score)}` : "",
    ].filter(Boolean).join(" · ") || `${leadIds.length} selected people`,
  };
  const viewKey = text(input.view_key) || `lead-audience:${crypto.randomUUID()}`;
  const existing = (await service.entities.FounderSavedView.filter(
    { view_key: viewKey }, "-updated_at", 100,
  )).find((row: any) => row.is_current !== false) || null;
  if (existing && JSON.stringify(existing.config_json || {}) === JSON.stringify(configJson)) {
    return response({ ok: true, audience: compactLeadAudience(existing), idempotent: true });
  }
  const revision = existing ? number(existing.revision) + 1 : 1;
  const at = now();
  const saved = await service.entities.FounderSavedView.create({
    view_key: viewKey,
    name,
    view_type: "lead_audience",
    config_json: configJson,
    revision,
    is_current: true,
    previous_revision_id: existing?.id || null,
    immutable_config_hash: await sha256({ view_key: viewKey, revision, config_json: configJson }),
    created_by: user?.email || user?.id || "admin",
    created_at: at,
    updated_at: at,
  });
  if (existing) {
    await service.entities.FounderSavedView.update(existing.id, {
      is_current: false,
      updated_at: at,
    });
  }
  return response({ ok: true, audience: compactLeadAudience(saved), external_send_performed: false });
}

export async function handleDiscoveryV2Admin(
  service: any,
  user: any,
  body: any,
) {
  const action = text(body?.action).replace(/^discovery_v2_/, "");
  if (action === "overview") {
    return response(await buildOverview(service, body));
  }
  if (action === "capabilities") {
    const context = await plannerContext(service);
    return response({
      ok: true,
      version: DISCOVERY_CAPABILITY_VERSION,
      sources: DISCOVERY_SOURCE_REGISTRY,
      filters: DISCOVERY_FILTER_CATALOG,
      source_health: context.source_health,
      provider_usage: context.provider_usage,
    });
  }
  if (action === "people") return response(await peoplePortfolio(service, body));
  if (action === "audiences") return response(await listLeadAudiences(service));
  if (action === "save_audience") return saveLeadAudience(service, user, body);
  if (action === "plan") return response(await plan(service, body));
  if (action === "start") return startRun(service, user, body);
  if (action === "advance") {
    return response({
      ok: false,
      error: "client_driven_discovery_execution_removed",
      execution_owner: "BACKEND",
    }, 410);
  }
  if (action === "stop") {
    const run = await service.entities.DiscoveryExecutionRun.get(
      text(body.run_id),
    );
    if (!run) {
      return response({ ok: false, error: "discovery_run_not_found" }, 404);
    }
    if (terminalDiscoveryStatus(run.status)) {
      return response({
        ok: true,
        run: compactRun(run),
        already_terminal: true,
      });
    }
    const updated = await requestDiscoveryStop(service, run);
    return response({
      ok: true,
      run: compactRun(updated),
      outbound_effect: "NONE",
    });
  }
  if (action === "results") {
    const result = await listResults(service, body);
    return result instanceof Response ? result : response(result);
  }
  if (action === "runs") return response(await runList(service, body));
  if (action === "run") {
    const run = await service.entities.DiscoveryExecutionRun.get(
      text(body.run_id),
    );
    return run
      ? response({ ok: true, run, compact: compactRun(run) })
      : response({ ok: false, error: "discovery_run_not_found" }, 404);
  }
  if (action === "compare") return compareRuns(service, body);
  if (action === "saved_searches") {
    const viewRead = await readRuntimeRows({
      source: "discovery_v2_saved_searches",
      limit: 500,
      read: () => service.entities.FounderSavedView.filter(
        { view_type: "discovery_saved_search" }, "-updated_at", 500),
    });
    return response({
      ok: true,
      data_status: viewRead.status,
      source_coverage: runtimeSourceCoverage({ saved_searches: viewRead }),
      saved_searches: viewRead.value.filter((view: any) => view.is_current !== false)
        .map(compactSavedView),
    });
  }
  if (action === "save_search") return saveSearch(service, user, body);
  if (action === "pause_schedule") {
    const view = await service.entities.FounderSavedView.get(
      text(body.saved_view_id),
    );
    if (!view || view.view_type !== "discovery_saved_search") {
      return response({ ok: false, error: "saved_search_not_found" }, 404);
    }
    return saveSearch(service, user, {
      view_key: view.view_key,
      name: view.name,
      configuration: {
        ...(view.config_json || {}),
        schedule: {
          ...(view.config_json?.schedule || {}),
          status: "PAUSED",
          enabled: false,
        },
      },
      schedule: {
        ...(view.config_json?.schedule || {}),
        status: "PAUSED",
        enabled: false,
      },
    });
  }
  if (action === "result_action") return resultAction(service, body);
  if (action === "benchmark_preview") return benchmarkPreview(service, body);
  return response({ ok: false, error: "unknown_discovery_v2_action" }, 400);
}
