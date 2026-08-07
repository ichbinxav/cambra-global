// eclProcessEvidence — v62.5 ECL P3 (2026-08-07).
//
// THE ONLY I/O boundary of the Evidence Lifecycle Engine. Everything decided
// here is decided by the PURE engine in base44/shared/generated/eclDomain.ts
// (generated from the canonical src/lib modules); this handler only:
//   1. authenticates (ADMIN-ONLY — no merchant self-service surface in P3),
//   2. loads the real state (record, siblings, attestations, strikes, review
//      cases, baseline) with the service role,
//   3. injects `now` (the I/O layer owns the clock, the engine never does),
//   4. persists the engine's record INTENTS idempotently: every create is
//      guarded by a persisted idempotency_key lookup, so a replayed request
//      finds the existing rows and never duplicates an event, a strike, a
//      review case or an attestation.
//
// DELIBERATELY ABSENT (P3 limits): no scheduler, no reminders, no ReviewQueue
// UI, no billing/invoicing effect, no Recover automation. Nothing here reads
// or writes MonthlySavingsReport, Invoice or BillingRule.
//
// Actions:
//   { action: "process", evidenceEntityType, evidenceId, domain, evidence }
//   { action: "attest",  evidenceEntityType, evidenceId, declaredMetrics,
//     legalTextVersion, legalText, language, ... }
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import {
  runEclEngine,
  normalizePaymentsEvidence,
  normalizeCommerceEvidence,
  normalizeAccountingEvidence,
  buildAttestationIntent,
} from '../../shared/generated/eclDomain.ts';
import { ECL_POLICY } from '../../shared/generated/eclPolicy.ts';

const ENTITY_BY_TYPE = { statement_import: 'StatementImport', savings_evidence: 'SavingsEvidence' };
const NORMALIZERS = {
  payments: normalizePaymentsEvidence,
  commerce: normalizeCommerceEvidence,
  accounting: normalizeAccountingEvidence,
};

const badRequest = (msg) => Response.json({ ok: false, error: msg }, { status: 400 });

// Idempotent create: the persisted claim key is the transaction Base44 lacks.
async function createOnce(svc, entityName, idempotencyKey, record) {
  const existing = await svc.entities[entityName].filter({ idempotency_key: idempotencyKey }, '-created_date', 1).catch(() => []);
  if (existing && existing.length > 0) return { created: false, id: existing[0].id };
  const row = await svc.entities[entityName].create(record);
  return { created: true, id: row.id };
}

