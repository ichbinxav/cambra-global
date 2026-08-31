import { safeBestEffort } from '../../shared/bestEffort.ts';
// eclIncidentWorkflow — CAMBRA v0.66.0 / ECL P7.
// Admin-only incident queue and bounded recovery. Recovery actions are mapped
// by the pure P7 contract; arbitrary function names/payloads are never accepted.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { disasterRecoverySchedulerRecoveryProof, orphanedSchedulerLinkRecoveryDecision, recoveryInvocation, P7_ACTIVE_INCIDENT_STATUSES, schedulerControlRecoveryDecision, webhookOrphanedProvisionalRecoveryDecision } from '../../shared/eclOperationalRecovery.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

const LIST_MAX = 200;

function updatedExactlyOne(result: any) {
  return Boolean(result && (result.updated === 1 || result.modified_count === 1 || result.matched_count === 1));
}

const RECOVERY_WORKER_KEYS: Record<string, string> = Object.freeze({
  eclLifecycleScheduler: 'eclLifecycleScheduler',
  reconcileRecoverBilling: 'reconcileRecoverBilling',
  processWebhookDeadLetters: 'processWebhookDeadLetters',
});

const NO_TASK_PRE_EFFECT_PROOF_WORKERS = new Set([
  'reconcileRecoverBilling',
  'processWebhookDeadLetters',
]);

const ADMIN_SCHEDULER_RECONCILIATION: Record<string, {
  taskAgent?: string;
  proof: 'TASK_NO_EFFECT' | 'GROWTH_ZERO_WRITES' | 'MAINTENANCE_PRE_EFFECT' | 'LEGACY_RECOVER_PRE_EFFECT' | 'INSTANTLY_RETRY_ZERO_WRITES' | 'INSTANTLY_RECONCILIATION_RECEIPTS' | 'DISCOVERY_EFFECT_RECONCILIATION' | 'DISASTER_RECOVERY_TERMINAL_BACKUP';
}> = Object.freeze({
  autonomousCompanyOrchestrator: {
    taskAgent: 'autonomous_company_orchestrator',
    proof: 'TASK_NO_EFFECT',
  },
  getEuropeMarketsCommandCenter: { proof: 'GROWTH_ZERO_WRITES' },
  maintenanceEngine: { proof: 'MAINTENANCE_PRE_EFFECT' },
  recoverAutopilotWorker: {
    taskAgent: 'recover_autopilot',
    proof: 'LEGACY_RECOVER_PRE_EFFECT',
  },
  instantlyProviderEventRetryWorker: { proof: 'INSTANTLY_RETRY_ZERO_WRITES' },
  instantlyReconciliationWorker: { proof: 'INSTANTLY_RECONCILIATION_RECEIPTS' },
  alwaysOnLeadDiscoveryWorker: { proof: 'DISCOVERY_EFFECT_RECONCILIATION' },
  disasterRecoveryBackup: { proof: 'DISASTER_RECOVERY_TERMINAL_BACKUP' },
  disasterRecoveryBackupContinuation: { proof: 'DISASTER_RECOVERY_TERMINAL_BACKUP' },
});

async function exactRows(entity: any, query: Record<string, unknown>, operation: string) {
  const rows = await entity.filter(query, '-created_date', 2);
  if (!Array.isArray(rows)) throw new Error(`${operation}_unavailable`);
  if (rows.length > 1) throw new Error(`${operation}_ambiguous`);
  return rows;
}

