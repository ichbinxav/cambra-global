import { redactSecrets } from "./internalSecret.ts";

export const SPEND_INTELLIGENCE_RUNTIME_VERSION = "spend-intelligence-2.1.0";
export const SCORE_ENGINE_VERSION = "1.0.0";
export const MAX_SPEND_FINDINGS = 100;
export const MAX_MONTHLY_EUR = 1_000_000_000_000;
export const MAX_MONTHLY_SHIPMENTS = 1_000_000_000_000;

const EU_COUNTRIES = new Set([
  "France", "Germany", "Spain", "Italy", "Netherlands", "Belgium",
  "Portugal", "Sweden", "Denmark", "Finland", "Norway", "Austria",
  "Switzerland", "Ireland", "Poland", "Czech Republic", "Romania",
  "Hungary", "Greece", "Luxembourg", "Malta", "Cyprus", "Slovakia",
  "Slovenia", "Croatia", "Estonia", "Latvia", "Lithuania", "Bulgaria",
]);
// Canonical country names accepted by the Brand country selector, plus the
// legacy scoreEngine spelling for Czech Republic. Unknown/typo values must not
// silently select the non-EU tariff.
const KNOWN_COUNTRIES = new Set([
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola",
  "Antigua and Barbuda", "Argentina", "Armenia", "Australia", "Austria",
  "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus",
  "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria",
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada",
  "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros",
  "Congo (Congo-Brazzaville)", "Costa Rica", "Cote d’Ivoire", "Croatia", "Cuba",
  "Cyprus", "Czechia", "Czech Republic", "Democratic Republic of the Congo",
  "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini",
  "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia",
  "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea",
  "Guinea-Bissau", "Guyana", "Haiti", "Honduras", "Hungary", "Iceland",
  "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy",
  "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya",
  "Liechtenstein", "Lithuania", "Luxembourg", "Madagascar", "Malawi",
  "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania",
  "Mauritius", "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia",
  "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria",
  "North Korea", "North Macedonia", "Norway", "Oman", "Pakistan", "Palau",
  "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland",
  "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis",
  "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino",
  "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles",
  "Sierra Leone", "Singapore", "Slovakia", "Slovenia", "Solomon Islands",
  "Somalia", "South Africa", "South Korea", "South Sudan", "Spain", "Sri Lanka",
  "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan",
  "Tanzania", "Thailand", "Timor-Leste", "Togo", "Tonga",
  "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda",
  "Ukraine", "United Arab Emirates", "United Kingdom", "United States", "Uruguay",
  "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen",
  "Zambia", "Zimbabwe",
]);
const SPEND_VERTICALS = new Set([
  "payments",
  "shipping",
  "saas_commerce",
  "saas_marketing",
  "saas_analytics",
  "saas_support",
  "saas_finance",
  "saas_hr",
  "other",
]);
const SAFE_OPAQUE_ID = /^[a-zA-Z0-9_][a-zA-Z0-9._:/-]{0,159}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const encoder = new TextEncoder();
const FAILURE_SOURCE_TYPES = new Set([
  "brand",
  "discovery_task",
  "analyzer_input",
  "unknown",
]);
const FAILURE_SHAPE_STATUSES = new Set([
  "ARRAY_WITHIN_LIMIT",
  "ARRAY_OVER_LIMIT",
  "NOT_ARRAY",
  "NOT_OBSERVED",
]);
const FAILURE_CURRENCY_STATUSES = new Set([
  "EUR",
  "MISSING",
  "NON_EUR",
  "INVALID_TYPE",
  "NOT_OBSERVED",
]);
const FAILURE_PRESENT_FIELDS = new Set([
  "country",
  "findings",
  "currency",
  "monthly_revenue",
  "payment_provider",
  "shipping_provider",
  "monthly_shipping_cost",
  "monthly_shipments",
  "saas_tools",
]);

export class SpendIntelligenceValidationError extends Error {
  code: string;
  status = 409;
  review_required = true;
  automatic_retry_blocked = true;

  constructor(code: string) {
    super(code.toLowerCase());
    this.name = "SpendIntelligenceValidationError";
    this.code = code;
  }
}

function review(code: string): never {
  throw new SpendIntelligenceValidationError(code);
}

