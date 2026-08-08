// ECL P5 — Economic Enforcement (v0.64.0)
//
// ONE server-side adapter between the pure ECL policy and economic/contractual
// boundaries. It never calculates money, never changes evidence, never writes a
// lifecycle state and never trusts a client-supplied confidence/status/role.
//
// Recover operations are scoped to the latest SavingsEvidence for the exact
// DealActivation. We deliberately DO NOT search backwards for an older, more
// favorable result: if the newest evidence is under review/rejected/expired or
// its canonical snapshot is damaged, the economic action fails closed.
import {
  countActiveStrikesByScope,
  evaluateGate,
  sha256Hex,
  stableSerialize,
} from './generated/eclDomain.ts';
import { ECL_POLICY } from './generated/eclPolicy.ts';

const OPEN_REVIEW_STATUSES = ['open', 'awaiting_merchant', 'resolving'];
const MAX_EVIDENCE_ROWS = 50;
const MAX_REVIEW_ROWS = 100;
const MAX_STRIKE_ROWS = 200;

export class EclEconomicGateError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = 'EclEconomicGateError';
    this.code = code;
    this.status = status;
  }
}

function nonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function deny(gateName: string, reasons: string[], extra: Record<string, unknown> = {}) {
  return Object.freeze({
    allowed: false,
    gateName,
    reasons: Object.freeze([...new Set(reasons)]),
    policyVersion: ECL_POLICY.policyVersion || null,
    ...extra,
  });
}

function blockingActions(reviewCase: any): string[] {
  const value = reviewCase?.blocking_actions?.actions;
  return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
}

function readCanonicalResult(evidence: any, gateName: string) {
  const snapshot = evidence?.confidence_result;
  const storedHash = evidence?.confidence_result_hash;
  if (!snapshot || typeof snapshot !== 'object' || !nonEmpty(storedHash)) {
    return { ok: false, result: null, denial: deny(gateName, ['canonical_ecl_snapshot_missing'], { evidenceId: evidence?.id || null }) };
  }

  const actualHash = sha256Hex(stableSerialize(snapshot));
  if (actualHash !== storedHash) {
    return { ok: false, result: null, denial: deny(gateName, ['canonical_ecl_snapshot_hash_mismatch'], { evidenceId: evidence?.id || null }) };
  }

  const result = snapshot.confidenceResult;
  if (!result || typeof result !== 'object') {
    return { ok: false, result: null, denial: deny(gateName, ['canonical_confidence_result_missing'], { evidenceId: evidence?.id || null }) };
  }

  // Materialized P4 projections are caches of the same canonical decision. A
  // mismatch is corruption/drift, never a reason to pick whichever is nicer.
  if (nonEmpty(evidence.evidence_status) && evidence.evidence_status !== result.evidenceStatus) {
    return { ok: false, result: null, denial: deny(gateName, ['ecl_status_projection_mismatch'], { evidenceId: evidence.id }) };
  }
  if (nonEmpty(evidence.confidence_level_ecl) && evidence.confidence_level_ecl !== result.confidenceLevel) {
    return { ok: false, result: null, denial: deny(gateName, ['ecl_confidence_projection_mismatch'], { evidenceId: evidence.id }) };
  }

  return { ok: true, result, denial: null };
}

/**
 * Authoritative P5 gate for one Recover DealActivation.
 *
 * Inputs MUST already be server-resolved records/ids. Persistence errors are
 * intentionally not caught: a read outage becomes a 500/503 at the boundary,
 * never an empty list that looks economically safe.
 */
