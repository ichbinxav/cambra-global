// v62.7 — ECL P4: OPERATIONAL WORKFLOW (canonical, pure).
//
// PURE. No I/O, no writes, no wall clock, no randomness: every time-dependent
// decision takes an INJECTED instant. This module owns the OPERATIONAL layer —
// what the scheduler should do next with an already-persisted lifecycle — and
// owns NO lifecycle semantics of its own: statuses, transitions, expiry windows
// and terminality all come from the P3 modules (eclLifecycle), which stay the
// single authoritative source. P4 asks; P3 decides.
//
// DELIBERATELY ABSENT: billing, invoicing, collections, Stripe, success fees,
// settlement. Nothing here reads or writes MonthlySavingsReport, Invoice or
// BillingRule, and no P4 output can become a monetary effect.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.

import { deepFreeze, sha256Hex, stableSerialize } from "./eclSerialize.js";
import {
  EVIDENCE_ENTITY_TYPES,
  isTerminalStatus,
  lifecycleIdempotencyKey,
  resolveExpiry,
} from "./eclLifecycle.js";

export const ECL_OPERATIONS_VERSION = "ecl-operations-1";

// The ONLY status that carries scheduled operational obligations: a provisional
// acceptance is the only state with a running clock (reminders + expiry).
// Everything else is either awaiting a human/ingest action or already dead.
export const OPERATIONAL_STATUSES = ["accepted_provisionally"];

// Statuses that never regain a scheduled action. `expired` and `rejected` are
// NOT terminal in the P3 graph (a later correction may supersede them), but
// they carry no OPERATIONAL obligation — the scheduler must never resurrect
// them, which is exactly the supersession/expiry invariant P3 established.
export const OPERATIONALLY_DEAD_STATUSES = ["superseded", "expired", "rejected", "verified"];

export const OPERATIONAL_ACTIONS = ["expire", "remind", "review", "none"];

export const REVIEW_DECISIONS = ["approve", "reject", "request_more_evidence", "dismiss"];

// Retry ladder for RETRYABLE infrastructure failures, in minutes. Bounded and
// explicit: after the last rung the operation escalates to a human instead of
// retrying forever. Permanent domain failures never enter the ladder at all.
export const RETRY_BACKOFF_MINUTES = [5, 15, 45, 120, 360];
export const MAX_OPERATIONAL_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;

// Failure codes classified as PERMANENT (domain/invariant): retrying them
// changes nothing, so they escalate to review immediately.
export const PERMANENT_FAILURE_CODES = [
  "invalid_persisted_state",
  "illegal_transition",
  "missing_authoritative_data",
  "checksum_mismatch",
  "checksum_unresolvable",
  "domain_invariant_violation",
  "unknown_entity_type",
];

export class EclOperationsError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclOperationsError";
  }
}

const opRequire = (cond, msg) => {
  if (!cond) throw new EclOperationsError(msg);
};
const opNonEmpty = (v) => typeof v === "string" && v.length > 0;
const opInstant = (v) => {
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : t;
};

/** Parse an injected instant or throw — P4 never falls back to a real clock. */
export function requireInstant(value, label) {
  const t = opInstant(value);
  opRequire(t !== null, `${label} must be an injected, parseable instant (no implicit clock)`);
  return t;
}

// ── P4-A · Due lifecycle discovery ───────────────────────────────────────
/**
 * Select the due lifecycle items from an ALREADY-FETCHED, persistence-filtered
 * page of records. Deterministic: filter → sort (dueAt asc, id asc) → bound.
 *
 * `records` are raw persisted rows; the caller maps them through `read` into
 * { id, nextActionAt, status }. A row with no nextActionAt is NOT due (nothing
 * scheduled it), a row whose nextActionAt is in the future is NOT due, and a
 * row in an operationally dead status is NEVER selected even if a stale
 * timestamp survived on it.
 */
