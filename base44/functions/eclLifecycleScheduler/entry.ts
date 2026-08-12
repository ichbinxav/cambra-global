import { safeBestEffort } from '../../shared/bestEffort.ts';
// eclLifecycleScheduler — v0.63.0 ECL P4 closure (2026-08-08).
//
// Operational runner for BOTH ECL evidence types. Lifecycle semantics remain in
// the generated pure P3/P4 domain; this boundary only authenticates, injects one
// clock, performs server-side due discovery, persists idempotent intents, heals
// materialized counters after replay/crash, and isolates poison records.
//
// Reminder guarantee in P4: reminder INTENT/event persistence only. No provider
// delivery happens here. Billing and money movement are outside this function.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import {
  selectDueLifecycleItems,
  planOperationalAction,
  reconcileReminderCount,
  buildReminderIntent,
  buildOperationalFailureIntent,
  buildOperationalEscalationIntent,
  classifyOperationalFailure,
  operationalCorrelationId,
  buildOperationalSummary,
  resolveOperationalChecksum,
  buildLifecycleTransition,
  restoreLifecycleFromSnapshot,
  rewritePersistedLifecycleStatus,
} from '../../shared/generated/eclDomain.ts';
import { ECL_POLICY } from '../../shared/generated/eclPolicy.ts';
import { createOnce } from '../../shared/eclPersistence.ts';
import { claimSchedulerRun, finishSchedulerRun } from '../../shared/schedulerRun.ts';

const TARGETS = {
  statement_import: { entityName: 'StatementImport', entityType: 'statement_import' },
  savings_evidence: { entityName: 'SavingsEvidence', entityType: 'savings_evidence' },
};
const TARGET_LIST = Object.values(TARGETS);
const DEFAULT_BATCH = 25;
const MAX_BATCH = 100;
// A full persistence page is conservatively treated as truncated. The SDK may
// cap reads at MAX_BATCH, so we never depend on fetching a sentinel row 101.
const DISCOVERY_PAGE = MAX_BATCH;
const PLATFORM_TENANT = '_platform';
const SCHEDULER_AGENT_NAME = 'ecl_lifecycle_scheduler';
const SCHEDULER_TASK_TYPE = 'ecl_lifecycle_sweep';

class PermanentFailure extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.code = code;
  }
}

function targetFor(entityType: string) {
  const target = TARGETS[entityType];
  if (!target) throw new PermanentFailure('unknown_entity_type', `unknown evidence entity type: ${entityType}`);
  return target;
}

async function priorRetryableAttempts(svc, evidenceEntityType: string, evidenceId: string) {
  // Retry history is authoritative. If it cannot be read, the bounded ladder
  // must NOT silently reset to attempt 1; let the item remain due and fail the
  // recording attempt so the next run retries from an unknown-but-safe state.
  const rows = await svc.entities.EvidenceLifecycleEvent.filter(
    { evidence_entity_type: evidenceEntityType, evidence_id: evidenceId },
    '-created_date',
    20,
  );
  let n = 0;
  for (const r of rows || []) {
    const ev = r && typeof r.event === 'string' ? r.event : '';
    if (ev.startsWith('operational_failure_retryable:')) n += 1;
    else if (ev.length > 0) break;
  }
  return n;
}

function lifecyclePatch(record, toStatus: string, nextActionAt = '') {
  const patch: Record<string, unknown> = {
    evidence_status: toStatus,
    next_lifecycle_action_at: nextActionAt,
  };
  if (record.confidence_result && typeof record.confidence_result === 'object') {
    const rewritten = rewritePersistedLifecycleStatus(record.confidence_result, toStatus);
    patch.confidence_result = rewritten.snapshot;
    patch.confidence_result_hash = rewritten.snapshotHash;
  }
  return patch;
}

