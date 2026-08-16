export const DISCOVERY_V2_ENGINE_VERSION = "discovery-v2-zero-waste-1.0.0";
export const DISCOVERY_CAPABILITY_VERSION =
  "discovery-source-capabilities-2026-08-12.1";

export const CAPABILITY_CLASS = Object.freeze({
  NATIVE_SEARCH_FILTER: "NATIVE_SEARCH_FILTER",
  NATIVE_RESULT_FIELD: "NATIVE_RESULT_FIELD",
  DERIVED_SIGNAL: "DERIVED_SIGNAL",
  PAID_ENRICHMENT_REQUIRED: "PAID_ENRICHMENT_REQUIRED",
  DEEP_RESEARCH_REQUIRED: "DEEP_RESEARCH_REQUIRED",
  MERCHANT_DATA_REQUIRED: "MERCHANT_DATA_REQUIRED",
  UNSUPPORTED: "UNSUPPORTED",
});

const F = CAPABILITY_CLASS;
const field = (
  label: string,
  classification: string,
  detail: string,
  sourceDependent = false,
) => ({ label, classification, detail, source_dependent: sourceDependent });

export const DISCOVERY_FILTER_CATALOG: any = Object.freeze({
  MERCHANT: {
    country: field(
      "Country",
      F.NATIVE_SEARCH_FILTER,
      "Native for supported lead sources.",
    ),
    industry: field(
      "Industry",
      F.NATIVE_SEARCH_FILTER,
      "Mapped to the selected source taxonomy.",
    ),
    company_size: field(
      "Company size",
      F.NATIVE_SEARCH_FILTER,
      "Employee ranges are source-native.",
    ),
    technology: field(
      "Technology / stack",
      F.NATIVE_SEARCH_FILTER,
      "Native where the source account exposes technology filters.",
      true,
    ),
    region: field(
      "Region / city",
      F.NATIVE_SEARCH_FILTER,
      "Precision depends on source geography.",
      true,
    ),
    revenue: field(
      "Revenue",
      F.NATIVE_SEARCH_FILTER,
      "Native for supported source/account plans.",
      true,
    ),
    business_model: field(
      "Business model",
      F.DERIVED_SIGNAL,
      "Evaluated locally from observed evidence.",
    ),
    sales_channel: field(
      "Sales channel",
      F.DERIVED_SIGNAL,
      "Derived after retrieval; not a reliable provider filter.",
    ),
    customer_type: field(
      "Customer type",
      F.DERIVED_SIGNAL,
      "Derived from observed company evidence.",
    ),
    presence: field(
      "Digital & physical presence",
      F.DERIVED_SIGNAL,
      "Omnichannel/physical presence is modeled with explicit confidence.",
    ),
    contact_availability: field(
      "Contact availability",
      F.PAID_ENRICHMENT_REQUIRED,
      "Professional contact verification is selective and late.",
    ),
    payment_stack: field(
      "Payment / POS stack",
      F.PAID_ENRICHMENT_REQUIRED,
      "Evaluated only after local pre-fit; source-dependent.",
    ),
    predicted_opportunity: field(
      "Predicted opportunity",
      F.DERIVED_SIGNAL,
      "A pre-merchant estimate, never verified savings.",
    ),
    actual_tpv: field(
      "Actual payment volume",
      F.MERCHANT_DATA_REQUIRED,
      "Requires merchant-connected or uploaded evidence.",
    ),
    effective_rate: field(
      "Actual effective rate",
      F.MERCHANT_DATA_REQUIRED,
      "Requires merchant payment data.",
    ),
    verified_savings: field(
      "Verified savings",
      F.MERCHANT_DATA_REQUIRED,
      "Cannot exist before merchant verification.",
    ),
    exclusions: field(
      "Exclusions",
      F.NATIVE_SEARCH_FILTER,
      "Applied at source when possible and always locally before enrichment.",
      true,
    ),
  },
  PARTNER: {
    partner_type: field(
      "Partner type",
      F.NATIVE_SEARCH_FILTER,
      "Organization keywords/types where supported.",
      true,
    ),
    country: field(
      "Partner location",
      F.NATIVE_SEARCH_FILTER,
      "Native geography where supported.",
    ),
    markets_served: field(
      "Markets served",
      F.DERIVED_SIGNAL,
      "Derived from public/canonical evidence.",
    ),
    client_portfolio: field(
      "Client portfolio",
      F.DEEP_RESEARCH_REQUIRED,
      "Reconstructed only for high-fit partners.",
    ),
    expertise: field(
      "Partner expertise",
      F.DERIVED_SIGNAL,
      "Derived from observed specialisms.",
    ),
    partner_size: field(
      "Partner size",
      F.NATIVE_RESULT_FIELD,
      "Available when the source returns organization size.",
      true,
    ),
    contacts: field(
      "Contacts",
      F.PAID_ENRICHMENT_REQUIRED,
      "Professional contact enrichment is selective and late.",
    ),
    partner_fit: field(
      "Partner fit",
      F.DERIVED_SIGNAL,
      "CAMBRA local deterministic scoring.",
    ),
    exclusions: field(
      "Exclusions",
      F.NATIVE_SEARCH_FILTER,
      "Applied locally before any paid research.",
      true,
    ),
  },
  PROVIDER: {
    mode: field(
      "New / refresh mode",
      F.DERIVED_SIGNAL,
      "Controls entity-safe gap-first workflow.",
    ),
    provider_type: field(
      "Provider type",
      F.NATIVE_RESULT_FIELD,
      "Canonical provider roles.",
    ),
    markets_served: field(
      "Markets served",
      F.NATIVE_RESULT_FIELD,
      "Canonical market and authorization evidence.",
    ),
    merchant_fit: field(
      "Merchant / customer fit",
      F.DERIVED_SIGNAL,
      "Derived from canonical product and merchant evidence.",
    ),
    capabilities: field(
      "Capabilities",
      F.NATIVE_RESULT_FIELD,
      "Canonical provider products/capabilities.",
    ),
    payment_methods: field(
      "Payment methods",
      F.NATIVE_RESULT_FIELD,
      "Available when canonical product evidence exists.",
    ),
    pricing: field(
      "Pricing / rate criteria",
      F.DEEP_RESEARCH_REQUIRED,
      "Gap-driven official/public research; never assumed.",
    ),
    authorization: field(
      "Authorization status",
      F.NATIVE_RESULT_FIELD,
      "Verified register facts where available.",
    ),
    integrations: field(
      "Integrations",
      F.NATIVE_RESULT_FIELD,
      "Observed canonical product evidence where available.",
    ),
    relevance: field(
      "Provider relevance",
      F.DERIVED_SIGNAL,
      "CAMBRA local relevance based on real merchant/provider data.",
    ),
    contacts: field(
      "Contacts",
      F.PAID_ENRICHMENT_REQUIRED,
      "Resolved only when decision value justifies it.",
    ),
  },
});

