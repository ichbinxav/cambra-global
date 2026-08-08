// eclProcessEvidence — v62.6 ECL P3 closure (2026-08-08).
//
// THE ONLY I/O boundary of the Evidence Lifecycle Engine. Everything decided
// here is decided by the PURE engine in base44/shared/generated/eclDomain.ts
// (generated from the canonical src/lib modules); this handler only:
//   1. authenticates — action "process" is ADMIN-ONLY; action "attest" is
//      OWNER-ONLY (the attestor is the merchant the evidence belongs to,
//      NEVER the processing admin: an attestation is a legal declaration by
//      its author, not an operational side effect of processing),
//   2. loads the real state (record, siblings, attestations, strikes, review
//      cases, baseline) with the service role,
//   3. injects `now` (the I/O layer owns the clock, the engine never does),
//   4. persists the engine's record INTENTS idempotently (see createOnce).
//
// LIFECYCLE PERSISTENCE (v62.6): confidence_result is ALWAYS the canonical
// snapshot built by buildPersistedEvidenceSnapshot, and confidence_result_hash
// hashes EXACTLY that persisted object. The snapshot carries a `lifecycle`
// block (status, provisional window, supersession) because SavingsEvidence's
// frozen schema has no top-level lifecycle columns — persist → reload →
// process round-trips identically for both entity types.
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
  resolveAttestationChecksum,
  buildPersistedEvidenceSnapshot,
  restoreLifecycleFromSnapshot,
  markSnapshotSuperseded,
} from '../../shared/generated/eclDomain.ts';
import { ECL_POLICY } from '../../shared/generated/eclPolicy.ts';
import { badRequest, createOnce, persistLifecycleEvent } from '../../shared/eclPersistence.ts';

const ENTITY_BY_TYPE = { statement_import: 'StatementImport', savings_evidence: 'SavingsEvidence' };
const NORMALIZERS = {
  payments: normalizePaymentsEvidence,
  commerce: normalizeCommerceEvidence,
  accounting: normalizeAccountingEvidence,
};

