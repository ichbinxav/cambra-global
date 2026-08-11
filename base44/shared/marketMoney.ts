export const FX_SCALE=1_000_000_000_000n;
export const CURRENCY_MINOR_UNITS:Record<string,number>=Object.freeze({
  EUR:2,GBP:2,CHF:2,NOK:2,SEK:2,DKK:2,PLN:2,CZK:2,HUF:2,RON:2,ISK:0,
  BGN:2,USD:2,CAD:2,AUD:2,NZD:2,JPY:0,CNY:2,HKD:2,SGD:2
});

export const FX_REFERENCE_STATES=Object.freeze(['CURRENT','VERIFIED_REFERENCE','STALE','MISSING','CONFLICT','SOURCE_ERROR','UNKNOWN']);

export function normalizeCurrencyCode(v:any){const c=String(v||'').trim().toUpperCase();return /^[A-Z]{3}$/.test(c)?c:null}
export function currencyMinorUnits(v:any){const c=normalizeCurrencyCode(v);return c&&Object.prototype.hasOwnProperty.call(CURRENCY_MINOR_UNITS,c)?CURRENCY_MINOR_UNITS[c]:null}
export function moneyObservation(input:any){const c=normalizeCurrencyCode(input?.currency_original);const amount=input?.amount_original;if(!c||!Number.isSafeInteger(amount))return{ok:false,error:!c?'invalid_currency':'amount_original_must_be_integer_minor_units'};const precision=currencyMinorUnits(c);if(precision===null)return{ok:false,error:'currency_precision_unknown'};return{ok:true,amount_original:amount,currency_original:c,minor_units:precision}}

function pow10(n:number){let v=1n;for(let i=0;i<n;i++)v*=10n;return v}
function roundDivHalfAwayFromZero(numerator:bigint,denominator:bigint){if(denominator<=0n)throw new Error('denominator_must_be_positive');const negative=numerator<0n;const n=negative?-numerator:numerator;const q=n/denominator;const r=n%denominator;const rounded=r*2n>=denominator?q+1n:q;return negative?-rounded:rounded}
function safeBigIntToNumber(v:bigint){const n=Number(v);if(!Number.isSafeInteger(n))throw new Error('normalized_amount_exceeds_safe_integer');return n}

export function decimalRateToScaled(value:any,scale:bigint=FX_SCALE){
  const raw=String(value??'').trim();
  if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))return null;
  const [whole,fraction='']=raw.split('.');
  const scaleDigits=scale.toString().length-1;
  if(scale!==10n**BigInt(scaleDigits))throw new Error('scale_must_be_power_of_ten');
  const padded=(fraction+'0'.repeat(scaleDigits)).slice(0,scaleDigits);
  const discarded=fraction.slice(scaleDigits);
  let scaled=BigInt(whole)*scale+BigInt(padded||'0');
  if(discarded&&Number(discarded[0])>=5)scaled+=1n;
  return scaled>0n?scaled:null;
}

export function scaledRateToDecimal(scaled:any,scale:bigint=FX_SCALE){
  const n=typeof scaled==='bigint'?scaled:BigInt(scaled);
  const whole=n/scale;const fraction=(n%scale).toString().padStart(scale.toString().length-1,'0').replace(/0+$/,'');
  return fraction?`${whole}.${fraction}`:`${whole}`;
}

function isoTime(v:any){const t=Date.parse(String(v||''));return Number.isFinite(t)?new Date(t).toISOString():null}
function sourceRank(source:string,policy:any){const priorities=Array.isArray(policy?.source_priority)?policy.source_priority:[];const i=priorities.indexOf(source);return i<0?priorities.length+100:i}
function observationScaledRate(o:any){
  if(Number.isSafeInteger(o?.rate_scaled_1e12)&&o.rate_scaled_1e12>0)return BigInt(o.rate_scaled_1e12);
  if(o?.rate_decimal!=null)return decimalRateToScaled(o.rate_decimal);
  return null;
}
function referenceEligible(o:any){return !o?.rate_kind||o.rate_kind==='REFERENCE'}
function usableStatus(o:any){return !o?.status||['CURRENT','VERIFIED_REFERENCE','STALE'].includes(o.status)}

