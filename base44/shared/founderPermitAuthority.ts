// COMMAND-C1 (2026-08-17) — FounderPermit authority
// (PROMPT_CAMBRA_COMMAND_V1 §10). Pure.
//
// This is the module that makes "give CAMBRA a broad objective and let it run"
// safe. A permit authorises a CLASS of work so the founder is not asked to
// confirm every microaction (§1.4) — and it is precisely here that the limits
// which no permit can ever lift are enforced.
//
// The hard controls below are NOT a scope the permit can widen. They are
// checked after the permit says yes, and they win. FOUNDER_ROOT included.

export const FOUNDER_PERMIT_AUTHORITY_VERSION = 'founder-permit-authority-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => text(value).toLowerCase();

export const PERMIT_PRESETS = Object.freeze(['READ', 'PREPARE', 'OPERATE', 'FOUNDER_ROOT'] as const);

/** What each preset may do at all, before any scope list is consulted. */
const PRESET_ALLOWS_WRITE: Record<string, boolean> = {
  READ: false,
  PREPARE: false,
  OPERATE: true,
  FOUNDER_ROOT: true,
};

/**
 * Controls no permit can lift, at any preset (spec §1.4).
 * Each entry is a reason string returned to the caller when it fires.
 */
export const UNLIFTABLE_CONTROLS = Object.freeze([
  'tenant_isolation',
  'secret_exposure',
  'emergency_stop',
  'suppression',
  'protected_market',
  'legal_or_regulatory_prohibition',
  'irreversible_action_without_reauth',
  'human_presence_required',
] as const);

export type PermitCheckInput = {
  permit: any;
  now: string;
  request: {
    tool_id?: string;
    domain?: string;
    effect_class?: string;
    read_or_write?: 'READ' | 'WRITE';
    entity_type?: string;
    entity_id?: string;
    tenant?: string;
    market?: string;
    environment?: string;
    repository?: string;
    branch?: string;
    network_domain?: string;
    data_class?: string;
    records_affected?: number;
    external_messages?: number;
    estimated_cost_minor?: number;
    irreversible?: boolean;
  };
  /** Live hard-control state. Anything unreadable must be passed as undefined. */
  controls?: {
    emergency?: { safe_mode?: boolean; communications_paused?: boolean; control_revision?: number } | null;
    emergencyAvailable?: boolean;
    recipient_suppressed?: boolean;
    suppressionAvailable?: boolean;
    market_commercially_eligible?: boolean;
    tenant_matches?: boolean;
    exposes_secret?: boolean;
    legal_block?: boolean;
    strong_reauth_present?: boolean;
    human_presence_required?: boolean;
  };
  /** The permit_hash the caller believes it is acting under. */
  presented_permit_hash?: string;
};

function listAllows(list: unknown, value: string, { emptyMeansAll }: { emptyMeansAll: boolean }) {
  const entries = (Array.isArray(list) ? list : []).map(lower).filter(Boolean);
  if (!entries.length) return emptyMeansAll;
  if (!value) return false;
  return entries.includes(lower(value)) || entries.includes('*');
}

function branchAllowed(patterns: unknown, branch: string) {
  const entries = (Array.isArray(patterns) ? patterns : []).map(text).filter(Boolean);
  if (!entries.length) return false;
  if (!branch) return false;
  return entries.some((pattern) => {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) return branch.startsWith(pattern.slice(0, -1));
    return pattern === branch;
  });
}

/**
 * Decides whether one concrete action is authorised.
 *
 * Returns every blocker rather than the first, so the founder sees the full
 * reason a step stopped instead of fixing them one at a time.
 */
