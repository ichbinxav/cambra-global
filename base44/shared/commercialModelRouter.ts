import { reservePaidOperation, settlePaidOperation } from './costGovernance.ts';
import { extractAnthropicText } from './anthropicResponse.ts';
import { guardedEmergencyEffect, inheritEmergencyEpoch } from './operationalControl.ts';
import type { EmergencyCapability, EmergencyEpochClaim } from './operationalControl.ts';

export type CambraModelTier='standard'|'high_reasoning';
export const CAMBRA_STANDARD_MODEL='claude-sonnet-5';
export const CAMBRA_OPUS_MODEL='claude-opus-5';
export function commercialNeedsHighReasoning(engine:string,text:string){
 const e=String(engine||''); const t=String(text||'').toLowerCase();
 if(e==='provider_negotiation') return true;
 return /(contract|legal|lawyer|security|breach|complaint|custom pricing|custom economics|minimum volume|termination|lock[- ]?in|strategic partnership|investor|press|migration|data disclosure|dpa|msa|indemn|liabilit)/i.test(t);
}
export async function callCambraClaude(prompt:string,opts:{tier?:CambraModelTier,maxTokens?:number,svc?:any,eventKey?:string,source?:string,relatedEntityType?:string,relatedEntityId?:string,emergencyEpochClaim?:EmergencyEpochClaim,emergencyCapabilities?:EmergencyCapability|EmergencyCapability[]}={}){
 if(!opts.svc) throw new Error('cost_service_context_required');
 const key=Deno.env.get('ANTHROPIC_API_KEY'); if(!key) throw new Error('anthropic_not_configured');
 const standard=Deno.env.get('ANTHROPIC_STANDARD_MODEL')||CAMBRA_STANDARD_MODEL;
 const opus=Deno.env.get('ANTHROPIC_OPUS_MODEL')||CAMBRA_OPUS_MODEL;
 const requested=opts.tier==='high_reasoning'?opus:standard;
 const logicalKey=String(opts.eventKey||'unkeyed');
 const explicitCapabilities=opts.emergencyCapabilities
  ?(Array.isArray(opts.emergencyCapabilities)?opts.emergencyCapabilities:[opts.emergencyCapabilities])
  :[];
 if((opts.emergencyEpochClaim&&!explicitCapabilities.length)||(!opts.emergencyEpochClaim&&explicitCapabilities.length)){
  throw Object.assign(new Error('negotiation_emergency_epoch_binding_incomplete'),{code:'EMERGENCY_CONTROL_EPOCH_INVALID'});
 }
 const boundEpoch=opts.emergencyEpochClaim&&explicitCapabilities.length
  ?await inheritEmergencyEpoch(opts.svc,opts.emergencyEpochClaim,explicitCapabilities)
  :null;
 const invoke=async(model:string,attempt:string)=>{
  const reservation=await reservePaidOperation(opts.svc,{event_key:`ai:${String(opts.source||'commercial_model_router')}:${logicalKey}:${attempt}:${crypto.randomUUID()}`,category:'ai',provider:'anthropic',source:String(opts.source||'commercialModelRouter'),related_entity_type:String(opts.relatedEntityType||''),related_entity_id:String(opts.relatedEntityId||'')});
  const transport={started:false as boolean};
  try{
   const effect=()=>{transport.started=true;return fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:opts.maxTokens||2200,messages:[{role:'user',content:prompt}]})})};
   const r=boundEpoch
    ?await guardedEmergencyEffect(opts.svc,{claim:boundEpoch,effect_key:`anthropic_negotiation:${String(opts.source||'commercialModelRouter')}:${logicalKey}:${attempt}`,effect})
    :await effect();
   const d=await r.json().catch(()=>({}));
   if(!r.ok){
    await settlePaidOperation(opts.svc,reservation,{ok:false,usage_json:{model,input_tokens:Number(d?.usage?.input_tokens||0),output_tokens:Number(d?.usage?.output_tokens||0),emergency_epoch_bound:boundEpoch!==null,ambiguity_state:'REVIEW_REQUIRED',automatic_retry_blocked:true,provider_http_status:r.status}});
    throw Object.assign(new Error(`anthropic_effect_unknown:${r.status}`),{code:'PROVIDER_EFFECT_REVIEW_REQUIRED',status:409,review_required:true,automatic_retry_blocked:true,settled:true});
   }
   const text=extractAnthropicText(d);
   if(!text)throw new Error('anthropic_response_text_unverified');
   await settlePaidOperation(opts.svc,reservation,{ok:true,usage_json:{model,input_tokens:Number(d?.usage?.input_tokens||0),output_tokens:Number(d?.usage?.output_tokens||0),emergency_epoch_bound:boundEpoch!==null}});
   return {text,model};
  }catch(error:any){
   if(error?.settled===true)throw error;
   const reviewRequired=transport.started===true;
   const reviewError:any=reviewRequired
    ?Object.assign(new Error('anthropic_effect_unknown_review_required'),{code:error?.code==='EMERGENCY_EFFECT_AMBIGUOUS'?'EMERGENCY_EFFECT_AMBIGUOUS':'PROVIDER_EFFECT_REVIEW_REQUIRED',status:409,review_required:true,automatic_retry_blocked:true,cause:error,effect_key:error?.effect_key||`anthropic:${logicalKey}:${attempt}`})
    :error;
   try{
    await settlePaidOperation(opts.svc,reservation,{ok:false,usage_json:{model,emergency_epoch_bound:boundEpoch!==null,ambiguity_state:reviewRequired?'REVIEW_REQUIRED':null,automatic_retry_blocked:reviewRequired}});
   }catch(settlementError){
    reviewError.review_persistence_failed=true;
    reviewError.review_persistence_error=String((settlementError as any)?.code||(settlementError as any)?.message||settlementError).slice(0,160);
   }
   throw reviewError;
  }
 };
 const out=await invoke(requested,'primary');
 // A non-2xx response is still post-transport. Anthropic exposes no
 // reconciliation guarantee for this request, so there is no model fallback.
 return out;
}
