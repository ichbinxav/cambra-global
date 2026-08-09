import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

Deno.serve(async(req)=>{try{
 const base44=createClientFromRequest(req);const user=await base44.auth.me().catch(()=>null);if(!user||user.role!=='admin')return Response.json({ok:false,error:'forbidden'},{status:403});const body=await req.json().catch(()=>({}));const id=String(body?.approval_id||'');const decision=String(body?.decision||'');if(!id||!['approve','reject'].includes(decision))return Response.json({ok:false,error:'approval_id_and_decision_required'},{status:400});const svc=base44.asServiceRole;const ap=await svc.entities.Approval.get(id).catch(()=>null);if(!ap)return Response.json({ok:false,error:'not_found'},{status:404});if(ap.status!=='pending')return Response.json({ok:false,error:'approval_not_pending',status:ap.status},{status:409});if(ap.expires_at&&Date.parse(ap.expires_at)<=Date.now()) {await svc.entities.Approval.update(ap.id,{status:'expired'});return Response.json({ok:false,error:'approval_expired'},{status:409});}
 const now=new Date().toISOString();
 if(decision==='reject'){
   await svc.entities.Approval.update(ap.id,{status:'rejected',approved_by:user.email,approved_at:now,rejected_reason:String(body?.reason||'')});
   if(ap.action_type==='final_provider_deal'){const c=await svc.entities.NegotiationCase.get(ap.related_entity_id).catch(()=>null);if(c)await svc.entities.NegotiationCase.update(c.id,{status:'negotiating',final_approval_id:null,next_action:'founder_rejected_or_counter'}).catch(()=>null);}
   await svc.entities.OperationalLog.create({event_type:'commercial_approval_rejected',message:ap.action_type,data_json:{approval_id:ap.id,related_entity_id:ap.related_entity_id,reason:body?.reason||null},actor_email:user.email,created_at:now}).catch(()=>null);
   return Response.json({ok:true,status:'rejected'});
 }

 if(ap.action_type==='final_provider_deal'){
   const c=await svc.entities.NegotiationCase.get(ap.related_entity_id).catch(()=>null);if(!c||c.final_approval_id!==ap.id)return Response.json({ok:false,error:'negotiation_approval_binding_mismatch'},{status:409});
   const payload=ap.draft_payload_json||{};const offer=await svc.entities.NegotiationOffer.get(String(payload.offer_id||'')).catch(()=>null);if(!offer||offer.negotiation_case_id!==c.id)return Response.json({ok:false,error:'offer_missing_or_changed'},{status:409});
   if(offer.valid_until&&Date.parse(offer.valid_until)<=Date.now())return Response.json({ok:false,error:'offer_expired_reapproval_required'},{status:409});
   const activation=await svc.entities.DealActivation.get(c.recover_id).catch(()=>null);if(!activation||!['authorized','migrating','live','monetizing'].includes(String(activation.status)))return Response.json({ok:false,error:'recover_no_longer_authorized'},{status:409});
   const mandates=await svc.entities.Mandate.filter({deal_activation_id:c.recover_id,status:'active'},'-signed_at',5).catch(()=>[]);const mandate=mandates[0];if(!mandate||String(mandate.id)!==String(c.authority_snapshot_json?.mandate_id||''))return Response.json({ok:false,error:'mandate_changed_reapproval_required'},{status:409});
   await svc.entities.Approval.update(ap.id,{status:'approved',approved_by:user.email,approved_at:now});
   await svc.entities.NegotiationCase.update(c.id,{status:'approved',approved_offer_id:offer.id,next_action:offer.material_commitment?'request_contract_and_verify':'request_written_confirmation_or_contract'});
   const thread=await svc.entities.CommunicationThread.get(c.thread_id).catch(()=>null);if(thread){await svc.entities.CommunicationThread.update(thread.id,{status:'open',automation_paused:false,pause_reason:null});const internal=Deno.env.get('INTERNAL_CALL_SECRET')||'';await svc.functions.invoke('commercialSendMessage',{thread_id:thread.id,action:'contract_request',classification:'clarification',subject:`Re: ${c.provider_name} commercial terms`,text:'Thanks. We have internal approval to proceed on the commercial basis discussed. Please send the final written agreement or pricing confirmation reflecting the exact agreed terms, including any term, minimum, termination, settlement and implementation conditions. CAMBRA Payments',agent_name:'provider_negotiation',idempotency_key:`post-approval-contract-request:${ap.id}`,internal_secret:internal}).catch(()=>null);}
   await svc.entities.OperationalLog.create({event_type:'final_provider_deal_approved',message:c.provider_name,data_json:{approval_id:ap.id,case_id:c.id,offer_id:offer.id,revalidated_at:now,contract_execution:false,migration_go_live:false},actor_email:user.email,created_at:now}).catch(()=>null);
   return Response.json({ok:true,status:'approved',case_id:c.id,offer_id:offer.id,revalidated:true,continued:'contract_request'});
 }

 if(ap.action_type==='commercial_reply_exception'||ap.action_type==='provider_negotiation_review'){
   const payload=ap.draft_payload_json||{};const thread=await svc.entities.CommunicationThread.get(String(payload.thread_id||ap.related_entity_id||'')).catch(()=>null);if(!thread)return Response.json({ok:false,error:'thread_missing'},{status:409});
   await svc.entities.Approval.update(ap.id,{status:'approved',approved_by:user.email,approved_at:now});
   if(payload.proposed_reply){const last=await svc.entities.CommunicationMessage.get(String(payload.message_id||'')).catch(()=>null);const r=await svc.functions.invoke('commercialSendMessage',{thread_id:thread.id,action:'routine_reply',classification:String(payload.classification||'question'),subject:`Re: ${last?.subject||''}`,text:String(payload.proposed_reply),approval_id:ap.id,agent_name:'commercial_reply',idempotency_key:`approved-exception:${ap.id}`});const rd=r?.data||r||{};if(rd.ok===false)return Response.json({ok:false,error:'approved_reply_send_failed',detail:rd.error},{status:500});}
   await svc.entities.CommunicationThread.update(thread.id,{status:'awaiting_counterparty',automation_paused:false,pause_reason:null});return Response.json({ok:true,status:'approved',continued:'reply_sent'});
 }

 return Response.json({ok:false,error:'unsupported_commercial_approval_type'},{status:400});
}catch(error){console.error('resolveCommercialApproval failed',error);return Response.json({ok:false,error:'commercial_approval_resolution_failed'},{status:500})}});
