const text = (value) => String(value ?? '').trim();
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const COMMERCIAL_OS_VERSION = 'commercial-os-1.0.0';
export const CAMPAIGN_STATES = Object.freeze([
  'DRAFT', 'READY_FOR_PILOT', 'PILOT', 'PAUSED', 'ACTIVE', 'COMPLETED', 'ARCHIVED',
]);

export function canonicalLeadScore(lead = {}) {
  const icp = numberOrNull(lead.score ?? lead.pre_score);
  const opportunity = numberOrNull(lead.revenue_opportunity_score ?? lead.score_breakdown_json?.opportunity_score);
  const confidence = numberOrNull(lead.revenue_confidence ?? lead.score_breakdown_json?.evidence_confidence);
  return {
    icp,
    opportunity,
    confidence,
    sources: {
      icp: lead.score !== undefined && lead.score !== null ? 'OutboundLead.score' : lead.pre_score !== undefined && lead.pre_score !== null ? 'OutboundLead.pre_score' : null,
      opportunity: lead.revenue_opportunity_score !== undefined && lead.revenue_opportunity_score !== null ? 'OutboundLead.revenue_opportunity_score' : lead.score_breakdown_json?.opportunity_score !== undefined ? 'OutboundLead.score_breakdown_json.opportunity_score' : null,
      confidence: lead.revenue_confidence !== undefined && lead.revenue_confidence !== null ? 'OutboundLead.revenue_confidence' : lead.score_breakdown_json?.evidence_confidence !== undefined ? 'OutboundLead.score_breakdown_json.evidence_confidence' : null,
    },
  };
}

const values = (value) => (Array.isArray(value) ? value : value ? [value] : []).map((item) => text(item).toLowerCase()).filter(Boolean);
const includesAny = (haystack, needles) => !needles.length || needles.some((needle) => haystack.includes(needle));
const inRange = (value, min, max) => value === null || ((min === null || value >= min) && (max === null || value <= max));

export function leadMatchesFilters(lead = {}, filters = {}) {
  const score = canonicalLeadScore(lead);
  const blob = [lead.company_name, lead.company_domain, lead.contact_full_name, lead.contact_email, lead.contact_title, lead.country, lead.industry]
    .map((item) => text(item).toLowerCase()).join(' ');
  const technologies = values([...(lead.detected_technologies || []), lead.ecommerce_platform, ...(lead.probable_payment_stack || [])]);
  const include = values(filters.include);
  const exclude = values(filters.exclude);
  const revenue = numberOrNull(lead.annual_revenue_eur ?? lead.enrichment_json?.annual_revenue_eur);
  const employees = numberOrNull(lead.employee_count ?? lead.enrichment_json?.employee_count);
  const tpv = numberOrNull(lead.estimated_tpv_max_eur ?? lead.estimated_tpv_min_eur);
  if (text(filters.search) && !blob.includes(text(filters.search).toLowerCase())) return false;
  if (include.length && !includesAny(`${blob} ${technologies.join(' ')}`, include)) return false;
  if (exclude.some((needle) => `${blob} ${technologies.join(' ')}`.includes(needle))) return false;
  if (values(filters.countries).length && !values(filters.countries).includes(text(lead.country).toLowerCase())) return false;
  if (values(filters.industries).length && !values(filters.industries).includes(text(lead.industry).toLowerCase())) return false;
  if (values(filters.sources).length && !values(filters.sources).includes(text(lead.source).toLowerCase())) return false;
  if (values(filters.statuses).length && !values(filters.statuses).includes(text(lead.revenue_stage || lead.stage).toLowerCase())) return false;
  if (values(filters.contactability).length && !values(filters.contactability).includes(text(lead.contactability).toLowerCase())) return false;
  if (values(filters.technologies).length && !values(filters.technologies).some((needle) => technologies.some((item) => item.includes(needle)))) return false;
  if (!inRange(score.icp, numberOrNull(filters.minIcp), numberOrNull(filters.maxIcp))) return false;
  if (!inRange(score.opportunity, numberOrNull(filters.minOpportunity), numberOrNull(filters.maxOpportunity))) return false;
  if (!inRange(score.confidence, numberOrNull(filters.minConfidence), numberOrNull(filters.maxConfidence))) return false;
  if (!inRange(revenue, numberOrNull(filters.minRevenue), numberOrNull(filters.maxRevenue))) return false;
  if (!inRange(employees, numberOrNull(filters.minEmployees), numberOrNull(filters.maxEmployees))) return false;
  if (!inRange(tpv, numberOrNull(filters.minTpv), numberOrNull(filters.maxTpv))) return false;
  return true;
}