function exactSafeText(value: unknown, field: string, maxChars: number) {
  if (typeof value !== "string" || value.length === 0 ||
    value !== value.trim() || value.length > maxChars ||
    encoder.encode(value).length > maxChars * 2 || CONTROL_CHARACTER.test(value) ||
    redactSecrets(value) !== value) {
    review(`SPEND_INTELLIGENCE_${field.toUpperCase()}_INVALID`);
  }
  return value;
}

export function validateSpendCountry(value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  const country = exactSafeText(value, "brand_country", 80);
  if (!KNOWN_COUNTRIES.has(country)) {
    review("SPEND_INTELLIGENCE_BRAND_COUNTRY_UNKNOWN");
  }
  return country === "Czechia" ? "Czech Republic" : country;
}

export function validateSpendFindings(value: unknown) {
  if (!Array.isArray(value) || value.length > MAX_SPEND_FINDINGS) {
    review("SPEND_INTELLIGENCE_DISCOVERY_OUTPUT_INVALID");
  }
  const normalizedTools = new Set<string>();
  const matchedCatalogIds = new Set<string>();
  const findings = value.map((finding: any) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      review("SPEND_INTELLIGENCE_DISCOVERY_OUTPUT_INVALID");
    }
    const tool = exactSafeText(finding.tool, "tool", 120);
    const vertical = exactSafeText(finding.vertical, "vertical", 40);
    if (!SPEND_VERTICALS.has(vertical)) {
      review("SPEND_INTELLIGENCE_VERTICAL_INVALID");
    }
    if (
      typeof finding.confidence !== "number" ||
      !Number.isFinite(finding.confidence) || finding.confidence < 0 ||
      finding.confidence > 1
    ) review("SPEND_INTELLIGENCE_CONFIDENCE_INVALID");
    let matchedCatalogId: string | null = null;
    if (finding.matched_catalog_id !== undefined &&
      finding.matched_catalog_id !== null && finding.matched_catalog_id !== "") {
      if (typeof finding.matched_catalog_id !== "string" ||
        !SAFE_OPAQUE_ID.test(finding.matched_catalog_id) ||
        redactSecrets(finding.matched_catalog_id) !== finding.matched_catalog_id) {
        review("SPEND_INTELLIGENCE_MATCHED_CATALOG_ID_INVALID");
      }
      matchedCatalogId = finding.matched_catalog_id;
    }
    const normalizedTool = tool.toLocaleLowerCase("en-US");
    if (normalizedTools.has(normalizedTool)) {
      review("SPEND_INTELLIGENCE_DUPLICATE_TOOL_AMBIGUOUS");
    }
    normalizedTools.add(normalizedTool);
    if (matchedCatalogId !== null) {
      const normalizedCatalogId = matchedCatalogId.toLocaleLowerCase("en-US");
      if (matchedCatalogIds.has(normalizedCatalogId)) {
        review("SPEND_INTELLIGENCE_DUPLICATE_CATALOG_ID_AMBIGUOUS");
      }
      matchedCatalogIds.add(normalizedCatalogId);
    }
    return {
      tool,
      vertical,
      matched_catalog_id: matchedCatalogId,
      confidence: finding.confidence,
    };
  });
  if (encoder.encode(JSON.stringify(findings)).length > 32 * 1024) {
    review("SPEND_INTELLIGENCE_DISCOVERY_OUTPUT_TOO_LARGE");
  }
  return findings;
}

function optionalNonNegativeNumber(
  input: any,
  field: string,
  maxValue = MAX_MONTHLY_EUR,
) {
  if (!Object.prototype.hasOwnProperty.call(input, field) ||
    input[field] === null || input[field] === "") return null;
  if (typeof input[field] !== "number" || !Number.isFinite(input[field]) ||
    input[field] < 0 || input[field] > maxValue) {
    review(`SPEND_INTELLIGENCE_ANALYZER_${field.toUpperCase()}_INVALID`);
  }
  return input[field];
}

