import { reservePaidOperation, settlePaidOperation } from './costGovernance.ts';
import { extractAnthropicText } from './anthropicResponse.ts';
import { guardedEmergencyEffect, inheritEmergencyEpoch } from './operationalControl.ts';
import type { EmergencyCapability, EmergencyEpochClaim } from './operationalControl.ts';
import {
 assertObservedAnthropicEgressPolicy,
 COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED,
 COMMERCIAL_PROVIDER_INPUT_LIMITS,
 protectedAnthropicPurposeForSource,
 protectedCommercialReviewError,
 sanitizeCommercialEgress,
} from './commercialProtectedEgress.ts';
import type {
 ObservedAnthropicEgressPolicy,
 ProtectedAnthropicPurpose,
 ProtectedAnthropicSource,
} from './commercialProtectedEgress.ts';

export type CambraModelTier='standard'|'high_reasoning';
export type CambraClaudeAgentTaskEvidence={
 cost_record_refs:Array<{type:string;id:string}>;
 effect_refs:Array<{type:string;id:string}>;
 receipt_refs:Array<{type:string;id:string}>;
 reservation_started:boolean;
 reservation_persisted:boolean;
 settlement_persisted:boolean;
 reservation_ambiguous:boolean;
 pre_reservation_code:string|null;
 transport_started:boolean;
 transport_evidence_persisted:boolean;
 provider_http_status:number|null;
};
export const CAMBRA_STANDARD_MODEL='claude-sonnet-5';
export const CAMBRA_OPUS_MODEL='claude-opus-5';
const AGENT_TASK_SAFE_REF=/^[a-zA-Z0-9_][a-zA-Z0-9._:/-]{0,299}$/;
const ANTHROPIC_MESSAGE_RECEIPT=/^msg_[a-zA-Z0-9][a-zA-Z0-9_-]{7,199}$/;
const PROVABLY_REJECTED_BEFORE_COST_PERSISTENCE=new Set([
 'EMERGENCY_CONTROL_PAUSED',
 'EMERGENCY_CONTROL_EPOCH_INVALID',
 'COST_BUDGET_BLOCKED',
 'COST_BUDGET_EXCEEDED',
 'POSITIVE_COST_RESERVATION_REQUIRED',
 'COST_RESERVATION_CONCURRENCY_EXHAUSTED',
]);
function safeAgentTaskRef(value:any){
 return typeof value==='string'&&AGENT_TASK_SAFE_REF.test(value)?value:null;
}
function normalizedEvidenceRefs(value:any,kind:'cost'|'effect'|'receipt'){
 if(!Array.isArray(value)||value.length>10)return [];
 const normalized:Array<{type:string;id:string}>=[];
 for(const ref of value){
  const type=typeof ref?.type==='string'?ref.type:'';
  const id=safeAgentTaskRef(ref?.id);
  const valid=kind==='cost'
   ?type==='CostUsageEvent'&&Boolean(id)
   :kind==='receipt'
   ?type==='AnthropicMessage'&&typeof id==='string'&&ANTHROPIC_MESSAGE_RECEIPT.test(id)
   :(type==='AnthropicMessage'&&typeof id==='string'&&ANTHROPIC_MESSAGE_RECEIPT.test(id))||
     (type==='CostUsageEventTransport'&&Boolean(id));
  if(!valid||!id)return [];
  normalized.push({type,id});
 }
 return normalized;
}
function anthropicMessageReceiptId(value:any){
 return value?.type==='message'&&typeof value?.id==='string'&&
   ANTHROPIC_MESSAGE_RECEIPT.test(value.id)
  ?value.id
  :null;
}
function claudeEvidence(input:{reservation?:any;settledCostEvent?:any;reservationStarted?:boolean;reservationPersisted?:boolean;settlementPersisted?:boolean;reservationAmbiguous?:boolean;preReservationCode?:string|null;transportStarted?:boolean;providerReceiptId?:string|null;providerHttpStatus?:number|null}):CambraClaudeAgentTaskEvidence{
 const reservationPersisted=input.reservationPersisted===true&&Boolean(safeAgentTaskRef(input.reservation?.event?.id));
 const settlementPersisted=input.settlementPersisted===true&&Boolean(safeAgentTaskRef(input.settledCostEvent?.id));
 const costId=settlementPersisted
  ?safeAgentTaskRef(input.settledCostEvent?.id)
  :reservationPersisted
  ?safeAgentTaskRef(input.reservation?.event?.id)
  :null;
 const receiptId=typeof input.providerReceiptId==='string'&&
   ANTHROPIC_MESSAGE_RECEIPT.test(input.providerReceiptId)
  ?input.providerReceiptId
  :null;
 const transportEvidencePersisted=Boolean(settlementPersisted&&input.transportStarted===true);
 return {
  cost_record_refs:costId?[{type:'CostUsageEvent',id:costId}]:[],
  // A provider message id is direct evidence. When no provider id exists, the
  // settled cost row is usable only because its usage_json durably records
  // transport_started=true. The reservation alone never proves an effect.
  effect_refs:receiptId
   ?[{type:'AnthropicMessage',id:receiptId}]
   :transportEvidencePersisted&&costId
   ?[{type:'CostUsageEventTransport',id:costId}]
   :[],
  receipt_refs:receiptId?[{type:'AnthropicMessage',id:receiptId}]:[],
  reservation_started:input.reservationStarted===true,
  reservation_persisted:reservationPersisted,
  settlement_persisted:settlementPersisted,
  reservation_ambiguous:input.reservationAmbiguous===true,
  pre_reservation_code:input.preReservationCode&&AGENT_TASK_SAFE_REF.test(String(input.preReservationCode))
   ?String(input.preReservationCode)
   :null,
  transport_started:input.transportStarted===true,
  transport_evidence_persisted:transportEvidencePersisted,
  provider_http_status:input.providerHttpStatus!==null&&input.providerHttpStatus!==undefined&&Number.isInteger(Number(input.providerHttpStatus))
   ?Number(input.providerHttpStatus)
   :null,
 };
}
export function cambraClaudeAgentTaskEvidence(value:any):CambraClaudeAgentTaskEvidence{
 const evidence=value?.agent_task_evidence;
 return evidence&&typeof evidence==='object'
  ?{
   cost_record_refs:normalizedEvidenceRefs(evidence.cost_record_refs,'cost'),
   effect_refs:normalizedEvidenceRefs(evidence.effect_refs,'effect'),
   receipt_refs:normalizedEvidenceRefs(evidence.receipt_refs,'receipt'),
   reservation_started:evidence.reservation_started===true,
   reservation_persisted:evidence.reservation_persisted===true,
   settlement_persisted:evidence.settlement_persisted===true,
   reservation_ambiguous:evidence.reservation_ambiguous===true,
   pre_reservation_code:safeAgentTaskRef(evidence.pre_reservation_code),
   transport_started:evidence.transport_started===true,
   transport_evidence_persisted:evidence.transport_evidence_persisted===true,
   provider_http_status:evidence.provider_http_status!==null&&evidence.provider_http_status!==undefined&&Number.isInteger(Number(evidence.provider_http_status))?Number(evidence.provider_http_status):null,
  }
  :{cost_record_refs:[],effect_refs:[],receipt_refs:[],reservation_started:false,reservation_persisted:false,settlement_persisted:false,reservation_ambiguous:false,pre_reservation_code:null,transport_started:false,transport_evidence_persisted:false,provider_http_status:null};
}