export function resolveFX(observations:any[],request:any){
  const base=normalizeCurrencyCode(request?.base_currency);const quote=normalizeCurrencyCode(request?.quote_currency);const requestedAt=isoTime(request?.effective_at);
  const purpose=String(request?.purpose||'NORMALIZATION');const policy=request?.source_policy||{};
  if(!base||!quote)return{ok:false,status:'UNKNOWN',error:'invalid_currency',base_currency:base,quote_currency:quote,purpose};
  if(!requestedAt)return{ok:false,status:'UNKNOWN',error:'effective_at_required',base_currency:base,quote_currency:quote,purpose};
  if(base===quote)return{ok:true,status:'CURRENT',base_currency:base,quote_currency:quote,rate_scaled_1e12:Number(FX_SCALE),rate_decimal:'1',source:'identity',requested_effective_at:requestedAt,resolved_effective_at:requestedAt,resolution_method:'IDENTITY',purpose};
  const requestedMs=Date.parse(requestedAt);
  const candidates=(observations||[]).filter(o=>referenceEligible(o)&&usableStatus(o)).flatMap(o=>{
    const ob=normalizeCurrencyCode(o?.base_currency),oq=normalizeCurrencyCode(o?.quote_currency),effective=isoTime(o?.resolved_effective_at||o?.effective_at);const rate=observationScaledRate(o);
    if(!ob||!oq||!effective||!rate||Date.parse(effective)>requestedMs)return[];
    if(ob===base&&oq===quote)return[{o,effective,rate,inverse:false}];
    if(ob===quote&&oq===base)return[{o,effective,rate,inverse:true}];
    return[];
  });
  if(!candidates.length)return{ok:false,status:'MISSING',error:'fx_rate_missing',base_currency:base,quote_currency:quote,requested_effective_at:requestedAt,purpose};
  candidates.sort((a,b)=>Date.parse(b.effective)-Date.parse(a.effective)||sourceRank(String(a.o.source||''),policy)-sourceRank(String(b.o.source||''),policy));
  const latestMs=Date.parse(candidates[0].effective);const latest=candidates.filter(c=>Date.parse(c.effective)===latestMs);
  const bestRank=Math.min(...latest.map(c=>sourceRank(String(c.o.source||''),policy)));const best=latest.filter(c=>sourceRank(String(c.o.source||''),policy)===bestRank);
  const normalizedRates=best.map(c=>c.inverse?roundDivHalfAwayFromZero(FX_SCALE*FX_SCALE,c.rate):c.rate);
  if(new Set(normalizedRates.map(String)).size>1)return{ok:false,status:'CONFLICT',error:'fx_rate_conflict',base_currency:base,quote_currency:quote,requested_effective_at:requestedAt,resolved_effective_at:best[0].effective,purpose,candidate_sources:best.map(c=>c.o.source||null)};
  const chosen=best[0];const scaled=normalizedRates[0];const ageDays=Math.floor((requestedMs-latestMs)/86400000);const staleAfter=Number.isFinite(Number(policy?.stale_after_days))?Number(policy.stale_after_days):7;
  const status=(chosen.o.status==='STALE'||ageDays>staleAfter)?'STALE':'CURRENT';
  return{ok:true,status,base_currency:base,quote_currency:quote,rate_scaled_1e12:safeBigIntToNumber(scaled),rate_decimal:scaledRateToDecimal(scaled),source:String(chosen.o.source||''),source_url:chosen.o.source_url||null,source_snapshot_id:chosen.o.source_snapshot_id||chosen.o.id||null,evidence_id:chosen.o.evidence_id||null,version:chosen.o.version??null,requested_effective_at:requestedAt,resolved_effective_at:chosen.effective,resolution_method:chosen.inverse?(latestMs===requestedMs?'INVERSE_EXACT':'INVERSE_PRIOR_AVAILABLE'):(latestMs===requestedMs?'DIRECT_EXACT':'DIRECT_PRIOR_AVAILABLE'),purpose};
}

