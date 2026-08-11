export const FOUNDER_MEETING_POLICY_VERSION = 'founder-meeting-policy-1.0.0';

export const FOUNDER_MEETING_MODES = Object.freeze([
  'DISABLED',
  'RECOMMEND_ONLY',
  'PROPOSE',
  'AUTO_BOOK_WITHIN_POLICY',
]);

export const FOUNDER_MEETING_TYPES = Object.freeze([
  'MERCHANT_SALES_CALL',
  'MERCHANT_NEGOTIATION_CALL',
  'PROVIDER_NEGOTIATION_CALL',
  'PARTNERSHIP_CALL',
  'STRATEGIC_RELATIONSHIP_CALL',
  'MIGRATION_CALL',
  'LEGAL_COMMERCIAL_CALL',
]);

export const FOUNDER_MEETING_STATES = Object.freeze([
  'AI_HANDLING',
  'AI_NEGOTIATING',
  'HUMAN_MEETING_RECOMMENDED',
  'MEETING_PROPOSED',
  'MEETING_SCHEDULING',
  'MEETING_BOOKED',
  'FOUNDER_PREP_REQUIRED',
  'FOUNDER_MEETING',
  'MEETING_COMPLETED',
  'POST_MEETING_FOLLOWUP',
  'AI_RESUMED',
  'CLOSED_WON',
  'CLOSED_LOST',
  'PAUSED',
  'NURTURE',
  'LEGAL_BLOCKED',
  'WAITING_COUNTERPARTY',
  'WAITING_APPROVAL',
]);

export const DEFAULT_FOUNDER_MEETING_POLICY = Object.freeze({
  policy_key: 'founder-meetings',
  version: FOUNDER_MEETING_POLICY_VERSION,
  status: 'active',
  mode: 'RECOMMEND_ONLY',
  allowed_meeting_types: [...FOUNDER_MEETING_TYPES],
  allowed_relationship_types: ['merchant', 'provider', 'partner', 'agency', 'accountant', 'strategic'],
  minimum_expected_value_minor: 250000,
  minimum_escalation_score: 70,
  daily_meeting_cap: 2,
  weekly_meeting_cap: 5,
  minimum_notice_hours: 24,
  default_duration_minutes: 20,
  preferred_start_hour: 9,
  preferred_end_hour: 17,
  timezone: 'Europe/Madrid',
  blocked_weekdays: [0, 6],
  paused_until: null,
  auto_book_allowed: false,
  explicit_request_priority: true,
});

