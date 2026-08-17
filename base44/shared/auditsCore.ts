// DASHBOARD-C4 (2026-08-17) — Audits & Opportunities projection.
//
// C0 established there is no /admin/audits surface at all, and that every
// authority it needs already exists. MerchantOpportunity in particular already
// carries the complete section 9.15 truth model — current cost, target cost,
// gross theoretical, actionable, expected recoverable, annualized, realization
// probability, confidence and evidence completeness as SEPARATE fields. So this
// chunk creates no entity: it projects.
//
// The separations this module exists to protect, from section 9.4:
//
//   gross theoretical  !=  actionable  !=  expected recoverable
//   !=  verified  !=  billable  !=  collected CAMBRA revenue
//
// Collapsing any two of those is how a €400k "opportunity" becomes a €400k
// promise. This module never computes verified savings and never computes
// billable savings — those are Recover's and Finance's authorities respectively,
// and a test asserts the fields are absent from everything it returns.
//
// One more thing worth stating: AnalyzerResult declares an EMPTY required list.
// Every field on it is optional at the schema level, so nothing may be assumed
// present. PaymentsAnalysisVerified declares measurement_window and sample_metrics
// as properties but NOT as required, so window and sample provenance are
// possibly-absent too.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { nullableMinor } from './nullableNumber.ts';
import {
  buildContext, kpi, portfolioResponse, sortKeepingUnknownLast,
  type SourceHealthRow, type TruthClass,
} from './workspaceContract.ts';

export const AUDITS_CORE_VERSION = 'audits-core-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
// Nullable coercion lives in ONE place now; see nullableNumber.ts for why.
const minor = nullableMinor;

const READ_LIMIT = 2000;

/** Audit types (section 9.3). The type determines what may be claimed. */
export const AUDIT_TYPES = Object.freeze([
  'ANONYMOUS_ESTIMATE', 'CONNECTED_VERIFIED', 'STATEMENT_BASED', 'MANUAL_REVIEW',
  'IN_STORE', 'ONLINE', 'COMBINED', 'REASSESSMENT', 'POST_CHANGE_VERIFICATION',
] as const);
export type AuditType = typeof AUDIT_TYPES[number];

/**
 * Audit types that may NEVER carry a verified truth class, whatever the row says.
 *
 * An anonymous estimate is built from data nobody authenticated. If its
 * verification_status happens to read "verified" — and AnalyzerResult requires
 * nothing, so it can — the label is still not earned.
 */
export const NEVER_VERIFIED_TYPES: readonly AuditType[] = Object.freeze([
  'ANONYMOUS_ESTIMATE', 'MANUAL_REVIEW',
]);

export const AUDIT_STATUSES = Object.freeze([
  'CREATED', 'DATA_PENDING', 'DATA_READY', 'QUEUED', 'ANALYZING', 'PARTIAL',
  'DATA_INCOMPLETE', 'NEEDS_EVIDENCE', 'REVIEW_REQUIRED', 'COMPLETED',
  'NO_OPPORTUNITY', 'FAILED_PRE_EFFECT', 'FAILED_POST_EFFECT', 'SUPERSEDED', 'EXPIRED',
] as const);

export const OPPORTUNITY_STATUSES = Object.freeze([
  'CANDIDATE', 'EVIDENCE_INCOMPLETE', 'REVIEW_REQUIRED', 'QUALIFIED',
  'APPROVED_FOR_RECOVER', 'REJECTED', 'DEFERRED', 'SUPERSEDED', 'EXPIRED',
  'IN_RECOVER', 'REALIZED', 'NOT_REALIZED',
] as const);

/** Statuses that let an opportunity leave for Recover. Nothing else may. */
export const RECOVER_ELIGIBLE_STATUSES = Object.freeze(['APPROVED_FOR_RECOVER'] as const);

