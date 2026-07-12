import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * BUG-5 FIX (2026-07-12) — Unified Stripe disconnect for both Integration-backed
 * and legacy StripeConnection rows.
 *
 * Root cause captured empirically:
 *   - Frontend Branch A (`Integration.update`) → RLS "Permission denied for
 *     update operation on Integration entity". Integration.write is
 *     admin-only per schema. Service-owned rows can't be self-disconnected.
 *   - Frontend Branch B (legacy `stripeDisconnect` → invoke) → 500
 *     "Authentication required to view users" from `base44.auth.me()` inside
 *     the function. The reported "404" was actually a 500 in disguise.
 *
 * Design (mirrors the M3-sealed ownership pattern used by
 * computeStripeVerifiedGap / getPaymentsAnalysisVerified):
 *   1. Resolve the caller via `base44.auth.me()` guarded (defensive: some
 *      contexts return null / throw — we treat both as Unauthorized instead
 *      of leaking the underlying 500).
 *   2. Check ownership: caller must be admin OR Brand.contact_email ===
 *      user.email OR Brand.created_by === user.email. This mirrors A2's
 *      resolution model where service-owned brands are still "owned" by the
 *      human via contact_email.
 *   3. Perform the writes with `asServiceRole` — bypasses the admin-only
 *      RLS on Integration.write and StripeConnection.write.
 *   4. Dual-row cleanup: disconnect BOTH the Integration row (if
 *      integration_id given or auto-detected) AND any legacy
 *      StripeConnection rows for the same brand_id. Never leaves the app
 *      in a half-disconnected state.
 *   5. Revoke active Stripe ConsentRecords for the brand (same as legacy).
 *
 * Payload: { brand_id: string, integration_id?: string }
 * Returns: { ok: true, disconnected: { integrations: n, stripe_connections: n, consents: n } }
 *
 * Restrictions honored (heredadas del diagnóstico BUG-5):
 *   - Zero changes to paymentsGap, motor, computeStripeVerifiedGap,
 *     getPaymentsAnalysisVerified, submitPaymentsAnalysis, sync loop,
 *     _tenantGuard, schemas.
 *   - Does NOT delete historical data — keeps audit trail (status flip only).
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Step 1 — Resolve caller (defensively).
    let user;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!user || !user.email) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { brand_id, integration_id } = body || {};

    if (!brand_id) {
      return Response.json({ ok: false, error: 'brand_id required' }, { status: 400 });
    }

    // Step 2 — Ownership check (service-role read; RLS on Brand would hide
    // service-owned rows from the human even though contact_email matches).
    const brand = await base44.asServiceRole.entities.Brand.get(brand_id).catch(() => null);
    if (!brand) {
      return Response.json({ ok: false, error: 'Brand not found' }, { status: 404 });
    }

    const isAdmin = user.role === 'admin';
    const isOwner =
      brand.contact_email === user.email || brand.created_by === user.email;
    if (!isAdmin && !isOwner) {
      return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }

    // Step 3+4 — Dual-row disconnect via service role.
    const counters = { integrations: 0, stripe_connections: 0, consents: 0 };

    // 3a — Integration row(s). If integration_id provided, disconnect it
    // (after verifying it belongs to this brand). Otherwise auto-detect any
    // connected Stripe-family Integration for this brand.
    let integrationsToClose = [];
    if (integration_id) {
      const one = await base44.asServiceRole.entities.Integration
        .get(integration_id).catch(() => null);
      if (one && one.brand_id === brand_id) integrationsToClose.push(one);
    } else {
      const list = await base44.asServiceRole.entities.Integration.filter(
        { brand_id, status: 'connected' }
      ).catch(() => []);
      integrationsToClose = list.filter((i) =>
        i.provider === 'stripe' || i.provider === 'stripe_self' || i.provider === 'stripe_self_test'
      );
    }
    for (const i of integrationsToClose) {
      await base44.asServiceRole.entities.Integration.update(i.id, {
        status: 'disconnected',
        access_token: null,
        refresh_token: null,
      });
      counters.integrations += 1;
    }

    // 3b — Legacy StripeConnection cleanup (dual-row).
    const legacy = await base44.asServiceRole.entities.StripeConnection.filter(
      { brand_id, connection_status: 'connected' }
    ).catch(() => []);
    for (const c of legacy) {
      await base44.asServiceRole.entities.StripeConnection.update(c.id, {
        connection_status: 'disconnected',
      });
      counters.stripe_connections += 1;
    }

    // 3c — Revoke ConsentRecords (best-effort, non-fatal).
    try {
      const consents = await base44.asServiceRole.entities.ConsentRecord.filter(
        { brand_id, provider: 'stripe', status: 'active' }
      );
      const now = new Date().toISOString();
      for (const c of consents) {
        await base44.asServiceRole.entities.ConsentRecord.update(c.id, {
          status: 'revoked',
          revoked_at: now,
        });
        counters.consents += 1;
      }
    } catch { /* consents are optional plumbing — don't fail the disconnect */ }

    return Response.json({ ok: true, disconnected: counters });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});