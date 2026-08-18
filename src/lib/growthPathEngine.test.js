import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { applyScenarioChanges, buildGrowthPath, detectGrowthConstraints, GROWTH_CHANNELS, GROWTH_PATH_ENGINE_VERSION, resolveGrowthAssumption } from '../../base44/shared/growthPath.ts';
import { defaultGrowthRegistryRows, validateGrowthAssumption, validateGrowthTarget } from '../../base44/shared/growthPathRuntime.ts';

const read = (path) => fs.readFileSync(path,'utf8');
const baseObserved = { actuals:{ bookings:1000,verified_economic_value:4000,revenue:700,cash:500 },evidence:{ qualified_observations:20,real_outcomes:2,calibration_confidence:.2 },system:{ emergency_stop:false },production:{ sealed:true,source_ref:'ProductionReadinessSnapshot:1' },markets:{ commercially_ready:1 },policy:{ active_canary:true,daily_send_limit:10,source_ref:'CommercialPolicy:1' },capacity:{ valid_sending_profiles:1,outbound_daily_contacts:10,outbound_annual_contacts:2200 },operations:{ blocked_migrations:0,billing_blockers:0 },founder:{ weekly_available_meetings:5 },pipeline:{ meetings_or_proposals:1 },costs:{ complete:true } };

