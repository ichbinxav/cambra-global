// v62.5 — ECL P3: lifecycle state machine tests.
import { describe, it, expect } from "vitest";
import {
  LIFECYCLE_TRANSITIONS,
  canTransition,
  isTerminalStatus,
  buildLifecycleTransition,
  deriveProvisionalExpiry,
  resolveExpiry,
  buildAttestationIntent,
  EclLifecycleError,
} from "./eclLifecycle.js";
import { EVIDENCE_STATUSES } from "./confidenceResult.js";
import { ECL_POLICY } from "./generated/eclPolicy.js";

const BASE = {
  evidenceEntityType: "statement_import",
  evidenceId: "si-1",
  brandId: "brand-1",
  ownerEmail: "m@x.com",
  event: "evidence_verified",
  actor: "system",
  correlationId: "eclp3:corr",
};

describe("transition graph", () => {
  it("declares only known statuses and never leaves superseded", () => {
    for (const [from, tos] of Object.entries(LIFECYCLE_TRANSITIONS)) {
      expect(EVIDENCE_STATUSES).toContain(from);
      for (const to of tos) expect(EVIDENCE_STATUSES).toContain(to);
    }
    expect(LIFECYCLE_TRANSITIONS.superseded).toEqual([]);
    expect(isTerminalStatus("superseded")).toBe(true);
  });

  it("canTransition follows the declared graph and rejects unknown statuses", () => {
    expect(canTransition("pending", "verified")).toBe(true);
    expect(canTransition("verified", "estimated")).toBe(false);
    expect(() => canTransition("nope", "verified")).toThrow(EclLifecycleError);
  });
});

describe("buildLifecycleTransition", () => {
  it("builds a P1-shaped record with a deterministic idempotency key", () => {
    const a = buildLifecycleTransition({ ...BASE, fromStatus: "pending", toStatus: "verified" });
    const b = buildLifecycleTransition({ ...BASE, fromStatus: "pending", toStatus: "verified" });
    expect(a.changed).toBe(true);
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    expect(a.record).toMatchObject({
      evidence_entity_type: "statement_import",
      evidence_id: "si-1",
      brand_id: "brand-1",
      owner_email: "m@x.com",
      from_status: "pending",
      to_status: "verified",
      event: "evidence_verified",
      actor: "system",
      correlation_id: "eclp3:corr",
    });
    expect(a.record.idempotency_key).toBe(a.idempotencyKey);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.record)).toBe(true);
  });

  it("a different correlation produces a different key (new operation, new event)", () => {
    const a = buildLifecycleTransition({ ...BASE, fromStatus: "pending", toStatus: "verified" });
    const b = buildLifecycleTransition({ ...BASE, correlationId: "eclp3:other", fromStatus: "pending", toStatus: "verified" });
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it("from === to is an idempotent no-op: no record, changed=false", () => {
    const t = buildLifecycleTransition({ ...BASE, fromStatus: "verified", toStatus: "verified" });
    expect(t.changed).toBe(false);
    expect(t.record).toBe(null);
  });

  it("throws on illegal and on terminal-origin transitions", () => {
    expect(() => buildLifecycleTransition({ ...BASE, fromStatus: "verified", toStatus: "estimated" })).toThrow(/illegal transition/);
    expect(() => buildLifecycleTransition({ ...BASE, fromStatus: "superseded", toStatus: "verified" })).toThrow(/terminal/);
  });

  it("refuses a missing owner or actor instead of inventing one", () => {
    expect(() => buildLifecycleTransition({ ...BASE, ownerEmail: "", fromStatus: "pending", toStatus: "verified" })).toThrow(EclLifecycleError);
    expect(() => buildLifecycleTransition({ ...BASE, actor: "robot", fromStatus: "pending", toStatus: "verified" })).toThrow(EclLifecycleError);
  });
});

describe("provisional window", () => {
  it("derives expiry EXACTLY from policy.windows.provisionalDays, no fallback", () => {
    const start = "2026-08-01T00:00:00.000Z";
    const exp = deriveProvisionalExpiry(start, ECL_POLICY);
    const days = ECL_POLICY.windows.provisionalDays;
    expect(Date.parse(exp) - Date.parse(start)).toBe(days * 86400000);
    expect(() => deriveProvisionalExpiry(start, {})).toThrow(/no fallback/);
  });

  it("resolveExpiry: lapsed, alive, and ambiguous (no recoverable window)", () => {
    const started = "2026-01-01T00:00:00.000Z";
    const days = ECL_POLICY.windows.provisionalDays;
    const justBefore = new Date(Date.parse(started) + days * 86400000 - 1000).toISOString();
    const after = new Date(Date.parse(started) + days * 86400000 + 1000).toISOString();
    const state = { status: "accepted_provisionally", provisionalStartedAt: started };
    expect(resolveExpiry(state, ECL_POLICY, { now: justBefore }).lapsed).toBe(false);
    expect(resolveExpiry(state, ECL_POLICY, { now: after }).lapsed).toBe(true);
    const amb = resolveExpiry({ status: "accepted_provisionally" }, ECL_POLICY, { now: after });
    expect(amb.ambiguous).toBe(true);
    expect(amb.lapsed).toBe(false);
    // a non-provisional state never lapses through this path
    expect(resolveExpiry({ status: "verified" }, ECL_POLICY, { now: after }).lapsed).toBe(false);
  });
});

describe("buildAttestationIntent", () => {
  const ATT = {
    attestorUserId: "u-1",
    brandId: "brand-1",
    ownerEmail: "m@x.com",
    evidenceEntityType: "statement_import",
    evidenceId: "si-1",
    declaredMetrics: { grossAmountMinor: 100000 },
    legalTextVersion: "att-v1",
    legalText: "I declare these figures true.",
    language: "es",
  };

  it("hashes the EXACT legal text and is idempotent on the same declaration", () => {
    const a = buildAttestationIntent(ATT);
    const b = buildAttestationIntent(ATT);
    expect(a.legalTextHash).toBe(b.legalTextHash);
    expect(a.idempotencyKey).toBe(b.idempotencyKey);
    const edited = buildAttestationIntent({ ...ATT, legalText: "I declare these figures true!" });
    expect(edited.legalTextHash).not.toBe(a.legalTextHash);
    expect(edited.idempotencyKey).not.toBe(a.idempotencyKey);
  });

  it("record matches the P1 EvidenceAttestation schema and never fabricates ip/ua digests", () => {
    const { record } = buildAttestationIntent(ATT);
    expect(record).toMatchObject({
      attestor_user_id: "u-1",
      brand_id: "brand-1",
      owner_email: "m@x.com",
      evidence_entity_type: "statement_import",
      evidence_id: "si-1",
      legal_text_version: "att-v1",
      language: "es",
    });
    expect(record.declared_metrics).toEqual({ grossAmountMinor: 100000 });
    expect(record.ip_hmac).toBeUndefined();
    expect(record.ua_hmac).toBeUndefined();
  });

  it("refuses an attestation that asserts nothing or a fake calendar date", () => {
    expect(() => buildAttestationIntent({ ...ATT, declaredMetrics: {} })).toThrow(/asserts nothing/);
    expect(() => buildAttestationIntent({ ...ATT, declaredPeriodStart: "2026-02-30" })).toThrow(EclLifecycleError);
    expect(() => buildAttestationIntent({ ...ATT, language: "de" })).toThrow(EclLifecycleError);
  });
});