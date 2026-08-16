// CAMP-C4 (2026-08-16) — campaign execution engine (PROMPT_FIX_DISCOVERY_V2
// Parte 4, chunk C4, spec §8).
//
// THIS MODULE NEVER TALKS TO A PROVIDER. It receives a `transport` function
// and, in this whole Parte, that function is always a dry-run adapter. When a
// real transport is wired later it must be the canonical outbound primitive —
// this engine only orchestrates claims, gates and settlement around it.
//
// The three properties that matter and are each covered by a test:
//   1. Immediate pre-effect gates re-read mutable state RIGHT BEFORE the
//      effect. A reply, a suppression or an emergency that lands between
//      scheduling and sending stops the send.
//   2. Provider acceptance is NOT delivery. An accepted response settles to
//      PROVIDER_ACCEPTED, never DELIVERED_OBSERVED.
//   3. Post-effect ambiguity never retries blindly. If the effect started and
//      then persistence or the response was lost, the enrollment converges to
//      REVIEW_REQUIRED.
import { projectMaterialEffectState } from './materialEffectContract.ts';
import { suppressionMatches } from './campaignsCore.ts';

export const CAMPAIGN_EXECUTION_ENGINE_VERSION = 'campaign-execution-engine-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Enrollment states that mean "this recipient must not receive anything more". */
export const TERMINAL_ENROLLMENT_STATES = Object.freeze([
  'EXCLUDED', 'REPLIED', 'POSITIVE_REPLY', 'NEUTRAL_REPLY', 'NEGATIVE_REPLY',
  'WRONG_CONTACT', 'BOUNCED', 'UNSUBSCRIBED', 'COMPLAINT', 'MEETING_BOOKED',
  'CONNECTION_STARTED', 'CONNECTION_COMPLETED', 'QUALIFIED',
  'OPPORTUNITY_CREATED', 'RECOVER_CREATED', 'CONVERTED', 'STOPPED',
  'REVIEW_REQUIRED',
] as const);

/**
 * Stable identity shared by manual, scheduled and Command execution (spec §3.4).
 * The same campaign + enrollment + step always yields the same keys, so a
 * second attempt is recognised as the same operation rather than a new send.
 */
export function buildEffectIdentity(input: {
  campaign_id: string;
  enrollment_id: string;
  sequence_step: number | string;
}) {
  const base = `${text(input.campaign_id)}:${text(input.enrollment_id)}:${text(input.sequence_step)}`;
  return { operation_key: `campaign-send:${base}`, effect_key: `campaign-effect:${base}` };
}

export type EnrollmentCreationInput = {
  campaign: any;
  audienceVersion: any;
  members: any[];
  content_version_id?: string | null;
  sequence_version_id?: string | null;
};

/**
 * Builds enrollment rows from a FROZEN audience version. Pure: the caller
 * persists them. No provider is contacted (spec §8.1).
 */
export function buildEnrollments(input: EnrollmentCreationInput) {
  const campaign = input.campaign || {};
  const audience = input.audienceVersion || {};
  if (text(audience.status).toUpperCase() !== 'FROZEN') {
    return { ok: false, error: 'audience_version_must_be_frozen', enrollments: [] };
  }
  const at = new Date().toISOString();
  const enrollments = (Array.isArray(input.members) ? input.members : []).map((member, index) => {
    const identity = buildEffectIdentity({
      campaign_id: text(campaign.id),
      enrollment_id: `${text(audience.id)}:${index}`,
      sequence_step: 1,
    });
    return {
      enrollment_key: `${text(campaign.id)}:${text(audience.id)}:${text(member.email_hash || member.email_normalized)}`,
      campaign_id: text(campaign.id),
      audience_version_id: text(audience.id),
      lane: text(campaign.lane) || null,
      objective_type: text(campaign.objective_type) || null,
      subject_type: text(member.subject_type) || 'OutboundLead',
      subject_id: text(member.subject_id),
      lead_id: text(member.lead_id) || null,
      brand_id: text(member.brand_id) || null,
      company_key: text(member.company_key) || null,
      company_name: text(member.company_name) || null,
      contact_id: text(member.contact_id) || null,
      email_normalized: text(member.email_normalized),
      market: text(member.country) || null,
      city: text(member.city) || null,
      language: text(member.language) || null,
      eligibility_status: 'ELIGIBLE',
      company_contact_rank: Number(member.company_contact_rank || 1),
      content_version_id: input.content_version_id || null,
      sequence_version_id: input.sequence_version_id || null,
      current_step: 0,
      operation_key: identity.operation_key,
      effect_key: identity.effect_key,
      state: 'ELIGIBLE',
      created_at: at,
      updated_at: at,
      revision: 0,
    };
  });
  return { ok: true, enrollments, engine_version: CAMPAIGN_EXECUTION_ENGINE_VERSION };
}

