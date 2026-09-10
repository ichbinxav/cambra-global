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

export function recoverV2TermFee(activatedReferrals) {
  const standard = Math.round(Number(PRODUCT_POLICY.economicTerms.successFeeRate) * 100);
  return effectiveRecoverFeeForPhase(standard, activatedReferrals);
}