export function selectDueLifecycleItems(records, options) {
  const o = options && typeof options === "object" ? options : {};
  const nowMs = requireInstant(o.now, "options.now");
  const limit = Number.isInteger(o.limit) && o.limit > 0 ? o.limit : 25;
  const read =
    typeof o.read === "function"
      ? o.read
      : (r) => ({ id: r && r.id, nextActionAt: r && r.next_lifecycle_action_at, status: r && r.evidence_status });

  const due = [];
  for (const raw of Array.isArray(records) ? records : []) {
    const r = read(raw);
    if (!r || !opNonEmpty(r.id)) continue;
    const dueMs = opInstant(r.nextActionAt);
    if (dueMs === null || dueMs > nowMs) continue;
    const status = opNonEmpty(r.status) ? r.status : "pending";
    if (OPERATIONALLY_DEAD_STATUSES.includes(status) || isTerminalStatus(status)) continue;
    due.push({ id: r.id, dueAt: new Date(dueMs).toISOString(), dueMs, status, entityType: opNonEmpty(r.entityType) ? r.entityType : null });
  }
  due.sort((a, b) => (a.dueMs === b.dueMs ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.dueMs - b.dueMs));
  return deepFreeze({
    total: due.length,
    truncated: due.length > limit,
    items: due.slice(0, limit).map((d) => ({ id: d.id, dueAt: d.dueAt, status: d.status, ...(d.entityType ? { entityType: d.entityType } : {}) })),
  });
}

// ── P4-C/D · Reminder + expiry schedule ──────────────────────────────────
/**
 * The reminder schedule of a provisional window, derived EXCLUSIVELY from the
 * policy (`windows.remindAtHours`) and the ORIGINAL provisional start. No
 * fallback constant: a policy without a usable schedule yields an empty one,
 * and an empty schedule means "no reminders", never "invent an interval".
 *
 * Offsets at or beyond the expiry boundary are DROPPED: a reminder must never
 * be scheduled for a moment the evidence is already expired.
 */
export function reminderScheduleFor(provisionalStartedAt, expiresAt, policy) {
  const startMs = requireInstant(provisionalStartedAt, "provisionalStartedAt");
  const expMs = opInstant(expiresAt);
  const hours = policy && policy.windows && Array.isArray(policy.windows.remindAtHours) ? policy.windows.remindAtHours : [];
  const out = [];
  for (const h of hours) {
    if (!Number.isFinite(h) || h <= 0) continue;
    const at = startMs + h * 3600000;
    if (expMs !== null && at >= expMs) continue;
    out.push(new Date(at).toISOString());
  }
  out.sort();
  return deepFreeze(out);
}

/**
 * THE OPERATIONAL DECISION. Given the persisted lifecycle state and the injected
 * instant, decide what the scheduler owes this record and when it is next due.
 *
 * state = { status, provisionalStartedAt?, expiresAt?, reminderCount? }
 * Returns { action, reason, dueAt, nextActionAt, reminderIndex, expiresAt }.
 *
 * INVARIANTS:
 *  · a dead/terminal status yields action "none" and nextActionAt null — a late
 *    scheduler run can never resurrect it;
 *  · expiry is computed from the ORIGINAL window only, so running late NEVER
 *    renews a provisional period;
 *  · an unrecoverable provisional window yields "review" (fail closed), never
 *    an assumed-valid window;
 *  · once the reminder schedule is exhausted the only remaining action is the
 *    expiry — reminders are bounded by the policy, not by a counter guess.
 */
