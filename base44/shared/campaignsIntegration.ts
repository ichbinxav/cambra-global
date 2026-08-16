// CAMP-C8 (2026-08-16) — integration surfaces: Discovery, Pipeline, Founder OS
// and the CAMBRA Command tool contract (PROMPT_FIX_DISCOVERY_V2 Parte 4,
// chunk C8, spec §14, §15, §17, §18). Pure.
//
// Nothing here creates a second control plane. Deep links point at the
// canonical pages, pipeline transitions reuse the existing lead stage
// authority, and the Command tools are typed DESCRIPTORS — the gateway that
// will execute them is a separate prompt and does not exist on this tree.

export const CAMPAIGNS_INTEGRATION_VERSION = 'campaigns-integration-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Stable deep links (spec §23.3). One canonical URL per entity. */
export function buildDeepLink(kind: string, id: string) {
  const value = text(id);
  if (!value) return null;
  const map: Record<string, string> = {
    campaign: `/admin/campaigns?campaign=${encodeURIComponent(value)}`,
    enrollment: `/admin/campaigns?enrollment=${encodeURIComponent(value)}`,
    thread: `/admin/conversations?thread=${encodeURIComponent(value)}`,
    discovery_run: `/admin/discovery?run=${encodeURIComponent(value)}`,
    lead: `/admin/pipeline?lead=${encodeURIComponent(value)}`,
    merchant: `/admin/merchants?merchant=${encodeURIComponent(value)}`,
    provider: `/admin/providers?provider=${encodeURIComponent(value)}`,
    approval: `/admin/approvals?approval=${encodeURIComponent(value)}`,
    sending_profile: `/admin/conversations?tab=domains&profile=${encodeURIComponent(value)}`,
    provider_event: `/admin/conversations?tab=events&event=${encodeURIComponent(value)}`,
  };
  return map[text(kind)] || null;
}

/**
 * Canonical pipeline transitions driven by campaign/conversation observations
 * (spec §14.1). Every rule carries a key and a version so a transition can be
 * explained and audited, and a model classification alone can never reach WON.
 */
export const PIPELINE_TRANSITION_RULES = Object.freeze([
  { key: 'CAMPAIGN_SEND_OBSERVED', from_any: true, to: 'contacted', evidence: 'PROVIDER_ACCEPTED or DELIVERED_OBSERVED enrollment', model_alone_sufficient: true },
  { key: 'HUMAN_POSITIVE_REPLY', from_any: true, to: 'contacted', evidence: 'human reply classified POSITIVE_INTEREST', model_alone_sufficient: true },
  { key: 'QUALIFIED_REPLY', from_any: true, to: 'outreach_ready', evidence: 'qualified reply confirmed by a human', model_alone_sufficient: false },
  { key: 'MEETING_BOOKED', from_any: true, to: 'meeting', evidence: 'meeting record exists', model_alone_sufficient: false },
  { key: 'CONNECTION_COMPLETED', from_any: true, to: 'won', evidence: 'observed provider connection', model_alone_sufficient: false },
  { key: 'UNSUBSCRIBED_OR_COMPLAINT', from_any: true, to: 'suppressed', evidence: 'suppression record created', model_alone_sufficient: true },
  { key: 'NOT_INTERESTED', from_any: true, to: 'disqualified', evidence: 'human reply classified NOT_INTERESTED', model_alone_sufficient: false },
] as const);

/**
 * Decides whether an observation may move a lead's pipeline stage.
 *
 * Two guards the spec calls out (§14.2): a model classification alone never
 * produces WON, and a failed source never causes a downgrade.
 */
