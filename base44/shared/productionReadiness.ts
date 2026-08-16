import {
  SERVICE_LEVEL_FRESHNESS_MS,
  SERVICE_LEVEL_RUNTIME_VERSION,
  SERVICE_LEVEL_TARGET_BY_KEY,
  SERVICE_LEVEL_TARGETS,
  SERVICE_LEVEL_WINDOW_TOLERANCE_MS,
} from './serviceLevelCatalog.ts';

export const PRODUCTION_READINESS_VERSION = 'p11-production-readiness-2.0.0';
export const FINDING_SEVERITIES = Object.freeze(['CRITICAL','HIGH','MEDIUM','LOW','INFO']);

export const REQUIRED_SERVICE_LEVELS = Object.freeze(
  SERVICE_LEVEL_TARGETS.map((target) => target.slo_key),
);

export function evaluateSlo(target:any, snapshot:any) {
  if (snapshot?.coverage_status && snapshot.coverage_status !== 'COMPLETE') return { status:'UNKNOWN',met:false,reason_code:'source_coverage_incomplete' };
  if (!snapshot || Number(snapshot.sample_count || 0) < 20) return { status:'INSUFFICIENT_EVIDENCE',met:false,reason_code:'minimum_sample_not_met' };
  const samples=Number(snapshot.sample_count),successes=Number(snapshot.success_count),latency=Number(snapshot.latency_p95_ms),availabilityTarget=Number(target.availability_target),latencyTarget=Number(target.latency_p95_ms);
  if(!Number.isInteger(samples)||!Number.isInteger(successes)||successes<0||successes>samples||!Number.isFinite(latency)||latency<0||!Number.isFinite(availabilityTarget)||availabilityTarget<=0||availabilityTarget>1||!Number.isFinite(latencyTarget)||latencyTarget<=0)return{status:'UNKNOWN',met:false,reason_code:'invalid_slo_observation_or_target'};
  const availability = successes / samples;
  const availabilityMet = availability >= availabilityTarget;
  const latencyMet = latency <= latencyTarget;
  return { status:availabilityMet && latencyMet ? 'MET' : 'BREACHED',met:availabilityMet && latencyMet,availability,availability_met:availabilityMet,latency_met:latencyMet };
}

export function serviceLevelSnapshotBlockers(
  row:any,
  target:any,
  input:any = {},
) {
  const blockers:string[]=[];
  if (!row) return ['slo_snapshot_missing'];
  const nowMs=Number.isFinite(Number(input.now_ms))?Number(input.now_ms):Date.now();
  const windowFrom=Date.parse(String(row.window_from||''));
  const windowTo=Date.parse(String(row.window_to||''));
  const calculated=Date.parse(String(row.calculated_at||''));
  const epoch=Date.parse(String(row.coverage_epoch||''));
  const expectedDuration=Number(target.window_days)*86_400_000;
  if(row.slo_key!==target.slo_key)blockers.push('slo_key_mismatch');
  if(row.service_class!==target.service_class)blockers.push('slo_service_class_mismatch');
  if(Number(row.availability_target)!==Number(target.availability_target))blockers.push('slo_availability_target_mismatch');
  if(Number(row.latency_target_ms)!==Number(target.latency_p95_ms))blockers.push('slo_latency_target_mismatch');
  if(row.source_entity!==target.source_entity)blockers.push('slo_source_entity_mismatch');
  if(row.methodology_version!==SERVICE_LEVEL_RUNTIME_VERSION)blockers.push('slo_methodology_version_mismatch');
  if(!Number.isFinite(windowFrom)||!Number.isFinite(windowTo)||windowFrom>=windowTo||Math.abs((windowTo-windowFrom)-expectedDuration)>SERVICE_LEVEL_WINDOW_TOLERANCE_MS)blockers.push('slo_window_not_exact');
  if(!Number.isFinite(epoch)||!Number.isFinite(windowFrom)||epoch>windowFrom+SERVICE_LEVEL_WINDOW_TOLERANCE_MS)blockers.push('slo_coverage_epoch_incomplete');
  if(!Number.isFinite(windowTo)||windowTo>nowMs+5*60_000||nowMs-windowTo>SERVICE_LEVEL_FRESHNESS_MS)blockers.push('slo_window_stale_or_future');
  if(!Number.isFinite(calculated)||calculated>nowMs+5*60_000||nowMs-calculated>SERVICE_LEVEL_FRESHNESS_MS||!Number.isFinite(windowTo)||Math.abs(calculated-windowTo)>SERVICE_LEVEL_WINDOW_TOLERANCE_MS)blockers.push('slo_calculation_not_fresh_or_coherent');
  if(row.coverage_status!=='COMPLETE'||(Array.isArray(row.coverage_blockers)&&row.coverage_blockers.length>0))blockers.push('slo_source_coverage_incomplete');
  if(row.snapshot_integrity!=='VERIFIED')blockers.push('slo_snapshot_integrity_unverified');
  if(!/^[a-f0-9]{64}$/iu.test(String(row.snapshot_hash||'')))blockers.push('slo_snapshot_hash_invalid');
  if(!/^[a-f0-9]{64}$/iu.test(String(row.source_records_hash||'')))blockers.push('slo_source_records_hash_invalid');
  if(!Number.isInteger(Number(row.source_record_count))||Number(row.source_record_count)<Number(row.sample_count||0))blockers.push('slo_source_record_count_invalid');
  if(!row.runtime_identity_hash||row.runtime_identity_hash!==input.runtime_identity_hash)blockers.push('slo_runtime_identity_mismatch');
  if(row.git_sha!==input.final_sha)blockers.push('slo_final_sha_mismatch');
  const measured=evaluateSlo(target,row);
  if(measured.status!=='MET'||row.status!=='MET')blockers.push('slo_target_not_met');
  return [...new Set(blockers)];
}