export function planOperationalAction(state, policy, context) {
  const s = state && typeof state === "object" ? state : {};
  const ctx = context && typeof context === "object" ? context : {};
  const nowMs = requireInstant(ctx.now, "context.now");
  const nowIso = new Date(nowMs).toISOString();
  opRequire(opNonEmpty(s.status), "state.status is required");

  const none = (reason) => deepFreeze({ action: "none", reason, dueAt: null, nextActionAt: null, reminderIndex: null, expiresAt: s.expiresAt || null });

  if (isTerminalStatus(s.status) || OPERATIONALLY_DEAD_STATUSES.includes(s.status)) {
    return none(`lifecycle_not_operational:${s.status}`);
  }
  if (!OPERATIONAL_STATUSES.includes(s.status)) {
    // Awaiting ingest/human input: nothing is owed on a clock.
    return none(`no_scheduled_obligation:${s.status}`);
  }

  const expiry = resolveExpiry({ status: s.status, provisionalStartedAt: s.provisionalStartedAt, expiresAt: s.expiresAt }, policy, { now: nowIso });
  if (expiry.ambiguous) {
    return deepFreeze({ action: "review", reason: "provisional_window_unrecoverable", dueAt: nowIso, nextActionAt: null, reminderIndex: null, expiresAt: null });
  }
  if (expiry.lapsed) {
    return deepFreeze({ action: "expire", reason: "provisional_window_lapsed", dueAt: expiry.expiresAt, nextActionAt: null, reminderIndex: null, expiresAt: expiry.expiresAt });
  }

  const startedAt = s.provisionalStartedAt || null;
  const schedule = startedAt ? reminderScheduleFor(startedAt, expiry.expiresAt, policy) : deepFreeze([]);
  const sent = Number.isInteger(s.reminderCount) && s.reminderCount > 0 ? s.reminderCount : 0;

  // The next UNSENT reminder. Bounded by the policy schedule: index >= length
  // means every reminder this policy defines has already been persisted.
  if (sent < schedule.length) {
    const dueAt = schedule[sent];
    if (Date.parse(dueAt) <= nowMs) {
      return deepFreeze({ action: "remind", reason: "reminder_due", dueAt, nextActionAt: schedule[sent + 1] || expiry.expiresAt, reminderIndex: sent, expiresAt: expiry.expiresAt });
    }
    return deepFreeze({ action: "none", reason: "not_yet_due", dueAt: null, nextActionAt: dueAt, reminderIndex: sent, expiresAt: expiry.expiresAt });
  }
  return deepFreeze({ action: "none", reason: "awaiting_expiry", dueAt: null, nextActionAt: expiry.expiresAt, reminderIndex: null, expiresAt: expiry.expiresAt });
}

// ── P4-D · Reminder intent (event first, delivery after) ─────────────────
/**
 * Build the EvidenceLifecycleEvent record intent for ONE reminder. The reminder
 * is an EVENT, persisted BEFORE any delivery side effect, keyed on the evidence
 * + reminder index + scheduled instant — so a replay (or a second scheduler
 * run) resolves to the SAME claim and can never produce a second semantic
 * reminder. The status does not change: a reminder is not a transition.
 */
export function buildReminderIntent(input) {
  const i = input && typeof input === "object" ? input : {};
  opRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), `evidenceEntityType must be one of ${EVIDENCE_ENTITY_TYPES.join(", ")}`);
  opRequire(opNonEmpty(i.evidenceId), "evidenceId is required");
  opRequire(opNonEmpty(i.brandId), "brandId is required");
  opRequire(opNonEmpty(i.ownerEmail), "ownerEmail is required");
  opRequire(opNonEmpty(i.status), "status is required");
  opRequire(Number.isInteger(i.reminderIndex) && i.reminderIndex >= 0, "reminderIndex must be a non-negative integer");
  opRequire(opNonEmpty(i.scheduledFor), "scheduledFor is required");
  opRequire(opNonEmpty(i.correlationId), "correlationId is required");
  opRequire(!isTerminalStatus(i.status) && !OPERATIONALLY_DEAD_STATUSES.includes(i.status), `no reminder is owed in status ${i.status}`);

  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "operational_reminder",
    evidenceEntityType: i.evidenceEntityType,
    evidenceId: i.evidenceId,
    reminderIndex: i.reminderIndex,
    scheduledFor: i.scheduledFor,
  });

  return deepFreeze({
    idempotencyKey,
    reminderIndex: i.reminderIndex,
    record: {
      evidence_entity_type: i.evidenceEntityType,
      evidence_id: i.evidenceId,
      brand_id: i.brandId,
      owner_email: i.ownerEmail,
      from_status: i.status,
      to_status: i.status,
      event: `evidence_reminder_due:${i.reminderIndex}`,
      actor: "system",
      correlation_id: i.correlationId,
      idempotency_key: idempotencyKey,
      payload: {
        reminderIndex: i.reminderIndex,
        scheduledFor: i.scheduledFor,
        expiresAt: i.expiresAt || null,
        operationsVersion: ECL_OPERATIONS_VERSION,
      },
    },
  });
}

