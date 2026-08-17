// DASHBOARD-C5 (2026-08-17) — evidence review and opportunity decisions.
//
// C4 built the read side and exposed only a preview. This is the write side: the
// governed decisions that move an opportunity, and the review cases that record
// why. It reuses ReviewCase and EvidenceAssertion rather than inventing a
// decision entity, because C0 established both already exist.
//
// Two rules shape everything here:
//
//  1. A decision is hash-bound. `previewDecision` returns the exact state it saw
//     and a hash; `applyDecision` refuses if the row moved. A reviewer cannot
//     approve one opportunity and have a different one change.
//  2. Approving for Recover requires evidence, and the absence of an evidence
//     reading is never treated as sufficient. That is checked here AND again by
//     C4's recoverEligibility on the read side, so a bad row cannot slip through
//     one path.
//
// Nothing here sends anything, and nothing here computes verified or billable
// savings.

import { readRuntimeSource } from './runtimeSourceRead.ts';
import { RECOVER_ELIGIBLE_STATUSES, recoverEligibility } from './auditsCore.ts';

export const EVIDENCE_REVIEW_VERSION = 'evidence-review-1.0.0';

const text = (value: unknown) => String(value ?? '').trim();

/** Decisions a reviewer may take on an opportunity (section 9.18). */
export const OPPORTUNITY_DECISIONS = Object.freeze([
  'QUALIFY', 'REJECT', 'DEFER', 'APPROVE_FOR_RECOVER', 'REQUEST_INFORMATION', 'SUPERSEDE',
] as const);
export type OpportunityDecision = typeof OPPORTUNITY_DECISIONS[number];

/** Decisions that require a reason. Refusing without one teaches nothing. */
export const DECISIONS_REQUIRING_REASON: readonly OpportunityDecision[] = Object.freeze([
  'REJECT', 'DEFER', 'REQUEST_INFORMATION', 'SUPERSEDE',
]);

/** Where each decision moves the opportunity status. */
export const DECISION_TARGET: Readonly<Record<OpportunityDecision, string>> = Object.freeze({
  QUALIFY: 'QUALIFIED',
  REJECT: 'REJECTED',
  DEFER: 'DEFERRED',
  APPROVE_FOR_RECOVER: 'APPROVED_FOR_RECOVER',
  REQUEST_INFORMATION: 'EVIDENCE_INCOMPLETE',
  SUPERSEDE: 'SUPERSEDED',
});

/** Statuses from which a decision may still be taken. */
const DECIDABLE_FROM = Object.freeze([
  'CANDIDATE', 'EVIDENCE_INCOMPLETE', 'REVIEW_REQUIRED', 'QUALIFIED', 'DEFERRED',
]);

/** Statuses that are settled and must not be re-decided silently. */
export const TERMINAL_OPPORTUNITY_STATUSES = Object.freeze([
  'REJECTED', 'SUPERSEDED', 'EXPIRED', 'IN_RECOVER', 'REALIZED', 'NOT_REALIZED',
]);

export type DecisionCheck = { allowed: boolean; blockers: string[]; target_status: string | null };

/**
 * Validates a decision against the opportunity's current state.
 *
 * APPROVE_FOR_RECOVER is the one that carries real consequence, so it is checked
 * against the same eligibility rules C4 applies on the read side rather than
 * against a looser local copy.
 */
export function checkDecision(input: {
  decision: unknown;
  opportunity: any;
  reason_code?: string | null;
}): DecisionCheck {
  const blockers: string[] = [];
  const decision = text(input.decision).toUpperCase() as OpportunityDecision;
  if (!(OPPORTUNITY_DECISIONS as readonly string[]).includes(decision)) {
    return { allowed: false, blockers: ['unknown_decision'], target_status: null };
  }

  const current = text(input.opportunity?.status).toUpperCase();
  if (!current) blockers.push('opportunity_status_unreadable');
  else if ((TERMINAL_OPPORTUNITY_STATUSES as readonly string[]).includes(current)) {
    blockers.push(`opportunity_already_settled:${current}`);
  } else if (!DECIDABLE_FROM.includes(current)) {
    blockers.push(`status_not_decidable:${current}`);
  }

  if (DECISIONS_REQUIRING_REASON.includes(decision) && !text(input.reason_code)) {
    blockers.push('reason_code_required');
  }

  if (decision === 'APPROVE_FOR_RECOVER') {
    // Approving is the consequential one. Reuse the read-side rules so a bad row
    // cannot pass one path and fail the other.
    const eligibility = recoverEligibility({
      ...input.opportunity,
      // The status is about to become approved, so evaluate the OTHER conditions
      // as they would stand after the move.
      status: RECOVER_ELIGIBLE_STATUSES[0],
    });
    for (const blocker of eligibility.blockers) blockers.push(`recover_${blocker}`);
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    target_status: DECISION_TARGET[decision] ?? null,
  };
}

