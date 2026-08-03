// referralProgram.test.js — REFERRAL-2 T6 (2026-08-03).
//
// The ladder decides money: it is the percentage written into BillingRule and
// shown on /Referrals. Terms §8 promises 25% − 5 points per activated referral
// with an absolute floor of 5%. These tests pin that promise, including the
// garbage-input paths — an invalid input must degrade to the STANDARD 25% fee
// (never to 0%, never to NaN, never below the floor).

import { describe, it, expect } from "vitest";
import {
  feeForActivated,
  nextFeePct,
  BASE_FEE_PCT,
  STEP_POINTS,
  FLOOR_FEE_PCT,
} from "./referralProgram.js";

describe("referral fee ladder (Terms §8)", () => {
  it("declares the contractual constants", () => {
    expect(BASE_FEE_PCT).toBe(25);
    expect(STEP_POINTS).toBe(5);
    expect(FLOOR_FEE_PCT).toBe(5);
  });

  it.each([
    [0, 25],
    [1, 20],
    [2, 15],
    [3, 10],
    [4, 5],
  ])("%i activated referrals → %i%%", (n, expected) => {
    expect(feeForActivated(n)).toBe(expected);
  });

  it("holds the 5% floor beyond 4 activations", () => {
    for (const n of [5, 6, 12, 100, 10000]) {
      expect(feeForActivated(n)).toBe(FLOOR_FEE_PCT);
    }
  });

  it("never returns a fee outside [5, 25]", () => {
    for (let n = 0; n <= 50; n++) {
      const fee = feeForActivated(n);
      expect(fee).toBeGreaterThanOrEqual(FLOOR_FEE_PCT);
      expect(fee).toBeLessThanOrEqual(BASE_FEE_PCT);
    }
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["negative", -3],
    ["non-numeric string", "many"],
    ["NaN", NaN],
    ["empty string", ""],
    ["object", {}],
  ])("invalid input (%s) falls back to the standard fee", (_label, input) => {
    expect(feeForActivated(input)).toBe(BASE_FEE_PCT);
  });

  it("truncates fractional counts instead of inventing half steps", () => {
    expect(feeForActivated(1.9)).toBe(20);
    expect(feeForActivated(2.2)).toBe(15);
  });

  it("nextFeePct previews the next step and stops at the floor", () => {
    expect(nextFeePct(0)).toBe(20);
    expect(nextFeePct(1)).toBe(15);
    expect(nextFeePct(3)).toBe(5);
    expect(nextFeePct(4)).toBeNull();
    expect(nextFeePct(9)).toBeNull();
  });

  it("nextFeePct tolerates invalid input like the fee itself", () => {
    expect(nextFeePct(null)).toBe(20);
    expect(nextFeePct(-5)).toBe(20);
  });
});