async function processOne(svc, item, now: string, counters) {
  const target = targetFor(item.entityType);
  const record = await svc.entities[target.entityName].get(item.id).catch((error:any)=>safeBestEffort(error,{operation:'eclLifecycleScheduler',fallback:null,severity:'secondary'}));
  if (!record) throw new PermanentFailure('missing_authoritative_data', 'evidence record not found');
  const brandId = record.brand_id;
  const ownerEmail = record.owner_email || record.created_by;
  if (!brandId || !ownerEmail) throw new PermanentFailure('missing_authoritative_data', 'record carries no brand/owner');

  const checksum = resolveOperationalChecksum(record.checksum, null, { required: false });
  if (checksum.ok !== true) throw new PermanentFailure('checksum_unresolvable', checksum.reason);

  // Authoritative state is re-read at processing time. Top-level P4 fields are
  // the operational projection; canonical snapshot remains the legacy fallback.
  const restored = restoreLifecycleFromSnapshot(
    record.confidence_result && typeof record.confidence_result === 'object' ? record.confidence_result : null,
  );
  const state = {
    status: record.evidence_status || (restored && restored.status) || 'pending',
    provisionalStartedAt: record.provisional_started_at || (restored && restored.provisionalStartedAt) || null,
    expiresAt: record.expires_at || (restored && restored.expiresAt) || null,
    reminderCount: Number.isInteger(record.reminder_count) ? record.reminder_count : 0,
  };

  const plan = planOperationalAction(state, ECL_POLICY, { now });
  const correlationId = operationalCorrelationId({
    evidenceEntityType: target.entityType,
    evidenceId: item.id,
    action: plan.action,
    dueAt: plan.dueAt,
    reminderIndex: plan.reminderIndex,
    status: state.status,
  });

  if (plan.action === 'none') {
    counters.skipped += 1;
    if ((record.next_lifecycle_action_at || null) !== (plan.nextActionAt || null)) {
      await svc.entities[target.entityName].update(item.id, { next_lifecycle_action_at: plan.nextActionAt || '' });
    }
    return { id: item.id, entityType: target.entityType, action: 'none', reason: plan.reason };
  }

  if (plan.action === 'remind') {
    const intent = buildReminderIntent({
      evidenceEntityType: target.entityType,
      evidenceId: item.id,
      brandId,
      ownerEmail,
      status: state.status,
      reminderIndex: plan.reminderIndex,
      scheduledFor: plan.dueAt,
      expiresAt: plan.expiresAt,
      correlationId,
    });
    const res = await createOnce(svc, 'EvidenceLifecycleEvent', intent.idempotencyKey, intent.record);

    // EVENT FIRST, materialized cache SECOND. Crucially this write happens even
    // when createOnce reports a replay: if a prior worker crashed after the
    // event but before the counter write, replay heals reminder_count forward.
    const healedReminderCount = reconcileReminderCount(state.reminderCount, plan.reminderIndex);
    await svc.entities[target.entityName].update(item.id, {
      reminder_count: healedReminderCount,
      next_lifecycle_action_at: plan.nextActionAt || '',
    });
    if (res.created) counters.remindersCreated += 1;
    else counters.replayed += 1;
    return {
      id: item.id,
      entityType: target.entityType,
      action: 'remind',
      reminderIndex: plan.reminderIndex,
      reminderCount: healedReminderCount,
      created: res.created,
    };
  }

  const toStatus = plan.action === 'expire' ? 'expired' : 'under_review';
  const event = plan.action === 'expire' ? 'provisional_expired' : `evidence_review_opened:${plan.reason}`;
  let transition;
  try {
    transition = buildLifecycleTransition({
      evidenceEntityType: target.entityType,
      evidenceId: item.id,
      brandId,
      ownerEmail,
      fromStatus: state.status,
      toStatus,
      event,
      actor: 'system',
      correlationId,
      payload: { reason: plan.reason, dueAt: plan.dueAt, operational: true },
    });
  } catch (err) {
    throw new PermanentFailure('illegal_transition', err.message);
  }

  const evt = transition.changed === true && transition.record
    ? await createOnce(svc, 'EvidenceLifecycleEvent', transition.idempotencyKey, transition.record)
    : { created: false, id: null };
  if (evt.created) counters.transitioned += 1;
  else counters.replayed += 1;

  if (plan.action === 'review') {
    const esc = buildOperationalEscalationIntent({
      evidenceEntityType: target.entityType,
      evidenceId: item.id,
      brandId,
      ownerEmail,
      reasonCode: plan.reason,
      severity: 'quality',
      blockingActions: { recover_proposal: true },
    });
    const rc = await createOnce(svc, 'ReviewCase', esc.idempotencyKey, esc.record);
    if (rc.created) counters.reviewCasesCreated += 1;
  } else {
    counters.expired += 1;
  }

  // Never rewrite provisional_started_at/expires_at: late execution cannot
  // renew a window. Only status/snapshot projection and scheduling are updated.
  await svc.entities[target.entityName].update(item.id, lifecyclePatch(record, toStatus, ''));
  return { id: item.id, entityType: target.entityType, action: plan.action, toStatus, created: evt.created };
}

