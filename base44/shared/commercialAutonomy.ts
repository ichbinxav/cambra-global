// CAMBRA commercial autonomy boundary — deterministic authority, timing and quality gates.
// v1.1.0 (2026-08-09)
export const COMMUNICATION_STYLE_POLICY_VERSION = 'cambra-comms-1.1.0';
export const OFFER_EXTRACTION_VERSION = 'provider-offer-1.0.0';
export const DEFAULT_COMMERCIAL_TIMEZONE = 'Europe/Paris';
export const MIN_INBOUND_REPLY_DELAY_MINUTES = 25;
export const DEFAULT_BUSINESS_HOURS_START = 8;
export const DEFAULT_BUSINESS_HOURS_END = 19;

export const CAMBRA_COMMUNICATION_STYLE_POLICY = Object.freeze({
  version: COMMUNICATION_STYLE_POLICY_VERSION,
  identity: ['CAMBRA','CAMBRA Payments','CAMBRA Operations','CAMBRA Partnerships'],
  principles: ['concise','contextual','commercially_intelligent','professionally_casual_when_appropriate','thread_aware','natural'],
  avoid: ['startup_cliches','corporate_filler','hyperbole','excessive_enthusiasm','unnecessary_summaries','excessive_formatting','artificial_bullets','generic_openings','repetitive_closings','invented_people','claims_of_manual_human_authorship']
});

export const L4_CLASSIFICATIONS = new Set([
  'legal', 'security', 'complaint', 'custom_economics', 'contract', 'contract_exception',
  'final_offer', 'lock_in', 'minimum_commitment', 'termination_fee', 'migration_go_live',
  'financial_override', 'press', 'investor', 'strategic_partnership'
]);

export const SAFE_ROUTINE_CLASSIFICATIONS = new Set([
  'interested', 'question', 'objection', 'wrong_person', 'referral', 'meeting', 'ooo',
  'acknowledgement', 'information_request', 'document_request', 'clarification',
  'technical_question', 'implementation_question', 'pricing_request'
]);

export function normalizeEmail(value: unknown) { return String(value || '').trim().toLowerCase(); }

export function policyIsActive(policy: any, now = Date.now()) {
  if (!policy || policy.status !== 'active' || !policy.approved_at || !policy.approved_by) return false;
  const start = policy.effective_at ? Date.parse(policy.effective_at) : 0;
  const end = policy.expires_at ? Date.parse(policy.expires_at) : Infinity;
  return Number.isFinite(start) && start <= now && (!Number.isFinite(end) || now < end);
}

export function routineActionAllowed(policy: any, action: string, classification: string) {
  if (!policyIsActive(policy)) return { allowed: false, reason: 'policy_not_active' };
  if (L4_CLASSIFICATIONS.has(classification)) return { allowed: false, reason: 'l4_classification' };
  if (!SAFE_ROUTINE_CLASSIFICATIONS.has(classification)) return { allowed: false, reason: 'classification_not_allowlisted' };
  const prohibited = new Set(Array.isArray(policy.prohibited_actions) ? policy.prohibited_actions : []);
  if (prohibited.has(action)) return { allowed: false, reason: 'action_prohibited' };
  const allowed = new Set(Array.isArray(policy.allowed_routine_actions) ? policy.allowed_routine_actions : []);
  if (!allowed.has(action)) return { allowed: false, reason: 'action_not_authorized' };
  return { allowed: true, reason: 'policy_authorized' };
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(t:string)=>parts.find(p=>p.type===t)?.value||'';
  return { weekday:get('weekday'), year:Number(get('year')), month:Number(get('month')), day:Number(get('day')), hour:Number(get('hour')), minute:Number(get('minute')), second:Number(get('second')) };
}

export function commercialTimezone(thread:any, policy:any) {
  const candidate=String(thread?.counterparty_timezone || policy?.fallback_timezone || DEFAULT_COMMERCIAL_TIMEZONE).trim();
  try { new Intl.DateTimeFormat('en',{timeZone:candidate}).format(new Date()); return candidate; } catch { return DEFAULT_COMMERCIAL_TIMEZONE; }
}

export function isBusinessHour(policy: any, date = new Date(), timeZone = DEFAULT_COMMERCIAL_TIMEZONE) {
  const start = Number.isFinite(Number(policy?.business_hours_start)) ? Number(policy.business_hours_start) : DEFAULT_BUSINESS_HOURS_START;
  const end = Number.isFinite(Number(policy?.business_hours_end)) ? Number(policy.business_hours_end) : DEFAULT_BUSINESS_HOURS_END;
  const p = zonedParts(date,timeZone);
  return !['Sat','Sun'].includes(p.weekday) && p.hour >= start && p.hour < end;
}

