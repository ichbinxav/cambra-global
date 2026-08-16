import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  GLOBAL_INTELLIGENCE_SCOPE_ALLOWLIST,
  intelligenceScopeHashMaterial,
  sameIntelligenceTenantBinding,
  scopedIntelligenceKey,
  validateIntelligenceTenantScope,
  validateStoredIntelligenceRecord,
} from '../../base44/shared/intelligenceTenantScope.ts';
import { sha256 } from '../../base44/shared/intelligenceCore.ts';
import { buildOutcomeCalibration } from '../../base44/shared/outcomeCalibration.ts';

const read = (path) => fs.readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));

const governedTenantEvidence = (brand_id = 'brand-a') => ({
  tenant_scope: 'tenant',
  brand_id,
  domain: 'merchant_payments',
  purpose: 'merchant_payment_analysis',
  retention_policy_key: 'intelligence_tenant_evidence',
  legal_basis: 'contractual_necessity',
});

const governedGlobalEvidence = {
  tenant_scope: 'global',
  domain: 'rate_intelligence',
  purpose: 'official_provider_pricing_research',
  retention_policy_key: 'intelligence_public_research',
  legal_basis: 'public_information',
};

describe('Intelligence tenant/privacy P0 boundary', () => {
  it('requires explicit tenant scope and a tenant brand without inferring either', () => {
    expect(validateIntelligenceTenantScope({}, 'claim')).toEqual({ ok: false, error: 'tenant_scope_required' });
    expect(validateIntelligenceTenantScope({ tenant_scope: 'tenant' }, 'outcome')).toEqual({
      ok: false,
      error: 'brand_id_required_for_tenant_scope',
    });
    expect(validateIntelligenceTenantScope({ tenant_scope: 'tenant', brand_id: '_platform' }, 'claim')).toEqual({
      ok: false,
      error: 'platform_brand_not_valid_tenant',
    });
  });

  it('requires purpose, retention policy and legal basis on every new evidence row', () => {
    const base = { tenant_scope: 'tenant', brand_id: 'brand-a' };
    expect(validateIntelligenceTenantScope(base, 'evidence')).toMatchObject({ ok: false, error: 'purpose_required' });
    expect(validateIntelligenceTenantScope({ ...base, purpose: 'analysis' }, 'evidence')).toMatchObject({
      ok: false,
      error: 'retention_policy_key_required',
    });
    expect(validateIntelligenceTenantScope({ ...base, purpose: 'analysis', retention_policy_key: 'tenant-policy' }, 'evidence')).toMatchObject({
      ok: false,
      error: 'legal_basis_required',
    });
    expect(validateIntelligenceTenantScope(governedTenantEvidence(), 'evidence')).toMatchObject({
      ok: true,
      scope_key: 'tenant:brand-a',
    });
  });

  it('allows global only for an exact platform domain/purpose policy and never for raw outcomes', () => {
    expect(GLOBAL_INTELLIGENCE_SCOPE_ALLOWLIST.length).toBeGreaterThan(0);
    expect(validateIntelligenceTenantScope(governedGlobalEvidence, 'evidence')).toMatchObject({
      ok: true,
      scope_key: 'global:rate_intelligence:official_provider_pricing_research',
    });
    expect(validateIntelligenceTenantScope({ ...governedGlobalEvidence, purpose: 'train_everything' }, 'evidence')).toMatchObject({
      ok: false,
      error: 'global_scope_domain_purpose_not_allowed',
    });
    expect(validateIntelligenceTenantScope({ ...governedGlobalEvidence, brand_id: 'brand-a' }, 'evidence')).toMatchObject({
      ok: false,
      error: 'brand_id_forbidden_for_global_scope',
    });
    expect(validateIntelligenceTenantScope({ ...governedGlobalEvidence }, 'outcome')).toMatchObject({
      ok: false,
      error: 'global_scope_domain_purpose_not_allowed',
    });
    expect(validateIntelligenceTenantScope({
      tenant_scope: 'global',
      domain: 'research_knowledge',
      purpose: 'external_research_ingestion',
      retention_policy_key: 'intelligence_public_research',
      legal_basis: 'public_information',
    }, 'evidence')).toMatchObject({
      ok: true,
      scope_key: 'global:research_knowledge:external_research_ingestion',
    });
    expect(validateIntelligenceTenantScope({
      tenant_scope: 'global',
      domain: 'research_knowledge',
      purpose: 'external_research_ingestion',
    }, 'outcome')).toMatchObject({
      ok: false,
      error: 'global_scope_domain_purpose_not_allowed',
    });
  });

  it('namespaces keys and hashes so tenant A and tenant B cannot collide', async () => {
    const a = governedTenantEvidence('tenant-a');
    const b = governedTenantEvidence('tenant-b');
    const keyA = scopedIntelligenceKey('same-upstream-key', a, 'evidence');
    const keyB = scopedIntelligenceKey('same-upstream-key', b, 'evidence');
    expect(keyA.ok && keyB.ok).toBe(true);
    expect(keyA.key).not.toBe(keyB.key);
    const materialA = intelligenceScopeHashMaterial(a, 'evidence');
    const materialB = intelligenceScopeHashMaterial(b, 'evidence');
    expect(materialA.ok && materialB.ok).toBe(true);
    expect(await sha256({ ...materialA.material, payload: { amount: 10 } })).not.toBe(
      await sha256({ ...materialB.material, payload: { amount: 10 } }),
    );
    expect(sameIntelligenceTenantBinding(a, b, 'evidence')).toBe(false);
    expect(sameIntelligenceTenantBinding(a, { ...a }, 'evidence')).toBe(true);
  });

  it('treats ambiguous legacy rows as invalid instead of inventing global scope', () => {
    expect(validateStoredIntelligenceRecord({ brand_id: 'tenant-a' }, 'outcome')).toMatchObject({
      ok: false,
      error: 'tenant_scope_required',
    });
    expect(validateStoredIntelligenceRecord({ tenant_scope: 'global', domain: 'unknown', purpose: 'unknown' }, 'claim')).toMatchObject({
      ok: false,
      error: 'global_scope_domain_purpose_not_allowed',
    });
  });

  it('excludes legacy ambiguous outcomes from privacy-safe descriptive aggregation', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      tenant_scope: 'tenant',
      brand_id: `tenant-${index}`,
      realized_savings: 100 + index,
      currency: 'EUR',
      success: true,
      is_demo: false,
    }));
    rows.push({ brand_id: 'legacy-without-scope', realized_savings: 999999, currency: 'EUR', success: true });
    const aggregate = buildOutcomeCalibration(rows, { currency: 'EUR' });
    expect(aggregate).toMatchObject({ suppressed: false, n: 10, observation_count: 10 });
    expect(aggregate.aggregate.median_realized_savings).toBe(104.5);
  });

  it('requires scope in every canonical Intelligence entity schema', () => {
    for (const name of ['IntelligenceEvidence', 'IntelligenceObservation', 'KnowledgeClaim', 'IntelligenceOutcome']) {
      const schema = json(`base44/entities/${name}.jsonc`);
      expect(schema.properties.tenant_scope).toBeTruthy();
      expect(schema.required).toContain('tenant_scope');
    }
    const evidence = json('base44/entities/IntelligenceEvidence.jsonc');
    for (const field of ['purpose', 'retention_policy_key', 'legal_basis']) {
      expect(evidence.properties[field]).toBeTruthy();
      expect(evidence.required).toContain(field);
    }
    expect(json('base44/entities/KnowledgeClaim.jsonc').properties.brand_id).toBeTruthy();
  });

  it('binds canonical writes, dedupe, peer lookup, supersession and admin mutation to scope', () => {
    const access = read('base44/functions/intelligenceAccess/entry.ts');
    const admin = read('base44/functions/intelligenceAdmin/entry.ts');
    const integrity = read('base44/functions/knowledgeIntegrityWorker/entry.ts');
    const scope = read('base44/shared/intelligenceTenantScope.ts');
    expect(access).toContain('intelligenceScopeHashMaterial');
    expect(access).toContain('intelligenceScopeFilter');
    expect(access).toContain("{ ...scopeQuery.filter, semantic_key: x.semantic_key }");
    expect(access).toContain('supersedes_claim_id: validPeers[0]?.id');
    expect(access).not.toContain("tenant_scope:x.brand_id?'tenant':'global'");
    expect(admin).toContain('claim_tenant_binding_mismatch');
    expect(admin).toContain('legacy_claim_scope_ambiguous');
    expect(scope).toContain('LEGACY_SCOPE_AMBIGUOUS');
    expect(integrity).toContain('QUARANTINE_WITHOUT_INFERENCE');
  });
});