export const DISCOVERY_SOURCE_REGISTRY: any = Object.freeze({
  CAMBRA: {
    key: "CAMBRA",
    label: "CAMBRA intelligence",
    entity_types: ["MERCHANT", "PARTNER", "PROVIDER"],
    native_filters: [],
    capabilities: [
      "canonical_cache",
      "dedupe",
      "local_scoring",
      "evidence",
      "freshness",
    ],
    pricing_model: "NO_INCREMENTAL_EXTERNAL_COST",
    availability: "ACTIVE",
    evidence: "CAMBRA canonical entities",
    limitations: ["Only facts already observed or safely derived."],
  },
  APOLLO: {
    key: "APOLLO",
    label: "Apollo",
    entity_types: ["MERCHANT"],
    native_filters: [
      "country",
      "industry",
      "company_size",
      "technology",
    ],
    capabilities: [
      "company_search",
      "decision_maker_search",
      "selective_professional_profile",
    ],
    pricing_model: "CONFIGURED_CREDIT",
    availability: "RUNTIME_VERIFIED",
    evidence: "leadIntelligenceProvider.ts + provider diagnostic",
    expires_at: "2026-09-07T23:59:59.999Z",
    limitations: [
      "Account capabilities vary.",
      "Actual TPV, effective rates and verified savings are unavailable.",
    ],
  },
  INSTANTLY: {
    key: "INSTANTLY",
    label: "Instantly (contact source only)",
    entity_types: [],
    native_filters: [],
    capabilities: [
      "contact_search_after_contact_last_gate",
      "outbound_transport_is_a_separate_preserved_role",
    ],
    pricing_model: "PLAN_DEPENDENT",
    availability: "BLOCKED_CONTACT_PERSON_ONLY",
    evidence:
      "official SuperSearch filter contract uses location_mode=contact and returns lead/person rows",
    limitations: [
      "Not eligible for company-first Discovery AUTO or explicit company search.",
      "Instantly outbound transport remains supported and is not affected.",
    ],
  },
  PROVIDER_INTELLIGENCE: {
    key: "PROVIDER_INTELLIGENCE",
    label: "CAMBRA Provider Intelligence",
    entity_types: ["PROVIDER"],
    native_filters: [
      "provider_type",
      "markets_served",
      "capabilities",
      "payment_methods",
      "authorization",
      "integrations",
    ],
    capabilities: [
      "entity_resolution",
      "official_evidence",
      "pricing_versions",
      "authorization",
      "gap_detection",
    ],
    pricing_model: "NO_INCREMENTAL_EXTERNAL_COST",
    availability: "ACTIVE",
    evidence: "P2-P4 canonical provider graph",
    limitations: [
      "New open-web provider coverage is not implied.",
      "Research gaps may require a separately costed source.",
    ],
  },
});

