export const RATE_LIMIT_VERSION='rate-limit-cas-v1.0.0';
export const RATE_LIMIT_MAX_CAS_ATTEMPTS=6;

function updatedExactlyOne(result:any){return Boolean(result&&(result.updated===1||result.modified_count===1||result.matched_count===1));}
export function rateLimitWindow(windowSeconds:number,at=new Date()){
  const seconds=Math.max(1,Math.floor(Number(windowSeconds)||60)),startMs=Math.floor(at.getTime()/(seconds*1000))*seconds*1000;
  return{window_start:new Date(startMs).toISOString(),reset:new Date(startMs+seconds*1000).toISOString(),retry_after_seconds:Math.max(1,Math.ceil((startMs+seconds*1000-at.getTime())/1000))};
}

/**
 * Concurrency-safe even if a missing bucket is created twice: total usage is
 * the sum of every matching row; established rows are incremented with CAS.
 * At a boundary, only one contender can increment a given count revision and
 * losers must reread the aggregate before being allowed.
 */
export async function consumeRateLimit(svc:any,input:{principal_id:string;principal_type?:'api_key'|'oauth_token'|'ip';limit:number;window_seconds:number;at?:Date}){
  const principalId=String(input.principal_id||'').trim(),limit=Math.floor(Number(input.limit)),windowSeconds=Math.floor(Number(input.window_seconds));
  if(!principalId||!Number.isInteger(limit)||limit<=0||!Number.isInteger(windowSeconds)||windowSeconds<=0)return{ok:false,remaining:0,limit:Number.isInteger(limit)?limit:0,reset:null,retry_after_seconds:windowSeconds||60,reason:'invalid_rate_limit_configuration'};
  const at=input.at||new Date(),window=rateLimitWindow(windowSeconds,at);
  for(let attempt=1;attempt<=RATE_LIMIT_MAX_CAS_ATTEMPTS;attempt++){
    const rows=await svc.entities.RateLimitCounter.filter({principal_id:principalId,window_start:window.window_start},'created_date',100).catch(()=>null);
    if(!Array.isArray(rows))return{ok:false,remaining:0,limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,reason:'rate_limit_store_unavailable'};
    const total=rows.reduce((sum:number,row:any)=>sum+Math.max(0,Number(row.count||0)),0);
    if(total>=limit)return{ok:false,remaining:0,limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,reason:'rate_limited'};
    if(rows.length===0){
      try{await svc.entities.RateLimitCounter.create({principal_id:principalId,principal_type:input.principal_type||'ip',window_start:window.window_start,count:1,limit_per_minute:limit,window_seconds:windowSeconds});return{ok:true,remaining:Math.max(0,limit-1),limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,version:RATE_LIMIT_VERSION};}catch{continue}
    }
    const target=[...rows].sort((a:any,b:any)=>String(a.created_date||'').localeCompare(String(b.created_date||''))||String(a.id).localeCompare(String(b.id)))[0];const oldCount=Math.max(0,Number(target.count||0));
    const changed=await svc.entities.RateLimitCounter.updateMany({id:target.id,window_start:window.window_start,count:oldCount},{$set:{count:oldCount+1,limit_per_minute:limit,window_seconds:windowSeconds}}).catch(()=>null);
    if(updatedExactlyOne(changed))return{ok:true,remaining:Math.max(0,limit-total-1),limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,version:RATE_LIMIT_VERSION};
  }
  return{ok:false,remaining:0,limit,reset:window.reset,retry_after_seconds:window.retry_after_seconds,reason:'rate_limit_concurrency_exhausted'};
}
