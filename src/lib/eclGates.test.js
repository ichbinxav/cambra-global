// v62.4 — ECL P2: pure gate evaluation.
import { describe, it, expect } from "vitest";
import { evaluateGate, deriveFreezeEligibility, finalizeConfidenceResult, assertContext, EclContextError, REQUIRED_CONTEXT_KEYS } from "@/lib/eclGates";
import { ECL_POLICY } from "@/lib/generated/eclPolicy";

const NOW = "2026-08-06T12:00:00.000Z";

const ctx = (over) => ({
  now: NOW,
  hasAttestation: true,
  hasOpenConflicts: false,
  baselineLocked: true,
  activeStrikeCountByScope: {},
  hasBlockingReviewCase: false,
  ...over,
});

const result = (over) => finalizeConfidenceResult(
  {
    evidenceType: "statement_csv",
    sourceType: "provider_statement",
    confidenceLevel: "high",
    verificationMethod: "independent_document",
    evidenceStatus: "verified",
    ...over,
  },
  ECL_POLICY,
  ctx(),
);

describe("evaluateGate — context is mandatory", () => {
  it("names every required context key", () => {
    expect(REQUIRED_CONTEXT_KEYS).toEqual([
      "now", "hasAttestation", "hasOpenConflicts", "baselineLocked",
      "activeStrikeCountByScope", "hasBlockingReviewCase",
    ]);
  });

  it("refuses an incomplete context instead of defaulting", () => {
    expect(() => assertContext({ now: NOW })).toThrow(EclContextError);
    const { hasAttestation, ...partial } = ctx();
    expect(() => evaluateGate("create_invoice", result(), ECL_POLICY, partial)).toThrow(/hasAttestation/);
  });

  it("refuses an unparseable now", () => {
    expect(() => assertContext(ctx({ now: "later" }))).toThrow(/parseable ISO instant/);
  });

  it("never reads the wall clock: no EXECUTABLE Date.now() in the core", async () => {
    const fs = await import("node:fs");
    for (const file of ["src/lib/eclGates.js", "src/lib/confidenceResult.js", "src/lib/normalizedEvidence.js"]) {
      const code = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
      expect(code).not.toMatch(/Date\.now\(\)/);
      expect(code).not.toMatch(/new Date\(\)/);
    }
  });
});

describe("evaluateGate — outcomes", () => {
  it("returns the documented shape and performs no writes", () => {
    const r = evaluateGate("show_estimate", result({ confidenceLevel: "low", evidenceStatus: "estimated" }), ECL_POLICY, ctx());
    expect(Object.keys(r).sort()).toEqual(["allowed", "gateName", "policyVersion", "reasons"]);
    expect(r.policyVersion).toBe("ecl-2026.08");
    expect(Object.isFrozen(r)).toBe(true);
  });

  it("blocks an unknown gate rather than allowing it", () => {
    const r = evaluateGate("make_me_rich", result(), ECL_POLICY, ctx());
    expect(r.allowed).toBe(false);
    expect(r.reasons).toEqual(["gate_unknown"]);
  });

  it("verified + high + independent evidence is freeze-eligible", () => {
    expect(evaluateGate("freeze_baseline", result(), ECL_POLICY, ctx()).allowed).toBe(true);
    expect(deriveFreezeEligibility(result(), ECL_POLICY, ctx())).toBe("eligible");
  });

  it("attested_only evidence can never freeze a baseline", () => {
    const r = result({ verificationMethod: "attested_only" });
    const gate = evaluateGate("freeze_baseline", r, ECL_POLICY, ctx());
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.join(" ")).toMatch(/verification_method_not_allowed/);
    expect(deriveFreezeEligibility(r, ECL_POLICY, ctx())).toBe("conditionally_eligible");
  });

  it("accepted_provisionally can never create an invoice", () => {
    const r = result({ evidenceStatus: "accepted_provisionally" });
    const gate = evaluateGate("create_invoice", r, ECL_POLICY, ctx());
    expect(gate.allowed).toBe(false);
    expect(gate.reasons.join(" ")).toMatch(/status_not_allowed:accepted_provisionally/);
  });

  it("medium confidence blocks approve_report but allows show_dashboard", () => {
    const r = result({ confidenceLevel: "medium" });
    expect(evaluateGate("approve_report", r, ECL_POLICY, ctx()).allowed).toBe(false);
    expect(evaluateGate("show_dashboard", r, ECL_POLICY, ctx()).allowed).toBe(true);
  });

  it("an open conflict blocks approve_report", () => {
    expect(evaluateGate("approve_report", result(), ECL_POLICY, ctx({ hasOpenConflicts: true })).reasons)
      .toContain("open_conflicts");
    expect(evaluateGate("approve_report", result({ conflicts: [{ id: "c1" }] }), ECL_POLICY, ctx()).reasons)
      .toContain("open_conflicts");
  });

  it("a missing attestation blocks recover_proposal", () => {
    const r = result({ confidenceLevel: "medium", evidenceStatus: "accepted_provisionally" });
    expect(evaluateGate("recover_proposal", r, ECL_POLICY, ctx()).allowed).toBe(true);
    expect(evaluateGate("recover_proposal", r, ECL_POLICY, ctx({ hasAttestation: false })).reasons)
      .toContain("attestation_missing");
  });

  it("an unlocked baseline and a blocking review case each block create_invoice", () => {
    expect(evaluateGate("create_invoice", result(), ECL_POLICY, ctx()).allowed).toBe(true);
    expect(evaluateGate("create_invoice", result(), ECL_POLICY, ctx({ baselineLocked: false })).reasons)
      .toContain("baseline_not_locked");
    expect(evaluateGate("create_invoice", result(), ECL_POLICY, ctx({ hasBlockingReviewCase: true })).reasons)
      .toContain("blocking_review_case");
  });
});

