// SYNC MASTER — no se importa en runtime por diseño. Borrarlo desarma referralProgram.sync.test.js.
// referralProgram — REFERRAL-1 (2026-08-03).
//
// The declared program, in one place:
//   • standard success fee              25%
//   • each ACTIVATED referral           −5 points
//   • floor                             5%  (never lower)
// "Activated" = the referred business reached verified savings on real
// provider statements (Terms §7 standard) — not a signup, not an analysis.
//
// REFERRAL-2 (2026-08-03): this file is the SOURCE OF TRUTH for the ladder.
// Deno cannot import from src/, so base44/shared/referralProgram.ts mirrors the
// block between the SYNC markers VERBATIM. src/lib/referralProgram.sync.test.js
// fails if the two texts ever diverge — a drift here would mean the panel shows
// one fee and the invoice charges another.

import { getReferralStartPct, getReferralStepPct, getReferralFloorPct } from "@/lib/generated/productPolicy";

// SYNC-START referral-fee-ladder
const BASE_FEE_PCT = getReferralStartPct();
const STEP_POINTS = getReferralStepPct();
const FLOOR_FEE_PCT = getReferralFloorPct();

function feeForActivated(activatedCount) {
  const n = Math.max(0, Math.floor(Number(activatedCount) || 0));
  if (!Number.isFinite(n)) return BASE_FEE_PCT;
  return Math.max(FLOOR_FEE_PCT, BASE_FEE_PCT - n * STEP_POINTS);
}

// Fee after one more activated referral — null when already at the floor.
function nextFeePct(activatedCount) {
  const current = feeForActivated(activatedCount);
  if (current <= FLOOR_FEE_PCT) return null;
  return feeForActivated(Math.max(0, Math.floor(Number(activatedCount) || 0)) + 1);
}
// SYNC-END referral-fee-ladder
export { BASE_FEE_PCT, STEP_POINTS, FLOOR_FEE_PCT, feeForActivated, nextFeePct };