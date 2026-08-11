export const SCHEDULER_GUARD_VERSION = 'scheduler-guard-1.0.0';

function invocationKind(req:Request) {
  if (String(req.headers.get('base44-scheduled-task') || '').toLowerCase() === 'true') return 'SCHEDULED';
  if (req.headers.get('base44-automation-id')) return 'SCHEDULED';
  if (req.headers.get('x-cambra-internal')) return 'INTERNAL';
  return 'MANUAL';
}

export async function claimSchedulerRun(svc:any, req:Request, input:{worker_key:string;cadence_seconds:number}) {
  const workerKey = String(input.worker_key || '').trim();
  const cadence = Math.max(300, Math.floor(Number(input.cadence_seconds || 300)));
  const kind = invocationKind(req);
  const now = Date.now();
  const slotMs = cadence * 1000;
  const slotStart = kind === 'SCHEDULED' ? Math.floor(now / slotMs) * slotMs : now;
  const runKey = kind === 'SCHEDULED' ? `${workerKey}:${new Date(slotStart).toISOString()}` : `${workerKey}:${kind.toLowerCase()}:${crypto.randomUUID()}`;
  const automationId = String(req.headers.get('base44-automation-id') || '');
  const row = await svc.entities.SchedulerRun.create({
    run_key:runKey, worker_key:workerKey, slot_started_at:new Date(slotStart).toISOString(), cadence_seconds:cadence,
    automation_id:automationId, invocation_kind:kind, status:'CLAIMED', details_json:{ guard_version:SCHEDULER_GUARD_VERSION },
    started_at:new Date(now).toISOString(), heartbeat_at:new Date(now).toISOString(),
  });
  if (kind !== 'SCHEDULED') {
    const running = await svc.entities.SchedulerRun.update(row.id, { status:'RUNNING' }).catch(() => row);
    return { allowed:true, run:running, run_key:runKey, invocation_kind:kind };
  }
  const peers = await svc.entities.SchedulerRun.filter({ run_key:runKey }, 'created_date', 20).catch(() => []);
  const ordered = [...peers].sort((a:any,b:any) => String(a.created_date || a.started_at || '').localeCompare(String(b.created_date || b.started_at || '')) || String(a.id).localeCompare(String(b.id)));
  const winner = ordered[0] || row;
  if (winner.id !== row.id) {
    await svc.entities.SchedulerRun.update(row.id, { status:'DUPLICATE_BLOCKED', duplicate_of:winner.id, completed_at:new Date().toISOString(), details_json:{ guard_version:SCHEDULER_GUARD_VERSION, reason:'same_worker_same_cadence_slot' } }).catch(() => null);
    return { allowed:false, duplicate:true, run:row, duplicate_of:winner.id, run_key:runKey, invocation_kind:kind };
  }
  const running = await svc.entities.SchedulerRun.update(row.id, { status:'RUNNING' }).catch(() => row);
  return { allowed:true, run:running, run_key:runKey, invocation_kind:kind };
}

export async function finishSchedulerRun(svc:any, claim:any, details:any = {}, ok = true) {
  if (!claim?.run?.id || !claim.allowed) return null;
  return svc.entities.SchedulerRun.update(claim.run.id, { status:ok ? 'COMPLETED':'FAILED', details_json:{ ...(claim.run.details_json || {}), ...details }, heartbeat_at:new Date().toISOString(), completed_at:new Date().toISOString() }).catch(() => null);
}

