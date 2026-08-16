// CAMP-C6 (2026-08-16) — SLA, follow-up queue and escalation
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C6, spec §10.8, §10.12, §19).
// Pure: `now` is always passed in, never read from the clock here.
//
// Two rules this file enforces that are easy to get wrong:
//   - An SLA that cannot be computed is UNKNOWN, not "on time". A missing
//     first-response deadline must never render as compliant.
//   - Escalation is decided from the CONTENT of what the counterparty asked,
//     not from the model's confidence. A request for a guarantee escalates
//     even if the classifier was sure it was routine.

export const CONVERSATION_FOLLOWUP_VERSION = 'conversation-followup-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const parse = (value: unknown) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export type SlaEvaluation = {
  status: 'ON_TIME' | 'DUE_SOON' | 'BREACHED' | 'UNKNOWN' | 'NOT_APPLICABLE';
  due_at: string | null;
  minutes_remaining: number | null;
  reason: string | null;
};

/**
 * Evaluates the first-response / next-action SLA for a thread.
 * `NOT_APPLICABLE` is only returned when the ball is genuinely not with us.
 */
export function evaluateThreadSla(input: {
  thread: any;
  now: string;
  due_soon_minutes?: number;
}): SlaEvaluation {
  const now = parse(input.now);
  if (now === null) {
    return { status: 'UNKNOWN', due_at: null, minutes_remaining: null, reason: 'invalid_reference_time' };
  }
  const thread = input.thread || {};
  const operational = text(thread.operational_status).toUpperCase();
  if (['COMPLETED', 'WAITING_ON_COUNTERPARTY'].includes(operational) || text(thread.status).toLowerCase() === 'closed') {
    return { status: 'NOT_APPLICABLE', due_at: null, minutes_remaining: null, reason: 'not_waiting_on_us' };
  }
  const dueRaw = text(thread.first_response_due_at) || text(thread.next_action_due_at);
  const due = parse(dueRaw);
  if (due === null) {
    // No computable deadline. Reporting ON_TIME here would claim compliance
    // with a commitment we never recorded.
    return {
      status: 'UNKNOWN', due_at: null, minutes_remaining: null,
      reason: dueRaw ? 'unparseable_due_at' : 'no_sla_deadline_recorded',
    };
  }
  const minutes = Math.round((due - now) / 60_000);
  const dueSoon = Math.max(0, Number(input.due_soon_minutes ?? 60));
  if (minutes < 0) return { status: 'BREACHED', due_at: new Date(due).toISOString(), minutes_remaining: minutes, reason: null };
  if (minutes <= dueSoon) return { status: 'DUE_SOON', due_at: new Date(due).toISOString(), minutes_remaining: minutes, reason: null };
  return { status: 'ON_TIME', due_at: new Date(due).toISOString(), minutes_remaining: minutes, reason: null };
}

/** Follow-up queue buckets (spec §10.12). */
export const FOLLOW_UP_BUCKETS = Object.freeze([
  'OVERDUE',
  'DUE_TODAY',
  'WAITING_ON_US',
  'WAITING_ON_THEM',
  'STALE',
  'UNCLASSIFIED_REPLY',
  'UNOWNED_REPLY',
  'REVIEW_REQUIRED',
] as const);

/**
 * Buckets threads into the follow-up queue. A thread lands in the FIRST
 * bucket that applies, so the queue counts never double-count a thread.
 */
