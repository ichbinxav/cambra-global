import { EUROPE_MARKETS } from './generated/europeMarkets.js';
export const P2_MARKETS = EUROPE_MARKETS.map(m=>m.iso2);
export const AVAILABILITY = Object.freeze(['AVAILABLE','LIMITED','INVITE_ONLY','ENTERPRISE_ONLY','PARTNER_ONLY','UNAVAILABLE','UNKNOWN','NOT_RESEARCHED']);
export const CHANNELS = Object.freeze(['ECOMMERCE','IN_PERSON','OMNICHANNEL','MOTO','PAYMENT_LINK','MARKETPLACE','PLATFORM']);
export function assertP2MarketUniverse(){ const s=new Set(P2_MARKETS); if(s.size!==33||!s.has('FR')||!s.has('LI')||!s.has('CH')) throw new Error('P2 market invariant violated'); const bg=EUROPE_MARKETS.find(m=>m.iso2==='BG'); if(bg?.primary_currency!=='EUR') throw new Error('BG current currency must be EUR'); return true; }
export function availabilityKey({provider_id,product_id,market,channel='ANY'}){ if(!P2_MARKETS.includes(market)) throw new Error('unknown P2 market'); return `${provider_id}|${product_id}|${market}|${channel}`; }
export function canPromoteUnavailable(fact){ return fact?.availability==='UNAVAILABLE' && Array.isArray(fact.evidence_refs) && fact.evidence_refs.length>0 && fact.research_state==='RESOLVED'; }
export function verifiedAtFor(status,at){ return status==='VERIFIED' ? at : null; }
export function canUseForVerifiedEconomics(obs){ return ['VERIFIED_PRIMARY','VERIFIED_SECONDARY','MERCHANT_OBSERVED','CONTRACT_OBSERVED','NEGOTIATED'].includes(obs?.provenance) && obs?.provenance!=='ESTIMATED'; }
export function canInheritAcrossMarkets(sourceScope,targetMarket){ return Array.isArray(sourceScope?.applicable_markets) && sourceScope.applicable_markets.includes(targetMarket) && !sourceScope?.excluded_markets?.includes(targetMarket); }
export function currencyEvidenceConsistent(obs){ if(!obs?.currency) return false; if(!obs?.evidence_currency) return true; return obs.currency===obs.evidence_currency; }
export function resolveIdentity(candidate,providers){ const n=String(candidate?.name||'').trim().toLowerCase(); const d=String(candidate?.domain||'').trim().toLowerCase(); const exact=providers.filter(p=>[p.canonical_name,p.name,...(p.aliases||[])].filter(Boolean).some(x=>String(x).trim().toLowerCase()===n) || (d && (p.domains||[]).map(x=>String(x).toLowerCase()).includes(d))); return exact.length===1?{outcome:'SAME_PROVIDER',provider:exact[0]}:exact.length>1?{outcome:'UNCERTAIN'}:{outcome:'UNCERTAIN'}; }
