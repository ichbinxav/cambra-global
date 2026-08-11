export const GROWTH_PATH_ENGINE_VERSION = 'growth-path-v1.0.0';

export const GROWTH_BUSINESS_LINES = Object.freeze(['PAYMENTS_EUROPE', 'PAYMENTS_USA', 'LOGISTICS_EUROPE']);
export const GROWTH_CHANNELS = Object.freeze(['AI_OUTBOUND', 'PARTNERS', 'MERCHANT_REFERRALS', 'PAID_MEDIA', 'ORGANIC_SEO', 'ANALYZER_INBOUND', 'STRATEGIC_ECOSYSTEM', 'CROSS_SELL']);
export const GROWTH_PROVENANCE = Object.freeze(['ASSUMPTION', 'OBSERVED', 'CALIBRATED', 'INSUFFICIENT_DATA']);

const finite = (value:any) => Number.isFinite(Number(value));
const number = (value:any, fallback = 0) => finite(value) ? Number(value) : fallback;
const nonNegative = (value:any) => Math.max(0, number(value));
const clamp01 = (value:any) => Math.max(0, Math.min(1, number(value)));
const round = (value:any, digits = 2) => finite(value) ? Number(Number(value).toFixed(digits)) : null;

function activeRows(rows:any[] = []) {
  return rows.filter((row:any) => !row.status || row.status === 'ACTIVE');
}

function specificity(row:any, query:any) {
  let score = 0;
  for (const key of ['period_key', 'business_line', 'channel', 'geography', 'segment_key']) {
    if (!query[key]) continue;
    if (row[key] === query[key]) score += 2;
    else if (!row[key] || row[key] === 'ALL' || row[key] === 'GLOBAL') score += 1;
    else return -1;
  }
  return score;
}

export function resolveGrowthAssumption(rows:any[] = [], metricKey:string, query:any = {}) {
  const ranked = activeRows(rows)
    .filter((row:any) => row.metric_key === metricKey && finite(row.value))
    .map((row:any) => ({ row, score:specificity(row, query) }))
    .filter((entry:any) => entry.score >= 0)
    .sort((a:any,b:any) => b.score - a.score || Date.parse(b.row.effective_at || '') - Date.parse(a.row.effective_at || ''));
  const row = ranked[0]?.row;
  if (!row) return { value:null,low:null,high:null,provenance:'INSUFFICIENT_DATA',confidence:0,source_ref:null,version:null };
  return {
    value:Number(row.value),
    low:finite(row.low_value) ? Number(row.low_value) : Number(row.value),
    high:finite(row.high_value) ? Number(row.high_value) : Number(row.value),
    provenance:GROWTH_PROVENANCE.includes(row.provenance) ? row.provenance : 'INSUFFICIENT_DATA',
    confidence:clamp01(row.confidence),
    source_ref:row.source_ref || `GrowthAssumptionRegistry:${row.id || row.assumption_key}`,
    version:row.version || null,
    unit:row.unit || null,
    assumption_key:row.assumption_key || null,
  };
}

function variantValue(resolved:any, variant:'low'|'base'|'high') {
  if (!finite(resolved?.value)) return null;
  return variant === 'low' ? resolved.low : variant === 'high' ? resolved.high : resolved.value;
}

