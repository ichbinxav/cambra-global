import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { quarantineProbe } from '../../shared/internalGate.ts';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

// Admin-only diagnostic: verifies STRIPE_SECRET_KEY works against the live API
// and that STRIPE_PUBLISHABLE_KEY + STRIPE_WEBHOOK_SECRET are present with
// the expected prefixes. Returns a compact status object — never leaks values.
// [QUARANTINE 2026-08-15] PURGE-2 (2026-07-24): ops diagnostic adjacent to the verified flow — kept with probe.
Deno.serve(async (req) => {
  await quarantineProbe(createClientFromRequest(req), "stripeHealthCheck");
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const secretKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
    const publishableKey = Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '';
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

    const result: Record<string, unknown> = {
      secret_key: {
        present: !!secretKey,
        prefix: secretKey.slice(0, 7),
        mode: secretKey.startsWith('sk_live_') ? 'live' : secretKey.startsWith('sk_test_') ? 'test' : 'unknown',
      },
      publishable_key: {
        present: !!publishableKey,
        prefix: publishableKey.slice(0, 7),
        mode: publishableKey.startsWith('pk_live_') ? 'live' : publishableKey.startsWith('pk_test_') ? 'test' : 'unknown',
      },
      webhook_secret: {
        present: !!webhookSecret,
        valid_prefix: webhookSecret.startsWith('whsec_'),
      },
      api_call: { ok: false },
    };

    // Live call to Stripe to prove the secret key actually works
    if (secretKey) {
      const res = await fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Bearer ${secretKey}` },
      });
      const body = await res.json();
      if (res.ok) {
        result.api_call = {
          ok: true,
          account_id: body.id,
          country: body.country,
          default_currency: body.default_currency,
          charges_enabled: body.charges_enabled,
          payouts_enabled: body.payouts_enabled,
          business_name: body.business_profile?.name || body.settings?.dashboard?.display_name || null,
        };
      } else {
        result.api_call = { ok: false, status: res.status, error: body.error?.message || 'unknown' };
      }
    }

    // Consistency check
    const skMode = (result.secret_key as any).mode;
    const pkMode = (result.publishable_key as any).mode;
    (result as any).modes_match = skMode === pkMode && skMode !== 'unknown';

    return Response.json(result);
  } catch (error) {
    return internalErrorResponse(error, 'stripeHealthCheck');
  }
});