export function requireEurSpendAnalyzerInput(value: any) {
  if (!value || typeof value !== "object") {
    review("SPEND_INTELLIGENCE_ANALYZER_INPUT_REQUIRED");
  }
  if (value.currency !== "EUR") {
    review(value.currency === undefined || value.currency === null || value.currency === ""
      ? "SPEND_INTELLIGENCE_ANALYZER_CURRENCY_REQUIRED"
      : "SPEND_INTELLIGENCE_ANALYZER_CURRENCY_NOT_EUR");
  }
  if (!Object.prototype.hasOwnProperty.call(value, "monthly_revenue") ||
    typeof value.monthly_revenue !== "number" ||
    !Number.isFinite(value.monthly_revenue) || value.monthly_revenue < 0 ||
    value.monthly_revenue > MAX_MONTHLY_EUR) {
    review("SPEND_INTELLIGENCE_ANALYZER_MONTHLY_REVENUE_INVALID");
  }

  const monthlyShippingCost = optionalNonNegativeNumber(
    value,
    "monthly_shipping_cost",
  );
  const monthlyShipments = optionalNonNegativeNumber(
    value,
    "monthly_shipments",
    MAX_MONTHLY_SHIPMENTS,
  );
  const shippingProvider = value.shipping_provider === undefined ||
      value.shipping_provider === null || value.shipping_provider === ""
    ? null
    : exactSafeText(value.shipping_provider, "shipping_provider", 120);
  const paymentProvider = value.payment_provider === undefined ||
      value.payment_provider === null || value.payment_provider === ""
    ? null
    : exactSafeText(value.payment_provider, "payment_provider", 120);

  let saasTools: Array<{ name: string; monthly_cost: number }> = [];
  if (value.saas_tools !== undefined && value.saas_tools !== null) {
    if (!Array.isArray(value.saas_tools) || value.saas_tools.length > 100) {
      review("SPEND_INTELLIGENCE_ANALYZER_SAAS_TOOLS_INVALID");
    }
    const names = new Set<string>();
    saasTools = value.saas_tools.map((tool: any) => {
      if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
        review("SPEND_INTELLIGENCE_ANALYZER_SAAS_TOOLS_INVALID");
      }
      const name = exactSafeText(tool.name, "saas_tool_name", 120);
      const key = name.toLocaleLowerCase("en-US");
      if (names.has(key)) {
        review("SPEND_INTELLIGENCE_ANALYZER_SAAS_TOOL_AMBIGUOUS");
      }
      names.add(key);
      if (typeof tool.monthly_cost !== "number" ||
        !Number.isFinite(tool.monthly_cost) || tool.monthly_cost < 0 ||
        tool.monthly_cost > MAX_MONTHLY_EUR) {
        review("SPEND_INTELLIGENCE_ANALYZER_SAAS_COST_INVALID");
      }
      return { name, monthly_cost: tool.monthly_cost };
    });
  }

  return {
    id: String(value.id || ""),
    currency: "EUR" as const,
    monthly_revenue: value.monthly_revenue,
    monthly_shipping_cost: monthlyShippingCost,
    monthly_shipments: monthlyShipments,
    payment_provider: paymentProvider,
    shipping_provider: shippingProvider,
    saas_tools: saasTools,
  };
}

function revenueTier(monthlyRevenue: number) {
  if (monthlyRevenue >= 500000) return "large";
  if (monthlyRevenue >= 100000) return "mid";
  if (monthlyRevenue >= 30000) return "small";
  return "micro";
}

// Mirror of scoreEngine.getBenchmarks (v1.0.0). The registry stays synced,
// but each estimate below declares exactly which entry it actually applied.
export function getSpendBenchmarks(monthlyRevenue = 0, country = "") {
  const tier = revenueTier(monthlyRevenue);
  const eu = EU_COUNTRIES.has(country);
  return {
    tier,
    eu,
    payment: ({
      micro: { rate: eu ? 2.4 : 2.9 },
      small: { rate: eu ? 2.2 : 2.6 },
      mid:   { rate: eu ? 1.9 : 2.3 },
      large: { rate: eu ? 1.6 : 1.9 },
    })[tier],
    shipping: ({
      micro: { perUnit: eu ? 5.80 : 7.20 },
      small: { perUnit: eu ? 5.20 : 6.50 },
      mid:   { perUnit: eu ? 4.60 : 5.80 },
      large: { perUnit: eu ? 3.90 : 4.80 },
    })[tier],
    saas: ({
      micro: { pct: 0.060 },
      small: { pct: 0.040 },
      mid:   { pct: 0.025 },
      large: { pct: 0.015 },
    })[tier],
  };
}

function confidenceLabel(value: number, known: boolean) {
  if (!known || value < 0.9) return "low";
  return "high";
}

