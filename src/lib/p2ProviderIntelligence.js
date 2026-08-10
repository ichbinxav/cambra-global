import { EUROPE_MARKETS } from './generated/europeMarkets.js';
export const P2_MARKETS = EUROPE_MARKETS.map(m=>m.iso2);
export const AVAILABILITY = Object.freeze(['AVAILABLE','LIMITED','INVITE_ONLY','ENTERPRISE_ONLY','PARTNER_ONLY','UNAVAILABLE','UNKNOWN','NOT_RESEARCHED']);
export const PRESENCE = Object.freeze(['PRESENT','LIMITED','PARTNER_ONLY','UNAVAILABLE','UNKNOWN','NOT_RESEARCHED']);
export const ELIGIBILITY = Object.freeze(['ELIGIBLE','LIMITED','INELIGIBLE','UNKNOWN','NOT_RESEARCHED']);
export const CHANNELS = Object.freeze(['ECOMMERCE','IN_PERSON','OMNICHANNEL','MOTO','PAYMENT_LINK','MARKETPLACE','PLATFORM']);
export const REGULATORY_SYSTEMS = Object.freeze(['EU_EEA_PSD2','UK_PSR','SWISS','ANDORRAN','OTHER','UNKNOWN']);
export const CURRENCY_USAGE = Object.freeze(['PRESENTMENT','PROCESSING','SETTLEMENT','PAYOUT','BILLING','UNKNOWN']);
export const RESEARCH_OUTCOMES = Object.freeze(['NOT_RESEARCHED','RESEARCHED_NONE_FOUND','CANDIDATES_FOUND','VERIFIED','CONFLICT','STALE','REQUIRES_DEEP_RESEARCH']);
export function assertP2MarketUniverse(){ const s=new Set(P2_MARKETS); if(s.size!==33||!s.has('FR')||!s.has('LI')||!s.has('CH')) throw new Error('P2 market invariant violated'); const bg=EUROPE_MARKETS.find(m=>m.iso2==='BG'); if(bg?.primary_currency!=='EUR') throw new Error('BG current currency must be EUR'); return true; }
export function regulatorySystemForMarket(iso2){ if(iso2==='GB')return'UK_PSR'; if(iso2==='CH')return'SWISS'; if(iso2==='AD')return'ANDORRAN'; if(P2_MARKETS.includes(iso2))return'EU_EEA_PSD2'; return'OTHER'; }
export function availabilityKey({provider_id,product_id,market,channel='ANY'}){ if(!P2_MARKETS.includes(market)) throw new Error('unknown P2 market'); return `${provider_id}|${product_id}|${market}|${channel}`; }
export function presenceKey({provider_id,market}){ if(!P2_MARKETS.includes(market)) throw new Error('unknown P2 market'); return `${provider_id}|${market}`; }
export function currencySupportKey({provider_product_id,market,currency,usage_type}){ if(!P2_MARKETS.includes(market)) throw new Error('unknown P2 market'); if(!CURRENCY_USAGE.includes(usage_type)) throw new Error('unknown currency usage'); return `${provider_product_id}|${market}|${currency}|${usage_type}`; }
export function eligibilityKey({provider_product_id,market,segment}){ if(!P2_MARKETS.includes(market)) throw new Error('unknown P2 market'); return `${provider_product_id}|${market}|${segment}`; }
export function authorizationKey({provider_legal_entity_id,jurisdiction,authorization_number=''}){ return `${provider_legal_entity_id}|${jurisdiction}|${authorization_number||'UNNUMBERED'}`; }
export function assertionKey({subject_type,subject_id,predicate,evidence_id,market=''}){ return `${subject_type}|${subject_id}|${predicate}|${market}|${evidence_id}`; }
export function canPromoteUnavailable(fact){ return fact?.availability==='UNAVAILABLE' && Array.isArray(fact.evidence_refs) && fact.evidence_refs.length>0 && fact.research_state==='RESOLVED'; }
export function canPromoteMarketUnavailable(fact){ return fact?.presence_state==='UNAVAILABLE' && Array.isArray(fact.evidence_refs) && fact.evidence_refs.length>0 && fact.research_state==='RESOLVED'; }
export function verifiedAtFor(status,at){ return status==='VERIFIED' ? at : null; }
export function canUseForVerifiedEconomics(obs){ return ['VERIFIED_PRIMARY','VERIFIED_SECONDARY','MERCHANT_OBSERVED','CONTRACT_OBSERVED','NEGOTIATED'].includes(obs?.provenance) && obs?.provenance!=='ESTIMATED'; }
export function canInheritAcrossMarkets(sourceScope,targetMarket){ return Array.isArray(sourceScope?.applicable_markets) && sourceScope.applicable_markets.includes(targetMarket) && !sourceScope?.excluded_markets?.includes(targetMarket); }
export function currencyEvidenceConsistent(obs){ if(!obs?.currency) return false; if(!obs?.evidence_currency) return true; return obs.currency===obs.evidence_currency; }
export function resolveIdentity(candidate,providers){ const n=String(candidate?.name||'').trim().toLowerCase(); const d=String(candidate?.domain||'').trim().toLowerCase(); const exact=providers.filter(p=>[p.canonical_name,p.name,...(p.aliases||[])].filter(Boolean).some(x=>String(x).trim().toLowerCase()===n) || (d && (p.domains||[]).map(x=>String(x).toLowerCase()).includes(d))); return exact.length===1?{outcome:'SAME_PROVIDER',provider:exact[0]}:exact.length>1?{outcome:'UNCERTAIN'}:{outcome:'UNCERTAIN'}; }
export function researchOutcome({attempted=false,candidates=0,verified=0,conflicts=0,stale=false,needsDeep=false}){ if(!attempted)return'NOT_RESEARCHED'; if(conflicts>0)return'CONFLICT'; if(stale)return'STALE'; if(needsDeep)return'REQUIRES_DEEP_RESEARCH'; if(verified>0)return'VERIFIED'; if(candidates>0)return'CANDIDATES_FOUND'; return'RESEARCHED_NONE_FOUND'; }
export function productAvailabilityDoesNotImplyEligibility({availability,eligibility}){ return availability==='AVAILABLE' && (!eligibility || eligibility==='UNKNOWN' || eligibility==='NOT_RESEARCHED'); }
