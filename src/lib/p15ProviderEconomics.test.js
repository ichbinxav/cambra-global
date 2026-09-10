import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PSP_COMPENSATION_ACCEPTED,
  PROVIDER_MONETIZATION_PRODUCTION_ALLOWED,
  providerExpectedRevenueMinor,
  providerEconomicsScore,
  providerRevenueAmountMinor,
} from '../../base44/shared/providerEconomicsCore.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const DISABLED = [
  "base44/functions/providerMonetizationAgent/entry.ts",
  "base44/functions/approveProviderMonetizationLegalReview/entry.ts",
  "base44/functions/providerRevenueAttributionWorker/entry.ts",
  "base44/functions/providerRevenueLifecycleWorker/entry.ts",
  "base44/functions/providerRevenueTierWorker/entry.ts",
  "base44/functions/providerRevenueReconciliationWorker/entry.ts",
  "base44/functions/providerRevenueBillingWorker/entry.ts",
  "base44/functions/providerRevenueRecoveryAgent/entry.ts",
  "base44/functions/recordProviderRevenueInvoiceIssued/entry.ts",
  "base44/functions/recordProviderRevenuePayment/entry.ts",
  "base44/functions/providerEconomicsAssessmentWorker/entry.ts",
  "base44/functions/providerEconomicsIntelligenceWorker/entry.ts",
  "base44/functions/getProviderEconomicsCommandCenter/entry.ts"
];

describe('PSP no-compensation policy', () => {
  it('fails closed at the canonical economics layer', () => {
    expect(PSP_COMPENSATION_ACCEPTED).toBe(false);
    expect(PROVIDER_MONETIZATION_PRODUCTION_ALLOWED).toBe(false);
    expect(providerExpectedRevenueMinor({ percentage: 99 }, 36)).toBe(0);
    expect(providerEconomicsScore({ percentage: 99 })).toBe(0);
    expect(providerRevenueAmountMinor(100_000_000, { rate_bps: 500, percentage: 50, fixed_fee_minor: 1_000_000 })).toBe(0);
  });

  it.each(DISABLED)('%s is guarded before any legacy mutation', (file) => {
    const source = read(file);
    expect(source).toContain('PSP_COMPENSATION_DISABLED_BY_POLICY');
    expect(source).toContain('providerCompensationDisabledResponse');
  });

  it('does not open a provider-monetization phase after merchant pricing', () => {
    const source = read('base44/functions/collectiveNegotiationAgent/entry.ts');
    expect(source).not.toContain("invoke('providerMonetizationAgent'");
    expect(source).not.toContain('request_provider_economics');
  });

  it('stores no provider compensation in newly approved aggregate agreements', () => {
    const source = read('base44/functions/resolveCommercialApproval/entry.ts');
    expect(source).toContain('const providerEconomics = {}');
    expect(source).toContain('CAMBRA accepts no PSP commission');
    expect(source).toContain('const compensationTiers: any[] = []');
  });

  it('treats any PSP-compensation clause as a contract mismatch', () => {
    const source = read('base44/functions/reviewProviderContract/entry.ts');
    expect(source).toContain('prohibitedCompensationDetected');
    expect(source).toContain('prohibited_contract_clause');
  });

  it('keeps historical provider-revenue entities admin-only', () => {
    for (const name of ['ProviderCompensationTier','ProviderRevenueAttribution','ProviderRevenueLedger','ProviderRevenueStatement','ProviderRevenueInvoice','ProviderEconomicAssessment']) {
      expect(json(`base44/entities/${name}.jsonc`).rls.read.user_condition.role).toBe('admin');
    }
  });
});
