export const COMMERCIAL_INTELLIGENCE_VERSION = 'commercial-intelligence-p6-p8-1.0.0';

const clamp = (value: unknown, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const text = (value: unknown) => String(value || '').trim();

export function normalizeCompanyDomain(value: unknown): string {
  const raw = text(value).toLowerCase();
  if (!raw) return '';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
  } catch {
    return raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].replace(/\.$/, '');
  }
}

function companyKey(lead: any): string {
  const domain = normalizeCompanyDomain(lead?.company_domain);
  if (domain) return `domain:${domain}`;
  const name = text(lead?.company_name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return name ? `name:${name}` : `lead:${text(lead?.id)}`;
}

function countryCode(value: unknown): string {
  const v = text(value).toUpperCase();
  const aliases: Record<string, string> = { FRANCE: 'FR', SPAIN: 'ES', ESPAÑA: 'ES', GERMANY: 'DE', DEUTSCHLAND: 'DE', ITALY: 'IT', ITALIA: 'IT', PORTUGAL: 'PT', BELGIUM: 'BE', AUSTRIA: 'AT', NETHERLANDS: 'NL', 'UNITED KINGDOM': 'GB', UK: 'GB' };
  return aliases[v] || (v.length === 2 ? v : v || 'UNKNOWN');
}

function providerOf(lead: any): string {
  return text(lead?.score_breakdown_json?.signals?.payment_provider || lead?.enrichment_json?.payment_provider || lead?.enrichment_json?.psp).toLowerCase() || 'unknown';
}

function platformOf(lead: any): string {
  return text(lead?.score_breakdown_json?.signals?.commerce_platform || lead?.enrichment_json?.commerce_platform || lead?.enrichment_json?.ecommerce_platform).toLowerCase() || 'unknown';
}

function stageOf(lead: any): string {
  return text(lead?.revenue_stage || lead?.stage || 'discovered').toLowerCase();
}

function leadRank(lead: any): number {
  const score = clamp(lead?.score);
  const confidence = clamp(Number(lead?.score_breakdown_json?.evidence_confidence || 0) * 100);
  const freshness = lead?.last_verified_at && Date.now() - Date.parse(lead.last_verified_at) < 30 * 86400000 ? 100 : 50;
  return Math.round(score * 0.7 + confidence * 0.25 + freshness * 0.05);
}

function aggregate(rows: any[], keyFn: (row: any) => string) {
  const map = new Map<string, any>();
  for (const lead of rows) {
    const key = keyFn(lead) || 'unknown';
    const current = map.get(key) || { key, companies: new Set<string>(), leads: 0, scoreSum: 0, ready: 0, won: 0 };
    current.companies.add(companyKey(lead));
    current.leads++;
    current.scoreSum += clamp(lead?.score);
    if (['outreach_ready', 'ready'].includes(stageOf(lead)) || lead?.reservoir_state === 'ready') current.ready++;
    if (stageOf(lead) === 'won') current.won++;
    map.set(key, current);
  }
  return [...map.values()].map((item) => ({ key: item.key, observed_companies: item.companies.size, leads: item.leads, average_icp_score: item.leads ? Number((item.scoreSum / item.leads).toFixed(2)) : null, outreach_ready: item.ready, won: item.won, heat_score: Math.round(Math.min(100, item.ready * 5 + item.won * 20 + Math.min(40, item.scoreSum / Math.max(1, item.leads) * 0.4))) })).sort((a, b) => b.heat_score - a.heat_score || b.observed_companies - a.observed_companies || a.key.localeCompare(b.key));
}

function forecast(rows: any[], keyFn: (row: any) => string) {
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = keyFn(row) || 'unknown';
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups].map(([key, items]) => {
    let knownValue = 0;
    let weightedValue = 0;
    let known = 0;
    for (const item of items) {
      const value = Number(item?.expected_revenue_value);
      const probability = Number(item?.close_probability);
      const valueObserved = item?.expected_revenue_value !== null && item?.expected_revenue_value !== undefined && item?.expected_revenue_value !== '';
      const probabilityObserved = item?.close_probability !== null && item?.close_probability !== undefined && item?.close_probability !== '';
      if (valueObserved && probabilityObserved && Number.isFinite(value) && value >= 0 && Number.isFinite(probability) && probability >= 0 && probability <= 1) {
        known++;
        knownValue += value;
        weightedValue += value * probability;
      }
    }
    return { key, pipeline_count: items.length, known_value_count: known, unknown_value_count: items.length - known, known_expected_revenue_eur: Number(knownValue.toFixed(2)), weighted_expected_revenue_eur: Number(weightedValue.toFixed(2)), forecast_available: known > 0 };
  }).sort((a, b) => b.weighted_expected_revenue_eur - a.weighted_expected_revenue_eur || b.pipeline_count - a.pipeline_count);
}

