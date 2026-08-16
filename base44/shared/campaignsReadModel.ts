// CAMP-C2 (2026-08-16) — read models for the Campaigns workspace
// (PROMPT_FIX_DISCOVERY_V2 Parte 4, chunk C2). Pure projections over rows the
// caller already read, so every function here is directly testable.
//
// Honesty rules that this module enforces (spec §3.8, §9.7, §23.2):
//  - A KPI whose source failed reports status UNKNOWN with value null. It is
//    NEVER rendered as zero.
//  - Every KPI declares formula, denominator, source and freshness.
//  - Campaign status is projected through the legacy adapter, so a PILOT row
//    reads as RUNNING without its stored value being rewritten.
import {
  CAMPAIGN_LANE_TO_ENGINE,
  CAMPAIGN_LANES,
  canonicalCampaignState,
} from './campaignsCore.ts';

export const CAMPAIGNS_READ_MODEL_VERSION = 'campaigns-read-model-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const numberOrNull = (value: unknown) =>
  value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
    ? Number(value)
    : null;

/** Campaign states that mean "this campaign can still produce sends". */
const LIVE_STATES = new Set(['RUNNING', 'SCHEDULED']);
const DRAFT_STATES = new Set([
  'DRAFT',
  'AUDIENCE_BUILDING',
  'AUDIENCE_READY',
  'CONTENT_INCOMPLETE',
  'SEQUENCE_INCOMPLETE',
  'SENDING_CONFIGURATION_REQUIRED',
]);

/**
 * Projects one stored campaign row into the canonical list/detail shape.
 * `lead_ids` stays visible as the compatibility projection while the versioned
 * authorities are surfaced through their *_current_version_id references.
 */
export function projectCampaignSummary(row: any) {
  const state = canonicalCampaignState(row?.status);
  const leadIds = Array.isArray(row?.lead_ids) ? row.lead_ids : [];
  const blockers = Array.isArray(row?.blockers) ? row.blockers : [];
  const metrics = row?.metrics_json && typeof row.metrics_json === 'object' ? row.metrics_json : {};
  const lane = text(row?.lane).toUpperCase();
  return {
    id: row?.id || null,
    campaign_key: text(row?.campaign_key) || null,
    name: text(row?.name) || 'Unnamed campaign',
    description: text(row?.description) || null,
    status: state.canonical,
    stored_status: state.stored,
    status_is_legacy: state.legacy,
    lane: (CAMPAIGN_LANES as readonly string[]).includes(lane) ? lane : null,
    engine: (CAMPAIGN_LANES as readonly string[]).includes(lane)
      ? CAMPAIGN_LANE_TO_ENGINE[lane]
      : null,
    objective_type: text(row?.objective_type) || null,
    primary_cta: text(row?.primary_cta) || null,
    owner: text(row?.owner_actor_id || row?.created_by) || null,
    markets: Array.isArray(row?.market_scope) ? row.market_scope : [],
    languages: Array.isArray(row?.language_scope) ? row.language_scope : [],
    provider_mode: text(row?.provider_mode) || null,
    policy_key: text(row?.policy_key) || null,
    policy_version: text(row?.policy_version) || null,
    // Versioned authorities (C1). Absent on legacy rows — shown as null, never
    // faked from the inline message_json/sequence_json.
    audience_version_id: text(row?.audience_current_version_id) || null,
    content_version_id: text(row?.content_current_version_id) || null,
    sequence_version_id: text(row?.sequence_current_version_id) || null,
    // Compatibility projection (spec §6.1).
    legacy_lead_count: leadIds.length,
    legacy_message_prepared: Boolean(
      row?.message_json && row.message_json.status !== 'NOT_PREPARED' &&
        Object.keys(row.message_json || {}).length > 0,
    ),
    legacy_sequence_prepared: Boolean(
      row?.sequence_json && row.sequence_json.status !== 'NOT_PREPARED' &&
        Object.keys(row.sequence_json || {}).length > 0,
    ),
    sending_profile_keys: Array.isArray(row?.sending_profile_keys) ? row.sending_profile_keys : [],
    blockers,
    needs_attention: blockers.length > 0 || state.canonical === 'REVIEW_REQUIRED',
    is_live: LIVE_STATES.has(state.canonical),
    is_draft: DRAFT_STATES.has(state.canonical),
    budget_limit_minor: numberOrNull(row?.budget_limit_minor),
    contact_limit: numberOrNull(row?.contact_limit),
    approved_by: text(row?.approved_by) || null,
    approved_at: row?.approved_at || null,
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
    launched_at: row?.launched_at || null,
    paused_at: row?.paused_at || null,
    // Observed metrics only; a missing counter is null, not zero (spec §3.8).
    metrics: {
      selected_leads: numberOrNull(metrics.selected_leads),
      provider_accepted: numberOrNull(metrics.sent ?? metrics.provider_accepted),
      replied: numberOrNull(metrics.replied),
      meetings: numberOrNull(metrics.meetings),
    },
    external_effect_capable: false,
  };
}

export type CampaignListFilters = {
  status?: string;
  lane?: string;
  market?: string;
  owner?: string;
  needs_attention?: boolean;
  search?: string;
};

