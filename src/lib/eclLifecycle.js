// v62.5 — ECL P3: evidence lifecycle state machine (canonical, pure).
//
// PURE. No I/O, no writes, and NO wall clock: every time-dependent decision
// takes an injected instant. This module owns the TRANSITION GRAPH over the
// P2 evidence statuses (confidenceResult.EVIDENCE_STATUSES — reused, never
// redeclared) and produces EvidenceLifecycleEvent RECORD INTENTS matching the
// P1 schema exactly. It never persists anything: handlers do, idempotently,
// keyed on the deterministic idempotency_key computed here.
//
// base44/shared/generated/eclDomain.ts is GENERATED from this file.

import { deepFreeze, sha256Hex, stableSerialize } from "./eclSerialize.js";
import { isCalendarDate } from "./calendarDate.js";
import { EVIDENCE_STATUSES } from "./confidenceResult.js";

export const ECL_LIFECYCLE_VERSION = "ecl-lifecycle-1";

export const LIFECYCLE_ACTORS = ["system", "user", "reviewer"];

export const EVIDENCE_ENTITY_TYPES = ["statement_import", "savings_evidence"];

// Terminal: a superseded record is history; new facts create NEW records.
export const TERMINAL_STATUSES = ["superseded"];

// The declared transition graph. Anything not literally listed is illegal —
// the engine routes illegal targets to under_review, never forces them.
export const LIFECYCLE_TRANSITIONS = deepFreeze({
  pending: ["processing", "estimated", "accepted_provisionally", "verified", "under_review", "rejected", "superseded"],
  processing: ["estimated", "accepted_provisionally", "verified", "under_review", "rejected", "superseded"],
  estimated: ["accepted_provisionally", "verified", "under_review", "superseded", "rejected"],
  accepted_provisionally: ["verified", "expired", "under_review", "superseded", "rejected"],
  verified: ["under_review", "superseded"],
  expired: ["under_review", "superseded", "rejected"],
  under_review: ["estimated", "accepted_provisionally", "verified", "rejected", "superseded"],
  rejected: ["superseded"],
  superseded: [],
});

export class EclLifecycleError extends Error {
  constructor(message) {
    super(message);
    this.name = "EclLifecycleError";
  }
}

const lcRequire = (cond, msg) => {
  if (!cond) throw new EclLifecycleError(msg);
};
const lcNonEmpty = (v) => typeof v === "string" && v.length > 0;

export function assertLifecycleStatus(status) {
  lcRequire(EVIDENCE_STATUSES.includes(status), `unknown evidence status: ${String(status)}`);
  return status;
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransition(fromStatus, toStatus) {
  assertLifecycleStatus(fromStatus);
  assertLifecycleStatus(toStatus);
  return (LIFECYCLE_TRANSITIONS[fromStatus] || []).includes(toStatus);
}

/** Deterministic idempotency key over a stable-serialized part bag. */
export function lifecycleIdempotencyKey(parts) {
  return `eclp3:${sha256Hex(stableSerialize(parts)).slice(0, 40)}`;
}

/**
 * Build one EvidenceLifecycleEvent record intent. from === to is an IDEMPOTENT
 * NO-OP ({ changed: false }, no record) — replaying a decision must never
 * append a duplicate event. An illegal transition THROWS here: the caller
 * (engine) decides the fail-closed rerouting, this module never invents one.
 */
export function buildLifecycleTransition(input) {
  const i = input && typeof input === "object" ? input : {};
  lcRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), `evidenceEntityType must be one of ${EVIDENCE_ENTITY_TYPES.join(", ")}`);
  lcRequire(lcNonEmpty(i.evidenceId), "evidenceId is required");
  lcRequire(lcNonEmpty(i.brandId), "brandId is required");
  lcRequire(lcNonEmpty(i.ownerEmail), "ownerEmail is required");
  lcRequire(lcNonEmpty(i.event), "event is required");
  lcRequire(lcNonEmpty(i.correlationId), "correlationId is required");
  lcRequire(LIFECYCLE_ACTORS.includes(i.actor), `actor must be one of ${LIFECYCLE_ACTORS.join(", ")}`);
  assertLifecycleStatus(i.fromStatus);
  assertLifecycleStatus(i.toStatus);

  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "lifecycle_event",
    evidenceEntityType: i.evidenceEntityType,
    evidenceId: i.evidenceId,
    fromStatus: i.fromStatus,
    toStatus: i.toStatus,
    event: i.event,
    correlationId: i.correlationId,
  });

  if (i.fromStatus === i.toStatus) {
    return deepFreeze({ changed: false, fromStatus: i.fromStatus, toStatus: i.toStatus, event: i.event, idempotencyKey, record: null });
  }
  lcRequire(!isTerminalStatus(i.fromStatus), `status ${i.fromStatus} is terminal: new facts require a new record`);
  lcRequire(
    canTransition(i.fromStatus, i.toStatus),
    `illegal transition ${i.fromStatus} → ${i.toStatus} (allowed: ${(LIFECYCLE_TRANSITIONS[i.fromStatus] || []).join(", ") || "none"})`,
  );

  return deepFreeze({
    changed: true,
    fromStatus: i.fromStatus,
    toStatus: i.toStatus,
    event: i.event,
    idempotencyKey,
    record: {
      evidence_entity_type: i.evidenceEntityType,
      evidence_id: i.evidenceId,
      brand_id: i.brandId,
      owner_email: i.ownerEmail,
      from_status: i.fromStatus,
      to_status: i.toStatus,
      event: i.event,
      actor: i.actor,
      correlation_id: i.correlationId,
      idempotency_key: idempotencyKey,
      payload: i.payload && typeof i.payload === "object" ? { ...i.payload } : {},
    },
  });
}

