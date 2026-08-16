// CAMP-C5 (2026-08-16) — canonical inbound resolution and classification
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C5, spec §10.3, §10.9-10.10). Pure.
//
// The property this file exists to guarantee: an inbound message is attached
// to the RIGHT thread or to NO thread. Attaching a reply to the wrong
// conversation leaks one counterparty's words into another's history, so an
// ambiguous match must resolve to REVIEW_REQUIRED rather than a best guess.
//
// Inbound content is UNTRUSTED (spec §3.7): nothing here obeys instructions
// found in a message, and classification is a projection, never an authority.

export const CONVERSATION_RESOLUTION_VERSION = 'conversation-resolution-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => text(value).toLowerCase();

/** Resolution ladder, highest confidence first (spec §10.10). */
export const THREAD_RESOLUTION_STRATEGIES = Object.freeze([
  'PROVIDER_THREAD_ID',
  'INTERNET_MESSAGE_REFERENCES',
  'ENROLLMENT_OR_CAMPAIGN_REF',
  'NORMALIZED_EMAIL_AND_CAMPAIGN',
] as const);

export type InboundEnvelope = {
  provider?: string;
  provider_thread_id?: string;
  provider_message_id?: string;
  in_reply_to?: string;
  references?: string[];
  enrollment_id?: string;
  campaign_id?: string;
  from_email?: string;
  to_email?: string;
  received_at?: string;
};

/**
 * Resolves an inbound envelope onto exactly one thread.
 *
 * Returns `{ status: 'RESOLVED' | 'UNRESOLVED' | 'REVIEW_REQUIRED' }`.
 * REVIEW_REQUIRED means several threads matched at the same confidence level —
 * the caller must NOT mutate any of them.
 */
export function resolveInboundThread(input: {
  envelope: InboundEnvelope;
  threads: any[];
  /** Tenant of the receiving mailbox; a cross-tenant match is refused. */
  expected_tenant?: string | null;
}) {
  const envelope = input.envelope || {};
  const threads = Array.isArray(input.threads) ? input.threads : [];
  const attempted: any[] = [];

  const finish = (strategy: string, matches: any[]) => {
    attempted.push({ strategy, matched: matches.length });
    if (matches.length === 1) {
      const thread = matches[0];
      // Cross-tenant guard (spec §3.6): never attach a message to a thread
      // owned by a different tenant, however strong the technical match.
      if (
        input.expected_tenant &&
        text(thread.brand_id) &&
        text(thread.brand_id) !== text(input.expected_tenant)
      ) {
        return {
          status: 'REVIEW_REQUIRED' as const,
          thread: null,
          strategy,
          candidates: matches.map((row) => text(row.id)),
          reason: 'cross_tenant_thread_match_refused',
          attempted,
          resolver_version: CONVERSATION_RESOLUTION_VERSION,
        };
      }
      return {
        status: 'RESOLVED' as const,
        thread,
        strategy,
        candidates: [text(thread.id)],
        reason: null,
        attempted,
        resolver_version: CONVERSATION_RESOLUTION_VERSION,
      };
    }
    if (matches.length > 1) {
      return {
        status: 'REVIEW_REQUIRED' as const,
        thread: null,
        strategy,
        candidates: matches.map((row) => text(row.id)),
        reason: 'ambiguous_thread_candidates',
        attempted,
        resolver_version: CONVERSATION_RESOLUTION_VERSION,
      };
    }
    return null;
  };

  // 1. Exact provider thread id.
  if (text(envelope.provider_thread_id)) {
    const result = finish('PROVIDER_THREAD_ID', threads.filter((row) =>
      text(row.external_thread_id) === text(envelope.provider_thread_id) &&
      (!text(envelope.provider) || lower(row.external_provider) === lower(envelope.provider))
    ));
    if (result) return result;
  }

  // 2. Internet message references (In-Reply-To / References).
  const references = [
    ...(Array.isArray(envelope.references) ? envelope.references : []),
    envelope.in_reply_to,
  ].map(text).filter(Boolean);
  if (references.length) {
    const result = finish('INTERNET_MESSAGE_REFERENCES', threads.filter((row) =>
      (Array.isArray(row.internet_message_ids) ? row.internet_message_ids : [])
        .map(text).some((value: string) => references.includes(value))
    ));
    if (result) return result;
  }

  // 3. Explicit enrollment/campaign reference carried by the provider.
  if (text(envelope.enrollment_id)) {
    const result = finish('ENROLLMENT_OR_CAMPAIGN_REF', threads.filter((row) =>
      text(row.enrollment_id) === text(envelope.enrollment_id)
    ));
    if (result) return result;
  }

  // 4. Normalized email + campaign + an OPEN thread. Deliberately last and
  //    deliberately narrow: without a campaign scope this would match every
  //    historical conversation with that address.
  const from = lower(envelope.from_email);
  if (from && text(envelope.campaign_id)) {
    const result = finish('NORMALIZED_EMAIL_AND_CAMPAIGN', threads.filter((row) =>
      lower(row.counterparty_email) === from &&
      text(row.campaign_id) === text(envelope.campaign_id) &&
      lower(row.status) !== 'closed'
    ));
    if (result) return result;
  }

  return {
    status: 'UNRESOLVED' as const,
    thread: null,
    strategy: null,
    candidates: [],
    reason: 'no_thread_matched',
    attempted,
    resolver_version: CONVERSATION_RESOLUTION_VERSION,
  };
}

