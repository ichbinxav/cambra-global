// eclReviewWorkflow — v0.63.0 ECL P4 closure (2026-08-08).
//
// Admin-only review queue. Resolution is race-safe through a short-lived
// `resolving` claim acquired with conditional updateMany. A stale claim can be
// recovered. Approve/dismiss re-enter the canonical P3 handler using the exact
// normalized evidence already persisted; reject uses the P3 transition graph.
// No review action can directly force `verified`.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  planReviewResolution,
  projectReviewCase,
  buildReviewResolutionEventIntent,
  resolveOperationalChecksum,
  operationalCorrelationId,
  restoreLifecycleFromSnapshot,
  buildLifecycleTransition,
  rewritePersistedLifecycleStatus,
} from '../../shared/generated/eclDomain.ts';
import { badRequest, createOnce } from '../../shared/eclPersistence.ts';

const ENTITY_BY_TYPE = { statement_import: 'StatementImport', savings_evidence: 'SavingsEvidence' };
const LIST_MAX = 100;
const LIST_DEFAULT = 25;
const RESOLUTION_CLAIM_TTL_MS = 10 * 60 * 1000;

function readEvidenceStatus(entityType, record) {
  if (!record) return null;
  const restored = restoreLifecycleFromSnapshot(
    record.confidence_result && typeof record.confidence_result === 'object' ? record.confidence_result : null,
  );
  return record.evidence_status || (restored && restored.status) || 'pending';
}

function updatedExactlyOne(result) {
  return Boolean(result && (result.updated === 1 || result.modified_count === 1 || result.matched_count === 1));
}

async function recoverStaleResolutionClaim(svc, rc, nowMs) {
  if (!rc || rc.status !== 'resolving') return rc;
  const claimedMs = Date.parse(String(rc.resolution_claimed_at || ''));
  if (Number.isNaN(claimedMs) || nowMs - claimedMs < RESOLUTION_CLAIM_TTL_MS) return rc;
  const restoreStatus = ['open', 'awaiting_merchant'].includes(rc.resolution_previous_status)
    ? rc.resolution_previous_status
    : 'open';
  await svc.entities.ReviewCase.updateMany(
    { id: rc.id, status: 'resolving', resolution_claim_id: rc.resolution_claim_id || '' },
    {
      $set: { status: restoreStatus },
      $unset: { resolution_claim_id: '', resolution_claimed_at: '', resolution_previous_status: '' },
    },
  ).catch(() => null);
  return await svc.entities.ReviewCase.get(rc.id).catch(() => rc);
}

async function acquireResolutionClaim(svc, rc, decision, resolvedBy, now) {
  const claimId = operationalCorrelationId({
    kind: 'review_resolution_claim',
    reviewCaseId: rc.id,
    decision,
    resolvedBy,
    now,
  });
  const result = await svc.entities.ReviewCase.updateMany(
    { id: rc.id, status: rc.status },
    {
      $set: {
        status: 'resolving',
        resolution_claim_id: claimId,
        resolution_claimed_at: now,
        resolution_previous_status: rc.status,
      },
    },
  );
  return { ok: updatedExactlyOne(result), claimId, previousStatus: rc.status };
}

async function rollbackResolutionClaim(svc, reviewCaseId, claimId, previousStatus) {
  await svc.entities.ReviewCase.updateMany(
    { id: reviewCaseId, status: 'resolving', resolution_claim_id: claimId },
    {
      $set: { status: previousStatus },
      $unset: { resolution_claim_id: '', resolution_claimed_at: '', resolution_previous_status: '' },
    },
  ).catch(() => null);
}

async function finalizeResolutionClaim(svc, reviewCaseId, claimId, update) {
  const result = await svc.entities.ReviewCase.updateMany(
    { id: reviewCaseId, status: 'resolving', resolution_claim_id: claimId },
    {
      $set: update,
      $unset: { resolution_claim_id: '', resolution_claimed_at: '', resolution_previous_status: '' },
    },
  );
  return updatedExactlyOne(result);
}

