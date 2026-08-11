export const EUROPEAN_GROWTH_VERSION = 'p12-european-growth-1.0.0';
export const LAUNCH_READINESS_STATES = Object.freeze(['READY','READY_WITH_LIMITATIONS','RESEARCH_ONLY','COMMERCIAL_BLOCKED','REGULATORY_BLOCKED','TECHNICAL_BLOCKED']);
export const DEFAULT_GROWTH_POLICY:any = Object.freeze({ version:'p12-growth-policy-2026.08.11',mode:'SHADOW_RECOMMEND_ONLY',marketAttractivenessWeights:{ merchant_supply:.14,tpv_potential:.12,overpayment_opportunity:.14,data_maturity:.12,commercial_evidence:.12,unit_economics:.12,provider_landscape:.08,localization:.06,regulatory:.05,production:.05 },minimumScoredDimensions:5,minimumExperimentSamplePerArm:50,explorationShare:.2,contactFatigue:{ maxAttempts30d:4,minimumDaysBetweenAttempts:5 } });

const clamp = (n:any) => Math.max(0, Math.min(100, Number(n)));
const valueOf = (x:any) => Number.isFinite(Number(x?.value)) && Array.isArray(x?.evidence_refs) && x.evidence_refs.length ? clamp(x.value) : null;

export function maturityTier(input:any = {}) {
  const observations = Math.max(0, Number(input.observations || 0)); const outcomes = Math.max(0, Number(input.real_outcomes || 0));
  if (!observations) return 0; if (observations < 10) return 1; if (observations < 50 || outcomes < 3) return 2; if (observations < 200 || outcomes < 20) return 3; return 4;
}

export function scoreMarketAttractiveness(dimensions:any = {}, policy:any = {}) {
  const weights = policy.marketAttractivenessWeights || {}; const components:any = {}; let numerator = 0, denominator = 0;
  for (const [key, weightRaw] of Object.entries(weights)) { const value = valueOf(dimensions[key]); const weight = Number(weightRaw); components[key] = { value,evidence_refs:dimensions[key]?.evidence_refs || [],weight }; if (value !== null && weight > 0) { numerator += value * weight; denominator += weight; } }
  const observed = Object.values(components).filter((x:any) => x.value !== null).length; const minimum = Number(policy.minimumScoredDimensions || 5);
  if (observed < minimum || denominator <= 0) return { status:'INSUFFICIENT_EVIDENCE',score:null,observed_dimensions:observed,required_dimensions:minimum,components,uncertainty:'HIGH' };
  const score = Number((numerator / denominator).toFixed(2)); const coverage = Number((denominator / Math.max(.0001, Object.values(weights).reduce((a:any,b:any) => Number(a)+Number(b), 0))).toFixed(4));
  return { status:'SCORED',score,observed_dimensions:observed,required_dimensions:minimum,components,coverage,uncertainty:coverage >= .8 ? 'MEDIUM' : 'HIGH' };
}

export function launchReadiness(input:any = {}) {
  const reasons:string[] = [];
  if (input.production?.sealed !== true) { reasons.push('p11_production_not_sealed'); return { state:'TECHNICAL_BLOCKED',launch_ready:false,reasons,hard_blocker:'P11' }; }
  if (['BLOCK','REVIEW'].includes(String(input.regulatory?.gate)) || !input.regulatory) { reasons.push('p10_regulatory_not_cleared'); return { state:'REGULATORY_BLOCKED',launch_ready:false,reasons,hard_blocker:'P10' }; }
  if (!['NATIVE_PRODUCT','PARTIAL_NATIVE'].includes(String(input.localization?.translation_readiness))) { reasons.push('p9_native_localization_missing'); return { state:'COMMERCIAL_BLOCKED',launch_ready:false,reasons,hard_blocker:'P9' }; }
  if (Number(input.data_maturity || 0) < 2) { reasons.push('insufficient_market_data'); return { state:'RESEARCH_ONLY',launch_ready:false,reasons,hard_blocker:null }; }
  if (input.commercial_ready !== true) { reasons.push('commercial_capacity_or_evidence_missing'); return { state:'READY_WITH_LIMITATIONS',launch_ready:true,reasons,hard_blocker:null }; }
  return { state:'READY',launch_ready:true,reasons,hard_blocker:null };
}

export function canonicalFunnel(events:any[] = []) {
  const stages = ['DISCOVERED','QUALIFIED','CONTACTED','RESPONDED','MEETING','ANALYZER_STARTED','ANALYSIS_COMPLETED','OPPORTUNITY','RECOVER_ACCEPTED','MIGRATION_STARTED','SAVINGS_VERIFIED','REVENUE_RECOGNIZED'];
  const seen = new Set<string>(); const entities:any = Object.fromEntries(stages.map((x) => [x,new Set()]));
  for (const event of events) { const stage = String(event.stage || event.event_type || '').toUpperCase(); const entity = String(event.entity_id || event.lead_id || event.brand_id || ''); const key = String(event.idempotency_key || `${stage}:${entity}:${event.occurred_at || event.created_at || ''}`); if (!stages.includes(stage) || !entity || seen.has(key)) continue; seen.add(key); entities[stage].add(entity); }
  const counts = Object.fromEntries(stages.map((x) => [x,entities[x].size]));
  return { stages:counts,event_count:seen.size,idempotent:true,conversion:(from:string,to:string) => counts[from] ? Number((counts[to] / counts[from]).toFixed(4)) : null };
}

