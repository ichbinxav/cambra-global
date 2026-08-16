// CAMP-C3 (2026-08-16) — sequence validation (PROMPT_FIX_DISCOVERY_V2 Parte 4,
// chunk C3, spec §7.3.7). Pure.
//
// The mandatory stop conditions are the safety core: a sequence that cannot
// stop on a reply, an unsubscribe, a bounce, a complaint or an Emergency stop
// is not a valid sequence, no matter how well the steps are configured.

export const CAMPAIGN_SEQUENCE_VALIDATOR_VERSION = 'campaign-sequence-validator-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Every one of these must be present on an approvable sequence (spec §7.3.7). */
export const MANDATORY_STOP_CONDITIONS = Object.freeze([
  'ANY_HUMAN_REPLY',
  'UNSUBSCRIBE',
  'HARD_BOUNCE',
  'COMPLAINT',
  'MEETING_BOOKED',
  'CONNECTION_STARTED',
  'CONNECTION_COMPLETED',
  'ANALYZER_COMPLETED',
  'LEAD_CONVERTED_TO_MERCHANT',
  'SUPPRESSION',
  'FOUNDER_PAUSE',
  'POLICY_PAUSE',
  'MARKET_PROTECTED',
  'EMERGENCY_STOP',
] as const);

const DELAY_UNITS = new Set(['HOURS', 'BUSINESS_DAYS', 'DAYS']);

/** Hard ceiling so a misconfigured sequence cannot become a drip forever. */
export const MAX_SEQUENCE_STEPS = 10;

export function validateCampaignSequence(input: {
  steps?: any[];
  stop_conditions?: unknown[];
  business_hours_policy_json?: any;
  timezone_policy?: string;
  out_of_office_policy_json?: any;
  max_followups?: unknown;
}) {
  const steps = Array.isArray(input?.steps) ? input.steps : [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!steps.length) blockers.push('sequence_requires_at_least_one_step');
  if (steps.length > MAX_SEQUENCE_STEPS) blockers.push('sequence_exceeds_max_steps');

  const declared = new Set(
    (Array.isArray(input?.stop_conditions) ? input.stop_conditions : [])
      .map((value) => text(value).toUpperCase()).filter(Boolean),
  );
  const missingStops = MANDATORY_STOP_CONDITIONS.filter((value) => !declared.has(value));
  if (missingStops.length) blockers.push('mandatory_stop_conditions_missing');

  const ordinals = new Set<number>();
  const stepKeys = new Set<string>();
  const stepIssues: any[] = [];
  steps.forEach((step, index) => {
    const issues: string[] = [];
    const key = text(step?.step_key);
    const ordinal = Number(step?.ordinal);
    if (!key) issues.push('step_key_required');
    else if (stepKeys.has(key)) issues.push('duplicate_step_key');
    else stepKeys.add(key);
    if (!Number.isInteger(ordinal) || ordinal < 1) issues.push('ordinal_must_be_positive_integer');
    else if (ordinals.has(ordinal)) issues.push('duplicate_ordinal');
    else ordinals.add(ordinal);
    const unit = text(step?.delay_unit).toUpperCase();
    const amount = Number(step?.delay_amount);
    if (index === 0) {
      // The first step may fire immediately; a negative delay is still wrong.
      if (step?.delay_amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
        issues.push('invalid_delay_amount');
      }
    } else {
      if (!Number.isFinite(amount) || amount <= 0) issues.push('followup_requires_positive_delay');
      if (!DELAY_UNITS.has(unit)) issues.push('invalid_delay_unit');
    }
    const attempts = Number(step?.max_attempts ?? 1);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
      issues.push('max_attempts_out_of_range');
    }
    if (issues.length) stepIssues.push({ index, step_key: key || null, issues });
  });
  if (stepIssues.length) blockers.push('sequence_steps_invalid');

  // Business hours + timezone are required for anything with a follow-up:
  // sending a follow-up at 3am local is a deliverability and respect problem.
  if (steps.length > 1) {
    if (!input?.business_hours_policy_json || typeof input.business_hours_policy_json !== 'object') {
      blockers.push('business_hours_policy_required');
    }
    if (!text(input?.timezone_policy)) blockers.push('timezone_policy_required');
  }

  // Out-of-office rescheduling must be bounded — an unbounded reschedule is
  // exactly how an infinite loop is created (spec §7.3.7).
  const ooo = input?.out_of_office_policy_json;
  if (ooo && typeof ooo === 'object') {
    const maxReschedules = Number((ooo as any).max_reschedules);
    if (!Number.isInteger(maxReschedules) || maxReschedules < 0 || maxReschedules > 2) {
      blockers.push('out_of_office_reschedule_must_be_bounded');
    }
    if ((ooo as any).counts_as_negative_reply === true) {
      blockers.push('out_of_office_must_not_count_as_negative_reply');
    }
  } else if (steps.length > 1) {
    warnings.push('out_of_office_policy_not_configured');
  }

  const maxFollowups = Number(input?.max_followups);
  if (Number.isFinite(maxFollowups) && maxFollowups >= 0 && steps.length - 1 > maxFollowups) {
    blockers.push('steps_exceed_max_followups');
  }

  return {
    status: blockers.length ? 'REVIEW_REQUIRED' : 'VALIDATED',
    blockers,
    warnings,
    missing_stop_conditions: missingStops,
    step_issues: stepIssues,
    step_count: steps.length,
    follow_up_count: Math.max(0, steps.length - 1),
    validator_version: CAMPAIGN_SEQUENCE_VALIDATOR_VERSION,
  };
}