/**
 * Previews a decision. Reads the opportunity, validates, and returns a hash of
 * exactly what it saw.
 */
export async function previewDecision(input: {
  svc: any;
  opportunity_id: string;
  decision: string;
  reason_code?: string | null;
  sha256: (value: unknown) => Promise<string>;
}) {
  const read = await readRuntimeSource<any>({
    source: 'evidence_review_opportunity',
    read: () => input.svc.entities.MerchantOpportunity.get(input.opportunity_id),
    fallback: null,
  });
  if (read.status === 'UNAVAILABLE') return { ok: false as const, error: 'opportunity_unreadable' };
  if (!read.value) return { ok: false as const, error: 'opportunity_not_found' };

  const check = checkDecision({
    decision: input.decision, opportunity: read.value, reason_code: input.reason_code,
  });

  const preview = {
    opportunity_id: text(input.opportunity_id),
    opportunity_key: text(read.value.opportunity_key),
    decision: text(input.decision).toUpperCase(),
    from_status: text(read.value.status).toUpperCase(),
    to_status: check.target_status,
    reason_code: text(input.reason_code) || null,
    allowed: check.allowed,
    blockers: check.blockers,
    // Named so a reviewer sees the figures the decision is being taken against,
    // and can tell that none of them is verified savings.
    expected_recoverable_savings_minor: read.value.expected_recoverable_savings_minor ?? null,
    evidence_completeness: text(read.value.evidence_completeness) || null,
    evidence_reference_count: (Array.isArray(read.value.evidence_references) ? read.value.evidence_references : []).length,
    opens_review_case: DECISIONS_REQUIRING_REASON.includes(text(input.decision).toUpperCase() as OpportunityDecision),
    // ReviewCase requires a brand_id. MerchantOpportunity carries
    // merchant_context_reference, not brand_id, so it is resolved here and its
    // absence is surfaced rather than filled with the wrong identifier.
    review_case_brand_id: text(read.value.merchant_context_reference) || null,
    creates_recover_case: false,
    claim_boundary: 'Expected recoverable savings are a modelled figure. Approving for Recover does not verify them and does not create a Recover case.',
    external_send_performed: false,
  };
  return { ok: true as const, preview, preview_hash: await input.sha256(preview) };
}

/**
 * Applies a decision.
 *
 * Order: CAS the opportunity status first, then open the ReviewCase. A review case
 * written before the move would record a decision that may not have taken effect;
 * one that fails after a successful move leaves a real decision with missing
 * paperwork, which is reported rather than swallowed.
 */
