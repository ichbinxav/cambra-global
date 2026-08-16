// CAMP-C7 (2026-08-16) — sender health, auto-containment, suppression
// management and provider-event projection (PROMPT_FIX_DISCOVERY_V2 Parte 4,
// chunk C7, spec §11-13). Pure.
//
// The rule that governs this whole file: health is EVIDENCE plus FRESHNESS.
// An observation with no timestamp, or one older than its TTL, is UNKNOWN —
// never "still healthy". Treating a stale green light as green is how a
// degraded mailbox keeps sending.

export const SENDER_HEALTH_VERSION = 'sender-health-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const parse = (value: unknown) => {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export const SENDER_HEALTH_STATES = Object.freeze([
  'HEALTHY', 'WARMING', 'DEGRADED', 'THROTTLED', 'AUTH_EXPIRED',
  'PAUSED', 'QUARANTINED', 'BLOCKED', 'UNKNOWN',
] as const);

/** Default freshness window for a health observation. */
export const HEALTH_OBSERVATION_TTL_HOURS = 24;

export type SenderHealthThresholds = {
  bounce_pause_pct?: number;
  complaint_pause_pct?: number;
  complaint_slow_pct?: number;
};

/**
 * Projects a sending profile's health from observed evidence.
 *
 * Order matters: hard operational states (blocked/quarantined/paused) win over
 * metrics, and staleness beats an otherwise-green reading.
 */
export function projectSenderHealth(input: {
  profile: any;
  now: string;
  ttl_hours?: number;
  thresholds?: SenderHealthThresholds;
}) {
  const profile = input.profile || {};
  const now = parse(input.now);
  const ttlMs = Math.max(1, Number(input.ttl_hours ?? HEALTH_OBSERVATION_TTL_HOURS)) * 3_600_000;
  const observedAt = parse(profile.last_provider_health_at);
  const reasons: string[] = [];

  const operational = text(profile.status).toLowerCase();
  const state = (value: string) => ({
    health: value,
    operational_status: operational || 'unknown',
    reasons,
    observed_at: observedAt ? new Date(observedAt).toISOString() : null,
    freshness_hours: observedAt !== null && now !== null ? Number(((now - observedAt) / 3_600_000).toFixed(2)) : null,
    can_send: value === 'HEALTHY' || value === 'WARMING',
    health_version: SENDER_HEALTH_VERSION,
  });

  // 1. Hard operational states are authoritative regardless of metrics.
  if (operational === 'blocked') { reasons.push('profile_blocked'); return state('BLOCKED'); }
  if (operational === 'quarantined') { reasons.push('profile_quarantined'); return state('QUARANTINED'); }
  if (operational === 'paused') { reasons.push('profile_paused'); return state('PAUSED'); }

  // 2. Authentication. An expired or unknown token cannot send.
  const authExpiry = parse(profile.auth_expires_at ?? profile.provider_config_json?.auth_expires_at);
  if (text(profile.auth_status).toLowerCase() === 'expired') { reasons.push('auth_expired'); return state('AUTH_EXPIRED'); }
  if (authExpiry !== null && now !== null && authExpiry <= now) { reasons.push('auth_expired'); return state('AUTH_EXPIRED'); }

  // 3. Freshness. No observation, or an observation past its TTL, is UNKNOWN.
  if (observedAt === null) { reasons.push('no_health_observation'); return state('UNKNOWN'); }
  if (now === null) { reasons.push('invalid_reference_time'); return state('UNKNOWN'); }
  if (now - observedAt > ttlMs) { reasons.push('health_observation_stale'); return state('UNKNOWN'); }

  // 4. Webhook health: without inbound events we cannot observe outcomes.
  const webhook = text(profile.webhook_status).toUpperCase();
  if (webhook && webhook !== 'ACTIVE') { reasons.push(`webhook_${webhook.toLowerCase()}`); return state('DEGRADED'); }

  // 5. Observed rates against configured thresholds.
  const thresholds = input.thresholds || {};
  const bouncePause = Number(profile.bounce_pause_threshold_pct ?? thresholds.bounce_pause_pct ?? 5);
  const complaintPause = Number(profile.complaint_pause_threshold_pct ?? thresholds.complaint_pause_pct ?? 0.3);
  const complaintSlow = Number(profile.complaint_slow_threshold_pct ?? thresholds.complaint_slow_pct ?? 0.1);
  const bounce = Number(profile.bounce_rate_pct);
  const complaint = Number(profile.complaint_rate_pct);
  if (Number.isFinite(bounce) && bounce >= bouncePause) { reasons.push('bounce_rate_above_pause_threshold'); return state('DEGRADED'); }
  if (Number.isFinite(complaint) && complaint >= complaintPause) { reasons.push('complaint_rate_above_pause_threshold'); return state('DEGRADED'); }
  if (Number.isFinite(complaint) && complaint >= complaintSlow) { reasons.push('complaint_rate_above_slow_threshold'); return state('THROTTLED'); }

  // 6. Warmup.
  const currentCap = Number(profile.current_daily_cap || 0);
  const targetCap = Number(profile.target_daily_cap || 0);
  if (currentCap <= 0) { reasons.push('no_daily_capacity'); return state('THROTTLED'); }
  if (targetCap > 0 && currentCap < targetCap) { reasons.push('warming_up'); return state('WARMING'); }

  return state('HEALTHY');
}

