// eclReviewWorkflow — v62.7 ECL P4 (2026-08-08).
//
// The REVIEW QUEUE backend: list / get / resolve. ADMIN-ONLY on every action
// (the platform's `admin` role IS the reviewer role in this repo — no second,
// parallel role vocabulary is invented here). A role claimed in the payload is
// never read; the actor recorded on a resolution is the authenticated session's
// email, resolved server-side.
//
// Manual review is NOT an escape hatch around ECL: `resolve` NEVER writes an
// evidence status. An approval only marks the case resolved and reports
// reprocessRequired — the evidence must go back through the P3 engine
// (eclProcessEvidence), which is the single authority on what evidence becomes.
//
// DELIBERATELY ABSENT (P4 limits): no billing, invoicing, collections, Stripe
// or settlement effect of any kind.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  planReviewResolution,
  projectReviewCase,
  buildReviewResolutionEventIntent,
  resolveOperationalChecksum,
  operationalCorrelationId,
  restoreLifecycleFromSnapshot,
} from '../../shared/generated/eclDomain.ts';

const ENTITY_BY_TYPE = { statement_import: 'StatementImport', savings_evidence: 'SavingsEvidence' };
const LIST_MAX = 100;
const LIST_DEFAULT = 25;

// ONE shared idempotent-create + malformed-input contract (see the module).
import { badRequest, createOnce } from '../../shared/eclPersistence.ts';

