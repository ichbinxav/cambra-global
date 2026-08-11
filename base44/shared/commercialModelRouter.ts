import { reservePaidOperation, settlePaidOperation } from './costGovernance.ts';
import { extractAnthropicText } from './anthropicResponse.ts';

export type CambraModelTier='standard'|'high_reasoning';
export const CAMBRA_STANDARD_MODEL='claude-sonnet-5';
export const CAMBRA_OPUS_MODEL='claude-opus-5';
export function commercialNeedsHighReasoning(engine:string,text:string){
 const e=String(engine||''); const t=String(text||'').toLowerCase();
 if(e==='provider_negotiation') return true;
 return /(contract|legal|lawyer|security|breach|complaint|custom pricing|custom economics|minimum volume|termination|lock[- ]?in|strategic partnership|investor|press|migration|data disclosure|dpa|msa|indemn|liabilit)/i.test(t);
}
export async function callCambraClaude(prompt:string,opts:{tier?:CambraModelTier,maxTokens?:number,svc?:any,eventKey?:string,source?:string,relatedEntityType?:string,relatedEntityId?:string}={}){
 if(!opts.svc) throw new Error('cost_service_context_required');
 const key=Deno.env.get('ANTHROPIC_API_KEY'); if(!key) throw new Error('anthropic_not_configured');
 const standard=Deno.env.get('ANTHROPIC_STANDARD_MODEL')||CAMBRA_STANDARD_MODEL;
 const opus=Deno.env.get('ANTHROPIC_OPUS_MODEL')||CAMBRA_OPUS_MODEL;
 const requested=opts.tier==='high_reasoning'?opus:standard;
 const logicalKey=String(opts.eventKey||'unkeyed');
 const invoke=async(model:string,attempt:string)=>{const reservation=await reservePaidOperation(opts.svc,{event_key:`ai:${String(opts.source||'commercial_model_router')}:${logicalKey}:${attempt}:${crypto.randomUUID()}`,category:'ai',provider:'anthropic',source:String(opts.source||'commercialModelRouter'),related_entity_type:String(opts.relatedEntityType||''),related_entity_id:String(opts.relatedEntityId||'')});const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:opts.maxTokens||2200,messages:[{role:'user',content:prompt}]})});const d=await r.json().catch(()=>({}));await settlePaidOperation(opts.svc,reservation,{ok:r.ok,usage_json:{model,input_tokens:Number(d?.usage?.input_tokens||0),output_tokens:Number(d?.usage?.output_tokens||0)}});return {r,d,model}};
 let out=await invoke(requested,'primary');
 if(!out.r.ok && requested!==standard){ out=await invoke(standard,'fallback'); }
 if(!out.r.ok) throw new Error(`anthropic_failed:${out.r.status}`);
 return {text:extractAnthropicText(out.d),model:out.model};
}