const clamp = (value:number, min:number, max:number) => Math.min(max, Math.max(min, value));
const finite = (value:any, fallback:number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clean = (value:any, max=500) => String(value || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export function normalizeFounderMeetingPolicy(input:any = {}) {
  const mode = FOUNDER_MEETING_MODES.includes(String(input.mode)) ? String(input.mode) : DEFAULT_FOUNDER_MEETING_POLICY.mode;
  const allowedTypes = Array.isArray(input.allowed_meeting_types)
    ? input.allowed_meeting_types.map(String).filter((value:string) => FOUNDER_MEETING_TYPES.includes(value))
    : DEFAULT_FOUNDER_MEETING_POLICY.allowed_meeting_types;
  const allowedRelationships = Array.isArray(input.allowed_relationship_types)
    ? input.allowed_relationship_types.map((value:any) => clean(value, 50).toLowerCase()).filter(Boolean)
    : DEFAULT_FOUNDER_MEETING_POLICY.allowed_relationship_types;
  const timezone = clean(input.timezone || DEFAULT_FOUNDER_MEETING_POLICY.timezone, 80);
  try { new Intl.DateTimeFormat('en', { timeZone:timezone }).format(new Date()); }
  catch { throw new Error('invalid_founder_meeting_timezone'); }
  const preferredStart = clamp(Math.floor(finite(input.preferred_start_hour, DEFAULT_FOUNDER_MEETING_POLICY.preferred_start_hour)), 0, 23);
  const preferredEnd = clamp(Math.floor(finite(input.preferred_end_hour, DEFAULT_FOUNDER_MEETING_POLICY.preferred_end_hour)), 1, 24);
  if (preferredEnd <= preferredStart) throw new Error('invalid_founder_meeting_hours');
  return {
    ...DEFAULT_FOUNDER_MEETING_POLICY,
    ...input,
    policy_key:clean(input.policy_key || DEFAULT_FOUNDER_MEETING_POLICY.policy_key, 100),
    version:clean(input.version || FOUNDER_MEETING_POLICY_VERSION, 120),
    status:['draft','active','paused','superseded'].includes(String(input.status)) ? String(input.status) : DEFAULT_FOUNDER_MEETING_POLICY.status,
    mode,
    allowed_meeting_types:allowedTypes.length ? [...new Set(allowedTypes)] : [],
    allowed_relationship_types:[...new Set(allowedRelationships)],
    minimum_expected_value_minor:Math.max(0, Math.floor(finite(input.minimum_expected_value_minor, DEFAULT_FOUNDER_MEETING_POLICY.minimum_expected_value_minor))),
    minimum_escalation_score:clamp(Math.floor(finite(input.minimum_escalation_score, DEFAULT_FOUNDER_MEETING_POLICY.minimum_escalation_score)), 1, 100),
    daily_meeting_cap:clamp(Math.floor(finite(input.daily_meeting_cap, DEFAULT_FOUNDER_MEETING_POLICY.daily_meeting_cap)), 0, 12),
    weekly_meeting_cap:clamp(Math.floor(finite(input.weekly_meeting_cap, DEFAULT_FOUNDER_MEETING_POLICY.weekly_meeting_cap)), 0, 40),
    minimum_notice_hours:clamp(Math.floor(finite(input.minimum_notice_hours, DEFAULT_FOUNDER_MEETING_POLICY.minimum_notice_hours)), 1, 336),
    default_duration_minutes:clamp(Math.floor(finite(input.default_duration_minutes, DEFAULT_FOUNDER_MEETING_POLICY.default_duration_minutes)), 15, 90),
    preferred_start_hour:preferredStart,
    preferred_end_hour:preferredEnd,
    timezone,
    blocked_weekdays:Array.isArray(input.blocked_weekdays) ? [...new Set(input.blocked_weekdays.map(Number).filter((n:number) => Number.isInteger(n) && n >= 0 && n <= 6))] : [0,6],
    paused_until:input.paused_until ? new Date(input.paused_until).toISOString() : null,
    auto_book_allowed:input.auto_book_allowed === true && mode === 'AUTO_BOOK_WITHIN_POLICY',
    explicit_request_priority:input.explicit_request_priority !== false,
  };
}

function scoreExpectedValue(minor:number) {
  if (minor >= 2_000_000) return 25;
  if (minor >= 750_000) return 20;
  if (minor >= 250_000) return 14;
  if (minor > 0) return 6;
  return 0;
}

export function evaluateFounderMeetingEscalation(input:any = {}, rawPolicy:any = {}, nowMs=Date.now()) {
  const policy = normalizeFounderMeetingPolicy(rawPolicy);
  const reasons:string[] = [];
  const blockers:string[] = [];
  const explicitRequest = input.explicit_request === true;
  const relationship = clean(input.relationship_type || 'merchant', 50).toLowerCase();
  const meetingType = FOUNDER_MEETING_TYPES.includes(String(input.meeting_type)) ? String(input.meeting_type) : 'MERCHANT_SALES_CALL';
  const expectedValue = Math.max(0, Math.floor(finite(input.expected_value_minor, 0)));
  let score = 0;

  if (explicitRequest && policy.explicit_request_priority) { score += 70; reasons.push('qualified_counterparty_requested_founder'); }
  score += scoreExpectedValue(expectedValue); if (expectedValue > 0) reasons.push('expected_value');
  if (input.strategic_value === true) { score += 20; reasons.push('strategic_value'); }
  const seniority = clean(input.counterparty_seniority, 50).toLowerCase();
  if (/founder|owner|chief|c-level|ceo|cfo|coo/.test(seniority)) { score += 12; reasons.push('senior_counterparty'); }
  else if (/vp|vice|director|head/.test(seniority)) { score += 8; reasons.push('decision_influence'); }
  const rounds = clamp(Math.floor(finite(input.substantive_rounds, 0)), 0, 20);
  if (rounds >= 4) { score += 12; reasons.push('diminishing_async_returns'); }
  else if (rounds >= 2) { score += 6; reasons.push('multiple_substantive_rounds'); }
  const blocker = clean(input.blocker_type, 80).toLowerCase();
  if (['trust','custom_terms','seniority','strategic','complex_objection'].includes(blocker)) { score += 12; reasons.push(`blocker:${blocker}`); }
  if (input.founder_uplift_likely === true) { score += 10; reasons.push('founder_uplift_likely'); }
  score = clamp(score, 0, 100);

  if (policy.status !== 'active') blockers.push('founder_meeting_policy_not_active');
  if (policy.mode === 'DISABLED') blockers.push('founder_meetings_disabled');
  if (policy.paused_until && Date.parse(policy.paused_until) > nowMs) blockers.push('founder_meetings_temporarily_paused');
  if (!policy.allowed_meeting_types.includes(meetingType)) blockers.push('meeting_type_not_allowed');
  if (!policy.allowed_relationship_types.includes(relationship)) blockers.push('relationship_type_not_allowed');
  if (input.qualified_counterparty === false) blockers.push('counterparty_not_qualified');
  if (input.p10_allowed === false) blockers.push('p10_blocked');
  if (input.p11_allowed === false) blockers.push('p11_blocked');
  if (score < policy.minimum_escalation_score) blockers.push('escalation_score_below_threshold');
  if (expectedValue < policy.minimum_expected_value_minor && !(explicitRequest && policy.explicit_request_priority)) blockers.push('expected_value_below_threshold');

  const recommended = blockers.length === 0;
  const action = !recommended ? 'AI_HANDLING'
    : policy.mode === 'AUTO_BOOK_WITHIN_POLICY' && policy.auto_book_allowed ? 'AUTO_BOOK_WITHIN_POLICY'
    : policy.mode === 'PROPOSE' ? 'PROPOSE'
    : 'RECOMMEND_ONLY';
  return { recommended, action, score, reasons:[...new Set(reasons)], blockers:[...new Set(blockers)], policy, meeting_type:meetingType, relationship_type:relationship, expected_value_minor:expectedValue };
}

function zonedDayKey(date:Date, timezone:string) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

export function founderMeetingCapacityDecision(rawPolicy:any, meetings:any[] = [], now=new Date()) {
  const policy = normalizeFounderMeetingPolicy(rawPolicy);
  const nowMs = now.getTime();
  const today = zonedDayKey(now, policy.timezone);
  const weekStart = nowMs - 7 * 86400000;
  const active = meetings.filter((row:any) => !['cancelled','CANCELLED'].includes(String(row.meeting_status || row.status || '')));
  const daily = active.filter((row:any) => {
    const at = new Date(row.meeting_start_at || row.start_at || '');
    return Number.isFinite(at.getTime()) && zonedDayKey(at, policy.timezone) === today;
  }).length;
  const weekly = active.filter((row:any) => {
    const at = Date.parse(row.meeting_start_at || row.start_at || '');
    return Number.isFinite(at) && at >= weekStart && at <= nowMs + 7 * 86400000;
  }).length;
  const blockers:string[] = [];
  if (policy.daily_meeting_cap <= 0 || daily >= policy.daily_meeting_cap) blockers.push('daily_founder_meeting_cap_reached');
  if (policy.weekly_meeting_cap <= 0 || weekly >= policy.weekly_meeting_cap) blockers.push('weekly_founder_meeting_cap_reached');
  return { allowed:blockers.length === 0, blockers, daily, weekly, daily_cap:policy.daily_meeting_cap, weekly_cap:policy.weekly_meeting_cap };
}

function nextMonday(now:Date) {
  const day = now.getUTCDay();
  const add = day === 1 ? 7 : (8 - day) % 7;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + add, 8, 0, 0));
  return next.toISOString();
}

