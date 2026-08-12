import{createClientFromRequest}from'npm:@base44/sdk@0.8.41';
import{requireAdminOrInternal}from'../../shared/internalGate.ts';
import{privacySafeBenchmarkAggregate,privacySafeOutcomeAggregate,quarterOf,PRIVACY_SAFE_INTELLIGENCE_VERSION}from'../../shared/privacySafeIntelligence.ts';
import{retentionEvidenceComplete,retentionEvidenceStart}from'../../shared/retentionPolicy.ts';

async function upsert(s:any,key:string,payload:any){
 const old=(await s.entities.AnonymizedIntelligenceAggregate.filter({aggregate_key:key},'-created_date',1).catch(()=>[]))[0];
 const row={aggregate_key:key,aggregate_type:payload.kind,vertical:payload.vertical||'unknown',provider_bucket:payload.provider_bucket||'',country_bucket:payload.country||'',cohort_bucket:payload.revenue_tier||'',period:payload.period,sample_size:payload.sample_size,metrics_json:payload,anonymization_method:'irreversible_aggregate_k10_coarsened',anonymization_version:PRIVACY_SAFE_INTELLIGENCE_VERSION,reidentification_mapping_retained:false,last_verified_at:new Date().toISOString()};
 if(old){await s.entities.AnonymizedIntelligenceAggregate.update(old.id,row);return false}
 await s.entities.AnonymizedIntelligenceAggregate.create(row);return true;
}

Deno.serve(async req=>{let s:any=null,evidence:any=null,start:any=null;try{
 const b=createClientFromRequest(req),body=await req.json().catch(()=>({})),g=await requireAdminOrInternal(req,b,body);if(!g.ok)return g.response;s=b.asServiceRole;
 start=retentionEvidenceStart({run_key:`privacy-safe-intelligence:${new Date().toISOString()}:${crypto.randomUUID()}`,policy_key:'intelligence_outcomes_aggregate',action:'ANONYMIZE',scope:'BenchmarkCohort+IntelligenceOutcome -> AnonymizedIntelligenceAggregate'});
 if(!start.ok)return Response.json({ok:false,error:start.error},{status:503});
 evidence=await s.entities.RetentionExecutionEvidence.create(start.row).catch(()=>null);if(!evidence)return Response.json({ok:false,error:'retention_audit_evidence_unavailable'},{status:503});
 const cohorts=await s.entities.BenchmarkCohort.list('-month',5000).catch(()=>[]),outcomes=(await s.entities.IntelligenceOutcome.list('-captured_at',5000).catch(()=>[])).filter((x:any)=>!x.is_demo);let created=0,updated=0,suppressed=0;
 for(const c of cohorts){const p=privacySafeBenchmarkAggregate(c);if(!p){suppressed++;continue}const key=`benchmark:${p.vertical}:${p.country}:${p.revenue_tier}:${p.metric_key}:${p.period}`;(await upsert(s,key,p))?created++:updated++}
 const groups=new Map<string,any[]>();for(const o of outcomes){const k=`${o.vertical||'unknown'}::${o.provider_id||'unknown'}::${quarterOf(o.captured_at)}`;if(!groups.has(k))groups.set(k,[]);groups.get(k)!.push(o)}
 for(const[k,rows]of groups){const p=privacySafeOutcomeAggregate(rows);if(!p){suppressed++;continue}(await upsert(s,`outcome:${k}`,p))?created++:updated++}
 const complete=retentionEvidenceComplete(start,{candidate_count:created+updated+suppressed,succeeded_count:created+updated,failed_count:0,suppressed_count:suppressed});await s.entities.RetentionExecutionEvidence.update(evidence.id,complete);
 await s.entities.OperationalLog.create({event_type:'intelligence_event',message:'privacy_safe_intelligence_refresh',data_json:{created,updated,suppressed,version:PRIVACY_SAFE_INTELLIGENCE_VERSION,retention_evidence_id:evidence.id},actor_email:'internal',created_at:new Date().toISOString()}).catch(()=>null);
 return Response.json({ok:true,created,updated,suppressed,version:PRIVACY_SAFE_INTELLIGENCE_VERSION,retention_evidence_id:evidence.id});
}catch(e){console.error(e);if(s&&evidence?.id){await s.entities.RetentionExecutionEvidence.update(evidence.id,{status:'FAILED',completed_at:new Date().toISOString(),failed_count:1,evidence_json:{raw_identifiers_persisted:false,error_code:'privacy_safe_intelligence_failed'}}).catch(()=>null)}return Response.json({ok:false,error:'privacy_safe_intelligence_failed',message:String((e as Error)?.message||e).slice(0,300)},{status:500})}});
