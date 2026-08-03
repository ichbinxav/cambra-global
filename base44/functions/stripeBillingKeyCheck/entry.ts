// stripeBillingKeyCheck — RECOVER-2 (2026-08-03).
//
// Admin-only diagnostic: proves, per MODE, that the key configured for
// CAMBRA's OWN billing account really belongs to that account
// (acct_1TqFifJw0ka9dDf4). The Stripe account id is identical in test and
// live, so retrieving /v1/account with each key is the decisive check against
// "a key from some other account" (e.g. the Analyzer's test-data environment).
//
// Also reports whether the two webhook signing secrets exist AND differ — a
// single secret shared across modes is a stop criterion for RECOVER-2.
//
// Never returns key values, only prefixes and booleans.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { assertBillingAccount, expectedAccountId } from '../../shared/stripeBilling.ts';
import { getWebhookSecret } from '../../shared/stripeWebhookSecret.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const out: Record<string, unknown> = {};

    for (const mode of ['test', 'live'] as const) {
      const expected = expectedAccountId(mode);
      try {
        const { account_id } = await assertBillingAccount(mode);
        out[mode] = { ok: true, account_id, expected };
      } catch (err) {
        out[mode] = { ok: false, expected, error: (err as Error).message };
      }
    }

    // Webhook signing secrets: report presence per mode and — the actual stop
    // criterion — that the two are not the same value. Values are never returned;
    // sameness is compared in memory only.
    const secrets: Record<string, string | null> = {};
    for (const mode of ['test', 'live'] as const) {
      try {
        secrets[mode] = getWebhookSecret(mode);
      } catch {
        secrets[mode] = null;
      }
    }
    out.webhook_secrets = {
      test_configured: Boolean(secrets.test),
      live_configured: Boolean(secrets.live),
      shared_across_modes: Boolean(secrets.test && secrets.live && secrets.test === secrets.live),
    };

    return Response.json(out);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}