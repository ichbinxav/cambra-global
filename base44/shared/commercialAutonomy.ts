// CAMBRA commercial autonomy boundary — deterministic authority, not AI judgment.
// v1.0.0 (2026-08-09)
export const COMMUNICATION_STYLE_POLICY_VERSION = 'cambra-comms-1.0.0';
export const OFFER_EXTRACTION_VERSION = 'provider-offer-1.0.0';

export const L4_CLASSIFICATIONS = new Set([
  'legal', 'security', 'complaint', 'custom_economics', 'contract', 'contract_exception',
  'final_offer', 'lock_in', 'minimum_commitment', 'termination_fee', 'migration_go_live',
  'financial_override', 'press', 'investor', 'strategic_partnership'
]);

export const SAFE_ROUTINE_CLASSIFICATIONS = new Set([
  'interested', 'question', 'objection', 'wrong_person', 'referral', 'ooo',
  'acknowledgement', 'information_request', 'document_request', 'clarification',
  'technical_question', 'implementation_question', 'pricing_request'
]);

export function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

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

export function isBusinessHour(policy: any, date = new Date()) {
  const start = Number.isFinite(Number(policy?.business_hours_start)) ? Number(policy.business_hours_start) : 8;
  const end = Number.isFinite(Number(policy?.business_hours_end)) ? Number(policy.business_hours_end) : 18;
  const hour = date.getUTCHours(); // conservative canonical clock; scheduler can wait rather than guess recipient TZ
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && hour >= start && hour < end;
}

export function classifyHardStop(text: string) {
  const t = String(text || '').toLowerCase();
  const optOut = /\b(unsubscribe|stop emailing|do not contact|don't contact|no me contact|no me escrib|désabonn|ne me contact|retirez-moi|remove me)\b/i.test(t);
  const complaint = /\b(spam|complaint|harassment|plainte|acoso|harcèlement)\b/i.test(t);
  const legal = /\b(lawyer|legal counsel|avocat|abogado|litigation|mise en demeure|demanda)\b/i.test(t);
  const security = /\b(security incident|data breach|breach|violation de données|filtración de datos)\b/i.test(t);
  if (optOut) return 'unsubscribe';
  if (complaint) return 'complaint';
  if (legal) return 'legal';
  if (security) return 'security';
  return null;
}

export function offerHasMaterialCommitment(offer: any) {
  return Boolean(
    Number(offer?.contract_term_months || 0) > 0 ||
    String(offer?.minimum_commitment || '').trim() ||
    String(offer?.termination_terms || '').trim() ||
    offer?.conditions_json?.lock_in === true ||
    offer?.conditions_json?.minimum_volume != null ||
    offer?.conditions_json?.termination_fee != null
  );
}

export function sanitizeExternalText(text: unknown, max = 12000) {
  return String(text || '').replace(/\u0000/g, '').slice(0, max);
}
