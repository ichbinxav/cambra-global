// DASHBOARD-C6 (2026-08-17) — Recover root, state machine and the open-case path.
//
// C0 established, and an adversarial pass confirmed, that DealActivation IS the
// canonical root for the merchant-scoped Recover lifecycle. It is unusually well
// guarded already: its direct mutator returns HTTP 410, guardDealActivationStatus
// reverts an authorization taken without a mandate, and every real move uses CAS.
//
// So this chunk creates NO entity. RecoverCase, RecoverAggregate and
// RecoverStageEvent are explicitly forbidden and the gate enforces that.
//
// What C0 found genuinely missing is a PRODUCTION CREATOR: DealActivation.create
// appears only in seedDemoData and runFlowSelfTests. Nothing in production opens a
// case. That is the new work here, and it is a create path, not a new authority.
//
// The rules that shape it:
//
//  1. Opening a case requires an opportunity that is APPROVED_FOR_RECOVER and
//     independently eligible. C5's decision path and this path both consult the
//     same recoverEligibility, so a bad row cannot pass one and fail the other.
//  2. Opening is IDEMPOTENT on the opportunity. A second attempt returns the
//     existing case rather than a second root, because two roots for one
//     opportunity is exactly the "second source of truth" C0 forbade.
//  3. Every projected figure is separated: expected recoverable is not verified,
//     and verified is not billable. This module computes NEITHER verified nor
//     billable savings — those are the verification and Finance authorities.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { nullableMinor } from './nullableNumber.ts';
import { recoverEligibility } from './auditsCore.ts';
import {
  buildContext, kpi, portfolioResponse, sortKeepingUnknownLast,
  type SourceHealthRow,
} from './workspaceContract.ts';

export const RECOVER_CORE_VERSION = 'recover-core-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();
const READ_LIMIT = 2000;

/** The canonical root. Never a new entity. */
export const RECOVER_ROOT_ENTITY = 'DealActivation';
export const FORBIDDEN_ROOTS = Object.freeze(['RecoverCase', 'RecoverAggregate', 'RecoverStageEvent']);

/**
 * Canonical Recover phases (section 10.4), projected from DealActivation.status.
 *
 * The mapping is conservative in the same way the pipeline registry is: a status
 * that does not prove a later phase maps to the earlier one.
 */
export const RECOVER_PHASES = Object.freeze([
  'DRAFT', 'ELIGIBILITY_REVIEW', 'AWAITING_MANDATE', 'MANDATE_ACTIVE',
  'NEGOTIATION_ACTIVE', 'AWAITING_MERCHANT_DECISION', 'CONTRACT_REVIEW',
  'MIGRATION_ACTIVE', 'LIVE', 'VERIFICATION_WINDOW', 'VERIFIED',
  'BILLING_ELIGIBLE', 'COMPLETED', 'BLOCKED', 'REVIEW_REQUIRED', 'CANCELLED',
] as const);
export type RecoverPhase = typeof RECOVER_PHASES[number];

/** DealActivation.status → canonical phase. */
const STATUS_TO_PHASE: Readonly<Record<string, RecoverPhase>> = Object.freeze({
  detected: 'DRAFT',
  proposed: 'ELIGIBILITY_REVIEW',
  awaiting_authorization: 'AWAITING_MANDATE',
  authorized: 'MANDATE_ACTIVE',
  activated: 'MANDATE_ACTIVE',
  migrating: 'MIGRATION_ACTIVE',
  live: 'LIVE',
  monetizing: 'BILLING_ELIGIBLE',
  paused: 'BLOCKED',
  revoked: 'BLOCKED',
  closed: 'COMPLETED',
});

/** Phases that are settled. A settled case must not be reopened silently. */
export const TERMINAL_PHASES = Object.freeze(['COMPLETED', 'CANCELLED'] as const);

export function phaseFor(status: unknown): RecoverPhase | null {
  return STATUS_TO_PHASE[text(status).toLowerCase()] ?? null;
}

export type RecoverCaseRow = {
  canonical_id: string;
  entity_type: string;
  brand_id: string | null;
  phase: RecoverPhase | null;
  raw_status: string;
  source_opportunity: string | null;
  provider_from: string | null;
  provider_to: string | null;
  // Kept SEPARATE on purpose. Section 10.21: Recover produces billing ELIGIBILITY,
  // never an invoice, and expected is never verified.
  expected_recoverable_savings_minor: number | null;
  verified_savings_minor: number | null;
  mandate_id: string | null;
  mandate_present: boolean;
  payment_method_status: string | null;
  verification_access_status: string | null;
  billing_eligible: boolean;
  billing_block_reasons: string[];
  attention_reasons: string[];
  claim_boundary: string;
};

