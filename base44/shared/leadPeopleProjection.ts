// Shared, evidence-bounded projection for people attached to OutboundLead.
// Titles and GMV/TPV bands are derived labels; the observed source values stay
// visible so the UI never turns a classification into a claimed fact.

import { ACTIVE_LAUNCH_MARKETS } from './generated/europeMarkets.ts';
import { canonicalMarket } from './marketContext.ts';
import { evaluateMarketLaunchScope } from './marketLaunchScope.ts';

const text = (value: unknown) => String(value ?? '').trim();
const optionalNumber = (value: unknown): number | null =>
  value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export const LEAD_PERSONA_GROUPS = Object.freeze([
  'FOUNDER', 'EXECUTIVE', 'FINANCE', 'PROCUREMENT', 'PAYMENTS',
  'ECOMMERCE', 'OPERATIONS', 'PARTNERSHIPS', 'OTHER', 'UNKNOWN',
]);

export const LEAD_LAUNCH_MARKETS = ACTIVE_LAUNCH_MARKETS;

export function leadMarketScope(value: unknown) {
  const observed = text(value);
  const canonical = canonicalMarket(observed);
  const scope = evaluateMarketLaunchScope(canonical?.iso2 || observed);
  const launchEligible = scope.launch_active === true
    && scope.commercial_eligibility === 'ELIGIBLE';
  return {
    observed_country: observed,
    country: scope.iso2 || observed.toUpperCase(),
    launch_market_eligible: launchEligible,
    market_scope_status: scope.scope_status,
    market_blocked_reason: launchEligible
      ? null
      : scope.blocked_reason || scope.scope_status || 'UNKNOWN_BLOCKED',
  };
}

const PERSONA_PATTERNS: Array<[string, RegExp]> = [
  ['FOUNDER', /\b(co[ -]?founder|founder|owner|entrepreneur)\b/i],
  ['FINANCE', /\b(cfo|chief financial|finance|financial|treasury|treasurer|controller|controlling)\b/i],
  ['PROCUREMENT', /\b(procurement|purchasing|sourcing|buyer|buying|category manager|vendor management)\b/i],
  ['PAYMENTS', /\b(payment|payments|fintech|acquiring|merchant services)\b/i],
  ['ECOMMERCE', /\b(e[ -]?commerce|digital commerce|online sales|marketplace)\b/i],
  ['OPERATIONS', /\b(coo|chief operating|operations|operational|supply chain)\b/i],
  ['PARTNERSHIPS', /\b(partnership|alliances|business development|commercial director|sales director)\b/i],
  ['EXECUTIVE', /\b(ceo|chief executive|managing director|general manager|president|director general)\b/i],
];

export function classifyLeadPersonas(title: unknown): string[] {
  const observed = text(title);
  if (!observed) return ['UNKNOWN'];
  const matched = PERSONA_PATTERNS.filter(([, pattern]) => pattern.test(observed)).map(([key]) => key);
  return matched.length ? [...new Set(matched)] : ['OTHER'];
}

export const GMV_BANDS = Object.freeze({
  UNDER_1M: { min: 0, max: 1_000_000 },
  FROM_1M_TO_5M: { min: 1_000_000, max: 5_000_000 },
  FROM_5M_TO_20M: { min: 5_000_000, max: 20_000_000 },
  FROM_20M_TO_100M: { min: 20_000_000, max: 100_000_000 },
  OVER_100M: { min: 100_000_000, max: Number.POSITIVE_INFINITY },
});

export function leadReadiness(lead: any) {
  const email = text(lead?.contact_email).toLowerCase();
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const market = leadMarketScope(lead?.country);
  const policyBlocked = lead?.reservoir_state === 'suppressed'
    || lead?.outreach_eligibility === 'BLOCKED'
    || lead?.compliance_status === 'BLOCKED';
  const blocked = !market.launch_market_eligible || policyBlocked;
  const blockers = [
    ...(!market.launch_market_eligible ? ['MARKET_OUTSIDE_ACTIVE_LAUNCH'] : []),
    ...(policyBlocked ? ['POLICY_BLOCKED'] : []),
    ...(!hasEmail ? ['VERIFIED_EMAIL_REQUIRED'] : []),
    ...(lead?.contactability !== 'PROFESSIONAL_VERIFIED' ? ['PROFESSIONAL_CONTACT_NOT_VERIFIED'] : []),
    ...(lead?.outreach_eligibility !== 'ELIGIBLE' ? ['OUTREACH_ELIGIBILITY_NOT_CLEARED'] : []),
    ...(lead?.compliance_status !== 'CLEARED' ? ['COMPLIANCE_NOT_CLEARED'] : []),
  ];
  return {
    readiness: blocked ? 'BLOCKED' : blockers.length ? 'REVIEW_REQUIRED' : 'READY',
    blockers: [...new Set(blockers)],
    market,
  };
}

function pipelineState(lead: any) {
  const stage = text(lead?.stage).toLowerCase();
  const reservoir = text(lead?.reservoir_state).toLowerCase();
  if (['disqualified', 'lost', 'suppressed'].includes(stage) || ['disqualified', 'suppressed'].includes(reservoir)) return 'EXCLUDED';
  if (stage === 'won' || reservoir === 'converted') return 'WON';
  if (['lead', 'enriched', ''].includes(stage) && ['', 'discovered', 'enriching'].includes(reservoir)) return 'DISCOVERED';
  return 'IN_PIPELINE';
}