export function filterAndSortLeads(leads = [], filters = {}, sort = 'opportunity') {
  const rows = (Array.isArray(leads) ? leads : []).filter((lead) => leadMatchesFilters(lead, filters));
  const metric = sort === 'icp' ? 'icp' : sort === 'confidence' ? 'confidence' : 'opportunity';
  return rows.sort((a, b) => {
    if (sort === 'recent') return Date.parse(b.discovered_at || b.created_date || 0) - Date.parse(a.discovered_at || a.created_date || 0);
    if (sort === 'tpv') return Number(b.estimated_tpv_max_eur || -1) - Number(a.estimated_tpv_max_eur || -1);
    return Number(canonicalLeadScore(b)[metric] ?? -1) - Number(canonicalLeadScore(a)[metric] ?? -1);
  });
}

export function senderReadiness(profile = {}) {
  const configured = Boolean(text(profile.profile_key) && text(profile.domain) && text(profile.from_address));
  const senderReady = profile.provider_config_json?.sender_ready === true;
  const webhookReady = profile.provider !== 'instantly' || profile.webhook_status === 'ACTIVE';
  const healthy = Number(profile.bounce_rate_pct || 0) < Number(profile.bounce_pause_threshold_pct || 3)
    && Number(profile.complaint_rate_pct || 0) < Number(profile.complaint_pause_threshold_pct || 0.3);
  const cap = Math.max(0, Number(profile.current_daily_cap || 0));
  let status = 'SETUP_PENDING';
  if (profile.status === 'paused') status = 'PAUSED';
  else if (!configured || (profile.provider === 'instantly' && !senderReady)) status = 'SETUP_PENDING';
  else if (!healthy || profile.webhook_status === 'ERROR') status = 'BROKEN';
  else if (profile.status === 'warming') status = 'WARMING';
  else if (profile.status === 'active' && senderReady && webhookReady && cap > 0) status = 'READY';
  else if (profile.status === 'active' && cap > 0) status = 'LIMITED';
  return { status, ready: status === 'READY', cap: status === 'READY' ? cap : 0, configured, sender_ready:senderReady, webhook_ready:webhookReady, healthy };
}

export function calculateCampaignCapacity({ profiles = [], control = {}, policy = {}, eligibleLeads = 0, provider = null } = {}) {
  const currentControl=/** @type {any} */(control),currentPolicy=/** @type {any} */(policy);
  if (currentControl.acquisition_enabled !== true) return { capacity:0, blockers:['outbound_master_paused'] };
  if (provider === 'instantly' && currentControl.instantly_enabled !== true) return { capacity:0, blockers:['instantly_outbound_paused'] };
  const allowed = new Set(Array.isArray(currentPolicy.sending_profile_keys) ? currentPolicy.sending_profile_keys : []);
  const ready = profiles.filter((profile) => (!allowed.size || allowed.has(profile.profile_key)) && (!provider || profile.provider === provider)).map(senderReadiness).filter((row) => row.ready);
  const policyCap = Math.max(0, Number(currentPolicy.daily_send_limit || 0));
  const senderCap = ready.reduce((sum, row) => sum + row.cap, 0);
  const capacity = Math.max(0, Math.min(policyCap, senderCap, Math.max(0, Number(eligibleLeads || 0))));
  const blockers = [];
  if (!policyCap) blockers.push('commercial_policy_daily_limit_missing');
  if (!senderCap) blockers.push('ready_sending_profile_required');
  if (!Number(eligibleLeads || 0)) blockers.push('eligible_leads_required');
  return { capacity, policy_cap:policyCap, sender_cap:senderCap, eligible_leads:Number(eligibleLeads || 0), blockers };
}

export function buildProviderIndependentQuery(profile = {}) {
  return {
    countries: values(profile.countries).map((item) => item.toUpperCase()),
    industries: values(profile.verticals || profile.industries),
    titles: values(profile.titles),
    seniorities: values(profile.seniorities),
    employee_ranges: values(profile.employee_ranges),
    technologies: values(profile.technologies),
    revenue_ranges: values(profile.revenue_ranges),
    include_keywords: values(profile.include_keywords),
    exclude_keywords: values(profile.exclude_keywords),
    one_lead_per_company: profile.one_lead_per_company !== false,
    limit: Math.max(1, Math.min(1000, Number(profile.limit || profile.per_run || 100))),
  };
}

const csvCell = (value) => {
  let cell = Array.isArray(value) ? value.join(' | ') : text(value);
  if (/^[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
};

export function leadsToCsv(leads = []) {
  const columns = [
    ['company_name','Company'], ['company_domain','Domain'], ['country','Country'], ['industry','Industry'], ['employee_range','Employees'], ['revenue_range','Revenue'], ['ecommerce_platform','Commerce platform'], ['probable_payment_stack','PSP'], ['estimated_tpv_min_eur','TPV min EUR'], ['estimated_tpv_max_eur','TPV max EUR'], ['contact_full_name','Contact'], ['contact_title','Title'], ['contact_email','Email'], ['score','ICP score'], ['revenue_opportunity_score','Opportunity score'], ['revenue_confidence','Confidence'], ['source','Source'],
  ];
  return [columns.map(([, label]) => csvCell(label)).join(','), ...(Array.isArray(leads) ? leads : []).map((lead) => columns.map(([key]) => csvCell(lead[key])).join(','))].join('\n');
}
