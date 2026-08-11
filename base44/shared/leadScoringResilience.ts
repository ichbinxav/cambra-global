import { deterministicMerchantOpportunity } from './merchantOpportunity.ts';

export type LeadModelStatus =
  | 'PARSED'
  | 'PARTIAL'
  | 'UNAVAILABLE_OR_UNPARSEABLE'
  | 'SKIPPED_DETERMINISTIC_ONLY';

function hasUsableEmail(value:any){
  const email=String(value||'').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function observedEvidence(signals:Record<string,any>){
  return Object.entries(signals||{})
    .filter(([,value])=>value!==null&&value!==undefined&&value!=='')
    .slice(0,4)
    .map(([key,value])=>`${key}=${String(value).slice(0,80)}`);
}

export function validLeadModelRow(row:any){
  return Boolean(row?.id&&typeof row?.score==='number'&&Number.isFinite(row.score));
}

export function buildResilientLeadScore(lead:any,row:any,status:LeadModelStatus){
  const det=deterministicMerchantOpportunity(lead);
  const useModel=(status==='PARSED'||status==='PARTIAL')&&validLeadModelRow(row);
  const llm=useModel?Math.max(0,Math.min(100,Math.round(row.score))):null;
  const weighted=useModel?Math.round(det.opportunity_score*0.7+(llm as number)*0.3):det.opportunity_score;
  const score=hasUsableEmail(lead?.contact_email)?weighted:Math.min(59,weighted);
  const evidence=observedEvidence(det.signals);
  const reasoning=useModel&&String(row?.reasoning||'').trim()
    ? String(row.reasoning).trim().slice(0,500)
    : `Deterministic evidence only${evidence.length?`: ${evidence.join(', ')}`:': insufficient structured signals'}; review before activation.`;
  const nextAction=useModel&&String(row?.next_action||'').trim()
    ? String(row.next_action).trim().slice(0,300)
    : hasUsableEmail(lead?.contact_email)
      ? 'Review deterministic evidence before commercial activation'
      : 'Find and verify a corporate email before outreach';
  return {
    id:lead.id,
    score,
    score_breakdown_json:{
      breakdown:det.breakdown,
      llm_breakdown:useModel?(row?.breakdown||null):null,
      reasoning,
      opportunity_score:det.opportunity_score,
      evidence_confidence:det.evidence_confidence,
      evidence_count:det.evidence_count,
      signals:det.signals,
      scoring_version:'merchant-opportunity-v2',
      model_status:useModel?'PARSED':status,
      weights:useModel?{deterministic:0.7,llm:0.3}:{deterministic:1,llm:0},
      email_cap_applied:!hasUsableEmail(lead?.contact_email)&&weighted>59,
    },
    next_action:nextAction,
    stage:'scored',
  };
}
