import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CAPABILITY_CLASS, DISCOVERY_FILTER_CATALOG, DISCOVERY_SOURCE_REGISTRY, interpretDiscoveryIntent, planDiscoveryQuery } from '../../base44/shared/discoveryV2Planner.ts';
import { DISCOVERY_COUNTRY_OPTIONS, DISCOVERY_FILTER_TAXONOMY, DISCOVERY_GEOGRAPHY, getDiscoveryFilterDefinition } from './discoveryFilterOptions.js';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const liveContext={monthly_remaining_minor:15000,estimated_api_unit_minor:10,estimated_enrichment_unit_minor:25,unit_cost_minor:{APOLLO:10,INSTANTLY:10,CAMBRA:0,PROVIDER_INTELLIGENCE:0},source_health:{APOLLO:{available:true,status:'ACTIVE'},INSTANTLY:{available:false,status:'CONFIGURED'},CAMBRA:{available:true,status:'ACTIVE'},PROVIDER_INTELLIGENCE:{available:true,status:'ACTIVE'}},source_performance:{}};

describe('Discovery V2 Zero-Waste planner',()=>{
  it('classifies every Founder filter with an explicit supported truth class',()=>{
    const valid=new Set(Object.values(CAPABILITY_CLASS));
    for(const catalog of Object.values(DISCOVERY_FILTER_CATALOG))for(const field of Object.values(catalog))expect(valid.has(field.classification),field.label).toBe(true);
  });

  it('turns natural language into reviewable filters without paid AI',()=>{
    const result=interpretDiscoveryIntent('500 French beauty ecommerce companies, preferably Shopify and omnichannel.','MERCHANT');
    expect(result.target_count).toBe(500);
    expect(result.filters.country).toEqual(['FR']);
    expect(result.filters.technology).toContain('shopify');
    expect(result.filters.sales_channel).toEqual(['omnichannel']);
    expect(result.interpretation_method).toBe('DETERMINISTIC_NO_PAID_AI');
  });

  it('selects the best runtime-available source and degrades source-dependent filters honestly',()=>{
    const result=planDiscoveryQuery({discovery_type:'MERCHANT',source_mode:'AUTO',target_count:100,hard_cap_minor:500,filters:{country:['FR'],industry:['beauty'],technology:['shopify'],sales_channel:['omnichannel']}},liveContext);
    expect(result.selected_source).toBe('APOLLO');
    expect(result.classification.find((row)=>row.field==='sales_channel').effective_classification).toBe('DERIVED_SIGNAL');
    expect(result.requires_explicit_acceptance).toBe(true);
    expect(result.outbound_effect).toBe('NONE');
  });

  it('never schedules paid enrichment with a zero per-run hard cap',()=>{
    const result=planDiscoveryQuery({discovery_type:'MERCHANT',source_mode:'CAMBRA',hard_cap_minor:0,enrichment_policy:'HIGH_FIT_ONLY',filters:{contact_availability:['verified'],actual_tpv:['high']}},liveContext);
    expect(result.cost.selective_enrichment_minor).toBe(0);
    expect(result.stages.find((stage)=>stage.key==='SELECTIVE_COMPANY_ENRICHMENT').enabled).toBe(false);
    expect(result.limitations.join(' ')).toContain('hard cap is €0');
    expect(result.limitations.join(' ')).toContain('merchant-connected evidence');
  });

  it('keeps Partner discovery canonical-only until a non-sending adapter exists',()=>{
    const result=planDiscoveryQuery({discovery_type:'PARTNER',source_mode:'APOLLO',hard_cap_minor:500,filters:{partner_type:['accounting_firm'],client_portfolio:['100+']}},liveContext);
    expect(result.selected_source).toBe('CAMBRA');
    expect(result.limitations.join(' ')).toContain('legacy worker is never invoked because it can send outreach');
  });

  it('keeps provider research gap-first and benchmark contribution evidence-gated',()=>{
    const result=planDiscoveryQuery({discovery_type:'PROVIDER',provider_mode:'NEW_AND_EXISTING',filters:{pricing:['Spain'],authorization:['EU']}},liveContext);
    expect(result.selected_source).toBe('PROVIDER_INTELLIGENCE');
    expect(result.limitations.join(' ')).toContain('gap-first');
    expect(DISCOVERY_SOURCE_REGISTRY.PROVIDER_INTELLIGENCE.capabilities).toContain('entity_resolution');
  });

  it('costs every selected paid-source market as a visible partition',()=>{
    const result=planDiscoveryQuery({discovery_type:'MERCHANT',source_mode:'APOLLO',target_count:100,hard_cap_minor:500,filters:{country:['FR','ES','DE']}},liveContext);
    expect(result.cost.search_partitions).toBe(3);
    expect(result.cost.search_credit_units_estimated).toBe(3);
    expect(result.cost.search_minor).toBe(30);
    expect(result.cost.estimated_min_minor).toBe(30);
  });
});

