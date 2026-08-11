import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  APOLLO_EXPIRY_AT,
  canonicalCompanyKey,
  cheapDiscoveryPreScore,
  classifyProfessionalEmail,
  discoveryProviderStatus,
} from '../../base44/shared/discoveryRadar.ts';

const read = (path) => fs.readFileSync(path, 'utf8');

describe('P6 autonomous discovery radar', () => {
  it('keeps canonical company identity provider-independent', () => {
    expect(canonicalCompanyKey('https://www.Example.com/shop')).toBe('domain:example.com');
    expect(read('base44/entities/OutboundLead.jsonc')).toContain('external_refs_json');
    expect(read('base44/entities/LeadDiscoveryCheckpoint.jsonc')).toContain('Provider-agnostic');
  });

  it('pre-scores cheap evidence before selective enrichment', () => {
    const result = cheapDiscoveryPreScore({
      title: 'Head of Payments',
      organization: { name:'Merchant', primary_domain:'merchant.eu', industry:'DTC ecommerce retail', estimated_num_employees:120, technologies:['Shopify','Stripe'] },
    });
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.enrichment_worthy).toBe(true);
    const discovery = read('base44/functions/leadDiscoveryAgent/entry.ts');
    const enrichment = read('base44/functions/leadEnrichmentAgent/entry.ts');
    expect(discovery.indexOf('canonical_company_key')).toBeLessThan(discovery.indexOf('bulkCreate'));
    expect(discovery.indexOf("'/mixed_companies/search'")).toBeLessThan(discovery.indexOf("'/mixed_people/api_search'"));
    expect(discovery).toContain('provider_credit_cost_documented:1');
    expect(enrichment).toContain('enrichment_worthy===true');
    expect(enrichment).toContain('enrichment_daily_limit');
    expect(enrichment).toContain('enrichment_weekly_limit');
    expect(enrichment).toContain('rollingWeekCutoff');
  });

  it('rejects generic, personal and company-mismatched emails', () => {
    expect(classifyProfessionalEmail('info@merchant.eu','merchant.eu').accepted).toBe(false);
    expect(classifyProfessionalEmail('cfo@gmail.com','merchant.eu').accepted).toBe(false);
    expect(classifyProfessionalEmail('cfo@other.eu','merchant.eu').accepted).toBe(false);
    expect(classifyProfessionalEmail('cfo@merchant.eu','merchant.eu')).toMatchObject({accepted:true,status:'PROFESSIONAL_VERIFIED'});
  });

  it('sunsets Apollo without deleting or breaking the canonical warehouse', () => {
    expect(APOLLO_EXPIRY_AT).toContain('2026-09-07');
    expect(discoveryProviderStatus(true,new Date('2026-09-08T00:00:00Z'))).toMatchObject({status:'EXPIRED',available:false});
    expect(discoveryProviderStatus(false,new Date('2026-08-11T00:00:00Z'))).toMatchObject({status:'UNAVAILABLE',available:false});
  });

  it('keeps discovery separate from outbound activation', () => {
    const worker=read('base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts');
    const orchestrator=read('base44/functions/leadOrchestrator/entry.ts');
    const policy=read('base44/functions/commercialPolicyAdmin/entry.ts');
    expect(worker).toContain('selectDiscoveryPolicy');
    expect(worker).not.toMatch(/commercialSendMessage|resend\.emails|outlook.*send/i);
    expect(policy).toContain('outbound_policy_status_unchanged');
    expect(policy).toContain('START_AUTONOMOUS_DISCOVERY');
    expect(orchestrator).toContain('discovery_summary');
    expect(worker).toContain('decision_makers_found:discoveryResult.decision_makers_found');
    expect(worker).toContain("base44.functions.invoke('leadOrchestrator'");
    expect(worker).not.toContain("service.functions.invoke('leadOrchestrator'");
  });

  it('exposes real radar UX and keeps manual investigation secondary', () => {
    const ui=read('src/pages/admin/AdminDiscovery.jsx');
    expect(ui).toContain('Autonomous Commercial Radar');
    expect(ui).toContain('CAMBRA continuously discovers');
    expect(ui).toContain('No merchant matches the current filters');
    expect(ui).toContain('same canonical P6 pipeline');
    expect(ui.indexOf('Unique companies')).toBeLessThan(ui.indexOf('Investigate a company'));
  });
});
