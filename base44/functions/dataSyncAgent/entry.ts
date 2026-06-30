/**
 * dataSyncAgent — Generic data reader. Reads cfg.data_endpoints + cfg.data_type
 * from REGISTRY, fetches, normalizes into CAMBRA spend format. Risk 0 (read-only).
 * Emits AgentTask + Event. Tenant-isolated.
 * In: { integration_id }  Out: { ok, agent_task_id, records_count, normalized_sample }
 * ⚠️ REGISTRY duplicated verbatim in oauthConnector.js — Deno cannot share imports.
 *    Edit BOTH files together when adding a provider.
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

  // Mirror of zettle — same contract, both files identical.
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

  // Mirror of square — same contract, both files identical.
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

  // Mirror of klarna — same contract, both files identical.
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

  // Mirror of woocommerce — same contract, both files identical.
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

  // Mirror of bigcommerce — same contract, both files identical.
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

  // Mirror of holded — same contract, both files identical.
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

  // Mirror of xero — same contract, both files identical.
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

  // Mirror of quickbooks — same contract, both files identical.
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

  // Mirror of sage — same contract, both files identical.
  sage: {
    display_name: "Sage",
    category: "accounting",
    logo: null,
    description: "Sage Business Cloud Accounting API v3.1 — OAuth2 + Bearer. Reads /purchase_invoices (supplier invoices = brand expenses). Root key is `$items` (dollar prefix). The normalizer handles dual object/string forms for contact, currency, and status. Uses generic static_headers to force JSON output.",
    auth_method: "oauth",
    auth_url: "https://www.sageone.com/oauth2/auth/central",
    token_url: "https://oauth.accounting.sage.com/token",
    scopes: ["full_access"],
    client_id_env: "SAGE_CLIENT_ID",
    client_secret_env: "SAGE_CLIENT_SECRET",
    static_headers: {
      "Accept": "application/json",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://api.accounting.sage.com/v3.1/purchase_invoices", method: "GET", normalize_as: "sage_purchase_invoices" },
    ],
    demo_mode: false,
  },

  // Mirror of payplug — same contract, both files identical.
  // known_data_gaps: provider-level static metadata flagging documented
  // limitations of the upstream API. Currently flags that /v1/payments only
  // returns API-created payments; portal-created payments are invisible →
  // volume may be undercounted. DEUDA: known_data_gaps is defined in the
  // registry but NOT YET wired into DataQualityScore.completeness. Verify in
  // M2/M3 whether a generic consumption mechanism exists; if not, that's
  // explicit future work — do not assume engine behaviour without a human decision.
  payplug: {
    display_name: "PayPlug",
    category: "payments",
    logo: null,
    description: "PayPlug Payments API — Bearer secret key (sk_live_...). Reads /v1/payments. Requires mandatory PayPlug-Version header via static_headers. Amounts in cents, timestamps Unix seconds. ⚠️ Fee is NOT exposed in the payments API (lives in settlements) — volume only.",
    known_data_gaps: ["portal_payments_not_visible_via_api"],
    auth_method: "api_key",
    api_key_header: "Authorization",
    api_key_format: "Bearer {key}",
    api_key_help_url: "https://docs.payplug.com/api",
    api_key_help_text: "En PayPlug → Mi cuenta → Claves API, copia tu clave secreta (sk_live_...). Pégala aquí.",
    static_headers: {
      "PayPlug-Version": "2019-08-06",
      "Accept": "application/json",
    },
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.payplug.com/v1/payments", method: "GET", normalize_as: "payplug_payments" },
    ],
    demo_mode: false,
  },

  // Mirror of lexoffice — same contract, both files identical.
  lexoffice: {
    display_name: "Lexoffice",
    category: "accounting",
    logo: null,
    description: "Lexoffice (lexware Office) API — OAuth2 Bearer. Reads /v1/voucherlist filtered to voucherType=purchaseinvoice (and the normalizer also accepts purchasecreditnote) = brand expenses. German accounting software.",
    auth_method: "oauth",
    auth_url: "https://app.lexoffice.de/oauth2/authorize",
    token_url: "https://api.lexoffice.io/oauth2/access_token",
    scopes: [],
    client_id_env: "LEXOFFICE_CLIENT_ID",
    client_secret_env: "LEXOFFICE_CLIENT_SECRET",
    static_headers: {
      "Accept": "application/json",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://api.lexoffice.io/v1/voucherlist?voucherType=purchaseinvoice&voucherStatus=open,paid,transferred", method: "GET", normalize_as: "lexoffice_vouchers" },
    ],
    demo_mode: false,
  },

  // Mirror of sevdesk — same contract, both files identical.
  sevdesk: {
    display_name: "sevDesk",
    category: "accounting",
    logo: null,
    description: "sevDesk API v1 — API key in Authorization header WITHOUT 'Bearer' prefix (bare key). Reads /Voucher filtered to creditDebit='C' (supplier vouchers = brand expenses). German accounting software.",
    auth_method: "api_key",
    api_key_header: "Authorization",
    api_key_format: "{key}",
    api_key_help_url: "https://api.sevdesk.de/",
    api_key_help_text: "En sevDesk → Configuración → Usuarios → tu usuario → API Token. Copia el token y pégalo aquí.",
    static_headers: {
      "Accept": "application/json",
    },
    data_type: "invoices",
    // Two endpoints on the same provider — mirrors Pennylane's customer+supplier
    // pattern. /Voucher (expenses) and /Invoice (revenue) coexist: each has its
    // own normalizer, neither is touched when the other changes.
    // countAll=true is REQUIRED on /Invoice — without it sevDesk does not
    // return the total row count and offset-based pagination cannot advance.
    // sevDesk operational note (NOT a known_data_gap — covered by last_sync_status):
    // API tokens are bound to a specific sevDesk user account. If that user is
    // deleted in sevDesk, the token dies silently — the next sync surfaces a
    // 401 via last_error, which is already the right behavior.
    data_endpoints: [
      { url: "https://my.sevdesk.de/api/v1/Voucher", method: "GET", normalize_as: "sevdesk_vouchers" },
      { url: "https://my.sevdesk.de/api/v1/Invoice?limit=100&offset=0&countAll=true", method: "GET", normalize_as: "sevdesk_invoices" },
    ],
    demo_mode: false,
  },

  // Mirror of odoo — same contract, both files identical.
  odoo: {
    display_name: "Odoo",
    category: "accounting",
    logo: null,
    description: "Odoo REST API (Odoo 17+) — API key as Bearer. Reads account.move filtered to move_type=in_invoice (supplier bills = brand expenses). Per-instance: the customer provides their Odoo domain at connect time (interpolated as {shop}). ⚠️ Requires Odoo Custom plan — the external REST API is NOT available on Free/Standard.",
    auth_method: "api_key",
    api_key_header: "Authorization",
    api_key_format: "Bearer {key}",
    api_key_help_url: "https://www.odoo.com/documentation/17.0/developer/reference/external_api.html",
    api_key_help_text: "En Odoo → Preferencias → Seguridad de la cuenta → Nueva clave de API. Pega la clave y tu dominio Odoo (miempresa.odoo.com). Requiere plan Custom de Odoo (la API externa no está en Free/Standard).",
    static_headers: {
      "Accept": "application/json",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://{shop}/api/account.move?domain=[[\"move_type\",\"=\",\"in_invoice\"]]&fields=[\"name\",\"partner_id\",\"amount_total\",\"amount_untaxed\",\"amount_tax\",\"currency_id\",\"invoice_date\",\"state\",\"payment_state\"]", method: "GET", normalize_as: "odoo_bills" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
  },

  // ─── REAL PROVIDERS (Tanda 18: accounting OAuth — FreshBooks) ────────────
  // FreshBooks Expenses API. OAuth2 + Bearer. Per-account: the FreshBooks API
  // namespaces every accounting endpoint under an `accountId` that is NOT
  // returned by the OAuth callback and NOT a fixed value — it must be
  // resolved by calling GET /auth/api/v1/users/me and reading
  // business_memberships[].business.account_id.
  //
  // ⚠️ DECISIÓN DE ARQUITECTURA EN ESTE TURNO (camino 1, reuso del patrón
  // QuickBooks): el motor genérico actual NO tiene mecanismo de "post-OAuth
  // account resolution via API call". QuickBooks resuelve un problema
  // análogo (realmId per-company) pidiendo al usuario que pegue el ID a
  // mano vía requires_shop_domain + {shop} en la URL. FreshBooks reutiliza
  // EXACTAMENTE ese patrón en lugar de inventar un mecanismo nuevo en el
  // motor: el usuario pega su accountId al conectar, lo guardamos en
  // metadata_json.shop_domain, y el sync engine lo interpola como {shop}.
  // El motor no necesita ningún cambio.
  //
  // Trade-off conocido: UX peor que la "ideal" (auto-resolución vía
  // /users/me), pero a) consistente con QuickBooks/Odoo, b) cero código
  // imperativo nuevo en el registry, c) la decisión multi-membership (¿qué
  // hacer si el usuario tiene varias empresas en FreshBooks?) se delega al
  // propio usuario, que elige qué accountId pegar — ese problema sería
  // estructural si lo automatizásemos. Cuando aparezca un SEGUNDO provider
  // que también necesite post-OAuth API resolution, ahí sí merece la pena
  // construir el mecanismo genérico (regla N≥2).
  //
  // accountId ≠ businessId (ojo, el prompt lo recalca): /accounting usa
  // accountId; /timetracking y /projects usan businessId, irrelevante aquí.
  //
  // ⚠️ DEUDA ANOTADA (también dentro del normalizer):
  //   (a) Fields written from public docs + ejemplo real de respuesta;
  //       confirmar paths exactos at first real connect.
  //   (b) `expense.amount` es un OBJETO anidado { amount: "762.68", code:
  //       "USD" } — string en unidad MAYOR (no céntimos). Confirmar.
  //   (c) Sin campo directo de supplier — supplier_name=null por defecto.
  //       Hay un `vendorid` referencial pero no resuelve a nombre dentro
  //       del mismo objeto expense; degradado a null sin inventar.
  //   (d) Pagination via ?page&per_page — sync engine.
  //   (e) Token de vida corta (~12h); refresh token single-use — manejado
  //       por modeRefresh genérico, mismo path que Pennylane (RTR).
  freshbooks: {
    display_name: "FreshBooks",
    category: "accounting",
    logo: null,
    description: "FreshBooks Expenses API — OAuth2 + Bearer. Reads /accounting/account/{accountId}/expenses/expenses (supplier expenses = brand expenses). Per-account: the customer provides their FreshBooks accountId at connect time (resolved manually from /users/me; see help_text), interpolated as {shop}. Reuses the QuickBooks pattern instead of inventing a post-OAuth ID resolution mechanism in the engine.",
    auth_method: "oauth",
    auth_url: "https://my.freshbooks.com/service/auth/oauth/authorize",
    token_url: "https://api.freshbooks.com/auth/oauth/token",
    scopes: ["user:expenses:read", "user:profile:read"],
    client_id_env: "FRESHBOOKS_CLIENT_ID",
    client_secret_env: "FRESHBOOKS_CLIENT_SECRET",
    static_headers: {
      "Accept": "application/json",
      "Api-Version": "alpha",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://api.freshbooks.com/accounting/account/{shop}/expenses/expenses", method: "GET", normalize_as: "freshbooks_expenses" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
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

// Generic auth header builder. Returns { headers, plaintextToken } so callers
// can fuse static_headers and interpolate {token} for non-standard headers.
async function buildAuthHeaders(cfg, integ) {
  const authMethod = cfg.auth_method || "oauth";
  if (authMethod === "oauth") {
    const accessToken = await decryptToken(integ.access_token);
    if (!accessToken) throw new Error("No access token stored");
    return {
      headers: { "Authorization": `Bearer ${accessToken}` },
      plaintextToken: accessToken,
    };
  }
  if (authMethod === "api_key") {
    const key = await decryptToken(integ.access_token);
    if (!key) throw new Error("No API key stored");
    const header = cfg.api_key_header || "Authorization";
    const format = cfg.api_key_format || "{key}";
    return {
      headers: { [header]: format.replace("{key}", key) },
      plaintextToken: key,
    };
  }
  if (authMethod === "basic_auth") {
    // Stored as single AES blob "public:secret" → emit "Basic " + btoa(combined).
    const combined = await decryptToken(integ.access_token);
    if (!combined || !combined.includes(":")) {
      throw new Error("No valid basic_auth credentials stored");
    }
    return {
      headers: { "Authorization": `Basic ${btoa(combined)}` },
      plaintextToken: combined,
    };
  }
  throw new Error(`Unsupported auth_method: ${authMethod}`);
}

// Generic static-header fuser. Applies cfg.static_headers with {token} interp.
// No-op if cfg.static_headers is absent. Provider-agnostic.
function mergeStaticHeaders(cfg, authHeaders, plaintextToken) {
  const staticH = cfg.static_headers;
  if (!staticH || typeof staticH !== "object") return authHeaders;
  const merged = { ...authHeaders };
  for (const [name, rawValue] of Object.entries(staticH)) {
    if (typeof rawValue !== "string") continue;
    const value = rawValue.includes("{token}") && plaintextToken
      ? rawValue.replaceAll("{token}", plaintextToken)
      : rawValue;
    merged[name] = value;
  }
  return merged;
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
  // stripe_transactions (first real normalizer) — Stripe /v1/balance_transactions.
  // Cents→units (/100), lowercase→uppercase currency, UNIX seconds→ISO. Prefer reporting_category
  // over raw type. Defensive: raw.data not array → []. Pagination (has_more / starting_after)
  // is sync engine job, not this normalizer.
  // payplug_payments — PayPlug /v1/payments (French PSP). Bearer sk_live_ key + mandatory
  // PayPlug-Version header (declared via static_headers). amount is in CENTS → /100.
  // created_at/paid_at are Unix SECONDS → *1000 → ISO. Prefer paid_at over created_at.
  // Root probe: raw.data array OR bare array; no further fallback. fee:0 honest absence —
  // PayPlug payments API does NOT carry fee (lives in settlement endpoint, not wired).
  // status: is_paid=true → "paid"; else is_refunded=true → "refunded"; else null.
  // DEUDA: (a) verify endpoint + fields first connect. (b) fee:0 — settlement endpoint
  // required for real fee rate, future work. (c) ⚠️ /v1/payments ONLY lists API-created
  // payments — portal-created ones missing, may undercount volume. (d) cents (/100) +
  // Unix seconds (*1000). (e) root key probe data vs bare array — confirm. (f) pagination — sync engine.
  payplug_payments: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // Unix SECONDS → ISO. Accept number or numeric string; reject non-positive / NaN.
    const unixToIso = (v) => {
      if (v === null || v === undefined || v === "") return null;
      const seconds = typeof v === "number" ? v : parseFloat(v);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      const d = new Date(seconds * 1000);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    };
    const payments = Array.isArray(raw?.data)
      ? raw.data
      : (Array.isArray(raw) ? raw : []);
    const rows = [];
    for (const payment of payments) {
      if (!payment || typeof payment !== "object") continue;
      const id = payment?.id;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      const amount = toNum(payment?.amount) / 100;
      const rawCurrency = payment?.currency;
      const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
        ? rawCurrency
        : "EUR";
      // Prefer paid_at (when it was actually paid), fall back to created_at.
      const occurredAt = unixToIso(payment?.paid_at) ?? unixToIso(payment?.created_at);
      const status = payment?.is_paid === true
        ? "paid"
        : (payment?.is_refunded === true ? "refunded" : null);
      rows.push({
        vertical: "payments",
        external_id: String(id),
        amount,
        fee: 0, // PayPlug payments API does not carry fee — lives in settlement endpoint.
        currency,
        occurred_at: occurredAt,
        type: "payment",
        status,
      });
    }
    return rows;
  },
  // lexoffice_vouchers — Lexoffice /v1/voucherlist (German accounting, OAuth2 Bearer).
  // voucherlist is a SUMMARY endpoint; per-voucher GET carries the net/tax breakdown.
  // Filter: voucherType === "purchaseinvoice" OR "purchasecreditnote" (supplier bills + credit
  // notes = expenses); "salesinvoice" / "salescreditnote" (revenue) dropped silently.
  // Root: raw.content (Spring-style paginated wrap {content, totalPages,...}); no fallback.
  // totalAmount is typically a number in major units (toNum tolerates strings too).
  // voucherDate is ISO with TZ ("2023-04-15T00:00:00.000+02:00") — preserved AS-IS.
  // DEUDA: (a) verify endpoint + fields first connect. (b) amount_before_tax & tax = 0:
  // voucherlist is a SUMMARY without reliable net/tax breakdown — honest absence (same as
  // quickbooks_bills); per-voucher GET would be needed for the breakdown. (c) URL pre-filters
  // voucherType=purchaseinvoice, normalizer re-filters to accept purchasecreditnote too —
  // confirm if multi-value URL filter works or a second call is needed. (d) scopes [] — confirm
  // if Lexoffice requires explicit OAuth scopes. (e) page+size pagination, raw.totalPages — sync engine.
  lexoffice_vouchers: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const items = Array.isArray(raw?.content) ? raw.content : [];
    const rows = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const voucherType = item?.voucherType;
      // Accept BOTH supplier invoices and supplier credit notes (both are expenses).
      if (voucherType !== "purchaseinvoice" && voucherType !== "purchasecreditnote") continue;
      const id = item?.id;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      const flatContactName = item?.contactName;
      const supplierName = (typeof flatContactName === "string" && flatContactName.length > 0)
        ? flatContactName
        : null;
      const rawCurrency = item?.currency;
      const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
        ? rawCurrency
        : "EUR";
      const occurredAt = typeof item?.voucherDate === "string" ? item.voucherDate : null;
      const status = typeof item?.voucherStatus === "string" ? item.voucherStatus : null;
      rows.push({
        vertical: "accounting",
        direction: "expense",
        external_id: String(id),
        supplier_name: supplierName,
        amount: toNum(item?.totalAmount),
        amount_before_tax: 0, // see DEUDA (b) — voucherlist has no reliable net breakdown
        tax: 0,               // see DEUDA (b)
        fee: 0, // A voucher is an expense, not a fee.
        currency,
        occurred_at: occurredAt,
        status,
      });
    }
    return rows;
  },
  // sevdesk_vouchers — sevDesk API v1 /Voucher (German accounting). A "Voucher"
  // is the unit of accounting entry; there is NO separate supplier_invoice
  // endpoint. Filter: creditDebit === "C" (Credit = outgoing = supplier
  // voucher = expense); "D" (Debit = incoming = revenue) dropped silently.
  // Auth header is bare key (api_key_format "{key}", no "Bearer " prefix).
  // Root: raw.objects (sevDesk wraps every list in {objects:[...]}); no
  // fallback. sum* values are STRINGS in major units → parseFloat (NOT /100).
  // supplier_name: prefer flat string supplierName, else nested supplier.name,
  // else null. voucherDate may be "YYYY-MM-DD" or ISO with TZ offset
  // ("2024-01-15T00:00:00+01:00") — preserved AS-IS. status is a numeric
  // sevDesk state code (50/100/1000); stringified raw, label mapping is the
  // consumer's job.
  // DEUDA: (a) verify creditDebit C/D + sum* field names first connect.
  // (b) supplierName: string OR nested supplier.name — both handled. (c) status
  // numeric code, kept as raw string. (d) voucherDate may carry TZ — as-is.
  // (e) offset+limit pagination — sync engine.
  sevdesk_vouchers: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const vouchers = Array.isArray(raw?.objects) ? raw.objects : [];
    const rows = [];
    for (const voucher of vouchers) {
      if (!voucher || typeof voucher !== "object") continue;
      if (voucher?.creditDebit !== "C") continue; // skip revenue rows ("D")
      const id = voucher?.id;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      const flatSupplier = voucher?.supplierName;
      const supplierName = (typeof flatSupplier === "string" && flatSupplier.length > 0)
        ? flatSupplier
        : (voucher?.supplier?.name ?? null);
      const rawCurrency = voucher?.currency;
      const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
        ? rawCurrency
        : "EUR";
      const occurredAt = typeof voucher?.voucherDate === "string" ? voucher.voucherDate : null;
      const status = (voucher?.status !== null && voucher?.status !== undefined)
        ? String(voucher.status)
        : null;
      rows.push({
        vertical: "accounting",
        direction: "expense",
        external_id: String(id),
        supplier_name: supplierName,
        amount: toNum(voucher?.sumGross),
        amount_before_tax: toNum(voucher?.sumNet),
        tax: toNum(voucher?.sumTax),
        fee: 0, // A voucher is an expense, not a fee.
        currency,
        occurred_at: occurredAt,
        status,
      });
    }
    return rows;
  },
  // sevdesk_invoices — sevDesk API v1 /Invoice (customer invoice = REVENUE).
  // SISTER of sevdesk_vouchers (which reads /Voucher = expenses). Both endpoints
  // live on the same provider; this normalizer is REVENUE-only (no direction
  // field — per the CAMBRA contract, customer_invoices without `direction` mean
  // revenue, supplier rows carry `direction: "expense"`).
  //
  // Root: raw.objects (sevDesk's standard list wrapper) is the ONLY accepted
  // shape — no fallback to other roots (consistent with sevdesk_vouchers).
  // Skip lines without id.
  //
  // Amounts: invoice.sumGross is ALREADY in MAJOR currency units (NOT cents).
  // DO NOT divide by 100. This differs from Payplug/Stripe/Zettle/Square which
  // emit minor units. Anti-regression test T6 specifically guards this.
  //
  // Dates: invoice.invoiceDate may be "YYYY-MM-DD" or ISO with TZ offset
  // ("2024-01-15T00:00:00+01:00") — preserved AS-IS. If absent, occurred_at:null
  // (no invented fallback — sevDesk has no reliable alternative timestamp at
  // header level).
  //
  // Status: sevDesk uses NUMERIC state codes on /Invoice:
  //   100  → "draft"
  //   200  → "open"   (sent / awaiting payment)
  //   1000 → "paid"
  //   anything else → null (do NOT invent labels — same defensive stance as
  //   sevdesk_vouchers which stores raw numeric string for /Voucher status).
  //   ⚠️ Codes from public docs; verify against real API at first connect.
  //
  // Currency: invoice.currency arrives as ISO code (e.g. "EUR") — no Stripe-style
  // lowercase→uppercase transformation needed. Fallback "EUR" when absent.
  //
  // DEUDA: (a) verify status code mapping at first real connect — 100/200/1000
  // assumption from public docs. (b) limit/offset+countAll pagination is the
  // sync engine's job; countAll=true is hard-coded in the URL because sevDesk
  // does NOT return total count without it. (c) sumNet/sumTax not exposed at
  // this normalizer (header-level breakdown reliability TBC); add later if
  // needed via a per-invoice GET (same pattern as quickbooks_bills DEUDA b).
  sevdesk_invoices: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // sevDesk status code → CAMBRA-readable label. Anything outside the known
    // set returns null (never invent a label).
    const mapStatus = (rawStatus) => {
      if (rawStatus === null || rawStatus === undefined) return null;
      const n = typeof rawStatus === "number" ? rawStatus : parseInt(String(rawStatus), 10);
      if (n === 100) return "draft";
      if (n === 200) return "open";
      if (n === 1000) return "paid";
      return null;
    };
    const invoices = Array.isArray(raw?.objects) ? raw.objects : [];
    const rows = [];
    for (const invoice of invoices) {
      if (!invoice || typeof invoice !== "object") continue;
      const id = invoice?.id;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      const rawCurrency = invoice?.currency;
      const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
        ? rawCurrency
        : "EUR";
      const occurredAt = typeof invoice?.invoiceDate === "string" ? invoice.invoiceDate : null;
      rows.push({
        vertical: "accounting",
        external_id: String(id),
        amount: toNum(invoice?.sumGross), // ALREADY in major units — DO NOT /100
        fee: 0, // A customer invoice is revenue, not a fee.
        currency,
        occurred_at: occurredAt,
        status: mapStatus(invoice?.status),
      });
    }
    return rows;
  },
  // odoo_bills — Odoo REST /api/account.move (Odoo 17+, Custom plan only).
  // Filter: move_type === "in_invoice" (supplier bill = expense); out_invoice (revenue)
  // and any other move_type (entry, in_refund, out_refund, …) are skipped silently.
  // Root probe: raw is array → raw; raw.result array → raw.result; raw.records array → raw.records;
  // else [] (no further fallback). Relational fields are [id,"label"] tuples — relLabel(v)
  // returns v[1] only if Array.isArray(v) && v.length >= 2; if Odoo sends a bare integer (no
  // context expansion) supplier_name / currency fall back to null / "EUR" without crashing.
  // Amounts are numbers in major units. invoice_date is "YYYY-MM-DD" date-only, preserved AS-IS.
  // DEUDA: (a) ⚠️ Odoo external REST API is Custom plan only (not Free/Standard) — many
  // clients won't have access. (b) REST is Odoo 17+; older versions only XML/JSON-RPC.
  // (c) root shape not 100% standardized across Odoo versions — probed 3 forms, confirm at
  // first real connect. (d) relational fields may arrive as bare id (no [id,"label"]) when
  // context doesn't expand — handled via null fallback. (e) multi-db Odoo may require
  // X-Odoo-Database header per integration (same dynamic-header debt as Xero/Sage, now 3rd
  // API asking for it). (f) URL carries domain/fields with brackets+quotes — URL-encoding is
  // sync engine's job (same situation as QuickBooks query string). (g) offset+limit pagination — sync engine.
  odoo_bills: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // Relational field reader: Odoo emits [id, "label"] for expanded relations.
    // If unexpanded → bare integer → return null (NEVER the id as a name).
    const relLabel = (v) => (Array.isArray(v) && v.length >= 2 ? v[1] : null);
    // Root probe: 3 documented shapes across Odoo versions, no further fallback.
    const records = Array.isArray(raw)
      ? raw
      : (Array.isArray(raw?.result)
          ? raw.result
          : (Array.isArray(raw?.records) ? raw.records : []));
    const rows = [];
    for (const record of records) {
      if (!record || typeof record !== "object") continue;
      if (record?.move_type !== "in_invoice") continue; // skip revenue / refunds / entries
      const id = record?.id;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      const supplierName = relLabel(record?.partner_id);
      const currency = relLabel(record?.currency_id) || "EUR";
      const occurredAt = typeof record?.invoice_date === "string" ? record.invoice_date : null;
      rows.push({
        vertical: "accounting",
        direction: "expense",
        external_id: String(id),
        supplier_name: supplierName,
        amount: toNum(record?.amount_total),
        amount_before_tax: toNum(record?.amount_untaxed),
        tax: toNum(record?.amount_tax),
        fee: 0, // A supplier bill is an expense, not a fee.
        currency,
        occurred_at: occurredAt,
        status: record?.state ?? null,
      });
    }
    return rows;
  },
  // sage_purchase_invoices — Sage Accounting v3.1 /purchase_invoices (supplier bills = expense).
  // Root `$items` (dollar prefix, bracket notation). contact/currency/status dual object|string.
  // supplier_name = contact.name ?? contact.displayed_as (NEVER .id). currency from .id (ISO),
  // not .displayed_as. status from .displayed_as. Amounts in major units. Date date-only as-is.
  // DEUDA: (a) verify field names first real connect. (b) root `$items` confirmed in docs.
  // (c) object/string both handled. (d) full_access scope assumed. (e) Sage multi-business
  // may require per-business header (same Xero-Tenant-Id debt). (f) cursor pagination via $next/$back.
  sage_purchase_invoices: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // $items uses dollar-prefix → bracket notation only.
    const items = Array.isArray(raw?.["$items"]) ? raw["$items"] : [];
    const rows = [];
    for (const invoice of items) {
      if (!invoice || typeof invoice !== "object") continue;
      const id = invoice?.id;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      // contact: object {name, displayed_as, id} OR string id OR absent
      const contact = invoice?.contact;
      let supplierName = null;
      if (contact && typeof contact === "object") {
        supplierName = contact?.name ?? contact?.displayed_as ?? null;
      }
      // string `contact` is an opaque id — NOT a name; leave supplierName null.
      // currency: object {id, displayed_as} OR string ISO code
      const rawCurrency = invoice?.currency;
      let currency = "EUR";
      if (rawCurrency && typeof rawCurrency === "object") {
        currency = rawCurrency?.id || "EUR";
      } else if (typeof rawCurrency === "string" && rawCurrency.length > 0) {
        currency = rawCurrency;
      }
      // status: object {id, displayed_as} OR string
      const rawStatus = invoice?.status;
      let status = null;
      if (rawStatus && typeof rawStatus === "object") {
        status = rawStatus?.displayed_as ?? null;
      } else if (typeof rawStatus === "string") {
        status = rawStatus;
      }
      const occurredAt = typeof invoice?.date === "string" ? invoice.date : null;
      rows.push({
        vertical: "accounting",
        direction: "expense",
        external_id: String(id),
        supplier_name: supplierName,
        amount: toNum(invoice?.total_amount),
        amount_before_tax: toNum(invoice?.net_amount),
        tax: toNum(invoice?.tax_amount),
        fee: 0, // A purchase invoice is an expense, not a fee.
        currency,
        occurred_at: occurredAt,
        status,
      });
    }
    return rows;
  },
  // quickbooks_bills — QBO v3 /query?query=select * from Bill (Bill = supplier bill = expense).
  // Root QueryResponse.Bill (two levels, no fallback). VendorRef and CurrencyRef are OBJECTS:
  // supplier_name = VendorRef.name, currency = CurrencyRef.value (ISO). Default "USD" (not EUR,
  // QBO is US-centric). TotalAmt is number, major units. TxnDate "YYYY-MM-DD" as-is.
  // DEUDA: (a) verify fields first connect. (b) amount_before_tax & tax = 0: header has no
  // reliable tax breakdown, real tax in Line[] items (honest absence). (c) status = null:
  // no header-level status. (d) {shop} = realmId (numeric), generic helper handles strings.
  // (e) URL has spaces in query string ("select * from Bill"); fetch tolerates, encode if breaks.
  // (f) pagination via STARTPOSITION + MAXRESULTS — sync engine.
  quickbooks_bills: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const bills = Array.isArray(raw?.QueryResponse?.Bill) ? raw.QueryResponse.Bill : [];
    const rows = [];
    for (const bill of bills) {
      if (!bill || typeof bill !== "object") continue;
      const id = bill?.Id;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      const supplierName = bill?.VendorRef?.name ?? null;
      const currency = bill?.CurrencyRef?.value || "USD";
      const occurredAt = typeof bill?.TxnDate === "string" ? bill.TxnDate : null;
      rows.push({
        vertical: "accounting",
        direction: "expense",
        external_id: String(id),
        supplier_name: supplierName,
        amount: toNum(bill?.TotalAmt),
        amount_before_tax: 0, // see DEUDA (b) — tax lives in Line items
        tax: 0,               // see DEUDA (b)
        fee: 0, // A bill is an expense, not a fee.
        currency,
        occurred_at: occurredAt,
        status: null, // see DEUDA (c) — no header-level status
      });
    }
    return rows;
  },
  // xero_bills — Xero /Invoices, filter Type === "ACCPAY" (supplier bills = expense);
  // ACCREC (revenue) dropped silently. Root raw.Invoices, no fallback. Total/SubTotal/TotalTax
  // are numbers in major units. supplier_name = Contact.Name. Date is Microsoft
  // "/Date(MILLISECONDS+0000)/" — extract digits, new Date(ms).toISOString() (NOT seconds).
  // DEUDA: (a) verify fields first connect. (b) Date in /Date(ms)/ — MILLISECONDS, confirm.
  // (c) static_headers forces JSON over XML default; confirm no ?format=json also needed.
  // (d) ⚠️ Xero-Tenant-Id required in prod multi-org — NOT captured yet; same per-integration
  // dynamic-header debt as Sage. Flagged, not solved. (e) ?page=N pagination — sync engine.
  xero_bills: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const msDateToIso = (v) => {
      if (typeof v !== "string") return null;
      const m = v.match(/\/Date\((\d+)/);
      if (!m) return null;
      const ms = parseInt(m[1], 10);
      if (!Number.isFinite(ms) || ms <= 0) return null;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    };
    const invoices = Array.isArray(raw?.Invoices) ? raw.Invoices : [];
    const rows = [];
    for (const inv of invoices) {
      if (!inv || typeof inv !== "object") continue;
      if (inv?.Type !== "ACCPAY") continue; // skip revenue rows (ACCREC)
      const id = inv?.InvoiceID;
      if (id === null || id === undefined || id === "") continue; // skip without anchor
      const supplierName = inv?.Contact?.Name ?? null;
      const currency = inv?.CurrencyCode || "EUR";
      rows.push({
        vertical: "accounting",
        direction: "expense",
        external_id: String(id),
        supplier_name: supplierName,
        amount: toNum(inv?.Total),
        amount_before_tax: toNum(inv?.SubTotal),
        tax: toNum(inv?.TotalTax),
        fee: 0, // A bill is an expense, not a fee.
        currency,
        occurred_at: msDateToIso(inv?.Date),
        status: inv?.Status ?? null,
      });
    }
    return rows;
  },
  // holded_purchases — Holded /documents/purchase (purchase = supplier bill = expense).
  // Root bare array, no fallback. supplier_name = doc.contactName ?? doc.contact?.name.
  // currency uppercased ("eur" → "EUR"). date is UNIX SECONDS → new Date(s*1000).toISOString().
  // DEUDA HIGH UNCERTAINTY (docs hidden behind login):
  // (a) field names assumed from public docs, verify ALL at first connect. (b) root shape
  // assumed bare array; confirm if wrapped. (c) date assumed UNIX SECONDS — if ms, drop *1000.
  // (d) pagination — sync engine.
  holded_purchases: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const unixToIso = (v) => {
      // Accept number or numeric string; treat anything else as missing.
      if (v === null || v === undefined || v === "") return null;
      const seconds = typeof v === "number" ? v : parseFloat(v);
      if (!Number.isFinite(seconds) || seconds <= 0) return null;
      const d = new Date(seconds * 1000);
      // Invalid Date guard — defensive; only triggers on absurd inputs.
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    };
    const docs = Array.isArray(raw) ? raw : [];
    const rows = [];
    for (const doc of docs) {
      if (!doc || typeof doc !== "object") continue;
      const id = doc?.id;
      if (id === null || id === undefined || id === "") continue; // skip docs without id
      const supplierName = doc?.contactName ?? doc?.contact?.name ?? null;
      const rawCurrency = doc?.currency;
      const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
        ? rawCurrency.toUpperCase()
        : "EUR";
      rows.push({
        vertical: "accounting",
        direction: "expense", // purchase document = brand EXPENSE
        external_id: String(id),
        supplier_name: supplierName,
        amount: toNum(doc?.total),
        amount_before_tax: toNum(doc?.subtotal),
        tax: toNum(doc?.tax),
        fee: 0, // A purchase invoice is an expense, not a fee.
        currency,
        occurred_at: unixToIso(doc?.date),
        status: doc?.status ?? null,
      });
    }
    return rows;
  },
  // bigcommerce_orders — BigCommerce Orders v2 (storefront, not processor → fee:0 honest absence).
  // Root bare array, no fallback. Amounts strings, major units, parseFloat (NOT /100).
  // Status: prefer textual `status`, fall back to String(status_id).
  // date_created is RFC-2822, preserved AS-IS (NOT converted to ISO — would invent TZ).
  // DEUDA: (a) verify root + fields first connect. (b) date_created RFC-2822 as-is.
  // (c) {shop} = store_hash, generic helper handles. (d) X-Auth-Token via static_headers
  // (no code branch). (e) ?page&limit pagination — sync engine.
  bigcommerce_orders: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // v2 returns a bare array. No fallback to other root shapes.
    const orders = Array.isArray(raw) ? raw : [];
    const rows = [];
    for (const order of orders) {
      if (!order || typeof order !== "object") continue;
      const id = order?.id;
      if (id === null || id === undefined || id === "") continue; // skip orders without id
      const currency = order?.currency_code || "EUR";
      // Prefer textual status, fall back to status_id (stringified) if absent.
      const statusText = order?.status;
      const status = (typeof statusText === "string" && statusText.length > 0)
        ? statusText
        : (order?.status_id !== null && order?.status_id !== undefined
            ? String(order.status_id)
            : null);
      // date_created is RFC-2822; preserved AS-IS (no inventive ISO conversion).
      const occurredAt = typeof order?.date_created === "string" ? order.date_created : null;
      rows.push({
        vertical: "commerce",
        external_id: String(id),
        amount: toNum(order?.total_inc_tax),
        tax: toNum(order?.total_tax),
        fee: 0, // BigCommerce-as-storefront does not charge per-transaction fee.
        currency,
        occurred_at: occurredAt,
        status,
      });
    }
    return rows;
  },
  // woocommerce_orders — WooCommerce v3 /orders (storefront, not processor → fee:0 honest absence).
  // Root bare array, no fallback (NOT raw.orders — that's Shopify). Amounts strings major units.
  // Prefer date_created_gmt over date_created. date_created_gmt is UTC but WITHOUT "Z" suffix
  // ("2017-03-22T19:28:02") — preserved AS-IS, no synthetic Z.
  // DEUDA: (a) verify root + fields first connect. (b) {shop} = full domain (vs Shopify handle),
  // generic helper handles. (c) ?page&per_page + X-WP-Total — sync engine. (d) gmt lacks Z, as-is.
  woocommerce_orders: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // v3 returns a bare array. No fallback to other root shapes.
    const orders = Array.isArray(raw) ? raw : [];
    const rows = [];
    for (const order of orders) {
      if (!order || typeof order !== "object") continue;
      const id = order?.id;
      if (id === null || id === undefined || id === "") continue; // skip orders without id
      const currency = order?.currency || "EUR";
      // Prefer GMT, fall back to local-tz date_created, then null.
      const occurredAt = typeof order?.date_created_gmt === "string"
        ? order.date_created_gmt
        : (typeof order?.date_created === "string" ? order.date_created : null);
      rows.push({
        vertical: "commerce",
        external_id: String(id),
        amount: toNum(order?.total),
        tax: toNum(order?.total_tax),
        fee: 0, // WooCommerce-as-storefront does not charge per-transaction fee.
        currency,
        occurred_at: occurredAt,
        status: order?.status ?? null,
      });
    }
    return rows;
  },
  // klarna_settlements — Klarna /payouts/transactions. Fee is a SEPARATE LINE TYPE, not a field.
  // Line types per order_id: SALE (+), RETURN (refund), FEE (commission), FEE_REFUND.
  // GROUP BY order_id, emit ONE row per order: amount = sum(SALE) - sum(RETURN);
  // fee = sum(FEE) - sum(FEE_REFUND) (sign as-is, may go negative).
  // NET mode: SALE+FEE in same payout. GROSS mode: payout with only FEE lines (no SALE) is VALID
  // → emit amount:0 + fee (otherwise we silently drop fee data in GROSS).
  // amount is STRING in MAJOR units (NOT /100, different from Stripe/Zettle/Square minor units).
  // Prefer sale_date of SALE line; fallback capture_date of first line (GROSS).
  // DEUDA: (a) verify root key + fields first connect. (b) amount major units — confirm.
  // (c) NET+GROSS both supported. (d) pagination — sync engine.
  klarna_settlements: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const lines = Array.isArray(raw?.transactions) ? raw.transactions : [];
    // Group by order_id. Skip lines without order_id (no way to pair).
    const groups = new Map();
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const orderId = line?.order_id;
      if (!orderId || typeof orderId !== "string") continue;
      if (!groups.has(orderId)) groups.set(orderId, []);
      groups.get(orderId).push(line);
    }
    const rows = [];
    for (const [orderId, groupLines] of groups) {
      let saleSum = 0, returnSum = 0, feeSum = 0, feeRefundSum = 0;
      let saw = false;
      let saleLine = null;
      for (const line of groupLines) {
        const type = line?.type;
        const amt = toNum(line?.amount);
        if (type === "SALE") { saleSum += amt; saw = true; if (!saleLine) saleLine = line; }
        else if (type === "RETURN") { returnSum += amt; saw = true; }
        else if (type === "FEE") { feeSum += amt; saw = true; }
        else if (type === "FEE_REFUND") { feeRefundSum += amt; saw = true; }
      }
      if (!saw) continue; // unrecognized lines only — honest absence
      const amount = saleSum - returnSum;
      const fee = feeSum - feeRefundSum;
      const currency = groupLines[0]?.currency || "EUR";
      // Prefer sale_date of the SALE line; otherwise capture_date of first line (GROSS).
      const occurredAt = (saleLine && typeof saleLine?.sale_date === "string")
        ? saleLine.sale_date
        : (typeof groupLines[0]?.capture_date === "string" ? groupLines[0].capture_date : null);
      rows.push({
        vertical: "payments",
        external_id: orderId,
        amount,
        fee,
        currency,
        occurred_at: occurredAt,
        type: "settlement",
      });
    }
    return rows;
  },
  // square_payments — Square /v2/payments. One payment = one row (no grouping vs Zettle).
  // amount_money.amount is MINOR units → /100 (same as Stripe/Zettle).
  // processing_fee[] is ARRAY (may carry INITIAL+REFUND entries); SUM all amount_money.amount.
  // Absent/empty → fee:0 (honest absence). card_last4 from card_details.card.last_4 or null.
  // DEUDA: (a) verify field paths first connect. (b) Square-Version header REQUIRED — handled
  // via static_headers, not normalizer. (c) cursor pagination — sync engine. (d) /v2/refunds
  // is separate endpoint not wired; processing_fee may include refund entries (negative), summed as-is.
  square_payments: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const payments = Array.isArray(raw?.payments) ? raw.payments : [];
    const rows = [];
    for (const payment of payments) {
      if (!payment || typeof payment !== "object") continue;
      const id = payment?.id;
      if (id === null || id === undefined || id === "") continue; // skip payments without id
      // Amount lives in a nested object — read defensively.
      const amount = toNum(payment?.amount_money?.amount) / 100;
      const currency = payment?.amount_money?.currency || "EUR";
      // processing_fee is an array; sum every entry's amount_money.amount.
      // Absent / empty / non-array → fee: 0 (honest absence).
      const feeArr = Array.isArray(payment?.processing_fee) ? payment.processing_fee : [];
      let feeMinor = 0;
      for (const entry of feeArr) {
        if (!entry || typeof entry !== "object") continue;
        const v = entry?.amount_money?.amount;
        if (v === null || v === undefined) continue;
        feeMinor += toNum(v);
      }
      const fee = feeMinor / 100;
      const occurredAt = typeof payment?.created_at === "string" ? payment.created_at : null;
      const cardLast4 = payment?.card_details?.card?.last_4 ?? null;
      // Status whitelist — only the 5 documented Square states are preserved;
      // anything else (new state added by Square, typo, garbage) → null.
      // Decision: strict over permissive — see audit T5 in the conversation log.
      // Downstream consumers can treat `null` as "unknown" without parsing.
      const KNOWN_STATUS = ["COMPLETED", "APPROVED", "PENDING", "CANCELED", "FAILED"];
      const rawStatus = payment?.status;
      const status = KNOWN_STATUS.includes(rawStatus) ? rawStatus : null;
      rows.push({
        vertical: "payments",
        external_id: String(id),
        amount,
        fee,
        currency,
        occurred_at: occurredAt,
        status,
        location_id: payment?.location_id ?? null,
        card_last4: cardLast4,
      });
    }
    return rows;
  },
  // zettle_finance — Zettle Finance v2. Fee is a SEPARATE LINE (not field).
  // One sale = TWO lines same originatingTransactionUuid: PAYMENT (+) and PAYMENT_FEE (-).
  // GROUP BY uuid, emit ONE row: amount=PAYMENT/100, fee=abs(PAYMENT_FEE)/100 (sign normalized).
  // No PAYMENT_FEE → fee:0 honest absence. PAYMENT with negative amount = refund, emit AS-IS.
  // SKIP: PAYOUT lines (money to bank, would double-count GMV); groups without PAYMENT;
  // lines without uuid (no way to pair). Minor units → /100.
  // DEUDA: (a) verify field paths first connect. (b) currency HARDCODED "EUR" — line response
  // has no currency field; confirm source (account-level?) for multi-currency merchants.
  // (c) limit/offset pagination — sync engine.
  zettle_finance: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const lines = Array.isArray(raw?.data) ? raw.data : [];
    // Group by originatingTransactionUuid. Skip PAYOUT lines entirely and
    // lines without a uuid (no way to pair them).
    const groups = new Map();
    for (const line of lines) {
      if (!line || typeof line !== "object") continue;
      const txType = line?.originatorTransactionType;
      if (txType === "PAYOUT") continue; // not a sale
      const uuid = line?.originatingTransactionUuid;
      if (!uuid || typeof uuid !== "string") continue;
      if (!groups.has(uuid)) groups.set(uuid, []);
      groups.get(uuid).push(line);
    }
    const rows = [];
    // Counter for groups dropped due to missing PAYMENT anchor. Logged at the
    // end so a real sync surfaces this as a visible signal in console output
    // instead of swallowing data drops silently inside `continue`. Decision
    // path documented in audit T3 — the underlying drop behavior is INTENTIONALLY
    // unchanged here (we still need a real Zettle payload to know whether
    // Zettle ever emits literal "REFUND" type, or always models refunds as
    // PAYMENT with negative amount as the code currently assumes). This logging
    // is observability only, zero behavior change.
    let droppedNoAnchor = 0;
    const droppedSampleTypes = new Set();
    for (const [uuid, groupLines] of groups) {
      // Anchor line: the PAYMENT (or REFUND, which Zettle models as a
      // PAYMENT with negative amount). If absent, skip the group.
      const paymentLine = groupLines.find(l => l?.originatorTransactionType === "PAYMENT");
      if (!paymentLine) {
        droppedNoAnchor++;
        for (const l of groupLines) {
          if (l?.originatorTransactionType) droppedSampleTypes.add(l.originatorTransactionType);
        }
        continue;
      }
      const feeLine = groupLines.find(l => l?.originatorTransactionType === "PAYMENT_FEE");
      const amount = toNum(paymentLine?.amount) / 100;
      const fee = feeLine ? Math.abs(toNum(feeLine?.amount)) / 100 : 0;
      const occurredAt = typeof paymentLine?.timestamp === "string"
        ? paymentLine.timestamp
        : null;
      // Type whitelist — only the documented Zettle anchor types are preserved;
      // anything else (new type added by Zettle, garbage) → null. Consistent
      // with the same fix applied to square_payments.status. See audit T6.
      // NOTE: Zettle's documented sale-anchor types are limited to PAYMENT;
      // REFUND handling is unresolved (see T3 audit) and intentionally NOT
      // added to the whitelist here — preserving raw on unknown would
      // contradict the strict-over-permissive decision applied to Square.
      const KNOWN_TYPES = ["PAYMENT"];
      const rawType = paymentLine?.originatorTransactionType;
      const type = KNOWN_TYPES.includes(rawType) ? rawType : null;
      rows.push({
        vertical: "payments",
        external_id: uuid,
        amount,
        fee,
        currency: "EUR", // see DEUDA (b) — confirm source on first real connect
        occurred_at: occurredAt,
        type,
      });
    }
    if (droppedNoAnchor > 0) {
      // Visible signal in sync logs — picked up by sevDesk-style debugging at
      // first real connect. Sample types help diagnose whether Zettle is
      // actually emitting literal "REFUND" (the open question in T3).
      console.warn(
        `[zettle_finance] dropped ${droppedNoAnchor} group(s) with no PAYMENT anchor. ` +
        `Sample types in dropped groups: [${Array.from(droppedSampleTypes).join(", ")}]. ` +
        `If "REFUND" appears here, T3 is real — refunds are being silently lost.`
      );
    }
    return rows;
  },
  // pennylane_supplier_invoices — supplier invoices = brand EXPENSES, propagates supplier_name.
  // Twin of pennylane_invoices but adds direction:"expense" + supplier_name (Klaviyo, EDF, etc).
  // CONTRATO ASIMÉTRICO con cerebro: customer_invoices (no direction) = revenue;
  // supplier_invoices (direction:"expense") = expense. Intentional, NOT a bug.
  // Reads items[] only, no fallback. STRING amounts, fee:0 honest, date as-is, skip no-id.
  // DEUDA: (a) verify fields first connect. (b) cursor pagination + 2-4 req/s — sync engine.
  // (c) CORE of 3-source spend model — long tail of infra spend lives here.
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
  // pennylane_invoices — Pennylane v2 customer_invoices = GROSS REVENUE (NOT fee, NOT expense).
  // Root items[] only, NO fallback to data[] or root. amount=currency_amount (with tax),
  // amount_before_tax + tax propagated separately for downstream net/gross reconstruction.
  // STRING amounts, parseFloat. fee:0 honest invariant. date date-only as-is, no synthetic UTC.
  // DEUDA: (a) customer_invoices = revenue; supplier_invoices wired separately (sibling normalizer).
  // (b) cursor pagination + 2-4 req/s rate limits — sync engine. (c) verify fields first connect.
  // (d) companies:readonly scope format assumed.
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
  // sendcloud_shipments — Sendcloud v3 /shipments. Maps SHIPPING VOLUME only (weight, count, dates).
  // cost:0 HONEST ABSENCE — real carrier rate lives in /shipping-options/rates (separate endpoint).
  // Granularity: ONE ROW PER PARCEL (not per shipment). order_price repeated per parcel as context
  // — MUST NOT be summed at portfolio level without dedup by shipment_id.
  // external_id = shipment.id + ":" + parcel.id (compound for context).
  // Skip: shipments without parcels[]; parcels without id.
  // DEUDA: (a) cost:0 invariant — carrier rate is separate endpoint. (b) v3 cursor pagination
  // (base64) — sync engine. (c) verify fields first connect.
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
  // shopify_orders — Shopify REST /orders.json (storefront, not processor → fee:0 honest absence).
  // Two money forms: flat total_price OR nested total_price_set.shop_money.amount; prefer flat,
  // fallback to nested. Amounts strings major units. Dates ISO as-is. financial_status preserved.
  // ⚠️ DEUDA GRANDE: (a) REST Admin LEGACY since Oct 2024 — Shopify pushes GraphQL; may need
  // shopify_orders_gql sibling + sync engine change (cursor pageInfo.endCursor). (b) without
  // read_all_orders scope: REST returns only last 60 days; extended requires Shopify approval.
  // (c) cursor pagination via Link header — sync engine. (d) data_type still "transactions",
  // flip to "commerce" when CAMBRA introduces that bucket.
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
  // paypal_transactions — PayPal /v1/reporting/transactions. Money objects {currency_code,value}.
  // fee_amount.value comes NEGATIVE (PayPal models as debit); CAMBRA fee≥0 → Math.abs (sign
  // normalized, magnitude untouched). external_id = transaction_id + ":" + date (same tx_id can
  // appear on multiple pages with different event codes). Skip items without transaction_info.
  // DEUDA: written from docs + example, NOT real payload. Transaction Search API requires PayPal
  // approval. Verify field paths + sign conventions first connect. Pagination — sync engine.
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
  // mollie_settlements — Mollie /v2/settlements (Payments object has no fee — fee aggregated
  // per method in settlements.costs[]). One settlement → N rows (one per method: iDEAL, PayPal...).
  // Defensive nesting probe: costs may be at root, in periods[], or year→month nested.
  // Supports both _embedded.settlements wrap and bare single settlement.
  // DEUDA: written from DOCS not real payload. `periods` nesting can shift by API version.
  // amount.net/vat/gross are strings. Pagination via _links.next — sync engine.
  // Requires settlements.read scope; payments.read kept for future refunds/disputes endpoint.
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
  // freshbooks_expenses — FreshBooks /accounting/account/{accountId}/expenses/expenses.
  // Supplier expenses = brand EXPENSES. Root nested at raw.response.result.expenses[] —
  // NO fallback to bare array or other shapes (FreshBooks documented contract).
  // ⚠️ amount es un OBJETO anidado: expense.amount = { amount: "762.68", code: "USD" }.
  // Punto de fallo más fácil: copiar patrón de otros normalizers con amount plano y
  // leer expense.amount directamente como string → daría NaN. Extraemos amount.amount
  // (string en unidad MAYOR, NO céntimos, NO /100) Y amount.code en el mismo paso.
  // Multi-currency: la API NO convierte divisas; cada fila conserva su currency real,
  // sin inventar tasa de cambio.
  // Sin campo directo de supplier en el objeto expense → supplier_name=null (NO inventar).
  // billable: reflejado tal cual, sin filtrar por defecto.
  // direction:"expense" fijo (endpoint exclusivo de gastos).
  // DEUDA: (a) confirmar paths first real connect. (b) amount.amount = string mayor,
  // confirmar. (c) supplier_name=null por ausencia honesta — añadir si aparece vendor
  // expandido en respuesta real. (d) page/per_page pagination — sync engine.
  freshbooks_expenses: (raw) => {
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    // FreshBooks documented contract: raw.response.result.expenses[]. No fallback.
    const expenses = Array.isArray(raw?.response?.result?.expenses) ? raw.response.result.expenses : [];
    const rows = [];
    for (const expense of expenses) {
      if (!expense || typeof expense !== "object") continue;
      const id = expense?.id;
      if (id === null || id === undefined || id === "") continue; // skip expenses without id
      // amount is a nested object { amount: "762.68", code: "USD" }.
      // Read defensively: if the object is missing, BOTH amount and currency are null,
      // but the row is still emitted (only missing `id` discards the row).
      const amountObj = expense?.amount;
      const amount = (amountObj && typeof amountObj === "object" && amountObj.amount !== undefined && amountObj.amount !== null && amountObj.amount !== "")
        ? toNum(amountObj.amount, null)
        : null;
      const currency = (amountObj && typeof amountObj === "object" && typeof amountObj.code === "string" && amountObj.code.length > 0)
        ? amountObj.code
        : null;
      const occurredAt = typeof expense?.date === "string" ? expense.date : null;
      rows.push({
        vertical: "accounting",
        direction: "expense", // FreshBooks expenses endpoint = brand EXPENSE
        external_id: String(id),
        supplier_name: null, // no direct supplier field in expense object — honest absence
        amount,
        amount_before_tax: 0, // expense object carries no reliable net breakdown
        tax: 0,               // tax sits on a separate taxes[] structure not wired today
        fee: 0,               // An expense is not a fee.
        currency,
        billable: typeof expense?.billable === "boolean" ? expense.billable : null,
        occurred_at: occurredAt,
        status: expense?.status !== undefined && expense?.status !== null ? String(expense.status) : null,
      });
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

// ─── Integration Data Quality Score (Opción B, Fase 2) ─────────────────────
// Reads the static `known_data_gaps` metadata from the provider's REGISTRY
// entry and projects it into a per-sync-run snapshot stored on Integration.
// Single fixed step on purpose: 100 if no gaps in the registry, 70 if any.
// Per-gap severity weighting is FUTURE WORK (decisión de producto).
//
// INVARIANTE: this is PURELY INFORMATIONAL. It must NEVER be read by:
//   - computeVerticalStatus (different metric: onboarding profile completeness)
//   - generateRecommendations (decisión de producto pendiente)
//   - savings / benchmarks / confidence calculations
// Connecting it to recommendation confidence requires explicit human decision.
function computeIntegrationDataQuality(cfg) {
  const gaps = Array.isArray(cfg?.known_data_gaps) ? cfg.known_data_gaps : [];
  if (gaps.length === 0) {
    return {
      completeness_pct: 100,
      known_gaps: [],
      evidence: "",
      computed_at: new Date().toISOString(),
    };
  }
  return {
    completeness_pct: 70,
    known_gaps: [...gaps],
    evidence: `Provider API has known structural gaps: ${gaps.join(", ")}`,
    computed_at: new Date().toISOString(),
  };
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
          const { headers: authHeaders, plaintextToken } = await buildAuthHeaders(cfg, integ);
          // Fuse static headers declared in the registry (e.g. API version,
          // alternate auth header). No-op for providers without
          // static_headers — exact same headers as before this change.
          const finalAuthHeaders = mergeStaticHeaders(cfg, authHeaders, plaintextToken);
          // Interpolate {shop} per-endpoint using the value stored at
          // connect time. No-op for providers without {shop}.
          const endpointUrl = interpolateShopDomain(ep.url, integ.metadata_json?.shop_domain || null);
          const res = await fetch(endpointUrl, {
            method: ep.method || "GET",
            headers: { ...finalAuthHeaders, "Accept": "application/json" },
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

      // Compute integration_data_quality from the registry's known_data_gaps.
      // Purely informational — see invariant above. Runs for every provider:
      // those without known_data_gaps get completeness_pct=100, known_gaps=[].
      const integrationDataQuality = computeIntegrationDataQuality(cfg);

      await base44.asServiceRole.entities.Integration.update(integ.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: "success",
        last_error: null,
        integration_data_quality: integrationDataQuality,
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