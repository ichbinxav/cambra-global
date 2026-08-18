// AUDIT 2026-08-18 — see researchKnowledge.ts: config/ is outside the function
// bundle, so the identical bytes are consumed from the generated artifact.
import {
  RESEARCH_KNOWLEDGE_CATALOG,
  RESEARCH_KNOWLEDGE_CONFLICTS,
} from "./generated/researchKnowledgeConfig.ts";
import {
  RESEARCH_KNOWLEDGE_DOCUMENTS,
} from "./generated/researchKnowledgeDocuments.ts";
import { sha256 } from "./intelligenceCore.ts";

export const RESEARCH_KNOWLEDGE_PERSISTENCE_VERSION = "research-knowledge-persistence.v1";
const SCOPE = Object.freeze({
  tenant_scope: "global",
  domain: "research_knowledge",
  purpose: "external_research_ingestion",
});

type AnyRecord = Record<string, any>;

const text = (value: unknown, limit = 1_000) => String(value ?? "").trim().slice(0, limit);
const rows = (value: unknown) => Array.isArray(value) ? value : [];

async function strictFilter(
  svc: any,
  entity: string,
  filter: AnyRecord,
  sort: string,
  limit: number,
) {
  const result = await svc.entities[entity].filter(filter, sort, limit);
  if (!Array.isArray(result)) throw Object.assign(new Error(`research_${entity}_read_unavailable`), { status: 503 });
  // Every caller performs an exact-cardinality read with limit=2. Two rows
  // already prove ambiguity, even if more rows may exist, so let the caller
  // emit its domain-specific deduplication/post-commit error.
  return result;
}

async function exactSingleAfterCreate(
  svc: any,
  entity: string,
  filter: AnyRecord,
  createdId: string,
) {
  const observed = await strictFilter(svc, entity, filter, "-created_date", 2);
  if (observed.length !== 1 || String(observed[0]?.id || "") !== String(createdId || "")) {
    throw Object.assign(new Error(`research_${entity}_postcommit_ambiguous`), { status: 409 });
  }
}

function evidenceInput(document: AnyRecord, observedAt: string) {
  const sourceReference = `repo://${text(document.primary_path, 900)}#sha256=${text(document.document_sha256, 80)}`;
  const captureDate = /^\d{4}-\d{2}-\d{2}$/.test(String(document.capture_date || ""))
    ? String(document.capture_date)
    : "1970-01-01";
  const sourceObservedAt = `${captureDate}T00:00:00.000Z`;
  return {
    ...SCOPE,
    evidence_key: `research-source:${document.document_sha256}`,
    source_type: "market_source",
    source_reference: sourceReference,
    source_url: rows(document.source_urls)[0] || undefined,
    source_name: document.title,
    source_quality: rows(document.source_urls).length ? "UNVERIFIED" : "UNVERIFIED",
    // The source observation time is part of the immutable evidence identity.
    // Ingestion wall-clock time belongs in recorded_at and must not create a
    // second evidence row when the same byte-identical corpus is synchronized.
    observed_at: sourceObservedAt,
    effective_at: sourceObservedAt,
    truth_level: "inferred",
    confidence: 0,
    parser_version: RESEARCH_KNOWLEDGE_PERSISTENCE_VERSION,
    retention_policy_key: "intelligence_public_research",
    legal_basis: "public_information",
    verification_status: "PENDING_REVIEW",
    freshness_status: "UNKNOWN",
    payload_json: {
      source_id: document.source_id,
      document_sha256: document.document_sha256,
      canonical_sha256: document.canonical_sha256,
      capture_date: document.capture_date,
      title: document.title,
      stored_path: document.primary_path,
      aliases: rows(document.aliases),
      byte_count: document.byte_count,
      line_count: document.line_count,
      topics: rows(document.topics),
      source_urls: rows(document.source_urls),
      opaque_citation_count: rows(document.opaque_citations).length,
      external_research_untrusted: true,
      executable: false,
      training_eligible: false,
      model_eligible: false,
      calibration_eligible: false,
    },
    is_demo: false,
    quarantined: false,
  };
}

async function persistDocumentEvidence(svc: any, document: AnyRecord, observedAt: string) {
  const input = evidenceInput(document, observedAt);
  const evidenceHash = await sha256({
    ...SCOPE,
    source_type: input.source_type,
    source_reference: input.source_reference,
    payload: input.payload_json,
    effective_at: input.effective_at,
    observed_at: input.observed_at,
  });
  const filter = { ...SCOPE, evidence_hash: evidenceHash };
  const existing = await strictFilter(svc, "IntelligenceEvidence", filter, "-created_date", 2);
  if (existing.length > 1) throw Object.assign(new Error("research_evidence_deduplication_ambiguous"), { status: 409 });
  if (existing[0]) return { id: existing[0].id, deduplicated: true, input };
  const created = await svc.entities.IntelligenceEvidence.create({
    ...input,
    evidence_hash: evidenceHash,
    content_hash: await sha256({ ...SCOPE, payload: input.payload_json }),
    recorded_at: observedAt,
  });
  await exactSingleAfterCreate(svc, "IntelligenceEvidence", filter, created.id);
  return { id: created.id, deduplicated: false, input };
}

