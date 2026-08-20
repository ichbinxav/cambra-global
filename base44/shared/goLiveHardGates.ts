import {
  EXPECTED_BASE44_LOGICAL_ROUTES,
  EXPECTED_BASE44_PHYSICAL_FUNCTIONS,
  verifyRuntimeGateEvidence,
} from './runtimeEvidence.ts';

export const GO_LIVE_HARD_GATES_VERSION = 'go-live-hard-gates-1.0.1';

export const GO_LIVE_GATE_REQUIREMENTS = Object.freeze([
  { key:'REMOTE_CI_FINAL_SHA', label:'Remote GitHub CI on final SHA', kinds:['EXTERNAL'], sha_bound:true, max_age_hours:168, category:'release' },
  { key:'BASE44_RUNTIME_PARITY', label:'Base44 runtime matches final source tree', kinds:['REAL_RUNTIME'], sha_bound:true, max_age_hours:24, category:'runtime' },
  { key:'DELIVERABILITY_DNS', label:'SPF, DKIM, DMARC and credentials verify for configured sending profiles', kinds:['REAL_RUNTIME'], sha_bound:false, max_age_hours:24, category:'outbound' },
  { key:'SUPPRESSION_LIFECYCLE', label:'Bounce, complaint, unsubscribe and suppression loop verified', kinds:['REAL_RUNTIME','OPERATOR_EXERCISE'], sha_bound:false, max_age_hours:168, category:'outbound' },
  { key:'SCHEDULERS_ACTIVE', label:'All GO-critical schedulers alive at their deployed cadence', kinds:['REAL_RUNTIME'], sha_bound:true, max_age_hours:24, category:'runtime' },
  { key:'SCHEDULER_NO_DUPLICATES', label:'No duplicate GO-critical scheduler execution observed', kinds:['REAL_RUNTIME'], sha_bound:true, max_age_hours:24, category:'runtime' },
  { key:'COST_BUDGETS', label:'AI, API, enrichment and email daily/monthly budgets active', kinds:['REAL_RUNTIME'], sha_bound:false, max_age_hours:24, category:'cost' },
  { key:'COST_ANOMALY_ALERTS', label:'Cost anomaly alert and budget kill-switch exercised in real runtime', kinds:['OPERATOR_EXERCISE'], sha_bound:false, max_age_hours:168, category:'cost' },
  { key:'FOUNDER_CONTROL', label:'Founder can change limits, pause, resume, approve, reject and inspect blockers', kinds:['OPERATOR_EXERCISE'], sha_bound:true, max_age_hours:168, category:'control' },
  { key:'EMERGENCY_STOP', label:'Global emergency stop blocks all external effect classes', kinds:['OPERATOR_EXERCISE'], sha_bound:true, max_age_hours:168, category:'control' },
  { key:'SAFE_RESUME', label:'Safe resume reopens read-only intelligence and keeps effects gated', kinds:['OPERATOR_EXERCISE'], sha_bound:true, max_age_hours:168, category:'control' },
  { key:'OBSERVABILITY_LOOP', label:'Post-deploy observe → decide → act → verify loop is alive', kinds:['REAL_RUNTIME'], sha_bound:true, max_age_hours:24, category:'runtime' },
  { key:'REAL_RESTORE', label:'Real backup restore meets declared RPO/RTO', kinds:['EXTERNAL','OPERATOR_EXERCISE'], sha_bound:false, max_age_hours:2160, category:'resilience' },
  { key:'DOCUMENT_GOLDEN_CORPUS', label:'Real anonymized document golden corpus passes', kinds:['EXTERNAL','REAL_RUNTIME'], sha_bound:true, max_age_hours:720, category:'extractor' },
  { key:'DEPENDENCY_MONITOR', label:'Dependency/security alert delivery proven', kinds:['EXTERNAL','REAL_RUNTIME'], sha_bound:true, max_age_hours:168, category:'security' },
]);

function newest(rows:any[]) {
  return [...rows].sort((a:any,b:any) => Date.parse(b.observed_at || b.verified_at || b.completed_at || '') - Date.parse(a.observed_at || a.verified_at || a.completed_at || ''))[0] || null;
}