export function evaluatePipelineTransition(input: {
  rule_key: string;
  current_stage?: string;
  human_confirmed?: boolean;
  source_available?: boolean;
}) {
  const rule = PIPELINE_TRANSITION_RULES.find((row) => row.key === text(input.rule_key));
  if (!rule) return { allowed: false, reason: 'unknown_transition_rule', to_stage: null, rule_key: null };
  // A source failure must never downgrade a stage — absence of evidence is not
  // evidence of regression.
  if (input.source_available === false) {
    return { allowed: false, reason: 'source_unavailable_no_downgrade', to_stage: null, rule_key: rule.key };
  }
  if (!rule.model_alone_sufficient && input.human_confirmed !== true) {
    return { allowed: false, reason: 'human_confirmation_required', to_stage: rule.to, rule_key: rule.key };
  }
  if (text(input.current_stage) === rule.to) {
    return { allowed: false, reason: 'already_in_target_stage', to_stage: rule.to, rule_key: rule.key };
  }
  return {
    allowed: true,
    reason: null,
    to_stage: rule.to,
    rule_key: rule.key,
    rule_version: CAMPAIGNS_INTEGRATION_VERSION,
    evidence_required: rule.evidence,
  };
}

/**
 * Projects a Discovery run result into an audience candidate (spec §15).
 * "Add to Campaign" creates candidates, never provider effects.
 */
export function buildDiscoveryAudienceCandidates(input: {
  discovery_run_id: string;
  results: any[];
}) {
  const candidates = (Array.isArray(input.results) ? input.results : []).map((row) => ({
    subject_type: 'OutboundLead',
    subject_id: text(row?.id),
    email: text(row?.contact?.email) || text(row?.contact_email),
    company_key: text(row?.company_key) || text(row?.canonical_company_key),
    company_name: text(row?.name) || text(row?.company_name),
    country: text(row?.country),
    // Discovery evidence travels with the candidate so the founder can see
    // the score and confidence that put this company in the audience.
    discovery_run_id: text(input.discovery_run_id),
    discovery_score: Number.isFinite(Number(row?.score)) ? Number(row.score) : null,
    discovery_fit_band: text(row?.fit_band) || null,
    discovery_evidence_status: text(row?.evidence_status) || null,
  })).filter((row) => row.subject_id);
  return {
    candidates,
    source_type: 'DISCOVERY_SAVED_SEARCH',
    discovery_run_id: text(input.discovery_run_id),
    // This function is explicitly incapable of sending.
    external_send_performed: false,
    creates: 'audience_candidates_only',
    integration_version: CAMPAIGNS_INTEGRATION_VERSION,
  };
}

/**
 * Founder OS receives AGGREGATES and EXCEPTIONS with deep links, not a second
 * Campaigns UI (spec §18).
 */
export function buildFounderOsCommercialAlerts(input: {
  campaigns?: any[];
  threads?: any[];
  profiles?: any[];
  campaignsAvailable?: boolean;
  threadsAvailable?: boolean;
  profilesAvailable?: boolean;
}) {
  const alerts: any[] = [];
  const unknown: string[] = [];

  if (input.campaignsAvailable === false) unknown.push('campaigns');
  else {
    for (const campaign of input.campaigns || []) {
      if ((campaign.blockers || []).length > 0) {
        alerts.push({
          kind: 'CAMPAIGN_BLOCKED', severity: 'warning',
          subject: text(campaign.name) || text(campaign.id),
          detail: (campaign.blockers || []).join(' · '),
          deep_link: buildDeepLink('campaign', campaign.id),
        });
      }
    }
  }

  if (input.threadsAvailable === false) unknown.push('threads');
  else {
    for (const thread of input.threads || []) {
      const operational = text(thread.operational_status).toUpperCase();
      if (['ESCALATED', 'NEEDS_HUMAN', 'REVIEW_REQUIRED'].includes(operational)) {
        alerts.push({
          kind: 'THREAD_REQUIRES_FOUNDER',
          severity: operational === 'ESCALATED' ? 'critical' : 'warning',
          subject: text(thread.counterparty_name) || text(thread.counterparty_email) || text(thread.id),
          detail: operational,
          deep_link: buildDeepLink('thread', thread.id),
        });
      }
    }
  }

  if (input.profilesAvailable === false) unknown.push('sending_profiles');
  else {
    for (const profile of input.profiles || []) {
      const health = text(profile.health).toUpperCase();
      if (['DEGRADED', 'AUTH_EXPIRED', 'BLOCKED', 'QUARANTINED', 'UNKNOWN'].includes(health)) {
        alerts.push({
          kind: 'SENDER_HEALTH', severity: health === 'DEGRADED' ? 'warning' : 'critical',
          subject: text(profile.profile_key),
          detail: health,
          deep_link: buildDeepLink('sending_profile', profile.profile_key),
        });
      }
    }
  }

  return {
    alerts,
    // A source we could not read is named, so Founder OS shows "unknown"
    // rather than an empty, reassuring alert list.
    unknown_sources: unknown,
    data_status: unknown.length ? 'PARTIAL' : 'AVAILABLE',
    every_alert_deep_links: alerts.every((row) => Boolean(row.deep_link)),
    integration_version: CAMPAIGNS_INTEGRATION_VERSION,
  };
}