function projectChannel(input:any, target:any, channel:string, variant:'low'|'base'|'high') {
  const query = { period_key:target.period_key,business_line:target.business_line === 'ALL' ? 'PAYMENTS_EUROPE' : target.business_line,channel,geography:!target.geography || target.geography === 'GLOBAL' ? 'EUROPE' : target.geography };
  const get = (metric:string) => resolveGrowthAssumption(input.assumptions, metric, query);
  const resolved:any = {
    volume:get('ANNUAL_REACHABLE_VOLUME'),
    conversion:get('CONVERSION_RATE'),
    booking:get('AVERAGE_BOOKING_EUR'),
    realization:get('REVENUE_REALIZATION_RATE'),
    collection:get('CASH_COLLECTION_RATE'),
    margin:get('CONTRIBUTION_MARGIN_RATE'),
    cost:get('VARIABLE_COST_PER_OPPORTUNITY_EUR'),
    valueRatio:get('VERIFIED_VALUE_TO_BOOKING_RATIO'),
    capacity:get('PERIOD_CAPACITY_MULTIPLIER'),
    salesLag:get('SALES_LAG_DAYS'),
    revenueLag:get('REVENUE_LAG_DAYS'),
    cashLag:get('CASH_LAG_DAYS'),
  };
  const required = ['volume','conversion','booking','realization','collection','margin','cost'];
  const missing = required.filter((key) => variantValue(resolved[key], variant) === null);
  if (missing.length) return { channel,business_line:query.business_line,status:'INSUFFICIENT_DATA',missing_inputs:missing,lineage:Object.values(resolved).map((x:any) => x.source_ref).filter(Boolean) };
  const capacityMultiplier = Math.max(0, number(variantValue(resolved.capacity, variant), 1));
  let reachable = nonNegative(variantValue(resolved.volume, variant)) * capacityMultiplier;
  if (channel === 'AI_OUTBOUND' && target.period_key === input.current_period_key && finite(input.observed?.capacity?.outbound_annual_contacts)) reachable = Math.min(reachable, nonNegative(input.observed.capacity.outbound_annual_contacts));
  const conversion = clamp01(variantValue(resolved.conversion, variant));
  const customers = reachable * conversion;
  const bookings = customers * nonNegative(variantValue(resolved.booking, variant));
  const verifiedValue = finite(variantValue(resolved.valueRatio, variant)) ? bookings * nonNegative(variantValue(resolved.valueRatio, variant)) : null;
  const revenue = bookings * clamp01(variantValue(resolved.realization, variant));
  const cash = revenue * clamp01(variantValue(resolved.collection, variant));
  const variableCost = reachable * nonNegative(variantValue(resolved.cost, variant));
  const contribution = revenue * clamp01(variantValue(resolved.margin, variant)) - variableCost;
  const confidence = Math.min(...required.map((key) => clamp01(resolved[key].confidence)));
  return {
    channel,business_line:query.business_line,status:'PROJECTED',variant,
    reachable_volume:round(reachable),customers:round(customers),bookings:round(bookings),verified_economic_value:round(verifiedValue),revenue:round(revenue),cash:round(cash),variable_cost:round(variableCost),contribution:round(contribution),
    lags_days:{ sales:variantValue(resolved.salesLag, variant),revenue:variantValue(resolved.revenueLag, variant),cash:variantValue(resolved.cashLag, variant) },
    confidence:round(confidence, 4),
    provenance:[...new Set(required.map((key) => resolved[key].provenance))],
    lineage:[...new Set(Object.values(resolved).map((x:any) => x.source_ref).filter(Boolean))],
  };
}

function sumProjected(rows:any[], field:string) {
  const projected = rows.filter((row:any) => row.status === 'PROJECTED');
  if (!projected.length) return null;
  const values = projected.map((row:any) => row[field]).filter(finite);
  return values.length ? round(values.reduce((total:number,value:any) => total + Number(value), 0)) : null;
}

function evidencePermitsProbability(observed:any = {}) {
  return nonNegative(observed?.evidence?.qualified_observations) >= 50 && nonNegative(observed?.evidence?.real_outcomes) >= 10 && clamp01(observed?.evidence?.calibration_confidence) >= 0.6;
}

function boundedAttainmentProbability(target:number, low:number|null, base:number|null, high:number|null) {
  if (![target,low,base,high].every(finite) || Number(high) <= Number(low)) return null;
  if (target <= Number(low)) return 0.9;
  if (target >= Number(high)) return 0.1;
  if (target <= Number(base)) return round(0.9 - ((target - Number(low)) / Math.max(1, Number(base) - Number(low))) * 0.4, 4);
  return round(0.5 - ((target - Number(base)) / Math.max(1, Number(high) - Number(base))) * 0.4, 4);
}

function actualMetricForTarget(actuals:any, metric:string) {
  const key:any = { BOOKINGS:'bookings',VERIFIED_ECONOMIC_VALUE:'verified_economic_value',REVENUE:'revenue',CASH:'cash' }[metric];
  return key ? number(actuals?.[key]) : 0;
}

