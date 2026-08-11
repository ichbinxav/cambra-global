import fs from 'node:fs';
const policy = JSON.parse(fs.readFileSync('config/p12-growth-policy.json','utf8')); const kpis = JSON.parse(fs.readFileSync('config/p12-kpi-definitions.json','utf8')); const markets = JSON.parse(fs.readFileSync('config/europe-markets.json','utf8'));
if (policy.schemaVersion !== 1 || policy.mode !== 'SHADOW_RECOMMEND_ONLY') throw new Error('p12_growth_policy_invalid');
const weight = Object.values(policy.marketAttractivenessWeights || {}).reduce((a,b) => a + Number(b), 0); if (Math.abs(weight - 1) > 1e-9) throw new Error(`p12_weights_must_sum_to_one:${weight}`);
if (policy.explorationShare < 0 || policy.explorationShare > .3 || policy.minimumExperimentSamplePerArm < 20) throw new Error('p12_experiment_policy_unsafe');
const required = ['active_merchant','qualified_lead','opportunity','recover_acceptance','verified_savings','cambra_revenue','weighted_pipeline','cac','payback','conversion']; const keys = new Set(kpis.kpis.map((x) => x.key)); for (const key of required) if (!keys.has(key)) throw new Error(`p12_kpi_missing:${key}`);
if (markets.markets.length !== 33) throw new Error('p12_market_universe_not_33');
console.log(`growth:check PASS — ${markets.markets.length} markets · ${kpis.kpis.length} canonical KPIs · weights ${weight}`);