function graph(rows: any[]) {
  const nodes = new Map<string, any>();
  const edges = new Map<string, any>();
  const addNode = (node: any) => { if (!nodes.has(node.id)) nodes.set(node.id, node); };
  const addEdge = (edge: any) => { const key = `${edge.from}|${edge.type}|${edge.to}`; if (!edges.has(key)) edges.set(key, edge); };
  for (const lead of rows.slice(0, 1000)) {
    const companyId = `company:${companyKey(lead)}`;
    addNode({ id: companyId, type: 'company', label: text(lead.company_name) || normalizeCompanyDomain(lead.company_domain) || 'Unknown company', domain: normalizeCompanyDomain(lead.company_domain), country: countryCode(lead.country), icp_score: Number(lead.score) || null });
    if (lead.contact_full_name || lead.contact_title) {
      const contactId = `contact:${text(lead.id)}`;
      addNode({ id: contactId, type: 'contact', label: text(lead.contact_full_name) || text(lead.contact_title), title: text(lead.contact_title) || null, lead_id: lead.id });
      addEdge({ from: contactId, to: companyId, type: 'works_at' });
    }
    const provider = providerOf(lead);
    if (provider !== 'unknown') { const id = `provider:${provider}`; addNode({ id, type: 'provider', label: provider }); addEdge({ from: companyId, to: id, type: 'uses_provider', confidence: lead?.score_breakdown_json?.evidence_confidence ?? null }); }
    const platform = platformOf(lead);
    if (platform !== 'unknown') { const id = `technology:${platform}`; addNode({ id, type: 'technology', label: platform }); addEdge({ from: companyId, to: id, type: 'uses_technology', confidence: lead?.score_breakdown_json?.evidence_confidence ?? null }); }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()], truncated: rows.length > 1000 };
}

function learning(rows: any[]) {
  const outcomes = rows.filter((lead) => ['won', 'lost'].includes(stageOf(lead)));
  const byCountry = aggregate(outcomes, (lead) => countryCode(lead.country));
  const byIndustry = aggregate(outcomes, (lead) => text(lead.industry).toLowerCase() || 'unknown');
  const recommendations = [];
  for (const dimension of [{ name: 'country', rows: byCountry }, { name: 'industry', rows: byIndustry }]) {
    for (const cohort of dimension.rows) {
      if (cohort.leads < 10) continue;
      recommendations.push({ dimension: dimension.name, value: cohort.key, sample_size: cohort.leads, observed_wins: cohort.won, observed_win_rate: Number((cohort.won / cohort.leads).toFixed(4)), action: 'founder_review_before_policy_change' });
    }
  }
  return { outcome_sample_size: outcomes.length, minimum_cohort_sample: 10, recommendations, automatic_policy_mutation: false };
}

