/**
 * dataSyncAgent — Generic data reader. Reads cfg.data_endpoints + cfg.data_type
 * from REGISTRY, fetches, normalizes into CAMBRA spend format. Risk 0 (read-only).
 * Emits AgentTask + Event. Tenant-isolated.
 * In: { integration_id }  Out: { ok, agent_task_id, records_count, normalized_sample }
 * ⚠️ REGISTRY duplicated verbatim in oauthConnector.js — Deno cannot share imports.
 *    Edit BOTH files together when adding a provider.
 */

import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";
import { internalErrorResponse } from '../../shared/publicErrors.ts';
import { assertPublicDns, normalizePublicHttpsUrl } from '../../shared/publicHttpEgress.ts';
import {
  isIntegrationCredentialBoundaryError,
  readIntegrationCredential,
  resolveOwnedIntegrationForActor,
} from '../../shared/integrationCredentials.ts';

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
    // Kept in sync with oauthConnector (registry duplication note): Stripe
    // blocks new read-only Connect connections without prior approval, so the
    // authorize flow requests read_write. CAMBRA still only reads (GET-only sync).
    scopes: ["read_write"],
    client_id_env: "STRIPE_CLIENT_ID",
    client_secret_env: "STRIPE_SECRET_KEY",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.stripe.com/v1/balance_transactions?limit=100", method: "GET", normalize_as: "stripe_transactions" },
    ],
    pagination: { style: "cursor_stripe" },
    date_range: { since_param: "created[gte]", until_param: "created[lte]", format: "unix" },
    rate_limit: { rps: 25 },
    demo_mode: false,
  },
  // stripe_self — Admin-only dogfooding path. Reads CAMBRA's own Stripe account
  // as a data source using the platform's own STRIPE_SECRET_KEY (read-only).
  // Not for clients — this bypasses Stripe Connect OAuth entirely.
  // Reuses the stripe_transactions normalizer, cursor_stripe pagination,
  // date-range and rate-limit already validated by the mainline `stripe` slug.
  // ⚠️ DEUDA (dogfooding-only): `admin_only` is SEMANTIC ONLY today — the
  // engine does not currently gate creation or invocation on it. Before
  // client cohabitation, add a real check in dataSyncAgent handler and in
  // whatever UI/backend surfaces let a user create Integrations, refusing
  // provider slugs where cfg.admin_only === true unless user.role === "admin".
  stripe_self: {
    display_name: "Stripe (CAMBRA self)",
    category: "payments",
    logo: null,
    description: "Static-secret bypass for connecting CAMBRA's own Stripe account (dogfooding). Uses STRIPE_SECRET_KEY as Bearer directly — no OAuth. Read-only.",
    auth_method: "static_secret",
    static_secret_env: "STRIPE_SECRET_KEY",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.stripe.com/v1/balance_transactions?limit=100", method: "GET", normalize_as: "stripe_transactions" },
    ],
    pagination: { style: "cursor_stripe" },
    date_range: { since_param: "created[gte]", until_param: "created[lte]", format: "unix" },
    rate_limit: { rps: 25 },
    admin_only: true,
    demo_mode: false,
  },
  // stripe_self_test — Admin-only VALIDATION path against Stripe test mode.
  // Same shape as stripe_self but reads STRIPE_TEST_SECRET_KEY (sk_test_...).
  // Purpose: feed the sync engine + normalizer with a controlled dataset that
  // has real fees, refunds, disputes → assert sum(amount)/sum(fee) match
  // Stripe's own Dashboard totals for the same window. Read-only. Aditivo puro.
  // Same admin_only semantic caveat as stripe_self (see comment above).
  stripe_self_test: {
    display_name: "Stripe (CAMBRA test-mode validation)",
    category: "payments",
    logo: null,
    description: "Static-secret bypass targeting Stripe TEST mode for engine validation. Uses STRIPE_TEST_SECRET_KEY (sk_test_...). Read-only.",
    auth_method: "static_secret",
    static_secret_env: "STRIPE_TEST_SECRET_KEY",
    data_type: "transactions",
    data_endpoints: [
      { url: "https://api.stripe.com/v1/balance_transactions?limit=100", method: "GET", normalize_as: "stripe_transactions" },
    ],
    pagination: { style: "cursor_stripe" },
    date_range: { since_param: "created[gte]", until_param: "created[lte]", format: "unix" },
    rate_limit: { rps: 25 },
    admin_only: true,
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
      { url: "https://api.mollie.com/v2/settlements?limit=100", method: "GET", normalize_as: "mollie_settlements" },
    ],
    pagination: { style: "cursor_hal_body" },
    date_range: { since_param: "from", until_param: "until", format: "iso" },
    rate_limit: { rps: 5 },
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
  // REGISTRY rationale (X-Auth-Token, known_data_gaps): src/docs/normalizers-contracts.md#registrybigcommerce--x-auth-token-via-static_headers
  bigcommerce: {
    display_name: "BigCommerce",
    category: "commerce",
    logo: null,
    description: "BigCommerce Orders v2 — API key in X-Auth-Token header (declared via static_headers). Per-store: the customer provides their store_hash at connect time, interpolated as {shop}.",
    known_data_gaps: ["refunds_not_inline_v2"],
    auth_method: "api_key",
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
    description: "Xero Accounting API — OAuth2 + Bearer. Reads /Invoices and the normalizer filters to ACCPAY (supplier bills = brand expenses). Uses the generic static_headers mechanism to force JSON output (Xero defaults to XML) AND to inject the per-integration Xero-Tenant-Id header (interpolated from shop_domain). The customer pastes their Tenant-Id at connect time — same UX pattern as QuickBooks realmId, only the value rides in a header instead of the URL.",
    auth_method: "oauth",
    auth_url: "https://login.xero.com/identity/connect/authorize",
    token_url: "https://identity.xero.com/connect/token",
    scopes: ["accounting.transactions.read", "offline_access"],
    client_id_env: "XERO_CLIENT_ID",
    client_secret_env: "XERO_CLIENT_SECRET",
    static_headers: {
      "Accept": "application/json",
      "Xero-Tenant-Id": "{shop}",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://api.xero.com/api.xro/2.0/Invoices", method: "GET", normalize_as: "xero_bills" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
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
    description: "Sage Business Cloud Accounting API v3.1 — OAuth2 + Bearer. Reads /purchase_invoices (supplier invoices = brand expenses). Root key is `$items` (dollar prefix). The normalizer handles dual object/string forms for contact, currency, and status. Uses generic static_headers to force JSON output AND to inject the per-integration X-Business header (interpolated from shop_domain) — Sage scopes data to one business per call when the user has multiple businesses. Same UX pattern as Xero Tenant-Id.",
    auth_method: "oauth",
    auth_url: "https://www.sageone.com/oauth2/auth/central",
    token_url: "https://oauth.accounting.sage.com/token",
    scopes: ["full_access"],
    client_id_env: "SAGE_CLIENT_ID",
    client_secret_env: "SAGE_CLIENT_SECRET",
    static_headers: {
      "Accept": "application/json",
      "X-Business": "{shop}",
    },
    data_type: "invoices",
    data_endpoints: [
      { url: "https://api.accounting.sage.com/v3.1/purchase_invoices", method: "GET", normalize_as: "sage_purchase_invoices" },
    ],
    demo_mode: false,
    requires_shop_domain: true,
  },

  // Mirror of payplug — same contract, both files identical.
  // REGISTRY rationale (known_data_gaps + DataQualityScore wiring deuda): src/docs/normalizers-contracts.md#registrypayplug--known_data_gaps
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
      { url: "https://api.payplug.com/v1/payments?per_page=100&page=1", method: "GET", normalize_as: "payplug_payments" },
    ],
    pagination: { style: "page_number", page_param: "page", size_param: "per_page", page_size: 100, array_root: "data" },
    date_range: { since_param: "created_at_from", until_param: "created_at_to", format: "unix" },
    rate_limit: { rps: 4 },
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
    // REGISTRY rationale (two endpoints + countAll + token-user binding): src/docs/normalizers-contracts.md#registrysevdesk--two-endpoints-on-the-same-provider
    data_endpoints: [
      { url: "https://my.sevdesk.de/api/v1/Voucher", method: "GET", normalize_as: "sevdesk_vouchers" },
      { url: "https://my.sevdesk.de/api/v1/Invoice?limit=100&offset=0&countAll=true", method: "GET", normalize_as: "sevdesk_invoices" },
    ],
    demo_mode: false,
  },

  // Mirror of odoo — same contract, both files identical.
  // ⚠️ DEUDA ESTRUCTURAL (multi-db, X-Odoo-Database): src/docs/normalizers-contracts.md#registryodoo--deuda-estructural-confirmada-multi-db
  odoo: {
    display_name: "Odoo",
    category: "accounting",
    logo: null,
    description: "Odoo REST API (Odoo 17+) — API key as Bearer. Reads account.move filtered to move_type=in_invoice (supplier bills = brand expenses). Per-instance: the customer provides their Odoo domain at connect time (interpolated as {shop}). ⚠️ Requires Odoo Custom plan — the external REST API is NOT available on Free/Standard. ⚠️ Multi-db Odoo additionally requires an X-Odoo-Database header — NOT implemented (would need an N>1 per-integration mechanism, same structural blocker as Zoho region+org_id).",
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

  // Mirror of freshbooks — same contract, both files identical.
  // REGISTRY rationale (accountId resolution, camino 1 vs auto-resolve, accountId≠businessId, deuda completa):
  // src/docs/normalizers-contracts.md#registryfreshbooks--requires_shop_domain-for-accountid
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

async function assertCredentialTarget(rawUrl, expectedOrigin) {
  const url = normalizePublicHttpsUrl(rawUrl);
  if (expectedOrigin && url.origin !== expectedOrigin) {
    throw new Error('provider_pagination_origin_mismatch');
  }
  await assertPublicDns(url);
  return url.toString();
}

// Generic auth header builder. Returns { headers, plaintextToken } so callers
// can fuse static_headers and interpolate {token} for non-standard headers.
async function buildAuthHeaders(cfg, credential) {
  const authMethod = cfg.auth_method || "oauth";
  if (authMethod === "oauth") {
    const accessToken = await decryptToken(credential?.encrypted_access_token);
    if (!accessToken) throw new Error("No access token stored");
    return {
      headers: { "Authorization": `Bearer ${accessToken}` },
      plaintextToken: accessToken,
    };
  }
  if (authMethod === "api_key") {
    const key = await decryptToken(credential?.encrypted_access_token);
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
    const combined = await decryptToken(credential?.encrypted_access_token);
    if (!combined || !combined.includes(":")) {
      throw new Error("No valid basic_auth credentials stored");
    }
    return {
      headers: { "Authorization": `Basic ${btoa(combined)}` },
      plaintextToken: combined,
    };
  }
  if (authMethod === "static_secret") {
    // Admin-only dogfooding path. Reads the secret directly from Deno.env —
    // NEVER from the DB (IntegrationCredential is unused for this auth method).
    // Used for connecting CAMBRA's own accounts as data sources without
    // building the full OAuth Connect flow. Read-only — the sync engine
    // only issues GET requests. See registry entry `stripe_self`.
    const envName = cfg.static_secret_env;
    if (!envName) throw new Error("static_secret auth requires static_secret_env in registry");
    const key = Deno.env.get(envName);
    if (!key) throw new Error(`Missing env var ${envName} for static_secret auth`);
    return {
      headers: { "Authorization": `Bearer ${key}` },
      plaintextToken: key,
    };
  }
  throw new Error(`Unsupported auth_method: ${authMethod}`);
}

// Generic static-header fuser. Applies cfg.static_headers with two interp
// tokens: {token} (the plaintext access token, for non-standard auth headers)
// and {shop} (the per-integration shop_domain, for dynamic per-tenant headers
// like Xero-Tenant-Id or Sage X-Business). Both interp tokens are independent
// — a header value can use either, both, or neither. No-op if cfg.static_headers
// is absent. Provider-agnostic — the engine never names a provider.
//
// {shop} interpolation rationale: providers like Xero/Sage need a per-tenant
// identifier in a HEADER (not in the URL like Shopify/WooCommerce). The
// captured value lives in integ.metadata_json.shop_domain — same slot used
// by URL-side {shop}. ONE source of truth per integration.
// SYNC-START: mergeStaticHeaders
function mergeStaticHeaders(cfg, authHeaders, plaintextToken, shopDomain) {
  const staticH = cfg.static_headers;
  if (!staticH || typeof staticH !== "object") return authHeaders;
  const merged = { ...authHeaders };
  for (const [name, rawValue] of Object.entries(staticH)) {
    if (typeof rawValue !== "string") continue;
    let value = rawValue;
    if (value.includes("{token}") && plaintextToken) {
      value = value.replaceAll("{token}", plaintextToken);
    }
    if (value.includes("{shop}")) {
      // Fail-fast — symmetric with interpolateShopDomain() above, which throws
      // the equivalent "in this URL" error. A missing shop_domain at sync time
      // for a provider that declares {shop} in a header value is a
      // configuration bug (e.g. integration migrated without metadata_json
      // backfill); silently sending the literal placeholder to the provider
      // would produce a confusing 400/401 from their side instead of a clear
      // error on ours.
      if (!shopDomain) throw new Error("shop_domain is required to interpolate {shop} in this header value");
      value = value.replaceAll("{shop}", shopDomain);
    }
    merged[name] = value;
  }
  return merged;
}
// SYNC-END: mergeStaticHeaders

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
  // payplug_payments — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#payplug_payments
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
  // lexoffice_vouchers — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#lexoffice_vouchers
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
  // sevdesk_vouchers — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#sevdesk_vouchers
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
  // sevdesk_invoices — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#sevdesk_invoices
  // Status code map 100/200/1000 → draft/open/paid; unknowns → null (whitelist).
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
  // odoo_bills — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#odoo_bills
  // Root probe: raw | raw.result | raw.records. Relational fields are [id,"label"] tuples.
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
  // sage_purchase_invoices — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#sage_purchase_invoices
  // Root `$items` (bracket notation). contact/currency/status dual object|string.
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
  // quickbooks_bills — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#quickbooks_bills
  // Root QueryResponse.Bill. Default currency "USD" (QBO is US-centric, not EUR).
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
  // xero_bills — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#xero_bills
  // Filter Type === "ACCPAY". Date is Microsoft /Date(ms)/ — MILLISECONDS, not seconds.
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
  // holded_purchases — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#holded_purchases
  // ⚠️ HIGH UNCERTAINTY: docs hidden behind login. date assumed UNIX SECONDS.
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
  // bigcommerce_orders — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#bigcommerce_orders
  // Storefront, not processor → fee:0 honest absence. Refunds NOT inline in v2.
  // SYNC-START: bigcommerceNormalizer
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
  // SYNC-END: bigcommerceNormalizer
  // woocommerce_orders — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#woocommerce_orders
  // Root bare array (NOT raw.orders — that's Shopify). date_created_gmt UTC sin Z, AS-IS.
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
  // klarna_settlements — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#klarna_settlements
  // Fee is a SEPARATE LINE TYPE (not field). GROUP BY order_id; NET and GROSS modes supported.
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
  // square_payments — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#square_payments
  // One payment = one row (no grouping). Status whitelist (5 known states); unknown → null.
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
  // zettle_finance — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#zettle_finance
  // Fee is a SEPARATE LINE. GROUP BY originatingTransactionUuid. Skip PAYOUT (would double-count).
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
  // pennylane_supplier_invoices — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#pennylane_supplier_invoices
  // Supplier invoices = EXPENSES (direction:"expense" + supplier_name). Asymmetric vs revenue twin.
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
  // pennylane_invoices — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#pennylane_invoices
  // customer_invoices = GROSS REVENUE. Twin of pennylane_supplier_invoices (expenses).
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
  // sendcloud_shipments — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#sendcloud_shipments
  // ONE ROW PER PARCEL (not per shipment). cost:0 — real carrier rate in separate endpoint.
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
  // shopify_orders — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#shopify_orders
  // ⚠️ REST LEGACY since Oct 2024; GraphQL migration pending. Two money forms (flat | nested).
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
  // paypal_transactions — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#paypal_transactions
  // fee_amount.value comes NEGATIVE → Math.abs (CAMBRA fee≥0). external_id compound.
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
  // mollie_settlements — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#mollie_settlements
  // One settlement → N rows (per method). Defensive nesting probe (root | periods | year→month).
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
  // freshbooks_expenses — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#freshbooks_expenses
  // ⚠️ amount es un OBJETO anidado { amount: "762.68", code: "USD" }, NO un escalar plano.
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
  // stripe_transactions — Contrato completo + DEUDA: src/docs/normalizers-contracts.md#stripe_transactions
  // Funcionalmente equivalente (no byte-verbatim) a src/lib/normalizers/stripe.js.
  // SYNC-START: stripeNormalizer
  stripe_transactions: (raw) => {
    const KNOWN_TYPES = [
      "charge", "refund", "dispute", "payout", "transfer",
      "stripe_fee", "application_fee", "adjustment",
    ];
    const toNum = (v, fallback = 0) => {
      if (v === null || v === undefined || v === "") return fallback;
      const n = typeof v === "number" ? v : parseFloat(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const mapType = (rawType) => {
      if (typeof rawType !== "string") return null;
      if (rawType === "application_fee_refund") return "application_fee";
      if (KNOWN_TYPES.includes(rawType)) return rawType;
      return null;
    };
    const rows = Array.isArray(raw?.data) ? raw.data : [];
    const out = [];
    for (const tx of rows) {
      if (!tx || typeof tx !== "object") continue;
      const id = tx?.id;
      if (id === null || id === undefined || id === "") continue; // skip sin anchor
      const rawType = tx?.reporting_category ?? tx?.type ?? null;
      const type = mapType(rawType);
      const rawCurrency = tx?.currency;
      const currency = (typeof rawCurrency === "string" && rawCurrency.length > 0)
        ? rawCurrency.toUpperCase()
        : "EUR";
      const createdSec = toNum(tx?.created, 0);
      const occurredAt = createdSec > 0 ? new Date(createdSec * 1000).toISOString() : null;
      out.push({
        vertical: "payments",
        external_id: String(id),
        amount: toNum(tx?.amount) / 100,
        fee: toNum(tx?.fee) / 100,
        net: toNum(tx?.net) / 100,
        currency,
        occurred_at: occurredAt,
        type,
      });
    }
    return out;
  },
  // SYNC-END: stripeNormalizer
  // Generic legacy normalizers (smoke-test only):
  //   - transactions: used ONLY by demo_provider
  //   - shipments:    used ONLY by demo_apikey_provider + demo_basicauth_provider
  // Real providers each have a dedicated normalizer above. Do NOT extend.
  // (`invoices` removed in B3 cleanup — was zero-referenced; no real or demo provider used it.)
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

// ─── Sync engine: pagination + date-range + rate-limit ─────────────────────
// Funcionalmente equivalente (NO byte-verbatim) a src/lib/syncEngine/*.
// Detalle: src/docs/normalizers-contracts.md#sync-engine-duplication-notes

// SYNC-START: paginators
// --- paginators -------------------------------------------------------------
function _engineSyncWithQueryParam(url, key, value) {
  const [base, search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  params.set(key, value);
  return `${base}?${params.toString()}`;
}
function _engineSyncWithQueryParams(url, kvPairs) {
  const [base, search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  for (const [k, v] of Object.entries(kvPairs)) params.set(k, v);
  return `${base}?${params.toString()}`;
}
function _paginatorCursorStripe(raw, _h, currentUrl) {
  const data = Array.isArray(raw?.data) ? raw.data : [];
  if (!raw?.has_more || data.length === 0) return { nextUrl: null, nextCursor: null };
  const lastId = data[data.length - 1]?.id;
  if (!lastId) return { nextUrl: null, nextCursor: null };
  return { nextUrl: _engineSyncWithQueryParam(currentUrl, "starting_after", lastId), nextCursor: lastId };
}
function _paginatorCursorHalBody(raw) {
  const next = raw?._links?.next?.href;
  if (!next || typeof next !== "string") return { nextUrl: null, nextCursor: null };
  return { nextUrl: next, nextCursor: next };
}
function _paginatorPageNumber(raw, _h, currentUrl, cfg) {
  const pageParam = cfg?.page_param || "page";
  const sizeParam = cfg?.size_param || "per_page";
  const pageSize = cfg?.page_size || 100;
  const arrayRoot = cfg?.array_root;
  let arr;
  if (arrayRoot && typeof arrayRoot === "string") arr = raw?.[arrayRoot];
  else if (Array.isArray(raw?.data)) arr = raw.data;
  else if (Array.isArray(raw)) arr = raw;
  else arr = [];
  arr = Array.isArray(arr) ? arr : [];
  if (arr.length === 0 || arr.length < pageSize) return { nextUrl: null, nextCursor: null };
  const [, search = ""] = currentUrl.split("?");
  const params = new URLSearchParams(search);
  const currentPage = parseInt(params.get(pageParam) || `${cfg?.start_page || 1}`, 10);
  const nextPage = (Number.isFinite(currentPage) ? currentPage : 1) + 1;
  return {
    nextUrl: _engineSyncWithQueryParams(currentUrl, { [pageParam]: String(nextPage), [sizeParam]: String(pageSize) }),
    nextCursor: String(nextPage),
  };
}
function _paginatorLinkHeader(_raw, headers) {
  const v = headers?.get?.("Link") || headers?.get?.("link");
  if (!v) return { nextUrl: null, nextCursor: null };
  for (const part of v.split(",").map(s => s.trim())) {
    const m = part.match(/^<([^>]+)>\s*;\s*rel="?next"?/i);
    if (m) return { nextUrl: m[1], nextCursor: m[1] };
  }
  return { nextUrl: null, nextCursor: null };
}
function _paginatorOffsetLimit(raw, _h, currentUrl, cfg) {
  const offsetParam = cfg?.offset_param || "offset";
  const limitParam = cfg?.limit_param || "limit";
  const pageSize = cfg?.page_size || 100;
  const arrayRoot = cfg?.array_root;
  let arr;
  if (arrayRoot && typeof arrayRoot === "string") arr = raw?.[arrayRoot];
  else if (Array.isArray(raw?.objects)) arr = raw.objects;
  else if (Array.isArray(raw?.data)) arr = raw.data;
  else if (Array.isArray(raw)) arr = raw;
  else arr = [];
  arr = Array.isArray(arr) ? arr : [];
  if (arr.length === 0 || arr.length < pageSize) return { nextUrl: null, nextCursor: null };
  const [, search = ""] = currentUrl.split("?");
  const params = new URLSearchParams(search);
  const currentOffset = parseInt(params.get(offsetParam) || "0", 10);
  const nextOffset = (Number.isFinite(currentOffset) ? currentOffset : 0) + pageSize;
  return {
    nextUrl: _engineSyncWithQueryParams(currentUrl, { [offsetParam]: String(nextOffset), [limitParam]: String(pageSize) }),
    nextCursor: String(nextOffset),
  };
}
function _paginatorNull() { return { nextUrl: null, nextCursor: null }; }
function getPaginator(style) {
  if (style === "cursor_stripe")   return _paginatorCursorStripe;
  if (style === "cursor_hal_body") return _paginatorCursorHalBody;
  if (style === "page_number")     return _paginatorPageNumber;
  if (style === "link_header")     return _paginatorLinkHeader;
  if (style === "offset_limit")    return _paginatorOffsetLimit;
  return _paginatorNull;
}
// SYNC-END: paginators

// SYNC-START: dateRange
// --- date range -------------------------------------------------------------
const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
// BUG-4 FIX (2026-07-09) — settlement-delay overlap for incremental syncs.
// Providers like Stripe backdate balance_transactions by hours (payout batch,
// dispute resolution). Reading strictly from the persisted cursor would miss
// those late arrivals. We subtract 24h at READ time (not stored in the cursor
// value itself — the cursor stays the true high-water mark). Downstream
// dedupes by external_id, so a small re-read window is free.
const CURSOR_READ_OVERLAP_MS = 24 * 60 * 60 * 1000;
function computeSyncWindow({ lastSyncedUntil, now = new Date() }) {
  const until = new Date(now.getTime());
  let since;
  if (lastSyncedUntil) {
    const parsed = new Date(lastSyncedUntil);
    if (Number.isFinite(parsed.getTime())) {
      // Apply overlap in the READ, not in the stored value.
      since = new Date(parsed.getTime() - CURSOR_READ_OVERLAP_MS);
    } else {
      since = new Date(now.getTime() - TWELVE_MONTHS_MS);
    }
  } else {
    since = new Date(now.getTime() - TWELVE_MONTHS_MS);
  }
  return { since, until };
}
function _formatDateValue(date, format) {
  if (format === "unix") return String(Math.floor(date.getTime() / 1000));
  if (format === "iso_date") return date.toISOString().slice(0, 10);
  return date.toISOString();
}
function applyDateRangeToUrl(url, cfg, window) {
  if (!cfg || typeof cfg !== "object") return url;
  if (!url || typeof url !== "string") return url;
  if (!window?.since || !window?.until) return url;
  const sinceParam = cfg.since_param;
  const untilParam = cfg.until_param;
  const format = cfg.format || "iso";
  if (!sinceParam) return url;
  const [base, search = ""] = url.split("?");
  const params = new URLSearchParams(search);
  params.set(sinceParam, _formatDateValue(window.since, format));
  if (untilParam) params.set(untilParam, _formatDateValue(window.until, format));
  return `${base}?${params.toString()}`;
}
// SYNC-END: dateRange

// SYNC-START: rateLimit
// --- rate limit + backoff ---------------------------------------------------
const _BASE_BACKOFF_MS = 500;
const _DEFAULT_MAX_RETRIES = 4;
function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _parseRetryAfter(v) {
  if (!v) return null;
  const asInt = parseInt(v, 10);
  if (Number.isFinite(asInt) && asInt >= 0) return asInt * 1000;
  const asDate = Date.parse(v);
  if (Number.isFinite(asDate)) { const d = asDate - Date.now(); return d > 0 ? d : 0; }
  return null;
}
function _minDelayMs(rl) {
  const rps = rl?.rps;
  if (!rps || typeof rps !== "number" || rps <= 0) return 0;
  return Math.ceil(1000 / rps);
}
function createRateState() { return { lastCallAt: 0 }; }
async function fetchWithBackoff(fetchFn, rlCfg, state, maxRetries = _DEFAULT_MAX_RETRIES) {
  const minDelay = _minDelayMs(rlCfg);
  if (minDelay > 0 && state?.lastCallAt) {
    const elapsed = Date.now() - state.lastCallAt;
    if (elapsed < minDelay) await _sleep(minDelay - elapsed);
  }
  let attempt = 0;
  while (true) {
    if (state) state.lastCallAt = Date.now();
    let res;
    try { res = await fetchFn(); }
    catch (err) {
      if (attempt >= maxRetries) throw err;
      await _sleep(_BASE_BACKOFF_MS * Math.pow(2, attempt));
      attempt++; continue;
    }
    if (res.ok) return res;
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retryable || attempt >= maxRetries) return res;
    const retryAfter = _parseRetryAfter(res.headers?.get?.("Retry-After"));
    await _sleep(retryAfter !== null ? retryAfter : _BASE_BACKOFF_MS * Math.pow(2, attempt));
    attempt++;
  }
}
// SYNC-END: rateLimit

// --- Refresh-on-401 wrapper -------------------------------------------------
// Funcionalmente equivalente (NO byte-verbatim) a src/lib/syncEngine/refreshOn401.js.
// Behavior: OAuth-only, one refresh per sync run, on any failure return original 401.
// Detalle: src/docs/normalizers-contracts.md#sync-engine-duplication-notes

// SYNC-START: refreshOn401
function _createRefreshState() { return { refreshed: false }; }

function _isEligibleForRefresh(authMethod, hasRefreshToken) {
  return authMethod === "oauth" && hasRefreshToken === true;
}

async function _fetchPageWithMaybeRefresh({ doFetch, refreshFn, rebuildHeaders, eligible, state }) {
  const firstRes = await doFetch();
  if (firstRes.status !== 401) return firstRes;
  if (!eligible) return firstRes;
  if (state.refreshed) return firstRes;

  // Mark BEFORE the refresh call so any throw still flips the flag.
  state.refreshed = true;

  let refreshOk;
  try { refreshOk = await refreshFn(); }
  catch { return firstRes; }
  if (!refreshOk) return firstRes;

  try { await rebuildHeaders(); }
  catch { return firstRes; }

  return await doFetch();
}
// SYNC-END: refreshOn401

// --- Hard caps (defensive — never spin forever) -----------------------------
// Even with rate limits and pagination, a provider returning never-ending
// pages would block Deno's request budget. These caps make the worst case
// bounded:
//   - MAX_PAGES_PER_ENDPOINT: 50 pages × default 100 rows = 5,000 records per
//     endpoint per sync. Enough for monthly incremental on most brands.
//     The 12-month initial backfill may hit this cap on large clients — the
//     next sync will pick up where this one left off (last_synced_until is
//     persisted even on partial success).
//   - PAGE_BUFFER_LIMIT: hard cap on records held in memory before we stop
//     and return partial results. Protects Deno worker memory.
//
// ⚠️ PLACEHOLDER: valor no validado contra volumen real de ningún brand.
// Ajustar cuando haya datos reales de capacidad (volumen p99 mensual de
// transacciones Stripe/Mollie/PayPlug por brand, peso medio del payload,
// presupuesto efectivo del worker Deno). Ver deuda técnica.
const MAX_PAGES_PER_ENDPOINT = 50;
const PAGE_BUFFER_LIMIT = 5000;

// ─── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // ─── PRE-TASK INSTRUMENTATION (2026-07-09) ────────────────────────────────
  // Wrap everything from handler start through `AgentTask.create` in its own
  // try/catch so a 500 in that window returns a STRUCTURED body with the
  // exact `stage` that failed + stack. Purely observational: happy path is
  // untouched (falls through to the existing sync loop below). The generic
  // outer catch (bottom of file) remains as a last-resort net.
  // Purpose: hunt the "phantom 500" — a failure with no AgentTask row + no
  // legible log, suspected to live in the user-session code path (which
  // service-role tests can't reproduce). Remove once the culprit is caught.
  let base44, user, body, integration_id, integ, cfg, credential, task;
  let stage = "handler_start";
  try {
    stage = "create_client";
    base44 = createClientFromRequest(req);

    stage = "auth_me";
    user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    stage = "parse_body";
    body = await req.json().catch(() => ({}));

    // Read-only introspection mode: returns the REGISTRY so verifyRegistrySync
    // can compare it against oauthConnector's copy. Never touches integrations
    // or syncs. Admin-only to avoid leaking endpoint URLs.
    if (body?.mode === "describe") {
      if (user.role !== "admin") return Response.json({ ok: false, error: "Admin only" }, { status: 403 });
      return Response.json({ ok: true, registry: REGISTRY, source: "dataSyncAgent" });
    }

    integration_id = body.integration_id;
    if (!integration_id) {
      return Response.json({ ok: false, error: "integration_id is required" }, { status: 400 });
    }

    stage = "integration_get";
    integ = await resolveOwnedIntegrationForActor(base44.asServiceRole, {
      integration_id,
      actor: user,
    });

    if (integ.status !== "connected") {
      return Response.json({ ok: false, error: `Integration is ${integ.status}, not connected` }, { status: 400 });
    }

    stage = "get_provider_config";
    cfg = getProviderConfig(integ.provider);
    if (!cfg) return Response.json({ ok: false, error: "Provider not in registry" }, { status: 500 });

    stage = "credential_read";
    credential = (cfg.auth_method || "oauth") === "static_secret"
      ? null
      : await readIntegrationCredential(base44.asServiceRole, {
        integration_id: integ.id,
        brand_id: integ.brand_id,
      });

    stage = "agent_task_create";
    task = await base44.asServiceRole.entities.AgentTask.create({
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

    stage = "post_task_create";
  } catch (preTaskErr) {
    if (isIntegrationCredentialBoundaryError(preTaskErr)
      && preTaskErr.code === 'integration_tenant_resource_not_available') {
      return Response.json({ ok: false, error: 'integration_not_available' }, { status: 404 });
    }
    // ─── PRE-TASK CATCH ────────────────────────────────────────────────
    // Anything from handler_start → agent_task_create failing lands here.
    // console.error dumps the stack to function logs so we can trace which
    // line blew up. The response body carries the `stage` label so the
    // client (StripeConnectCard → error toast/state) surfaces it too.
    // No AgentTask row exists yet in this window — no need to mark one
    // failed. Integration row is left untouched (last_sync_status not
    // flipped to "failed" for a pre-task blow-up — that's for real sync
    // failures, not plumbing failures).
    console.error(`[dataSyncAgent] pre-task failure at stage="${stage}"`);
    return internalErrorResponse(preTaskErr, 'dataSyncAgent');
  }

  // From here on, `base44`, `user`, `integ`, `cfg`, `task` are all populated.
  try {
    // ─── New sync flow: pagination + date-range + rate-limit ─────────────
    //
    // Behavior matrix:
    //   - Provider with NO `pagination` config → null paginator → 1 page
    //     (legacy behavior, untouched providers run identically to before).
    //   - Provider with `pagination` config → loop until paginator returns
    //     {nextUrl: null}, hard-capped at MAX_PAGES_PER_ENDPOINT.
    //   - Provider with `date_range` config → first URL gets since/until
    //     params injected. Subsequent paginator URLs are used as-is (Stripe
    //     keeps the params; HAL next URL already contains them; page_number
    //     re-applies them since we use _engineSyncWithQueryParams).
    //   - Provider with `rate_limit` config → throttle between calls, plus
    //     reactive backoff on 429/5xx via fetchWithBackoff.
    //   - last_synced_until / last_cursor stored per-endpoint in
    //     integ.metadata_json under sync_state[normalize_as].
    let allRecords = [];
    let totalPagesFetched = 0;
    let partialReason = null;
    const endpoints = cfg.data_endpoints || [];

    // Snapshot existing sync_state from metadata (per-endpoint cursors / windows).
    const existingMeta = (integ.metadata_json && typeof integ.metadata_json === "object") ? { ...integ.metadata_json } : {};
    const syncState = (existingMeta.sync_state && typeof existingMeta.sync_state === "object")
      ? { ...existingMeta.sync_state }
      : {};

    // Refresh-on-401 state is shared across ALL endpoints + ALL pages within
    // this sync run. One refresh per run, total. Eligibility is computed once
    // per integration: a provider needs OAuth + a stored refresh_token to be
    // eligible. Live mutable references keep metadata and the server-only
    // credential authority aligned after a refresh.
    let liveInteg = integ;
    let liveCredential = credential;
    const refreshState = _createRefreshState();
    const refreshEligible = !cfg.demo_mode && _isEligibleForRefresh(
      cfg.auth_method || "oauth",
      !!liveCredential?.encrypted_refresh_token,
    );

    try {
      for (const ep of endpoints) {
        const epKey = ep.normalize_as || cfg.data_type;
        const norm = normalizers[epKey];
        if (!norm) throw new Error(`No normalizer for data_type=${epKey}`);

        // BUG-4 FIX (2026-07-09) — snapshot the record count BEFORE this
        // endpoint's pages start pushing. Used later to isolate THIS
        // endpoint's contribution when computing its high-water mark.
        const recordsBeforeEndpoint = allRecords.length;

        // Resolve sync window for this endpoint (per-endpoint last_synced_until).
        const epState = syncState[epKey] || {};
        const window = computeSyncWindow({ lastSyncedUntil: epState.last_synced_until || null });

        // Resolve auth headers ONCE per endpoint (token, static headers, {shop}).
        // Wrapped in a thunk so refresh-on-401 can re-run it after a token
        // refresh without duplicating the build logic.
        let finalAuthHeaders = {};
        const buildHeadersFromLiveInteg = async () => {
          if (cfg.demo_mode) { finalAuthHeaders = {}; return; }
          const { headers: authHeaders, plaintextToken } = await buildAuthHeaders(cfg, liveCredential);
          finalAuthHeaders = mergeStaticHeaders(
            cfg, authHeaders, plaintextToken,
            liveInteg.metadata_json?.shop_domain || null,
          );
        };
        await buildHeadersFromLiveInteg();

        // Build the first URL: interpolate {shop}, then inject date-range params.
        let currentUrl = interpolateShopDomain(ep.url, liveInteg.metadata_json?.shop_domain || null);
        currentUrl = applyDateRangeToUrl(currentUrl, cfg.date_range, window);
        // Demo adapters never transmit credentials or perform network I/O. Their
        // reserved `.invalid` fixture hosts intentionally do not resolve, so the
        // public-DNS gate applies only to real credential-bearing requests.
        if (!cfg.demo_mode) currentUrl = await assertCredentialTarget(currentUrl, null);
        const credentialOrigin = new URL(currentUrl).origin;

        // Paginator + rate state are per-endpoint (each endpoint has its own throttle budget).
        const paginator = getPaginator(cfg.pagination?.style);
        const rateState = createRateState();

        let pageIdx = 0;
        let lastCursor = null;
        let nextUrl = currentUrl;
        while (nextUrl) {
          if (pageIdx >= MAX_PAGES_PER_ENDPOINT) { partialReason = `Hit MAX_PAGES_PER_ENDPOINT (${MAX_PAGES_PER_ENDPOINT}) on ${epKey}`; break; }
          if (allRecords.length >= PAGE_BUFFER_LIMIT) { partialReason = `Hit PAGE_BUFFER_LIMIT (${PAGE_BUFFER_LIMIT}) on ${epKey}`; break; }

          let raw, resHeaders = { get: () => null };
          if (cfg.demo_mode) {
            raw = demoMockResponse(epKey);
            // demo mode never paginates — return after first synthetic page.
          } else {
            // doFetch closure: reads `nextUrl` and `finalAuthHeaders` by
            // closure, so the post-refresh retry automatically picks up
            // the NEW headers (rebuildHeaders mutates finalAuthHeaders).
            nextUrl = await assertCredentialTarget(nextUrl, credentialOrigin);
            const doFetch = () => fetchWithBackoff(
              async () => {
                nextUrl = await assertCredentialTarget(nextUrl, credentialOrigin);
                return fetch(nextUrl, {
                redirect: 'error',
                method: ep.method || "GET",
                headers: { ...finalAuthHeaders, "Accept": "application/json" },
                });
              },
              cfg.rate_limit,
              rateState,
            );

            const res = await _fetchPageWithMaybeRefresh({
              doFetch,
              refreshFn: async () => {
                // Delegate refresh to oauthConnector. Returns truthy on success.
                const r = await base44.functions.invoke("oauthConnector", {
                  mode: "refresh",
                  integration_id: liveInteg.id,
                });
                const body = r?.data || r;
                return !!body?.ok;
              },
              rebuildHeaders: async () => {
                // Re-read metadata plus the exact brand-bound credential and
                // rebuild auth headers in place. The doFetch closure captures
                // `finalAuthHeaders` by reference, so retry uses the rotation.
                liveInteg = await base44.asServiceRole.entities.Integration.get(liveInteg.id);
                liveCredential = await readIntegrationCredential(base44.asServiceRole, {
                  integration_id: liveInteg.id,
                  brand_id: liveInteg.brand_id,
                });
                await buildHeadersFromLiveInteg();
              },
              eligible: refreshEligible,
              state: refreshState,
            });

            if (!res.ok) {
              await res.body?.cancel().catch(() => {});
              throw new Error(`provider_endpoint_failed_${res.status}`);
            }
            raw = await res.json();
            resHeaders = res.headers;
          }

          allRecords = allRecords.concat(norm(raw));
          totalPagesFetched++;

          // Decide next page.
          const nextStep = paginator(raw, resHeaders, nextUrl, cfg.pagination || {});
          if (nextStep.nextCursor) lastCursor = nextStep.nextCursor;
          nextUrl = cfg.demo_mode || !nextStep.nextUrl
            ? null
            : await assertCredentialTarget(nextStep.nextUrl, credentialOrigin);
          pageIdx++;
        }

        // BUG-4 FIX (2026-07-09) — advance last_synced_until to the REAL
        // high-water mark (max occurred_at among records processed for THIS
        // endpoint), not to `window.until` (which was clock-now at sync start
        // and caused the next sync to open a ~0s window → 0 records).
        //
        // Guards:
        //   1. Only records emitted by THIS endpoint's normalizer count
        //      (allRecords accumulates across endpoints; slice out the new
        //      tail added in this iteration).
        //   2. Missing occurred_at → skipped (never invents a timestamp).
        //   3. Zero valid timestamps in the batch → keep previous cursor
        //      (don't regress, don't drift forward to clock-now).
        //   4. MONOTONICITY GUARD: newCursor = max(computedHwm, epState.last_synced_until).
        //      A batch of only-old records (backfill, clock skew, upstream
        //      reordering) can NEVER move the cursor backwards.
        //   5. Partial syncs (cap hit) still freeze the cursor to previous,
        //      unchanged from before — this fix only affects the success path.
        // The 24h overlap lives at READ time (computeSyncWindow), NOT baked
        // into the stored value — the cursor stays the true HWM.
        //
        // Endpoint's own records only: normalizers push into `allRecords`
        // incrementally, so records added during THIS endpoint iteration are
        // allRecords.slice(recordsBeforeEndpoint).
        // SYNC-START: cursorAdvance
        function computeNewCursor({ endpointRecords, previousCursor, partial }) {
          const prevIso = previousCursor || null;
          if (partial) return prevIso;
          if (!Array.isArray(endpointRecords) || endpointRecords.length === 0) return prevIso;
          let maxOccurredMs = 0;
          for (const r of endpointRecords) {
            if (!r?.occurred_at) continue;
            const t = new Date(r.occurred_at).getTime();
            if (Number.isFinite(t) && t > maxOccurredMs) maxOccurredMs = t;
          }
          if (maxOccurredMs === 0) return prevIso;
          const prevMs = prevIso ? new Date(prevIso).getTime() : 0;
          const prevMsSafe = Number.isFinite(prevMs) ? prevMs : 0;
          return maxOccurredMs >= prevMsSafe ? new Date(maxOccurredMs).toISOString() : prevIso;
        }
        // SYNC-END: cursorAdvance
        const newCursor = computeNewCursor({
          endpointRecords: allRecords.slice(recordsBeforeEndpoint),
          previousCursor: epState.last_synced_until || null,
          partial: !!partialReason,
        });

        syncState[epKey] = {
          last_cursor: lastCursor,
          last_synced_until: newCursor,
          last_window_since: window.since.toISOString(),
          last_pages_fetched: pageIdx,
        };
      }

      // Compute integration_data_quality from the registry's known_data_gaps.
      // Purely informational — see invariant above. Runs for every provider:
      // those without known_data_gaps get completeness_pct=100, known_gaps=[].
      const integrationDataQuality = computeIntegrationDataQuality(cfg);

      // Persist sync_state inside metadata_json (preserving anything else
      // already stored there, e.g. shop_domain, auth_method, account_id).
      const newMetadata = { ...existingMeta, sync_state: syncState };

      const finalStatus = partialReason ? "partial" : "success";

      await base44.asServiceRole.entities.Integration.update(integ.id, {
        last_sync_at: new Date().toISOString(),
        last_sync_status: finalStatus,
        last_error: partialReason || null,
        integration_data_quality: integrationDataQuality,
        metadata_json: newMetadata,
      });

      await base44.asServiceRole.entities.AgentTask.update(task.id, {
        status: "completed",
        output_summary: partialReason
          ? `Synced ${allRecords.length} records from ${integ.provider} (PARTIAL: ${partialReason})`
          : `Synced ${allRecords.length} records from ${integ.provider}`,
        output_payload_json: {
          records_count: allRecords.length,
          pages_fetched: totalPagesFetched,
          partial_reason: partialReason,
          sync_state: syncState,
          sample: allRecords.slice(0, 3),
        },
        completed_at: new Date().toISOString(),
      });

      await base44.asServiceRole.entities.Event.create({
        brand_id: integ.brand_id,
        event_type: "integration.synced",
        source: "data_sync_agent",
        entity_type: "Integration",
        entity_id: integ.id,
        agent_task_id: task.id,
        payload_json: {
          provider: integ.provider,
          records_count: allRecords.length,
          pages_fetched: totalPagesFetched,
          partial_reason: partialReason,
          demo_mode: !!cfg.demo_mode,
        },
        status: "processed",
        processed_at: new Date().toISOString(),
      });

      return Response.json({
        ok: true,
        agent_task_id: task.id,
        records_count: allRecords.length,
        pages_fetched: totalPagesFetched,
        partial_reason: partialReason,
        sync_state: syncState,
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
      return internalErrorResponse(err, 'dataSyncAgent');
    }
  } catch (error) {
    return internalErrorResponse(error, 'dataSyncAgent');
  }
});
