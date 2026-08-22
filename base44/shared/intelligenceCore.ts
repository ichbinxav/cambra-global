export const INTELLIGENCE_VERSION='p12-intelligence-1.0.0';
export const P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS=10;
export const P12_MIN_PUBLIC_DISTINCT_MERCHANTS=20;
export type TruthLevel='verified_official'|'observed'|'inferred';
export type KnowledgeState='candidate'|'observed'|'corroborated'|'verified'|'active'|'stale'|'superseded'|'archived'|'quarantined';
export function clamp01(n:number){return Math.max(0,Math.min(1,Number.isFinite(n)?n:0))}
export function observedFiniteNumber(value:any):number|null{
 if(value===null||value===undefined||value==='')return null;
 const number=Number(value);return Number.isFinite(number)?number:null;
}
export function observedNonNegativeNumber(value:any):number|null{
 const number=observedFiniteNumber(value);return number!==null&&number>=0?number:null;
}
export function canPromoteToVerified(truth:TruthLevel,evidenceCount:number,corroborated:boolean){return truth==='verified_official'&&evidenceCount>=1||truth==='observed'&&evidenceCount>=2&&corroborated}
export function pricingAt<T extends {effective_at?:string;valid_from?:string;valid_to?:string;knowledge_state?:string}>(rows:T[],at:string){const t=Date.parse(at);return rows.filter(r=>['verified','active','corroborated','observed'].includes(String(r.knowledge_state||''))).filter(r=>{const start=Date.parse(r.valid_from||r.effective_at||'');const end=r.valid_to?Date.parse(r.valid_to):Infinity;return Number.isFinite(start)&&start<=t&&t<end}).sort((a,b)=>Date.parse(b.valid_from||b.effective_at||'')-Date.parse(a.valid_from||a.effective_at||''))[0]||null}
export function benchmarkVisibility(n:number,min=P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS){const supportThreshold=Math.max(P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS,Number.isFinite(min)?min:P12_MIN_ANONYMIZED_DISTINCT_MERCHANTS);const publicThreshold=Math.max(P12_MIN_PUBLIC_DISTINCT_MERCHANTS,supportThreshold);return {public:n>=publicThreshold,sample_size:n,precision:n>=P12_MIN_PUBLIC_DISTINCT_MERCHANTS?'high':n>=supportThreshold?'medium':'low'}}
export function concentrationPenalty(topShare:number){const s=clamp01(topShare);return Number(Math.max(.35,1-.65*s*s).toFixed(4))}
export function moatScore(x:any){const sample=Math.min(1,Math.log10(1+Math.max(0,Number(x.sample_size||0)))/3);const diversity=clamp01(x.coverage);const freshness=clamp01(x.freshness);const quality=clamp01(x.source_quality);const outcomes=clamp01((Number(x.negotiation_outcomes||0)+Number(x.migration_outcomes||0)+Number(x.verified_savings_outcomes||0))/25);const contradiction=clamp01(x.contradiction_rate);const penalty=concentrationPenalty(Number(x.top_concentration_share||0));return Number((100*(.22*sample+.22*diversity+.2*freshness+.18*quality+.18*outcomes)*(1-.45*contradiction)*penalty).toFixed(1))}
export function informationValue(strategic:number,uncertainty:number,reuse:number){return Number((100*clamp01(strategic)*clamp01(uncertainty)*clamp01(reuse)).toFixed(1))}
export function stable(v:any):string{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(stable).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}'}
export async function sha256(v:any){const data=new TextEncoder().encode(typeof v==='string'?v:stable(v));const hash=await crypto.subtle.digest('SHA-256',data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')}
