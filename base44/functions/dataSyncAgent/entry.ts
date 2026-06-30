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
  // Mirror of demo_basicauth_provider — same contract, both files identical.
  demo_basicauth_provider: {
    display_name: "Demo Basic Auth Provider",
    category: "shipping",
    logo: null,
    description: "Fictional Basic-Auth provider used to verify the basic_auth path.",
    auth_method: "basic_auth",
    basic_auth_help_url: "https://demo.example.invalid/account/api-keys",
    basic_auth_help_text: "Generate a public/secret key pair, paste both here.",
    basic_auth_user_label: "Public key",
    basic_auth_pass_label: "Secret key",
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
      { url: "https://api.stripe.com/v1/balance_transactions", method: "GET", normalize_as: "stripe_transactions" },
    ],
    demo_mode: false,
  },
  mollie: {
    display_name: "Mollie",
    category: "payments",
    logo: null,
    // Endpoint pivot (docs): Mollie's /v2/payments does NOT carry fee data.
    // Fees are aggregated per payment method inside /v2/settlements.costs[].
    // The mollie_settlements normalizer emits one row per method per settlement.
    // settlements.read scope is required for the new endpoint. payments.read
    // stays for when we add a second endpoint that reads individual payments
    // (refunds, disputes) — kept on purpose, not orphan.
    description: "Mollie OAuth — read-only access to settlements (per-method fee breakdown) and organizations. Per-payment data lives in a separate endpoint we may add later.",
    auth_method: "oauth",
    auth_url: "https://my.mollie.com/oauth2/authorize",
    token_url: "https://api.mollie.com/oauth2/tokens",
    scopes: ["organizations.read", "payments.read", "profiles.read", "settlements.read"],
    client_id_env: "MOLLIE_CLIENT_ID",
    client_secret_env: "MOLLIE_CLIENT_SECRET",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.mollie.com/v2/settlements", method: "GET", normalize_as: "mollie_settlements" },
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
      { url: "https://api-m.paypal.com/v1/reporting/transactions", method: "GET", normalize_as: "paypal_transactions" },
    ],
    demo_mode: false,
  },

  // ─── REAL PROVIDERS (Tanda 3: commerce OAuth — per-shop) ─────────────────
  // Shopify's OAuth URLs include the customer's shop handle as a subdomain:
  // {shop}.myshopify.com. The engine interpolates {shop} at runtime using a
  // generic helper (interpolateShopDomain) — there is NO hardcoded provider
  // name. Any future provider with the same pattern just needs
  // `requires_shop_domain: true` and `{shop}` tokens in its URLs.
  shopify: {
    display_name: "Shopify",
    category: "commerce",
    logo: null,
    description: "Shopify OAuth — read-only access to orders and products. Auth URLs are per-shop ({shop}.myshopify.com); the customer provides their shop handle at connect time. Note: no dedicated `orders` normalizer exists yet — data_type is set to `transactions` so the wiring is valid today; replace with an `orders` normalizer before going live.",
    auth_method: "oauth",
    auth_url: "https://{shop}.myshopify.com/admin/oauth/authorize",
    token_url: "https://{shop}.myshopify.com/admin/oauth/access_token",
    scopes: ["read_orders", "read_products"],
    client_id_env: "SHOPIFY_CLIENT_ID",
    client_secret_env: "SHOPIFY_CLIENT_SECRET",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://{shop}.myshopify.com/admin/api/2024-01/orders.json", method: "GET", normalize_as: "shopify_orders" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
  },

  // Mirror of pennylane — same contract, both files identical.
  pennylane: {
    display_name: "Pennylane",
    category: "accounting",
    logo: null,
    description: "Pennylane OAuth (RTR) — read-only access to customer/supplier invoices and companies. Pennylane rotates refresh tokens; the engine handles that generically in modeRefresh. Endpoint paths and scopes confirmed against Pennylane docs but verify at first real connect.",
    auth_method: "oauth",
    auth_url: "https://app.pennylane.com/oauth/authorize",
    token_url: "https://app.pennylane.com/oauth/token",
    scopes: ["customer_invoices:readonly", "supplier_invoices:readonly", "companies:readonly"],
    client_id_env: "PENNYLANE_CLIENT_ID",
    client_secret_env: "PENNYLANE_CLIENT_SECRET",
    data_type: "invoices",
    data_endpoints: [
      { url: "https://app.pennylane.com/api/external/v2/customer_invoices", method: "GET", normalize_as: "pennylane_invoices" },
      { url: "https://app.pennylane.com/api/external/v2/supplier_invoices", method: "GET", normalize_as: "pennylane_supplier_invoices" },
    ],
    demo_mode: false,
  },

  // Mirror of sendcloud — same contract, both files identical.
  sendcloud: {
    display_name: "Sendcloud",
    category: "shipping",
    logo: null,
    description: "Sendcloud — HTTP Basic Auth with a public+secret key pair. Aggregates 80+ carriers. Note: no dedicated parcels normalizer yet — uses the generic shipments normalizer; replace before going live.",
    auth_method: "basic_auth",
    basic_auth_help_url: "https://panel.sendcloud.sc/integrations/sendcloud-api",
    basic_auth_help_text: "Settings → Integrations → Sendcloud API → generate Public + Secret key.",
    basic_auth_user_label: "Public key",
    basic_auth_pass_label: "Secret key",
    data_type: "shipments",
    data_endpoints: [
      { url: "https://panel.sendcloud.sc/api/v3/shipments", method: "GET", normalize_as: "sendcloud_shipments" },
    ],
    demo_mode: false,
  },
};