export function evaluateProductionSeal(input:any = {}) {
  const nowMs=Number.isFinite(Number(input.now_ms))?Number(input.now_ms):Date.now();
  const findings = Array.isArray(input.findings) ? input.findings : [];
  // An ACCEPTED risk is still an open production risk. Only remediation that
  // reached RESOLVED may stop blocking a HIGH/CRITICAL finding.
  const internalBlockers = findings.filter((x:any) =>
    ['CRITICAL','HIGH'].includes(String(x.severity)) && String(x.status) !== 'RESOLVED'
  );
  const localChecks = ['clean','policy','markets','locales','ecl','durability','documentation','lint','typecheck_critical','typecheck_full','tests','build','release'].filter((key) => input.local_checks?.[key] !== 'PASS');
  const external:any[] = [];
  const remoteSha=String(input.remote_ci?.git_sha||input.remote_ci?.sha||'');
  if (!/^[a-f0-9]{40}$/iu.test(String(input.final_sha||'')) || input.remote_ci?.status !== 'PASS' || remoteSha !== input.final_sha || input.remote_ci?.evidence_integrity!=='VERIFIED') external.push({ code:'REMOTE_CI_FINAL_SHA_REQUIRED',owner:'github',blockers:input.remote_ci?.evidence_integrity_blockers||['remote_ci_evidence_integrity_unverified'] });
  if (input.base44_runtime?.status !== 'PASS'||input.base44_runtime?.evidence_integrity!=='VERIFIED') external.push({ code:'BASE44_RUNTIME_PROOF_REQUIRED',owner:'base44',blockers:input.base44_runtime?.evidence_integrity_blockers||['runtime_evidence_integrity_unverified'] });
  if (input.restore_exercise?.status !== 'PASS'||input.restore_exercise?.evidence_integrity!=='VERIFIED') external.push({ code:'REAL_RESTORE_EXERCISE_REQUIRED',owner:'operations',blockers:input.restore_exercise?.evidence_integrity_blockers||['restore_evidence_integrity_unverified'] });
  if (input.document_extraction_eval?.status !== 'PASS'||input.document_extraction_eval?.evidence_integrity!=='VERIFIED') external.push({ code:'REAL_DOCUMENT_GOLDEN_CORPUS_REQUIRED',owner:'data_operations',blockers:input.document_extraction_eval?.evidence_integrity_blockers||['document_evidence_integrity_unverified'] });
  if (input.dependency_monitor?.status !== 'PASS'||input.dependency_monitor?.evidence_integrity!=='VERIFIED') external.push({ code:'DEPENDENCY_ALERT_PROOF_REQUIRED',owner:'engineering',blockers:input.dependency_monitor?.evidence_integrity_blockers||['dependency_evidence_integrity_unverified'] });
  if (input.runtime_identity?.status !== 'PASS') external.push({ code:'IMMUTABLE_RUNTIME_IDENTITY_REQUIRED',owner:'platform_engineering' });
  if(input.source_coverage?.status!=='COMPLETE')external.push({code:'PRODUCTION_EVIDENCE_SOURCE_COVERAGE_REQUIRED',owner:'platform_engineering',blockers:input.source_coverage?.blockers||['source_coverage_unknown']});
  const latestSlos=new Map<string,any>();
  for(const row of [...(Array.isArray(input.service_levels)?input.service_levels:[])].sort((a:any,b:any)=>Date.parse(String(b?.calculated_at||b?.window_to||''))-Date.parse(String(a?.calculated_at||a?.window_to||'')))){const key=String(row?.slo_key||'');if(key&&!latestSlos.has(key))latestSlos.set(key,row)}
  const sloBlockers:any={};
  for(const key of REQUIRED_SERVICE_LEVELS){
    const target=SERVICE_LEVEL_TARGET_BY_KEY.get(key),row=latestSlos.get(key);
    const blockers=serviceLevelSnapshotBlockers(row,target,{now_ms:nowMs,runtime_identity_hash:input.runtime_identity?.identity_hash,final_sha:input.final_sha});
    if(blockers.length)sloBlockers[key]=blockers;
  }
  const missingOrFailedSlos=Object.keys(sloBlockers);
  if(missingOrFailedSlos.length)external.push({code:'MEASURED_SERVICE_LEVEL_EVIDENCE_REQUIRED',owner:'site_reliability',slo_keys:missingOrFailedSlos,slo_blockers:sloBlockers});
  const technicallyComplete = internalBlockers.length === 0 && localChecks.length === 0;
  const sealed = technicallyComplete && external.length === 0;
  return { status:sealed ? 'P11_PASS_SEALED' : 'P11_BLOCKED_NOT_SEALED',technically_complete:technicallyComplete,sealed,internal_blockers:internalBlockers.map((x:any) => x.finding_id || x.id),failed_local_checks:localChecks,external_blockers:external,version:PRODUCTION_READINESS_VERSION };
}

export function classifyFinding(input:any) {
  const severity = FINDING_SEVERITIES.includes(String(input.severity)) ? String(input.severity) : 'MEDIUM';
  return { finding_id:String(input.finding_id || ''),severity,status:String(input.status || 'OPEN'),category:String(input.category || 'security'),summary:String(input.summary || ''),evidence_refs:Array.isArray(input.evidence_refs) ? input.evidence_refs : [],remediation_refs:Array.isArray(input.remediation_refs) ? input.remediation_refs : [] };
}
