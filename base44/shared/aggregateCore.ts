export const AGGREGATE_ENGINE_VERSION='p14-aggregate-1.0.0';
export const AGGREGATE_MIN_APS_TO_PREPARE=50;
export const AGGREGATE_MIN_APS_TO_NEGOTIATE=65;
export type DemandVolumeKind='observed'|'addressable'|'committed'|'probable';
export function clamp01(n:number){return Math.max(0,Math.min(1,Number.isFinite(n)?n:0))}
export function annualize(valueMinor:number,windowDays:number){const d=Math.max(1,Number(windowDays||0));return Math.round(Math.max(0,Number(valueMinor||0))*365/d)}
export function committedVolumeFromExplicitCommitments(rows:any[],now=Date.now()){return rows.filter(r=>['explicitly_authorized','active'].includes(String(r.status||''))).filter(r=>!r.effective_at||Date.parse(r.effective_at)<=now).filter(r=>!r.expires_at||Date.parse(r.expires_at)>now).reduce((a,r)=>a+Math.max(0,Number(r.committed_annual_volume_minor||0)),0)}
export function aggregationPowerScore(x:any){const addressable=Math.max(0,Number(x.addressable_annual_volume_minor||0));const committed=Math.max(0,Number(x.committed_annual_volume_minor||0));const merchants=Math.max(0,Number(x.merchant_count||0));const readiness=clamp01(Number(x.migration_readiness||0));const confidence=clamp01(Number(x.confidence||0));const concentration=clamp01(Number(x.concentration||0));const growth=Math.max(-1,Math.min(2,Number(x.growth_rate||0)));const vol=Math.min(1,Math.log10(1+addressable/100)/8);const com=Math.min(1,Math.log10(1+committed/100)/8);const merchantDepth=Math.min(1,Math.log10(1+merchants)/2);const score=100*(.30*vol+.24*com+.12*merchantDepth+.14*readiness+.12*confidence+.08*Math.max(0,growth/2))*(1-.30*concentration);return Number(Math.max(0,Math.min(100,score)).toFixed(1))}
export function apsLabel(score:number){const s=Number(score||0);if(s>=90)return'STRATEGIC_PROCUREMENT';if(s>=80)return'HIGH_LEVERAGE';if(s>=65)return'NEGOTIATION_READY';if(s>=50)return'PREPARE_MARKET';if(s>=30)return'BUILD_POOL';return'OBSERVE'}
export function poolStatusFromAPS(score:number,current?:string){if(['rfp_open','negotiating','final_offer','human_approval','contracting','active','tier_upgrade_pending','renegotiating','expiring'].includes(String(current||'')))return current;return score>=65?'negotiation_ready':score>=30?'threshold_waiting':'pool_forming'}
export function metricValue(pool:any,metric:string){if(metric==='observed_volume')return Number(pool.observed_annual_volume_minor||0);if(metric==='addressable_volume')return Number(pool.addressable_annual_volume_minor||0);if(metric==='committed_volume')return Number(pool.committed_annual_volume_minor||0);if(metric==='active_merchant_count')return Number(pool.merchant_count||0);if(metric==='transaction_count')return Number(pool.transaction_count_annualized||0);return 0}
export function tierProgress(pool:any,tier:any){const value=Math.max(0,metricValue(pool,String(tier.metric||''))),threshold=Math.max(0,Number(tier.threshold_value||0));const qualified=threshold===0||value>=threshold;return{value,threshold,qualified,progress_pct:threshold?Number(Math.min(100,value/threshold*100).toFixed(1)):100,amount_remaining:Math.max(0,threshold-value)}}
// AUDIT P3-01 (2026-08-17) — an unquoted rate was priced at ZERO basis points.
//
// collectiveNegotiationAgent deliberately preserves an unstated per-transaction rate as null
// (entry.ts:226, under an extraction prompt that says "Do not invent absent terms"). It then hands
// that null straight here, where `null || 0` priced the proposal at 0 bps. A provider that quoted
// only a monthly platform fee and NO rate came out at ~6 effective bps on a EUR 10m pool, which
// became merchant_outcome_score 94, passed the `>= 70` suitability gate (entry.ts:306), advanced
// the NegotiationCase to awaiting_provider with merchant_terms_established: true, and reached the
// founder as an Approval reading "Merchant Outcome Score: 94". The true merchant cost was UNKNOWN.
//
// A cost computed from a component nobody stated is not a cost. When any priced component is
// absent, the cost is null and every figure derived from it is null — a null score is NOT a score
// of zero, and it must not satisfy a threshold.
const priced = (value:unknown):number|null => {
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='boolean')return null;
  const parsed=Number(value);
  return Number.isFinite(parsed)?Math.max(0,parsed):null;
};

