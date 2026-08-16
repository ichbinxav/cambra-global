// Legacy P6 company opportunity scorer. Despite the historical function name,
// this is not canonical P5 merchant economics and must never emit savings,
// rates, probability, or executable recommendations.

export const COMPANY_OPPORTUNITY_SCORE_VERSION =
  "merchant-company-opportunity-v3.0.0";

function observedNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lower(value: any) {
  return String(value || "").toLowerCase();
}

function contactGatePassed(lead: any) {
  return ["ready", "queued", "contacted", "converted"].includes(
    String(lead?.reservoir_state || ""),
  ) || ["outreach_ready", "contacted", "engaged", "won"].includes(
    String(lead?.revenue_stage || ""),
  ) ||
    [
      "outreach_ready",
      "waiting_window",
      "waiting_capacity",
      "contacted",
      "meeting",
      "won",
    ]
      .includes(String(lead?.stage || ""));
}

function contactRoleAdvisory(lead: any) {
  if (!contactGatePassed(lead)) {
    return {
      status: "NOT_AVAILABLE_PRE_CONTACT_GATE",
      score: null,
      included_in_company_score: false,
    };
  }
  const title = lower(lead?.contact_title);
  const score =
    /founder|chief executive|ceo|chief financial|cfo|chief operating|coo|head of (ecommerce|e-commerce|payments|finance)|director.*(ecommerce|payments|finance)/
        .test(title)
      ? 15
      : /vp|vice president|director|head/.test(title)
      ? 9
      : title
      ? 3
      : null;
  return {
    status: score === null ? "UNKNOWN" : "OBSERVED_POST_CONTACT_GATE",
    score,
    included_in_company_score: false,
  };
}

/**
 * Point-in-time company-only opportunity score.
 *
 * Person name, title, email and LinkedIn are intentionally absent from every
 * company evidence blob and from the score. Contact role remains a distinct
 * post-gate advisory for compatibility consumers only.
 */
