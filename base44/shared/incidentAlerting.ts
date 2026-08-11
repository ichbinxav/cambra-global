import { sendCostGovernedEmail } from './costGovernance.ts';

export const INCIDENT_ALERTING_VERSION='incident-alerting-v1.1.0';
export const INCIDENT_ALERT_RETRY_MINUTES=15;
export const INCIDENT_ALERT_MAX_ATTEMPTS=5;

export function incidentAlertSeverity(incident:any):'HIGH'|'CRITICAL'|null {
  if(String(incident?.severity||'').toLowerCase()==='critical')return 'CRITICAL';
  if(['high','critical'].includes(String(incident?.customer_impact||'').toLowerCase()))return 'HIGH';
  if(['high','critical'].includes(String(incident?.legal_risk||'').toLowerCase()))return 'HIGH';
  if(Number(incident?.financial_impact_minor||0)>0)return 'HIGH';
  return null;
}

export function incidentAlertKey(incident:any,severity:string){return `incident:${String(incident?.id||incident?.dedupe_key||'unknown')}:${severity}`;}
export function recipientFingerprint(email:string){
  const normalized=String(email||'').trim().toLowerCase();const at=normalized.indexOf('@');
  return at>0?`${normalized.slice(0,1)}***${normalized.slice(at)}`:'configured-recipient';
}
export function configuredIncidentAlertRecipient(){
  return String(Deno.env.get('FOUNDER_ALERT_EMAIL')||Deno.env.get('FOUNDER_EMAIL')||Deno.env.get('ADMIN_NOTIFICATION_EMAIL')||'').trim();
}
export function alertRetryDecision(existing:any,at=Date.now()){
  if(existing?.status==='DELIVERED')return{allowed:false,reason:'already_delivered'};
  if(Number(existing?.attempt_count||0)>=INCIDENT_ALERT_MAX_ATTEMPTS)return{allowed:false,reason:'max_attempts_reached'};
  const next=Date.parse(String(existing?.next_retry_at||''));
  if(Number.isFinite(next)&&next>at)return{allowed:false,reason:'retry_cooldown'};
  return{allowed:true,reason:'attempt_allowed'};
}

export async function dispatchIncidentAlert(svc:any,incident:any){
  const severity=incidentAlertSeverity(incident);if(!severity)return{attempted:false,status:'NOT_PUSH_ELIGIBLE'};
  const alertKey=incidentAlertKey(incident,severity),now=new Date(),nowIso=now.toISOString();
  const existing=(await svc.entities.IncidentAlertDelivery.filter({alert_key:alertKey},'-updated_at',1).catch(()=>[]))[0]||null;
  const retry=alertRetryDecision(existing,now.getTime());if(!retry.allowed)return{attempted:false,status:existing?.status||'PENDING',reason:retry.reason,delivery_id:existing?.id||null};
  const recipient=configuredIncidentAlertRecipient();
  const base={alert_key:alertKey,incident_id:String(incident.id||''),severity,channel:'EMAIL',attempt_count:Number(existing?.attempt_count||0),created_at:existing?.created_at||nowIso,updated_at:nowIso};
  if(!recipient){
    const row={...base,status:'CONFIGURATION_REQUIRED',last_error_code:'FOUNDER_OR_ADMIN_ALERT_EMAIL_REQUIRED'};
    if(existing)await svc.entities.IncidentAlertDelivery.update(existing.id,row);else await svc.entities.IncidentAlertDelivery.create(row);
    return{attempted:false,status:'CONFIGURATION_REQUIRED',reason:'FOUNDER_OR_ADMIN_ALERT_EMAIL_REQUIRED'};
  }
  const attempt=Number(existing?.attempt_count||0)+1,nextRetry=new Date(now.getTime()+INCIDENT_ALERT_RETRY_MINUTES*60000).toISOString();
  const pending={...base,recipient_fingerprint:recipientFingerprint(recipient),status:'PENDING',attempt_count:attempt,last_attempt_at:nowIso,next_retry_at:nextRetry,last_error_code:''};
  const delivery=existing?await svc.entities.IncidentAlertDelivery.update(existing.id,pending):await svc.entities.IncidentAlertDelivery.create(pending);
  try{
    const sent=await sendCostGovernedEmail(svc,{event_key:`incident-alert:${alertKey}:attempt:${attempt}`,source:'maintenanceEngine',related_entity_type:'AutonomyIncident',related_entity_id:String(incident.id||'')},{from_name:'CAMBRA Operations',to:recipient,subject:`[${severity}] CAMBRA · ${String(incident.summary||'Operational incident').slice(0,140)}`,body:`<h2>CAMBRA ${severity} incident</h2><p>${String(incident.summary||'Operational incident')}</p><p><strong>Domain:</strong> ${String(incident.domain||'unknown')}<br><strong>Owner:</strong> ${String(incident.owner_type||'unassigned')}<br><strong>Workflow:</strong> ${String(incident.workflow_state||'unknown')}</p><p>Open Founder Admin to inspect evidence, blockers and controls. No action has been auto-approved by this alert.</p>`});
    await svc.entities.IncidentAlertDelivery.update(delivery.id,{status:'DELIVERED',delivered_at:new Date().toISOString(),updated_at:new Date().toISOString(),next_retry_at:null,provider_message_id:String(sent?.id||sent?.message_id||''),last_error_code:''});
    return{attempted:true,status:'DELIVERED',delivery_id:delivery.id};
  }catch(error){
    const terminal=attempt>=INCIDENT_ALERT_MAX_ATTEMPTS;const code=String((error as Error)?.message||error).slice(0,200);
    await svc.entities.IncidentAlertDelivery.update(delivery.id,{status:terminal?'FAILED':'RETRY_PENDING',updated_at:new Date().toISOString(),next_retry_at:terminal?null:nextRetry,last_error_code:code});
    return{attempted:true,status:terminal?'FAILED':'RETRY_PENDING',delivery_id:delivery.id,error:code};
  }
}