export async function applyDecision(input: {
  svc: any;
  reviewer: string;
  opportunity_id: string;
  decision: string;
  reason_code?: string | null;
  decision_notes?: string | null;
  expected_preview_hash: string;
  now: string;
  sha256: (value: unknown) => Promise<string>;
}) {
  const previewed = await previewDecision(input);
  if (!previewed.ok) return previewed;
  if (previewed.preview_hash !== text(input.expected_preview_hash)) {
    return { ok: false as const, error: 'preview_hash_mismatch', preview: previewed.preview };
  }
  if (!previewed.preview.allowed) {
    return { ok: false as const, error: 'decision_not_allowed', blockers: previewed.preview.blockers };
  }

  let changed = 0;
  try {
    const result = await input.svc.entities.MerchantOpportunity.updateMany(
      { id: input.opportunity_id, status: previewed.preview.from_status },
      { status: previewed.preview.to_status, updated_at: input.now },
    );
    changed = Number(result?.matched_count ?? result?.modified_count ?? result?.count ?? 0);
  } catch (error) {
    return { ok: false as const, error: 'opportunity_update_failed', detail: text((error as any)?.message) };
  }
  if (changed !== 1) return { ok: false as const, error: 'opportunity_revision_conflict' };

  let reviewCaseRecorded = true;
  let reviewCaseId: string | null = null;
  if (previewed.preview.opens_review_case && !previewed.preview.review_case_brand_id) {
    // The decision took effect; the paperwork cannot. Reporting that is honest.
    // Writing the opportunity key into brand_id to satisfy the schema would put a
    // wrong identifier into the review ledger.
    reviewCaseRecorded = false;
    console.error(JSON.stringify({
      event: 'review_case_brand_unresolved', opportunity_id: input.opportunity_id,
      reason: 'merchant_context_reference_absent',
    }));
  } else if (previewed.preview.opens_review_case) {
    try {
      const created = await input.svc.entities.ReviewCase.create({
        brand_id: previewed.preview.review_case_brand_id,
        owner_email: text(input.reviewer),
        reason_code: text(input.reason_code) || 'reviewer_decision',
        // ECONOMIC when money is at stake, QUALITY otherwise. The two must never
        // be triaged the same way, which is why ReviewCase separates them.
        severity: previewed.preview.expected_recoverable_savings_minor !== null ? 'ECONOMIC' : 'QUALITY',
        status: 'OPEN',
        idempotency_key: `opportunity_decision:${input.opportunity_id}:${previewed.preview.decision}:${input.now}`,
        evidence_entity_type: 'MerchantOpportunity',
        evidence_id: text(input.opportunity_id),
        decision: previewed.preview.decision,
        decision_notes: text(input.decision_notes),
        resolved_by: text(input.reviewer),
        resolved_at: input.now,
      });
      reviewCaseId = text(created?.id) || null;
    } catch (error) {
      reviewCaseRecorded = false;
      console.error(JSON.stringify({
        event: 'review_case_unpersisted', opportunity_id: input.opportunity_id,
        error: text((error as any)?.message).slice(0, 160),
      }));
    }
  }

  return {
    ok: true as const,
    applied: true,
    from_status: previewed.preview.from_status,
    to_status: previewed.preview.to_status,
    review_case_id: reviewCaseId,
    review_case_recorded: reviewCaseRecorded,
    // Approving for Recover changes a status. It does not open a case, and it
    // does not verify a euro.
    creates_recover_case: false,
    external_send_performed: false,
  };
}

/**
 * Reads the evidence backing one opportunity.
 *
 * Returns what could be read and states what could not. An unreadable assertion
 * store means the evidence is unknown, not absent — and an opportunity whose
 * evidence cannot be read must not appear well-evidenced.
 */
export async function readEvidenceFor(input: { svc: any; opportunity: any }) {
  const references = Array.isArray(input.opportunity?.evidence_references)
    ? input.opportunity.evidence_references.map(text).filter(Boolean)
    : [];

  const assertionRead = await readRuntimeSource<any[]>({
    source: 'EvidenceAssertion',
    read: () => input.svc.entities.EvidenceAssertion.filter(
      { subject_id: text(input.opportunity?.id) }, '-extracted_at', 200,
    ),
    fallback: [],
  });

  const assertions = (assertionRead.value || []).map((row: any) => ({
    assertion_key: text(row.assertion_key),
    predicate: text(row.predicate),
    assertion_status: text(row.assertion_status),
    verification_status: text(row.verification_status),
    confidence: text(row.confidence),
    evidence_id: text(row.evidence_id),
  }));

  const contradicting = assertions.filter((row) => row.assertion_status === 'CONTRADICTS');

  return {
    declared_reference_count: references.length,
    readable: assertionRead.status !== 'UNAVAILABLE',
    assertions,
    contradicting_count: contradicting.length,
    // A contradiction is not resolved by taking the newer row. It is surfaced.
    conflicted: contradicting.length > 0,
    evidence_state: assertionRead.status === 'UNAVAILABLE'
      ? 'UNKNOWN'
      : (contradicting.length ? 'CONFLICTED' : (assertions.length ? 'PRESENT' : 'ABSENT')),
    claim_boundary: assertionRead.status === 'UNAVAILABLE'
      ? 'The assertion store could not be read. This opportunity\'s evidence is unknown, not absent.'
      : (contradicting.length
        ? 'At least one assertion contradicts another. The conflict is not resolved by preferring the newer row.'
        : 'Assertions read from the canonical store.'),
  };
}
