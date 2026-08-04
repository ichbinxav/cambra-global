// src/lib/economicTerms.js
//
// P0.7 — Central economic-terms constants for the CAMBRA product.
// These values MUST be consistent everywhere they appear in merchant-facing
// copy, contracts, invoices, emails, PDFs, onboarding, results, dashboard,
// help centre, FAQ, and the Copilot.
//
// Do NOT change these values without a corresponding product-memorandum update.
// Legal prose (Terms, mandates, contract templates) is NOT centralized here —
// only the numerical constants are. Legal wording stays context-specific.
//
// The consistency test (src/lib/economicTerms.test.js) fails if a
// merchant-facing file references a different fee, duration, or floor.

export const ECONOMIC_TERMS = Object.freeze({
  // The Analyzer is free. €0, no card.
  analyzerFeeEur: 0,

  // Recovery is optional, not mandatory.
  recoveryOptional: true,

  // CAMBRA standard success fee: 25% of positive verified savings.
  recoveryFeePct: 25,

  // Fee base: positive verified savings only. No positive verified saving = no fee.
  feeBase: "positive_verified_savings",

  // Recovery duration: 24 months.
  recoveryDurationMonths: 24,

  // Referral program: each activation reduces the fee by 5 points.
  referralStepPct: 5,

  // Minimum referral-adjusted fee floor: 5%.
  referralFloorPct: 5,

  // Starting fee (before referral reductions).
  referralStartPct: 25,
});

// Convenience helpers
export const RECOVERY_FEE_PCT = ECONOMIC_TERMS.recoveryFeePct;
export const RECOVERY_DURATION_MONTHS = ECONOMIC_TERMS.recoveryDurationMonths;
export const REFERRAL_FLOOR_PCT = ECONOMIC_TERMS.referralFloorPct;
export const REFERRAL_STEP_PCT = ECONOMIC_TERMS.referralStepPct;
export const ANALYZER_FEE_EUR = ECONOMIC_TERMS.analyzerFeeEur;

// Human-readable summary string (EN) — used in tests and consistency checks.
export const ECONOMIC_SUMMARY_EN =
  `Analyzer is free · Recovery is optional · ${RECOVERY_FEE_PCT}% of verified positive savings over ${RECOVERY_DURATION_MONTHS} months · No positive verified saving = no fee · Referral floor ${REFERRAL_FLOOR_PCT}%`;