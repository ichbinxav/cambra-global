// CAMP-C1 (2026-08-16) — canonical constants and pure adapters for the
// Campaigns + Inbox & Conversations workspaces (PROMPT_FIX_DISCOVERY_V2
// Parte 4). Everything here is pure and side-effect free except
// buildCommercialMigrationDryRunReport, which only READS (dry-run, spec §24 —
// no live migration in this Parte).
//
// One authority per concept (spec §3.1): this module never redefines an
// authority — it maps legacy shapes onto the canonical vocabulary without
// rewriting stored rows.

export const CAMPAIGNS_CORE_VERSION = 'campaigns-core-1.0.0';

export const CAMPAIGN_LANES = Object.freeze([
  'MERCHANT_ACQUISITION',
  'PARTNER_ACQUISITION',
  'PROVIDER_RELATIONS',
  'MERCHANT_LIFECYCLE',
] as const);

// Spec §1.5 — backward-compatible mapping onto the existing engines.
export const CAMPAIGN_LANE_TO_ENGINE: Readonly<Record<string, string>> = Object.freeze({
  MERCHANT_ACQUISITION: 'merchant_acquisition',
  PARTNER_ACQUISITION: 'partner_acquisition',
  PROVIDER_RELATIONS: 'provider_negotiation',
  MERCHANT_LIFECYCLE: 'merchant_operations',
});

export const CAMPAIGN_CANONICAL_STATES = Object.freeze([
  'DRAFT',
  'AUDIENCE_BUILDING',
  'AUDIENCE_READY',
  'CONTENT_INCOMPLETE',
  'SEQUENCE_INCOMPLETE',
  'SENDING_CONFIGURATION_REQUIRED',
  'PREFLIGHT_BLOCKED',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'STOPPED',
  'REVIEW_REQUIRED',
  'ARCHIVED',
] as const);

// Spec §6.1 — legacy statuses keep their historical meaning; they are never
// rewritten in storage, only projected.
const LEGACY_CAMPAIGN_STATE_MAP: Readonly<Record<string, string>> = Object.freeze({
  READY_FOR_PILOT: 'READY_FOR_APPROVAL',
  PILOT: 'RUNNING',
  ACTIVE: 'RUNNING',
});

export function canonicalCampaignState(status: unknown): {
  canonical: string;
  legacy: boolean;
  stored: string;
} {
  const stored = String(status ?? '').trim().toUpperCase();
  if ((CAMPAIGN_CANONICAL_STATES as readonly string[]).includes(stored)) {
    return { canonical: stored, legacy: false, stored };
  }
  const mapped = LEGACY_CAMPAIGN_STATE_MAP[stored];
  if (mapped) return { canonical: mapped, legacy: true, stored };
  // Unknown status is never silently normalized to something runnable.
  return { canonical: 'REVIEW_REQUIRED', legacy: false, stored };
}

export const ENROLLMENT_STATES = Object.freeze([
  'ELIGIBLE', 'EXCLUDED', 'QUEUED', 'SCHEDULED', 'CLAIMED', 'SEND_STARTED',
  'PROVIDER_ACCEPTED', 'DELIVERED_OBSERVED', 'OPEN_OBSERVED', 'CLICK_OBSERVED',
  'SITE_VISIT_OBSERVED', 'ANALYZER_STARTED', 'REPLIED', 'POSITIVE_REPLY',
  'NEUTRAL_REPLY', 'NEGATIVE_REPLY', 'WRONG_CONTACT', 'OUT_OF_OFFICE',
  'BOUNCED', 'UNSUBSCRIBED', 'COMPLAINT', 'MEETING_BOOKED',
  'CONNECTION_STARTED', 'CONNECTION_COMPLETED', 'QUALIFIED',
  'OPPORTUNITY_CREATED', 'RECOVER_CREATED', 'CONVERTED', 'STOPPED',
  'REVIEW_REQUIRED',
] as const);

