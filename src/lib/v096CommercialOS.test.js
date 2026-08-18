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
    // CAMP-C2 (2026-08-16): the handler body lives in campaignAdminCore.ts; the
    // admin file is a thin Deno.serve-side wrapper. The no-send invariant
    // covers both, and is additionally proven by behavior tests in
    // src/lib/campaignsAdminC2.test.js.
    const backend=read('base44/shared/commercialCampaignAdmin.ts')+read('base44/shared/campaignAdminCore.ts');
    expect(backend).toContain('external_send_performed:false');
    expect(backend).toContain('founder_pilot_authorization_required');
    expect(backend).not.toMatch(/commercialSendMessage|queueInitial|sendReply/);
    expect(read('src/pages/admin/AdminCommercialOS.jsx')).toContain('No message was sent');
  });

  // DSCV2-A (2026-08-16): the sunset handoff is no longer blocked — verified
  // Instantly SuperSearch takes over after the Apollo contract expiry; the
  // bundled-person-data discard lives in runInstantlyPreviewDiscovery.
  // Behavior tests: src/lib/discoveryV2Stages.test.js.
  it('supports provider-portable ICPs and the governed Apollo sunset handoff',()=>{
    const providers=read('base44/shared/leadIntelligenceProvider.ts');
    for(const token of ['APOLLO_CONTRACT_EXPIRES_AT','instantlySuperSearchPayload','apollo_active_until_contract_expiry','supersearch_permission_not_verified','apollo_expired_and_instantly_unavailable','preview-leads-from-supersearch'])expect(providers).toContain(token);
    const worker=read('base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts');
    expect(worker).toContain('selectLeadIntelligenceProvider');
    expect(worker).toContain('selectedProvider');
    expect(worker).toContain('instantly_supersearch');
  });

  it('verifies Instantly SuperSearch using the official preview path without enriching leads',()=>{
    const admin=read('base44/shared/logical/instantlyProviderAdmin.ts');
    expect(admin).toContain('/supersearch-enrichment/preview-leads-from-supersearch');
    expect(admin).toContain('lead_data_persisted:false');
    expect(admin).toContain('automatic_enrichment_enabled:false');
  });

  it('lets Ask CAMBRA inspect, discover, verify and safely stop the real commercial system',()=>{
    // COMMAND-C7: tool declarations moved to base44/shared/commandToolCatalog.ts.
    const chat=read('base44/functions/chatChiefOrchestrator/entry.ts')+'\n'+read('base44/shared/commandToolCatalog.ts');
    for(const token of ['commercial_os_status','run_commercial_discovery','pause_outbound','verify_instantly_supersearch'])expect(chat).toContain(token);
    expect(chat).toContain('fixed_input:{action:"pause_all"}');
  });

  it('exposes automatic local language plus English in the admin navbar',()=>{
    const shell=read('src/pages/admin/AdminLayout.jsx');
    expect(shell).toContain('LanguageSwitcher');
    expect(read('src/components/shared/LanguageSwitcher.jsx')).toContain('language_detected');
  });

  it('bounds the runtime projection below the Base44 response ceiling',()=>{
    const aggregate=read('base44/shared/commercialOperatingSystem.ts');
    expect(aggregate).toContain("const compactLeads=(radar.prioritized||[]).slice(0,30)");
    expect(aggregate).toContain("recent:tasks.slice(0,20)");
    expect(aggregate).not.toContain('attention,radar,');
  });
});
