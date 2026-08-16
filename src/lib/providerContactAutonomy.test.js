import {describe,it,expect} from 'vitest';import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
describe('provider contact autonomy',()=>{
 it('start negotiation resolves missing provider contact instead of stopping immediately',()=>{const s=read('base44/functions/startProviderNegotiation/entry.ts');expect(s).toContain("providerContactResolver");expect(s).toContain("provider_contact_unresolved");expect(s).not.toContain("error:'provider_contact_required'")});
 it('resolver prioritizes merchant relationship then CRM then Apollo/public research',()=>{const s=read('base44/functions/providerContactResolver/entry.ts');expect(s).toContain("source:'merchant_relationship'");expect(s).toContain("source:'provider_crm'");expect(s).toContain('APOLLO_API_KEY');expect(s).toContain('PERPLEXITY_API_KEY');expect(s).toContain('Do not infer or guess email patterns')});
 it('merchant documents only yield literal email addresses',()=>{const s=read('base44/functions/providerContactResolver/entry.ts');expect(s).toContain("svc.entities.Document.filter");expect(s).toContain('matchAll(/');expect(s).toContain("source:'merchant_relationship'")});
 it('provider referral is accepted only when referred email literally appears inbound',()=>{const s=read('base44/functions/commercialReplyAgent/entry.ts');expect(s).toContain("classification==='contact_referral'");expect(s).toContain('unverified_provider_referral');expect(s).toContain('appears=proposed');expect(s).toContain("source:'provider_referral'")});
 it('redirected contact gets its own idempotency key',()=>{const s=read('base44/functions/providerNegotiationAgent/entry.ts');expect(s).toMatch(/provider-initial:\$\{c\.id\}:\$\{[\s\S]*?String\(thread\.counterparty_email\s*\|\|\s*["']["']\)[\s\S]*?\.toLowerCase\(\)[\s\S]*?\}/)});
});
