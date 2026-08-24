export const DISCOVERY_ENGINE_VERSION = "p6-autonomous-discovery-radar-1.0.0";
export const APOLLO_SOURCE_KEY = "apollo";
export const APOLLO_EXPIRY_AT = "2026-09-07T23:59:59.999Z";
export const APOLLO_MAX_PAGE = 500;

const text = (value: unknown) => String(value || "").trim();
const clamp = (value: unknown, min = 0, max = 100) =>
  Math.max(min, Math.min(max, Number(value) || 0));

export function normalizeDiscoveryDomain(value: unknown): string {
  const raw = text(value).toLowerCase();
  if (!raw) return "";
  try {
    return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname
      .replace(/^www\./, "").replace(/\.$/, "");
  } catch {
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
      .replace(/\.$/, "");
  }
}

export function canonicalCompanyKey(
  value: unknown,
  fallbackName: unknown = "",
): string {
  const domain = normalizeDiscoveryDomain(value);
  if (domain) return `domain:${domain}`;
  const name = text(fallbackName).toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return name ? `name:${name}` : "";
}

export function discoveryProviderStatus(
  secretPresent: boolean,
  now = new Date(),
) {
  if (!secretPresent) {
    return {
      status: "UNAVAILABLE",
      available: false,
      reason: "secret_missing",
      expires_at: APOLLO_EXPIRY_AT,
    };
  }
  if (now.getTime() > Date.parse(APOLLO_EXPIRY_AT)) {
    return {
      status: "EXPIRED",
      available: false,
      reason: "provider_contract_expired",
      expires_at: APOLLO_EXPIRY_AT,
    };
  }
  return {
    status: "ACTIVE",
    available: true,
    reason: null,
    expires_at: APOLLO_EXPIRY_AT,
  };
}

export function discoveryPartitionKey(source: string, partition: any): string {
  const country = text(partition?.country).toUpperCase() || "UNKNOWN";
  const vertical = text(partition?.vertical).toLowerCase() || "ecommerce";
  const employeeBand = text(partition?.employee_range) || "all";
  const technology = text(partition?.technology).toLowerCase() || "any";
  return [
    text(source).toLowerCase() || "unknown",
    country,
    vertical,
    employeeBand,
    technology,
  ].join(":");
}

export function discoveryAttemptNumber(completedApiCalls: unknown): number {
  return Math.max(0, Math.floor(Number(completedApiCalls) || 0)) + 1;
}

export function discoveryOperationKey(input: {
  provider: unknown;
  operation: unknown;
  checkpointKey: unknown;
  page: unknown;
  completedApiCalls: unknown;
}) {
  const attempt = discoveryAttemptNumber(input.completedApiCalls);
  return [
    "api",
    text(input.provider).toLowerCase() || "unknown",
    text(input.operation).toLowerCase() || "unknown",
    text(input.checkpointKey) || "unknown",
    `page:${Math.max(1, Math.floor(Number(input.page) || 1))}`,
    `attempt:${attempt}`,
  ].join(":");
}

export function checkpointBackoff(failures: unknown, now = new Date()) {
  const count = Math.max(1, Math.min(8, Math.floor(Number(failures) || 1)));
  const delayMinutes = Math.min(24 * 60, 5 * (2 ** (count - 1)));
  return new Date(now.getTime() + delayMinutes * 60_000).toISOString();
}

const COMMERCE =
  /e-?commerce|retail|consumer|apparel|fashion|beauty|cosmetic|food|beverage|home|furniture|jewel|sport|shop|store|marketplace|dtc|direct.to.consumer/i;
const PLATFORM =
  /shopify|woocommerce|bigcommerce|prestashop|magento|salesforce commerce|commercetools/i;
const PAYMENT =
  /stripe|adyen|mollie|paypal|klarna|worldline|checkout\.com|sumup|square|payment|checkout|pos/i;

export function cheapDiscoveryPreScore(person: any) {
  const organization = person?.organization || {};
  const technologies = Array.isArray(organization?.current_technologies)
    ? organization.current_technologies
    : Array.isArray(organization?.technologies)
    ? organization.technologies
    : [];
  const blob = JSON.stringify({
    industry: organization?.industry || organization?.industry_tag || "",
    keywords: organization?.keywords || [],
    technologies,
    name: organization?.name || "",
  });
  const employees = Number(
    organization?.estimated_num_employees ?? organization?.num_employees,
  );
  const revenue = Number(
    organization?.annual_revenue ?? organization?.organization_revenue,
  );
  let score = 0;
  const reasons: string[] = [];
  if (COMMERCE.test(blob)) {
    score += 28;
    reasons.push("commerce_or_retail_signal");
  }
  if (PLATFORM.test(blob)) {
    score += 20;
    reasons.push("ecommerce_platform_signal");
  }
  if (PAYMENT.test(blob)) {
    score += 15;
    reasons.push("payments_signal");
  }
  if (Number.isFinite(employees)) {
    score += employees >= 200
      ? 14
      : employees >= 50
      ? 11
      : employees >= 10
      ? 7
      : employees >= 5
      ? 3
      : 0;
    reasons.push("employee_count_observed");
  }
  if (Number.isFinite(revenue) && revenue > 0) {
    score += revenue >= 10_000_000 ? 8 : revenue >= 2_000_000 ? 5 : 2;
    reasons.push("revenue_signal_observed");
  }
  if (
    normalizeDiscoveryDomain(
      organization?.primary_domain || organization?.website_url,
    )
  ) {
    score += 5;
    reasons.push("canonical_domain_observed");
  }
  return {
    score: clamp(score),
    reasons,
    enrichment_worthy: score >= 45,
    evidence_count: reasons.length,
    scoring_contract: "company-cheap-pre-fit-v2.0.0",
    company_only: true,
    contact_features_used: false,
  };
}

