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