async function reconcileSchedulerControlBeforeRecovery(svc: any, functionName: string, actor: string) {
  const workerKey = RECOVERY_WORKER_KEYS[functionName];
  if (!workerKey) return { ok: true, action: 'not_required', reason: 'non_scheduler_recovery' };
  const controlKey = `scheduler-control:${workerKey}`;
  const [control] = await exactRows(
    svc.entities.SchedulerRun,
    { record_kind: 'CONTROL', control_key: controlKey },
    'scheduler_recovery_control_read',
  );
  if (
    control?.control_state === 'REVIEW_REQUIRED' &&
    !String(control?.active_attempt_id || '')
  ) {
    const operationKey = String(control.active_operation_key || '');
    const attempts = operationKey
      ? await svc.entities.SchedulerRun.filter({
        record_kind: 'ATTEMPT',
        worker_key: workerKey,
        operation_key: operationKey,
        claim_acquired: true,
      }, '-created_date', 2)
      : [];
    if (!Array.isArray(attempts)) throw new Error('scheduler_orphaned_attempt_read_unavailable');
    const orphanedAttempt = attempts.length === 1 ? attempts[0] : null;
    const [orphanedTasks, laterClaimedAttempts] = orphanedAttempt
      ? await Promise.all([
        svc.entities.AgentTask.filter({ parent_run: orphanedAttempt.run_key }, '-created_date', 2),
        svc.entities.SchedulerRun.filter({
          record_kind: 'ATTEMPT',
          worker_key: workerKey,
          claim_acquired: true,
          started_at: { $gt: orphanedAttempt.started_at },
        }, '-started_at', 2),
      ])
      : [[], []];
    const orphanedDecision = orphanedSchedulerLinkRecoveryDecision(
      control,
      attempts,
      orphanedTasks,
      laterClaimedAttempts,
      Date.now(),
    );
    if (!orphanedDecision.ok) {
      throw new Error(`scheduler_recovery_blocked:${orphanedDecision.reason}`);
    }

    const now = new Date().toISOString();
    if (orphanedAttempt.status !== 'EXPIRED_PRE_EFFECT') {
      const attemptUpdate = await svc.entities.SchedulerRun.updateMany({
        id: orphanedAttempt.id,
        record_kind: 'ATTEMPT',
        status: 'REVIEW_REQUIRED',
        material_effect_state: 'REVIEW_REQUIRED',
        claim_acquired: true,
        effects_started: false,
        attempt_fence_revision: Number(orphanedAttempt.attempt_fence_revision),
      }, { $set: {
        status: 'EXPIRED_PRE_EFFECT',
        material_effect_state: 'EXPIRED_PRE_EFFECT',
        completed_at: orphanedAttempt.completed_at || now,
        details_json: {
          ...(orphanedAttempt.details_json || {}),
          original_reason: 'scheduler_attempt_link_fence_lost',
          reason: 'scheduler_orphaned_link_reconciled_pre_effect',
          reconciled_at: now,
          reconciled_by: actor,
          historical_attempt_replayed: false,
          effects_rolled_back: false,
        },
      } });
      if (!updatedExactlyOne(attemptUpdate)) throw new Error('scheduler_orphaned_attempt_changed_concurrently');
    }

    const controlUpdate = await svc.entities.SchedulerRun.updateMany({
      id: control.id,
      record_kind: 'CONTROL',
      control_key: controlKey,
      control_state: 'REVIEW_REQUIRED',
      control_revision: Number(control.control_revision),
      control_token: String(control.control_token || ''),
      control_owner: String(control.control_owner || ''),
      control_effects_started: false,
      active_attempt_id: '',
      active_run_key: String(control.active_run_key || ''),
    }, { $set: {
      control_state: 'IDLE',
      control_revision: Number(control.control_revision) + 1,
      control_token: '',
      control_owner: '',
      control_claimed_at: '',
      control_expires_at: '',
      control_effects_started: false,
      active_attempt_id: '',
      active_run_key: '',
      active_operation_key: '',
      active_effect_key: '',
      details_json: {
        ...(control.details_json || {}),
        reason: 'admin_reconciled_orphaned_link_pre_effect',
        reconciled_at: now,
        reconciled_by: actor,
        reconciliation_proof: orphanedDecision.reason,
        reconciled_attempt_id: orphanedAttempt.id,
        historical_attempt_replayed: false,
        effects_rolled_back: false,
      },
    } });
    if (!updatedExactlyOne(controlUpdate)) throw new Error('scheduler_orphaned_control_changed_concurrently');
    return {
      ...orphanedDecision,
      workerKey,
      controlId: control.id,
      attemptId: orphanedAttempt.id,
      reconciledAt: now,
    };
  }
  let attempt: any = null;
  let tasks: any[] = [];
  if (control?.active_attempt_id) {
    [attempt] = await exactRows(
      svc.entities.SchedulerRun,
      { id: control.active_attempt_id, record_kind: 'ATTEMPT' },
      'scheduler_recovery_attempt_read',
    );
    if (attempt?.run_key) {
      tasks = await svc.entities.AgentTask.filter({ parent_run: attempt.run_key }, '-created_date', 2);
      if (!Array.isArray(tasks)) throw new Error('scheduler_recovery_task_read_unavailable');
    }
  }
  if (
    functionName === 'processWebhookDeadLetters' &&
    String(control?.details_json?.reason || '') === 'scheduler_superseded_attempt_not_persisted'
  ) {
    const activeRunKey = String(control?.active_run_key || '');
    const [provisionalAttempts, provisionalTasks, pendingDeadLetters] = await Promise.all([
      activeRunKey
        ? svc.entities.SchedulerRun.filter({ record_kind: 'ATTEMPT', run_key: activeRunKey }, '-started_at', 2)
        : Promise.resolve([]),
      activeRunKey
        ? svc.entities.AgentTask.filter({ parent_run: activeRunKey }, '-started_at', 2)
        : Promise.resolve([]),
      svc.entities.WebhookDeadLetter.filter({ status: { $in: ['dispatch_pending', 'pending_retry'] } }, '-created_date', 2),
    ]);
    const decision = webhookOrphanedProvisionalRecoveryDecision(control, attempt, {
      historicalTasks: tasks,
      provisionalAttempts,
      provisionalTasks,
      pendingDeadLetters,
    }, Date.now());
    if (!decision.ok) throw new Error(`scheduler_recovery_blocked:${decision.reason}`);

    const now = new Date().toISOString();
    const controlUpdate = await svc.entities.SchedulerRun.updateMany({
      id: control.id,
      record_kind: 'CONTROL',
      control_key: controlKey,
      control_state: 'REVIEW_REQUIRED',
      control_revision: Number(control.control_revision),
      control_token: String(control.control_token || ''),
      control_owner: String(control.control_owner || ''),
      control_effects_started: false,
      active_attempt_id: String(control.active_attempt_id || ''),
      active_run_key: activeRunKey,
    }, { $set: {
      control_state: 'IDLE',
      control_revision: Number(control.control_revision) + 1,
      control_token: '',
      control_owner: '',
      control_claimed_at: '',
      control_expires_at: '',
      control_effects_started: false,
      active_attempt_id: '',
      active_run_key: '',
      active_operation_key: '',
      active_effect_key: '',
      details_json: {
        ...(control.details_json || {}),
        reason: 'admin_reconciled_orphaned_provisional_pre_effect',
        reconciled_at: now,
        reconciled_by: actor,
        reconciliation_proof: decision.reason,
        provisional_run_key: activeRunKey,
        historical_attempt_id: attempt.id,
        historical_attempt_replayed: false,
        effects_rolled_back: false,
        pending_webhook_rows: 0,
      },
    } });
    if (!updatedExactlyOne(controlUpdate)) throw new Error('scheduler_recovery_control_changed_concurrently');
    return { ...decision, workerKey, controlId: control.id, attemptId: attempt.id, reconciledAt: now };
  }
  const decision = schedulerControlRecoveryDecision(control, attempt, tasks, {
    allowNoTaskProof: NO_TASK_PRE_EFFECT_PROOF_WORKERS.has(functionName),
  });
  if (!decision.ok) throw new Error(`scheduler_recovery_blocked:${decision.reason}`);
  if (decision.action !== 'reset_control') return decision;

  const now = new Date().toISOString();
  const task = decision.taskId ? tasks.find((row) => row.id === decision.taskId) : null;
  if (task?.status === 'running') {
    const taskUpdate = await svc.entities.AgentTask.updateMany({
      id: task.id,
      status: 'running',
      parent_run: attempt.run_key,
      effect_state: task.effect_state,
    }, { $set: {
      status: 'failed',
      terminal_state: 'FAILED',
      effect_state: 'FAILED_PRE_EFFECT',
      ambiguity_state: 'NONE',
      error: 'scheduler_control_reconciled_pre_effect',
      output_summary: 'Reconciled as failed before effects; no effect or receipt reference was observed.',
      completed_at: now,
    } });
    if (!updatedExactlyOne(taskUpdate)) throw new Error('scheduler_recovery_task_changed_concurrently');
  }

  const controlUpdate = await svc.entities.SchedulerRun.updateMany({
    id: control.id,
    record_kind: 'CONTROL',
    control_key: controlKey,
    control_state: 'REVIEW_REQUIRED',
    control_revision: Number(control.control_revision || 0),
    active_attempt_id: String(control.active_attempt_id || ''),
  }, { $set: {
    control_state: 'IDLE',
    control_revision: Number(control.control_revision || 0) + 1,
    control_token: '',
    control_owner: '',
    control_claimed_at: '',
    control_expires_at: '',
    control_effects_started: false,
    active_attempt_id: '',
    active_run_key: '',
    active_operation_key: '',
    active_effect_key: '',
    details_json: {
      ...(control.details_json || {}),
      reason: 'admin_reconciled_pre_effect',
      reconciled_at: now,
      reconciled_by: actor,
      reconciliation_proof: decision.reason,
      reconciled_attempt_id: attempt.id,
      reconciled_task_id: decision.taskId || null,
    },
  } });
  if (!updatedExactlyOne(controlUpdate)) throw new Error('scheduler_recovery_control_changed_concurrently');
  return { ...decision, workerKey, controlId: control.id, attemptId: attempt.id, reconciledAt: now };
}