describe('Discovery V2 quota, safety and Founder UX integration',()=>{
  it('uses one strict-admin logical family and zero new physical functions',()=>{
    const topology=JSON.parse(read('base44/deployment-topology.json'));
    expect(topology.physical_function_target).toBe(276);
    expect(topology.logical_routes.discoveryV2Admin.host).toBe('adminSummaries');
    expect(topology.logical_routes.discoveryV2Admin.route.action_prefix).toBe('discovery_v2_');
    expect(read('base44/functions/adminSummaries/entry.ts')).toContain('handleDiscoveryV2Admin');
  });

  it('has one justified immutable run entity and reuses the canonical saved-view and cost ledgers',()=>{
    const entity=JSON.parse(read('base44/entities/DiscoveryExecutionRun.jsonc'));
    expect(entity.properties.status.enum).toEqual(expect.arrayContaining(['COMPLETED','BUDGET_STOPPED','FOUNDER_STOPPED','SOURCE_LIMITED','NEEDS_REVIEW']));
    expect(entity.properties.cost_reservation_revision).toBeTruthy();
    const backend=read('base44/shared/discoveryV2Admin.ts');
    expect(backend).toMatch(/FounderSavedView\.filter\(\s*\{\s*view_type:\s*["']discovery_saved_search["']/);
    expect(backend).toContain('CostUsageEvent');
    const retention=JSON.parse(read('config/data-retention-matrix.json'));
    expect(retention.categories.find((row)=>row.category==='discovery_execution_runs')).toMatchObject({automation_status:'LEGAL_REVIEW_REQUIRED'});
  });

  it('claims a per-run hard cap by CAS and attributes source, stage, entity and reason',()=>{
    const cost=read('base44/shared/costGovernance.ts');
    expect(cost).toContain('claimDiscoveryRunBudget');
    expect(cost).toMatch(/cost_reservation_revision:\s*revision/);
    expect(cost).toContain('DISCOVERY_RUN_HARD_CAP_EXCEEDED');
    const discovery=read('base44/functions/leadDiscoveryAgent/entry.ts');
    expect(discovery).toMatch(/related_entity_type:\s*discoveryRunId\s*\?\s*["']DiscoveryExecutionRun["']/);
    expect(discovery).toMatch(/stage:\s*body\?\.cost_stage\s*\|\|\s*["']NATIVE_DISCOVERY["']/);
    expect(discovery).toMatch(/reason:\s*body\?\.cost_reason\s*\|\|\s*["']provider_native_search["']/);
  });

  it('uses the existing scheduler host and never invokes the sending Partner worker',()=>{
    const scheduler=read('base44/functions/alwaysOnLeadDiscoveryWorker/entry.ts');
    expect(scheduler).toContain('processScheduledDiscoverySearches');
    expect(scheduler).toContain("action:'GLOBAL_EMERGENCY_SAFE_MODE_BLOCKED'");
    const backend=read('base44/shared/discoveryV2Admin.ts');
    expect(backend).toContain('schedule_theoretical_spend_exceeds_authorized_budget');
    expect(backend).toMatch(/status:\s*["']PAUSED["'],\s*enabled:\s*false/);
    expect(backend).not.toContain("functions.invoke('autonomousPartnerWorker'");
    expect(backend).not.toContain("functions.invoke('commercialSendMessage'");
  });

  it('keeps new provider candidates visibly separate from canonical providers',()=>{
    const backend=read('base44/shared/discoveryV2Admin.ts');
    expect(backend).toMatch(/entity_type:\s*["']ProviderCandidate["']/);
    expect(backend).toMatch(/entity_type:\s*["']Provider["']/);
    expect(backend).toMatch(/truth_boundary:\s*["']ProviderCandidate is discovery evidence, not canonical Provider truth\.["']/);
    expect(backend).toMatch(/result_entity_type:[\s\S]*?["']MERCHANT["'][\s\S]*?["']OutboundLead["'][\s\S]*?["']PARTNER["'][\s\S]*?["']PartnerProspect["'][\s\S]*?["']ProviderOrCandidate["']/);
  });

  it('implements the five stable views, exact 12 KPI layout and no Send action',()=>{
    const ui=read('src/pages/admin/AdminDiscovery.jsx');
    for(const label of ['Overview','Merchants','Partners','Providers','Runs'])expect(ui).toContain(label);
    for(const label of ['Total Discovered','New Discoveries','High Fit','Added to Pipelines','Qualification Rate','Estimated Merchant Opportunity','Partner Reach','Intelligence Added','Discovery Spend','Cost per High Fit','Discovery Runs','Needs Attention'])expect(read('base44/shared/discoveryV2Admin.ts')).toContain(label);
    for(const label of ['Search Plan','Execution Plan','Expected Coverage','Estimated Cost','Limitations'])expect(ui).toContain(label);
    for(const label of ['Saved Searches','Review & Run','Duplicate','Schedule','View History','theoretical max'])expect(ui).toContain(label);
    expect(ui).not.toMatch(/>\s*Send\s*</);
  });

  it('reuses one Copilot with structured Discovery cost/capability context',()=>{
    expect(read('src/pages/admin/AdminDiscovery.jsx')).toContain("functions.invoke('copilotChat'");
    const copilot=read('base44/functions/copilotChat/entry.ts');
    expect(copilot).toContain('DISCOVERY ADMIN CONTEXT');
    expect(copilot).toContain('Never propose bypassing a hard cap');
    expect(copilot).toContain('window_seconds: 3600');
    expect(copilot).not.toContain('temperature:');
  });

  it('offers all 33 canonical markets plus regions, cities and typed fallbacks',()=>{
    expect(DISCOVERY_COUNTRY_OPTIONS).toHaveLength(33);
    expect(new Set(DISCOVERY_COUNTRY_OPTIONS.map(option=>option.value))).toEqual(new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','NO','IS','LI','CH','GB','AD']));
    for(const option of DISCOVERY_COUNTRY_OPTIONS){expect(DISCOVERY_GEOGRAPHY[option.value]?.regions.length,`${option.value} regions`).toBeGreaterThan(0);expect(DISCOVERY_GEOGRAPHY[option.value]?.cities.length,`${option.value} cities`).toBeGreaterThan(0)}
    const france=getDiscoveryFilterDefinition('MERCHANT','region',['FR']);
    expect(france.allowCustom).toBe(true);
    expect(france.options.some(option=>option.value==='Paris, FR')).toBe(true);
    expect(france.options.some(option=>option.value==='Île-de-France, FR')).toBe(true);
    for(const [type,catalog] of Object.entries(DISCOVERY_FILTER_TAXONOMY))for(const [key,values] of Object.entries(catalog))expect(values.length,`${type}.${key}`).toBeGreaterThan(0);
    const ui=read('src/pages/admin/AdminDiscovery.jsx'),filterOptions=read('src/lib/discoveryFilterOptions.js');
    for(const label of ['Options express your intent','Estimated run cost','Provider credits & efficiency','Partner Intelligence Search','Provider Intelligence Search'])expect(ui).toContain(label);
    expect(ui).not.toContain('Every field is searchable and multi-select');
    expect(filterOptions).toContain('Select all 33 markets');
  });
});