function observationInput(record: AnyRecord, evidenceIds: string[], observedAt: string) {
  const sourceDocumentIds = rows(record.source_document_ids).map((value) => text(value, 80));
  const canonicalEvidenceIds = [...new Set(evidenceIds.map((value) => text(value, 180)).filter(Boolean))].sort();
  const evidenceId = canonicalEvidenceIds[0];
  return {
    ...SCOPE,
    observation_key: `research-record:${text(record.id, 180)}`,
    evidence_id: evidenceId,
    observation_type: `external_research_${text(record.record_type, 120).toLowerCase()}`,
    semantic_key: `research:${text(record.domain, 120)}:${text(record.topic, 180)}:${text(record.id, 180)}`,
    effective_at: record.effective_from ? `${record.effective_from}T00:00:00.000Z` : undefined,
    observed_at: observedAt,
    truth_level: "inferred",
    confidence: Math.max(0, Math.min(1, Number(record.confidence || 0))),
    normalized_json: {
      ...record,
      compiled_truth_level: record.truth_level,
      source_document_ids: sourceDocumentIds,
      source_evidence_ids: canonicalEvidenceIds,
      external_research_untrusted: true,
      operational_projection_status: "CANDIDATE_ONLY",
      execution_eligible: false,
      training_eligible: false,
      model_input_eligible: false,
      calibration_eligible: false,
      auto_promote_eligible: false,
    },
    parser_version: RESEARCH_KNOWLEDGE_PERSISTENCE_VERSION,
    status: "candidate",
    is_demo: false,
  };
}

async function persistObservation(svc: any, record: AnyRecord, evidenceIds: string[], observedAt: string) {
  const input = observationInput(record, evidenceIds, observedAt);
  const filter = { ...SCOPE, observation_key: input.observation_key };
  const existing = await strictFilter(svc, "IntelligenceObservation", filter, "-created_date", 2);
  if (existing.length > 1) throw Object.assign(new Error("research_observation_deduplication_ambiguous"), { status: 409 });
  if (existing[0]) {
    const same = await sha256(existing[0].normalized_json || {}) === await sha256(input.normalized_json);
    if (!same || String(existing[0].evidence_id || "") !== String(input.evidence_id)) {
      throw Object.assign(new Error("research_observation_content_conflict"), { status: 409 });
    }
    return { id: existing[0].id, deduplicated: true };
  }
  const created = await svc.entities.IntelligenceObservation.create(input);
  await exactSingleAfterCreate(svc, "IntelligenceObservation", filter, created.id);
  return { id: created.id, deduplicated: false };
}

function conflictInput(conflict: AnyRecord, evidenceIds: string[], observedAt: string) {
  const conflictKey = text(conflict.conflict_id, 220);
  return {
    conflict_key: conflictKey,
    semantic_key: `research:${text(conflict.conflict_type, 160)}:${conflictKey}`,
    vertical: "research_knowledge",
    claim_ids: [],
    evidence_ids: [...new Set(evidenceIds.map((value) => text(value, 180)).filter(Boolean))].sort(),
    status: String(conflict.status || "").startsWith("RESOLVED_") ? "expected_variation" : "open",
    severity: ["info", "warning", "critical"].includes(conflict.severity) ? conflict.severity : "warning",
    reason: text(conflict.reason, 1_000),
    resolution_json: {
      source_document_ids: rows(conflict.source_document_ids),
      record_ids: rows(conflict.record_ids),
      source_status: conflict.status,
      operational_effect: conflict.operational_effect,
      execution_blocked: true,
      training_blocked: true,
      catalog_version: RESEARCH_KNOWLEDGE_PERSISTENCE_VERSION,
    },
    affects_active_operation: false,
    created_at: observedAt,
  };
}

const conflictContent = (row: AnyRecord) => ({
  conflict_key: row.conflict_key,
  semantic_key: row.semantic_key,
  vertical: row.vertical,
  claim_ids: rows(row.claim_ids),
  evidence_ids: rows(row.evidence_ids).map((value) => text(value, 180)).sort(),
  status: row.status,
  severity: row.severity,
  reason: row.reason,
  resolution_json: row.resolution_json,
  affects_active_operation: row.affects_active_operation,
});

