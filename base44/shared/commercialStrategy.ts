import { canonicalMarket } from './marketContext.ts';
import { compactFacts, personalizationFacts } from './outreachExperiment.ts';
import { normalizeEmail, policyIsActive } from './commercialAutonomy.ts';

export const COMMERCIAL_STRATEGY_VERSION='commercial-strategy-1.0.0';

export function commercialStrategyReadiness(lead:any,policy:any,suppressed=false){
  const blockers:string[]=[];const confidence=Number(lead?.score_breakdown_json?.evidence_confidence||lead?.revenue_confidence||0);const score=Number(lead?.score||lead?.pre_score||0);const opportunity=Number(lead?.score_breakdown_json?.opportunity_score||lead?.revenue_opportunity_score||score||0);
  if(!policyIsActive(policy))blockers.push('active_policy_required');
  if(lead?.reservoir_state!=='ready'||lead?.revenue_stage!=='outreach_ready')blockers.push('lead_not_ready_for_contact');
  if(lead?.outreach_eligibility!=='ELIGIBLE')blockers.push('outreach_not_eligible');
  if(lead?.compliance_status!=='CLEARED')blockers.push('compliance_not_cleared');
  if(lead?.contactability!=='PROFESSIONAL_VERIFIED'||!normalizeEmail(lead?.contact_email))blockers.push('verified_professional_contact_required');
  if(score<Number(policy?.min_lead_score||70))blockers.push('minimum_lead_score_not_met');
  if(confidence<Number(policy?.min_confidence??policy?.icp_json?.minimum_commercial_confidence??0.55))blockers.push('minimum_confidence_not_met');
  if(opportunity<Number(policy?.min_opportunity_score??policy?.icp_json?.minimum_opportunity_score??0))blockers.push('minimum_opportunity_not_met');
  const market=canonicalMarket(lead?.country)?.iso2||'';if(!market||!Array.isArray(policy?.countries)||!policy.countries.includes(market))blockers.push('market_not_enabled');
  if(suppressed)blockers.push('contact_suppressed');
  return {ok:blockers.length===0,blockers:[...new Set(blockers)],score,opportunity,confidence,market};
}

export function strategyLanguage(lead:any,policy:any,override=''){
  const allowed=new Set((policy?.languages||['en','fr','es']).map((value:any)=>String(value).toLowerCase()));const explicit=String(override||lead?.preferred_language||'').toLowerCase();
  if(['en','fr','es'].includes(explicit)&&allowed.has(explicit))return {language:explicit,basis:'explicit_or_contact_preference'};
  const market=canonicalMarket(lead?.country)?.iso2||'';const inferred=market==='FR'?'fr':market==='ES'?'es':'en';
  return {language:allowed.has(inferred)?inferred:allowed.has('en')?'en':[...allowed][0]||'en',basis:'market_default_no_contact_preference'};
}

export function buildCommercialStrategy(lead:any,policy:any,input:any={}){
  const readiness=commercialStrategyReadiness(lead,policy,input.suppressed===true);const lang=strategyLanguage(lead,policy,input.language_override);const facts=compactFacts(personalizationFacts(lead,'merchant'));const evidence=Object.entries(facts).slice(0,8).map(([label,value])=>({label,value:String(value||''),source:'canonical_lead',confidence:readiness.confidence}));
  const estimate=lead?.estimation_status==='PRE_ANALYSIS_ESTIMATE';
  return {
    strategy_key:`lead:${lead.id}:policy:${policy?.policy_key}:${policy?.version}:${COMMERCIAL_STRATEGY_VERSION}`,
    strategy_version:COMMERCIAL_STRATEGY_VERSION,lead_id:lead.id,canonical_company_key:lead.canonical_company_key||'',policy_key:policy?.policy_key||'',policy_version:policy?.version||'',
    opportunity_reference_json:{score:readiness.opportunity,estimation_status:lead?.estimation_status||'UNKNOWN',estimated_opportunity_min_eur:lead?.estimated_opportunity_min_eur??null,estimated_opportunity_max_eur:lead?.estimated_opportunity_max_eur??null,verified:lead?.estimation_status==='VERIFIED_OPPORTUNITY'},
    selected_contact_json:{full_name:lead?.contact_full_name||'',email:normalizeEmail(lead?.contact_email),title:lead?.contact_title||'',contactability:lead?.contactability||'UNKNOWN',source:lead?.source||''},
    market:readiness.market,language:lang.language,language_basis:lang.basis,
    commercial_hypothesis:estimate?'There may be a payments optimization opportunity; Analyzer evidence is required before any quantified claim.':'Explore whether CAMBRA can improve the company payments setup using only verified evidence.',
    reason_to_contact:evidence.length?`High-fit canonical lead supported by ${evidence.length} traceable business signal(s).`:'No sufficiently traceable outreach evidence is available.',supporting_evidence_json:evidence,
    message_angle:'Evidence-aware invitation to validate the opportunity with CAMBRA Analyzer; no unverified savings claim.',cta:'Run the free CAMBRA Analyzer using the company’s own payment evidence.',
    followup_strategy_json:{max_followups:Number(policy?.max_followups||0),intervals_hours:Array.isArray(policy?.followup_intervals_hours)?policy.followup_intervals_hours:[],stop_on_reply:true,stop_on_ooo:true,stop_on_suppression:true},
    priority:Math.max(0,Math.min(100,(readiness.score*.45)+(readiness.opportunity*.35)+(readiness.confidence*100*.2))),confidence:readiness.confidence,approval_required:false,status:readiness.ok&&evidence.length?'READY':readiness.blockers.some((value)=>['contact_suppressed','compliance_not_cleared','outreach_not_eligible'].includes(value))?'BLOCKED':'REVIEW_REQUIRED',blockers:[...readiness.blockers,...(!evidence.length?['traceable_evidence_required']:[])],
  };
}