/** Deterministic correlation id for one operational run over one record. */
export function operationalCorrelationId(parts) {
  return `eclp4:${sha256Hex(stableSerialize(parts)).slice(0, 40)}`;
}

// ── P4-K · Failure classification + bounded retry ────────────────────────
/**
 * Classify an operational failure. RETRYABLE = infrastructure (persistence,
 * timeout, delivery); PERMANENT = domain/invariant, which never enters the
 * retry ladder. An exhausted ladder escalates to a human instead of looping.
 */
export function classifyOperationalFailure(failure, context) {
  const f = failure && typeof failure === "object" ? failure : {};
  const ctx = context && typeof context === "object" ? context : {};
  const nowMs = requireInstant(ctx.now, "context.now");
  const code = opNonEmpty(f.code) ? f.code : "unknown_failure";
  const attempt = Number.isInteger(f.attemptCount) && f.attemptCount > 0 ? f.attemptCount : 1;

  if (PERMANENT_FAILURE_CODES.includes(code)) {
    return deepFreeze({ retryable: false, code, attemptCount: attempt, nextRetryAt: null, escalate: true, reason: "permanent_domain_failure" });
  }
  if (attempt >= MAX_OPERATIONAL_ATTEMPTS) {
    return deepFreeze({ retryable: false, code, attemptCount: attempt, nextRetryAt: null, escalate: true, reason: "retry_budget_exhausted" });
  }
  const delayMinutes = RETRY_BACKOFF_MINUTES[attempt - 1];
  return deepFreeze({
    retryable: true,
    code,
    attemptCount: attempt,
    nextRetryAt: new Date(nowMs + delayMinutes * 60000).toISOString(),
    escalate: false,
    reason: "retryable_infrastructure_failure",
  });
}

/** Build the EvidenceLifecycleEvent intent recording an operational failure. */
export function buildOperationalFailureIntent(input) {
  const i = input && typeof input === "object" ? input : {};
  opRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), "evidenceEntityType is required");
  opRequire(opNonEmpty(i.evidenceId), "evidenceId is required");
  opRequire(opNonEmpty(i.brandId), "brandId is required");
  opRequire(opNonEmpty(i.ownerEmail), "ownerEmail is required");
  opRequire(opNonEmpty(i.status), "status is required");
  opRequire(opNonEmpty(i.correlationId), "correlationId is required");
  opRequire(i.classification && typeof i.classification === "object" && opNonEmpty(i.classification.code), "classification is required");

  const c = i.classification;
  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "operational_failure",
    evidenceEntityType: i.evidenceEntityType,
    evidenceId: i.evidenceId,
    code: c.code,
    attemptCount: c.attemptCount,
    correlationId: i.correlationId,
  });

  return deepFreeze({
    idempotencyKey,
    record: {
      evidence_entity_type: i.evidenceEntityType,
      evidence_id: i.evidenceId,
      brand_id: i.brandId,
      owner_email: i.ownerEmail,
      from_status: i.status,
      to_status: i.status,
      event: c.retryable === true ? `operational_failure_retryable:${c.code}` : `operational_failure_permanent:${c.code}`,
      actor: "system",
      correlation_id: i.correlationId,
      idempotency_key: idempotencyKey,
      // Codes and counters only — never a stack trace, never a raw provider body.
      payload: { code: c.code, attemptCount: c.attemptCount, nextRetryAt: c.nextRetryAt, escalate: c.escalate === true, operationsVersion: ECL_OPERATIONS_VERSION },
    },
  });
}

