export const FOUNDER_MERCHANTS_V2_VERSION = 'founder-merchants-v2-1.0.0';

export const MERCHANT_BLOCKS = Object.freeze([
  'overview',
  'payments_infrastructure',
  'analyzer_opportunities',
  'recover_savings',
  'data_documents',
  'cambra_activity',
  'attention_approvals',
  'company_contacts',
  'billing_revenue',
  'contracts_legal',
  'communications',
  'technical_audit',
]);

export const MERCHANT_KPI_KEYS = Object.freeze([
  'total_merchants',
  'active_merchants',
  'total_payment_volume',
  'average_payment_cost',
  'potential_savings',
  'verified_savings',
  'realized_savings',
  'cambra_revenue',
  'recover_active',
  'needs_attention',
  'average_data_confidence',
  'new_merchants',
]);

const LIST_SOURCE_LIMIT = 5000;
const PAGE_SIZE_DEFAULT = 25;
const PAGE_SIZE_MAX = 100;
const EXPORT_LIMIT = 1000;
const ACTIVE_RECOVER = new Set(['activated', 'awaiting_authorization', 'authorized', 'migrating', 'live', 'monetizing']);
const BLOCKED_OUTPUT_KEYS = /(^|_)(access_token|refresh_token|secret|password|api_key|private_key|authorization|cookie|raw_event_json|headers_json)$/i;

const text = (value: any, limit = 320) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, limit);
const numberOrNull = (value: any) => Number.isFinite(Number(value)) ? Number(value) : null;
const number = (value: any) => numberOrNull(value) ?? 0;
const list = (value: any) => Array.isArray(value) ? value : [];
const lower = (value: any) => text(value, 500).toLocaleLowerCase('en-US');
const when = (value: any) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const isoOrNull = (value: any) => when(value) ? new Date(when(value)).toISOString() : null;
const newestAt = (...values: any[]) => {
  const value = values.flat().filter(Boolean).sort((a, b) => when(b) - when(a))[0];
  return isoOrNull(value);
};
const unique = (values: any[]) => [...new Set(values.map((value) => text(value, 160)).filter(Boolean))];
const inRange = (value: number | null, min: any, max: any) => {
  if (min !== undefined && min !== null && min !== '' && (value === null || value < Number(min))) return false;
  if (max !== undefined && max !== null && max !== '' && (value === null || value > Number(max))) return false;
  return true;
};

export function sanitizeMerchantAdminValue(value: any, depth = 0): any {
  if (depth > 7) return '[depth_limited]';
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 12000);
  if (Array.isArray(value)) return value.slice(0, 250).map((item) => sanitizeMerchantAdminValue(item, depth + 1));
  if (typeof value !== 'object') return text(value, 500);
  const result: Record<string, any> = {};
  for (const [key, nested] of Object.entries(value).slice(0, 250)) {
    if (BLOCKED_OUTPUT_KEYS.test(key)) continue;
    result[key] = sanitizeMerchantAdminValue(nested, depth + 1);
  }
  return result;
}

function latestRows(rows: any[], identity: (row: any) => string, dateFields = ['updated_at', 'last_updated', 'created_date', 'created_at']) {
  const result = new Map<string, any>();
  for (const row of rows) {
    const key = identity(row);
    if (!key) continue;
    const existing = result.get(key);
    const rowAt = dateFields.reduce((best, field) => Math.max(best, when(row?.[field])), 0);
    const existingAt = existing ? dateFields.reduce((best, field) => Math.max(best, when(existing?.[field])), 0) : -1;
    if (!existing || rowAt >= existingAt) result.set(key, row);
  }
  return result;
}

function groupByBrand(rows: any[], brandKey = 'brand_id') {
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const id = text(row?.[brandKey], 120);
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) || []), row]);
  }
  return grouped;
}

function latestByBrand(rows: any[], brandKey = 'brand_id', dateFields?: string[]) {
  return latestRows(rows, (row) => text(row?.[brandKey], 120), dateFields);
}

function rollingTwelveMonths(rows: any[], nowMs: number) {
  const floor = nowMs - 366 * 86400000;
  return rows.filter((row) => {
    const date = when(row?.effective_end || row?.month || row?.verified_at || row?.created_date);
    return date >= floor && date <= nowMs + 86400000;
  });
}

function sourceState(name: string, source: any) {
  return {
    source: name,
    status: source?.ok ? (source.truncated ? 'TRUNCATED' : 'AVAILABLE') : 'UNAVAILABLE',
    rows: source?.rows?.length ?? 0,
    limit: source?.limit ?? null,
    error_code: source?.ok ? null : source?.error_code || 'SOURCE_READ_FAILED',
  };
}

function combinedSourceStatus(sources: any[]) {
  const rows = sources.filter(Boolean);
  if (!rows.length || rows.every((source) => source?.ok !== true)) return 'UNAVAILABLE';
  if (rows.some((source) => source?.ok !== true || source?.truncated === true)) return 'PARTIAL';
  return 'AVAILABLE';
}

function metric(input: {
  key: string;
  label: string;
  value: any;
  unit: string;
  truth_class: 'observed' | 'estimated' | 'modeled' | 'verified' | 'contractual' | 'unknown' | 'mixed';
  as_of: string;
  dependencies: string[];
  context?: any;
  unavailable?: boolean;
  incomplete?: boolean;
}) {
  return {
    key: input.key,
    label: input.label,
    value: input.unavailable ? null : input.value,
    unit: input.unit,
    truth_class: input.unavailable ? 'unknown' : input.truth_class,
    status: input.unavailable ? 'UNAVAILABLE' : input.incomplete ? 'PARTIAL' : 'AVAILABLE',
    as_of: input.as_of,
    dependencies: input.dependencies,
    context: input.context || {},
    claim_boundary: input.unavailable
      ? 'A required canonical source is unavailable. CAMBRA did not substitute zero.'
      : input.incomplete
        ? 'The bounded canonical source read is incomplete; values are lower bounds and are not presented as portfolio totals.'
        : 'Value is derived only from the named canonical sources and retains its truth class.',
  };
}

function annualObservedVolumeMinor(rows: any[]) {
  return rows
    .filter((row) => row.data_classification === 'production' && row.is_demo !== true && row.vertical === 'payments')
    .reduce((total, row) => total + Math.max(0, number(row.observed_annual_volume_minor)), 0);
}

function verifiedCost(rows: any[], demandRows: any[]) {
  const latest = latestRows(rows, (row) => `${text(row.brand_id)}:${text(row.integration_id)}`, ['created_date', 'updated_date']);
  let volumeMinor = 0;
  let costMinor = 0;
  let observations = 0;
  for (const row of latest.values()) {
    const bps = numberOrNull(row.measured_current_bps);
    const sample = row.sample_metrics || {};
    const sampleMajor = numberOrNull(sample.gross_volume_eur_90d ?? sample.gmv_eur);
    const days = Math.max(1, number(row.measurement_window?.days_covered) || 90);
    if (bps === null || bps < 0 || sampleMajor === null || sampleMajor <= 0) continue;
    const annualMinor = sampleMajor * 100 * 365 / days;
    volumeMinor += annualMinor;
    costMinor += annualMinor * bps / 10000;
    observations++;
  }
  if (!observations) {
    const weighted = demandRows.filter((row) => numberOrNull(row.demand_profile_json?.observed_effective_bps) !== null);
    for (const row of weighted) {
      const volume = Math.max(0, number(row.observed_annual_volume_minor));
      const bps = Math.max(0, number(row.demand_profile_json?.observed_effective_bps));
      volumeMinor += volume;
      costMinor += volume * bps / 10000;
      observations++;
    }
  }
  return {
    bps: volumeMinor > 0 ? costMinor / volumeMinor * 10000 : null,
    annual_cost_minor: volumeMinor > 0 ? Math.round(costMinor) : null,
    observed_volume_minor: volumeMinor > 0 ? Math.round(volumeMinor) : null,
    observations,
  };
}

function analyzerPotential(row: any) {
  const amount = numberOrNull(row?.payment_savings ?? row?.details?.savings_range?.point ?? row?.details?.engine_result?.annual_savings_eur?.point);
  return amount !== null && amount >= 0 ? amount : null;
}

function dataConfidence(row: any) {
  const direct = numberOrNull(row?.data_completeness_score);
  if (direct !== null) return Math.max(0, Math.min(100, direct));
  const level = lower(row?.confidence_level);
  return level === 'high' ? 90 : level === 'medium' ? 65 : level === 'low' ? 35 : null;
}

function merchantGlobalStatus(brand: any, nowMs: number) {
  if (brand.service_status === 'cancelled') return { value: 'churned', truth_class: 'observed' };
  const created = when(brand.created_date || brand.created_at);
  if (created && created >= nowMs - 30 * 86400000) return { value: 'new', truth_class: 'observed_derived' };
  if (brand.service_status === 'active' || !brand.service_status) return { value: 'active', truth_class: 'observed' };
  return { value: 'unknown', truth_class: 'unknown' };
}

function confidenceLabel(score: number | null) {
  return score === null ? 'Unknown' : score >= 80 ? 'High confidence' : score >= 60 ? 'Medium confidence' : 'Low confidence';
}

export type MerchantSummaryInput = {
  brands: any[];
  demandUnits?: any[];
  verifiedAnalyses?: any[];
  analyzerResults?: any[];
  activations?: any[];
  savingsReports?: any[];
  invoices?: any[];
  integrations?: any[];
  lifecycles?: any[];
  approvals?: any[];
  incidents?: any[];
  documents?: any[];
  marketContexts?: any[];
  sourceStatus?: Record<string, { ok?: boolean; truncated?: boolean }>;
  now?: string;
};