/** Filters projected campaigns. Unknown filter values match nothing rather than everything. */
export function filterCampaignSummaries(rows: any[], filters: CampaignListFilters = {}) {
  const status = text(filters.status).toUpperCase();
  const lane = text(filters.lane).toUpperCase();
  const market = text(filters.market).toUpperCase();
  const owner = text(filters.owner).toLowerCase();
  const search = text(filters.search).toLowerCase();
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (status && status !== 'ALL' && row.status !== status) return false;
    if (lane && lane !== 'ALL' && row.lane !== lane) return false;
    if (market && market !== 'ALL' && !(row.markets || []).map((value: any) => text(value).toUpperCase()).includes(market)) return false;
    if (owner && text(row.owner).toLowerCase() !== owner) return false;
    if (filters.needs_attention === true && !row.needs_attention) return false;
    if (search) {
      const haystack = [row.name, row.campaign_key, row.description, row.objective_type]
        .map((value) => text(value).toLowerCase()).join(' ');
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

type KpiInput = {
  key: string;
  label: string;
  value: number | null;
  formula: string;
  denominator: string;
  source: string;
  freshness: string | null;
  scope: string;
  available: boolean;
  blocker?: string | null;
};

function kpi(input: KpiInput) {
  return {
    key: input.key,
    label: input.label,
    // Fail-visible: an unavailable source yields UNKNOWN + null, never 0.
    value: input.available ? input.value : null,
    status: input.available ? 'OBSERVED' : 'UNKNOWN',
    formula: input.formula,
    denominator: input.denominator,
    source: input.source,
    freshness: input.freshness,
    scope: input.scope,
    blocker: input.available ? null : (input.blocker || 'source_unavailable'),
  };
}

/**
 * Builds the Campaigns overview (spec §7.1). `sources` carries per-source
 * availability so a failed read surfaces as UNKNOWN instead of a zero KPI.
 */
export function buildCampaignsOverview(input: {
  campaigns: any[];
  campaignsAvailable: boolean;
  campaignsFreshness?: string | null;
  campaignsBlocker?: string | null;
  outboundControl?: any;
  outboundControlAvailable?: boolean;
  emergency?: any;
  emergencyAvailable?: boolean;
}) {
  const available = input.campaignsAvailable === true;
  const summaries = available
    ? (Array.isArray(input.campaigns) ? input.campaigns : []).map(projectCampaignSummary)
    : [];
  const countBy = (predicate: (row: any) => boolean) =>
    available ? summaries.filter(predicate).length : null;
  const freshness = input.campaignsFreshness || null;
  const source = 'CommercialCampaign';
  const scope = 'all lanes';
  const kpis = [
    kpi({
      key: 'active_campaigns', label: 'Active campaigns',
      value: countBy((row) => row.status === 'RUNNING'),
      formula: 'count(campaigns where canonical status = RUNNING)',
      denominator: 'all campaigns', source, freshness, scope, available,
      blocker: input.campaignsBlocker,
    }),
    kpi({
      key: 'scheduled_campaigns', label: 'Scheduled campaigns',
      value: countBy((row) => row.status === 'SCHEDULED'),
      formula: 'count(campaigns where canonical status = SCHEDULED)',
      denominator: 'all campaigns', source, freshness, scope, available,
      blocker: input.campaignsBlocker,
    }),
    kpi({
      key: 'paused_campaigns', label: 'Paused campaigns',
      value: countBy((row) => row.status === 'PAUSED'),
      formula: 'count(campaigns where canonical status = PAUSED)',
      denominator: 'all campaigns', source, freshness, scope, available,
      blocker: input.campaignsBlocker,
    }),
    kpi({
      key: 'draft_campaigns', label: 'Draft campaigns',
      value: countBy((row) => row.is_draft),
      formula: 'count(campaigns in any pre-approval state)',
      denominator: 'all campaigns', source, freshness, scope, available,
      blocker: input.campaignsBlocker,
    }),
    kpi({
      key: 'campaigns_needing_attention', label: 'Needing attention',
      value: countBy((row) => row.needs_attention),
      formula: 'count(campaigns with blockers or REVIEW_REQUIRED)',
      denominator: 'all campaigns', source, freshness, scope, available,
      blocker: input.campaignsBlocker,
    }),
    // Delivery/engagement KPIs are deliberately UNKNOWN until the C4 execution
    // engine produces enrollment-level observations. Reporting zero here would
    // claim "nothing was delivered" instead of "not measured yet".
    kpi({
      key: 'provider_accepted_today', label: 'Provider accepted today',
      value: null,
      formula: 'count(enrollments with PROVIDER_ACCEPTED today)',
      denominator: 'enrollments attempted today',
      source: 'CampaignEnrollment', freshness: null, scope: 'today',
      available: false, blocker: 'execution_engine_pending_c4',
    }),
    kpi({
      key: 'delivered_observed_today', label: 'Delivered observed today',
      value: null,
      formula: 'count(enrollments with DELIVERED_OBSERVED today)',
      denominator: 'enrollments provider-accepted today',
      source: 'OutboundProviderEvent', freshness: null, scope: 'today',
      available: false, blocker: 'execution_engine_pending_c4',
    }),
    kpi({
      key: 'replies_today', label: 'Replies today',
      value: null,
      formula: 'count(distinct enrollments with a human reply today)',
      denominator: 'enrollments delivered_observed today',
      source: 'CommunicationMessage', freshness: null, scope: 'today',
      available: false, blocker: 'execution_engine_pending_c4',
    }),
  ];
  return {
    kpis,
    outbound_posture: {
      // Global outbound state (spec §7.1). Unknown when unreadable.
      status: input.outboundControlAvailable === false
        ? 'UNKNOWN'
        : input.outboundControl?.acquisition_enabled === true
        ? 'ENABLED'
        : 'PAUSED_ZERO',
      safe_mode: input.emergencyAvailable === false
        ? 'UNKNOWN'
        : input.emergency?.safe_mode === true
        ? 'SAFE_MODE_ACTIVE'
        : 'NORMAL',
      truth_boundary:
        'Outbound posture and SAFE MODE are read from their canonical authorities; an unreadable authority is UNKNOWN, never treated as permission.',
    },
    needs_attention: available
      ? summaries.filter((row) => row.needs_attention).slice(0, 20)
      : [],
    data_status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    external_effect_performed: false,
  };
}
