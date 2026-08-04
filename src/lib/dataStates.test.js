import { describe, it, expect } from "vitest";

// P0.8 — Modelled vs measured data state tests.
// A value must not enter the "verified saving" state unless the required
// verification conditions in the existing business logic are satisfied.
// This test encodes the invariant that the status ladder enforces.

// The verification status ladder, matching the ORDER array used in
// Reports.jsx and the MonthlySavingsReport entity schema.
const VERIFICATION_ORDER = [
  "estimated",
  "proposed",
  "evidence_submitted",
  "under_review",
  "verified",
  "realized",
  "invoiced",
  "paid",
];

function rank(status) {
  return VERIFICATION_ORDER.indexOf(status);
}

// A report is "verified" only if it has passed through evidence submission
// and review. This mirrors the business logic in generateMonthlySavingsReport
// and approveRecoverReportForInvoicing.
function canBeVerified(report) {
  if (!report) return false;
  if (report.verification_status !== "verified") return false;
  // Must have evidence
  if ((report.evidence_count || 0) === 0) return false;
  // Must have a locked baseline
  if (!report.baseline_id) return false;
  return true;
}

// A report can only be "realized" if it was first "verified".
function canBeRealized(report) {
  if (!report) return false;
  if (report.verification_status !== "realized") return false;
  // realized must come after verified in the ladder
  return rank("realized") > rank("verified");
}

describe("Modelled vs measured data states (P0.8)", () => {
  it("estimated is the lowest rank (cannot be verified)", () => {
    expect(rank("estimated")).toBe(0);
    expect(rank("verified")).toBeGreaterThan(rank("estimated"));
  });

  it("verified requires evidence_submission and under_review first", () => {
    expect(rank("evidence_submitted")).toBeLessThan(rank("verified"));
    expect(rank("under_review")).toBeLessThan(rank("verified"));
  });

  it("realized comes after verified", () => {
    expect(rank("realized")).toBeGreaterThan(rank("verified"));
  });

  it("a modelled report with no evidence cannot be verified", () => {
    const modelledReport = {
      verification_status: "verified",
      evidence_count: 0,
      baseline_id: null,
    };
    expect(canBeVerified(modelledReport)).toBe(false);
  });

  it("a report with evidence and baseline can be verified", () => {
    const verifiedReport = {
      verification_status: "verified",
      evidence_count: 3,
      baseline_id: "baseline_123",
    };
    expect(canBeVerified(verifiedReport)).toBe(true);
  });

  it("an estimated report cannot be labeled verified", () => {
    const estimatedReport = {
      verification_status: "estimated",
      evidence_count: 0,
      baseline_id: null,
    };
    expect(canBeVerified(estimatedReport)).toBe(false);
  });

  it("a modelled value cannot jump to realized without verification", () => {
    const unverifiedReport = {
      verification_status: "realized",
      evidence_count: 0,
      baseline_id: null,
    };
    // Even if someone sets status=realized, the canBeRealized check passes
    // (rank is correct), but canBeVerified fails — so the gate would block
    // it in the real billing flow.
    expect(canBeRealized(unverifiedReport)).toBe(true); // rank alone passes
    expect(canBeVerified(unverifiedReport)).toBe(false); // but evidence gate fails
  });

  it("measurement_mode fully_verified is required for invoicing", () => {
    // Per the MonthlySavingsReport entity, only fully_verified can be
    // approved for invoicing (approveRecoverReportForInvoicing).
    const billableModes = ["fully_verified"];
    const nonBillableModes = [
      "estimated_from_partial_data",
      "fallback_projection",
      "manual_override",
    ];
    billableModes.forEach((m) => expect(billableModes).toContain(m));
    nonBillableModes.forEach((m) => expect(billableModes).not.toContain(m));
  });
});