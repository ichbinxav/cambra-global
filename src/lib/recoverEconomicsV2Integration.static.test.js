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