export function parseFounderMeetingCommand(command:any, current:any = {}, now=new Date()) {
  const text = clean(command, 1000).toLowerCase();
  const patch:any = {};
  const matched:string[] = [];
  if (!text) return { ok:false, error:'command_required', patch, matched };
  if (/no (agendes|programes|book)|disable (all )?meetings|pause (all )?meetings/.test(text)) { patch.mode='DISABLED'; patch.auto_book_allowed=false; matched.push('disable'); }
  if (/hasta el lunes|until monday/.test(text)) { patch.paused_until=nextMonday(now); matched.push('pause_until_monday'); }
  if (/recomi[eé]ndame|recommend only|solo recom/.test(text)) { patch.mode='RECOMMEND_ONLY'; patch.auto_book_allowed=false; matched.push('recommend_only'); }
  if (/proponme|proposal mode|propose/.test(text)) { patch.mode='PROPOSE'; patch.auto_book_allowed=false; matched.push('propose'); }
  if (/(agend(?:a|ar)me directamente|ag[eé]ndame directamente|auto.?book).*(provider|prestador)|provider.*(agend(?:a|ar)me directamente|ag[eé]ndame directamente|auto.?book)/.test(text)) { patch.mode='AUTO_BOOK_WITHIN_POLICY'; patch.auto_book_allowed=true; patch.allowed_relationship_types=['provider','strategic']; matched.push('provider_auto_book'); }
  if (/revisar yo.*antes de confirmar|review.*before.*confirm/.test(text)) { patch.mode='PROPOSE'; patch.auto_book_allowed=false; matched.push('founder_confirms'); }
  const weekly = text.match(/(?:m[aá]s de|maximum|max(?:imum)?(?: of)?)\s*(\d{1,2})\s*(?:reuniones|meetings)(?:\s*(?:esta|per)\s*(?:semana|week))?/);
  if (weekly) { patch.weekly_meeting_cap=clamp(Number(weekly[1]),0,40); matched.push('weekly_cap'); }
  const daily = text.match(/(?:m[aá]s de|maximum|max(?:imum)?(?: of)?)\s*(\d{1,2})\s*(?:reuniones|meetings)\s*(?:al d[ií]a|per day|daily)/);
  if (daily) { patch.daily_meeting_cap=clamp(Number(daily[1]),0,12); matched.push('daily_cap'); }
  if (/solo esc[aá]lame merchants grandes|only escalate large merchants/.test(text)) { patch.allowed_relationship_types=['merchant']; patch.minimum_expected_value_minor=Math.max(finite(current.minimum_expected_value_minor,0),500000); matched.push('large_merchants_only'); }
  if (/partners?.*(m[aá]s flexible|more flexible)/.test(text)) { patch.allowed_relationship_types=[...new Set([...(current.allowed_relationship_types || DEFAULT_FOUNDER_MEETING_POLICY.allowed_relationship_types),'partner'])]; patch.minimum_escalation_score=Math.min(finite(current.minimum_escalation_score,70),60); matched.push('partner_flexibility'); }
  if (!matched.length) return { ok:false, error:'command_not_deterministic', patch:{}, matched:[] };
  return { ok:true, patch, matched:[...new Set(matched)] };
}

