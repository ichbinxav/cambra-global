import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { classifyHardStop, normalizeEmail, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';

function candidateIds(data:any){
  const values=[data?.id,data?.resourceData?.id,data?.resource_data?.id,data?.message?.id,data?.email?.id,data?.resource?.id];
  return Array.from(new Set(values.map((x:any)=>String(x||'').trim()).filter(Boolean)));
}

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);const body=await req.json().catch(()=>({}));const payload=body?.payload||{};
    if(payload?.event?.integration_type!=='outlook'||payload?.event?.type!=='created')return Response.json({ok:true,ignored:true});
    const svc=base44.asServiceRole;const conn=await svc.connectors.getConnection('outlook').catch(()=>({accessToken:null}));if(!conn?.accessToken)return Response.json({ok:false,error:'outlook_connector_required'},{status:503});
    const ids=candidateIds(payload?.data||{});if(!ids.length)return Response.json({ok:true,ignored:true,reason:'no_resource_id'});
    let msg:any=null;
    for(const id of ids){const r=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}?$select=id,conversationId,internetMessageId,subject,body,bodyPreview,from,toRecipients,receivedDateTime,isDraft,parentFolderId`,{headers:{Authorization:`Bearer ${conn.accessToken}`}});if(r.ok){msg=await r.json();break;}if(r.status!==404)throw new Error(`outlook_message_fetch_failed:${r.status}`);}
    if(!msg||msg.isDraft)return Response.json({ok:true,ignored:true,reason:'not_email_or_draft'});
    const meRes=await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:{Authorization:`Bearer ${conn.accessToken}`}});const me=await meRes.json().catch(()=>({}));const self=normalizeEmail(me.mail||me.userPrincipalName);const from=normalizeEmail(msg?.from?.emailAddress?.address);if(!from||from===self)return Response.json({ok:true,ignored:true,reason:'self_or_missing_sender'});
    const duplicate=await svc.entities.CommunicationMessage.filter({provider:'outlook',provider_message_id:String(msg.id)},'-created_date',1).catch(()=>[]);if(duplicate.length)return Response.json({ok:true,duplicate:true});
    let thread:any=null;if(msg.conversationId){const rows=await svc.entities.CommunicationThread.filter({external_thread_id:String(msg.conversationId)},'-last_message_at',5).catch(()=>[]);thread=rows.find((t:any)=>!['closed','suppressed'].includes(t.status))||rows[0]||null;}
    if(!thread){const rows=await svc.entities.CommunicationThread.filter({counterparty_email:from},'-last_message_at',20).catch(()=>[]);thread=rows.find((t:any)=>['open','awaiting_counterparty','awaiting_cambra','awaiting_approval'].includes(t.status))||null;}
    if(!thread){await svc.entities.OperationalLog.create({event_type:'outlook_inbound_unroutable',message:'Outlook email not associated with a CAMBRA commercial thread',data_json:{message_id:msg.id,conversation_id:msg.conversationId||null,from,subject:String(msg.subject||'').slice(0,200)},created_at:new Date().toISOString()}).catch(()=>null);return Response.json({ok:true,routed:false});}
    const now=new Date().toISOString();const text=sanitizeExternalText(msg?.body?.content||msg?.bodyPreview||'',12000);const hard=classifyHardStop(text||msg.subject||'');const row=await svc.entities.CommunicationMessage.create({thread_id:thread.id,direction:'inbound',channel:'email',provider:'outlook',provider_message_id:String(msg.id),internet_message_id:String(msg.internetMessageId||''),from_email:from,to_emails:Array.isArray(msg.toRecipients)?msg.toRecipients.map((r:any)=>normalizeEmail(r?.emailAddress?.address)).filter(Boolean):[],subject:sanitizeExternalText(msg.subject||'',300),text_body:text,classification:hard||null,send_status:'received',received_at:msg.receivedDateTime||now,raw_event_json:{conversation_id:msg.conversationId||null,automation_id:payload?.automation?.id||null}});
    await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_cambra',external_thread_id:msg.conversationId||thread.external_thread_id,last_inbound_at:msg.receivedDateTime||now,last_message_at:msg.receivedDateTime||now,counterparty_email:from});
    if(['unsubscribe','complaint'].includes(hard||'')){const existing=await svc.entities.ContactSuppression.filter({email:from,active:true},'-created_date',1).catch(()=>[]);if(!existing.length)await svc.entities.ContactSuppression.create({email:from,reason:hard==='unsubscribe'?'opt_out':'complaint',source:'outlook_inbound',source_message_id:row.id,active:true,suppressed_at:now});await svc.entities.CommunicationThread.update(thread.id,{status:'suppressed',automation_paused:true,pause_reason:hard});return Response.json({ok:true,routed:true,hard_stop:hard});}
    const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';const run=await svc.functions.invoke('commercialReplyAgent',{thread_id:thread.id,message_id:row.id,internal_secret:internal}).catch((e:any)=>({data:{ok:false,error:String(e?.message||e)}}));return Response.json({ok:true,routed:true,message_id:row.id,reply_processing:run?.data||run||null});
  }catch(error){console.error('outlookInboundRouter failed',error);return Response.json({ok:false,error:'outlook_inbound_processing_failed'},{status:500});}
});