export type PreEffectContext = {
  campaign?: any;
  enrollment?: any;
  suppressions?: any[];
  suppressionsAvailable?: boolean;
  threadHasReply?: boolean;
  policyActive?: boolean;
  marketEligible?: boolean;
  sendingProfileHealthy?: boolean;
  budgetRemainingMinor?: number | null;
  emergency?: { safe_mode?: boolean; communications_paused?: boolean; control_revision?: number } | null;
  emergencyAvailable?: boolean;
  /** Emergency revision captured when the slot was claimed (spec §8.3). */
  capturedEmergencyRevision?: number | null;
};

/**
 * The gates that run immediately before the provider effect (spec §8.3).
 * Every one of these re-reads mutable state; anything unreadable BLOCKS.
 */
export function evaluatePreEffectGates(context: PreEffectContext) {
  const blockers: string[] = [];
  const campaign = context.campaign || {};
  const enrollment = context.enrollment || {};

  const campaignStatus = text(campaign.status).toUpperCase();
  if (!['RUNNING', 'SCHEDULED', 'APPROVED'].includes(campaignStatus)) {
    blockers.push('campaign_not_running');
  }
  if ((TERMINAL_ENROLLMENT_STATES as readonly string[]).includes(text(enrollment.state).toUpperCase())) {
    blockers.push('enrollment_terminal');
  }
  // A reply observed between scheduling and effect stops the follow-up. This
  // is the race the spec calls out explicitly (§8.7).
  if (context.threadHasReply === true) blockers.push('reply_received_before_effect');

  if (context.suppressionsAvailable === false) {
    blockers.push('suppression_ledger_unavailable');
  } else {
    const suppression = suppressionMatches(context.suppressions || [], {
      email: text(enrollment.email_normalized) || undefined,
      contact_id: text(enrollment.contact_id) || undefined,
      company_key: text(enrollment.company_key) || undefined,
      campaign_id: text(enrollment.campaign_id) || undefined,
    });
    if (suppression.suppressed) blockers.push('recipient_suppressed');
  }

  if (context.policyActive !== true) blockers.push('commercial_policy_not_active');
  if (context.marketEligible !== true) blockers.push('market_not_eligible');
  if (context.sendingProfileHealthy !== true) blockers.push('sending_profile_not_healthy');

  // Number(null) is 0, so an absent budget must be detected BEFORE the numeric
  // check — otherwise an unreadable budget is misreported as "exhausted",
  // which tells the founder to top up when the real problem is a failed read.
  const budgetRaw = context.budgetRemainingMinor;
  const budget = Number(budgetRaw);
  if (budgetRaw === null || budgetRaw === undefined || budgetRaw === '' || !Number.isFinite(budget)) {
    blockers.push('budget_unknown');
  } else if (budget <= 0) blockers.push('budget_exhausted');

  if (context.emergencyAvailable === false || !context.emergency) {
    blockers.push('emergency_authority_unavailable');
  } else {
    if (context.emergency.safe_mode === true || context.emergency.communications_paused === true) {
      blockers.push('emergency_pause_active');
    }
    // Epoch check: if the emergency revision moved since the claim, the
    // authorization the claim was based on is stale.
    if (
      context.capturedEmergencyRevision !== null && context.capturedEmergencyRevision !== undefined &&
      Number(context.emergency.control_revision) !== Number(context.capturedEmergencyRevision)
    ) blockers.push('emergency_epoch_changed_during_claim');
  }

  return { allowed: blockers.length === 0, blockers, gate_version: CAMPAIGN_EXECUTION_ENGINE_VERSION };
}