export async function evaluateRecoverEconomicGate({
  svc,
  gateName,
  brandId,
  dealActivationId,
  baseline = null,
  now,
}: {
  svc: any;
  gateName: string;
  brandId: string;
  dealActivationId: string;
  baseline?: any;
  now: string;
}) {
  if (!svc) throw new EclEconomicGateError('ecl_gate_service_missing', 'service role is required', 500);
  if (!nonEmpty(gateName)) throw new EclEconomicGateError('ecl_gate_name_missing', 'gateName is required', 500);
  if (!nonEmpty(brandId)) throw new EclEconomicGateError('ecl_gate_brand_missing', 'brandId is required', 409);
  if (!nonEmpty(dealActivationId)) throw new EclEconomicGateError('ecl_gate_activation_missing', 'dealActivationId is required', 409);
  const nowMs = Date.parse(String(now));
  if (Number.isNaN(nowMs)) throw new EclEconomicGateError('ecl_gate_clock_invalid', 'now must be a parseable instant', 500);

  const evidenceRows = await svc.entities.SavingsEvidence.filter(
    { brand_id: brandId, deal_activation_id: dealActivationId },
    '-created_date',
    MAX_EVIDENCE_ROWS,
  );
  const evidence = (evidenceRows || [])[0] || null;
  if (!evidence) {
    return deny(gateName, ['no_ecl_savings_evidence'], { evidenceId: null, evidenceEntityType: 'savings_evidence' });
  }

  const canonical = readCanonicalResult(evidence, gateName);
  if (!canonical.ok) return canonical.denial;

  const [attestations, reviews, strikes] = await Promise.all([
    svc.entities.EvidenceAttestation.filter(
      { evidence_entity_type: 'savings_evidence', evidence_id: evidence.id },
      '-created_date',
      20,
    ),
    svc.entities.ReviewCase.filter(
      { brand_id: brandId, status: { $in: OPEN_REVIEW_STATUSES } },
      '-created_date',
      MAX_REVIEW_ROWS,
    ),
    svc.entities.EvidenceStrike.filter({ brand_id: brandId }, '-created_date', MAX_STRIKE_ROWS),
  ]);

  const relevantReviews = (reviews || []).filter((r) => {
    const actions = blockingActions(r);
    return !r?.evidence_id || r.evidence_id === evidence.id || actions.includes(gateName);
  });
  const actionBlockingReview = relevantReviews.find((r) => blockingActions(r).includes(gateName)) || null;
  const hasOpenConflicts =
    (Array.isArray(canonical.result.conflicts) && canonical.result.conflicts.length > 0) ||
    relevantReviews.some((r) => !r?.evidence_id || r.evidence_id === evidence.id);

  const context = {
    now,
    hasAttestation: (attestations || []).length > 0,
    hasOpenConflicts,
    baselineLocked: baseline?.locked === true,
    activeStrikeCountByScope: countActiveStrikesByScope(strikes || [], nowMs),
    hasBlockingReviewCase: actionBlockingReview !== null,
  };

  const decision = evaluateGate(gateName, canonical.result, ECL_POLICY, context);
  const reasons = [...decision.reasons];
  // P4 ReviewCase.blocking_actions is semantically stronger than a generic
  // gate policy flag: if a human-review intent names THIS action, P5 must obey
  // it even if the base gate does not independently require review absence.
  if (actionBlockingReview) reasons.push(`blocking_review_case_action:${gateName}`);

  return Object.freeze({
    allowed: decision.allowed === true && reasons.length === 0,
    gateName,
    reasons: Object.freeze([...new Set(reasons)]),
    policyVersion: decision.policyVersion,
    evidenceId: evidence.id,
    evidenceEntityType: 'savings_evidence',
    evidenceStatus: canonical.result.evidenceStatus,
    confidenceLevel: canonical.result.confidenceLevel,
    verificationMethod: canonical.result.verificationMethod,
    confidenceResultHash: evidence.confidence_result_hash,
    baselineId: baseline?.id || null,
  });
}

export function economicGateDeniedResponse(decision: any, status = 409) {
  return Response.json({
    ok: false,
    error: 'ecl_economic_gate_denied',
    gate: decision?.gateName || null,
    reasons: Array.isArray(decision?.reasons) ? decision.reasons : ['gate_unavailable'],
    evidence_id: decision?.evidenceId || null,
    policy_version: decision?.policyVersion || ECL_POLICY.policyVersion || null,
  }, { status });
}
