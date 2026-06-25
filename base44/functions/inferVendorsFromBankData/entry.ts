import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * inferVendorsFromBankData
 *
 * Scans the last 90 days of Stripe charges + balance_transactions for the brand
 * and infers vendor relationships from payment descriptors (e.g. recurring
 * payouts to "KLAVIYO INC" reveal a Klaviyo subscription).
 *
 * For each match:
 *   - Upserts a DiscoveryFinding (evidence_type: "payment_record")
 *   - Upserts an InfrastructureNode (data_source: "stripe_inference",
 *     cost_confidence: "connected", inferred_from_payments: true via metadata)
 *
 * NEVER writes raw card data, customer PII, or full transaction blobs.
 * Stores only matched descriptor strings + aggregated monthly cost.
 *
 * Payload: { brand_id }
 * Returns: { ok, vendors_found: [{ name, category, estimated_monthly_cost }], nodes_created, nodes_updated, reason? }
 */

const ENGINE_VERSION = 'vendor-inference-1.0';

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR_PATTERNS — case-insensitive descriptor matchers grouped by category
// Maps detected vendor name → { patterns, category, node_type }
// ─────────────────────────────────────────────────────────────────────────────
const VENDOR_PATTERNS = [
  // ── Shipping ──
  { name: 'Sendcloud',     category: 'shipping',  node_type: 'shipping_carrier', patterns: ['sendcloud'] },
  { name: 'Packlink',      category: 'shipping',  node_type: 'shipping_carrier', patterns: ['packlink'] },
  { name: 'ShipStation',   category: 'shipping',  node_type: 'shipping_carrier', patterns: ['shipstation'] },
  { name: 'Colissimo',     category: 'shipping',  node_type: 'shipping_carrier', patterns: ['colissimo', 'laposte', 'la poste'] },
  { name: 'Chronopost',    category: 'shipping',  node_type: 'shipping_carrier', patterns: ['chronopost'] },
  { name: 'Mondial Relay', category: 'shipping',  node_type: 'shipping_carrier', patterns: ['mondial relay', 'mondialrelay'] },
  { name: 'DHL',           category: 'shipping',  node_type: 'shipping_carrier', patterns: ['dhl'] },
  { name: 'FedEx',         category: 'shipping',  node_type: 'shipping_carrier', patterns: ['fedex'] },
  { name: 'UPS',           category: 'shipping',  node_type: 'shipping_carrier', patterns: ['united parcel', 'ups.com'] },
  { name: 'GLS',           category: 'shipping',  node_type: 'shipping_carrier', patterns: ['gls-group', 'gls group'] },
  { name: 'DPD',           category: 'shipping',  node_type: 'shipping_carrier', patterns: ['dpd.com'] },
  { name: 'MRW',           category: 'shipping',  node_type: 'shipping_carrier', patterns: ['mrw.es'] },
  { name: 'Byrd',          category: 'logistics', node_type: 'logistics',        patterns: ['getbyrd', 'byrd'] },
  { name: 'Cubyn',         category: 'logistics', node_type: 'logistics',        patterns: ['cubyn'] },
  { name: 'ShipBob',       category: 'logistics', node_type: 'logistics',        patterns: ['shipbob'] },

  // ── Marketing ──
  { name: 'Klaviyo',    category: 'marketing', node_type: 'marketing', patterns: ['klaviyo'] },
  { name: 'Mailchimp',  category: 'marketing', node_type: 'marketing', patterns: ['mailchimp'] },
  { name: 'Brevo',      category: 'marketing', node_type: 'marketing', patterns: ['brevo', 'sendinblue'] },
  { name: 'Attentive',  category: 'marketing', node_type: 'marketing', patterns: ['attentive'] },
  { name: 'Postscript', category: 'marketing', node_type: 'marketing', patterns: ['postscript'] },
  { name: 'Google Ads', category: 'marketing', node_type: 'marketing', patterns: ['google ads', 'googleadservices'] },
  { name: 'Meta Ads',   category: 'marketing', node_type: 'marketing', patterns: ['facebook ads', 'meta ads'] },

  // ── Support ──
  { name: 'Gorgias',   category: 'support', node_type: 'support', patterns: ['gorgias'] },
  { name: 'Zendesk',   category: 'support', node_type: 'support', patterns: ['zendesk'] },
  { name: 'Freshdesk', category: 'support', node_type: 'support', patterns: ['freshdesk', 'freshworks'] },
  { name: 'Intercom',  category: 'support', node_type: 'support', patterns: ['intercom'] },

  // ── HR ──
  { name: 'Factorial', category: 'hr', node_type: 'hr_tool', patterns: ['factorial'] },
  { name: 'Personio',  category: 'hr', node_type: 'hr_tool', patterns: ['personio'] },
  { name: 'Deel',      category: 'hr', node_type: 'hr_tool', patterns: ['letsdeel', 'deel.com'] },

  // ── Telecom ──
  { name: 'Aircall', category: 'telecom', node_type: 'telecom', patterns: ['aircall'] },

  // ── SaaS / Operations ──
  { name: 'Shopify', category: 'saas_tool', node_type: 'commerce_platform', patterns: ['shopify'] },
  { name: 'Notion',  category: 'saas_tool', node_type: 'saas_tool',         patterns: ['notion.so'] },
  { name: 'Slack',   category: 'saas_tool', node_type: 'saas_tool',         patterns: ['slack'] },
  { name: 'Asana',   category: 'saas_tool', node_type: 'saas_tool',         patterns: ['asana'] },
  { name: 'Monday',  category: 'saas_tool', node_type: 'saas_tool',         patterns: ['monday.com'] },

  // ── Banking ──
  { name: 'Qonto',   category: 'banking', node_type: 'bank', patterns: ['qonto'] },
  { name: 'Revolut', category: 'banking', node_type: 'bank', patterns: ['revolut'] },
  { name: 'Wise',    category: 'banking', node_type: 'bank', patterns: ['wise.com', 'transferwise'] },
];