export function aiSensitiveIdentityReply(text:any, language='en') {
  const value = clean(text, 4000).toLowerCase();
  const asked = /\b(are you (a )?(bot|ai|xavi)|is this ai|am i speaking (with|to) xavi|who is writing|eres (un )?(bot|ia|xavi)|esto es ia|hablo con xavi|qui [ée]crit|est[- ]ce (une )?ia|parl[eé]-je [àa] xavi)\b/i.test(value);
  if (!asked) return null;
  if (String(language).startsWith('es')) return 'Esta conversación cuenta con el apoyo de los sistemas automatizados de CAMBRA. No soy Xavi. Si resulta útil, puedo proponer una llamada con Xavi, fundador y CEO de CAMBRA.';
  if (String(language).startsWith('fr')) return "Cette conversation est assistée par les systèmes automatisés de CAMBRA. Je ne suis pas Xavi. Si cela peut être utile, je peux proposer un échange avec Xavi, fondateur et CEO de CAMBRA.";
  return "This conversation is supported by CAMBRA's automated systems. I am not Xavi. If useful, I can propose a call with Xavi, CAMBRA's Founder & CEO.";
}

export function normalizeMeetingOutcome(input:any = {}) {
  const outcome = String(input.outcome || '').toUpperCase();
  const allowed = ['CLOSED_WON','CLOSED_LOST','PAUSED','NURTURE','LEGAL_BLOCKED','WAITING_COUNTERPARTY','WAITING_APPROVAL','AI_RESUMED'];
  if (!allowed.includes(outcome)) throw new Error('invalid_meeting_outcome');
  const list = (value:any, maxItems=20) => Array.isArray(value) ? value.map((item:any) => clean(item,500)).filter(Boolean).slice(0,maxItems) : [];
  const followUpAt = input.follow_up_at ? new Date(input.follow_up_at).toISOString() : null;
  return {
    outcome,
    discussed:list(input.discussed),
    agreed:list(input.agreed),
    proposed:list(input.proposed),
    requires_approval:list(input.requires_approval),
    new_information:list(input.new_information),
    objections:list(input.objections),
    documents_requested:list(input.documents_requested),
    cambra_commitments:list(input.cambra_commitments),
    counterparty_commitments:list(input.counterparty_commitments),
    next_step:clean(input.next_step,1000),
    follow_up_at:followUpAt,
    notes_source:clean(input.notes_source || 'founder_structured_capture',120),
    captured_at:new Date().toISOString(),
  };
}

