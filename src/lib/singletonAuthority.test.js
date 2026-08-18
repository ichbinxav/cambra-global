import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { assertEmergencyEpochUnchanged, captureEmergencyEpoch, containCommunicationTransport, emergencyState, extendEmergencyEpoch, guardedEmergencyEffect, inheritEmergencyEpoch, normalizeTransportContainment, persistEmergencyTransportContainment } from '../../base44/shared/operationalControl.ts';
import { containOutboundForCostStop, paidProviderEmergencyCapabilities, paidProviderFetch } from '../../base44/shared/costGovernance.ts';
import { bootstrapContainedSingleton, readSingletonAuthority } from '../../base44/shared/singletonAuthority.ts';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

describe('canonical singleton authority',()=>{
  it('reads at most two rows and accepts exactly one only',async()=>{
    const calls=[];
    const service=(rows)=>({entities:{EmergencyControl:{filter:async(...args)=>{calls.push(args);return structuredClone(rows);}}}});
    const one=await readSingletonAuthority(service([{id:'one'}]),{entity:'EmergencyControl',query:{control_key:'global'},authority:'emergency_control'});
    expect(one).toMatchObject({ok:true,status:'EXACTLY_ONE',count:1,row:{id:'one'}});
    const missing=await readSingletonAuthority(service([]),{entity:'EmergencyControl',query:{control_key:'global'},authority:'emergency_control'});
    expect(missing).toMatchObject({ok:false,status:'MISSING',blocker:'emergency_control_authority_missing'});
    const duplicate=await readSingletonAuthority(service([{id:'one'},{id:'two'}]),{entity:'EmergencyControl',query:{control_key:'global'},authority:'emergency_control'});
    expect(duplicate).toMatchObject({ok:false,status:'DUPLICATE',row:null,blocker:'emergency_control_authority_duplicate'});
    expect(calls.every((args)=>args[2]===2)).toBe(true);
  });

  it('bootstraps only a true missing authority, contained, then rechecks uniqueness',async()=>{
    const rows=[];
    const candidates=[];
    const svc={entities:{EmergencyControl:{
      filter:async()=>structuredClone(rows),
      create:async(candidate)=>{candidates.push(structuredClone(candidate));const row={id:'created',...candidate};rows.push(row);return structuredClone(row);},
    }}};
    const result=await bootstrapContainedSingleton(svc,{entity:'EmergencyControl',query:{control_key:'global'},authority:'emergency_control',containedCandidate:()=>({control_key:'global',safe_mode:true,communications_paused:true})});
    expect(result).toMatchObject({ok:true,status:'EXACTLY_ONE',created:true,created_id:'created'});
    expect(candidates).toEqual([expect.objectContaining({safe_mode:true,communications_paused:true})]);

    let createCalled=false;
    const duplicateSvc={entities:{EmergencyControl:{filter:async()=>[{id:'a'},{id:'b'}],create:async()=>{createCalled=true;}}}};
    const duplicate=await bootstrapContainedSingleton(duplicateSvc,{entity:'EmergencyControl',query:{control_key:'global'},authority:'emergency_control',containedCandidate:()=>({safe_mode:true})});
    expect(duplicate.status).toBe('DUPLICATE');
    expect(createCalled).toBe(false);
  });

  it('projects duplicate EmergencyControl rows as unavailable and fully paused',async()=>{
    const svc={entities:{EmergencyControl:{filter:async()=>[
      {id:'older',control_key:'global',safe_mode:true,communications_paused:true},
      {id:'newer',control_key:'global',safe_mode:false,communications_paused:false},
    ]}}};
    const state=await emergencyState(svc);
    expect(state).toMatchObject({control_available:false,safe_mode:true,communications_paused:true,resume_check_required:true,reason:'emergency_control_authority_duplicate'});
  });

  it('invalidates in-flight material work after a STOP -> RESUME interleaving',async()=>{
    let control={id:'emergency-global',control_key:'global',control_revision:7,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false};
    const svc={entities:{EmergencyControl:{filter:async()=>[structuredClone(control)]}}};
    const claim=await captureEmergencyEpoch(svc,'communications');
    expect(claim).toMatchObject({control_id:'emergency-global',control_revision:7,capabilities:['communications']});

    // Both final flags are permissive, but the monotonic revision proves that
    // a stop/resume transition occurred while this operation was in flight.
    control={...control,control_revision:9};
    await expect(assertEmergencyEpochUnchanged(svc,claim,'after_transport')).rejects.toMatchObject({
      code:'EMERGENCY_CONTROL_EPOCH_CHANGED',
      phase:'after_transport',
      expected:{control_id:'emergency-global',control_revision:7},
      observed:{control_id:'emergency-global',control_revision:9},
    });
  });

  it('extends the same epoch for negotiation effects and never recaptures authority',async()=>{
    const control={id:'emergency-global',control_key:'global',control_revision:3,safe_mode:false,communications_paused:false,negotiations_paused:true,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false};
    const svc={entities:{EmergencyControl:{filter:async()=>[structuredClone(control)]}}};
    const claim=await captureEmergencyEpoch(svc,'communications');
    await expect(extendEmergencyEpoch(svc,claim,'negotiations')).rejects.toMatchObject({code:'EMERGENCY_CONTROL_PAUSED',phase:'extend_capability'});
  });

  it('rejects a stale epoch inherited across an internal function boundary',async()=>{
    const control={id:'emergency-global',control_key:'global',control_revision:12,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false};
    const svc={entities:{EmergencyControl:{filter:async()=>[structuredClone(control)]}}};
    await expect(inheritEmergencyEpoch(svc,{
      control_id:'emergency-global',
      control_revision:10,
      capabilities:['negotiations'],
      captured_at:'2026-08-13T00:00:00.000Z',
    },'communications')).rejects.toMatchObject({
      code:'EMERGENCY_CONTROL_EPOCH_CHANGED',
      phase:'extend_capability',
      expected:{control_revision:10},
      observed:{control_revision:12},
    });
  });

  it('rejects empty capability epochs instead of treating them as authority',async()=>{
    const control={id:'emergency-global',control_key:'global',control_revision:12,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false};
    const svc={entities:{EmergencyControl:{filter:async()=>[structuredClone(control)]}}};
    await expect(captureEmergencyEpoch(svc,[])).rejects.toMatchObject({code:'EMERGENCY_CONTROL_EPOCH_INVALID',phase:'capture'});
    await expect(inheritEmergencyEpoch(svc,{control_id:'emergency-global',control_revision:12,capabilities:[]},'communications')).rejects.toMatchObject({code:'EMERGENCY_CONTROL_EPOCH_INVALID',phase:'inherit'});
  });

  it('surfaces a successful raced provider effect as ambiguous and invokes containment',async()=>{
    let revision=5;
    let contained=false;
    const svc={entities:{EmergencyControl:{filter:async()=>[{id:'emergency-global',control_key:'global',control_revision:revision,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false}]}}};
    const claim=await captureEmergencyEpoch(svc,'communications');
    await expect(guardedEmergencyEffect(svc,{
      claim,
      effect_key:'test_transport',
      effect:async()=>{revision=6;return{provider_id:'remote-applied'};},
      contain:async()=>{contained=true;return{ok:true};},
    })).rejects.toMatchObject({code:'EMERGENCY_EFFECT_AMBIGUOUS',effect_key:'test_transport',review_required:true,containment:{ok:true}});
    expect(contained).toBe(true);
  });

  it('fails all material capabilities closed when EmergencyControl cannot be read',async()=>{
    const svc={entities:{EmergencyControl:{filter:async()=>{throw new Error('authority_offline')}}}};
    let providerCalls=0,economicCommits=0;
    for(const capability of ['communications','negotiations','migrations','billing_issuance','paid_discovery']){
      await expect((async()=>{
        await captureEmergencyEpoch(svc,capability);
        providerCalls++;
        economicCommits++;
      })()).rejects.toMatchObject({code:'EMERGENCY_CONTROL_PAUSED',status:409});
    }
    expect(providerCalls).toBe(0);
    expect(economicCommits).toBe(0);
  });

  it('persists the exact transport containment vocabulary without inflating local blocks into remote proof',async()=>{
    let control={id:'emergency-global',control_key:'global',control_revision:41};
    const matches=(row,query)=>Object.entries(query).every(([key,value])=>row?.[key]===value);
    const svc={entities:{EmergencyControl:{
      updateMany:async(query,operation)=>{if(!matches(control,query))return{updated:0};control={...control,...structuredClone(operation.$set)};return{updated:1};},
      get:async()=>structuredClone(control),
    }}};
    const observations=[
      {transport:'outlook',configured:true,local_blocked:true,remote_pause_supported:false,remote_verified_paused:false},
      {transport:'resend',configured:false,local_blocked:true,remote_pause_supported:false,remote_verified_paused:false},
      {transport:'instantly',configured:true,local_blocked:true,remote_pause_supported:true,remote_verified_paused:false},
    ];
    const normalized=normalizeTransportContainment(observations);
    expect(normalized).toMatchObject({containment_status:'CONTAINMENT_INCOMPLETE',transports:[
      {transport:'outlook',status:'LOCALLY_BLOCKED'},
      {transport:'resend',status:'NOT_CONFIGURED'},
      {transport:'instantly',status:'UNVERIFIED'},
    ]});
    expect(normalizeTransportContainment([
      {transport:'outlook',configured:true,local_blocked:false,remote_pause_supported:false,remote_verified_paused:false},
      {transport:'instantly',configured:true,local_blocked:true,remote_pause_supported:true,remote_verified_paused:true},
    ]).transports.map((row)=>row.status)).toEqual(['ERROR','NOT_CONFIGURED','REMOTELY_VERIFIED_PAUSED']);
    const persisted=await persistEmergencyTransportContainment(svc,{control_id:control.id,control_revision:41,correlation_id:'drill-41',observations});
    expect(persisted).toMatchObject({ok:true,persisted:true,containment_status:'CONTAINMENT_INCOMPLETE'});
    expect(control.transport_containment_status).toBe('CONTAINMENT_INCOMPLETE');
    expect(control.transport_containment_json.blockers).toEqual(['transport:outlook:LOCALLY_BLOCKED','transport:instantly:UNVERIFIED']);
    expect(control.transport_containment_json.transports.map((row)=>row.status)).toEqual(['LOCALLY_BLOCKED','NOT_CONFIGURED','UNVERIFIED']);
  });

  it('contains every conflicting OutboundControl row during a cost stop',async()=>{
    const rows=[
      {id:'outbound-a',control_key:'global',control_revision:4,acquisition_enabled:true,instantly_enabled:true,transition_key:'start-a'},
      {id:'outbound-b',control_key:'global',control_revision:8,acquisition_enabled:true,instantly_enabled:true,transition_key:'start-b'},
    ];
    const matches=(row,query)=>Object.entries(query).every(([key,value])=>row?.[key]===value);
    const svc={entities:{OutboundControl:{
      filter:async()=>structuredClone(rows),
      get:async(id)=>structuredClone(rows.find((row)=>row.id===id)||null),
      updateMany:async(query,operation)=>{const index=rows.findIndex((row)=>matches(row,query));if(index<0)return{updated:0};rows[index]={...rows[index],...structuredClone(operation.$set)};return{updated:1};},
    }}};
    const result=await containOutboundForCostStop(svc,'hard_cap');
    expect(result).toMatchObject({ok:true,authority_row_count:2,duplicate_authority_detected:true,coverage_complete:true});
    expect(result.results).toHaveLength(2);
    expect(rows.every((row)=>row.acquisition_enabled===false&&row.instantly_enabled===false&&row.transition_key==='')).toBe(true);
  });

  it('durably contains every row and profile for the raced communication transport',async()=>{
    const controls=[
      {id:'outbound-a',control_key:'global',control_revision:4,acquisition_enabled:true,volume_resend_enabled:true,transition_key:'start-a'},
      {id:'outbound-b',control_key:'global',control_revision:8,acquisition_enabled:true,volume_resend_enabled:true,transition_key:'start-b'},
    ];
    const profiles=[{id:'profile-a',provider:'resend',status:'active'},{id:'profile-b',provider:'resend',status:'warming'}];
    const matches=(row,query)=>Object.entries(query).every(([key,value])=>row?.[key]===value);
    const svc={entities:{
      OutboundControl:{
        filter:async()=>structuredClone(controls),
        get:async(id)=>structuredClone(controls.find((row)=>row.id===id)||null),
        updateMany:async(query,operation)=>{const index=controls.findIndex((row)=>matches(row,query));if(index<0)return{updated:0};controls[index]={...controls[index],...structuredClone(operation.$set)};return{updated:1};},
      },
      OutboundSendingProfile:{
        filter:async(query)=>structuredClone(profiles.filter((row)=>matches(row,query))),
        update:async(id,patch)=>{const index=profiles.findIndex((row)=>row.id===id);profiles[index]={...profiles[index],...structuredClone(patch)};return structuredClone(profiles[index]);},
      },
    }};
    const result=await containCommunicationTransport(svc,'resend','stale_epoch_test');
    expect(result).toMatchObject({ok:true,transport:'resend',authority_complete:true,profiles_read:true});
    expect(controls.every((row)=>row.acquisition_enabled===false&&row.volume_resend_enabled===false&&row.transition_key===''&&row.control_revision>8-5)).toBe(true);
    expect(profiles.every((row)=>row.status==='paused'&&row.notes.includes('stale_epoch_test'))).toBe(true);
  });

  it('fails every direct paid API/enrichment provider closed while paid Discovery is paused',async()=>{
    expect(paidProviderEmergencyCapabilities({category:'api',provider:'future_provider'})).toEqual(['paid_discovery']);
    expect(paidProviderEmergencyCapabilities({category:'enrichment',provider:'apollo'})).toEqual(['paid_discovery']);
    expect(paidProviderEmergencyCapabilities({category:'api',provider:'instantly'})).toEqual(['communications','paid_discovery']);
    expect(paidProviderEmergencyCapabilities({category:'api',provider:'instantly',source:'instantlyReconciliationWorker',emergency_effect_mode:'read_only_reconciliation'})).toEqual([]);
    expect(paidProviderEmergencyCapabilities({category:'api',provider:'instantly',source:'untrustedCaller',emergency_effect_mode:'read_only_reconciliation'})).toEqual(['communications','paid_discovery']);
    let providerCalls=0,costReads=0;
    const control={id:'emergency-global',control_key:'global',control_revision:22,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:true,resume_check_required:false};
    const svc={entities:{
      EmergencyControl:{filter:async()=>[structuredClone(control)]},
      CostUsageEvent:{filter:async()=>{costReads++;return[];}},
    }};
    const originalFetch=globalThis.fetch;
    globalThis.fetch=async()=>{providerCalls++;return new Response('{}',{status:200});};
    try{
      await expect(paidProviderFetch(svc,{event_key:'paused-direct-provider',category:'api',provider:'future_provider',source:'test'},'https://provider.invalid')).rejects.toMatchObject({code:'EMERGENCY_CONTROL_PAUSED',phase:'capture'});
    }finally{globalThis.fetch=originalFetch;}
    expect(providerCalls).toBe(0);
    expect(costReads).toBe(0);
  });

  it('turns a STOP interleaved with a direct paid provider response into an ambiguous effect',async()=>{
    let control={id:'emergency-global',control_key:'global',control_revision:31,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false};
    const day=new Date().toISOString().slice(0,10),month=day.slice(0,7);
    let budget={id:'budget',control_key:'global',status:'active',currency:'EUR',version:'v1',daily_total_limit_minor:1000,monthly_total_limit_minor:10000,category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_limit_minor:500,monthly_limit_minor:5000}])),estimated_unit_cost_minor_json:{api:1},anomaly_warning_pct:70,hard_stop_pct:95,emergency_stop_active:false,reservation_revision:0,reservation_day_key:day,reservation_month_key:month,reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[]};
    const events=[];
    const svc={entities:{
      EmergencyControl:{filter:async()=>[structuredClone(control)]},
      CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},
      CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:'cost-1',...structuredClone(value)};events.push(row);return row;},update:async(id,patch)=>({id,...patch})},
    }};
    const originalFetch=globalThis.fetch;
    globalThis.fetch=async()=>{control={...control,control_revision:32,safe_mode:true,paid_discovery_paused:true};return new Response('{}',{status:200});};
    try{
      await expect(paidProviderFetch(svc,{event_key:'raced-direct-provider',category:'api',provider:'future_provider',source:'test'},'https://provider.invalid')).rejects.toMatchObject({code:'EMERGENCY_EFFECT_AMBIGUOUS',effect_key:'paid_provider_fetch:raced-direct-provider',review_required:true});
    }finally{globalThis.fetch=originalFetch;}
    expect(events).toHaveLength(1);
  });

  it('uses singleton helpers at the material Founder/GO/outbound boundaries',()=>{
    // FCTRL-J: emergencyControlAdmin's handler lives in the shared core module
    // (base44/shared/emergencyControlAdminCore.ts); the entry is a thin
    // Deno.serve wrapper, so the singleton-usage invariant is asserted there.
    for(const file of [
      'base44/shared/operationalControl.ts',
      'base44/shared/founderControlV2.ts',
      'base44/shared/goLiveRuntime.ts',
      'base44/shared/commercialActivationRuntime.ts',
      'base44/shared/emergencyControlAdminCore.ts',
      'base44/functions/outboundControlAdmin/entry.ts',
      'base44/shared/logical/goLiveControlAdmin.ts',
      'base44/shared/logical/commercialGoLiveReadiness.ts',
      'base44/functions/commercialSendMessage/entry.ts',
    ])expect(read(file)).toContain('singletonAuthority');
    const emergency=read('base44/shared/emergencyControlAdminCore.ts');
    expect(emergency).toContain('readAuthorityRowsForContainment');
    expect(emergency).toContain('duplicate_authority_detected');
    expect(emergency).toContain('coverage_complete');
  });
});