function unknownEstimate(finding: any, reason: string) {
  return {
    tool: finding.tool,
    vertical: finding.vertical,
    matched_catalog_id: finding.matched_catalog_id,
    estimated_spend_monthly: null,
    estimated_spend_annual: null,
    basis: reason,
    confidence: "low",
    detection_confidence: finding.confidence,
    estimate_method: "UNAVAILABLE",
    source_refs: [],
  };
}

export function buildSpendEstimates(input: {
  findings: any[];
  analyzerInput: ReturnType<typeof requireEurSpendAnalyzerInput>;
  analyzerInputId: string;
  country?: string;
}) {
  const country = validateSpendCountry(input.country);
  const bm = getSpendBenchmarks(
    input.analyzerInput.monthly_revenue,
    country,
  );
  const normalizedProvider = input.analyzerInput.shipping_provider
    ?.toLocaleLowerCase("en-US") || null;
  const normalizedPaymentProvider = input.analyzerInput.payment_provider
    ?.toLocaleLowerCase("en-US") || null;
  const countryKnown = country.length > 0;
  const saasByName = new Map(input.analyzerInput.saas_tools.map((tool) => [
    tool.name.toLocaleLowerCase("en-US"),
    tool,
  ]));
  let paymentApplied = false;
  let shippingComparatorApplied = false;

  const estimates = input.findings.map((finding) => {
    let monthly: number | null = null;
    let basis = "";
    let estimateMethod = "UNAVAILABLE";
    let sourceRefs: Array<{ type: string; id: string; version?: string }> = [];

    if (finding.vertical === "payments") {
      const providerMatches = normalizedPaymentProvider !== null &&
        finding.tool.toLocaleLowerCase("en-US") === normalizedPaymentProvider;
      if (!providerMatches || !countryKnown) {
        return unknownEstimate(
          finding,
          "Payment spend unavailable: requires an exact AnalyzerInput.payment_provider match and an observed Brand country for the regional benchmark.",
        );
      }
      monthly = Math.round(
        input.analyzerInput.monthly_revenue * (bm.payment.rate / 100),
      );
      paymentApplied = true;
      basis = `scoreEngine payment benchmark ${bm.payment.rate.toFixed(2)}% applied to observed EUR monthly revenue.`;
      estimateMethod = "SCORE_ENGINE_PAYMENT_RATE";
      sourceRefs = [
        { type: "AnalyzerInput", id: input.analyzerInputId },
        {
          type: "ScoreEngineBenchmark",
          id: `payments:${bm.tier}:${bm.eu ? "EU" : "NON_EU"}`,
          version: SCORE_ENGINE_VERSION,
        },
      ];
    } else if (finding.vertical === "shipping") {
      const providerMatches = normalizedProvider !== null &&
        finding.tool.toLocaleLowerCase("en-US") === normalizedProvider;
      const shippingEvidenceComplete = providerMatches &&
        input.analyzerInput.monthly_shipping_cost !== null &&
        input.analyzerInput.monthly_shipments !== null &&
        input.analyzerInput.monthly_shipments > 0;
      if (!shippingEvidenceComplete) {
        return unknownEstimate(
          finding,
          "Shipping spend unavailable: requires an exact provider match plus observed EUR monthly_shipping_cost and positive monthly_shipments.",
        );
      }
      monthly = input.analyzerInput.monthly_shipping_cost;
      const actualPerShipment = monthly /
        Number(input.analyzerInput.monthly_shipments);
      shippingComparatorApplied = countryKnown;
      basis = countryKnown
        ? `Observed AnalyzerInput EUR shipping cost; actual per shipment €${actualPerShipment.toFixed(2)}. scoreEngine €${bm.shipping.perUnit.toFixed(2)} is comparison-only.`
        : `Observed AnalyzerInput EUR shipping cost; actual per shipment €${actualPerShipment.toFixed(2)}. No regional benchmark was applied because Brand country is unknown.`;
      estimateMethod = "OBSERVED_ANALYZER_SHIPPING_COST";
      sourceRefs = [
        { type: "AnalyzerInput", id: input.analyzerInputId },
        ...(countryKnown
          ? [{
            type: "ScoreEngineBenchmark",
            id: `shipping:${bm.tier}:${bm.eu ? "EU" : "NON_EU"}:comparison_only`,
            version: SCORE_ENGINE_VERSION,
          }]
          : []),
      ];
    } else if (finding.vertical.startsWith("saas_")) {
      const observed = saasByName.get(finding.tool.toLocaleLowerCase("en-US"));
      if (!observed) {
        return unknownEstimate(
          finding,
          "SaaS spend unavailable: no exact AnalyzerInput.saas_tools cost matched this detected tool.",
        );
      }
      monthly = observed.monthly_cost;
      basis = "Observed EUR monthly cost from the exact AnalyzerInput.saas_tools match.";
      estimateMethod = "OBSERVED_ANALYZER_SAAS_COST";
      sourceRefs = [{ type: "AnalyzerInput", id: input.analyzerInputId }];
    } else {
      return unknownEstimate(
        finding,
        `No authoritative EUR spend method is registered for vertical "${finding.vertical}".`,
      );
    }

    return {
      tool: finding.tool,
      vertical: finding.vertical,
      matched_catalog_id: finding.matched_catalog_id,
      estimated_spend_monthly: monthly,
      estimated_spend_annual: monthly === null ? null : monthly * 12,
      basis,
      confidence: confidenceLabel(finding.confidence, monthly !== null),
      detection_confidence: finding.confidence,
      estimate_method: estimateMethod,
      source_refs: sourceRefs,
    };
  });

  return {
    estimates,
    benchmark_context: {
      ...(paymentApplied || shippingComparatorApplied
        ? {
          score_engine_version: SCORE_ENGINE_VERSION,
          tier: bm.tier,
          region: bm.eu ? "EU" : "non-EU",
        }
        : {}),
      benchmarks_applied: {
        ...(paymentApplied ? { payments_rate_pct: bm.payment.rate } : {}),
        ...(shippingComparatorApplied
          ? { shipping_per_unit_eur_comparison_only: bm.shipping.perUnit }
          : {}),
      },
      local_allocation_heuristic_applied: false,
    },
  };
}

