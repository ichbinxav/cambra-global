export type CambraModelTier='standard'|'high_reasoning';
export const CAMBRA_STANDARD_MODEL='claude-sonnet-5';
export const CAMBRA_OPUS_MODEL='claude-opus-5';
export function commercialNeedsHighReasoning(engine:string,text:string){
 const e=String(engine||''); const t=String(text||'').toLowerCase();
 if(e==='provider_negotiation') return true;
 return /(contract|legal|lawyer|security|breach|complaint|custom pricing|custom economics|minimum volume|termination|lock[- ]?in|strategic partnership|investor|press|migration|data disclosure|dpa|msa|indemn|liabilit)/i.test(t);
}
export async function callCambraClaude(prompt:string,opts:{tier?:CambraModelTier,maxTokens?:number}={}){
 const key=Deno.env.get('ANTHROPIC_API_KEY'); if(!key) throw new Error('anthropic_not_configured');
 const standard=Deno.env.get('ANTHROPIC_STANDARD_MODEL')||CAMBRA_STANDARD_MODEL;
 const opus=Deno.env.get('ANTHROPIC_OPUS_MODEL')||CAMBRA_OPUS_MODEL;
 const requested=opts.tier==='high_reasoning'?opus:standard;
 const invoke=async(model:string)=>{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},body:JSON.stringify({model,max_tokens:opts.maxTokens||2200,messages:[{role:'user',content:prompt}]})});const d=await r.json().catch(()=>({}));return {r,d,model}};
 let out=await invoke(requested);
 if(!out.r.ok && requested!==standard){ out=await invoke(standard); }
 if(!out.r.ok) throw new Error(`anthropic_failed:${out.r.status}`);
 return {text:String(out.d?.content?.[0]?.text||''),model:out.model};
}