/**
 * Derives the audit type from an AnalyzerResult row.
 *
 * Conservative by construction: a row that does not prove it was connected and
 * verified is an ANONYMOUS_ESTIMATE, because that is the weakest claim and the
 * one that cannot mislead.
 */
export function auditTypeFor(row: any): AuditType {
  const scope = text(row?.verification_scope).toUpperCase();
  if (scope === 'CONNECTED' || scope === 'CONNECTED_VERIFIED') return 'CONNECTED_VERIFIED';
  if (scope === 'STATEMENT' || scope === 'STATEMENT_BASED') return 'STATEMENT_BASED';
  if (scope === 'MANUAL' || scope === 'MANUAL_REVIEW') return 'MANUAL_REVIEW';
  if (row?.was_anonymous === true || text(row?.anon_session_id)) return 'ANONYMOUS_ESTIMATE';
  if (text(row?.source_integration_id)) return 'CONNECTED_VERIFIED';
  return 'ANONYMOUS_ESTIMATE';
}

/**
 * The truth class an audit's savings figure may carry.
 *
 * The cap is the point: an ANONYMOUS_ESTIMATE is MODELED however confident the
 * row claims to be, and only a connected or statement-based audit whose
 * verification_status genuinely says verified may reach VERIFIED.
 */
export function auditTruthClass(row: any): TruthClass {
  const type = auditTypeFor(row);
  if (NEVER_VERIFIED_TYPES.includes(type)) return 'MODELED';
  const verification = text(row?.verification_status).toLowerCase();
  if (verification === 'verified' || verification === 'realized') return 'VERIFIED';
  if (text(row?.source_integration_id)) return 'OBSERVED';
  return 'MODELED';
}

export type AuditRow = {
  canonical_id: string;
  entity_type: string;
  brand_id: string | null;
  audit_type: AuditType;
  status: string;
  truth_class: TruthClass;
  currency: string | null;
  total_savings_minor: number | null;
  data_completeness: number | null;
  confidence: string | null;
  engine_version: string | null;
  benchmark_version: string | null;
  methodology: string | null;
  verification_scope: string | null;
  measurement_window: unknown | null;
  window_provenance: 'PRESENT' | 'ABSENT';
  intelligence_snapshot_id: string | null;
  attention_reasons: string[];
  claim_boundary: string;
};

function auditClaimBoundary(row: any, type: AuditType): string {
  if (NEVER_VERIFIED_TYPES.includes(type)) {
    return 'Modeled from unauthenticated inputs. This figure is an estimate and may not be presented as verified savings.';
  }
  if (!text(row?.source_integration_id)) {
    return 'No source integration is recorded, so the inputs were not read from a connected account.';
  }
  if (minor(row?.data_completeness_score) !== null && Number(row.data_completeness_score) < 100) {
    return `Data completeness ${row.data_completeness_score}%. Missing inputs are excluded, so this is a lower bound.`;
  }
  return 'Computed from a connected source with complete inputs.';
}

function auditAttention(row: any, type: AuditType): string[] {
  const reasons: string[] = [];
  if (!text(row?.score_engine_version)) reasons.push('engine_version_missing');
  if (!text(row?.benchmark_version)) reasons.push('benchmark_version_missing');
  const completeness = minor(row?.data_completeness_score);
  if (completeness === null) reasons.push('completeness_unknown');
  else if (completeness < 60) reasons.push('data_incomplete');
  if (!text(row?.methodology)) reasons.push('methodology_undeclared');
  // A row that claims verification while being an unverifiable type is the most
  // important thing to surface: something upstream mislabelled it.
  if (NEVER_VERIFIED_TYPES.includes(type) && text(row?.verification_status).toLowerCase() === 'verified') {
    reasons.push('claims_verified_but_type_cannot_be_verified');
  }
  return reasons;
}