const clean = (value: any) => String(value ?? "").trim();
const clamp = (value: any, min: number, max: number, fallback: number) =>
  Number.isFinite(Number(value))
    ? Math.max(min, Math.min(max, Math.floor(Number(value))))
    : fallback;
const stable = (value: any): string =>
  Array.isArray(value)
    ? `[${value.map(stable).join(",")}]`
    : value && typeof value === "object"
    ? `{${
      Object.keys(value).sort().map((key) =>
        `${JSON.stringify(key)}:${stable(value[key])}`
      ).join(",")
    }}`
    : JSON.stringify(value);
function smallHash(value: any) {
  let hash = 2166136261;
  const input = stable(value);
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `dvp-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
const list = (value: any, max = 100) =>
  [
    ...new Set(
      (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean),
    ),
  ].slice(0, max);

export function interpretDiscoveryIntent(
  textValue: any,
  discoveryType = "MERCHANT",
) {
  const text = clean(textValue);
  const lower = text.toLowerCase();
  const filters: any = {};
  const countries: any = [
    ["FR", /\b(france|french|français|francés|francia)\b/i],
    ["ES", /\b(spain|spanish|españa|español)\b/i],
    ["DE", /\b(germany|german|alemania|allemagne)\b/i],
    ["IT", /\b(italy|italian|italia|italie)\b/i],
    ["PT", /\b(portugal|portuguese|portugais)\b/i],
    ["NL", /\b(netherlands|dutch|países bajos|pays-bas)\b/i],
    ["BE", /\b(belgium|belgique|bélgica)\b/i],
  ];
  const matched = countries.filter(([, pattern]: any) => pattern.test(text))
    .map(([code]: any) => code);
  if (matched.length) filters.country = matched;
  const technologies = [
    "shopify",
    "woocommerce",
    "magento",
    "bigcommerce",
    "prestashop",
    "adyen",
    "stripe",
    "sumup",
    "mollie",
  ];
  const foundTech = technologies.filter((technology) =>
    lower.includes(technology)
  );
  if (foundTech.length) filters.technology = foundTech;
  const industries = [
    "beauty",
    "cosmetics",
    "fashion",
    "retail",
    "ecommerce",
    "hospitality",
    "travel",
    "food",
    "wellness",
  ];
  const foundIndustries = industries.filter((industry) =>
    lower.includes(industry)
  );
  if (foundIndustries.length) filters.industry = foundIndustries;
  if (
    /omnichannel|omni-channel|online and (physical|store)|ecommerce y tienda/i
      .test(lower)
  ) filters.sales_channel = ["omnichannel"];
  const targetMatch = lower.match(
    /\b(\d{1,4})\b(?=.{0,80}\b(?:companies|merchants|partners|providers|leads|empresas|comercios|proveedores|socios)\b)/,
  );
  const target = targetMatch ? clamp(targetMatch[1], 1, 1000, 100) : null;
  if (clean(discoveryType).toUpperCase() === "PARTNER") {
    if (/account|comptable|contable/i.test(lower)) {
      filters.partner_type = ["accounting_firm"];
    } else if (/agency|agence|agencia/i.test(lower)) {
      filters.partner_type = ["ecommerce_agency"];
    } else if (/cfo/i.test(lower)) filters.partner_type = ["fractional_cfo"];
  }
  if (clean(discoveryType).toUpperCase() === "PROVIDER") {
    if (/refresh|update|actualiza|mettre à jour/i.test(lower)) {
      filters.mode = "REFRESH";
    }
  }
  return {
    filters,
    target_count: target,
    unparsed_text: text,
    interpretation_method: "DETERMINISTIC_NO_PAID_AI",
  };
}

export function normalizeDiscoveryConfiguration(input: any = {}) {
  const discoveryType = ["MERCHANT", "PARTNER", "PROVIDER"].includes(
      clean(input.discovery_type).toUpperCase(),
    )
    ? clean(input.discovery_type).toUpperCase()
    : "MERCHANT";
  const sourceMode = clean(input.source_mode || "AUTO").toUpperCase();
  const interpreted = interpretDiscoveryIntent(
    input.natural_language,
    discoveryType,
  );
  const filters: any = { ...interpreted.filters };
  for (const [key, value] of Object.entries(input.filters || {})) {
    if (Array.isArray(value)) {
      const values = list(value);
      if (values.length) filters[key] = values;
    } else if (
      typeof value === "boolean" ||
      Number.isFinite(Number(value)) && value !== "" || clean(value)
    ) filters[key] = typeof value === "string" ? clean(value) : value;
  }
  return {
    discovery_type: discoveryType,
    name: clean(input.name) ||
      `${discoveryType[0]}${discoveryType.slice(1).toLowerCase()} Discovery`,
    natural_language: clean(input.natural_language).slice(0, 1000),
    intent_interpretation: interpreted,
    filters,
    source_mode: sourceMode,
    target_count: clamp(
      input.target_count ?? interpreted.target_count,
      1,
      1000,
      100,
    ),
    hard_cap_minor: clamp(input.hard_cap_minor, 0, 100000, 0),
    enrichment_policy: ["NONE", "SELECTIVE", "HIGH_FIT_ONLY"].includes(
        clean(input.enrichment_policy).toUpperCase(),
      )
      ? clean(input.enrichment_policy).toUpperCase()
      : "SELECTIVE",
    high_fit_threshold: clamp(input.high_fit_threshold, 1, 100, 70),
    only_new: input.only_new !== false,
    provider_mode: ["NEW", "REFRESH", "NEW_AND_EXISTING"].includes(
        clean(input.provider_mode).toUpperCase(),
      )
      ? clean(input.provider_mode).toUpperCase()
      : "NEW_AND_EXISTING",
    exclusions: list(input.exclusions, 100),
  };
}

function sourceAvailable(key: string, context: any) {
  const state = context?.source_health?.[key] || {};
  if (key === "CAMBRA" || key === "PROVIDER_INTELLIGENCE") return true;
  if (
    key === "INSTANTLY" &&
    (state.contact_person_only === true ||
      state.company_search_supported !== true)
  ) return false;
  return state.available === true ||
    ["ACTIVE", "AUTHENTICATED"].includes(clean(state.status).toUpperCase());
}
function nativeCompatibility(
  source: string,
  type: string,
  filterKeys: string[],
) {
  const registry = DISCOVERY_SOURCE_REGISTRY[source];
  if (!registry?.entity_types?.includes(type)) return 0;
  return filterKeys.filter((key) => registry.native_filters.includes(key))
    .length;
}

const SOURCE_PARTITION_FIELDS = Object.freeze([
  "country",
  "industry",
  "company_size",
  "technology",
]);
const LOCAL_FILTERS: Record<string, ReadonlySet<string>> = Object.freeze({
  MERCHANT: new Set([
    "country",
    "industry",
    "company_size",
    "technology",
    "revenue",
    "exclusions",
  ]),
  PARTNER: new Set(["country", "partner_type", "expertise", "exclusions"]),
  PROVIDER: new Set([
    "provider_type",
    "capabilities",
    "markets_served",
  ]),
});

/**
 * Produces the exact provider calls represented by an accepted plan. Every
 * selected value is preserved. An oversized cartesian product is blocked,
 * never silently truncated.
 */
export function buildDiscoveryPartitions(config: any, source: string) {
  if (!["APOLLO", "INSTANTLY"].includes(clean(source).toUpperCase())) {
    return {
      partitions: [{ key: "canonical", filters: {} }],
      requested_count: 1,
      limit: 64,
      overflow: false,
    };
  }
  const dimensions = SOURCE_PARTITION_FIELDS.map((key) => ({
    key,
    values: list(config?.filters?.[key]).length
      ? list(config.filters[key])
      : [null],
  }));
  const requestedCount = dimensions.reduce(
    (total, dimension) => total * dimension.values.length,
    1,
  );
  if (requestedCount > 64) {
    return {
      partitions: [],
      requested_count: requestedCount,
      limit: 64,
      overflow: true,
    };
  }
  let partitions: any[] = [{ filters: {} }];
  for (const dimension of dimensions) {
    partitions = partitions.flatMap((partition) =>
      dimension.values.map((value) => ({
        filters: value === null
          ? partition.filters
          : { ...partition.filters, [dimension.key]: value },
      }))
    );
  }
  return {
    partitions: partitions.map((partition, index) => ({
      ...partition,
      key: `partition-${index + 1}-${smallHash(partition.filters)}`,
    })),
    requested_count: requestedCount,
    limit: 64,
    overflow: false,
  };
}

function executionStatus(
  config: any,
  sourceKey: string,
  key: string,
  effective: string,
) {
  const source = DISCOVERY_SOURCE_REGISTRY[sourceKey];
  if (
    source?.native_filters?.includes(key) &&
    ["APOLLO", "INSTANTLY"].includes(sourceKey)
  ) return "APPLIED_NATIVE";
  if (LOCAL_FILTERS[config.discovery_type]?.has(key)) return "APPLIED_LOCAL";
  if (effective === F.MERCHANT_DATA_REQUIRED) {
    return "REQUIRES_MERCHANT_DATA";
  }
  if (
    effective === F.PAID_ENRICHMENT_REQUIRED ||
    effective === F.DEEP_RESEARCH_REQUIRED
  ) return "NOT_APPLIED_PAID_CAPABILITY_UNAVAILABLE";
  return "NOT_APPLIED";
}

export function selectDiscoverySource(config: any, context: any = {}) {
  const requested = clean(config.source_mode || "AUTO").toUpperCase();
  const keys = config.discovery_type === "PROVIDER"
    ? ["PROVIDER_INTELLIGENCE"]
    : config.discovery_type === "PARTNER"
    ? ["CAMBRA"]
    : ["APOLLO", "INSTANTLY", "CAMBRA"];
  if (requested !== "AUTO") {
    const normalized = requested === "INSTANTLY_SUPERSEARCH"
      ? "INSTANTLY"
      : requested;
    if (!keys.includes(normalized)) {
      return {
        selected: "CAMBRA",
        reason:
          `${normalized.toLowerCase()}_does_not_support_${config.discovery_type.toLowerCase()}_in_current_adapter`,
        fallback: true,
      };
    }
    if (!sourceAvailable(normalized, context)) {
      const state = context?.source_health?.[normalized] || {};
      return {
        selected: "CAMBRA",
        reason: state.blocker_code ||
          `${normalized.toLowerCase()}_not_runtime_available`,
        fallback: true,
      };
    }
    return {
      selected: normalized,
      reason: "founder_selected_available_source",
      fallback: false,
    };
  }
  const filterKeys = Object.keys(config.filters || {});
  const ranked = keys.map((key) => ({
    key,
    available: sourceAvailable(key, context),
    native: nativeCompatibility(key, config.discovery_type, filterKeys),
    historical: Number(
      context?.source_performance?.[key]?.high_fit_per_eur || 0,
    ),
    cost: Number(context?.unit_cost_minor?.[key] || 0),
  })).filter((row) => row.available).sort((a, b) =>
    b.native - a.native || b.historical - a.historical || a.cost - b.cost
  );
  return ranked[0]
    ? {
      selected: ranked[0].key,
      reason: ranked[0].key === "CAMBRA"
        ? "canonical_intelligence_is_cheapest_sufficient_source"
        : "best_native_coverage_within_runtime_availability",
      fallback: false,
    }
    : { selected: null, reason: "no_available_source", fallback: true };
}

export function planDiscoveryQuery(input: any = {}, context: any = {}) {
  const config = normalizeDiscoveryConfiguration(input);
  const catalog = DISCOVERY_FILTER_CATALOG[config.discovery_type] || {};
  const selected = selectDiscoverySource(config, context);
  const selectedSource = selected.selected || "";
  const classifications = Object.entries(config.filters).map(([key, value]) => {
    const definition = catalog[key] ||
      field(key, F.UNSUPPORTED, "No canonical execution capability exists.");
    let effective = definition.classification;
    const source = DISCOVERY_SOURCE_REGISTRY[selectedSource];
    if (
      effective === F.NATIVE_SEARCH_FILTER &&
      !source?.native_filters?.includes(key)
    ) {
      effective = definition.source_dependent
        ? F.PAID_ENRICHMENT_REQUIRED
        : F.DERIVED_SIGNAL;
    }
    const status = executionStatus(
      config,
      selectedSource,
      key,
      effective,
    );
    return {
      field: key,
      value,
      requested_values: list(value),
      match_semantics: "ANY_OF",
      label: definition.label,
      requested_classification: definition.classification,
      effective_classification: effective,
      execution_status: status,
      execution_stage: status === "APPLIED_NATIVE"
        ? "NATIVE_DISCOVERY"
        : status === "APPLIED_LOCAL"
        ? "LOCAL_PREFIT"
        : null,
      detail: definition.detail,
    };
  });
  const counts = Object.values(F).reduce(
    (
      output: any,
      key,
    ) => (output[key] = classifications.filter((row) =>
      row.effective_classification === key
    ).length,
      output),
    {},
  );
  const paidDimensions = counts[F.PAID_ENRICHMENT_REQUIRED] +
    counts[F.DEEP_RESEARCH_REQUIRED];
  const merchantOnly = counts[F.MERCHANT_DATA_REQUIRED];
  const paidSource = Boolean(
    selectedSource && ["APOLLO", "INSTANTLY"].includes(selectedSource),
  );
  const partitionPlan = buildDiscoveryPartitions(config, selectedSource);
  const searchCreditUnitsEstimated = paidSource
    ? partitionPlan.requested_count
    : 0;
  const searchUnitMinor = paidSource
    ? Math.max(
      0,
      Number(
        context?.unit_cost_minor?.[selectedSource] ??
          context?.estimated_api_unit_minor ?? 0,
      ),
    )
    : 0;
  const searchMinor = searchUnitMinor * searchCreditUnitsEstimated;
  const selectiveTarget = Math.min(
    config.target_count,
    Math.max(0, Math.ceil(config.target_count * .25)),
  );
  const enrichmentUnit = Math.max(
    0,
    Number(context?.estimated_enrichment_unit_minor || 0),
  );
  const enrichmentBudget = Math.max(0, config.hard_cap_minor - searchMinor);
  const enrichmentMinor =
    config.enrichment_policy === "NONE" || config.hard_cap_minor === 0
      ? 0
      : Math.min(
        enrichmentBudget,
        paidDimensions ? selectiveTarget * enrichmentUnit : 0,
      );
  const estimatedMinor = searchMinor + enrichmentMinor;
  const stages = [{ key: "PLAN", label: "Query planning", paid: false }, {
    key: "NATIVE_DISCOVERY",
    label: "Native / cheap discovery",
    paid: searchMinor > 0,
  }, {
    key: "LOCAL_PREFIT",
    label: "Dedupe, exclusions & local pre-fit",
    paid: false,
  }, {
    key: "SELECTIVE_COMPANY_ENRICHMENT",
    label: "Selective company enrichment",
    paid: enrichmentMinor > 0,
    enabled: config.enrichment_policy !== "NONE" && config.hard_cap_minor > 0,
  }, {
    key: "SELECTIVE_CONTACT_ENRICHMENT",
    label: "Contacts for High Fit only",
    paid: enrichmentMinor > 0,
    enabled: config.enrichment_policy === "HIGH_FIT_ONLY" &&
      config.hard_cap_minor > 0,
  }, {
    key: "DEEP_RESEARCH",
    label: "Gap-driven deep research",
    paid: true,
    enabled: false,
  }, {
    key: "MERCHANT_VERIFICATION",
    label: "Merchant verification",
    paid: false,
    enabled: false,
  }];
  const limitations: string[] = [];
  if (!selected.selected) {
    limitations.push("No runtime-available source can execute this search.");
  }
  if (selected.fallback) {
    limitations.push(
      `Requested source was not usable: ${selected.reason}. CAMBRA will not fabricate coverage.`,
    );
  }
  if (merchantOnly) {
    limitations.push(
      `${merchantOnly} requested field${
        merchantOnly === 1 ? " requires" : "s require"
      } merchant-connected evidence and cannot be verified by Discovery.`,
    );
  }
  if (paidDimensions && config.hard_cap_minor === 0) {
    limitations.push(
      "Paid enrichment is disabled because the per-run hard cap is €0.",
    );
  }
  if (searchMinor > config.hard_cap_minor) {
    limitations.push(
      `The estimated native search cost (${searchMinor} minor units) exceeds the per-run hard cap. Execution remains fail-closed.`,
    );
  }
  if (partitionPlan.requested_count > 1 && paidSource) {
    limitations.push(
      `${partitionPlan.requested_count} provider partitions are costed separately; every selected native-filter value remains visible in the accepted plan.`,
    );
  }
  if (partitionPlan.overflow) {
    limitations.push(
      `The requested native-filter cartesian product requires ${partitionPlan.requested_count} provider calls, above the safe limit of ${partitionPlan.limit}. Narrow the filters; CAMBRA will not truncate selected values.`,
    );
  }
  const unapplied = classifications.filter((row) =>
    !String(row.execution_status).startsWith("APPLIED_")
  );
  if (unapplied.length) {
    limitations.push(
      `${unapplied.length} requested filter${
        unapplied.length === 1 ? " is" : "s are"
      } not executable by the accepted source/runtime. They remain visible as Not applied and never become a hidden claim.`,
    );
  }
  if (config.discovery_type === "PARTNER") {
    limitations.push(
      "The current safe Partner adapter is canonical/cache-first; the legacy worker is never invoked because it can send outreach.",
    );
  }
  if (config.discovery_type === "PROVIDER") {
    limitations.push(
      "Provider discovery is gap-first. Open-web completeness is not implied by the canonical provider graph.",
    );
  }
  const expectedUnique = config.only_new
    ? {
      min: Math.floor(config.target_count * .45),
      max: Math.floor(config.target_count * .85),
    }
    : { min: Math.floor(config.target_count * .65), max: config.target_count };
  const expectedHighFit = {
    min: Math.floor(expectedUnique.min * .12),
    max: Math.ceil(expectedUnique.max * .35),
  };
  const plan: any = {
    engine_version: DISCOVERY_V2_ENGINE_VERSION,
    source_capability_version: DISCOVERY_CAPABILITY_VERSION,
    configuration: config,
    selected_source: selected.selected,
    source_selection_reason: selected.reason,
    classification: classifications,
    filter_execution_contract: {
      semantics: "AND_BETWEEN_FIELDS_ANY_WITHIN_FIELD",
      requested: classifications.length,
      applied:
        classifications.filter((row) =>
          String(row.execution_status).startsWith("APPLIED_")
        ).length,
      unapplied: unapplied.length,
      rows: classifications,
    },
    source_partitions: partitionPlan.partitions,
    execution_blockers: partitionPlan.overflow
      ? ["SOURCE_PARTITION_LIMIT_EXCEEDED"]
      : [],
    coverage: {
      requested: classifications.length,
      native: counts[F.NATIVE_SEARCH_FILTER],
      derived: counts[F.DERIVED_SIGNAL] + counts[F.NATIVE_RESULT_FIELD],
      paid: paidDimensions,
      merchant_only: merchantOnly,
      unsupported: counts[F.UNSUPPORTED],
    },
    stages,
    expected_funnel: {
      source_matches: "UNKNOWN_UNLESS_PROVIDER_PREVIEW_AVAILABLE",
      target: config.target_count,
      unique: expectedUnique,
      high_fit: expectedHighFit,
      enrichment_candidates: config.enrichment_policy === "NONE"
        ? { min: 0, max: 0 }
        : { min: 0, max: selectiveTarget },
    },
    cost: {
      currency: "EUR",
      search_minor: searchMinor,
      selective_enrichment_minor: enrichmentMinor,
      estimated_minor: estimatedMinor,
      estimated_min_minor: searchMinor,
      estimated_max_minor: estimatedMinor,
      search_credit_units_estimated: searchCreditUnitsEstimated,
      search_partitions: paidSource ? partitionPlan.requested_count : 0,
      hard_cap_minor: config.hard_cap_minor,
      monthly_remaining_minor: Math.max(
        0,
        Number(context?.monthly_remaining_minor || 0),
      ),
      estimation_quality: searchMinor || enrichmentMinor
        ? "CONFIGURED_CONSERVATIVE"
        : "NO_INCREMENTAL_EXTERNAL_COST_OR_UNKNOWN",
      estimation_note: paidSource
        ? `Estimated from ${partitionPlan.requested_count} provider partition${
          partitionPlan.requested_count === 1 ? "" : "s"
        }, configured provider operation cost and selective enrichment policy. Actual provider credits remain provider-plan dependent.`
        : "No incremental external source cost is configured for this canonical search; optional later research is not silently included.",
    },
    limitations,
    requires_explicit_acceptance: true,
    outbound_effect: "NONE",
  };
  plan.plan_fingerprint = smallHash({
    engine_version: plan.engine_version,
    source_capability_version: plan.source_capability_version,
    configuration: plan.configuration,
    selected_source: plan.selected_source,
    cost: plan.cost,
    stages: plan.stages,
  });
  return plan;
}

export function classifyDiscoveryScore(score: any, threshold = 70) {
  if (score === null || score === undefined || score === "") return "UNKNOWN";
  const value = Number(score);
  if (!Number.isFinite(value)) return "UNKNOWN";
  return value >= threshold
    ? "HIGH"
    : value >= Math.max(40, threshold - 25)
    ? "MEDIUM"
    : "LOW";
}
export function terminalDiscoveryStatus(status: any) {
  return [
    "COMPLETED",
    "COMPLETED_PARTIAL",
    "BUDGET_STOPPED",
    "FOUNDER_STOPPED",
    "SOURCE_LIMITED",
    "FAILED",
    "NEEDS_REVIEW",
  ].includes(clean(status).toUpperCase());
}
