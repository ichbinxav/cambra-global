import { createHash } from 'node:crypto';
import { EUROPE_MARKETS } from './generated/europeMarkets.js';

export const P3_SCHEMA_VERSION='p3-rate-truth-1.0.0';
export const P3_RESOLVER_POLICY_VERSION='p3-resolver-1.1.0';
export const P3_PROMOTION_POLICY_VERSION='p3-promotion-1.0.0';
export const P3_RATE_FRESHNESS_MAX_AGE_DAYS=90;
export const P3_MARKETS=Object.freeze(EUROPE_MARKETS.map(m=>m.iso2));
export const VERIFIED_STATUSES=Object.freeze(['VERIFIED_PRIMARY','VERIFIED_SECONDARY','VERIFIED_MULTI_SOURCE','CONTRACT_VERIFIED','NEGOTIATED_VERIFIED']);
export const TERMINAL_RESEARCH_STATES=Object.freeze(['PUBLIC_PRICING_FOUND','PUBLIC_PARTIAL_PRICING_FOUND','CUSTOM_PRICING_CONFIRMED','NO_PUBLIC_PRICING_FOUND_AFTER_RESEARCH','CONFLICTING_SOURCES','READY','NOT_APPLICABLE','UNKNOWN_AFTER_RESEARCH']);
export const PRICING_MODELS=Object.freeze(['FLAT','BLENDED','FIXED_PLUS_PERCENT','INTERCHANGE_PLUS','INTERCHANGE_PLUS_PLUS','TIERED','SUBSCRIPTION_PLUS_RATE','CUSTOM','HYBRID','PASS_THROUGH','UNKNOWN']);
export const PRICING_VISIBILITY=Object.freeze(['PUBLIC_COMPLETE','PUBLIC_PARTIAL','INDICATIVE','CUSTOM_QUOTE','NEGOTIATED_ONLY','CONTRACT_ONLY','NOT_PUBLIC','UNKNOWN']);
export const COMPONENT_TYPES=Object.freeze(['PROCESSING_FEE','ACQUIRER_MARGIN','INTERCHANGE','SCHEME_FEE','FIXED_TRANSACTION_FEE','MONTHLY_FEE','SUBSCRIPTION_FEE','TERMINAL_PURCHASE','TERMINAL_RENTAL','SETUP_FEE','MINIMUM_MONTHLY_FEE','AUTHORIZATION_FEE','REFUND_FEE','CHARGEBACK_FEE','DISPUTE_FEE','FX_FEE','CROSS_BORDER_FEE','COMMERCIAL_CARD_UPLIFT','NON_EEA_UPLIFT','PREMIUM_CARD_UPLIFT','INTERNATIONAL_CARD_UPLIFT','PAYOUT_FEE','INSTANT_PAYOUT_FEE','SETTLEMENT_FEE','PAYMENT_METHOD_FEE','VOLUME_TIER','MINIMUM_COMMITMENT','CUSTOM_COMPONENT','OTHER_VERIFIED_COMPONENT']);

export function assertP3MarketUniverse(){
  const s=new Set(P3_MARKETS);
  if(s.size!==33||!s.has('FR')||!s.has('LI')||!s.has('CH')) throw new Error('p3_market_universe_invalid');
  if(P3_MARKETS.indexOf('LI')===P3_MARKETS.indexOf('CH')) throw new Error('p3_li_must_be_independent');
  const bg=EUROPE_MARKETS.find(m=>m.iso2==='BG');
  if(bg?.primary_currency!=='EUR') throw new Error('p3_bg_current_currency_must_be_eur');
  return true;
}

