import { safeBestEffort } from '../../shared/bestEffort.ts';
// eclIncidentWorkflow — CAMBRA v0.66.0 / ECL P7.
// Admin-only incident queue and bounded recovery. Recovery actions are mapped
// by the pure P7 contract; arbitrary function names/payloads are never accepted.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { recoveryInvocation, P7_ACTIVE_INCIDENT_STATUSES, schedulerControlRecoveryDecision } from '../../shared/eclOperationalRecovery.ts';
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
  proof: 'TASK_NO_EFFECT' | 'GROWTH_ZERO_WRITES' | 'MAINTENANCE_PRE_EFFECT' | 'LEGACY_RECOVER_PRE_EFFECT' | 'INSTANTLY_RETRY_ZERO_WRITES';
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
  const domainNoTaskProof = ['GROWTH_ZERO_WRITES', 'MAINTENANCE_PRE_EFFECT', 'LEGACY_RECOVER_PRE_EFFECT', 'INSTANTLY_RETRY_ZERO_WRITES'].includes(spec.proof) && domainProof?.ok === true;
  const decision = schedulerControlRecoveryDecision(control, attempt, tasks, {
    allowNoTaskProof: domainNoTaskProof,
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
  if (!inspection.ok || inspection.action !== 'reset_control') return inspection;
  const control = inspection.control;
  const attempt = inspection.attempt;
  const expectedConfirmation = `RECONCILE_NO_REPLAY:${workerKey}:${attempt.id}:${Number(control.control_revision || 0)}`;
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
  const update = await svc.entities.SchedulerRun.updateMany({
    id: control.id,
    record_kind: 'CONTROL',
    control_key: control.control_key,
    control_state: 'REVIEW_REQUIRED',
    control_revision: Number(control.control_revision),
    active_attempt_id: String(attempt.id),
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
      reason: 'admin_reconciled_without_replay',
      reconciled_at: now,
      reconciled_by: actor,
      reconciliation_proof: inspection.domainProof?.reason || inspection.reason,
      reconciled_attempt_id: attempt.id,
      reconciled_task_id: inspection.taskId || null,
      historical_attempt_replayed: false,
    },
  } });
  if (!updatedExactlyOne(update)) throw new Error('admin_scheduler_control_changed_concurrently');
  const observed = await svc.entities.SchedulerRun.get(control.id);
  if (
    observed?.control_state !== 'IDLE' ||
    Number(observed?.control_revision) !== Number(control.control_revision) + 1 ||
    String(observed?.active_attempt_id || '') !== ''
  ) throw new Error('admin_scheduler_control_readback_mismatch');
  return {
    ok: true,
    action: 'scheduler_control_reconciled',
    workerKey,
    controlId: control.id,
    attemptId: attempt.id,
    proof: inspection.domainProof?.reason || inspection.reason,
    taskId: inspection.taskId || null,
    historicalAttemptReplayed: false,
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
