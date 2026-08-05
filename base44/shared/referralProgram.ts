// referralProgram (Deno mirror) — REFERRAL-2 (2026-08-03).
//
// MIRROR, NOT A SECOND IMPLEMENTATION. src/lib/referralProgram.js is the source
// of truth; Deno cannot import from src/, so the block between the SYNC markers
// is copied VERBATIM. src/lib/referralProgram.sync.test.js compares the two
// texts and fails on any divergence.
//
// Money depends on this: the /Referrals panel derives the merchant's fee from
// the src/ copy, the BillingRule written by applyReferralActivation derives it
// from this copy. If they drift, we show one number and invoice another.

import { getReferralStartPct, getReferralStepPct, getReferralFloorPct } from './generated/productPolicy.ts';

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