function matchVendor(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const v of VENDOR_PATTERNS) {
    for (const p of v.patterns) {
      if (lower.includes(p)) return v;
    }
  }
  return null;
}

function extractDescriptors(charge) {
  // Combine all candidate fields from a Stripe charge into one search blob.
  const parts = [
    charge.statement_descriptor,
    charge.statement_descriptor_suffix,
    charge.description,
    charge.calculated_statement_descriptor,
    // Metadata can hold vendor names from connected platforms
    ...(charge.metadata ? Object.values(charge.metadata).filter(v => typeof v === 'string') : []),
  ].filter(Boolean);
  return parts.join(' | ');
}

function extractTxnDescriptor(txn) {
  // balance_transactions sometimes have richer descriptions (payouts, transfers)
  const parts = [txn.description, txn.statement_descriptor].filter(Boolean);
  return parts.join(' | ');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: admin / service role / brand owner
    let isServiceRole = false;
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (_) {
      isServiceRole = true;
    }
    if (!isServiceRole && !user) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { brand_id } = body || {};
    if (!brand_id) {
      return Response.json({ ok: false, error: 'brand_id required' }, { status: 400 });
    }

    const isAdmin = user?.role === 'admin';
    if (!isServiceRole && !isAdmin) {
      const owned = await base44.entities.Brand.filter({ created_by: user.email, id: brand_id }).catch(() => []);
      if (!owned.length) {
        return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const svc = base44.asServiceRole;

    // ── 1. Load StripeConnection — required ──
    const connections = await svc.entities.StripeConnection
      .filter({ brand_id, connection_status: 'connected' }, '-last_sync_at', 1)
      .catch(() => []);

    if (!connections.length) {
      return Response.json({
        ok: true,
        vendors_found: [],
        nodes_created: 0,
        nodes_updated: 0,
        reason: 'No payment data available — connect Stripe or your bank first',
      });
    }
    const conn = connections[0];

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return Response.json({
        ok: true,
        vendors_found: [],
        nodes_created: 0,
        nodes_updated: 0,
        reason: 'Stripe not configured (setup_required)',
      });
    }

    // ── 2. Fetch Stripe data — 90d window for matches, 30d for cost estimate ──
    const since90 = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const since30Ms = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const stripeHeaders = {
      'Authorization': `Bearer ${stripeKey}`,
      'Stripe-Account': conn.stripe_account_id,
    };

    // Pull charges (capped 1000)
    const charges = [];
    let startingAfter = null;
    for (let i = 0; i < 10; i++) {
      const params = new URLSearchParams({ limit: '100', 'created[gte]': String(since90) });
      if (startingAfter) params.set('starting_after', startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/charges?${params}`, { headers: stripeHeaders });
      if (!res.ok) break;
      const json = await res.json();
      const items = json.data || [];
      charges.push(...items);
      if (!json.has_more || !items.length) break;
      startingAfter = items[items.length - 1].id;
    }

    // Pull balance_transactions (capped 1000) — payouts/transfers often hold vendor names
    const balanceTxns = [];
    startingAfter = null;
    for (let i = 0; i < 10; i++) {
      const params = new URLSearchParams({ limit: '100', 'created[gte]': String(since90) });
      if (startingAfter) params.set('starting_after', startingAfter);
      const res = await fetch(`https://api.stripe.com/v1/balance_transactions?${params}`, { headers: stripeHeaders });
      if (!res.ok) break;
      const json = await res.json();
      const items = json.data || [];
      balanceTxns.push(...items);
      if (!json.has_more || !items.length) break;
      startingAfter = items[items.length - 1].id;
    }

    // ── 3. Match vendors and aggregate 30d cost ──
    // vendorAgg[vendorName] = { vendor, last30dAmount, sampleDescriptor }
    const vendorAgg = new Map();

    const upsertVendor = (vendor, amountMinor, createdSec, descriptor) => {
      if (!vendor) return;
      const eur = (amountMinor || 0) / 100;
      const isLast30 = (createdSec * 1000) >= since30Ms;
      const cur = vendorAgg.get(vendor.name) || {
        vendor,
        last30dAmount: 0,
        sampleDescriptor: descriptor || vendor.name,
      };
      if (isLast30) cur.last30dAmount += eur;
      if (!cur.sampleDescriptor && descriptor) cur.sampleDescriptor = descriptor;
      vendorAgg.set(vendor.name, cur);
    };

    for (const c of charges) {
      const desc = extractDescriptors(c);
      const v = matchVendor(desc);
      upsertVendor(v, c.amount, c.created, desc.slice(0, 200));
    }
    for (const t of balanceTxns) {
      const desc = extractTxnDescriptor(t);
      const v = matchVendor(desc);
      // balance_transactions use signed amounts — take abs for outgoing fees/payouts
      upsertVendor(v, Math.abs(t.amount || 0), t.created, desc.slice(0, 200));
    }

    // ── 4. Upsert DiscoveryFinding + InfrastructureNode per matched vendor ──
    let nodesCreated = 0;
    let nodesUpdated = 0;
    const vendorsFound = [];
    const nowIso = new Date().toISOString();

    for (const { vendor, last30dAmount, sampleDescriptor } of vendorAgg.values()) {
      const estimatedMonthly = Math.round(last30dAmount * 100) / 100;
      const evidenceValue =
        `Detected as recurring charge in Stripe — ${sampleDescriptor}, ~€${estimatedMonthly}/mo`.slice(0, 500);

      // ── DiscoveryFinding upsert (idempotent on brand_id + category + provider_or_tool) ──
      try {
        const existingFindings = await svc.entities.DiscoveryFinding
          .filter({ brand_id, category: vendor.category, provider_or_tool: vendor.name }, '-created_date', 1)
          .catch(() => []);
        const findingPatch = {
          brand_id,
          category: vendor.category,
          provider_or_tool: vendor.name,
          confidence_score: 0.85,
          evidence_type: 'payment_record',
          evidence_value: evidenceValue,
          detection_method: 'stripe_transaction_scan',
          status: 'detected',
        };
        if (existingFindings.length) {
          await svc.entities.DiscoveryFinding.update(existingFindings[0].id, findingPatch);
        } else {
          await svc.entities.DiscoveryFinding.create({
            ...findingPatch,
            discovery_job_id: `stripe_inference_${conn.id}`,
            created_at: nowIso,
          });
        }
      } catch (e) {
        console.warn('DiscoveryFinding upsert failed for', vendor.name, e?.message || e);
      }

      // ── InfrastructureNode upsert (idempotent on brand_id + provider_name) ──
      try {
        const existingNodes = await svc.entities.InfrastructureNode
          .filter({ brand_id, provider_name: vendor.name }, '-created_date', 1)
          .catch(() => []);

        const nodePatch = {
          brand_id,
          node_type: vendor.node_type,
          provider_name: vendor.name,
          status: 'detected',
          confidence_score: 0.85,
          monthly_cost: estimatedMonthly,
          cost_confidence: 'connected',
          data_source: 'stripe_inference',
          last_verified_at: nowIso,
          metadata: {
            inferred_from: 'stripe_charges',
            estimated_monthly_cost: estimatedMonthly,
            sample_descriptor: sampleDescriptor,
            engine_version: ENGINE_VERSION,
            // inferred_from_payments lives in metadata since it's not a schema field
            inferred_from_payments: true,
          },
        };

        if (existingNodes.length) {
          // Preserve first_detected_at + don't downgrade a verified node
          const ex = existingNodes[0];
          const merged = {
            ...nodePatch,
            // Don't override stronger statuses
            status: ex.status === 'verified' || ex.status === 'connected' ? ex.status : nodePatch.status,
            // Merge metadata
            metadata: { ...(ex.metadata || {}), ...nodePatch.metadata },
          };
          await svc.entities.InfrastructureNode.update(ex.id, merged);
          nodesUpdated++;
        } else {
          await svc.entities.InfrastructureNode.create({
            ...nodePatch,
            first_detected_at: nowIso,
          });
          nodesCreated++;
        }

        vendorsFound.push({
          name: vendor.name,
          category: vendor.category,
          estimated_monthly_cost: estimatedMonthly,
        });
      } catch (e) {
        console.warn('InfrastructureNode upsert failed for', vendor.name, e?.message || e);
      }
    }

    return Response.json({
      ok: true,
      vendors_found: vendorsFound,
      nodes_created: nodesCreated,
      nodes_updated: nodesUpdated,
      engine_version: ENGINE_VERSION,
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});