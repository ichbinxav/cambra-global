import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildProviderIndependentQuery, calculateCampaignCapacity, canonicalLeadScore, filterAndSortLeads, leadsToCsv, senderReadiness } from './commercialOS.js';
import { instantlySuperSearchPayload, selectLeadIntelligenceProvider } from '../../base44/shared/leadIntelligenceProvider.ts';

describe('CAMBRA Commercial Operating System', () => {
  it('uses existing canonical scores and reports their provenance', () => {
    expect(canonicalLeadScore({ score:81, revenue_opportunity_score:77, revenue_confidence:.72 })).toEqual({
      icp:81, opportunity:77, confidence:.72,
      sources:{icp:'OutboundLead.score',opportunity:'OutboundLead.revenue_opportunity_score',confidence:'OutboundLead.revenue_confidence'},
    });
  });

  it('filters the provider-independent warehouse with explicit include and exclude rules', () => {
    const leads=[
      {id:'a',company_name:'Alpha Shop',country:'FR',industry:'retail',score:80,revenue_opportunity_score:90,detected_technologies:['Shopify']},
      {id:'b',company_name:'Beta Agency',country:'ES',industry:'agency',score:95,revenue_opportunity_score:40},
    ];
    expect(filterAndSortLeads(leads,{countries:['FR'],include:['shop'],exclude:['agency'],minIcp:70}).map((lead)=>lead.id)).toEqual(['a']);
  });

  it('derives honest sender readiness from real profile evidence', () => {
    const ready=senderReadiness({profile_key:'p1',provider:'instantly',domain:'mail.example.eu',from_address:'x@mail.example.eu',status:'active',current_daily_cap:12,bounce_pause_threshold_pct:3,complaint_pause_threshold_pct:.3,webhook_status:'ACTIVE',provider_config_json:{sender_ready:true}});
    expect(ready).toMatchObject({status:'READY',ready:true,cap:12});
    expect(senderReadiness({provider:'instantly',status:'active'}).status).toBe('SETUP_PENDING');
  });

  it('returns zero campaign capacity until the founder enables outbound', () => {
    const profile={profile_key:'p1',provider:'instantly',domain:'mail.example.eu',from_address:'x@mail.example.eu',status:'active',current_daily_cap:15,bounce_pause_threshold_pct:3,complaint_pause_threshold_pct:.3,webhook_status:'ACTIVE',provider_config_json:{sender_ready:true}};
    expect(calculateCampaignCapacity({profiles:[profile],control:{acquisition_enabled:false},policy:{daily_send_limit:10},eligibleLeads:100}).capacity).toBe(0);
    expect(calculateCampaignCapacity({profiles:[profile],control:{acquisition_enabled:true,instantly_enabled:true},policy:{daily_send_limit:10,sending_profile_keys:['p1']},eligibleLeads:100,provider:'instantly'}).capacity).toBe(10);
  });

  it('maps one ICP to a portable provider query', () => {
    expect(buildProviderIndependentQuery({countries:['fr'],verticals:['Retail'],titles:['CEO'],per_run:200})).toMatchObject({countries:['FR'],industries:['retail'],titles:['ceo'],limit:200,one_lead_per_company:true});
  });

  it('maps the portable ICP to the official Instantly SuperSearch filter contract', () => {
    expect(instantlySuperSearchPayload({countries:['France'],industries:['Retail'],titles:['CEO'],employee_ranges:['26 - 50'],technologies:['Shopify'],limit:200})).toMatchObject({search_filters:{locations:[{label:'France'}],industry:{include:['Retail'],exclude:[]},title:{include:['CEO'],exclude:[]},employeeCount:['26 - 50'],technologies:['Shopify'],show_one_lead_per_company:true},limit:200});
  });

  it('keeps Apollo until September 7 and blocks an unsafe person-only handoff', () => {
    expect(selectLeadIntelligenceProvider({mode:'AUTO',apolloConfigured:true,instantlyConfigured:true,instantlySuperSearchPermission:true,now:new Date('2026-08-20T00:00:00Z')}).selected).toBe('apollo');
    expect(selectLeadIntelligenceProvider({mode:'AUTO',apolloConfigured:true,instantlyConfigured:true,instantlySuperSearchPermission:true,now:new Date('2026-09-08T00:00:00Z')})).toMatchObject({selected:null,reason:'apollo_expired_and_instantly_contact_person_only'});
    expect(selectLeadIntelligenceProvider({mode:'AUTO',apolloConfigured:true,instantlyConfigured:true,instantlySuperSearchPermission:false,now:new Date('2026-09-08T00:00:00Z')})).toMatchObject({selected:null,reason:'apollo_expired_and_instantly_unavailable'});
  });

  it('escapes spreadsheet formulas in CSV exports', () => {
    expect(leadsToCsv([{company_name:'=IMPORTXML("x")'}])).toContain("'=IMPORTXML");
  });

  it('adds one canonical campaign entity instead of provider-owned campaign truth', () => {
    const schema=JSON.parse(fs.readFileSync('base44/entities/CommercialCampaign.jsonc','utf8'));
    expect(schema.properties.external_refs_json).toBeDefined();
    expect(schema.properties.lead_ids).toBeDefined();
    expect(schema.properties.status.enum).toContain('READY_FOR_PILOT');
  });
});
