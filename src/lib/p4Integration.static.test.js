import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

describe('P3/P4/P5 bridge boundary', () => {
  it('projects verified aggregate measurements without writing P4 output into P3', () => {
    const source = read('base44/functions/projectVerifiedPaymentsToP4/entry.ts');
    expect(source).toContain('P4EvidenceProjection.create');
    expect(source).not.toContain('ProviderPricingVersion.create');
    expect(source).not.toContain('ProviderPricingVersion.update');
  });
  it('requires the canonical admin/internal trust gate on both bridge functions', () => {
    for (const path of ['base44/functions/projectVerifiedPaymentsToP4/entry.ts', 'base44/functions/requestP4Estimate/entry.ts']) expect(read(path)).toContain('requireAdminOrInternal');
  });
  it('requires a keyed pseudonym and refuses a missing P4 service configuration', () => {
    const source = read('base44/shared/p4Bridge.ts');
    expect(source).toContain('P4_PSEUDONYMIZATION_KEY');
    expect(source).toContain('p4_service_url_not_configured');
    expect(source).toContain('p4_private_evidence_response_forbidden');
  });
  it('persists statistical P4 output separately from P3 truth', () => {
    const schema = JSON.parse(read('base44/entities/P4StatisticalEstimate.jsonc'));
    expect(schema.description).toMatch(/never factual P3 rate truth/i);
  });
});
