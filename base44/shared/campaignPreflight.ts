// CAMP-C3 (2026-08-16) — campaign preflight (PROMPT_FIX_DISCOVERY_V2 Parte 4,
// chunk C3, spec §7.3.9-10). Pure.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: there is no silent partial PASS.
// Every dimension resolves to PASS / BLOCKED / REVIEW_REQUIRED / UNKNOWN, and
// the overall verdict is the worst of them. An UNKNOWN dimension (a source we
// could not read, an authority that does not exist yet) is NEVER treated as a
// pass — the campaign cannot be approved until it is resolved.

export const CAMPAIGN_PREFLIGHT_VERSION = 'campaign-preflight-1.0.0';

export type PreflightStatus = 'PASS' | 'BLOCKED' | 'REVIEW_REQUIRED' | 'UNKNOWN';

/** Worst-wins ordering. BLOCKED is worse than UNKNOWN is worse than REVIEW. */
const SEVERITY: Record<PreflightStatus, number> = {
  PASS: 0,
  REVIEW_REQUIRED: 1,
  UNKNOWN: 2,
  BLOCKED: 3,
};

const text = (value: unknown) => String(value ?? '').trim();

function dimension(
  key: string,
  status: PreflightStatus,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  // The verdict fields are written LAST so no caller-supplied extra can
  // overwrite them. An extra named `status` used to silently replace the
  // verdict, which made a BLOCKED dimension read as its own detail value.
  return { ...extra, key, status, detail };
}

export type PreflightInput = {
  campaign?: any;
  audienceVersion?: any;
  audienceAvailable?: boolean;
  contentValidation?: { status?: string; blockers?: string[]; blocked_claims?: any[] } | null;
  sequenceValidation?: { status?: string; blockers?: string[] } | null;
  sendingProfiles?: any[];
  sendingProfilesAvailable?: boolean;
  policy?: any;
  policyAvailable?: boolean;
  outboundControl?: any;
  outboundControlAvailable?: boolean;
  emergency?: any;
  emergencyAvailable?: boolean;
  budget?: { remaining_minor?: number | null; available?: boolean };
  /** FounderPermit authority does not exist on this tree — see C0. */
  founderPermit?: { present?: boolean; authority_available?: boolean } | null;
};

/**
 * Builds the full preflight. Returns every dimension plus the aggregate
 * verdict, the approvable flag and the hash-bound approval scope (spec
 * §7.3.10) — approval binds to the exact version hashes, so changing any
 * dimension invalidates it.
 */
