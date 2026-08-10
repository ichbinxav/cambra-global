export const MAINTENANCE_VERSION='p17-maintenance-1.0.0';
export type MaintenanceSeverity='warning'|'critical';
export type MaintenanceAction='refresh_oauth'|'replay_webhooks'|'reconcile_billing'|'refresh_provider_intelligence'|'close_stale_task'|'developer_investigation'|'human_review';
export type MaintenanceSignal={key:string;domain:string;type:string;severity:MaintenanceSeverity;subjectType?:string;subjectId?:string;summary:string;financialImpactMinor?:number;customerImpact?:string;details?:Record<string,unknown>};
export const SAFE_AUTOMATIC_ACTIONS=Object.freeze(new Set<MaintenanceAction>(['refresh_oauth','replay_webhooks','reconcile_billing','refresh_provider_intelligence','close_stale_task']));
export const MATERIAL_DOMAINS=Object.freeze(new Set(['security','contracts','permissions','authentication_policy','production_database','money_movement']));
export function remediationFor(s:MaintenanceSignal):MaintenanceAction{
 if(MATERIAL_DOMAINS.has(s.domain))return 'human_review';
 if(s.type==='oauth_token_expired')return 'refresh_oauth';
 if(s.type==='webhook_retry_backlog')return 'replay_webhooks';
 if(s.type==='billing_reconciliation_error')return 'reconcile_billing';
 if(s.type==='provider_pricing_stale')return 'refresh_provider_intelligence';
 if(s.type==='agent_task_stuck')return 'close_stale_task';
 if(s.severity==='critical'&&['worker','integration','webhook','data','intelligence','migration'].includes(s.domain))return 'developer_investigation';
 return 'human_review';
}
export function isAutomatic(action:MaintenanceAction){return SAFE_AUTOMATIC_ACTIONS.has(action)}
export function healthScore(input:{critical:number;warning:number;stale:number;failedRepairs:number}){
 const penalty=Math.min(100,input.critical*24+input.warning*6+input.stale*3+input.failedRepairs*10);
 return Math.max(0,100-penalty);
}
export function learningKey(s:MaintenanceSignal,action:MaintenanceAction){return `${s.domain}:${s.type}:${action}`.toLowerCase().replace(/[^a-z0-9:_-]/g,'_').slice(0,220)}
export function requiresHuman(s:MaintenanceSignal,action:MaintenanceAction){return !isAutomatic(action)||MATERIAL_DOMAINS.has(s.domain)||s.domain==='security'}
