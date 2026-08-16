import { describe, expect, it } from 'vitest';
import {
  persistResearchKnowledge,
  researchKnowledgePersistencePlan,
} from '../../base44/shared/researchKnowledgePersistence.ts';

function service() {
  const store = {
    IntelligenceEvidence: [],
    IntelligenceObservation: [],
    KnowledgeConflict: [],
  };
  let serial = 0;
  const entities = Object.fromEntries(Object.keys(store).map((name) => [name, {
    async filter(query) {
      return store[name].filter((row) => Object.entries(query).every(([key, value]) => row[key] === value));
    },
    async create(row) {
      const created = { id: `${name}-${++serial}`, ...row, created_date: new Date().toISOString() };
      store[name].push(created);
      return created;
    },
  }]));
  return { entities, store };
}

describe('research knowledge canonical persistence', () => {
  it('reuses only existing candidate ledgers and never operational truth tables', () => {
    expect(researchKnowledgePersistencePlan()).toMatchObject({
      evidence_documents: 9,
      candidate_observations: 31,
      structured_conflicts: 9,
      canonical_entities_reused: ['IntelligenceEvidence', 'IntelligenceObservation', 'KnowledgeConflict'],
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
  });

  it('persists documents, normalized candidate observations and conflicts idempotently', async () => {
    const svc = service();
    const first = await persistResearchKnowledge(svc);
    expect(first).toMatchObject({
      status: 'PERSISTED_CANDIDATE_KNOWLEDGE_ONLY',
      evidence: { created: 9, deduplicated: 0 },
      observations: { created: 31, deduplicated: 0 },
      conflicts: { created: 9, deduplicated: 0 },
    });
    expect(svc.store.IntelligenceEvidence).toHaveLength(9);
    expect(svc.store.IntelligenceObservation).toHaveLength(31);
    expect(svc.store.KnowledgeConflict).toHaveLength(9);
    expect(svc.store.IntelligenceEvidence.every((row) => row.truth_level === 'inferred')).toBe(true);
    expect(svc.store.IntelligenceObservation.every((row) => row.status === 'candidate')).toBe(true);
    const second = await persistResearchKnowledge(svc);
    expect(second).toMatchObject({
      evidence: { created: 0, deduplicated: 9 },
      observations: { created: 0, deduplicated: 31 },
      conflicts: { created: 0, deduplicated: 9 },
    });
  });

  it('fails closed on ambiguous canonical evidence instead of double-writing', async () => {
    const svc = service();
    await persistResearchKnowledge(svc);
    svc.store.IntelligenceEvidence.push({ ...svc.store.IntelligenceEvidence[0], id: 'duplicate' });
    await expect(persistResearchKnowledge(svc)).rejects.toThrow('research_evidence_deduplication_ambiguous');
  });

  it('fails closed when an existing conflict row was changed after canonical sync', async () => {
    const svc = service();
    await persistResearchKnowledge(svc);
    svc.store.KnowledgeConflict[0].reason = 'TAMPERED_STALE_REASON';
    await expect(persistResearchKnowledge(svc)).rejects.toThrow('research_conflict_content_conflict');
  });

  it('retains all evidence links for multi-source observations and conflicts', async () => {
    const svc = service();
    await persistResearchKnowledge(svc);
    const event = svc.store.IntelligenceObservation.find((row) => row.observation_key === 'research-record:rk-gtm-2026-time-bound-events');
    expect(event.normalized_json.source_document_ids).toEqual(['GTM-FINAL', 'R1']);
    expect(event.normalized_json.source_evidence_ids).toHaveLength(2);
    const countryConflict = svc.store.KnowledgeConflict.find((row) => row.conflict_key === 'research-conflict:country-universe-33');
    expect(countryConflict.evidence_ids.length).toBeGreaterThanOrEqual(5);
  });
});
