import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import {
  INTELLIGENCE_VERSION,
  P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS,
  observedFiniteNumber,
  sha256,
  pricingAt,
} from '../../shared/intelligenceCore.ts';
import { capabilityAllows } from '../../shared/intelligenceCapabilities.ts';
import { buildPrivacySafeOutcomeCalibration } from '../../shared/outcomeCalibration.ts';
import { readCompleteEntityPages } from '../../shared/privacySafeIntelligence.ts';
import { operationErrorResponse } from '../../shared/publicErrors.ts';
import {
  intelligenceScopeFilter,
  intelligenceScopeHashMaterial,
  scopedIntelligenceKey,
  validateIntelligenceTenantScope,
  validateStoredIntelligenceRecord,
} from '../../shared/intelligenceTenantScope.ts';
import {
  assessClaimPromotionLineage,
  callerLearningAuthorityRejected,
} from '../../shared/intelligenceLearningLineage.ts';
import {
  researchSourceSummary,
  retrieveResearchKnowledge,
} from '../../shared/researchKnowledge.ts';
import {
  persistResearchKnowledge,
  researchKnowledgePersistencePlan,
} from '../../shared/researchKnowledgePersistence.ts';

const now = () => new Date().toISOString();
const rejected = (error: string, status = 409, details: any = {}) =>
  Response.json({ ok: false, error, ...details }, { status });

