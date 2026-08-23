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