/**
 * Provisional expiry, derived EXCLUSIVELY from the policy window. No fallback
 * constant: a policy without a valid provisionalDays is refused, never patched.
 */
export function deriveProvisionalExpiry(provisionalStartedAt, policy) {
  const t = Date.parse(String(provisionalStartedAt));
  lcRequire(!Number.isNaN(t), "provisionalStartedAt must be a parseable instant");
  const days = policy && policy.windows ? policy.windows.provisionalDays : undefined;
  lcRequire(Number.isInteger(days) && days > 0, "policy.windows.provisionalDays must be a positive integer (no fallback)");
  return new Date(t + days * 86400000).toISOString();
}

/**
 * Resolve whether a provisional acceptance has lapsed at the injected instant.
 * Returns { lapsed, expiresAt, ambiguous }: ambiguous=true means the record is
 * accepted_provisionally but carries NO recoverable window — the engine must
 * route that to review, never assume it is still valid.
 */
export function resolveExpiry(state, policy, context) {
  const s = state && typeof state === "object" ? state : {};
  const nowMs = Date.parse(String(context && context.now));
  lcRequire(!Number.isNaN(nowMs), "context.now must be a parseable instant");
  if (s.status !== "accepted_provisionally") {
    return deepFreeze({ lapsed: false, expiresAt: s.expiresAt || null, ambiguous: false });
  }
  let exp = null;
  if (s.expiresAt && !Number.isNaN(Date.parse(String(s.expiresAt)))) {
    exp = new Date(Date.parse(String(s.expiresAt))).toISOString();
  } else if (s.provisionalStartedAt && !Number.isNaN(Date.parse(String(s.provisionalStartedAt)))) {
    exp = deriveProvisionalExpiry(s.provisionalStartedAt, policy);
  }
  if (!exp) return deepFreeze({ lapsed: false, expiresAt: null, ambiguous: true });
  return deepFreeze({ lapsed: nowMs > Date.parse(exp), expiresAt: exp, ambiguous: false });
}

// ── EvidenceAttestation record intent ────────────────────────────────────
export const ATTESTATION_LANGUAGES = ["es", "fr", "en"];

/**
 * Build an EvidenceAttestation record intent (P1 schema, unchanged). The legal
 * text hash is computed HERE from the exact text shown, so a later template
 * edit can never be retro-attributed. ip/ua HMACs are deliberately NOT set by
 * this pure function: absent honest evidence beats fabricated digests.
 */