function blocked(code: string, status = 503): never {
  const error: any = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

async function strictFilter(
  s: any,
  entityName: string,
  query: any,
  sort: string,
  limit: number,
  operation: string,
) {
  try {
    const rows = await s.entities[entityName].filter(query, sort, limit);
    if (!Array.isArray(rows)) blocked(`${operation}_invalid_response`);
    return rows;
  } catch (error) {
    safeBestEffort(error, { operation: `intelligenceAccess.${operation}`, fallback: null, severity: 'critical' });
    if (String((error as any)?.code || '').startsWith(operation)) throw error;
    blocked(`${operation}_unavailable`);
  }
}

async function strictGet(s: any, entityName: string, id: string, operation: string) {
  try {
    return await s.entities[entityName].get(id);
  } catch (error) {
    safeBestEffort(error, { operation: `intelligenceAccess.${operation}`, fallback: null, severity: 'critical' });
    blocked(`${operation}_unavailable`);
  }
}

function assertCompletePage(rows: any[], limit: number, operation: string) {
  if (rows.length >= limit) blocked(`${operation}_coverage_incomplete`, 409);
}

async function assertSingleCommittedRecord(
  s: any,
  entityName: string,
  query: any,
  createdId: string,
  operation: string,
) {
  const observed = await strictFilter(s, entityName, query, '-created_date', 2, `${operation}_postcommit_read`);
  if (observed.length !== 1 || String(observed[0]?.id || '') !== String(createdId || '')) {
    blocked(`${operation}_postcommit_ambiguous`, 409);
  }
}

function sameBinding(left: any, leftKind: any, right: any, rightKind: any) {
  const a = validateIntelligenceTenantScope(left, leftKind, { require_evidence_governance: leftKind === 'evidence' });
  const b = validateIntelligenceTenantScope(right, rightKind, { require_evidence_governance: rightKind === 'evidence' });
  return a.ok && b.ok && a.scope_key === b.scope_key;
}

async function getScopedLineage(
  s: any,
  ids: any[],
  entityName: string,
  kind: any,
  requested: any,
  requestedKind: any,
  stateField?: string,
) {
  const rows: any[] = [];
  for (const id of [...new Set(ids.map((value) => String(value || '').trim()).filter(Boolean))]) {
    const row = await strictGet(s, entityName, id, `${kind}_lineage_read`);
    const valid = row ? validateStoredIntelligenceRecord(row, kind) : null;
    const quarantined = row?.quarantined === true || (stateField && String(row?.[stateField] || '') === 'quarantined');
    if (!row || !valid?.ok || quarantined || !sameBinding(requested, requestedKind, row, kind)) {
      return { ok: false as const, error: `${kind}_lineage_scope_invalid`, id };
    }
    rows.push(row);
  }
  return { ok: true as const, rows };
}

Deno.serve(async (req) => {
  try {
    const b = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const g = await requireAdminOrInternal(req, b, body);
    if (!g.ok) return g.response as Response;
    const s = b.asServiceRole;
    const a = String(body.action || '');
    const capability = String(body.actor_capability || '');
    if (g.isInternal && !g.isAdmin && !capabilityAllows(capability, a)) {
      return Response.json({ ok: false, error: 'intelligence_capability_denied' }, { status: 403 });
    }

    if (a === 'search_research_knowledge') {
      const result = retrieveResearchKnowledge(body.query || {});
      return Response.json(result, { status: result.status === 'INVALID_QUERY' ? 400 : 200 });
    }

    if (a === 'research_source_summary') {
      return Response.json(researchSourceSummary());
    }

    if (a === 'research_persistence_plan') {
      return Response.json({ ok: true, ...researchKnowledgePersistencePlan() });
    }

    if (a === 'sync_research_knowledge') {
      if (!g.isAdmin) return Response.json({ ok: false, error: 'admin_confirmation_required' }, { status: 403 });
      if (body.confirmed !== true || String(body.confirmation_text || '') !== 'SYNC CANDIDATE RESEARCH') {
        return Response.json({
          ok: true,
          requires_confirmation: true,
          confirmation_text: 'SYNC CANDIDATE RESEARCH',
          preview: researchKnowledgePersistencePlan(),
        });
      }
      return Response.json(await persistResearchKnowledge(s));
    }

    if(a==='record_evidence') {
      const x = body.evidence || {};
      if (x.is_demo) return rejected('demo_evidence_rejected');
      const scope = intelligenceScopeHashMaterial(x, 'evidence');
      if (!scope.ok) return rejected(scope.error, 400);
      const recorded = now();
      const hash = await sha256({
        ...scope.material,
        source_type: x.source_type,
        source_reference: x.source_reference,
        payload: x.payload_json,
        effective_at: x.effective_at,
        observed_at: x.observed_at,
      });
      const scopedKey = scopedIntelligenceKey(x.evidence_key || hash, x, 'evidence');
      if (!scopedKey.ok) return rejected(scopedKey.error, 400);
      const scopedFilter = intelligenceScopeFilter(x, 'evidence');
      if (!scopedFilter.ok) return rejected(scopedFilter.error, 400);
      const old = await strictFilter(
        s, 'IntelligenceEvidence', { ...scopedFilter.filter, evidence_hash: hash }, '-created_date', 2,
        'evidence_deduplication_read',
      );
      if (old.length > 1) return rejected('evidence_deduplication_ambiguous', 409, { review_required: true });
      if (old[0]) return Response.json({ ok: true, id: old[0].id, deduplicated:true });
      const row = await s.entities.IntelligenceEvidence.create({
        ...x,
        evidence_key: scopedKey.key,
        evidence_hash:hash,
        content_hash: await sha256({ ...scope.material, payload: x.payload_json || {} }),
        recorded_at: recorded,
        observed_at: x.observed_at || recorded,
        tenant_scope: scope.binding.tenant_scope,
        brand_id: scope.binding.brand_id || undefined,
        domain: scope.binding.domain || x.domain,
        purpose: scope.binding.purpose,
        quarantined: false,
      });
      await assertSingleCommittedRecord(
        s, 'IntelligenceEvidence', { ...scopedFilter.filter, evidence_hash: hash }, row.id,
        'evidence_deduplication',
      );
      return Response.json({ ok: true, id: row.id, evidence_hash: hash, version: INTELLIGENCE_VERSION });
    }

    if(a==='record_observation') {
      const x = body.observation || {};
      const requested = validateIntelligenceTenantScope(x, 'observation');
      if (!requested.ok) return rejected(requested.error, 400);
      const ev = await strictGet(s, 'IntelligenceEvidence', String(x.evidence_id || ''), 'observation_evidence_read');
      const evidenceScope = ev ? validateStoredIntelligenceRecord(ev, 'evidence') : null;
      if (!ev || !evidenceScope?.ok || ev.quarantined || !sameBinding(x, 'observation', ev, 'evidence')) {
        return rejected('valid_same_tenant_evidence_required');
      }
      const rawKey = x.observation_key || await sha256({
        tenant_scope: requested.tenant_scope,
        brand_id: requested.brand_id,
        domain: requested.domain,
        purpose: requested.purpose,
        evidence_id: ev.id,
        semantic_key: x.semantic_key,
        normalized: x.normalized_json,
        parser_version: x.parser_version,
      });
      const scopedKey = scopedIntelligenceKey(rawKey, x, 'observation');
      if (!scopedKey.ok) return rejected(scopedKey.error, 400);
      const scopedFilter = intelligenceScopeFilter(x, 'observation');
      if (!scopedFilter.ok) return rejected(scopedFilter.error, 400);
      const old = await strictFilter(
        s, 'IntelligenceObservation', { ...scopedFilter.filter, observation_key: scopedKey.key }, '-created_date', 2,
        'observation_deduplication_read',
      );
      if (old.length > 1) return rejected('observation_deduplication_ambiguous', 409, { review_required: true });
      if (old[0]) return Response.json({ ok: true, id: old[0].id, deduplicated:true });
      const row = await s.entities.IntelligenceObservation.create({
        ...x,
        observation_key: scopedKey.key,
        truth_level: x.truth_level || ev.truth_level,
        observed_at: x.observed_at || ev.observed_at,
        tenant_scope: requested.tenant_scope,
        brand_id: requested.brand_id || undefined,
        domain: requested.domain || ev.domain,
        purpose: requested.purpose || ev.purpose,
        is_demo: false,
      });
      await assertSingleCommittedRecord(
        s, 'IntelligenceObservation', { ...scopedFilter.filter, observation_key: scopedKey.key }, row.id,
        'observation_deduplication',
      );
      return Response.json({ ok: true, id: row.id });
    }

    if(a==='upsert_claim') {
      const x = body.claim || {};
      if (callerLearningAuthorityRejected(x)) {
        return rejected('caller_cannot_grant_learning_model_or_calibration_authority', 400);
      }
      const requested = validateIntelligenceTenantScope(x, 'claim');
      if (!requested.ok) return rejected(requested.error, 400);
      const obs = Array.isArray(x.observation_ids) ? x.observation_ids : [];
      const eids = Array.isArray(x.evidence_ids) ? x.evidence_ids : [];
      const evidence = await getScopedLineage(s, eids, 'IntelligenceEvidence', 'evidence', x, 'claim');
      if (!evidence.ok) return rejected(evidence.error, 409, { lineage_id: evidence.id });
      const observations = await getScopedLineage(s, obs, 'IntelligenceObservation', 'observation', x, 'claim', 'status');
      if (!observations.ok) return rejected(observations.error, 409, { lineage_id: observations.id });
      let state = String(x.knowledge_state || 'candidate');
      const promotionRequested = ['verified', 'active'].includes(state);
      const promotionDecision = promotionRequested
        ? assessClaimPromotionLineage({
            claim: {
              ...x,
              evidence_ids: eids,
              observation_ids: obs,
              observed_at: x.observed_at || now(),
            },
            evidence_rows: evidence.rows,
            observation_rows: observations.rows,
            evaluated_at: now(),
          })
        : null;
      if (promotionRequested && !promotionDecision?.ok) state = 'corroborated';
      const scopeQuery = intelligenceScopeFilter(x, 'claim');
      if (!scopeQuery.ok) return rejected(scopeQuery.error, 400);
      const peers = await strictFilter(
        s, 'KnowledgeClaim', { ...scopeQuery.filter, semantic_key: x.semantic_key }, '-version', 1000,
        'claim_peer_read',
      );
      assertCompletePage(peers, 1000, 'claim_peer_read');
      const validPeers = peers.filter((peer: any) => validateStoredIntelligenceRecord(peer, 'claim').ok);
      const version = Math.max(0, ...validPeers.map((p: any) => Number(p.version || 0))) + 1;
      const content_hash = await sha256({
        tenant_scope: requested.tenant_scope,
        brand_id: requested.brand_id,
        domain: requested.domain,
        purpose: requested.purpose,
        semantic_key: x.semantic_key,
        value: x.value_json,
        effective_at: x.effective_at,
        truth_level: x.truth_level,
      });
      const same = validPeers.filter((p: any) =>
        p.content_hash === content_hash && !['superseded', 'archived', 'quarantined'].includes(p.knowledge_state)
      );
      if (same.length > 1) return rejected('claim_deduplication_ambiguous', 409, { review_required: true });
      if (same[0]) return Response.json({ ok: true, id: same[0].id, deduplicated:true });
      for (const p of validPeers.filter((p: any) => ['verified', 'active'].includes(p.knowledge_state) && state === 'active')) {
        await s.entities.KnowledgeClaim.update(p.id, { knowledge_state: 'superseded' });
      }
      const rawClaimKey = x.claim_key || `${String(x.semantic_key || 'claim')}:${version}`;
      const claimKey = scopedIntelligenceKey(rawClaimKey, x, 'claim');
      if (!claimKey.ok) return rejected(claimKey.error, 400);
      const row = await s.entities.KnowledgeClaim.create({
        ...x,
        claim_key: claimKey.key,
        observation_ids: obs,
        evidence_ids: eids,
        knowledge_state: state,
        version,
        content_hash,
        tenant_scope: requested.tenant_scope,
        brand_id: requested.brand_id || undefined,
        domain: requested.domain || x.domain,
        purpose: requested.purpose || x.purpose,
        observed_at: x.observed_at || now(),
        verified_at: ['verified', 'active'].includes(state) ? now() : undefined,
        supersedes_claim_id: validPeers[0]?.id || null,
        claim_use_class: 'DESCRIPTIVE',
        training_eligible: false,
        model_eligible: false,
        calibration_eligible: false,
        learning_eligibility_decision_id: null,
        promotion_decision_json: promotionDecision
          ? {
              ...promotionDecision,
              requested_state: String(x.knowledge_state || 'candidate'),
              applied_state: state,
              evaluated_at: now(),
              independent_learning_decision_required: true,
            }
          : {
              policy_version: 'p12-claim-promotion-lineage.v2',
              requested_state: state,
              applied_state: state,
              promotion_requested: false,
              independent_learning_decision_required: true,
            },
        is_demo: false,
      });
      await assertSingleCommittedRecord(
        s, 'KnowledgeClaim', { ...scopeQuery.filter, claim_key: claimKey.key }, row.id,
        'claim_version',
      );
      return Response.json({
        ok: true,
        id: row.id,
        state,
        version,
        promotion_requested: promotionRequested,
        promotion_allowed: promotionDecision?.ok === true,
        promotion_reason_codes: promotionDecision?.reason_codes || [],
        learning_eligible: false,
      });
    }

    if (a === 'pricing_at_date' || a === 'current_pricing') {
      const q = body.query || {};
      const at = a === 'current_pricing' ? now() : String(q.at || '');
      const rows = await strictFilter(
        s, 'ProviderPricingVersion',
        { provider_slug: q.provider_slug, vertical: q.vertical || 'payments' }, '-effective_at', 500,
        'pricing_read',
      );
      assertCompletePage(rows, 500, 'pricing_read');
      const filtered = rows.filter((r: any) => (!q.country || r.country === q.country) && (!q.channel || r.channel === q.channel) && !r.is_demo);
      return Response.json({ ok: true, pricing: pricingAt(filtered, at), at });
    }

    if(a==='get_benchmark') {
      const q = body.query || {};
      const rows = await strictFilter(
        s, 'BenchmarkCohort',
        { vertical: q.vertical || 'payments', metric_key: q.metric_key, country: q.country }, '-month', 100,
        'benchmark_read',
      );
      assertCompletePage(rows, 100, 'benchmark_read');
      const visible = rows.filter((r: any) => r.is_public === true && (observedFiniteNumber(r.n) ?? -1) >= P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS);
      return Response.json({
        ok: true,
        benchmark: visible[0] || null,
        suppressed: visible.length === 0,
        n: visible[0]?.n ?? null,
        minimum_distinct_merchants: P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS,
        note: 'Aggregate only; BenchmarkContribution rows are never returned. Missing sample size remains unknown and is suppressed.',
      });
    }

    if(a==='get_comparable_outcomes') {
      const q = body.query || {};
      const snapshotAt = now();
      const complete = await readCompleteEntityPages(
        s.entities.AnonymizedIntelligenceAggregate,
        {
          source_entity: 'AnonymizedIntelligenceAggregate',
          snapshot_at: snapshotAt,
          page_size: 1000,
          max_pages: 1000,
        },
      );
      if (!complete.ok) {
        return rejected('privacy_safe_outcome_coverage_incomplete', 409, {
          review_required: true,
          source_coverage: complete.coverage,
        });
      }
      return Response.json({
        ok: true,
        ...buildPrivacySafeOutcomeCalibration(complete.rows, {
          currency: q.currency,
          provider_id: q.provider_id,
          as_of: String(q.as_of || snapshotAt),
          source_coverage: complete.coverage,
        }),
      });
    }

    if(a==='create_snapshot') {
      const x = body.snapshot || {};
      const captured = now();
      const snapshot_hash = await sha256(x.snapshot_json || {});
      const snapshot_key = String(x.snapshot_key || await sha256({ type: x.snapshot_type, entity: x.related_entity_type, id: x.related_entity_id, hash: snapshot_hash, captured }));
      const existing = await strictFilter(
        s, 'IntelligenceSnapshot', { snapshot_key }, '-captured_at', 2, 'snapshot_deduplication_read',
      );
      if (existing.length > 1) return rejected('snapshot_deduplication_ambiguous', 409, { review_required: true });
      if (existing[0]) {
        if (String(existing[0].snapshot_hash || '') !== snapshot_hash) {
          return rejected('snapshot_key_content_conflict', 409, { review_required: true });
        }
        return Response.json({ ok: true, id: existing[0].id, snapshot_hash, deduplicated: true });
      }
      const row = await s.entities.IntelligenceSnapshot.create({ ...x, snapshot_key, snapshot_hash, captured_at: captured });
      await assertSingleCommittedRecord(
        s, 'IntelligenceSnapshot', { snapshot_key }, row.id, 'snapshot_deduplication',
      );
      return Response.json({ ok: true, id: row.id, snapshot_hash });
    }

    if(a==='record_outcome') {
      const x = body.outcome || {};
      if (x.is_demo) return rejected('demo_outcome_rejected');
      if (callerLearningAuthorityRejected(x)) {
        return rejected('caller_cannot_grant_learning_model_or_calibration_authority', 400);
      }
      if (!String(x.domain || '').trim() || !String(x.purpose || '').trim()) {
        return rejected('outcome_domain_and_purpose_required', 400);
      }
      const requested = intelligenceScopeHashMaterial(x, 'outcome');
      if (!requested.ok) return rejected(requested.error, 400);
      const verificationSourceType = String(x.verification_source_type || '');
      const verificationSourceId = String(x.verification_source_id || '');
      const sourceEntities: Record<string, string> = {
        MonthlySavingsReport: 'MonthlySavingsReport',
        NegotiationCase: 'NegotiationCase',
        MigrationTask: 'MigrationTask',
      };
      const sourceEntity = sourceEntities[verificationSourceType];
      if (!sourceEntity || !verificationSourceId) {
        return rejected('supported_exact_verification_source_required', 400);
      }
      const verificationSource = await strictGet(
        s,
        sourceEntity,
        verificationSourceId,
        'outcome_verification_source_read',
      );
      if (!verificationSource) return rejected('verification_source_not_found', 404);
      if (
        requested.binding.tenant_scope !== 'tenant' ||
        String(verificationSource.brand_id || '') !== String(requested.binding.brand_id || '')
      ) return rejected('verification_source_tenant_mismatch', 403);
      if (
        x.related_entity_id &&
        String(x.related_entity_id) !== verificationSourceId
      ) return rejected('verification_source_related_entity_mismatch', 409);
      const sourceTerminal = verificationSourceType === 'MonthlySavingsReport'
        ? verificationSource.measurement_mode === 'fully_verified' &&
          ['realized', 'invoiced', 'paid', 'verified'].includes(String(verificationSource.verification_status || ''))
        : verificationSourceType === 'NegotiationCase'
        ? ['approved', 'rejected', 'closed', 'expired'].includes(String(verificationSource.status || ''))
        : ['done', 'blocked', 'canceled'].includes(String(verificationSource.status || ''));
      if (!sourceTerminal) return rejected('verification_source_not_terminal_or_mature', 409);
      const rawKey = x.outcome_key || await sha256({
        ...requested.material,
        operation_type: x.operation_type,
        related_entity_type: x.related_entity_type,
        related_entity_id: x.related_entity_id,
        verification_source_id: x.verification_source_id,
      });
      const scopedKey = scopedIntelligenceKey(rawKey, x, 'outcome');
      if (!scopedKey.ok) return rejected(scopedKey.error, 400);
      const scopedFilter = intelligenceScopeFilter(x, 'outcome');
      if (!scopedFilter.ok) return rejected(scopedFilter.error, 400);
      const old = await strictFilter(
        s, 'IntelligenceOutcome', { ...scopedFilter.filter, outcome_key: scopedKey.key }, '-created_date', 2,
        'outcome_deduplication_read',
      );
      if (old.length > 1) return rejected('outcome_deduplication_ambiguous', 409, { review_required: true });
      if (old[0]) return Response.json({ ok: true, id: old[0].id, deduplicated:true });
      const expected = observedFiniteNumber(x.expected_savings);
      const realized = observedFiniteNumber(x.realized_savings);
      const variance = expected !== null && realized !== null ? Number((realized - expected).toFixed(2)) : null;
      const { expected_savings: _expected, realized_savings: _realized, variance: _variance, ...rest } = x;
      const row = await s.entities.IntelligenceOutcome.create({
        ...rest,
        ...(expected === null ? {} : { expected_savings: expected }),
        ...(realized === null ? {} : { realized_savings: realized }),
        ...(variance === null ? {} : { variance }),
        outcome_key: scopedKey.key,
        tenant_scope: requested.binding.tenant_scope,
        brand_id: requested.binding.brand_id || undefined,
        negative_knowledge: x.negative_knowledge === true || x.success === false,
        captured_at: x.captured_at || now(),
        intelligence_use_class: 'DESCRIPTIVE',
        evidence_ids: Array.isArray(x.evidence_ids) ? x.evidence_ids : [],
        observation_ids: Array.isArray(x.observation_ids) ? x.observation_ids : [],
        claim_ids: Array.isArray(x.claim_ids) ? x.claim_ids : [],
        experience_ids: Array.isArray(x.experience_ids) ? x.experience_ids : [],
        execution_receipt_ids: Array.isArray(x.execution_receipt_ids) ? x.execution_receipt_ids : [],
        learning_eligibility_status: 'PENDING_PROVENANCE',
        learning_eligibility_policy_version: 'learning-eligibility.v2',
        learning_eligibility_decision_id: null,
        verification_source_validated: true,
        label_mature: false,
        training_eligible: false,
        model_eligible: false,
        calibration_eligible: false,
        quarantined: true,
        quarantine_reason: 'INDEPENDENT_LEARNING_ELIGIBILITY_DECISION_REQUIRED',
        is_demo: false,
      });
      await assertSingleCommittedRecord(
        s, 'IntelligenceOutcome', { ...scopedFilter.filter, outcome_key: scopedKey.key }, row.id,
        'outcome_deduplication',
      );
      return Response.json({
        ok: true,
        id: row.id,
        financial_truth_status: realized === null ? 'UNKNOWN' : 'OBSERVED',
        variance_status: variance === null ? 'UNKNOWN' : 'OBSERVED',
        intelligence_use_class: 'DESCRIPTIVE',
        learning_eligibility_status: 'PENDING_PROVENANCE',
        learning_eligible: false,
      });
    }

    if (a === 'resolve_conflict') {
      const c = await strictGet(s, 'KnowledgeConflict', String(body.conflict_id || ''), 'conflict_read');
      if (!c) return Response.json({ ok: false, error: 'conflict_not_found' }, { status: 404 });
      const status = String(body.status || 'resolved');
      if (!['resolved', 'expected_variation', 'data_error'].includes(status)) {
        return Response.json({ ok: false, error: 'invalid_resolution_status' }, { status: 400 });
      }
      await s.entities.KnowledgeConflict.update(c.id, {
        status,
        resolution_json: body.resolution_json || {},
        resolved_at: now(),
        resolved_by: g.user?.email || 'internal',
      });
      return Response.json({ ok: true, id: c.id, status });
    }

    return Response.json({ ok: false, error: 'unknown_action' }, { status: 400 });
  } catch (e) {
    return operationErrorResponse(e, 'intelligenceAccess', 'intelligence_access_failed');
  }
});