export function buildFollowUpQueue(input: {
  threads: any[];
  now: string;
  stale_after_days?: number;
  available?: boolean;
}) {
  const available = input.available !== false;
  const now = parse(input.now);
  const staleMs = Math.max(1, Number(input.stale_after_days ?? 14)) * 86_400_000;
  const rows: any[] = [];
  const counts: Record<string, number> = Object.fromEntries(FOLLOW_UP_BUCKETS.map((key) => [key, 0]));

  for (const thread of (available && Array.isArray(input.threads) ? input.threads : [])) {
    const sla = evaluateThreadSla({ thread, now: input.now });
    const operational = text(thread.operational_status).toUpperCase();
    const lastMessage = parse(thread.last_message_at);
    let bucket: string | null = null;

    if (operational === 'REVIEW_REQUIRED') bucket = 'REVIEW_REQUIRED';
    else if (sla.status === 'BREACHED') bucket = 'OVERDUE';
    else if (sla.status === 'DUE_SOON') bucket = 'DUE_TODAY';
    else if (!text(thread.classification) && text(thread.last_inbound_at)) bucket = 'UNCLASSIFIED_REPLY';
    else if (!text(thread.owner_id) && text(thread.owner_type).toUpperCase() === 'HUMAN') bucket = 'UNOWNED_REPLY';
    else if (['NEEDS_HUMAN', 'WAITING_ON_US', 'ESCALATED'].includes(operational)) bucket = 'WAITING_ON_US';
    else if (operational === 'WAITING_ON_COUNTERPARTY') {
      bucket = (now !== null && lastMessage !== null && now - lastMessage > staleMs) ? 'STALE' : 'WAITING_ON_THEM';
    }

    if (!bucket) continue;
    counts[bucket] += 1;
    rows.push({
      thread_id: thread.id ?? null,
      bucket,
      company: text(thread.company_name) || null,
      contact: text(thread.counterparty_name) || text(thread.counterparty_email) || null,
      operational_status: operational || null,
      commercial_status: text(thread.commercial_status) || null,
      owner: text(thread.owner_id) || (text(thread.owner_type).toUpperCase() === 'CAMBRA' ? 'CAMBRA' : null),
      last_interaction_at: thread.last_message_at ?? null,
      due_at: sla.due_at,
      sla_status: sla.status,
      sla_reason: sla.reason,
      automation_paused: thread.automation_paused === true,
    });
  }

  return {
    rows,
    counts,
    total: rows.length,
    data_status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    truth_boundary:
      'A thread appears in exactly one bucket. A thread whose SLA cannot be computed is never counted as on time.',
    queue_version: CONVERSATION_FOLLOWUP_VERSION,
  };
}

/**
 * Content-based escalation triggers (spec §10.8). These are matched against
 * what the counterparty actually wrote, independently of the classifier —
 * a request for a guarantee escalates even if the model was confident it was
 * routine.
 */
const ESCALATION_PATTERNS: Array<{ key: string; pattern: RegExp; risk: string }> = [
  { key: 'SAVINGS_GUARANTEE_REQUESTED', risk: 'commercial', pattern: /\b(guarantee|guaranteed|garantía|garantizar|garantie|garantir)\b/i },
  { key: 'PRICING_OR_DISCOUNT', risk: 'commercial', pattern: /\b(discount|rebate|descuento|remise|your\s+price|vuestro\s+precio|commission\s+rate)\b/i },
  { key: 'CONTRACT_OR_MANDATE', risk: 'legal', pattern: /\b(contract|mandate|sign|signature|contrato|mandato|firmar|contrat|mandat|signer)\b/i },
  { key: 'EXCLUSIVITY', risk: 'legal', pattern: /\b(exclusiv\w+|exclusiva|exclusivité)\b/i },
  { key: 'LEGAL_ACTION', risk: 'legal', pattern: /\b(lawyer|legal\s+action|sue|abogad\w+|avocat|poursuite)\b/i },
  { key: 'SECURITY_INCIDENT', risk: 'security', pattern: /\b(breach|security\s+incident|vulnerab\w+|brecha|incidente\s+de\s+seguridad|faille)\b/i },
  { key: 'PRIVACY_OR_DELETION', risk: 'privacy', pattern: /\b(gdpr|rgpd|delete\s+my\s+data|erasure|borrar\s+mis\s+datos|suppression\s+de\s+mes\s+données|right\s+to\s+be\s+forgotten)\b/i },
  { key: 'COMPLAINT', risk: 'reputational', pattern: /\b(complaint|spam|harass\w*|queja|denuncia|plainte)\b/i },
  { key: 'BILLING_DISPUTE', risk: 'financial', pattern: /\b(invoice|refund|chargeback|factura|reembolso|facture|remboursement)\b/i },
  { key: 'MIGRATION_OR_CUTOVER', risk: 'operational', pattern: /\b(migrat\w+|cutover|switch\s+provider|migración|migration)\b/i },
  { key: 'MEDIA_OR_REPUTATION', risk: 'reputational', pattern: /\b(journalist|press|linkedin\s+post|periodista|prensa|presse)\b/i },
];

