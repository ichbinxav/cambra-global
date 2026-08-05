// src/lib/economicTerms.js
//
// v60 — Adapter over the generated product policy. The numerical constants
// are no longer defined here; they derive from config/product-policy.json via
// src/lib/generated/productPolicy.js. This file preserves the v59.1 public API
// (same export names, same values) so every existing consumer and test keeps
// passing without change.
//
// The canonical policy stores rates as fractions (0.25); this adapter exposes
// them as integer percentages (25) to match the pre-existing API. The mapping
// is one-way and deterministic: Math.round(rate * 100).
//
// Legal prose (Terms, mandates, contract templates) is NOT centralized — only
// the numerical constants are. Legal wording stays context-specific and
// versioned on the acceptance snapshot.

import {
  ECONOMIC_TERMS_POLICY,
  REFERRAL_POLICY,
} from "@/lib/generated/productPolicy.js";

export const ECONOMIC_TERMS = Object.freeze({
  // The Analyzer is free. €0, no card.
  analyzerFeeEur: ECONOMIC_TERMS_POLICY.analyzerPriceEur,

  // Recovery is optional, not mandatory.
  recoveryOptional: ECONOMIC_TERMS_POLICY.recoveryOptional,

  // CAMBRA standard success fee: 25% of positive verified savings.
  recoveryFeePct: Math.round(ECONOMIC_TERMS_POLICY.successFeeRate * 100),

  // Merchant share of the savings during the economic period: 75%.
  merchantSharePct: Math.round(ECONOMIC_TERMS_POLICY.merchantShareRate * 100),

  // Fee base: positive verified savings only. No positive verified saving = no fee.
  feeBase: ECONOMIC_TERMS_POLICY.feeBase,

  // Recovery duration: 24 months.
  recoveryDurationMonths: ECONOMIC_TERMS_POLICY.feeDurationMonths,

  // Referral program: each activation reduces the fee by 5 points.
  referralStepPct: Math.round(REFERRAL_POLICY.stepRate * 100),

  // Minimum referral-adjusted fee floor: 5%.
  referralFloorPct: Math.round(REFERRAL_POLICY.floorRate * 100),

  // Starting fee (before referral reductions).
  referralStartPct: Math.round(REFERRAL_POLICY.startRate * 100),
});

// Convenience helpers (preserve v59.1 names; add merchantShare + referralStart).
export const RECOVERY_FEE_PCT = ECONOMIC_TERMS.recoveryFeePct;
export const RECOVERY_DURATION_MONTHS = ECONOMIC_TERMS.recoveryDurationMonths;
export const REFERRAL_FLOOR_PCT = ECONOMIC_TERMS.referralFloorPct;
export const REFERRAL_STEP_PCT = ECONOMIC_TERMS.referralStepPct;
export const REFERRAL_START_PCT = ECONOMIC_TERMS.referralStartPct;
export const MERCHANT_SHARE_PCT = ECONOMIC_TERMS.merchantSharePct;
export const ANALYZER_FEE_EUR = ECONOMIC_TERMS.analyzerFeeEur;

// Human-readable summary string (EN) — used in tests and consistency checks.
// Rebuilt from the policy-derived values; byte-identical to v59.1 while the
// values stay 25 / 24 / 5.
export const ECONOMIC_SUMMARY_EN =
  `Analyzer is free · Recovery is optional · ${RECOVERY_FEE_PCT}% of verified positive savings over ${RECOVERY_DURATION_MONTHS} months · No positive verified saving = no fee · Referral floor ${REFERRAL_FLOOR_PCT}%`;