const GENERIC_LOCAL_PART =
  /^(info|hello|hola|bonjour|contact|sales|support|admin|office|team|marketing|press|privacy|legal|billing)$/i;
const PERSONAL_DOMAIN =
  /^(gmail|googlemail|outlook|hotmail|live|icloud|yahoo|protonmail|proton)\./i;

export function classifyProfessionalEmail(
  value: unknown,
  companyDomain: unknown,
) {
  const email = text(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { accepted: false, status: "UNAVAILABLE", reason: "invalid_email" };
  }
  const [local, domain] = email.split("@");
  if (GENERIC_LOCAL_PART.test(local)) {
    return { accepted: false, status: "UNVERIFIED", reason: "generic_email" };
  }
  if (PERSONAL_DOMAIN.test(domain)) {
    return {
      accepted: false,
      status: "UNVERIFIED",
      reason: "personal_email_provider",
    };
  }
  const canonical = normalizeDiscoveryDomain(companyDomain);
  const related = !canonical || domain === canonical ||
    domain.endsWith(`.${canonical}`) || canonical.endsWith(`.${domain}`);
  if (!related) {
    return {
      accepted: false,
      status: "UNVERIFIED",
      reason: "company_contact_mismatch",
    };
  }
  return {
    accepted: true,
    status: "PROFESSIONAL_VERIFIED",
    reason: null,
    email,
  };
}

export function safeApolloUsageSnapshot(input: any) {
  const source = input && typeof input === "object" ? input : {};
  const rateLimits = source.rate_limits || source.rateLimits ||
    source.api_usage || source.usage || null;
  return {
    available: Boolean(rateLimits),
    rate_limits: rateLimits && typeof rateLimits === "object"
      ? rateLimits
      : null,
    observed_at: new Date().toISOString(),
    note:
      "Apollo usage endpoint does not expose CAMBRA secrets; plan-specific credit balance may still require the Apollo billing UI.",
  };
}

export function selectDiscoveryPolicies(rows: any[]) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) =>
      row?.engine === "merchant_acquisition" &&
      row?.icp_json?.discovery_enabled === true &&
      Array.isArray(row?.countries) && row.countries.length > 0
    )
    .sort((a, b) =>
      Number(b?.icp_json?.priority || 0) - Number(a?.icp_json?.priority || 0) ||
      String(a?.policy_key || a?.id || "").localeCompare(
        String(b?.policy_key || b?.id || ""),
      )
    );
}

/** Deterministic hourly rotation prevents one saved ICP from starving its peers. */
export function selectDiscoveryPolicy(rows: any[], at = new Date()) {
  const eligible = selectDiscoveryPolicies(rows);
  if (!eligible.length) return null;
  return eligible[Math.floor(at.getTime() / 3_600_000) % eligible.length];
}

export function whyThisProspect(lead: any) {
  const reasons: Array<{ label: string; source: string }> = [];
  const evidence = lead?.source_evidence_json || {};
  if (lead?.country) {
    reasons.push({
      label: text(lead.country),
      source: evidence.country_source || `${lead.source || "unknown"}:country`,
    });
  }
  if (lead?.ecommerce_platform) {
    reasons.push({
      label: `${lead.ecommerce_platform} detected`,
      source: evidence.technology_source ||
        `${lead.source || "unknown"}:technology`,
    });
  }
  for (
    const provider of Array.isArray(lead?.probable_payment_stack)
      ? lead.probable_payment_stack.slice(0, 2)
      : []
  ) {
    reasons.push({
      label: `${provider} signal`,
      source: evidence.payment_source ||
        `${lead.source || "unknown"}:payment_stack`,
    });
  }
  if (Number(lead?.pre_score) > 0) {
    reasons.push({
      label: `ICP pre-score ${Math.round(Number(lead.pre_score))}`,
      source: evidence.pre_score_source || "CAMBRA:deterministic_pre_score",
    });
  }
  const confidence = Number(lead?.score_breakdown_json?.evidence_confidence);
  if (Number.isFinite(confidence)) {
    reasons.push({
      label: `Evidence confidence ${Math.round(confidence * 100)}%`,
      source: "CAMBRA:evidence_confidence",
    });
  }
  return reasons;
}