export function buildCampaignPreflight(input: PreflightInput) {
  const campaign = input.campaign || {};
  const dimensions: any[] = [];

  // --- Audience -------------------------------------------------------
  if (input.audienceAvailable === false) {
    dimensions.push(dimension('audience', 'UNKNOWN', 'The audience version could not be read.'));
  } else if (!input.audienceVersion) {
    dimensions.push(dimension('audience', 'BLOCKED', 'No audience version exists for this campaign.'));
  } else {
    const eligible = Number(input.audienceVersion.final_eligible_count);
    // Only FROZEN passes. A READY audience can still be rebuilt into a new
    // version, which would silently invalidate the approval hash bound to its
    // content_hash — so it must be frozen before approval, not merely built.
    const frozen = text(input.audienceVersion.status).toUpperCase() === 'FROZEN';
    if (!Number.isFinite(eligible)) {
      dimensions.push(dimension('audience', 'UNKNOWN', 'The audience version has no eligible count.'));
    } else if (eligible <= 0) {
      dimensions.push(dimension('audience', 'BLOCKED', 'No eligible recipient survived the exclusion ladder.', { eligible }));
    } else if (!frozen) {
      dimensions.push(dimension('audience', 'REVIEW_REQUIRED', 'The audience must be frozen before approval so the approval hash cannot drift.', {
        // Never name an extra field `status`: dimension() spreads extras last,
        // so it would clobber the dimension's own verdict.
        eligible, audience_status: text(input.audienceVersion.status).toUpperCase() || null,
      }));
    } else {
      dimensions.push(dimension('audience', 'PASS', 'Audience frozen with eligible recipients.', { eligible }));
    }
  }

  // --- Content --------------------------------------------------------
  if (!input.contentValidation) {
    dimensions.push(dimension('content', 'BLOCKED', 'No validated content version.'));
  } else if (text(input.contentValidation.status).toUpperCase() === 'VALIDATED') {
    dimensions.push(dimension('content', 'PASS', 'Content validated; every required variable resolves.'));
  } else {
    const claims = input.contentValidation.blocked_claims || [];
    dimensions.push(dimension(
      claims.length ? 'claims_policy' : 'content',
      'BLOCKED',
      claims.length
        ? 'Content asserts a claim CAMBRA has not evidenced for these recipients.'
        : 'Content validation did not pass.',
      { blockers: input.contentValidation.blockers || [], blocked_claims: claims },
    ));
    if (claims.length) {
      dimensions.push(dimension('content', 'BLOCKED', 'Content validation did not pass.', {
        blockers: input.contentValidation.blockers || [],
      }));
    }
  }

  // --- Sequence -------------------------------------------------------
  if (!input.sequenceValidation) {
    dimensions.push(dimension('sequence', 'BLOCKED', 'No validated sequence version.'));
  } else if (text(input.sequenceValidation.status).toUpperCase() === 'VALIDATED') {
    dimensions.push(dimension('sequence', 'PASS', 'Sequence validated with every mandatory stop condition.'));
  } else {
    dimensions.push(dimension('sequence', 'BLOCKED', 'Sequence validation did not pass.', {
      blockers: input.sequenceValidation.blockers || [],
    }));
  }

  // --- Market authority ------------------------------------------------
  // Market scope was already enforced per recipient by the audience builder;
  // here we check the campaign-level declared scope is not empty.
  const markets = Array.isArray(campaign.market_scope) ? campaign.market_scope.filter(Boolean) : [];
  dimensions.push(markets.length
    ? dimension('market_authority', 'PASS', 'Campaign declares an explicit market scope.', { markets })
    : dimension('market_authority', 'REVIEW_REQUIRED', 'Campaign declares no market scope; per-recipient market gating still applies.'));

  // --- Commercial policy -----------------------------------------------
  if (input.policyAvailable === false) {
    dimensions.push(dimension('commercial_policy', 'UNKNOWN', 'The commercial policy authority could not be read.'));
  } else if (!input.policy) {
    dimensions.push(dimension('commercial_policy', 'BLOCKED', 'No active commercial policy is bound to this campaign.'));
  } else if (text(input.policy.status).toLowerCase() !== 'active') {
    dimensions.push(dimension('commercial_policy', 'BLOCKED', 'The bound commercial policy is not active.', { policy_status: input.policy.status }));
  } else {
    dimensions.push(dimension('commercial_policy', 'PASS', 'Exactly one active commercial policy is bound.', {
      policy_key: input.policy.policy_key, policy_version: input.policy.version,
    }));
  }

  // --- Sending infrastructure ------------------------------------------
  if (input.sendingProfilesAvailable === false) {
    dimensions.push(dimension('sending_infrastructure', 'UNKNOWN', 'Sending profile health could not be read.'));
  } else {
    const profiles = Array.isArray(input.sendingProfiles) ? input.sendingProfiles : [];
    const healthy = profiles.filter((profile) =>
      text(profile?.status).toLowerCase() === 'active' &&
      Number(profile?.current_daily_cap || 0) > 0 &&
      // Health must be OBSERVED, not assumed from an old row.
      text(profile?.webhook_status).toUpperCase() !== 'UNKNOWN'
    );
    const capacity = healthy.reduce((sum, profile) => sum + Math.max(0, Number(profile?.current_daily_cap || 0)), 0);
    if (!profiles.length) {
      dimensions.push(dimension('sending_infrastructure', 'BLOCKED', 'No sending profile is configured.'));
    } else if (!healthy.length) {
      dimensions.push(dimension('sending_infrastructure', 'BLOCKED', 'No sending profile is healthy and within cap.', { profiles: profiles.length }));
    } else {
      dimensions.push(dimension('sending_infrastructure', 'PASS', 'At least one healthy sending profile with capacity.', {
        healthy_profiles: healthy.length, daily_capacity: capacity,
      }));
    }
  }

  // --- Outbound master control -----------------------------------------
  if (input.outboundControlAvailable === false) {
    dimensions.push(dimension('outbound_control', 'UNKNOWN', 'The outbound control authority could not be read or is ambiguous.'));
  } else if (input.outboundControl?.acquisition_enabled !== true) {
    dimensions.push(dimension('outbound_control', 'BLOCKED', 'Outbound is globally paused (PAUSED_ZERO).'));
  } else {
    dimensions.push(dimension('outbound_control', 'PASS', 'Outbound master control is enabled.'));
  }

  // --- Emergency -------------------------------------------------------
  if (input.emergencyAvailable === false) {
    dimensions.push(dimension('emergency', 'UNKNOWN', 'The emergency authority could not be read.'));
  } else if (input.emergency?.safe_mode === true || input.emergency?.communications_paused === true) {
    dimensions.push(dimension('emergency', 'BLOCKED', 'SAFE MODE or a communications pause is active.'));
  } else {
    dimensions.push(dimension('emergency', 'PASS', 'No emergency pause is active.', {
      control_revision: input.emergency?.control_revision ?? null,
    }));
  }

  // --- Budget -----------------------------------------------------------
  if (!input.budget || input.budget.available === false) {
    dimensions.push(dimension('budget', 'UNKNOWN', 'Budget headroom could not be read.'));
  } else {
    const remaining = Number(input.budget.remaining_minor);
    if (!Number.isFinite(remaining)) {
      dimensions.push(dimension('budget', 'UNKNOWN', 'Budget headroom is not a readable number.'));
    } else if (remaining <= 0) {
      dimensions.push(dimension('budget', 'BLOCKED', 'No budget headroom remains.', { remaining_minor: remaining }));
    } else {
      dimensions.push(dimension('budget', 'PASS', 'Budget headroom available.', { remaining_minor: remaining }));
    }
  }

  // --- Founder permit ---------------------------------------------------
  // CAMBRA Command's FounderPermit authority does not exist on this tree (C0).
  // It is reported UNKNOWN — which blocks approval — rather than skipped.
  if (!input.founderPermit || input.founderPermit.authority_available !== true) {
    dimensions.push(dimension('founder_permit', 'UNKNOWN',
      'FounderPermit authority is not implemented on this tree; approval cannot claim permit coverage.',
      { configuration_required: true }));
  } else if (input.founderPermit.present !== true) {
    dimensions.push(dimension('founder_permit', 'BLOCKED', 'No FounderPermit covers this campaign.'));
  } else {
    dimensions.push(dimension('founder_permit', 'PASS', 'A FounderPermit covers this campaign.'));
  }

  const verdict = dimensions.reduce<PreflightStatus>(
    (worst, row) => (SEVERITY[row.status as PreflightStatus] > SEVERITY[worst] ? row.status : worst),
    'PASS',
  );

  return {
    verdict,
    // Approval is only possible on a clean PASS. UNKNOWN never approves.
    approvable: verdict === 'PASS',
    dimensions,
    blocked_dimensions: dimensions.filter((row) => row.status === 'BLOCKED').map((row) => row.key),
    unknown_dimensions: dimensions.filter((row) => row.status === 'UNKNOWN').map((row) => row.key),
    review_dimensions: dimensions.filter((row) => row.status === 'REVIEW_REQUIRED').map((row) => row.key),
    truth_boundary:
      'Every dimension is PASS, BLOCKED, REVIEW_REQUIRED or UNKNOWN. The verdict is the worst dimension; an UNKNOWN dimension never counts as a pass.',
    preflight_version: CAMPAIGN_PREFLIGHT_VERSION,
    external_effect_performed: false,
  };
}

