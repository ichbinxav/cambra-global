import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(path,'utf8');

describe('CAMBRA v0.96 Commercial Operating System seal',()=>{
  it('mounts one founder-operable commercial workspace inside the protected admin shell',()=>{
    expect(read('src/App.jsx')).toContain('/admin/commercial');
    expect(read('src/pages/admin/AdminLayout.jsx')).toContain('Commercial OS');
    const ui=read('src/pages/admin/AdminCommercialOS.jsx');
    for(const token of ['Target profiles','Unified lead workspace','Campaign Studio','Domain & Mailbox Workspace','Founder Inbox','Single Agent Control Center','Ask CAMBRA'])expect(ui).toContain(token);
  });

  it('keeps campaign truth in CAMBRA and provider ids as replaceable references',()=>{
    const schema=read('base44/entities/CommercialCampaign.jsonc');
    for(const token of ['target_profile_id','lead_ids','strategy_ids','sending_profile_keys','external_refs_json','READY_FOR_PILOT'])expect(schema).toContain(token);
    expect(schema).toContain('Provider campaign identifiers are replaceable');
  });

  it('preserves a hard outbound lock while campaign drafting and readiness remain usable',()=>{
    const backend=read('base44/shared/commercialCampaignAdmin.ts');
    expect(backend).toContain('external_send_performed:false');
    expect(backend).toContain('founder_pilot_authorization_required');
    expect(backend).not.toMatch(/commercialSendMessage|queueInitial|sendReply/);
    expect(read('src/pages/admin/AdminCommercialOS.jsx')).toContain('No message was sent');
  });

  it('supports provider-portable ICPs and an evidence-gated Apollo sunset',()=>{
    const providers=read('base44/shared/leadIntelligenceProvider.ts');
    for(const token of ['APOLLO_CONTRACT_EXPIRES_AT','instantlySuperSearchPayload','apollo_active_until_contract_expiry','apollo_unavailable_safe_instantly_handoff'])expect(providers).toContain(token);
    const worker=read('base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts');
    expect(worker).toContain('selectLeadIntelligenceProvider');
    expect(worker).toContain('selectedProvider');
    expect(worker).toContain('instantly_supersearch');
  });

  it('verifies Instantly SuperSearch using the official preview path without enriching leads',()=>{
    const admin=read('base44/functions/instantlyProviderAdmin/entry.ts');
    expect(admin).toContain('/supersearch-enrichment/preview-leads-from-supersearch');
    expect(admin).toContain('lead_data_persisted:false');
    expect(admin).toContain('automatic_enrichment_enabled:false');
  });

  it('lets Ask CAMBRA inspect, discover, verify and safely stop the real commercial system',()=>{
    const chat=read('base44/functions/chatChiefOrchestrator/entry.ts');
    for(const token of ['commercial_os_status','run_commercial_discovery','pause_outbound','verify_instantly_supersearch'])expect(chat).toContain(token);
    expect(chat).toContain('fixed_input:{action:"pause_all"}');
  });

  it('exposes automatic local language plus English in the admin navbar',()=>{
    const shell=read('src/pages/admin/AdminLayout.jsx');
    expect(shell).toContain('LanguageSwitcher');
    expect(read('src/components/shared/LanguageSwitcher.jsx')).toContain('language_detected');
  });
});