export const THREAD_COMMERCIAL_STATUSES = Object.freeze([
  'NEW_REPLY', 'INTERESTED', 'QUESTION', 'OBJECTION', 'NOT_NOW',
  'WRONG_CONTACT', 'MEETING_PROPOSED', 'MEETING_BOOKED',
  'CONNECTION_REQUESTED', 'CONNECTION_STARTED', 'QUALIFIED', 'OPPORTUNITY',
  'NOT_INTERESTED', 'UNSUBSCRIBED', 'CLOSED_WON', 'CLOSED_LOST',
] as const);

export const THREAD_OPERATIONAL_STATUSES = Object.freeze([
  'AI_TRIAGE', 'AI_HANDLING', 'NEEDS_HUMAN', 'WAITING_ON_US',
  'WAITING_ON_COUNTERPARTY', 'FOLLOW_UP_SCHEDULED', 'PAUSED_BY_FOUNDER',
  'PAUSED_BY_POLICY', 'ESCALATED', 'REVIEW_REQUIRED', 'COMPLETED',
] as const);

const text = (value: unknown) => String(value ?? '').trim();

/**
 * Projects the legacy CommunicationThread fields onto the split
 * commercial/operational vocabulary (spec §6.7) WITHOUT mutating anything.
 * Explicit new-field values always win; legacy values are a fallback mapping.
 * Anything unmappable is REVIEW_REQUIRED — never a guessed healthy state.
 */
export function projectThreadStatuses(thread: any): {
  commercial_status: string | null;
  operational_status: string;
  derived_from_legacy: boolean;
} {
  const explicitCommercial = text(thread?.commercial_status).toUpperCase();
  const explicitOperational = text(thread?.operational_status).toUpperCase();
  if (
    (THREAD_COMMERCIAL_STATUSES as readonly string[]).includes(explicitCommercial) ||
    (THREAD_OPERATIONAL_STATUSES as readonly string[]).includes(explicitOperational)
  ) {
    return {
      commercial_status:
        (THREAD_COMMERCIAL_STATUSES as readonly string[]).includes(explicitCommercial)
          ? explicitCommercial
          : null,
      operational_status:
        (THREAD_OPERATIONAL_STATUSES as readonly string[]).includes(explicitOperational)
          ? explicitOperational
          : 'REVIEW_REQUIRED',
      derived_from_legacy: false,
    };
  }
  const classification = text(thread?.classification).toLowerCase();
  const state = text(thread?.conversation_state).toLowerCase();
  const status = text(thread?.status).toLowerCase();
  const commercialByClassification: Record<string, string> = {
    positive_interest: 'INTERESTED',
    interested: 'INTERESTED',
    question: 'QUESTION',
    more_information: 'QUESTION',
    objection: 'OBJECTION',
    not_now: 'NOT_NOW',
    wrong_person: 'WRONG_CONTACT',
    wrong_contact: 'WRONG_CONTACT',
    meeting_request: 'MEETING_PROPOSED',
    not_interested: 'NOT_INTERESTED',
    unsubscribe: 'UNSUBSCRIBED',
  };
  const commercial = commercialByClassification[classification] || null;
  let operational = 'REVIEW_REQUIRED';
  if (thread?.automation_paused === true) operational = 'PAUSED_BY_FOUNDER';
  else if (status === 'closed') operational = 'COMPLETED';
  else if (state === 'waiting_reply' || state === 'waiting_counterparty') {
    operational = 'WAITING_ON_COUNTERPARTY';
  } else if (state === 'needs_review' || state === 'review_required') {
    operational = 'REVIEW_REQUIRED';
  } else if (state === 'follow_up_scheduled' || thread?.next_action_at) {
    operational = 'FOLLOW_UP_SCHEDULED';
  } else if (status === 'open') operational = 'AI_TRIAGE';
  return {
    commercial_status: commercial,
    operational_status: operational,
    derived_from_legacy: true,
  };
}

export const SUPPRESSION_SCOPES = Object.freeze([
  'EMAIL', 'PERSON', 'COMPANY', 'DOMAIN', 'CAMPAIGN',
] as const);

