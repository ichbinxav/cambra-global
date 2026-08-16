// CAMP-C4 (2026-08-16) — campaign metric definitions (PROMPT_FIX_DISCOVERY_V2
// Parte 4, chunk C4, spec §9). Pure.
//
// Every metric declares numerator, denominator, unit, scope, unique key,
// attribution rule and freshness. Two rules are enforced structurally rather
// than by convention:
//   - reply_rate_delivered and reply_rate_accepted are SEPARATE metrics. They
//     are never merged into an unlabelled "reply rate", because they answer
//     different questions and differ by exactly the delivery gap.
//   - A metric whose denominator is zero, or whose source is unavailable, is
//     UNKNOWN with value null. It is never rendered as 0%.
import { TERMINAL_ENROLLMENT_STATES } from './campaignExecutionEngine.ts';

export const CAMPAIGN_METRICS_VERSION = 'campaign-metrics-1.0.0';

const text = (value: unknown) => String(value ?? '').trim().toUpperCase();

/** States that prove the enrollment reached each funnel stage at least once. */
const REACHED: Record<string, Set<string>> = {
  provider_accepted: new Set([
    'PROVIDER_ACCEPTED', 'DELIVERED_OBSERVED', 'OPEN_OBSERVED', 'CLICK_OBSERVED',
    'SITE_VISIT_OBSERVED', 'ANALYZER_STARTED', 'REPLIED', 'POSITIVE_REPLY',
    'NEUTRAL_REPLY', 'NEGATIVE_REPLY', 'WRONG_CONTACT', 'OUT_OF_OFFICE',
    'MEETING_BOOKED', 'CONNECTION_STARTED', 'CONNECTION_COMPLETED', 'QUALIFIED',
    'OPPORTUNITY_CREATED', 'RECOVER_CREATED', 'CONVERTED',
  ]),
  // Delivery is only counted from an OBSERVED delivery onward. A
  // PROVIDER_ACCEPTED enrollment is deliberately absent here.
  delivered_observed: new Set([
    'DELIVERED_OBSERVED', 'OPEN_OBSERVED', 'CLICK_OBSERVED', 'SITE_VISIT_OBSERVED',
    'ANALYZER_STARTED', 'REPLIED', 'POSITIVE_REPLY', 'NEUTRAL_REPLY',
    'NEGATIVE_REPLY', 'WRONG_CONTACT', 'OUT_OF_OFFICE', 'MEETING_BOOKED',
    'CONNECTION_STARTED', 'CONNECTION_COMPLETED', 'QUALIFIED',
    'OPPORTUNITY_CREATED', 'RECOVER_CREATED', 'CONVERTED',
  ]),
  human_reply: new Set([
    'REPLIED', 'POSITIVE_REPLY', 'NEUTRAL_REPLY', 'NEGATIVE_REPLY',
    'WRONG_CONTACT', 'MEETING_BOOKED', 'CONNECTION_STARTED',
    'CONNECTION_COMPLETED', 'QUALIFIED', 'OPPORTUNITY_CREATED',
    'RECOVER_CREATED', 'CONVERTED',
  ]),
  positive_reply: new Set([
    'POSITIVE_REPLY', 'MEETING_BOOKED', 'CONNECTION_STARTED',
    'CONNECTION_COMPLETED', 'QUALIFIED', 'OPPORTUNITY_CREATED',
    'RECOVER_CREATED', 'CONVERTED',
  ]),
  meeting_booked: new Set([
    'MEETING_BOOKED', 'CONNECTION_STARTED', 'CONNECTION_COMPLETED', 'QUALIFIED',
    'OPPORTUNITY_CREATED', 'RECOVER_CREATED', 'CONVERTED',
  ]),
  connection_started: new Set([
    'CONNECTION_STARTED', 'CONNECTION_COMPLETED', 'OPPORTUNITY_CREATED',
    'RECOVER_CREATED', 'CONVERTED',
  ]),
};

/** Out-of-office is explicitly NOT a negative reply (spec §7.3.7). */
const OUT_OF_OFFICE = new Set(['OUT_OF_OFFICE']);

