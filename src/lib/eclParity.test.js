// v62.4 — ECL P2: frontend ⇄ backend parity.
//
// The backend artifacts are GENERATED from the canonical frontend modules, so
// parity is not a hope: these tests execute BOTH and require identical outputs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { ECL_POLICY as FE_POLICY, ECL_POLICY_VERSION as FE_VERSION } from "@/lib/generated/eclPolicy";
import { normalizePaymentsEvidence as feNormalize, normalizeAccountingEvidence as feNormalizeAccounting } from "@/lib/normalizedEvidence";
import { finalizeConfidenceResult as feFinalize, evaluateGate as feGate } from "@/lib/eclGates";
import { makeConfidenceAssessment as feAssess } from "@/lib/confidenceResult";
import { hashConfidenceResult as feHash, stableSerialize as feSerialize } from "@/lib/eclSerialize";

import { ECL_POLICY as BE_POLICY, ECL_POLICY_VERSION as BE_VERSION } from "../../base44/shared/generated/eclPolicy.ts";
import * as BE from "../../base44/shared/generated/eclDomain.ts";

const CTX = {
  now: "2026-08-06T12:00:00.000Z",
  hasAttestation: true,
  hasOpenConflicts: false,
  baselineLocked: true,
  activeStrikeCountByScope: { payments: 1 },
  hasBlockingReviewCase: false,
};

const PAYMENTS_INPUT = {
  evidenceType: "statement_csv",
  sourceType: "provider_statement",
  currency: "EUR",
  periodStart: "2026-07-01",
  periodEnd: "2026-07-31",
  checksum: "abc",
  importId: "imp_1",
  parserVersion: "csv-1",
  grossAmountMinor: 10000000,
  feesAmountMinor: 175000,
  netAmountMinor: 9825000,
  feeRateBps: 175,
  transactionCount: 4200,
  grossAmount: 100000,
};

const ASSESSMENT = {
  evidenceType: "statement_csv",
  sourceType: "provider_statement",
  confidenceLevel: "high",
  verificationMethod: "independent_document",
  evidenceStatus: "verified",
  passedRules: ["P-01", "P-02"],
  failedRules: [{ id: "P-05", detail: "no commerce cross-check" }],
  metrics: { grossAmountMinor: 10000000 },
  period: { periodStart: "2026-07-01", periodEnd: "2026-07-31", coverageDays: 31 },
  provenance: { importId: "imp_1" },
  ruleSetVersion: "rules-0",
  explanation: { reason: "independent statement", actionsToImprove: ["connect your PSP"] },
};

describe("parity — the policy artifacts are the same policy", () => {
  it("frontend and backend policy files are byte-identical", () => {
    expect(readFileSync("src/lib/generated/eclPolicy.js", "utf8")).toBe(
      readFileSync("base44/shared/generated/eclPolicy.ts", "utf8"),
    );
  });

  it("both expose the same version and the same gates", () => {
    expect(BE_VERSION).toBe(FE_VERSION);
    expect(JSON.stringify(BE_POLICY)).toBe(JSON.stringify(FE_POLICY));
  });
});

describe("parity — same input, same normalized evidence", () => {
  it("payments evidence normalizes identically", () => {
    expect(JSON.stringify(BE.normalizePaymentsEvidence(PAYMENTS_INPUT))).toBe(
      JSON.stringify(feNormalize(PAYMENTS_INPUT)),
    );
  });

  it("accounting evidence normalizes identically", () => {
    const input = {
      currency: "EUR",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      sourceSoftware: "pennylane",
      entries: [{ amountMinor: 15000, accountCode: "627800", entryPeriod: "2026-07" }, { amount: 150 }],
    };
    expect(JSON.stringify(BE.normalizeAccountingEvidence(input))).toBe(
      JSON.stringify(feNormalizeAccounting(input)),
    );
  });

  it("the backend copy is deep-frozen exactly like the frontend one", () => {
    const be = BE.normalizePaymentsEvidence(PAYMENTS_INPUT);
    expect(Object.isFrozen(be)).toBe(true);
    expect(Object.isFrozen(be.metrics)).toBe(true);
    expect(Object.isFrozen(be.missingFields)).toBe(true);
  });
});

describe("parity — same assessment, same ConfidenceResult and same hash", () => {
  const fe = feFinalize(ASSESSMENT, FE_POLICY, CTX);
  const be = BE.finalizeConfidenceResult(ASSESSMENT, BE_POLICY, CTX);

  it("produces the same result object", () => {
    expect(JSON.stringify(be)).toBe(JSON.stringify(fe));
    expect(be.freezeEligibility).toBe(fe.freezeEligibility);
  });

  it("produces the same stable serialization", () => {
    expect(BE.stableSerialize(be)).toBe(feSerialize(fe));
  });

  it("produces the same hash", () => {
    expect(BE.hashConfidenceResult(be)).toBe(feHash(fe));
    expect(BE.sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("rejects a caller-supplied freezeEligibility on both sides", () => {
    const tampered = { ...ASSESSMENT, freezeEligibility: "eligible" };
    expect(() => feAssess(tampered)).toThrow();
    expect(() => BE.makeConfidenceAssessment(tampered)).toThrow();
  });
});

describe("parity — same gate decisions", () => {
  const cases = [
    ["freeze_baseline", {}],
    ["create_invoice", {}],
    ["create_invoice", { evidenceStatus: "accepted_provisionally" }],
    ["approve_report", { confidenceLevel: "medium" }],
    ["benchmark_include", { verificationMethod: "attested_only" }],
    ["recalc_billed_period", {}],
    ["show_estimate", { confidenceLevel: "unknown", evidenceStatus: "estimated" }],
  ];

  it.each(cases)("gate %s decides identically on both sides", (gate, over) => {
    const input = { ...ASSESSMENT, ...over };
    const fe = feGate(gate, feFinalize(input, FE_POLICY, CTX), FE_POLICY, CTX);
    const be = BE.evaluateGate(gate, BE.finalizeConfidenceResult(input, BE_POLICY, CTX), BE_POLICY, CTX);
    expect(JSON.stringify(be)).toBe(JSON.stringify(fe));
  });

  it("two payments strikes block the invoice on both sides", () => {
    const ctx = { ...CTX, activeStrikeCountByScope: { payments: 2 } };
    const fe = feGate("create_invoice", feFinalize(ASSESSMENT, FE_POLICY, ctx), FE_POLICY, ctx);
    const be = BE.evaluateGate("create_invoice", BE.finalizeConfidenceResult(ASSESSMENT, BE_POLICY, ctx), BE_POLICY, ctx);
    expect(fe.allowed).toBe(false);
    expect(JSON.stringify(be)).toBe(JSON.stringify(fe));
  });
});