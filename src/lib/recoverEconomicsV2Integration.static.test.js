import { describe,it,expect } from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
describe('Recover Economics V2 integration boundaries',()=>{
 it('grandfathers legacy contracts by discriminating on snapshot version',()=>{
  const approval=read('base44/functions/approveRecoverReportForInvoicing/entry.ts');
  expect(approval).toMatch(/recovery_economics\?\.version\s*===\s*RECOVERY_ECONOMICS_V2/);
  expect(approval).toContain('monthBillableWindow');
 });
 it('blocks overlapping active recoveries on the same attribution key',()=>{
  const src=read('base44/functions/recordConditionsActivation/entry.ts');
  expect(src).toContain('overlapping_recovery_attribution_required');
  expect(src).toMatch(/economic_right_status\s*:\s*["']active["']/);
 });
 it('does not erase an activated recovery when general CAMBRA service is cancelled',()=>{
  const src=read('base44/functions/cancelCambraService/entry.ts');
  expect(src).toMatch(/economic_right_status\s*===\s*["']active["']/);
  expect(src).toContain('surviving.push(a.id)');
  expect(src).not.toMatch(/economic_right_status\s*:\s*["']waived["']/);
 });
 it('marks verification missing when Stripe is disconnected instead of estimating savings',()=>{
  const handler=read('base44/functions/stripeConnectionDisconnect/entry.ts');
  const lifecycle=read('base44/shared/stripeConnectedAccountLifecycle.ts');
  expect(handler).toContain('disconnectLegacyStripeConnectionOnly(svc, {');
  expect(lifecycle).toMatch(/verification_access_status\s*:\s*["']missing["']/);
  expect(lifecycle).toContain('verification_required_no_estimated_billing');
  expect(lifecycle).toContain("'stripe_legacy_only_recover_verification_missing'");
  expect(lifecycle).toContain('await updateAndVerify(');
 });
});

describe('V2 pinned economic contract survival',()=>{
 it('pins the activation-time mandate and billing resolves that exact contract after operational revocation',()=>{
  const activation=read('base44/functions/recordConditionsActivation/entry.ts');
  const helper=read('base44/shared/recoverEconomicMandate.ts');
  const approval=read('base44/functions/approveRecoverReportForInvoicing/entry.ts');
  expect(activation).toContain('recovery_mandate_id: activeMandate.id');
  expect(helper).toContain('activation.recovery_mandate_id');
  expect(helper).toMatch(/economic_right_status\s*===\s*["']active["']/);
  expect(approval).toContain('resolveRecoverEconomicMandate(svc, activation)');
 });
});

describe('V2 legal launch gate',()=>{
 it('blocks V2 acceptance until explicit legal approval and keeps a versioned legal draft',()=>{
  const policy=JSON.parse(read('config/product-policy.json'));
  const start=read('base44/functions/startRecoverAcceptance/entry.ts');
  const ctx=read('base44/functions/getRecoverAcceptanceContext/entry.ts');
  const draft=read('src/docs/RECOVER_ECONOMICS_V2_LEGAL_DRAFT.md');
  expect(policy.economicTerms.recoverEconomicsV2LegalApproved).toBe(false);
  expect(start).toContain('recover_v2_legal_review_required');
  expect(ctx).toContain('recover_v2_legal_review_required');
  expect(draft).toContain('LEGAL REVIEW REQUIRED');
 });
});

describe('Unified 25% Recover fee integration',()=>{
 it('has no second-year rate in canonical configuration or billing math',()=>{
  const policy=JSON.parse(read('config/product-policy.json'));
  const economics=read('base44/shared/recoveryEconomicsV2.ts');
  expect(policy.economicTerms.successFeeRate).toBe(0.25);
  expect(policy.economicTerms.feeDurationMonths).toBe(24);
  expect(policy.economicTerms).not.toHaveProperty('year1SuccessFeeRate');
  expect(policy.economicTerms).not.toHaveProperty('year2SuccessFeeRate');
  expect(economics).toContain('export const STANDARD_FEE_PCT = 25');
  expect(economics).not.toContain('YEAR2_FEE_PCT');
  expect(economics).not.toContain('year2Start');
 });
 it('uses the shared fee engine in report generation and approval',()=>{
  const generate=read('base44/functions/generateMonthlySavingsReport/entry.ts');
  const approve=read('base44/functions/approveRecoverReportForInvoicing/entry.ts');
  expect(generate).toContain('periodEconomicsV2({');
  expect(generate).toContain('referralCountFromEffectiveFee(feeRes.pct)');
  expect(approve).toContain('periodEconomicsV2({');
  expect(approve).toContain('referralCountFromEffectiveFee(monthFee.pct)');
 });
 it('does not expose or render a second-year fee in contracts, APIs or panels',()=>{
  const copy=read('base44/shared/recoveryEconomicsCopy.ts');
  const pdf=read('base44/shared/recoverContractPdf.ts');
  const modal=read('src/components/recover/RecoverMandateModal.jsx');
  const commitments=read('base44/functions/getMyRecoveryCommitments/entry.ts');
  const admin=read('src/components/admin/RecoverEconomicsV2Card.jsx');
  expect(copy).toContain("term: 'Months 1–24'");
  expect(copy).not.toMatch(/15% of positive Verified Savings in months 13/);
  expect(pdf).not.toContain('ec.y2');
  expect(modal).not.toContain('recovery_economics_copy.y2');
  expect(commitments).not.toContain('recovery_term_year2_start_date');
  expect(admin).not.toContain('recovery_term_year2_start_date');
 });
 it('preserves the referral ladder including 15% after two activated referrals',()=>{
  const referral=read('src/lib/referralProgram.js');
  expect(referral).toContain('BASE_FEE_PCT - entry - n * STEP_POINTS');
  expect(referral).toContain('Math.max(FLOOR_FEE_PCT');
 });
});