async function changedRows(
  entity: any,
  fields: string[],
  from: string,
  to: string,
  baseQuery: Record<string, unknown> = {},
) {
  const observed = new Map<string, any>();
  for (const field of fields) {
    const rows = await entity.filter({
      ...baseQuery,
      [field]: { $gte: from, $lte: to },
    }, `-${field}`, 100);
    if (!Array.isArray(rows)) throw new Error(`scheduler_domain_proof_unavailable:${field}`);
    for (const row of rows) observed.set(String(row.id), row);
  }
  return [...observed.values()];
}

function attemptWindow(attempt: any, prefix: string) {
  const from = String(attempt?.started_at || '');
  const to = String(attempt?.completed_at || attempt?.heartbeat_at || '');
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || Date.parse(to) < Date.parse(from)) {
    return { ok: false as const, reason: `${prefix}_attempt_window_unproven`, from, to };
  }
  return { ok: true as const, from, to };
}

function hasEvidence(value: any) {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

function unwrapFunctionData(value: any) {
  let current=value?.data??value;
  for(let layer=0;layer<6;layer++){
    if(typeof current==='string'){try{current=JSON.parse(current);continue}catch{return current}}
    if(current&&typeof current==='object'&&!Array.isArray(current)&&current.ok===undefined&&current.error===undefined&&'data'in current){current=current.data;continue}
    break;
  }
  return current;
}

async function disasterRecoveryTerminalBackupProof(svc: any, attempt: any) {
  const internalSecret=String(Deno.env.get('INTERNAL_CALL_SECRET')||'');
  if(!internalSecret)return{ok:false,reason:'disaster_recovery_internal_authority_unavailable'};
  let status:any;
  try{status=unwrapFunctionData(await svc.functions.invoke('maintenanceEngine',{action:'dr_status',verify_remote:true,internal_secret:internalSecret}))}
  catch{return{ok:false,reason:'disaster_recovery_status_unavailable'}}
  const latest=status?.remote?.latest_checkpoint,backupId=String(latest?.backup_id||''),snapshotType=String(latest?.snapshot_type||'');
  if(!backupId||!snapshotType)return disasterRecoverySchedulerRecoveryProof(status,[],attempt);
  const completionRows=await svc.entities.OperationalLog.filter({event_type:'disaster_recovery_backup_completed',message:`${snapshotType} backup ${backupId}`},'-created_at',2);
  return disasterRecoverySchedulerRecoveryProof(status,completionRows,attempt);
}

async function growthAttemptZeroWriteProof(svc: any, attempt: any) {
  const window = attemptWindow(attempt, 'growth');
  if (!window.ok) return window;
  const { from, to } = window;
  const checks = [
    ['GrowthTargetRegistry', ['created_at', 'updated_date'], {}],
    ['GrowthAssumptionRegistry', ['created_at', 'updated_date'], {}],
    ['MarketGrowthSnapshot', ['calculated_at', 'updated_date'], {}],
    ['FounderGrowthBrief', ['generated_at', 'updated_date'], {}],
    ['GrowthPathSnapshot', ['created_at', 'updated_date'], {}],
    ['GrowthDecision', ['created_at', 'updated_at', 'updated_date'], {}],
    ['GrowthScenario', ['created_at', 'updated_at', 'updated_date'], {}],
    ['Event', ['created_date'], { source: 'growth_path_engine' }],
  ] as const;
  const evidence: any[] = [];
  for (const [entityName, fields, query] of checks) {
    const rows = await changedRows(svc.entities[entityName], [...fields], from, to, query);
    evidence.push({ entity: entityName, changed_ids: rows.map((row: any) => row.id) });
  }
  const changed = evidence.flatMap((row) => row.changed_ids.map((id: string) => ({ entity: row.entity, id })));
  return {
    ok: changed.length === 0,
    reason: changed.length === 0 ? 'growth_domain_zero_writes_in_attempt_window' : 'growth_domain_writes_observed',
    from,
    to,
    evidence,
    changed,
  };
}

async function maintenanceAttemptPreEffectProof(svc: any, attempt: any) {
  const window = attemptWindow(attempt, 'maintenance');
  if (!window.ok) return window;
  const { from, to } = window;
  const runs = await svc.entities.MaintenanceRun.filter({ started_at: { $gte: from, $lte: to } }, '-started_at', 3);
  if (!Array.isArray(runs)) throw new Error('maintenance_run_proof_unavailable');
  if (runs.length !== 1) {
    return { ok: false, reason: runs.length ? 'maintenance_run_proof_ambiguous' : 'maintenance_run_missing', from, to, run_ids: runs.map((row: any) => row.id) };
  }
  const run = runs[0];
  const runStoppedPreEffect = run.status === 'failed' &&
    (run.health_score === undefined || run.health_score === null) &&
    Number(run.signals_detected || 0) === 0 &&
    Number(run.automatic_repairs || 0) === 0 &&
    Number(run.repairs_verified || 0) === 0 &&
    Number(run.repairs_failed || 0) === 0 &&
    Number(run.escalations || 0) === 0 &&
    Number(run.learning_updates || 0) === 0 &&
    !hasEvidence(run.evidence_json);
  const checks = [
    ['AutonomyIncident', ['first_seen_at', 'last_seen_at', 'resolved_at']],
    ['AgentTask', ['created_date', 'started_at']],
    ['RemediationKnowledge', ['created_date', 'last_verified_at']],
    ['RetentionExecutionEvidence', ['created_date', 'started_at']],
    ['IncidentAlertDelivery', ['created_at']],
  ] as const;
  const evidence: any[] = [];
  for (const [entityName, fields] of checks) {
    const rows = await changedRows(svc.entities[entityName], [...fields], from, to);
    evidence.push({ entity: entityName, changed_ids: rows.map((row: any) => row.id) });
  }
  const changed = evidence.flatMap((row) => row.changed_ids.map((id: string) => ({ entity: row.entity, id })));
  return {
    ok: runStoppedPreEffect && changed.length === 0,
    reason: !runStoppedPreEffect
      ? 'maintenance_failed_run_does_not_prove_pre_effect_stop'
      : changed.length
      ? 'maintenance_downstream_writes_observed'
      : 'maintenance_failed_run_proves_no_downstream_effects',
    from,
    to,
    maintenance_run_id: run.id,
    run_status: run.status,
    evidence,
    changed,
  };
}

async function legacyRecoverAttemptPreEffectProof(svc: any, attempt: any) {
  const window = attemptWindow(attempt, 'legacy_recover');
  if (!window.ok) return window;
  const { from, to } = window;
  const tasks = await svc.entities.AgentTask.filter({ agent_name: 'recover_autopilot', started_at: { $gte: from, $lte: to } }, '-started_at', 3);
  if (!Array.isArray(tasks)) throw new Error('legacy_recover_task_proof_unavailable');
  if (tasks.length !== 1) {
    return { ok: false, reason: tasks.length ? 'legacy_recover_task_proof_ambiguous' : 'legacy_recover_task_missing', from, to, task_ids: tasks.map((row: any) => row.id) };
  }
  const task = tasks[0];
  const taskStoppedPreEffect = task.status === 'failed' &&
    ['FAILED_PRE_EFFECT', 'NOT_STARTED'].includes(String(task.effect_state || '')) &&
    String(task.ambiguity_state || 'NONE') === 'NONE' &&
    task.execution_effects_started !== true &&
    !hasEvidence(task.effect_refs_json) &&
    !hasEvidence(task.receipt_refs_json);
  const checks = [
    ['Invoice', ['created_date', 'updated_date', 'issued_at']],
    ['MonthlySavingsReport', ['created_date', 'updated_date', 'verified_at']],
  ] as const;
  const evidence: any[] = [];
  for (const [entityName, fields] of checks) {
    const rows = await changedRows(svc.entities[entityName], [...fields], from, to);
    evidence.push({ entity: entityName, changed_ids: rows.map((row: any) => row.id) });
  }
  const changed = evidence.flatMap((row) => row.changed_ids.map((id: string) => ({ entity: row.entity, id })));
  return {
    ok: taskStoppedPreEffect && changed.length === 0,
    reason: !taskStoppedPreEffect
      ? 'legacy_recover_task_does_not_prove_pre_effect_stop'
      : changed.length
      ? 'legacy_recover_economic_writes_observed'
      : 'legacy_time_bounded_task_proves_no_effect_started',
    from,
    to,
    task_id: task.id,
    task_status: task.status,
    effect_state: task.effect_state,
    ambiguity_state: task.ambiguity_state,
    evidence,
    changed,
  };
}

async function instantlyRetryAttemptZeroWriteProof(svc: any, attempt: any) {
  const from = String(attempt?.started_at || '');
  const to = new Date().toISOString();
  if (!Number.isFinite(Date.parse(from))) {
    return { ok: false, reason: 'instantly_retry_attempt_start_unproven', from, to };
  }
  // Provider-event processing claims the ledger row before any downstream
  // mutation. Zero ledger writes after this attempt began therefore proves
  // that the historical attempt did not process or replay an event.
  const rows = await changedRows(
    svc.entities.OutboundProviderEvent,
    ['first_received_at', 'last_attempt_at', 'processed_at', 'updated_date'],
    from,
    to,
    { provider: 'instantly' },
  );
  const changed = rows.map((row: any) => ({ id: row.id, status: row.status || null }));
  return {
    ok: changed.length === 0,
    reason: changed.length === 0
      ? 'instantly_retry_attempt_has_zero_event_ledger_writes'
      : 'instantly_retry_event_ledger_writes_observed',
    from,
    to,
    evidence: [{ entity: 'OutboundProviderEvent', changed_ids: changed.map((row) => row.id) }],
    changed,
  };
}

async function instantlyReconciliationReceiptProof(svc: any, attempt: any) {
  const from = String(attempt?.started_at || '');
  const leaseEnd = String(attempt?.lease_expires_at || '');
  const now = new Date().toISOString();
  const fromMs = Date.parse(from);
  const leaseEndMs = Date.parse(leaseEnd);
  if (!Number.isFinite(fromMs) || !Number.isFinite(leaseEndMs) || leaseEndMs < fromMs) {
    return { ok: false, reason: 'instantly_reconciliation_lease_window_unproven', from, leaseEnd, now };
  }
  if (Date.now() - leaseEndMs < 60 * 60 * 1000) {
    return { ok: false, reason: 'instantly_reconciliation_not_quiescent_long_enough', from, leaseEnd, now };
  }
  const afterLease = new Date(leaseEndMs + 1).toISOString();
  const domainChecks = [
    ['CommercialProviderState', ['updated_date', 'last_checked_at', 'last_success_at'], { provider: 'instantly' }],
    ['OutboundSendingProfile', ['updated_date', 'last_provider_health_at'], { provider: 'instantly' }],
    ['OutboundProviderEvent', ['updated_date', 'first_received_at', 'last_attempt_at', 'processed_at'], { provider: 'instantly' }],
    ['CommunicationMessage', ['updated_date', 'sent_at', 'received_at'], { provider: 'instantly' }],
    ['CommunicationThread', ['updated_date', 'last_message_at'], { external_provider: 'instantly' }],
  ] as const;
  const [costEvents, postLeaseCosts] = await Promise.all([
    svc.entities.CostUsageEvent.filter({ source: 'instantlyReconciliationWorker', occurred_at: { $gte: from, $lte: leaseEnd } }, '-occurred_at', 100),
    svc.entities.CostUsageEvent.filter({ source: 'instantlyReconciliationWorker', occurred_at: { $gte: afterLease } }, '-occurred_at', 2),
  ]);
  if (!Array.isArray(costEvents) || !Array.isArray(postLeaseCosts)) throw new Error('instantly_reconciliation_receipt_proof_unavailable');
  const windowEvidence: any[] = [];
  const postLeaseEvidence: any[] = [];
  for (const [entityName, fields, query] of domainChecks) {
    const [during, after] = await Promise.all([
      changedRows(svc.entities[entityName], [...fields], from, leaseEnd, query),
      changedRows(svc.entities[entityName], [...fields], afterLease, now, query),
    ]);
    windowEvidence.push({ entity: entityName, changed_ids: during.map((row: any) => row.id) });
    postLeaseEvidence.push({ entity: entityName, changed_ids: after.map((row: any) => row.id) });
  }
  const changed = windowEvidence.flatMap((row) => row.changed_ids.map((id: string) => ({ entity: row.entity, id })));
  const postLeaseChanged = postLeaseEvidence.flatMap((row) => row.changed_ids.map((id: string) => ({ entity: row.entity, id })));
  if (postLeaseCosts.length || postLeaseChanged.length) {
    return {
      ok: false,
      reason: 'instantly_reconciliation_activity_observed_after_attempt_lease',
      mode: 'BLOCKED',
      from,
      leaseEnd,
      now,
      post_lease_cost_event_ids: postLeaseCosts.map((row: any) => row.id),
      post_lease_changed: postLeaseChanged,
    };
  }
  if (changed.length) {
    return {
      ok: false,
      reason: 'instantly_reconciliation_domain_writes_require_manual_review',
      mode: 'BLOCKED',
      from,
      leaseEnd,
      now,
      changed,
      evidence: windowEvidence,
    };
  }
  if (!costEvents.length) {
    return {
      ok: true,
      reason: 'instantly_reconciliation_zero_writes_and_no_receipt',
      mode: 'PRE_EFFECT_ZERO_WRITES',
      from,
      leaseEnd,
      now,
      evidence: windowEvidence,
    };
  }
  const terminalStates = new Set(['OBSERVED', 'RECONCILED', 'VOID', 'FAILED']);
  const receiptsTerminal = costEvents.every((row: any) =>
    terminalStates.has(String(row?.status || '')) &&
    Number.isFinite(Date.parse(String(row?.completed_at || ''))) &&
    Date.parse(String(row.completed_at)) <= leaseEndMs &&
    String(row?.event_key || '').includes(String(attempt?.run_key || ''))
  );
  if (!receiptsTerminal) {
    return {
      ok: false,
      reason: 'instantly_reconciliation_cost_receipt_chain_incomplete',
      mode: 'BLOCKED',
      from,
      leaseEnd,
      now,
      receipt_ids: costEvents.map((row: any) => row.id),
      receipt_state: { receiptsTerminal },
    };
  }
  return {
    ok: true,
    reason: 'instantly_reconciliation_terminal_cost_receipts_quiescent_without_domain_writes',
    mode: 'POST_EFFECT_QUIESCENT',
    from,
    leaseEnd,
    now,
    evidence: {
      cost_event_ids: costEvents.map((row: any) => row.id),
      domain_writes: windowEvidence,
      post_lease_domain_writes: postLeaseEvidence,
    },
    receipt_state: { receiptsTerminal, domainWrites: 0, postLeaseWrites: 0 },
  };
}

async function discoveryAttemptReconciliationProof(svc: any, attempt: any) {
  const from = String(attempt?.started_at || '');
  const leaseEnd = String(attempt?.lease_expires_at || '');
  const now = new Date().toISOString();
  const fromMs = Date.parse(from);
  const leaseEndMs = Date.parse(leaseEnd);
  if (!Number.isFinite(fromMs) || !Number.isFinite(leaseEndMs) || leaseEndMs < fromMs) {
    return { ok: false, reason: 'discovery_attempt_lease_window_unproven', from, leaseEnd, now };
  }
  if (Date.now() - leaseEndMs < 60 * 60 * 1000) {
    return { ok: false, reason: 'discovery_attempt_not_quiescent_long_enough', from, leaseEnd, now };
  }
  const afterLease = new Date(leaseEndMs + 1).toISOString();
  const discoveryAgents = ['lead_orchestrator', 'lead_discovery', 'lead_enrichment', 'lead_scoring'];
  const [costEvents, checkpoints, reservoirRows, tasks, postLeaseCosts, postLeaseCheckpoints, postLeaseReservoir, postLeaseTasks, policies, activeRuns, savedSearches] = await Promise.all([
    svc.entities.CostUsageEvent.filter({ source: 'leadDiscoveryAgent', occurred_at: { $gte: from, $lte: leaseEnd } }, '-occurred_at', 100),
    svc.entities.LeadDiscoveryCheckpoint.filter({ last_attempt_at: { $gte: from, $lte: leaseEnd } }, '-last_attempt_at', 100),
    svc.entities.OutboundLead.filter({ reservoir_updated_at: { $gte: from, $lte: leaseEnd } }, '-reservoir_updated_at', 100),
    svc.entities.AgentTask.filter({ agent_name: { $in: discoveryAgents }, started_at: { $gte: from, $lte: leaseEnd } }, '-started_at', 100),
    svc.entities.CostUsageEvent.filter({ source: 'leadDiscoveryAgent', occurred_at: { $gte: afterLease } }, '-occurred_at', 2),
    svc.entities.LeadDiscoveryCheckpoint.filter({ last_attempt_at: { $gte: afterLease } }, '-last_attempt_at', 2),
    svc.entities.OutboundLead.filter({ reservoir_updated_at: { $gte: afterLease } }, '-reservoir_updated_at', 2),
    svc.entities.AgentTask.filter({ agent_name: { $in: discoveryAgents }, started_at: { $gte: afterLease } }, '-started_at', 2),
    svc.entities.CommercialPolicy.filter({ engine: 'merchant_acquisition', status: 'active' }, '-updated_date', 100),
    svc.entities.DiscoveryExecutionRun.filter({ status: { $in: ['QUEUED', 'RUNNING'] } }, '-heartbeat_at', 20),
    svc.entities.FounderSavedView.filter({ view_type: 'discovery_saved_search' }, '-updated_at', 500),
  ]);
  const reads = [costEvents, checkpoints, reservoirRows, tasks, postLeaseCosts, postLeaseCheckpoints, postLeaseReservoir, postLeaseTasks, policies, activeRuns, savedSearches];
  if (!reads.every(Array.isArray)) {
    throw new Error('discovery_reconciliation_proof_unavailable');
  }
  const activePolicies = policies.filter((row: any) =>
    row?.icp_json?.discovery_enabled === true &&
    Array.isArray(row?.countries) && row.countries.length > 0
  );
  const authority = {
    active_policy_ids: activePolicies.map((row: any) => row.id),
    active_run_ids: activeRuns.map((row: any) => row.id),
    saved_search_ids: savedSearches.filter((row: any) => row?.is_current !== false).map((row: any) => row.id),
  };
  const authorityPresent = Object.values(authority).some((ids) => ids.length > 0);
  if (authorityPresent) {
    return { ok: false, reason: 'discovery_material_authority_present', mode: 'BLOCKED', from, leaseEnd, now, authority };
  }
  const postLeaseActivity = {
    cost_event_ids: postLeaseCosts.map((row: any) => row.id),
    checkpoint_ids: postLeaseCheckpoints.map((row: any) => row.id),
    reservoir_lead_ids: postLeaseReservoir.map((row: any) => row.id),
    task_ids: postLeaseTasks.map((row: any) => row.id),
  };
  if (Object.values(postLeaseActivity).some((ids) => ids.length > 0)) {
    return { ok: false, reason: 'discovery_activity_observed_after_attempt_lease', mode: 'BLOCKED', from, leaseEnd, now, authority, postLeaseActivity };
  }
  const evidence = {
    cost_event_ids: costEvents.map((row: any) => row.id),
    checkpoint_ids: checkpoints.map((row: any) => row.id),
    reservoir_lead_sample_ids: reservoirRows.slice(0, 20).map((row: any) => row.id),
    reservoir_rows_observed_capped: reservoirRows.length,
    task_ids: tasks.map((row: any) => row.id),
  };
  const effectObserved = costEvents.length > 0 || checkpoints.length > 0 || reservoirRows.length > 0 || tasks.length > 0;
  if (!effectObserved) {
    return {
      ok: true,
      reason: 'discovery_attempt_zero_writes_and_no_material_authority',
      mode: 'PRE_EFFECT_ZERO_WRITES',
      from,
      leaseEnd,
      now,
      authority,
      evidence,
      postLeaseActivity,
    };
  }
  const terminalCostStates = new Set(['OBSERVED', 'RECONCILED', 'VOID', 'FAILED']);
  const costReceiptsTerminal = costEvents.length > 0 && costEvents.every((row: any) =>
    terminalCostStates.has(String(row?.status || '')) &&
    Number.isFinite(Date.parse(String(row?.completed_at || ''))) &&
    Date.parse(String(row.completed_at)) <= leaseEndMs
  );
  const checkpointIds = new Set(checkpoints.map((row: any) => String(row.id)));
  const costReceiptsAttributed = costEvents.every((row: any) => checkpointIds.has(String(row?.related_entity_id || '')));
  const tasksTerminal = tasks.length > 0 && tasks.every((row: any) =>
    !['queued', 'running'].includes(String(row?.status || '').toLowerCase()) &&
    Number.isFinite(Date.parse(String(row?.completed_at || ''))) &&
    Date.parse(String(row.completed_at)) <= leaseEndMs
  );
  const completeReceiptChain = costReceiptsTerminal && costReceiptsAttributed && checkpoints.length > 0 && reservoirRows.length > 0 && tasksTerminal;
  if (!completeReceiptChain) {
    return {
      ok: false,
      reason: 'discovery_post_effect_receipt_chain_incomplete',
      mode: 'BLOCKED',
      from,
      leaseEnd,
      now,
      authority,
      evidence,
      postLeaseActivity,
      receipt_state: { costReceiptsTerminal, costReceiptsAttributed, tasksTerminal },
    };
  }
  return {
    ok: true,
    reason: 'discovery_terminal_effect_receipts_quiescent_without_replay',
    mode: 'POST_EFFECT_QUIESCENT',
    from,
    leaseEnd,
    now,
    evidence,
    authority,
    postLeaseActivity,
    receipt_state: { costReceiptsTerminal, costReceiptsAttributed, tasksTerminal },
  };
}

async function inspectAdminSchedulerReconciliation(svc: any, workerKey: string) {
  const spec = ADMIN_SCHEDULER_RECONCILIATION[workerKey];
  if (!spec) return { ok: false, reason: 'scheduler_worker_not_allowlisted' };
  const [control] = await exactRows(
    svc.entities.SchedulerRun,
    { record_kind: 'CONTROL', control_key: `scheduler-control:${workerKey}` },
    'admin_scheduler_control_read',
  );
  if (!control?.active_attempt_id) {
    const decision = schedulerControlRecoveryDecision(control, null, []);
    return { ...decision, workerKey, control };
  }
  const [attempt] = await exactRows(
    svc.entities.SchedulerRun,
    { id: control.active_attempt_id, record_kind: 'ATTEMPT' },
    'admin_scheduler_attempt_read',
  );
  if (!attempt || String(attempt.worker_key || '') !== workerKey) {
    return { ok: false, reason: 'scheduler_attempt_worker_mismatch', workerKey, control, attempt };
  }
  let tasks: any[] = [];
  let domainProof: any = null;
  if (spec.taskAgent) {
    tasks = await svc.entities.AgentTask.filter({ agent_name: spec.taskAgent }, '-created_date', 200);
    if (!Array.isArray(tasks)) throw new Error('admin_scheduler_task_read_unavailable');
  }
  if (spec.proof === 'GROWTH_ZERO_WRITES') {
    domainProof = await growthAttemptZeroWriteProof(svc, attempt);
    if (!domainProof.ok) {
      return { ok: false, action: 'blocked', reason: domainProof.reason, workerKey, control, attempt, domainProof };
    }
  }
  if (spec.proof === 'MAINTENANCE_PRE_EFFECT') {
    domainProof = await maintenanceAttemptPreEffectProof(svc, attempt);
    if (!domainProof.ok) {
      return { ok: false, action: 'blocked', reason: domainProof.reason, workerKey, control, attempt, domainProof };
    }
  }
  if (spec.proof === 'LEGACY_RECOVER_PRE_EFFECT') {
    domainProof = await legacyRecoverAttemptPreEffectProof(svc, attempt);
    if (!domainProof.ok) {
      return { ok: false, action: 'blocked', reason: domainProof.reason, workerKey, control, attempt, domainProof };
    }
  }
  if (spec.proof === 'INSTANTLY_RETRY_ZERO_WRITES') {
    domainProof = await instantlyRetryAttemptZeroWriteProof(svc, attempt);
    if (!domainProof.ok) {
      return { ok: false, action: 'blocked', reason: domainProof.reason, workerKey, control, attempt, domainProof };
    }
  }
  if (spec.proof === 'INSTANTLY_RECONCILIATION_RECEIPTS') {
    domainProof = await instantlyReconciliationReceiptProof(svc, attempt);
    if (!domainProof.ok) {
      return { ok: false, action: 'blocked', reason: domainProof.reason, workerKey, control, attempt, domainProof };
    }
  }
  if (spec.proof === 'DISCOVERY_EFFECT_RECONCILIATION') {
    domainProof = await discoveryAttemptReconciliationProof(svc, attempt);
    if (!domainProof.ok) {
      return { ok: false, action: 'blocked', reason: domainProof.reason, workerKey, control, attempt, domainProof };
    }
  }
  if (spec.proof === 'DISASTER_RECOVERY_TERMINAL_BACKUP') {
    domainProof = await disasterRecoveryTerminalBackupProof(svc, attempt);
    if (!domainProof.ok) {
      return { ok: false, action: 'blocked', reason: domainProof.reason, workerKey, control, attempt, domainProof };
    }
  }
  const discoveryPreEffectProof = spec.proof === 'DISCOVERY_EFFECT_RECONCILIATION' && domainProof?.mode === 'PRE_EFFECT_ZERO_WRITES';
  const discoveryPostEffectProof = spec.proof === 'DISCOVERY_EFFECT_RECONCILIATION' && domainProof?.mode === 'POST_EFFECT_QUIESCENT';
  const instantlyPreEffectProof = spec.proof === 'INSTANTLY_RECONCILIATION_RECEIPTS' && domainProof?.mode === 'PRE_EFFECT_ZERO_WRITES';
  const instantlyPostEffectProof = spec.proof === 'INSTANTLY_RECONCILIATION_RECEIPTS' && domainProof?.mode === 'POST_EFFECT_QUIESCENT';
  const disasterRecoveryPostEffectProof = spec.proof === 'DISASTER_RECOVERY_TERMINAL_BACKUP' && domainProof?.mode === 'POST_EFFECT_QUIESCENT';
  const domainNoTaskProof = (
    ['GROWTH_ZERO_WRITES', 'MAINTENANCE_PRE_EFFECT', 'LEGACY_RECOVER_PRE_EFFECT', 'INSTANTLY_RETRY_ZERO_WRITES'].includes(spec.proof) &&
    domainProof?.ok === true
  ) || discoveryPreEffectProof || instantlyPreEffectProof;
  const decision = schedulerControlRecoveryDecision(control, attempt, tasks, {
    allowNoTaskProof: domainNoTaskProof,
    allowQuiescentPostEffectProof: discoveryPostEffectProof || instantlyPostEffectProof || disasterRecoveryPostEffectProof,
  });
  const taskId = decision.taskId || domainProof?.task_id || null;
  const task = taskId ? tasks.find((row) => row.id === taskId) : null;
  if (spec.proof === 'TASK_NO_EFFECT' && task?.material_effect === true) {
    return { ok: false, action: 'blocked', reason: 'scheduler_task_is_material', workerKey, control, attempt, task, domainProof };
  }
  return { ...decision, taskId, workerKey, control, attempt, task, domainProof };
}

async function reconcileAllowlistedSchedulerControl(svc: any, body: any, actor: string) {
  const workerKey = String(body.workerKey || '');
  const inspection: any = await inspectAdminSchedulerReconciliation(svc, workerKey);
  if (!inspection.ok || !['reset_control', 'reconcile_post_effect'].includes(String(inspection.action || ''))) return inspection;
  const control = inspection.control;
  const attempt = inspection.attempt;
  const postEffect = inspection.action === 'reconcile_post_effect';
  const confirmationKind = postEffect ? 'ACKNOWLEDGE_POST_EFFECT_NO_REPLAY' : 'RECONCILE_NO_REPLAY';
  const expectedConfirmation = `${confirmationKind}:${workerKey}:${attempt.id}:${Number(control.control_revision || 0)}`;
  if (body.action === 'inspect_scheduler_control') {
    return { ...inspection, expectedConfirmation };
  }
  if (
    body.confirmation !== expectedConfirmation ||
    String(body.attemptId || '') !== String(attempt.id) ||
    Number(body.controlRevision) !== Number(control.control_revision)
  ) {
    return { ok: false, action: 'blocked', reason: 'scheduler_reconciliation_confirmation_mismatch', expectedConfirmation };
  }
  const now = new Date().toISOString();
  if (postEffect) {
    const alreadyReconciled =
      attempt.status === 'FAILED' && attempt.material_effect_state === 'FAILED_POST_EFFECT' &&
      attempt.details_json?.post_effect_reconciliation_attempt_id === attempt.id;
    if (!alreadyReconciled) {
      const attemptUpdate = await svc.entities.SchedulerRun.updateMany({
        id: attempt.id,
        record_kind: 'ATTEMPT',
        status: attempt.status,
        material_effect_state: attempt.material_effect_state,
        attempt_token: String(attempt.attempt_token || ''),
        attempt_fence_revision: Number(attempt.attempt_fence_revision || 0),
      }, { $set: {
        status: 'FAILED',
        material_effect_state: 'FAILED_POST_EFFECT',
        heartbeat_at: now,
        completed_at: now,
        details_json: {
          ...(attempt.details_json || {}),
          reason: 'admin_reconciled_quiescent_post_effect',
          reconciled_at: now,
          reconciled_by: actor,
          reconciliation_proof: inspection.domainProof?.reason,
          reconciliation_evidence: inspection.domainProof?.evidence || {},
          reconciliation_receipt_state: inspection.domainProof?.receipt_state || {},
          post_effect_reconciliation_attempt_id: attempt.id,
          historical_attempt_replayed: false,
          effects_rolled_back: false,
        },
      } });
      if (!updatedExactlyOne(attemptUpdate)) throw new Error('admin_scheduler_attempt_changed_concurrently');
    }
    const observedAttempt = await svc.entities.SchedulerRun.get(attempt.id);
    if (
      observedAttempt?.status !== 'FAILED' ||
      observedAttempt?.material_effect_state !== 'FAILED_POST_EFFECT' ||
      observedAttempt?.details_json?.post_effect_reconciliation_attempt_id !== attempt.id
    ) throw new Error('admin_scheduler_attempt_readback_mismatch');
  }
  const controlPatch: any = {
    control_state: 'IDLE',
    control_revision: Number(control.control_revision) + 1,
    control_token: '',
    control_owner: '',
    control_claimed_at: '',
    control_expires_at: '',
    control_effects_started: false,
    active_attempt_id: '',
    active_run_key: '',
    active_operation_key: '',
    active_effect_key: '',
    heartbeat_at: now,
    details_json: {
      ...(control.details_json || {}),
      reason: postEffect ? 'admin_reconciled_quiescent_post_effect' : 'admin_reconciled_without_replay',
      reconciled_at: now,
      reconciled_by: actor,
      reconciliation_proof: inspection.domainProof?.reason || inspection.reason,
      reconciled_attempt_id: attempt.id,
      reconciled_task_id: inspection.taskId || null,
      historical_attempt_replayed: false,
      effects_rolled_back: postEffect ? false : null,
      ...(postEffect ? { last_run_key: attempt.run_key, last_terminal_at: now } : {}),
    },
  };
  if (postEffect) {
    controlPatch.last_terminal_status = 'FAILED';
    controlPatch.last_terminal_logical_trigger_key = String(attempt.logical_trigger_key || attempt.run_key || '');
    controlPatch.last_terminal_operation_key = String(attempt.operation_key || attempt.logical_trigger_key || attempt.run_key || '');
    controlPatch.last_terminal_effect_key = String(attempt.effect_key || '');
    if (
      attempt.invocation_kind === 'SCHEDULED' &&
      !String(attempt.operation_key || '').includes(':operation:')
    ) controlPatch.last_terminal_scheduled_key = String(attempt.run_key || '');
  }
  const update = await svc.entities.SchedulerRun.updateMany({
    id: control.id,
    record_kind: 'CONTROL',
    control_key: control.control_key,
    control_state: 'REVIEW_REQUIRED',
    control_revision: Number(control.control_revision),
    active_attempt_id: String(attempt.id),
  }, { $set: controlPatch });
  if (!updatedExactlyOne(update)) throw new Error('admin_scheduler_control_changed_concurrently');
  const observed = await svc.entities.SchedulerRun.get(control.id);
  if (
    observed?.control_state !== 'IDLE' ||
    Number(observed?.control_revision) !== Number(control.control_revision) + 1 ||
    String(observed?.active_attempt_id || '') !== ''
  ) throw new Error('admin_scheduler_control_readback_mismatch');
  return {
    ok: true,
    action: postEffect ? 'scheduler_post_effect_reconciled' : 'scheduler_control_reconciled',
    workerKey,
    controlId: control.id,
    attemptId: attempt.id,
    proof: inspection.domainProof?.reason || inspection.reason,
    taskId: inspection.taskId || null,
    historicalAttemptReplayed: false,
    effectsRolledBack: postEffect ? false : null,
    reconciliationKind: postEffect ? 'POST_EFFECT_QUIESCENT' : 'PRE_EFFECT_NO_REPLAY',
    reconciledAt: now,
  };
}

function project(row: any) {
  return {
    id: row.id, dedupeKey: row.dedupe_key, source: row.source, domain: row.domain, incidentType: row.incident_type,
    severity: row.severity, status: row.status, subjectType: row.subject_type || null, subjectId: row.subject_id || null,
    recoveryAction: row.recovery_action, summary: row.summary, details: row.details_json || {}, firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at, occurrenceCount: Number(row.occurrence_count || 0), acknowledgedAt: row.acknowledged_at || null,
    acknowledgedBy: row.acknowledged_by || null, lastRecoveryAt: row.last_recovery_at || null,
    lastRecoveryBy: row.last_recovery_by || null, recoveryAttempts: Number(row.recovery_attempts || 0),
    lastRecoveryError: row.last_recovery_error || null, resolvedAt: row.resolved_at || null, resolvedBy: row.resolved_by || null,
    resolutionNote: row.resolution_note || null,
  };
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'eclIncidentWorkflow',fallback:null,severity:'secondary'}));
    if (!user) return Response.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'forbidden' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;
    const now = new Date().toISOString();

    if (['inspect_scheduler_control', 'reconcile_scheduler_control'].includes(String(body.action || ''))) {
      const result = await reconcileAllowlistedSchedulerControl(svc, body, user.email || user.id || 'admin');
      return Response.json(result, { status: result.ok ? 200 : 409 });
    }

    if (body.action === 'snapshot') {
      const [activeRows, historyRows, taskRows] = await Promise.all([
        svc.entities.OperationalIncident.filter({ status: { $in: [...P7_ACTIVE_INCIDENT_STATUSES] } }, '-last_seen_at', LIST_MAX),
        svc.entities.OperationalIncident.filter({ status:'resolved' }, '-resolved_at', 50),
        svc.entities.AgentTask.filter({ agent_name:'ecl_production_health' }, '-created_date', 1),
      ]);
      const task = taskRows?.[0] || null;
      return Response.json({
        ok:true,
        action:'snapshot',
        incidents:(activeRows || []).map(project),
        history:(historyRows || []).map(project),
        health:task ? { id:task.id, status:task.status, startedAt:task.started_at || task.created_date || null, completedAt:task.completed_at || null, summary:task.output_payload_json || null, error:task.error || null } : null,
      });
    }

    if (body.action === 'list') {
      const limit = Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, LIST_MAX) : 100;
      const query: Record<string, unknown> = {};
      if (typeof body.status === 'string' && body.status) query.status = body.status;
      if (typeof body.severity === 'string' && body.severity) query.severity = body.severity;
      if (typeof body.domain === 'string' && body.domain) query.domain = body.domain;
      const rows = await svc.entities.OperationalIncident.filter(query, '-last_seen_at', limit);
      return Response.json({ ok: true, action: 'list', count: (rows || []).length, incidents: (rows || []).map(project) });
    }

    if (body.action === 'runtime') {
      const rows = await svc.entities.AgentTask.filter({ agent_name: 'ecl_production_health' }, '-created_date', 1);
      const task = rows?.[0] || null;
      return Response.json({ ok: true, action: 'runtime', health: task ? { id: task.id, status: task.status, startedAt: task.started_at || task.created_date || null, completedAt: task.completed_at || null, summary: task.output_payload_json || null, error: task.error || null } : null });
    }

    if (typeof body.incidentId !== 'string' || !body.incidentId) return Response.json({ ok: false, error: 'incidentId_required' }, { status: 400 });
    const incident = await svc.entities.OperationalIncident.get(body.incidentId).catch((error:any)=>safeBestEffort(error,{operation:'eclIncidentWorkflow',fallback:null,severity:'secondary'}));
    if (!incident) return Response.json({ ok: false, error: 'incident_not_found' }, { status: 404 });

    if (body.action === 'get') return Response.json({ ok: true, action: 'get', incident: project(incident) });
    if (incident.status === 'resolved') return Response.json({ ok: false, error: 'incident_already_resolved' }, { status: 409 });

    if (body.action === 'acknowledge') {
      const result = await svc.entities.OperationalIncident.updateMany({ id: incident.id, status: incident.status }, { $set: { status: 'acknowledged', acknowledged_at: now, acknowledged_by: user.email } });
      if (!updatedExactlyOne(result)) return Response.json({ ok: false, error: 'incident_changed_concurrently' }, { status: 409 });
      return Response.json({ ok: true, action: 'acknowledge', incidentId: incident.id, status: 'acknowledged' });
    }

    if (body.action === 'resolve') {
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
      if (!note) return Response.json({ ok: false, error: 'resolution_note_required' }, { status: 400 });
      const result = await svc.entities.OperationalIncident.updateMany({ id: incident.id, status: incident.status }, { $set: { status: 'resolved', resolved_at: now, resolved_by: user.email, resolution_note: note } });
      if (!updatedExactlyOne(result)) return Response.json({ ok: false, error: 'incident_changed_concurrently' }, { status: 409 });
      return Response.json({ ok: true, action: 'resolve', incidentId: incident.id, status: 'resolved' });
    }

    if (body.action !== 'recover') return Response.json({ ok: false, error: 'action_must_be_runtime_list_get_acknowledge_recover_or_resolve' }, { status: 400 });
    if (!P7_ACTIVE_INCIDENT_STATUSES.includes(incident.status)) return Response.json({ ok: false, error: 'incident_not_recoverable' }, { status: 409 });
    const invocation = recoveryInvocation(incident.recovery_action, incident.subject_id || null);
    if (!invocation) return Response.json({ ok: false, error: 'manual_inspection_required', recoveryAction: incident.recovery_action }, { status: 409 });

    const claim = await svc.entities.OperationalIncident.updateMany({ id: incident.id, status: incident.status }, { $set: { status: 'recovering', last_recovery_at: now, last_recovery_by: user.email, last_recovery_error: '' } });
    if (!updatedExactlyOne(claim)) return Response.json({ ok: false, error: 'incident_recovery_already_claimed' }, { status: 409 });

    try {
      const schedulerRecovery = await reconcileSchedulerControlBeforeRecovery(svc, invocation.functionName, user.email || user.id || 'admin');
      const response = await base44.asServiceRole.functions.invoke(invocation.functionName, invocation.payload);
      const result = response?.data || response;
      if (!result || result.ok === false || result.error) throw new Error(String(result?.message || result?.error || 'recovery_worker_failed'));
      await svc.entities.OperationalIncident.updateMany({ id: incident.id, status: 'recovering' }, { $set: { status: 'acknowledged', acknowledged_at: incident.acknowledged_at || now, acknowledged_by: incident.acknowledged_by || user.email, last_recovery_at: new Date().toISOString(), last_recovery_by: user.email, recovery_attempts: Number(incident.recovery_attempts || 0) + 1, last_recovery_error: '' } });
      return Response.json({ ok: true, action: 'recover', incidentId: incident.id, status: 'acknowledged', recoveryAction: incident.recovery_action, worker: invocation.functionName, schedulerRecovery, result });
    } catch (error) {
      const message = String((error as Error)?.message || error || 'recovery_failed').slice(0, 500);
      await svc.entities.OperationalIncident.updateMany({ id: incident.id, status: 'recovering' }, { $set: { status: 'acknowledged', acknowledged_at: incident.acknowledged_at || now, acknowledged_by: incident.acknowledged_by || user.email, last_recovery_at: new Date().toISOString(), last_recovery_by: user.email, recovery_attempts: Number(incident.recovery_attempts || 0) + 1, last_recovery_error: message } }).catch((error:any)=>safeBestEffort(error,{operation:'eclIncidentWorkflow',fallback:null,severity:'secondary'}));
      return Response.json({ ok: false, error: 'recovery_failed_safely', message }, { status: 409 });
    }
  } catch (error) {
    return internalErrorResponse(error, 'eclIncidentWorkflow');
  }
}
