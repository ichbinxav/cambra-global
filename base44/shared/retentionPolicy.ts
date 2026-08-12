export const RETENTION_POLICY_VERSION='cambra-retention-2.0.0';
export const RETENTION_MS_PER_DAY=86_400_000;

export const RETENTION_POLICIES=Object.freeze({
  anonymous_analyzer_sessions:Object.freeze({category:'anonymous_analyzer_sessions',action:'DELETE',retention_days:90,cadence:'DAILY',legal_hold_supported:false}),
  unengaged_outbound_leads:Object.freeze({category:'unengaged_outbound_leads',action:'DELETE',retention_days:365,cadence:'MONTHLY',legal_hold_supported:true}),
  inbound_leads:Object.freeze({category:'inbound_leads',action:'DELETE',retention_days:730,cadence:'MONTHLY',legal_hold_supported:true}),
  intelligence_outcomes_aggregate:Object.freeze({category:'intelligence_outcomes_and_aggregates',action:'ANONYMIZE',retention_days:null,cadence:'SCHEDULED',minimum_distinct_merchants:10,raw_identifier_retention:false}),
});

export function resolveRetentionPolicy(key:string){return (RETENTION_POLICIES as any)[key]||null}
export function retentionCutoff(key:string,now=new Date()){
 const policy=resolveRetentionPolicy(key);if(!policy||!Number.isInteger(policy.retention_days)||policy.retention_days<=0)return{ok:false,error:'retention_policy_not_executable',policy_key:key,policy_version:RETENTION_POLICY_VERSION};
 const t=now instanceof Date?now.getTime():Date.parse(String(now));if(!Number.isFinite(t))return{ok:false,error:'retention_now_invalid',policy_key:key,policy_version:RETENTION_POLICY_VERSION};
 return{ok:true,policy_key:key,policy_version:RETENTION_POLICY_VERSION,action:policy.action,retention_days:policy.retention_days,cutoff:new Date(t-policy.retention_days*RETENTION_MS_PER_DAY).toISOString()};
}
export function authorizeRetentionAction(key:string,action:string){const policy=resolveRetentionPolicy(key);if(!policy)return{ok:false,error:'retention_policy_missing',policy_key:key,policy_version:RETENTION_POLICY_VERSION};if(policy.action!==action)return{ok:false,error:'retention_action_not_authorized',policy_key:key,expected_action:policy.action,requested_action:action,policy_version:RETENTION_POLICY_VERSION};return{ok:true,policy_key:key,policy,policy_version:RETENTION_POLICY_VERSION}}
export function retentionEvidenceStart(input:any){const auth=authorizeRetentionAction(input?.policy_key,input?.action);if(!auth.ok)return auth;return{ok:true,row:{run_key:String(input.run_key),policy_key:String(input.policy_key),policy_version:RETENTION_POLICY_VERSION,category:auth.policy.category,action:auth.policy.action,status:'RUNNING',cutoff_at:input.cutoff_at||null,started_at:String(input.started_at||new Date().toISOString()),candidate_count:0,succeeded_count:0,failed_count:0,evidence_json:{cadence:auth.policy.cadence,scope:String(input.scope||''),raw_identifiers_persisted:false}}}}
export function retentionEvidenceComplete(start:any,input:any){if(!start?.ok||!start.row)return{ok:false,error:'retention_evidence_start_required'};const candidate=Math.max(0,Number(input?.candidate_count||0)),succeeded=Math.max(0,Number(input?.succeeded_count||0)),failed=Math.max(0,Number(input?.failed_count||0));if(candidate<succeeded+failed)return{ok:false,error:'retention_evidence_counts_invalid'};return{...start.row,status:failed?'COMPLETED_WITH_ERRORS':'COMPLETED',candidate_count:candidate,succeeded_count:succeeded,failed_count:failed,completed_at:String(input?.completed_at||new Date().toISOString()),evidence_json:{...start.row.evidence_json,batches_processed:Math.max(0,Number(input?.batches_processed||0)),suppressed_count:Math.max(0,Number(input?.suppressed_count||0)),raw_identifiers_persisted:false}}}