/**
 * Hash-bound approval scope (spec §7.3.10). Changing ANY dimension — audience,
 * content, sequence, policy, limits, profiles, emergency revision — produces a
 * different hash, which invalidates a previously granted approval.
 */
export async function buildApprovalBinding(
  sha256: (value: unknown) => Promise<string>,
  input: {
    campaign_id: string;
    audience_content_hash?: string | null;
    content_hash?: string | null;
    sequence_hash?: string | null;
    policy_version?: string | null;
    market_scope?: unknown[];
    sending_profile_keys?: unknown[];
    limits?: Record<string, unknown>;
    budget_limit_minor?: number | null;
    emergency_control_revision?: number | null;
    actor: string;
    nonce: string;
    expires_at: string;
  },
) {
  const scope = {
    campaign_id: input.campaign_id,
    audience_content_hash: input.audience_content_hash ?? null,
    content_hash: input.content_hash ?? null,
    sequence_hash: input.sequence_hash ?? null,
    policy_version: input.policy_version ?? null,
    market_scope: [...(Array.isArray(input.market_scope) ? input.market_scope : [])].map(String).sort(),
    sending_profile_keys: [...(Array.isArray(input.sending_profile_keys) ? input.sending_profile_keys : [])].map(String).sort(),
    limits: input.limits ?? {},
    budget_limit_minor: input.budget_limit_minor ?? null,
    emergency_control_revision: input.emergency_control_revision ?? null,
    actor: input.actor,
    nonce: input.nonce,
    expires_at: input.expires_at,
    preflight_version: CAMPAIGN_PREFLIGHT_VERSION,
  };
  return { scope, approval_hash: await sha256(scope) };
}
