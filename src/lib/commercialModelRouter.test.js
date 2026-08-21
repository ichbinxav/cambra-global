import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  callCambraClaude,
  settleCommercialPaidOperationAndVerify,
} from '../../base44/shared/commercialModelRouter.ts';
import { resolveObservedAnthropicEgressPolicy } from '../../base44/shared/commercialProtectedEgress.ts';
import { commercialInferenceFailureTerminal } from '../../base44/shared/commercialAgentTask.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function costRuntime({ afterReservation, settlementError, settlementNoWrite, mutateReadback } = {}) {
  let budget={id:'budget',control_key:'global',status:'active',currency:'EUR',version:'v1',daily_total_limit_minor:1000,monthly_total_limit_minor:10000,category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_limit_minor:500,monthly_limit_minor:5000}])),estimated_unit_cost_minor_json:{ai:1},anomaly_warning_pct:70,hard_stop_pct:95,emergency_stop_active:false,reservation_revision:0,reservation_day_key:new Date().toISOString().slice(0,10),reservation_month_key:new Date().toISOString().slice(0,7),reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[]};
  const events=[];
  const svc={entities:{
    EmergencyControl:{filter:async()=>[{id:'emergency-global',control_key:'global',control_revision:1,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false}]},
    CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},
    CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:`cost-runtime-${events.length+1}`,...structuredClone(value)};events.push(row);await afterReservation?.(row);return structuredClone(row);},update:async(id,patch)=>{if(settlementError)throw new Error('synthetic_settlement_failure');if(settlementNoWrite)return{id};const index=events.findIndex((row)=>row.id===id);events[index]={...events[index],...structuredClone(patch)};return structuredClone(events[index]);},get:async(id)=>{const row=structuredClone(events.find((candidate)=>candidate.id===id)||null);return row&&mutateReadback?mutateReadback(row):row;}},
  }};
  return {svc,events};
}