// Spec §12.2 — canonical reason taxonomy mapped from the legacy enum without
// rewriting rows.
export const SUPPRESSION_REASON_MAP: Readonly<Record<string, string>> = Object.freeze({
  opt_out: 'UNSUBSCRIBE',
  bounce: 'HARD_BOUNCE',
  complaint: 'COMPLAINT',
  not_interested: 'NOT_INTERESTED',
  wrong_person: 'WRONG_PERSON',
  provider_blocklist: 'PROVIDER_BLOCKLIST',
  legal: 'LEGAL_REQUEST',
  manual: 'FOUNDER_BLOCK',
  customer_exclusion: 'CUSTOMER_EXCLUSION',
});

/**
 * Normalizes a suppression row to its scope + matching value. Legacy rows
 * (no scope_type) are EMAIL scope over the `email` field — exactly the
 * behavior every existing pre-send check already enforces.
 */
export function normalizeSuppressionScope(row: any): {
  scope_type: string;
  scope_value: string;
  canonical_reason: string;
} {
  const scope = text(row?.scope_type).toUpperCase();
  const scopeType = (SUPPRESSION_SCOPES as readonly string[]).includes(scope)
    ? scope
    : 'EMAIL';
  const scopeValue = scopeType === 'EMAIL'
    ? text(row?.scope_value || row?.email).toLowerCase()
    : text(
      row?.scope_value ||
        (scopeType === 'COMPANY'
          ? row?.company_key
          : scopeType === 'DOMAIN'
          ? row?.domain
          : scopeType === 'CAMPAIGN'
          ? row?.campaign_id
          : row?.contact_id),
    ).toLowerCase();
  const canonicalReason = SUPPRESSION_REASON_MAP[text(row?.reason).toLowerCase()] ||
    text(row?.reason).toUpperCase() || 'UNKNOWN';
  return { scope_type: scopeType, scope_value: scopeValue, canonical_reason: canonicalReason };
}

/**
 * Checks whether a recipient is suppressed by ANY active scope. Fail-closed:
 * an unreadable ledger is a blocker, not permission (handled by the caller —
 * this function only evaluates rows it was given).
 */
export function suppressionMatches(rows: any[], recipient: {
  email?: string;
  contact_id?: string;
  company_key?: string;
  domain?: string;
  campaign_id?: string;
}): { suppressed: boolean; matches: any[] } {
  const email = text(recipient.email).toLowerCase();
  const domain = text(recipient.domain || email.split('@')[1]).toLowerCase();
  const matches = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (row?.active !== true) return false;
    const normalized = normalizeSuppressionScope(row);
    if (!normalized.scope_value) return false;
    switch (normalized.scope_type) {
      case 'EMAIL':
        return Boolean(email) && normalized.scope_value === email;
      case 'PERSON':
        return Boolean(recipient.contact_id) &&
          normalized.scope_value === text(recipient.contact_id).toLowerCase();
      case 'COMPANY':
        return Boolean(recipient.company_key) &&
          normalized.scope_value === text(recipient.company_key).toLowerCase();
      case 'DOMAIN':
        return Boolean(domain) && normalized.scope_value === domain;
      case 'CAMPAIGN':
        return Boolean(recipient.campaign_id) &&
          normalized.scope_value === text(recipient.campaign_id).toLowerCase();
      default:
        return false;
    }
  });
  return { suppressed: matches.length > 0, matches };
}

/**
 * Migration dry-run (spec §24.1) — READS ONLY, never writes. Reports the
 * legacy inventory and what a backfill WOULD create, flagging every ambiguity
 * as REVIEW_REQUIRED instead of guessing. Live migration is out of scope for
 * this whole Parte.
 */
