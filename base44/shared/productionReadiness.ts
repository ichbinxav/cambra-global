export const PRODUCTION_READINESS_VERSION = 'p11-production-readiness-1.0.0';
export const FINDING_SEVERITIES = Object.freeze(['CRITICAL','HIGH','MEDIUM','LOW','INFO']);

export function evaluateSlo(target:any, snapshot:any) {
  if (!snapshot || Number(snapshot.sample_count || 0) < 20) return { status:'INSUFFICIENT_EVIDENCE',met:false,reason_code:'minimum_sample_not_met' };
  const availability = Number(snapshot.success_count || 0) / Math.max(1, Number(snapshot.sample_count || 0));
  const availabilityMet = availability >= Number(target.availability_target);
  const latencyMet = Number(snapshot.latency_p95_ms) <= Number(target.latency_p95_ms);
  return { status:availabilityMet && latencyMet ? 'MET' : 'BREACHED',met:availabilityMet && latencyMet,availability,availability_met:availabilityMet,latency_met:latencyMet };
}

export function evaluateProductionSeal(input:any = {}) {
  const findings = Array.isArray(input.findings) ? input.findings : [];
  const internalBlockers = findings.filter((x:any) => ['CRITICAL','HIGH'].includes(String(x.severity)) && !['RESOLVED','ACCEPTED'].includes(String(x.status)));
  const localChecks = ['clean','policy','markets','locales','ecl','durability','documentation','lint','typecheck_critical','typecheck_full','tests','build','release'].filter((key) => input.local_checks?.[key] !== 'PASS');
  const external:any[] = [];
  if (input.remote_ci?.status !== 'PASS' || !input.remote_ci?.sha || input.remote_ci.sha !== input.final_sha) external.push({ code:'REMOTE_CI_FINAL_SHA_REQUIRED',owner:'github' });
  if (input.base44_runtime?.status !== 'PASS') external.push({ code:'BASE44_RUNTIME_PROOF_REQUIRED',owner:'base44' });
  if (input.restore_exercise?.status !== 'PASS') external.push({ code:'REAL_RESTORE_EXERCISE_REQUIRED',owner:'operations' });
  if (input.document_extraction_eval?.status !== 'PASS') external.push({ code:'REAL_DOCUMENT_GOLDEN_CORPUS_REQUIRED',owner:'data_operations' });
  if (input.dependency_monitor?.status !== 'PASS') external.push({ code:'DEPENDENCY_ALERT_PROOF_REQUIRED',owner:'engineering' });
  const technicallyComplete = internalBlockers.length === 0 && localChecks.length === 0;
  const sealed = technicallyComplete && external.length === 0;
  return { status:sealed ? 'P11_PASS_SEALED' : 'P11_BLOCKED_NOT_SEALED',technically_complete:technicallyComplete,sealed,internal_blockers:internalBlockers.map((x:any) => x.finding_id || x.id),failed_local_checks:localChecks,external_blockers:external,version:PRODUCTION_READINESS_VERSION };
}

export function classifyFinding(input:any) {
  const severity = FINDING_SEVERITIES.includes(String(input.severity)) ? String(input.severity) : 'MEDIUM';
  return { finding_id:String(input.finding_id || ''),severity,status:String(input.status || 'OPEN'),category:String(input.category || 'security'),summary:String(input.summary || ''),evidence_refs:Array.isArray(input.evidence_refs) ? input.evidence_refs : [],remediation_refs:Array.isArray(input.remediation_refs) ? input.remediation_refs : [] };
}
