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
await positive('Discovery V2 capability registry','adminSummaries',{ action:'discovery_v2_capabilities' },(data)=>data?.ok===true&&String(data?.version||'').startsWith('discovery-source-capabilities-')&&data?.sources?.CAMBRA&&data?.filters?.MERCHANT);
await positive('Discovery V2 zero-cost plan','adminSummaries',{ action:'discovery_v2_plan',discovery_type:'MERCHANT',source_mode:'CAMBRA',target_count:25,hard_cap_minor:0,enrichment_policy:'NONE',filters:{ country:['FR'],industry:['ecommerce'] } },(data)=>data?.ok===true&&data?.plan?.selected_source==='CAMBRA'&&data?.plan?.cost?.estimated_minor===0&&data?.plan?.outbound_effect==='NONE');
await positive('Discovery V2 overview aggregate','adminSummaries',{ action:'discovery_v2_overview',period:'month' },(data)=>data?.ok===true&&Array.isArray(data?.kpis)&&data.kpis.length===12&&data?.budget&&data?.source_health);
await positive('Discovery Ask CAMBRA authenticated AI response','copilotChat',{ question:'Cuando salgan los leads, ¿podré añadirlos al pipeline o descartarlos?',pageTitle:'Discovery · MERCHANT Discovery results',pageDescription:'Capability-aware, evidence-first and cost-governed CAMBRA Discovery.',nextStep:'Review the results and choose Add to Growth or Reject.',discoveryContext:{ scope:'MERCHANT Discovery results',context:{ count:0,available_actions:['ADD_TO_GROWTH','REJECT'],outbound_effect:'NONE' } } },(data)=>typeof data?.answer==='string'&&data.answer.length>20&&data?.fallback!==true&&!data?.upstream_error);
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
