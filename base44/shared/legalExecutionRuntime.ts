import { ACTION_POLICIES, canExecuteAction, canonicalize, sha256Canonical } from './legalExecution.ts';
import { evaluateRegulatoryActivityRuntime } from './regulatoryRuntime.ts';
import { hashSnapshot } from './recoverAcceptance.ts';
import { requireCriticalOperation } from './criticalExecution.ts';

async function rows(svc:any,name:string,query:any,sort='-created_date',limit=100):Promise<any[]>{
  const entity=svc?.entities?.[name];
  return requireCriticalOperation(`legal_execution_${name}_authority_read`, async()=>{
    if(!entity?.filter)throw new Error(`entity_filter_unavailable:${name}`);
    return await entity.filter(query,sort,limit);
  });
}

function active(row:any,at:number){
  if(!row||row.active===false)return false;
  const from=row.effective_from?Date.parse(row.effective_from):-Infinity;
  const to=row.effective_to?Date.parse(row.effective_to):Infinity;
  return(!row.effective_from||Number.isFinite(from))&&(!row.effective_to||Number.isFinite(to))&&from<=at&&at<to;
}

function killSwitchMatches(row:any,input:any){
  if(row.active!==true)return false;
  const scope=String(row.scope_type||'global').toLowerCase();
  if(scope==='global')return true;
  if(['jurisdiction','jurisdiction_action'].includes(scope)&&row.jurisdiction!==input.market)return false;
  if(['action','jurisdiction_action'].includes(scope)&&row.requested_action!==input.requested_action)return false;
  if(scope==='merchant'&&String(row.merchant_id||'')!==String(input.merchant_id||''))return false;
  if(scope==='provider'&&String(row.provider_id||'')!==String(input.provider_id||''))return false;
  return['jurisdiction','action','jurisdiction_action','merchant','provider'].includes(scope);
}

async function contractFromMandate(mandate:any){
  if(!mandate?.acceptance_snapshot_json||!mandate?.acceptance_snapshot_hash)return null;
  const actual=await requireCriticalOperation('legal_execution_contract_hash',()=>hashSnapshot(mandate.acceptance_snapshot_json));
  return{
    id:mandate.contract_instance_id||`mandate:${mandate.id}`,
    status:mandate.status==='active'?'ACCEPTED':String(mandate.status||'').toUpperCase(),
    version:mandate.contract_pdf_template_version||mandate.document_version,
    document_hash:mandate.acceptance_snapshot_hash,
    hash_valid:actual===mandate.acceptance_snapshot_hash,
    effective_from:mandate.effective_from||mandate.signed_at,
    effective_to:mandate.effective_to,
  };
}

export function commercialLegalAction(thread:any,action:string){
  const engine=String(thread?.engine||'');
  if(engine==='merchant_acquisition')return'B2B_OUTREACH';
  if(engine==='partner_acquisition')return'PARTNER_OUTREACH';
  if(engine==='merchant_operations')return'MERCHANT_COMMUNICATION';
  if(['provider_negotiation','aggregate_procurement'].includes(engine)){
    if(['counterproposal','contract_request','provider_monetization_request'].includes(action))return'NEGOTIATE_PRICING';
    return'CONTACT_PROVIDER';
  }
  return'MERCHANT_COMMUNICATION';
}