export function buildCommercialIntelligence(leadsInput: unknown, policy: any = {}, now = new Date()) {
  const leads = Array.isArray(leadsInput) ? leadsInput.filter((lead) => lead && lead.id) : [];
  const uniqueCompanies = new Map<string, any>();
  for (const lead of leads) {
    const key = companyKey(lead);
    const previous = uniqueCompanies.get(key);
    if (!previous || leadRank(lead) > leadRank(previous)) uniqueCompanies.set(key, lead);
  }
  const companies = [...uniqueCompanies.values()];
  const allowedCountries = new Set((Array.isArray(policy?.countries) ? policy.countries : []).map(countryCode));
  const minScore = Number(policy?.min_lead_score || 70);
  const sam = companies.filter((lead) => (!allowedCountries.size || allowedCountries.has(countryCode(lead.country))) && Number(lead.score || 0) >= minScore);
  const som = sam.filter((lead) => lead.reservoir_state === 'ready' || stageOf(lead) === 'outreach_ready' || stageOf(lead) === 'won');
  const ranked = [...sam].sort((a, b) => leadRank(b) - leadRank(a) || Number(b.score || 0) - Number(a.score || 0) || String(a.id).localeCompare(String(b.id)));
  const priorityRow = (lead: any) => ({ lead_id: lead.id, company_name: lead.company_name || null, domain: normalizeCompanyDomain(lead.company_domain) || null, country: countryCode(lead.country), industry: lead.industry || null, icp_score: Number(lead.score) || null, evidence_confidence: Number(lead?.score_breakdown_json?.evidence_confidence) || 0, priority_score: leadRank(lead), provider: providerOf(lead), platform: platformOf(lead), stage: stageOf(lead) });
  const allSegments = {
    country: aggregate(companies, (lead) => countryCode(lead.country)),
    vertical: aggregate(companies, (lead) => text(lead.industry).toLowerCase() || 'unknown'),
    provider: aggregate(companies, providerOf),
    technology: aggregate(companies, platformOf),
  };
  const dataQuality = {
    companies: companies.length,
    with_domain: companies.filter((lead) => normalizeCompanyDomain(lead.company_domain)).length,
    with_contact: companies.filter((lead) => lead.contact_email || lead.contact_full_name).length,
    with_provider_signal: companies.filter((lead) => providerOf(lead) !== 'unknown').length,
    with_platform_signal: companies.filter((lead) => platformOf(lead) !== 'unknown').length,
    with_economic_value: companies.filter((lead) => lead.expected_revenue_value !== null && lead.expected_revenue_value !== undefined && lead.expected_revenue_value !== '' && Number.isFinite(Number(lead.expected_revenue_value))).length,
  };
  return {
    version: COMMERCIAL_INTELLIGENCE_VERSION,
    generated_at: now.toISOString(),
    market_sizing: {
      methodology: 'observed_lower_bound',
      tam: { estimate: null, observed_lower_bound: companies.length, definition: 'Unique companies actually discovered; not a claim about the whole European market.' },
      sam: { estimate: null, observed_lower_bound: sam.length, definition: 'Observed companies in approved countries meeting current ICP threshold.' },
      som: { estimate: null, observed_lower_bound: som.length, definition: 'Observed SAM companies currently outreach-ready or won.' },
      estimate_blocker: 'A defensible total-market estimate requires licensed/cited universe coverage and source-specific deduplication rates.',
      segments: allSegments,
    },
    prioritization: { top_100: ranked.slice(0, 100).map(priorityRow), top_1000: ranked.slice(0, 1000).map(priorityRow), hot_markets: allSegments.country.slice(0, 10), hot_verticals: allSegments.vertical.slice(0, 10) },
    lead_graph: graph(companies),
    forecast: { by_country: forecast(leads, (lead) => countryCode(lead.country)), by_provider: forecast(leads, providerOf), truth_boundary: 'Unknown expected revenue is excluded, never imputed.' },
    learning: learning(leads),
    data_quality: dataQuality,
    source_coverage: { observed_sources: [...new Set(leads.map((lead) => text(lead.source)).filter(Boolean))].sort(), claimed_continuous_universe_coverage: false },
    unknowns: [
      ...(dataQuality.with_provider_signal < companies.length ? ['provider_stack_incomplete'] : []),
      ...(dataQuality.with_platform_signal < companies.length ? ['commerce_platform_incomplete'] : []),
      ...(dataQuality.with_economic_value < companies.length ? ['expected_revenue_incomplete'] : []),
      'total_european_tam_not_established_from_current_sources',
    ],
  };
}