/**
 * Billing eligibility as Recover may state it (section 10.21).
 *
 * Recover does not invoice. It reports eligibility and the reasons against it, and
 * Finance keeps invoice authority. Every condition must hold; the default is
 * ineligible, because a case with no verified figure has not proven anything to
 * bill for.
 */
export function billingEligibility(row: any): { eligible: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const phase = phaseFor(row?.status);
  if (phase !== 'BILLING_ELIGIBLE' && phase !== 'COMPLETED') {
    blockers.push(`phase_not_billing_eligible:${phase || 'UNKNOWN'}`);
  }
  if (!text(row?.active_mandate_id) && !text(row?.recovery_mandate_id)) blockers.push('no_active_mandate');
  if (nullableMinor(row?.realized_savings_yearly) === null) blockers.push('verified_savings_unknown');
  if (text(row?.verification_access_status).toLowerCase() === 'revoked') blockers.push('verification_access_revoked');
  if (text(row?.payment_method_status).toLowerCase() !== 'ready') blockers.push('payment_method_not_ready');
  if (text(row?.economic_right_status).toLowerCase() === 'cancelled') blockers.push('economic_right_cancelled');
  return { eligible: blockers.length === 0, blockers };
}

function caseClaimBoundary(row: any): string {
  const verified = nullableMinor(row?.realized_savings_yearly);
  const expected = nullableMinor(row?.projected_savings_annual);
  if (verified === null && expected !== null) {
    return 'Only a projected figure exists. Nothing has been verified, so this case has no billable savings.';
  }
  if (verified !== null && expected !== null && verified < expected) {
    return 'Verified savings are below the projection. The projection is not evidence and the verified figure governs.';
  }
  return 'Projected and verified figures are recorded separately. Billing eligibility is reported here; invoices are Finance\'s authority.';
}

export function projectRecoverCase(row: any): RecoverCaseRow {
  const eligibility = billingEligibility(row);
  const phase = phaseFor(row?.status);
  const attention: string[] = [];
  if (!phase) attention.push('phase_unmappable');
  if (!text(row?.active_mandate_id) && !text(row?.recovery_mandate_id) && phase !== 'DRAFT') {
    attention.push('no_mandate');
  }
  if (text(row?.verification_access_status).toLowerCase() === 'revoked') attention.push('verification_access_revoked');
  if (phase === 'BLOCKED') attention.push('case_blocked');
  if (nullableMinor(row?.realized_savings_yearly) === null && (phase === 'LIVE' || phase === 'BILLING_ELIGIBLE')) {
    attention.push('live_but_unverified');
  }

  return {
    canonical_id: text(row?.id),
    entity_type: RECOVER_ROOT_ENTITY,
    brand_id: text(row?.brand_id) || null,
    phase,
    raw_status: text(row?.status),
    source_opportunity: text(row?.recovery_attribution_key) || null,
    provider_from: text(row?.provider_from) || null,
    provider_to: text(row?.provider_to) || null,
    expected_recoverable_savings_minor: nullableMinor(row?.projected_savings_annual) !== null
      ? Math.round(Number(row.projected_savings_annual) * 100) : null,
    verified_savings_minor: nullableMinor(row?.realized_savings_yearly) !== null
      ? Math.round(Number(row.realized_savings_yearly) * 100) : null,
    mandate_id: text(row?.active_mandate_id) || text(row?.recovery_mandate_id) || null,
    mandate_present: Boolean(text(row?.active_mandate_id) || text(row?.recovery_mandate_id)),
    payment_method_status: text(row?.payment_method_status) || null,
    verification_access_status: text(row?.verification_access_status) || null,
    billing_eligible: eligibility.eligible,
    billing_block_reasons: eligibility.blockers,
    attention_reasons: attention,
    claim_boundary: caseClaimBoundary(row),
  };
}

/**
 * Previews opening a Recover case from an approved opportunity.
 *
 * Refuses when the opportunity is not eligible, and refuses when a case already
 * exists for it — returning the existing one rather than offering to create a
 * second root.
 */