/** Canonical classification taxonomy (spec §10.3). */
export const CONVERSATION_CLASSIFICATIONS = Object.freeze([
  'POSITIVE_INTEREST', 'MORE_INFORMATION', 'PRICING_QUESTION', 'SECURITY_QUESTION',
  'LEGAL_QUESTION', 'OBJECTION', 'NOT_NOW', 'WRONG_PERSON', 'REFERRED_TO_CONTACT',
  'OUT_OF_OFFICE', 'UNSUBSCRIBE', 'COMPLAINT', 'BOUNCE', 'AUTOMATED_RESPONSE',
  'PARTNER_INTEREST', 'PROVIDER_PROPOSAL', 'PROVIDER_PRICING_INFORMATION',
  'MEETING_REQUEST', 'CONNECTION_REQUEST', 'INVOICE_ISSUE', 'CUSTOMER_SUPPORT',
  'UNKNOWN', 'REVIEW_REQUIRED',
] as const);

/** Classifications that must never be handled autonomously (spec §10.8). */
export const ESCALATION_REQUIRED_CLASSIFICATIONS = Object.freeze([
  'LEGAL_QUESTION', 'SECURITY_QUESTION', 'COMPLAINT', 'PROVIDER_PROPOSAL',
  'INVOICE_ISSUE',
] as const);

/**
 * Records a classification with full provenance. A HUMAN correction supersedes
 * the model projection WITHOUT deleting it (spec §10.3) — the original
 * prediction stays available for evaluation.
 */
export function recordClassification(input: {
  existing?: any;
  classification: string;
  confidence?: number | null;
  reason?: string;
  source_message_id?: string;
  model?: string | null;
  policy_version?: string | null;
  corrected_by?: string | null;
  at: string;
}) {
  const value = text(input.classification).toUpperCase();
  const valid = (CONVERSATION_CLASSIFICATIONS as readonly string[]).includes(value);
  const canonical = valid ? value : 'REVIEW_REQUIRED';
  const isHuman = Boolean(text(input.corrected_by));
  const existing = input.existing || {};
  return {
    classification: canonical,
    classification_confidence: isHuman ? 1 : (typeof input.confidence === 'number' ? input.confidence : null),
    classification_reason: text(input.reason).slice(0, 500) || null,
    classification_source: isHuman ? 'HUMAN' : 'MODEL',
    source_message_id: text(input.source_message_id) || null,
    model: isHuman ? null : (text(input.model) || null),
    policy_version: text(input.policy_version) || null,
    corrected_by: isHuman ? text(input.corrected_by) : null,
    corrected_at: isHuman ? input.at : null,
    classified_at: input.at,
    // The model's original prediction is preserved on correction.
    superseded_prediction: isHuman && existing.classification
      ? {
        classification: existing.classification,
        confidence: existing.classification_confidence ?? null,
        model: existing.model ?? null,
        classified_at: existing.classified_at ?? null,
      }
      : (existing.superseded_prediction ?? null),
    unsupported_classification_input: valid ? null : text(input.classification) || null,
    escalation_required: (ESCALATION_REQUIRED_CLASSIFICATIONS as readonly string[]).includes(canonical),
    resolver_version: CONVERSATION_RESOLUTION_VERSION,
  };
}

/**
 * Decides whether CAMBRA may handle a thread autonomously (spec §19.2).
 * Every condition must hold; anything unknown means a human handles it.
 */