/** ReviewCase intent for an operational escalation (permanent/exhausted). */
export function buildOperationalEscalationIntent(input) {
  const i = input && typeof input === "object" ? input : {};
  opRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), "evidenceEntityType is required");
  opRequire(opNonEmpty(i.evidenceId), "evidenceId is required");
  opRequire(opNonEmpty(i.brandId), "brandId is required");
  opRequire(opNonEmpty(i.ownerEmail), "ownerEmail is required");
  opRequire(opNonEmpty(i.reasonCode), "reasonCode is required");

  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "operational_escalation",
    evidenceEntityType: i.evidenceEntityType,
    evidenceId: i.evidenceId,
    reasonCode: i.reasonCode,
  });
  return deepFreeze({
    idempotencyKey,
    record: {
      brand_id: i.brandId,
      owner_email: i.ownerEmail,
      reason_code: i.reasonCode,
      severity: i.severity === "economic" ? "economic" : "quality",
      status: "open",
      idempotency_key: idempotencyKey,
      evidence_entity_type: i.evidenceEntityType,
      evidence_id: i.evidenceId,
      blocking_actions: i.blockingActions && typeof i.blockingActions === "object" ? { ...i.blockingActions } : {},
    },
  });
}

// ── P4-P · Authoritative checksum binding (operational) ──────────────────
/**
 * The stored record is the ONLY source of the authoritative checksum. A caller
 * may supply one for concurrency/reference purposes; it is compared, never
 * substituted. There is no `stored || claimed` fallback anywhere in P4.
 */
export function resolveOperationalChecksum(storedChecksum, claimedChecksum, options) {
  const o = options && typeof options === "object" ? options : {};
  const stored = opNonEmpty(storedChecksum) ? storedChecksum : null;
  const claimed = opNonEmpty(claimedChecksum) ? claimedChecksum : null;
  if (stored === null) {
    if (o.required === false) {
      // Only for operations that do not bind an artifact; a claimed value is
      // STILL never promoted to authoritative.
      if (claimed !== null) {
        return deepFreeze({ ok: false, status: 409, code: "operational_checksum_unbindable", checksum: null, reason: "caller supplied a checksum for a record that stores none — refusing to treat it as authoritative" });
      }
      return deepFreeze({ ok: true, status: 200, code: "no_checksum_required", checksum: null, reason: null });
    }
    return deepFreeze({ ok: false, status: 422, code: "operational_checksum_unresolvable", checksum: null, reason: "stored record carries no usable checksum — refusing to operate on an unbindable artifact" });
  }
  if (claimed !== null && claimed !== stored) {
    return deepFreeze({ ok: false, status: 409, code: "operational_checksum_mismatch", checksum: null, reason: "supplied checksum does not match the stored evidence artifact" });
  }
  return deepFreeze({ ok: true, status: 200, code: "server_resolved", checksum: stored, reason: null });
}

// ── P4-E/F/N · Review case resolution ────────────────────────────────────
export const REVIEW_OPEN_STATUSES = ["open", "awaiting_merchant"];

/**
 * Plan the resolution of ONE ReviewCase. PURE and fail-closed:
 *  · a case that is not open resolves to a 409 conflict (no second winner);
 *  · a decision outside the domain vocabulary is refused;
 *  · a case whose evidence was superseded resolves as `superseded`, never as an
 *    approval — a dead sibling can never be approved back into life;
 *  · `approve` NEVER writes a status: it requires the evidence to be
 *    REPROCESSED through the P3 engine (reprocessRequired = true), which is
 *    what keeps manual review from becoming an escape hatch around ECL.
 */