describe('CAMBRA model router', () => {
  it('keeps Sonnet for volume and Opus for high reasoning without unsafe post-transport fallback', () => {
    const source = read('base44/shared/commercialModelRouter.ts');
    expect(source).toContain('claude-sonnet-5');
    expect(source).toContain('claude-opus-5');
    expect(source).not.toContain("invoke(standard,'fallback')");
    expect(source).toContain('PROVIDER_EFFECT_REVIEW_REQUIRED');
  });

  it('blocks protected sources before cost reservation or provider transport when policy is unobserved', async () => {
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    let providerCalls=0,serviceTouches=0;
    globalThis.Deno={env:{get:()=>undefined}};
    globalThis.fetch=async()=>{providerCalls++;return new Response('{}',{status:200})};
    const svc=new Proxy({}, {get(){serviceTouches++;throw new Error('service_must_not_be_touched')}});
    try{
      await expect(callCambraClaude('protected prompt',{
        svc,
        eventKey:'blocked-policy',
        source:'codeReviewAgent',
        protectedEgress:{
          purpose:'admin_requested_code_review',
          policy:{status:'OBSERVED',policy_id:'policy-2026-08',policy_hash:'a'.repeat(64),purpose:'admin_requested_code_review',expires_at:null},
        },
      })).rejects.toMatchObject({
        code:'COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED',
        status:409,
        review_required:true,
        automatic_retry_blocked:true,
      });
    }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(serviceTouches).toBe(0);
    expect(providerCalls).toBe(0);
  });

  it('marks a raced negotiation model effect REVIEW_REQUIRED and never falls back', async () => {
    let control={id:'emergency-global',control_key:'global',control_revision:31,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false};
    const day=new Date().toISOString().slice(0,10),month=day.slice(0,7);
    let budget={id:'budget',control_key:'global',status:'active',currency:'EUR',version:'v1',daily_total_limit_minor:1000,monthly_total_limit_minor:10000,category_limits_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_limit_minor:500,monthly_limit_minor:5000}])),estimated_unit_cost_minor_json:{ai:1},anomaly_warning_pct:70,hard_stop_pct:95,emergency_stop_active:false,reservation_revision:0,reservation_day_key:day,reservation_month_key:month,reserved_daily_total_minor:0,reserved_monthly_total_minor:0,reserved_category_json:Object.fromEntries(['ai','api','enrichment','email'].map(category=>[category,{daily_minor:0,monthly_minor:0}])),reservation_recent_event_keys:[]};
    const events=[];
    const svc={entities:{
      EmergencyControl:{filter:async()=>[structuredClone(control)]},
      CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},
      CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:'cost-1',...structuredClone(value)};events.push(row);return structuredClone(row);},update:async(id,patch)=>{const index=events.findIndex((row)=>row.id===id);events[index]={...events[index],...structuredClone(patch)};return structuredClone(events[index]);},get:async(id)=>structuredClone(events.find((row)=>row.id===id)||null)},
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
      CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:'cost-2',...structuredClone(value)};events.push(row);return structuredClone(row);},update:async(id,patch)=>{const index=events.findIndex((row)=>row.id===id);events[index]={...events[index],...structuredClone(patch)};return structuredClone(events[index]);},get:async(id)=>structuredClone(events.find((row)=>row.id===id)||null)},
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
    const svc={entities:{EmergencyControl:{filter:async()=>[{id:'emergency-global',control_key:'global',control_revision:1,safe_mode:false,communications_paused:false,negotiations_paused:false,migrations_paused:false,billing_issuance_paused:false,paid_discovery_paused:false,resume_check_required:false}]},CostBudgetControl:{filter:async()=>[structuredClone(budget)],get:async()=>structuredClone(budget),updateMany:async(query,operation)=>{if(query.id!==budget.id||query.reservation_revision!==budget.reservation_revision)return{updated:0};budget={...budget,...structuredClone(operation.$set)};return{updated:1};}},CostUsageEvent:{filter:async()=>[],create:async(value)=>{const row={id:'cost-network',...structuredClone(value)};events.push(row);return structuredClone(row);},update:async(id,patch)=>{const index=events.findIndex((row)=>row.id===id);events[index]={...events[index],...structuredClone(patch)};return structuredClone(events[index]);},get:async(id)=>structuredClone(events.find((row)=>row.id===id)||null)}}};
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
    globalThis.fetch=async()=>{providerCalls++;return new Response(JSON.stringify({type:'message',id:'msg_settlement_real',content:[{type:'text',text:'accepted'}]}),{status:200,headers:{'content-type':'application/json'}})};
    try{await expect(callCambraClaude('test',{svc,eventKey:'settlement',source:'commercialModelRouterTest'})).rejects.toMatchObject({code:'PROVIDER_EFFECT_REVIEW_REQUIRED',status:409,review_required:true,automatic_retry_blocked:true,review_persistence_failed:true});}
    finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(providerCalls).toBe(1);
  });

  it.each([
    ['an update response without a durable write',{settlementNoWrite:true}],
    ['a mismatched event key',{mutateReadback:(row)=>({...row,event_key:'different-event-key'})}],
    ['a mismatched final status',{mutateReadback:(row)=>({...row,status:'RESERVED'})}],
    ['mismatched transport evidence',{mutateReadback:(row)=>({...row,usage_json:{...row.usage_json,transport_started:false}})}],
    ['a mismatched provider receipt',{mutateReadback:(row)=>({...row,usage_json:{...row.usage_json,provider_receipt_id:'msg_different_0001'}})}],
    ['a mismatched amount',{mutateReadback:(row)=>({...row,amount_minor:Number(row.amount_minor)+1})}],
    ['a string amount',{mutateReadback:(row)=>({...row,amount_minor:String(row.amount_minor)})}],
    ['an unsafe integer amount',{mutateReadback:(row)=>({...row,amount_minor:Number.MAX_SAFE_INTEGER+1})}],
    ['a mismatched amount quality',{mutateReadback:(row)=>({...row,usage_json:{...row.usage_json,amount_quality:'CORRUPTED'}})}],
    ['an unexpected usage field',{mutateReadback:(row)=>({...row,usage_json:{...row.usage_json,unexpected_provider_field:true}})}],
    ['a mismatched provider',{mutateReadback:(row)=>({...row,provider:'different-provider'})}],
    ['a boxed id',{mutateReadback:(row)=>({...row,id:new String(row.id)})}],
    ['a boxed event key',{mutateReadback:(row)=>({...row,event_key:new String(row.event_key)})}],
    ['a boxed status',{mutateReadback:(row)=>({...row,status:new String(row.status)})}],
    ['a noncanonical completion timestamp',{mutateReadback:(row)=>({...row,completed_at:new Date(row.completed_at).toUTCString()})}],
    ['an unlinked completion timestamp',{mutateReadback:(row)=>({...row,completed_at:new Date(Date.parse(row.completed_at)+1).toISOString()})}],
    ['a completion before occurrence',{mutateReadback:(row)=>({...row,completed_at:new Date(Date.parse(row.occurred_at)-1).toISOString()})}],
  ])('does not treat %s as a persisted settlement receipt',async(_label,runtimeOptions)=>{
    const {svc}=costRuntime(runtimeOptions);
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    globalThis.Deno={env:{get:(name)=>name==='ANTHROPIC_API_KEY'?'synthetic-test-key':undefined}};
    globalThis.fetch=async()=>new Response(JSON.stringify({type:'message',id:'msg_readback_0001',content:[{type:'text',text:'accepted'}]}),{status:200,headers:{'content-type':'application/json'}});
    let thrown;
    try{await callCambraClaude('test',{svc,eventKey:`readback-${_label}`,source:'commercialModelRouterTest'});}
    catch(error){thrown=error;}
    finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(thrown).toMatchObject({
      code:'PROVIDER_EFFECT_REVIEW_REQUIRED',status:409,review_required:true,
      automatic_retry_blocked:true,review_persistence_failed:true,
      agent_task_evidence:{
        reservation_persisted:true,settlement_persisted:false,
        transport_started:true,transport_evidence_persisted:false,
        cost_record_refs:[{type:'CostUsageEvent',id:'cost-runtime-1'}],
      },
    });
    expect(thrown.agent_task_evidence.effect_refs)
      .not.toEqual(expect.arrayContaining([{type:'CostUsageEventTransport',id:'cost-runtime-1'}]));
    expect(commercialInferenceFailureTerminal(thrown)).toMatchObject({
      terminalState:'REVIEW_REQUIRED',effectState:'FAILED_POST_EFFECT',
      ambiguityState:'REVIEW_REQUIRED',costState:'RESERVED',
    });
  });

  it.each([
    ['string reservation amount',{reservationAmount:'1'}],
    ['unsafe reservation amount',{reservationAmount:Number.MAX_SAFE_INTEGER+1}],
    ['string settlement amount',{inputAmount:'1'}],
    ['NaN settlement amount',{inputAmount:Number.NaN}],
    ['unsafe settlement amount',{inputAmount:Number.MAX_SAFE_INTEGER+1}],
  ])('rejects %s before writing settlement evidence',async(_label,values)=>{
    let writes=0;
    const occurredAt='2026-08-21T12:00:00.000Z';
    const reservation={duplicate:false,event:{
      id:'cost-strict-amount-1',
      event_key:'ai:strict-amount-1',
      status:'RESERVED',
      amount_minor:Object.prototype.hasOwnProperty.call(values,'reservationAmount')
        ?values.reservationAmount
        :1,
      usage_json:{reserved:true},
      category:'ai',provider:'anthropic',source:'commercialModelRouterTest',
      related_entity_type:'AgentTask',related_entity_id:'task-1',currency:'EUR',
      budget_version:'v1',occurred_at:occurredAt,
    }};
    const input={
      ok:true,
      usage_json:{
        transport_started:true,
        provider_receipt_id:'msg_amount_guard_0001',
      },
      ...(Object.prototype.hasOwnProperty.call(values,'inputAmount')
        ?{amount_minor:values.inputAmount}
        :{}),
    };
    const svc={entities:{CostUsageEvent:{
      update:async()=>{writes+=1;return null;},
      get:async()=>null,
    }}};
    await expect(settleCommercialPaidOperationAndVerify(svc,reservation,input))
      .rejects.toMatchObject({
        code:'COST_SETTLEMENT_REVIEW_REQUIRED',
        status:409,
        automatic_retry_blocked:true,
      });
    expect(writes).toBe(0);
  });

  it('re-observes protected policy after reservation and settles without transport when approval is revoked', async () => {
    const env={
      ANTHROPIC_API_KEY:'synthetic-test-key',
      ANTHROPIC_STANDARD_MODEL:'test-standard',
      CAMBRA_ANTHROPIC_EGRESS_POLICY_STATUS:'APPROVED',
      CAMBRA_ANTHROPIC_EGRESS_POLICY_ID:'policy-race-2026',
      CAMBRA_ANTHROPIC_EGRESS_POLICY_SHA256:'a'.repeat(64),
      CAMBRA_ANTHROPIC_EGRESS_POLICY_PURPOSES:'admin_requested_code_review',
      CAMBRA_ANTHROPIC_EGRESS_POLICY_EXPIRES_AT:'2099-01-01T00:00:00.000Z',
    };
    const policy=resolveObservedAnthropicEgressPolicy('admin_requested_code_review',{getEnv:(name)=>env[name]});
    expect(policy.ok).toBe(true);
    const {svc,events}=costRuntime({afterReservation:async()=>{env.CAMBRA_ANTHROPIC_EGRESS_POLICY_STATUS='REVOKED';}});
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    let providerCalls=0;
    globalThis.Deno={env:{get:(name)=>env[name]}};
    globalThis.fetch=async()=>{providerCalls++;return new Response('{}',{status:200})};
    try{
      await expect(callCambraClaude('protected race',{svc,eventKey:'policy-race',source:'codeReviewAgent',protectedEgress:{purpose:'admin_requested_code_review',policy:policy.evidence}})).rejects.toMatchObject({
        code:'COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED',
        status:409,
        review_required:true,
        automatic_retry_blocked:true,
        agent_task_evidence:{reservation_started:true,reservation_persisted:true,settlement_persisted:true,transport_started:false},
      });
    }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(providerCalls).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({status:'FAILED',usage_json:{transport_started:false}});
  });

  it.each([
    ['malformed receipt',{type:'message',id:'request_not_a_receipt',content:[{type:'text',text:'unsafe-success'}]}],
    ['receipt id with whitespace',{type:'message',id:' msg_exact_receipt_0001 ',content:[{type:'text',text:'unsafe-success'}]}],
    ['nonprimitive receipt id',{type:'message',id:['msg_exact_receipt_0001'],content:[{type:'text',text:'unsafe-success'}]}],
    ['invalid JSON','not-json'],
  ])('never claims EXECUTED for a 2xx %s',async(_label,body)=>{
    const {svc,events}=costRuntime();
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    globalThis.Deno={env:{get:(name)=>name==='ANTHROPIC_API_KEY'?'synthetic-test-key':undefined}};
    globalThis.fetch=async()=>new Response(typeof body==='string'?body:JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
    let thrown;
    try{
      await callCambraClaude('test',{svc,eventKey:`invalid-${_label}`,source:'commercialModelRouterTest'});
    }catch(error){thrown=error;}
    finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(thrown).toMatchObject({
      code:'PROVIDER_RECEIPT_REVIEW_REQUIRED',
      status:409,
      automatic_retry_blocked:true,
      agent_task_evidence:{receipt_refs:[],reservation_persisted:true,settlement_persisted:true,transport_started:true},
    });
    expect(events[0]).toMatchObject({status:'FAILED',usage_json:{provider_receipt_valid:false,ambiguity_state:'REVIEW_REQUIRED'}});
  });

  it('settles a valid receipt with invalid output as REVIEW_REQUIRED instead of success',async()=>{
    const {svc,events}=costRuntime();
    const originalDeno=globalThis.Deno,originalFetch=globalThis.fetch;
    globalThis.Deno={env:{get:(name)=>name==='ANTHROPIC_API_KEY'?'synthetic-test-key':undefined}};
    globalThis.fetch=async()=>new Response(JSON.stringify({type:'message',id:'msg_output_invalid',content:[]}),{status:200,headers:{'content-type':'application/json'}});
    try{
      await expect(callCambraClaude('test',{svc,eventKey:'invalid-output',source:'commercialModelRouterTest'})).rejects.toMatchObject({
        code:'PROVIDER_OUTPUT_REVIEW_REQUIRED',
        status:409,
        automatic_retry_blocked:true,
        agent_task_evidence:{receipt_refs:[{type:'AnthropicMessage',id:'msg_output_invalid'}],settlement_persisted:true},
      });
    }finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
    expect(events[0]).toMatchObject({status:'FAILED',usage_json:{provider_output_valid:false,ambiguity_state:'REVIEW_REQUIRED'}});
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
