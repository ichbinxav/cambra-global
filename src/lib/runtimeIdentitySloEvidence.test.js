import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import {
  compareRuntimeDeploymentIdentity,
  recordRuntimeGateEvidence,
  releaseIdentityExpectation,
  runtimeGateEvidencePayload,
  runtimeDeploymentIdentity,
  validateReleaseIdentityExpectation,
  validateRuntimeDeploymentIdentity,
  verifyRuntimeGateEvidence,
} from '../../base44/shared/runtimeEvidence.ts';
import { sha256Canonical } from '../../base44/shared/legalExecution.ts';
import {
  evaluateServiceLevelRows,
  readSloSourceWindow,
  SERVICE_LEVEL_TARGETS,
} from '../../base44/shared/serviceLevelRuntime.ts';
import { SERVICE_LEVEL_OBSERVATION_VERSION } from '../../base44/shared/serviceLevelObservation.ts';
import { serviceLevelSnapshotBlockers } from '../../base44/shared/productionReadiness.ts';

const SHA='0123456789abcdef0123456789abcdef01234567';
const HASH='a'.repeat(64);
const IDENTITY_ENV={CAMBRA_ENVIRONMENT:'production',CAMBRA_RELEASE_VERSION:'0.97.0',CAMBRA_RELEASE_BUILD_ID:'ci-42',CAMBRA_GIT_SHA:SHA,CAMBRA_SOURCE_TREE_HASH:HASH,CAMBRA_SOURCE_TREE_FILE_COUNT:'2500',CAMBRA_BASE44_BUNDLE_HASH:HASH,CAMBRA_BASE44_BUNDLE_FILE_COUNT:'2400',CAMBRA_DEPLOYMENT_TOPOLOGY_HASH:HASH,CAMBRA_SCHEDULER_INVENTORY_HASH:HASH,CAMBRA_PHYSICAL_FUNCTION_COUNT:'276',CAMBRA_LOGICAL_ROUTE_COUNT:'38'};
const WINDOW_FROM='2026-07-14T12:00:00.000Z';
const WINDOW_TO='2026-08-13T12:00:00.000Z';
const RECEIPT_HASH='b'.repeat(64);

function apiReceipt(index,state='SUCCEEDED',overrides={}){
  const started=new Date(Date.parse(WINDOW_FROM)+60_000+index*1_000).toISOString();
  const completed=new Date(Date.parse(started)+100).toISOString();
  return {id:`api-${index}`,observation_key:`slo:analyzer:${index}`,observation_version:SERVICE_LEVEL_OBSERVATION_VERSION,observation_state:state,slo_key:'analyzer_submission',endpoint:'submitPaymentsAnalysis',status:state==='SUCCEEDED'?'success':'error',status_code:state==='SUCCEEDED'?200:500,duration_ms:100,started_at:started,completed_at:completed,runtime_identity_hash:RECEIPT_HASH,runtime_git_sha:SHA,payload_summary:{eligible:state!=='EXCLUDED',exclusion_reason:state==='EXCLUDED'?'idempotent_replay':'',source_refs:state==='SUCCEEDED'?[{entity:'PaymentsAnalysisSession',key:`session-${index}`}]:[]},...overrides};
}

function schedulerReceipt(index,status='COMPLETED',worker='reconcileRecoverBilling',overrides={}){
  const started=new Date(Date.parse(WINDOW_FROM)+60_000+index*2_000).toISOString();
  const completed=new Date(Date.parse(started)+1_000).toISOString();
  return {id:`scheduler-${worker}-${index}`,record_kind:'ATTEMPT',worker_key:worker,status,effects_started:true,started_at:started,completed_at:completed,details_json:{runtime_identity_hash:RECEIPT_HASH,runtime_git_sha:SHA,runtime_identity_status:'COMPLETE'},...overrides};
}

const coverage={window_from:WINDOW_FROM,window_to:WINDOW_TO,coverage_epoch:WINDOW_FROM,coverage_status:'COMPLETE',coverage_blockers:[],runtime_identity_hash:RECEIPT_HASH,runtime_git_sha:SHA};