export function planReviewResolution(input, context) {
  const i = input && typeof input === "object" ? input : {};
  const ctx = context && typeof context === "object" ? context : {};
  const nowMs = requireInstant(ctx.now, "context.now");
  const nowIso = new Date(nowMs).toISOString();
  const rc = i.reviewCase && typeof i.reviewCase === "object" ? i.reviewCase : null;
  opRequire(rc !== null && opNonEmpty(rc.id), "reviewCase with an id is required");
  opRequire(opNonEmpty(i.resolvedBy), "resolvedBy is required (server-resolved actor, never a payload claim)");
  opRequire(REVIEW_DECISIONS.includes(i.decision), `decision must be one of ${REVIEW_DECISIONS.join(", ")}`);

  if (!REVIEW_OPEN_STATUSES.includes(rc.status)) {
    return deepFreeze({ ok: false, status: 409, code: "review_case_already_resolved", update: null, reprocessRequired: false, reason: `review case is ${rc.status}` });
  }

  const evidenceStatus = opNonEmpty(i.evidenceStatus) ? i.evidenceStatus : null;
  if (evidenceStatus !== null && (isTerminalStatus(evidenceStatus) || evidenceStatus === "superseded")) {
    return deepFreeze({
      ok: true,
      status: 200,
      code: "review_case_superseded",
      reprocessRequired: false,
      reason: "the reviewed evidence was superseded — the case closes without a decision on dead evidence",
      update: {
        status: "dismissed",
        decision: "superseded",
        decision_notes: opNonEmpty(i.notes) ? i.notes : "",
        resolved_by: i.resolvedBy,
        resolved_at: nowIso,
      },
    });
  }

  // `request_more_evidence` parks the case on the merchant instead of closing it.
  // It remains unresolved and therefore records no `resolved_*` fields.
  if (i.decision === "request_more_evidence") {
    return deepFreeze({
      ok: true,
      status: 200,
      code: "review_case_awaiting_merchant",
      reprocessRequired: false,
      evidenceAction: "none",
      reason: "additional evidence requested from the merchant",
      update: {
        status: "awaiting_merchant",
        decision: "request_more_evidence",
        decision_notes: opNonEmpty(i.notes) ? i.notes : "",
      },
    });
  }

  const closing = i.decision === "dismiss" ? "dismissed" : "resolved";
  const evidenceAction = i.decision === "reject" ? "reject" : "reprocess";
  return deepFreeze({
    ok: true,
    status: 200,
    code: "review_case_resolved",
    // approve/dismiss remove this case as a blocker and re-enter the SAME P3
    // engine; reject uses the P3 transition graph to reach `rejected`.
    reprocessRequired: evidenceAction === "reprocess",
    evidenceAction,
    reason: `review resolved: ${i.decision}`,
    update: {
      status: closing,
      decision: i.decision,
      decision_notes: opNonEmpty(i.notes) ? i.notes : "",
      resolved_by: i.resolvedBy,
      resolved_at: nowIso,
    },
  });
}

/**
 * Rewrite ONLY the lifecycle status inside an already-persisted canonical ECL
 * snapshot, then hash exactly those bytes. Used by review rejection so the
 * top-level lifecycle column and the persisted snapshot can never disagree.
 * The input is cloned via stable serialization: no caller-owned object is
 * mutated or frozen as a side effect.
 */
export function rewritePersistedLifecycleStatus(snapshot, status) {
  opRequire(snapshot && typeof snapshot === "object", "persisted snapshot is required");
  opRequire(opNonEmpty(status), "status is required");
  const next = JSON.parse(stableSerialize(snapshot));
  next.lifecycle = next.lifecycle && typeof next.lifecycle === "object" ? next.lifecycle : {};
  next.lifecycle.status = status;
  const snapshotHash = sha256Hex(stableSerialize(next));
  return deepFreeze({ snapshot: next, snapshotHash });
}

/**
 * Audit event for a review resolution. A resolution is NOT a status change (the
 * engine owns those), so from_status === to_status here on purpose: the event
 * records WHO decided WHAT on WHICH case, bound to the authoritative evidence
 * identity and its stored checksum. The idempotency key covers the case, the
 * decision and the resolver, so a replayed resolution appends nothing.
 */