function timezoneOffsetMs(date:Date,timeZone:string){
  const p=zonedParts(date,timeZone); const asUtc=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second); return asUtc-date.getTime();
}
function localToUtc(year:number,month:number,day:number,hour:number,minute:number,timeZone:string){
  let guess=new Date(Date.UTC(year,month-1,day,hour,minute,0));
  for(let i=0;i<3;i++){ const off=timezoneOffsetMs(guess,timeZone); guess=new Date(Date.UTC(year,month-1,day,hour,minute,0)-off); }
  return guess;
}
function addLocalDays(year:number,month:number,day:number,days:number){ const d=new Date(Date.UTC(year,month-1,day+days)); return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()}; }

export function nextBusinessSendAt(policy:any, candidate:Date, timeZone=DEFAULT_COMMERCIAL_TIMEZONE) {
  const start=Number.isFinite(Number(policy?.business_hours_start))?Number(policy.business_hours_start):DEFAULT_BUSINESS_HOURS_START;
  const end=Number.isFinite(Number(policy?.business_hours_end))?Number(policy.business_hours_end):DEFAULT_BUSINESS_HOURS_END;
  if(isBusinessHour(policy,candidate,timeZone)) return candidate;
  const p=zonedParts(candidate,timeZone);
  let y=p.year,m=p.month,d=p.day;
  if(!['Sat','Sun'].includes(p.weekday) && p.hour < start) return localToUtc(y,m,d,start,0,timeZone);
  for(let i=1;i<=7;i++){ const nd=addLocalDays(y,m,d,i); const dt=localToUtc(nd.year,nd.month,nd.day,start,0,timeZone); const z=zonedParts(dt,timeZone); if(!['Sat','Sun'].includes(z.weekday)) return dt; }
  return new Date(candidate.getTime()+24*60*60*1000);
}

function stableJitterMinutes(seed:string,maxExtra=35){ let h=2166136261; for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return Math.abs(h)%(maxExtra+1); }
export function computeInboundReplySchedule(receivedAt:string|Date, policy:any, seed:string, timeZone=DEFAULT_COMMERCIAL_TIMEZONE) {
  const received = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  if(Number.isNaN(received.getTime())) throw new Error('invalid_received_at');
  const earliest = new Date(received.getTime()+MIN_INBOUND_REPLY_DELAY_MINUTES*60_000);
  const naturalCandidate = new Date(earliest.getTime()+stableJitterMinutes(seed,35)*60_000);
  return { earliest_reply_at: earliest.toISOString(), scheduled_send_at: nextBusinessSendAt(policy,naturalCandidate,timeZone).toISOString() };
}

export function communicationQuality(text:string, context?:{previous_outbound?:string[]}) {
  const t=String(text||'').trim(); const reasons:string[]=[];
  if(!t || t.length>5000) reasons.push('invalid_length');
  const hard=[/\bi hope this (email|message) finds you well\b/i,/\bthank you for reaching out\b/i,/\bi[’']?d be happy to\b/i,/\babsolutely!\b/i,/\bcertainly!\b/i,/\bas an ai\b/i,/\blanguage model\b/i,/\bgame[- ]changer\b/i,/\bdelve into\b/i];
  if(hard.some(r=>r.test(t))) reasons.push('generic_llm_phrase');
  const em=(t.match(/—/g)||[]).length; if(em>=3) reasons.push('em_dash_overuse');
  const bullets=t.split('\n').filter(x=>/^\s*[-*•]\s+/.test(x)).length; if(bullets>=4 && t.length<900) reasons.push('unnecessary_list_structure');
  const greetings=(t.match(/\b(bonjour|hello|hi|hola)\b/gi)||[]).length; if(greetings>1) reasons.push('repeated_greeting');
  if(t.length>900 && /\?$/.test((context?.previous_outbound||[]).join(' '))===false) reasons.push('overlong_routine_reply');
  return { ok: reasons.length===0, reasons };
}

export function classifyHardStop(text: string) {
  const t = String(text || '').toLowerCase();
  const optOut = /\b(unsubscribe|stop emailing|do not contact|don't contact|no me contact|no me escrib|désabonn|ne me contact|retirez-moi|remove me)\b/i.test(t);
  const complaint = /\b(spam|complaint|harassment|plainte|acoso|harcèlement)\b/i.test(t);
  const legal = /\b(lawyer|legal counsel|avocat|abogado|litigation|mise en demeure|demanda)\b/i.test(t);
  const security = /\b(security incident|data breach|breach|violation de données|filtración de datos)\b/i.test(t);
  if (optOut) return 'unsubscribe'; if (complaint) return 'complaint'; if (legal) return 'legal'; if (security) return 'security'; return null;
}

export function offerHasMaterialCommitment(offer: any) {
  return Boolean(Number(offer?.contract_term_months || 0) > 0 || String(offer?.minimum_commitment || '').trim() || String(offer?.termination_terms || '').trim() || offer?.conditions_json?.lock_in === true || offer?.conditions_json?.minimum_volume != null || offer?.conditions_json?.termination_fee != null);
}
export function sanitizeExternalText(text: unknown, max = 12000) { return String(text || '').replace(/\u0000/g, '').slice(0, max); }
