import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * ⚠️ DEPRECATED — 2026-07-12 (BUG-5 fix).
 *
 * Use `stripeConnectionDisconnect` instead. This endpoint fails empirically
 * with 500 "Authentication required to view users" from `base44.auth.me()`
 * in some caller contexts (the reported "404" was a 500 in disguise) and
 * only covers the legacy StripeConnection row — it never disconnects the
 * Integration-backed row, which is the source of truth post-Fase-1.
 *
 * Kept in place to avoid breaking any external caller that still points
 * at this path. New frontend code (see src/components/connect/
 * StripeConnectCard.jsx handleDisconnect) routes through
 * `stripeConnectionDisconnect`, which uses asServiceRole + the M3 ownership
 * pattern (contact_email OR created_by OR admin) and cleans BOTH rows.
 *
 * M3 — Stripe Disconnect (LEGACY)
 *
 * Marks StripeConnection as disconnected and revokes the ConsentRecord.
 * Does NOT delete historical data — kept for audit.
 *
 * Payload: { brand_id?: string }
 * Returns: { ok: true } or error
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let { brand_id } = body;

    if (!brand_id) {
      const brands = await base44.entities.Brand.list('-created_date', 1).catch(() => []);
      if (!brands.length) return Response.json({ ok: false, error: 'No brand found' }, { status: 400 });
      brand_id = brands[0].id;
    }

    const isAdmin = user.role === 'admin';
    if (!isAdmin) {
      const userBrands = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
      if (!userBrands.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // Disconnect active connections
    const connections = await base44.asServiceRole.entities.StripeConnection.filter(
      { brand_id, connection_status: 'connected' }
    );
    for (const c of connections) {
      await base44.asServiceRole.entities.StripeConnection.update(c.id, {
        connection_status: 'disconnected',
      });
    }

    // Revoke active consents for Stripe
    const consents = await base44.entities.ConsentRecord.filter(
      { brand_id, provider: 'stripe', status: 'active' }
    ).catch(() => []);
    const now = new Date().toISOString();
    for (const c of consents) {
      await base44.entities.ConsentRecord.update(c.id, {
        status: 'revoked',
        revoked_at: now,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});