import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { providerSecretMatches } from '../../shared/inboundConversationProvider.ts';
import { processInstantlyProviderEvent } from '../../shared/outboundProviderEventProcessing.ts';

Deno.serve(async(req)=>{
  try{
    const secret=Deno.env.get('INSTANTLY_WEBHOOK_SECRET')||'';
    if(!secret)return Response.json({ok:false,error:'instantly_webhook_not_configured'},{status:503});
    const received=req.headers.get('x-cambra-instantly-secret')||'';
    if(!await providerSecretMatches(secret,received))return Response.json({ok:false,error:'invalid_webhook_secret'},{status:401});
    const raw=await req.json().catch(()=>null);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return Response.json({ok:false,error:'invalid_json_payload'},{status:400});
    const base44=createClientFromRequest(req);
    const result=await processInstantlyProviderEvent(base44.asServiceRole,raw);
    return Response.json(result,{status:result.ok?200:result.queued_retry?202:500});
  }catch(error:any){
    console.error('instantlyWebhook failed',String(error?.code||error?.message||'unknown'));
    return Response.json({ok:false,error:String(error?.code||error?.message||'instantly_webhook_failed').slice(0,160)},{status:Number(error?.status||500)});
  }
});
