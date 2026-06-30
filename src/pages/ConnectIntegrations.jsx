import { useEffect, useState, useMemo } from "react"; // useState also used inside IntegrationRow
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Navbar from "@/components/landing/Navbar";
import { useToast } from "@/components/shared/Toast.jsx";
import {
  CheckCircle2, RefreshCw, ArrowRight, Loader2, AlertTriangle,
  CreditCard, Truck, Building2, Mail, Layers, Plug, Sparkles, KeyRound,
} from "lucide-react";
import ApiKeyConnectForm from "@/components/connect/ApiKeyConnectForm";

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

const CATEGORY_META = {
  payments:  { label: "Payments",  icon: CreditCard },
  shipping:  { label: "Shipping",  icon: Truck },
  banking:   { label: "Banking",   icon: Building2 },
  marketing: { label: "Marketing", icon: Mail },
  saas:      { label: "Tools",     icon: Layers },
  commerce:  { label: "Commerce",  icon: Layers },
  other:     { label: "Other",     icon: Layers },
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
    category: "shipping",
    description: "Fictional API-key provider to verify the api_key path.",
    auth_method: "api_key",
    api_key_help_url: "https://demo.example.invalid/account/api-keys",
    api_key_help_text: "Open your Demo Provider dashboard → Account → API Keys, create a read-only key, paste it here.",
    demo_mode: true,
  },
};

export default function ConnectIntegrations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [brandId, setBrandId] = useState(null);
  const [detected, setDetected] = useState([]);          // DetectedIntegration[]
  const [integrations, setIntegrations] = useState([]);  // Integration[]
  const [busyProvider, setBusyProvider] = useState(null);

  const loadAll = async (bId) => {
    const [det, integ] = await Promise.all([
      base44.entities.DetectedIntegration.filter({ brand_id: bId }, "-created_date", 200).catch(() => []),
      base44.entities.Integration.filter({ brand_id: bId }, "-created_date", 200).catch(() => []),
    ]);
    setDetected(det);
    setIntegrations(integ);
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

  const handleConnect = async (row) => {
    if (!brandId) return;
    setBusyProvider(row.provider);
    try {
      const res = await base44.functions.invoke("oauthConnector", {
        mode: "start",
        brand_id: brandId,
        provider: row.provider,
        redirect_after: "/ConnectIntegrations",
      });
      const data = res?.data || res;
      if (!data?.ok) {
        toast.error("Couldn't start connection", data?.error || undefined);
        setBusyProvider(null);
        return;
      }
      // Demo providers short-circuit through our own callback page; real
      // providers redirect to their platform.
      window.location.href = data.authorize_url;
    } catch (err) {
      toast.error("Connection failed", err?.message || undefined);
      setBusyProvider(null);
    }
  };

  // API-key flow: the user pastes a key, we send it to the connector which
  // encrypts and stores it. We never persist it on the client.
  const handleSaveApiKey = async (row, apiKey) => {
    if (!brandId) return;
    setBusyProvider(row.provider);
    try {
      const res = await base44.functions.invoke("oauthConnector", {
        mode: "connect_api_key",
        brand_id: brandId,
        provider: row.provider,
        api_key: apiKey,
      });
      const data = res?.data || res;
      if (!data?.ok) {
        toast.error("Couldn't save API key", data?.error || undefined);
        return;
      }
      toast.success(`${row.meta.display_name} connected`);
      await loadAll(brandId);
    } catch (err) {
      toast.error("Couldn't save API key", err?.message || undefined);
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
            Connect your tools
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each tool you connect upgrades a benchmark from estimated to verified.
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
              <p className="text-sm font-bold">No brand found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Complete the Analyzer first to create your brand workspace.
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
                    onConnect={() => handleConnect(row)}
                    onSync={() => handleSync(row)}
                    onSaveApiKey={(key) => handleSaveApiKey(row, key)}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {!loading && brandId && rows.length === 1 && (
          // Only the demo row is showing — Discovery didn't return anything yet.
          <div className="rounded-2xl border border-border/60 bg-secondary/30 p-5">
            <p className="text-sm font-bold">Run the Analyzer first</p>
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

function IntegrationRow({ row, busy, onConnect, onSync, onSaveApiKey }) {
  const integ = row.integration;
  const status = integ?.status || (row.detection ? "detected" : "available");
  const authMethod = row.meta?.auth_method || "oauth";
  const isApiKey = authMethod === "api_key";
  const [keyFormOpen, setKeyFormOpen] = useState(false);

  // For api_key providers, the primary action ("Connect" / "Reconnect") opens
  // an inline form instead of redirecting. Connected status still shows Sync.
  return (
    <div className="p-4 rounded-2xl border border-border/60 bg-card hover:border-foreground/30 transition-colors">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl border border-border/60 bg-secondary flex items-center justify-center shrink-0">
          {isApiKey ? <KeyRound size={15} className="text-foreground" /> : <Plug size={15} className="text-foreground" />}
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
          {status === "connected" ? (
            <button
              type="button"
              onClick={onSync}
              disabled={busy}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-border/60 text-[11px] font-bold hover:border-foreground/40 disabled:opacity-50"
            >
              {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
              Sync
            </button>
          ) : isApiKey ? (
            <button
              type="button"
              onClick={() => setKeyFormOpen((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={10} className="animate-spin" /> : <KeyRound size={10} />}
              {keyFormOpen ? "Close" : status === "error" ? "Reconnect" : "Connect"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={busy || status === "connecting"}
              className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-50"
            >
              {busy || status === "connecting"
                ? <Loader2 size={10} className="animate-spin" />
                : <ArrowRight size={10} />}
              {status === "error" ? "Reconnect" : "Connect"}
            </button>
          )}
        </div>
      </div>

      {isApiKey && keyFormOpen && status !== "connected" && (
        <ApiKeyConnectForm
          helpUrl={row.meta.api_key_help_url}
          helpText={row.meta.api_key_help_text}
          busy={busy}
          onCancel={() => setKeyFormOpen(false)}
          onSave={async (k) => {
            await onSaveApiKey(k);
            setKeyFormOpen(false);
          }}
        />
      )}
    </div>
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