import { PRODUCT_POLICY } from '@/lib/productPolicy';

// Frontend-safe projection of Recover Economics V2. Values come from the
// generated product policy; business authority remains server-side.
export function effectiveRecoverFeeForPhase(standardPct, activatedReferrals) {
  if (!(Number(standardPct) > 0)) return 0;
  const step = Math.round(Number(PRODUCT_POLICY.economicTerms.referralDiscountStepRate || 0.05) * 100);
  const floor = Math.round(Number(PRODUCT_POLICY.economicTerms.successFeeFloorRate || 0.05) * 100);
  const count = Math.max(0, Math.floor(Number(activatedReferrals) || 0));
  return Math.max(floor, Number(standardPct) - count * step);
}

export function recoverV2PhaseFees(activatedReferrals) {
  const y1 = Math.round(Number(PRODUCT_POLICY.economicTerms.year1SuccessFeeRate || 0.25) * 100);
  const y2 = Math.round(Number(PRODUCT_POLICY.economicTerms.year2SuccessFeeRate || 0.15) * 100);
  return {
    year1: effectiveRecoverFeeForPhase(y1, activatedReferrals),
    year2: effectiveRecoverFeeForPhase(y2, activatedReferrals),
  };
}