export function calculateCac(input:any = {}) {
  const categories = ['paid_media','tools','enrichment','email','ai','people','agency','other']; const missing = categories.filter((x) => !Number.isFinite(Number(input.costs?.[x]))); const customers = Number(input.attributed_new_customers);
  if (missing.length || !Number.isInteger(customers) || customers <= 0) return { cac:null,status:'UNKNOWN',missing_inputs:[...missing,...(!Number.isInteger(customers) || customers <= 0 ? ['attributed_new_customers'] : [])] };
  const total = categories.reduce((sum,key) => sum + Number(input.costs[key]), 0); return { cac:Number((total / customers).toFixed(2)),total_cost:Number(total.toFixed(2)),attributed_new_customers:customers,status:'EVIDENCED',missing_inputs:[] };
}

export function evaluateExperiment(input:any = {}, policy:any = {}) {
  const min = Number(policy.minimumExperimentSamplePerArm || 50); const control = input.control || {}; const variant = input.variant || {};
  if (Number(control.n || 0) < min || Number(variant.n || 0) < min) return { status:'NO_CONCLUSIVE_RESULT',reason_code:'minimum_sample_not_met',winner:null };
  const pc = Number(control.successes || 0) / Number(control.n); const pv = Number(variant.successes || 0) / Number(variant.n); const pooled = (Number(control.successes || 0) + Number(variant.successes || 0)) / (Number(control.n) + Number(variant.n)); const se = Math.sqrt(pooled * (1 - pooled) * (1 / Number(control.n) + 1 / Number(variant.n))); const z = se ? (pv - pc) / se : 0; const threshold = Number(input.comparisons || 1) > 1 ? 2.576 : 1.96;
  if (Math.abs(z) < threshold) return { status:'NO_CONCLUSIVE_RESULT',reason_code:'statistical_threshold_not_met',winner:null,z_score:Number(z.toFixed(4)),control_rate:pc,variant_rate:pv };
  return { status:'CONCLUSIVE',winner:z > 0 ? 'variant' : 'control',z_score:Number(z.toFixed(4)),control_rate:pc,variant_rate:pv,multiple_testing_adjusted:Number(input.comparisons || 1) > 1 };
}

export function forecastScenarios(input:any = {}) {
  const history = Array.isArray(input.history) ? input.history.filter((x:any) => Number.isFinite(Number(x))) : [];
  if (history.length < 3) return { status:'INSUFFICIENT_EVIDENCE',low:null,base:null,high:null,assumptions:['minimum_3_observed_periods_required'] };
  const base = history.reduce((a:number,b:any) => a + Number(b), 0) / history.length; const deviations = history.map((x:any) => Math.abs(Number(x) - base)); const uncertainty = Math.max(base * .15, deviations.reduce((a:number,b:number) => a + b, 0) / deviations.length);
  return { status:'SCENARIOS',low:Number(Math.max(0,base - uncertainty).toFixed(2)),base:Number(base.toFixed(2)),high:Number((base + uncertainty).toFixed(2)),assumptions:['historical_mean','mean_absolute_deviation_floor_15_percent'],not_a_commitment:true };
}

export function contactFatigueDecision(input:any = {}, policy:any = {}) {
  if (input.suppressed || input.unsubscribed || input.complaint) return { allowed:false,reason_code:'hard_suppression' };
  const attempts = Number(input.attempts_30d || 0); const max = Number(policy.contactFatigue?.maxAttempts30d || 4); if (attempts >= max) return { allowed:false,reason_code:'contact_fatigue_cap' };
  const days = Number(input.days_since_last_attempt); const minDays = Number(policy.contactFatigue?.minimumDaysBetweenAttempts || 5); if (Number.isFinite(days) && days < minDays) return { allowed:false,reason_code:'minimum_contact_interval' };
  return { allowed:true,reason_code:'within_contact_policy' };
}

export function allocationRecommendation(input:any = {}, policy:any = {}) {
  if (input.safe_mode || input.kill_switch) return { mode:'SHADOW',recommended_capacity:0,execute:false,reason_code:'safe_mode_or_kill_switch' };
  if (!['READY','READY_WITH_LIMITATIONS','RESEARCH_ONLY'].includes(String(input.launch_state))) return { mode:'SHADOW',recommended_capacity:0,execute:false,reason_code:'launch_hard_gate' };
  const capacity = Math.max(0, Math.floor(Number(input.available_capacity || 0))); if (!capacity) return { mode:'SHADOW',recommended_capacity:0,execute:false,reason_code:'no_capacity' };
  const exploration = input.launch_state === 'RESEARCH_ONLY' ? capacity : Math.floor(capacity * Number(policy.explorationShare || .2));
  return { mode:'SHADOW',recommended_capacity:capacity,exploration_capacity:exploration,exploitation_capacity:capacity-exploration,execute:false,reason_code:'recommendation_only_requires_policy_or_founder_authority' };
}

export function acquisitionTouchHistory(existing:any[] = [], touch:any) {
  const key = String(touch.idempotency_key || ''); if (!key) throw new Error('attribution_idempotency_key_required'); if (existing.some((x:any) => x.idempotency_key === key)) return { touches:existing,deduplicated:true,first_touch:existing[0] || null,last_touch:existing.at(-1) || null };
  const touches = [...existing,touch].sort((a,b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)); return { touches,deduplicated:false,first_touch:touches[0] || null,last_touch:touches.at(-1) || null };
}
