import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
// CAMP-C2 (2026-08-16): the handler body lives in campaignAdminCore.ts so
// behavior tests can invoke it without this Deno-only SDK specifier. This file
// stays the only trust boundary: client creation, auth resolution and body
// parsing happen here, nothing else.
import { handleCampaignAdminAction } from './campaignAdminCore.ts';

export { handleCampaignAdminAction };

export async function handleCommercialCampaignAdmin(req:Request){
  try{
    const base44=createClientFromRequest(req);let user:any;
    try{user=await base44.auth.me();}catch{return Response.json({ok:false,error:'authentication_unavailable'},{status:503});}
    let body:any;try{body=await req.json();}catch{return Response.json({ok:false,error:'invalid_json_body'},{status:400});}
    return await handleCampaignAdminAction(user,body,base44.asServiceRole);
  }catch(error:any){
    console.error('commercialCampaignAdmin failed',error);
    // AUDIT SEC-07 (2026-08-17): bounded error CODE only, never raw error.message.
    return Response.json({ok:false,error:String(error?.code||'commercial_campaign_admin_failed').slice(0,80)},{status:Number(error?.status||500)});
  }
}
