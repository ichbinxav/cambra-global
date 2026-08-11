import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { normalizeFounderMeetingPolicy } from '../../shared/founderMeeting.ts';
import { evaluateSchedulerEvidence } from '../../shared/schedulerRun.ts';

Deno.serve(async(req)=>{
  try{
    const base44=createClientFromRequest(req);const user=await base44.auth.me().catch(()=>null);
    if(!user||user.role!=='admin')return Response.json({ok:false,error:'Forbidden'},{status:403});
    const svc=base44.asServiceRole;
    const [approvals,incidents,meetings,meetingPolicies,health,finance,gaps,digest,agentPerformance,customerSuccess,unitEconomics,incidentAlertDeliveries,schedulerRuns]=await Promise.all([
      svc.entities.Approval.filter({status:'pending'},'-created_date',200).catch(()=>[]),
      svc.entities.AutonomyIncident.filter({status:'open'},'-last_seen_at',200).catch(()=>[]),
      svc.entities.CommunicationThread.filter({meeting_start_at:{$ne:null}},'-meeting_start_at',200).catch(()=>[]),
      svc.entities.FounderMeetingPolicy.filter({status:'active'},'-approved_at',5).catch(()=>[]),
      svc.entities.OperatingHealthAssessment.list('-calculated_at',1).catch(()=>[]),
      svc.entities.RevenueLifecycle.list('-updated_at',1000).catch(()=>[]),
      svc.entities.RealWorldGapReport.filter({status:{$in:['open','investigating']}},'-created_at',100).catch(()=>[]),
      svc.entities.ExecutiveDigest.list('-generated_at',1).catch(()=>[]),
      svc.entities.AgentPerformanceMetric.list('-calculated_at',100).catch(()=>[]),
      svc.entities.CustomerSuccessSignal.filter({status:'open'},'-updated_at',200).catch(()=>[]),
      svc.entities.MerchantUnitEconomics.list('-calculated_at',100).catch(()=>[]),
      svc.entities.IncidentAlertDelivery.list('-updated_at',100).catch(()=>[]),
      svc.entities.SchedulerRun.list('-started_at',5000).catch(()=>[]),
    ]);
    const now=Date.now();const strategic=meetings.filter((item:any)=>Date.parse(item.meeting_start_at||'')>=now-86400000);
    const completed=meetings.filter((item:any)=>item.meeting_status==='completed'||item.meeting_outcome_json);
    const founderMinutes=completed.reduce((total:number,item:any)=>total+Math.max(0,(Date.parse(item.meeting_end_at||'')-Date.parse(item.meeting_start_at||''))/60000||0),0);
    const outcomes=completed.reduce((acc:any,item:any)=>{const key=String(item.meeting_outcome_json?.outcome||'UNKNOWN');acc[key]=(acc[key]||0)+1;return acc;},{});
    return Response.json({ok:true,operating_health:health[0]||null,scheduler_health:evaluateSchedulerEvidence(schedulerRuns,now),approvals:approvals.filter((item:any)=>Number(item.risk_level||0)>=3).slice(0,50),critical_exceptions:incidents.filter((item:any)=>item.severity==='critical').slice(0,50),critical_alert_delivery:{delivered:incidentAlertDeliveries.filter((item:any)=>item.status==='DELIVERED').length,needs_attention:incidentAlertDeliveries.filter((item:any)=>['RETRY_PENDING','CONFIGURATION_REQUIRED','FAILED'].includes(item.status)).length,recent:incidentAlertDeliveries.slice(0,25)},strategic_meetings:strategic.slice(0,50),founder_meeting_policy:normalizeFounderMeetingPolicy(meetingPolicies[0]||{}),founder_meeting_analytics:{recommended:meetings.filter((item:any)=>item.meeting_status==='recommended').length,proposed:meetings.filter((item:any)=>item.meeting_status==='proposed').length,booked:meetings.filter((item:any)=>item.meeting_status==='booked').length,completed:completed.length,no_show:meetings.filter((item:any)=>item.meeting_status==='no_show').length,founder_minutes:Math.round(founderMinutes),outcomes},financial_summary:{verified_savings:finance.reduce((total:number,item:any)=>total+Number(item.verified_savings||0),0),billable_savings:finance.reduce((total:number,item:any)=>total+Number(item.billable_savings||0),0),collected:finance.reduce((total:number,item:any)=>total+Number(item.collected_amount||0),0),active_revenue_flows:finance.length},real_world_gaps:gaps.slice(0,50),latest_executive_digest:digest[0]||null,agent_performance:agentPerformance.slice(0,50),customer_success_summary:{retention_risks:customerSuccess.filter((item:any)=>item.type==='retention_risk').length,expansion_opportunities:customerSuccess.filter((item:any)=>item.type==='expansion_opportunity').length},unit_economics:unitEconomics.slice(0,50),interruption_policy:'Routine operations stay in Admin/digests. Immediate founder attention is reserved for L3/L4 approvals, critical incidents, high-leverage meetings and material real-world gaps.'});
  }catch(error){console.error('getFounderControlCenter failed',error);return Response.json({ok:false,error:'founder_control_center_failed'},{status:500});}
});
