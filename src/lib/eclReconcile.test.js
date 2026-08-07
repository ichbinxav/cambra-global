// v62.5 — ECL P3: reconciliation tests (dedup, supersession, contradictions).
import { describe, it, expect } from "vitest";
import { reconcileEvidence, relativeDeltaPct, EclReconcileError } from "./eclReconcile.js";
import { normalizePaymentsEvidence, normalizeCommerceEvidence } from "./normalizedEvidence.js";
import { ECL_POLICY } from "./generated/eclPolicy.js";

const rawPayments = (over = {}) =>
  normalizePaymentsEvidence({
    evidenceType: "statement_csv",
    sourceType: "provider_statement",
    checksum: "chk-1",
    importId: "imp-1",
    parserVersion: "p1",
    currency: "EUR",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    grossAmountMinor: 1000000,
    feesAmountMinor: 15000,
    feeRateBps: 150,
    ...over,
  });

describe("reconcileEvidence", () => {
  it("refuses to run without the policy tolerance (no fallback constant)", () => {
    expect(() => reconcileEvidence(rawPayments(), [], {})).toThrow(EclReconcileError);
    expect(() => reconcileEvidence(rawPayments(), [], { reconciliation: {} })).toThrow(/no fallback/);
  });

  it("recognizes an exact checksum replay, live or historical", () => {
    const ev = rawPayments();
    const r = reconcileEvidence(ev, [
      { id: "old-live", status: "verified", evidence: rawPayments() },
      { id: "old-hist", status: "rejected", evidence: rawPayments() },
    ], ECL_POLICY);
    expect(r.duplicates.map((d) => d.existingId).sort()).toEqual(["old-hist", "old-live"]);
    expect(r.duplicates.find((d) => d.existingId === "old-hist").live).toBe(false);
    expect(r.contradictions).toEqual([]);
  });

  it("a corrected re-import of the same source supersedes, never edits", () => {
    const r = reconcileEvidence(rawPayments({ checksum: "chk-2", feesAmountMinor: 14000, feeRateBps: 140 }), [
      { id: "old", status: "estimated", evidence: rawPayments() },
    ], ECL_POLICY);
    expect(r.supersedes).toEqual([{ existingId: "old", reason: "same_import_corrected" }]);
  });

  it("same period + source with diverging figures is a CONTRADICTION with a measured delta", () => {
    const r = reconcileEvidence(
      rawPayments({ checksum: "chk-2", importId: "imp-2", grossAmountMinor: 2000000 }),
      [{ id: "old", status: "verified", evidence: rawPayments() }],
      ECL_POLICY,
    );
    expect(r.contradictions).toHaveLength(1);
    expect(r.contradictions[0].code).toBe("same_period_metric_mismatch");
    expect(r.contradictions[0].deltaPct).toBe(50);
  });

  it("same period + source with identical figures is a benign re-export (supersede)", () => {
    const r = reconcileEvidence(
      rawPayments({ checksum: "chk-2", importId: "imp-2" }),
      [{ id: "old", status: "verified", evidence: rawPayments() }],
      ECL_POLICY,
    );
    expect(r.supersedes).toEqual([{ existingId: "old", reason: "same_period_re_export" }]);
    expect(r.contradictions).toEqual([]);
  });

  it("a currency flip over the same period is a contradiction, never a conversion", () => {
    const r = reconcileEvidence(
      rawPayments({ checksum: "chk-2", importId: "imp-2", currency: "USD" }),
      [{ id: "old", status: "verified", evidence: rawPayments() }],
      ECL_POLICY,
    );
    expect(r.contradictions[0].code).toBe("currency_mismatch");
  });

  it("a partial period overlap is AMBIGUOUS: routed to review, never resolved by guess", () => {
    const r = reconcileEvidence(
      rawPayments({ checksum: "chk-2", importId: "imp-2", periodStart: "2026-07-15", periodEnd: "2026-08-14" }),
      [{ id: "old", status: "verified", evidence: rawPayments() }],
      ECL_POLICY,
    );
    expect(r.ambiguities).toEqual([{ existingId: "old", code: "overlapping_period_ambiguous" }]);
  });

  it("historical (rejected/superseded) records never contradict or get superseded again", () => {
    const r = reconcileEvidence(
      rawPayments({ checksum: "chk-2", importId: "imp-2", grossAmountMinor: 9000000 }),
      [{ id: "old", status: "superseded", evidence: rawPayments() }],
      ECL_POLICY,
    );
    expect(r.contradictions).toEqual([]);
    expect(r.supersedes).toEqual([]);
  });

  it("cross-checks commerce vs payments gross using EXACTLY the policy tolerance", () => {
    const tol = ECL_POLICY.reconciliation.commerceVsPaymentsMaxDeltaPct;
    const gross = 1000000;
    const within = Math.round(gross * (1 - tol / 200)); // half the tolerance
    const beyond = Math.round(gross * (1 - (tol * 2) / 100)); // double it
    const commerce = (g) =>
      normalizeCommerceEvidence({
        evidenceType: "statement_csv", sourceType: "commerce_export", checksum: "c-chk", importId: "c-imp",
        parserVersion: "p1", currency: "EUR", periodStart: "2026-07-01", periodEnd: "2026-07-31",
        grossSalesAmountMinor: g, orderCount: 10,
      });
    const ok = reconcileEvidence(commerce(within), [{ id: "pay", status: "verified", evidence: rawPayments() }], ECL_POLICY);
    expect(ok.crossChecks[0].withinTolerance).toBe(true);
    expect(ok.contradictions).toEqual([]);
    const bad = reconcileEvidence(commerce(beyond), [{ id: "pay", status: "verified", evidence: rawPayments() }], ECL_POLICY);
    expect(bad.crossChecks[0].withinTolerance).toBe(false);
    expect(bad.contradictions[0].code).toBe("commerce_vs_payments_delta_exceeded");
  });

  it("unreadable existing entries are surfaced as ambiguities, not skipped silently", () => {
    const r = reconcileEvidence(rawPayments(), [null, { id: "x" }], ECL_POLICY);
    expect(r.ambiguities.map((a) => a.code)).toEqual(["existing_entry_unreadable", "existing_entry_unreadable"]);
  });

  it("relativeDeltaPct is symmetric and zero-safe", () => {
    expect(relativeDeltaPct(100, 50)).toBe(50);
    expect(relativeDeltaPct(50, 100)).toBe(50);
    expect(relativeDeltaPct(0, 0)).toBe(0);
  });

  it("the result is deep-frozen evidence, not a mutable working object", () => {
    const r = reconcileEvidence(rawPayments(), [], ECL_POLICY);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.contradictions)).toBe(true);
  });
});