async function persistLifecycleEvent(svc, transition) {
  if (!transition || transition.changed !== true || !transition.record) return null;
  return await createOnce(svc, 'EvidenceLifecycleEvent', transition.idempotencyKey, transition.record);
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
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== 'object') return badRequest('JSON payload required');

    const entityName = ENTITY_BY_TYPE[payload.evidenceEntityType];
    if (!entityName) return badRequest('evidenceEntityType must be statement_import or savings_evidence');
    if (!payload.evidenceId || typeof payload.evidenceId !== 'string') return badRequest('evidenceId is required');

    const svc = base44.asServiceRole;
    const record = await svc.entities[entityName].get(payload.evidenceId).catch(() => null);
    if (!record) return Response.json({ ok: false, error: 'evidence record not found' }, { status: 404 });

    const brandId = record.brand_id;
    if (!brandId) return badRequest('evidence record carries no brand_id — cannot establish ownership');
    // Ownership is resolved SERVER-SIDE from the stored record, never from the payload.
    const ownerEmail = record.owner_email || record.created_by;
    if (!ownerEmail) return badRequest('evidence record carries no owner — refusing to invent one');

    // The I/O layer owns the clock; the engine only ever sees this value.
    const now = new Date().toISOString();

    // ── action: attest ──────────────────────────────────────────────────────
    if (payload.action === 'attest') {
      const intent = buildAttestationIntent({
        attestorUserId: user.id,
        brandId,
        ownerEmail,
        evidenceEntityType: payload.evidenceEntityType,
        evidenceId: payload.evidenceId,
        declaredMetrics: payload.declaredMetrics,
        legalTextVersion: payload.legalTextVersion,
        legalText: payload.legalText,
        language: payload.language,
        declaredPeriodStart: payload.declaredPeriodStart,
        declaredPeriodEnd: payload.declaredPeriodEnd,
        declaredSource: payload.declaredSource,
        evidenceChecksum: payload.evidenceChecksum,
      });
      const res = await createOnce(svc, 'EvidenceAttestation', intent.idempotencyKey, intent.record);
      return Response.json({
        ok: true,
        action: 'attest',
        created: res.created,
        attestationId: res.id,
        idempotencyKey: intent.idempotencyKey,
        legalTextHash: intent.legalTextHash,
      });
    }

    // ── action: process ─────────────────────────────────────────────────────
    if (payload.action !== 'process') return badRequest('action must be "process" or "attest"');
    const normalize = NORMALIZERS[payload.domain];
    if (!normalize) return badRequest('domain must be payments, commerce or accounting');
    const evidence = normalize(payload.evidence || {});

    // Real state, loaded — never assumed. StatementImport carries the lifecycle
    // columns (P1); SavingsEvidence keeps its lifecycle state inside the stored
    // confidence_result because its frozen schema has no evidence_status column.
    const priorResult = record.confidence_result && typeof record.confidence_result === 'object' ? record.confidence_result : null;
    const state = {
      status:
        (payload.evidenceEntityType === 'statement_import' ? record.evidence_status : null) ||
        (priorResult && priorResult.confidenceResult && priorResult.confidenceResult.evidenceStatus) ||
        'pending',
      provisionalStartedAt: record.provisional_started_at || null,
      expiresAt: record.expires_at || null,
    };

    const [siblings, attestations, strikes, openCases, baselines] = await Promise.all([
      svc.entities[entityName].filter({ brand_id: brandId }, '-created_date', 100).catch(() => []),
      svc.entities.EvidenceAttestation.filter({ evidence_entity_type: payload.evidenceEntityType, evidence_id: payload.evidenceId }, '-created_date', 1).catch(() => []),
      svc.entities.EvidenceStrike.filter({ brand_id: brandId }, '-created_date', 200).catch(() => []),
      svc.entities.ReviewCase.filter({ brand_id: brandId, status: 'open' }, '-created_date', 50).catch(() => []),
      svc.entities.Baseline.filter({ brand_id: brandId, is_current: true }, '-locked_at', 1).catch(() => []),
    ]);

    const existing = (siblings || [])
      .filter((s) => s && s.id !== payload.evidenceId && s.confidence_result && typeof s.confidence_result === 'object' && s.confidence_result.normalizedEvidence)
      .map((s) => ({
        id: s.id,
        status:
          (payload.evidenceEntityType === 'statement_import' ? s.evidence_status : null) ||
          (s.confidence_result.confidenceResult && s.confidence_result.confidenceResult.evidenceStatus) ||
          'pending',
        evidence: s.confidence_result.normalizedEvidence,
      }));

    const hasBlockingReviewCase = (openCases || []).some(
      (c) => c && c.evidence_entity_type === payload.evidenceEntityType && c.evidence_id === payload.evidenceId,
    );
    const baseline = (baselines || [])[0] || null;

    const decision = runEclEngine(
      {
        identity: { evidenceEntityType: payload.evidenceEntityType, evidenceId: payload.evidenceId, brandId, ownerEmail },
        evidence,
        existing,
        state,
        strikes: strikes || [],
        context: {
          now,
          hasAttestation: (attestations || []).length > 0,
          baselineLocked: baseline !== null && baseline.locked === true,
          hasBlockingReviewCase,
          referenceFeeRateBps: typeof payload.referenceFeeRateBps === 'number' ? payload.referenceFeeRateBps : undefined,
        },
        actor: 'system',
      },
      ECL_POLICY,
    );

    // Duplicate replay: recognized, logged in the response, ZERO writes.
    if (decision.outcome === 'duplicate_replay') {
      return Response.json({ ok: true, action: 'process', outcome: decision.outcome, duplicateOf: decision.duplicateOf, correlationId: decision.correlationId, inputsHash: decision.inputsHash, decisionHash: decision.decisionHash });
    }

    // ── Persist intents, each guarded by its persisted idempotency key ──────
    const persisted = { events: [], reviewCases: [], strikes: [] };
    const mainEvent = await persistLifecycleEvent(svc, decision.transition);
    if (mainEvent) persisted.events.push(mainEvent);
    for (const sup of decision.supersessions) {
      const ev = await persistLifecycleEvent(svc, sup);
      if (ev) persisted.events.push(ev);
      // Mark the superseded record itself (StatementImport carries the columns).
      if (payload.evidenceEntityType === 'statement_import') {
        await svc.entities.StatementImport.update(sup.record.evidence_id, { evidence_status: 'superseded', superseded_by_id: payload.evidenceId }).catch(() => null);
      }
    }
    for (const rc of decision.reviewCaseIntents) {
      persisted.reviewCases.push(await createOnce(svc, 'ReviewCase', rc.idempotencyKey, rc.record));
    }
    for (const st of decision.strikeIntents) {
      persisted.strikes.push(await createOnce(svc, 'EvidenceStrike', st.idempotencyKey, st.record));
    }

    // ── Update the evidence record itself (P1 fields only, schemas untouched) ─
    const resultSnapshot = {
      engineVersion: decision.engineVersion,
      ruleSetVersion: decision.ruleSetVersion,
      policyVersion: decision.policyVersion,
      correlationId: decision.correlationId,
      inputsHash: decision.inputsHash,
      decisionHash: decision.decisionHash,
      outcome: decision.outcome,
      normalizedEvidence: evidence,
      confidenceResult: decision.confidenceResult,
    };
    const toStatus = decision.transition ? decision.transition.toStatus : state.status;
    if (payload.evidenceEntityType === 'statement_import') {
      const update = {
        evidence_status: toStatus,
        confidence_result: resultSnapshot,
        confidence_result_hash: decision.confidenceResultHash,
        ...(decision.provisional
          ? { provisional_started_at: decision.provisional.startedAt, expires_at: decision.provisional.expiresAt }
          : {}),
      };
      await svc.entities.StatementImport.update(payload.evidenceId, update);
    } else {
      await svc.entities.SavingsEvidence.update(payload.evidenceId, {
        confidence_result: resultSnapshot,
        confidence_result_hash: decision.confidenceResultHash,
        confidence_level_ecl: decision.confidenceResult.confidenceLevel,
        freeze_eligibility: decision.confidenceResult.freezeEligibility,
        rule_set_version: decision.ruleSetVersion,
      });
    }

    return Response.json({
      ok: true,
      action: 'process',
      outcome: decision.outcome,
      toStatus,
      correlationId: decision.correlationId,
      inputsHash: decision.inputsHash,
      decisionHash: decision.decisionHash,
      confidenceResultHash: decision.confidenceResultHash,
      confidenceLevel: decision.confidenceResult.confidenceLevel,
      freezeEligibility: decision.confidenceResult.freezeEligibility,
      reviewRequired: decision.confidenceResult.reviewRequired,
      persisted,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});