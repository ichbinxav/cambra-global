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
    auth_method: "oauth",
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
  demo_apikey_provider: {
    display_name: "Demo API Key Provider",
    category: "shipping",
    logo: null,
    description: "Fictional API-key provider used to verify the api_key path.",
    auth_method: "api_key",
    api_key_header: "X-API-Key",
    api_key_format: "{key}",
    api_key_help_url: "https://demo.example.invalid/account/api-keys",
    api_key_help_text: "Open your Demo Provider dashboard → Account → API Keys, create a read-only key, paste it here.",
    data_type: "shipments",
    data_endpoints: [
      { url: "https://demo.example.invalid/v1/shipments", method: "GET", normalize_as: "shipments" },
    ],
    demo_mode: true,
  },

  // ─── REAL PROVIDERS (Tanda 1: payments OAuth) ────────────────────────────
  // Wiring only — `client_id_env` / `client_secret_env` point to env vars that
  // are NOT set yet. modeStart() returns a clean 503 if they're missing, so
  // the engine tolerates absent secrets until they're pasted.
  stripe: {
    display_name: "Stripe",
    category: "payments",
    logo: null,
    description: "Stripe Connect — read-only access to balance transactions and fees.",
    auth_method: "oauth",
    auth_url: "https://connect.stripe.com/oauth/authorize",
    token_url: "https://connect.stripe.com/oauth/token",
    scopes: ["read_only"],
    client_id_env: "STRIPE_CLIENT_ID",
    client_secret_env: "STRIPE_SECRET_KEY",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.stripe.com/v1/balance_transactions", method: "GET", normalize_as: "transactions" },
    ],
    demo_mode: false,
  },
  mollie: {
    display_name: "Mollie",
    category: "payments",
    logo: null,
    description: "Mollie OAuth — read-only access to payments across organizations.",
    auth_method: "oauth",
    auth_url: "https://my.mollie.com/oauth2/authorize",
    token_url: "https://api.mollie.com/oauth2/tokens",
    scopes: ["organizations.read", "payments.read", "profiles.read"],
    client_id_env: "MOLLIE_CLIENT_ID",
    client_secret_env: "MOLLIE_CLIENT_SECRET",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.mollie.com/v2/payments", method: "GET", normalize_as: "transactions" },
    ],
    demo_mode: false,
  },

  // ─── REAL PROVIDERS (Tanda 2: marketing + payments OAuth) ────────────────
  // Same wiring pattern as Tanda 1 — env vars not set yet, modeStart returns
  // a clean 503 until the credentials are pasted. No engine changes needed.
  klaviyo: {
    display_name: "Klaviyo",
    category: "marketing",
    logo: null,
    // Klaviyo also supports API-key auth as an alternative — if we ever want
    // to expose that path, add a second registry entry "klaviyo_apikey" with
    // auth_method: "api_key". Today we wire OAuth only.
    description: "Klaviyo OAuth — read-only access to accounts, campaigns and metrics. Token endpoint uses a.klaviyo.com (NOT www) per Klaviyo's 2025 requirement.",
    auth_method: "oauth",
    auth_url: "https://www.klaviyo.com/oauth/authorize",
    token_url: "https://a.klaviyo.com/oauth/token",
    scopes: ["accounts:read", "campaigns:read", "metrics:read"],
    client_id_env: "KLAVIYO_CLIENT_ID",
    client_secret_env: "KLAVIYO_CLIENT_SECRET",
    // No "marketing_spend" normalizer exists yet — using "invoices" so the
    // wiring is valid today (the sync engine throws if it can't resolve a
    // normalizer). When we plug Klaviyo for real we add a dedicated
    // `metrics` normalizer and flip data_type/normalize_as here.
    data_type: "invoices",
    data_endpoints: [
      { url: "https://a.klaviyo.com/api/metrics", method: "GET", normalize_as: "invoices" },
    ],
    demo_mode: false,
  },
  paypal: {
    display_name: "PayPal",
    category: "payments",
    logo: null,
    // openid is REQUIRED by PayPal even when you only need reporting reads.
    // The reporting endpoint requires extra approval from PayPal — confirm
    // the exact path when we go live (`/v1/reporting/transactions` is the
    // documented one as of 2025).
    description: "PayPal OAuth — read-only access to transaction reporting. The reporting endpoint may require approval from PayPal; confirm at connect time.",
    auth_method: "oauth",
    auth_url: "https://www.paypal.com/signin/authorize",
    token_url: "https://api-m.paypal.com/v1/oauth2/token",
    scopes: ["openid", "https://uri.paypal.com/services/reporting/search/read"],
    client_id_env: "PAYPAL_CLIENT_ID",
    client_secret_env: "PAYPAL_CLIENT_SECRET",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api-m.paypal.com/v1/reporting/transactions", method: "GET", normalize_as: "transactions" },
    ],
    demo_mode: false,
  },
};

// Generic auth header builder — the registry says how, this function follows.
// No provider name appears anywhere. Adding a new api_key provider means
// adding a registry entry, nothing else.
async function buildAuthHeaders(cfg, integ) {
  const authMethod = cfg.auth_method || "oauth";
  if (authMethod === "oauth") {
    const accessToken = await decryptToken(integ.access_token);
    if (!accessToken) throw new Error("No access token stored");
    return { "Authorization": `Bearer ${accessToken}` };
  }
  if (authMethod === "api_key") {
    const key = await decryptToken(integ.access_token);
    if (!key) throw new Error("No API key stored");
    const header = cfg.api_key_header || "Authorization";
    const format = cfg.api_key_format || "{key}";
    return { [header]: format.replace("{key}", key) };
  }
  throw new Error(`Unsupported auth_method: ${authMethod}`);
}

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

    // Read-only introspection mode: returns the REGISTRY so verifyRegistrySync
    // can compare it against oauthConnector's copy. Never touches integrations
    // or syncs. Admin-only to avoid leaking endpoint URLs.
    if (body?.mode === "describe") {
      if (user.role !== "admin") return Response.json({ ok: false, error: "Admin only" }, { status: 403 });
      return Response.json({ ok: true, registry: REGISTRY, source: "dataSyncAgent" });
    }

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
          const authHeaders = await buildAuthHeaders(cfg, integ);
          const res = await fetch(ep.url, {
            method: ep.method || "GET",
            headers: { ...authHeaders, "Accept": "application/json" },
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