export function buildSpendTotals(estimates: any[]) {
  const known = estimates.filter((estimate) =>
    typeof estimate?.estimated_spend_monthly === "number" &&
    Number.isFinite(estimate.estimated_spend_monthly)
  );
  const unestimatedCount = estimates.length - known.length;
  const knownSubtotalMonthly = estimates.length === 0
    ? 0
    : known.length === 0
    ? null
    : known.reduce(
      (total, estimate) => total + estimate.estimated_spend_monthly,
      0,
    );
  return {
    currency: "EUR",
    known_subtotal_monthly: knownSubtotalMonthly,
    known_subtotal_annual: knownSubtotalMonthly === null
      ? null
      : knownSubtotalMonthly * 12,
    known_estimate_count: known.length,
    unestimated_count: unestimatedCount,
    coverage_complete: unestimatedCount === 0,
  };
}

export function collectSpendBenchmarkSourceRefs(estimates: any[]) {
  const refs = new Map<string, { type: string; id: string; version?: string }>();
  for (const estimate of Array.isArray(estimates) ? estimates : []) {
    for (const ref of Array.isArray(estimate?.source_refs)
      ? estimate.source_refs
      : []) {
      if (ref?.type !== "ScoreEngineBenchmark") continue;
      const id = String(ref.id || "").trim();
      const version = String(ref.version || "").trim();
      if (!SAFE_OPAQUE_ID.test(id) || version !== SCORE_ENGINE_VERSION) {
        review("SPEND_INTELLIGENCE_BENCHMARK_SOURCE_REF_INVALID");
      }
      refs.set(`${id}:${version}`, {
        type: "ScoreEngineBenchmark",
        id,
        version,
      });
    }
  }
  return [...refs.values()];
}

export function spendAuthorityReadsComplete(readState: {
  discovery: string;
  analyzer_input: string;
}) {
  return readState.discovery === "COMPLETE" &&
    (readState.analyzer_input === "COMPLETE" ||
      readState.analyzer_input === "NOT_REQUIRED");
}