function counts(enrollments: any[]) {
  const rows = Array.isArray(enrollments) ? enrollments : [];
  const seenCompanies = new Map<string, Set<string>>();
  const tally: Record<string, number> = {
    eligible: 0, queued: 0, provider_accepted: 0, delivered_observed: 0,
    human_reply: 0, positive_reply: 0, negative_reply: 0, out_of_office: 0,
    meeting_booked: 0, connection_started: 0, bounced: 0, unsubscribed: 0,
    complaint: 0, review_required: 0,
  };
  for (const row of rows) {
    const state = text(row?.state);
    if (state === 'EXCLUDED') continue;
    tally.eligible += 1;
    if (state === 'QUEUED' || state === 'SCHEDULED' || state === 'CLAIMED') tally.queued += 1;
    for (const [key, states] of Object.entries(REACHED)) {
      if (states.has(state)) tally[key] += 1;
    }
    if (state === 'NEGATIVE_REPLY') tally.negative_reply += 1;
    if (OUT_OF_OFFICE.has(state)) tally.out_of_office += 1;
    if (state === 'BOUNCED') tally.bounced += 1;
    if (state === 'UNSUBSCRIBED') tally.unsubscribed += 1;
    if (state === 'COMPLAINT') tally.complaint += 1;
    if (state === 'REVIEW_REQUIRED') tally.review_required += 1;
    // Company-level counting: one company converting through two contacts is
    // ONE company, not two (spec §9.8).
    const company = String(row?.company_key || '').toLowerCase();
    if (company) {
      if (!seenCompanies.has(company)) seenCompanies.set(company, new Set());
      if (REACHED.human_reply.has(state)) seenCompanies.get(company)!.add('reply');
      if (REACHED.meeting_booked.has(state)) seenCompanies.get(company)!.add('meeting');
    }
  }
  const companiesWithReply = [...seenCompanies.values()].filter((set) => set.has('reply')).length;
  const companiesWithMeeting = [...seenCompanies.values()].filter((set) => set.has('meeting')).length;
  return { tally, companies: seenCompanies.size, companiesWithReply, companiesWithMeeting };
}

function rate(numerator: number, denominator: number) {
  // A zero denominator has no rate. Reporting 0% would claim a measured
  // failure where nothing was measured at all.
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Number((numerator / denominator).toFixed(6));
}

function metric(input: {
  key: string;
  label: string;
  value: number | null;
  numerator: string;
  denominator: string;
  denominator_value: number | null;
  unit: string;
  scope: string;
  unique_key: string;
  attribution_rule: string;
  available: boolean;
  freshness?: string | null;
  blocker?: string | null;
}) {
  const measurable = input.available && input.value !== null;
  return {
    metric_key: input.key,
    label: input.label,
    value: measurable ? input.value : null,
    status: measurable ? 'OBSERVED' : 'UNKNOWN',
    numerator: input.numerator,
    denominator: input.denominator,
    denominator_value: input.available ? input.denominator_value : null,
    unit: input.unit,
    scope: input.scope,
    unique_key: input.unique_key,
    attribution_rule: input.attribution_rule,
    source_watermark: input.freshness ?? null,
    freshness: input.freshness ?? null,
    blocker: measurable
      ? null
      : (input.blocker || (input.available ? 'denominator_is_zero' : 'source_unavailable')),
  };
}

/**
 * Builds the campaign metric set from enrollment rows.
 * `available: false` means the enrollment source could not be read — every
 * metric then reports UNKNOWN rather than a zeroed funnel.
 */
