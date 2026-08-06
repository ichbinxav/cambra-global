// v62.4 — ECL P2: the ConfidenceResult contract, serialization and hashing.
import { describe, it, expect } from "vitest";
import {
  makeConfidenceAssessment,
  CONFIDENCE_LEVELS,
  EVIDENCE_STATUSES,
  VERIFICATION_METHODS,
  FREEZE_ELIGIBILITY,
  SOURCE_TYPES,
  CONFIDENCE_RESULT_FIELDS,
  ConfidenceContractError,
} from "@/lib/confidenceResult";
import { finalizeConfidenceResult } from "@/lib/eclGates";
import { stableSerialize, hashConfidenceResult, deepFreeze, sha256Hex } from "@/lib/eclSerialize";
import { ECL_POLICY } from "@/lib/generated/eclPolicy";

const CTX = {
  now: "2026-08-06T12:00:00.000Z",
  hasAttestation: true,
  hasOpenConflicts: false,
  baselineLocked: true,
  activeStrikeCountByScope: {},
  hasBlockingReviewCase: false,
};

const assessment = (over) => ({
  evidenceType: "statement_csv",
  sourceType: "provider_statement",
  confidenceLevel: "high",
  verificationMethod: "independent_document",
  evidenceStatus: "verified",
  passedRules: ["P-01"],
  failedRules: [],
  metrics: { grossAmountMinor: 1000 },
  period: { periodStart: "2026-07-01", periodEnd: "2026-07-31", coverageDays: 31 },
  provenance: { importId: "imp_1" },
  ruleSetVersion: "rules-0",
  ...over,
});

describe("ConfidenceResult — exact enums", () => {
  it("declares the authoritative enum values", () => {
    expect(CONFIDENCE_LEVELS).toEqual(["high", "medium", "low", "unknown"]);
    expect(EVIDENCE_STATUSES).toEqual([
      "pending", "processing", "estimated", "accepted_provisionally", "verified",
      "rejected", "expired", "superseded", "under_review",
    ]);
    expect(VERIFICATION_METHODS).toEqual(["independent_api", "independent_document", "attested_only", "none"]);
    expect(FREEZE_ELIGIBILITY).toEqual(["eligible", "conditionally_eligible", "not_eligible"]);
    expect(SOURCE_TYPES).toEqual([
      "api", "provider_statement", "bank_statement", "commerce_export",
      "accounting_export", "fec", "manual_declaration",
    ]);
  });

  it("has no score field anywhere in the contract", () => {
    expect(CONFIDENCE_RESULT_FIELDS).not.toContain("score");
    const r = finalizeConfidenceResult(assessment(), ECL_POLICY, CTX);
    expect(Object.prototype.hasOwnProperty.call(r, "score")).toBe(false);
  });

  it("rejects out-of-enum values instead of coercing them", () => {
    expect(() => makeConfidenceAssessment(assessment({ confidenceLevel: "very_high" }))).toThrow(ConfidenceContractError);
    expect(() => makeConfidenceAssessment(assessment({ evidenceStatus: "ok" }))).toThrow(ConfidenceContractError);
    expect(() => makeConfidenceAssessment(assessment({ verificationMethod: "trust_me" }))).toThrow(ConfidenceContractError);
    expect(() => makeConfidenceAssessment(assessment({ sourceType: "psychic" }))).toThrow(ConfidenceContractError);
  });
});

describe("ConfidenceResult — freezeEligibility is always derived", () => {
  it("refuses a caller-supplied freezeEligibility in the assessment", () => {
    expect(() => makeConfidenceAssessment(assessment({ freezeEligibility: "eligible" }))).toThrow(/always derived/);
  });

  it("refuses a caller-supplied freezeEligibility at finalization", () => {
    expect(() => finalizeConfidenceResult(assessment({ freezeEligibility: "eligible" }), ECL_POLICY, CTX)).toThrow(/always derived/);
  });

  it("derives it from the policy, not from the input", () => {
    const strong = finalizeConfidenceResult(assessment(), ECL_POLICY, CTX);
    const weak = finalizeConfidenceResult(assessment({ verificationMethod: "attested_only" }), ECL_POLICY, CTX);
    expect(strong.freezeEligibility).toBe("eligible");
    expect(weak.freezeEligibility).not.toBe("eligible");
  });
});

