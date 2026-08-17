import { safeBestEffort } from '../../shared/bestEffort.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { internalErrorResponse } from '../../shared/publicErrors.ts';

/**
 * M6 — buildInfrastructureGraph
 *
 * Builds/updates the InfrastructureGraph for a brand from all signals:
 *   - DiscoveryFindings (status: detected | confirmed)
 *   - DetectedIntegrations (status: connected | verified)
 *   - StripeConnection (M3)
 *   - CompanyMemory (M4)
 *
 * Idempotent: matches nodes by (brand_id, provider_name) — updates instead of duplicates.
 * Edges are matched by (brand_id, from_node_id, to_node_id, relationship).
 *
 * Auth: caller must own the brand (admin bypass).
 * SECURITY: metadata NEVER contains raw credentials/tokens.
 */

// Map DiscoveryFinding.category -> InfrastructureNode.node_type
const CATEGORY_TO_NODE_TYPE = {
  commerce_platform: 'commerce_platform',
  payment_provider:  'payment_provider',
  shipping:          'shipping_carrier',
  marketing:         'marketing',
  analytics:         'analytics',
  support:           'support',
  finance:           'saas_tool',
  hr:                'hr_tool',
  other:             'saas_tool',
};

// Map IntegrationCatalog.category -> InfrastructureNode.node_type
const CATALOG_CAT_TO_NODE_TYPE = {
  commerce:  'commerce_platform',
  payments:  'payment_provider',
  shipping:  'shipping_carrier',
  marketing: 'marketing',
  analytics: 'analytics',
  support:   'support',
  finance:   'saas_tool',
  banking:   'bank',
  hr:        'hr_tool',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Auth: admin, brand owner, OR service role (no user attached → function-to-function call)
    const user = await base44.auth.me().catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:null,severity:'secondary'}));

    const body = await req.json().catch(() => ({}));
    const { brand_id } = body;
    if (!brand_id) {
      return Response.json({ ok: false, error: 'brand_id required' }, { status: 400 });
    }

    // If a real user is attached and is not admin, enforce ownership.
    // No user attached = service-role / function-to-function — allowed.
    if (user) {
      const isAdmin = user.role === 'admin';
      if (!isAdmin) {
        const owned = await base44.entities.Brand.filter({ id: brand_id }).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'}));
        if (!owned.length) {
          return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    const svc = base44.asServiceRole;
    const now = new Date().toISOString();

    // Load all signals (service-role to bypass per-row read variance — we already authorized at brand level)
    const [findings, detected, stripeConns, memories, existingNodes, existingEdges, catalog] = await Promise.all([
      svc.entities.DiscoveryFinding.filter({ brand_id }).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'})),
      svc.entities.DetectedIntegration.filter({ brand_id }).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'})),
      svc.entities.StripeConnection.filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'})),
      svc.entities.CompanyMemory.filter({ brand_id }, '-created_date', 1).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'})),
      svc.entities.InfrastructureNode.filter({ brand_id }).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'})),
      svc.entities.InfrastructureEdge.filter({ brand_id }).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'})),
      svc.entities.IntegrationCatalog.list('priority', 200).catch((error:any)=>safeBestEffort(error,{operation:'buildInfrastructureGraph',fallback:[],severity:'secondary'})),
    ]);

    const catalogById = new Map(catalog.map(c => [c.integration_id, c]));

    // Index existing nodes by normalized provider_name for idempotency
    const norm = (s) => String(s || '').trim().toLowerCase();
    const existingByName = new Map();
    for (const n of existingNodes) {
      existingByName.set(norm(n.provider_name), n);
    }

    let nodes_created = 0;
    let nodes_updated = 0;

    // Helper: upsert node by (brand_id, provider_name)
    const upsertNode = async (incoming) => {
      const key = norm(incoming.provider_name);
      if (!key) return null;
      const existing = existingByName.get(key);

      // SECURITY: strip anything that could look like a credential from metadata
      const meta = { ...(incoming.metadata || {}) };
      for (const k of Object.keys(meta)) {
        if (/token|secret|password|api_?key|credential/i.test(k)) delete meta[k];
      }
      incoming.metadata = meta;

      if (existing) {
        // Merge: prefer higher confidence, stronger data_source
        const sourceRank = { discovery: 1, manual: 2, document: 3, oauth: 4, admin: 5 };
        const useIncomingSource =
          (sourceRank[incoming.data_source] || 0) >= (sourceRank[existing.data_source] || 0);

        const patch = {
          node_type:        incoming.node_type        || existing.node_type,
          integration_id:   incoming.integration_id   || existing.integration_id,
          status:           rankStatus(incoming.status, existing.status),
          confidence_score: Math.max(Number(existing.confidence_score || 0), Number(incoming.confidence_score || 0)),
          monthly_cost:     incoming.monthly_cost ?? existing.monthly_cost,
          cost_confidence:  useIncomingSource ? (incoming.cost_confidence || existing.cost_confidence) : existing.cost_confidence,
          effective_rate:   incoming.effective_rate ?? existing.effective_rate,
          data_source:      useIncomingSource ? (incoming.data_source || existing.data_source) : existing.data_source,
          last_verified_at: now,
          metadata:         { ...(existing.metadata || {}), ...meta },
        };
        await svc.entities.InfrastructureNode.update(existing.id, patch);
        const merged = { ...existing, ...patch };
        existingByName.set(key, merged);
        nodes_updated++;
        return merged;
      } else {
        const created = await svc.entities.InfrastructureNode.create({
          brand_id,
          first_detected_at: now,
          last_verified_at:  now,
          ...incoming,
        });
        existingByName.set(key, created);
        nodes_created++;
        return created;
      }
    };

    // ── 1) From DiscoveryFindings
    for (const f of findings) {
      if (!['detected', 'confirmed'].includes(f.status)) continue;
      const node_type = CATEGORY_TO_NODE_TYPE[f.category] || 'saas_tool';
      await upsertNode({
        node_type,
        provider_name:    f.provider_or_tool,
        status:           'detected',
        confidence_score: Number(f.confidence_score || 0.5),
        data_source:      'discovery',
        cost_confidence:  'estimated',
        metadata:         { evidence_type: f.evidence_type || null },
      });
    }

    // ── 2) From DetectedIntegrations (connected/verified)
    for (const di of detected) {
      if (!['connected', 'verified'].includes(di.status)) continue;
      const cat = catalogById.get(di.integration_id);
      const node_type = (cat && CATALOG_CAT_TO_NODE_TYPE[cat.category]) || 'saas_tool';
      await upsertNode({
        node_type,
        provider_name:    cat?.name || di.integration_id,
        integration_id:   di.integration_id,
        status:           di.status === 'verified' ? 'verified' : 'connected',
        confidence_score: 0.95,
        data_source:      'oauth',
        cost_confidence:  'connected',
      });
    }

    // ── 3) From StripeConnection (M3)
    if (stripeConns.length) {
      const sc = stripeConns[0];
      await upsertNode({
        node_type:        'payment_provider',
        provider_name:    'Stripe',
        integration_id:   'stripe',
        status:           'verified',
        confidence_score: 1.0,
        // AUDIT P2-04 (2026-08-17) — this used to coerce absent Stripe aggregates to 0. The
        // upstream merge at line 121/123 uses `??`, so 0 (which is not nullish) overwrote a
        // previously observed cost while cost_confidence stayed 'verified' — a verified-zero-cost
        // claim on a merchant that does pay Stripe. Propagate null when the aggregate is absent
        // so the ?? merge keeps the existing value, and demote cost_confidence to 'unmeasured'
        // in that case.
        effective_rate:   (sc.effective_fee_pct === null || sc.effective_fee_pct === undefined || sc.effective_fee_pct === '' || !Number.isFinite(Number(sc.effective_fee_pct))) ? null : Number(sc.effective_fee_pct),
        monthly_cost:     (sc.total_fees_monthly === null || sc.total_fees_monthly === undefined || sc.total_fees_monthly === '' || !Number.isFinite(Number(sc.total_fees_monthly))) ? null : Number(sc.total_fees_monthly),
        cost_confidence:  (sc.total_fees_monthly === null || sc.total_fees_monthly === undefined || sc.total_fees_monthly === '' || !Number.isFinite(Number(sc.total_fees_monthly))) ? 'unmeasured' : 'verified',
        data_source:      'oauth',
        metadata:         {
          stripe_account_id: sc.stripe_account_id || null,
          currency:          sc.currency || 'EUR',
          monthly_volume:    sc.monthly_volume || null,
        },
      });
    }

    // ── 4) From CompanyMemory (commerce platform hint)
    if (memories.length) {
      const m = memories[0];
      if (m.commerce_platform_detected) {
        await upsertNode({
          node_type:        'commerce_platform',
          provider_name:    m.commerce_platform_detected,
          status:           'detected',
          confidence_score: 0.7,
          data_source:      'discovery',
          cost_confidence:  'estimated',
        });
      }
    }

    // ── EDGES ─────────────────────────────────────────────
    // Re-read after upserts so we get IDs
    const allNodes = Array.from(existingByName.values());
    const byType = (t) => allNodes.filter(n => n.node_type === t);
    const commerce = byType('commerce_platform')[0];
    const payments = byType('payment_provider');
    const shippers = byType('shipping_carrier');
    const marketers = byType('marketing');

    // Existing edge index for idempotency
    const edgeKey = (from, to, rel) => `${from}|${to}|${rel}`;
    const existingEdgeSet = new Set(
      existingEdges.map(e => edgeKey(e.from_node_id, e.to_node_id, e.relationship))
    );
    let edges_created = 0;

    const addEdge = async (fromNode, toNode, relationship, strength = 0.8) => {
      if (!fromNode || !toNode || fromNode.id === toNode.id) return;
      const k = edgeKey(fromNode.id, toNode.id, relationship);
      if (existingEdgeSet.has(k)) return;
      await svc.entities.InfrastructureEdge.create({
        brand_id,
        from_node_id: fromNode.id,
        to_node_id:   toNode.id,
        relationship,
        strength,
        data_source:  'discovery',
      });
      existingEdgeSet.add(k);
      edges_created++;
    };

    if (commerce) {
      for (const p of payments) await addEdge(commerce, p, 'processes_payments_via', 0.9);
      for (const s of shippers) await addEdge(commerce, s, 'ships_via', 0.8);
      for (const m of marketers) await addEdge(commerce, m, 'markets_via', 0.75);
    }

    return Response.json({ ok: true, nodes_created, nodes_updated, edges_created });
  } catch (error) {
    return internalErrorResponse(error, 'buildInfrastructureGraph');
  }
});

// Status rank — never downgrade an existing node's status
function rankStatus(incoming, existing) {
  const order = { inactive: 0, detected: 1, connected: 2, verified: 3 };
  const a = order[incoming] ?? 0;
  const b = order[existing] ?? 0;
  return a >= b ? (incoming || existing) : (existing || incoming);
}