export function projectAudit(row: any): AuditRow {
  const type = auditTypeFor(row);
  // measurement_window is not a required field, so its absence is recorded rather
  // than assumed away.
  const window = row?.measurement_window ?? null;
  return {
    canonical_id: text(row?.id),
    entity_type: 'AnalyzerResult',
    brand_id: text(row?.brand_id) || null,
    audit_type: type,
    status: text(row?.verification_status).toUpperCase() || 'CREATED',
    truth_class: auditTruthClass(row),
    currency: text(row?.currency) || null,
    total_savings_minor: minor(row?.total_savings) !== null ? Math.round(Number(row.total_savings) * 100) : null,
    data_completeness: minor(row?.data_completeness_score),
    confidence: text(row?.confidence_level) || null,
    engine_version: text(row?.score_engine_version) || null,
    benchmark_version: text(row?.benchmark_version) || null,
    methodology: text(row?.methodology) || null,
    verification_scope: text(row?.verification_scope) || null,
    measurement_window: window,
    window_provenance: window ? 'PRESENT' : 'ABSENT',
    intelligence_snapshot_id: text(row?.intelligence_snapshot_id) || null,
    attention_reasons: auditAttention(row, type),
    claim_boundary: auditClaimBoundary(row, type),
  };
}

export type OpportunityRow = {
  canonical_id: string;
  entity_type: string;
  opportunity_key: string;
  market: string | null;
  currency: string | null;
  opportunity_type: string | null;
  status: string;
  // The six figures stay SEPARATE. Collapsing any two is the defect.
  current_annual_cost_minor: number | null;
  target_annual_cost_minor: number | null;
  gross_theoretical_savings_minor: number | null;
  actionable_savings_minor: number | null;
  expected_recoverable_savings_minor: number | null;
  annualized_savings_minor: number | null;
  realization_probability_ppm: number | null;
  confidence: string | null;
  evidence_completeness: string | null;
  evidence_reference_count: number;
  blockers: string[];
  recommended_next_action: string | null;
  recover_eligible: boolean;
  recover_blockers: string[];
  calculation_version: string | null;
  attention_reasons: string[];
  claim_boundary: string;
};

/**
 * Whether an opportunity may hand off to Recover (section 6.7).
 *
 * Every condition must be met. The default is refusal: an opportunity with no
 * evidence completeness recorded is not eligible, because absence of a
 * completeness reading is not evidence of completeness.
 */
export function recoverEligibility(row: any): { eligible: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const status = text(row?.status).toUpperCase();
  if (!(RECOVER_ELIGIBLE_STATUSES as readonly string[]).includes(status)) {
    blockers.push(`status_not_approved_for_recover:${status || 'UNKNOWN'}`);
  }
  const completeness = text(row?.evidence_completeness).toUpperCase();
  if (!completeness) blockers.push('evidence_completeness_unknown');
  else if (completeness === 'INCOMPLETE' || completeness === 'NONE') blockers.push('evidence_incomplete');
  if (!text(row?.merchant_context_reference)) blockers.push('merchant_context_missing');
  if ((Array.isArray(row?.blockers) ? row.blockers : []).length) blockers.push('opportunity_declares_blockers');
  if (minor(row?.expected_recoverable_savings_minor) === null) blockers.push('expected_recoverable_savings_unknown');
  return { eligible: blockers.length === 0, blockers };
}

function opportunityClaimBoundary(row: any): string {
  const gross = minor(row?.gross_theoretical_savings_minor);
  const actionable = minor(row?.actionable_savings_minor);
  const expected = minor(row?.expected_recoverable_savings_minor);
  if (expected === null && actionable === null && gross !== null) {
    return 'Only a gross theoretical figure exists. Nothing has established how much of it is actionable or recoverable, so it may not be presented as a savings opportunity.';
  }
  if (expected === null && actionable !== null) {
    return 'Actionable savings are known but expected recoverable savings are not. The realizable share is undetermined.';
  }
  return 'Gross theoretical, actionable and expected recoverable figures are recorded separately. None of them is verified savings.';
}