describe('CAMBRA Growth Path Engine V1', () => {
  it('uses a versioned target registry rather than a hardcoded 100M branch', () => {
    const defaults = defaultGrowthRegistryRows('2026-08-11T00:00:00.000Z');
    expect(defaults.targets.map(x=>x.target_value)).toEqual([50000,3000000,24000000,100000000]);
    expect(read('base44/shared/growthPath.ts')).not.toContain('100000000');
    expect(defaults.targets.every(x=>x.status==='ACTIVE'&&x.target_kind==='STRATEGIC_TARGET')).toBe(true);
  });

  it('labels every planning input and resolves the most specific version', () => {
    const { assumptions } = defaultGrowthRegistryRows('2026-08-11T00:00:00.000Z');
    expect(assumptions.every(x=>x.provenance==='ASSUMPTION'&&x.source_ref&&x.version)).toBe(true);
    const resolved = resolveGrowthAssumption(assumptions,'CONVERSION_RATE',{ period_key:'Y1',business_line:'PAYMENTS_EUROPE',channel:'AI_OUTBOUND',geography:'EUROPE' });
    expect(resolved).toMatchObject({ provenance:'ASSUMPTION',value:.012,confidence:.2 });
  });

  it('keeps bookings, verified value, revenue and cash separate', () => {
    const registry = defaultGrowthRegistryRows('2026-08-11T00:00:00.000Z'); const result = buildGrowthPath({ ...registry,observed:baseObserved,as_of:'2026-09-10T00:00:00.000Z' });
    expect(result.actuals).toMatchObject({ bookings:1000,verified_economic_value:4000,revenue:700,cash:500 });
    const y0=result.forecasts.find(x=>x.period_key==='Y0'); expect(y0.totals.bookings.base).not.toBe(y0.totals.revenue.base); expect(y0.totals.revenue.base).not.toBe(y0.totals.cash.base);
  });

  it('withholds target probability during cold start and produces it only with calibrated evidence', () => {
    const registry=defaultGrowthRegistryRows('2026-08-11T00:00:00.000Z'); const cold=buildGrowthPath({ ...registry,observed:baseObserved,as_of:'2026-09-10T00:00:00.000Z' });
    expect(cold.forecasts[0].distribution).toMatchObject({ status:'DETERMINISTIC_COLD_START_RANGE',p10:null,p50:null,p90:null,target_probability:null });
    const calibrated=buildGrowthPath({ ...registry,observed:{...baseObserved,evidence:{ qualified_observations:100,real_outcomes:20,calibration_confidence:.8 }},as_of:'2026-09-10T00:00:00.000Z' });
    expect(calibrated.forecasts[0].distribution.status).toBe('CALIBRATED_RANGE'); expect(calibrated.forecasts[0].distribution.target_probability).not.toBeNull();
  });

  it('detects the real binding constraint before recommending more acquisition', () => {
    expect(detectGrowthConstraints({ observed:{...baseObserved,system:{ emergency_stop:true }} }).binding_constraint.type).toBe('GLOBAL_EMERGENCY_STOP');
    const downstream={...baseObserved,operations:{ blocked_migrations:2,billing_blockers:0 }}; expect(detectGrowthConstraints({ observed:downstream }).binding_constraint.type).toBe('DOWNSTREAM_EXECUTION');
  });

  it('keeps acquisition channel and business line as separate non-double-counted dimensions', () => {
    const registry=defaultGrowthRegistryRows('2026-08-11T00:00:00.000Z'); const result=buildGrowthPath({ ...registry,observed:baseObserved,as_of:'2026-09-10T00:00:00.000Z' });
    const channelTotal=Object.values(result.revenue_bridge.by_channel).reduce((a,b)=>a+b,0); const businessTotal=Object.values(result.revenue_bridge.by_business_line).reduce((a,b)=>a+b,0);
    expect(channelTotal).toBeCloseTo(businessTotal,2); expect(result.revenue_bridge.no_double_counting_rule).toContain('appears once');
  });

  it('runs bounded scenarios without mutating the active assumption registry', () => {
    const { assumptions }=defaultGrowthRegistryRows('2026-08-11T00:00:00.000Z'); const original=assumptions.find(x=>x.channel==='AI_OUTBOUND'&&x.metric_key==='CONVERSION_RATE'); const changed=applyScenarioChanges(assumptions,[{ channel:'AI_OUTBOUND',metric_key:'CONVERSION_RATE',multiplier:2 }]); const scenario=changed.find(x=>x.assumption_key===original.assumption_key);
    expect(original.value).toBe(.012); expect(scenario.value).toBe(.024); expect(scenario.source_note).toContain('Temporary founder scenario override');
  });

  it('models every required channel and keeps paid media as do-not-scale without evidence', () => {
    expect(GROWTH_CHANNELS).toEqual(['AI_OUTBOUND','PARTNERS','MERCHANT_REFERRALS','PAID_MEDIA','ORGANIC_SEO','ANALYZER_INBOUND','STRATEGIC_ECOSYSTEM','CROSS_SELL']);
    const registry=defaultGrowthRegistryRows('2026-08-11T00:00:00.000Z'); const result=buildGrowthPath({ ...registry,observed:baseObserved,as_of:'2026-09-10T00:00:00.000Z' }); expect(result.marginal_allocation.find(x=>x.channel==='PAID_MEDIA')).toMatchObject({ status:'DO_NOT_SCALE',execute:false });
  });

  it('validates founder edits and rejects negative or untraceable values', () => {
    expect(validateGrowthTarget({ period_key:'Y1',period_start:'2027-01-01',period_end:'2027-12-31',metric_key:'REVENUE',business_line:'ALL',target_value:3_000_000 }).ok).toBe(true);
    expect(validateGrowthTarget({ period_key:'Y1',period_start:'2027-12-31',period_end:'2027-01-01',metric_key:'REVENUE',business_line:'ALL',target_value:1 }).ok).toBe(false);
    expect(validateGrowthAssumption({ metric_key:'CONVERSION_RATE',unit:'ratio',value:.1,confidence:.5,provenance:'CALIBRATED',channel:'AI_OUTBOUND' }).ok).toBe(true);
    expect(validateGrowthAssumption({ metric_key:'X',unit:'ratio',value:-1,confidence:2,provenance:'MAGIC' }).ok).toBe(false);
  });

  it('consolidates the runtime behind an existing deployed function name', () => {
    const route=read('base44/functions/getEuropeMarketsCommandCenter/entry.ts'); const config=JSON.parse(read('base44/functions/getEuropeMarketsCommandCenter/function.jsonc')); const handler=read('base44/shared/logical/getEuropeanGrowthCommandCenter.ts');
    expect(route).toContain("routedBody?.view === 'growth'"); expect(config.automations[0]).toMatchObject({ function_name:'getEuropeMarketsCommandCenter',repeat_interval:6,function_args:{internal_secret:'{{INTERNAL_CALL_SECRET}}'} }); expect(handler).toContain('recomputeEuropeanMarketPortfolio'); expect(handler).toContain('persistGrowthPathSnapshot'); expect(handler).toContain('claimSchedulerRun');
  });

  it('persists the four governed data contracts and exposes the founder cockpit', () => {
    for(const file of ['growth-target-registry','growth-assumption-registry','growth-path-snapshot','growth-scenario']) expect(fs.existsSync(`base44/entities/${file}.jsonc`)).toBe(true);
    const admin=read('src/pages/admin/AdminGrowth.jsx'); expect(admin).toContain('Growth Path · Actual vs Plan'); expect(admin).toContain('Binding constraint'); expect(admin).toContain('Scenario lab'); expect(admin).toContain('Recompute & snapshot'); expect(GROWTH_PATH_ENGINE_VERSION).toBe('growth-path-v1.0.0');
  });
});