function commercialRouterReviewError(code:string,evidence:CambraClaudeAgentTaskEvidence){
 return Object.assign(new Error(code.toLowerCase()),{
  code,
  status:409,
  review_required:true,
  automatic_retry_blocked:true,
  agent_task_evidence:evidence,
 });
}

function sameSettlementValue(observed:any,expected:any){
 if(observed===expected)return true;
 if(!observed||!expected||typeof observed!=='object'||typeof expected!=='object')return false;
 if(Array.isArray(observed)!==Array.isArray(expected))return false;
 if(Array.isArray(expected))return observed.length===expected.length&&expected.every((value,index)=>sameSettlementValue(observed[index],value));
 const expectedKeys=Object.keys(expected).sort();
 const observedKeys=Object.keys(observed).sort();
 return expectedKeys.length===observedKeys.length&&expectedKeys.every((key,index)=>key===observedKeys[index]&&sameSettlementValue(observed[key],expected[key]));
}

function reliableSettlementActual(input:any){
 return input?.reconciled===true&&
  input?.amount_quality==='PROVIDER_FINAL_RECEIPT'&&
  typeof input?.amount_minor==='number'&&
  Number.isSafeInteger(input.amount_minor)&&input.amount_minor>=0&&
  Boolean(String(input?.reconciliation_ref||'').trim());
}

