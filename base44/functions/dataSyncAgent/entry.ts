/**
 * dataSyncAgent — Generic data reader (Fase 0)
 * =============================================================================
 * Pulls data from a connected Integration using the endpoints declared in the
 * registry, then normalizes the response into CAMBRA's common spend format.
 *
 * Generic: the engine reads cfg.data_endpoints and cfg.data_type from the
 * REGISTRY constant below. Adding a new provider does not require touching
 * any code in this file — only adding an entry to REGISTRY.
 *
 * Agent OS conventions:
 *   - Creates an AgentTask for this run (visible in the Activity Log)
 *   - Risk level 0 (read-only, no external action with consequences)
 *   - Emits an Event on completion
 *   - Tenant isolation: brand ownership is verified before any work
 *
 * Input:  { integration_id }
 * Output: { ok, agent_task_id, records_count, normalized_sample }
 *
 * Demo mode (registry flag): returns deterministic mock data so the entire
 * pipeline can be exercised without a real provider.
 *
 * ⚠️  REGISTRY DUPLICATION NOTE
 * Deno functions cannot import from sibling functions. The REGISTRY below is
 * duplicated VERBATIM from functions/oauthConnector.js. When adding a
 * provider, edit BOTH FILES in the same change.
 * =============================================================================
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ─── REGISTRY (keep in sync with functions/oauthConnector.js) ──────────────
const REGISTRY = {
  demo_provider: {
    display_name: "Demo Provider",
    category: "payments",
    logo: null,
    description: "Fictional provider used to verify the connector engine.",
    auth_url: "https://demo.example.invalid/oauth/authorize",
    token_url: "https://demo.example.invalid/oauth/token",
    scopes: ["read:transactions", "read:fees"],
    client_id_env: "DEMO_PROVIDER_CLIENT_ID",
    client_secret_env: "DEMO_PROVIDER_CLIENT_SECRET",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://demo.example.invalid/v1/transactions", method: "GET", normalize_as: "transactions" },
    ],
    demo_mode: true,
  },
};

function getProviderConfig(provider) {
  if (!provider || typeof provider !== "string") return null;
  return REGISTRY[provider] || null;
}

// ─── Token decryption (mirrors oauthConnector.js — AES-256-GCM v1) ─────────

function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function getMasterKey() {
  const raw = Deno.env.get("INTEGRATION_TOKEN_KEY");
  if (!raw) throw new Error("INTEGRATION_TOKEN_KEY secret is not set");
  const keyBytes = b64decode(raw);
  if (keyBytes.byteLength !== 32) throw new Error("INTEGRATION_TOKEN_KEY must decode to 32 bytes");
  return await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"]);
}
async function decryptToken(blob) {
  if (!blob || typeof blob !== "string") return null;
  const parts = blob.split(":");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Unsupported token blob format");
  const iv = b64decode(parts[1]);
  const ct = b64decode(parts[2]);
  const key = await getMasterKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ─── Normalizers (by data_type, NOT by provider) ───────────────────────────
const normalizers = {
  transactions: (raw) => {
    const rows = Array.isArray(raw?.transactions) ? raw.transactions : [];
    return rows.map((r) => ({
      vertical: "payments",
      external_id: r.id ?? null,
      amount: Number(r.amount ?? 0),
      fee: Number(r.fee ?? 0),
      currency: r.currency || "EUR",
      occurred_at: r.created_at || null,
    }));
  },
  invoices: (raw) => {
    const rows = Array.isArray(raw?.invoices) ? raw.invoices : [];
    return rows.map((r) => ({
      vertical: "saas",
      external_id: r.id ?? null,
      amount: Number(r.total ?? r.amount ?? 0),
      currency: r.currency || "EUR",
      occurred_at: r.issued_at || r.created_at || null,
    }));
  },
  shipments: (raw) => {
    const rows = Array.isArray(raw?.shipments) ? raw.shipments : [];
    return rows.map((r) => ({
      vertical: "shipping",
      external_id: r.id ?? null,
      amount: Number(r.cost ?? 0),
      currency: r.currency || "EUR",
      occurred_at: r.created_at || null,
    }));
  },
};

function demoMockResponse(dataType) {
  const now = new Date().toISOString();
  if (dataType === "transactions") {
    return {
      transactions: [
        { id: "demo_tx_1", amount: 120.5, fee: 3.65, currency: "EUR", created_at: now },
        { id: "demo_tx_2", amount: 89.0,  fee: 2.71, currency: "EUR", created_at: now },
        { id: "demo_tx_3", amount: 245.9, fee: 7.21, currency: "EUR", created_at: now },
      ],
    };
  }
  if (dataType === "invoices") return { invoices: [{ id: "demo_inv_1", total: 49.0, currency: "EUR", issued_at: now }] };
  if (dataType === "shipments") return { shipments: [{ id: "demo_ship_1", cost: 4.5, currency: "EUR", created_at: now }] };
  return {};
}

async function assertBrandOwnedByUser(base44, brandId, user) {
  if (user.role === "admin") return;
  const brand = await base44.entities.Brand.get(brandId);
  if (!brand) throw new Error("Brand not found");
  if (brand.created_by !== user.email && brand.contact_email !== user.email) {
    throw new Error("This brand does not belong to the current user");
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { integration_id } = body;
    if (!integration_id) {
      return Response.json({ ok: false, error: "integration_id is required" }, { status: 400 });
    }

    const integ = await base44.asServiceRole.entities.Integration.get(integration_id);
    if (!integ) return Response.json({ ok: false, error: "Integration not found" }, { status: 404 });

    await assertBrandOwnedByUser(base44, integ.brand_id, user);

    if (integ.status !== "connected") {
      return Response.json({ ok: false, error: `Integration is ${integ.status}, not connected` }, { status: 400 });
    }

    const cfg = getProviderConfig(integ.provider);
    if (!cfg) return Response.json({ ok: false, error: "Provider not in registry" }, { status: 500 });

    const task = await base44.asServiceRole.entities.AgentTask.create({
      brand_id: integ.brand_id,
      agent_name: "data_sync",
      task_type: "sync_integration_data",
      related_entity_type: "Integration",
      related_entity_id: integ.id,
      status: "running",
      risk_level: 0,
      requires_approval: false,
      input_summary: `Sync ${integ.provider} (${cfg.data_type})`,
      started_at: new Date().toISOString(),
    });

    let allRecords = [];
    const endpoints = cfg.data_endpoints || [];

    try {
      for (const ep of endpoints) {
        let raw;
        if (cfg.demo_mode) {
          raw = demoMockResponse(ep.normalize_as || cfg.data_type);
        } else {
          const accessToken = await decryptToken(integ.access_token);
          if (!accessToken) throw new Error("No access token stored");
          const res = await fetch(ep.url, {
            method: ep.method || "GET",
            headers: { "Authorization": `Bearer ${accessToken}`, "Accept": "application/json" },
          });
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Endpoint ${ep.url} returned ${res.status}: ${text.slice(0, 200)}`);
          }
          raw = await res.json();
        }
        const norm = normalizers[ep.normalize_as || cfg.data_type];
        if (!norm) throw new Error(`No normalizer for data_type=${ep.normalize_as || cfg.data_type}`);
        allRecords = allRecords.concat(norm(raw));
      }

      await base44.asServiceRole.entities.Integration.update(integ.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_error: null,
      });

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: `Synced ${allRecords.length} records from ${integ.provider}`,
        output_payload_json: { records_count: allRecords.length, sample: allRecords.slice(0, 3) },
        completed_at: new Date().toISOString(),
      });

      await base44.asServiceRole.entities.Event.create({
        brand_id: integ.brand_id,
        event_type: "integration.synced",
        source: "data_sync_agent",
        entity_type: "Integration",
        entity_id: integ.id,
        agent_task_id: task.id,
        payload_json: { provider: integ.provider, records_count: allRecords.length, demo_mode: !!cfg.demo_mode },
        status: "processed",
        processed_at: new Date().toISOString(),
      });

      return Response.json({
        ok: true,
        agent_task_id: task.id,
        records_count: allRecords.length,
        normalized_sample: allRecords.slice(0, 5),
        demo_mode: !!cfg.demo_mode,
      });
    } catch (err) {
      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "failed",
        error: err.message,
        completed_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Integration.update(integ.id, {
        last_sync_status: "failed",
        last_error: err.message,
      });
      return Response.json({ ok: false, error: err.message, agent_task_id: task.id }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});