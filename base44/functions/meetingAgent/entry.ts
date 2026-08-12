import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

// Compatibility boundary for historical Founder OS actions. Calendar reads and
// writes are owned exclusively by outlookMeetingCoordinator; this function no
// longer maintains a second Cal.com booking path. If real Outlook availability
// cannot be read, the coordinator fails with calendar_availability_unverified
// or a more specific connector/slot blocker; this adapter never invents a slot.
Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);const user=await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent',fallback:null,severity:'secondary'}));
    if(!user||user.role!=='admin')return Response.json({ok:false,error:user?'Forbidden':'Unauthorized'},{status:user?403:401});
    const body=await req.json().catch(()=>({}));const svc=base44.asServiceRole;
    if(body.mode==='execute'){
      const approval=await svc.entities.Approval.get(String(body.approval_id||'')).catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent',fallback:null,severity:'secondary'}));
      if(!approval||approval.action_type!=='schedule_founder_meeting'||approval.status!=='approved')return Response.json({ok:false,error:'approved_founder_meeting_required'},{status:403});
      const result=await base44.functions.invoke('outlookMeetingCoordinator',{mode:'execute',approval_id:approval.id,selected_slot:body.selected_slot});
      return Response.json(result?.data||result);
    }
    const lead=await svc.entities.OutboundLead.get(String(body.lead_id||'')).catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent',fallback:null,severity:'secondary'}));
    if(!lead)return Response.json({ok:false,error:'lead_required'},{status:404});
    const threads=await svc.entities.CommunicationThread.filter({lead_id:lead.id,engine:'merchant_acquisition'},'-created_date',10).catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent',fallback:[],severity:'secondary'}));
    const thread=threads[0];
    if(!thread)return Response.json({ok:false,error:'canonical_communication_thread_required'},{status:409});
    const now=new Date().toISOString();
    const task=await svc.entities.AgentTask.create({brand_id:'_platform',agent_name:'meeting',task_type:'schedule_founder_meeting',status:'waiting_approval',requires_approval:true,risk_level:3,related_entity_type:'CommunicationThread',related_entity_id:thread.id,input_summary:`Founder meeting request for ${lead.contact_full_name||lead.contact_email}`,output_summary:'Founder confirmation required before Outlook calendar access.',started_at:now});
    const payload={thread_id:thread.id,attendee_email:lead.contact_email,meeting_type:'MERCHANT_SALES_CALL',policy_authorized:false,context:{company_name:lead.company_name||lead.company_domain||'',counterparty_role:lead.contact_title||'',objective:'Resolve the documented commercial blocker and agree a permitted next step.'}};
    const approval=await svc.entities.Approval.create({brand_id:'_platform',agent_task_id:task.id,action_type:'schedule_founder_meeting',related_entity_type:'CommunicationThread',related_entity_id:thread.id,risk_level:3,draft_content:`Founder meeting with ${lead.contact_full_name||lead.contact_email}. Real Outlook availability will be checked only after approval.`,draft_payload_json:payload,status:'pending',expires_at:new Date(Date.now()+7*86400000).toISOString()});
    await svc.entities.AgentTask.update(task.id,{approval_id:approval.id});
    await svc.entities.CommunicationThread.update(thread.id,{conversation_state:'HUMAN_MEETING_RECOMMENDED',meeting_status:'recommended',meeting_type:'MERCHANT_SALES_CALL',automation_paused:true,pause_reason:'founder_meeting_confirmation_required'});
    return Response.json({ok:true,task_id:task.id,approval_id:approval.id,calendar_engine:'outlookMeetingCoordinator',automatic_booking:false});
  }catch(error){console.error('meetingAgent failed',error);return internalErrorResponse(error, 'meetingAgent');}
});
