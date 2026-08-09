// eclOperationalRecovery — CAMBRA v0.66.0 / ECL P7.
// Pure operational contracts shared by the health sweep, incident workflow and
// closure tests. No SDK, persistence, network, clock reads or economic writes.

export const P7_WORKERS = Object.freeze({
  ecl_lifecycle_scheduler: { maxAgeMinutes: 40, recoveryAction: 'run_ecl_lifecycle_scheduler' },
  recover_billing_reconciler: { maxAgeMinutes: 40, recoveryAction: 'run_recover_billing_reconciler' },
  webhook_dead_letter_processor: { maxAgeMinutes: 20, recoveryAction: 'run_webhook_dead_letters' },
});

export const P7_ACTIVE_INCIDENT_STATUSES = Object.freeze(['open', 'acknowledged', 'recovering']);
export const INCIDENT_BUCKET_MINUTES = 10;

export type P7IncidentSignal = {
  dedupeKey: string;
  domain: 'evidence_lifecycle' | 'billing_reconciliation' | 'webhook_delivery' | 'review_workflow' | 'platform';
  incidentType: string;
  severity: 'warning' | 'critical';
  recoveryAction: 'run_ecl_lifecycle_scheduler' | 'run_recover_billing_reconciler' | 'run_webhook_dead_letters' | 'replay_webhook_dead_letter' | 'inspect_manual';
  summary: string;
  subjectType?: string;
  subjectId?: string;
  details?: Record<string, unknown>;
};

function timeOf(task: any): number | null {
  const raw = task?.completed_at || task?.created_date || task?.started_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function workerFreshness(agentName: string, tasks: any[], nowMs: number, maxAgeMinutes: number) {
  const completed = (tasks || [])
    .filter((task) => task?.agent_name === agentName && task?.status === 'completed')
    .map((task) => ({ task, at: timeOf(task) }))
    .filter((entry) => entry.at !== null)
    .sort((a, b) => Number(b.at) - Number(a.at));
  const latest = completed[0] || null;
  if (!latest) {
    return { healthy: false, lastCompletedAt: null, ageMinutes: null, reason: 'no_completed_run' };
  }
  const ageMinutes = Math.max(0, Math.floor((nowMs - Number(latest.at)) / 60000));
  return {
    healthy: ageMinutes <= maxAgeMinutes,
    lastCompletedAt: new Date(Number(latest.at)).toISOString(),
    ageMinutes,
    reason: ageMinutes <= maxAgeMinutes ? 'fresh' : 'stale_completed_run',
  };
}

export function incidentDedupeKey(kind: string, subjectId?: string | null) {
  const cleanKind = String(kind || '').trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_');
  const cleanSubject = String(subjectId || 'platform').trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_');
  if (!cleanKind) throw new Error('incident_kind_required');
  return `${cleanKind}:${cleanSubject}`;
}

export function incidentBucketStart(nowMs: number, bucketMinutes = INCIDENT_BUCKET_MINUTES) {
  const bucketMs = Math.max(1, bucketMinutes) * 60 * 1000;
  return Math.floor(nowMs / bucketMs) * bucketMs;
}

export function incidentIdempotencyKey(dedupeKey: string, nowMs: number) {
  return `p7-incident:${dedupeKey}:${new Date(incidentBucketStart(nowMs)).toISOString()}`;
}

export function buildIncidentRecord(signal: P7IncidentSignal, nowIso: string) {
  const nowMs = new Date(nowIso).getTime();
  if (!Number.isFinite(nowMs)) throw new Error('invalid_incident_clock');
  return {
    dedupe_key: signal.dedupeKey,
    idempotency_key: incidentIdempotencyKey(signal.dedupeKey, nowMs),
    source: 'ecl_production_health',
    domain: signal.domain,
    incident_type: signal.incidentType,
    severity: signal.severity,
    status: 'open',
    subject_type: signal.subjectType || '',
    subject_id: signal.subjectId || '',
    recovery_action: signal.recoveryAction,
    summary: signal.summary.slice(0, 500),
    details_json: signal.details || {},
    first_seen_at: nowIso,
    last_seen_at: nowIso,
    occurrence_count: 1,
    recovery_attempts: 0,
  };
}

export function recoveryInvocation(action: string, subjectId?: string | null) {
  if (action === 'run_ecl_lifecycle_scheduler') return { functionName: 'eclLifecycleScheduler', payload: { limit: 25 } };
  if (action === 'run_recover_billing_reconciler') return { functionName: 'reconcileRecoverBilling', payload: { limit: 50 } };
  if (action === 'run_webhook_dead_letters') return { functionName: 'processWebhookDeadLetters', payload: { limit: 50 } };
  if (action === 'replay_webhook_dead_letter') {
    if (!subjectId) throw new Error('webhook_dead_letter_id_required');
    return {
      functionName: 'processWebhookDeadLetters',
      payload: { deadLetterId: subjectId, manualReplay: true, confirm: 'REPLAY_EXHAUSTED' },
    };
  }
  if (action === 'inspect_manual') return null;
  throw new Error(`unsupported_recovery_action:${action}`);
}
