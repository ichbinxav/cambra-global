import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { WifiOff, AlertTriangle, Clock, Shield, CheckCircle2 } from "lucide-react";
import ConnectorTile from "@/components/connect/ConnectorTile.jsx";
import { CONNECTORS as CONNECTOR_IDS } from "@/lib/connectors.config.js";

const INTEGRATION_META = {
  stripe: { label: "Stripe", category: "Payments", icon: "💳" },
  shopify: { label: "Shopify", category: "E-commerce", icon: "🛍️" },
  woocommerce: { label: "WooCommerce", category: "E-commerce", icon: "🛒" },
  xero: { label: "Xero", category: "Accounting", icon: "📊" },
  quickbooks: { label: "QuickBooks", category: "Accounting", icon: "📈" },
  dhl: { label: "DHL", category: "Shipping", icon: "📦" },
  dpd: { label: "DPD", category: "Shipping", icon: "🚚" },
  sendcloud: { label: "SendCloud", category: "Shipping", icon: "✉️" },
  klaviyo: { label: "Klaviyo", category: "Marketing", icon: "📧" },
  other: { label: "Other", category: "Custom", icon: "🔌" },
};

const STATUS_CFG = {
  connected: { label: "Connected", icon: CheckCircle2, color: "text-green-600 bg-green-500/10 border-green-500/20" },
  error: { label: "Error", icon: AlertTriangle, color: "text-red-600 bg-red-500/10 border-red-500/20" },
  disconnected: { label: "Disconnected", icon: WifiOff, color: "text-muted-foreground bg-secondary border-border/40" },
  pending: { label: "Pending", icon: Clock, color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
};

export default function AdminIntegrations() {
  const [connections, setConnections] = useState([]);
  const [appConnectors, setAppConnectors] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const load = async () => {
    const [c, b, serviceStatus] = await Promise.all([
      base44.entities.IntegrationConnection.list("-created_date", 500),
      base44.entities.Brand.list(),
      base44.functions.invoke("adminSummaries", { action: "integration_connector_status" }).catch(() => null),
    ]);
    setConnections(c);
    setBrands(b);
    const statusBody = serviceStatus?.data || serviceStatus || {};
    setAppConnectors(Array.isArray(statusBody.connectors) ? statusBody.connectors : []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.IntegrationConnection.subscribe(load);
    return () => unsub?.();
  }, []);

  const getBrand = (email) => brands.find(b => b.created_by === email);

  const byType = connections.reduce((acc, c) => {
    acc[c.integration_type] = (acc[c.integration_type] || 0) + 1;
    return acc;
  }, {});

  const connected = connections.filter(c => c.status === "connected");
  const errored = connections.filter(c => c.status === "error");

  const filtered = connections.filter(c => {
    const brand = getBrand(c.user_email);
    const q = search.toLowerCase();
    const matchQ = !q || c.user_email?.toLowerCase().includes(q) || brand?.name?.toLowerCase().includes(q) || c.integration_type?.includes(q);
    const matchT = typeFilter === "all" || c.integration_type === typeFilter;
    return matchQ && matchT;
  });

  if (loading) return <div className="flex items-center justify-center py-40"><div className="w-6 h-6 rounded-full border-2 border-border border-t-foreground animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-[-0.03em]">Integration Monitoring</h1>
        <p className="text-xs text-muted-foreground/50 mt-0.5">App services and merchant connections · Tokens remain server-side</p>
      </div>

      {/* Security notice */}
      <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 bg-secondary/30">
        <Shield size={13} className="text-muted-foreground/50 shrink-0" />
        <p className="text-[11px] text-muted-foreground/60">Merchant imports are monitored separately from CAMBRA app-service connectors. This page exposes status only; credentials and tokens never enter the browser.</p>
      </div>

      <div className="p-5 rounded-xl border border-border/50 bg-card">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">CAMBRA app service connections</p>
        <p className="mt-1 text-[11px] text-muted-foreground/60">Operational connectors used by the CAMBRA application. Their permissions are governed at connector level and are not merchant import connections.</p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {appConnectors.map((connector) => (
            <div key={connector.key} className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-secondary/20 p-3">
              <div className="min-w-0">
                <p className="text-xs font-black">{connector.label}</p>
                <p className="text-[10px] text-muted-foreground">App service · status-only projection</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${connector.connected ? STATUS_CFG.connected.color : STATUS_CFG.disconnected.color}`}>
                {connector.connected ? "Connected" : "Not connected"}
              </span>
            </div>
          ))}
          {appConnectors.length === 0 && <div className="sm:col-span-2 rounded-xl border border-dashed p-4 text-xs text-muted-foreground">App connector status is unavailable. No disconnected state is inferred.</div>}
        </div>
      </div>

      {/* Optional per-user imports are a separate connector scope. */}
      <div className="p-5 rounded-xl border border-border/50 bg-card">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">Optional per-user import connectors</p>
        <p className="mb-3 mt-1 text-[11px] text-muted-foreground/60">These optional Analyzer imports are independent from the CAMBRA app services above.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ConnectorTile
            title="Google Drive"
            note="Read-only access to files for Analyzer"
            connectorId={CONNECTOR_IDS.drive}
            functionName="driveConnectionCheck"
            connectorKey="drive"
          />
          <ConnectorTile
            title="Google Sheets"
            note="Read-only access to spreadsheets"
            connectorId={CONNECTOR_IDS.sheets}
            functionName="sheetsConnectionCheck"
            connectorKey="sheets"
          />
          <ConnectorTile
            title="Gmail"
            note="Read-only labels/messages for ingestion"
            connectorId={CONNECTOR_IDS.gmail}
            functionName="gmailConnectionCheck"
            connectorKey="gmail"
          />
          <ConnectorTile
            title="Slack"
            note="Read-only to list basic channels (optional)"
            connectorId={CONNECTOR_IDS.slack}
            functionName="slackConnectionCheck"
            connectorKey="slack"
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Merchant Connections</p>
          <p className="text-2xl font-black">{connections.length}</p>
        </div>
        <div className="p-4 rounded-xl border border-green-500/20 bg-green-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Merchant Active</p>
          <p className="text-2xl font-black text-green-600">{connected.length}</p>
        </div>
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/[0.04]">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Merchant Errors</p>
          <p className="text-2xl font-black text-red-600">{errored.length}</p>
        </div>
        <div className="p-4 rounded-xl border border-border/50 bg-card">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-1">Brands Connected</p>
          <p className="text-2xl font-black">{new Set(connected.map(c => c.user_email)).size}</p>
        </div>
      </div>

      {/* Breakdown by type */}
      <div className="p-5 rounded-xl border border-border/50 bg-card">
        <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 mb-4">By Integration Type</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(INTEGRATION_META).map(([type, meta]) => (
            <button key={type} onClick={() => setTypeFilter(typeFilter === type ? "all" : type)}
              className={`p-3 rounded-lg border transition-all text-left ${typeFilter === type ? "border-foreground/20 bg-foreground/5" : "border-border/40 hover:border-border"}`}>
              <div className="text-base mb-1">{meta.icon}</div>
              <p className="text-xs font-semibold">{meta.label}</p>
              <p className="text-[10px] text-muted-foreground/40">{byType[type] || 0} connections</p>
            </button>
          ))}
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by brand or email..."
          className="h-9 min-w-0 max-w-full px-4 text-sm bg-secondary/60 border border-border/50 rounded-lg focus:outline-none w-64" />
        {errored.length > 0 && (
          <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-red-500/[0.06] border border-red-500/20 text-red-600 text-xs font-semibold">
            <AlertTriangle size={11} /> {errored.length} error{errored.length > 1 ? "s" : ""} requiring attention
          </div>
        )}
      </div>

      {/* Table */}
      <div className="max-w-full overflow-x-auto rounded-xl border border-border/50">
        <div className="min-w-[780px]">
        <div className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] px-5 py-3 bg-secondary/40 border-b border-border/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50 gap-3">
          <span>Company</span><span>Integration</span><span>Status</span><span>Last Sync</span><span>Read Only</span>
        </div>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground/50">No connections found</div>
        )}
        {filtered.map(c => {
          const brand = getBrand(c.user_email);
          const meta = INTEGRATION_META[c.integration_type] || INTEGRATION_META.other;
          const cfg = STATUS_CFG[c.status] || STATUS_CFG.disconnected;
          const StatusIcon = cfg.icon;
          const lastSync = c.last_sync ? new Date(c.last_sync) : null;
          const stale = lastSync && (Date.now() - lastSync.getTime()) > 24 * 3600000;
          return (
            <div key={c.id} className="grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr] px-5 py-3.5 border-b border-border/20 last:border-0 items-center gap-3">
              <div>
                <p className="text-xs font-bold">{brand?.name || c.user_email}</p>
                <p className="text-[11px] text-muted-foreground/40 truncate">{c.user_email}</p>
              </div>
              <div className="flex items-center gap-2">
                <span>{meta.icon}</span>
                <div>
                  <p className="text-xs font-medium">{meta.label}</p>
                  <p className="text-[10px] text-muted-foreground/40">{meta.category}</p>
                </div>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit flex items-center gap-1 ${cfg.color}`}>
                <StatusIcon size={9} /> {cfg.label}
              </span>
              <p className={`text-xs ${stale ? "text-orange-500" : "text-muted-foreground/50"}`}>
                {lastSync ? lastSync.toLocaleDateString("en-GB") : "Never"}
                {stale && " ⚠"}
              </p>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit ${c.is_read_only !== false ? "text-green-600 bg-green-500/10 border-green-500/20" : "text-orange-500 bg-orange-500/10 border-orange-500/20"}`}>
                {c.is_read_only !== false ? "Read-only" : "Write"}
              </span>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
