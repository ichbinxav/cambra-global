import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import { normalizeEmail, sanitizeExternalText } from '../../shared/commercialAutonomy.ts';

const TZ = 'Europe/Paris';
const SLOT_MS = 30 * 60 * 1000;

function parisParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(d);
  const get = (t:string) => parts.find(p => p.type === t)?.value || '';
  return { weekday: get('weekday'), hour: Number(get('hour')), minute: Number(get('minute')) };
}
function isBusinessSlot(d: Date) {
  const p = parisParts(d);
  return !['Sat','Sun'].includes(p.weekday) && p.hour >= 9 && (p.hour < 17 || (p.hour === 17 && p.minute === 0));
}
function overlap(start:number,end:number,busy:any[]) {
  return busy.some((b:any)=>start < Date.parse(b.end?.dateTime || b.end) && end > Date.parse(b.start?.dateTime || b.start));
}
function roundUp30(ms:number){ return Math.ceil(ms / SLOT_MS) * SLOT_MS; }

Deno.serve(async (req) => {
  let task:any = null;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(()=>({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;
    const svc = base44.asServiceRole;
    const thread = await svc.entities.CommunicationThread.get(String(body?.thread_id || '')).catch(()=>null);
    if (!thread || !['merchant_acquisition','partner_acquisition','aggregate_procurement'].includes(thread.engine)) return Response.json({ok:false,error:'schedulable_commercial_thread_required'},{status:400});
    const attendee = normalizeEmail(body?.attendee_email || thread.counterparty_email);
    if (!attendee) return Response.json({ok:false,error:'attendee_email_required'},{status:400});

    task = await svc.entities.AgentTask.create({
      brand_id:'_platform', agent_name:'outlook_meeting_coordinator', task_type:'schedule_meeting',
      related_entity_type:'CommunicationThread', related_entity_id:thread.id, status:'running',
      requires_approval:false, risk_level:2, input_summary:`Schedule real Outlook meeting with ${attendee}`,
      started_at:new Date().toISOString()
    });

    const { accessToken } = await svc.connectors.getConnection('outlook').catch(()=>({accessToken:null}));
    if (!accessToken) {
      await svc.entities.AgentTask.update(task.id,{status:'waiting_input',output_summary:'Outlook shared connector not available',output_payload_json:{blocker:'outlook_connector_required'},completed_at:new Date().toISOString()});
      return Response.json({ok:false,error:'outlook_connector_required',setup_required:true,task_id:task.id},{status:409});
    }

    const meRes = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', {headers:{Authorization:`Bearer ${accessToken}`}});
    const me = await meRes.json().catch(()=>({}));
    if(!meRes.ok) throw new Error(`outlook_me_failed:${meRes.status}`);
    const organizer = normalizeEmail(me.mail || me.userPrincipalName);

    const startWindow = new Date(roundUp30(Date.now() + 60*60*1000));
    const endWindow = new Date(startWindow.getTime() + 8*24*60*60*1000);
    const viewUrl = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(startWindow.toISOString())}&endDateTime=${encodeURIComponent(endWindow.toISOString())}&$select=start,end,isCancelled&$top=1000`;
    const viewRes = await fetch(viewUrl,{headers:{Authorization:`Bearer ${accessToken}`,'Prefer':`outlook.timezone="${TZ}"`}});
    const view = await viewRes.json().catch(()=>({}));
    if(!viewRes.ok) throw new Error(`outlook_calendar_view_failed:${viewRes.status}`);
    const busy = (Array.isArray(view.value)?view.value:[]).filter((e:any)=>!e.isCancelled);

    let chosen:number|null = null;
    for(let t=roundUp30(startWindow.getTime()); t+SLOT_MS<=endWindow.getTime(); t+=SLOT_MS){
      const d=new Date(t); if(!isBusinessSlot(d)) continue;
      if(!overlap(t,t+SLOT_MS,busy)){ chosen=t; break; }
    }
    if(chosen==null){
      await svc.entities.AgentTask.update(task.id,{status:'waiting_input',output_summary:'No real Outlook slot available in the next 8 days',output_payload_json:{blocker:'no_calendar_slot'},completed_at:new Date().toISOString()});
      return Response.json({ok:false,error:'no_calendar_slot',task_id:task.id},{status:409});
    }

    const start=new Date(chosen); const end=new Date(chosen+SLOT_MS);
    const allowedMeetingTypes=new Set(['low_value','operational','technical','commercial','strategic','legal','executive']);
    const defaultMeetingType=thread.engine==='aggregate_procurement'?'strategic':'commercial';
    const meetingClassification=allowedMeetingTypes.has(String(body?.meeting_classification||''))?String(body.meeting_classification):defaultMeetingType;
    const founderRequired=['strategic','legal','executive'].includes(meetingClassification);
    const meetingBrief={classification:meetingClassification,founder_required:founderRequired,counterparty:thread.counterparty_name||attendee,engine:thread.engine,thread_summary:thread.summary||'',current_stage:thread.classification||thread.status,red_lines:['No material contract acceptance without L4','No volume guarantee without explicit authority','No invented meeting notes or commitments'],source:'real_thread_context'};
    const transactionId=`cambra-${thread.id}-${start.toISOString().slice(0,16)}`.replace(/[^a-zA-Z0-9-]/g,'').slice(0,120);
    const subject=sanitizeExternalText(body?.subject || (thread.engine==='aggregate_procurement'?'CAMBRA — Aggregate procurement discussion':'CAMBRA — Payments infrastructure review'),200);
    const eventRes=await fetch('https://graph.microsoft.com/v1.0/me/events',{
      method:'POST', headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        subject,
        body:{contentType:'text',content:thread.engine==='aggregate_procurement'?'CAMBRA aggregate procurement discussion.':'CAMBRA payments infrastructure discussion.'},
        start:{dateTime:start.toISOString(),timeZone:'UTC'}, end:{dateTime:end.toISOString(),timeZone:'UTC'},
        attendees:[{emailAddress:{address:attendee,name:thread.counterparty_name||attendee},type:'required'}],
        allowNewTimeProposals:true,
        transactionId
      })
    });
    const event=await eventRes.json().catch(()=>({}));
    if(!eventRes.ok) throw new Error(`outlook_event_create_failed:${eventRes.status}`);

    const now=new Date().toISOString();
    await svc.entities.CommunicationThread.update(thread.id,{status:'closed',automation_paused:true,pause_reason:'meeting_booked',next_action_at:null,meeting_event_id:event.id||'',meeting_start_at:start.toISOString(),meeting_end_at:end.toISOString(),meeting_classification:meetingClassification,founder_required:founderRequired,meeting_brief_json:meetingBrief,post_meeting_status:'pending',summary:`Meeting booked ${start.toISOString()} · ${attendee}`});
    if(thread.engine==='merchant_acquisition'&&thread.lead_id) await svc.entities.OutboundLead.update(thread.lead_id,{stage:'meeting',next_action:`Meeting booked ${start.toISOString()}`}).catch(()=>null);
    if(thread.engine==='partner_acquisition'&&thread.related_entity_id) await svc.entities.PartnerProspect.update(thread.related_entity_id,{stage:'meeting',next_action_at:null}).catch(()=>null);
    await svc.entities.OperationalLog.create({event_type:'commercial_meeting_booked',message:`Outlook meeting with ${attendee}`,data_json:{thread_id:thread.id,lead_id:thread.lead_id||null,event_id:event.id||null,start:start.toISOString(),end:end.toISOString(),organizer,attendee},created_at:now}).catch(()=>null);
    await svc.entities.AgentTask.update(task.id,{status:'completed',output_summary:`Outlook meeting booked ${start.toISOString()} with ${attendee}`,output_payload_json:{event_id:event.id||null,start:start.toISOString(),end:end.toISOString(),organizer,attendee},completed_at:now});
    return Response.json({ok:true,task_id:task.id,event_id:event.id||null,start:start.toISOString(),end:end.toISOString(),organizer,attendee,meeting_classification:meetingClassification,founder_required:founderRequired,meeting_brief:meetingBrief});
  } catch(error) {
    console.error('outlookMeetingCoordinator failed',error);
    if(task?.id){try{const b=createClientFromRequest(req);await b.asServiceRole.entities.AgentTask.update(task.id,{status:'failed',error:'outlook_meeting_failed',completed_at:new Date().toISOString()});}catch{}}
    return Response.json({ok:false,error:'outlook_meeting_failed',task_id:task?.id||null},{status:500});
  }
});