function compactReasons(lead: any, personas: string[]) {
  const reasons: string[] = [];
  if (text(lead?.contact_title)) reasons.push(`Observed role: ${text(lead.contact_title)}`);
  if (!personas.includes('UNKNOWN') && !personas.includes('OTHER')) reasons.push(`Role match: ${personas.join(' / ')}`);
  const breakdown = lead?.score_breakdown_json;
  if (Array.isArray(breakdown)) {
    for (const item of breakdown.slice(0, 4)) if (text(item)) reasons.push(text(item));
  } else if (breakdown && typeof breakdown === 'object') {
    for (const [key, value] of Object.entries(breakdown).slice(0, 4)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        reasons.push(`${key.replaceAll('_', ' ')}: ${String(value)}`);
      }
    }
  }
  if (text(lead?.next_action)) reasons.push(`Next action: ${text(lead.next_action)}`);
  return [...new Set(reasons)].slice(0, 6);
}

export function projectLeadPerson(lead: any) {
  const personas = classifyLeadPersonas(lead?.contact_title);
  const readiness = leadReadiness(lead);
  const gmvMin = optionalNumber(lead?.estimated_tpv_min_eur);
  const gmvMax = optionalNumber(lead?.estimated_tpv_max_eur);
  const score = optionalNumber(lead?.icp_score ?? lead?.score ?? lead?.pre_score);
  return {
    id: text(lead?.id),
    person_name: text(lead?.contact_full_name),
    person_title: text(lead?.contact_title),
    person_email: text(lead?.contact_email).toLowerCase(),
    linkedin_url: text(lead?.linkedin_url),
    personas,
    primary_persona: personas[0],
    company_name: text(lead?.company_name),
    company_domain: text(lead?.company_domain),
    canonical_company_key: text(lead?.canonical_company_key),
    country: readiness.market.country,
    observed_country: readiness.market.observed_country,
    launch_market_eligible: readiness.market.launch_market_eligible,
    market_scope_status: readiness.market.market_scope_status,
    market_blocked_reason: readiness.market.market_blocked_reason,
    industry: text(lead?.industry),
    employee_range: text(lead?.employee_range),
    revenue_range: text(lead?.revenue_range),
    estimated_gmv_min_eur: gmvMin,
    estimated_gmv_max_eur: gmvMax,
    gmv_truth_class: gmvMin === null && gmvMax === null ? 'UNKNOWN' : 'ESTIMATED',
    score,
    score_truth_class: score === null ? 'UNKNOWN' : 'DERIVED',
    score_breakdown: lead?.score_breakdown_json && typeof lead.score_breakdown_json === 'object'
      ? lead.score_breakdown_json
      : {},
    reasons: compactReasons(lead, personas),
    source: text(lead?.source),
    source_evidence: lead?.source_evidence_json && typeof lead.source_evidence_json === 'object'
      ? lead.source_evidence_json
      : {},
    discovered_at: text(lead?.discovered_at || lead?.created_date),
    last_enriched_at: text(lead?.last_enriched_at),
    stage: text(lead?.stage),
    revenue_stage: text(lead?.revenue_stage),
    reservoir_state: text(lead?.reservoir_state),
    pipeline_state: pipelineState(lead),
    next_action: text(lead?.next_action),
    contactability: text(lead?.contactability) || 'UNKNOWN',
    outreach_eligibility: text(lead?.outreach_eligibility) || 'NOT_ASSESSED',
    compliance_status: text(lead?.compliance_status) || 'NOT_ASSESSED',
    readiness: readiness.readiness,
    blockers: readiness.blockers,
  };
}

export function matchesLeadGmvBand(person: any, requested: unknown): boolean {
  const key = text(requested).toUpperCase();
  if (!key || key === 'ALL') return true;
  const min = optionalNumber(person?.estimated_gmv_min_eur);
  const max = optionalNumber(person?.estimated_gmv_max_eur);
  if (key === 'UNKNOWN') return min === null && max === null;
  const band = (GMV_BANDS as Record<string, { min: number; max: number }>)[key];
  if (!band || (min === null && max === null)) return false;
  const observedMin = min ?? max ?? 0;
  const observedMax = max ?? min ?? 0;
  return observedMax >= band.min && observedMin < band.max;
}

export function filterLeadPeople(people: any[], input: any = {}) {
  const query = text(input.query || input.search).toLowerCase();
  const personas = new Set((Array.isArray(input.personas) ? input.personas : [input.persona]).map((value) => text(value).toUpperCase()).filter(Boolean));
  const countries = new Set((Array.isArray(input.countries) ? input.countries : [input.country]).map((value) => text(value).toUpperCase()).filter(Boolean));
  const minScore = optionalNumber(input.min_score);
  const readiness = text(input.readiness).toUpperCase();
  const pipeline = text(input.pipeline_state).toUpperCase();
  return people.filter((person) => {
    if (input.named_only === true && !text(person.person_name)) return false;
    if (query && ![
      person.person_name, person.person_title, person.person_email,
      person.company_name, person.company_domain, person.country, person.industry,
    ].some((value) => text(value).toLowerCase().includes(query))) return false;
    if (personas.size && !person.personas.some((value: string) => personas.has(value))) return false;
    if (countries.size && !countries.has(text(person.country).toUpperCase())) return false;
    if (minScore !== null && (person.score === null || Number(person.score) < minScore)) return false;
    if (readiness && readiness !== 'ALL' && person.readiness !== readiness) return false;
    if (pipeline && pipeline !== 'ALL' && person.pipeline_state !== pipeline) return false;
    if (!matchesLeadGmvBand(person, input.gmv_band)) return false;
    return true;
  });
}
