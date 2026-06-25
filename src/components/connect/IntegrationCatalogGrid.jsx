import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Check, Sparkles, Plug, Clock, ArrowRight } from "lucide-react";

/**
 * M5 — IntegrationCatalogGrid
 *
 * Dynamic catalog driven by getIntegrationStatus.
 * Groups by category; shows display_status badge and per-state CTA.
 * Preserves existing Stripe flow (rendered separately on the page).
 */

const CATEGORY_ORDER = [
  { key: "payments",  label: "Payments" },
  { key: "commerce",  label: "Commerce" },
  { key: "shipping",  label: "Shipping" },
  { key: "finance",   label: "Finance" },
  { key: "marketing", label: "Marketing" },
  { key: "support",   label: "Support" },
  { key: "analytics", label: "Analytics" },
  { key: "banking",   label: "Banking" },
  { key: "hr",        label: "HR" },
];

function StatusBadge({ status }) {
  const map = {
    connected:   { label: "Connected",   cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
    detected:    { label: "Detected",    cls: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
    available:   { label: "Available",   cls: "bg-secondary text-muted-foreground border-border/60" },
    coming_soon: { label: "Coming soon", cls: "bg-secondary text-muted-foreground/70 border-border/60" },
  };
  const m = map[status] || map.available;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${m.cls}`}>
      {status === "connected" && <Check size={9} />}
      {status === "detected" && <Sparkles size={9} />}
      {status === "coming_soon" && <Clock size={9} />}
      {m.label}
    </span>
  );
}

function IntegrationCard({ item, brandId, onChanged, hideStripe }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Stripe is rendered by StripeConnectCard on the page — skip it here to avoid double UI
  if (hideStripe && item.integration_id === "stripe") return null;

  const handleConnect = async () => {
    if (!brandId) { setMsg("Create a brand first to connect."); return; }
    setBusy(true);
    setMsg("");
    try {
      const res = await base44.functions.invoke("initiateConnection", {
        brand_id: brandId,
        integration_id: item.integration_id,
      });
      const payload = res?.data || res;
      if (!payload?.ok) {
        setMsg(payload?.error || "Could not start connection.");
      } else {
        setMsg("Session started.");
        onChanged?.();
      }
    } catch (e) {
      setMsg(e?.message || "Connection failed.");
    } finally {
      setBusy(false);
    }
  };

  const renderCta = () => {
    if (item.display_status === "connected") {
      return (
        <span className="text-[11px] text-muted-foreground">
          {item.connected_at ? `Last sync ${new Date(item.connected_at).toLocaleDateString()}` : "Connected"}
        </span>
      );
    }
    if (item.display_status === "detected") {
      return (
        <button
          onClick={handleConnect}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}
          Connect to verify
        </button>
      );
    }
    if (item.display_status === "available") {
      return (
        <button
          onClick={handleConnect}
          disabled={busy}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Plug size={11} />}
          Connect
        </button>
      );
    }
    // coming_soon / planned
    return (
      <span className="text-[11px] text-muted-foreground/70 inline-flex items-center gap-1">
        <Clock size={10} /> Coming soon
      </span>
    );
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-border/60 bg-white hover:border-foreground/30 transition-colors">
      <div className="w-10 h-10 rounded-xl bg-secondary border border-border/60 flex items-center justify-center shrink-0 text-[11px] font-black text-foreground">
        {item.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
          <StatusBadge status={item.display_status} />
          {item.display_status === "detected" && item.confidence_score != null && (
            <span className="text-[10px] text-muted-foreground">
              {Math.round(item.confidence_score * 100)}% confidence
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground truncate">{item.value_unlock || item.description}</p>
        {msg && <p className="text-[10px] text-muted-foreground/70 mt-1">{msg}</p>}
      </div>
      <div className="shrink-0">{renderCta()}</div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-4 rounded-2xl border border-border/60 bg-white animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-secondary" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-32 bg-secondary rounded" />
        <div className="h-2.5 w-56 bg-secondary rounded" />
      </div>
      <div className="h-8 w-24 bg-secondary rounded-full" />
    </div>
  );
}

export default function IntegrationCatalogGrid({ hideStripe = true }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [brandId, setBrandId] = useState(null);
  const [integrations, setIntegrations] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("getIntegrationStatus", {});
      const payload = res?.data || res;
      if (!payload?.ok) {
        setError(payload?.error || "Could not load integrations.");
      } else {
        setIntegrations(payload.integrations || []);
        setBrandId(payload.brand_id || null);
      }
    } catch (e) {
      setError(e?.message || "Could not load integrations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-5 rounded-2xl border border-border/60 bg-white text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  // Group by category in defined order
  const byCat = new Map();
  for (const item of integrations) {
    const k = item.category || "other";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(item);
  }

  const sections = CATEGORY_ORDER
    .map(c => ({ ...c, items: byCat.get(c.key) || [] }))
    .filter(s => s.items.length > 0);

  return (
    <div className="space-y-7">
      {sections.map(section => (
        <div key={section.key} className="space-y-2">
          <h3 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground px-1">
            {section.label}
          </h3>
          <div className="space-y-2">
            {section.items
              .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
              .map(item => (
                <IntegrationCard
                  key={item.integration_id}
                  item={item}
                  brandId={brandId}
                  onChanged={load}
                  hideStripe={hideStripe}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}