// v62.7 — ECL P4 CLOSURE regression matrix (operational workflow).
//
// Covers due discovery, scheduler semantics, automatic expiration, bounded
// reminders, review-case creation/resolution, RBAC, audit trail, idempotency /
// concurrency, retry & recovery, authoritative checksum binding, observability
// and P1/P2/P3 compatibility.
//
// Handler-level behavior (auth gates, batch isolation, HTTP mapping, absence of
// any billing effect) is verified as SOURCE CONTRACTS on the deployed entry.ts
// — the repo's established pattern — because a Deno handler cannot be imported
// into vitest and Base44 database uniqueness must never be faked in memory.
// Everything that CAN be exercised as behavior is exercised as behavior.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  selectDueLifecycleItems,
  planOperationalAction,
  reconcileReminderCount,
  rewritePersistedLifecycleStatus,
  reminderScheduleFor,
  buildReminderIntent,
  buildOperationalFailureIntent,
  buildOperationalEscalationIntent,
  buildReviewResolutionEventIntent,
  classifyOperationalFailure,
  planReviewResolution,
  projectReviewCase,
  buildOperationalSummary,
  operationalCorrelationId,
  resolveOperationalChecksum,
  OPERATIONALLY_DEAD_STATUSES,
  MAX_OPERATIONAL_ATTEMPTS,
  RETRY_BACKOFF_MINUTES,
  ECL_OPERATIONS_VERSION,
} from "./eclOperations.js";
import { runEclEngine, buildPersistedEvidenceSnapshot, restoreLifecycleFromSnapshot } from "./eclEngine.js";
import { normalizePaymentsEvidence } from "./normalizedEvidence.js";
import { ECL_POLICY } from "./generated/eclPolicy.js";

const HOUR = 3600000;
const START = "2026-08-01T00:00:00.000Z";
const startMs = Date.parse(START);
const WINDOW_H = ECL_POLICY.windows.provisionalDays * 24;
const EXPIRES = new Date(startMs + WINDOW_H * HOUR).toISOString();
const REMIND = ECL_POLICY.windows.remindAtHours;
const at = (h) => new Date(startMs + h * HOUR).toISOString();

const provisional = (over = {}) => ({ status: "accepted_provisionally", provisionalStartedAt: START, expiresAt: EXPIRES, reminderCount: 0, ...over });
const IDENT = { evidenceEntityType: "statement_import", evidenceId: "si-1", brandId: "brand-1", ownerEmail: "m@x.com" };

