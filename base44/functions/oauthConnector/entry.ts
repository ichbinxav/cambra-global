/**
 * oauthConnector — Generic OAuth2 engine (Fase 0)
 * =============================================================================
 * One function, three modes, ZERO provider-specific branches.
 *
 *   mode: "start"
 *     in  : { brand_id, provider, redirect_after? }
 *     out : { ok, authorize_url, state }
 *     side: creates OAuthState row, sets Integration status="connecting"
 *
 *   mode: "callback"
 *     in  : { state, code }
 *     out : { ok, integration_id, redirect_after? }
 *     side: exchanges code → tokens, encrypts, upserts Integration as
 *           status="connected"
 *
 *   mode: "refresh"
 *     in  : { integration_id }
 *     out : { ok }
 *     side: rotates the access_token using the stored refresh_token
 *
 * Every behavior (auth_url, token_url, scopes, client creds env names) is
 * read from the REGISTRY constant below. The engine never knows what
 * "stripe" or "shopify" is.
 *
 * Security:
 *   - Tokens stored AES-256-GCM encrypted with INTEGRATION_TOKEN_KEY (base64,
 *     32 bytes). Never returned to the client.
 *   - Anti-CSRF: opaque state row, bound to brand_id + user_email, 10 min TTL,
 *     single-use (used_at).
 *   - Tenant isolation: brand_id must belong to the authenticated user.
 *   - Demo mode (registry flag, demo_provider only): no network calls — mints
 *     fake encrypted tokens so the engine can be audited end-to-end.
 *
 * ⚠️  REGISTRY DUPLICATION NOTE
 * Deno functions cannot import from sibling functions. The REGISTRY below is
 * the source of truth, and is duplicated VERBATIM in functions/dataSyncAgent.js.
 * When adding a provider, edit BOTH FILES in the same change.
 * =============================================================================
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ─── REGISTRY (keep in sync with functions/dataSyncAgent.js) ───────────────
// Each entry declares HOW to authenticate (`auth_method`) and HOW to read data
// (`data_endpoints`). The engine never knows what "stripe" or "shopify" is —
// it just looks up the config here and follows the recipe.
//
// auth_method:
//   "oauth"   → uses auth_url/token_url/scopes/client_id_env/client_secret_env
//   "api_key" → uses api_key_header/api_key_format/api_key_help_url
//
// When `auth_method` is omitted it defaults to "oauth" for backward compat
// with the original demo_provider entry.
const REGISTRY = {
  // DEMO OAUTH PROVIDER — verifies the OAuth path end-to-end without hitting
  // a real platform. `demo_mode: true` is ONLY allowed for these demo entries.
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
  // DEMO BASIC AUTH PROVIDER — verifies the basic_auth path end-to-end. The
  // user pastes TWO keys (public + secret); we combine them as
  // "public:secret", encrypt the resulting blob with the SAME AES-256-GCM
  // mechanism used everywhere else, and the sync builds the
  // "Authorization: Basic base64(public:secret)" header declared by the
  // registry. The combined form matches Basic Auth's native wire format,
  // so the cipher payload IS the pre-image of the final header — one
  // encrypt/decrypt cycle, no schema changes, no provider names anywhere.
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
  // DEMO API KEY PROVIDER — verifies the api_key path end-to-end. The user
  // pastes a key, we encrypt it with the same AES-256-GCM mechanism used for
  // OAuth tokens, and the sync uses it to build the auth header declared by
  // the registry. Cero hardcodeo de proveedor.
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

  // ─── REAL PROVIDERS (Tanda 2: payments OAuth) ────────────────────────────
  // Klaviyo (and other marketing tools) intentionally OMITTED — their spend is
  // captured via Pennylane supplier_invoices (`supplier_name: "Klaviyo"`) and
  // there's no per-event granularity worth benchmarking from a marketing
  // platform's own API. Single source of truth for marketing costs: accounting.
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

  // ─── REAL PROVIDERS (Tanda 3.5: accounting OAuth — Pennylane) ─────────────
  // Pennylane = French accounting platform. Standard OAuth2 with Refresh Token
  // Rotation (RTR): every refresh call returns a NEW refresh_token and
  // invalidates the previous one. The engine already handles RTR correctly in
  // modeRefresh (line: `json.refresh_token ? await encryptToken(json.refresh_token) : integ.refresh_token`),
  // so Pennylane needs ZERO engine changes — just this registry entry.
  //
  // Verification pending (paths/scopes are from Pennylane public docs as of
  // 2025 but may shift between API versions; confirm at first real connect):
  //   - auth_url + token_url: app.pennylane.com/oauth/{authorize|token}
  //   - scopes: customer_invoices_read + supplier_invoices_read + companies_read
  //     (read-only set, matches accounting verticals we care about)
  //   - data endpoint: external/v2/customer_invoices
  //
  // Deuda anotada (mismo patrón que Klaviyo/Shopify/Sendcloud): el normalizador
  // genérico `invoices` espera { invoices: [...] }. Pennylane probablemente
  // devuelve { customer_invoices: [...] } o { items: [...] }. El wiring es
  // válido hoy (no rompe nada), pero un sync real necesitará un normalizador
  // dedicado antes de mover datos útiles a producción.
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

  // ─── REAL PROVIDERS (Tanda 4: shipping HTTP Basic Auth — public+secret) ──
  // Sendcloud authenticates with HTTP Basic Auth using TWO keys (a public key
  // as the username and a secret key as the password). The motor handles this
  // GENERICALLY via auth_method="basic_auth": we combine the two keys as
  // "public:secret" (Basic Auth's native wire format) and encrypt the combined
  // blob in Integration.access_token using the existing AES-256-GCM helper.
  // At sync time, buildAuthHeaders decrypts and emits `Basic base64(...)` —
  // no provider name appears in the engine. Adding any future basic_auth
  // provider = one registry entry, zero engine changes.
  //
  // Deuda anotada (igual patrón que Klaviyo/Shopify): no existe normalizador
  // shipping específico para Sendcloud — el genérico `shipments` espera
  // { shipments: [...] } y Sendcloud responde { parcels: [...] }. El wiring
  // queda válido hoy (cero crashes), pero un sync real no rendirá datos
  // útiles hasta añadir un normalizador `parcels`.
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

  // ─── REAL PROVIDERS (Tanda 5: in-person payments OAuth — Zettle) ─────────
  // Zettle (PayPal-owned, formerly iZettle) provides Finance API v2 for
  // liquid-account transactions. Standard OAuth2 — no refresh token rotation,
  // no per-shop subdomain. The normalizer `zettle_finance` pairs PAYMENT +
  // PAYMENT_FEE lines that share originatingTransactionUuid and emits ONE
  // row per transaction (see the normalizer for the full pairing contract).
  //
  // Wiring only — `client_id_env` / `client_secret_env` point to env vars
  // that are NOT set yet. modeStart() returns a clean 503 if they're
  // missing, so the engine tolerates absent secrets until they're pasted.
  //
  // Deuda anotada (also documented inside the normalizer):
  //   (a) Endpoint paths from public docs; verify at first real connect.
  //   (b) Finance API line responses do NOT carry currency; the normalizer
  //       hardcodes "EUR" today. Confirm currency source at first connect.
  zettle: {
    display_name: "Zettle",
    category: "payments",
    logo: null,
    description: "Zettle (PayPal) OAuth — read-only access to Finance API v2 liquid-account transactions. The normalizer pairs PAYMENT + PAYMENT_FEE lines by originatingTransactionUuid to emit one row per transaction (Zettle models the fee as a separate negative line).",
    auth_method: "oauth",
    auth_url: "https://oauth.izettle.com/authorize",
    token_url: "https://oauth.izettle.com/token",
    scopes: ["READ:FINANCE", "READ:PURCHASE"],
    client_id_env: "ZETTLE_CLIENT_ID",
    client_secret_env: "ZETTLE_CLIENT_SECRET",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://finance.izettle.com/v2/accounts/liquid/transactions", method: "GET", normalize_as: "zettle_finance" },
    ],
    demo_mode: false,
  },

  // ─── REAL PROVIDERS (Tanda 6: in-person payments OAuth — Square) ─────────
  // Square Payments API. Standard OAuth2. One row in `payments[]` = one
  // transaction; the fee comes inline in `processing_fee[]`. No grouping
  // needed (versus Zettle's PAYMENT + PAYMENT_FEE pairing).
  //
  // Wiring only — `client_id_env` / `client_secret_env` point to env vars
  // that are NOT set yet. modeStart() returns a clean 503 if they're
  // missing, so the engine tolerates absent secrets until they're pasted.
  //
  // Deuda anotada (also documented inside the normalizer):
  //   (a) Endpoint paths from public docs; verify at first real connect.
  //   (b) Square REQUIRES a `Square-Version` header on every request. The
  //       generic sync engine does NOT inject this today — adding it is the
  //       next engine-level change (registry-driven mandatory headers).
  //       Until then, calling Square will fail with HTTP 400 from Square.
  //   (c) Refunds live on /v2/refunds, not wired here.
  square: {
    display_name: "Square",
    category: "payments",
    logo: null,
    description: "Square Payments OAuth — read-only access to /v2/payments. Each payment carries its fee inline in processing_fee[]. Uses the generic static_headers mechanism to inject Square-Version on every request (Square requires this header).",
    auth_method: "oauth",
    auth_url: "https://connect.squareup.com/oauth2/authorize",
    token_url: "https://connect.squareup.com/oauth2/token",
    scopes: ["PAYMENTS_READ"],
    client_id_env: "SQUARE_CLIENT_ID",
    client_secret_env: "SQUARE_CLIENT_SECRET",
    static_headers: {
      "Square-Version": "2026-01-22",
    },
    data_type: "transactions",
    data_endpoints: [
      { url: "https://connect.squareup.com/v2/payments", method: "GET", normalize_as: "square_payments" },
    ],
    demo_mode: false,
  },

  // ─── REAL PROVIDERS (Tanda 7: BNPL Basic Auth — Klarna) ──────────────────
  // Klarna Settlements API authenticates with HTTP Basic Auth (API username
  // + API password from the Merchant Portal). The motor's `basic_auth`
  // path encrypts "user:pass" as a single AES-256-GCM blob — same mechanism
  // as Sendcloud. ZERO engine changes.
  //
  // The normalizer `klarna_settlements` groups transaction lines by
  // `order_id` and emits ONE row per order, summing SALE/RETURN into
  // `amount` and FEE/FEE_REFUND into `fee`. Handles both NET (SALE+FEE in
  // same payout) and GROSS (FEE-only payout) settlement modes.
  //
  // Wiring only — no secrets needed for Basic Auth providers at registry
  // level; the brand pastes their credentials at connect time via the
  // generic UI form.
  //
  // Deuda anotada (also documented inside the normalizer):
  //   (a) Endpoint path from public docs; verify at first real connect.
  //   (b) `amount` is a STRING in MAJOR currency units (not minor units
  //       like Stripe/Zettle/Square). The normalizer does NOT divide by
  //       100. Confirm against a real payout.
  //   (c) GROSS settlements emit rows with amount:0 (no SALE lines).
  //   (d) Cursor pagination — sync engine's job.
  klarna: {
    display_name: "Klarna",
    category: "payments",
    logo: null,
    description: "Klarna Settlements API — Basic Auth (API username + password). The normalizer groups lines by order_id and aggregates SALE/RETURN into amount and FEE/FEE_REFUND into fee, handling both NET and GROSS settlement modes.",
    auth_method: "basic_auth",
    basic_auth_help_url: "https://docs.klarna.com",
    basic_auth_help_text: "Genera tus credenciales de API en el Merchant Portal de Klarna (username + password) y pégalas aquí.",
    basic_auth_user_label: "API username",
    basic_auth_pass_label: "API password",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.klarna.com/settlements/v1/payouts/transactions", method: "GET", normalize_as: "klarna_settlements" },
    ],
    demo_mode: false,
  },

  // ─── REAL PROVIDERS (Tanda 8: commerce Basic Auth per-shop — WooCommerce) ─
  // WooCommerce REST API v3. Authenticates with HTTP Basic Auth using a
  // consumer_key (ck_...) as username and consumer_secret (cs_...) as
  // password — same `basic_auth` path used by Sendcloud/Klarna, zero crypto
  // changes.
  //
  // Per-shop URL: WooCommerce lives on the customer's own domain. The
  // engine reuses the existing `requires_shop_domain` mechanism (originally
  // built for Shopify) — the data endpoint contains `{shop}` which is
  // interpolated at sync time with whatever the brand pasted at connect
  // time. For Shopify the value is a handle ("mitienda"); for WooCommerce
  // it's a full domain ("mitienda.com"). The interpolation helper is
  // generic and accepts both. modeConnectBasicAuth was extended in this
  // change to read+persist shop_domain when requires_shop_domain is true
  // (same surface modeStart already had for OAuth providers).
  //
  // Deuda anotada (also documented inside the normalizer):
  //   (a) Endpoint path from public docs; verify at first real connect.
  //   (b) `total` / `total_tax` are STRINGS in MAJOR currency units; the
  //       normalizer does NOT divide by 100.
  //   (c) `date_created_gmt` has no "Z" suffix even though it's UTC —
  //       preserved as-is.
  //   (d) Pagination + WP-specific headers — sync engine's job.
  woocommerce: {
    display_name: "WooCommerce",
    category: "commerce",
    logo: null,
    description: "WooCommerce REST API v3 — Basic Auth with consumer_key (ck_) + consumer_secret (cs_). Per-shop: the customer provides their site's base URL at connect time, which the engine interpolates as {shop} (full domain).",
    auth_method: "basic_auth",
    basic_auth_help_url: "https://woocommerce.com/document/woocommerce-rest-api/",
    basic_auth_help_text: "En WooCommerce → Ajustes → Avanzado → REST API, crea una clave con permiso de Lectura. Pega la Consumer key (ck_...) como usuario y la Consumer secret (cs_...) como contraseña.",
    basic_auth_user_label: "Consumer key (ck_...)",
    basic_auth_pass_label: "Consumer secret (cs_...)",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://{shop}/wp-json/wc/v3/orders", method: "GET", normalize_as: "woocommerce_orders" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
  },

  // ─── REAL PROVIDERS (Tanda 9: commerce API key per-store — BigCommerce) ──
  // BigCommerce Orders v2. Authenticates with an API access token sent in
  // the `X-Auth-Token` header (NOT Authorization Bearer). The engine uses
  // the generic `static_headers` mechanism declared in the registry to
  // route the token to the right header — no provider-specific code.
  //
  // Per-store URL: the `{shop}` token in the data endpoint is the
  // BigCommerce store_hash (e.g. "abc12345xyz"), not a dominio. The
  // generic interpolation helper accepts any string.
  //
  // Deuda anotada (also documented inside the normalizer):
  //   (a) Endpoint path from public docs; verify at first real connect.
  //   (b) date_created is RFC-2822, preserved as-is.
  //   (c) {shop} = store_hash here; the generic helper handles it.
  //   (d) Pagination ?page&limit — sync engine's job.
  bigcommerce: {
    display_name: "BigCommerce",
    category: "commerce",
    logo: null,
    description: "BigCommerce Orders v2 — API key in X-Auth-Token header (declared via static_headers). Per-store: the customer provides their store_hash at connect time, interpolated as {shop}.",
    auth_method: "api_key",
    // The token doesn't go in the Authorization header — it goes in
    // X-Auth-Token via static_headers below. So we suppress the default
    // Authorization route by sending the token to an internal header
    // name that we then override in static_headers… actually no: we set
    // api_key_header to "X-Auth-Token" so buildAuthHeaders emits the
    // right header directly, AND we also declare static_headers for
    // Accept. Simpler and equivalent. The {token} interpolation path
    // remains documented and available for any future provider that
    // needs it.
    api_key_header: "X-Auth-Token",
    api_key_format: "{key}",
    api_key_help_url: "https://developer.bigcommerce.com/docs/start/authentication/api-accounts",
    api_key_help_text: "En BigCommerce → Settings → API Accounts crea una cuenta con scope de lectura de Orders. Pega el Access Token aquí y tu store hash.",
    static_headers: {
      "Accept": "application/json",
    },
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.bigcommerce.com/stores/{shop}/v2/orders", method: "GET", normalize_as: "bigcommerce_orders" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
  },

  // ─── REAL PROVIDERS (Tanda 10: accounting API key — Holded) ──────────────
  // Holded Invoicing API. Authenticates with a NON-STANDARD header named
  // literally `key` (NOT Authorization Bearer). The engine routes it via
  // the generic api_key_header mechanism — same path BigCommerce used for
  // X-Auth-Token. No code-level branch for Holded.
  //
  // Endpoint: GET /api/invoicing/v1/documents/purchase
  // (purchase = facturas de compra = brand EXPENSES, paired in the cerebro
  // with pennylane_supplier_invoices as a second accounting source.)
  //
  // Deuda anotada (detail inside the normalizer):
  //   (a) Field names assumed from public docs; verify on first real connect.
  //   (b) Root: assumed bare array; confirm at first connect.
  //   (c) `date` assumed UNIX seconds (not ms); confirm at first connect.
  //   (d) Pagination — sync engine.
  holded: {
    display_name: "Holded",
    category: "accounting",
    logo: null,
    description: "Holded Invoicing API — API key in a non-standard header named `key` (declared via api_key_header). Reads purchase documents (supplier invoices = brand expenses). Field names assumed from public docs; verify at first real connect.",
    auth_method: "api_key",
    api_key_header: "key",
    api_key_format: "{key}",
    api_key_help_url: "https://developers.holded.com/",
    api_key_help_text: "En Holded → Configuración → Desarrolladores, genera una API Key. Pégala aquí. (Plan de pago requerido.)",
    data_type: "invoices",
    data_endpoints: [
      { url: "https://api.holded.com/api/invoicing/v1/documents/purchase", method: "GET", normalize_as: "holded_purchases" },
    ],
    demo_mode: false,
  },

  // ─── REAL PROVIDERS (Tanda 11: accounting OAuth — Xero) ──────────────────
  // Xero Accounting API. OAuth2 + Bearer. Two non-trivial details:
  //
  //   1. Xero returns XML by default. We force JSON via the GENERIC
  //      static_headers mechanism (Accept: application/json). No
  //      provider-specific branch in the engine — same path Square uses
  //      to inject Square-Version.
  //
  //   2. The /Invoices endpoint returns BOTH supplier bills (Type
  //      "ACCPAY", expenses) and customer invoices (Type "ACCREC",
  //      revenue) in the same array. The normalizer filters to ACCPAY
  //      only; ACCREC rows are dropped silently. CAMBRA-side: this gives
  //      us the brand's expense tail (third accounting source after
  //      Pennylane supplier_invoices and Holded purchases).
  //
  // ⚠️  PENDING SCOPE GAP — XERO-TENANT-ID:
  //   In production Xero requires a `Xero-Tenant-Id` header on every
  //   data request (organisations are multi-tenant; the token alone is
  //   not enough). TODAY we do NOT capture it at connect time. This
  //   means the very first real connect will 401/400 until we add a
  //   capture step in modeCallback (or as a follow-up question) and a
  //   way to inject a per-integration dynamic header. The generic
  //   static_headers can only carry STATIC strings — the tenant id is
  //   per-tenant, not per-provider. Flagged as deuda; do NOT solve here.
  //
  // Deuda anotada (detail inside the normalizer):
  //   (a) Field names from public docs; verify on first real connect.
  //   (b) Date in Microsoft "/Date(ms)/" format — MILLISECONDS, not seconds.
  //   (c) static_headers forces JSON; confirm no query param is also needed.
  //   (d) Xero-Tenant-Id required in prod — see above.
  xero: {
    display_name: "Xero",
    category: "accounting",
    logo: null,
    description: "Xero Accounting API — OAuth2 + Bearer. Reads /Invoices and the normalizer filters to ACCPAY (supplier bills = brand expenses). Uses the generic static_headers mechanism to force JSON output (Xero defaults to XML). NOTE: Xero requires a Xero-Tenant-Id header in production multi-org accounts — not captured yet; will need to be wired before first real connect.",
    auth_method: "oauth",
    auth_url: "https://login.xero.com/identity/connect/authorize",
    token_url: "https://identity.xero.com/connect/token",
    scopes: ["accounting.transactions.read", "offline_access"],
    client_id_env: "XERO_CLIENT_ID",
    client_secret_env: "XERO_CLIENT_SECRET",
    static_headers: {
      "Accept": "application/json",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://api.xero.com/api.xro/2.0/Invoices", method: "GET", normalize_as: "xero_bills" },
    ],
    demo_mode: false,
  },

  // ─── REAL PROVIDERS (Tanda 12: accounting OAuth — QuickBooks) ────────────
  // QuickBooks Online Accounting API v3. OAuth2 + Bearer. Two non-trivial
  // points handled via mechanisms that already exist:
  //
  //   1. Per-company URL: the {shop} token in the data endpoint is the
  //      QuickBooks `realmId` (company ID), NOT a domain. The generic
  //      interpolateShopDomain helper accepts any string, so the same
  //      mechanism that serves Shopify (handle) and WooCommerce (domain)
  //      serves QuickBooks (numeric realmId) without changes.
  //
  //   2. JSON over XML: QuickBooks can return XML. We force JSON via the
  //      generic static_headers (Accept: application/json) — same path
  //      Xero uses for the same reason.
  //
  // Endpoint shape:
  //   The path uses a SQL-like query string (`?query=select * from Bill`).
  //   "Bill" in QuickBooks terminology = supplier bill = brand EXPENSE.
  //
  // Deuda anotada (detail inside the normalizer):
  //   (a) Field names from public docs; verify on first real connect.
  //   (b) amount_before_tax & tax forced to 0 — QuickBooks Bill header
  //       doesn't carry a reliable tax breakdown (tax sits on Line items).
  //   (c) {shop} = realmId here; helper handles strings generically.
  //   (d) URL contains spaces in the query (`select * from Bill`). fetch()
  //       typically tolerates spaces but the engine may need to encode
  //       them. Confirm on first real connect.
  //   (e) Pagination uses STARTPOSITION + MAXRESULTS in the SQL-like
  //       query, not ?page=N. Sync engine's job.
  quickbooks: {
    display_name: "QuickBooks",
    category: "accounting",
    logo: null,
    description: "QuickBooks Online Accounting API v3 — OAuth2 + Bearer. Reads supplier Bills (=brand expenses) via a SQL-like query endpoint. Per-company: the customer provides their realmId at connect time, interpolated as {shop}. Uses the generic static_headers to force JSON output.",
    auth_method: "oauth",
    auth_url: "https://appcenter.intuit.com/connect/oauth2",
    token_url: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scopes: ["com.intuit.quickbooks.accounting"],
    client_id_env: "QUICKBOOKS_CLIENT_ID",
    client_secret_env: "QUICKBOOKS_CLIENT_SECRET",
    static_headers: {
      "Accept": "application/json",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://quickbooks.api.intuit.com/v3/company/{shop}/query?query=select * from Bill", method: "GET", normalize_as: "quickbooks_bills" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
  },
};

function getProviderConfig(provider) {
  if (!provider || typeof provider !== "string") return null;
  return REGISTRY[provider] || null;
}

// ─── Crypto helpers (AES-256-GCM) ──────────────────────────────────────────

function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
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
  if (keyBytes.byteLength !== 32) {
    throw new Error("INTEGRATION_TOKEN_KEY must decode to 32 bytes (base64 of 32 random bytes)");
  }
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptToken(plaintext) {
  if (!plaintext) return null;
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc));
  return `v1:${b64encode(iv)}:${b64encode(ct)}`;
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

// ─── Helpers ───────────────────────────────────────────────────────────────

function randomStateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function getRedirectUri() {
  const appDomain = Deno.env.get("APP_DOMAIN") || "";
  const base = appDomain.startsWith("http") ? appDomain : `https://${appDomain}`;
  return `${base}/IntegrationsCallback`;
}

function jsonError(status, message) {
  return Response.json({ ok: false, error: message }, { status });
}

// ─── Per-shop URL interpolation (generic, no provider names) ───────────────
// Some providers (Shopify today, others tomorrow) host OAuth and data
// endpoints under the customer's own subdomain. The registry encodes this as
// the literal token {shop} in any URL field; this helper replaces it with the
// validated shop handle. If the URL doesn't contain {shop} it's returned
// untouched — Stripe/Mollie/Klaviyo/PayPal/demos never see this code path.
const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/i;
function validateShopDomain(shop) {
  if (!shop || typeof shop !== "string") throw new Error("shop_domain is required for this provider");
  const trimmed = shop.trim();
  // Reject anything that smells like a URL, dot, path, or scheme.
  if (!SHOP_DOMAIN_REGEX.test(trimmed)) {
    throw new Error("shop_domain must be the handle only (e.g. 'mitienda'), no dots, no scheme, no path");
  }
  return trimmed.toLowerCase();
}
function interpolateShopDomain(url, shop) {
  if (!url || typeof url !== "string" || !url.includes("{shop}")) return url;
  if (!shop) throw new Error("shop_domain is required to interpolate {shop} in this URL");
  return url.replaceAll("{shop}", shop);
}

async function assertBrandOwnedByUser(base44, brandId, userEmail) {
  if (!brandId) throw new Error("brand_id is required");
  const brand = await base44.entities.Brand.get(brandId);
  if (!brand) throw new Error("Brand not found");
  if (brand.created_by !== userEmail && brand.contact_email !== userEmail) {
    throw new Error("This brand does not belong to the current user");
  }
  return brand;
}

// ─── Mode: start ───────────────────────────────────────────────────────────

async function modeStart(base44, user, params) {
  const { brand_id, provider, redirect_after, shop_domain: rawShopDomain } = params;
  const cfg = getProviderConfig(provider);
  if (!cfg) return jsonError(400, `Unknown provider: ${provider}`);

  // OAuth-only mode — api_key providers go through modeConnectApiKey instead.
  const authMethod = cfg.auth_method || "oauth";
  if (authMethod !== "oauth") {
    return jsonError(400, `Provider ${provider} uses auth_method="${authMethod}". Use mode="connect_api_key" instead.`);
  }

  // Per-shop providers require the customer's shop handle at connect time.
  // Validation is generic — the engine never knows the provider name.
  let shopDomain = null;
  if (cfg.requires_shop_domain) {
    try {
      shopDomain = validateShopDomain(rawShopDomain);
    } catch (err) {
      return jsonError(400, err.message);
    }
  }

  if (user.role !== "admin") {
    await assertBrandOwnedByUser(base44, brand_id, user.email);
  }

  if (!cfg.demo_mode) {
    const clientId = Deno.env.get(cfg.client_id_env);
    if (!clientId) return jsonError(503, `${provider} is not configured yet (missing ${cfg.client_id_env})`);
  }

  const state = randomStateToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await base44.asServiceRole.entities.OAuthState.create({
    state,
    brand_id,
    provider,
    user_email: user.email,
    redirect_after: redirect_after || null,
    shop_domain: shopDomain,
    expires_at: expiresAt,
  });

  const existing = await base44.asServiceRole.entities.Integration
    .filter({ brand_id, provider }, "-created_date", 1)
    .catch(() => []);
  if (existing[0]) {
    await base44.asServiceRole.entities.Integration.update(existing[0].id, {
      status: "connecting",
      last_error: null,
    });
  } else {
    await base44.asServiceRole.entities.Integration.create({
      brand_id,
      provider,
      category: cfg.category,
      status: "connecting",
      scopes: cfg.scopes || [],
    });
  }

  if (cfg.demo_mode) {
    const fakeCode = `demo_code_${randomStateToken().slice(0, 16)}`;
    const cb = getRedirectUri();
    const authorize_url = `${cb}?state=${encodeURIComponent(state)}&code=${encodeURIComponent(fakeCode)}&demo=1`;
    return Response.json({ ok: true, authorize_url, state, demo_mode: true });
  }

  const clientId = Deno.env.get(cfg.client_id_env);
  const params2 = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: (cfg.scopes || []).join(" "),
    state,
    redirect_uri: getRedirectUri(),
  });
  // Interpolate {shop} if present. No-op for providers without {shop}.
  const baseAuthUrl = interpolateShopDomain(cfg.auth_url, shopDomain);
  const authorize_url = `${baseAuthUrl}?${params2.toString()}`;
  return Response.json({ ok: true, authorize_url, state });
}

// ─── Mode: callback ────────────────────────────────────────────────────────

async function exchangeCodeForTokens(cfg, code, shopDomain) {
  if (cfg.demo_mode) {
    return {
      access_token: `demo_at_${randomStateToken().slice(0, 24)}`,
      refresh_token: `demo_rt_${randomStateToken().slice(0, 24)}`,
      expires_in: 3600,
      account_id: "demo_account_001",
      raw: { mocked: true, code },
    };
  }
  const clientId = Deno.env.get(cfg.client_id_env);
  const clientSecret = Deno.env.get(cfg.client_secret_env);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(),
  });
  // Interpolate {shop} if present. No-op for providers without {shop}.
  const tokenUrl = interpolateShopDomain(cfg.token_url, shopDomain);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    account_id: json.account_id || json.stripe_user_id || json.user_id || null,
    raw: json,
  };
}

async function modeCallback(base44, user, params) {
  const { state, code } = params;
  if (!state || !code) return jsonError(400, "state and code are required");

  const rows = await base44.asServiceRole.entities.OAuthState
    .filter({ state }, "-created_date", 1)
    .catch(() => []);
  const row = rows[0];
  if (!row) return jsonError(400, "Invalid or unknown state");
  if (row.used_at) return jsonError(400, "State already used");
  if (new Date(row.expires_at).getTime() < Date.now()) return jsonError(400, "State expired");
  if (row.user_email !== user.email && user.role !== "admin") {
    return jsonError(403, "State does not belong to current user");
  }

  const cfg = getProviderConfig(row.provider);
  if (!cfg) return jsonError(500, `Provider ${row.provider} no longer in registry`);

  await base44.asServiceRole.entities.OAuthState.update(row.id, {
    used_at: new Date().toISOString(),
  });

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(cfg, code, row.shop_domain || null);
  } catch (err) {
    const existing = await base44.asServiceRole.entities.Integration
      .filter({ brand_id: row.brand_id, provider: row.provider }, "-created_date", 1)
      .catch(() => []);
    if (existing[0]) {
      await base44.asServiceRole.entities.Integration.update(existing[0].id, {
        status: "error",
        last_error: err.message,
      });
    }
    return jsonError(502, `Token exchange failed: ${err.message}`);
  }

  const encryptedAccess = await encryptToken(tokens.access_token);
  const encryptedRefresh = await encryptToken(tokens.refresh_token);
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const update = {
    status: "connected",
    access_token: encryptedAccess,
    refresh_token: encryptedRefresh,
    access_token_expires_at: expiresAt,
    scopes: cfg.scopes || [],
    connected_at: new Date().toISOString(),
    last_error: null,
    provider_account_id: tokens.account_id || null,
    // shop_domain persisted in metadata_json so dataSyncAgent + modeRefresh
    // can re-interpolate {shop} on every subsequent call without re-asking.
    metadata_json: {
      account_id: tokens.account_id,
      demo_mode: !!cfg.demo_mode,
      ...(row.shop_domain ? { shop_domain: row.shop_domain } : {}),
    },
    category: cfg.category,
  };

  const existing = await base44.asServiceRole.entities.Integration
    .filter({ brand_id: row.brand_id, provider: row.provider }, "-created_date", 1)
    .catch(() => []);
  let integrationId;
  if (existing[0]) {
    await base44.asServiceRole.entities.Integration.update(existing[0].id, update);
    integrationId = existing[0].id;
  } else {
    const created = await base44.asServiceRole.entities.Integration.create({
      brand_id: row.brand_id,
      provider: row.provider,
      ...update,
    });
    integrationId = created.id;
  }

  return Response.json({
    ok: true,
    integration_id: integrationId,
    redirect_after: row.redirect_after || null,
  });
}

// ─── Mode: connect_api_key ─────────────────────────────────────────────────
// Generic API-key onboarding. The user pastes a key, we encrypt it with the
// SAME AES-256-GCM mechanism used for OAuth tokens (reuses encryptToken — no
// duplicate crypto logic), and we store it in Integration.access_token.
//
// The key NEVER comes back to the client. We strip it from every Response.

async function modeConnectApiKey(base44, user, params) {
  const { brand_id, provider, api_key } = params;
  const cfg = getProviderConfig(provider);
  if (!cfg) return jsonError(400, `Unknown provider: ${provider}`);

  const authMethod = cfg.auth_method || "oauth";
  if (authMethod !== "api_key") {
    return jsonError(400, `Provider ${provider} uses auth_method="${authMethod}". Use mode="start" (OAuth) instead.`);
  }

  if (typeof api_key !== "string" || api_key.trim().length < 4) {
    return jsonError(400, "api_key is required (min 4 chars)");
  }

  if (user.role !== "admin") {
    await assertBrandOwnedByUser(base44, brand_id, user.email);
  }

  // In demo mode we still encrypt the pasted value so the storage path is
  // identical to a real provider — that's the whole point of the demo.
  const encryptedKey = await encryptToken(api_key.trim());

  const update = {
    status: "connected",
    access_token: encryptedKey,
    refresh_token: null,
    access_token_expires_at: null,
    scopes: [],
    connected_at: new Date().toISOString(),
    last_error: null,
    provider_account_id: null,
    metadata_json: { auth_method: "api_key", demo_mode: !!cfg.demo_mode },
    category: cfg.category,
  };

  const existing = await base44.asServiceRole.entities.Integration
    .filter({ brand_id, provider }, "-created_date", 1)
    .catch(() => []);

  let integrationId;
  if (existing[0]) {
    await base44.asServiceRole.entities.Integration.update(existing[0].id, update);
    integrationId = existing[0].id;
  } else {
    const created = await base44.asServiceRole.entities.Integration.create({
      brand_id,
      provider,
      ...update,
    });
    integrationId = created.id;
  }

  // Important: response carries the integration id only — NEVER the key.
  return Response.json({ ok: true, integration_id: integrationId });
}

// ─── Mode: connect_basic_auth ──────────────────────────────────────────────
// Generic HTTP Basic Auth onboarding. The user pastes TWO keys (public key as
// the username, secret key as the password); we combine them as
// "public:secret" — Basic Auth's native wire format — and encrypt the combined
// blob with the SAME AES-256-GCM mechanism used everywhere else (reuses
// encryptToken — no duplicate crypto). At sync time buildAuthHeaders decrypts
// once and emits the header.
//
// Storage choice (option b): one cipher blob in access_token, no schema
// changes. The `:` in the plaintext IS the standard Basic Auth separator —
// RFC 7617 forbids `:` in the username field, so we mirror that and reject
// any key containing `:` at input time. Mantenibilidad + seguridad: una sola
// llamada a crypto en ambas direcciones, ningún campo nuevo en Integration.
//
// The two keys NEVER come back to the client. We strip them from every
// Response and never log them.

async function modeConnectBasicAuth(base44, user, params) {
  const { brand_id, provider, public_key, secret_key, shop_domain: rawShopDomain } = params;
  const cfg = getProviderConfig(provider);
  if (!cfg) return jsonError(400, `Unknown provider: ${provider}`);

  const authMethod = cfg.auth_method || "oauth";
  if (authMethod !== "basic_auth") {
    return jsonError(400, `Provider ${provider} uses auth_method="${authMethod}". Use the matching connect mode instead.`);
  }

  // Validate both keys: non-empty, no ':' (RFC 7617 separator).
  for (const [name, v] of [["public_key", public_key], ["secret_key", secret_key]]) {
    if (typeof v !== "string" || v.trim().length < 4) {
      return jsonError(400, `${name} is required (min 4 chars)`);
    }
    if (v.includes(":")) {
      return jsonError(400, `${name} cannot contain ':' (reserved as the Basic Auth separator)`);
    }
  }

  // Per-shop basic_auth providers (e.g. WooCommerce) need the customer's
  // base URL at connect time so dataSyncAgent can interpolate {shop} into
  // the data endpoint. Generic — the engine never names a provider. NOTE:
  // unlike the OAuth path (Shopify), we do NOT enforce SHOP_DOMAIN_REGEX
  // here because basic_auth providers can carry full domains (e.g.
  // "mitienda.com"). The interpolation helper accepts any non-empty string.
  let shopDomain = null;
  if (cfg.requires_shop_domain) {
    if (typeof rawShopDomain !== "string" || rawShopDomain.trim().length < 3) {
      return jsonError(400, "shop_domain is required for this provider");
    }
    shopDomain = rawShopDomain.trim().toLowerCase();
  }

  if (user.role !== "admin") {
    await assertBrandOwnedByUser(base44, brand_id, user.email);
  }

  const combined = `${public_key.trim()}:${secret_key.trim()}`;
  const encrypted = await encryptToken(combined);

  const update = {
    status: "connected",
    access_token: encrypted,
    refresh_token: null,
    access_token_expires_at: null,
    scopes: [],
    connected_at: new Date().toISOString(),
    last_error: null,
    provider_account_id: null,
    metadata_json: {
      auth_method: "basic_auth",
      demo_mode: !!cfg.demo_mode,
      ...(shopDomain ? { shop_domain: shopDomain } : {}),
    },
    category: cfg.category,
  };

  const existing = await base44.asServiceRole.entities.Integration
    .filter({ brand_id, provider }, "-created_date", 1)
    .catch(() => []);

  let integrationId;
  if (existing[0]) {
    await base44.asServiceRole.entities.Integration.update(existing[0].id, update);
    integrationId = existing[0].id;
  } else {
    const created = await base44.asServiceRole.entities.Integration.create({
      brand_id,
      provider,
      ...update,
    });
    integrationId = created.id;
  }

  // Important: response carries the integration id only — NEVER the keys.
  return Response.json({ ok: true, integration_id: integrationId });
}

// ─── Mode: refresh ─────────────────────────────────────────────────────────

async function modeRefresh(base44, user, params) {
  const { integration_id } = params;
  if (!integration_id) return jsonError(400, "integration_id is required");

  const integ = await base44.asServiceRole.entities.Integration.get(integration_id);
  if (!integ) return jsonError(404, "Integration not found");

  if (user.role !== "admin") {
    await assertBrandOwnedByUser(base44, integ.brand_id, user.email);
  }
  const cfg = getProviderConfig(integ.provider);
  if (!cfg) return jsonError(500, `Provider ${integ.provider} no longer in registry`);

  if (cfg.demo_mode) {
    const newAt = await encryptToken(`demo_at_${randomStateToken().slice(0, 24)}`);
    await base44.asServiceRole.entities.Integration.update(integ.id, {
      access_token: newAt,
      access_token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    return Response.json({ ok: true, demo_mode: true });
  }

  const refreshPlain = await decryptToken(integ.refresh_token);
  if (!refreshPlain) return jsonError(400, "No refresh token stored");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshPlain,
    client_id: Deno.env.get(cfg.client_id_env),
    client_secret: Deno.env.get(cfg.client_secret_env),
  });
  // Interpolate {shop} from the stored shop_domain, if any. No-op otherwise.
  const tokenUrl = interpolateShopDomain(cfg.token_url, integ.metadata_json?.shop_domain || null);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    await base44.asServiceRole.entities.Integration.update(integ.id, {
      status: "error",
      last_error: `Refresh failed: ${res.status}`,
    });
    return jsonError(502, `Refresh failed: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const encryptedAccess = await encryptToken(json.access_token);
  const encryptedRefresh = json.refresh_token ? await encryptToken(json.refresh_token) : integ.refresh_token;
  await base44.asServiceRole.entities.Integration.update(integ.id, {
    access_token: encryptedAccess,
    refresh_token: encryptedRefresh,
    access_token_expires_at: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null,
    last_error: null,
  });
  return Response.json({ ok: true });
}

// ─── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;

    if (mode === "start")           return await modeStart(base44, user, body);
    if (mode === "callback")        return await modeCallback(base44, user, body);
    if (mode === "refresh")         return await modeRefresh(base44, user, body);
    if (mode === "connect_api_key") return await modeConnectApiKey(base44, user, body);
    if (mode === "connect_basic_auth") return await modeConnectBasicAuth(base44, user, body);
    // Read-only introspection: returns the REGISTRY so verifyRegistrySync can
    // compare it against dataSyncAgent's copy. Never reads/writes any data,
    // never touches OAuth flows. Admin-only to avoid leaking endpoint URLs.
    if (mode === "describe") {
      if (user.role !== "admin") return jsonError(403, "Admin only");
      return Response.json({ ok: true, registry: REGISTRY, source: "oauthConnector" });
    }
    return jsonError(400, `Unknown mode: ${mode}. Use start | callback | refresh | connect_api_key | connect_basic_auth | describe`);
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});