/** Authoritative evidence status, read from persistence only. */
function readEvidenceStatus(entityType, record) {
  if (!record) return null;
  const restored = restoreLifecycleFromSnapshot(record.confidence_result && typeof record.confidence_result === 'object' ? record.confidence_result : null);
  if (entityType === 'statement_import') return record.evidence_status || (restored && restored.status) || 'pending';
  return (restored && restored.status) || 'pending';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    if (!user) return Response.json({ ok: false, error: 'Unauthorized', code: 'unauthenticated' }, { status: 401 });
    // The review queue is an internal operational surface: authenticated but
    // non-admin users are FORBIDDEN, never silently served a filtered view.
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden', code: 'forbidden' }, { status: 403 });

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') return badRequest('JSON payload required');
    const svc = base44.asServiceRole;
    const now = new Date().toISOString();

    // ── list ────────────────────────────────────────────────────────────────
    if (payload.action === 'list') {
      const limit = Number.isInteger(payload.limit) && payload.limit > 0 ? Math.min(payload.limit, LIST_MAX) : LIST_DEFAULT;
      const query = {};
      if (typeof payload.status === 'string' && payload.status) query.status = payload.status;
      if (typeof payload.severity === 'string' && payload.severity) query.severity = payload.severity;
      if (typeof payload.reasonCode === 'string' && payload.reasonCode) query.reason_code = payload.reasonCode;
      if (typeof payload.brandId === 'string' && payload.brandId) query.brand_id = payload.brandId;
      if (typeof payload.evidenceEntityType === 'string' && payload.evidenceEntityType) query.evidence_entity_type = payload.evidenceEntityType;
      const rows = await svc.entities.ReviewCase.filter(query, '-created_date', limit).catch(() => []);
      return Response.json({ ok: true, action: 'list', count: (rows || []).length, limit, cases: (rows || []).map((r) => projectReviewCase(r, { detail: false })) });
    }

    // ── get ─────────────────────────────────────────────────────────────────
    if (payload.action === 'get') {
      if (typeof payload.reviewCaseId !== 'string' || !payload.reviewCaseId) return badRequest('reviewCaseId is required');
      const rc = await svc.entities.ReviewCase.get(payload.reviewCaseId).catch(() => null);
      if (!rc) return Response.json({ ok: false, error: 'review case not found', code: 'not_found' }, { status: 404 });
      const entityName = ENTITY_BY_TYPE[rc.evidence_entity_type];
      const evidence = entityName && rc.evidence_id ? await svc.entities[entityName].get(rc.evidence_id).catch(() => null) : null;
      return Response.json({
        ok: true,
        action: 'get',
        case: projectReviewCase(rc, { detail: true }),
        // Enough authoritative context to decide — identifiers, status and the
        // stored checksum. No credentials, no raw file bytes, no PII dump.
        evidence: evidence
          ? {
              id: evidence.id,
              entityType: rc.evidence_entity_type,
              status: readEvidenceStatus(rc.evidence_entity_type, evidence),
              checksum: evidence.checksum || null,
              confidenceResultHash: evidence.confidence_result_hash || null,
              expiresAt: evidence.expires_at || null,
              provisionalStartedAt: evidence.provisional_started_at || null,
            }
          : null,
      });
    }

    // ── resolve ─────────────────────────────────────────────────────────────
    if (payload.action !== 'resolve') return badRequest('action must be "list", "get" or "resolve"');
    if (typeof payload.reviewCaseId !== 'string' || !payload.reviewCaseId) return badRequest('reviewCaseId is required');
    const rc = await svc.entities.ReviewCase.get(payload.reviewCaseId).catch(() => null);
    if (!rc) return Response.json({ ok: false, error: 'review case not found', code: 'not_found' }, { status: 404 });

    const entityName = ENTITY_BY_TYPE[rc.evidence_entity_type];
    const evidence = entityName && rc.evidence_id ? await svc.entities[entityName].get(rc.evidence_id).catch(() => null) : null;

    // P4-P — an optional caller checksum is a CONCURRENCY REFERENCE, compared
    // against the stored value. It is never promoted to authoritative and there
    // is no `stored || claimed` fallback.
    let evidenceChecksum = null;
    if (evidence) {
      const res = resolveOperationalChecksum(evidence.checksum, payload.expectedChecksum, { required: false });
      if (res.ok !== true) return Response.json({ ok: false, error: res.reason, code: res.code }, { status: res.status });
      evidenceChecksum = res.checksum;
    } else if (typeof payload.expectedChecksum === 'string' && payload.expectedChecksum) {
      return Response.json({ ok: false, error: 'no stored evidence to bind the supplied checksum to', code: 'operational_checksum_unbindable' }, { status: 409 });
    }

    const plan = planReviewResolution(
      {
        reviewCase: { id: rc.id, status: rc.status },
        decision: payload.decision,
        // Server-resolved actor: the authenticated reviewer, never a payload claim.
        resolvedBy: user.email,
        notes: typeof payload.notes === 'string' ? payload.notes : '',
        evidenceStatus: readEvidenceStatus(rc.evidence_entity_type, evidence),
      },
      { now },
    );
    if (plan.ok !== true) return Response.json({ ok: false, error: plan.reason, code: plan.code }, { status: plan.status });

    // Re-read immediately before the write: a case resolved by another admin in
    // the meantime loses deterministically instead of overwriting the winner.
    const fresh = await svc.entities.ReviewCase.get(payload.reviewCaseId).catch(() => null);
    if (!fresh || !['open', 'awaiting_merchant'].includes(fresh.status)) {
      return Response.json({ ok: false, error: 'review case was resolved concurrently', code: 'review_case_already_resolved' }, { status: 409 });
    }
    await svc.entities.ReviewCase.update(payload.reviewCaseId, plan.update);

    let eventId = null;
    if (evidence && rc.brand_id && (rc.owner_email || evidence.owner_email || evidence.created_by)) {
      const correlationId = operationalCorrelationId({ kind: 'review_resolution', reviewCaseId: rc.id, decision: plan.update.decision });
      const intent = buildReviewResolutionEventIntent({
        evidenceEntityType: rc.evidence_entity_type,
        evidenceId: rc.evidence_id,
        brandId: rc.brand_id,
        ownerEmail: rc.owner_email || evidence.owner_email || evidence.created_by,
        status: readEvidenceStatus(rc.evidence_entity_type, evidence),
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

    return Response.json({
      ok: true,
      action: 'resolve',
      code: plan.code,
      reviewCaseId: rc.id,
      caseStatus: plan.update.status,
      decision: plan.update.decision,
      resolvedBy: plan.update.resolved_by,
      resolvedAt: plan.update.resolved_at,
      // An approval does NOT set an evidence status here: the engine decides.
      reprocessRequired: plan.reprocessRequired === true,
      eventId,
    });
  } catch (error) {
    return Response.json({ ok: false, error: 'review_workflow_failed', message: error.message }, { status: 500 });
  }
});