function exactNormalizeAmount(amountMinor:number,sourcePrecision:number,targetPrecision:number,rateScaled:bigint){
  const numerator=BigInt(amountMinor)*rateScaled*pow10(targetPrecision);const denominator=FX_SCALE*pow10(sourcePrecision);return safeBigIntToNumber(roundDivHalfAwayFromZero(numerator,denominator));
}

export function normalizeMoney(input:any){
  const original=moneyObservation(input);if(!original.ok)return original;
  const target=normalizeCurrencyCode(input?.currency_normalized||input?.target_currency);if(!target)return{...original,normalized:false,reason:'normalization_not_requested'};
  const requestedAt=isoTime(input?.effective_at||input?.fx_requested_effective_at||input?.fx_effective_at);
  if(target===original.currency_original)return{...original,normalized:true,amount_normalized:original.amount_original,currency_normalized:target,fx_rate:'1',fx_rate_scaled_1e12:Number(FX_SCALE),fx_source:'identity',fx_status:'CURRENT',fx_requested_effective_at:requestedAt,fx_resolved_effective_at:requestedAt,fx_effective_at:requestedAt,fx_resolution_method:'IDENTITY'};
  const targetPrecision=currencyMinorUnits(target);if(targetPrecision===null)return{...original,ok:false,error:'target_currency_precision_unknown'};
  let resolution=input?.fx_resolution||null;
  if(!resolution&&input?.fx_rate!=null){
    const scaled=decimalRateToScaled(input.fx_rate);if(scaled&&String(input?.fx_source||'').trim()&&(requestedAt||isoTime(input?.fx_effective_at)))resolution={ok:true,status:'CURRENT',rate_scaled_1e12:safeBigIntToNumber(scaled),rate_decimal:scaledRateToDecimal(scaled),source:String(input.fx_source),requested_effective_at:requestedAt||isoTime(input.fx_effective_at),resolved_effective_at:isoTime(input.fx_effective_at),resolution_method:'EVIDENCED_EXPLICIT_RATE'};
  }
  if(!resolution?.ok||!['CURRENT','VERIFIED_REFERENCE','STALE'].includes(resolution.status||'CURRENT'))return{...original,ok:false,error:resolution?.status==='CONFLICT'?'fx_conflict':'fx_evidence_required',fx_status:resolution?.status||'MISSING'};
  const scaled=observationScaledRate(resolution);if(!scaled||!String(resolution?.source||'').trim()||!resolution?.resolved_effective_at)return{...original,ok:false,error:'fx_evidence_required'};
  if(resolution.base_currency&&normalizeCurrencyCode(resolution.base_currency)!==original.currency_original)return{...original,ok:false,error:'fx_base_currency_mismatch'};
  if(resolution.quote_currency&&normalizeCurrencyCode(resolution.quote_currency)!==target)return{...original,ok:false,error:'fx_quote_currency_mismatch'};
  const amountNormalized=exactNormalizeAmount(original.amount_original,original.minor_units,targetPrecision,scaled);
  return{...original,normalized:true,amount_normalized:amountNormalized,currency_normalized:target,target_minor_units:targetPrecision,fx_rate:resolution.rate_decimal||scaledRateToDecimal(scaled),fx_rate_scaled_1e12:safeBigIntToNumber(scaled),fx_source:String(resolution.source),fx_source_url:resolution.source_url||null,fx_source_snapshot_id:resolution.source_snapshot_id||null,fx_evidence_id:resolution.evidence_id||null,fx_version:resolution.version??null,fx_status:resolution.status||'CURRENT',fx_requested_effective_at:resolution.requested_effective_at||requestedAt||null,fx_resolved_effective_at:String(resolution.resolved_effective_at),fx_effective_at:String(resolution.resolved_effective_at),fx_resolution_method:resolution.resolution_method||'REFERENCE_RATE'};
}
