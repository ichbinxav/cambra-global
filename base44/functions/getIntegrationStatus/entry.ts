import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M5 — getIntegrationStatus
 *
 * Returns full integration picture for a brand:
 *   catalog × detected × connected × stripe-inferred → unified `display_status`.
 *
 * Payload: { brand_id? } — falls back to user's latest brand.
 * Returns: { ok, brand_id, grouped: {<category>:[...]}, integrations: [...] }
 *
 * `integrations` (flat) is preserved for backwards compatibility.
 * `grouped` is the new shape: items grouped by category, sorted within each
 * group by display_status priority (connected → detected → available → coming_soon)
 * then by catalog priority ascending.
 */

const STATUS_ORDER = { connected: 0, detected: 1, available: 2, coming_soon: 3 };

// Mapping from IntegrationCatalog.integration_id → expected vendor name in
// InfrastructureNode.provider_name (used by inferVendorsFromBankData).
// Best-effort: matches the canonical lowercase id against a list of likely
// names. If no exact match, we fall back to a case-insensitive name compare.
function nodeMatchesIntegration(node, integration) {
  const providerName = String(node.provider_name || '').toLowerCase().trim();
  const integrationId = String(integration.integration_id || '').toLowerCase().trim();
  const integrationName = String(integration.name || '').toLowerCase().trim();
  if (!providerName) return false;
  return providerName === integrationId
      || providerName === integrationName
      || providerName.replace(/\s+/g, '') === integrationId.replace(/[-_\s]+/g, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let { brand_id } = body;

    if (!brand_id) {
      const brands = await base44.entities.Brand.filter({ created_by: user.email }, '-created_date', 1).catch(() => []);
      brand_id = brands[0]?.id || null;
    }

    // Ownership check (admin bypass)
    const isAdmin = user.role === 'admin';
    if (brand_id && !isAdmin) {
      const owned = await base44.entities.Brand.filter({ created_by: user.email, id: brand_id }).catch(() => []);
      if (!owned.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const svc = base44.asServiceRole;

    // Catalog (publicly readable)
    const catalog = await svc.entities.IntegrationCatalog.list('priority', 100).catch(() => []);

    // Per-brand signals
    // FASE 1 — Integration is the source of truth for "connected"; StripeConnection is legacy fallback.
    const [detected, sessions, stripeConn, stripeIntegrations, infraNodes] = await Promise.all([
      brand_id ? svc.entities.DetectedIntegration.filter({ brand_id }).catch(() => []) : [],
      brand_id ? svc.entities.ConnectionSession.filter({ brand_id }, '-created_date', 200).catch(() => []) : [],
      brand_id ? svc.entities.StripeConnection.filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1).catch(() => []) : [],
      brand_id ? svc.entities.Integration.filter({ brand_id, status: 'connected' }, '-last_sync_at', 50).catch(() => []) : [],
      brand_id ? svc.entities.InfrastructureNode.filter({ brand_id }).catch(() => []) : [],
    ]);
    const stripeIntegrationRow = stripeIntegrations.find(i =>
      i.provider === 'stripe' || i.provider === 'stripe_self' || i.provider === 'stripe_self_test'
    );

    const detectedMap = new Map(detected.map(d => [d.integration_id, d]));
    const latestSessionMap = new Map();
    for (const s of sessions) {
      if (!latestSessionMap.has(s.integration_id)) latestSessionMap.set(s.integration_id, s);
    }

    // Stripe-inferred nodes: data_source === 'stripe_inference'
    const stripeInferredNodes = infraNodes.filter(n => n.data_source === 'stripe_inference');

    const integrations = catalog.map(c => {
      const d = detectedMap.get(c.integration_id);
      const session = latestSessionMap.get(c.integration_id);

      // Stripe live connection (M3)
      // FASE 1 — either the new Integration row OR the legacy StripeConnection counts as connected.
      const directIntegrationRow = stripeIntegrations.find(i => i.provider === c.integration_id) || null;
      const connectionRow = c.integration_id === 'stripe' ? (stripeIntegrationRow || null) : directIntegrationRow;
      const legacyStripeRow = c.integration_id === 'stripe' && !connectionRow ? (stripeConn[0] || null) : null;
      const isStripeConnected = c.integration_id === 'stripe' && (!!legacyStripeRow || !!connectionRow);

      // Stripe-inferred match: did vendor inference detect this catalog item?
      const inferredNode = stripeInferredNodes.find(n => nodeMatchesIntegration(n, c)) || null;
      const inferredFromPayments = !!inferredNode;
      const inferredMonthlyCost = inferredNode?.monthly_cost ?? null;

      let display_status;
      if (isStripeConnected || (d && (d.status === 'connected' || d.status === 'verified'))) {
        display_status = 'connected';
      } else if (d && (d.status === 'detected' || d.status === 'connectable')) {
        display_status = 'detected';
      } else if (inferredFromPayments) {
        // Inferred from Stripe payments counts as "detected" for the UI
        display_status = 'detected';
      } else if (c.status === 'coming_soon' || c.status === 'planned') {
        display_status = 'coming_soon';
      } else {
        display_status = 'available';
      }

      const confidence_score = isStripeConnected
        ? 1.0
        : (d?.confidence_score ?? (inferredFromPayments ? 0.85 : null));

      return {
        integration_id: c.integration_id,
        name: c.name,
        category: c.category,
        // 1.2 — payments-only sub-grouping (online PSP vs in-store TPV).
        // Absent on non-payment rows; ConnectTools defaults missing to 'online'.
        channel: c.channel || null,
        description: c.description || '',
        logo_url: c.logo_url || '',
        auth_type: c.auth_type,
        depth: c.depth,
        catalog_status: c.status,
        priority: c.priority ?? 99,
        value_unlock: c.value_unlock || '',
        docs_url: c.docs_url || '',
        display_status,
        confidence_score,
        detection_source: d?.detection_source || (inferredFromPayments ? 'stripe_inference' : null),
        connected_at: isStripeConnected
          ? (connectionRow?.connected_at || legacyStripeRow?.last_sync_at || null)
          : (connectionRow?.connected_at || d?.connected_at || null),
        // P10: safe operational reference only. Credentials/metadata never leave this function.
        connection_id: connectionRow?.id || legacyStripeRow?.id || null,
        connection_provider: connectionRow?.provider || (legacyStripeRow ? 'stripe_legacy' : null),
        connection_kind: connectionRow ? 'integration' : (legacyStripeRow ? 'stripe_legacy' : null),
        last_sync_at: connectionRow?.last_sync_at || legacyStripeRow?.last_sync_at || null,
        last_verified_at: d?.last_verified_at || inferredNode?.last_verified_at || null,
        latest_session_id: session?.id || null,
        latest_session_status: session?.status || null,
        is_detected: display_status === 'detected',
        is_connected: display_status === 'connected',
        inferred_from_payments: inferredFromPayments,
        inferred_monthly_cost: inferredMonthlyCost,
      };
    });

    // Group by category and sort
    const grouped = {};
    for (const item of integrations) {
      const cat = item.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    }
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => {
        const sa = STATUS_ORDER[a.display_status] ?? 9;
        const sb = STATUS_ORDER[b.display_status] ?? 9;
        if (sa !== sb) return sa - sb;
        return (a.priority ?? 99) - (b.priority ?? 99);
      });
    }

    return Response.json({ ok: true, brand_id, grouped, integrations });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});