function expectedSettlementStatus(input:any){
 return input?.ok===false?'FAILED':reliableSettlementActual(input)?'RECONCILED':'OBSERVED';
}

function expectedSettlementAmount(reservation:any,input:any){
 if(reliableSettlementActual(input))return input.amount_minor;
 if(input?.amount_quality==='PROVIDER_FINAL_RECEIPT')return reservation.event.amount_minor;
 return typeof input?.amount_minor==='number'&&Number.isSafeInteger(input.amount_minor)
  ?input.amount_minor
  :reservation.event.amount_minor;
}

function expectedSettlementUsage(reservation:any,input:any){
 const reliableActual=reliableSettlementActual(input);
 return {
  ...(reservation?.event?.usage_json||{}),
  ...(input?.usage_json||{}),
  ...(reliableActual?{reserved_amount_minor:reservation.event.amount_minor}:{}),
  amount_quality:reliableActual
   ?'PROVIDER_FINAL_RECEIPT'
   :input?.amount_quality==='PROVIDER_FINAL_RECEIPT'
   ?'CONSERVATIVE_RESERVATION'
   :input?.amount_quality||'CONSERVATIVE_RESERVATION',
  ...(reliableActual?{reconciliation_ref:String(input.reconciliation_ref).trim()}:{}),
 };
}

function canonicalIsoTimestamp(value:any){
 if(typeof value!=='string'||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))return null;
 const timestamp=Date.parse(value);
 if(!Number.isFinite(timestamp))return null;
 try{return new Date(timestamp).toISOString()===value?value:null;}catch{return null;}
}

function safeMinorAmount(value:any){
 return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
}