// v62.7 (P4) — badRequest / createOnce / persistLifecycleEvent now live in ONE
// shared module so the idempotent-create contract cannot drift between the ECL
// boundaries. The guarantee is documented there and is unchanged: replay-safe
// with best-effort concurrent collapse, never transactional exactly-once.

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
      // ATTESTOR SEMANTICS (v62.6): the attestation is the declaration of the
      // merchant who OWNS the evidence. Only the owner's authenticated session
      // may attest; an admin who processes evidence never becomes its attestor.
      if (user.email !== ownerEmail) {
        return Response.json({ ok: false, error: 'only the evidence owner may attest — a processing admin is not the attestor' }, { status: 403 });
      }
      // v62.6 closure — evidence binding is SERVER-RESOLVED ONLY: the
      // authoritative checksum comes exclusively from the stored evidence
      // record. No stored checksum → fail CLOSED (422); a payload claiming a
      // different artifact → 409. A client-supplied checksum is NEVER accepted
      // as the authoritative binding, not even when the record carries none.
      const checksumResolution = resolveAttestationChecksum(record.checksum, payload.evidenceChecksum);
      if (checksumResolution.ok !== true) {
        return Response.json({ ok: false, error: checksumResolution.reason, code: checksumResolution.code }, { status: checksumResolution.status });
      }
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
        evidenceChecksum: checksumResolution.checksum,
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

    // ── action: process (ADMIN-ONLY) ────────────────────────────────────────
    if (payload.action !== 'process') return badRequest('action must be "process" or "attest"');
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    const normalize = NORMALIZERS[payload.domain];
    if (!normalize) return badRequest('domain must be payments, commerce or accounting');
    const evidence = normalize(payload.evidence || {});

    // Real state, loaded — never assumed. StatementImport carries top-level
    // lifecycle columns (P1); SavingsEvidence restores its lifecycle from the
    // canonical persisted snapshot's `lifecycle` block (legacy snapshots fall
    // back to the stored confidenceResult.evidenceStatus).
    const priorSnapshot = record.confidence_result && typeof record.confidence_result === 'object' ? record.confidence_result : null;
    const restored = restoreLifecycleFromSnapshot(priorSnapshot);
    const state =
      payload.evidenceEntityType === 'statement_import'
        ? {
            status: record.evidence_status || (restored && restored.status) || 'pending',
            provisionalStartedAt: record.provisional_started_at || (restored && restored.provisionalStartedAt) || null,
            expiresAt: record.expires_at || (restored && restored.expiresAt) || null,
          }
        : {
            status: (restored && restored.status) || 'pending',
            provisionalStartedAt: (restored && restored.provisionalStartedAt) || null,
            expiresAt: (restored && restored.expiresAt) || null,
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
      .map((s) => {
        const sr = restoreLifecycleFromSnapshot(s.confidence_result);
        return {
          id: s.id,
          // A superseded sibling restores as superseded and is therefore never
          // treated as live competing evidence by reconciliation.
          status:
            (payload.evidenceEntityType === 'statement_import' ? s.evidence_status : null) ||
            (sr && sr.status) ||
            'pending',
          evidence: s.confidence_result.normalizedEvidence,
        };
      });

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
      // Mark the superseded record itself so the status SURVIVES reload:
      // StatementImport via its top-level columns, SavingsEvidence via its
      // canonical persisted snapshot (lifecycle.status = superseded).
      if (payload.evidenceEntityType === 'statement_import') {
        await svc.entities.StatementImport.update(sup.record.evidence_id, { evidence_status: 'superseded', superseded_by_id: payload.evidenceId }).catch(() => null);
      } else {
        const sib = (siblings || []).find((s) => s && s.id === sup.record.evidence_id);
        if (sib && sib.confidence_result && typeof sib.confidence_result === 'object') {
          const marked = markSnapshotSuperseded(sib.confidence_result, payload.evidenceId);
          await svc.entities.SavingsEvidence.update(sup.record.evidence_id, { confidence_result: marked.snapshot, confidence_result_hash: marked.snapshotHash }).catch(() => null);
        }
      }
    }
    for (const rc of decision.reviewCaseIntents) {
      persisted.reviewCases.push(await createOnce(svc, 'ReviewCase', rc.idempotencyKey, rc.record));
    }
    for (const st of decision.strikeIntents) {
      persisted.strikes.push(await createOnce(svc, 'EvidenceStrike', st.idempotencyKey, st.record));
    }

    // ── Update the evidence record itself (P1 fields only, schemas untouched) ─
    // confidence_result_hash hashes EXACTLY the persisted confidence_result.
    const toStatus = decision.transition ? decision.transition.toStatus : state.status;
    const lifecycle = {
      status: toStatus,
      provisionalStartedAt: decision.provisional ? decision.provisional.startedAt : state.provisionalStartedAt,
      expiresAt: decision.provisional ? decision.provisional.expiresAt : state.expiresAt,
      supersededById: null,
    };
    const { snapshot, snapshotHash } = buildPersistedEvidenceSnapshot(decision, evidence, lifecycle);
    if (payload.evidenceEntityType === 'statement_import') {
      const update = {
        evidence_status: toStatus,
        confidence_result: snapshot,
        confidence_result_hash: snapshotHash,
        ...(decision.provisional
          ? { provisional_started_at: decision.provisional.startedAt, expires_at: decision.provisional.expiresAt }
          : {}),
      };
      await svc.entities.StatementImport.update(payload.evidenceId, update);
    } else {
      await svc.entities.SavingsEvidence.update(payload.evidenceId, {
        confidence_result: snapshot,
        confidence_result_hash: snapshotHash,
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
      confidenceResultHash: snapshotHash,
      confidenceLevel: decision.confidenceResult.confidenceLevel,
      freezeEligibility: decision.confidenceResult.freezeEligibility,
      reviewRequired: decision.confidenceResult.reviewRequired,
      persisted,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});