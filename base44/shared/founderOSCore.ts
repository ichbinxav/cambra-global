export const FOUNDER_OS_VERSION='founder-os-p16-1.0.0';
export type ConfidenceLabel='verified'|'contractual'|'observed'|'estimated'|'unknown';
export const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
export const safeNumber=(v:any)=>Number.isFinite(Number(v))?Number(v):0;
export const moneyMinorToMajor=(v:any)=>safeNumber(v)/100;
export const ageMinutes=(iso:any)=>{const t=Date.parse(String(iso||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/60000):null};
export const FOUNDER_METRICS=Object.freeze({
 collected_revenue:{label:'Collected revenue',definition:'Merchant-side collected cash plus provider-side evidenced paid revenue; never booked/accrued.',source:'Invoice.amount_paid + ProviderRevenueLedger.paid_amount_minor(state=paid)',refresh:'near_live',confidence:'verified'},
 merchant_collected:{label:'Merchant collected',definition:'Cash evidenced as paid on merchant invoices.',source:'Invoice.amount_paid',refresh:'near_live',confidence:'verified'},
 provider_collected:{label:'Provider collected',definition:'Provider-side revenue with payment evidence and paid ledger state.',source:'ProviderRevenueLedger.paid_amount_minor(state=paid)',refresh:'near_live',confidence:'verified'},
 provider_accrued:{label:'Provider accrued',definition:'Provider-side amount contractually earned after activation/legal gates, before payment.',source:'ProviderRevenueLedger.accrued_amount_minor',refresh:'near_live',confidence:'contractual'},
 verified_savings:{label:'Verified savings',definition:'Realized merchant savings from fully verified savings reports.',source:'MonthlySavingsReport(measurement_mode=fully_verified, verification_status=realized)',refresh:'near_live',confidence:'verified'},
 active_merchants:{label:'Active merchants',definition:'Non-demo brands with an active/live/monetizing Recover lifecycle or connected production integration.',source:'Brand + DealActivation + Integration',refresh:'near_live',confidence:'observed'},
 weighted_pipeline:{label:'Weighted pipeline',definition:'Only pipeline values with explicit expected value and probability. Unknown value is not imputed.',source:'OutboundLead / AcquisitionAttribution explicit values',refresh:'hourly',confidence:'estimated'},
 aggregate_addressable:{label:'Aggregate addressable volume',definition:'Technically/commercially addressable demand; not a commitment.',source:'AggregatePool.addressable_annual_volume_minor',refresh:'6h',confidence:'estimated'},
 aggregate_committed:{label:'Aggregate committed volume',definition:'Only explicit AggregateCommitment-backed demand.',source:'AggregatePool.committed_annual_volume_minor',refresh:'6h',confidence:'contractual'},
 company_health:{label:'Company health',definition:'Advisory composite; never replaces underlying domain metrics.',source:'OperatingHealthAssessment',refresh:'daily',confidence:'observed'},
 founder_attention:{label:'Founder attention',definition:'Material approvals, critical incidents, strategic meetings and high-risk gaps requiring human authority.',source:'Approval + AutonomyIncident + CommunicationThread + RealWorldGapReport',refresh:'near_live',confidence:'observed'}
});
export function metricMeta(key:string){return (FOUNDER_METRICS as any)[key]||null}
export function riskRank(v:any){const s=String(v||'').toLowerCase();return s==='critical'?100:s==='high'?80:s==='warning'?55:s==='notice'?30:20}
export function attentionPriority(x:any){return clamp(safeNumber(x.financial_impact_score)*.35+safeNumber(x.risk_score)*.35+safeNumber(x.urgency_score)*.2+safeNumber(x.strategic_score)*.1)}