function buildForecast(input:any, target:any) {
  const channels = GROWTH_CHANNELS.map((channel) => ({
    channel,
    low:projectChannel(input,target,channel,'low'),
    base:projectChannel(input,target,channel,'base'),
    high:projectChannel(input,target,channel,'high'),
  }));
  const flatten = (variant:'low'|'base'|'high') => channels.map((entry:any) => entry[variant]);
  const totals:any = {};
  for (const metric of ['bookings','verified_economic_value','revenue','cash','contribution']) totals[metric] = { low:sumProjected(flatten('low'),metric),base:sumProjected(flatten('base'),metric),high:sumProjected(flatten('high'),metric) };
  const targetMetric = String(target.metric_key || 'REVENUE').toLowerCase();
  const targetRange = totals[targetMetric] || { low:null,base:null,high:null };
  const probabilityAllowed = evidencePermitsProbability(input.observed);
  const probability = probabilityAllowed ? boundedAttainmentProbability(Number(target.target_value),targetRange.low,targetRange.base,targetRange.high) : null;
  const confidences = channels.flatMap((entry:any) => [entry.base?.confidence]).filter(finite);
  const confidence = confidences.length ? round(confidences.reduce((a:number,b:any) => a + Number(b),0) / confidences.length,4) : 0;
  return {
    period_key:target.period_key,period_start:target.period_start,period_end:target.period_end,target_key:target.target_key,target_metric:target.metric_key,target_value:Number(target.target_value),currency:target.currency || 'EUR',business_line:target.business_line || 'ALL',
    totals,channels,confidence,
    distribution:probabilityAllowed ? { status:'CALIBRATED_RANGE',p10:targetRange.low,p50:targetRange.base,p90:targetRange.high,target_probability:probability } : { status:'DETERMINISTIC_COLD_START_RANGE',low:targetRange.low,base:targetRange.base,high:targetRange.high,p10:null,p50:null,p90:null,target_probability:null,reason:'Insufficient observed outcomes for a defensible probability distribution.' },
    not_a_commitment:true,
  };
}

export function detectGrowthConstraints(input:any = {}) {
  const o = input.observed || {}; const constraints:any[] = [];
  const add = (type:string,severity:number,binding:boolean,evidence:any[],effect:string) => constraints.push({ type,severity,binding,evidence,effect });
  if (o.system?.emergency_stop) add('GLOBAL_EMERGENCY_STOP',100,true,['EmergencyControl:global'],'Material execution is paused; safe read-only intelligence remains available.');
  if (o.production?.sealed !== true) add('PRODUCTION_READINESS',98,true,[o.production?.source_ref || 'ProductionReadinessSnapshot:missing'],'P11 production evidence blocks autonomous scale.');
  if (!nonNegative(o.markets?.commercially_ready)) add('MARKET_ACTION_READINESS',94,true,['MarketGrowthSnapshot:latest'],'No market is currently evidenced as READY for commercial action.');
  if (!o.policy?.active_canary || !Number.isInteger(Number(o.policy?.daily_send_limit)) || Number(o.policy?.daily_send_limit) <= 0) add('COMMERCIAL_POLICY',92,true,[o.policy?.source_ref || 'CommercialPolicy:missing'],'Outbound policy is absent, not CANARY, or has no valid daily limit.');
  if (!nonNegative(o.capacity?.valid_sending_profiles) || !nonNegative(o.capacity?.outbound_daily_contacts)) add('OUTBOUND_INFRASTRUCTURE',90,true,['OutboundSendingProfile:active'],'No healthy, policy-authorized sending capacity is available.');
  if (nonNegative(o.operations?.blocked_migrations) || nonNegative(o.operations?.billing_blockers)) add('DOWNSTREAM_EXECUTION',84,true,['MigrationTask:blocked','MonthlySavingsReport:billing_blocked'],'Acquisition should not be scaled while migration or billing throughput is saturated.');
  if (nonNegative(o.founder?.weekly_available_meetings) <= 0 && nonNegative(o.pipeline?.meetings_or_proposals) > 0) add('FOUNDER_CAPACITY',80,true,[o.founder?.source_ref || 'FounderMeetingPolicy:missing'],'Founder escalation capacity is exhausted or not configured.');
  if (o.costs?.complete !== true) add('UNIT_ECONOMICS_EVIDENCE',65,false,['GrowthCostLedger:current'],'CAC, payback and marginal spend remain unknown because required cost categories are incomplete.');
  if (!evidencePermitsProbability(o)) add('FORECAST_CALIBRATION',55,false,['canonical_outcomes:current'],'Forecast remains a deterministic scenario range, not P10/P50/P90 probability.');
  if (!constraints.length) add('DEMAND_GENERATION',30,true,['GrowthPathEngine:capacity_chain'],'No harder constraint is evidenced; improve the highest-confidence positive contribution channel.');
  constraints.sort((a,b) => b.severity - a.severity);
  return { constraints,binding_constraint:constraints.find((item:any) => item.binding) || constraints[0] || null };
}