export function buildMerchantSummaries(input: MerchantSummaryInput) {
  const nowMs = when(input.now) || Date.now();
  // A Brand that still carries anon_session_id has not been claimed by a
  // registered account. The Founder Merchants portfolio must never promote an
  // anonymous Analyzer session into a merchant.
  const brands = list(input.brands).filter((brand) => brand && brand.is_demo !== true && !text(brand.anon_session_id) && text(brand.id));
  const demand = groupByBrand(list(input.demandUnits));
  const verified = groupByBrand(list(input.verifiedAnalyses));
  const analyzer = latestByBrand(list(input.analyzerResults), 'brand_id', ['created_date', 'updated_date']);
  const activations = groupByBrand(list(input.activations));
  const reports = groupByBrand(list(input.savingsReports));
  const invoices = groupByBrand(list(input.invoices));
  const integrations = groupByBrand(list(input.integrations));
  const lifecycles = latestByBrand(list(input.lifecycles), 'brand_id', ['updated_at', 'created_date']);
  const approvals = groupByBrand(list(input.approvals));
  const incidents = groupByBrand(list(input.incidents).filter((row) => ['Brand', 'Merchant'].includes(String(row?.subject_type))), 'subject_id');
  const documents = groupByBrand(list(input.documents), 'owner_id');
  const contexts = latestByBrand(list(input.marketContexts), 'brand_id', ['last_resolved_at', 'created_date']);
  const evidenceStatus = (source: string, matchingRows: number) => {
    const state = input.sourceStatus?.[source];
    if (!state) return 'AVAILABLE';
    if (state.ok !== true) return 'UNAVAILABLE';
    if (state.truncated) return matchingRows > 0 ? 'PARTIAL' : 'UNAVAILABLE';
    return 'AVAILABLE';
  };

  return brands.map((brand) => {
    const id = text(brand.id, 120);
    const brandDemand = (demand.get(id) || []).filter((row) => row.data_classification === 'production' && row.is_demo !== true && row.vertical === 'payments');
    const brandVerified = verified.get(id) || [];
    const brandAnalyzer = analyzer.get(id) || null;
    const brandActivations = (activations.get(id) || []).slice().sort((a, b) => when(b.last_updated || b.created_date) - when(a.last_updated || a.created_date));
    const brandReports = rollingTwelveMonths(reports.get(id) || [], nowMs);
    const brandInvoices = invoices.get(id) || [];
    const brandIntegrations = integrations.get(id) || [];
    const brandApprovals = approvals.get(id) || [];
    const brandIncidents = incidents.get(id) || [];
    const brandDocuments = (documents.get(id) || []).filter((row) => !row.owner_type || ['Brand', 'brand', 'merchant'].includes(String(row.owner_type)));
    const context = contexts.get(id) || null;
    const potentialMajor = analyzerPotential(brandAnalyzer);
    const volumeMinor = annualObservedVolumeMinor(brandDemand);
    const cost = verifiedCost(brandVerified, brandDemand);
    const verifiedSavings = brandReports
      .filter((row) => row.measurement_mode === 'fully_verified' && ['verified', 'realized', 'invoiced', 'paid'].includes(String(row.verification_status)))
      .reduce((total, row) => total + Math.max(0, number(row.savings)), 0);
    const realizedSavings = brandReports
      .filter((row) => row.measurement_mode === 'fully_verified' && ['realized', 'invoiced', 'paid'].includes(String(row.verification_status)))
      .reduce((total, row) => total + Math.max(0, number(row.savings)), 0);
    const revenueCollected = brandInvoices.reduce((total, row) => total + Math.max(0, number(row.amount_paid)), 0);
    const latestActivation = brandActivations[0] || null;
    const recoverActive = brandActivations.some((row) => ACTIVE_RECOVER.has(String(row.status)));
    const confidence = dataConfidence(brandAnalyzer);
    const coverage = {
      payment_volume: evidenceStatus('demandUnits', brandDemand.length),
      payment_cost: evidenceStatus('verifiedAnalyses', brandVerified.length),
      potential_savings: evidenceStatus('analyzerResults', brandAnalyzer ? 1 : 0),
      verified_savings: evidenceStatus('savingsReports', brandReports.length),
      cambra_revenue: evidenceStatus('invoices', brandInvoices.length),
      approvals: evidenceStatus('approvals', brandApprovals.length),
      incidents: evidenceStatus('incidents', brandIncidents.length),
    };
    const attentionKnown = brandApprovals.length + brandIncidents.length;
    const attentionComplete = coverage.approvals === 'AVAILABLE' && coverage.incidents === 'AVAILABLE';
    const status = merchantGlobalStatus(brand, nowMs);
    const psp = unique([
      ...brandDemand.map((row) => row.current_provider_slug),
      ...brandIntegrations.filter((row) => row.category === 'payments' || row.provider === 'stripe').map((row) => row.provider),
    ]);
    const sources = unique([
      ...(brandIntegrations.some((row) => row.status === 'connected') ? ['connected'] : []),
      ...(brandDocuments.length ? ['documents'] : []),
      ...(brandAnalyzer?.input_id || brandAnalyzer?.was_anonymous === false ? ['manual'] : []),
    ]);
    const lastActivity = newestAt(
      brand.updated_date,
      brand.created_date,
      brandIntegrations.map((row) => row.last_sync_at || row.connected_at),
      brandActivations.map((row) => row.last_updated || row.activated_at),
      brandReports.map((row) => row.verified_at || row.month),
      brandInvoices.map((row) => row.paid_at || row.issued_at),
      brandDocuments.map((row) => row.uploaded_at),
    );
    const potentialPct = potentialMajor !== null && cost.annual_cost_minor && cost.annual_cost_minor > 0
      ? potentialMajor * 100 / (cost.annual_cost_minor / 100)
      : null;
    return {
      id,
      trading_name: text(brand.name, 240) || 'Unnamed merchant',
      legal_name: text(brand.billing_legal_name, 240) || null,
      country: text(context?.legal_entity_country || context?.home_market || brand.billing_country || brand.country, 8).toUpperCase() || null,
      website: text(brand.website, 500) || null,
      merchant_status: status.value,
      merchant_status_truth: status.truth_class,
      payment_volume: volumeMinor > 0 ? { value_minor: Math.round(volumeMinor), currency: 'EUR', period: 'annualized', truth_class: 'observed', evidence_status: coverage.payment_volume } : null,
      payment_cost: cost.bps !== null ? { bps: Number(cost.bps.toFixed(2)), annual_cost_minor: cost.annual_cost_minor, observed_volume_minor: cost.observed_volume_minor, currency: 'EUR', truth_class: 'observed', evidence_status: coverage.payment_cost } : null,
      potential_savings: potentialMajor !== null ? { value_minor: Math.round(potentialMajor * 100), pct: potentialPct === null ? null : Number(potentialPct.toFixed(2)), currency: 'EUR', period: 'annual', truth_class: 'modeled', evidence_status: coverage.potential_savings } : null,
      verified_savings: coverage.verified_savings === 'UNAVAILABLE' ? null : { value_minor: Math.round(verifiedSavings * 100), currency: 'EUR', period: 'trailing_12_months', truth_class: 'verified', evidence_status: coverage.verified_savings },
      realized_savings: coverage.verified_savings === 'UNAVAILABLE' ? null : { value_minor: Math.round(realizedSavings * 100), currency: 'EUR', period: 'trailing_12_months', truth_class: 'verified', evidence_status: coverage.verified_savings },
      cambra_revenue: coverage.cambra_revenue === 'UNAVAILABLE' ? null : { collected_minor: Math.round(revenueCollected * 100), currency: 'EUR', truth_class: 'verified', evidence_status: coverage.cambra_revenue },
      psps: psp,
      recover: { active: recoverActive, status: latestActivation?.status || 'not_activated', activation_id: latestActivation?.id || null },
      current_phase: lifecycles.get(id)?.state || (recoverActive ? latestActivation?.status : null),
      data_sources: sources,
      data_confidence: confidence,
      data_confidence_label: confidenceLabel(confidence),
      needs_attention: attentionKnown > 0 ? attentionKnown : attentionComplete ? 0 : null,
      attention_status: attentionComplete ? 'AVAILABLE' : attentionKnown > 0 ? 'PARTIAL' : 'UNAVAILABLE',
      attention_breakdown: {
        approvals: coverage.approvals === 'UNAVAILABLE' ? null : brandApprovals.length,
        incidents: coverage.incidents === 'UNAVAILABLE' ? null : brandIncidents.length,
      },
      joined_at: isoOrNull(brand.created_date || brand.created_at),
      last_activity_at: lastActivity,
      identifiers_search: [id, brand.tax_id, brand.vat_number, brand.vat_number_normalized].map((value) => lower(value)).filter(Boolean),
      search_text: lower([brand.name, brand.billing_legal_name, brand.country, brand.billing_country, brand.website, ...psp].filter(Boolean).join(' ')),
      evidence: {
        analyzer_result_id: brandAnalyzer?.id || null,
        verified_analysis_count: brandVerified.length,
        demand_unit_count: brandDemand.length,
        report_count_t12m: brandReports.length,
        source_coverage: coverage,
      },
    };
  });
}

const SORT_FIELDS: Record<string, (row: any) => any> = {
  potential_savings: (row) => row.potential_savings?.value_minor ?? null,
  payment_volume: (row) => row.payment_volume?.value_minor ?? null,
  payment_cost: (row) => row.payment_cost?.bps ?? null,
  verified_savings: (row) => row.verified_savings?.value_minor ?? null,
  cambra_revenue: (row) => row.cambra_revenue?.collected_minor ?? null,
  data_confidence: (row) => row.data_confidence ?? null,
  newest: (row) => when(row.joined_at) || null,
  last_activity: (row) => when(row.last_activity_at) || null,
  name: (row) => lower(row.trading_name),
};

export function applyMerchantQuery(rows: any[], body: any = {}) {
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};
  const query = lower(body.search || filters.search);
  const selected = rows.filter((row) => {
    if (query && !row.search_text.includes(query) && !row.identifiers_search.some((value: string) => value.includes(query))) return false;
    const statuses = unique(list(filters.status));
    if (statuses.length && !statuses.includes(row.merchant_status)) return false;
    const countries = unique(list(filters.country).map((value) => String(value).toUpperCase()));
    if (countries.length && !countries.includes(row.country)) return false;
    const psps = unique(list(filters.psp).map(lower));
    if (psps.length && !row.psps.some((value: string) => psps.includes(lower(value)))) return false;
    if (!inRange(row.payment_volume?.value_minor === undefined ? null : row.payment_volume.value_minor / 100, filters.payment_volume_min_eur, filters.payment_volume_max_eur)) return false;
    if (!inRange(row.payment_cost?.bps === undefined ? null : row.payment_cost.bps / 100, filters.payment_cost_min_pct, filters.payment_cost_max_pct)) return false;
    if (!inRange(row.potential_savings?.pct ?? null, filters.potential_savings_min_pct, filters.potential_savings_max_pct)) return false;
    if (!inRange(row.verified_savings?.value_minor === undefined ? null : row.verified_savings.value_minor / 100, filters.verified_savings_min_eur, filters.verified_savings_max_eur)) return false;
    const recover = unique(list(filters.recover_status));
    if (recover.length && !recover.includes(row.recover.status) && !(recover.includes('active') && row.recover.active) && !(recover.includes('not_activated') && !row.recover.active)) return false;
    const phases = unique(list(filters.current_phase));
    if (phases.length && !phases.includes(row.current_phase)) return false;
    const dataSources = unique(list(filters.data_source));
    if (dataSources.length && !dataSources.every((source) => row.data_sources.includes(source))) return false;
    if (!inRange(row.data_confidence, filters.data_confidence_min, filters.data_confidence_max)) return false;
    if (filters.needs_attention === true && !(row.needs_attention > 0)) return false;
    if (filters.needs_attention === false && row.needs_attention !== 0) return false;
    if (filters.joined_from && when(row.joined_at) < when(filters.joined_from)) return false;
    if (filters.joined_to && when(row.joined_at) > when(filters.joined_to) + 86400000 - 1) return false;
    if (filters.last_activity_from && when(row.last_activity_at) < when(filters.last_activity_from)) return false;
    if (filters.last_activity_to && when(row.last_activity_at) > when(filters.last_activity_to) + 86400000 - 1) return false;
    return true;
  });

  const sortKey = SORT_FIELDS[body.sort_by] ? body.sort_by : 'potential_savings';
  const direction = body.sort_direction === 'asc' ? 1 : -1;
  selected.sort((left, right) => {
    const a = SORT_FIELDS[sortKey](left);
    const b = SORT_FIELDS[sortKey](right);
    if (a === null || a === undefined) return b === null || b === undefined ? lower(left.trading_name).localeCompare(lower(right.trading_name)) : 1;
    if (b === null || b === undefined) return -1;
    const compared = typeof a === 'string' ? a.localeCompare(String(b)) : Number(a) - Number(b);
    return compared === 0 ? lower(left.trading_name).localeCompare(lower(right.trading_name)) || left.id.localeCompare(right.id) : compared * direction;
  });
  return selected;
}