const SCHED_SRC = fs.readFileSync("base44/functions/eclLifecycleScheduler/entry.ts", "utf8");
const REVIEW_SRC = fs.readFileSync("base44/functions/eclReviewWorkflow/entry.ts", "utf8");
const OPS_SRC = fs.readFileSync("src/lib/eclOperations.js", "utf8");
const SHARED_SRC = fs.readFileSync("base44/shared/eclPersistence.ts", "utf8");
const PROCESS_SRC = fs.readFileSync("base44/functions/eclProcessEvidence/entry.ts", "utf8");
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// ── 1-6 · due discovery ───────────────────────────────────────────────────
describe("P4-A · due discovery", () => {
  const rows = [
    { id: "b", next_lifecycle_action_at: at(80), evidence_status: "accepted_provisionally" },
    { id: "a", next_lifecycle_action_at: at(72), evidence_status: "accepted_provisionally" },
    { id: "future", next_lifecycle_action_at: at(200), evidence_status: "accepted_provisionally" },
    { id: "dead", next_lifecycle_action_at: at(1), evidence_status: "superseded" },
    { id: "unscheduled", evidence_status: "accepted_provisionally" },
  ];

  it("1. a future action is never selected", () => {
    expect(selectDueLifecycleItems(rows, { now: at(100) }).items.map((i) => i.id)).not.toContain("future");
  });
  it("2. due actions are selected oldest-first, deterministically", () => {
    expect(selectDueLifecycleItems(rows, { now: at(100) }).items.map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("3. operationally dead evidence is never reprocessed, stale timestamp or not", () => {
    expect(selectDueLifecycleItems(rows, { now: at(100) }).items.map((i) => i.id)).not.toContain("dead");
    for (const s of OPERATIONALLY_DEAD_STATUSES) {
      expect(selectDueLifecycleItems([{ id: "x", next_lifecycle_action_at: at(1), evidence_status: s }], { now: at(100) }).items).toEqual([]);
    }
  });
  it("4. the batch is bounded and reports truncation", () => {
    const r = selectDueLifecycleItems(rows, { now: at(100), limit: 1 });
    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(2);
    expect(r.truncated).toBe(true);
  });
  it("5. `now` is always injected — no implicit clock exists in the pure layer", () => {
    expect(() => selectDueLifecycleItems(rows, {})).toThrow(/injected, parseable instant/);
    expect(() => planOperationalAction(provisional(), ECL_POLICY, {})).toThrow(/injected, parseable instant/);
    expect(OPS_SRC).not.toMatch(/Date\.now\(\)/);
    expect(OPS_SRC).not.toMatch(/new Date\(\)/);
  });
  it("6. one failing item cannot abort the batch (handler contract)", () => {
    expect(SCHED_SRC).toMatch(/for \(const item of due\.items\)/);
    expect(SCHED_SRC).toMatch(/for \(const item of due\.items\)/);
    expect(SCHED_SRC).toMatch(/recordFailure\(svc, item, now, err, counters\)/);
    expect(SCHED_SRC).toMatch(/results\.push\(await processOne/);
  });
});

// ── P3 → P4 handoff · the initial operational timestamp ───────────────────
describe("P3 → P4 handoff · initial next_lifecycle_action_at", () => {
  const P3_SRC = fs.readFileSync("base44/functions/eclProcessEvidence/entry.ts", "utf8");

  it("a newly accepted provisional record is given its FIRST operational timestamp", () => {
    const p = planOperationalAction(provisional(), ECL_POLICY, { now: START });
    expect(p.nextActionAt).toBe(at(REMIND[0]));
    expect(P3_SRC).toMatch(/next_lifecycle_action_at: nextActionAt \|\| ''/);
    expect(P3_SRC).toMatch(/P3 → P4 HANDOFF/);
  });
  it("the handoff uses the SAME pure planner as the scheduler (one calculation)", () => {
    expect(P3_SRC).toMatch(/planOperationalAction\(/);
    expect(SCHED_SRC).toMatch(/planOperationalAction\(state, ECL_POLICY, \{ now \}\)/);
  });
  it("reload preserves the schedule and re-processing never renews the window", () => {
    const reloaded = provisional({ reminderCount: 0 });
    const first = planOperationalAction(reloaded, ECL_POLICY, { now: START });
    const later = planOperationalAction(reloaded, ECL_POLICY, { now: at(REMIND[0] - 2) });
    expect(later.nextActionAt).toBe(first.nextActionAt);
    expect(later.expiresAt).toBe(EXPIRES);
    // The handoff derives from the ORIGINAL window, never from the clock.
    expect(P3_SRC).toMatch(/derived from the ORIGINAL window/);
  });
  it("once due, the scheduler discovers the record by that very timestamp", () => {
    const due = selectDueLifecycleItems(
      [{ id: "si-1", next_lifecycle_action_at: at(REMIND[0]), evidence_status: "accepted_provisionally" }],
      { now: at(REMIND[0]) },
    );
    expect(due.items.map((i) => i.id)).toEqual(["si-1"]);
  });
  it("a non-operational outcome clears the schedule instead of leaving a stale one", () => {
    const p = planOperationalAction({ status: "verified" }, ECL_POLICY, { now: START });
    expect(p.nextActionAt).toBe(null);
  });
});

// ── 7-12 · provisional expiration ─────────────────────────────────────────
describe("P4-C · automatic provisional expiration", () => {
  it("7. expires at/after the exact boundary", () => {
    expect(planOperationalAction(provisional({ reminderCount: REMIND.length }), ECL_POLICY, { now: at(WINDOW_H + 0.01) }).action).toBe("expire");
    expect(planOperationalAction(provisional({ reminderCount: REMIND.length }), ECL_POLICY, { now: at(WINDOW_H + 48) }).action).toBe("expire");
  });
  it("8. does not expire before the boundary", () => {
    const p = planOperationalAction(provisional({ reminderCount: REMIND.length }), ECL_POLICY, { now: at(WINDOW_H - 1) });
    expect(p.action).toBe("none");
    expect(p.nextActionAt).toBe(EXPIRES);
  });
  it("9. replay expires ONCE semantically (same boundary → same claim)", () => {
    const a = planOperationalAction(provisional({ reminderCount: 2 }), ECL_POLICY, { now: at(WINDOW_H + 1) });
    const b = planOperationalAction(provisional({ reminderCount: 2 }), ECL_POLICY, { now: at(WINDOW_H + 5) });
    expect([a.action, b.action]).toEqual(["expire", "expire"]);
    expect(a.dueAt).toBe(b.dueAt);
    expect(a.dueAt).toBe(EXPIRES);
  });
  it("10. running LATE never renews the window", () => {
    const late = planOperationalAction(provisional({ reminderCount: 2 }), ECL_POLICY, { now: at(WINDOW_H + 720) });
    expect(late.expiresAt).toBe(EXPIRES);
    expect(SCHED_SRC).toMatch(/Never rewrite provisional_started_at\/expires_at/);
    expect(SCHED_SRC).not.toMatch(/provisional_started_at:/);
  });
  it("11. expired evidence is never resurrected by a later run", () => {
    const p = planOperationalAction({ status: "expired", provisionalStartedAt: START, expiresAt: EXPIRES }, ECL_POLICY, { now: at(400) });
    expect(p.action).toBe("none");
    expect(p.nextActionAt).toBe(null);
    expect(p.reason).toBe("lifecycle_not_operational:expired");
  });
  it("12. superseded provisional evidence stays dead", () => {
    expect(planOperationalAction({ status: "superseded", provisionalStartedAt: START, expiresAt: EXPIRES }, ECL_POLICY, { now: at(400) }).action).toBe("none");
  });
  it("12b. an unrecoverable provisional window fails CLOSED to review", () => {
    const p = planOperationalAction({ status: "accepted_provisionally" }, ECL_POLICY, { now: at(10) });
    expect(p.action).toBe("review");
    expect(p.reason).toBe("provisional_window_unrecoverable");
  });
});

// ── 13-20 · reminders ─────────────────────────────────────────────────────
describe("P4-D · reminder orchestration", () => {
  it("13. no reminder before its due time", () => {
    const p = planOperationalAction(provisional(), ECL_POLICY, { now: at(REMIND[0] - 1) });
    expect(p.action).toBe("none");
    expect(p.nextActionAt).toBe(at(REMIND[0]));
  });
  it("14. the reminder becomes due at the exact boundary", () => {
    const p = planOperationalAction(provisional(), ECL_POLICY, { now: at(REMIND[0]) });
    expect(p.action).toBe("remind");
    expect(p.reminderIndex).toBe(0);
    expect(p.dueAt).toBe(at(REMIND[0]));
  });
  it("15. replay resolves to the SAME reminder claim; a later reminder is a new one", () => {
    const key = (now) => {
      const p = planOperationalAction(provisional(), ECL_POLICY, { now });
      return buildReminderIntent({ ...IDENT, status: "accepted_provisionally", reminderIndex: p.reminderIndex, scheduledFor: p.dueAt, expiresAt: p.expiresAt, correlationId: "c1" }).idempotencyKey;
    };
    expect(key(at(REMIND[0]))).toBe(key(at(REMIND[0] + 5)));
    const second = buildReminderIntent({ ...IDENT, status: "accepted_provisionally", reminderIndex: 1, scheduledFor: at(REMIND[1]), correlationId: "c1" }).idempotencyKey;
    expect(second).not.toBe(key(at(REMIND[0])));
  });
  it("16. spacing comes from the policy schedule, never an invented interval", () => {
    expect(reminderScheduleFor(START, EXPIRES, ECL_POLICY)).toEqual(REMIND.map((h) => at(h)));
    const p = planOperationalAction(provisional({ reminderCount: 1 }), ECL_POLICY, { now: at(REMIND[0] + 1) });
    expect(p.action).toBe("none");
    expect(p.nextActionAt).toBe(at(REMIND[1]));
  });
  it("17. reminders are bounded by the policy schedule length", () => {
    const p = planOperationalAction(provisional({ reminderCount: REMIND.length }), ECL_POLICY, { now: at(REMIND[REMIND.length - 1] + 10) });
    expect(p.action).toBe("none");
    expect(p.reason).toBe("awaiting_expiry");
    expect(reminderScheduleFor(START, EXPIRES, { windows: {} })).toEqual([]);
  });
  it("18. no reminder is owed after a terminal/dead resolution", () => {
    for (const s of ["superseded", "verified", "rejected"]) {
      expect(planOperationalAction({ status: s, provisionalStartedAt: START, expiresAt: EXPIRES }, ECL_POLICY, { now: at(REMIND[0]) }).action).toBe("none");
      expect(() => buildReminderIntent({ ...IDENT, status: s, reminderIndex: 0, scheduledFor: at(REMIND[0]), correlationId: "c" })).toThrow(/no reminder is owed/);
    }
  });
  it("19. no reminder after expiration, and none is ever scheduled past it", () => {
    expect(planOperationalAction(provisional(), ECL_POLICY, { now: at(WINDOW_H + 5) }).action).toBe("expire");
    expect(reminderScheduleFor(START, at(REMIND[0]), ECL_POLICY)).toEqual([]);
  });
  it("20. the reminder is an EVENT persisted before any delivery side effect", () => {
    const i = buildReminderIntent({ ...IDENT, status: "accepted_provisionally", reminderIndex: 0, scheduledFor: at(REMIND[0]), expiresAt: EXPIRES, correlationId: "c1" });
    expect(i.record.from_status).toBe(i.record.to_status);
    expect(i.record.event).toBe("evidence_reminder_due:0");
    expect(i.record.actor).toBe("system");
    expect(SCHED_SRC.indexOf("createOnce(svc, 'EvidenceLifecycleEvent'")).toBeLessThan(SCHED_SRC.indexOf("reconcileReminderCount("));
    expect(SCHED_SRC).not.toMatch(/SendEmail|integrations\./);
  });
  it("20b. crash after event-before-counter heals the materialized count", () => {
    expect(reconcileReminderCount(0, 0)).toBe(1);
    expect(reconcileReminderCount(1, 0)).toBe(1);
    expect(reconcileReminderCount(1, 1)).toBe(2);
    expect(SCHED_SRC).toMatch(/const healedReminderCount = reconcileReminderCount/);
    expect(SCHED_SRC.indexOf("const healedReminderCount")).toBeLessThan(SCHED_SRC.indexOf("if (res.created) counters.remindersCreated"));
  });
  it("20c. due discovery is server-side and covers both evidence entities", () => {
    expect(SCHED_SRC).toMatch(/next_lifecycle_action_at: \{ \$lte: now \}/);
    expect(SCHED_SRC).toMatch(/statement_import/);
    expect(SCHED_SRC).toMatch(/savings_evidence/);
  });
});

// ── 21-27 · review cases ──────────────────────────────────────────────────
describe("P4-E/F/N · review case lifecycle", () => {
  const openCase = (over = {}) => ({ id: "rc-1", status: "open", ...over });

  it("21. one active case per obligation (deterministic claim)", () => {
    const a = buildOperationalEscalationIntent({ ...IDENT, reasonCode: "provisional_window_unrecoverable" });
    const b = buildOperationalEscalationIntent({ ...IDENT, reasonCode: "provisional_window_unrecoverable" });
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.record.status).toBe("open");
    expect(a.record.evidence_id).toBe("si-1");
  });
  it("22. replay reuses the same semantic case", () => {
    expect(SCHED_SRC).toMatch(/createOnce\(svc, 'ReviewCase', esc\.idempotencyKey, esc\.record\)/);
    expect(buildOperationalEscalationIntent({ ...IDENT, reasonCode: "operational_failure:x" }).idempotencyKey).toBe(
      buildOperationalEscalationIntent({ ...IDENT, reasonCode: "operational_failure:x" }).idempotencyKey,
    );
  });
  it("23. unrelated evidence gets an independent case", () => {
    expect(buildOperationalEscalationIntent({ ...IDENT, reasonCode: "r" }).idempotencyKey).not.toBe(
      buildOperationalEscalationIntent({ ...IDENT, evidenceId: "si-2", reasonCode: "r" }).idempotencyKey,
    );
  });
  it("24. superseded evidence can never be approved back into life", () => {
    const p = planReviewResolution({ reviewCase: openCase(), decision: "approve", resolvedBy: "a@x.com", evidenceStatus: "superseded" }, { now: START });
    expect(p.code).toBe("review_case_superseded");
    expect(p.update.decision).toBe("superseded");
    expect(p.update.status).toBe("dismissed");
    expect(p.reprocessRequired).toBe(false);
  });
  it("25. resolution persists actor, time and result", () => {
    const p = planReviewResolution({ reviewCase: openCase(), decision: "reject", resolvedBy: "a@x.com", notes: "insufficient", evidenceStatus: "under_review" }, { now: START });
    expect(p.update).toEqual({ status: "resolved", decision: "reject", decision_notes: "insufficient", resolved_by: "a@x.com", resolved_at: START });
  });
  it("26. an already-resolved case cannot be resolved twice", () => {
    for (const s of ["resolved", "dismissed"]) {
      const p = planReviewResolution({ reviewCase: openCase({ status: s }), decision: "approve", resolvedBy: "a@x.com" }, { now: START });
      expect(p.ok).toBe(false);
      expect(p.status).toBe(409);
      expect(p.code).toBe("review_case_already_resolved");
      expect(p.update).toBe(null);
    }
  });
  it("27. invalid resolution input fails closed", () => {
    expect(() => planReviewResolution({ reviewCase: openCase(), decision: "verify_it", resolvedBy: "a@x.com" }, { now: START })).toThrow(/decision must be one of/);
    expect(() => planReviewResolution({ reviewCase: openCase(), decision: "approve" }, { now: START })).toThrow(/resolvedBy is required/);
    expect(() => planReviewResolution({ reviewCase: null, decision: "approve", resolvedBy: "a@x.com" }, { now: START })).toThrow(/reviewCase with an id/);
  });
  it("27b. approval NEVER writes a status — it re-enters the P3 engine", () => {
    const p = planReviewResolution({ reviewCase: openCase(), decision: "approve", resolvedBy: "a@x.com", evidenceStatus: "under_review" }, { now: START });
    expect(p.reprocessRequired).toBe(true);
    expect(Object.keys(p.update)).not.toContain("evidence_status");
    expect(p.evidenceAction).toBe("reprocess");
    expect(REVIEW_SRC).toMatch(/functions\.invoke\('eclProcessEvidence'/);
    expect(REVIEW_SRC).not.toMatch(/evidence_status:\s*'verified'/);
  });
  it("27c. request_more_evidence parks the case on the merchant", () => {
    const p = planReviewResolution({ reviewCase: openCase(), decision: "request_more_evidence", resolvedBy: "a@x.com", evidenceStatus: "under_review" }, { now: START });
    expect(p.update.status).toBe("awaiting_merchant");
    expect(p.reprocessRequired).toBe(false);
    expect(p.evidenceAction).toBe("none");
    expect(p.update.resolved_at).toBeUndefined();
    expect(p.update.resolved_by).toBeUndefined();
    expect(PROCESS_SRC).toMatch(/status: \{ \$in: \['open', 'awaiting_merchant', 'resolving'\] \}/);
  });
});

// ── 28-33 · RBAC ──────────────────────────────────────────────────────────
describe("P4-G · RBAC (handler source contracts)", () => {
  it("28. a non-admin cannot list the review queue", () => {
    expect(REVIEW_SRC).toMatch(/user\.role !== 'admin'/);
    expect(REVIEW_SRC).toMatch(/status: 403/);
    expect(REVIEW_SRC.indexOf("user.role !== 'admin'")).toBeLessThan(REVIEW_SRC.indexOf("action === 'list'"));
  });
  it("29. the same gate precedes the resolve branch", () => {
    expect(REVIEW_SRC.indexOf("user.role !== 'admin'")).toBeLessThan(REVIEW_SRC.indexOf("action !== 'resolve'"));
  });
  it("30. an admin resolves through the domain plan, never a raw patch", () => {
    expect(REVIEW_SRC).toMatch(/planReviewResolution\(/);
    expect(REVIEW_SRC).toMatch(/ReviewCase\.updateMany\(/);
    expect(REVIEW_SRC).toMatch(/status: 'resolving'/);
    expect(REVIEW_SRC).toMatch(/finalizeResolutionClaim/);
  });
  it("31. a forged role/actor in the payload does nothing", () => {
    expect(REVIEW_SRC).toMatch(/resolvedBy: user\.email/);
    expect(REVIEW_SRC).not.toMatch(/payload\.(role|actor|resolvedBy)/);
    expect(SCHED_SRC).not.toMatch(/body\.(role|actor)/);
  });
  it("32. the scheduler is server-trusted only (admin session OR internal secret)", () => {
    expect(SCHED_SRC).toMatch(/requireAdminOrInternal\(req, base44, body\)/);
    expect(SCHED_SRC).toMatch(/if \(!gate\.ok\) return gate\.response/);
  });
  it("33. P3 attestor/admin separation is untouched by P4", () => {
    const P3 = fs.readFileSync("base44/functions/eclProcessEvidence/entry.ts", "utf8");
    expect(P3).toMatch(/only the evidence owner may attest/);
    for (const src of [SCHED_SRC, REVIEW_SRC]) {
      expect(src).not.toContain("buildAttestationIntent");
      expect(src).not.toContain("attestor_user_id");
    }
  });
});

// ── 34-38 · audit trail ───────────────────────────────────────────────────
describe("P4-H · lifecycle event audit trail", () => {
  const classify = (over = {}) => classifyOperationalFailure({ code: "timeout", attemptCount: 1, ...over }, { now: START });

  it("34. every semantic operational action produces a complete event record", () => {
    const r = buildReminderIntent({ ...IDENT, status: "accepted_provisionally", reminderIndex: 1, scheduledFor: at(REMIND[1]), correlationId: "c" }).record;
    for (const k of ["evidence_entity_type", "evidence_id", "brand_id", "owner_email", "from_status", "to_status", "event", "actor", "correlation_id", "idempotency_key"]) {
      expect(r[k]).toBeTruthy();
    }
    expect(buildOperationalFailureIntent({ ...IDENT, status: "accepted_provisionally", correlationId: "c", classification: classify() }).record.event).toBe("operational_failure_retryable:timeout");
  });
  it("35. replay does not duplicate the semantic event", () => {
    const mk = () => buildOperationalFailureIntent({ ...IDENT, status: "accepted_provisionally", correlationId: "c", classification: classify({ attemptCount: 2 }) }).idempotencyKey;
    expect(mk()).toBe(mk());
  });
  it("36. a review event binds the authoritative identity + stored checksum", () => {
    const e = buildReviewResolutionEventIntent({ ...IDENT, status: "under_review", reviewCaseId: "rc-1", decision: "reject", resolvedBy: "a@x.com", evidenceChecksum: "chk-1", correlationId: "c" }).record;
    expect(e.evidence_id).toBe("si-1");
    expect(e.payload.evidenceChecksum).toBe("chk-1");
    expect(e.payload.reviewCaseId).toBe("rc-1");
    expect(e.actor).toBe("reviewer");
  });
  it("37. event naming is deterministic", () => {
    expect(buildReviewResolutionEventIntent({ ...IDENT, status: "under_review", reviewCaseId: "rc-1", decision: "approve", resolvedBy: "a@x.com", correlationId: "c" }).record.event).toBe("review_case_approve");
    expect(buildOperationalFailureIntent({ ...IDENT, status: "pending", correlationId: "c", classification: classify({ code: "illegal_transition" }) }).record.event).toBe("operational_failure_permanent:illegal_transition");
  });
  it("38. no secret, stack trace or raw payload is ever written", () => {
    const f = buildOperationalFailureIntent({ ...IDENT, status: "pending", correlationId: "c", classification: classify() }).record;
    expect(Object.keys(f.payload).sort()).toEqual(["attemptCount", "code", "escalate", "nextRetryAt", "operationsVersion"]);
    for (const src of [SCHED_SRC, REVIEW_SRC]) {
      expect(src).not.toMatch(/console\.log\(/);
      expect(src).not.toMatch(/error\.stack/);
      expect(src).not.toMatch(/apiKey|api_key|secretKey/i);
    }
  });
});

// ── 39-43 · idempotency & concurrency ─────────────────────────────────────
describe("P4-I/J · idempotency and concurrency", () => {
  it("39. two identical scheduler attempts resolve to ONE semantic effect", () => {
    const key = (now) => {
      const p = planOperationalAction(provisional(), ECL_POLICY, { now });
      return buildReminderIntent({ ...IDENT, status: "accepted_provisionally", reminderIndex: p.reminderIndex, scheduledFor: p.dueAt, correlationId: "x" }).idempotencyKey;
    };
    expect(key(at(REMIND[0]))).toBe(key(at(REMIND[0] + 0.5)));
    expect(SHARED_SRC).toMatch(/filter\(\{ idempotency_key: idempotencyKey \}/);
  });
  it("40. two review resolutions cannot both win", () => {
    expect(planReviewResolution({ reviewCase: { id: "rc", status: "resolved" }, decision: "approve", resolvedBy: "b@x.com" }, { now: START }).status).toBe(409);
    expect(REVIEW_SRC).toMatch(/acquireResolutionClaim/);
    expect(REVIEW_SRC).toMatch(/ReviewCase\.updateMany\(/);
    expect(REVIEW_SRC).toMatch(/resolution_claim_id/);
    expect(REVIEW_SRC).toMatch(/review case was claimed concurrently/);
  });
  it("41. a stale operation identity no-ops safely", () => {
    expect(SCHED_SRC).toMatch(/Authoritative state is re-read at processing time/);
    expect(planOperationalAction({ status: "verified" }, ECL_POLICY, { now: at(REMIND[0]) }).action).toBe("none");
  });
  it("42. a scheduler-vs-supersession race cannot resurrect old evidence", () => {
    expect(planOperationalAction({ status: "superseded", provisionalStartedAt: START, expiresAt: EXPIRES }, ECL_POLICY, { now: at(REMIND[0]) }).action).toBe("none");
    expect(selectDueLifecycleItems([{ id: "x", next_lifecycle_action_at: at(1), evidence_status: "superseded" }], { now: at(500) }).items).toEqual([]);
  });
  it("43. reminder vs expiration ordering is deterministic — expiry always wins", () => {
    expect(planOperationalAction(provisional({ reminderCount: 0 }), ECL_POLICY, { now: at(WINDOW_H + 1) }).action).toBe("expire");
  });
});

// ── 44-47 · retry & recovery ──────────────────────────────────────────────
describe("P4-K · retry and failure recovery", () => {
  it("44. a retryable failure records bounded, growing backoff", () => {
    const c1 = classifyOperationalFailure({ code: "persistence_unavailable", attemptCount: 1 }, { now: START });
    expect(c1.retryable).toBe(true);
    expect(c1.escalate).toBe(false);
    expect(c1.nextRetryAt).toBe(new Date(startMs + RETRY_BACKOFF_MINUTES[0] * 60000).toISOString());
    const c2 = classifyOperationalFailure({ code: "persistence_unavailable", attemptCount: 2 }, { now: START });
    expect(Date.parse(c2.nextRetryAt)).toBeGreaterThan(Date.parse(c1.nextRetryAt));
  });
  it("45. permanent domain failures never enter the ladder; an exhausted budget escalates", () => {
    for (const code of ["illegal_transition", "checksum_mismatch", "missing_authoritative_data", "invalid_persisted_state"]) {
      const c = classifyOperationalFailure({ code, attemptCount: 1 }, { now: START });
      expect(c.retryable).toBe(false);
      expect(c.nextRetryAt).toBe(null);
      expect(c.escalate).toBe(true);
    }
    const ex = classifyOperationalFailure({ code: "timeout", attemptCount: MAX_OPERATIONAL_ATTEMPTS }, { now: START });
    expect(ex.retryable).toBe(false);
    expect(ex.reason).toBe("retry_budget_exhausted");
  });
  it("46. success realigns the schedule; a permanent failure clears it", () => {
    expect(SCHED_SRC).toMatch(/next_lifecycle_action_at: plan\.nextActionAt \|\| ''/);
    expect(SCHED_SRC).toMatch(/next_lifecycle_action_at: classification\.nextRetryAt/);
    expect(SCHED_SRC).toMatch(/classification\.retryable/);
    expect(SCHED_SRC).toMatch(/next_lifecycle_action_at: ''/);
  });
  it("47. a poison record is recorded, not allowed to block the batch", () => {
    expect(SCHED_SRC).toMatch(/recordFailure\(svc, item, now, err, counters\)/);
  });
});

// ── 48-52 · authoritative checksum binding ────────────────────────────────
describe("P4-P · authoritative checksum binding", () => {
  it("48. the persisted checksum is the only authoritative source", () => {
    expect(resolveOperationalChecksum("abc", null).checksum).toBe("abc");
    expect(resolveOperationalChecksum("abc", undefined).code).toBe("server_resolved");
  });
  it("49. an absent required stored checksum fails closed", () => {
    const r = resolveOperationalChecksum(null, "zzz");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(r.checksum).toBe(null);
  });
  it("50. a matching supplied reference checksum succeeds", () => {
    expect(resolveOperationalChecksum("abc", "abc")).toMatchObject({ ok: true, checksum: "abc" });
  });
  it("51. a mismatch is a conflict, never a silent pass", () => {
    const r = resolveOperationalChecksum("abc", "zzz");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
    expect(r.code).toBe("operational_checksum_mismatch");
    expect(resolveOperationalChecksum(null, "zzz", { required: false }).status).toBe(409);
    expect(resolveOperationalChecksum(null, null, { required: false }).ok).toBe(true);
  });
  it("52. NO payload-checksum fallback exists anywhere in P4", () => {
    for (const src of [OPS_SRC, SCHED_SRC, REVIEW_SRC]) {
      expect(src).not.toMatch(/\|\|\s*payload\.(evidenceChecksum|expectedChecksum)/);
      expect(src).not.toMatch(/serverChecksum\s*\|\|/);
    }
    expect(REVIEW_SRC).toMatch(/resolveOperationalChecksum\(evidence\.checksum, payload\.expectedChecksum/);
    expect(SCHED_SRC).toMatch(/resolveOperationalChecksum\(record\.checksum, null/);
  });
});

// ── 53-59 · compatibility with P1/P2/P3 + no money ────────────────────────
describe("P4 · compatibility with P1/P2/P3", () => {
  const evidence = (over = {}) =>
    normalizePaymentsEvidence({ evidenceType: "statement_csv", sourceType: "provider_statement", checksum: "chk", importId: "imp", parserVersion: "p1", currency: "EUR", periodStart: "2026-07-01", periodEnd: "2026-07-31", grossAmountMinor: 1000000, feesAmountMinor: 15000, feeRateBps: 150, ...over });
  const engineInput = (over = {}) => ({
    identity: { evidenceEntityType: "statement_import", evidenceId: "si-1", brandId: "brand-1", ownerEmail: "m@x.com" },
    evidence: evidence(),
    existing: [],
    state: { status: "pending" },
    strikes: [],
    context: { now: START, hasAttestation: false, baselineLocked: false, hasBlockingReviewCase: false },
    actor: "system",
    ...over,
  });

  it("53. P4 writes only declared P1 columns and adds no new model", () => {
    const si = JSON.parse(fs.readFileSync("base44/entities/StatementImport.jsonc", "utf8"));
    for (const f of ["next_lifecycle_action_at", "reminder_count", "evidence_status", "provisional_started_at", "expires_at"]) {
      expect(si.properties[f]).toBeTruthy();
    }
    expect(SCHED_SRC).not.toMatch(/entities\.(ManualReview|EvidenceReview)/);
  });
  it("53b. SavingsEvidence has the same P4 operational projection", () => {
    const se = JSON.parse(fs.readFileSync("base44/entities/SavingsEvidence.jsonc", "utf8"));
    for (const f of ["next_lifecycle_action_at", "reminder_count", "evidence_status", "provisional_started_at", "expires_at"]) {
      expect(se.properties[f]).toBeTruthy();
    }
    expect(PROCESS_SRC).toMatch(/SavingsEvidence\.update\(payload\.evidenceId/);
  });
  it("53c. lifecycle snapshot rewrites are immutable and hash-bound", () => {
    const original = { lifecycle: { status: "under_review" }, x: 1 };
    const out = rewritePersistedLifecycleStatus(original, "rejected");
    expect(out.snapshot.lifecycle.status).toBe("rejected");
    expect(original.lifecycle.status).toBe("under_review");
    expect(out.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("54. P2 policy invariants still drive every window", () => {
    expect(ECL_POLICY.windows.provisionalDays).toBeGreaterThan(0);
    expect(reminderScheduleFor(START, EXPIRES, ECL_POLICY)).toHaveLength(REMIND.length);
  });
  it("55. P3 lifecycle semantics remain the single authority", () => {
    expect(OPS_SRC).toMatch(/from "\.\/eclLifecycle\.js"/);
    expect(OPS_SRC).not.toMatch(/LIFECYCLE_TRANSITIONS\s*=/);
    expect(OPS_SRC).not.toMatch(/provisionalDays \*/);
  });
  it("56. verified-evidence protection is preserved", () => {
    expect(runEclEngine(engineInput(), ECL_POLICY).outcome).toBe("verified");
    expect(planOperationalAction({ status: "verified" }, ECL_POLICY, { now: at(500) }).action).toBe("none");
  });
  it("57. E-08 fail-closed invariant preserved", () => {
    const d = runEclEngine(engineInput({ evidence: evidence({ checksum: undefined }) }), ECL_POLICY);
    expect(d.confidenceResult.confidenceLevel).toBe("low");
    expect(d.outcome).not.toBe("verified");
  });
  it("58. supersession behavior preserved end-to-end", () => {
    const sib = { id: "sib-1", status: "estimated", evidence: evidence({ checksum: "old", importId: "old" }) };
    expect(runEclEngine(engineInput({ evidence: evidence({ checksum: "new", importId: "new" }), existing: [sib] }), ECL_POLICY).supersessions).toHaveLength(1);
  });
  it("59. persist → reload → scheduler plan round-trips deterministically", () => {
    const ev = evidence({ sourceType: "manual_declaration" });
    const d = runEclEngine(engineInput({ evidence: ev, context: { now: START, hasAttestation: true, baselineLocked: false, hasBlockingReviewCase: false } }), ECL_POLICY);
    expect(d.outcome).toBe("accepted_provisionally");
    const { snapshot } = buildPersistedEvidenceSnapshot(d, ev, { status: "accepted_provisionally", provisionalStartedAt: d.provisional.startedAt, expiresAt: d.provisional.expiresAt, supersededById: null });
    const restored = restoreLifecycleFromSnapshot(snapshot);
    const p1 = planOperationalAction({ ...restored, reminderCount: 0 }, ECL_POLICY, { now: at(REMIND[0]) });
    const p2 = planOperationalAction({ ...restored, reminderCount: 0 }, ECL_POLICY, { now: at(REMIND[0]) });
    expect(p1).toEqual(p2);
    expect(p1.action).toBe("remind");
    expect(p1.expiresAt).toBe(d.provisional.expiresAt);
  });
  it("59b. NO billing/invoicing/collection surface leaked into P4", () => {
    for (const src of [OPS_SRC, SCHED_SRC, REVIEW_SRC, SHARED_SRC]) {
      expect(codeOnly(src)).not.toMatch(/Invoice|MonthlySavingsReport|BillingRule|[Ss]tripe|payout|success_fee/);
    }
  });
});

// ── observability + projections ───────────────────────────────────────────
describe("P4-L · observability", () => {
  it("exposes a deterministic aggregate summary with stable counters", () => {
    const s = buildOperationalSummary({ dueFound: 3, processed: 2, remindersCreated: 1 }, { now: START, batchLimit: 25, truncated: false });
    expect(s.counters).toEqual({ dueFound: 3, processed: 2, transitioned: 0, expired: 0, remindersCreated: 1, reviewCasesCreated: 0, skipped: 0, replayed: 0, retryableFailures: 0, permanentFailures: 0 });
    expect(s.runAt).toBe(START);
    expect(s.operationsVersion).toBe(ECL_OPERATIONS_VERSION);
  });
  it("projects review cases without leaking owner PII in list mode", () => {
    const row = { id: "rc", brand_id: "b", owner_email: "m@x.com", reason_code: "r", severity: "quality", status: "open", decision_notes: "internal" };
    const list = projectReviewCase(row, { detail: false });
    expect(list.ownerEmail).toBeUndefined();
    expect(list.decisionNotes).toBeUndefined();
    expect(projectReviewCase(row, { detail: true }).ownerEmail).toBe("m@x.com");
  });
  it("correlation ids are deterministic and namespaced", () => {
    expect(operationalCorrelationId({ a: 1 })).toBe(operationalCorrelationId({ a: 1 }));
    expect(operationalCorrelationId({ a: 1 })).toMatch(/^eclp4:[0-9a-f]{40}$/);
  });
});