export function evaluatePermit(input: PermitCheckInput) {
  const permit = input.permit;
  const request = input.request || {};
  const controls = input.controls || {};
  const blockers: string[] = [];
  const unliftable: string[] = [];

  // ---- The permit itself must be real, live and unmodified -----------------
  if (!permit) {
    return {
      allowed: false, blockers: ['no_permit'], unliftable_controls_hit: [],
      preset: null, authority_version: FOUNDER_PERMIT_AUTHORITY_VERSION,
    };
  }
  const preset = text(permit.preset).toUpperCase();
  if (!(PERMIT_PRESETS as readonly string[]).includes(preset)) blockers.push('unsupported_permit_preset');
  if (text(permit.status).toUpperCase() !== 'ACTIVE') blockers.push('permit_not_active');

  const now = Date.parse(text(input.now));
  const validFrom = Date.parse(text(permit.valid_from));
  const expiresAt = Date.parse(text(permit.expires_at));
  if (!Number.isFinite(now)) blockers.push('invalid_reference_time');
  else {
    if (Number.isFinite(validFrom) && now < validFrom) blockers.push('permit_not_yet_valid');
    // An absent expiry is NOT treated as "never expires" — a permit without a
    // deadline is a permit nobody can reason about.
    if (!Number.isFinite(expiresAt)) blockers.push('permit_expiry_required');
    else if (now >= expiresAt) blockers.push('permit_expired');
  }

  // Hash binding: acting under a permit whose scope changed is not authorised.
  if (input.presented_permit_hash !== undefined &&
      text(input.presented_permit_hash) !== text(permit.permit_hash)) {
    blockers.push('permit_hash_mismatch');
  }

  // ---- Explicit denials win over everything, including FOUNDER_ROOT --------
  const denials = (Array.isArray(permit.explicit_denials) ? permit.explicit_denials : []).map(lower);
  for (const candidate of [request.tool_id, request.domain, request.effect_class, request.entity_type]) {
    if (candidate && denials.includes(lower(candidate))) blockers.push('explicitly_denied_by_permit');
  }

  // ---- Scope ---------------------------------------------------------------
  const isWrite = request.read_or_write === 'WRITE';
  if (isWrite && !PRESET_ALLOWS_WRITE[preset]) blockers.push('preset_does_not_allow_writes');

  // FOUNDER_ROOT widens the SCOPE lists only. It never touches the hard
  // controls below, and it never bypasses explicit denials above.
  const root = preset === 'FOUNDER_ROOT';
  if (!listAllows(permit.allowed_domains, text(request.domain), { emptyMeansAll: root })) blockers.push('domain_not_in_permit');
  if (request.tool_id && !listAllows(permit.allowed_tool_ids, request.tool_id, { emptyMeansAll: root })) blockers.push('tool_not_in_permit');
  if (isWrite && request.effect_class && !listAllows(permit.allowed_effect_classes, request.effect_class, { emptyMeansAll: root })) {
    blockers.push('effect_class_not_in_permit');
  }
  if (request.entity_type && !listAllows(permit.allowed_entity_types, request.entity_type, { emptyMeansAll: root })) {
    blockers.push('entity_type_not_in_permit');
  }
  // Entity ids are an intersection: an empty list means "no id restriction",
  // but a populated one is exhaustive even under root.
  if (request.entity_id && Array.isArray(permit.allowed_entity_ids) && permit.allowed_entity_ids.length &&
      !permit.allowed_entity_ids.map(lower).includes(lower(request.entity_id))) {
    blockers.push('entity_id_not_in_permit');
  }
  if (request.tenant && !listAllows(permit.allowed_tenants, request.tenant, { emptyMeansAll: root })) blockers.push('tenant_not_in_permit');
  if (request.market && !listAllows(permit.allowed_markets, request.market, { emptyMeansAll: root })) blockers.push('market_not_in_permit');
  if (request.environment && !listAllows(permit.allowed_environments, request.environment, { emptyMeansAll: root })) {
    blockers.push('environment_not_in_permit');
  }
  if (request.repository && !listAllows(permit.allowed_repositories, request.repository, { emptyMeansAll: false })) {
    // Repositories are never implicitly allowed, not even under root.
    blockers.push('repository_not_in_permit');
  }
  if (request.branch && !branchAllowed(permit.allowed_branch_patterns, text(request.branch))) {
    blockers.push('branch_not_in_permit');
  }
  if (request.network_domain && !listAllows(permit.allowed_network_domains, request.network_domain, { emptyMeansAll: false })) {
    // Network egress is never implicitly allowed either (spec §11.5).
    blockers.push('network_domain_not_in_permit');
  }
  if (request.data_class && !listAllows(permit.allowed_data_classes, request.data_class, { emptyMeansAll: root })) {
    blockers.push('data_class_not_in_permit');
  }

  // ---- Ceilings ------------------------------------------------------------
  const ceiling = (limit: unknown, consumed: unknown, requested: unknown, blocker: string) => {
    const max = Number(limit);
    if (!Number.isFinite(max) || max <= 0) return;
    const used = Number(consumed) || 0;
    const want = Number(requested) || 0;
    if (used + want > max) blockers.push(blocker);
  };
  ceiling(permit.max_cost_minor, permit.consumed_cost_minor, request.estimated_cost_minor, 'permit_cost_ceiling_exceeded');
  ceiling(permit.max_tool_calls, permit.consumed_tool_calls, 1, 'permit_tool_call_ceiling_exceeded');
  ceiling(permit.max_records_affected, permit.consumed_records_affected, request.records_affected, 'permit_record_ceiling_exceeded');
  ceiling(permit.max_external_messages, permit.consumed_external_messages, request.external_messages, 'permit_message_ceiling_exceeded');

  // ---- Hard controls: checked AFTER the permit, and they win ---------------
  if (controls.emergencyAvailable === false || controls.emergency === null || controls.emergency === undefined) {
    unliftable.push('emergency_stop');
    blockers.push('emergency_authority_unavailable');
  } else if (controls.emergency.safe_mode === true || controls.emergency.communications_paused === true) {
    unliftable.push('emergency_stop');
    blockers.push('emergency_pause_active');
  }
  if (controls.tenant_matches === false) {
    unliftable.push('tenant_isolation');
    blockers.push('cross_tenant_action_refused');
  }
  if (controls.exposes_secret === true) {
    unliftable.push('secret_exposure');
    blockers.push('secret_exposure_refused');
  }
  if (isWrite || request.external_messages) {
    if (controls.suppressionAvailable === false) {
      unliftable.push('suppression');
      blockers.push('suppression_ledger_unavailable');
    } else if (controls.recipient_suppressed === true) {
      unliftable.push('suppression');
      blockers.push('recipient_suppressed');
    }
  }
  if (request.market && controls.market_commercially_eligible === false) {
    unliftable.push('protected_market');
    blockers.push('market_not_commercially_eligible');
  }
  if (controls.legal_block === true) {
    unliftable.push('legal_or_regulatory_prohibition');
    blockers.push('legal_block_active');
  }
  if (request.irreversible === true && controls.strong_reauth_present !== true) {
    unliftable.push('irreversible_action_without_reauth');
    blockers.push('irreversible_action_requires_reauth');
  }
  if (controls.human_presence_required === true) {
    unliftable.push('human_presence_required');
    blockers.push('human_presence_required');
  }

  return {
    allowed: blockers.length === 0,
    blockers: [...new Set(blockers)],
    unliftable_controls_hit: [...new Set(unliftable)],
    preset: preset || null,
    // Made explicit so no caller can read a permitted action as "unchecked".
    hard_controls_apply_to_all_presets: true,
    authority_version: FOUNDER_PERMIT_AUTHORITY_VERSION,
  };
}