export const GO_CRITICAL_SCHEDULERS = Object.freeze([
  { worker_key:'processWebhookDeadLetters', cadence_seconds:300, responsibility:'replay webhook dead letters', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_HANDLER_GUARDS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'WebhookDeadLetter + AutonomyIncident', side_effects:'webhook replay and ledger updates', tenant_scope:'multi-tenant entity scoped', authority:'internal secret + service role' },
  { worker_key:'eclLifecycleScheduler', cadence_seconds:900, responsibility:'ECL lifecycle transitions', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_STATE_GUARDS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AutonomyIncident', side_effects:'ECL state transitions', tenant_scope:'platform', authority:'internal secret + service role' },
  { worker_key:'reconcileRecoverBilling', cadence_seconds:900, responsibility:'Recover billing reconciliation', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_LEDGER_GUARDS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AutonomyIncident', side_effects:'billing reconciliation writes', tenant_scope:'multi-tenant entity scoped', authority:'internal secret + service role' },
  { worker_key:'autonomousPartnerWorker', cadence_seconds:3600, responsibility:'partner acquisition policy loop', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_THREAD_GUARDS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AgentTask + AutonomyIncident', side_effects:'outreach drafts and governed sends', tenant_scope:'platform acquisition', authority:'internal secret + policy + service role' },
  { worker_key:'alwaysOnLeadDiscoveryWorker', cadence_seconds:3600, responsibility:'lead reservoir discovery', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_LEAD_DEDUPE', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AgentTask + AutonomyIncident', side_effects:'lead and reservoir writes', tenant_scope:'platform acquisition', authority:'internal secret + service role' },
  { worker_key:'commercialFollowUpWorker', cadence_seconds:3600, responsibility:'commercial follow-up queue', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_MESSAGE_KEYS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'thread REVIEW_REQUIRED + AutonomyIncident', side_effects:'governed external email', tenant_scope:'multi-tenant thread scoped', authority:'internal secret + policy + sending profile' },
  { worker_key:'postMeetingWorker', cadence_seconds:3600, responsibility:'post-meeting follow-up', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_THREAD_STATE', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AgentTask + AutonomyIncident', side_effects:'thread/task updates and governed sends', tenant_scope:'multi-tenant thread scoped', authority:'internal secret + policy' },
  { worker_key:'outboundVolumeWorker', cadence_seconds:3600, responsibility:'canary volume outbound', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_MESSAGE_KEYS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'thread pause + AutonomyIncident', side_effects:'governed external email', tenant_scope:'platform acquisition', authority:'internal secret + policy + sending profile' },
  { worker_key:'outboundDeliverabilityManager', cadence_seconds:3600, responsibility:'deliverability and suppression controls', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_EVENT_KEYS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AutonomyIncident', side_effects:'profile/suppression/control updates', tenant_scope:'platform', authority:'internal secret + service role' },
  { worker_key:'costGovernanceWorker', cadence_seconds:3600, responsibility:'cost budget anomaly enforcement', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_BUDGET_STATE', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AutonomyIncident + emergency stop', side_effects:'budget controls and kill switch', tenant_scope:'platform', authority:'internal secret + service role' },
  { worker_key:'getEuropeMarketsCommandCenter', cadence_seconds:21600, responsibility:'European market and growth snapshots', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_SNAPSHOT_KEYS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AutonomyIncident', side_effects:'market/growth snapshot writes', tenant_scope:'platform', authority:'internal secret + service role' },
  { worker_key:'productionReadinessWorker', cadence_seconds:86400, responsibility:'production readiness snapshot', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_SNAPSHOT_KEYS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AutonomyIncident', side_effects:'readiness snapshot writes', tenant_scope:'platform', authority:'internal secret + service role' },
  { worker_key:'operatingHealthWorker', cadence_seconds:86400, responsibility:'operating health snapshot', owner_system:'Base44', trigger:'scheduled', timeout_seconds:'UNKNOWN', concurrency:'AT_LEAST_ONCE_SLOT_GUARDED', idempotency:'RUN_KEY_AND_SNAPSHOT_KEYS', retry_backoff:'HANDLER_SPECIFIC', dlq_escalation:'AutonomyIncident', side_effects:'operating health writes', tenant_scope:'platform', authority:'internal secret + service role' },
]);

export function evaluateSchedulerEvidence(runs:any[] = [], nowMs = Date.now()) {
  const rows = GO_CRITICAL_SCHEDULERS.map((required) => {
    const workerRuns = runs.filter((run:any) => run.worker_key === required.worker_key && run.invocation_kind === 'SCHEDULED');
    const ordered=[...workerRuns].sort((a:any,b:any) => Date.parse(b.started_at || '') - Date.parse(a.started_at || ''));
    const latestRun=ordered[0]||null;
    const latest = ordered.find((run:any) => run.status === 'COMPLETED') || null;
    const ageSeconds = latest ? Math.max(0, (nowMs - Date.parse(latest.started_at || '')) / 1000) : null;
    const duplicates = workerRuns.filter((run:any) => run.status === 'DUPLICATE_BLOCKED' && nowMs - Date.parse(run.started_at || '') <= required.cadence_seconds * 3000).length;
    const executedByKey = new Map<string,number>();
    for (const run of workerRuns.filter((row:any) => ['RUNNING','COMPLETED'].includes(String(row.status)))) executedByKey.set(String(run.run_key), (executedByKey.get(String(run.run_key)) || 0) + 1);
    const duplicateExecutions = [...executedByKey.values()].filter((count) => count > 1).length;
    let status:'HEALTHY'|'DEGRADED'|'STALE'|'FAILED'|'UNKNOWN'='UNKNOWN';
    if(latestRun?.status==='FAILED')status='FAILED';
    else if(latest&&Number.isFinite(ageSeconds)&&Number(ageSeconds)>required.cadence_seconds*2.5)status='STALE';
    else if(latest&&duplicateExecutions===0)status='HEALTHY';
    else if(latestRun&&['CLAIMED','RUNNING','DUPLICATE_BLOCKED'].includes(String(latestRun.status)))status='DEGRADED';
    const active=status==='HEALTHY';
    return { ...required, latest, latest_run:latestRun, age_seconds:ageSeconds, status, active, duplicate_attempts_blocked:duplicates, duplicate_executions:duplicateExecutions };
  });
  return {
    active:rows.every((row) => row.active),
    no_duplicate_execution:rows.every((row) => row.duplicate_executions === 0),
    rows,
    missing_or_stale:rows.filter((row) => !row.active).map((row) => row.worker_key),
    duplicate_workers:rows.filter((row) => row.duplicate_executions > 0).map((row) => row.worker_key),
    blocked_duplicate_attempts:rows.reduce((sum,row) => sum + row.duplicate_attempts_blocked, 0),
    version:SCHEDULER_GUARD_VERSION,
  };
}
