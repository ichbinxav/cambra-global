// Cross-engine learning boundary: aggregate verified outcomes only.
// It never returns row identifiers, tenant identifiers or raw observations.
export const MIN_OUTCOME_CALIBRATION_COHORT = 10;
export const OUTCOME_CALIBRATION_VERSION = 'outcome-calibration-v1.0.0';

const finite = (value:any) => Number.isFinite(Number(value));
const median = (values:number[]) => {
  const sorted=[...values].sort((a,b)=>a-b);
  const middle=Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};

export function buildOutcomeCalibration(rows:any[], options?:{currency?:string}) {
  const currency=String(options?.currency||'').trim().toUpperCase();
  const eligible=(Array.isArray(rows)?rows:[]).filter((row:any)=>
    row?.is_demo!==true &&
    (!currency||String(row?.currency||'').trim().toUpperCase()===currency) &&
    finite(row?.realized_savings),
  );
  if(eligible.length<MIN_OUTCOME_CALIBRATION_COHORT){
    return {
      version:OUTCOME_CALIBRATION_VERSION,
      suppressed:true,
      n:eligible.length,
      minimum_cohort:MIN_OUTCOME_CALIBRATION_COHORT,
      aggregate:null,
      truth_note:'Insufficient cohort. No raw records, identifiers, target, public provider rate or guarantee are available.',
    };
  }
  const realized=eligible.map((row:any)=>Number(row.realized_savings));
  const confidence=eligible.filter((row:any)=>finite(row.confidence_after)).map((row:any)=>Number(row.confidence_after));
  const success=eligible.filter((row:any)=>row.success===true).length;
  const negative=eligible.filter((row:any)=>row.negative_knowledge===true||row.success===false).length;
  return {
    version:OUTCOME_CALIBRATION_VERSION,
    suppressed:false,
    n:eligible.length,
    minimum_cohort:MIN_OUTCOME_CALIBRATION_COHORT,
    aggregate:{
      currency:currency||null,
      median_realized_savings:Number(median(realized).toFixed(2)),
      success_rate:Number((success/eligible.length).toFixed(4)),
      negative_outcome_rate:Number((negative/eligible.length).toFixed(4)),
      median_confidence_after:confidence.length?Number(median(confidence).toFixed(4)):null,
    },
    truth_note:'Private aggregate advisory only. It is not a public provider rate, a negotiation target, a promise, or authority to accept terms. No merchant or outcome identifiers are returned.',
  };
}