async function recordFailure(svc, item, now: string, err, counters) {
  const target = targetFor(item.entityType);
  const record = await svc.entities[target.entityName].get(item.id).catch((error:any)=>safeBestEffort(error,{operation:'eclLifecycleScheduler',fallback:null,severity:'secondary'}));
  const brandId = record && record.brand_id;
  const ownerEmail = record && (record.owner_email || record.created_by);
  const code = err instanceof PermanentFailure ? err.code : 'persistence_unavailable';
  const attemptCount = (await priorRetryableAttempts(svc, target.entityType, item.id)) + 1;
  const classification = classifyOperationalFailure({ code, attemptCount }, { now });
  if (classification.retryable) counters.retryableFailures += 1;
  else counters.permanentFailures += 1;
  if (!record || !brandId || !ownerEmail) {
    return { id: item.id, entityType: target.entityType, action: 'failed', code, retryable: classification.retryable, recorded: false };
  }

  const correlationId = operationalCorrelationId({
    evidenceEntityType: target.entityType,
    evidenceId: item.id,
    kind: 'failure',
    code,
    attemptCount,
  });
  const failIntent = buildOperationalFailureIntent({
    evidenceEntityType: target.entityType,
    evidenceId: item.id,
    brandId,
    ownerEmail,
    status: record.evidence_status || 'pending',
    correlationId,
    classification,
  });
  // Failure telemetry is part of the operational truth. If the event write
  // fails, do NOT report recorded=true and do NOT mutate the schedule.
  await createOnce(svc, 'EvidenceLifecycleEvent', failIntent.idempotencyKey, failIntent.record);

  if (classification.retryable) {
    await svc.entities[target.entityName].update(item.id, { next_lifecycle_action_at: classification.nextRetryAt });
  } else {
    const esc = buildOperationalEscalationIntent({
      evidenceEntityType: target.entityType,
      evidenceId: item.id,
      brandId,
      ownerEmail,
      reasonCode: `operational_failure:${code}`,
      severity: 'quality',
      blockingActions: { show_dashboard: true },
    });
    // Loss-safe escalation: a permanent/exhausted item is unscheduled ONLY
    // after the human ReviewCase has been durably ensured. If this fails, the
    // item stays due and the next run retries the escalation.
    const rc = await createOnce(svc, 'ReviewCase', esc.idempotencyKey, esc.record);
    if (rc.created) counters.reviewCasesCreated += 1;
    await svc.entities[target.entityName].update(item.id, { next_lifecycle_action_at: '' });
  }
  return {
    id: item.id,
    entityType: target.entityType,
    action: 'failed',
    code,
    retryable: classification.retryable,
    attemptCount,
    recorded: true,
  };
}