/** A settlement response is never a persistence receipt by itself. */
export async function settleCommercialPaidOperationAndVerify(svc:any,reservation:any,input:any){
 const expectedId=safeAgentTaskRef(reservation?.event?.id);
 const expectedEventKey=reservation?.event?.event_key;
 const reservationAmount=reservation?.event?.amount_minor;
 const reservationOccurredAt=canonicalIsoTimestamp(reservation?.event?.occurred_at);
 const expectedUsage=input?.usage_json;
 const expectedTransport=expectedUsage?.transport_started;
 const expectedReceipt=expectedUsage?.provider_receipt_id;
 const inputHasAmount=Object.prototype.hasOwnProperty.call(input||{},'amount_minor')&&input?.amount_minor!==undefined;
 if(!expectedId||typeof expectedEventKey!=='string'||!expectedEventKey||
  !safeMinorAmount(reservationAmount)||!reservationOccurredAt||
  (inputHasAmount&&!safeMinorAmount(input.amount_minor))||
  typeof expectedUsage!=='object'||expectedUsage===null||Array.isArray(expectedUsage)||
  typeof expectedTransport!=='boolean'||
  !(expectedReceipt===null||
    (typeof expectedReceipt==='string'&&ANTHROPIC_MESSAGE_RECEIPT.test(expectedReceipt)))){
  throw commercialRouterReviewError('COST_SETTLEMENT_REVIEW_REQUIRED',claudeEvidence({reservation,reservationStarted:true,reservationPersisted:Boolean(expectedId),transportStarted:expectedTransport===true}));
 }
 const expectedAmount=expectedSettlementAmount(reservation,input);
 if(!safeMinorAmount(expectedAmount)){
  throw commercialRouterReviewError('COST_SETTLEMENT_REVIEW_REQUIRED',claudeEvidence({reservation,reservationStarted:true,reservationPersisted:true,transportStarted:expectedTransport===true}));
 }
 const returned=await settlePaidOperation(svc,reservation,input);
 const returnedCompletedAt=canonicalIsoTimestamp(returned?.completed_at);
 if(returned?.id!==expectedId||returned?.event_key!==expectedEventKey||
  returned?.status!==expectedSettlementStatus(input)||
  returned?.amount_minor!==expectedAmount||!returnedCompletedAt){
  throw commercialRouterReviewError('COST_SETTLEMENT_REVIEW_REQUIRED',claudeEvidence({reservation,reservationStarted:true,reservationPersisted:true,transportStarted:expectedTransport}));
 }
 let observed:any=null;
 try{
  observed=await svc.entities.CostUsageEvent.get(expectedId);
 }catch{
  throw commercialRouterReviewError('COST_SETTLEMENT_REVIEW_REQUIRED',claudeEvidence({reservation,reservationStarted:true,reservationPersisted:true,transportStarted:expectedTransport}));
 }
 const observedUsage=observed?.usage_json;
 const expectedPersistedUsage=expectedSettlementUsage(reservation,input);
 const exactUsage=sameSettlementValue(observedUsage,expectedPersistedUsage);
 const exactTransport=Object.prototype.hasOwnProperty.call(observedUsage||{},'transport_started')&&observedUsage.transport_started===expectedTransport;
 const exactReceipt=Object.prototype.hasOwnProperty.call(observedUsage||{},'provider_receipt_id')&&observedUsage.provider_receipt_id===expectedReceipt;
 const immutableFields=['category','provider','source','related_entity_type','related_entity_id','currency','budget_version','occurred_at'];
 const immutableProjectionExact=immutableFields.every((field)=>sameSettlementValue(observed?.[field],reservation?.event?.[field]));
 const completedAt=canonicalIsoTimestamp(observed?.completed_at);
 if(
  observed?.id!==expectedId||
  observed?.event_key!==expectedEventKey||
  observed?.status!==expectedSettlementStatus(input)||
  !safeMinorAmount(observed?.amount_minor)||observed.amount_minor!==expectedAmount||
  !immutableProjectionExact||!exactUsage||!exactTransport||!exactReceipt||
  !completedAt||completedAt!==returnedCompletedAt||completedAt<reservationOccurredAt
 ){
  throw commercialRouterReviewError('COST_SETTLEMENT_REVIEW_REQUIRED',claudeEvidence({reservation,reservationStarted:true,reservationPersisted:true,transportStarted:expectedTransport}));
 }
 return observed;
}

