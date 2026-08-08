// eclLifecycleScheduler — v62.7 ECL P4 (2026-08-08).
//
// THE OPERATIONAL ENTRYPOINT of the Evidence Lifecycle. It owns NO lifecycle
// rules: every decision below is taken by the PURE domain in
// base44/shared/generated/eclDomain.ts (generated from src/lib/*), and this
// handler only:
//   1. authenticates (admin session OR the internal secret — a scheduled run
//      has no user, and absence of a user is otherwise treated as an attacker),
//   2. reads the server clock ONCE and injects it into every decision,
//   3. discovers a BOUNDED batch of due records with the service role,
//   4. persists the resulting intents idempotently (createOnce), and
//   5. returns a deterministic operational summary.
//
// SCOPE — StatementImport ONLY, and that is a fact about the schemas, not a
// shortcut: `next_lifecycle_action_at`, `reminder_count`, `provisional_*` and
// `expires_at` are top-level columns of StatementImport (P1). SavingsEvidence
// has NO operational columns and its schema is frozen, so it carries no
// scheduled obligation and is deliberately not scanned.
//
// DELIBERATELY ABSENT (P4 limits): no billing, no invoicing, no collections, no
// Stripe, no success fee, no settlement. Nothing here reads or writes
// MonthlySavingsReport, Invoice or BillingRule. Reminder DELIVERY is also
// absent: P4 persists the reminder EVENT (event-first), and a delivery adapter
// is a later, separate concern — this handler never sends and then tries to
// remember afterwards.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { requireAdminOrInternal } from '../../shared/internalGate.ts';
import {
  selectDueLifecycleItems,
  planOperationalAction,
  buildReminderIntent,
  buildOperationalFailureIntent,
  buildOperationalEscalationIntent,
  classifyOperationalFailure,
  operationalCorrelationId,
  buildOperationalSummary,
  resolveOperationalChecksum,
  buildLifecycleTransition,
  restoreLifecycleFromSnapshot,
} from '../../shared/generated/eclDomain.ts';
import { ECL_POLICY } from '../../shared/generated/eclPolicy.ts';
// ONE idempotent-create contract, shared by every ECL boundary (see the module
// for the honest guarantee: replay-safe, best-effort collapse, not exactly-once).
import { createOnce } from '../../shared/eclPersistence.ts';

const ENTITY = 'StatementImport';
const ENTITY_TYPE = 'statement_import';
const DEFAULT_BATCH = 25; // bounded by design
const MAX_BATCH = 100;

class PermanentFailure extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/** Consecutive retryable operational failures already recorded for this record. */
async function priorRetryableAttempts(svc, evidenceId) {
  const rows = await svc.entities.EvidenceLifecycleEvent.filter({ evidence_id: evidenceId }, '-created_date', 20).catch(() => []);
  let n = 0;
  for (const r of rows || []) {
    const ev = r && typeof r.event === 'string' ? r.event : '';
    if (ev.startsWith('operational_failure_retryable:')) n += 1;
    else if (ev.length > 0) break; // a later successful event resets the ladder
  }
  return n;
}

