import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const CONTEXT = read('base44/functions/getRecoverAcceptanceContext/entry.ts');
const START = read('base44/functions/startRecoverAcceptance/entry.ts');
const ACCEPT = read('base44/functions/acceptRecoverMandate/entry.ts');
const PM_START = read('base44/functions/startPaymentMethodSetup/entry.ts');
const PM_REFRESH = read('base44/functions/refreshPaymentMethodStatus/entry.ts');
const PANEL = read('src/components/recover/RecoverMandatePanel.jsx');
const MODAL = read('src/components/recover/RecoverMandateModal.jsx');
const PAYMENT = read('src/components/recover/PaymentMethodSetupCard.jsx');

const rawErrorPattern = /Response\.json\(\{\s*error:\s*(?:error|err|e)(?:\?|\.)?\.message/;

describe('P10 — Recover merchant trust boundary', () => {
  it('resolves the merchant activation server-side and does not browser-read economic rows', () => {
    expect(CONTEXT).toContain("filter({ user_email: user.email }");
    expect(PANEL).toContain('invoke("getRecoverAcceptanceContext", {})');
    expect(PANEL).not.toContain('base44.entities.DealActivation');
  });

  it('does not return raw exceptions from core Recover endpoints', () => {
    for (const source of [CONTEXT, START, ACCEPT, PM_START, PM_REFRESH]) expect(source).not.toMatch(rawErrorPattern);
    expect(PM_START).not.toContain('stripe_customer_failed:');
    expect(PM_START).not.toContain('stripe_setup_intent_failed:');
    expect(PM_REFRESH).not.toContain('stripe_setup_intent_unreadable:');
  });

  it('localizes the Recover shell and never renders backend error strings verbatim', () => {
    expect(PANEL).toContain('recoverUiCopy(lang)');
    expect(MODAL).toContain('recoverUiCopy(lang)');
    expect(PAYMENT).toContain('recoverUiCopy(lang)');
    expect(MODAL).not.toContain('e?.message || "Something went wrong"');
    expect(PAYMENT).not.toContain('stripeError.message');
  });
});