export function projectOpportunity(row: any): OpportunityRow {
  const eligibility = recoverEligibility(row);
  const attention: string[] = [];
  if (!text(row?.calculation_version)) attention.push('calculation_version_missing');
  if (!text(row?.evidence_completeness)) attention.push('evidence_completeness_unknown');
  if ((Array.isArray(row?.evidence_references) ? row.evidence_references : []).length === 0) {
    attention.push('no_evidence_references');
  }
  if (minor(row?.realization_probability_ppm) === null) attention.push('realization_probability_unknown');
  if ((Array.isArray(row?.blockers) ? row.blockers : []).length) attention.push('declares_blockers');

  return {
    canonical_id: text(row?.id),
    entity_type: 'MerchantOpportunity',
    opportunity_key: text(row?.opportunity_key),
    market: text(row?.market) || null,
    currency: text(row?.currency) || null,
    opportunity_type: text(row?.opportunity_type) || null,
    status: text(row?.status).toUpperCase() || 'CANDIDATE',
    current_annual_cost_minor: minor(row?.current_annual_cost_minor),
    target_annual_cost_minor: minor(row?.target_annual_cost_minor),
    gross_theoretical_savings_minor: minor(row?.gross_theoretical_savings_minor),
    actionable_savings_minor: minor(row?.actionable_savings_minor),
    expected_recoverable_savings_minor: minor(row?.expected_recoverable_savings_minor),
    annualized_savings_minor: minor(row?.annualized_savings_minor),
    realization_probability_ppm: minor(row?.realization_probability_ppm),
    confidence: text(row?.confidence) || null,
    evidence_completeness: text(row?.evidence_completeness) || null,
    evidence_reference_count: (Array.isArray(row?.evidence_references) ? row.evidence_references : []).length,
    blockers: (Array.isArray(row?.blockers) ? row.blockers : []).map(text),
    recommended_next_action: text(row?.recommended_next_action) || null,
    recover_eligible: eligibility.eligible,
    recover_blockers: eligibility.blockers,
    calculation_version: text(row?.calculation_version) || null,
    attention_reasons: attention,
    claim_boundary: opportunityClaimBoundary(row),
  };
}

/**
 * Builds the Audits & Opportunities portfolio.
 *
 * Audits and opportunities are read and reported SEPARATELY. Merging them into
 * one row list would be the first step towards treating an audit as an
 * opportunity, which section 9.2 exists to prevent.
 */