describe("evaluateGate — expiry is driven by context.now", () => {
  const expiring = (over) => finalizeConfidenceResult(
    {
      confidenceLevel: "high",
      verificationMethod: "independent_document",
      evidenceStatus: "verified",
      expiresAt: "2026-08-10T00:00:00.000Z",
      ...over,
    },
    ECL_POLICY,
    ctx(),
  );

  it("allows before the expiry instant and blocks after it, deterministically", () => {
    const r = expiring();
    expect(evaluateGate("create_invoice", r, ECL_POLICY, ctx({ now: "2026-08-09T23:59:59.000Z" })).allowed).toBe(true);
    const after = evaluateGate("create_invoice", r, ECL_POLICY, ctx({ now: "2026-08-10T00:00:01.000Z" }));
    expect(after.allowed).toBe(false);
    expect(after.reasons).toContain("evidence_expired");
  });

  it("an expired status is blocked by the allowed-status set as well", () => {
    const r = result({ evidenceStatus: "expired" });
    expect(evaluateGate("create_invoice", r, ECL_POLICY, ctx()).reasons).toContain("status_not_allowed:expired");
  });

  it("finalization turns a lapsed provisional acceptance into expired + reviewRequired", () => {
    const r = finalizeConfidenceResult(
      {
        confidenceLevel: "high",
        verificationMethod: "independent_document",
        evidenceStatus: "accepted_provisionally",
        expiresAt: "2026-08-01T00:00:00.000Z",
      },
      ECL_POLICY,
      ctx(),
    );
    expect(r.evidenceStatus).toBe("expired");
    expect(r.reviewRequired).toBe(true);
    expect(r.freezeEligibility).toBe("not_eligible");
  });
});

describe("evaluateGate — strikes", () => {
  it("one payments strike does not block with a threshold of 2", () => {
    const r = evaluateGate("create_invoice", result(), ECL_POLICY, ctx({ activeStrikeCountByScope: { payments: 1 } }));
    expect(r.allowed).toBe(true);
  });

  it("two payments strikes block create_invoice", () => {
    const r = evaluateGate("create_invoice", result(), ECL_POLICY, ctx({ activeStrikeCountByScope: { payments: 2 } }));
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain("blocking_strikes:payments:2");
  });

  it("an accounting strike does not block a payments invoice (strikes are scoped)", () => {
    const r = evaluateGate("create_invoice", result(), ECL_POLICY, ctx({ activeStrikeCountByScope: { accounting: 5 } }));
    expect(r.allowed).toBe(true);
  });
});

describe("evaluateGate — recalc_billed_period is never automatable", () => {
  it("is refused even with perfect evidence and a clean context", () => {
    const r = evaluateGate("recalc_billed_period", result(), ECL_POLICY, ctx());
    expect(r.allowed).toBe(false);
    expect(r.reasons).toContain("automation_forbidden");
    expect(r.reasons).toContain("requires_human_review");
    expect(r.reasons).toContain("manual_resolution:credit_note_or_adjustment_only");
  });
});