Deno.serve(async (req) => {
  let svc = null;
  let task = null;
  let schedulerClaim = null;
  let schedulerOk = true;
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    svc = base44.asServiceRole;
    schedulerClaim = await claimSchedulerRun(svc, req, { worker_key:'eclLifecycleScheduler', cadence_seconds:900 });
    if (!schedulerClaim.allowed) return Response.json({ ok:true, duplicate_blocked:true, run_key:schedulerClaim.run_key });
    const now = new Date().toISOString();
    // Base44 scheduled automations deliver function_args under body.args;
    // manual/admin calls use the top-level body. Support both without letting
    // either exceed the same hard MAX_BATCH.
    const requestedLimit = body?.args?.limit ?? body?.limit;
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, MAX_BATCH) : DEFAULT_BATCH;
    const trigger = req.headers.get('base44-scheduled-task') === 'true' ? 'scheduled' : 'manual_or_internal';

    // Runtime proof only: lifecycle correctness must never depend on telemetry.
    task = await svc.entities.AgentTask.create({
      brand_id: PLATFORM_TENANT,
      agent_name: SCHEDULER_AGENT_NAME,
      task_type: SCHEDULER_TASK_TYPE,
      status: 'running',
      requires_approval: false,
      risk_level: 1,
      input_summary: `ECL lifecycle sweep · ${trigger} · batch ${limit}`,
      started_at: now,
    }).catch((error:any)=>safeBestEffort(error,{operation:'eclLifecycleScheduler',fallback:null,severity:'secondary'}));

    // True server-side due discovery: no future rows are fetched and therefore
    // future/legacy rows cannot starve due work. Each entity is bounded, then
    // the pure selector performs the deterministic global ordering/batch cut.
    const dueQuery = {
      evidence_status: 'accepted_provisionally',
      next_lifecycle_action_at: { $lte: now },
    };
    const pages = await Promise.all(
      TARGET_LIST.map(async (target) => {
        // Discovery is authoritative. A persistence read failure is NOT an
        // empty queue: let it fail the run so monitoring sees the outage.
        const rows = await svc.entities[target.entityName]
          .filter(dueQuery, 'next_lifecycle_action_at', DISCOVERY_PAGE);
        return (rows || []).map((r) => ({ ...r, __entityType: target.entityType }));
      }),
    );
    const candidates = pages.flat();
    const discoveryTruncated = pages.some((page) => page.length >= DISCOVERY_PAGE);
    const due = selectDueLifecycleItems(candidates, {
      now,
      limit,
      read: (r) => ({
        id: r && r.id,
        nextActionAt: r && r.next_lifecycle_action_at,
        status: r && r.evidence_status,
        entityType: r && r.__entityType,
      }),
    });

    const counters = {
      dueFound: due.total,
      processed: 0,
      transitioned: 0,
      expired: 0,
      remindersCreated: 0,
      reviewCasesCreated: 0,
      skipped: 0,
      replayed: 0,
      retryableFailures: 0,
      permanentFailures: 0,
    };
    const results = [];
    for (const item of due.items) {
      try {
        results.push(await processOne(svc, item, now, counters));
        counters.processed += 1;
      } catch (err) {
        results.push(
          await recordFailure(svc, item, now, err, counters).catch(() => ({
            id: item.id,
            entityType: item.entityType,
            action: 'failed',
            code: 'failure_unrecordable',
            retryable: true,
            recorded: false,
          })),
        );
      }
    }

    const summary = buildOperationalSummary(counters, { now, batchLimit: limit, truncated: due.truncated || discoveryTruncated });
    let observabilityRecorded = false;
    if (task?.id) {
      observabilityRecorded = await svc.entities.AgentTask.update(task.id, {
        status: 'completed',
        output_summary: `ECL sweep: ${summary.counters.processed}/${summary.counters.dueFound} processed · ${summary.counters.remindersCreated} reminder intents · ${summary.counters.expired} expired · ${summary.counters.reviewCasesCreated} review cases`,
        output_payload_json: summary,
        completed_at: new Date().toISOString(),
      }).then(() => true).catch(() => false);
    }

    return Response.json({
      ok: true,
      reminderGuarantee: 'intent_only',
      schedulerGuarantee: 'invocation_ready',
      observabilityGuarantee: observabilityRecorded ? 'agent_task_recorded' : 'best_effort_unavailable',
      summary,
      results,
    });
  } catch (error) {
    schedulerOk = false;
    const message = String(error?.message || error || 'unknown error');
    if (svc && task?.id) {
      await svc.entities.AgentTask.update(task.id, {
        status: 'failed',
        error: message.slice(0, 500),
        completed_at: new Date().toISOString(),
      }).catch((error:any)=>safeBestEffort(error,{operation:'eclLifecycleScheduler',fallback:null,severity:'secondary'}));
    }
    return Response.json({ ok: false, error: 'scheduler_run_failed', message }, { status: 500 });
  } finally {
    if (svc && schedulerClaim) await finishSchedulerRun(svc, schedulerClaim, { worker_key:'eclLifecycleScheduler' }, schedulerOk);
  }
});