function preReservationError(error:any,code:string){
 const target=error&&typeof error==='object'?error:new Error(code.toLowerCase());
 target.agent_task_evidence=claudeEvidence({preReservationCode:code});
 return target;
}
export function commercialNeedsHighReasoning(engine:string,text:string){
 const e=String(engine||''); const t=String(text||'').toLowerCase();
 if(e==='provider_negotiation') return true;
 return /(contract|legal|lawyer|security|breach|complaint|custom pricing|custom economics|minimum volume|termination|lock[- ]?in|strategic partnership|investor|press|migration|data disclosure|dpa|msa|indemn|liabilit)/i.test(t);
}
export async function callCambraClaude(prompt:string,opts:{tier?:CambraModelTier,maxTokens?:number,svc?:any,eventKey?:string,source?:string,relatedEntityType?:string,relatedEntityId?:string,emergencyEpochClaim?:EmergencyEpochClaim,emergencyCapabilities?:EmergencyCapability|EmergencyCapability[],protectedEgress?:{purpose:ProtectedAnthropicPurpose;policy:ObservedAnthropicEgressPolicy}}={}){
 const protectedPurpose=protectedAnthropicPurposeForSource(opts.source);
 let providerPrompt=prompt;
 if(protectedPurpose){
 const protectedSource=String(opts.source) as ProtectedAnthropicSource;
  if(opts.protectedEgress?.purpose!==protectedPurpose){
   throw preReservationError(protectedCommercialReviewError('COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED'),'COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED');
  }
  try{
   assertObservedAnthropicEgressPolicy(protectedSource,protectedPurpose,opts.protectedEgress?.policy);
  }catch(error){
   throw preReservationError(error,'COMMERCIAL_ANTHROPIC_EGRESS_POLICY_REVIEW_REQUIRED');
  }
  const sanitizedPrompt=sanitizeCommercialEgress(prompt,COMMERCIAL_PROVIDER_INPUT_LIMITS);
  if(!sanitizedPrompt.ok||typeof sanitizedPrompt.value!=='string'){
   throw preReservationError(protectedCommercialReviewError(COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED),COMMERCIAL_EGRESS_INPUT_REVIEW_REQUIRED);
  }
  providerPrompt=sanitizedPrompt.value;
 }
 if(!opts.svc) throw preReservationError(new Error('cost_service_context_required'),'COST_SERVICE_CONTEXT_REQUIRED');
 const key=Deno.env.get('ANTHROPIC_API_KEY'); if(!key) throw preReservationError(new Error('anthropic_not_configured'),'ANTHROPIC_NOT_CONFIGURED');
 const standard=Deno.env.get('ANTHROPIC_STANDARD_MODEL')||CAMBRA_STANDARD_MODEL;
 const opus=Deno.env.get('ANTHROPIC_OPUS_MODEL')||CAMBRA_OPUS_MODEL;
 const requested=opts.tier==='high_reasoning'?opus:standard;
 const logicalKey=String(opts.eventKey||'unkeyed');
 const explicitCapabilities=opts.emergencyCapabilities
  ?(Array.isArray(opts.emergencyCapabilities)?opts.emergencyCapabilities:[opts.emergencyCapabilities])
  :[];
 if((opts.emergencyEpochClaim&&!explicitCapabilities.length)||(!opts.emergencyEpochClaim&&explicitCapabilities.length)){
  throw preReservationError(Object.assign(new Error('negotiation_emergency_epoch_binding_incomplete'),{code:'EMERGENCY_CONTROL_EPOCH_INVALID'}),'EMERGENCY_CONTROL_EPOCH_INVALID');
 }
 let boundEpoch:any=null;
 try{
  boundEpoch=opts.emergencyEpochClaim&&explicitCapabilities.length
   ?await inheritEmergencyEpoch(opts.svc,opts.emergencyEpochClaim,explicitCapabilities)
   :null;
 }catch(error){
  throw preReservationError(error,'EMERGENCY_CONTROL_EPOCH_INVALID');
 }
 const invoke=async(model:string,attempt:string)=>{
  let reservation:any=null;
  let reservationStarted=false;
  let reservationPersisted=false;
  let reservationAmbiguous=false;
  let settlementPersisted=false;
  const transport={started:false as boolean};
  let providerReceiptId:string|null=null;
  let providerHttpStatus:number|null=null;
  let settledCostEvent:any=null;
  try{
   reservationStarted=true;
   reservation=await reservePaidOperation(opts.svc,{event_key:`ai:${String(opts.source||'commercial_model_router')}:${logicalKey}:${attempt}:${crypto.randomUUID()}`,category:'ai',provider:'anthropic',source:String(opts.source||'commercialModelRouter'),related_entity_type:String(opts.relatedEntityType||''),related_entity_id:String(opts.relatedEntityId||'')});
   reservationPersisted=Boolean(safeAgentTaskRef(reservation?.event?.id));
   if(!reservationPersisted){
    reservationAmbiguous=true;
    throw commercialRouterReviewError('COST_RESERVATION_REVIEW_REQUIRED',claudeEvidence({reservationStarted,reservationPersisted,reservationAmbiguous}));
   }
   const effect=()=>{
    // Re-observe the exact deployment evidence after every asynchronous
    // reservation step and immediately before the transport boundary.
    if(protectedPurpose){
     assertObservedAnthropicEgressPolicy(String(opts.source) as ProtectedAnthropicSource,protectedPurpose,opts.protectedEgress?.policy);
    }
    transport.started=true;
    return fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:opts.maxTokens||2200,messages:[{role:'user',content:providerPrompt}]})});
   };
   const r=boundEpoch
    ?await guardedEmergencyEffect(opts.svc,{claim:boundEpoch,effect_key:`anthropic_negotiation:${String(opts.source||'commercialModelRouter')}:${logicalKey}:${attempt}`,effect})
    :await effect();
   providerHttpStatus=r.status;
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
    settledCostEvent=await settleCommercialPaidOperationAndVerify(opts.svc,reservation,{ok:false,usage_json:{model,input_tokens:Number(d?.usage?.input_tokens||0),output_tokens:Number(d?.usage?.output_tokens||0),emergency_epoch_bound:boundEpoch!==null,transport_started:true,provider_receipt_id:providerReceiptId,ambiguity_state:'REVIEW_REQUIRED',automatic_retry_blocked:true,provider_http_status:r.status}});
    settlementPersisted=true;
    throw Object.assign(commercialRouterReviewError('PROVIDER_EFFECT_REVIEW_REQUIRED',claudeEvidence({reservation,settledCostEvent,reservationStarted,reservationPersisted,settlementPersisted,transportStarted:true,providerReceiptId,providerHttpStatus})),{settled:true});
   }
   providerReceiptId=anthropicMessageReceiptId(d);
   if(!providerReceiptId){
    settledCostEvent=await settleCommercialPaidOperationAndVerify(opts.svc,reservation,{ok:false,usage_json:{model,input_tokens:Number(d?.usage?.input_tokens||0),output_tokens:Number(d?.usage?.output_tokens||0),emergency_epoch_bound:boundEpoch!==null,transport_started:true,provider_receipt_id:null,ambiguity_state:'REVIEW_REQUIRED',automatic_retry_blocked:true,provider_http_status:r.status,provider_receipt_valid:false}});
    settlementPersisted=true;
    throw Object.assign(commercialRouterReviewError('PROVIDER_RECEIPT_REVIEW_REQUIRED',claudeEvidence({reservation,settledCostEvent,reservationStarted,reservationPersisted,settlementPersisted,transportStarted:true,providerHttpStatus})),{settled:true});
   }
   const rawText=extractAnthropicText(d);
   if(!rawText){
    settledCostEvent=await settleCommercialPaidOperationAndVerify(opts.svc,reservation,{ok:false,usage_json:{model,input_tokens:Number(d?.usage?.input_tokens||0),output_tokens:Number(d?.usage?.output_tokens||0),emergency_epoch_bound:boundEpoch!==null,transport_started:true,provider_receipt_id:providerReceiptId,ambiguity_state:'REVIEW_REQUIRED',automatic_retry_blocked:true,provider_http_status:r.status,provider_output_valid:false}});
    settlementPersisted=true;
    throw Object.assign(commercialRouterReviewError('PROVIDER_OUTPUT_REVIEW_REQUIRED',claudeEvidence({reservation,settledCostEvent,reservationStarted,reservationPersisted,settlementPersisted,transportStarted:true,providerReceiptId,providerHttpStatus})),{settled:true});
   }
   settledCostEvent=await settleCommercialPaidOperationAndVerify(opts.svc,reservation,{ok:true,usage_json:{model,input_tokens:Number(d?.usage?.input_tokens||0),output_tokens:Number(d?.usage?.output_tokens||0),emergency_epoch_bound:boundEpoch!==null,transport_started:true,provider_receipt_id:providerReceiptId}});
   settlementPersisted=true;
   // Each protected handler parses first, then sanitizes the structured model
   // output with requireSanitizedCommercialOutput before any persistence.
   // Rewriting raw JSON text here can invalidate escaped code snippets.
   return {text:rawText,model,agent_task_evidence:claudeEvidence({reservation,settledCostEvent,reservationStarted,reservationPersisted,settlementPersisted,transportStarted:true,providerReceiptId,providerHttpStatus})};
  }catch(error:any){
   if(error?.settled===true)throw error;
   if(reservationStarted&&!reservationPersisted){
    const stableCode=String(error?.code||'').trim().toUpperCase();
    if(PROVABLY_REJECTED_BEFORE_COST_PERSISTENCE.has(stableCode)){
     // These codes are emitted before the reservation CAS/persist phase. The
     // call entered the guard, but no mutable reservation operation started.
     error.agent_task_evidence=claudeEvidence({reservationStarted:false,reservationPersisted:false,reservationAmbiguous:false,preReservationCode:stableCode,transportStarted:false});
     throw error;
    }
    reservationAmbiguous=true;
    const reservationError=commercialRouterReviewError('COST_RESERVATION_REVIEW_REQUIRED',claudeEvidence({reservationStarted,reservationPersisted:false,reservationAmbiguous:true,transportStarted:false}));
    throw reservationError;
   }
   const reviewRequired=transport.started===true;
   const reviewError:any=reviewRequired
    ?commercialRouterReviewError(error?.code==='EMERGENCY_EFFECT_AMBIGUOUS'?'EMERGENCY_EFFECT_AMBIGUOUS':'PROVIDER_EFFECT_REVIEW_REQUIRED',claudeEvidence({reservation,settledCostEvent,reservationStarted,reservationPersisted,settlementPersisted,transportStarted:true,providerReceiptId,providerHttpStatus}))
    :error;
   try{
    settledCostEvent=await settleCommercialPaidOperationAndVerify(opts.svc,reservation,{ok:false,usage_json:{model,emergency_epoch_bound:boundEpoch!==null,transport_started:transport.started===true,provider_receipt_id:providerReceiptId,provider_http_status:providerHttpStatus,ambiguity_state:reviewRequired?'REVIEW_REQUIRED':null,automatic_retry_blocked:reviewRequired}});
    settlementPersisted=true;
   }catch{
    reviewError.review_persistence_failed=true;
    reviewError.review_persistence_code='cost_settlement_review_required';
   }
   reviewError.agent_task_evidence=claudeEvidence({reservation,settledCostEvent,reservationStarted,reservationPersisted,settlementPersisted,transportStarted:transport.started,providerReceiptId,providerHttpStatus});
   if(!settlementPersisted&&Number(reviewError?.status)!==409){
    const settlementError:any=commercialRouterReviewError('COST_SETTLEMENT_REVIEW_REQUIRED',reviewError.agent_task_evidence);
    settlementError.review_persistence_failed=true;
    settlementError.review_persistence_code='cost_settlement_review_required';
    throw settlementError;
   }
   throw reviewError;
  }
 };
 const out=await invoke(requested,'primary');
 // A non-2xx response is still post-transport. Anthropic exposes no
 // reconciliation guarantee for this request, so there is no model fallback.
 return out;
}