export function stableSerialize(value){
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`;
}
export function sha256(value){return createHash('sha256').update(typeof value==='string'?value:stableSerialize(value)).digest('hex');}
export function bpsToPpm(bps){if(!Number.isInteger(bps))throw new Error('bps_must_be_integer');return bps*100;}
export function percentToPpm(percent){const x=Number(percent);if(!Number.isFinite(x))throw new Error('percent_invalid');const ppm=Math.round(x*10000);if(Math.abs(ppm/10000-x)>1e-9)throw new Error('percent_precision_exceeds_ppm');return ppm;}
export function ppmToPercent(ppm){if(!Number.isInteger(ppm))throw new Error('ppm_must_be_integer');return ppm/10000;}

function isIsoCurrency(x){return typeof x==='string'&&/^[A-Z]{3}$/.test(x);}
function integerOrAbsent(x){return x==null||Number.isInteger(x);}
function hasNumericValue(c){return c?.percentage_ppm!=null||c?.amount_minor!=null||c?.minimum_amount_minor!=null||c?.maximum_amount_minor!=null;}

export function validateRateComponent(c){
  const errors=[];
  if(!c||typeof c!=='object') return {ok:false,errors:['component_required']};
  if(!COMPONENT_TYPES.includes(c.component_type))errors.push('component_type_invalid');
  if(!['KNOWN','PASS_THROUGH','UNKNOWN'].includes(c.value_mode))errors.push('value_mode_invalid');
  for(const k of ['percentage_ppm','amount_minor','minimum_amount_minor','maximum_amount_minor'])if(!integerOrAbsent(c[k]))errors.push(`${k}_must_be_integer`);
  if(c.percentage_ppm!=null&&(c.percentage_ppm<0||c.percentage_ppm>1000000))errors.push('percentage_ppm_out_of_range');
  if((c.amount_minor!=null||c.minimum_amount_minor!=null||c.maximum_amount_minor!=null)&&!isIsoCurrency(c.currency))errors.push('money_component_requires_currency');
  if(c.value_mode==='KNOWN'&&!hasNumericValue(c))errors.push('known_component_requires_value');
  if(c.value_mode!=='KNOWN'&&hasNumericValue(c))errors.push('unknown_or_passthrough_must_not_fake_numeric_value');
  if(c.minimum_amount_minor!=null&&c.maximum_amount_minor!=null&&c.minimum_amount_minor>c.maximum_amount_minor)errors.push('min_exceeds_max');
  return {ok:errors.length===0,errors};
}

export function observationHasNumericRate(obs,components=[]){return components.some(c=>c?.value_mode==='KNOWN'&&hasNumericValue(c));}

export function validateObservation(obs,components=[]){
  const errors=[];
  if(!obs||typeof obs!=='object')return{ok:false,errors:['observation_required']};
  if(!P3_MARKETS.includes(obs.market||obs.country))errors.push('market_invalid');
  if(!PRICING_MODELS.includes(obs.pricing_model))errors.push('pricing_model_invalid');
  if(!PRICING_VISIBILITY.includes(obs.pricing_visibility))errors.push('pricing_visibility_invalid');
  if(obs.verified_at&&!VERIFIED_STATUSES.includes(obs.verification_status))errors.push('verified_at_without_verification');
  if(VERIFIED_STATUSES.includes(obs.verification_status)&&!obs.verified_at)errors.push('verified_status_requires_verified_at');
  if(obs.effective_from&&obs.retrieved_at&&obs.effective_from===obs.retrieved_at&&obs.effective_date_certainty==='UNKNOWN')errors.push('retrieved_at_must_not_be_invented_effective_from');
  if(obs.effective_from&&obs.effective_to&&Date.parse(obs.effective_from)>Date.parse(obs.effective_to))errors.push('effective_range_invalid');
  if((obs.pricing_visibility==='CUSTOM_QUOTE'||obs.pricing_visibility==='NEGOTIATED_ONLY'||obs.pricing_visibility==='NOT_PUBLIC')&&obs.observation_type==='PUBLIC_PUBLISHED'&&observationHasNumericRate(obs,components))errors.push('nonpublic_visibility_cannot_invent_public_numeric_rate');
  if(obs.scope_type==='MARKET'&&Array.isArray(obs.applicable_markets)&&obs.applicable_markets.some(m=>m!==(obs.market||obs.country)))errors.push('market_scope_cannot_claim_other_markets');
  if(obs.scope_type==='UNKNOWN_SCOPE'&&Array.isArray(obs.applicable_markets)&&obs.applicable_markets.length)errors.push('unknown_scope_cannot_have_applicable_markets');
  if(obs.country===''||obs.market==='')errors.push('empty_market_never_global');
  if(obs.provider_slug?.match(/^bank_tpv_[a-z]{2}_generic$/i)&&VERIFIED_STATUSES.includes(obs.verification_status))errors.push('generic_bank_placeholder_cannot_be_verified');
  if(obs.observation_type==='LEGACY_ESTIMATE'&&VERIFIED_STATUSES.includes(obs.verification_status))errors.push('legacy_estimate_cannot_be_verified');
  if(obs.achievable_percent_bps!=null||obs.achievable_percent_ppm!=null)errors.push('achievable_rate_forbidden_in_p3');
  for(const c of components){const v=validateRateComponent(c);for(const e of v.errors)errors.push(`component:${e}`);}
  return {ok:errors.length===0,errors};
}

function normArray(x){return [...new Set((x||[]).filter(Boolean).map(String))].sort();}
export function semanticFingerprint({observation,components=[],conditions=[],source_snapshot_id=''}){
  const o=observation||{};
  const normalized={
    provider_id:o.provider_id||null,provider_slug:o.provider_slug||null,provider_legal_entity_id:o.provider_legal_entity_id||null,provider_product_id:o.provider_product_id||null,
    market:o.market||o.country||null,channel:o.channel||null,payment_method_id:o.payment_method_id||null,pricing_plan_id:o.pricing_plan_id||null,card_scope_id:o.card_scope_id||null,
    pricing_model:o.pricing_model||null,pricing_visibility:o.pricing_visibility||null,scope_type:o.scope_type||null,applicable_markets:normArray(o.applicable_markets),excluded_markets:normArray(o.excluded_markets),
    effective_from:o.effective_from||null,effective_to:o.effective_to||null,
    components:[...components].map(c=>({component_type:c.component_type,fee_layer:c.fee_layer||null,percentage_ppm:c.percentage_ppm??null,amount_minor:c.amount_minor??null,currency:c.currency||null,minimum_amount_minor:c.minimum_amount_minor??null,maximum_amount_minor:c.maximum_amount_minor??null,unit_basis:c.unit_basis||null,value_mode:c.value_mode,condition_json:c.condition_json||null})).sort((a,b)=>stableSerialize(a).localeCompare(stableSerialize(b))),
    conditions:[...conditions].map(c=>({condition_type:c.condition_type,operator:c.operator||null,value_json:c.value_json||null,normalized_text:c.normalized_text||null})).sort((a,b)=>stableSerialize(a).localeCompare(stableSerialize(b))),
    source_snapshot_id:source_snapshot_id||o.source_snapshot_id||null,
  };
  return sha256(normalized);
}

function dateWithin(obs,date){
  const t=Date.parse(date);
  if(Number.isNaN(t))return false;
  if(obs.effective_from&&t<Date.parse(obs.effective_from))return false;
  if(obs.effective_to&&t>Date.parse(obs.effective_to))return false;
  return true;
}
function knowledgeKnownAt(obs,asOf){
  if(!asOf)return true;
  const t=Date.parse(asOf), recorded=Date.parse(obs.recorded_at||obs.first_seen_at||obs.observed_at||'1970-01-01');
  if(recorded>t)return false;
  if(obs.retired_at&&Date.parse(obs.retired_at)<=t)return false;
  return true;
}
function marketMatches(obs,market){
  if((obs.market||obs.country)===market)return true;
  if(['EU','EEA','EUROZONE','MARKET_GROUP','GLOBAL','CUSTOM_SCOPE'].includes(obs.scope_type))return (obs.applicable_markets||[]).includes(market)&&!(obs.excluded_markets||[]).includes(market);
  return false;
}
function fieldMatch(obs,key,value){if(value==null||value==='')return true;const ov=obs[key];return ov==null||ov===''||ov===value;}
function specificityScore(obs,ctx){let s=0;for(const k of ['provider_id','provider_legal_entity_id','provider_product_id','channel','pricing_plan_id','payment_method_id','card_scope_id','merchant_segment_scope_id'])if(ctx[k]!=null&&obs[k]===ctx[k])s+=10;if((obs.market||obs.country)===ctx.market)s+=20;else if(marketMatches(obs,ctx.market))s+=5;if(VERIFIED_STATUSES.includes(obs.verification_status))s+=4;if(obs.verification_status==='VERIFIED_PRIMARY'||obs.verification_status==='VERIFIED_MULTI_SOURCE')s+=2;return s;}

export function pricingFreshnessDecision(obs,asOf=new Date().toISOString()){
  if(obs?.status==='STALE'||obs?.verification_status==='STALE')return{current:false,status:'STALE',reason:'explicit_stale_status',max_age_days:P3_RATE_FRESHNESS_MAX_AGE_DAYS};
  if(!VERIFIED_STATUSES.includes(obs?.verification_status))return{current:null,status:'NOT_APPLICABLE',reason:'rate_not_verified',max_age_days:P3_RATE_FRESHNESS_MAX_AGE_DAYS};
  const verified=Date.parse(obs?.verified_at||''),at=typeof asOf==='number'?asOf:Date.parse(String(asOf||''));
  if(!Number.isFinite(verified)||!Number.isFinite(at))return{current:false,status:'STALE',reason:'verification_timestamp_invalid',max_age_days:P3_RATE_FRESHNESS_MAX_AGE_DAYS};
  const ageMs=Math.max(0,at-verified),current=ageMs<=P3_RATE_FRESHNESS_MAX_AGE_DAYS*86_400_000;
  return{current,status:current?'CURRENT':'STALE',reason:current?null:'verification_older_than_90_days',age_days:ageMs/86_400_000,max_age_days:P3_RATE_FRESHNESS_MAX_AGE_DAYS};
}

export function resolvePricing(observations,ctx){
  if(!ctx?.market||!P3_MARKETS.includes(ctx.market))return{outcome:'UNKNOWN',reason:'market_required',matches:[]};
  const candidates=(observations||[]).filter(o=>o.status!=='REJECTED'&&o.status!=='QUARANTINED'&&marketMatches(o,ctx.market)&&fieldMatch(o,'provider_id',ctx.provider_id)&&fieldMatch(o,'provider_slug',ctx.provider_slug)&&fieldMatch(o,'provider_legal_entity_id',ctx.provider_legal_entity_id)&&fieldMatch(o,'provider_product_id',ctx.provider_product_id)&&fieldMatch(o,'channel',ctx.channel)&&fieldMatch(o,'pricing_plan_id',ctx.pricing_plan_id)&&fieldMatch(o,'payment_method_id',ctx.payment_method_id)&&fieldMatch(o,'card_scope_id',ctx.card_scope_id)&&dateWithin(o,ctx.date||new Date().toISOString())&&knowledgeKnownAt(o,ctx.known_as_of));
  if(!candidates.length)return{outcome:'UNKNOWN',reason:'no_applicable_observation',matches:[]};
  if(candidates.some(o=>o.verification_status==='CONFLICT'||o.status==='CONFLICT'))return{outcome:'CONFLICT',reason:'conflicting_applicable_observation',matches:candidates};
  const custom=candidates.filter(o=>['CUSTOM_QUOTE','NEGOTIATED_ONLY','NOT_PUBLIC'].includes(o.pricing_visibility));
  if(custom.length===candidates.length)return{outcome:custom.some(o=>o.pricing_visibility==='CUSTOM_QUOTE')?'CUSTOM_QUOTE':'NOT_PUBLIC',matches:custom};
  const scored=candidates.map(o=>({o,score:specificityScore(o,ctx)})).sort((a,b)=>b.score-a.score||String(b.o.verified_at||'').localeCompare(String(a.o.verified_at||'')));
  const top=scored[0].score, best=scored.filter(x=>x.score===top).map(x=>x.o);
  if(best.length>1){const fps=new Set(best.map(x=>x.semantic_fingerprint||x.content_hash||x.pricing_key));if(fps.size>1)return{outcome:'MULTIPLE_MATCHES',matches:best};}
  const chosen=best[0];
  const missing=[];for(const k of ['provider_legal_entity_id','provider_product_id','channel','pricing_plan_id','payment_method_id','card_scope_id'])if(ctx[k]!=null&&(chosen[k]==null||chosen[k]===''))missing.push(k);
  const freshness=pricingFreshnessDecision(chosen,ctx.freshness_as_of||ctx.date||new Date().toISOString());
  if(freshness.status==='STALE')return{outcome:'STALE',reason:freshness.reason,freshness,match:chosen,matches:[chosen],missing_dimensions:missing};
  if(missing.length)return{outcome:'PARTIAL_MATCH',match:chosen,matches:[chosen],matched_dimensions:Object.keys(ctx).filter(k=>ctx[k]!=null&&!missing.includes(k)),missing_dimensions:missing,unresolved_conditions:[],reason_for_partial_match:'observation broader than requested context'};
  return{outcome:'EXACT_MATCH',match:chosen,matches:[chosen],missing_dimensions:[]};
}

export function evaluateComponents(components,ctx={}){
  let total=0;const included=[],excluded=[],unknown=[];
  for(const c of components||[]){
    if(c.value_mode!=='KNOWN'){unknown.push(c);continue;}
    if(c.unit_basis==='PER_MONTH'||c.unit_basis==='PER_TERMINAL'||c.unit_basis==='PER_ACCOUNT'){excluded.push(c);continue;}
    let fee=0;
    if(c.percentage_ppm!=null){if(!Number.isInteger(ctx.transaction_amount_minor)){unknown.push(c);continue;}fee+=Math.round(ctx.transaction_amount_minor*c.percentage_ppm/1_000_000);}
    if(c.amount_minor!=null)fee+=c.amount_minor;
    if(c.minimum_amount_minor!=null)fee=Math.max(fee,c.minimum_amount_minor);
    if(c.maximum_amount_minor!=null)fee=Math.min(fee,c.maximum_amount_minor);
    total+=fee;included.push({...c,calculated_amount_minor:fee});
  }
  return{calculation_status:unknown.length?'PARTIAL':'COMPLETE',calculated_amount_minor:total,included_components:included,excluded_components:excluded,unknown_components:unknown};
}

export function canAutoPromote({source_authority,market_unambiguous,product_unambiguous,channel_unambiguous,currency_valid,temporal_valid,parser_confidence,no_conflict,invariants_ok,threshold=0.95}){
  return source_authority==='PRIMARY'&&market_unambiguous===true&&product_unambiguous===true&&channel_unambiguous===true&&currency_valid===true&&temporal_valid===true&&Number(parser_confidence)>=threshold&&no_conflict===true&&invariants_ok===true;
}

export function classifyLegacyRate(row){
  const reasons=[];let classification='PARTIAL_MIGRATABLE';
  const slug=String(row?.provider_slug||'');
  if(/^bank_tpv_[a-z]{2}_generic$/i.test(slug)||slug==='ANY'){classification='GENERIC_PLACEHOLDER';reasons.push('generic_pseudo_provider');}
  if((row?.country??null)===''){classification=classification==='GENERIC_PLACEHOLDER'?classification:'INVALID_SCOPE';reasons.push('empty_country_not_global');}
  if(row?.provider_slug==='sumup'&&row?.verified!==true){classification='LEGACY_ESTIMATE';reasons.push('sumup_unverified_or_extrapolated');}
  if(row?.verified===true&&row?.source_url&&row?.source_quote)classification=classification==='PARTIAL_MIGRATABLE'?'VERIFIED_MIGRATABLE':classification;
  if(row?.intl_uplift_bps!=null&&!row?.intl_uplift_source_url){reasons.push('unevidenced_international_uplift');if(classification==='VERIFIED_MIGRATABLE')classification='PARTIAL_MIGRATABLE';}
  if(row?.achievable_percent_bps!=null||row?.achievable_fixed_fee_minor_units!=null||row?.achievable_intl_uplift_bps!=null)reasons.push('achievable_fields_quarantine_for_p5');
  if(row?.fixed_fee_currency&&!isIsoCurrency(row.fixed_fee_currency)){classification='INVALID_CURRENCY';reasons.push('invalid_currency');}
  return{classification,reasons};
}

export function migrateLegacyToP3(row,now='2026-08-10T00:00:00.000Z'){
  const c=classifyLegacyRate(row);const market=row.country||null;
  const verified=c.classification==='VERIFIED_MIGRATABLE';
  const observation={pricing_key:`legacy-rate:${row.cohort_key}`,provider_slug:row.provider_slug,market,country:market,channel:row.channel==='in_store'?'IN_PERSON':'ECOMMERCE',vertical:'payments',pricing_dimension:'card_processing',pricing_model:'FIXED_PLUS_PERCENT',pricing_visibility:verified?'PUBLIC_COMPLETE':'UNKNOWN',observation_type:c.classification==='LEGACY_ESTIMATE'?'LEGACY_ESTIMATE':'PUBLIC_PUBLISHED',scope_type:market?'MARKET':'UNKNOWN_SCOPE',applicable_markets:market?[market]:[],excluded_markets:[],effective_from:null,effective_to:null,effective_date_certainty:'UNKNOWN',first_seen_at:row.verified_at||row.created_date||now,last_seen_at:now,retrieved_at:now,recorded_at:now,verified_at:verified?(row.verified_at||now):null,verification_status:verified?'VERIFIED_PRIMARY':c.classification==='LEGACY_ESTIMATE'?'ESTIMATED_LEGACY':'UNVERIFIED',observation_completeness:'PARTIAL',confidence_score:verified?95:45,confidence_band:verified?'VERIFIED_HIGH':'DISCOVERY_ONLY',status:verified?'CURRENT':'QUARANTINED',truth_level:verified?'verified_official':'inferred',knowledge_state:verified?'active':'quarantined',version:1,conditions_json:{legacy_classification:c.classification,legacy_reasons:c.reasons,legacy_source_notes:row.source_notes||null},source_reference:row.source_url||`PaymentsRateTable:${row.id||row.cohort_key}`};
  const components=[];
  if(Number.isInteger(row.percent_bps))components.push({component_type:'PROCESSING_FEE',fee_layer:'PROVIDER',percentage_ppm:bpsToPpm(row.percent_bps),value_mode:'KNOWN',unit_basis:'PER_TRANSACTION'});
  if(Number.isInteger(row.fixed_fee_minor_units))components.push({component_type:'FIXED_TRANSACTION_FEE',fee_layer:'PROVIDER',amount_minor:row.fixed_fee_minor_units,currency:row.fixed_fee_currency,value_mode:'KNOWN',unit_basis:'PER_TRANSACTION'});
  if(Number.isInteger(row.terminal_rental_monthly_minor)&&row.terminal_rental_monthly_minor>0)components.push({component_type:'TERMINAL_RENTAL',fee_layer:'HARDWARE',amount_minor:row.terminal_rental_monthly_minor,currency:row.fixed_fee_currency,value_mode:'KNOWN',unit_basis:'PER_MONTH'});
  if(Number.isInteger(row.intl_uplift_bps)&&row.intl_uplift_source_url)components.push({component_type:'INTERNATIONAL_CARD_UPLIFT',fee_layer:'PROVIDER',percentage_ppm:bpsToPpm(row.intl_uplift_bps),value_mode:'KNOWN',unit_basis:'PER_TRANSACTION'});
  return{classification:c,observation,components};
}

export function researchStateClosed(state){return TERMINAL_RESEARCH_STATES.includes(state);}
export function p2P3Consistency({p2_availability,p3_market,p2_market,p2_product_id,p3_product_id}){
  if(p2_market&&p3_market&&p2_market!==p3_market)return{ok:false,event:'PROVIDER_TRUTH_CONSISTENCY_REVIEW_REQUIRED',reason:'market_mismatch'};
  if(p2_product_id&&p3_product_id&&p2_product_id!==p3_product_id)return{ok:false,event:'PROVIDER_TRUTH_CONSISTENCY_REVIEW_REQUIRED',reason:'product_mismatch'};
  if(p2_availability==='UNAVAILABLE')return{ok:false,event:'PROVIDER_TRUTH_CONSISTENCY_REVIEW_REQUIRED',reason:'pricing_source_conflicts_with_p2_unavailable'};
  return{ok:true};
}