async function persistConflict(svc: any, conflict: AnyRecord, evidenceIds: string[], observedAt: string) {
  const input = conflictInput(conflict, evidenceIds, observedAt);
  const conflictKey = input.conflict_key;
  const existing = await strictFilter(svc, "KnowledgeConflict", { conflict_key: conflictKey }, "-created_at", 2);
  if (existing.length > 1) throw Object.assign(new Error("research_conflict_deduplication_ambiguous"), { status: 409 });
  if (existing[0]) {
    if (await sha256(conflictContent(existing[0])) !== await sha256(conflictContent(input))) {
      throw Object.assign(new Error("research_conflict_content_conflict"), { status: 409 });
    }
    return { id: existing[0].id, deduplicated: true };
  }
  const created = await svc.entities.KnowledgeConflict.create(input);
  await exactSingleAfterCreate(svc, "KnowledgeConflict", { conflict_key: conflictKey }, created.id);
  return { id: created.id, deduplicated: false };
}

export function researchKnowledgePersistencePlan() {
  const targetSystems = Object.fromEntries(
    [...new Set((RESEARCH_KNOWLEDGE_CATALOG.records as readonly AnyRecord[])
      .flatMap((record) => rows(record.target_systems).map((target) => text(target, 120))))]
      .filter(Boolean)
      .sort()
      .map((target) => [
        target,
        (RESEARCH_KNOWLEDGE_CATALOG.records as readonly AnyRecord[])
          .filter((record) => rows(record.target_systems).map((value) => text(value, 120)).includes(target)).length,
      ]),
  );
  return Object.freeze({
    version: RESEARCH_KNOWLEDGE_PERSISTENCE_VERSION,
    evidence_documents: RESEARCH_KNOWLEDGE_DOCUMENTS.length,
    candidate_observations: RESEARCH_KNOWLEDGE_CATALOG.records.length,
    structured_conflicts: RESEARCH_KNOWLEDGE_CONFLICTS.conflicts.length,
    target_system_candidate_counts: targetSystems,
    canonical_entities_reused: ["IntelligenceEvidence", "IntelligenceObservation", "KnowledgeConflict"],
    operational_entities_written: [],
    payments_rate_table_written: false,
    provider_pricing_version_written: false,
    regulatory_policy_written: false,
    cpic_model_or_prior_written: false,
    knowledge_claim_written: false,
    execution_authority: false,
    training_eligible: false,
    model_eligible: false,
    calibration_eligible: false,
  });
}

export async function persistResearchKnowledge(svc: any) {
  const observedAt = new Date().toISOString();
  const evidenceByDocId = new Map<string, string>();
  let evidenceCreated = 0;
  let evidenceDeduplicated = 0;
  for (const document of RESEARCH_KNOWLEDGE_DOCUMENTS as readonly AnyRecord[]) {
    const result = await persistDocumentEvidence(svc, document, observedAt);
    for (const meta of RESEARCH_KNOWLEDGE_CATALOG.source_documents as readonly AnyRecord[]) {
      if (meta.sha256 === document.document_sha256) evidenceByDocId.set(meta.doc_id, result.id);
    }
    result.deduplicated ? evidenceDeduplicated++ : evidenceCreated++;
  }

  let observationsCreated = 0;
  let observationsDeduplicated = 0;
  for (const record of RESEARCH_KNOWLEDGE_CATALOG.records as readonly AnyRecord[]) {
    const sourceDocIds = rows(record.source_document_ids).map((value) => text(value, 80)).filter(Boolean);
    const evidenceIds = sourceDocIds.map((docId) => evidenceByDocId.get(docId)).filter(Boolean) as string[];
    if (!sourceDocIds.length || evidenceIds.length !== sourceDocIds.length) {
      throw Object.assign(new Error(`research_record_evidence_missing:${record.id}`), { status: 409 });
    }
    const result = await persistObservation(svc, record, evidenceIds, observedAt);
    result.deduplicated ? observationsDeduplicated++ : observationsCreated++;
  }

  let conflictsCreated = 0;
  let conflictsDeduplicated = 0;
  for (const conflict of RESEARCH_KNOWLEDGE_CONFLICTS.conflicts as readonly AnyRecord[]) {
    const sourceDocIds = rows(conflict.source_document_ids).map((value) => text(value, 80)).filter(Boolean);
    const evidenceIds = sourceDocIds.map((docId) => evidenceByDocId.get(docId)).filter(Boolean) as string[];
    if (sourceDocIds.length && evidenceIds.length !== sourceDocIds.length) {
      throw Object.assign(new Error(`research_conflict_evidence_missing:${conflict.conflict_id}`), { status: 409 });
    }
    const result = await persistConflict(svc, conflict, evidenceIds, observedAt);
    result.deduplicated ? conflictsDeduplicated++ : conflictsCreated++;
  }

  return Object.freeze({
    ok: true,
    status: "PERSISTED_CANDIDATE_KNOWLEDGE_ONLY",
    observed_at: observedAt,
    evidence: { created: evidenceCreated, deduplicated: evidenceDeduplicated },
    observations: { created: observationsCreated, deduplicated: observationsDeduplicated },
    conflicts: { created: conflictsCreated, deduplicated: conflictsDeduplicated },
    ...researchKnowledgePersistencePlan(),
  });
}