/**
 * Auto-containment decision (spec §11.4). Containment PAUSES new sends and
 * opens an incident; it never deletes campaigns or enrollments.
 */
export function evaluateSenderContainment(input: {
  health: { health: string; reasons?: string[] };
  emergency?: { safe_mode?: boolean; communications_paused?: boolean } | null;
  emergencyAvailable?: boolean;
}) {
  const health = text(input.health?.health).toUpperCase();
  const reasons = [...(input.health?.reasons || [])];
  const contain = ['AUTH_EXPIRED', 'DEGRADED', 'BLOCKED', 'QUARANTINED', 'UNKNOWN'].includes(health);
  if (input.emergencyAvailable === false || !input.emergency) reasons.push('emergency_authority_unavailable');
  else if (input.emergency.safe_mode === true || input.emergency.communications_paused === true) reasons.push('emergency_pause_active');
  const emergencyContain = reasons.includes('emergency_pause_active') || reasons.includes('emergency_authority_unavailable');

  return {
    contain: contain || emergencyContain,
    pause_new_sends: contain || emergencyContain,
    // Containment is reversible and non-destructive by construction.
    campaigns_preserved: true,
    enrollments_preserved: true,
    incident_required: contain,
    incident_severity: ['BLOCKED', 'QUARANTINED', 'AUTH_EXPIRED'].includes(health) ? 'critical' : 'warning',
    reasons,
    containment_version: SENDER_HEALTH_VERSION,
  };
}

/** Canonical suppression reasons (spec §12.2). */
export const SUPPRESSION_CANONICAL_REASONS = Object.freeze([
  'UNSUBSCRIBE', 'COMPLAINT', 'HARD_BOUNCE', 'SOFT_BOUNCE_TEMPORARY',
  'NOT_INTERESTED', 'WRONG_PERSON', 'FOUNDER_BLOCK', 'COMPANY_BLOCK',
  'DOMAIN_BLOCK', 'LEGAL_REQUEST', 'INVALID_ADDRESS', 'PROVIDER_BLOCKLIST',
  'CUSTOMER_EXCLUSION', 'DUPLICATE',
] as const);

/**
 * Builds a suppression record from an observed event.
 *
 * WRONG_PERSON is deliberately scoped to the individual address and marked
 * non-permanent: the person may be redirecting us to a colleague, and
 * suppressing the whole company because one contact was wrong would destroy a
 * legitimate opportunity (spec §12.2).
 */
