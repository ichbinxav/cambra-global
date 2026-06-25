import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * M5 — seedIntegrationCatalog
 *
 * Idempotent admin-only seeder for the IntegrationCatalog.
 * Upserts by integration_id.
 */

const CATALOG = [
  { integration_id: "shopify",       name: "Shopify",       category: "commerce",  auth_type: "oauth",   depth: "deep",     status: "coming_soon", priority: 1,  value_unlock: "Real GMV, orders, AOV, country mix, currency" },
  { integration_id: "stripe",        name: "Stripe",        category: "payments",  auth_type: "oauth",   depth: "deep",     status: "live",        priority: 2,  value_unlock: "Real payment fees, effective rate, disputes" },
  { integration_id: "google_drive",  name: "Google Drive",  category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 3,  value_unlock: "Find invoices and statements automatically" },
  { integration_id: "gmail",         name: "Gmail",         category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 4,  value_unlock: "Find provider invoices in your inbox" },
  { integration_id: "xero",          name: "Xero",          category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 5,  value_unlock: "Recurring costs, SaaS spend, accounting evidence" },
  { integration_id: "pennylane",     name: "Pennylane",     category: "finance",   auth_type: "oauth",   depth: "standard", status: "coming_soon", priority: 6,  value_unlock: "Recurring costs and accounting evidence" },
  { integration_id: "sendcloud",     name: "Sendcloud",     category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 7,  value_unlock: "Real shipping costs, carriers, destinations" },
  { integration_id: "shipstation",   name: "ShipStation",   category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 8,  value_unlock: "Shipping costs and carrier performance" },
  { integration_id: "packlink",      name: "Packlink",      category: "shipping",  auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 9,  value_unlock: "Shipping rates and label costs" },
  { integration_id: "klaviyo",       name: "Klaviyo",       category: "marketing", auth_type: "api_key", depth: "standard", status: "coming_soon", priority: 10, value_unlock: "Email marketing spend and contact tier" },
  { integration_id: "quickbooks",    name: "QuickBooks",    category: "finance",   auth_type: "oauth",   depth: "standard", status: "planned",     priority: 11, value_unlock: "Accounting and recurring cost evidence" },
  { integration_id: "gorgias",       name: "Gorgias",       category: "support",   auth_type: "api_key", depth: "standard", status: "planned",     priority: 12, value_unlock: "Support tooling cost benchmark" },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });

    let seeded = 0;
    for (const entry of CATALOG) {
      const existing = await base44.asServiceRole.entities.IntegrationCatalog
        .filter({ integration_id: entry.integration_id }, '-created_date', 1)
        .catch(() => []);
      if (existing.length) {
        await base44.asServiceRole.entities.IntegrationCatalog.update(existing[0].id, entry);
      } else {
        await base44.asServiceRole.entities.IntegrationCatalog.create(entry);
      }
      seeded++;
    }

    return Response.json({ ok: true, seeded });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});