// Per-shop URL interpolation (generic, no provider names). Mirrors the helper
// in oauthConnector — same contract: if the URL has no {shop}, returns it
// unchanged; if it does, requires a non-empty shop value and throws otherwise.
function interpolateShopDomain(url, shop) {
  if (!url || typeof url !== "string" || !url.includes("{shop}")) return url;
  if (!shop) throw new Error("shop_domain is required to interpolate {shop} in this URL");
  return url.replaceAll("{shop}", shop);
}

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
  if (authMethod === "basic_auth") {
    // Stored as a single encrypted blob in the form "public:secret" — exactly
    // the wire format Basic Auth expects before base64 encoding. We decrypt
    // ONCE and emit "Authorization: Basic " + base64(public:secret). Generic:
    // no provider name appears here; the registry dictates the auth_method.
    // btoa() is safe for ASCII (all real basic_auth keys are ASCII); we keep
    // the same encoding path the rest of the engine already trusts.
    const combined = await decryptToken(integ.access_token);
    if (!combined || !combined.includes(":")) {
      throw new Error("No valid basic_auth credentials stored");
    }
    return { "Authorization": `Basic ${btoa(combined)}` };
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
  // ─── stripe_transactions ────────────────────────────────────────────────
  // FIRST real normalizer (the others above are placeholders).
  //
  // Translates ONE form: Stripe's GET /v1/balance_transactions response.
  //   { object: "list", data: [ {id, amount, fee, net, currency, created, ...} ], has_more }
  //
  // CAMBRA "rule of gold": a normalizer TRANSLATES form, it never invents or
  // calculates values. Every output field comes 1:1 from an input field
  // (modulo unit conversion: cents→units, UNIX→ISO, lowercase→uppercase).
  //
  // Unit conventions translated:
  //   - amount/fee/net: Stripe gives cents (smallest currency unit) → divide by 100
  //   - currency: Stripe gives lowercase "eur" → uppercase "EUR"
  //   - created: Stripe gives UNIX seconds → ISO string
  //   - type: prefer `reporting_category` (Stripe's curated taxonomy) over raw `type`
  //
  // Robustness:
  //   - raw not an object, or raw.data not an array → returns []
  //   - missing numeric fields → coerced to 0 via `?? 0` (then /100 = 0)
  //   - missing string/timestamp fields → null
  //   - never throws on shape; the worst case is an empty list
  //
  // PAGINATION (deferred): Stripe responses carry `has_more: true` + we'd need
  // to re-fetch with `?starting_after=<last_id>`. The engine today only sees
  // page 1. Implement full pagination when we wire Stripe with real credentials
  // (motor change in dataSyncAgent's sync loop, not in this normalizer).
  // ─── pennylane_supplier_invoices ────────────────────────────────────────
  // SEVENTH real normalizer. Twin of `pennylane_invoices`, with two
  // additions that justify a separate row type:
  //
  //   - `supplier_name`: WHO the brand pays (Klaviyo, EDF, carrier, SaaS
  //     vendor, …). This is the field that makes this endpoint valuable —
  //     it's where the long tail of infra spend lives. If a supplier
  //     invoice arrives without a supplier_name we propagate null (do NOT
  //     invent a name); downstream decides whether to flag it.
  //
  //   - `direction: "expense"`: marks the row as a brand EXPENSE, not
  //     revenue. Contract for the cerebro reading `vertical: "accounting"`:
  //       · customer_invoices rows → no `direction` field → revenue by
  //         default (already in production; we do NOT retro-edit them in
  //         this turn).
  //       · supplier_invoices rows → `direction: "expense"` explicit.
  //     Asymmetry is intentional: keeps the customer normalizer untouched
  //     (the "do not touch the 6 previous normalizers" guarantee) and the
  //     read contract is documented here.
  //
  // Everything else mirrors `pennylane_invoices` 1:1:
  //   - reads `items[]` only (NO fallback to `data[]`)
  //   - STRING amounts → parseFloat via toNum
  //   - `fee: 0` honest (an invoice is not a fee)
  //   - `date` preserved as-is (date-only, no invented UTC)
  //   - skip invoices without `id`
  //
  // ⚠️  DEUDA ANOTADA:
  //   (a) Written from docs; verify field paths on first real connect.
  //   (b) Cursor pagination + 2-4 req/s rate limits — sync engine's job.
  //   (c) This endpoint is the CORE of the 3-source spend model — it
  //       captures the long tail of infra spend (SaaS, marketing, carrier,
  //       energy, ...). When wiring Pennylane for real, this is the
  //       endpoint that delivers the most CAMBRA value per call.
  //
  // CAMBRA "rule of gold" holds: every output field comes 1:1 from input.
  pennylane_supplier_invoices: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const rows = [];
    for (const invoice of items) {
      if (!invoice || typeof invoice !== "object") continue;
      const id = invoice?.id;
      if (id === null || id === undefined) continue; // skip invoices without id
      const currency = invoice?.currency || "EUR";
      const occurredAt = typeof invoice?.date === "string" ? invoice.date : null;
      rows.push({
        vertical: "accounting",
        direction: "expense", // marks this row as a brand EXPENSE
        external_id: String(id),
        supplier_name: invoice?.supplier_name ?? null,
        invoice_number: invoice?.invoice_number ?? null,
        amount: toNum(invoice?.currency_amount),
        amount_before_tax: toNum(invoice?.currency_amount_before_tax),
        tax: toNum(invoice?.currency_tax),
        fee: 0, // A supplier invoice is an expense, not a fee.
        currency,
        status: invoice?.status ?? null,
        occurred_at: occurredAt,
      });
    }
    return rows;
  },
  // ─── pennylane_invoices ─────────────────────────────────────────────────
  // SIXTH real normalizer. Translates Pennylane API v2:
  //   GET /api/external/v2/customer_invoices
  //   { items: [ { id, invoice_number, status, currency, currency_amount,
  //                currency_amount_before_tax, currency_tax, date } ],
  //     has_more, next_cursor }
  //
  // Pennylane-specific quirk: data lives in `items[]`, NOT `data[]` or the
  // root. Each normalizer in the engine has its own root key — Stripe `data`,
  // Mollie `_embedded.settlements`, PayPal `transaction_details`, Shopify
  // `orders`, Sendcloud `data`, Pennylane `items`. No defensive fallback —
  // if the payload doesn't carry `items`, we emit []. The docs are explicit;
  // adding a fallback would invent robustness against a case that shouldn't
  // exist.
  //
  // Vertical: "accounting" — fourth vertical in the engine.
  //   A customer invoice is GROSS REVENUE (what the brand bills to its
  //   clients), not a fee or a sale. The cerebro must treat this row as
  //   revenue, not as a comisión. `fee: 0` is enforced as invariant — same
  //   honest-absence pattern as Shopify (storefront != processor) and
  //   Sendcloud (shipments list != carrier rate).
  //
  // Amount handling:
  //   - `amount` = `currency_amount` (total WITH tax) — the as-billed line.
  //   - `amount_before_tax` and `tax` propagated 1:1 as separate fields, so
  //     downstream can reconstruct net/gross without us choosing for them.
  //   - All three are STRINGS in Pennylane ("180.00") → parseFloat. Same
  //     pattern as Mollie/Shopify/PayPal/Sendcloud.
  //
  // Date handling:
  //   - `date` arrives as date-only ("2025-10-01"), no time, no timezone.
  //   - Preserved AS-IS. We do NOT promote to ISO with "T00:00:00Z" because
  //     that would invent a UTC timezone the source never specified, and
  //     change the type of the field versus input. The cerebro decides how
  //     to interpret it.
  //
  // Items skipped:
  //   - invoice without `id` → skipped (same pattern as Shopify/PayPal).
  //
  // ⚠️  DEUDA ANOTADA:
  //   (a) We wire customer_invoices (REVENUE billed to brand's clients).
  //       For the brand's EXPENSES (where CAMBRA's infra costs live), add
  //       a second endpoint `supplier_invoices` with a dedicated
  //       `pennylane_supplier_invoices` normalizer. The scope is already
  //       declared in the registry.
  //   (b) Cursor pagination (`has_more` / `next_cursor`) + rate limits
  //       (2-4 req/s) — sync engine job, not this normalizer's.
  //   (c) Written from public docs; verify field paths at first real connect.
  //   (d) `companies:readonly` scope format is assumed by analogy with the
  //       customer/supplier ones; if Pennylane uses a different format for
  //       companies, correct at first connect.
  //
  // CAMBRA "rule of gold" holds: every output field comes 1:1 from input.
  pennylane_invoices: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const items = Array.isArray(raw?.items) ? raw.items : [];
    const rows = [];
    for (const invoice of items) {
      if (!invoice || typeof invoice !== "object") continue;
      const id = invoice?.id;
      if (id === null || id === undefined) continue; // skip invoices without id
      const currency = invoice?.currency || "EUR";
      const occurredAt = typeof invoice?.date === "string" ? invoice.date : null;
      rows.push({
        vertical: "accounting",
        external_id: String(id),
        invoice_number: invoice?.invoice_number ?? null,
        amount: toNum(invoice?.currency_amount),
        amount_before_tax: toNum(invoice?.currency_amount_before_tax),
        tax: toNum(invoice?.currency_tax),
        fee: 0, // A customer invoice is revenue, not a fee.
        currency,
        status: invoice?.status ?? null,
        occurred_at: occurredAt,
      });
    }
    return rows;
  },
  // ─── sendcloud_shipments ────────────────────────────────────────────────
  // FIFTH real normalizer. Translates Sendcloud REST API v3:
  //   GET https://panel.sendcloud.sc/api/v3/shipments
  //   { data: [ { id, order_number, total_order_price: {currency, value},
  //               parcels: [ { id, status, weight, created_at, ... } ] } ] }
  //
  // CRITICAL distinction from the 4 previous normalizers:
  //   - Stripe/Mollie/PayPal mapped FEES, Shopify mapped GMV.
  //   - Sendcloud maps SHIPPING VOLUME (weight, count, dates) — vertical:
  //     "shipping". The REAL carrier rate (what the brand pays to ship) does
  //     NOT live in this endpoint; it comes from the separate
  //     `shipping-options/rates` endpoint we'll add later. So `cost: 0` here
  //     is HONEST ABSENCE — same pattern as Shopify's `fee: 0`. Downstream
  //     code must NOT treat this as a real shipping cost.
  //
  // Granularity: ONE ROW PER PARCEL, not per shipment.
  //   In logistics the unit of cost is the physical parcel (weight,
  //   dimensions, per-parcel carrier rate). A shipment with 3 parcels emits
  //   3 rows. When we wire the rates endpoint, those rates also come
  //   per-parcel — granularities will match. Repeating `order_price` on each
  //   parcel of the same shipment is 1:1 input passthrough (the field exists
  //   on the shipment, each child preserves it as context). It MUST NOT be
  //   summed at portfolio level without de-duplicating by `shipment_id`.
  //
  // Translations:
  //   - amounts: strings → parseFloat (already in units, no /100)
  //   - weight: parsed via toNum, weight_unit propagated as-is (kg/g/lb)
  //   - dates: ISO preserved as-is
  //   - external_id: shipment.id + ":" + parcel.id (same compound pattern as
  //     Mollie "settlement:method" and PayPal "tx:date" — gives context
  //     without a join)
  //
  // Items skipped:
  //   - shipment without `parcels` array → emits nothing for that shipment
  //   - parcel without `id` → skipped (same pattern as PayPal/Shopify)
  //
  // ⚠️  DEUDA ANOTADA:
  //   (a) Carrier rate (real shipping cost) lives in /shipping-options/rates,
  //       a second endpoint to add when we wire Sendcloud for real. This
  //       endpoint gives volume/weight, NOT cost. `cost: 0` is enforced as
  //       an invariant.
  //   (b) v3 pagination is cursor-based (base64), different from v2's offset.
  //       That's the sync engine's job, not this normalizer's.
  //   (c) Written from v3 docs; verify field paths on first real connect.
  //
  // CAMBRA "rule of gold" holds: every output field comes 1:1 from input.
  sendcloud_shipments: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const shipments = Array.isArray(raw?.data) ? raw.data : [];
    const rows = [];
    for (const shipment of shipments) {
      if (!shipment || typeof shipment !== "object") continue;
      const parcels = Array.isArray(shipment?.parcels) ? shipment.parcels : null;
      if (!parcels) continue; // skip shipments with no parcels array
      const shipmentId = shipment?.id ?? null;
      const orderNumber = shipment?.order_number ?? null;
      const orderPrice = toNum(shipment?.total_order_price?.value);
      const currency = shipment?.total_order_price?.currency || "EUR";
      for (const parcel of parcels) {
        if (!parcel || typeof parcel !== "object") continue;
        const parcelId = parcel?.id;
        if (parcelId === null || parcelId === undefined) continue; // skip parcels without id
        const externalId = shipmentId !== null
          ? `${shipmentId}:${parcelId}`
          : String(parcelId);
        const occurredAt = typeof parcel?.created_at === "string" ? parcel.created_at : null;
        rows.push({
          vertical: "shipping",
          external_id: externalId,
          shipment_id: shipmentId,
          order_number: orderNumber,
          weight: toNum(parcel?.weight?.value),
          weight_unit: parcel?.weight?.unit ?? null,
          order_price: orderPrice,
          cost: 0, // Real carrier rate lives in /shipping-options/rates, not here.
          currency,
          status: parcel?.status?.code ?? null,
          tracking_number: parcel?.tracking_number ?? null,
          occurred_at: occurredAt,
        });
      }
    }
    return rows;
  },
  // ─── shopify_orders ─────────────────────────────────────────────────────
  // FOURTH real normalizer. Translates Shopify REST Admin orders.json:
  //   GET /admin/api/2024-01/orders.json
  //   { orders: [ { id, total_price, total_price_set, currency, created_at,
  //                 financial_status, ... } ] }
  //
  // CRITICAL distinction from the 3 previous normalizers:
  //   - Stripe/Mollie/PayPal mapped FEES (vertical: "payments").
  //   - Shopify maps GMV / SALES VOLUME (vertical: "commerce").
  //   Shopify is the storefront, not the processor. There is NO transaction
  //   fee in this payload. Emitting fee: 0 here is HONEST ABSENCE, not an
  //   invented value — downstream code must NOT treat this as a real fee.
  //
  // Money source robustness (two forms, both 1:1 from input — form navigation,
  // not value invention):
  //   - Flat field: order.total_price ("270.37")
  //   - Money object: order.total_price_set.shop_money.amount ("270.37")
  //   We prefer the flat field; if missing or NaN, we fall back to the money
  //   object. Same defensive pattern as Mollie's `costs` probe.
  //
  // Translations:
  //   - amounts: strings → parseFloat (already in units, no /100)
  //   - dates:   ISO strings → preserved as-is
  //   - currency: order.currency → total_price_set.shop_money.currency_code → "EUR"
  //   - financial_status preserved 1:1 (paid/refunded/voided) for downstream
  //     filtering of net GMV.
  //
  // Items without `id` are SKIPPED (same pattern as PayPal items without
  // transaction_info) — an order without an id translates to nothing useful.
  //
  // ⚠️  DEUDA GRANDE (more uncertain than the others):
  //   (a) REST Admin API is LEGACY as of Oct 2024. Shopify pushes GraphQL
  //       Admin API. This normalizer may need a sibling `shopify_orders_gql`
  //       and a sync engine change (different request shape, cursor-based
  //       pagination via `pageInfo.endCursor`).
  //   (b) Without `read_all_orders` scope, REST returns ONLY the last 60 days
  //       of orders. Extended access requires Shopify approval.
  //   (c) Pagination is cursor-based via the `Link` HTTP header
  //       (`<...&page_info=XYZ>; rel="next"`). That's the sync engine's job,
  //       not this normalizer's.
  //   (d) `data_type` in the registry is still "transactions" (the bucket
  //       used by getProviderConfig). When CAMBRA introduces a formal
  //       "orders" / "commerce" data_type, flip it here too.
  //
  // CAMBRA "rule of gold" holds: every output field comes 1:1 from input.
  shopify_orders: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // Prefer flat total_price; fall back to total_price_set.shop_money.amount.
    // Returns 0 if both are absent/unparseable. NEVER invents a value.
    const pickAmount = (order) => {
      const flat = toNum(order?.total_price, null);
      if (flat !== null) return flat;
      return toNum(order?.total_price_set?.shop_money?.amount, 0);
    };
    const orders = Array.isArray(raw?.orders) ? raw.orders : [];
    const rows = [];
    for (const order of orders) {
      if (!order || typeof order !== "object") continue;
      const id = order?.id;
      if (id === null || id === undefined) continue; // skip items without id
      const currency = order?.currency
        || order?.total_price_set?.shop_money?.currency_code
        || "EUR";
      const occurredAt = typeof order?.created_at === "string" ? order.created_at : null;
      rows.push({
        vertical: "commerce",
        external_id: String(id),
        amount: pickAmount(order),
        subtotal: toNum(order?.subtotal_price),
        tax: toNum(order?.total_tax),
        discounts: toNum(order?.total_discounts),
        fee: 0, // Shopify-as-storefront does not charge per-transaction fee.
        currency,
        occurred_at: occurredAt,
        financial_status: order?.financial_status ?? null,
      });
    }
    return rows;
  },
  // ─── paypal_transactions ────────────────────────────────────────────────
  // THIRD real normalizer. Translates PayPal Transaction Search API response:
  //   GET /v1/reporting/transactions
  //   { transaction_details: [ { transaction_info: {...} } ], total_pages, page }
  //
  // PayPal-specific quirks translated (CAMBRA "rule of gold" still holds —
  // every output field comes 1:1 from input, modulo unit normalization):
  //   - Money objects: { currency_code, value: "465.00" } → parseFloat
  //   - fee_amount.value comes NEGATIVE ("-13.79") because PayPal models it
  //     as a debit. CAMBRA models `fee` as a positive cost (consistent with
  //     Stripe/Mollie). We Math.abs() to flip sign. This is a convention
  //     translation, not value invention — same magnitude, sign normalized.
  //   - Dates are already ISO (transaction_initiation_date), no conversion.
  //   - external_id = transaction_id + ":" + date — same transaction_id may
  //     appear on multiple pages with different event codes (auth/capture/
  //     refund), so the date pins the specific event.
  //   - fee_amount may be ABSENT for fee-free transactions → fee 0.
  //   - Items missing `transaction_info` are SKIPPED (not emitted as zero
  //     rows) — an empty item translates to nothing.
  //
  // PAGINATION (deferred): response carries `total_pages` and `page`. Full
  // pagination is the sync engine's job, not this normalizer's.
  //
  // ⚠️ DEUDA EXPLÍCITA: written from docs + official example, not from a real
  // payload. The Transaction Search API also requires PayPal approval to
  // enable. Verify field paths and sign conventions on first real connect.
  paypal_transactions: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const items = Array.isArray(raw?.transaction_details) ? raw.transaction_details : [];
    const rows = [];
    for (const item of items) {
      const info = item?.transaction_info;
      if (!info || typeof info !== "object") continue; // skip items with no payload
      const txId = info?.transaction_id ?? null;
      const date = typeof info?.transaction_initiation_date === "string"
        ? info.transaction_initiation_date
        : null;
      const externalId = txId
        ? (date ? `${txId}:${date}` : txId)
        : null;
      const currency = info?.transaction_amount?.currency_code || "EUR";
      // Sign normalization: PayPal emits fee as negative; CAMBRA models fee≥0.
      const feeRaw = toNum(info?.fee_amount?.value);
      const fee = Math.abs(feeRaw);
      rows.push({
        vertical: "payments",
        external_id: externalId,
        amount: toNum(info?.transaction_amount?.value),
        fee,
        currency,
        occurred_at: date,
        type: info?.transaction_event_code ?? null,
      });
    }
    return rows;
  },
  // ─── mollie_settlements ─────────────────────────────────────────────────
  // SECOND real normalizer. Translates Mollie's GET /v2/settlements response.
  //
  // Why this endpoint and not /v2/payments:
  //   Mollie's Payment object does NOT carry the fee. The fee lives in the
  //   Settlements API, AGGREGATED BY PAYMENT METHOD inside a `costs[]` array.
  //   So one settlement => N normalized rows (one per method: iDEAL, PayPal,
  //   creditcard, etc.). This per-method breakdown is exactly what CAMBRA
  //   benchmarks against — keeping it as separate rows preserves that signal.
  //
  // ⚠️  DEUDA EXPLÍCITA (verificar con un settlement REAL al conectar Mollie):
  //   - This was written from PUBLIC DOCS, not from a real payload.
  //   - The exact nesting of `periods` is documented but can shift by API
  //     version: it may be { "2024": { "07": { costs: [...] } } } (year→month),
  //     or sometimes flat `{ periods: [...] }`, or `costs` may appear at the
  //     settlement root for some account types. We probe defensively but the
  //     real shape might still surprise us. When the first real settlement
  //     arrives, walk it manually and tighten or relax the probe.
  //   - `amount.net/vat/gross` are strings in docs (e.g. "12.7600") — we
  //     parseFloat them. If Mollie ever returns numeric (some API versions do),
  //     parseFloat on a number still works in JS, so this is forward-safe.
  //   - The list endpoint wraps results in `_embedded.settlements`; we
  //     support that AND a bare single settlement. Pagination (following
  //     `_links.next`) is the sync engine's job, not this normalizer's.
  //   - OAuth scope: this endpoint requires `settlements.read`. The registry
  //     entry adds it; `payments.read` stays for when we add a second
  //     endpoint that reads individual payments (refunds, disputes).
  //
  // CAMBRA "rule of gold" holds: every output field comes 1:1 from input.
  // The "defensive probing" of `costs` is form navigation, not value invention.
  mollie_settlements: (raw) => {
    // Robust numeric parse: handles strings, nulls, undefined, "" and "abc".
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // Pull out a list of settlement objects regardless of wrap shape.
    const settlements = (() => {
      if (!raw || typeof raw !== "object") return [];
      if (Array.isArray(raw?._embedded?.settlements)) return raw._embedded.settlements;
      // Bare single settlement — Mollie returns this when you GET a specific id.
      if (raw.resource === "settlement" || raw.id || raw.periods || raw.costs) return [raw];
      return [];
    })();
    // Defensive walk: returns every `costs[]` array we can find inside the
    // settlement, no matter how `periods` is shaped (object-of-years,
    // array, or flat).
    const collectCosts = (settlement) => {
      const out = [];
      if (Array.isArray(settlement?.costs)) out.push(...settlement.costs);
      const periods = settlement?.periods;
      if (periods && typeof periods === "object") {
        const periodValues = Array.isArray(periods) ? periods : Object.values(periods);
        for (const p of periodValues) {
          if (!p || typeof p !== "object") continue;
          if (Array.isArray(p?.costs)) out.push(...p.costs);
          // Year → month nesting: each year is an object whose values are months.
          for (const inner of Object.values(p)) {
            if (inner && typeof inner === "object" && Array.isArray(inner?.costs)) {
              out.push(...inner.costs);
            }
          }
        }
      }
      return out;
    };
    const rows = [];
    for (const settlement of settlements) {
      const settlementId = settlement?.id ?? null;
      const currency = settlement?.amount?.currency || "EUR";
      const occurredAt = typeof settlement?.createdAt === "string" ? settlement.createdAt : null;
      const costs = collectCosts(settlement);
      for (const cost of costs) {
        const method = cost?.method ?? cost?.description ?? "unknown";
        rows.push({
          vertical: "payments",
          external_id: settlementId ? `${settlementId}:${method}` : method,
          provider_method: method,
          fee: toNum(cost?.amount?.gross),
          fee_net: toNum(cost?.amount?.net),
          fee_vat: toNum(cost?.amount?.vat),
          count: toNum(cost?.count),
          rate_fixed: toNum(cost?.rate?.fixed, null),
          rate_percentage: cost?.rate?.percentage ?? null,
          currency,
          occurred_at: occurredAt,
        });
      }
    }
    return rows;
  },
  stripe_transactions: (raw) => {
    const rows = Array.isArray(raw?.data) ? raw.data : [];
    return rows.map((tx) => {
      const amountCents = Number(tx?.amount ?? 0);
      const feeCents = Number(tx?.fee ?? 0);
      const netCents = Number(tx?.net ?? 0);
      const createdSec = Number(tx?.created ?? 0);
      const currency = typeof tx?.currency === "string" ? tx.currency.toUpperCase() : "EUR";
      const occurredAt = createdSec > 0 ? new Date(createdSec * 1000).toISOString() : null;
      return {
        vertical: "payments",
        external_id: tx?.id ?? null,
        amount: amountCents / 100,
        fee: feeCents / 100,
        net: netCents / 100,
        currency,
        occurred_at: occurredAt,
        type: tx?.reporting_category ?? tx?.type ?? null,
      };
    });
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
          // Interpolate {shop} per-endpoint using the value stored at
          // connect time. No-op for providers without {shop}.
          const endpointUrl = interpolateShopDomain(ep.url, integ.metadata_json?.shop_domain || null);
          const res = await fetch(endpointUrl, {
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