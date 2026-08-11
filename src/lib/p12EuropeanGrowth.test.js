import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { acquisitionTouchHistory, allocationRecommendation, calculateCac, canonicalFunnel, contactFatigueDecision, DEFAULT_GROWTH_POLICY, evaluateExperiment, forecastScenarios, launchReadiness, maturityTier, scoreMarketAttractiveness } from '../../base44/shared/europeanGrowth.ts';

const read = (path) => fs.readFileSync(path, 'utf8'); const json = (path) => JSON.parse(read(path));

describe('P12 European launch and growth intelligence', () => {
  it('scores only evidenced dimensions and refuses a fake magic score', () => {
    expect(scoreMarketAttractiveness({ merchant_supply:{ value:90,evidence_refs:['lead:1'] } }, DEFAULT_GROWTH_POLICY)).toMatchObject({ status:'INSUFFICIENT_EVIDENCE',score:null });
    const dimensions = Object.fromEntries(Object.keys(DEFAULT_GROWTH_POLICY.marketAttractivenessWeights).map((key,index) => [key,{ value:60+index,evidence_refs:[`${key}:1`] }]));
    const result = scoreMarketAttractiveness(dimensions, DEFAULT_GROWTH_POLICY);
    expect(result.status).toBe('SCORED'); expect(result.score).toBeGreaterThan(60); expect(result.components.regulatory.evidence_refs).toEqual(['regulatory:1']);
  });

  it('gives P11 and P10 absolute launch authority before growth value', () => {
    expect(launchReadiness({ production:{ sealed:false },regulatory:{ gate:'CONDITIONS' } })).toMatchObject({ state:'TECHNICAL_BLOCKED',hard_blocker:'P11' });
    expect(launchReadiness({ production:{ sealed:true },regulatory:{ gate:'REVIEW' },localization:{ translation_readiness:'NATIVE_PRODUCT' } })).toMatchObject({ state:'REGULATORY_BLOCKED',hard_blocker:'P10' });
    expect(launchReadiness({ production:{ sealed:true },regulatory:{ gate:'CONDITIONS' },localization:{ translation_readiness:'FALLBACK_ONLY' } })).toMatchObject({ state:'COMMERCIAL_BLOCKED',hard_blocker:'P9' });
  });

  it('upgrades maturity from objective observed evidence', () => {
    expect(maturityTier()).toBe(0); expect(maturityTier({ observations:5 })).toBe(1); expect(maturityTier({ observations:40,real_outcomes:1 })).toBe(2); expect(maturityTier({ observations:100,real_outcomes:10 })).toBe(3); expect(maturityTier({ observations:300,real_outcomes:30 })).toBe(4);
  });

  it('deduplicates funnel events and preserves null conversions', () => {
    const funnel = canonicalFunnel([{ stage:'DISCOVERED',entity_id:'a',idempotency_key:'1' },{ stage:'DISCOVERED',entity_id:'a',idempotency_key:'1' },{ stage:'QUALIFIED',entity_id:'a',idempotency_key:'2' }]);
    expect(funnel).toMatchObject({ event_count:2,idempotent:true }); expect(funnel.conversion('DISCOVERED','QUALIFIED')).toBe(1); expect(funnel.conversion('RESPONDED','MEETING')).toBeNull();
  });

  it('never reports zero CAC because cost categories are missing', () => {
    expect(calculateCac({ costs:{ paid_media:0 },attributed_new_customers:1 })).toMatchObject({ cac:null,status:'UNKNOWN' });
    const costs = Object.fromEntries(['paid_media','tools','enrichment','email','ai','people','agency','other'].map((x) => [x,10])); expect(calculateCac({ costs,attributed_new_customers:2 })).toMatchObject({ cac:40,total_cost:80,status:'EVIDENCED' });
  });

  it('keeps underpowered experiments inconclusive and adjusts multiple testing', () => {
    expect(evaluateExperiment({ control:{ n:20,successes:5 },variant:{ n:20,successes:10 } }, DEFAULT_GROWTH_POLICY)).toMatchObject({ status:'NO_CONCLUSIVE_RESULT' });
    const result = evaluateExperiment({ control:{ n:1000,successes:100 },variant:{ n:1000,successes:180 },comparisons:3 }, DEFAULT_GROWTH_POLICY); expect(result).toMatchObject({ status:'CONCLUSIVE',winner:'variant',multiple_testing_adjusted:true });
  });

  it('forecasts scenarios only from observed history and labels non-commitment', () => {
    expect(forecastScenarios({ history:[100,120] })).toMatchObject({ status:'INSUFFICIENT_EVIDENCE',base:null });
    expect(forecastScenarios({ history:[100,120,110] })).toMatchObject({ status:'SCENARIOS',base:110,not_a_commitment:true });
  });

  it('protects contact fatigue and keeps allocation shadow-only', () => {
    expect(contactFatigueDecision({ attempts_30d:4 }, DEFAULT_GROWTH_POLICY)).toMatchObject({ allowed:false,reason_code:'contact_fatigue_cap' });
    expect(allocationRecommendation({ launch_state:'READY',available_capacity:10 }, DEFAULT_GROWTH_POLICY)).toMatchObject({ mode:'SHADOW',recommended_capacity:10,exploration_capacity:2,execute:false });
    expect(allocationRecommendation({ launch_state:'READY',available_capacity:10,safe_mode:true }, DEFAULT_GROWTH_POLICY)).toMatchObject({ recommended_capacity:0,execute:false });
  });

  it('preserves first touch and idempotent attribution history', () => {
    const first = { idempotency_key:'one',occurred_at:'2026-01-01T00:00:00Z',channel:'seo' }; const second = { idempotency_key:'two',occurred_at:'2026-01-02T00:00:00Z',channel:'partner' };
    const history = acquisitionTouchHistory([first],second); expect(history.first_touch.channel).toBe('seo'); expect(history.last_touch.channel).toBe('partner'); expect(acquisitionTouchHistory(history.touches,second).deduplicated).toBe(true);
  });

  it('keeps policy and KPI definitions machine-readable and complete', () => {
    const policy = json('config/p12-growth-policy.json'); const kpis = json('config/p12-kpi-definitions.json'); expect(policy.version).toBe(DEFAULT_GROWTH_POLICY.version); expect(policy.mode).toBe('SHADOW_RECOMMEND_ONLY'); expect(kpis.kpis).toHaveLength(10); expect(kpis.kpis.find((x) => x.key === 'cac').definition).toContain('missing cost categories make CAC unknown');
  });

  it('builds the 33-market portfolio inside P8 without a second orchestrator', () => {
    const worker = read('base44/functions/europeanGrowthIntelligenceWorker/entry.ts'); const orchestrator = read('base44/functions/autonomousCompanyOrchestrator/entry.ts');
    expect(worker).toContain('for (const market of EUROPE_MARKETS'); expect(worker).toContain('material_execution:false'); expect(worker).toContain("event_type:'MARKET_PORTFOLIO_UPDATED'"); expect(worker).not.toMatch(/commercialSendMessage|createEligibleRecoverInvoices|startPaymentsMigration|stripeBillingWebhook/); expect(orchestrator).toContain("'europeanGrowthIntelligenceWorker'");
  });

  it('reuses P9, P10, P11, Founder OS, approval inbox, SEO, partners and emergency controls', () => {
    const worker = read('base44/functions/europeanGrowthIntelligenceWorker/entry.ts'); const command = read('base44/functions/getEuropeanGrowthCommandCenter/entry.ts');
    expect(worker).toContain("from '../../shared/localeRuntime.ts'"); expect(worker).toContain('RegulatoryPolicyVersion'); expect(worker).toContain('ProductionReadinessSnapshot'); expect(worker).toContain('emergencyState'); expect(command).toContain("Approval.filter({ status:'pending' }");
    expect(read('base44/functions/founderOSQuery/entry.ts')).toContain('why_metric'); expect(fs.existsSync('base44/functions/seoAgent/entry.ts')).toBe(true); expect(fs.existsSync('base44/shared/referralProgram.ts')).toBe(true);
  });

  it('models portfolio, segment, decisions/outcomes, experiments, costs, touches, activation and briefs', () => {
    for (const name of ['MarketGrowthSnapshot','SegmentGrowthOpportunity','GrowthDecision','GrowthDecisionOutcome','GrowthExperiment','GrowthCostLedger','AcquisitionTouch','MarketActivationState','FounderGrowthBrief']) expect(fs.existsSync(`base44/entities/${name}.jsonc`)).toBe(true);
  });

  it('integrates a mobile-usable executive cockpit into the existing Admin', () => {
    expect(read('src/App.jsx')).toContain('/admin/growth'); expect(read('src/pages/admin/AdminLayout.jsx')).toContain('Europe · Growth'); const admin = read('src/pages/admin/AdminGrowth.jsx'); expect(admin).toContain('Founder morning brief'); expect(admin).toContain('overflow-auto'); expect(admin).toContain('SHADOW');
  });
});