export function buildCampaignMetrics(input: {
  enrollments: any[];
  available?: boolean;
  freshness?: string | null;
  blocker?: string | null;
}) {
  const available = input.available !== false;
  const { tally, companies, companiesWithReply, companiesWithMeeting } = counts(available ? input.enrollments : []);
  const freshness = input.freshness ?? null;
  const common = { available, freshness, blocker: input.blocker ?? null };

  const metrics = [
    metric({
      key: 'eligible', label: 'Eligible recipients', value: available ? tally.eligible : null,
      numerator: 'enrollments not excluded', denominator: 'n/a (absolute count)',
      denominator_value: null, unit: 'count', scope: 'campaign',
      unique_key: 'enrollment_id', attribution_rule: 'direct', ...common,
    }),
    metric({
      key: 'provider_accepted', label: 'Provider accepted', value: available ? tally.provider_accepted : null,
      numerator: 'enrollments that reached PROVIDER_ACCEPTED or beyond',
      denominator: 'n/a (absolute count)', denominator_value: null, unit: 'count',
      scope: 'campaign', unique_key: 'enrollment_id',
      attribution_rule: 'provider acceptance is not delivery', ...common,
    }),
    metric({
      key: 'delivered_observed', label: 'Delivered observed', value: available ? tally.delivered_observed : null,
      numerator: 'enrollments with an OBSERVED delivery event',
      denominator: 'n/a (absolute count)', denominator_value: null, unit: 'count',
      scope: 'campaign', unique_key: 'enrollment_id',
      attribution_rule: 'requires a provider delivery event; acceptance alone never counts', ...common,
    }),
    // The two reply rates are separate metrics, never merged (spec §9.7).
    metric({
      key: 'reply_rate_delivered', label: 'Reply rate (delivered)',
      value: available ? rate(tally.human_reply, tally.delivered_observed) : null,
      numerator: 'unique enrollments with a human reply',
      denominator: 'enrollments with DELIVERED_OBSERVED',
      denominator_value: tally.delivered_observed, unit: 'ratio', scope: 'campaign',
      unique_key: 'enrollment_id', attribution_rule: 'human replies only; auto-replies excluded', ...common,
    }),
    metric({
      key: 'reply_rate_accepted', label: 'Reply rate (provider accepted)',
      value: available ? rate(tally.human_reply, tally.provider_accepted) : null,
      numerator: 'unique enrollments with a human reply',
      denominator: 'enrollments with PROVIDER_ACCEPTED',
      denominator_value: tally.provider_accepted, unit: 'ratio', scope: 'campaign',
      unique_key: 'enrollment_id',
      attribution_rule: 'differs from reply_rate_delivered by the delivery observation gap', ...common,
    }),
    metric({
      key: 'positive_reply_rate', label: 'Positive reply rate',
      value: available ? rate(tally.positive_reply, tally.human_reply) : null,
      numerator: 'enrollments with a positive reply', denominator: 'enrollments with a human reply',
      denominator_value: tally.human_reply, unit: 'ratio', scope: 'campaign',
      unique_key: 'enrollment_id',
      attribution_rule: 'out-of-office is not counted as a reply of any sentiment', ...common,
    }),
    metric({
      key: 'out_of_office', label: 'Out of office', value: available ? tally.out_of_office : null,
      numerator: 'enrollments classified out of office', denominator: 'n/a (absolute count)',
      denominator_value: null, unit: 'count', scope: 'campaign', unique_key: 'enrollment_id',
      attribution_rule: 'explicitly excluded from negative replies', ...common,
    }),
    // Contact-level and company-level are reported side by side, never mixed.
    metric({
      key: 'company_reply_rate', label: 'Company reply rate',
      value: available ? rate(companiesWithReply, companies) : null,
      numerator: 'distinct companies with at least one human reply',
      denominator: 'distinct companies in the audience', denominator_value: companies,
      unit: 'ratio', scope: 'campaign (company level)', unique_key: 'company_key',
      attribution_rule: 'a company with two replying contacts counts once', ...common,
    }),
    metric({
      key: 'company_meeting_rate', label: 'Company meeting rate',
      value: available ? rate(companiesWithMeeting, companies) : null,
      numerator: 'distinct companies with a booked meeting',
      denominator: 'distinct companies in the audience', denominator_value: companies,
      unit: 'ratio', scope: 'campaign (company level)', unique_key: 'company_key',
      attribution_rule: 'company-level; never summed with contact-level meetings', ...common,
    }),
    metric({
      key: 'review_required', label: 'Review required', value: available ? tally.review_required : null,
      numerator: 'enrollments in REVIEW_REQUIRED', denominator: 'n/a (absolute count)',
      denominator_value: null, unit: 'count', scope: 'campaign', unique_key: 'enrollment_id',
      attribution_rule: 'ambiguous effects converge here and never auto-retry', ...common,
    }),
  ];

  return {
    metrics,
    counts: tally,
    company_counts: { companies, with_reply: companiesWithReply, with_meeting: companiesWithMeeting },
    data_status: available ? 'AVAILABLE' : 'UNAVAILABLE',
    truth_boundary:
      'Provider acceptance is not delivery. A zero denominator yields UNKNOWN, not 0%. Contact-level and company-level rates are reported separately and never summed.',
    metrics_version: CAMPAIGN_METRICS_VERSION,
    terminal_states: TERMINAL_ENROLLMENT_STATES,
  };
}
