type SmokeResult = { name:string; pass:boolean; detail:any };

async function invoke(name:string, payload:any) {
  try {
    const response = await base44.functions.invoke(name, payload);
    let data=response?.data ?? response;
    for(let layer=0;layer<4&&typeof data==='string';layer++){
      const trimmed=data.trim();
      if(!trimmed.startsWith('{')&&!trimmed.startsWith('[')&&!trimmed.startsWith('"'))break;
      try{data=JSON.parse(trimmed);}catch{break;}
    }
    return { transport_ok:true, data };
  } catch (error:any) {
    return {
      transport_ok:false,
      status:Number(error?.status || error?.response?.status || error?.response?.statusCode || 0),
      data:error?.response?.data || error?.data || null,
      message:String(error?.message || error).slice(0,500),
    };
  }
}

const results:SmokeResult[] = [];
async function positive(name:string, functionName:string, payload:any, validate:(data:any)=>boolean) {
  const result:any = await invoke(functionName,payload);
  const pass = Boolean(result.transport_ok && validate(result.data));
  results.push({ name,pass,detail:{ transport_ok:result.transport_ok,status:result.status||200,response_keys:Object.keys(result.data||{}).sort(),error:result.data?.error||null } });
}
async function failClosed(name:string, functionName:string, payload:any) {
  const result:any = await invoke(functionName,payload);
  const data:any = result.data || {};
  const status = Number(result.status || data?.status || 0);
  const error = String(data?.error || result.message || '');
  const pass = !result.transport_ok && [400,401,403,409,503].includes(status) || result.transport_ok && data?.ok === false || /signature|webhook|forbidden|unauthorized/i.test(error);
  results.push({ name,pass:Boolean(pass),detail:{ transport_ok:result.transport_ok,status,error:error||null,response_keys:Object.keys(data||{}).sort() } });
}

await positive('admin logical search route','adminSummaries',{ action:'global_search',query:'__cambra_backend_smoke_no_match__',limit:3 },(data)=>data?.ok===true&&Array.isArray(data?.results));
await positive('commercial campaign logical route','adminSummaries',{ action:'campaign_list' },(data)=>data?.ok===true&&Array.isArray(data?.campaigns));
await positive('P1 physical market route','checkMarketCapability',{ jurisdiction:'FR',capability:'ANALYZE',enforce:false,actor_type:'base44_runtime_smoke' },(data)=>data?.ok===true&&typeof data?.allowed==='boolean');
await positive('P10 logical route','checkMarketCapability',{ action:'check_regulatory_activity',jurisdiction:'FR',activity:'ANALYSIS',actor_type:'base44_runtime_smoke' },(data)=>data?.ok===true&&data?.decision);
await positive('P3 physical rate route','rateIntelligenceQuery',{ action:'summary' },(data)=>data?.ok===true&&data?.metrics);
await positive('Europe growth logical route','getEuropeMarketsCommandCenter',{ view:'growth',action:'status' },(data)=>data?.ok===true&&data?.growth_path);
await positive('extractor capability boundary','getUploadCapability',{},(data)=>data?.ok===true&&data?.extraction_version==='document-extraction-2.0.0'&&typeof data?.extraction_live==='boolean');
await positive('founder emergency control read path','emergencyControlAdmin',{ action:'status' },(data)=>data?.ok===true&&data?.control);
await positive('outbound control logical status route','outboundControlAdmin',{ action:'status' },(data)=>data?.ok===true&&typeof data?.allowed==='boolean'&&data?.runtime&&data?.gates);
await failClosed('Stripe webhook rejects unsigned payload','stripeBillingWebhook',{ smoke:true });
await failClosed('public inbound webhook rejects unsigned payload','resendInboundWebhook',{ smoke:true });

const failed = results.filter((result)=>!result.pass);
console.log(JSON.stringify({ ok:failed.length===0,total:results.length,passed:results.length-failed.length,failed:failed.map((item)=>item.name),results },null,2));
if (failed.length) throw new Error(`Base44 runtime smoke failed: ${failed.map((item)=>item.name).join(', ')}`);
