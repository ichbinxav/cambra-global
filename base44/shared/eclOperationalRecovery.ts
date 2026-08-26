// eclOperationalRecovery — CAMBRA v0.66.0 / ECL P7.
// Pure operational contracts. No SDK, persistence, network, clock reads or economic writes.

export const P7_WORKERS = Object.freeze({
  ecl_lifecycle_scheduler: { maxAgeMinutes: 40, recoveryAction: 'run_ecl_lifecycle_scheduler' },
  recover_billing_reconciler: { maxAgeMinutes: 40, recoveryAction: 'run_recover_billing_reconciler' },
  webhook_dead_letter_processor: { maxAgeMinutes: 20, recoveryAction: 'run_webhook_dead_letters' },
});

export const P7_ACTIVE_INCIDENT_STATUSES = Object.freeze(['open', 'acknowledged', 'recovering']);
export const INCIDENT_BUCKET_MINUTES = 10;

const SAFE_PRE_EFFECT_STATES = new Set(['NOT_STARTED', 'FAILED_PRE_EFFECT', 'NOT_APPLICABLE']);

export type P7RecoveryAction = 'run_ecl_lifecycle_scheduler' | 'run_recover_billing_reconciler' | 'run_webhook_dead_letters' | 'replay_webhook_dead_letter' | 'inspect_manual';
export type P7IncidentSignal = {
  dedupeKey: string;
  domain: 'evidence_lifecycle' | 'billing_reconciliation' | 'webhook_delivery' | 'review_workflow' | 'platform';
  incidentType: string;
  severity: 'warning' | 'critical';
  recoveryAction: P7RecoveryAction;
  summary: string;
  subjectType?: string;
  subjectId?: string;
  details?: Record<string, unknown>;
};