export function buildReviewResolutionEventIntent(input) {
  const i = input && typeof input === "object" ? input : {};
  opRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), "evidenceEntityType is required");
  opRequire(opNonEmpty(i.evidenceId), "evidenceId is required");
  opRequire(opNonEmpty(i.brandId), "brandId is required");
  opRequire(opNonEmpty(i.ownerEmail), "ownerEmail is required");
  opRequire(opNonEmpty(i.status), "status is required");
  opRequire(opNonEmpty(i.reviewCaseId), "reviewCaseId is required");
  opRequire(opNonEmpty(i.decision), "decision is required");
  opRequire(opNonEmpty(i.resolvedBy), "resolvedBy is required");
  opRequire(opNonEmpty(i.correlationId), "correlationId is required");

  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "review_resolution",
    reviewCaseId: i.reviewCaseId,
    decision: i.decision,
    resolvedBy: i.resolvedBy,
  });
  return deepFreeze({
    idempotencyKey,
    record: {
      evidence_entity_type: i.evidenceEntityType,
      evidence_id: i.evidenceId,
      brand_id: i.brandId,
      owner_email: i.ownerEmail,
      from_status: i.status,
      to_status: i.status,
      event: `review_case_${i.decision}`,
      actor: "reviewer",
      correlation_id: i.correlationId,
      idempotency_key: idempotencyKey,
      payload: {
        reviewCaseId: i.reviewCaseId,
        decision: i.decision,
        resolvedBy: i.resolvedBy,
        evidenceChecksum: opNonEmpty(i.evidenceChecksum) ? i.evidenceChecksum : null,
        reprocessRequired: i.reprocessRequired === true,
        operationsVersion: ECL_OPERATIONS_VERSION,
      },
    },
  });
}

/** Deterministic, bounded projection of a ReviewCase for the review queue. */
export function projectReviewCase(row, options) {
  const r = row && typeof row === "object" ? row : {};
  const o = options && typeof options === "object" ? options : {};
  const base = {
    id: r.id || null,
    brandId: r.brand_id || null,
    reasonCode: r.reason_code || null,
    severity: r.severity || null,
    status: r.status || null,
    evidenceEntityType: r.evidence_entity_type || null,
    evidenceId: r.evidence_id || null,
    createdAt: r.created_date || null,
    resolvedAt: r.resolved_at || null,
    resolvedBy: r.resolved_by || null,
    decision: r.decision || null,
  };
  if (o.detail !== true) return deepFreeze(base);
  return deepFreeze({
    ...base,
    ownerEmail: r.owner_email || null,
    decisionNotes: r.decision_notes || null,
    blockingActions: r.blocking_actions && typeof r.blocking_actions === "object" ? { ...r.blocking_actions } : {},
  });
}

// ── P4-L · Observability ─────────────────────────────────────────────────
export const OPERATIONAL_COUNTERS = [
  "dueFound",
  "processed",
  "transitioned",
  "expired",
  "remindersCreated",
  "reviewCasesCreated",
  "skipped",
  "replayed",
  "retryableFailures",
  "permanentFailures",
];

/** Deterministic aggregate summary — stable key order, no free-form logging. */
export function buildOperationalSummary(counters, context) {
  const c = counters && typeof counters === "object" ? counters : {};
  const ctx = context && typeof context === "object" ? context : {};
  const nowMs = requireInstant(ctx.now, "context.now");
  const out = {};
  for (const k of OPERATIONAL_COUNTERS) out[k] = Number.isInteger(c[k]) && c[k] > 0 ? c[k] : 0;
  return deepFreeze({
    operationsVersion: ECL_OPERATIONS_VERSION,
    runAt: new Date(nowMs).toISOString(),
    batchLimit: Number.isInteger(ctx.batchLimit) && ctx.batchLimit > 0 ? ctx.batchLimit : null,
    truncated: ctx.truncated === true,
    counters: out,
  });
}