function marginalAllocations(forecasts:any[]) {
  const latest = forecasts[0];
  if (!latest) return [];
  const options:any[] = [];
  for (const entry of latest.channels || []) {
    const row = entry.base;
    if (row?.status !== 'PROJECTED' || !finite(row.reachable_volume) || Number(row.reachable_volume) <= 0) continue;
    const costPerOpportunity = Number(row.variable_cost) / Number(row.reachable_volume);
    const contributionPerOpportunity = Number(row.contribution) / Number(row.reachable_volume);
    const cost = round(costPerOpportunity * 100);
    const impact = round(contributionPerOpportunity * 100);
    options.push({ option_key:`NEXT_100:${row.channel}`,action:`Model the next 100 eligible ${row.channel} opportunities`,channel:row.channel,cost_eur:cost,expected_incremental_contribution_eur:impact,marginal_return:cost && finite(impact) ? round(Number(impact)/Number(cost),4) : null,confidence:row.confidence,authority:'FOUNDER_APPROVAL_OR_EXISTING_POLICY',execute:false,lineage:row.lineage });
  }
  options.push({ option_key:'NEXT_1000_EUR:PAID_MEDIA',action:'Do not scale paid media yet',channel:'PAID_MEDIA',cost_eur:1000,expected_incremental_contribution_eur:null,marginal_return:null,confidence:0,authority:'FOUNDER_APPROVAL_REQUIRED',execute:false,status:'DO_NOT_SCALE',reason:'No calibrated paid-media CAC and contribution evidence.' });
  return options.sort((a,b) => (b.marginal_return ?? -Infinity) - (a.marginal_return ?? -Infinity));
}

