import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const catalog = JSON.parse(fs.readFileSync('config/intelligence/research-knowledge.v1.json', 'utf8'));
const conflicts = JSON.parse(fs.readFileSync('config/intelligence/research-conflicts.v1.json', 'utf8'));

describe('curated external research catalog', () => {
  it('normalizes every candidate without granting execution or learning authority', () => {
    expect(catalog.records).toHaveLength(31);
    for (const row of catalog.records) {
      expect(row).toMatchObject({
        execution_eligible: false,
        training_eligible: false,
        model_input_eligible: false,
        calibration_eligible: false,
        auto_promote_eligible: false,
      });
      expect(row.source_sha256.length).toBeGreaterThan(0);
      expect(row.target_systems).toContain('AgentRetrieval');
      expect(row.truth_level).toEqual(expect.any(String));
      expect(row.provenance_status).toEqual(expect.any(String));
    }
  });

  it('connects candidates to existing systems without writing operational truth', () => {
    const targets = new Set(catalog.records.flatMap((row) => row.target_systems));
    for (const target of ['PaymentsRateTableCandidate', 'CPICPriorCandidate', 'CountryPaymentsEconomics', 'NegotiationPrior', 'RegulatoryEvidenceQueue', 'AgentRetrieval']) {
      expect(targets.has(target)).toBe(true);
    }
    expect(catalog.safety_contract.unresolved_rate_can_target_payments_rate_table).toBe(false);
    expect(catalog.catalog_status).toBe('CURATED_NON_EXECUTABLE');
  });

  it('makes every contradiction visible and blocking', () => {
    expect(conflicts.conflicts.length).toBeGreaterThanOrEqual(8);
    expect(conflicts.conflicts.every((row) => row.execution_blocked && row.training_blocked)).toBe(true);
    expect(conflicts.conflicts.map((row) => row.conflict_type)).toEqual(expect.arrayContaining([
      'EXACT_DUPLICATE',
      'INCOMPATIBLE_SCOPE_DEFINITION',
      'CONTRADICTORY_PROPOSED_POLICY',
      'UNIT_AND_SEMANTIC_COLLISION',
      'UNRESOLVED_PROVENANCE',
      'MISSING_ARTIFACT',
    ]));
  });
});