export function buildSuppressionRecord(input: {
  reason: string;
  email?: string;
  contact_id?: string;
  company_key?: string;
  domain?: string;
  campaign_id?: string;
  source: string;
  source_provider?: string;
  source_event_id?: string;
  source_message_id?: string;
  actor?: string;
  at: string;
}) {
  const reason = text(input.reason).toUpperCase();
  if (!(SUPPRESSION_CANONICAL_REASONS as readonly string[]).includes(reason)) {
    return { ok: false as const, error: 'unsupported_suppression_reason', supported: SUPPRESSION_CANONICAL_REASONS };
  }
  // Reason decides scope; a caller cannot widen it arbitrarily.
  const scopeByReason: Record<string, string> = {
    UNSUBSCRIBE: 'EMAIL', COMPLAINT: 'EMAIL', HARD_BOUNCE: 'EMAIL',
    SOFT_BOUNCE_TEMPORARY: 'EMAIL', INVALID_ADDRESS: 'EMAIL',
    NOT_INTERESTED: 'EMAIL', WRONG_PERSON: 'EMAIL', PROVIDER_BLOCKLIST: 'EMAIL',
    FOUNDER_BLOCK: 'EMAIL', DUPLICATE: 'EMAIL',
    COMPANY_BLOCK: 'COMPANY', CUSTOMER_EXCLUSION: 'COMPANY',
    DOMAIN_BLOCK: 'DOMAIN', LEGAL_REQUEST: 'EMAIL',
  };
  const scopeType = scopeByReason[reason];
  const scopeValue = scopeType === 'EMAIL'
    ? text(input.email).toLowerCase()
    : scopeType === 'COMPANY'
    ? text(input.company_key).toLowerCase()
    : text(input.domain).toLowerCase();
  if (!scopeValue) {
    return { ok: false as const, error: 'suppression_scope_value_required', scope_type: scopeType };
  }
  // A temporary soft bounce expires; everything else persists until an
  // authorized removal (never automatic — spec §12.4).
  const expiresAt = reason === 'SOFT_BOUNCE_TEMPORARY'
    ? new Date(Date.parse(input.at) + 7 * 86_400_000).toISOString()
    : null;
  return {
    ok: true as const,
    record: {
      scope_type: scopeType,
      scope_value: scopeValue,
      email: scopeType === 'EMAIL' ? scopeValue : text(input.email).toLowerCase() || undefined,
      contact_id: text(input.contact_id) || undefined,
      company_key: text(input.company_key).toLowerCase() || undefined,
      domain: text(input.domain).toLowerCase() || undefined,
      campaign_id: text(input.campaign_id) || undefined,
      reason: legacyReasonFor(reason),
      canonical_reason: reason,
      source: text(input.source),
      source_provider: text(input.source_provider) || undefined,
      source_event_id: text(input.source_event_id) || undefined,
      source_message_id: text(input.source_message_id) || undefined,
      active: true,
      suppressed_at: input.at,
      expires_at: expiresAt,
      created_by: text(input.actor) || 'system',
    },
    permanent: reason !== 'SOFT_BOUNCE_TEMPORARY',
    // Documented, visible policy: a wrong contact does not blacklist the company.
    scope_policy_note: reason === 'WRONG_PERSON'
      ? 'Wrong contact suppresses only this address; the company stays contactable so a referral can be followed.'
      : null,
  };
}

/** Maps back to the legacy stored enum so existing readers keep working. */
function legacyReasonFor(canonical: string) {
  const map: Record<string, string> = {
    UNSUBSCRIBE: 'opt_out', COMPLAINT: 'complaint', HARD_BOUNCE: 'bounce',
    SOFT_BOUNCE_TEMPORARY: 'bounce', NOT_INTERESTED: 'not_interested',
    WRONG_PERSON: 'wrong_person', FOUNDER_BLOCK: 'manual', COMPANY_BLOCK: 'manual',
    DOMAIN_BLOCK: 'manual', LEGAL_REQUEST: 'legal', INVALID_ADDRESS: 'bounce',
    PROVIDER_BLOCKLIST: 'provider_blocklist', CUSTOMER_EXCLUSION: 'customer_exclusion',
    DUPLICATE: 'manual',
  };
  return map[canonical] || 'manual';
}