/** Resolve P10/P11 and all authority evidence server-side, then write immutable evidence. */
export async function evaluateLegalExecution(svc:any,raw:any){
  const timestamp=raw.timestamp||new Date().toISOString();
  const at=Date.parse(timestamp);
  const requestedAction=String(raw.requested_action||'').toUpperCase();
  const actionPolicy=ACTION_POLICIES[requestedAction];
  const merchantId=String(raw.merchant_id||raw.brand_id||'');
  const brand=merchantId?await requireCriticalOperation('legal_execution_brand_read',()=>svc.entities.Brand.get(merchantId)):null;
  const market=String(raw.market||raw.jurisdiction||brand?.billing_country||brand?.country||'').toUpperCase();

  const p10:any=actionPolicy?await evaluateRegulatoryActivityRuntime(svc,{
    jurisdiction:market,activity:actionPolicy.regulatory_activity,
    brand_id:merchantId,actor_type:raw.actor?.id||raw.actor?.type||'legal_execution',
  }):{status:'NOT_EVALUATED',allowed:false,reason_code:'unknown_action'};

  const legalRows=await rows(svc,'LegalExecutionPolicy',{jurisdiction:market,requested_action:requestedAction,active:true},'-effective_from',50);
  const approved=legalRows.filter((x:any)=>['APPROVED_FOR_POLICY','COUNSEL_APPROVED'].includes(String(x.review_status||'').toUpperCase())&&active(x,at));
  const p11=approved[0]||{status:'LEGAL_REVIEW_REQUIRED',confidence:'COUNSEL_REQUIRED',counsel_required:true,active:true,conditions:[]};
  const policyConflict=new Set(approved.map((x:any)=>String(x.status))).size>1;

  let mandate=raw.mandate_id?await requireCriticalOperation('legal_execution_mandate_read',()=>svc.entities.Mandate.get(String(raw.mandate_id))):null;
  if(!mandate&&raw.deal_activation_id){const found=await rows(svc,'Mandate',{deal_activation_id:String(raw.deal_activation_id),status:'active'},'-signed_at',5);mandate=found[0]||null;}
  if(!mandate&&merchantId){const found=await rows(svc,'Mandate',{brand_id:merchantId,status:'active'},'-signed_at',5);mandate=found[0]||null;}
  const grants=mandate?.id?await rows(svc,'MandateAuthorityGrant',{mandate_id:mandate.id,active:true},'-created_date',250):[];
  const restrictions=mandate?.id?await rows(svc,'MandateAuthorityRestriction',{mandate_id:mandate.id,active:true},'-created_date',250):[];
  const contract=await contractFromMandate(mandate);

  let approval=raw.approval_id?await requireCriticalOperation('legal_execution_approval_read',()=>svc.entities.Approval.get(String(raw.approval_id))):null;
  if(approval)approval={...approval,status:String(approval.status||'').toUpperCase(),action:approval.requested_action||approval.action_type,assurance_level:String(approval.assurance_level||'').toUpperCase()};
  const signature=mandate?.signed_at?{
    id:mandate.signature_evidence_id||null,level:'SIMPLE_E_SIGNATURE',
    evidence_valid:Boolean(mandate.authenticated_at&&mandate.signed_by_email&&mandate.acceptance_snapshot_hash),
    document_hash_valid:contract?.hash_valid===true,
    signer_capacity_verified:mandate.signer_capacity_status==='verified',
    signer_capacity_status:mandate.signer_capacity_status||'unverified',
  }:null;
  const switches=await rows(svc,'LegalKillSwitch',{active:true},'-created_date',250);
  const killSwitch=switches.find((x:any)=>killSwitchMatches(x,{market,requested_action:requestedAction,merchant_id:merchantId,provider_id:raw.provider_id}))||null;

  const input={
    requested_action:requestedAction,market,timestamp,merchant_id:merchantId,
    provider_id:raw.provider_id||mandate?.provider_id||null,case_id:raw.case_id||raw.deal_activation_id||null,
    material_payload_hash:raw.material_payload_hash||null,
    regulatory_state:{...p10,policy_version:p10.policy_version,conditions:p10.conditions||[]},
    legal_policy:p11,policy_conflict:policyConflict,kill_switch:killSwitch,
    emergency_state:raw.emergency_state||null,actor:raw.actor,
    mandate,authority_grants:grants,authority_restrictions:restrictions,
    contract_instance:contract,approval,signature_state:signature,
  };
  let result=canExecuteAction(input);
  const snapshot={
    merchant_id:merchantId,market,requested_action:requestedAction,provider_id:input.provider_id,case_id:input.case_id,
    p10:{status:p10.status,version:p10.policy_version,reason_code:p10.reason_code},
    p11:{decision:result.decision,policy_version:result.policy_version,reason_codes:result.reason_codes},
    contract:{id:contract?.id||null,version:result.contract_version,hash:contract?.document_hash||null},
    mandate:{id:mandate?.id||null,version:result.mandate_version,authority_source:result.authority_source},
    approval:{id:approval?.id||null,payload_hash:approval?.payload_hash||null},
    actor:{id:raw.actor?.id||null,type:raw.actor?.type||null,tool:raw.actor?.tool||null},evaluated_at:result.decision_timestamp,
  };
  const snapshotHash=await sha256Canonical(snapshot);
  let snapshotRow:any=null;
  try{
    snapshotRow=await svc.entities.AuthoritySnapshot.create({merchant_id:merchantId||'_platform',requested_action:requestedAction,snapshot_json:snapshot,snapshot_hash:snapshotHash,decision:result.decision,created_at:result.decision_timestamp,immutable:true});
    await svc.entities.LegalExecutionDecision.create({
      decision_key:`${snapshotHash}:${result.decision}`,merchant_id:merchantId||'_platform',jurisdiction:market,requested_action:requestedAction,
      provider_id:input.provider_id||'',case_id:input.case_id||'',decision:result.decision,allowed:result.allowed,
      reason_codes:result.reason_codes,missing_requirements:result.missing_requirements,conditions:result.conditions,
      policy_version:result.policy_version||'',regulatory_policy_version:result.regulatory_policy_version||'',
      mandate_version:result.mandate_version||'',contract_version:result.contract_version||'',authority_snapshot_id:snapshotRow.id,
      actor_id:raw.actor?.id||'',actor_type:raw.actor?.type||'',evaluated_at:result.decision_timestamp,engine_version:result.engine_version,
    });
  }catch(error){
    if(result.allowed)result={...result,allowed:false,decision:'BLOCK',reason_codes:['AUDIT_PERSISTENCE_FAILED'],missing_requirements:['immutable legal execution audit storage']};
  }
  return{...result,authority_snapshot_id:snapshotRow?.id||null,authority_snapshot_hash:snapshotHash,canonical_snapshot:canonicalize(snapshot)};
}

export class LegalExecutionBlockedError extends Error{
  decision:any;
  constructor(decision:any){super(`legal_execution_${String(decision.decision||'blocked').toLowerCase()}`);this.name='LegalExecutionBlockedError';this.decision=decision;}
}

export async function enforceLegalExecution(svc:any,input:any){
  const result=await evaluateLegalExecution(svc,input);
  if(!result.allowed)throw new LegalExecutionBlockedError(result);
  return result;
}

export function legalBlockResponse(error:any){
  if(!(error instanceof LegalExecutionBlockedError))return null;
  return Response.json({ok:false,error:'legal_execution_not_authorized',decision:error.decision.decision,reason_codes:error.decision.reason_codes,missing_requirements:error.decision.missing_requirements,authority_snapshot_id:error.decision.authority_snapshot_id},{status:409});
}