export async function evidenceForGate(rows:any[], requirement:any, input:any) {
  const candidates = (rows || []).filter((row:any) => row.gate_key === requirement.key);
  const row = newest(candidates);
  const blockers:string[] = [];
  if (!row) blockers.push('evidence_missing');
  if (row && row.status !== 'PASS') blockers.push(`evidence_${String(row.status || 'NOT_RUN').toLowerCase()}`);
  if (row && !requirement.kinds.includes(row.evidence_kind)) blockers.push('evidence_kind_not_acceptable');
  if (row && ['REAL_RUNTIME','OPERATOR_EXERCISE'].includes(String(row.evidence_kind || ''))) {
    if (row.identity_status !== 'COMPLETE') blockers.push('runtime_identity_incomplete');
    if (!/^[a-f0-9]{64}$/iu.test(String(row.identity_hash || ''))) blockers.push('runtime_identity_hash_invalid');
    if (
      Number(row.physical_function_count) !== EXPECTED_BASE44_PHYSICAL_FUNCTIONS ||
      Number(row.logical_route_count) !== EXPECTED_BASE44_LOGICAL_ROUTES
    ) blockers.push('runtime_topology_identity_mismatch');
  }
  if (row && requirement.sha_bound && (!input.final_sha || row.git_sha !== input.final_sha)) blockers.push('evidence_final_sha_mismatch');
  const observed = row ? Date.parse(row.observed_at || row.verified_at || row.completed_at || '') : NaN;
  if (row && (!Number.isFinite(observed) || observed > input.now_ms + 5 * 60_000 || input.now_ms - observed > requirement.max_age_hours * 3600000)) blockers.push(observed > input.now_ms + 5 * 60_000 ? 'evidence_from_future':'evidence_stale');
  if (row?.expires_at && (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) <= input.now_ms)) blockers.push(!Number.isFinite(Date.parse(row.expires_at)) ? 'evidence_expiry_invalid':'evidence_expired');
  if (row) {
    const integrity=await verifyRuntimeGateEvidence(row,{
      now_ms:input.now_ms,
      environment:'production',
      max_age_hours:requirement.max_age_hours,
      allow_external:requirement.kinds.includes('EXTERNAL'),
      sha_bound:requirement.sha_bound,
      final_sha:input.final_sha,
    });
    if(!integrity.ok)blockers.push(...integrity.blockers.map((blocker:string)=>`evidence_integrity:${blocker}`));
  }
  return { key:requirement.key, label:requirement.label, category:requirement.category, status:blockers.length ? 'BLOCKED':'PASS', blockers, evidence:row, requirement };
}

export async function evaluateGoLiveHardGates(input:any = {}) {
  const nowMs = Number(input.now_ms || Date.now());
  const rows = await Promise.all(GO_LIVE_GATE_REQUIREMENTS.map((requirement) => evidenceForGate(input.evidence || [], requirement, { final_sha:String(input.final_sha || ''), now_ms:nowMs })));
  const directBlockers = Array.isArray(input.direct_blockers) ? input.direct_blockers.filter(Boolean).map(String) : [];
  const gateBlockers = rows.filter((row) => row.status !== 'PASS').map((row) => `${row.key}:${row.blockers.join(',')}`);
  const blockers = [...new Set([...directBlockers, ...gateBlockers])];
  return {
    classification:blockers.length === 0 ? 'GO_READY_FOR_CANARY':'NOT_GO_READY',
    allowed:blockers.length === 0,
    blockers,
    gates:rows,
    passed:rows.filter((row) => row.status === 'PASS').length,
    total:rows.length,
    evaluated_at:new Date(nowMs).toISOString(),
    final_sha:String(input.final_sha || ''),
    version:GO_LIVE_HARD_GATES_VERSION,
  };
}

export function normalizeReleaseEvidence(input:any = {}) {
  const rows:any[] = [];
  const push = (gate_key:string, value:any, kind='EXTERNAL') => {
    if (!value) return;
    rows.push({ evidence_key:value.verification_key || `${gate_key}:${value.id || 'latest'}`, gate_key, status:value.status || 'NOT_RUN', evidence_kind:kind, source:value.source || gate_key, git_sha:value.git_sha || '', evidence_refs:[value.evidence_url, ...(value.evidence_refs || [])].filter(Boolean), details_json:value.metrics_json || value.data_integrity_checks_json || {}, observed_at:value.verified_at || value.completed_at || value.started_at, expires_at:value.expires_at });
  };
  push('REMOTE_CI_FINAL_SHA', input.remote_ci);
  push('BASE44_RUNTIME_PARITY', input.base44_runtime, 'REAL_RUNTIME');
  push('DOCUMENT_GOLDEN_CORPUS', input.document_extraction_eval);
  push('DEPENDENCY_MONITOR', input.dependency_monitor);
  push('REAL_RESTORE', input.restore_exercise, 'OPERATOR_EXERCISE');
  return rows;
}