export async function buildAuditsPortfolio(input: {
  svc: any;
  now: string;
  contextId: string;
  filters?: Record<string, unknown>;
  sort?: string;
  direction?: 'asc' | 'desc';
  tab?: 'audits' | 'opportunities';
  limit?: number;
  cursor?: number;
}) {
  const reads: Record<string, any> = {};
  const auditRead = await readRuntimeSource<any[]>({
    source: 'AnalyzerResult',
    read: () => input.svc.entities.AnalyzerResult.list('-created_date', READ_LIMIT),
    fallback: [], limit: READ_LIMIT,
  });
  reads.AnalyzerResult = auditRead;
  const opportunityRead = await readRuntimeSource<any[]>({
    source: 'MerchantOpportunity',
    read: () => input.svc.entities.MerchantOpportunity.list('-generated_at', READ_LIMIT),
    fallback: [], limit: READ_LIMIT,
  });
  reads.MerchantOpportunity = opportunityRead;

  const audits = auditRead.status === 'UNAVAILABLE' ? [] : (auditRead.value || []).map(projectAudit);
  const opportunities = opportunityRead.status === 'UNAVAILABLE' ? [] : (opportunityRead.value || []).map(projectOpportunity);

  const { context, source_health } = buildContext({
    workspace: 'audits',
    filters: input.filters || {},
    sort: input.sort || null,
    view: input.tab || 'audits',
    now: input.now, contextId: input.contextId, reads,
  });

  const tab = input.tab === 'opportunities' ? 'opportunities' : 'audits';
  const filteredAudits = filterAudits(audits, input.filters || {});
  const filteredOpportunities = filterOpportunities(opportunities, input.filters || {});
  const rows = tab === 'opportunities'
    ? sortKeepingUnknownLast(filteredOpportunities, (row) => row.expected_recoverable_savings_minor, input.direction || 'desc')
    : sortKeepingUnknownLast(filteredAudits, (row) => row.total_savings_minor, input.direction || 'desc');

  const offset = Math.max(0, Number(input.cursor || 0));
  const limit = Math.max(1, Math.min(500, Number(input.limit || 100)));

  return portfolioResponse({
    context,
    source_health,
    kpis: buildAuditsKpis(audits, opportunities, source_health),
    quick_views: [
      { key: 'all', label: 'All', count: rows.length },
      { key: 'needs_evidence', label: 'Needs evidence', count: opportunities.filter((row) => row.recover_blockers.includes('evidence_incomplete') || row.recover_blockers.includes('evidence_completeness_unknown')).length },
      { key: 'ready_for_recover', label: 'Ready for Recover', count: opportunities.filter((row) => row.recover_eligible).length },
      { key: 'mislabelled', label: 'Claims verified but cannot be', count: audits.filter((row) => row.attention_reasons.includes('claims_verified_but_type_cannot_be_verified')).length },
      { key: 'window_absent', label: 'No measurement window', count: audits.filter((row) => row.window_provenance === 'ABSENT').length },
    ],
    filter_options: {
      tab: ['audits', 'opportunities'],
      audit_type: [...AUDIT_TYPES],
      opportunity_status: [...OPPORTUNITY_STATUSES],
      market: [...new Set(opportunities.map((row) => row.market).filter(Boolean))].sort(),
    },
    rows: rows.slice(offset, offset + limit),
    total: context.data_complete ? rows.length : null,
    next_cursor: offset + limit < rows.length ? String(offset + limit) : null,
    permissions: { read: true, prepare: true, operate: true },
    available_actions: ['preview_recover_handoff'],
  });
}

export function filterAudits(rows: AuditRow[], filters: Record<string, unknown>): AuditRow[] {
  let out = [...rows];
  if (text(filters?.audit_type)) out = out.filter((row) => row.audit_type === text(filters.audit_type));
  if (filters?.needs_attention === true) out = out.filter((row) => row.attention_reasons.length > 0);
  if (filters?.mislabelled === true) {
    out = out.filter((row) => row.attention_reasons.includes('claims_verified_but_type_cannot_be_verified'));
  }
  if (filters?.window_absent === true) out = out.filter((row) => row.window_provenance === 'ABSENT');
  return out;
}

export function filterOpportunities(rows: OpportunityRow[], filters: Record<string, unknown>): OpportunityRow[] {
  let out = [...rows];
  if (text(filters?.opportunity_status)) out = out.filter((row) => row.status === text(filters.opportunity_status).toUpperCase());
  if (text(filters?.market)) out = out.filter((row) => row.market === text(filters.market));
  if (filters?.ready_for_recover === true) out = out.filter((row) => row.recover_eligible);
  if (filters?.needs_evidence === true) {
    out = out.filter((row) =>
      row.recover_blockers.includes('evidence_incomplete')
      || row.recover_blockers.includes('evidence_completeness_unknown'));
  }
  return out;
}

/**
 * KPIs. The four savings figures are reported as four KPIs, never as one.
 *
 * There is deliberately NO verified-savings KPI and NO billable-savings KPI here.
 * Those belong to Recover and Finance, and a test asserts their absence.
 */