export function evaluateAutonomyDecision(input: {
  classification?: string;
  ai_mode?: string;
  policy_autonomous_replies_enabled?: boolean;
  founder_permit_available?: boolean;
  human_takeover_at?: string | null;
  emergency?: { safe_mode?: boolean; communications_paused?: boolean } | null;
  emergencyAvailable?: boolean;
  sending_profile_healthy?: boolean;
  within_business_hours?: boolean;
  grounded?: boolean;
  contains_material_terms?: boolean;
}) {
  const blockers: string[] = [];
  const classification = text(input.classification).toUpperCase();
  if ((ESCALATION_REQUIRED_CLASSIFICATIONS as readonly string[]).includes(classification)) {
    blockers.push('classification_requires_human');
  }
  if (classification === 'UNKNOWN' || classification === 'REVIEW_REQUIRED' || !classification) {
    blockers.push('classification_not_confident');
  }
  if (text(input.ai_mode).toUpperCase() !== 'AUTONOMOUS') blockers.push('ai_mode_not_autonomous');
  if (input.policy_autonomous_replies_enabled !== true) blockers.push('policy_does_not_allow_autonomous_replies');
  // The FounderPermit authority does not exist on this tree (C0). Reported as
  // a blocker rather than assumed satisfied.
  if (input.founder_permit_available !== true) blockers.push('founder_permit_unavailable');
  if (text(input.human_takeover_at)) blockers.push('human_has_taken_over');
  if (input.emergencyAvailable === false || !input.emergency) blockers.push('emergency_authority_unavailable');
  else if (input.emergency.safe_mode === true || input.emergency.communications_paused === true) {
    blockers.push('emergency_pause_active');
  }
  if (input.sending_profile_healthy !== true) blockers.push('sending_profile_not_healthy');
  if (input.within_business_hours !== true) blockers.push('outside_business_hours');
  if (input.grounded !== true) blockers.push('reply_not_grounded_in_evidence');
  if (input.contains_material_terms === true) blockers.push('material_terms_require_founder');

  return {
    // DRAFT_ONLY is the safe middle ground: CAMBRA may prepare a reply for a
    // human to send even when it may not send autonomously.
    decision: blockers.length === 0 ? 'AUTONOMOUS' : 'HUMAN_REQUIRED',
    may_draft: !blockers.includes('emergency_pause_active') && !blockers.includes('emergency_authority_unavailable'),
    may_send_autonomously: blockers.length === 0,
    blockers,
    escalation_required: (ESCALATION_REQUIRED_CLASSIFICATIONS as readonly string[]).includes(classification),
    resolver_version: CONVERSATION_RESOLUTION_VERSION,
  };
}

/**
 * Human takeover state machine (spec §10.5). Takeover blocks auto-send
 * immediately; returning control requires an explicit re-validation.
 */
export function applyTakeoverAction(input: {
  thread: any;
  action: string;
  actor: string;
  at: string;
  /** Set when an outbound effect is already in flight for this thread. */
  effect_in_flight?: boolean;
}) {
  const action = text(input.action).toUpperCase();
  const thread = input.thread || {};
  const base = { thread_id: text(thread.id), action, actor: input.actor, at: input.at };

  switch (action) {
    case 'TAKE_OVER':
      return {
        ...base,
        ok: true,
        patch: {
          owner_type: 'HUMAN', owner_id: input.actor, ai_mode: 'OFF',
          human_takeover_at: input.at, human_takeover_by: input.actor,
          operational_status: 'NEEDS_HUMAN', automation_paused: true,
          pause_reason: 'human_takeover',
        },
        // An in-flight effect cannot be un-sent; it must be reconciled.
        reconciliation_required: input.effect_in_flight === true,
        auto_send_blocked: true,
      };
    case 'RETURN_TO_CAMBRA':
      // Returning control is refused while an unresolved effect or an open
      // approval exists — otherwise CAMBRA could resume on top of an unknown.
      if (input.effect_in_flight === true) {
        return { ...base, ok: false, error: 'effect_in_flight_requires_reconciliation', patch: null };
      }
      if (!text(thread.next_action_due_at) && text(thread.operational_status).toUpperCase() === 'ESCALATED') {
        return { ...base, ok: false, error: 'escalation_must_be_resolved_before_return', patch: null };
      }
      return {
        ...base,
        ok: true,
        patch: {
          owner_type: 'CAMBRA', owner_id: null, ai_mode: 'DRAFT_ONLY',
          human_takeover_at: null, human_takeover_by: null,
          operational_status: 'AI_TRIAGE', automation_paused: false, pause_reason: null,
          resume_eligible: true,
        },
        reconciliation_required: false,
        auto_send_blocked: false,
      };
    case 'PAUSE_AUTOMATION':
      return { ...base, ok: true, patch: { automation_paused: true, pause_reason: 'founder_pause', operational_status: 'PAUSED_BY_FOUNDER', ai_mode: 'OFF' }, auto_send_blocked: true, reconciliation_required: false };
    case 'RESUME_AUTOMATION':
      return { ...base, ok: true, patch: { automation_paused: false, pause_reason: null, operational_status: 'AI_TRIAGE', ai_mode: 'DRAFT_ONLY' }, auto_send_blocked: false, reconciliation_required: false };
    case 'ESCALATE':
      return { ...base, ok: true, patch: { operational_status: 'ESCALATED', ai_mode: 'OFF', automation_paused: true, pause_reason: 'escalated' }, auto_send_blocked: true, reconciliation_required: false };
    case 'CLOSE_THREAD':
      return { ...base, ok: true, patch: { status: 'closed', operational_status: 'COMPLETED', automation_paused: true }, auto_send_blocked: true, reconciliation_required: false };
    default:
      return { ...base, ok: false, error: 'unsupported_takeover_action', patch: null };
  }
}