export function deterministicMerchantOpportunity(lead: any) {
  const enrichment = lead?.enrichment_json || {};
  const raw = lead?.raw_json || {};
  const organization = raw?.organization || enrichment?.organization || {};
  const employees = observedNumber(
    enrichment?.employee_count ?? organization?.estimated_num_employees ??
      organization?.num_employees,
  );
  const stores = observedNumber(
    enrichment?.store_count ?? organization?.store_count,
  );
  const revenue = observedNumber(
    enrichment?.annual_revenue ?? organization?.annual_revenue,
  );
  const traffic = observedNumber(
    enrichment?.monthly_traffic ?? organization?.monthly_traffic,
  );
  const technologies = [
    ...(Array.isArray(lead?.detected_technologies)
      ? lead.detected_technologies
      : []),
    ...(Array.isArray(enrichment?.technologies) ? enrichment.technologies : []),
    ...(Array.isArray(enrichment?.tech_stack) ? enrichment.tech_stack : []),
    ...(Array.isArray(organization?.technologies)
      ? organization.technologies
      : []),
    ...(Array.isArray(organization?.current_technologies)
      ? organization.current_technologies.map((item: any) =>
        item?.name || item?.uid || item
      )
      : []),
  ];
  const technologyBlob = JSON.stringify(technologies).toLowerCase();
  const companyBlob = JSON.stringify({
    company_name: lead?.company_name || organization?.name || null,
    company_domain: lead?.company_domain || organization?.primary_domain ||
      organization?.website_url || null,
    country: lead?.country || organization?.country || null,
    industry: lead?.industry || organization?.industry || null,
    keywords: organization?.keywords || [],
    technologies,
    ecommerce_platform: lead?.ecommerce_platform || null,
    probable_payment_stack: Array.isArray(lead?.probable_payment_stack)
      ? lead.probable_payment_stack
      : [],
    markets: enrichment?.markets || organization?.markets || [],
    currencies: enrichment?.currencies || organization?.currencies || [],
    international: enrichment?.international || organization?.international ||
      null,
    funding: enrichment?.funding || organization?.funding || null,
    growth: enrichment?.growth || organization?.growth || null,
  }).toLowerCase();

  let commerce = 0;
  let economic = 0;
  let payments = 0;
  let timing = 0;
  let companyEvidence = 0;

  if (
    /ecommerce|e-commerce|retail|dtc|shopify|woocommerce|bigcommerce|prestashop|magento/
      .test(companyBlob)
  ) {
    commerce += 15;
  }
  if (
    /shopify|woocommerce|bigcommerce|prestashop|magento/.test(technologyBlob)
  ) {
    commerce += 8;
  }
  if (stores !== null && stores > 0) {
    commerce += Math.min(7, stores >= 5 ? 7 : 4);
  }

  if (employees !== null && employees > 0) {
    economic += employees >= 200
      ? 18
      : employees >= 50
      ? 14
      : employees >= 10
      ? 9
      : 3;
  }
  if (revenue !== null && revenue > 0) {
    economic += revenue >= 10_000_000 ? 10 : revenue >= 2_000_000 ? 7 : 3;
  }
  if (traffic !== null && traffic > 0) {
    economic += traffic >= 100_000 ? 6 : traffic >= 20_000 ? 4 : 1;
  }
  if (stores !== null && stores > 0) {
    economic += stores >= 10 ? 6 : stores >= 2 ? 3 : 0;
  }

  if (
    /stripe|adyen|mollie|paypal|klarna|worldline|checkout\.com|sumup|zettle|square|payplug|payment|psp|pos|tpv/
      .test(companyBlob)
  ) {
    payments += 12;
  }
  if (
    /international|multi.?country|omnichannel|multi.?store|cross.?border/.test(
      companyBlob,
    )
  ) {
    payments += 6;
  }
  if (
    /funding|raised|series [a-d]|expansion|expanding|new store|new market|hiring|growth/
      .test(companyBlob)
  ) {
    timing = 10;
  }

  if (lead?.company_domain) companyEvidence += 2;
  if (lead?.source) companyEvidence += 1;
  if (lead?.industry || organization?.industry) companyEvidence += 1;
  if (
    technologies.length || employees !== null || revenue !== null ||
    traffic !== null || stores !== null
  ) {
    companyEvidence += 1;
  }

  commerce = Math.min(25, commerce);
  economic = Math.min(25, economic);
  payments = Math.min(20, payments);
  companyEvidence = Math.min(5, companyEvidence);

  let penalty = 0;
  if (commerce < 8) penalty -= 40;
  if (employees !== null && employees < 5 && economic < 8) penalty -= 20;

  // The company-only dimensions have an 85-point raw ceiling. Rescaling keeps
  // the legacy 0-100 consumer contract without smuggling a 15-point contact
  // component into pre-fit.
  const rawCompanyScore = commerce + economic + payments + timing +
    companyEvidence + penalty;
  const opportunity = Math.max(
    0,
    Math.min(100, Math.round((rawCompanyScore / 85) * 100)),
  );
  const evidenceCount =
    [employees, revenue, traffic, stores].filter((value) => value !== null)
      .length +
    [
      /shopify|woocommerce|bigcommerce|prestashop|magento/.test(technologyBlob),
      /stripe|adyen|mollie|paypal|klarna|worldline|checkout\.com|sumup|zettle|square|payplug/
        .test(companyBlob),
    ].filter(Boolean).length;
  const evidenceConfidence = Math.min(
    1,
    0.2 + evidenceCount * 0.12 + (lead?.company_domain ? 0.1 : 0) +
      (lead?.source ? 0.05 : 0),
  );

  const contactAdvisory = contactRoleAdvisory(lead);
  return {
    opportunity_score: opportunity,
    evidence_confidence: Number(evidenceConfidence.toFixed(2)),
    breakdown: {
      commerce_fit: commerce,
      economic_potential: economic,
      payments_complexity: payments,
      decision_maker: 0,
      timing,
      data_confidence: companyEvidence,
      penalties: penalty,
    },
    signals: {
      employees,
      revenue,
      monthly_traffic: traffic,
      store_count: stores,
      commerce_platform: /shopify/.test(technologyBlob)
        ? "shopify"
        : /woocommerce/.test(technologyBlob)
        ? "woocommerce"
        : /prestashop/.test(technologyBlob)
        ? "prestashop"
        : /magento/.test(technologyBlob)
        ? "magento"
        : null,
      payment_provider: (companyBlob.match(
        /stripe|adyen|mollie|paypal|klarna|worldline|checkout\.com|sumup|zettle|square|payplug/,
      ) ||
        [])[0] || null,
    },
    evidence_count: evidenceCount,
    scoring_contract: COMPANY_OPPORTUNITY_SCORE_VERSION,
    methodology_class: "DETERMINISTIC_COMPANY_ONLY_HEURISTIC",
    probabilistic_calibration: false,
    company_only: true,
    contact_features_used: false,
    contact_role_advisory: contactAdvisory,
  };
}