export function buildAuditsKpis(audits: AuditRow[], opportunities: OpportunityRow[], health: SourceHealthRow[]) {
  const sum = (rows: OpportunityRow[], field: keyof OpportunityRow) =>
    rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const withField = (field: keyof OpportunityRow) =>
    opportunities.filter((row) => row[field] !== null);

  const bound = (field: keyof OpportunityRow, label: string) => {
    const present = withField(field);
    return kpi({
      metric_key: String(field), label,
      value: sum(present, field), unit: 'EUR_minor',
      truth_class: present.length === opportunities.length ? 'DERIVED' : 'MODELED',
      sources: ['MerchantOpportunity'], health,
      extra: {
        numerator: present.length, denominator: opportunities.length,
        claim_boundary: present.length === opportunities.length
          ? 'Every opportunity records this figure.'
          : `${opportunities.length - present.length} of ${opportunities.length} opportunities do not record this figure and are excluded. Lower bound.`,
      },
    });
  };

  return [
    kpi({ metric_key: 'audits', label: 'Audits', value: audits.length, unit: 'count', truth_class: 'OBSERVED', sources: ['AnalyzerResult'], health }),
    kpi({
      metric_key: 'audits_modeled_only', label: 'Estimates (not verified)',
      value: audits.filter((row) => row.truth_class === 'MODELED').length, unit: 'count',
      truth_class: 'OBSERVED', sources: ['AnalyzerResult'], health,
      extra: { claim_boundary: 'Anonymous estimates and manual reviews can never carry a verified truth class, whatever the row claims.' },
    }),
    kpi({
      metric_key: 'audits_mislabelled', label: 'Mislabelled as verified',
      value: audits.filter((row) => row.attention_reasons.includes('claims_verified_but_type_cannot_be_verified')).length,
      unit: 'count', truth_class: 'OBSERVED', sources: ['AnalyzerResult'], health,
      extra: { claim_boundary: 'These rows say verified but their audit type cannot be verified. Something upstream mislabelled them.' },
    }),
    kpi({ metric_key: 'opportunities', label: 'Opportunities', value: opportunities.length, unit: 'count', truth_class: 'OBSERVED', sources: ['MerchantOpportunity'], health }),
    kpi({
      metric_key: 'ready_for_recover', label: 'Ready for Recover',
      value: opportunities.filter((row) => row.recover_eligible).length, unit: 'count',
      truth_class: 'DERIVED', sources: ['MerchantOpportunity'], health,
      extra: { claim_boundary: 'Every handoff condition met. An opportunity with no evidence completeness recorded is not eligible.' },
    }),
    bound('gross_theoretical_savings_minor', 'Gross theoretical savings'),
    bound('actionable_savings_minor', 'Actionable savings'),
    bound('expected_recoverable_savings_minor', 'Expected recoverable savings'),
  ];
}

/**
 * Previews a Recover handoff. Changes nothing, and refuses when ineligible.
 *
 * This is the only action C4 exposes, because everything else in this workspace is
 * a read. Approving an opportunity for Recover is a review decision that belongs
 * with the evidence review surface in C5.
 */
export async function previewRecoverHandoff(input: {
  svc: any;
  opportunity_id: string;
  now: string;
}) {
  const read = await readRuntimeSource<any>({
    source: 'audits_opportunity',
    read: () => input.svc.entities.MerchantOpportunity.get(input.opportunity_id),
    fallback: null,
  });
  if (read.status === 'UNAVAILABLE') return { ok: false as const, error: 'opportunity_unreadable' };
  if (!read.value) return { ok: false as const, error: 'opportunity_not_found' };

  const projected = projectOpportunity(read.value);
  return {
    ok: true as const,
    preview: {
      opportunity_id: projected.canonical_id,
      opportunity_key: projected.opportunity_key,
      status: projected.status,
      eligible: projected.recover_eligible,
      blockers: projected.recover_blockers,
      expected_recoverable_savings_minor: projected.expected_recoverable_savings_minor,
      // Stated so nobody reads the handoff as a savings commitment.
      claim_boundary: projected.claim_boundary,
      creates_recover_case: false,
      note: 'Preview only. Opening a Recover case is a separate governed action, and expected recoverable savings are not verified savings.',
      external_send_performed: false,
    },
  };
}