export async function buildCommercialMigrationDryRunReport(svc: any) {
  const read = async (entity: string, sort: string, limit: number) => {
    try {
      const rows = await svc.entities[entity].list(sort, limit);
      return { ok: Array.isArray(rows), rows: Array.isArray(rows) ? rows : [], truncated: Array.isArray(rows) && rows.length >= limit };
    } catch (error: any) {
      return { ok: false, rows: [], truncated: false, error: text(error?.code || error?.message).slice(0, 160) };
    }
  };
  const [campaigns, threads, messages, profiles, suppressions, events] = await Promise.all([
    read('CommercialCampaign', '-updated_at', 1000),
    read('CommunicationThread', '-last_message_at', 5000),
    read('CommunicationMessage', '-created_date', 5000),
    read('OutboundSendingProfile', '-created_date', 500),
    read('ContactSuppression', '-suppressed_at', 5000),
    read('OutboundProviderEvent', '-first_received_at', 5000),
  ]);
  const campaignRows = campaigns.rows;
  const audienceBackfillCandidates = campaignRows.map((campaign: any) => {
    const leadIds = Array.isArray(campaign.lead_ids) ? campaign.lead_ids : [];
    const hasSnapshot = campaign.audience_snapshot_json &&
      typeof campaign.audience_snapshot_json === 'object' &&
      Object.keys(campaign.audience_snapshot_json).length > 0;
    const complete = leadIds.length > 0 && hasSnapshot;
    return {
      campaign_id: campaign.id,
      lead_count: leadIds.length,
      has_snapshot: hasSnapshot,
      would_create: 'CampaignAudienceVersion v1 (source: LEGACY_BACKFILL)',
      status: complete ? 'READY' : 'REVIEW_REQUIRED',
    };
  });
  const contentBackfillCandidates = campaignRows.map((campaign: any) => {
    const prepared = campaign.message_json &&
      campaign.message_json.status !== 'NOT_PREPARED' &&
      Object.keys(campaign.message_json || {}).length > 0;
    return {
      campaign_id: campaign.id,
      prepared,
      would_create: prepared ? 'CampaignContentVersion v1 (LEGACY_BACKFILL)' : 'none (nothing prepared)',
      status: prepared ? 'READY' : 'SKIP_EMPTY',
    };
  });
  const threadsWithoutTenant = threads.rows.filter((row: any) => !text(row.brand_id) && text(row.tenant_scope) !== '_platform').length;
  const threadsWithoutProfile = threads.rows.filter((row: any) => !text(row.sending_profile_key)).length;
  const emailCounts = new Map<string, number>();
  for (const row of suppressions.rows) {
    const email = text(row.email).toLowerCase();
    if (email) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);
  }
  const duplicateSuppressionEmails = [...emailCounts.values()].filter((count) => count > 1).length;
  return {
    dry_run: true,
    external_effects_performed: false,
    generated_at: new Date().toISOString(),
    sources: {
      campaigns: { ok: campaigns.ok, count: campaigns.rows.length, truncated: campaigns.truncated, error: (campaigns as any).error || null },
      threads: { ok: threads.ok, count: threads.rows.length, truncated: threads.truncated, error: (threads as any).error || null },
      messages: { ok: messages.ok, count: messages.rows.length, truncated: messages.truncated, error: (messages as any).error || null },
      sending_profiles: { ok: profiles.ok, count: profiles.rows.length, truncated: profiles.truncated, error: (profiles as any).error || null },
      suppressions: { ok: suppressions.ok, count: suppressions.rows.length, truncated: suppressions.truncated, error: (suppressions as any).error || null },
      provider_events: { ok: events.ok, count: events.rows.length, truncated: events.truncated, error: (events as any).error || null },
    },
    audience_backfill: audienceBackfillCandidates,
    content_backfill: contentBackfillCandidates,
    risk_flags: {
      threads_without_tenant: threadsWithoutTenant,
      threads_without_sending_profile: threadsWithoutProfile,
      duplicate_suppression_emails: duplicateSuppressionEmails,
    },
    truth_boundary:
      'Counts reflect the reachable window only; truncated sources are marked and never presented as complete. Nothing was written.',
  };
}
