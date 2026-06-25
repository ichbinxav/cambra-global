import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M5 — getIntegrationStatus
 *
 * Returns full integration picture for a brand:
 *   catalog × detected × connected → unified `display_status`.
 *
 * Payload: { brand_id? } — falls back to user's latest brand.
 * Returns: { ok, integrations: [...] }
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
      brand_id = brands[0]?.id || null;
    }

    // Ownership check (admin bypass)
    const isAdmin = user.role === 'admin';
    if (brand_id && !isAdmin) {
      const owned = await base44.entities.Brand.filter({ id: brand_id }).catch(() => []);
      if (!owned.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    // Catalog (publicly readable)
    const catalog = await base44.asServiceRole.entities.IntegrationCatalog
      .list('priority', 100)
      .catch(() => []);

    // Detected + sessions for this brand
    const detected = brand_id
      ? await base44.asServiceRole.entities.DetectedIntegration.filter({ brand_id }).catch(() => [])
      : [];
    const sessions = brand_id
      ? await base44.asServiceRole.entities.ConnectionSession.filter({ brand_id }, '-created_date', 200).catch(() => [])
      : [];

    // Stripe live connections (M3)
    const stripeConn = brand_id
      ? await base44.asServiceRole.entities.StripeConnection
          .filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1)
          .catch(() => [])
      : [];

    const detectedMap = new Map(detected.map(d => [d.integration_id, d]));
    const latestSessionMap = new Map();
    for (const s of sessions) {
      if (!latestSessionMap.has(s.integration_id)) latestSessionMap.set(s.integration_id, s);
    }

    const integrations = catalog.map(c => {
      const d = detectedMap.get(c.integration_id);
      const session = latestSessionMap.get(c.integration_id);

      // Stripe special-case: live OAuth connection from M3
      const isStripeConnected = c.integration_id === 'stripe' && stripeConn.length > 0;

      let display_status;
      if (isStripeConnected || (d && (d.status === 'connected' || d.status === 'verified'))) {
        display_status = 'connected';
      } else if (d && (d.status === 'detected' || d.status === 'connectable')) {
        display_status = 'detected';
      } else if (c.status === 'coming_soon' || c.status === 'planned') {
        display_status = 'coming_soon';
      } else {
        display_status = 'available';
      }

      return {
        integration_id: c.integration_id,
        name: c.name,
        category: c.category,
        description: c.description || '',
        logo_url: c.logo_url || '',
        auth_type: c.auth_type,
        depth: c.depth,
        catalog_status: c.status,
        priority: c.priority,
        value_unlock: c.value_unlock || '',
        docs_url: c.docs_url || '',
        display_status,
        confidence_score: d?.confidence_score ?? null,
        detection_source: d?.detection_source || null,
        connected_at: isStripeConnected ? stripeConn[0].last_sync_at : (d?.connected_at || null),
        last_verified_at: d?.last_verified_at || null,
        latest_session_id: session?.id || null,
        latest_session_status: session?.status || null,
      };
    });

    return Response.json({ ok: true, brand_id, integrations });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});