function recommendations(binding:any, marginal:any[]) {
  const map:any = {
    GLOBAL_EMERGENCY_STOP:['Keep material execution paused','Resolve and close the emergency control before any growth execution.'],
    PRODUCTION_READINESS:['Close production evidence blockers','Complete the real-runtime P11/GO evidence; forecasts remain advisory.'],
    MARKET_ACTION_READINESS:['Complete market action readiness','Use the 33-market intelligence layer but enable only markets cleared by P10/P11.'],
    COMMERCIAL_POLICY:['Create or repair CANARY policy','Set explicit markets, valid sending profiles and a daily limit of 1–15.'],
    OUTBOUND_INFRASTRUCTURE:['Restore healthy sending capacity','Verify profiles, DNS, warm-up, suppression and deliverability before allocating volume.'],
    DOWNSTREAM_EXECUTION:['Reduce acquisition pressure','Clear migration/billing bottlenecks before adding upstream volume.'],
    FOUNDER_CAPACITY:['Protect founder escalation capacity','Reduce or reschedule low-value meetings and preserve the highest expected-value escalations.'],
    UNIT_ECONOMICS_EVIDENCE:['Complete the cost ledger','Record paid media, tools, enrichment, email, AI, people and agency costs before scaling spend.'],
    FORECAST_CALIBRATION:['Collect outcome evidence','Run bounded experiments and calibrate conversion/economics from canonical outcomes.'],
    DEMAND_GENERATION:['Increase the best evidenced channel','Use the top positive marginal-return recommendation within existing authority.'],
  };
  const [action,why] = map[binding?.type] || ['Hold allocation','No safe recommendation is available.'];
  const best = marginal.find((item:any) => item.status !== 'DO_NOT_SCALE' && finite(item.marginal_return) && item.marginal_return > 0);
  return [
    { recommendation_key:`BINDING:${binding?.type || 'UNKNOWN'}`,action,why,expected_impact:null,expected_impact_text:binding?.effect || null,cost_eur:null,time_to_value:'constraint-dependent',confidence:binding ? round(binding.severity / 100,2) : 0,risks:['Execution remains governed by P10/P11, EmergencyControl and founder authority.'],constraints:[binding?.type].filter(Boolean),authority:'RECOMMEND_ONLY',execute:false },
    { recommendation_key:'MARGINAL:NEXT',action:best?.action || 'Do nothing on incremental spend',why:best ? 'Highest currently modelled positive marginal contribution; validate evidence before execution.' : 'No evidenced positive marginal allocation is available.',expected_impact:best?.expected_incremental_contribution_eur ?? null,cost_eur:best?.cost_eur ?? 0,time_to_value:'scenario-dependent',confidence:best?.confidence ?? 0,risks:['Scenario economics are not a commitment.'],constraints:[binding?.type].filter(Boolean),authority:'RECOMMEND_ONLY',execute:false },
    { recommendation_key:'DO_NOT_SCALE:PAID_MEDIA',action:'Do not scale paid media',why:'Paid scaling requires calibrated contribution, CAC, attribution and capacity evidence.',expected_impact:null,cost_eur:0,time_to_value:'after-evidence',confidence:1,risks:['Scaling on weak attribution can destroy contribution.'],constraints:['UNIT_ECONOMICS_EVIDENCE'],authority:'FOUNDER_APPROVAL_REQUIRED',execute:false },
  ];
}