describe("ConfidenceResult — exact result shape", () => {
  it("carries exactly the contract fields", () => {
    const r = finalizeConfidenceResult(assessment(), ECL_POLICY, CTX);
    expect(Object.keys(r).sort()).toEqual([...CONFIDENCE_RESULT_FIELDS].sort());
    expect(r.policyVersion).toBe("ecl-2026.08");
  });

  it("normalizes failedRules to { id, detail }", () => {
    const r = finalizeConfidenceResult(assessment({ failedRules: [{ id: "P-03", detail: "fees missing" }] }), ECL_POLICY, CTX);
    expect(r.failedRules).toEqual([{ id: "P-03", detail: "fees missing" }]);
  });

  it("carries an explanation with reason and actionsToImprove", () => {
    const r = finalizeConfidenceResult(
      assessment({ explanation: { reason: "no independent source", actionsToImprove: ["connect your PSP"] } }),
      ECL_POLICY,
      CTX,
    );
    expect(r.explanation.reason).toBe("no independent source");
    expect(r.explanation.actionsToImprove).toEqual(["connect your PSP"]);
  });
});

describe("ConfidenceResult — deep immutability", () => {
  it("blocks deep mutation, not just top-level assignment", () => {
    const r = finalizeConfidenceResult(assessment({ failedRules: [{ id: "P-03", detail: "x" }] }), ECL_POLICY, CTX);
    expect(Object.isFrozen(r)).toBe(true);
    expect(() => { r.confidenceLevel = "low"; }).toThrow();
    expect(() => { r.metrics.grossAmountMinor = 0; }).toThrow();
    expect(() => { r.failedRules[0].detail = "tampered"; }).toThrow();
    expect(() => { r.passedRules.push("P-99"); }).toThrow();
    expect(() => { r.explanation.actionsToImprove.push("x"); }).toThrow();
  });

  it("deepFreeze survives cycles", () => {
    const a = { name: "a" };
    a.self = a;
    expect(() => deepFreeze(a)).not.toThrow();
    expect(Object.isFrozen(a)).toBe(true);
  });
});

describe("stableSerialize / hashConfidenceResult — determinism", () => {
  it("is insensitive to key order", () => {
    expect(stableSerialize({ b: 1, a: { d: 2, c: 3 } })).toBe(stableSerialize({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("preserves array order (order is semantic here)", () => {
    expect(stableSerialize({ a: [1, 2] })).not.toBe(stableSerialize({ a: [2, 1] }));
  });

  it("normalizes equivalent instants to one representation", () => {
    expect(stableSerialize({ t: "2026-08-06T12:00:00.000Z" })).toBe(stableSerialize({ t: new Date("2026-08-06T12:00:00.000Z") }));
    expect(stableSerialize({ t: "2026-08-06T14:00:00+02:00" })).toBe(stableSerialize({ t: "2026-08-06T12:00:00.000Z" }));
  });

  it("does not widen a plain calendar date into a datetime", () => {
    expect(stableSerialize({ d: "2026-08-06" })).toBe('{"d":"2026-08-06"}');
  });

  it("hashes the same result identically and a changed result differently", () => {
    const a = finalizeConfidenceResult(assessment(), ECL_POLICY, CTX);
    const b = finalizeConfidenceResult(assessment(), ECL_POLICY, CTX);
    const c = finalizeConfidenceResult(assessment({ confidenceLevel: "medium" }), ECL_POLICY, CTX);
    expect(hashConfidenceResult(a)).toBe(hashConfidenceResult(b));
    expect(hashConfidenceResult(a)).not.toBe(hashConfidenceResult(c));
    expect(hashConfidenceResult(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("computes SHA-256 correctly against known vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("évidence")).toBe(sha256Hex("évidence"));
    expect(sha256Hex("a".repeat(200))).toMatch(/^[0-9a-f]{64}$/);
  });
});