/** Command permission modes (spec §17.4). */
export const COMMAND_PERMISSION_MODES = Object.freeze(['READ', 'PREPARE', 'OPERATE', 'ROOT'] as const);

/**
 * Typed tool descriptors for CAMBRA Command (spec §17.1-17.3).
 *
 * These are DESCRIPTORS, not a gateway: the Command tool gateway is a separate
 * prompt and does not exist on this tree (C0 finding). Publishing the contract
 * here means Command can discover these tools when it lands without this work
 * having built a second gateway of its own.
 */
export const CAMPAIGN_COMMAND_TOOLS = Object.freeze([
  { name: 'campaign.search', mode: 'READ', route: 'campaign_list', mutates: false },
  { name: 'campaign.get', mode: 'READ', route: 'campaign_detail', mutates: false },
  { name: 'campaign.create_draft', mode: 'PREPARE', route: 'campaign_create_draft', mutates: true, external_effect: false },
  { name: 'campaign.preview_audience', mode: 'PREPARE', route: 'campaign_build_audience', mutates: true, external_effect: false },
  { name: 'campaign.freeze_audience', mode: 'PREPARE', route: 'campaign_freeze_audience', mutates: true, external_effect: false },
  { name: 'campaign.update_content_draft', mode: 'PREPARE', route: 'campaign_validate_content', mutates: true, external_effect: false },
  { name: 'campaign.update_sequence_draft', mode: 'PREPARE', route: 'campaign_validate_sequence', mutates: true, external_effect: false },
  { name: 'campaign.preflight', mode: 'READ', route: 'campaign_preflight', mutates: false },
  { name: 'campaign.request_approval', mode: 'PREPARE', route: 'campaign_request_approval', mutates: true, external_effect: false },
  { name: 'campaign.pause', mode: 'OPERATE', route: 'campaign_pause', mutates: true, external_effect: false },
  { name: 'conversation.search', mode: 'READ', route: 'conversation_list', mutates: false },
  { name: 'conversation.get', mode: 'READ', route: 'conversation_detail', mutates: false },
] as const);

/**
 * Validates a Command tool invocation against its declared permission mode.
 * A PREPARE-mode call can never perform an external effect, and no mode —
 * including ROOT — bypasses tenant, legal, emergency or suppression controls.
 */
export function evaluateCommandToolInvocation(input: {
  tool: string;
  granted_mode?: string;
  emergency_active?: boolean;
  suppression_bypass_requested?: boolean;
}) {
  const tool = CAMPAIGN_COMMAND_TOOLS.find((row) => row.name === text(input.tool));
  if (!tool) return { allowed: false, blockers: ['unknown_tool'], tool: null };
  const granted = text(input.granted_mode).toUpperCase();
  const blockers: string[] = [];
  if (!(COMMAND_PERMISSION_MODES as readonly string[]).includes(granted)) blockers.push('invalid_permission_mode');
  else {
    const order = COMMAND_PERMISSION_MODES.indexOf(granted as any);
    const required = COMMAND_PERMISSION_MODES.indexOf(tool.mode as any);
    if (order < required) blockers.push('insufficient_permission_mode');
  }
  // Hard controls apply to every mode, ROOT included (spec §17.4).
  if (input.emergency_active === true && tool.mutates) blockers.push('emergency_blocks_material_tool');
  if (input.suppression_bypass_requested === true) blockers.push('suppression_cannot_be_bypassed');
  return {
    allowed: blockers.length === 0,
    blockers,
    tool: { ...tool },
    hard_controls_apply_to_all_modes: true,
    integration_version: CAMPAIGNS_INTEGRATION_VERSION,
  };
}