export function buildFounderMeetingBrief(thread:any, context:any = {}) {
  const offer = context.offer || {};
  return {
    company:{ name:clean(context.company_name || thread.company_name,200), description:clean(context.company_description,800), segment:clean(context.segment,120), country:clean(context.country || thread.market_jurisdiction,20) },
    person:{ name:clean(thread.counterparty_name,200), role:clean(thread.counterparty_role || context.counterparty_role,150), decision_influence:clean(context.decision_influence,200) },
    history:{ summary:clean(thread.summary,1500), rounds:Math.max(0,Math.floor(finite(context.substantive_rounds,0))), objections:Array.isArray(context.objections)?context.objections.map((v:any)=>clean(v,300)).filter(Boolean).slice(0,12):[] },
    economics:{ currency:clean(context.currency || offer.currency,10), expected_merchant_value_minor:Math.max(0,Math.floor(finite(context.expected_merchant_value_minor,0))), expected_cambra_value_minor:Math.max(0,Math.floor(finite(context.expected_cambra_value_minor || thread.founder_expected_value_minor,0))), terms_discussed:context.terms_discussed || {} },
    blocker:clean(context.blocker || thread.founder_escalation_reasons?.join(', '),1000),
    objective:clean(context.objective || 'Resolve the documented blocker and agree a permitted next step.',1000),
    position:{ ideal:clean(context.ideal_outcome,800), acceptable:clean(context.acceptable_outcome,800), fallback:clean(context.fallback,800) },
    red_lines:['No material contract acceptance without current authority','No bank-detail or settlement change without high-assurance approval','No invented savings, rates, commitments, deadlines or volume guarantees'],
    authority:{ p10:context.p10 || 'UNKNOWN', p11:context.p11 || 'UNKNOWN', founder_may_discuss_not_execute:true, additional_approval_required:Array.isArray(context.additional_approval_required)?context.additional_approval_required:[] },
    open_questions:Array.isArray(context.open_questions)?context.open_questions.map((v:any)=>clean(v,400)).filter(Boolean).slice(0,12):[],
    next_step:clean(context.next_step,800),
    evidence_only:true,
  };
}
