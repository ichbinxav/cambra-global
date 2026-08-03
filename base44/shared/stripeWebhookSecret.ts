// stripeWebhookSecret — RECOVER-2 (2026-08-03).
//
// Signing secrets for the webhook endpoint of CAMBRA's OWN billing account.
// Deliberately NOT in shared/stripeBilling.ts: these secrets do not exist until
// the endpoint is registered in Stripe (which needs the URL, which needs the
// function to exist first), and reading them there would make every importer of
// that module un-runnable in the meantime.
//
// ONE SECRET PER MODE, NEVER SHARED. A single secret across test and live means a
// sandbox event can be replayed as a live one — a shared secret is a stop
// criterion, not a convenience.
//
// NOT the same as the pre-existing STRIPE_WEBHOOK_SECRET, which belongs to the
// read-only OAuth connection to the MERCHANT's Stripe. Different account,
// different relationship, different secret — they must never be interchanged.
import type { StripeMode } from './stripeBilling.ts';

const WEBHOOK_SECRET_ENV: Record<StripeMode, string> = {
  test: 'STRIPE_BILLING_WEBHOOK_SECRET_TEST',
  live: 'STRIPE_BILLING_WEBHOOK_SECRET_LIVE',
};

export function getWebhookSecret(mode: StripeMode): string {
  const envName = WEBHOOK_SECRET_ENV[mode];
  const secret = Deno.env.get(envName) || '';
  if (!secret) throw new Error(`stripe_webhook_secret_missing: ${envName} is not configured`);
  if (!secret.startsWith('whsec_')) {
    throw new Error(`stripe_webhook_secret_invalid: ${envName} does not start with whsec_`);
  }
  return secret;
}