export function buildGrowthPath(input:any = {}) {
  const targets = activeRows(input.targets || []).filter((target:any) => finite(target.target_value)).sort((a:any,b:any) => Date.parse(a.period_start || '') - Date.parse(b.period_start || ''));
  const currentPeriodKey = input.current_period_key || targets.find((target:any) => Date.parse(target.period_end || '') >= Date.parse(input.as_of || new Date().toISOString()))?.period_key || targets.at(-1)?.period_key || 'UNSET';
  const normalized = { ...input,current_period_key:currentPeriodKey };
  const actuals = {
    bookings:round(nonNegative(input.observed?.actuals?.bookings)),
    verified_economic_value:round(nonNegative(input.observed?.actuals?.verified_economic_value)),
    revenue:round(nonNegative(input.observed?.actuals?.revenue)),
    cash:round(nonNegative(input.observed?.actuals?.cash)),
    as_of:input.as_of || new Date().toISOString(),
    sources:input.observed?.actuals?.sources || [],
  };
  const forecasts = targets.map((target:any) => buildForecast(normalized,target));
  const targetGaps = forecasts.map((forecast:any) => {
    const actual = forecast.period_key === currentPeriodKey ? actualMetricForTarget(actuals,forecast.target_metric) : 0;
    const projected = forecast.distribution?.p50 ?? forecast.distribution?.base ?? null;
    return { period_key:forecast.period_key,target_key:forecast.target_key,metric_key:forecast.target_metric,target:forecast.target_value,actual,projected,gap_to_target:round(forecast.target_value - actual),projected_gap:projected === null ? null : round(forecast.target_value - projected),attainment_pct:forecast.target_value > 0 ? round(actual / forecast.target_value * 100,2) : null,target_probability:forecast.distribution?.target_probability ?? null,confidence:forecast.confidence };
  });
  const constraintResult = detectGrowthConstraints(normalized);
  const marginal = marginalAllocations(forecasts);
  const recs = recommendations(constraintResult.binding_constraint,marginal);
  const baseChannelRows = forecasts.flatMap((forecast:any) => forecast.channels.map((entry:any) => ({ period_key:forecast.period_key,...entry.base })));
  const revenueBridge = { no_double_counting_rule:'Acquisition channel attributes acquisition; business line owns revenue. Each channel × business-line projection appears once.',by_channel:Object.fromEntries(GROWTH_CHANNELS.map((channel) => [channel,round(baseChannelRows.filter((row:any) => row.channel === channel).reduce((sum:number,row:any) => sum + number(row.revenue),0))])),by_business_line:Object.fromEntries(GROWTH_BUSINESS_LINES.map((line) => [line,round(baseChannelRows.filter((row:any) => row.business_line === line).reduce((sum:number,row:any) => sum + number(row.revenue),0))])) };
  const contributionBridge = { by_channel:Object.fromEntries(GROWTH_CHANNELS.map((channel) => [channel,round(baseChannelRows.filter((row:any) => row.channel === channel).reduce((sum:number,row:any) => sum + number(row.contribution),0))])),unknown_is_not_zero:true };
  const limitations = [...new Set([...(input.limitations || []),...forecasts.filter((forecast:any) => forecast.distribution.status === 'DETERMINISTIC_COLD_START_RANGE').map(() => 'Target probabilities and P10/P50/P90 are withheld until enough real outcomes exist.'),...(input.observed?.costs?.complete === true ? [] : ['CAC, payback and spend scaling are withheld until every required cost category is evidenced.']), 'PAYMENTS_USA and LOGISTICS_EUROPE remain PLANNED until explicitly activated and evidenced.'])];
  const lineage = [
    { metric:'actual.bookings',sources:input.observed?.actuals?.bookings_sources || [] },
    { metric:'actual.verified_economic_value',sources:input.observed?.actuals?.verified_value_sources || [] },
    { metric:'actual.revenue',sources:input.observed?.actuals?.revenue_sources || [] },
    { metric:'actual.cash',sources:input.observed?.actuals?.cash_sources || [] },
    ...forecasts.map((forecast:any) => ({ metric:`forecast.${forecast.period_key}`,sources:[...new Set(forecast.channels.flatMap((entry:any) => entry.base?.lineage || []))] })),
  ];
  const confidences = forecasts.map((forecast:any) => forecast.confidence).filter(finite);
  return {
    engine_version:GROWTH_PATH_ENGINE_VERSION,scenario_key:input.scenario_key || 'BASE',as_of:actuals.as_of,current_period_key:currentPeriodKey,actuals,forecasts,target_gaps:targetGaps,revenue_bridge:revenueBridge,contribution_bridge:contributionBridge,capacity_chain:input.observed?.capacity || {},constraints:constraintResult.constraints,binding_constraint:constraintResult.binding_constraint,marginal_allocation:marginal,recommendations:recs,early_warnings:constraintResult.constraints.filter((item:any) => item.severity >= 55).map((item:any) => ({ code:item.type,severity:item.severity,message:item.effect,leading:true })),lineage,confidence:confidences.length ? round(confidences.reduce((a:number,b:any) => a + Number(b),0) / confidences.length,4) : 0,limitations,
    truth_boundary:{ targets:'Founder-editable plans, never forecasts.',actuals:'Canonical operational and financial evidence only.',forecast:'Deterministic formula; assumptions remain labelled and probabilities are withheld when calibration is weak.',authority:'Recommendation only. No spend, send, contract, migration or billing authority is created.',double_counting:'Acquisition channel and business line are separate dimensions; projected revenue is counted once.' },
  };
}

export function applyScenarioChanges(assumptions:any[] = [], changes:any[] = []) {
  const safeChanges = changes.slice(0,50); const updated = assumptions.map((row:any) => {
    const change = safeChanges.find((item:any) => (item.assumption_key && item.assumption_key === row.assumption_key) || (!item.assumption_key && item.metric_key === row.metric_key && (!item.channel || item.channel === row.channel) && (!item.period_key || item.period_key === row.period_key)));
    if (!change) return row;
    const next = finite(change.value) ? Number(change.value) : finite(change.multiplier) ? Number(row.value) * Math.max(0,Math.min(100,Number(change.multiplier))) : Number(row.value);
    return { ...row,value:next,low_value:finite(change.low_value) ? Number(change.low_value) : row.low_value,high_value:finite(change.high_value) ? Number(change.high_value) : row.high_value,provenance:'ASSUMPTION',source_note:'Temporary founder scenario override; not persisted as an active assumption.' };
  });
  return updated;
}