export function pricingCostMinor(volumeMinor:number,txCount:number,pricing:any):number|null{
  const volume=Math.max(0,Number(volumeMinor||0)),tx=Math.max(0,Number(txCount||0));
  const rateBps=priced(pricing?.variable_rate_bps);
  const fixedFee=priced(pricing?.fixed_fee_minor);
  const monthlyFee=priced(pricing?.monthly_fee_minor);
  // A rate is only skippable when there is no volume to apply it to, and a per-transaction fee
  // only when there are no transactions. Otherwise its absence makes the total unknowable.
  if(rateBps===null&&volume>0)return null;
  if(fixedFee===null&&tx>0)return null;
  if(monthlyFee===null&&rateBps===null&&fixedFee===null)return null;
  return Math.round(volume*(rateBps??0)/10000+tx*(fixedFee??0)+(monthlyFee??0)*12);
}

export function normalizeBidForPool(pool:any,bid:any){
  const volume=Math.max(0,Number(pool.addressable_annual_volume_minor||0)),tx=Math.max(0,Number(pool.transaction_count_annualized||0));
  const cost=pricingCostMinor(volume,tx,bid);
  if(cost===null){
    // Propagated, not defaulted. The blocker names WHICH component was never stated, because
    // "unknown cost" with no reason is a dead end for whoever reads it.
    const missing=[
      priced(bid?.variable_rate_bps)===null&&volume>0?'variable_rate_bps':null,
      priced(bid?.fixed_fee_minor)===null&&tx>0?'fixed_fee_minor':null,
    ].filter(Boolean);
    return{
      normalized_annual_cost_minor:null,
      estimated_effective_bps:null,
      cost_unknown:true,
      blockers:missing.length?missing.map((f)=>`provider_${f}_not_stated`):['provider_pricing_not_stated'],
    };
  }
  const bps=volume?Number((cost/volume*10000).toFixed(2)):null;
  return{normalized_annual_cost_minor:cost,estimated_effective_bps:bps,cost_unknown:false,blockers:[]};
}
export function materialAggregateTerms(x:any){const l=x?.legal_terms_json||x?.conditions_json||{};return Boolean(l.exclusivity===true||l.volume_guarantee===true||l.minimum_spend!=null||l.minimum_volume!=null||l.financial_liability===true||Number(l.contract_term_months||x?.contract_term_months||0)>12||l.brand_usage_material===true||l.regulatory_exposure===true)}
export function truthfulDemandSnapshot(pool:any){return{merchant_count:Number(pool.merchant_count||0),observed_annual_volume_minor:Number(pool.observed_annual_volume_minor||0),addressable_annual_volume_minor:Number(pool.addressable_annual_volume_minor||0),committed_annual_volume_minor:Number(pool.committed_annual_volume_minor||0),probable_annual_volume_minor:Number(pool.probable_annual_volume_minor||0),currency:String(pool.currency||'EUR'),aggregation_power_score:Number(pool.aggregation_power_score||0),claim_rule:'observed/addressable/committed are distinct; committed comes only from explicit AggregateCommitment evidence'}}
export function canOpenRFP(pool:any){return Number(pool.aggregation_power_score||0)>=AGGREGATE_MIN_APS_TO_NEGOTIATE&&Number(pool.addressable_annual_volume_minor||0)>0&&Number(pool.merchant_count||0)>0}