export type TransportResult = {
  /** Whether the provider was actually contacted. Dry-run adapters set false. */
  effect_started?: boolean;
  accepted?: boolean;
  provider_message_id?: string | null;
  provider?: string | null;
  error?: string | null;
  /** Set when the outcome could not be determined after the effect started. */
  ambiguous?: boolean;
};

/**
 * Settles one send attempt (spec §8.5). Conservative by construction:
 * acceptance is acceptance, never delivery; ambiguity after the effect started
 * is REVIEW_REQUIRED and explicitly not retryable.
 */
export function settleSendAttempt(input: {
  transport: TransportResult;
  dry_run: boolean;
}) {
  const transport = input.transport || {};
  const effectStarted = transport.effect_started === true;
  const material = projectMaterialEffectState({
    native_state: transport.ambiguous === true
      ? 'EFFECT_UNKNOWN'
      : transport.accepted === true
      ? 'ACCEPTED'
      : transport.error
      ? 'FAILED'
      : 'CLAIMED',
    effects_started: effectStarted,
    review_required: transport.ambiguous === true,
  });

  let state: string;
  if (material === 'REVIEW_REQUIRED') state = 'REVIEW_REQUIRED';
  else if (material === 'FAILED_POST_EFFECT') state = 'REVIEW_REQUIRED';
  else if (material === 'FAILED_PRE_EFFECT') state = 'QUEUED';
  else if (transport.accepted === true) state = 'PROVIDER_ACCEPTED';
  else state = 'CLAIMED';

  return {
    state,
    material_effect_state: material,
    // A pre-effect failure is safely retryable; anything that touched the
    // provider is not (spec §3.5).
    retry_safe: material === 'FAILED_PRE_EFFECT',
    delivered: false,
    delivery_evidence_required: true,
    dry_run: input.dry_run === true,
    external_effect_performed: input.dry_run === true ? false : effectStarted,
    provider_message_id: text(transport.provider_message_id) || null,
    provider: text(transport.provider) || null,
    settled_at: new Date().toISOString(),
    engine_version: CAMPAIGN_EXECUTION_ENGINE_VERSION,
  };
}

/**
 * Dry-run transport used throughout this Parte. It simulates only guarantees a
 * real provider documents, and it never performs a network call.
 */
export function dryRunTransport(): TransportResult {
  return {
    effect_started: false,
    accepted: true,
    provider: 'dry_run',
    provider_message_id: null,
    error: null,
    ambiguous: false,
  };
}

/**
 * Projects an observed provider event onto the enrollment state (spec §13.1).
 * Only an observed delivery event may produce DELIVERED_OBSERVED.
 */
export function projectProviderEventOntoEnrollment(input: {
  current_state: string;
  normalized_event_type: string;
}) {
  const current = text(input.current_state).toUpperCase();
  const event = text(input.normalized_event_type).toUpperCase();
  // Terminal commercial outcomes are never downgraded by a later transport event.
  if ((TERMINAL_ENROLLMENT_STATES as readonly string[]).includes(current) && event !== 'HARD_BOUNCE' && event !== 'COMPLAINT' && event !== 'UNSUBSCRIBE') {
    return { state: current, changed: false, reason: 'terminal_state_preserved' };
  }
  const map: Record<string, string> = {
    PROVIDER_ACCEPTED: 'PROVIDER_ACCEPTED',
    DELIVERED: 'DELIVERED_OBSERVED',
    OPENED: 'OPEN_OBSERVED',
    CLICKED: 'CLICK_OBSERVED',
    REPLY_RECEIVED: 'REPLIED',
    HARD_BOUNCE: 'BOUNCED',
    COMPLAINT: 'COMPLAINT',
    UNSUBSCRIBE: 'UNSUBSCRIBED',
  };
  const next = map[event];
  if (!next) {
    // SOFT_BOUNCE, DEFERRED, ACCOUNT_ERROR, AUTH_ERROR, WEBHOOK_ERROR and
    // UNKNOWN are recorded but must not invent a delivery state.
    return { state: current, changed: false, reason: 'event_does_not_change_enrollment_state' };
  }
  return { state: next, changed: next !== current, reason: 'observed_provider_event' };
}
