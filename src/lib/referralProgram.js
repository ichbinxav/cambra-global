// referralProgram — REFERRAL-1 (2026-08-03).
//
// The declared program, in one place:
//   • standard success fee              25%
//   • each ACTIVATED referral           −5 points
//   • floor                             5%  (never lower)
// "Activated" = the referred business reached verified savings on real
// provider statements (Terms §7 standard) — not a signup, not an analysis.
//
// This module is DECLARATIVE only: it drives what the merchant is shown.
// Actual invoicing is out of scope for this chunk (see Decision_Log_REFERRAL1).

export const BASE_FEE_PCT = 25;
export const STEP_POINTS = 5;
export const FLOOR_FEE_PCT = 5;

export function feeForActivated(activatedCount) {
  const n = Math.max(0, Math.floor(Number(activatedCount) || 0));
  return Math.max(FLOOR_FEE_PCT, BASE_FEE_PCT - n * STEP_POINTS);
}

// Fee after one more activated referral — null when already at the floor.
export function nextFeePct(activatedCount) {
  const current = feeForActivated(activatedCount);
  if (current <= FLOOR_FEE_PCT) return null;
  return feeForActivated((Number(activatedCount) || 0) + 1);
}