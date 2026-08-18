import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callCambraClaude } from '../../base44/shared/commercialModelRouter.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('CAMBRA model router', () => {
  it('keeps Sonnet for volume and Opus for high reasoning without unsafe post-transport fallback', () => {
    const source = read('base44/shared/commercialModelRouter.ts');
    expect(source).toContain('claude-sonnet-5');
    expect(source).toContain('claude-opus-5');
    expect(source).not.toContain("invoke(standard,'fallback')");
    expect(source).toContain('PROVIDER_EFFECT_REVIEW_REQUIRED');
  });

  it('marks a raced negotiation model effect REVIEW_REQUIRED and never falls back', async () => {
    let control={id:'emergency-global',control_key:'global',control_revision:31,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false};
    const day=new Date().toISOString().slice(0,10),month=day.slice(0,7);
    let budget={id:'budget',control_key:'global',status:'active',currency:'EUR',version:'v1',daily_total_limit_minor:1000,monthly_total_limit_minor:10000,category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_limit_minor:500,monthly_limit_minor:5000}])),estimated_unit_cost_minor_json:{ai:1},anomaly_warning_pct:70,hard_stop_pct:95,emergency_stop_active:false,reservation_revision:0,reservation_day_key:day,reservation_month_key:month,reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[]};
    const events=[];
    const svc={entities:{
      EmergencyControl:{filter:async()=>[structuredClone(control)]},
      CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},
      CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:'cost-1',...structuredClone(value)};events.push(row);return structuredClone(row);},update:async(id,patch)=>{const index=events.findIndex((row)=>row.id===id);events[index]={...events[index],...structuredClone(patch)};return structuredClone(events[index]);}},
    }};
    /* global process */
    const envNames=['ANTHROPIC_API_KEY','ANTHROPIC_STANDARD_MODEL','ANTHROPIC_OPUS_MODEL'];
    const originalDeno=globalThis.Deno;
    globalThis.Deno={env:{get:(name)=>process.env[name],set:(name,value)=>{process.env[name]=String(value)},delete:(name)=>{delete process.env[name]}}};
    const previous=Object.fromEntries(envNames.map((name)=>[name,globalThis.Deno.env.get(name)]));
    const originalFetch=globalThis.fetch;
    let providerCalls=0;
    globalThis.Deno.env.set('ANTHROPIC_API_KEY','test-key');
    globalThis.Deno.env.set('ANTHROPIC_STANDARD_MODEL','test-standard');
    globalThis.Deno.env.set('ANTHROPIC_OPUS_MODEL','test-opus');
    globalThis.fetch=async()=>{
      providerCalls++;
      control={...control,control_revision:32,safe_mode:true,negotiations_paused:true};
      return new Response(JSON.stringify({content:[{type:'text',text:'provider-applied'}],usage:{input_tokens:3,output_tokens:2}}),{status:200,headers:{'content-type':'application/json'}});
    };
    try{
      await expect(callCambraClaude('test negotiation',{tier:'high_reasoning',svc,eventKey:'race',source:'commercialModelRouterTest',emergencyEpochClaim:{control_id:'emergency-global',control_revision:31,capabilities:['negotiations'],captured_at:new Date().toISOString()},emergencyCapabilities:'negotiations'})).rejects.toMatchObject({code:'EMERGENCY_EFFECT_AMBIGUOUS',review_required:true});
    }finally{
      globalThis.fetch=originalFetch;
      for(const name of envNames)previous[name]===undefined?globalThis.Deno.env.delete(name):globalThis.Deno.env.set(name,previous[name]);
      globalThis.Deno=originalDeno;
    }
    expect(providerCalls).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({status:'FAILED',usage_json:{ambiguity_state:'REVIEW_REQUIRED',automatic_retry_blocked:true}});
  });

  it('treats a non-2xx Anthropic response as effect-unknown and never calls a fallback model', async () => {
    let budget={id:'budget',control_key:'global',status:'active',currency:'EUR',version:'v1',daily_total_limit_minor:1000,monthly_total_limit_minor:10000,category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_limit_minor:500,monthly_limit_minor:5000}])),estimated_unit_cost_minor_json:{ai:1},anomaly_warning_pct:70,hard_stop_pct:95,emergency_stop_active:false,reservation_revision:0,reservation_day_key:new Date().toISOString().slice(0,10),reservation_month_key:new Date().toISOString().slice(0,7),reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[]};
    const events=[];
    const svc={entities:{
      EmergencyControl:{filter:async()=>[{id:'emergency-global',control_key:'global',control_revision:1,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false}]},
      CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},
      CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:'cost-2',...structuredClone(value)};events.push(row);return structuredClone(row);},update:async(id,patch)=>{const index=events.findIndex((row)=>row.id===id);events[index]={...events[index],...structuredClone(patch)};return structuredClone(events[index]);}},
    }};
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    globalThis.Deno={env:{get:(name)=>name==='ANTHROPIC_API_KEY'?'test-key':name==='ANTHROPIC_STANDARD_MODEL'?'test-standard':name==='ANTHROPIC_OPUS_MODEL'?'test-opus':undefined}};
    let providerCalls=0;
    globalThis.fetch=async()=>{providerCalls++;return new Response('{"error":"overloaded"}',{status:503,headers:{'content-type':'application/json'}})};
    try{
      await expect(callCambraClaude('test',{tier:'high_reasoning',svc,eventKey:'http-503',source:'commercialModelRouterTest'})).rejects.toMatchObject({code:'PROVIDER_EFFECT_REVIEW_REQUIRED',status:409,review_required:true,automatic_retry_blocked:true});
    }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(providerCalls).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({status:'FAILED',usage_json:{ambiguity_state:'REVIEW_REQUIRED',automatic_retry_blocked:true,provider_http_status:503}});
  });

  it('treats a network throw after transport starts as REVIEW_REQUIRED', async () => {
    let budget={id:'budget',control_key:'global',status:'active',currency:'EUR',version:'v1',daily_total_limit_minor:1000,monthly_total_limit_minor:10000,category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_limit_minor:500,monthly_limit_minor:5000}])),estimated_unit_cost_minor_json:{ai:1},anomaly_warning_pct:70,hard_stop_pct:95,emergency_stop_active:false,reservation_revision:0,reservation_day_key:new Date().toISOString().slice(0,10),reservation_month_key:new Date().toISOString().slice(0,7),reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[]};
    const events=[];
    const svc={entities:{EmergencyControl:{filter:async()=>[{id:'emergency-global',control_key:'global',control_revision:1,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false}]},CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:'cost-network',...structuredClone(value)};events.push(row);return structuredClone(row);},update:async(id,patch)=>{const index=events.findIndex((row)=>row.id===id);events[index]={...events[index],...structuredClone(patch)};return structuredClone(events[index]);}}}};
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    globalThis.Deno={env:{get:(name)=>name==='ANTHROPIC_API_KEY'?'test-key':undefined}};
    let providerCalls=0;
    globalThis.fetch=async()=>{providerCalls++;throw new TypeError('connection_reset_after_write')};
    try{await expect(callCambraClaude('test',{svc,eventKey:'network',source:'commercialModelRouterTest'})).rejects.toMatchObject({code:'PROVIDER_EFFECT_REVIEW_REQUIRED',status:409,review_required:true,automatic_retry_blocked:true});}
    finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(providerCalls).toBe(1);
    expect(events[0]).toMatchObject({status:'FAILED',usage_json:{ambiguity_state:'REVIEW_REQUIRED',automatic_retry_blocked:true}});
  });

  it('keeps a 2xx provider effect REVIEW_REQUIRED when local settlement cannot be persisted', async () => {
    let budget={id:'budget',control_key:'global',status:'active',currency:'EUR',version:'v1',daily_total_limit_minor:1000,monthly_total_limit_minor:10000,category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_limit_minor:500,monthly_limit_minor:5000}])),estimated_unit_cost_minor_json:{ai:1},anomaly_warning_pct:70,hard_stop_pct:95,emergency_stop_active:false,reservation_revision:0,reservation_day_key:new Date().toISOString().slice(0,10),reservation_month_key:new Date().toISOString().slice(0,7),reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[]};
    const svc={entities:{EmergencyControl:{filter:async()=>[{id:'emergency-global',control_key:'global',control_revision:1,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false}]},CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},CostUsageEvent:{filter:async()=>[],create:async(value)=>({id:'cost-settlement',...structuredClone(value)}),update:async()=>{throw new Error('settlement_store_offline')}}}};
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    globalThis.Deno={env:{get:(name)=>name==='ANTHROPIC_API_KEY'?'test-key':undefined}};
    let providerCalls=0;
    globalThis.fetch=async()=>{providerCalls++;return new Response(JSON.stringify({content:[{type:'text',text:'accepted'}]}),{status:200,headers:{'content-type':'application/json'}})};
    try{await expect(callCambraClaude('test',{svc,eventKey:'settlement',source:'commercialModelRouterTest'})).rejects.toMatchObject({code:'PROVIDER_EFFECT_REVIEW_REQUIRED',status:409,review_required:true,automatic_retry_blocked:true,review_persistence_failed:true});}
    finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(providerCalls).toBe(1);
  });

  it('routes provider negotiation and Developer to high reasoning', () => {
    expect(read('base44/functions/providerNegotiationAgent/entry.ts')).toMatch(/tier\s*:\s*["']high_reasoning["']/);
    expect(read('base44/functions/developerMigrationEngine/entry.ts')).toMatch(/tier\s*:\s*["']high_reasoning["']/);
  });

  it('escalates complex inbound replies but keeps ordinary followups standard', () => {
    expect(read('base44/functions/commercialReplyAgent/entry.ts')).toContain('commercialNeedsHighReasoning');
    expect(read('base44/functions/commercialFollowUpWorker/entry.ts')).toMatch(/tier\s*:\s*["']standard["']/);
  });

  it('follow-up loop is active hourly and stops after policy max', () => {
    const config = read('base44/functions/commercialFollowUpWorker/function.jsonc');
    const source = read('base44/functions/commercialFollowUpWorker/entry.ts');
    expect(config).toContain('"is_active": true');
    expect(config).toContain('"repeat_interval": 1');
    expect(source).toMatch(/followups\s*>=\s*max/);
    expect(source).toMatch(/status\s*:\s*["']closed["']/);
  });
});