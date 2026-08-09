import { useEffect, useState, useMemo } from "react"; // useState also used inside IntegrationRow
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Navbar from "@/components/landing/Navbar";
import { useToast } from "@/components/shared/Toast.jsx";
import {
  CheckCircle2, RefreshCw, ArrowRight, Loader2, AlertTriangle,
  CreditCard, Layers, Plug, Sparkles, KeyRound, Store, X,
} from "lucide-react";
import ApiKeyConnectForm from "@/components/connect/ApiKeyConnectForm";
import ShopDomainCaptureForm from "@/components/connect/ShopDomainCaptureForm";
import { useLanguage } from "@/lib/i18n.jsx";

/**
 * Fase 0 — generic OAuth connector UX.
 *
 * Joins three sources:
 *   1. DetectedIntegration  → what the Discovery Agent (B1) found
 *   2. listProviders()      → what the registry actually supports
 *   3. Integration          → what this brand has already started/connected
 *
 * Only providers that are BOTH detected AND in the registry get a Connect
 * button. Everything else is shown as "coming soon" or hidden by category.
 *
 * No business logic touched. Pure UX wired to oauthConnector + dataSyncAgent.
 */

// R2 (2026-07-12) — payments-only surface.
// Removed: shipping, banking, accounting, marketing, saas — the platform is
// payments-only and these categories advertised a multi-vertical product that
// no longer exists. Only payments + commerce remain (commerce covers the
// e-commerce platforms whose OAuth data feeds the payments analysis: Shopify,
// WooCommerce, BigCommerce).
// The `CLIENT_REGISTRY_MIRROR` entries for `accounting` providers (QuickBooks,
// Xero, Sage, FreshBooks, Odoo) and `shipping` demo provider are ALSO removed
// below — a provider with a category no longer in this map falls into
// `other` and pollutes the UI. Payments providers today: demo_provider (test
// harness), and the real Stripe connection which lives on its own card in
// `/ConnectTools`, not in this legacy Connect surface.
const CATEGORY_META = {
  payments:   { label: "Payments",   icon: CreditCard },
  commerce:   { label: "Commerce",   icon: Layers },
  other:      { label: "Other",      icon: Layers },
};