function taskTime(task: any): number | null {
  const raw = task?.completed_at || task?.created_date || task?.started_at;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function workerFreshness(agentName: string, tasks: any[], nowMs: number, maxAgeMinutes: number) {
  const completed = (tasks || [])
    .filter((task) => task?.agent_name === agentName && task?.status === 'completed')
    .map((task) => ({ task, at: taskTime(task) }))
    .filter((entry) => entry.at !== null)
    .sort((a, b) => Number(b.at) - Number(a.at));
  const latest = completed[0] || null;
  if (!latest) return { healthy: false, lastCompletedAt: null, ageMinutes: null, reason: 'no_completed_run' };
  const ageMinutes = Math.max(0, Math.floor((nowMs - Number(latest.at)) / 60000));
  return { healthy: ageMinutes <= maxAgeMinutes, lastCompletedAt: new Date(Number(latest.at)).toISOString(), ageMinutes, reason: ageMinutes <= maxAgeMinutes ? 'fresh' : 'stale_completed_run' };
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

export function recoveryInvocation(action: P7RecoveryAction | string, subjectId?: string | null) {
  if (action === 'run_ecl_lifecycle_scheduler') return { functionName: 'eclLifecycleScheduler', payload: { limit: 25 } };
  if (action === 'run_recover_billing_reconciler') return { functionName: 'reconcileRecoverBilling', payload: { limit: 50 } };
  if (action === 'run_webhook_dead_letters') return { functionName: 'processWebhookDeadLetters', payload: { limit: 50 } };
  if (action === 'replay_webhook_dead_letter') {
    if (!subjectId) throw new Error('webhook_dead_letter_id_required');
    return { functionName: 'processWebhookDeadLetters', payload: { deadLetterId: subjectId, manualReplay: true, confirm: 'REPLAY_EXHAUSTED' } };
  }
  if (action === 'inspect_manual') return null;
  throw new Error(`unsupported_recovery_action:${action}`);
}

function hasPersistedReferences(value: any) {
  if (value === undefined || value === null) return false;
  return !Array.isArray(value) || value.length > 0;
}

function referencesSchedulerAttempt(task: any, attempt: any, runKey: string) {
  if (String(task?.parent_run || '') === runKey) return true;
  return Array.isArray(task?.source_refs_json) && task.source_refs_json.some((ref: any) =>
    String(ref?.type || '').toLowerCase() === 'schedulerrun' &&
    String(ref?.id || '') === String(attempt?.id || '')
  );
}

export function schedulerControlRecoveryDecision(
  control: any,
  attempt: any,
  tasks: any[],
  options: { allowNoTaskProof?: boolean; allowQuiescentPostEffectProof?: boolean } = {},
) {
  if (!control) return { ok: true, action: 'not_required', reason: 'scheduler_control_absent' };
  const state = String(control.control_state || 'IDLE');
  if (state === 'IDLE') return { ok: true, action: 'not_required', reason: 'scheduler_control_idle' };
  if (state !== 'REVIEW_REQUIRED') return { ok: false, action: 'blocked', reason: 'scheduler_control_not_recoverable' };
  if (!attempt || String(attempt.id || '') !== String(control.active_attempt_id || '')) {
    return { ok: false, action: 'blocked', reason: 'scheduler_active_attempt_unproven' };
  }
  const runKey = String(attempt.run_key || '');
  if (!runKey || (control.active_run_key && String(control.active_run_key) !== runKey)) {
    return { ok: false, action: 'blocked', reason: 'scheduler_attempt_run_key_unproven' };
  }
  if (!Array.isArray(tasks)) return { ok: false, action: 'blocked', reason: 'scheduler_task_evidence_unavailable' };
  if (options.allowQuiescentPostEffectProof === true) {
    const materialState = String(attempt.material_effect_state || '');
    const attemptStatus = String(attempt.status || '');
    if (
      control.control_effects_started !== true || attempt.effects_started !== true ||
      !['EFFECT_STARTED', 'REVIEW_REQUIRED', 'FAILED_POST_EFFECT'].includes(materialState) ||
      !['RUNNING', 'REVIEW_REQUIRED', 'FAILED'].includes(attemptStatus)
    ) {
      return { ok: false, action: 'blocked', reason: 'scheduler_post_effect_state_unproven' };
    }
    return {
      ok: true,
      action: 'reconcile_post_effect',
      reason: 'terminal_effect_receipts_quiescent_without_replay',
      taskId: null,
    };
  }
  const matchingTasks = tasks.filter((task) => referencesSchedulerAttempt(task, attempt, runKey));
  if (matchingTasks.length > 1) return { ok: false, action: 'blocked', reason: 'scheduler_attempt_task_ambiguous' };
  if (matchingTasks.length === 0) {
    if (options.allowNoTaskProof !== true) {
      return { ok: false, action: 'blocked', reason: 'scheduler_no_task_not_proof' };
    }
    return { ok: true, action: 'reset_control', reason: 'no_task_created_before_effect', taskId: null };
  }
  const task = matchingTasks[0];
  if (
    !task.id || task.execution_effects_started === true || hasPersistedReferences(task.effect_refs_json) ||
    hasPersistedReferences(task.receipt_refs_json) ||
    !SAFE_PRE_EFFECT_STATES.has(String(task.effect_state || ''))
  ) {
    return { ok: false, action: 'blocked', reason: 'scheduler_effect_nonoccurrence_unproven' };
  }
  return { ok: true, action: 'reset_control', reason: 'task_proves_no_effect_started', taskId: task.id };
}

export function disasterRecoverySchedulerRecoveryProof(status: any, completionRows: any[], attempt: any) {
  if (!status || status.ok !== true || status.data_status !== 'COMPLETE') {
    return { ok: false, reason: 'disaster_recovery_status_unverified' };
  }
  if (status.configuration?.ok !== true || status.remote?.ok !== true || status.remote?.read_only !== true) {
    return { ok: false, reason: 'disaster_recovery_remote_authority_unverified' };
  }
  if (status.remote.pending_backup !== null) {
    return { ok: false, reason: 'disaster_recovery_operation_still_pending' };
  }
  const latest = status.remote.latest_checkpoint;
  const backupId = String(latest?.backup_id || '');
  const manifestPath = String(latest?.manifest_path || '');
  const manifestHash = String(latest?.manifest_hash || '').toLowerCase();
  if (
    latest?.verified !== true ||
    !/^cambra-dr-\d{8}T\d{9}z-[a-f0-9]{8}$/.test(backupId) ||
    manifestPath !== `Manifests/${backupId}.manifest.json` ||
    !/^[a-f0-9]{64}$/.test(manifestHash) ||
    latest.source_environment !== 'prod' ||
    latest.source_app_id !== '6a16288b833b3c26d7ac1fab' ||
    !Number.isFinite(Date.parse(String(latest.checkpoint_to || '')))
  ) return { ok: false, reason: 'disaster_recovery_latest_checkpoint_unverified' };
  if (!Array.isArray(completionRows) || completionRows.length !== 1) {
    return { ok: false, reason: 'disaster_recovery_completion_authority_ambiguous' };
  }
  const completion = completionRows[0];
  const expectedMessage = `${latest.snapshot_type} backup ${backupId}`;
  const completionAt = Date.parse(String(completion?.created_at || completion?.created_date || ''));
  const attemptAt = Date.parse(String(attempt?.started_at || ''));
  if (
    completion?.event_type !== 'disaster_recovery_backup_completed' ||
    completion?.message !== expectedMessage ||
    completion?.data_json?.backup_id !== backupId ||
    completion?.data_json?.manifest_path !== manifestPath ||
    completion?.data_json?.manifest_hash !== manifestHash ||
    !Number.isFinite(completionAt) || !Number.isFinite(attemptAt) || completionAt < attemptAt
  ) return { ok: false, reason: 'disaster_recovery_completion_receipt_unverified' };
  return {
    ok: true,
    reason: 'disaster_recovery_latest_backup_verified_and_no_operation_pending',
    mode: 'POST_EFFECT_QUIESCENT',
    evidence: {
      backup_id: backupId,
      manifest_path: manifestPath,
      manifest_hash: manifestHash,
      checkpoint_to: latest.checkpoint_to,
      snapshot_type: latest.snapshot_type,
      completion_log_id: completion.id,
      completion_at: new Date(completionAt).toISOString(),
      pending_operation: false,
      latest_checkpoint_verified: true,
    },
    receipt_state: {
      latest_checkpoint_verified: true,
      completion_log_verified: true,
      pending_operation: false,
    },
  };
}

export function webhookOrphanedProvisionalRecoveryDecision(
  control: any,
  historicalAttempt: any,
  evidence: {
    historicalTasks?: any[];
    provisionalAttempts?: any[];
    provisionalTasks?: any[];
    pendingDeadLetters?: any[];
  },
  nowMs: number,
) {
  if (!control || control.control_state !== 'REVIEW_REQUIRED') {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_control_not_quarantined' };
  }
  if (
    String(control.worker_key || '') !== 'processWebhookDeadLetters' ||
    String(control.details_json?.reason || '') !== 'scheduler_superseded_attempt_not_persisted'
  ) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_control_reason_unproven' };
  }
  if (
    !historicalAttempt ||
    String(historicalAttempt.id || '') !== String(control.active_attempt_id || '') ||
    String(historicalAttempt.worker_key || '') !== 'processWebhookDeadLetters'
  ) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_historical_attempt_unproven' };
  }
  if (
    control.control_effects_started !== false ||
    historicalAttempt.effects_started !== false ||
    historicalAttempt.claim_acquired !== true ||
    String(historicalAttempt.status || '') !== 'REVIEW_REQUIRED' ||
    String(historicalAttempt.material_effect_state || '') !== 'REVIEW_REQUIRED' ||
    String(historicalAttempt.details_json?.reason || '') !== 'scheduler_attempt_link_fence_lost'
  ) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_pre_effect_state_unproven' };
  }

  const activeRunKey = String(control.active_run_key || '');
  const activeOperationKey = String(control.active_operation_key || '');
  const activeEffectKey = String(control.active_effect_key || '');
  const operationPrefix = 'processWebhookDeadLetters:';
  const operationSuffix = activeOperationKey.startsWith(operationPrefix)
    ? activeOperationKey.slice(operationPrefix.length)
    : '';
  if (
    !activeRunKey || !activeOperationKey || !operationSuffix ||
    activeRunKey !== `${activeOperationKey}:pending` ||
    activeEffectKey !== `processWebhookDeadLetters:effect:${operationSuffix}` ||
    !historicalAttempt.run_key || String(historicalAttempt.run_key) === activeRunKey
  ) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_provisional_identity_unproven' };
  }

  const controlRevision = Number(control.control_revision);
  const attemptFenceRevision = Number(historicalAttempt.attempt_fence_revision);
  if (
    !Number.isInteger(controlRevision) || !Number.isInteger(attemptFenceRevision) ||
    controlRevision !== attemptFenceRevision + 2
  ) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_fence_sequence_unproven' };
  }

  const claimedAt = Date.parse(String(control.control_claimed_at || ''));
  const expiresAt = Date.parse(String(control.control_expires_at || ''));
  const reviewRequiredAt = Date.parse(String(control.details_json?.review_required_at || ''));
  const historicalCompletedAt = Date.parse(String(historicalAttempt.completed_at || ''));
  const historicalLeaseExpiresAt = Date.parse(String(historicalAttempt.lease_expires_at || ''));
  if (
    !Number.isFinite(nowMs) || !Number.isFinite(claimedAt) || !Number.isFinite(expiresAt) ||
    !Number.isFinite(reviewRequiredAt) || !Number.isFinite(historicalCompletedAt) ||
    !Number.isFinite(historicalLeaseExpiresAt) || expiresAt > nowMs || claimedAt > expiresAt ||
    reviewRequiredAt !== claimedAt || historicalCompletedAt > claimedAt || historicalLeaseExpiresAt > claimedAt
  ) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_quiescence_window_unproven' };
  }

  const evidenceSets = [
    evidence?.historicalTasks,
    evidence?.provisionalAttempts,
    evidence?.provisionalTasks,
    evidence?.pendingDeadLetters,
  ];
  if (evidenceSets.some((rows) => !Array.isArray(rows))) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_evidence_unavailable' };
  }
  if (evidence.historicalTasks!.length > 0) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_historical_task_observed' };
  }
  if (evidence.provisionalAttempts!.length > 0) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_provisional_attempt_observed' };
  }
  if (evidence.provisionalTasks!.length > 0) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_provisional_task_observed' };
  }
  if (evidence.pendingDeadLetters!.length > 0) {
    return { ok: false, action: 'blocked', reason: 'webhook_orphaned_pending_delivery_observed' };
  }
  return {
    ok: true,
    action: 'reset_control',
    reason: 'webhook_orphaned_provisional_pre_effect_zero_writes',
    activeRunKey,
    historicalAttemptId: historicalAttempt.id,
  };
}
