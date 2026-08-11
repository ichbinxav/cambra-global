import { EUROPE_33 } from './legalExecution.ts';
import { instantlyProfileReady } from './outboundProvider.ts';

export const COMMERCIAL_ACTIVATION_VERSION = 'commercial-activation-1.0.0';
export const LEGACY_SENDING_PROFILE_RESOLVER_VERSION = 'legacy-sending-profile-1.0.0';
export const SENDING_PROFILE_REVIEW_REASON = 'sending_profile_review_required';
export const CANARY_DAILY_SEND_MIN = 1;
export const CANARY_DAILY_SEND_MAX = 15;
export const CANARY_MIN_LEAD_SCORE = 70;

const ACQUISITION_ENGINES = new Set(['merchant_acquisition','partner_acquisition']);

function uniqueStrings(values:any){
  return [...new Set((Array.isArray(values)?values:[]).map((value:any)=>String(value||'').trim()).filter(Boolean))];
}

export function acquisitionEngine(engine:any){return ACQUISITION_ENGINES.has(String(engine||''));}
export function commercialActionForEngine(engine:any){
  if(engine==='merchant_acquisition')return 'B2B_OUTREACH';
  if(engine==='partner_acquisition')return 'PARTNER_OUTREACH';
  return null;
}

/** A profile is usable by the central automatic-send governor, not merely present. */
export function sendingProfileIsValid(profile:any){
  const cap=Number(profile?.current_daily_cap);
  return Boolean(
    profile?.profile_key&&['outlook','resend','instantly'].includes(String(profile.provider||''))&&profile.domain&&
    ['warming','active'].includes(String(profile.status||''))&&Number.isFinite(cap)&&cap>0&&cap<=550
    &&(profile.provider!=='instantly'||instantlyProfileReady(profile))
  );
}

export function automaticFollowUpCandidate(thread:any){
  return Boolean(
    ['awaiting_counterparty','awaiting_cambra'].includes(String(thread?.status||''))&&
    thread?.next_action_at&&thread?.automation_paused!==true
  );
}

function resolved(profileKey:string,reason:string){
  return {status:'RESOLVED',profile_key:profileKey,reason,resolver_version:LEGACY_SENDING_PROFILE_RESOLVER_VERSION};
}
function review(reason:string,evidence:any={}){
  return {status:'REVIEW_REQUIRED',profile_key:null,reason,evidence,resolver_version:LEGACY_SENDING_PROFILE_RESOLVER_VERSION};
}

/** Resolve only from exact persisted evidence. It never guesses from engine or country. */
export function resolveLegacySendingProfile(input:{thread:any;messages?:any[];profiles?:any[];policy?:any}){
  const {thread,policy}=input;
  const profiles=(input.profiles||[]).filter(sendingProfileIsValid);
  const byKey=new Map<string,any>();
  for(const profile of profiles)if(!byKey.has(String(profile.profile_key)))byKey.set(String(profile.profile_key),profile);
  const existing=String(thread?.sending_profile_key||'').trim();
  if(existing)return byKey.has(existing)?resolved(existing,'existing_valid_profile'):review('existing_profile_invalid_or_missing',{profile_key:existing});

  const messageKeys=uniqueStrings((input.messages||[]).map((message:any)=>message?.sending_profile_key));
  const validMessageKeys=messageKeys.filter((key)=>byKey.has(key));
  if(messageKeys.length>1||validMessageKeys.length>1)return review('ambiguous_historical_profiles',{profile_keys:messageKeys});
  if(messageKeys.length===1&&!byKey.has(messageKeys[0]))return review('historical_profile_invalid_or_missing',{profile_key:messageKeys[0]});
  if(validMessageKeys.length===1)return resolved(validMessageKeys[0],'historical_message_profile');

  const transports=uniqueStrings((input.messages||[]).filter((message:any)=>message?.direction==='outbound').map((message:any)=>{
    const provider=String(message?.provider||'').toLowerCase();
    const from=String(message?.from_email||'').trim().toLowerCase();
    if(!provider||!from)return '';
    const matches=profiles.filter((profile:any)=>profile.provider===provider&&String(profile.from_address||'').trim().toLowerCase()===from);
    return matches.length===1?matches[0].profile_key:'';
  }));
  if(transports.length>1)return review('ambiguous_transport_evidence',{profile_keys:transports});
  if(transports.length===1)return resolved(transports[0],'historical_transport_profile');

  const policyKeys=uniqueStrings(policy?.sending_profile_keys);
  if(policyKeys.length>1)return review('policy_profiles_ambiguous',{profile_keys:policyKeys});
  if(policyKeys.length===1&&!byKey.has(policyKeys[0]))return review('policy_profile_invalid_or_missing',{profile_key:policyKeys[0]});
  if(policyKeys.length===1)return resolved(policyKeys[0],'single_policy_profile');
  return review('no_deterministic_profile_evidence');
}