async function processOne(svc, item, now, counters) {
  const record = await svc.entities[ENTITY].get(item.id).catch(() => null);
  if (!record) throw new PermanentFailure('missing_authoritative_data', 'evidence record not found');
  const brandId = record.brand_id;
  const ownerEmail = record.owner_email || record.created_by;
  if (!brandId || !ownerEmail) throw new PermanentFailure('missing_authoritative_data', 'record carries no brand/owner');

  // P4-P — the STORED checksum is the only authoritative binding. The scheduler
  // supplies none, and no payload value could ever be promoted here.
  const checksum = resolveOperationalChecksum(record.checksum, null, { required: false });
  if (checksum.ok !== true) throw new PermanentFailure('checksum_unresolvable', checksum.reason);

  // Authoritative state, re-read at processing time (never the discovery copy).
  const restored = restoreLifecycleFromSnapshot(record.confidence_result && typeof record.confidence_result === 'object' ? record.confidence_result : null);
  const state = {
    status: record.evidence_status || (restored && restored.status) || 'pending',
    provisionalStartedAt: record.provisional_started_at || (restored && restored.provisionalStartedAt) || null,
    expiresAt: record.expires_at || (restored && restored.expiresAt) || null,
    reminderCount: Number.isInteger(record.reminder_count) ? record.reminder_count : 0,
  };

  const plan = planOperationalAction(state, ECL_POLICY, { now });
  const correlationId = operationalCorrelationId({
    evidenceEntityType: ENTITY_TYPE,
    evidenceId: item.id,
    action: plan.action,
    dueAt: plan.dueAt,
    reminderIndex: plan.reminderIndex,
    status: state.status,
  });

  // ── none: nothing owed. Only the next due timestamp is (re)aligned. ──────
  if (plan.action === 'none') {
    counters.skipped += 1;
    if ((record.next_lifecycle_action_at || null) !== (plan.nextActionAt || null)) {
      await svc.entities[ENTITY].update(item.id, { next_lifecycle_action_at: plan.nextActionAt || '' });
    }
    return { id: item.id, action: 'none', reason: plan.reason };
  }

  // ── remind: EVENT FIRST, then the counter. A replay finds the same claim. ─
  if (plan.action === 'remind') {
    const intent = buildReminderIntent({
      evidenceEntityType: ENTITY_TYPE,
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
    if (res.created) {
      counters.remindersCreated += 1;
      await svc.entities[ENTITY].update(item.id, {
        reminder_count: state.reminderCount + 1,
        next_lifecycle_action_at: plan.nextActionAt || '',
      });
    } else {
      counters.replayed += 1;
      // The semantic reminder already exists; only the schedule is realigned.
      await svc.entities[ENTITY].update(item.id, { next_lifecycle_action_at: plan.nextActionAt || '' });
    }
    return { id: item.id, action: 'remind', reminderIndex: plan.reminderIndex, created: res.created };
  }

  // ── expire / review: a real lifecycle transition, built by the P3 module ──
  const toStatus = plan.action === 'expire' ? 'expired' : 'under_review';
  const event = plan.action === 'expire' ? 'provisional_expired' : `evidence_review_opened:${plan.reason}`;
  let transition;
  try {
    transition = buildLifecycleTransition({
      evidenceEntityType: ENTITY_TYPE,
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
      evidenceEntityType: ENTITY_TYPE,
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

  // The provisional window itself is NEVER rewritten here: expiry is a
  // consequence of the ORIGINAL timestamps, so running late cannot renew it.
  await svc.entities[ENTITY].update(item.id, { evidence_status: toStatus, next_lifecycle_action_at: '' });
  return { id: item.id, action: plan.action, toStatus, created: evt.created };
}

async function recordFailure(svc, item, now, err, counters) {
  const record = await svc.entities[ENTITY].get(item.id).catch(() => null);
  const brandId = record && record.brand_id;
  const ownerEmail = record && (record.owner_email || record.created_by);
  const code = err instanceof PermanentFailure ? err.code : 'persistence_unavailable';
  const attemptCount = (await priorRetryableAttempts(svc, item.id)) + 1;
  const classification = classifyOperationalFailure({ code, attemptCount }, { now });
  if (classification.retryable) counters.retryableFailures += 1;
  else counters.permanentFailures += 1;
  if (!record || !brandId || !ownerEmail) {
    // Nothing authoritative to bind an event to — reported, never invented.
    return { id: item.id, action: 'failed', code, retryable: classification.retryable, recorded: false };
  }

  const correlationId = operationalCorrelationId({ evidenceEntityType: ENTITY_TYPE, evidenceId: item.id, kind: 'failure', code, attemptCount });
  const failIntent = buildOperationalFailureIntent({
    evidenceEntityType: ENTITY_TYPE,
    evidenceId: item.id,
    brandId,
    ownerEmail,
    status: record.evidence_status || 'pending',
    correlationId,
    classification,
  });
  await createOnce(svc, 'EvidenceLifecycleEvent', failIntent.idempotencyKey, failIntent.record).catch(() => null);

  if (classification.retryable) {
    await svc.entities[ENTITY].update(item.id, { next_lifecycle_action_at: classification.nextRetryAt }).catch(() => null);
  } else {
    // Escalate to a human and STOP scheduling: a permanent domain failure must
    // never enter an infinite retry.
    const esc = buildOperationalEscalationIntent({
      evidenceEntityType: ENTITY_TYPE,
      evidenceId: item.id,
      brandId,
      ownerEmail,
      reasonCode: `operational_failure:${code}`,
      severity: 'quality',
      blockingActions: { show_dashboard: true },
    });
    const rc = await createOnce(svc, 'ReviewCase', esc.idempotencyKey, esc.record).catch(() => null);
    if (rc && rc.created) counters.reviewCasesCreated += 1;
    await svc.entities[ENTITY].update(item.id, { next_lifecycle_action_at: '' }).catch(() => null);
  }
  return { id: item.id, action: 'failed', code, retryable: classification.retryable, attemptCount, recorded: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    // Server-trusted actor only: an admin session or the internal secret. A
    // role claimed inside the payload is never read.
    const gate = await requireAdminOrInternal(req, base44, body);
    if (!gate.ok) return gate.response;

    const svc = base44.asServiceRole;
    // The clock is read ONCE, at the boundary, and injected everywhere below.
    const now = new Date().toISOString();
    const limit = Number.isInteger(body?.limit) && body.limit > 0 ? Math.min(body.limit, MAX_BATCH) : DEFAULT_BATCH;

    // Indexed, bounded fetch: only records the persistence layer can already
    // narrow (a scheduled action exists at all), then the pure selector applies
    // the deterministic due/eligibility rules.
    const candidates = await svc.entities[ENTITY].filter({ evidence_status: 'accepted_provisionally' }, 'next_lifecycle_action_at', MAX_BATCH * 4).catch(() => []);
    const due = selectDueLifecycleItems(candidates || [], { now, limit });

    const counters = { dueFound: due.total, processed: 0, transitioned: 0, expired: 0, remindersCreated: 0, reviewCasesCreated: 0, skipped: 0, replayed: 0, retryableFailures: 0, permanentFailures: 0 };
    const results = [];
    for (const item of due.items) {
      // One poison record can never abort the batch: each item is isolated.
      try {
        results.push(await processOne(svc, item, now, counters));
        counters.processed += 1;
      } catch (err) {
        results.push(await recordFailure(svc, item, now, err, counters).catch(() => ({ id: item.id, action: 'failed', code: 'failure_unrecordable', retryable: true, recorded: false })));
      }
    }

    return Response.json({
      ok: true,
      summary: buildOperationalSummary(counters, { now, batchLimit: limit, truncated: due.truncated }),
      results,
    });
  } catch (error) {
    // Stable, non-leaking error surface: no stack, no payload echo.
    return Response.json({ ok: false, error: 'scheduler_run_failed', message: error.message }, { status: 500 });
  }
});