export function buildAttestationIntent(input) {
  const i = input && typeof input === "object" ? input : {};
  lcRequire(lcNonEmpty(i.attestorUserId), "attestorUserId is required");
  lcRequire(lcNonEmpty(i.brandId), "brandId is required");
  lcRequire(lcNonEmpty(i.ownerEmail), "ownerEmail is required");
  lcRequire(EVIDENCE_ENTITY_TYPES.includes(i.evidenceEntityType), `evidenceEntityType must be one of ${EVIDENCE_ENTITY_TYPES.join(", ")}`);
  lcRequire(lcNonEmpty(i.evidenceId), "evidenceId is required");
  lcRequire(
    i.declaredMetrics && typeof i.declaredMetrics === "object" && Object.keys(i.declaredMetrics).length > 0,
    "declaredMetrics must be a non-empty object: an attestation without figures asserts nothing",
  );
  lcRequire(lcNonEmpty(i.legalTextVersion), "legalTextVersion is required");
  lcRequire(lcNonEmpty(i.legalText), "legalText (the exact text shown) is required");
  lcRequire(ATTESTATION_LANGUAGES.includes(i.language), `language must be one of ${ATTESTATION_LANGUAGES.join(", ")}`);
  if (i.declaredPeriodStart !== undefined && i.declaredPeriodStart !== null) {
    lcRequire(isCalendarDate(i.declaredPeriodStart), "declaredPeriodStart must be a real calendar date");
  }
  if (i.declaredPeriodEnd !== undefined && i.declaredPeriodEnd !== null) {
    lcRequire(isCalendarDate(i.declaredPeriodEnd), "declaredPeriodEnd must be a real calendar date");
  }

  const legalTextHash = sha256Hex(i.legalText);
  // v62.6 — the idempotency identity covers EVERY field that materially
  // defines the declaration: two attestations differing in legal version,
  // declared source, declared period or the attested artifact's checksum are
  // DIFFERENT declarations and must never collapse into one record.
  const idempotencyKey = lifecycleIdempotencyKey({
    kind: "attestation",
    evidenceEntityType: i.evidenceEntityType,
    evidenceId: i.evidenceId,
    attestorUserId: i.attestorUserId,
    legalTextHash,
    legalTextVersion: i.legalTextVersion,
    language: i.language,
    declaredMetrics: i.declaredMetrics,
    declaredSource: lcNonEmpty(i.declaredSource) ? i.declaredSource : null,
    declaredPeriodStart: i.declaredPeriodStart || null,
    declaredPeriodEnd: i.declaredPeriodEnd || null,
    evidenceChecksum: lcNonEmpty(i.evidenceChecksum) ? i.evidenceChecksum : null,
  });

  const record = {
    attestor_user_id: i.attestorUserId,
    brand_id: i.brandId,
    owner_email: i.ownerEmail,
    evidence_entity_type: i.evidenceEntityType,
    evidence_id: i.evidenceId,
    declared_metrics: { ...i.declaredMetrics },
    legal_text_version: i.legalTextVersion,
    legal_text_hash: legalTextHash,
    language: i.language,
    idempotency_key: idempotencyKey,
    // Optional fields via spread (never post-assignment): keeps the generated
    // backend artifact clean under the critical typecheck's literal inference.
    ...(i.declaredPeriodStart ? { declared_period_start: i.declaredPeriodStart } : {}),
    ...(i.declaredPeriodEnd ? { declared_period_end: i.declaredPeriodEnd } : {}),
    ...(lcNonEmpty(i.declaredSource) ? { declared_source: i.declaredSource } : {}),
    ...(lcNonEmpty(i.evidenceChecksum) ? { evidence_checksum: i.evidenceChecksum } : {}),
  };

  return deepFreeze({ legalTextHash, idempotencyKey, record });
}

// ── v62.6 closure — server-resolved attestation evidence binding ─────────
/**
 * Resolve the AUTHORITATIVE checksum an attestation binds to. The STORED
 * evidence record is the only source of truth:
 *   - no usable stored checksum → fail CLOSED (422-style): an attestation
 *     cannot bind to an artifact the platform cannot point back to, and a
 *     client-supplied checksum is NEVER accepted as a substitute;
 *   - a claimed checksum that differs from the stored one → refused (409);
 *   - claimed omitted or equal → resolved to the STORED checksum, only.
 * Pure and deterministic; the handler maps status/code onto its HTTP response.
 */
export function resolveAttestationChecksum(storedChecksum, claimedChecksum) {
  const stored = lcNonEmpty(storedChecksum) ? storedChecksum : null;
  const claimed = lcNonEmpty(claimedChecksum) ? claimedChecksum : null;
  if (stored === null) {
    return deepFreeze({
      ok: false,
      status: 422,
      code: "attestation_checksum_unresolvable",
      checksum: null,
      reason: "stored evidence record carries no usable checksum — refusing to attest an unbindable artifact (a client-supplied checksum is never trusted)",
    });
  }
  if (claimed !== null && claimed !== stored) {
    return deepFreeze({
      ok: false,
      status: 409,
      code: "attestation_checksum_mismatch",
      checksum: null,
      reason: "evidenceChecksum does not match the stored evidence artifact",
    });
  }
  return deepFreeze({ ok: true, status: 200, code: "server_resolved", checksum: stored, reason: null });
}