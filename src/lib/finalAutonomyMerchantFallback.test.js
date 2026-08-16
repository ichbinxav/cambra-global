import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
const r=p=>fs.readFileSync(p,'utf8');

describe('final autonomy — merchant fallback, communication and runtime guards',()=>{
  it('searches first, creates a merchant fallback only after provider resolution is exhausted, and resumes provider negotiation',()=>{
    const resolver=r('base44/functions/providerContactResolver/entry.ts');
    const create=r('base44/functions/createMerchantInformationRequest/entry.ts');
    const respond=r('base44/functions/respondMerchantInformationRequest/entry.ts');
    expect(resolver).toContain('merchant_relationship');
    expect(resolver).toContain('provider_crm');
    expect(resolver).toContain('apollo');
    expect(resolver).toContain('public_research');
    expect(resolver).toContain("createMerchantInformationRequest");
    expect(create).toContain("state:'merchant_input_required'");
    expect(respond).toContain("ALLOW_RESUME=new Set(['startProviderNegotiation','startPaymentsMigration'])");
    expect(respond).toContain("type==='dont_know'");
    expect(respond).toContain("skip_merchant_request:true");
  });

  it('gives the merchant a localized one-thing task and dashboard surface',()=>{
    const create=r('base44/functions/createMerchantInformationRequest/entry.ts');
    const ui=r('src/components/dashboard/MerchantInformationTasks.jsx');
    expect(create).toContain('fr:{provider_contact');
    expect(create).toContain('es:{provider_contact');
    expect(ui).toContain('CAMBRA needs one thing');
    expect(ui).toContain('CAMBRA a besoin');
    expect(ui).toContain('CAMBRA necesita');
    expect(ui).toContain("dont_know");
  });

  it('separates acquisition daily capacity from all-message burst safety',()=>{
    const send=r('base44/functions/commercialSendMessage/entry.ts');
    const schema=r('base44/entities/OutboundSendingProfile.jsonc');
    expect(schema).toContain('burst_per_minute');
    expect(send).toContain('profile_burst_limit');
    expect(send).toMatch(/const acquisitionAction\s*=\s*\[\s*["']initial_outreach["'],\s*["']partner_outreach["']\s*\]\.includes/);
    expect(send).toContain('claimCommercialSendSlot');
  });

  it('pushes merchants naturally toward the free Analyzer without inventing savings',()=>{
    const cold=r('base44/functions/outboundVolumeWorker/entry.ts');
    const reply=r('base44/functions/commercialReplyAgent/entry.ts');
    expect(cold).toContain('free Analyzer');
    expect(cold).toContain('with their own numbers');
    expect(cold).toContain('not salesy');
    expect(reply).toContain('gently prefer the free Analyzer');
    expect(reply).toContain('Never force the CTA');
  });

  it('preserves FR/ES merchant language into provider negotiation',()=>{
    const start=r('base44/functions/startProviderNegotiation/entry.ts');
    const agent=r('base44/functions/providerNegotiationAgent/entry.ts');
    expect(start).toContain("negotiationLanguage=['en','fr','es'].includes");
    expect(start).toContain('language:negotiationLanguage');
    expect(agent).toMatch(/thread\.language\s*\|\|\s*["']en["']/);
    expect(agent).toContain('human-sounding');
  });

  it('monitors Outlook orphan spikes and missing-information dead ends',()=>{
    const m=r('base44/functions/maintenanceEngine/entry.ts');
    expect(m).toContain('outlook_inbound_unroutable');
    expect(m).toContain('outlook_orphan_inbound_spike');
    expect(m).toContain('missing_information_dead_end');
  });
});