export function paginateMerchantRows(rows: any[], cursor: any, requestedPageSize: any) {
  const offset = /^\d+$/.test(String(cursor || '0')) ? Number(cursor || 0) : 0;
  const pageSize = Math.max(1, Math.min(PAGE_SIZE_MAX, Math.floor(number(requestedPageSize) || PAGE_SIZE_DEFAULT)));
  const page = rows.slice(offset, offset + pageSize);
  return {
    items: page.map(({ identifiers_search: _identifiers, search_text: _search, ...row }) => row),
    page_size: pageSize,
    cursor: String(offset),
    next_cursor: offset + page.length < rows.length ? String(offset + page.length) : null,
    total: rows.length,
  };
}

export function assertMerchantScopedRows(brandId: string, rows: any[], brandField = 'brand_id') {
  const violations = rows.filter((row) => text(row?.[brandField], 120) !== brandId).map((row) => text(row?.id, 120) || 'unknown');
  if (violations.length) throw new Error(`merchant_scope_violation:${brandField}:${violations.slice(0, 5).join(',')}`);
  return rows;
}

export function assertMerchantCommunicationThreads(scope: {
  brandId: string;
  activationIds?: string[];
  caseIds?: string[];
  informationRequestIds?: string[];
  attributedThreadIds?: string[];
}, rows: any[]) {
  const activations = new Set(scope.activationIds || []);
  const cases = new Set(scope.caseIds || []);
  const requests = new Set(scope.informationRequestIds || []);
  const attributed = new Set(scope.attributedThreadIds || []);
  const belongs = (row: any) =>
    (row.related_entity_type === 'Brand' && text(row.related_entity_id, 120) === scope.brandId) ||
    activations.has(text(row.recover_id, 120)) ||
    (row.related_entity_type === 'DealActivation' && activations.has(text(row.related_entity_id, 120))) ||
    (row.related_entity_type === 'NegotiationCase' && cases.has(text(row.related_entity_id, 120))) ||
    (row.related_entity_type === 'MerchantInformationRequest' && requests.has(text(row.related_entity_id, 120))) ||
    attributed.has(text(row.id, 120));
  const violations = rows.filter((row) => !belongs(row)).map((row) => text(row?.id, 120) || 'unknown');
  if (violations.length) throw new Error(`merchant_scope_violation:CommunicationThread:${violations.slice(0, 5).join(',')}`);
  return rows;
}

function portfolioKpis(summaries: any[], sources: Record<string, any>, now: string) {
  const nowMs = when(now);
  const monthStart = new Date(new Date(nowMs).getUTCFullYear(), new Date(nowMs).getUTCMonth(), 1).getTime();
  const sourceUnavailable = (...keys: string[]) => keys.some((key) => !sources[key]?.ok);
  const sourceIncomplete = (...keys: string[]) => keys.some((key) => sources[key]?.truncated);
  const active = summaries.filter((row) => ['active', 'new'].includes(row.merchant_status));
  const paymentVolume = summaries.reduce((total, row) => total + number(row.payment_volume?.value_minor), 0);
  const paymentCostVolume = summaries.reduce((total, row) => total + (row.payment_cost ? number(row.payment_cost.observed_volume_minor || row.payment_volume?.value_minor) : 0), 0);
  const paymentCostMinor = summaries.reduce((total, row) => total + number(row.payment_cost?.annual_cost_minor), 0);
  const potential = summaries.reduce((total, row) => total + number(row.potential_savings?.value_minor), 0);
  const potentialKnown = summaries.filter((row) => row.potential_savings).length;
  const potentialPct = summaries.map((row) => row.potential_savings?.pct).filter((value) => numberOrNull(value) !== null);
  const verified = summaries.reduce((total, row) => total + number(row.verified_savings?.value_minor), 0);
  const realized = summaries.reduce((total, row) => total + number(row.realized_savings?.value_minor), 0);
  const collected = summaries.reduce((total, row) => total + number(row.cambra_revenue?.collected_minor), 0);
  const monthInvoices = sources.invoices?.rows?.filter((row: any) => when(row.paid_at || row.updated_date) >= monthStart) || [];
  const monthCollected = monthInvoices.reduce((total: number, row: any) => total + Math.max(0, number(row.amount_paid)), 0) * 100;
  const recoverActive = summaries.filter((row) => row.recover.active);
  const recoverSavings = (sources.activations?.rows || [])
    .filter((row: any) => ACTIVE_RECOVER.has(String(row.status)))
    .reduce((total: number, row: any) => total + Math.max(0, number(row.potential_savings_yearly ?? row.estimated_savings_yearly ?? row.projected_savings_annual)), 0) * 100;
  const confidence = summaries.map((row) => row.data_confidence).filter((value) => numberOrNull(value) !== null);
  const newMerchants = summaries.filter((row) => when(row.joined_at) >= monthStart);
  const dependencies = {
    brands: ['Brand'], volume: ['DemandUnit'], cost: ['PaymentsAnalysisVerified'], analyzer: ['AnalyzerResult'], savings: ['MonthlySavingsReport'], revenue: ['Invoice'], recover: ['DealActivation'], attention: ['Approval', 'AutonomyIncident'], confidence: ['AnalyzerResult'],
  };
  return [
    metric({ key: 'total_merchants', label: 'Total Merchants', value: summaries.length, unit: 'count', truth_class: 'observed', as_of: now, dependencies: dependencies.brands, unavailable: sourceUnavailable('brands'), incomplete: sourceIncomplete('brands'), context: { new_this_month: newMerchants.length } }),
    metric({ key: 'active_merchants', label: 'Active Merchants', value: active.length, unit: 'count', truth_class: 'observed', as_of: now, dependencies: dependencies.brands, unavailable: sourceUnavailable('brands'), incomplete: sourceIncomplete('brands'), context: { percent_of_total: summaries.length ? Number((active.length / summaries.length * 100).toFixed(1)) : 0, definition: 'Brand.service_status active; merchants joined in the last 30 days retain New presentation status and are included.' } }),
    metric({ key: 'total_payment_volume', label: 'Total Payment Volume', value: paymentVolume, unit: 'EUR_minor_annualized', truth_class: 'observed', as_of: now, dependencies: dependencies.volume, unavailable: sourceUnavailable('demandUnits'), incomplete: sourceIncomplete('demandUnits'), context: { merchants_with_observed_volume: summaries.filter((row) => row.payment_volume).length, unknown_merchants: summaries.filter((row) => !row.payment_volume).length } }),
    metric({ key: 'average_payment_cost', label: 'Average Payment Cost', value: paymentCostVolume > 0 ? Number((paymentCostMinor / paymentCostVolume * 10000).toFixed(2)) : null, unit: 'basis_points', truth_class: 'observed', as_of: now, dependencies: dependencies.cost, unavailable: sourceUnavailable('verifiedAnalyses'), incomplete: sourceIncomplete('verifiedAnalyses'), context: { annual_cost_minor: paymentCostMinor || null, observed_merchant_count: summaries.filter((row) => row.payment_cost).length, unknown_merchants: summaries.filter((row) => !row.payment_cost).length } }),
    metric({ key: 'potential_savings', label: 'Potential Savings Identified', value: potential, unit: 'EUR_minor_annual', truth_class: 'modeled', as_of: now, dependencies: dependencies.analyzer, unavailable: sourceUnavailable('analyzerResults'), incomplete: sourceIncomplete('analyzerResults'), context: { average_pct: potentialPct.length ? Number((potentialPct.reduce((a, b) => a + Number(b), 0) / potentialPct.length).toFixed(2)) : null, modeled_merchants: potentialKnown, never_verified_by_this_metric: true } }),
    metric({ key: 'verified_savings', label: 'Verified Savings', value: verified, unit: 'EUR_minor_trailing_12_months', truth_class: 'verified', as_of: now, dependencies: dependencies.savings, unavailable: sourceUnavailable('savingsReports'), incomplete: sourceIncomplete('savingsReports'), context: { measurement_mode: 'fully_verified', statuses: ['verified', 'realized', 'invoiced', 'paid'] } }),
    metric({ key: 'realized_savings', label: 'Realized Savings', value: realized, unit: 'EUR_minor_trailing_12_months', truth_class: 'verified', as_of: now, dependencies: dependencies.savings, unavailable: sourceUnavailable('savingsReports'), incomplete: sourceIncomplete('savingsReports'), context: { measurement_mode: 'fully_verified', statuses: ['realized', 'invoiced', 'paid'] } }),
    metric({ key: 'cambra_revenue', label: 'CAMBRA Revenue', value: collected, unit: 'EUR_minor_collected', truth_class: 'verified', as_of: now, dependencies: dependencies.revenue, unavailable: sourceUnavailable('invoices'), incomplete: sourceIncomplete('invoices'), context: { collected_this_month_minor: monthCollected, revenue_class: 'collected', earned_invoiced_outstanding_available_in_drilldown: true } }),
    metric({ key: 'recover_active', label: 'Recover Active', value: recoverActive.length, unit: 'merchant_count', truth_class: 'observed', as_of: now, dependencies: dependencies.recover, unavailable: sourceUnavailable('activations'), incomplete: sourceIncomplete('activations'), context: { modeled_savings_in_progress_minor: Math.round(recoverSavings), savings_truth_class: 'modeled' } }),
    metric({ key: 'needs_attention', label: 'Needs Attention', value: summaries.filter((row) => row.needs_attention > 0).length, unit: 'merchant_count', truth_class: 'observed', as_of: now, dependencies: dependencies.attention, unavailable: sourceUnavailable('approvals', 'incidents'), incomplete: sourceIncomplete('approvals', 'incidents'), context: { approvals: summaries.reduce((a, row) => a + row.attention_breakdown.approvals, 0), incidents: summaries.reduce((a, row) => a + row.attention_breakdown.incidents, 0) } }),
    metric({ key: 'average_data_confidence', label: 'Average Data Confidence', value: confidence.length ? Number((confidence.reduce((a, b) => a + Number(b), 0) / confidence.length).toFixed(1)) : null, unit: 'percent', truth_class: 'observed', as_of: now, dependencies: dependencies.confidence, unavailable: sourceUnavailable('analyzerResults'), incomplete: sourceIncomplete('analyzerResults'), context: { high_confidence_merchants: confidence.filter((value) => Number(value) >= 80).length, measured_merchants: confidence.length, unknown_merchants: summaries.length - confidence.length } }),
    metric({ key: 'new_merchants', label: 'New Merchants', value: newMerchants.length, unit: 'count_this_month', truth_class: 'observed', as_of: now, dependencies: dependencies.brands, unavailable: sourceUnavailable('brands'), incomplete: sourceIncomplete('brands'), context: { month_start: new Date(monthStart).toISOString() } }),
  ];
}