export async function previewOpenCase(input: {
  svc: any;
  opportunity_id: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const opportunityRead = await readRuntimeSource<any>({
    source: 'recover_open_opportunity',
    read: () => input.svc.entities.MerchantOpportunity.get(input.opportunity_id),
    fallback: null,
  });
  if (opportunityRead.status === 'UNAVAILABLE') return { ok: false as const, error: 'opportunity_unreadable' };
  if (!opportunityRead.value) return { ok: false as const, error: 'opportunity_not_found' };
  const opportunity = opportunityRead.value;

  // Same rules C5's decision path uses, so one cannot pass while the other fails.
  const eligibility = recoverEligibility(opportunity);

  // Idempotency: a case already attributed to this opportunity means the work is
  // done, not that a second root should exist.
  const existingRead = await readRuntimeSource<any[]>({
    source: 'recover_existing_case',
    read: () => input.svc.entities.DealActivation.filter(
      { recovery_attribution_key: text(opportunity.opportunity_key) }, '-activated_at', 5,
    ),
    fallback: [],
  });
  if (existingRead.status === 'UNAVAILABLE') return { ok: false as const, error: 'existing_case_unreadable' };
  const existing = (existingRead.value || [])[0] || null;

  const blockers = [...eligibility.blockers];
  if (existing) blockers.push('recover_case_already_exists');
  if (!text(opportunity.merchant_context_reference)) blockers.push('brand_unresolved');

  const preview = {
    opportunity_id: text(input.opportunity_id),
    opportunity_key: text(opportunity.opportunity_key),
    brand_id: text(opportunity.merchant_context_reference) || null,
    root_entity: RECOVER_ROOT_ENTITY,
    opens_phase: 'ELIGIBILITY_REVIEW' as RecoverPhase,
    existing_case_id: existing ? text(existing.id) : null,
    expected_recoverable_savings_minor: nullableMinor(opportunity.expected_recoverable_savings_minor),
    allowed: blockers.length === 0,
    blockers,
    // Stated so nobody reads a case opening as money.
    claim_boundary: 'Opening a case records intent to pursue a projected saving. It verifies nothing, bills nothing and sends nothing.',
    creates_mandate: false,
    external_send_performed: false,
  };
  return { ok: true as const, preview, preview_hash: await input.sha256(preview) };
}

/**
 * Opens the case. This is the production creator DealActivation never had.
 *
 * The row is created in the WEAKEST phase (`proposed` → ELIGIBILITY_REVIEW) with no
 * mandate, no payment method and no savings figure. Creating it already authorized
 * would assert authority nobody granted.
 */
export async function openRecoverCase(input: {
  svc: any;
  actor: string;
  opportunity_id: string;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewOpenCase(input);
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return { ok: false as const, error: 'preview_hash_mismatch', preview: previewed.preview };
  }
  if (!previewed.preview.allowed) {
    // An existing case is not an error the caller should retry past.
    if (previewed.preview.existing_case_id) {
      return {
        ok: true as const,
        created: false,
        idempotent: true,
        case_id: previewed.preview.existing_case_id,
        note: 'A Recover case already exists for this opportunity. Returning it rather than creating a second root.',
        external_send_performed: false,
      };
    }
    return { ok: false as const, error: 'open_case_not_allowed', blockers: previewed.preview.blockers };
  }

  let created: any = null;
  try {
    created = await input.svc.entities.DealActivation.create({
      brand_id: previewed.preview.brand_id,
      vertical: 'payments',
      node_share_percent: 0,
      billing_model: 'recover_share',
      // The weakest phase. No mandate, no payment method, no savings figure.
      status: 'proposed',
      recovery_attribution_key: previewed.preview.opportunity_key,
      activated_at: input.now,
      last_updated: input.now,
    });
  } catch (error) {
    return { ok: false as const, error: 'case_creation_failed', detail: text((error as any)?.message) };
  }

  // Move the opportunity to IN_RECOVER with CAS so the handoff cannot happen twice.
  let handedOff = false;
  try {
    const result = await input.svc.entities.MerchantOpportunity.updateMany(
      { id: input.opportunity_id, status: 'APPROVED_FOR_RECOVER' },
      { status: 'IN_RECOVER', updated_at: input.now },
    );
    handedOff = Number(result?.matched_count ?? result?.modified_count ?? result?.count ?? 0) === 1;
  } catch { handedOff = false; }

  return {
    ok: true as const,
    created: true,
    idempotent: false,
    case_id: text(created?.id),
    phase: 'ELIGIBILITY_REVIEW' as RecoverPhase,
    opportunity_handed_off: handedOff,
    // The case exists; if the opportunity did not move it is now reachable from
    // both states, which is a review item rather than a reason to delete the case.
    ambiguity_state: handedOff ? null : 'REVIEW_REQUIRED',
    mandate_present: false,
    billing_eligible: false,
    external_send_performed: false,
  };
}

/** Builds the Recover portfolio. */
export async function buildRecoverPortfolio(input: {
  svc: any;
  now: string;
  contextId: string;
  filters?: Record<string, unknown>;
  direction?: 'asc' | 'desc';
  limit?: number;
  cursor?: number;
}) {
  const read = await readRuntimeSource<any[]>({
    source: RECOVER_ROOT_ENTITY,
    read: () => input.svc.entities.DealActivation.list('-last_updated', READ_LIMIT),
    fallback: [], limit: READ_LIMIT,
  });
  const reads = { [RECOVER_ROOT_ENTITY]: read };
  const cases = read.status === 'UNAVAILABLE' ? [] : (read.value || []).map(projectRecoverCase);

  const { context, source_health } = buildContext({
    workspace: 'recover', filters: input.filters || {},
    now: input.now, contextId: input.contextId, reads,
  });

  let rows = cases;
  const filters = input.filters || {};
  if (text(filters.phase)) rows = rows.filter((row) => row.phase === text(filters.phase));
  if (filters.needs_attention === true) rows = rows.filter((row) => row.attention_reasons.length > 0);
  if (filters.billing_eligible === true) rows = rows.filter((row) => row.billing_eligible);
  if (filters.no_mandate === true) rows = rows.filter((row) => !row.mandate_present);
  if (filters.live_unverified === true) rows = rows.filter((row) => row.attention_reasons.includes('live_but_unverified'));

  const sorted = sortKeepingUnknownLast(rows, (row) => row.expected_recoverable_savings_minor, input.direction || 'desc');
  const offset = Math.max(0, Number(input.cursor || 0));
  const limit = Math.max(1, Math.min(500, Number(input.limit || 100)));

  return portfolioResponse({
    context, source_health,
    kpis: buildRecoverKpis(cases, source_health),
    quick_views: [
      { key: 'all', label: 'All', count: cases.length },
      { key: 'needs_attention', label: 'Needs attention', count: cases.filter((r) => r.attention_reasons.length).length },
      { key: 'no_mandate', label: 'No mandate', count: cases.filter((r) => !r.mandate_present).length },
      { key: 'live_unverified', label: 'Live, not verified', count: cases.filter((r) => r.attention_reasons.includes('live_but_unverified')).length },
      { key: 'billing_eligible', label: 'Billing eligible', count: cases.filter((r) => r.billing_eligible).length },
    ],
    filter_options: { phase: [...RECOVER_PHASES] },
    rows: sorted.slice(offset, offset + limit),
    total: context.data_complete ? sorted.length : null,
    next_cursor: offset + limit < sorted.length ? String(offset + limit) : null,
    permissions: { read: true, prepare: true, operate: true },
    available_actions: ['preview_open_case', 'open_case'],
  });
}

export function buildRecoverKpis(cases: RecoverCaseRow[], health: SourceHealthRow[]) {
  const source = [RECOVER_ROOT_ENTITY];
  const expected = cases.filter((row) => row.expected_recoverable_savings_minor !== null);
  const verified = cases.filter((row) => row.verified_savings_minor !== null);

  return [
    kpi({ metric_key: 'open_cases', label: 'Open cases', value: cases.filter((r) => r.phase && !(TERMINAL_PHASES as readonly string[]).includes(r.phase)).length, unit: 'count', truth_class: 'OBSERVED', sources: source, health }),
    kpi({ metric_key: 'no_mandate', label: 'Awaiting mandate', value: cases.filter((r) => !r.mandate_present).length, unit: 'count', truth_class: 'OBSERVED', sources: source, health }),
    kpi({
      metric_key: 'live_unverified', label: 'Live, not verified',
      value: cases.filter((r) => r.attention_reasons.includes('live_but_unverified')).length, unit: 'count',
      truth_class: 'DERIVED', sources: source, health,
      extra: { claim_boundary: 'These cases are live but carry no verified figure. Nothing about them is billable yet.' },
    }),
    kpi({
      metric_key: 'expected_recoverable_savings_minor', label: 'Expected recoverable',
      value: expected.reduce((sum, r) => sum + (r.expected_recoverable_savings_minor || 0), 0), unit: 'EUR_minor',
      truth_class: 'MODELED', sources: source, health,
      extra: {
        numerator: expected.length, denominator: cases.length,
        claim_boundary: 'A projection. Not verified and not billable.',
      },
    }),
    kpi({
      metric_key: 'verified_savings_minor', label: 'Verified savings',
      value: verified.reduce((sum, r) => sum + (r.verified_savings_minor || 0), 0), unit: 'EUR_minor',
      // VERIFIED only where a verified figure exists; the count says how many.
      truth_class: verified.length ? 'VERIFIED' : 'UNKNOWN',
      sources: source, health,
      extra: {
        numerator: verified.length, denominator: cases.length,
        claim_boundary: verified.length === cases.length
          ? 'Every case carries a verified figure.'
          : `${cases.length - verified.length} of ${cases.length} cases have no verified figure and contribute nothing. Billing eligibility is reported per case; invoices remain Finance's authority.`,
      },
    }),
    kpi({
      metric_key: 'billing_eligible', label: 'Billing eligible',
      value: cases.filter((r) => r.billing_eligible).length, unit: 'count',
      truth_class: 'DERIVED', sources: source, health,
      extra: { claim_boundary: 'Eligibility only. Recover does not invoice.' },
    }),
  ];
}