/**
 * The permit hash binds the AUTHORISED SCOPE. Anything that changes what the
 * permit lets CAMBRA do must be in here, so an amendment invalidates prior
 * bindings instead of silently widening past actions (spec §10.3).
 *
 * Consumption counters are deliberately NOT hashed: spending headroom is not a
 * change of authority, and hashing it would invalidate the permit on first use.
 */
export async function buildPermitHash(
  sha256: (value: unknown) => Promise<string>,
  permit: any,
) {
  const sortedList = (value: unknown) => [...(Array.isArray(value) ? value : [])].map(text).sort();
  return sha256({
    objective: text(permit?.objective),
    issued_by: text(permit?.issued_by),
    preset: text(permit?.preset).toUpperCase(),
    allowed_domains: sortedList(permit?.allowed_domains),
    allowed_tool_ids: sortedList(permit?.allowed_tool_ids),
    allowed_effect_classes: sortedList(permit?.allowed_effect_classes),
    allowed_entity_types: sortedList(permit?.allowed_entity_types),
    allowed_entity_ids: sortedList(permit?.allowed_entity_ids),
    allowed_tenants: sortedList(permit?.allowed_tenants),
    allowed_markets: sortedList(permit?.allowed_markets),
    allowed_environments: sortedList(permit?.allowed_environments),
    allowed_repositories: sortedList(permit?.allowed_repositories),
    allowed_branch_patterns: sortedList(permit?.allowed_branch_patterns),
    allowed_network_domains: sortedList(permit?.allowed_network_domains),
    allowed_data_classes: sortedList(permit?.allowed_data_classes),
    explicit_denials: sortedList(permit?.explicit_denials),
    max_cost_minor: permit?.max_cost_minor ?? null,
    max_tokens: permit?.max_tokens ?? null,
    max_tool_calls: permit?.max_tool_calls ?? null,
    max_records_affected: permit?.max_records_affected ?? null,
    max_external_messages: permit?.max_external_messages ?? null,
    max_parallel_workers: permit?.max_parallel_workers ?? null,
    max_runtime_seconds: permit?.max_runtime_seconds ?? null,
    valid_from: text(permit?.valid_from),
    expires_at: text(permit?.expires_at),
    auto_approval_policy: permit?.auto_approval_policy ?? null,
    requires_strong_reauth: permit?.requires_strong_reauth === true,
    emergency_control_revision: permit?.emergency_control_revision ?? null,
    issue_nonce: text(permit?.issue_nonce),
    authority_version: FOUNDER_PERMIT_AUTHORITY_VERSION,
  });
}

/**
 * A permit may auto-resolve an Approval only when the policy says so AND the
 * emergency epoch has not moved since issue (spec §10.3).
 */
export function canAutoResolveApproval(input: {
  permit: any;
  effect_class: string;
  current_emergency_revision?: number | null;
}) {
  const policy = input.permit?.auto_approval_policy;
  if (!policy || typeof policy !== 'object') {
    return { allowed: false, reason: 'no_auto_approval_policy' };
  }
  const classes = (Array.isArray((policy as any).effect_classes) ? (policy as any).effect_classes : []).map(lower);
  if (!classes.includes(lower(input.effect_class))) {
    return { allowed: false, reason: 'effect_class_not_auto_approvable' };
  }
  const issued = input.permit?.emergency_control_revision;
  const current = input.current_emergency_revision;
  if (issued === null || issued === undefined || current === null || current === undefined) {
    return { allowed: false, reason: 'emergency_revision_unknown' };
  }
  if (Number(issued) !== Number(current)) {
    return { allowed: false, reason: 'emergency_epoch_moved_since_issue' };
  }
  return { allowed: true, reason: null };
}