async function rejectEvidenceThroughP3Graph(svc, rc, evidence, userEmail, now) {
  if (!evidence) throw new Error('reviewed evidence no longer exists');
  const entityName = ENTITY_BY_TYPE[rc.evidence_entity_type];
  if (!entityName) throw new Error('review case has unknown evidence type');
  const fromStatus = readEvidenceStatus(rc.evidence_entity_type, evidence);
  const correlationId = operationalCorrelationId({
    kind: 'review_reject',
    reviewCaseId: rc.id,
    evidenceEntityType: rc.evidence_entity_type,
    evidenceId: rc.evidence_id,
  });
  const transition = buildLifecycleTransition({
    evidenceEntityType: rc.evidence_entity_type,
    evidenceId: rc.evidence_id,
    brandId: rc.brand_id,
    ownerEmail: rc.owner_email || evidence.owner_email || evidence.created_by,
    fromStatus,
    toStatus: 'rejected',
    event: 'review_rejected',
    actor: 'reviewer',
    correlationId,
    payload: { reviewCaseId: rc.id, rejectedBy: userEmail },
  });
  if (transition.changed && transition.record) {
    await createOnce(svc, 'EvidenceLifecycleEvent', transition.idempotencyKey, transition.record);
  }
  const patch: Record<string, unknown> = { evidence_status: 'rejected', next_lifecycle_action_at: '' };
  if (evidence.confidence_result && typeof evidence.confidence_result === 'object') {
    const rewritten = rewritePersistedLifecycleStatus(evidence.confidence_result, 'rejected');
    patch.confidence_result = rewritten.snapshot;
    patch.confidence_result_hash = rewritten.snapshotHash;
  }
  await svc.entities[entityName].update(rc.evidence_id, patch);
  return { ok: true, toStatus: 'rejected' };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ ok: false, error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden', code: 'forbidden' }, { status: 403 });

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') return badRequest('JSON payload required');
    const svc = base44.asServiceRole;
    const now = new Date().toISOString();
    const nowMs = Date.parse(now);

    if (payload.action === 'list') {
      const limit = Number.isInteger(payload.limit) && payload.limit > 0 ? Math.min(payload.limit, LIST_MAX) : LIST_DEFAULT;
      const query: Record<string, unknown> = {};
      if (typeof payload.status === 'string' && payload.status) query.status = payload.status;
      if (typeof payload.severity === 'string' && payload.severity) query.severity = payload.severity;
      if (typeof payload.reasonCode === 'string' && payload.reasonCode) query.reason_code = payload.reasonCode;
      if (typeof payload.brandId === 'string' && payload.brandId) query.brand_id = payload.brandId;
      if (typeof payload.evidenceEntityType === 'string' && payload.evidenceEntityType) query.evidence_entity_type = payload.evidenceEntityType;
      const rows = await svc.entities.ReviewCase.filter(query, '-created_date', limit).catch(() => []);
      return Response.json({ ok: true, action: 'list', count: (rows || []).length, limit, cases: (rows || []).map((r) => projectReviewCase(r, { detail: false })) });
    }

    if (payload.action === 'get') {
      if (typeof payload.reviewCaseId !== 'string' || !payload.reviewCaseId) return badRequest('reviewCaseId is required');
      let rc = await svc.entities.ReviewCase.get(payload.reviewCaseId).catch(() => null);
      if (!rc) return Response.json({ ok: false, error: 'review case not found', code: 'not_found' }, { status: 404 });
      rc = await recoverStaleResolutionClaim(svc, rc, nowMs);
      const entityName = ENTITY_BY_TYPE[rc.evidence_entity_type];
      const evidence = entityName && rc.evidence_id ? await svc.entities[entityName].get(rc.evidence_id).catch(() => null) : null;
      return Response.json({
        ok: true,
        action: 'get',
        case: projectReviewCase(rc, { detail: true }),
        evidence: evidence ? {
          id: evidence.id,
          entityType: rc.evidence_entity_type,
          status: readEvidenceStatus(rc.evidence_entity_type, evidence),
          checksum: evidence.checksum || null,
          confidenceResultHash: evidence.confidence_result_hash || null,
          expiresAt: evidence.expires_at || null,
          provisionalStartedAt: evidence.provisional_started_at || null,
        } : null,
      });
    }

    if (payload.action !== 'resolve') return badRequest('action must be "list", "get" or "resolve"');
    if (typeof payload.reviewCaseId !== 'string' || !payload.reviewCaseId) return badRequest('reviewCaseId is required');
    let rc = await svc.entities.ReviewCase.get(payload.reviewCaseId).catch(() => null);
    if (!rc) return Response.json({ ok: false, error: 'review case not found', code: 'not_found' }, { status: 404 });
    rc = await recoverStaleResolutionClaim(svc, rc, nowMs);
    if (rc.status === 'resolving') {
      return Response.json({ ok: false, error: 'review case is being resolved by another reviewer', code: 'review_case_resolution_in_progress' }, { status: 409 });
    }

    const entityName = ENTITY_BY_TYPE[rc.evidence_entity_type];
    const evidence = entityName && rc.evidence_id ? await svc.entities[entityName].get(rc.evidence_id).catch(() => null) : null;
    let evidenceChecksum = null;
    if (evidence) {
      const res = resolveOperationalChecksum(evidence.checksum, payload.expectedChecksum, { required: false });
      if (res.ok !== true) return Response.json({ ok: false, error: res.reason, code: res.code }, { status: res.status });
      evidenceChecksum = res.checksum;
    } else if (typeof payload.expectedChecksum === 'string' && payload.expectedChecksum) {
      return Response.json({ ok: false, error: 'no stored evidence to bind the supplied checksum to', code: 'operational_checksum_unbindable' }, { status: 409 });
    }

    const plan = planReviewResolution({
      reviewCase: { id: rc.id, status: rc.status },
      decision: payload.decision,
      resolvedBy: user.email,
      notes: typeof payload.notes === 'string' ? payload.notes : '',
      evidenceStatus: readEvidenceStatus(rc.evidence_entity_type, evidence),
    }, { now });
    if (plan.ok !== true) return Response.json({ ok: false, error: plan.reason, code: plan.code }, { status: plan.status });

    const claim = await acquireResolutionClaim(svc, rc, payload.decision, user.email, now);
    if (!claim.ok) {
      return Response.json({ ok: false, error: 'review case was claimed concurrently', code: 'review_case_already_resolved' }, { status: 409 });
    }

    let evidenceActionResult = null;
    let eventId = null;
    try {
      if (plan.evidenceAction === 'reprocess') {
        const invoke = await base44.asServiceRole.functions.invoke('eclProcessEvidence', {
          action: 'reprocess',
          evidenceEntityType: rc.evidence_entity_type,
          evidenceId: rc.evidence_id,
          ignoreReviewCaseId: rc.id,
        });
        const result = invoke && invoke.data ? invoke.data : invoke;
        if (!result || result.ok !== true) {
          throw new Error(result?.error || 'canonical ECL reprocess failed');
        }
        evidenceActionResult = result;
      } else if (plan.evidenceAction === 'reject') {
        evidenceActionResult = await rejectEvidenceThroughP3Graph(svc, rc, evidence, user.email, now);
      }

      // Audit is part of the resolution contract, not best-effort logging. It is
      // persisted while the exclusive claim is held and BEFORE the case is
      // finalized. If this write fails the claim is rolled back; a retry uses
      // the deterministic event claim and cannot append the same semantic event.
      const freshEvidence = entityName && rc.evidence_id
        ? await svc.entities[entityName].get(rc.evidence_id).catch(() => evidence)
        : evidence;
      if (freshEvidence && rc.brand_id && (rc.owner_email || freshEvidence.owner_email || freshEvidence.created_by)) {
        const correlationId = operationalCorrelationId({ kind: 'review_resolution', reviewCaseId: rc.id, decision: plan.update.decision });
        const intent = buildReviewResolutionEventIntent({
          evidenceEntityType: rc.evidence_entity_type,
          evidenceId: rc.evidence_id,
          brandId: rc.brand_id,
          ownerEmail: rc.owner_email || freshEvidence.owner_email || freshEvidence.created_by,
          status: readEvidenceStatus(rc.evidence_entity_type, freshEvidence),
          reviewCaseId: rc.id,
          decision: plan.update.decision,
          resolvedBy: user.email,
          evidenceChecksum,
          reprocessRequired: plan.reprocessRequired === true,
          correlationId,
        });
        const evt = await createOnce(svc, 'EvidenceLifecycleEvent', intent.idempotencyKey, intent.record);
        eventId = evt.id;
      }

      const finalized = await finalizeResolutionClaim(svc, rc.id, claim.claimId, plan.update);
      if (!finalized) throw new Error('resolution claim was lost before finalization');
    } catch (err) {
      await rollbackResolutionClaim(svc, rc.id, claim.claimId, claim.previousStatus);
      return Response.json({ ok: false, error: 'review resolution failed safely', code: 'review_resolution_action_failed', message: err.message }, { status: 409 });
    }

    return Response.json({
      ok: true,
      action: 'resolve',
      code: plan.code,
      reviewCaseId: rc.id,
      caseStatus: plan.update.status,
      decision: plan.update.decision,
      resolvedBy: plan.update.resolved_by || null,
      resolvedAt: plan.update.resolved_at || null,
      reprocessRequired: plan.reprocessRequired === true,
      evidenceAction: plan.evidenceAction || 'none',
      evidenceResult: evidenceActionResult,
      eventId,
    });
  } catch (error) {
    return Response.json({ ok: false, error: 'review_workflow_failed', message: error.message }, { status: 500 });
  }
});
