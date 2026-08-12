import{assertNoMerchantIdentifiers,MIN_ANONYMIZED_DISTINCT_MERCHANTS}from'./privacySafeIntelligence.ts';
export const LEAD_OUTCOME_CALIBRATION_VERSION='lead-outcome-calibration-1.0.0';

function textSet(values:any[]){return new Set(values.map(x=>String(x||'').trim().toLowerCase()).filter(Boolean))}
function leadProviders(lead:any){return textSet([...(Array.isArray(lead?.probable_payment_stack)?lead.probable_payment_stack:[]),lead?.enrichment_json?.payment_provider,lead?.source_evidence_json?.payment_provider])}
export function safeLeadOutcomeAggregate(row:any){
 const metrics=row?.metrics_json;
 if(row?.aggregate_type!=='verified_outcomes'||Number(row?.sample_size)<MIN_ANONYMIZED_DISTINCT_MERCHANTS||Number(metrics?.sample_size)<MIN_ANONYMIZED_DISTINCT_MERCHANTS||row?.reidentification_mapping_retained!==false||metrics?.kind!=='verified_outcomes')return null;
 const privacy=assertNoMerchantIdentifiers(metrics);if(!privacy.ok)return null;
 const success=Number(metrics?.success_rate_pct);if(!Number.isFinite(success)||success<0||success>100)return null;
 return{aggregate_ref:String(row.aggregate_key||''),vertical:String(row.vertical||metrics.vertical||'unknown').toLowerCase(),provider_bucket:String(row.provider_bucket||metrics.provider_bucket||'unknown').toLowerCase(),sample_size:Math.floor(Number(row.sample_size)),success_rate_pct:success,period:String(row.period||metrics.period||'')};
}
function boundedAdjustment(success:number){if(success>=70)return 3;if(success>=55)return 1;if(success<30)return-3;if(success<45)return-1;return 0}
export function leadOutcomeCalibration(lead:any,rows:any[]){
 const providers=leadProviders(lead);if(!providers.size)return{applied:false,adjustment:0,reason:'provider_evidence_required',version:LEAD_OUTCOME_CALIBRATION_VERSION,aggregate_refs:[],sample_size:0};
 const candidates=(Array.isArray(rows)?rows:[]).map(safeLeadOutcomeAggregate).filter(Boolean).filter((x:any)=>x.vertical==='payments'&&providers.has(x.provider_bucket));
 if(!candidates.length)return{applied:false,adjustment:0,reason:'no_privacy_safe_provider_outcome_cohort',version:LEAD_OUTCOME_CALIBRATION_VERSION,aggregate_refs:[],sample_size:0};
 const total=candidates.reduce((s:number,x:any)=>s+x.sample_size,0);const success=candidates.reduce((s:number,x:any)=>s+x.success_rate_pct*x.sample_size,0)/total;const adjustment=boundedAdjustment(success);
 return{applied:true,adjustment,reason:'privacy_safe_verified_outcome_calibration',version:LEAD_OUTCOME_CALIBRATION_VERSION,aggregate_refs:candidates.map((x:any)=>x.aggregate_ref).filter(Boolean).slice(0,12),sample_size:total,success_rate_pct:Math.round(success*10)/10};
}