async function readSource(svc: any, entity: string, options: { query?: any; sort?: string; limit?: number; critical?: boolean } = {}) {
  const limit = Math.min(LIST_SOURCE_LIMIT, Math.max(1, options.limit || LIST_SOURCE_LIMIT));
  try {
    const rows = options.query
      ? await svc.entities[entity].filter(options.query, options.sort || '-created_date', limit)
      : await svc.entities[entity].list(options.sort || '-created_date', limit);
    return { ok: true, rows: list(rows), truncated: list(rows).length >= limit, limit };
  } catch (error) {
    if (options.critical) throw new Error(`critical_merchant_source_unavailable:${entity}`);
    console.error(`Founder Merchants V2 source unavailable: ${entity}`, error);
    return { ok: false, rows: [], truncated: false, limit, error_code: `${entity.toUpperCase()}_READ_FAILED` };
  }
}

async function collectSummarySources(svc: any) {
  const [brands, demandUnits, verifiedAnalyses, analyzerResults, activations, savingsReports, invoices, integrations, lifecycles, approvals, incidents, documents, marketContexts] = await Promise.all([
    readSource(svc, 'Brand', { sort: '-created_date', critical: true }),
    readSource(svc, 'DemandUnit', { query: { data_classification: 'production', is_demo: false, vertical: 'payments' }, sort: '-updated_at' }),
    readSource(svc, 'PaymentsAnalysisVerified', { sort: '-created_date' }),
    readSource(svc, 'AnalyzerResult', { sort: '-created_date' }),
    readSource(svc, 'DealActivation', { sort: '-last_updated' }),
    readSource(svc, 'MonthlySavingsReport', { sort: '-month' }),
    readSource(svc, 'Invoice', { sort: '-issued_at' }),
    readSource(svc, 'Integration', { sort: '-last_sync_at' }),
    readSource(svc, 'RevenueLifecycle', { sort: '-updated_at' }),
    readSource(svc, 'Approval', { query: { status: { $in: ['pending', 'resolving'] } }, sort: '-created_date' }),
    readSource(svc, 'AutonomyIncident', { query: { status: 'open' }, sort: '-last_seen_at' }),
    readSource(svc, 'Document', { sort: '-uploaded_at' }),
    readSource(svc, 'MerchantMarketContext', { sort: '-last_resolved_at' }),
  ]);
  return { brands, demandUnits, verifiedAnalyses, analyzerResults, activations, savingsReports, invoices, integrations, lifecycles, approvals, incidents, documents, marketContexts };
}

function sourceRows(sources: Record<string, any>) {
  return Object.fromEntries(Object.entries(sources).map(([key, source]) => [key, source.rows]));
}

export function scopeMerchantPortfolioSources(sources: Record<string, any>, merchantIds: string[]) {
  const ids = new Set(merchantIds.map((id) => text(id, 120)).filter(Boolean));
  const scoped: Record<string, any> = {};
  for (const [key, source] of Object.entries(sources)) {
    const rows = list((source as any)?.rows);
    const scopedRows = key === 'brands'
      ? rows.filter((row) => ids.has(text(row.id, 120)))
      : key === 'documents'
        ? rows.filter((row) => row.owner_type === 'brand' && ids.has(text(row.owner_id, 120)))
        : key === 'incidents'
          ? rows.filter((row) => ['Brand', 'Merchant'].includes(String(row.subject_type)) && ids.has(text(row.subject_id, 120)))
          : rows.filter((row) => ids.has(text(row.brand_id, 120)));
    scoped[key] = { ...(source as any), rows: scopedRows };
  }
  return scoped;
}

export function buildMerchantPortfolioKpis(summaries: any[], sources: Record<string, any>, now = new Date().toISOString()) {
  return portfolioKpis(summaries, scopeMerchantPortfolioSources(sources, summaries.map((row) => row.id)), now);
}

function defaultViews() {
  return [
    { key: 'all', label: 'All', filters: {} },
    { key: 'new', label: 'New', filters: { status: ['new'] } },
    { key: 'active', label: 'Active', filters: { status: ['active'] } },
    { key: 'recover', label: 'Recover', filters: { recover_status: ['active'] } },
    { key: 'needs_attention', label: 'Needs Attention', filters: { needs_attention: true } },
  ];
}

function filterOptions(rows: any[]) {
  return {
    status: unique(rows.map((row) => row.merchant_status)).sort(),
    country: unique(rows.map((row) => row.country)).sort(),
    psp: unique(rows.flatMap((row) => row.psps)).sort(),
    recover_status: unique(rows.map((row) => row.recover.status)).sort(),
    current_phase: unique(rows.map((row) => row.current_phase)).sort(),
    data_source: ['connected', 'documents', 'manual'],
    sort: Object.keys(SORT_FIELDS),
  };
}

function compactSavedView(row: any) {
  return {
    id: row.id,
    view_key: text(row.view_key, 160),
    name: text(row.name, 120),
    filters: sanitizeMerchantAdminValue(row.config_json?.filters || {}),
    sort_by: SORT_FIELDS[row.config_json?.sort_by] ? row.config_json.sort_by : 'potential_savings',
    sort_direction: row.config_json?.sort_direction === 'asc' ? 'asc' : 'desc',
    updated_at: row.updated_at || row.created_at || null,
  };
}

async function savedViews(svc: any, actorEmail: string) {
  const rows = await svc.entities.FounderSavedView.filter({ view_type: 'merchant_portfolio_v2', created_by: actorEmail }, '-updated_at', 200);
  return rows.map(compactSavedView);
}

function safeViewConfig(body: any) {
  const filters = body?.filters && typeof body.filters === 'object' ? body.filters : {};
  const allowed = ['status', 'country', 'psp', 'payment_volume_min_eur', 'payment_volume_max_eur', 'payment_cost_min_pct', 'payment_cost_max_pct', 'potential_savings_min_pct', 'potential_savings_max_pct', 'verified_savings_min_eur', 'verified_savings_max_eur', 'recover_status', 'current_phase', 'data_source', 'data_confidence_min', 'data_confidence_max', 'needs_attention', 'joined_from', 'joined_to', 'last_activity_from', 'last_activity_to'];
  const clean: Record<string, any> = {};
  for (const key of allowed) if (filters[key] !== undefined) clean[key] = sanitizeMerchantAdminValue(filters[key]);
  return { filters: clean, sort_by: SORT_FIELDS[body?.sort_by] ? body.sort_by : 'potential_savings', sort_direction: body?.sort_direction === 'asc' ? 'asc' : 'desc' };
}

async function saveView(svc: any, user: any, body: any) {
  const name = text(body.name, 120);
  if (!name) return { ok: false, error: 'saved_view_name_required', http_status: 400 };
  const actor = text(user.email, 240);
  const key = text(body.view_key, 160) || `merchant:${actor}:${lower(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)}`;
  const existing = await svc.entities.FounderSavedView.filter({ view_key: key, view_type: 'merchant_portfolio_v2', created_by: actor }, '-updated_at', 2);
  const payload = { view_key: key, name, view_type: 'merchant_portfolio_v2', config_json: safeViewConfig(body), created_by: actor, updated_at: new Date().toISOString() };
  const row = existing[0]
    ? await svc.entities.FounderSavedView.update(existing[0].id, payload)
    : await svc.entities.FounderSavedView.create({ ...payload, created_at: payload.updated_at });
  return { ok: true, view: compactSavedView(row) };
}

async function deleteView(svc: any, user: any, body: any) {
  const id = text(body.saved_view_id, 120);
  if (!id) return { ok: false, error: 'saved_view_id_required', http_status: 400 };
  let row:any;
  try{row=await svc.entities.FounderSavedView.get(id);}
  catch(error:any){return {ok:false,error:'saved_view_authority_unavailable',error_code:text(error?.code||error?.message||error,160),http_status:503};}
  if (!row || row.view_type !== 'merchant_portfolio_v2' || row.created_by !== user.email) return { ok: false, error: 'saved_view_not_found', http_status: 404 };
  await svc.entities.FounderSavedView.delete(id);
  return { ok: true, deleted: true, saved_view_id: id };
}

async function loadMerchant(svc: any, brandId: string) {
  if (!brandId) return null;
  let brand:any;
  try{brand=await svc.entities.Brand.get(brandId);}
  catch(error:any){const unavailable:any=new Error('merchant_authority_unavailable');unavailable.code='merchant_authority_unavailable';unavailable.status=503;unavailable.cause=text(error?.code||error?.message||error,160);throw unavailable;}
  // `anon_session_id` is cleared only when an anonymous Analyzer Brand is
  // claimed by a registered user. Until then it is not a Merchant.
  if (!brand || brand.is_demo === true || text(brand.anon_session_id)) return null;
  return brand;
}

async function scoped(svc: any, entity: string, brandId: string, options: { field?: string; sort?: string; limit?: number; query?: any } = {}) {
  const field = options.field || 'brand_id';
  const query = { ...(options.query || {}), [field]: brandId };
  const source = await readSource(svc, entity, { query, sort: options.sort, limit: options.limit || 200 });
  if (!source.ok) return source;
  assertMerchantScopedRows(brandId, source.rows, field);
  return source;
}

function projection(name: string, source: any, rows: any[], summary: string, extra: any = {}) {
  return {
    block: name,
    status: source?.ok ? (source.truncated ? 'PARTIAL' : 'AVAILABLE') : 'UNAVAILABLE',
    summary,
    data: source?.ok ? sanitizeMerchantAdminValue(rows) : null,
    dependency: sourceState(name, source),
    ...extra,
  };
}

