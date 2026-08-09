import { describe,it,expect } from 'vitest';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
describe('Recover Economics V2 integration boundaries',()=>{
 it('grandfathers legacy contracts by discriminating on snapshot version',()=>{
  const approval=read('base44/functions/approveRecoverReportForInvoicing/entry.ts');
  expect(approval).toContain("recovery_economics?.version === RECOVERY_ECONOMICS_V2");
  expect(approval).toContain('monthBillableWindow');
 });
 it('blocks overlapping active recoveries on the same attribution key',()=>{
  const src=read('base44/functions/recordConditionsActivation/entry.ts');
  expect(src).toContain('overlapping_recovery_attribution_required');
  expect(src).toContain("economic_right_status: 'active'");
 });
 it('does not erase an activated recovery when general CAMBRA service is cancelled',()=>{
  const src=read('base44/functions/cancelCambraService/entry.ts');
  expect(src).toContain("economic_right_status==='active'");
  expect(src).toContain('surviving.push(a.id)');
  expect(src).not.toContain("economic_right_status:'waived'");
 });
 it('marks verification missing when Stripe is disconnected instead of estimating savings',()=>{
  const src=read('base44/functions/stripeConnectionDisconnect/entry.ts');
  expect(src).toContain("verification_access_status: 'missing'");
  expect(src).toContain('verification_required_no_estimated_billing');
 });
});

describe('V2 pinned economic contract survival',()=>{
 it('pins the activation-time mandate and billing resolves that exact contract after operational revocation',()=>{
  const activation=read('base44/functions/recordConditionsActivation/entry.ts');
  const helper=read('base44/shared/recoverEconomicMandate.ts');
  const approval=read('base44/functions/approveRecoverReportForInvoicing/entry.ts');
  expect(activation).toContain('recovery_mandate_id: activeMandate.id');
  expect(helper).toContain('activation.recovery_mandate_id');
  expect(helper).toContain("economic_right_status === 'active'");
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