export function legacyResolutionPatch(result:any,actor:string,now:string,thread:any={}){
  const base={
    sending_profile_resolution_status:result.status,
    sending_profile_resolution_reason:result.reason,
    sending_profile_resolver_version:result.resolver_version||LEGACY_SENDING_PROFILE_RESOLVER_VERSION,
    sending_profile_resolved_at:now,
    sending_profile_resolved_by:actor,
  };
  if(result.status==='RESOLVED'){
    return {
      ...base,sending_profile_key:result.profile_key,
      ...(thread?.pause_reason===SENDING_PROFILE_REVIEW_REASON?{automation_paused:false,pause_reason:null}:{}),
    };
  }
  return {...base,sending_profile_key:String(thread?.sending_profile_key||'').trim()||null,automation_paused:true,pause_reason:SENDING_PROFILE_REVIEW_REASON};
}

export function validateCanaryPolicy(policy:any){
  const blockers:string[]=[];
  if(!acquisitionEngine(policy?.engine))blockers.push('acquisition_policy_required');
  if(String(policy?.mode||'')!=='CANARY')blockers.push('canary_mode_required');
  const daily=Number(policy?.daily_send_limit);
  if(!Number.isInteger(daily)||daily<CANARY_DAILY_SEND_MIN||daily>CANARY_DAILY_SEND_MAX)blockers.push('daily_send_limit_must_be_1_to_15');
  const score=Number(policy?.min_lead_score);
  if(!Number.isFinite(score)||score<CANARY_MIN_LEAD_SCORE||score>100)blockers.push('min_lead_score_must_be_70_to_100');
  const opportunity=Number(policy?.min_opportunity_score);
  if(!Number.isFinite(opportunity)||opportunity<0||opportunity>100)blockers.push('min_opportunity_score_must_be_0_to_100');
  const confidence=Number(policy?.min_confidence);
  if(!Number.isFinite(confidence)||confidence<0.5||confidence>1)blockers.push('min_confidence_must_be_0_5_to_1');
  if(policy?.risk_controls_json?.provider_ai_reply!==false)blockers.push('provider_ai_reply_must_be_disabled');
  const markets=uniqueStrings(policy?.countries).map((x)=>x.toUpperCase());
  if(!markets.length)blockers.push('ready_markets_required');
  if(markets.some((market)=>!EUROPE_33.includes(market)))blockers.push('market_outside_europe_33');
  if(uniqueStrings(policy?.countries).some((market)=>market!==market.toUpperCase()))blockers.push('markets_must_be_iso2_uppercase');
  if(!uniqueStrings(policy?.sending_profile_keys).length)blockers.push('sending_profile_keys_required');
  if(policy?.status!=='active')blockers.push('active_policy_required');
  return {ok:blockers.length===0,blockers:[...new Set(blockers)],markets,sending_profile_keys:uniqueStrings(policy?.sending_profile_keys)};
}