export async function collectMerchantBlock(svc: any, brand: any, block: string) {
  const id = text(brand.id, 120);
  if (!MERCHANT_BLOCKS.includes(block as any)) return { ok: false, error: 'unsupported_merchant_block', supported_blocks: MERCHANT_BLOCKS, http_status: 400 };
  if (block === 'overview') {
    const [demand, verified, analyzer, activations, reports, invoices, lifecycles, integrations, documents, contexts] = await Promise.all([
      scoped(svc, 'DemandUnit', id, { query: { data_classification: 'production', is_demo: false, vertical: 'payments' }, sort: '-updated_at' }), scoped(svc, 'PaymentsAnalysisVerified', id, { sort: '-created_date' }), scoped(svc, 'AnalyzerResult', id, { sort: '-created_date' }), scoped(svc, 'DealActivation', id, { sort: '-last_updated' }), scoped(svc, 'MonthlySavingsReport', id, { sort: '-month' }), scoped(svc, 'Invoice', id, { sort: '-issued_at' }), scoped(svc, 'RevenueLifecycle', id, { sort: '-updated_at' }), scoped(svc, 'Integration', id, { sort: '-last_sync_at' }), scoped(svc, 'Document', id, { field: 'owner_id', query: { owner_type: 'brand' }, sort: '-uploaded_at' }), scoped(svc, 'MerchantMarketContext', id, { sort: '-last_resolved_at' }),
    ]);
    const summarySources = { demandUnits: demand, verifiedAnalyses: verified, analyzerResults: analyzer, activations, savingsReports: reports, invoices, lifecycles, integrations, documents, marketContexts: contexts };
    const summary = buildMerchantSummaries({ brands: [brand], demandUnits: demand.rows, verifiedAnalyses: verified.rows, analyzerResults: analyzer.rows, activations: activations.rows, savingsReports: reports.rows, invoices: invoices.rows, integrations: integrations.rows, lifecycles: lifecycles.rows, documents: documents.rows, marketContexts: contexts.rows, sourceStatus: summarySources })[0];
    return { ok: true, version: FOUNDER_MERCHANTS_V2_VERSION, merchant_id: id, block, status: combinedSourceStatus(Object.values(summarySources)), summary, dependencies: [demand, verified, analyzer, activations, reports, invoices, lifecycles, integrations, documents, contexts].map((source, index) => sourceState(['DemandUnit', 'PaymentsAnalysisVerified', 'AnalyzerResult', 'DealActivation', 'MonthlySavingsReport', 'Invoice', 'RevenueLifecycle', 'Integration', 'Document', 'MerchantMarketContext'][index], source)) };
  }
  if (block === 'payments_infrastructure') {
    const [integrations, profile, demand, verified] = await Promise.all([scoped(svc, 'Integration', id, { sort: '-last_sync_at' }), scoped(svc, 'PaymentsProfile', id, { sort: '-created_date', limit: 10 }), scoped(svc, 'DemandUnit', id, { query: { data_classification: 'production', is_demo: false, vertical: 'payments' }, sort: '-updated_at' }), scoped(svc, 'PaymentsAnalysisVerified', id, { sort: '-created_date' })]);
    const safeIntegrations = integrations.rows.map((row: any) => ({ id: row.id, provider: row.provider, category: row.category, status: row.status, connected_at: row.connected_at, last_sync_at: row.last_sync_at, last_sync_status: row.last_sync_status, provider_account_id: row.provider_account_id, integration_data_quality: row.integration_data_quality }));
    const status = combinedSourceStatus([integrations, profile, demand, verified]);
    return { ok: true, merchant_id: id, block, status, summary: demand.ok ? `${unique(demand.rows.map((row: any) => row.current_provider_slug)).join(' + ') || 'No observed PSP'} · ${unique(demand.rows.map((row: any) => row.channel)).join(' + ') || 'Channel unknown'} · ${unique(demand.rows.map((row: any) => row.currency)).join(' + ') || 'Currency unknown'}` : 'Payments evidence unavailable', data: sanitizeMerchantAdminValue({ integrations: safeIntegrations, profile: profile.ok ? profile.rows[0] || null : null, demand_units: demand.rows, verified_analyses: verified.rows }), dependencies: [sourceState('Integration', integrations), sourceState('PaymentsProfile', profile), sourceState('DemandUnit', demand), sourceState('PaymentsAnalysisVerified', verified)] };
  }
  if (block === 'analyzer_opportunities') {
    const [analyzer, opportunities] = await Promise.all([scoped(svc, 'AnalyzerResult', id, { sort: '-created_date', limit: 50 }), scoped(svc, 'RoutingOpportunity', id, { sort: '-created_at', limit: 100 })]);
    const latest = analyzer.rows[0] || null;
    const status = combinedSourceStatus([analyzer, opportunities]);
    return { ok: true, merchant_id: id, block, status, summary: !analyzer.ok ? 'Analyzer evidence unavailable' : latest ? `${opportunities.ok ? opportunities.rows.length : 'Unknown'} opportunities · ${analyzerPotential(latest) ?? 'Unknown'} EUR/year modeled` : 'Not analyzed yet', data: sanitizeMerchantAdminValue({ latest_analysis: latest, analysis_history: analyzer.rows.slice(0, 10), routing_opportunities: opportunities.rows }), truth_boundary: 'Analyzer and routing opportunities are modeled/counterfactual until verified by MonthlySavingsReport evidence.', dependencies: [sourceState('AnalyzerResult', analyzer), sourceState('RoutingOpportunity', opportunities)] };
  }
  if (block === 'recover_savings') {
    const [activations, reports, cases, mandates, migrations] = await Promise.all([scoped(svc, 'DealActivation', id, { sort: '-last_updated' }), scoped(svc, 'MonthlySavingsReport', id, { sort: '-month' }), scoped(svc, 'NegotiationCase', id, { sort: '-started_at' }), scoped(svc, 'Mandate', id, { sort: '-signed_at' }), scoped(svc, 'MigrationTask', id, { sort: '-updated_at' })]);
    const status = combinedSourceStatus([activations, reports, cases, mandates, migrations]);
    const identified = activations.ok ? Math.round(activations.rows.reduce((a: number, row: any) => a + Math.max(0, number(row.potential_savings_yearly)), 0) * 100) : null;
    const accepted = reports.ok ? Math.round(reports.rows.filter((row: any) => ['proposed', 'evidence_submitted', 'under_review', 'verified', 'realized', 'invoiced', 'paid'].includes(String(row.verification_status))).reduce((a: number, row: any) => a + Math.max(0, number(row.savings)), 0) * 100) : null;
    const verifiedMinor = reports.ok ? Math.round(reports.rows.filter((row: any) => row.measurement_mode === 'fully_verified' && ['verified', 'realized', 'invoiced', 'paid'].includes(String(row.verification_status))).reduce((a: number, row: any) => a + Math.max(0, number(row.savings)), 0) * 100) : null;
    const realizedMinor = reports.ok ? Math.round(reports.rows.filter((row: any) => row.measurement_mode === 'fully_verified' && ['realized', 'invoiced', 'paid'].includes(String(row.verification_status))).reduce((a: number, row: any) => a + Math.max(0, number(row.savings)), 0) * 100) : null;
    return { ok: true, merchant_id: id, block, status, summary: !activations.ok ? 'Recover evidence unavailable' : activations.rows.some((row: any) => ACTIVE_RECOVER.has(String(row.status))) ? 'Recover active' : 'Recover not active', data: sanitizeMerchantAdminValue({ funnel: { identified_minor: identified, accepted_minor: accepted, verified_minor: verifiedMinor, realized_minor: realizedMinor }, activations: activations.rows, savings_reports: reports.rows, negotiations: cases.rows, mandates: mandates.rows, migrations: migrations.rows }), truth_boundary: 'Identified, accepted, verified and realized savings remain separate. Null means the canonical dependency could not prove a value; it is never substituted with zero.', dependencies: [sourceState('DealActivation', activations), sourceState('MonthlySavingsReport', reports), sourceState('NegotiationCase', cases), sourceState('Mandate', mandates), sourceState('MigrationTask', migrations)] };
  }
  if (block === 'data_documents') {
    const [integrations, documents, imports, verified, analyzer] = await Promise.all([scoped(svc, 'Integration', id, { sort: '-last_sync_at' }), scoped(svc, 'Document', id, { field: 'owner_id', query: { owner_type: 'brand' }, sort: '-uploaded_at' }), scoped(svc, 'StatementImport', id, { sort: '-imported_at' }), scoped(svc, 'PaymentsAnalysisVerified', id, { sort: '-created_date' }), scoped(svc, 'AnalyzerResult', id, { sort: '-created_date' })]);
    const safeIntegrations = integrations.rows.map((row: any) => ({ id: row.id, provider: row.provider, category: row.category, status: row.status, connected_at: row.connected_at, last_sync_at: row.last_sync_at, last_sync_status: row.last_sync_status, integration_data_quality: row.integration_data_quality }));
    const status = combinedSourceStatus([integrations, documents, imports, verified, analyzer]);
    const connectionCount = integrations.ok ? safeIntegrations.filter((row: any) => row.status === 'connected').length : null;
    const documentCount = documents.ok && imports.ok ? documents.rows.length + imports.rows.length : null;
    return { ok: true, merchant_id: id, block, status, summary: `${analyzer.ok ? confidenceLabel(dataConfidence(analyzer.rows[0])) : 'Confidence unavailable'} · ${connectionCount === null ? 'Connections unavailable' : `${connectionCount} connection(s)`} · ${documentCount === null ? 'Documents unavailable' : `${documentCount} document(s)`}`, data: sanitizeMerchantAdminValue({ data_confidence: analyzer.ok ? dataConfidence(analyzer.rows[0]) : null, connected_data: safeIntegrations, documents: documents.rows.map((row: any) => ({ id: row.id, title: row.title, file_name: row.file_name, file_url: row.file_url, category: row.category, uploaded_at: row.uploaded_at, uploaded_by: row.uploaded_by, review_status: row.review_status, checksum: row.checksum })), statement_imports: imports.rows, verified_evidence: verified.rows, missing_or_conflicting_data: analyzer.ok ? unique([...(analyzer.rows[0]?.assumptions || []), ...(analyzer.rows[0]?.details?.engine_result?.assumptions || [])]) : null }), dependencies: [sourceState('Integration', integrations), sourceState('Document', documents), sourceState('StatementImport', imports), sourceState('PaymentsAnalysisVerified', verified), sourceState('AnalyzerResult', analyzer)] };
  }
  if (block === 'cambra_activity') {
    const [tasks, events] = await Promise.all([scoped(svc, 'AgentTask', id, { sort: '-created_date', limit: 200 }), scoped(svc, 'Event', id, { sort: '-created_date', limit: 300 })]);
    const activity: any[] = [...tasks.rows.map((row: any) => ({ at: row.started_at || row.created_date, type: 'agent', title: text(row.output_summary || row.input_summary || row.task_type, 240), actor: text(row.agent_name, 100), status: row.status, next: row.status === 'waiting_approval' ? 'Founder approval required' : row.status === 'waiting_input' ? 'Waiting for input' : null, related_entity_type: row.related_entity_type, related_entity_id: row.related_entity_id })), ...events.rows.map((row: any) => ({ at: row.processed_at || row.created_date, type: 'system', title: text(row.event_type, 200).replace(/[._]/g, ' '), actor: text(row.source, 100), status: row.status, next: null, related_entity_type: row.entity_type, related_entity_id: row.entity_id }))].sort((a, b) => when(b.at) - when(a.at)).slice(0, 300);
    const status = combinedSourceStatus([tasks, events]);
    const working = tasks.ok ? tasks.rows.filter((row: any) => ['running', 'queued', 'retrying'].includes(String(row.status))).length : null;
    return { ok: true, merchant_id: id, block, status, summary: `${working === null ? 'Agent activity unavailable' : `${working} agents working`} · Updated ${activity[0]?.at || 'unknown'}`, data: sanitizeMerchantAdminValue({ right_now: activity.filter((row) => ['running', 'queued', 'retrying', 'waiting_approval', 'waiting_input'].includes(String(row.status))).slice(0, 20), next: activity.filter((row) => row.next).slice(0, 20), timeline: activity }), dependencies: [sourceState('AgentTask', tasks), sourceState('Event', events)] };
  }
  if (block === 'attention_approvals') {
    const [approvals, incidents, success] = await Promise.all([scoped(svc, 'Approval', id, { query: { status: { $in: ['pending', 'resolving'] } }, sort: '-created_date' }), scoped(svc, 'AutonomyIncident', id, { field: 'subject_id', query: { status: 'open', subject_type: { $in: ['Brand', 'Merchant'] } }, sort: '-last_seen_at' }), scoped(svc, 'CustomerSuccessSignal', id, { query: { status: 'open' }, sort: '-updated_at' })]);
    const cards = [...approvals.rows.map((row: any) => ({ id: row.id, type: 'approval', title: row.action_type, why: text(row.draft_content, 400), impact: row.draft_payload_json?.estimated_financial_impact ?? null, recommendation: row.draft_payload_json?.ai_recommendation || null, actions: ['approve', 'reject', 'review'], authority_host: 'founderOSCommand', status: row.status, risk_level: row.risk_level, expires_at: row.expires_at })), ...incidents.rows.map((row: any) => ({ id: row.id, type: 'incident', title: row.summary, why: row.details_json?.message || row.root_cause || null, impact: row.financial_impact_minor || null, recommendation: row.recovery_json?.recommended_action || null, actions: ['review'], status: row.status, severity: row.severity })), ...success.rows.map((row: any) => ({ id: row.id, type: 'customer_success', title: row.type, why: row.reason_codes || [], impact: row.estimated_value || null, recommendation: row.recommended_action || null, actions: ['review'], status: row.status, confidence: row.confidence }))];
    const status = combinedSourceStatus([approvals, incidents, success]);
    return { ok: true, merchant_id: id, block, status, summary: cards.length ? `${cards.length} action(s) required${status === 'AVAILABLE' ? '' : ' (known lower bound)'}` : status === 'AVAILABLE' ? 'Nothing required' : 'Attention state unavailable', data: sanitizeMerchantAdminValue(cards), authority_boundary: 'This read model never approves, rejects or executes. Mutations remain in founderOSCommand and existing domain controls. A clear state is shown only when every required source is available and untruncated.', dependencies: [sourceState('Approval', approvals), sourceState('AutonomyIncident', incidents), sourceState('CustomerSuccessSignal', success)] };
  }
  if (block === 'company_contacts') {
    const context = await scoped(svc, 'MerchantMarketContext', id, { sort: '-last_resolved_at', limit: 5 });
    const owner = brand.created_by ? await readSource(svc, 'User', { query: { email: brand.created_by }, sort: '-created_date', limit: 2 }) : { ok: true, rows: [], truncated: false, limit: 2 };
    return { ok: true, merchant_id: id, block, status: combinedSourceStatus([context, owner]), summary: `${text(context.rows[0]?.legal_entity_country || brand.billing_country || brand.country, 8) || 'Country unknown'} · ${text(brand.category, 80) || 'Sector unknown'} · Joined ${isoOrNull(brand.created_date) || 'unknown'}`, data: sanitizeMerchantAdminValue({ company: { trading_name: brand.name, legal_name: brand.billing_legal_name, country: context.rows[0]?.legal_entity_country || brand.billing_country || brand.country, registered_address: [brand.billing_address_line1, brand.billing_address_line2, brand.billing_postal_code, brand.billing_city, brand.billing_country].filter(Boolean).join(', ') || null, vat_number: brand.vat_number || null, tax_id: brand.tax_id || null, website: brand.website, sector: brand.category, company_size: brand.size || brand.annual_revenue || null, joined_at: brand.created_date || null, merchant_id: id }, contacts: [{ name: brand.contact_name || null, email: brand.contact_email || brand.created_by || null, role: 'Primary merchant contact', source: 'Brand' }, ...owner.rows.map((row: any) => ({ name: row.full_name || null, email: row.email, role: row.role, last_access: null, source: 'User' }))] }), privacy_boundary: 'Only canonical Brand contact and exact owner-account match are returned; CAMBRA does not infer additional contacts.', dependencies: [sourceState('MerchantMarketContext', context), sourceState('User', owner)] };
  }
  if (block === 'billing_revenue') {
    const [invoices, reports, economics, payments] = await Promise.all([scoped(svc, 'Invoice', id, { sort: '-issued_at' }), scoped(svc, 'MonthlySavingsReport', id, { sort: '-month' }), scoped(svc, 'MerchantUnitEconomics', id, { sort: '-calculated_at', limit: 10 }), scoped(svc, 'PaymentEvent', id, { sort: '-occurred_at', limit: 100 })]);
    const earned = reports.rows.filter((row: any) => ['calculated', 'invoiced', 'paid'].includes(String(row.status))).reduce((a: number, row: any) => a + Math.max(0, number(row.node_fee ?? row.fee_net_amount)), 0);
    const invoiced = invoices.rows.filter((row: any) => !['draft', 'void'].includes(String(row.status))).reduce((a: number, row: any) => a + Math.max(0, number(row.total_amount)), 0);
    const collected = invoices.rows.reduce((a: number, row: any) => a + Math.max(0, number(row.amount_paid)), 0);
    const outstanding = invoices.rows.reduce((a: number, row: any) => a + Math.max(0, number(row.balance_due)), 0);
    const status = combinedSourceStatus([invoices, reports, economics, payments]);
    return { ok: true, merchant_id: id, block, status, summary: !invoices.ok ? 'Billing evidence unavailable' : `${Math.round(collected * 100)} EUR minor collected · ${outstanding > 0 ? 'Outstanding' : 'Up to date'}`, data: sanitizeMerchantAdminValue({ revenue: { earned_minor: reports.ok ? Math.round(earned * 100) : null, invoiced_minor: invoices.ok ? Math.round(invoiced * 100) : null, collected_minor: invoices.ok ? Math.round(collected * 100) : null, outstanding_minor: invoices.ok ? Math.round(outstanding * 100) : null, currency: 'EUR', truth: { earned: 'contractual_from_reports', invoiced: 'observed_invoice', collected: 'verified_payment', outstanding: 'observed_invoice_balance' }, evidence_status: { earned: reports.ok ? reports.truncated ? 'PARTIAL' : 'AVAILABLE' : 'UNAVAILABLE', invoices: invoices.ok ? invoices.truncated ? 'PARTIAL' : 'AVAILABLE' : 'UNAVAILABLE', reconciliation: payments.ok ? payments.truncated ? 'PARTIAL' : 'AVAILABLE' : 'UNAVAILABLE' } }, invoices: invoices.rows, savings_reports: reports.rows, unit_economics: economics.ok ? economics.rows[0] || null : null, payment_events: payments.rows.map((row: any) => ({ id: row.id, event_type: row.event_type, amount: row.amount, currency: row.currency, processor: row.processor, occurred_at: row.occurred_at, invoice_id: row.invoice_id, error_code: row.error_code })) }), dependencies: [sourceState('Invoice', invoices), sourceState('MonthlySavingsReport', reports), sourceState('MerchantUnitEconomics', economics), sourceState('PaymentEvent', payments)] };
  }
  if (block === 'contracts_legal') {
    const [mandates, activations, documents] = await Promise.all([scoped(svc, 'Mandate', id, { sort: '-signed_at' }), scoped(svc, 'DealActivation', id, { sort: '-last_updated', limit: 200 }), scoped(svc, 'Document', id, { field: 'owner_id', query: { owner_type: 'brand' }, sort: '-uploaded_at' })]);
    const activationIds = unique(activations.rows.map((row: any) => row.id));
    const contracts = activationIds.length ? await readSource(svc, 'Contract', { query: { deal_activation_id: { $in: activationIds } }, sort: '-start_date', limit: 200 }) : { ok: true, rows: [], truncated: false, limit: 200 };
    if (contracts.ok && contracts.rows.some((row: any) => !activationIds.includes(text(row.deal_activation_id, 120)))) throw new Error('merchant_scope_violation:Contract.deal_activation_id');
    const status = combinedSourceStatus([mandates, activations, contracts, documents]);
    return { ok: true, merchant_id: id, block, status, summary: !mandates.ok ? 'Contract evidence unavailable' : mandates.rows[0] ? `${mandates.rows[0].document_version || 'Recover'} · ${mandates.rows[0].status}` : 'No accepted Recover mandate', data: sanitizeMerchantAdminValue({ mandates: mandates.rows, contracts: contracts.rows, contract_documents: documents.rows.filter((row: any) => lower(row.category).includes('contract') || lower(row.title).includes('contract')), merchant_legal_identity: { legal_name: brand.billing_legal_name, vat_number: brand.vat_number, vies_status: brand.vies_status, vies_checked_at: brand.vies_checked_at, billing_country: brand.billing_country }, omitted_legacy_contracts: { status: 'UNRESOLVED_NOT_INCLUDED', reason: 'Legacy Contract rows without an exact merchant DealActivation relationship cannot be safely attributed by email.' } }), boundary: 'Merchant-specific contracts require exact DealActivation scope. General legal policy and email-only legacy attribution are outside this block.', dependencies: [sourceState('Mandate', mandates), sourceState('DealActivation', activations), sourceState('Contract', contracts), sourceState('Document', documents)] };
  }
  if (block === 'communications') {
    // CommunicationThread deliberately has no brand_id. Resolve only through
    // explicit canonical relationships; never scan or attribute by email.
    const [activations, cases, requests, attributions] = await Promise.all([
      scoped(svc, 'DealActivation', id, { sort: '-last_updated', limit: 200 }),
      scoped(svc, 'NegotiationCase', id, { sort: '-started_at', limit: 200 }),
      scoped(svc, 'MerchantInformationRequest', id, { sort: '-created_date', limit: 200 }),
      scoped(svc, 'AcquisitionAttribution', id, { sort: '-attributed_at', limit: 50 }),
    ]);
    const activationIds = unique(activations.rows.map((row: any) => row.id));
    const caseIds = unique(cases.rows.map((row: any) => row.id));
    const informationRequestIds = unique(requests.rows.map((row: any) => row.id));
    const attributedThreadIds = unique(attributions.rows.map((row: any) => row.thread_id));
    const emptySource = { ok: true, rows: [], truncated: false, limit: 0 };
    const threadSources = await Promise.all([
      readSource(svc, 'CommunicationThread', { query: { related_entity_type: 'Brand', related_entity_id: id }, sort: '-last_message_at', limit: 100 }),
      activationIds.length ? readSource(svc, 'CommunicationThread', { query: { recover_id: { $in: activationIds } }, sort: '-last_message_at', limit: 200 }) : emptySource,
      activationIds.length ? readSource(svc, 'CommunicationThread', { query: { related_entity_type: 'DealActivation', related_entity_id: { $in: activationIds } }, sort: '-last_message_at', limit: 100 }) : emptySource,
      caseIds.length ? readSource(svc, 'CommunicationThread', { query: { related_entity_type: 'NegotiationCase', related_entity_id: { $in: caseIds } }, sort: '-last_message_at', limit: 200 }) : emptySource,
      informationRequestIds.length ? readSource(svc, 'CommunicationThread', { query: { related_entity_type: 'MerchantInformationRequest', related_entity_id: { $in: informationRequestIds } }, sort: '-last_message_at', limit: 100 }) : emptySource,
      attributedThreadIds.length ? readSource(svc, 'CommunicationThread', { query: { id: { $in: attributedThreadIds } }, sort: '-last_message_at', limit: 50 }) : emptySource,
    ]);
    const threadMap = new Map<string, any>();
    for (const source of threadSources) for (const row of source.rows || []) threadMap.set(text(row.id, 120), row);
    const threadRows = [...threadMap.values()].sort((left, right) => when(right.last_message_at || right.created_date) - when(left.last_message_at || left.created_date));
    assertMerchantCommunicationThreads({ brandId: id, activationIds, caseIds, informationRequestIds, attributedThreadIds }, threadRows);
    const threadIds = new Set(threadRows.map((row: any) => text(row.id, 120)));
    const messages = threadIds.size ? await readSource(svc, 'CommunicationMessage', { query: { thread_id: { $in: [...threadIds] } }, sort: '-created_date', limit: 500 }) : { ok: true, rows: [], truncated: false, limit: 500 };
    if (messages.ok && messages.rows.some((row: any) => !threadIds.has(text(row.thread_id, 120)))) throw new Error('merchant_scope_violation:CommunicationMessage.thread_id');
    const safeMessages = messages.rows.map((row: any) => ({ id: row.id, thread_id: row.thread_id, direction: row.direction, channel: row.channel, from_email: row.from_email, to_emails: row.to_emails, subject: row.subject, text_body: text(row.text_body, 4000), agent_name: row.agent_name, send_status: row.send_status, sent_at: row.sent_at, received_at: row.received_at, approval_id: row.approval_id, provider: row.provider }));
    const relationshipSources = [activations, cases, requests, attributions, ...threadSources];
    const coverage = relationshipSources.some((source: any) => !source.ok || source.truncated) || !messages.ok || messages.truncated ? 'PARTIAL' : 'AVAILABLE';
    return { ok: true, merchant_id: id, block, status: coverage, summary: `Last contact ${threadRows[0]?.last_message_at || 'unknown'} · ${threadRows.filter((row: any) => row.status !== 'closed').length} active conversation(s)`, data: sanitizeMerchantAdminValue({ merchant_cambra: threadRows.filter((row: any) => !row.provider_id), cambra_providers: threadRows.filter((row: any) => row.provider_id), messages: safeMessages }), scope_boundary: 'Threads are included only through Brand, DealActivation, NegotiationCase, MerchantInformationRequest or deterministic AcquisitionAttribution relationships. Email matching is never used.', dependencies: [sourceState('DealActivation', activations), sourceState('NegotiationCase', cases), sourceState('MerchantInformationRequest', requests), sourceState('AcquisitionAttribution', attributions), ...threadSources.map((source, index) => sourceState(`CommunicationThread.scope_${index + 1}`, source)), sourceState('CommunicationMessage', messages)] };
  }
  // FMERC-K: this used to be the implicit tail every unhandled block fell
  // into; only technical_audit ever reached it (the whitelist at the top of
  // this function rejects unknown blocks). Making the branch explicit is a
  // maintenance guard, not a behavior change — the content is identical. A
  // future 13th block added to MERCHANT_BLOCKS without its own branch now
  // fails loudly below instead of silently inheriting this projection.
  if (block === 'technical_audit') {
    const [events, tasks, incidents, integrations] = await Promise.all([scoped(svc, 'Event', id, { sort: '-created_date', limit: 300 }), scoped(svc, 'AgentTask', id, { sort: '-created_date', limit: 200 }), scoped(svc, 'AutonomyIncident', id, { field: 'subject_id', query: { subject_type: { $in: ['Brand', 'Merchant'] } }, sort: '-last_seen_at', limit: 100 }), scoped(svc, 'Integration', id, { sort: '-last_sync_at', limit: 100 })]);
    const safeIntegrations = integrations.rows.map((row: any) => ({ id: row.id, provider: row.provider, category: row.category, status: row.status, last_sync_at: row.last_sync_at, last_sync_status: row.last_sync_status, last_error: text(row.last_error, 1000), provider_account_id: row.provider_account_id }));
    const status = combinedSourceStatus([events, tasks, incidents, integrations]);
    const knownIncidents = incidents.rows.filter((row: any) => row.status === 'open').length;
    const failedTasks = tasks.ok ? tasks.rows.filter((row: any) => row.status === 'failed').length : null;
    return { ok: true, merchant_id: id, block, status, summary: `${!incidents.ok ? 'Incident evidence unavailable' : knownIncidents ? 'Direct merchant incidents present' : 'No direct merchant incidents found'} · ${failedTasks === null ? 'Failed tasks unavailable' : `${failedTasks} failed task(s)`}`, data: sanitizeMerchantAdminValue({ merchant_id: id, events: events.rows, agent_tasks: tasks.rows, direct_merchant_incidents: incidents.rows, integrations: safeIntegrations }), incident_coverage: { status: 'PARTIAL', reason: 'AutonomyIncident.subject_id is polymorphic. This block includes only incidents whose subject_id is exactly the merchant Brand id; related-resource incidents remain visible through their canonical domain surfaces.' }, secret_values_exposed: false, dependencies: [sourceState('Event', events), sourceState('AgentTask', tasks), sourceState('AutonomyIncident.direct_subject', incidents), sourceState('Integration', integrations)] };
  }
  // Unreachable today (whitelist above); reached only if a new MERCHANT_BLOCKS
  // entry ships without an explicit branch — fail closed, never guess.
  return { ok: false, error: 'merchant_block_not_implemented', block, supported_blocks: MERCHANT_BLOCKS, http_status: 500 };
}

