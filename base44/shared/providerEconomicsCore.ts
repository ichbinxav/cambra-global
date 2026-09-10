export const PROVIDER_ECONOMICS_VERSION='provider-no-compensation-2026-09-10';
export const PSP_COMPENSATION_ACCEPTED=false;
export const PROVIDER_MONETIZATION_PRODUCTION_ALLOWED=false;
export const PROVIDER_COMPENSATION_DISABLED_ERROR='provider_compensation_disabled_by_cambra_policy';
export function providerCompensationDisabledResponse(){return Response.json({ok:false,error:PROVIDER_COMPENSATION_DISABLED_ERROR,provider_compensation_activation_allowed:false,policy:'CAMBRA accepts no commission, referral fee, revenue share or other compensation from a PSP. The PSP contracts with and invoices the merchant directly.'},{status:409})}
export const MERCHANT_SUITABILITY_MIN_SCORE=70;
export function clamp01(n:number){return Math.max(0,Math.min(1,Number.isFinite(n)?n:0))}
export function merchantSuitability(score:number){return Number(score||0)>=MERCHANT_SUITABILITY_MIN_SCORE}
export function providerExpectedRevenueMinor(_e:any,_horizonMonths=12){return 0}
export function providerEconomicsScore(_e:any){return 0}
export function classifyConflict(input:{bestMerchantScore:number;candidateMerchantScore:number;candidateProviderRevenue:number;bestProviderRevenue:number}){const gap=Math.max(0,input.bestMerchantScore-input.candidateMerchantScore),revGain=input.candidateProviderRevenue-input.bestProviderRevenue;if(revGain<=0||gap<=0)return'conflict_none';if(gap<3)return'conflict_minor';if(gap<10)return'conflict_material';return'conflict_critical'}
export function recommendationFirewall(options:any[]){const eligible=options.filter(x=>merchantSuitability(Number(x.merchant_outcome_score||0)));const ranked=[...eligible].sort((a,b)=>Number(b.merchant_outcome_score||0)-Number(a.merchant_outcome_score||0));return ranked[0]||null}
export function compensationMetricValue(ctx:any,metric:string){if(metric==='activated_volume'||metric==='processed_volume')return Number(ctx?.volume_minor||0);if(metric==='transaction_count')return Number(ctx?.transaction_count||0);if(metric==='activated_merchants')return Number(ctx?.merchant_count||0);if(metric==='provider_net_revenue')return Number(ctx?.provider_net_revenue_minor||0);if(metric==='product_adoption')return Number(ctx?.product_adoption||0);if(metric==='retention')return Number(ctx?.retention||0);if(metric==='growth_rate')return Number(ctx?.growth_rate||0);return 0}
export function compensationTierProgress(ctx:any,tier:any){const value=Math.max(0,compensationMetricValue(ctx,String(tier.metric||''))),threshold=Math.max(0,Number(tier.threshold_value||0));return{value,threshold,qualified:threshold===0||value>=threshold,progress_pct:threshold?Number(Math.min(100,value/threshold*100).toFixed(1)):100,amount_remaining:Math.max(0,threshold-value)}}
export function providerRevenueAmountMinor(_basisValue:number,_terms:any){return 0}
