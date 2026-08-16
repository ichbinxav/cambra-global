import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import {
  claimExternalApprovalExecution,
  completeExternalApprovalExecution,
  externalExecutionHttpStatus,
  markExternalApprovalReviewRequired,
  releaseExternalApprovalClaim,
} from '../../shared/externalApprovalExecution.ts';

// Compatibility boundary for historical Founder OS actions. Calendar reads and
// writes are owned exclusively by outlookMeetingCoordinator; this function no
// longer maintains a second Cal.com booking path. If real Outlook availability
// cannot be read, the coordinator fails with calendar_availability_unverified
// or a more specific connector/slot blocker; this adapter never invents a slot.
Deno.serve(async(req)=>{
  let execution:any=null;
  try{
    const base44=createClientFromRequest(req);const user=await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent',fallback:null,severity:'secondary'}));
    if(!user||user.role!=='admin')return Response.json({ok:false,error:user?'Forbidden':'Unauthorized'},{status:user?403:401});
    const body=await req.json().catch(()=>({}));const svc=base44.asServiceRole;
    if(body.mode==='execute'){
      const approval=await svc.entities.Approval.get(String(body.approval_id||'')).catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent',fallback:null,severity:'secondary'}));
      if(!approval||approval.action_type!=='schedule_founder_meeting'||approval.status!=='approved')return Response.json({ok:false,error:'approved_founder_meeting_required'},{status:403});
      const task=approval.agent_task_id?await svc.entities.AgentTask.get(approval.agent_task_id).catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent.approved_task_read',fallback:null,severity:'critical'})):null;
      if(!task)return Response.json({ok:false,error:'AgentTask not found'},{status:404});
      try{
        execution=await claimExternalApprovalExecution(svc,{approval,task,commandKey:body.execution_command_key,actorEmail:user.email,actionType:'schedule_founder_meeting',agentName:['meeting','founder_meeting'],taskType:'schedule_founder_meeting',riskLevel:3});
        if(!execution.acquired){
          if(execution.state==='replay')return Response.json({...execution.result,ok:true,idempotent_replay:true});
          return Response.json({ok:false,error:execution.error||'external_execution_not_claimed',execution_state:execution.state,review_required:execution.state==='review_required'},{status:externalExecutionHttpStatus(execution)});
        }
        const response=await base44.functions.invoke('outlookMeetingCoordinator',{mode:'execute',approval_id:approval.id,selected_slot:body.selected_slot,external_execution_managed:true,execution_command_key:execution.commandKey,execution_attempt_token:execution.token,execution_revision:execution.revision});
        const result=response?.data||response;
        if(result?.ok===false)throw new Error(result.error||'outlook_meeting_execution_failed');
        const executionTask=await svc.entities.AgentTask.get(task.id).catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent.execution_task_readback',fallback:null,severity:'critical'}));
        execution.effectsStarted=executionTask?.execution_effects_started===true;
        execution.task=executionTask||execution.task;
        const threadId=String(approval.draft_payload_json?.thread_id||'');
        const observed=threadId?await svc.entities.CommunicationThread.get(threadId).catch((error:any)=>safeBestEffort(error,{operation:'meetingAgent.meeting_postcondition_read',fallback:null,severity:'critical'})):null;
        if(!observed||observed.meeting_status!=='booked'||!String(observed.meeting_event_id||'')||String(observed.meeting_event_id)!==String(result?.event_id||''))throw new Error('outlook_meeting_postcondition_failed');
        const persisted=await completeExternalApprovalExecution(svc,execution,{...result,task_id:task.id,thread_id:threadId,calendar_engine:'outlookMeetingCoordinator',execution_receipt_ref:`outlook-event:${result.event_id}`},result?.already_booked?'Founder meeting already booked; canonical event reused.':`Founder meeting booked ${result?.start||''}`);
        return Response.json(persisted);
      }catch(error){
        const code=String((error as any)?.code||(error as Error)?.message||'meeting_external_execution_failed');
        if(execution?.acquired){
          const executionTask=await svc.entities.AgentTask.get(task.id).catch((readError:any)=>safeBestEffort(readError,{operation:'meetingAgent.failure_effect_state_read',fallback:null,severity:'critical'}));
          execution.effectsStarted=execution.effectsStarted===true||executionTask?.execution_effects_started===true;
          execution.task=executionTask||execution.task;
          if(execution.effectsStarted)await markExternalApprovalReviewRequired(svc,execution,code);
          else await releaseExternalApprovalClaim(svc,execution,code);
        }
        return Response.json({ok:false,error:code,review_required:execution?.effectsStarted===true},{status:execution?.effectsStarted?409:Number((error as any)?.status||500)});
      }
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