function csvCell(value: any) {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function exportRows(rows: any[]) {
  const header = ['Merchant ID', 'Trading name', 'Legal name', 'Country', 'Status', 'PSPs', 'Annual payment volume EUR', 'Payment cost %', 'Potential savings EUR/year', 'Potential savings %', 'Verified savings EUR T12M', 'CAMBRA collected revenue EUR', 'Data confidence %', 'Recover status', 'Needs attention', 'Joined', 'Last activity'];
  const body = rows.slice(0, EXPORT_LIMIT).map((row) => [row.id, row.trading_name, row.legal_name, row.country, row.merchant_status, row.psps.join('; '), row.payment_volume ? row.payment_volume.value_minor / 100 : '', row.payment_cost ? row.payment_cost.bps / 100 : '', row.potential_savings ? row.potential_savings.value_minor / 100 : '', row.potential_savings?.pct ?? '', row.verified_savings ? row.verified_savings.value_minor / 100 : '', row.cambra_revenue ? row.cambra_revenue.collected_minor / 100 : '', row.data_confidence ?? '', row.recover.status, row.needs_attention ?? '', row.joined_at, row.last_activity_at]);
  return [header, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function buildMerchantKpiDrilldown(key: string, summaries: any[], kpis: any[], sources: Record<string, any> = {}) {
  if (!MERCHANT_KPI_KEYS.includes(key as any)) return { ok: false, error: 'unsupported_kpi', supported_kpis: MERCHANT_KPI_KEYS, http_status: 400 };
  const kpi = kpis.find((row) => row.key === key);
  const sortMap: Record<string, string> = { total_merchants: 'newest', active_merchants: 'last_activity', total_payment_volume: 'payment_volume', average_payment_cost: 'payment_cost', potential_savings: 'potential_savings', verified_savings: 'verified_savings', realized_savings: 'verified_savings', cambra_revenue: 'cambra_revenue', recover_active: 'potential_savings', needs_attention: 'last_activity', average_data_confidence: 'data_confidence', new_merchants: 'newest' };
  const ranked = applyMerchantQuery(summaries, { sort_by: sortMap[key], sort_direction: 'desc' }).slice(0, 50).map(({ identifiers_search: _i, search_text: _s, ...row }) => row);
  const countryBreakdown = [...summaries.reduce((map, row) => map.set(row.country || 'UNKNOWN', (map.get(row.country || 'UNKNOWN') || 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).map(([country, count]) => ({ country, count }));
  const byPsp = [...summaries.reduce((map, row) => {
    for (const psp of row.psps || []) {
      const current = map.get(psp) || { psp, merchants: 0, linked_modeled_savings_minor: 0 };
      current.merchants += 1;
      current.linked_modeled_savings_minor += number(row.potential_savings?.value_minor);
      map.set(psp, current);
    }
    return map;
  }, new Map<string, any>()).values()].sort((a, b) => b.linked_modeled_savings_minor - a.linked_modeled_savings_minor || b.merchants - a.merchants);
  const knownPotential = summaries.filter((row) => row.potential_savings?.value_minor !== undefined && row.potential_savings?.value_minor !== null);
  const potentialTotal = knownPotential.reduce((sum, row) => sum + number(row.potential_savings.value_minor), 0);
  const potentialByCountry = [...knownPotential.reduce((map, row) => {
    const country = row.country || 'UNKNOWN';
    const current = map.get(country) || { country, merchants: 0, modeled_savings_minor: 0 };
    current.merchants += 1;
    current.modeled_savings_minor += number(row.potential_savings.value_minor);
    map.set(country, current);
    return map;
  }, new Map<string, any>()).values()].sort((a, b) => b.modeled_savings_minor - a.modeled_savings_minor);
  const potentialTrendRows = latestRows(
    list(sources.analyzerResults?.rows),
    (row) => `${text(row.brand_id, 120)}:${String(row.created_date || row.updated_date || '').slice(0, 7)}`,
    ['created_date', 'updated_date'],
  );
  const potentialTrend = [...[...potentialTrendRows.values()].reduce((map, row) => {
    const month = String(row.created_date || row.updated_date || '').slice(0, 7) || 'UNKNOWN';
    const amount = analyzerPotential(row);
    if (amount === null) return map;
    const current = map.get(month) || { month, modeled_savings_minor: 0, analyzed_merchants: 0 };
    current.modeled_savings_minor += Math.round(amount * 100);
    current.analyzed_merchants += 1;
    map.set(month, current);
    return map;
  }, new Map<string, any>()).values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-24);
  const invoiceEvolution = [...list(sources.invoices?.rows).reduce((map, row) => {
    const month = String(row.paid_at || row.issued_at || row.created_date || '').slice(0, 7) || 'UNKNOWN';
    const current = map.get(month) || { month, invoiced_minor: 0, collected_minor: 0, outstanding_minor: 0 };
    if (!['draft', 'void'].includes(String(row.status))) current.invoiced_minor += Math.round(Math.max(0, number(row.total_amount)) * 100);
    current.collected_minor += Math.round(Math.max(0, number(row.amount_paid)) * 100);
    current.outstanding_minor += Math.round(Math.max(0, number(row.balance_due)) * 100);
    map.set(month, current);
    return map;
  }, new Map<string, any>()).values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-24);
  const earnedMinor = Math.round(list(sources.savingsReports?.rows)
    .filter((row) => ['calculated', 'invoiced', 'paid'].includes(String(row.status)))
    .reduce((sum, row) => sum + Math.max(0, number(row.node_fee ?? row.fee_net_amount)), 0) * 100);
  const revenueTotals = invoiceEvolution.reduce((totals, row) => ({
    earned_minor: earnedMinor,
    invoiced_minor: totals.invoiced_minor + row.invoiced_minor,
    collected_minor: totals.collected_minor + row.collected_minor,
    outstanding_minor: totals.outstanding_minor + row.outstanding_minor,
  }), { earned_minor: earnedMinor, invoiced_minor: 0, collected_minor: 0, outstanding_minor: 0 });
  const confidenceCauses = {
    low_or_unknown_confidence: summaries.filter((row) => row.data_confidence === null || row.data_confidence < 60).length,
    not_analyzed: summaries.filter((row) => !row.evidence?.analyzer_result_id).length,
    missing_observed_volume: summaries.filter((row) => !row.payment_volume).length,
    missing_observed_cost: summaries.filter((row) => !row.payment_cost).length,
    no_connected_data: summaries.filter((row) => !row.data_sources?.includes('connected')).length,
    no_documents: summaries.filter((row) => !row.data_sources?.includes('documents')).length,
  };
  const decisions = {
    approvals: list(sources.approvals?.rows).slice(0, 100).map((row) => sanitizeMerchantAdminValue({ id: row.id, brand_id: row.brand_id, title: row.title, summary: row.summary, action_type: row.action_type, status: row.status, risk_level: row.risk_level, recommendation: row.recommendation, expires_at: row.expires_at })),
    incidents: list(sources.incidents?.rows).slice(0, 100).map((row) => sanitizeMerchantAdminValue({ id: row.id, subject_id: row.subject_id, incident_type: row.incident_type, severity: row.severity, status: row.status, summary: row.summary, recommended_action: row.recommended_action, last_seen_at: row.last_seen_at })),
  };
  const breakdown: Record<string, any> = { by_country: countryBreakdown, top_merchants: ranked };
  if (key === 'potential_savings') breakdown.potential_savings = {
    by_country: potentialByCountry,
    by_psp: byPsp,
    confidence: {
      high: knownPotential.filter((row) => row.data_confidence !== null && row.data_confidence >= 80).length,
      medium: knownPotential.filter((row) => row.data_confidence !== null && row.data_confidence >= 60 && row.data_confidence < 80).length,
      low: knownPotential.filter((row) => row.data_confidence !== null && row.data_confidence < 60).length,
      unknown: knownPotential.filter((row) => row.data_confidence === null).length,
    },
    recover_coverage: { active_merchants: knownPotential.filter((row) => row.recover?.active).length, modeled_merchants: knownPotential.length },
    concentration: { top_5_share_pct: potentialTotal > 0 ? Number((knownPotential.slice().sort((a, b) => number(b.potential_savings?.value_minor) - number(a.potential_savings?.value_minor)).slice(0, 5).reduce((sum, row) => sum + number(row.potential_savings?.value_minor), 0) / potentialTotal * 100).toFixed(1)) : null },
    trend: potentialTrend,
    psp_attribution_boundary: 'A multi-PSP merchant is linked to every observed PSP. Linked modeled savings are non-additive across PSP rows.',
  };
  if (key === 'cambra_revenue') breakdown.revenue = {
    totals: revenueTotals,
    evolution: invoiceEvolution,
    merchant_contribution: ranked.map((row) => ({ merchant_id: row.id, trading_name: row.trading_name, collected_minor: row.cambra_revenue?.collected_minor ?? null, evidence_status: row.cambra_revenue?.evidence_status || 'UNAVAILABLE' })),
    truth_boundary: { earned: 'contractual', invoiced: 'observed_invoice', collected: 'verified_payment', outstanding: 'observed_invoice_balance' },
  };
  if (key === 'average_data_confidence') breakdown.data_confidence = {
    causes: confidenceCauses,
    remediation_queue: ranked.filter((row) => row.data_confidence === null || row.data_confidence < 80).map((row) => ({ merchant_id: row.id, trading_name: row.trading_name, data_confidence: row.data_confidence, missing: [!row.payment_volume && 'observed_volume', !row.payment_cost && 'observed_cost', !row.evidence?.analyzer_result_id && 'analyzer', !row.data_sources?.includes('connected') && 'connected_data', !row.data_sources?.includes('documents') && 'documents'].filter(Boolean) })),
  };
  if (key === 'needs_attention') breakdown.direct_founder_decisions = decisions;
  return {
    ok: true,
    kpi,
    overview: { value: kpi?.value ?? null, status: kpi?.status, truth_class: kpi?.truth_class, claim_boundary: kpi?.claim_boundary },
    breakdown,
    insights: kpi?.status === 'AVAILABLE' ? ['Ranking uses only canonical values with explicit unknowns.', 'Null values sort after known values and are never imputed.'] : ['Resolve unavailable or truncated dependencies before relying on portfolio totals.'],
    recommendations: key === 'needs_attention' ? ['Review the highest-risk approvals and incidents through canonical Founder controls.'] : key === 'average_data_confidence' ? ['Prioritize merchants with low or unknown data confidence before material action.'] : ['Open a merchant to inspect evidence before taking action.'],
    actions: [{ key: 'ask_cambra', mode: 'canonical_context_required' }, { key: 'export_current_segment', safe: true }, ...(key === 'needs_attention' ? [{ key: 'review_founder_approvals', href: '/admin/approvals', safe: true }] : [])],
    evidence_boundary: {
      sources: Object.entries(sources).map(([name, source]) => sourceState(name, source)),
      partial_values_are_not_presented_as_complete: true,
    },
    ask_context: { level: 'KPI', kpi_key: key, canonical_scope_required: true },
  };
}

export async function buildMerchantAskContext(svc: any, body: any) {
  const level = ['KPI', 'SEGMENT', 'MERCHANT'].includes(String(body.context_level).toUpperCase()) ? String(body.context_level).toUpperCase() : 'SEGMENT';
  if (level === 'MERCHANT') {
    const brand = await loadMerchant(svc, text(body.merchant_id, 120));
    if (!brand) return { ok: false, error: 'merchant_not_found', http_status: 404 };
    const block = MERCHANT_BLOCKS.includes(body.block) ? body.block : 'overview';
    const canonical = await collectMerchantBlock(svc, brand, block);
    return { ok: true, context_version: FOUNDER_MERCHANTS_V2_VERSION, level, merchant_id: brand.id, block, canonical_context: sanitizeMerchantAdminValue(canonical), client_context_authoritative: false };
  }
  const sources = await collectSummarySources(svc);
  const summaries = buildMerchantSummaries({ ...sourceRows(sources), sourceStatus: sources, now: new Date().toISOString() } as any);
  const selectedIds = unique(list(body.merchant_ids));
  if (selectedIds.length > 50) return { ok: false, error: 'ask_merchant_selection_limit_exceeded', max_merchant_ids: 50, http_status: 400 };
  if (selectedIds.some((id) => !summaries.some((row) => row.id === id))) return { ok: false, error: 'one_or_more_selected_merchants_not_found', http_status: 404 };
  const filtered = applyMerchantQuery(selectedIds.length ? summaries.filter((row) => selectedIds.includes(row.id)) : summaries, body);
  if (level === 'KPI') {
    const kpis = buildMerchantPortfolioKpis(filtered, sources, new Date().toISOString());
    const scopedSources = scopeMerchantPortfolioSources(sources, filtered.map((row) => row.id));
    return { ok: true, context_version: FOUNDER_MERCHANTS_V2_VERSION, level, canonical_context: buildMerchantKpiDrilldown(text(body.kpi_key, 80), filtered, kpis, scopedSources), client_context_authoritative: false };
  }
  return { ok: true, context_version: FOUNDER_MERCHANTS_V2_VERSION, level, canonical_context: { filters: safeViewConfig(body).filters, selected_merchant_ids: selectedIds, merchant_count: filtered.length, merchants: filtered.slice(0, 50).map(({ identifiers_search: _i, search_text: _s, ...row }) => row), truncated_for_ai: filtered.length > 50, truth_boundary: 'Canonical deterministic segment; detailed records were not dumped into the prompt.' }, client_context_authoritative: false };
}

export async function collectFounderMerchantsV2(svc: any, user: any, body: any = {}) {
  const action = text(body.action || 'portfolio', 80).toLowerCase();
  if (action === 'save_view') return saveView(svc, user, body);
  if (action === 'delete_view') return deleteView(svc, user, body);
  if (action === 'ask_context') return buildMerchantAskContext(svc, body);
  if (action === 'merchant_block') {
    const brand = await loadMerchant(svc, text(body.merchant_id, 120));
    if (!brand) return { ok: false, error: 'merchant_not_found', http_status: 404 };
    return collectMerchantBlock(svc, brand, text(body.block, 80));
  }
  const generatedAt = new Date().toISOString();
  const sources = await collectSummarySources(svc);
  const summaries = buildMerchantSummaries({ ...sourceRows(sources), sourceStatus: sources, now: generatedAt } as any);
  const filtered = applyMerchantQuery(summaries, body);
  const kpis = buildMerchantPortfolioKpis(filtered, sources, generatedAt);
  if (action === 'kpi_detail') return buildMerchantKpiDrilldown(text(body.kpi_key, 80), filtered, kpis, scopeMerchantPortfolioSources(sources, filtered.map((row) => row.id)));
  if (action === 'compare') {
    const ids = unique(list(body.merchant_ids)).slice(0, 6);
    if (ids.length < 2 || ids.length > 5) return { ok: false, error: 'compare_requires_2_to_5_merchants', http_status: 400 };
    const selected = summaries.filter((row) => ids.includes(row.id));
    if (selected.length !== ids.length) return { ok: false, error: 'one_or_more_merchants_not_found', http_status: 404 };
    return { ok: true, version: FOUNDER_MERCHANTS_V2_VERSION, comparison: selected.map(({ identifiers_search: _i, search_text: _s, ...row }) => row), mutation_allowed: false };
  }
  if (action === 'export') {
    const csv = exportRows(filtered);
    return { ok: true, version: FOUNDER_MERCHANTS_V2_VERSION, format: 'text/csv', filename: `cambra-merchants-${generatedAt.slice(0, 10)}.csv`, row_count: Math.min(filtered.length, EXPORT_LIMIT), truncated: filtered.length > EXPORT_LIMIT, max_rows: EXPORT_LIMIT, content: csv, mutation_allowed: false };
  }
  if (!['portfolio', 'list'].includes(action)) return { ok: false, error: 'unsupported_merchants_action', supported_actions: ['portfolio', 'list', 'kpi_detail', 'merchant_block', 'compare', 'export', 'save_view', 'delete_view', 'ask_context'], http_status: 400 };
  const page = paginateMerchantRows(filtered, body.cursor, body.page_size);
  return {
    ok: true,
    version: FOUNDER_MERCHANTS_V2_VERSION,
    generated_at: generatedAt,
    kpis,
    merchants: page,
    filters: filterOptions(summaries),
    quick_views: defaultViews(),
    saved_views: await savedViews(svc, text(user.email, 240)),
    blocks: MERCHANT_BLOCKS,
    global_actions: { export: { supported: true, max_rows: EXPORT_LIMIT }, compare: { supported: true, min: 2, max: 5 }, ask_cambra: { supported: true, canonical_context_action: 'ask_context', client_context_authoritative: false }, mass_mutation: { supported: false } },
    source_health: Object.entries(sources).map(([name, source]) => sourceState(name, source)),
    scan_boundary: { max_rows_per_source: LIST_SOURCE_LIMIT, result_totals_exact: !Object.values(sources).some((source: any) => source.truncated), capped_sources_are_never_presented_as_complete: true },
    unsupported: {
      natural_language_filtering: 'Deterministic filters are canonical. Natural-language interpretation remains in canonical Ask CAMBRA and may not create facts.',
      merchant_inactive_status: 'Brand currently has explicit active/cancelled service state. New is date-derived; Inactive is not invented without a canonical state.',
      dangerous_bulk_mutations: 'Unsupported by design.',
    },
  };
}
