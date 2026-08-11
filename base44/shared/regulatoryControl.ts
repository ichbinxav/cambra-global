export const REGULATORY_CONTROL_VERSION = 'p10-regulatory-control-1.0.0';
export const REGULATORY_STATUSES = Object.freeze(['ALLOWED','ALLOWED_WITH_CONDITIONS','REGISTRATION_REQUIRED','AUTHORIZATION_REQUIRED','PARTNER_REQUIRED','PROHIBITED','UNCERTAIN','LEGAL_REVIEW_REQUIRED','NOT_APPLICABLE']);
export const REGULATORY_ACTIVITIES = Object.freeze([
  'ANALYSIS','COMPARISON','ADVISORY','INTERMEDIATION_INTRODUCTION','NEGOTIATION','MIGRATION_FACILITATION','CONTRACT_FACILITATION','MANDATE','ACCOUNT_INFORMATION_ACCESS','PAYMENT_INITIATION','FUND_HANDLING','BILLING_SUCCESS_FEES','B2B_OUTREACH','DATA_ENRICHMENT','PROVIDER_CONTACT','PARTNER_REFERRAL','PRICING_RESEARCH',
]);

export const CAPABILITY_TO_REGULATORY_ACTIVITY:any = Object.freeze({
  RESEARCH_MARKET:'PRICING_RESEARCH',DISCOVER_PROVIDER:'PRICING_RESEARCH',DISCOVER_LEAD:'DATA_ENRICHMENT',ENRICH_LEAD:'DATA_ENRICHMENT',ANALYZE:'ANALYSIS',RECOMMEND:'ADVISORY',OUTREACH:'B2B_OUTREACH',PROVIDER_CONTACT:'PROVIDER_CONTACT',NEGOTIATE:'NEGOTIATION',MANDATE:'MANDATE',CONTRACT:'CONTRACT_FACILITATION',MIGRATE:'MIGRATION_FACILITATION',VERIFY:'ANALYSIS',BILL:'BILLING_SUCCESS_FEES',ACCESS_BANK_ACCOUNT_DATA:'ACCOUNT_INFORMATION_ACCESS',INITIATE_PAYMENT:'PAYMENT_INITIATION',HOLD_FUNDS:'FUND_HANDLING',ACT_AS_PSP:'FUND_HANDLING',ACT_AS_PSP_AGENT:'INTERMEDIATION_INTRODUCTION',
});

const parseTime = (value:any) => { const n = Date.parse(String(value || '')); return Number.isFinite(n) ? n : null; };
const current = (row:any, now:number) => {
  if (!row || row.active === false) return false;
  const from = parseTime(row.effective_from); const to = row.effective_to ? parseTime(row.effective_to) : Infinity;
  return (from === null || from <= now) && (to === Infinity || (to !== null && now < to));
};

