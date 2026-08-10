export const PRIVACY_SAFE_INTELLIGENCE_VERSION='privacy-safe-intelligence-1.0.0';
export const MIN_ANONYMIZED_DISTINCT_MERCHANTS=10;
export const FORBIDDEN_INTELLIGENCE_KEYS=[
  'brand_id','merchant_id','owner_email','user_email','contact_email','contact_name','signed_by_email',
  'source_anon_id','contribution_hash','related_entity_id','verification_source_id','document_id','thread_id',
  'message_id','account_id','merchant_account_id','mid','contract_id','ip_hash','email_domain'
];
const forbidden=new Set(FORBIDDEN_INTELLIGENCE_KEYS);
export function assertNoMerchantIdentifiers(value:any,path='root'):{ok:boolean;violations:string[]}{
 const violations:string[]=[];const walk=(v:any,p:string)=>{if(v==null)return;if(Array.isArray(v)){v.forEach((x,i)=>walk(x,`${p}[${i}]`));return}if(typeof v!=='object')return;for(const[k,x]of Object.entries(v)){if(forbidden.has(k.toLowerCase()))violations.push(`${p}.${k}`);walk(x,`${p}.${k}`)}};walk(value,path);return{ok:violations.length===0,violations}
}
export function quarterOf(raw:any){const d=new Date(raw||Date.now());if(!Number.isFinite(d.getTime()))return'unknown';return`${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth()/3)+1}`}
export function coarseNumber(n:any,step=1){const x=Number(n);if(!Number.isFinite(x))return null;return Math.round(x/step)*step}
export function privacySafeOutcomeAggregate(rows:any[]){
 const unique=new Set(rows.map(r=>String(r.brand_id||'')).filter(Boolean));if(unique.size<MIN_ANONYMIZED_DISTINCT_MERCHANTS)return null;
 const realized=rows.map(r=>Number(r.realized_savings||0)).filter(Number.isFinite).sort((a,b)=>a-b);const expected=rows.map(r=>Number(r.expected_savings||0)).filter(Number.isFinite);
 const median=realized.length?realized[Math.floor(realized.length/2)]:0;const success=rows.filter(r=>r.success===true).length/rows.length;
 const payload={kind:'verified_outcomes',vertical:String(rows[0]?.vertical||'unknown'),provider_bucket:String(rows[0]?.provider_id||'unknown'),period:quarterOf(rows[0]?.captured_at),sample_size:unique.size,median_realized_savings_eur:coarseNumber(median,100),mean_expected_savings_eur:coarseNumber(expected.reduce((a,b)=>a+b,0)/Math.max(1,expected.length),100),success_rate_pct:coarseNumber(success*100,5)};
 const check=assertNoMerchantIdentifiers(payload);if(!check.ok)throw new Error(`privacy_safe_identifier_violation:${check.violations.join(',')}`);return payload;
}
export function privacySafeBenchmarkAggregate(row:any){if(Number(row?.n||0)<MIN_ANONYMIZED_DISTINCT_MERCHANTS)return null;const payload={kind:'benchmark',vertical:String(row.vertical||'unknown'),country:String(row.country||'unknown'),revenue_tier:String(row.revenue_tier||'unknown'),metric_key:String(row.metric_key||'unknown'),period:String(row.month||'').slice(0,4),sample_size:Number(row.n||0),median:coarseNumber(row.median,.01),p25:coarseNumber(row.p25,.01),p75:coarseNumber(row.p75,.01)};const check=assertNoMerchantIdentifiers(payload);if(!check.ok)throw new Error(`privacy_safe_identifier_violation:${check.violations.join(',')}`);return payload}
