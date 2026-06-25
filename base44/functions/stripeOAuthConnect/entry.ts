import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M3 — Stripe OAuth Connect
 *
 * Exchanges an OAuth authorization code for a Stripe account connection.
 * READ-ONLY: only read_only scope is requested.
 * NEVER stores raw access tokens — only stripe_account_id + an opaque reference.
 *
 * Payload: { code: string }
 * Returns: { ok, account_id, connection_id } or { ok:false, error, setup_required? }
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const clientId = Deno.env.get('STRIPE_CLIENT_ID');
    const clientSecret = Deno.env.get('STRIPE_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      return Response.json({
        ok: false,
        error: 'Stripe OAuth not configured',
        setup_required: true,
      });
    }

    const body = await req.json().catch(() => ({}));
    const { code } = body;
    if (!code) return Response.json({ ok: false, error: 'Missing code' }, { status: 400 });

    // Resolve user's brand
    const brands = await base44.entities.Brand.list('-created_date', 1).catch(() => []);
    if (!brands.length) {
      return Response.json({ ok: false, error: 'No brand found for user' }, { status: 400 });
    }
    const brandId = brands[0].id;

    // Exchange code for token (Stripe OAuth)
    const tokenRes = await fetch('https://connect.stripe.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_secret: clientSecret,
        code: String(code),
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      return Response.json({
        ok: false,
        error: tokenData.error_description || tokenData.error || 'OAuth exchange failed',
      }, { status: 400 });
    }

    const stripeAccountId = tokenData.stripe_user_id;
    if (!stripeAccountId) {
      return Response.json({ ok: false, error: 'No Stripe account ID returned' }, { status: 400 });
    }

    // Opaque reference — NEVER the raw token
    const accessTokenRef = `stripe_${stripeAccountId}_${Date.now()}`;

    // Persist StripeConnection (service role — admin-write entity)
    const connection = await base44.asServiceRole.entities.StripeConnection.create({
      brand_id: brandId,
      stripe_account_id: stripeAccountId,
      connection_status: 'connected',
      last_sync_at: new Date().toISOString(),
      currency: 'EUR',
      confidence_level: 'connected',
    });

    // Record consent
    await base44.entities.ConsentRecord.create({
      brand_id: brandId,
      provider: 'stripe',
      scope: 'read_only',
      granted_at: new Date().toISOString(),
      status: 'active',
      access_token_ref: accessTokenRef,
      metadata: {
        stripe_account_id: stripeAccountId,
        livemode: !!tokenData.livemode,
      },
    });

    // Immediately sync initial data — non-blocking failure
    try {
      await base44.functions.invoke('stripeDataSync', { brand_id: brandId });
    } catch (_) { /* sync failure is non-fatal at connect time */ }

    return Response.json({
      ok: true,
      account_id: stripeAccountId,
      connection_id: connection.id,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});