export function deriveSpendDiscoveryCoverageStatus(
  sourceCoverage: unknown,
  findingCount: number,
) {
  if (!Number.isSafeInteger(findingCount) || findingCount < 0 ||
    !sourceCoverage || typeof sourceCoverage !== "object" ||
    Array.isArray(sourceCoverage)) return "UNKNOWN";
  const coverage: any = sourceCoverage;
  const explicit = coverage.scanner === "discoverCompanyInfrastructure" &&
    coverage.scope === "PRIMARY_DOCUMENT_HTTPS_RESPONSE" &&
    Number.isSafeInteger(coverage.finding_count) &&
    coverage.finding_count === findingCount;
  if (!explicit) return "UNKNOWN";
  if (findingCount === 0) return "UNKNOWN";
  if (coverage.discovery_coverage_status === "PARTIAL") return "PARTIAL";
  const mime = typeof coverage.content_type === "string"
    ? coverage.content_type.split(";", 1)[0].trim().toLowerCase()
    : "";
  const responseComplete = Number.isSafeInteger(coverage.http_status) &&
    coverage.http_status >= 200 && coverage.http_status < 300 &&
    (mime === "text/html" || mime === "application/xhtml+xml") &&
    coverage.body_eof_observed === true;
  return coverage.discovery_coverage_status === "COMPLETE" &&
      coverage.body_truncated === false && responseComplete
    ? "COMPLETE"
    : "UNKNOWN";
}

/**
 * Fixed-shape failure evidence. Arbitrary source keys and values are never
 * copied, and identifiers that could contain email/PII are dropped unless they
 * satisfy the opaque-id grammar.
 */
export function buildSpendFailureEvidenceProjection(input: any) {
  const sourceType = FAILURE_SOURCE_TYPES.has(input?.source_type)
    ? input.source_type
    : "unknown";
  const id = typeof input?.source_id === "string" &&
      SAFE_OPAQUE_ID.test(input.source_id)
    ? input.source_id
    : null;
  const version = typeof input?.source_version === "string" &&
      SAFE_OPAQUE_ID.test(input.source_version)
    ? input.source_version
    : null;
  const hash = typeof input?.source_hash === "string" &&
      SHA256.test(input.source_hash)
    ? input.source_hash.toLowerCase()
    : null;
  const observedItemCount = Number.isSafeInteger(input?.observed_item_count) &&
      input.observed_item_count >= 0 && input.observed_item_count <= 1_000_000
    ? input.observed_item_count
    : null;
  const shapeStatus = FAILURE_SHAPE_STATUSES.has(input?.shape_status)
    ? input.shape_status
    : "NOT_OBSERVED";
  const currencyStatus = FAILURE_CURRENCY_STATUSES.has(input?.currency_status)
    ? input.currency_status
    : "NOT_OBSERVED";
  const presentFields = Array.isArray(input?.present_fields)
    ? [...new Set(input.present_fields.filter((field: unknown) =>
      typeof field === "string" && FAILURE_PRESENT_FIELDS.has(field)
    ))].sort()
    : [];
  return {
    evidence_schema: "spend-failure-metadata-v1",
    source_type: sourceType,
    source_ref: id
      ? {
        id,
        ...(version ? { version } : {}),
        ...(hash ? { hash } : {}),
      }
      : null,
    observed_item_count: observedItemCount,
    shape_status: shapeStatus,
    currency_status: currencyStatus,
    present_fields: presentFields,
  };
}

export function unknownSpendTotals(unestimatedCount: number | null = null) {
  return {
    currency: "EUR",
    known_subtotal_monthly: null,
    known_subtotal_annual: null,
    known_estimate_count: 0,
    unestimated_count: unestimatedCount,
    coverage_complete: false,
  };
}

export function deterministicSpendSummary(totals: ReturnType<typeof buildSpendTotals>) {
  if (totals.known_subtotal_monthly === null) {
    return `No authoritative EUR spend subtotal is available; ${totals.unestimated_count} tool(s) remain unestimated.`;
  }
  if (totals.known_estimate_count === 0 && totals.unestimated_count === 0) {
    return "No tools were present in the validated B1 findings; the known EUR subtotal is €0. Discovery coverage is not asserted here.";
  }
  const known = `Known EUR subtotal €${totals.known_subtotal_monthly.toLocaleString("en-US")}/mo (€${totals.known_subtotal_annual?.toLocaleString("en-US")}/yr) across ${totals.known_estimate_count} tool(s).`;
  return totals.coverage_complete
    ? `${known} Every validated B1 finding has an estimate; this is not a total-stack discovery claim.`
    : `${known} ${totals.unestimated_count} tool(s) remain unestimated; this is not a total-stack claim.`;
}