/**
 * Decides whether a thread must be escalated to the founder, and says why in
 * terms a human can act on (spec §10.8).
 */
export function evaluateEscalation(input: {
  message_text?: string;
  classification?: string;
  /** Set when CAMBRA has no grounded answer for the question asked. */
  answer_unknown?: boolean;
  /** Set when two sources disagree about a fact needed to answer. */
  source_conflict?: boolean;
}) {
  const body = text(input.message_text);
  const triggers: any[] = [];
  for (const rule of ESCALATION_PATTERNS) {
    if (rule.pattern.test(body)) {
      triggers.push({ trigger: rule.key, risk: rule.risk, source: 'MESSAGE_CONTENT' });
    }
  }
  const classification = text(input.classification).toUpperCase();
  const classificationEscalations: Record<string, string> = {
    LEGAL_QUESTION: 'legal',
    SECURITY_QUESTION: 'security',
    COMPLAINT: 'reputational',
    PROVIDER_PROPOSAL: 'commercial',
    INVOICE_ISSUE: 'financial',
  };
  if (classificationEscalations[classification]) {
    triggers.push({ trigger: `CLASSIFICATION_${classification}`, risk: classificationEscalations[classification], source: 'CLASSIFICATION' });
  }
  // "We do not know" is an escalation reason, not a licence to improvise.
  if (input.answer_unknown === true) {
    triggers.push({ trigger: 'ANSWER_UNKNOWN', risk: 'accuracy', source: 'GROUNDING' });
  }
  if (input.source_conflict === true) {
    triggers.push({ trigger: 'SOURCE_CONFLICT', risk: 'accuracy', source: 'GROUNDING' });
  }

  const required = triggers.length > 0;
  return {
    escalation_required: required,
    triggers,
    risks: [...new Set(triggers.map((row) => row.risk))],
    required_authority: required ? 'FOUNDER' : 'CAMBRA',
    recommended_safe_response: required
      ? 'Acknowledge the message, commit to a specific follow-up, and make no commercial, legal or economic commitment until the founder has answered.'
      : null,
    escalation_version: CONVERSATION_FOLLOWUP_VERSION,
  };
}

/**
 * Builds a reply draft envelope. This NEVER sends: it returns the draft plus
 * the reasons a human must review it (spec §19.3).
 */
export function buildReplyDraftEnvelope(input: {
  draft_text: string;
  thread: any;
  autonomy: { may_send_autonomously?: boolean; blockers?: string[] };
  escalation: { escalation_required?: boolean; triggers?: any[] };
  source_facts?: string[];
  assumptions?: string[];
  unanswered_questions?: string[];
  model?: string | null;
  cost_minor?: number | null;
}) {
  const escalated = input.escalation?.escalation_required === true;
  return {
    draft_text: text(input.draft_text).slice(0, 20000),
    thread_id: input.thread?.id ?? null,
    // A draft is only ever a draft here. Sending is a separate, authorized act.
    send_performed: false,
    external_send_performed: false,
    requires_human_review: escalated || input.autonomy?.may_send_autonomously !== true,
    review_reasons: [
      ...(escalated ? ['escalation_required'] : []),
      ...(input.autonomy?.blockers || []),
    ],
    escalation_triggers: input.escalation?.triggers || [],
    source_facts: (input.source_facts || []).slice(0, 50),
    assumptions: (input.assumptions || []).slice(0, 50),
    unanswered_questions: (input.unanswered_questions || []).slice(0, 50),
    model: input.model ?? null,
    cost_minor: Number.isFinite(Number(input.cost_minor)) ? Number(input.cost_minor) : null,
    draft_version: CONVERSATION_FOLLOWUP_VERSION,
  };
}
