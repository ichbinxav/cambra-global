// paymentsScore.test.js — the CALIBRATION ORACLE.
//
// This suite freezes the validated 2026-07-14 distribution (see
// paymentsScore.js header). Any change to the Score curve that moves a
// mainstream PSP out of its sealed grade — especially Stripe/Payplug out of C,
// or a reasonable PSP into F — FAILS here. That is the whole point: the
// calibration is blindada against regressions.
//
// The (current, achievable) bps below are the REAL values read from the seeded
// PaymentsRateTable at the reference profile (€30k/mo · ticket €50 · FR/EU ·
// online), captured during validation. They are the ground truth.

import { describe, it, expect } from "vitest";
import {
  computePaymentsScore,
  gradeFromScore,
  toneFromGrade,
  DEFAULT_CEILING_BPS,
} from "./paymentsScore.js";

// Helper to build a minimal engine_result shape the scorer reads.
const er = (current, achievable, verified = true) => ({
  current_effective_bps: current,
  achievable_effective_bps: achievable,
  cohort: { verified },
});

// The sealed oracle. { name, current, achievable, expectedGrade }.
const ORACLE = [
  { name: "Stancer",          current: 100,  achievable: 116, grade: "A" }, // below floor → clamps to A
  { name: "Adyen",            current: 122,  achievable: 108, grade: "A" },
  { name: "Stripe",           current: 200,  achievable: 136, grade: "C" },
  { name: "Payplug",          current: 200,  achievable: 136, grade: "C" },
  { name: "Mollie",           current: 230,  achievable: 136, grade: "D" },
  { name: "Shopify Payments", current: 250,  achievable: 150, grade: "F" },
  { name: "SumUp",            current: 250,  achievable: 136, grade: "F" },
  { name: "PayPal",           current: 360,  achievable: 136, grade: "F" },
];

describe("paymentsScore — calibration oracle (real seeded PSP rates @ €30k/mo, €50, FR/EU)", () => {
  for (const p of ORACLE) {
    it(`${p.name} (${(p.current / 100).toFixed(2)}%) → grade ${p.grade}`, () => {
      const r = computePaymentsScore(er(p.current, p.achievable));
      expect(r.available).toBe(true);
      expect(r.grade).toBe(p.grade);
    });
  }

  it("credibility invariant: NO mainstream PSP (Stripe/Payplug) lands in F", () => {
    for (const name of ["Stripe", "Payplug"]) {
      const p = ORACLE.find((x) => x.name === name);
      const r = computePaymentsScore(er(p.current, p.achievable));
      expect(r.grade).not.toBe("F");
    }
  });

  it("discrimination invariant: genuinely expensive PSPs (SumUp/PayPal) land in F", () => {
    for (const name of ["SumUp", "PayPal"]) {
      const p = ORACLE.find((x) => x.name === name);
      const r = computePaymentsScore(er(p.current, p.achievable));
      expect(r.grade).toBe("F");
    }
  });
});

describe("paymentsScore — monotonicity & determinism", () => {
  it("same input → same score (deterministic)", () => {
    const a = computePaymentsScore(er(200, 136));
    const b = computePaymentsScore(er(200, 136));
    expect(a.score).toBe(b.score);
  });

  it("higher current rate (same floor) → lower or equal score (monotone)", () => {
    let prev = 101;
    for (let cur = 136; cur <= 360; cur += 10) {
      const s = computePaymentsScore(er(cur, 136)).score;
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });

  it("at the floor → score 100 / grade A", () => {
    const r = computePaymentsScore(er(136, 136));
    expect(r.score).toBe(100);
    expect(r.grade).toBe("A");
  });

  it("below the floor → clamps to 100 (never above)", () => {
    const r = computePaymentsScore(er(100, 136));
    expect(r.score).toBe(100);
  });

  it("at/above the ceiling → score 0 / grade F", () => {
    const r = computePaymentsScore(er(DEFAULT_CEILING_BPS, 136));
    expect(r.score).toBe(0);
    expect(r.grade).toBe("F");
    const r2 = computePaymentsScore(er(DEFAULT_CEILING_BPS + 100, 136));
    expect(r2.score).toBe(0);
  });
});

describe("paymentsScore — honest unavailable states (never fabricate a grade)", () => {
  it("missing bps → available:false", () => {
    expect(computePaymentsScore(er(undefined, 136)).available).toBe(false);
    expect(computePaymentsScore(er(200, undefined)).available).toBe(false);
    expect(computePaymentsScore(null).available).toBe(false);
  });

  it("achievable <= 0 → available:false (division guard)", () => {
    expect(computePaymentsScore(er(200, 0)).available).toBe(false);
    expect(computePaymentsScore(er(200, -10)).available).toBe(false);
  });
});

describe("paymentsScore — confidence inheritance & framing", () => {
  it("surfaces verified straight through", () => {
    expect(computePaymentsScore(er(200, 136, true)).verified).toBe(true);
    expect(computePaymentsScore(er(200, 136, false)).verified).toBe(false);
  });

  it("verified state does NOT change the score (same two bps → same score)", () => {
    const v = computePaymentsScore(er(200, 136, true));
    const e = computePaymentsScore(er(200, 136, false));
    expect(v.score).toBe(e.score);
  });

  it("context line NEVER names a PSP (third-party disparagement guard)", () => {
    const names = ["stripe", "paypal", "sumup", "mollie", "payplug", "adyen", "stancer", "shopify"];
    for (const p of ORACLE) {
      const line = computePaymentsScore(er(p.current, p.achievable)).contextLine.toLowerCase();
      for (const n of names) expect(line).not.toContain(n);
    }
  });

  it("context line talks about 'your' rate/setup", () => {
    const line = computePaymentsScore(er(200, 136)).contextLine.toLowerCase();
    expect(line).toContain("your");
  });
});

describe("paymentsScore — step-2 seam & region override", () => {
  it("vs_percentile falls back to vs_floor today (reports the mode that ran)", () => {
    const r = computePaymentsScore(er(200, 136), { mode: "vs_percentile" });
    expect(r.available).toBe(true);
    expect(r.mode).toBe("vs_floor");
  });

  it("ceilingBps override changes the score (region parametrization)", () => {
    const base = computePaymentsScore(er(230, 136));                    // Mollie @ 3.10 ceiling → D
    const harsher = computePaymentsScore(er(230, 136), { ceilingBps: 290 }); // → F
    expect(harsher.score).toBeLessThan(base.score);
  });
});

describe("paymentsScore — internal helpers", () => {
  it("gradeFromScore boundaries", () => {
    expect(gradeFromScore(85)).toBe("A");
    expect(gradeFromScore(84)).toBe("B");
    expect(gradeFromScore(70)).toBe("B");
    expect(gradeFromScore(69)).toBe("C");
    expect(gradeFromScore(55)).toBe("C");
    expect(gradeFromScore(54)).toBe("D");
    expect(gradeFromScore(40)).toBe("D");
    expect(gradeFromScore(39)).toBe("F");
    expect(gradeFromScore(0)).toBe("F");
  });

  it("toneFromGrade maps to score tokens", () => {
    expect(toneFromGrade("A")).toBe("excellent");
    expect(toneFromGrade("B")).toBe("good");
    expect(toneFromGrade("C")).toBe("medium");
    expect(toneFromGrade("D")).toBe("medium");
    expect(toneFromGrade("F")).toBe("risk");
  });
});