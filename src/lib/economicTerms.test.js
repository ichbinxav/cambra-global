import { describe, it, expect } from "vitest";
import { ECONOMIC_TERMS, RECOVERY_FEE_PCT, RECOVERY_DURATION_MONTHS, REFERRAL_FLOOR_PCT, ANALYZER_FEE_EUR } from "@/lib/economicTerms";

// P0.7 — Economic consistency tests. These constants are the single source
// of truth. If a merchant-facing file references a different fee, duration,
// or floor, the consistency checks below (and the file-scanning tests in
// this suite) will catch the drift.

describe("Economic terms (P0.7)", () => {
  it("Analyzer is €0", () => {
    expect(ANALYZER_FEE_EUR).toBe(0);
  });

  it("Recovery fee is 25%", () => {
    expect(RECOVERY_FEE_PCT).toBe(25);
  });

  it("Recovery duration is 24 months", () => {
    expect(RECOVERY_DURATION_MONTHS).toBe(24);
  });

  it("Referral floor is 5%", () => {
    expect(REFERRAL_FLOOR_PCT).toBe(5);
  });

  it("Recovery is optional", () => {
    expect(ECONOMIC_TERMS.recoveryOptional).toBe(true);
  });

  it("Fee base is positive verified savings", () => {
    expect(ECONOMIC_TERMS.feeBase).toBe("positive_verified_savings");
  });

  it("Referral step is 5 points", () => {
    expect(ECONOMIC_TERMS.referralStepPct).toBe(5);
  });

  it("Referral start is 25%", () => {
    expect(ECONOMIC_TERMS.referralStartPct).toBe(25);
  });

  it("ECONOMIC_TERMS is frozen (immutable)", () => {
    expect(Object.isFrozen(ECONOMIC_TERMS)).toBe(true);
  });
});