function timeAgo(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* The registry is server-side. We mirror just the safe-to-expose fields on
   the client so the UI can group/label without an extra round-trip. Keep in
   sync with functions/integrationRegistry.js (display_name, category,
   auth_method + api_key_* metadata). NEVER mirror secrets — only how to
   render the connect UI. */
const CLIENT_REGISTRY_MIRROR = {
  demo_provider: {
    display_name: "Demo Provider",
    category: "payments",
    description: "Fictional provider to verify the connector engine.",
    auth_method: "oauth",
    demo_mode: true,
  },
  demo_apikey_provider: {
    display_name: "Demo API Key Provider",
    // R2 — re-homed from "shipping" (deleted category) to "payments". This is
    // the test-harness provider for the api_key connect path; its category is
    // an implementation detail, not a customer-facing vertical. Placing it in
    // "payments" keeps the harness reachable in the UI without reintroducing
    // shipping as a category.
    category: "payments",
    description: "Fictional API-key provider to verify the api_key path.",
    auth_method: "api_key",
    api_key_help_url: "https://demo.example.invalid/account/api-keys",
    api_key_help_text: "Open your Demo Provider dashboard → Account → API Keys, create a read-only key, paste it here.",
    demo_mode: true,
  },

  // ─── Per-shop providers (requires_shop_domain: true in the backend registry).
  // Adding them to the mirror makes them visible/connectable in the UI. The
  // backend already validates shop_domain on every path (modeStart for OAuth,
  // modeConnectBasicAuth for basic_auth, modeConnectApiKey for api_key — the
  // last path was just made symmetric in this turn). NEVER mirror secrets;
  // mirror only the strings the UI needs to render the form. ───
  shopify: {
    display_name: "Shopify",
    category: "commerce",
    description: "Read-only access to orders and products.",
    auth_method: "oauth",
    requires_shop_domain: true,
    shop_domain_field_label: "Shopify shop handle",
    shop_domain_placeholder: "mitienda",
    shop_domain_help_text: "Paste the handle only — the part before \".myshopify.com\". For \"mitienda.myshopify.com\" you paste \"mitienda\". No dots, no scheme, no path.",
    shop_domain_help_url: "https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/setup-your-store/store-name",
  },
  woocommerce: {
    display_name: "WooCommerce",
    category: "commerce",
    description: "Reads orders. Two keys (consumer_key + consumer_secret).",
    auth_method: "basic_auth",
    requires_shop_domain: true,
    shop_domain_field_label: "Your site domain",
    shop_domain_placeholder: "mitienda.com",
    shop_domain_help_text: "Paste your WooCommerce site's full domain (e.g. \"mitienda.com\"). No scheme, no path.",
    shop_domain_help_url: "https://woocommerce.com/document/woocommerce-rest-api/",
    basic_auth_user_label: "Consumer key (ck_…)",
    basic_auth_pass_label: "Consumer secret (cs_…)",
    basic_auth_help_url: "https://woocommerce.com/document/woocommerce-rest-api/",
    basic_auth_help_text: "In WooCommerce → Settings → Advanced → REST API, create a key with Read permission. Consumer key is the username, Consumer secret the password.",
  },
  bigcommerce: {
    display_name: "BigCommerce",
    category: "commerce",
    description: "Reads orders. API access token + store_hash.",
    auth_method: "api_key",
    requires_shop_domain: true,
    shop_domain_field_label: "Store hash",
    shop_domain_placeholder: "abc12345xyz",
    shop_domain_help_text: "Your BigCommerce store_hash — the identifier in your store's URL (Settings → API Accounts, or visible in the dashboard URL).",
    shop_domain_help_url: "https://developer.bigcommerce.com/docs/start/authentication/api-accounts",
    api_key_help_url: "https://developer.bigcommerce.com/docs/start/authentication/api-accounts",
    api_key_help_text: "In BigCommerce → Settings → API Accounts create an account with read scope on Orders, then paste the Access Token.",
  },
  // R2 (2026-07-12) — Accounting providers (QuickBooks, Odoo, FreshBooks,
  // Xero, Sage) removed from the client mirror. They read supplier bills to
  // detect brand expenses across verticals — feature of the pre-pivot
  // multi-vertical product. In payments-only, expense-side accounting data
  // isn't consumed by any live surface. Backend registry entries are kept
  // (dormant), so re-enabling later is a one-line mirror addition. Deletion
  // rationale documented in Decision_Log 2026-07-12 · R2.
};

export default function ConnectIntegrations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [brandId, setBrandId] = useState(null);
  const [detected, setDetected] = useState([]);          // DetectedIntegration[]
  const [integrations, setIntegrations] = useState([]);  // Integration[]
  const [busyProvider, setBusyProvider] = useState(null);

  const loadAll = async (bId) => {
    const res = await base44.functions.invoke("getIntegrationStatus", { brand_id: bId }).catch(() => null);
    const data = res?.data || res || {};
    const projected = data.integrations || [];
    setDetected(projected.filter(i => i.is_detected).map(i => ({
      integration_id: i.integration_id, status: "detected", confidence_score: i.confidence_score,
      detection_source: i.detection_source, connected_at: i.connected_at,
    })));
    setIntegrations(projected.filter(i => i.connection_kind === "integration" && i.connection_id).map(i => ({
      id: i.connection_id, provider: i.connection_provider || i.integration_id, status: i.is_connected ? "connected" : i.display_status,
      last_sync_at: i.last_sync_at, brand_id: data.brand_id,
    })));
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        const brands = await base44.entities.Brand
          .filter({ created_by: me.email }, "-created_date", 1)
          .catch(() => []);
        const bId = brands[0]?.id;
        if (!bId) { setLoading(false); return; }
        setBrandId(bId);
        await loadAll(bId);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* For Fase 0, the demo entries are always available — there's no Discovery
     row for fictional providers. Real providers (later phases) will appear
     only if Discovery detected them. */
  const rows = useMemo(() => {
    const integByProvider = new Map(integrations.map(i => [i.provider, i]));
    const demoRows = ["demo_provider", "demo_apikey_provider"].map(slug => ({
      provider: slug,
      meta: CLIENT_REGISTRY_MIRROR[slug],
      detection: null,
      integration: integByProvider.get(slug) || null,
    }));
    // Real providers from Discovery — only those present in the client mirror
    // get a Connect button. Anything else stays hidden in Fase 0.
    const realRows = detected
      .filter(d => CLIENT_REGISTRY_MIRROR[d.integration_id])
      .map(d => ({
        provider: d.integration_id,
        meta: CLIENT_REGISTRY_MIRROR[d.integration_id],
        detection: d,
        integration: integByProvider.get(d.integration_id) || null,
      }));
    return [...demoRows, ...realRows];
  }, [detected, integrations]);

  const grouped = useMemo(() => {
    const out = {};
    for (const r of rows) {
      const cat = r.meta?.category || "other";
      (out[cat] = out[cat] || []).push(r);
    }
    return out;
  }, [rows]);

  // OAuth start. For providers without requires_shop_domain we redirect
  // immediately. For providers WITH requires_shop_domain the row opens its
  // ShopDomainCaptureForm inline (see IntegrationRow) and calls handleStartOAuth
  // with the captured value once the user submits.
  const handleStartOAuth = async (row, shopDomain = null) => {
    if (!brandId) return null;
    setBusyProvider(row.provider);
    try {
      const res = await base44.functions.invoke("oauthConnector", {
        mode: "start",
        brand_id: brandId,
        provider: row.provider,
        redirect_after: "/ConnectIntegrations",
        ...(shopDomain ? { shop_domain: shopDomain } : {}),
      });
      const data = res?.data || res;
      if (!data?.ok) {
        toast.error("Couldn't start connection", data?.error || undefined);
        setBusyProvider(null);
        return data?.error || "Couldn't start connection";
      }
      // Demo providers short-circuit through our own callback page; real
      // providers redirect to their platform. We don't reset busyProvider on
      // success — the page is about to unload.
      window.location.href = data.authorize_url;
      return null;
    } catch (err) {
      toast.error("Connection failed", err?.message || undefined);
      setBusyProvider(null);
      return err?.message || "Connection failed";
    }
  };

  // API-key flow: the user pastes a key, we send it to the connector which
  // encrypts and stores it. We never persist it on the client. For per-shop
  // api_key providers (bigcommerce, odoo) shop_domain is captured alongside
  // the key — the backend persists it in metadata_json.shop_domain.
  const handleSaveApiKey = async (row, apiKey, shopDomain = null) => {
    if (!brandId) return null;
    setBusyProvider(row.provider);
    try {
      const res = await base44.functions.invoke("oauthConnector", {
        mode: "connect_api_key",
        brand_id: brandId,
        provider: row.provider,
        api_key: apiKey,
        ...(shopDomain ? { shop_domain: shopDomain } : {}),
      });
      const data = res?.data || res;
      if (!data?.ok) {
        toast.error("Couldn't save API key", data?.error || undefined);
        return data?.error || "Couldn't save API key";
      }
      toast.success(`${row.meta.display_name} connected`);
      await loadAll(brandId);
      return null;
    } catch (err) {
      toast.error("Couldn't save API key", err?.message || undefined);
      return err?.message || "Couldn't save API key";
    } finally {
      setBusyProvider(null);
    }
  };

  // Basic-auth flow: same pattern as api_key but two values (public/secret).
  // Only WooCommerce uses this path today and it requires shop_domain.
  const handleSaveBasicAuth = async (row, publicKey, secretKey, shopDomain = null) => {
    if (!brandId) return null;
    setBusyProvider(row.provider);
    try {
      const res = await base44.functions.invoke("oauthConnector", {
        mode: "connect_basic_auth",
        brand_id: brandId,
        provider: row.provider,
        public_key: publicKey,
        secret_key: secretKey,
        ...(shopDomain ? { shop_domain: shopDomain } : {}),
      });
      const data = res?.data || res;
      if (!data?.ok) {
        toast.error("Couldn't save credentials", data?.error || undefined);
        return data?.error || "Couldn't save credentials";
      }
      toast.success(`${row.meta.display_name} connected`);
      await loadAll(brandId);
      return null;
    } catch (err) {
      toast.error("Couldn't save credentials", err?.message || undefined);
      return err?.message || "Couldn't save credentials";
    } finally {
      setBusyProvider(null);
    }
  };

  const handleSync = async (row) => {
    if (!row.integration) return;
    setBusyProvider(row.provider);
    try {
      const res = await base44.functions.invoke("dataSyncAgent", {
        integration_id: row.integration.id,
      });
      const data = res?.data || res;
      if (!data?.ok) {
        toast.error("Sync failed", data?.error || undefined);
      } else {
        toast.success(`Synced ${data.records_count} records from ${row.meta.display_name}`);
        await loadAll(brandId);
      }
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div className="relative min-h-screen bg-background flex flex-col overflow-x-hidden">
      <Navbar />

      <main className="relative flex-1 max-w-3xl mx-auto w-full px-5 pt-20 pb-12 mt-14 space-y-6">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-3 border border-border/60 bg-secondary/40">
            <Sparkles size={11} className="text-cyan-600" />
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-muted-foreground">
              Engine · Fase 0
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em]">
            {t("ci_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("ci_sub")}
          </p>
        </div>

        {loading && (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="p-4 rounded-2xl border border-border/60 bg-card animate-pulse h-20" />
            ))}
          </div>
        )}

        {!loading && !brandId && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start gap-3">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5" />
            <div>
              <p className="text-sm font-bold">{t("ci_nobrand_title")}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("ci_nobrand_sub")}
              </p>
            </div>
          </div>
        )}

        {!loading && brandId && Object.keys(grouped).map(cat => {
          const meta = CATEGORY_META[cat] || CATEGORY_META.other;
          const Icon = meta.icon;
          const items = grouped[cat];
          return (
            <section key={cat} className="space-y-2.5">
              <div className="flex items-center gap-2 px-1">
                <Icon size={13} className="text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-black tracking-tight">{meta.label}</h2>
                <span className="text-xs text-muted-foreground/60 tabular-nums">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map(row => (
                  <IntegrationRow
                    key={row.provider}
                    row={row}
                    busy={busyProvider === row.provider}
                    onStartOAuth={(shopDomain) => handleStartOAuth(row, shopDomain)}
                    onSync={() => handleSync(row)}
                    onSaveApiKey={(key, shopDomain) => handleSaveApiKey(row, key, shopDomain)}
                    onSaveBasicAuth={(pub, sec, shopDomain) => handleSaveBasicAuth(row, pub, sec, shopDomain)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {!loading && brandId && rows.length === 1 && (
          // Only the demo row is showing — Discovery didn't return anything yet.
          <div className="rounded-2xl border border-border/60 bg-secondary/30 p-5">
            <p className="text-sm font-bold">{t("ci_norun_title")}</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              We'll detect your tools, then show them here ready to connect.
            </p>
            <button
              onClick={() => navigate("/Analyzer")}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold"
            >
              Run Analyzer <ArrowRight size={11} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function IntegrationRow({ row, busy, onStartOAuth, onSync, onSaveApiKey, onSaveBasicAuth }) {
  const integ = row.integration;
  const status = integ?.status || (row.detection ? "detected" : "available");
  const authMethod = row.meta?.auth_method || "oauth";
  const isApiKey = authMethod === "api_key";
  const isBasicAuth = authMethod === "basic_auth";
  const requiresShopDomain = !!row.meta?.requires_shop_domain;

  // Open-state machine for the inline forms. Per-shop providers gate behind
  // ShopDomainCaptureForm first; after shop_domain is captured we either
  // redirect (OAuth) or open the credentials form (api_key / basic_auth).
  const [formOpen, setFormOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState(null);
  const [serverError, setServerError] = useState(null);
  const [pendingBasicAuth, setPendingBasicAuth] = useState({ pub: "", sec: "" });

  const closeAll = () => {
    setFormOpen(false);
    setShopDomain(null);
    setServerError(null);
    setPendingBasicAuth({ pub: "", sec: "" });
  };

  // What the primary button does, in plain terms:
  //   - connected → Sync
  //   - OAuth provider without shop_domain → redirect immediately
  //   - everything else (OAuth+shop, api_key, basic_auth) → toggle inline form
  const handlePrimaryClick = async () => {
    if (status === "connected") return onSync();
    if (formOpen) return closeAll();
    if (!requiresShopDomain && !isApiKey && !isBasicAuth) {
      // Pure OAuth, no shop_domain — straight redirect.
      const err = await onStartOAuth(null);
      if (err) setServerError(err);
      return;
    }
    setFormOpen(true);
  };

  // Submit handler for the shop_domain step.
  const handleShopDomainSubmit = async (value) => {
    setServerError(null);
    if (authMethod === "oauth") {
      // OAuth + shop_domain: send straight to backend; on success the browser
      // is redirected. On failure we surface the error in the form.
      const err = await onStartOAuth(value);
      if (err) setServerError(err);
      return;
    }
    // api_key / basic_auth + shop_domain: capture and move to credentials step.
    setShopDomain(value);
  };

  return (
    <div className="p-4 rounded-2xl border border-border/60 bg-card hover:border-foreground/30 transition-colors">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl border border-border/60 bg-secondary flex items-center justify-center shrink-0">
          {requiresShopDomain
            ? <Store size={15} className="text-foreground" />
            : isApiKey
              ? <KeyRound size={15} className="text-foreground" />
              : <Plug size={15} className="text-foreground" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold truncate">{row.meta.display_name}</p>
            {row.meta.demo_mode && (
              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-cyan-500/10 text-cyan-700 border border-cyan-500/25">
                Demo
              </span>
            )}
            {isApiKey && (
              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-secondary text-muted-foreground border border-border/60">
                API key
              </span>
            )}
            {isBasicAuth && (
              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-secondary text-muted-foreground border border-border/60">
                Basic auth
              </span>
            )}
            {requiresShopDomain && (
              <span className="px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold bg-secondary text-muted-foreground border border-border/60">
                Per-shop
              </span>
            )}
          </div>
          {row.meta.description && (
            <p className="text-[11px] text-muted-foreground truncate">{row.meta.description}</p>
          )}
          {integ?.last_sync_at && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              Last sync · {timeAgo(integ.last_sync_at)}
            </p>
          )}
          {integ?.last_error && status === "error" && (
            <p className="text-[10px] text-red-600 mt-0.5 truncate">⚠ {integ.last_error}</p>
          )}
          {/* Integration Data Quality — read-only badge (Opción B, Fase 3).
              Shown ONLY when the last sync surfaced known structural gaps in
              the provider's API (completeness_pct < 100). Informational only:
              does NOT feed savings, benchmarks, recommendation confidence, or
              any business-logic score. Decision to wire to recommendations is
              pending product input. */}
          <DataQualityBadge dataQuality={integ?.integration_data_quality} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={status} />
          <button
            type="button"
            onClick={handlePrimaryClick}
            disabled={busy || status === "connecting"}
            className={`inline-flex items-center gap-1 h-8 px-3 rounded-full text-[11px] font-bold disabled:opacity-50 ${
              status === "connected"
                ? "border border-border/60 hover:border-foreground/40"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {busy || status === "connecting"
              ? <Loader2 size={10} className="animate-spin" />
              : status === "connected"
                ? <RefreshCw size={10} />
                : formOpen
                  ? <X size={10} />
                  : <ArrowRight size={10} />}
            {status === "connected"
              ? "Sync"
              : formOpen
                ? "Close"
                : status === "error"
                  ? "Reconnect"
                  : "Connect"}
          </button>
        </div>
      </div>

      {/* Per-shop step 1: capture shop_domain. Shown for any provider with
          requires_shop_domain, regardless of auth_method. Skipped once
          shopDomain has been captured locally (we move on to credentials). */}
      {formOpen && status !== "connected" && requiresShopDomain && !shopDomain && (
        <ShopDomainCaptureForm
          fieldLabel={row.meta.shop_domain_field_label}
          placeholder={row.meta.shop_domain_placeholder}
          helpUrl={row.meta.shop_domain_help_url}
          helpText={row.meta.shop_domain_help_text}
          busy={busy}
          serverError={serverError}
          onCancel={closeAll}
          onSave={handleShopDomainSubmit}
        />
      )}

      {/* api_key credentials step. Shown when (a) provider is api_key AND
          (b) either shop_domain is not required, or it has been captured. */}
      {formOpen && status !== "connected" && isApiKey && (!requiresShopDomain || shopDomain) && (
        <ApiKeyConnectForm
          helpUrl={row.meta.api_key_help_url}
          helpText={row.meta.api_key_help_text}
          busy={busy}
          onCancel={closeAll}
          onSave={async (k) => {
            const err = await onSaveApiKey(k, shopDomain);
            if (!err) closeAll();
          }}
        />
      )}

      {/* basic_auth credentials step. Shown when (a) provider is basic_auth
          AND (b) either shop_domain is not required, or it has been captured. */}
      {formOpen && status !== "connected" && isBasicAuth && (!requiresShopDomain || shopDomain) && (
        <BasicAuthConnectForm
          meta={row.meta}
          busy={busy}
          values={pendingBasicAuth}
          onChange={setPendingBasicAuth}
          onCancel={closeAll}
          onSave={async ({ pub, sec }) => {
            const err = await onSaveBasicAuth(pub, sec, shopDomain);
            if (!err) closeAll();
          }}
        />
      )}
    </div>
  );
}

/* Inline basic_auth form. Defined here (instead of its own file) because it
   is a thin wrapper specific to ConnectIntegrations — two password inputs
   plus help text. Matches the ApiKeyConnectForm visual pattern. */
function BasicAuthConnectForm({ meta, busy, values, onChange, onCancel, onSave }) {
  const [showHelp, setShowHelp] = useState(false);
  const userLabel = meta.basic_auth_user_label || "Public key";
  const passLabel = meta.basic_auth_pass_label || "Secret key";
  const canSave =
    values.pub.trim().length >= 4 && values.sec.trim().length >= 4 && !busy;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    await onSave({ pub: values.pub.trim(), sec: values.sec.trim() });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-border/60 bg-secondary/30 p-3 space-y-2"
    >
      <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
        <KeyRound size={11} />
        Paste your credentials
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={values.pub}
          onChange={(e) => onChange({ ...values, pub: e.target.value })}
          placeholder={userLabel}
          aria-label={userLabel}
          className="h-10 px-3 rounded-md text-sm bg-background border border-border/60 font-mono"
        />
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={values.sec}
          onChange={(e) => onChange({ ...values, sec: e.target.value })}
          placeholder={passLabel}
          aria-label={passLabel}
          className="h-10 px-3 rounded-md text-sm bg-background border border-border/60 font-mono"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSave}
          className="inline-flex items-center gap-1 h-9 px-4 rounded-full bg-foreground text-background text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex items-center gap-1 h-9 px-3 rounded-full border border-border/60 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <X size={11} />
        </button>
      </div>
      {(meta.basic_auth_help_url || meta.basic_auth_help_text) && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            className="text-[11px] font-semibold text-cyan-700 hover:underline"
          >
            {showHelp ? "Hide" : "Where do I find this?"}
          </button>
          {showHelp && (
            <div className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
              {meta.basic_auth_help_text && <p>{meta.basic_auth_help_text}</p>}
              {meta.basic_auth_help_url && (
                <a
                  href={meta.basic_auth_help_url}
                  target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-cyan-700 hover:underline"
                >
                  Open provider docs
                </a>
              )}
            </div>
          )}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground/70 leading-snug pt-1">
        Your credentials are encrypted before being saved and never sent back to your browser.
      </p>
    </form>
  );
}

/* Read-only "partial data" indicator. Renders nothing unless completeness_pct
   is a number < 100 — so providers without known_data_gaps (or integrations
   that haven't synced yet) stay visually unchanged. Tenant-isolated by the
   Integration entity's RLS (read = admin OR created_by); we just render what
   the loader already filtered. */
function DataQualityBadge({ dataQuality }) {
  if (!dataQuality) return null;
  const pct = dataQuality.completeness_pct;
  if (typeof pct !== "number" || pct >= 100) return null;
  const evidence = typeof dataQuality.evidence === "string" && dataQuality.evidence.length > 0
    ? dataQuality.evidence
    : "Partial data from provider API";
  return (
    <p
      className="text-[10px] text-amber-700 mt-0.5 truncate"
      title={evidence}
    >
      ⓘ Partial data: {evidence}
    </p>
  );
}

function StatusBadge({ status }) {
  const map = {
    connected:   { cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", label: "Connected", Icon: CheckCircle2 },
    connecting:  { cls: "bg-cyan-500/10 text-cyan-600 border-cyan-500/25",          label: "Connecting", Icon: Loader2 },
    error:       { cls: "bg-red-500/10 text-red-600 border-red-500/25",             label: "Error", Icon: AlertTriangle },
    detected:    { cls: "bg-blue-500/10 text-blue-600 border-blue-500/25",          label: "Detected", Icon: Sparkles },
    available:   { cls: "bg-secondary text-muted-foreground border-border/60",      label: "Available", Icon: Plug },
    disconnected:{ cls: "bg-secondary text-muted-foreground border-border/60",      label: "Disconnected", Icon: Plug },
  };
  const m = map[status] || map.available;
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${m.cls}`}>
      <Icon size={9} className={status === "connecting" ? "animate-spin" : ""} />
      {m.label}
    </span>
  );
}