/**
 * Suppression removal is never automatic (spec §12.4): it requires an explicit
 * authority, a reason and an audit trail, and it produces a preview first.
 */
export function evaluateSuppressionRemoval(input: {
  suppression: any;
  actor?: string;
  reason?: string;
  confirmation?: string;
}) {
  const blockers: string[] = [];
  if (!input.suppression) blockers.push('suppression_not_found');
  if (!text(input.actor)) blockers.push('actor_required');
  if (text(input.reason).length < 10) blockers.push('explicit_reason_required');
  if (input.confirmation !== 'REMOVE_SUPPRESSION') blockers.push('confirmation_required');
  const canonical = text(input.suppression?.canonical_reason).toUpperCase();
  // A complaint or a legal request can never be lifted by this path at all.
  if (['COMPLAINT', 'LEGAL_REQUEST'].includes(canonical)) {
    blockers.push('reason_not_removable_without_legal_review');
  }
  return {
    allowed: blockers.length === 0,
    blockers,
    required_confirmation: 'REMOVE_SUPPRESSION',
    audit_required: true,
    preview: input.suppression
      ? {
        scope_type: input.suppression.scope_type || 'EMAIL',
        scope_value: input.suppression.scope_value || input.suppression.email,
        canonical_reason: canonical || null,
        suppressed_at: input.suppression.suppressed_at || null,
      }
      : null,
  };
}

/** Normalizes a raw provider event into the canonical taxonomy (spec §13.1). */
export function normalizeProviderEvent(input: {
  provider: string;
  raw_type: string;
  signature_verified?: boolean;
}) {
  const provider = text(input.provider).toLowerCase();
  const raw = text(input.raw_type).toLowerCase();
  const map: Record<string, string> = {
    // Shared vocabulary across providers; unknown values stay UNKNOWN.
    sent: 'PROVIDER_ACCEPTED', accepted: 'PROVIDER_ACCEPTED', queued: 'PROVIDER_ACCEPTED',
    delivered: 'DELIVERED', delivery: 'DELIVERED',
    deferred: 'DEFERRED', delayed: 'DEFERRED',
    bounce: 'HARD_BOUNCE', hard_bounce: 'HARD_BOUNCE', 'email.bounced': 'HARD_BOUNCE',
    soft_bounce: 'SOFT_BOUNCE',
    open: 'OPENED', opened: 'OPENED', 'email.opened': 'OPENED',
    click: 'CLICKED', clicked: 'CLICKED', 'email.clicked': 'CLICKED',
    reply: 'REPLY_RECEIVED', replied: 'REPLY_RECEIVED',
    complaint: 'COMPLAINT', spam_complaint: 'COMPLAINT', 'email.complained': 'COMPLAINT',
    unsubscribe: 'UNSUBSCRIBE', unsubscribed: 'UNSUBSCRIBE',
    account_error: 'ACCOUNT_ERROR', auth_error: 'AUTH_ERROR',
  };
  const normalized = map[raw] || 'UNKNOWN';
  return {
    provider,
    raw_type: raw,
    normalized_event_type: normalized,
    signature_verified: input.signature_verified === true,
    // An unverified signature is never processed as a real observation.
    processable: input.signature_verified === true && normalized !== 'UNKNOWN',
    blocker: input.signature_verified === true
      ? (normalized === 'UNKNOWN' ? 'unknown_event_type' : null)
      : 'signature_not_verified',
    normalizer_version: SENDER_HEALTH_VERSION,
  };
}