export function evidenceQuality(evidence:any[] = [], now = Date.now()) {
  const usable = evidence.filter((x) => current(x, now) && x.review_status === 'VERIFIED' && x.source_tier === 'PRIMARY_AUTHORITY' && /^https:\/\//.test(String(x.source_url || '')));
  const stale = usable.filter((x) => x.next_review_at && parseTime(x.next_review_at)! < now);
  return { authoritative_current: usable.filter((x) => !stale.includes(x)), authoritative_stale: stale, all: evidence };
}

function registrationAllows(registration:any, jurisdiction:string, policy:any, now:number) {
  if (!current(registration, now) || !['ACTIVE','PASSPORTED'].includes(String(registration?.status || ''))) return false;
  const scopes = Array.isArray(registration.activity_scope) ? registration.activity_scope : [];
  if (!scopes.includes(policy.activity)) return false;
  if (registration.jurisdiction === jurisdiction) return true;
  if (policy.cross_border_model !== 'PASSPORTING_POSSIBLE') return false;
  const markets = Array.isArray(registration.passport_markets) ? registration.passport_markets : [];
  if (!markets.includes(jurisdiction)) return false;
  if (policy.host_notification_required === true && (!Array.isArray(registration.host_notifications) || !registration.host_notifications.includes(jurisdiction))) return false;
  return true;
}

export function decideRegulatoryActivity(input:any = {}) {
  const jurisdiction = String(input.jurisdiction || '').toUpperCase();
  const activity = String(input.activity || '').toUpperCase();
  const now = parseTime(input.now) ?? Date.now();
  const policy = input.policy || null;
  const base = { jurisdiction, activity, policy_id: policy?.id || null, policy_version: policy?.policy_version || null, evidence_ids: [], regulatory_control_version: REGULATORY_CONTROL_VERSION, allowed: false };
  if (!/^[A-Z]{2}$/.test(jurisdiction) || !REGULATORY_ACTIVITIES.includes(activity as any)) return { ...base, outcome:'REVIEW', status:'LEGAL_REVIEW_REQUIRED', reason_code:'invalid_jurisdiction_or_activity' };
  if (!policy || !current(policy, now)) return { ...base, outcome:'REVIEW', status:'LEGAL_REVIEW_REQUIRED', reason_code:policy ? 'policy_not_current' : 'policy_missing' };
  if (policy.activity !== activity || policy.jurisdiction !== jurisdiction) return { ...base, outcome:'REVIEW', status:'LEGAL_REVIEW_REQUIRED', reason_code:'policy_scope_mismatch' };
  const status = REGULATORY_STATUSES.includes(policy.status) ? policy.status : 'UNCERTAIN';
  if (status === 'PROHIBITED') return { ...base, outcome:'BLOCK', status, reason_code:'activity_prohibited' };
  if (status === 'NOT_APPLICABLE') return { ...base, outcome:'BLOCK', status, reason_code:'activity_not_applicable' };
  if (['UNCERTAIN','LEGAL_REVIEW_REQUIRED'].includes(status)) return { ...base, outcome:'REVIEW', status, reason_code:'legal_review_required' };
  const quality = evidenceQuality(input.evidence || [], now);
  const evidenceIds = quality.authoritative_current.map((x:any) => x.id || x.evidence_key).filter(Boolean);
  if (!evidenceIds.length) return { ...base, status:'LEGAL_REVIEW_REQUIRED', outcome:'REVIEW', reason_code:'current_primary_authority_evidence_required', evidence_ids:evidenceIds };
  if (policy.next_review_at && parseTime(policy.next_review_at)! < now) return { ...base, status:'LEGAL_REVIEW_REQUIRED', outcome:'REVIEW', reason_code:'policy_review_overdue', evidence_ids:evidenceIds };
  const registrations = Array.isArray(input.registrations) ? input.registrations : [];
  const validRegistration = registrations.find((x:any) => registrationAllows(x, jurisdiction, policy, now));
  const partners = Array.isArray(input.partners) ? input.partners : [];
  const validPartner = partners.find((x:any) => current(x, now) && x.status === 'ACTIVE' && Array.isArray(x.activity_scope) && x.activity_scope.includes(activity) && Array.isArray(x.market_scope) && x.market_scope.includes(jurisdiction));
  if (['REGISTRATION_REQUIRED','AUTHORIZATION_REQUIRED'].includes(status) && !validRegistration) return { ...base, status, outcome:'BLOCK', reason_code:'required_registration_or_authorization_not_proven', evidence_ids:evidenceIds };
  if (status === 'PARTNER_REQUIRED' && !validPartner) return { ...base, status, outcome:'BLOCK', reason_code:'required_authorized_partner_not_proven', evidence_ids:evidenceIds };
  const required = Array.isArray(policy.conditions_json?.required_conditions) ? policy.conditions_json.required_conditions : [];
  const satisfied = new Set(Array.isArray(input.satisfied_conditions) ? input.satisfied_conditions : []);
  const missing = required.filter((x:any) => !satisfied.has(x));
  if (missing.length) return { ...base, status:'ALLOWED_WITH_CONDITIONS', outcome:'REVIEW', reason_code:'required_conditions_not_proven', missing_conditions:missing, evidence_ids:evidenceIds };
  const conditional = status !== 'ALLOWED' || required.length > 0;
  return { ...base, allowed:true, status, outcome:conditional ? 'CONDITIONS' : 'ALLOW', reason_code:conditional ? 'evidenced_conditions_satisfied' : 'evidenced_activity_allowed', evidence_ids:evidenceIds, registration_id:validRegistration?.id || null, partner_id:validPartner?.id || null, conditions:required };
}

export function conservativePolicy(jurisdiction:string, activity:string, now = new Date().toISOString()) {
  return { policy_key:`${REGULATORY_CONTROL_VERSION}:${jurisdiction}:${activity}`,jurisdiction,activity,status:'LEGAL_REVIEW_REQUIRED',reason_code:'unreviewed_market_activity',human_readable_reason:'No evidence-backed legal conclusion has been approved for this market and activity.',evidence_refs:[],conditions_json:{},cross_border_model:'SEPARATE_HOST_REVIEW_REQUIRED',host_notification_required:false,effective_from:now,reviewed_at:null,next_review_at:null,policy_version:REGULATORY_CONTROL_VERSION,active:true,created_by_actor:'p10_conservative_seed' };
}