describe('runtime identity and measured SLO evidence',()=>{
  it('requires one complete immutable runtime identity and detects any parity mismatch',()=>{
    const identity=runtimeDeploymentIdentity(IDENTITY_ENV);
    expect(validateRuntimeDeploymentIdentity(identity,{environment:'production'})).toMatchObject({ok:true,status:'COMPLETE'});
    const expected={...identity};delete expected.identity_version;
    expect(validateReleaseIdentityExpectation(expected)).toMatchObject({ok:true,status:'COMPLETE'});
    expect(compareRuntimeDeploymentIdentity(identity,expected)).toMatchObject({ok:true});
    expect(compareRuntimeDeploymentIdentity({...identity,logical_route_count:37},expected)).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_logical_route_count_mismatch'])});
    expect(validateRuntimeDeploymentIdentity({...identity,base44_bundle_hash:''})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_base44_bundle_hash_invalid'])});
    expect(releaseIdentityExpectation({sourceTreeHash:HASH,sourceTreeFileCount:2500,gitSha:SHA,backendBundle:{stagedTreeSha256:HASH,stagedFileCount:2400,physicalFunctionCount:276,logicalRouteCount:38}})).toMatchObject({git_sha:SHA,source_tree_hash:HASH,source_tree_file_count:2500,physical_function_count:276,logical_route_count:38});
  });

  /* global process */
  it('downgrades runtime PASS when deployment identity or expected parity is absent',async()=>{
    const previous=Object.fromEntries(Object.keys(IDENTITY_ENV).map((key)=>[key,process.env[key]]));
    Object.assign(process.env,IDENTITY_ENV);
    const rows=[];const svc={entities:{RuntimeGateEvidence:{create:async(value)=>{rows.push(value);return value;}}}};
    try{
      const noExpected=await recordRuntimeGateEvidence(svc,{gate_key:'BASE44_RUNTIME_PARITY',environment:'production',status:'PASS',evidence_kind:'REAL_RUNTIME',source:'test'});
      expect(noExpected).toMatchObject({status:'BLOCKED',identity_status:'INCOMPLETE',identity_blockers:expect.arrayContaining(['expected_release_identity_required'])});
      const pass=await recordRuntimeGateEvidence(svc,{gate_key:'BASE44_RUNTIME_PARITY',environment:'production',status:'PASS',evidence_kind:'REAL_RUNTIME',source:'test',expected_identity:{...runtimeDeploymentIdentity(IDENTITY_ENV)}});
      expect(pass).toMatchObject({status:'PASS',identity_status:'COMPLETE',physical_function_count:276,logical_route_count:38});
      expect(pass.identity_hash).toMatch(/^[a-f0-9]{64}$/u);
    }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  });

  it('rejects stale, forged and hash-tampered runtime gate rows',async()=>{
    const previous=Object.fromEntries(Object.keys(IDENTITY_ENV).map((key)=>[key,process.env[key]]));
    Object.assign(process.env,IDENTITY_ENV);
    try{
      const identity=runtimeDeploymentIdentity();
      const nowMs=Date.parse('2026-08-13T12:00:00.000Z');
      const base={
        gate_key:'DELIVERABILITY_DNS',environment:'production',...identity,
        identity_status:'COMPLETE',identity_blockers:[],status:'PASS',evidence_kind:'REAL_RUNTIME',
        source:'test-runtime',external_run_id:'run-1',evidence_refs:['provider://receipt'],
        details_json:{proof:'real'},observed_at:'2026-08-13T11:00:00.000Z',expires_at:'2026-08-13T13:00:00.000Z',recorded_by:'runtime-verifier',
      };
      const signed={...base,identity_hash:await sha256Canonical(identity)};
      const valid={...signed,evidence_hash:await sha256Canonical(runtimeGateEvidencePayload(signed))};
      expect(await verifyRuntimeGateEvidence(valid,{now_ms:nowMs,environment:'production'})).toMatchObject({ok:true,status:'VERIFIED'});
      expect(await verifyRuntimeGateEvidence({...valid,expires_at:undefined},{now_ms:nowMs,environment:'production'})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_expiry_required','runtime_evidence_hash_mismatch'])});
      expect(await verifyRuntimeGateEvidence({...valid,expires_at:'2026-08-13T11:30:00.000Z'},{now_ms:nowMs,environment:'production'})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_expired','runtime_evidence_hash_mismatch'])});
      expect(await verifyRuntimeGateEvidence({...valid,details_json:{proof:'forged'}},{now_ms:nowMs,environment:'production'})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_hash_mismatch'])});
      expect(await verifyRuntimeGateEvidence({...valid,base44_bundle_hash:'b'.repeat(64)},{now_ms:nowMs,environment:'production'})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_base44_bundle_hash_mismatch','runtime_identity_hash_mismatch','runtime_evidence_hash_mismatch'])});
      expect(await verifyRuntimeGateEvidence({...valid,identity_hash:'b'.repeat(64)},{now_ms:nowMs,environment:'production'})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_identity_hash_mismatch','runtime_evidence_hash_mismatch'])});
    }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
  });

  it('accepts explicitly allowed external proof without pretending runtime parity and still verifies freshness, SHA and canonical hash',async()=>{
    const nowMs=Date.parse('2026-08-13T12:00:00.000Z');
    const base={
      gate_key:'REMOTE_CI_FINAL_SHA',environment:'production',git_sha:SHA,
      status:'PASS',evidence_kind:'EXTERNAL',source:'github-actions',
      external_run_id:'gha-42',evidence_refs:['https://github.example/actions/runs/42'],
      details_json:{conclusion:'success'},observed_at:'2026-08-13T11:00:00.000Z',
      expires_at:'2026-08-14T11:00:00.000Z',recorded_by:'github-app',
    };
    const valid={...base,evidence_hash:await sha256Canonical(runtimeGateEvidencePayload(base))};
    const options={allow_external:true,sha_bound:true,final_sha:SHA,max_age_hours:24,now_ms:nowMs,environment:'production'};
    expect(await verifyRuntimeGateEvidence(valid,options)).toMatchObject({ok:true,status:'VERIFIED',identity_hash:''});
    expect(await verifyRuntimeGateEvidence(valid,{...options,allow_external:false})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_kind_not_authoritative'])});
    expect(await verifyRuntimeGateEvidence({...valid,git_sha:'f'.repeat(40)},options)).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_final_sha_mismatch','runtime_evidence_hash_mismatch'])});
    expect(await verifyRuntimeGateEvidence({...valid,details_json:{conclusion:'forged'}},options)).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_hash_mismatch'])});
    expect(await verifyRuntimeGateEvidence(valid,{...options,now_ms:Date.parse('2026-08-15T12:00:00.000Z')})).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_stale','runtime_evidence_expired'])});
    expect(await verifyRuntimeGateEvidence({...valid,expires_at:undefined},options)).toMatchObject({ok:false,blockers:expect.arrayContaining(['runtime_evidence_expiry_required','runtime_evidence_hash_mismatch'])});
  });

  it('uses five real durable adapters but keeps them UNKNOWN until exact coverage and 20 samples',()=>{
    expect(SERVICE_LEVEL_TARGETS).toHaveLength(5);
    expect(SERVICE_LEVEL_TARGETS.map((row)=>row.slo_key)).toEqual([
      'analyzer_submission','document_extraction','commercial_send','billing_reconciliation','company_orchestrator',
    ]);
    expect(SERVICE_LEVEL_TARGETS.map((row)=>row.source_entity)).toEqual(['ApiActivityLog','ApiActivityLog','ApiActivityLog','SchedulerRun','SchedulerRun+AgentTask']);
    const analyzer=SERVICE_LEVEL_TARGETS.find((row)=>row.slo_key==='analyzer_submission');
    const unavailable=evaluateServiceLevelRows(analyzer,[],{...coverage,coverage_status:'UNAVAILABLE',coverage_blockers:['source_read_failed']});
    expect(unavailable).toMatchObject({status:'UNKNOWN',coverage_status:'UNAVAILABLE',sample_count:0});
    expect(evaluateServiceLevelRows(analyzer,[apiReceipt(1)],coverage)).toMatchObject({status:'UNKNOWN',coverage_status:'COMPLETE',sample_count:1});
    expect(evaluateServiceLevelRows(analyzer,Array.from({length:20},(_,i)=>apiReceipt(i)),coverage)).toMatchObject({status:'MET',coverage_status:'COMPLETE',sample_count:20,success_count:20});
    expect(evaluateServiceLevelRows(analyzer,Array.from({length:20},(_,i)=>apiReceipt(i)),{...coverage,coverage_epoch:'2026-07-15T12:00:00.000Z'})).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_coverage_epoch_does_not_cover_window'])});
  });

  it('treats failure, exclusion, nonterminal and runtime mismatch without false coverage',()=>{
    const analyzer=SERVICE_LEVEL_TARGETS.find((row)=>row.slo_key==='analyzer_submission');
    const rows=[...Array.from({length:19},(_,i)=>apiReceipt(i)),apiReceipt(19,'FAILED'),apiReceipt(20,'EXCLUDED',{status_code:200})];
    expect(evaluateServiceLevelRows(analyzer,rows,coverage)).toMatchObject({status:'BREACHED',sample_count:20,success_count:19,source_record_count:21});
    expect(evaluateServiceLevelRows(analyzer,[...rows,apiReceipt(21,'STARTED',{completed_at:undefined})],coverage)).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_observation_nonterminal'])});
    expect(evaluateServiceLevelRows(analyzer,[apiReceipt(1,'SUCCEEDED',{runtime_identity_hash:'c'.repeat(64)})],coverage)).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_runtime_identity_mismatch'])});
    expect(evaluateServiceLevelRows(analyzer,[apiReceipt(1,'SUCCEEDED',{started_at:'2026-01-01T00:00:00.000Z',completed_at:'2026-01-01T00:00:00.100Z'})],coverage)).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_observation_outside_window'])});
    expect(evaluateServiceLevelRows(analyzer,[apiReceipt(1,'SUCCEEDED',{duration_ms:999})],coverage)).toMatchObject({status:'UNKNOWN'});
    expect(evaluateServiceLevelRows(analyzer,[apiReceipt(1,'SUCCEEDED',{duration_ms:20_000})],coverage)).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_observation_duration_or_terminal_status_invalid'])});
  });

  it('adapts billing SchedulerRun and reconciles Company SchedulerRun to its exact AgentTask',()=>{
    const billing=SERVICE_LEVEL_TARGETS.find((row)=>row.slo_key==='billing_reconciliation');
    const billingRows=[...Array.from({length:19},(_,i)=>schedulerReceipt(i)),schedulerReceipt(19,'FAILED'),schedulerReceipt(20,'DUPLICATE_BLOCKED','reconcileRecoverBilling',{duplicate_of:'prior',details_json:{duplicate_proven:true}})];
    expect(evaluateServiceLevelRows(billing,billingRows,coverage)).toMatchObject({status:'BREACHED',sample_count:20,success_count:19,source_record_count:21});
    expect(evaluateServiceLevelRows(billing,[schedulerReceipt(1,'RUNNING','reconcileRecoverBilling',{completed_at:undefined})],coverage)).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_scheduler_attempt_nonterminal'])});

    const company=SERVICE_LEVEL_TARGETS.find((row)=>row.slo_key==='company_orchestrator');
    const scheduler=schedulerReceipt(1,'COMPLETED','autonomousCompanyOrchestrator');
    const task={id:'task-1',agent_name:'autonomous_company_orchestrator',task_type:'p8_company_coordination',status:'completed',started_at:scheduler.started_at,completed_at:scheduler.completed_at,source_refs_json:[{type:'SchedulerRun',id:scheduler.id}]};
    expect(evaluateServiceLevelRows(company,{SchedulerRun:[scheduler],AgentTask:[task]},coverage)).toMatchObject({status:'UNKNOWN',coverage_status:'COMPLETE',sample_count:1,success_count:1});
    expect(evaluateServiceLevelRows(company,{SchedulerRun:[scheduler],AgentTask:[{...task,source_refs_json:[{type:'SchedulerRun',id:'missing'}]}]},coverage)).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_company_task_orphan','slo_company_scheduler_task_missing'])});
    expect(evaluateServiceLevelRows(company,{SchedulerRun:[{...scheduler,status:'FAILED'}],AgentTask:[task]},coverage)).toMatchObject({status:'UNKNOWN',coverage_blockers:expect.arrayContaining(['slo_company_scheduler_task_outcome_mismatch'])});
  });

  it('paginates sources exactly and fails closed on read, duplicate page or cap',async()=>{
    const target=SERVICE_LEVEL_TARGETS[0];
    const values=[apiReceipt(0),apiReceipt(1),apiReceipt(2)];
    const entity={filter:async(_q,_s,limit,offset)=>values.slice(offset,offset+limit)};
    expect(await readSloSourceWindow(entity,target,WINDOW_FROM,WINDOW_TO,{page_size:2,max_pages:3})).toMatchObject({ok:true,coverage_status:'COMPLETE',rows:values});
    expect(await readSloSourceWindow({filter:async()=>{throw new Error('down');}},target,WINDOW_FROM,WINDOW_TO)).toMatchObject({ok:false,coverage_status:'UNAVAILABLE'});
    expect(await readSloSourceWindow({filter:async()=>values.slice(0,2)},target,WINDOW_FROM,WINDOW_TO,{page_size:2,max_pages:3})).toMatchObject({ok:false,coverage_status:'INCOMPLETE',blockers:expect.arrayContaining(['slo_analyzer_submission_pagination_ambiguous'])});
    const many=Array.from({length:4},(_,i)=>apiReceipt(i));
    expect(await readSloSourceWindow({filter:async(_q,_s,limit,offset)=>many.slice(offset,offset+limit)},target,WINDOW_FROM,WINDOW_TO,{page_size:2,max_pages:2})).toMatchObject({ok:false,coverage_status:'INCOMPLETE',blockers:expect.arrayContaining(['slo_analyzer_submission_page_limit_reached'])});
  });

  it('rejects stale, self-authored and non-canonical SLO snapshot targets',()=>{
    const target=SERVICE_LEVEL_TARGETS[0];
    const row={slo_key:target.slo_key,service_class:target.service_class,availability_target:target.availability_target,latency_target_ms:target.latency_p95_ms,source_entity:target.source_entity,methodology_version:'service-level-runtime-2.0.0',window_from:WINDOW_FROM,window_to:WINDOW_TO,coverage_epoch:WINDOW_FROM,calculated_at:WINDOW_TO,coverage_status:'COMPLETE',coverage_blockers:[],snapshot_integrity:'VERIFIED',snapshot_hash:HASH,source_records_hash:HASH,source_record_count:20,sample_count:20,success_count:20,latency_p95_ms:100,status:'MET',runtime_identity_hash:RECEIPT_HASH,git_sha:SHA};
    expect(serviceLevelSnapshotBlockers(row,target,{now_ms:Date.parse(WINDOW_TO),runtime_identity_hash:RECEIPT_HASH,final_sha:SHA})).toEqual([]);
    expect(serviceLevelSnapshotBlockers({...row,availability_target:0},target,{now_ms:Date.parse(WINDOW_TO),runtime_identity_hash:RECEIPT_HASH,final_sha:SHA})).toContain('slo_availability_target_mismatch');
    expect(serviceLevelSnapshotBlockers({...row,window_from:'2026-08-12T12:00:00.000Z'},target,{now_ms:Date.parse(WINDOW_TO),runtime_identity_hash:RECEIPT_HASH,final_sha:SHA})).toContain('slo_window_not_exact');
    expect(serviceLevelSnapshotBlockers({...row,calculated_at:'2000-01-01T00:00:00.000Z'},target,{now_ms:Date.parse(WINDOW_TO),runtime_identity_hash:RECEIPT_HASH,final_sha:SHA})).toContain('slo_calculation_not_fresh_or_coherent');
    expect(serviceLevelSnapshotBlockers({...row,snapshot_integrity:'CLAIMED'},target,{now_ms:Date.parse(WINDOW_TO),runtime_identity_hash:RECEIPT_HASH,final_sha:SHA})).toContain('slo_snapshot_integrity_unverified');
  });

  it('locks production evidence writes and ignores client-asserted SHA/checks',()=>{
    for(const name of ['RuntimeGateEvidence','ServiceLevelSnapshot','ReleaseVerification','ProductionReadinessSnapshot','DisasterRecoveryExercise','ApiActivityLog','SchedulerRun','CostUsageEvent','AgentTask','OperationalLog','OperatingHealthAssessment']){
      const schema=JSON.parse(fs.readFileSync(`base44/entities/${name}.jsonc`,'utf8'));
      expect(schema.rls.write.user_condition.role).toBe('__service_role_only__');
    }
    const worker=fs.readFileSync('base44/shared/logical/productionReadinessWorker.ts','utf8');
    expect(worker).toContain('runtimeDeploymentIdentity()');
    expect(worker).toContain('localChecksFromRemoteCi');
    expect(worker).toContain('produceServiceLevelSnapshots');
    expect(worker).not.toMatch(/body\.final_sha/u);
    expect(worker).not.toMatch(/body\.local_checks/u);
    expect(worker).not.toContain('safeBestEffort');
  });
});