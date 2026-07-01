import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, CheckCircle2, RefreshCw, Sparkles, Clock,
  CreditCard, Truck, Building2, Mail, Headphones, Users, Wifi, Store, Layers,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import Navbar from "@/components/landing/Navbar";
import StripeConnectCard from "@/components/connect/StripeConnectCard.jsx";
import { useTranslation } from "@/lib/i18n.jsx";
import { useToast } from "@/components/shared/Toast.jsx";
import { CONNECTORS } from "@/lib/connectors.config";

// E(a) — OAuth-backed integrations that are still pending real workspace OAuth
// credentials. While CONNECTORS[id] is empty, force these to render as
// "coming_soon" so users don't hit a dead Connect button. Once the OAuth app
// is registered and the id is filled in, the override falls through and the
// real catalog_status takes over.
const OAUTH_PENDING_IDS = {
  google_drive: "drive",
  google_sheets: "sheets",
  gmail: "gmail",
  slack: "slack",
};
function isOAuthPending(integrationId) {
  const key = OAUTH_PENDING_IDS[integrationId];
  if (!key) return false;
  return !CONNECTORS[key];
}

/* ── helpers ─────────────────────────────────────────────────── */
const CATEGORY_ORDER = [
  "payments", "commerce", "banking", "shipping",
  "marketing", "finance", "support", "hr", "telecom",
];

// FIX 1 — each category maps to its own dedicated translation key.
const CATEGORY_META = {
  payments:  { labelKey: "cat_payments",  fallback: "Payments",  icon: CreditCard },
  commerce:  { labelKey: "cat_commerce",  fallback: "Commerce",  icon: Store },
  banking:   { labelKey: "cat_banking",   fallback: "Banking",   icon: Building2 },
  shipping:  { labelKey: "cat_shipping",  fallback: "Shipping",  icon: Truck },
  marketing: { labelKey: "cat_marketing", fallback: "Marketing", icon: Mail },
  finance:   { labelKey: "cat_finance",   fallback: "Finance",   icon: Layers },
  support:   { labelKey: "cat_support",   fallback: "Support",   icon: Headphones },
  hr:        { labelKey: "cat_hr",        fallback: "HR",        icon: Users },
  telecom:   { labelKey: "cat_telecom",   fallback: "Telecom",   icon: Wifi },
  logistics: { labelKey: "cat_logistics", fallback: "Logistics", icon: Truck },
  analytics: { labelKey: "cat_analytics", fallback: "Analytics", icon: Layers },
  other:     { labelKey: "cat_other",     fallback: "Other",     icon: Layers },
};

function timeAgo(iso) {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function CardSkeleton() {
  return (
    <div className="p-4 rounded-2xl border border-border/60 bg-card animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 bg-secondary rounded" />
          <div className="h-2.5 w-48 bg-secondary/60 rounded" />
        </div>
        <div className="h-7 w-20 bg-secondary rounded-full" />
      </div>
    </div>
  );
}

/* ── status badge ────────────────────────────────────────────── */
function StatusBadge({ integration, stripeConnected, t, formatEur }) {
  const status = integration.display_status;
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border-emerald-500/25">
        <CheckCircle2 size={9} /> {t("badge_connected")}
      </span>
    );
  }
  if (integration.inferred_from_payments && stripeConnected) {
    const cost = Number(integration.inferred_monthly_cost || 0);
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-purple-500/10 text-purple-600 border-purple-500/25">
        <Sparkles size={9} /> {cost > 0
          ? t("found_in_stripe", { amount: Math.round(cost).toLocaleString() })
          : t("detected_source_stripe")}
      </span>
    );
  }
  if (status === "detected") {
    const pct = integration.confidence_score != null ? Math.round(Number(integration.confidence_score) * 100) : null;
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-blue-500/10 text-blue-600 border-blue-500/25">
        {t("badge_detected")}{pct != null ? ` · ${pct}%` : ""}
      </span>
    );
  }
  if (status === "available") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-secondary text-muted-foreground border-border/60">
        {t("badge_available")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold bg-secondary text-muted-foreground/60 border-border/40">
      <Clock size={9} /> {t("badge_coming_soon")}
    </span>
  );
}

function ActionCTA({ integration, stripeConnected, t, onSync, onConnect }) {
  const status = integration.display_status;
  if (status === "connected") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          {t("last_sync", { time: timeAgo(integration.last_verified_at) })}
        </span>
        <button
          type="button"
          onClick={() => onSync?.(integration)}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-border/60 text-[11px] font-bold text-foreground hover:border-foreground/40 transition-colors min-h-[44px] sm:min-h-0"
        >
          <RefreshCw size={10} aria-hidden="true" /> {t("sync_now")}
        </button>
      </div>
    );
  }
  if (status === "detected" || (integration.inferred_from_payments && stripeConnected)) {
    return (
      <button
        onClick={() => onConnect?.(integration)}
        className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 min-h-[44px] sm:min-h-0"
      >
        {t("connect_to_verify")} <ArrowRight size={10} />
      </button>
    );
  }
  if (status === "available") {
    return (
      <button
        onClick={() => onConnect?.(integration)}
        className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-foreground text-background text-[11px] font-bold hover:opacity-90 min-h-[44px] sm:min-h-0"
      >
        {t("nav_connect")} <ArrowRight size={10} />
      </button>
    );
  }
  // coming_soon / planned — graceful CTA registers interest
  return (
    <button
      onClick={() => onConnect?.(integration)}
      className="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-border/60 text-muted-foreground text-[11px] font-bold hover:text-foreground hover:border-foreground/40 min-h-[44px] sm:min-h-0"
    >
      <Clock size={10} /> {t("badge_coming_soon")}
    </button>
  );
}

/* ── integration card ────────────────────────────────────────── */
function IntegrationCard({ integration, stripeConnected, t, onSync, onConnect }) {
  const FallbackIcon = (CATEGORY_META[integration.category] || { icon: Layers }).icon;
  return (
    <div className="p-4 rounded-2xl border border-border/60 bg-card hover:border-foreground/30 transition-colors">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl border border-border/60 bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
          {integration.logo_url ? (
            <img src={integration.logo_url} alt={integration.name} className="w-6 h-6 object-contain" />
          ) : (
            <FallbackIcon size={15} className="text-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{integration.name}</p>
          {integration.value_unlock && (
            <p className="text-[11px] text-muted-foreground truncate">{integration.value_unlock}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <StatusBadge integration={integration} stripeConnected={stripeConnected} t={t} />
          <ActionCTA integration={integration} stripeConnected={stripeConnected} t={t} onSync={onSync} onConnect={onConnect} />
        </div>
      </div>
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────── */
export default function ConnectTools() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [grouped, setGrouped] = useState({});
  const [allIntegrations, setAllIntegrations] = useState([]);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [brandId, setBrandId] = useState(null);

  // Handle connect button. coming_soon → friendly info + record interest lead.
  const handleConnect = async (integration) => {
    const status = integration.display_status;
    if (status === "coming_soon" || integration.catalog_status === "coming_soon" || integration.catalog_status === "planned") {
      toast.success(`${integration.name} — coming soon. We'll let you know.`);
      try {
        await base44.entities.ProviderLead.create({
          integration_id: integration.integration_id,
          brand_id: brandId,
          interest_expressed_at: new Date().toISOString(),
        });
      } catch { /* non-fatal */ }
      return;
    }
    try {
      const res = await base44.functions.invoke("initiateConnection", {
        integration_id: integration.integration_id,
        brand_id: brandId,
      });
      const data = res?.data || res;
      if (!data?.ok && data?.status === "coming_soon") {
        toast.success(`${integration.name} — coming soon. We'll let you know.`);
        return;
      }
      if (data?.redirect_url) { window.location.href = data.redirect_url; return; }
      if (data?.ok) toast.success(`${integration.name} connection started.`);
      else if (data?.error) toast.error(data.error);
    } catch (err) {
      toast.error(err?.message || "Could not start connection.");
    }
  };

  // FIX 4 — handler for Sync button on connected integration rows.
  // Only Stripe has a real sync endpoint today; for other integrations we still
  // give the user feedback and leave the visual state unchanged.
  const handleSync = async (integration) => {
    try {
      if (integration.integration_id === "stripe") {
        const res = await base44.functions.invoke("stripeDataSync", {});
        const data = res?.data || res;
        if (data?.ok === false || data?.error) {
          toast.error(t("sync_error"), data?.error || undefined);
          return;
        }
      }
      toast.success(t("sync_success"));
    } catch (err) {
      toast.error(t("sync_error"), err?.message || undefined);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Get brand
        const me = await base44.auth.me().catch(() => null);
        if (!me) { setLoading(false); return; }
        const brands = await base44.entities.Brand.filter({ created_by: me.email }, "-created_date", 1).catch(() => []);
        const bId = brands[0]?.id;
        setBrandId(bId);

        if (!bId) { setLoading(false); return; }

        // Check Stripe
        try {
          const sc = await base44.entities.StripeConnection
            .filter({ brand_id: bId, connection_status: "connected" }, "-last_sync_at", 1);
          setStripeConnected(sc.length > 0);
        } catch (_) {}

        // Get grouped integration status
        const res = await base44.functions.invoke("getIntegrationStatus", { brand_id: bId });
        const payload = res?.data || res;
        if (payload?.ok) {
          setGrouped(payload.grouped || {});
          setAllIntegrations(payload.integrations || []);
        }
      } catch (err) {
        console.warn("ConnectTools load error:", err?.message || err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Summary counts
  const flatList = Object.values(grouped).flat();
  const sourceList = flatList.length ? flatList : allIntegrations;
  const detectedCount = sourceList.filter(i => i.is_detected || i.display_status === "detected").length;
  const connectedCount = sourceList.filter(i => i.is_connected || i.display_status === "connected").length;
  const availableCount = sourceList.filter(i => i.display_status === "available").length;

  return (
    <div className="relative min-h-screen bg-background font-inter flex flex-col overflow-x-hidden">
      <Navbar />

      <div className="relative flex-1 max-w-4xl mx-auto w-full px-5 pt-20 pb-12 mt-14 space-y-6">

        {/* Header */}
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em]">{t("ct_page_title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("ct_page_sub")}</p>
        </div>

        {/* Summary bar */}
        <div className="px-4 py-3 rounded-2xl border border-border/60 bg-secondary/30 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs">
          <span className="font-semibold">
            <span className="text-muted-foreground">{t("summary_detected", { n: detectedCount })}</span>
          </span>
          <span className="font-semibold">
            <span className="text-emerald-600">{t("summary_connected", { n: connectedCount })}</span>
          </span>
          <span className="font-semibold">
            <span className="text-muted-foreground">{t("summary_available", { n: availableCount })}</span>
          </span>
        </div>

        {/* Stripe — always first */}
        <div>
          <StripeConnectCard />
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
        )}

        {/* Grouped categories */}
        {!loading && CATEGORY_ORDER.map(catKey => {
          const items = (grouped[catKey] || [])
            // skip Stripe in payments — it's shown above
            .filter(it => !(catKey === "payments" && it.integration_id === "stripe"));

          // E(a) — gate Drive/Sheets/Gmail/Slack while OAuth creds aren't registered.
          const gatedItems = items.map(it => {
            if (it.display_status !== "connected" && isOAuthPending(it.integration_id)) {
              return { ...it, display_status: "coming_soon", catalog_status: "coming_soon" };
            }
            return it;
          });
          if (gatedItems.length === 0) return null;

          const meta = CATEGORY_META[catKey] || { labelKey: null, fallback: catKey, icon: Layers };
          const Icon = meta.icon;
          const label = meta.labelKey ? t(meta.labelKey) : meta.fallback;

          return (
            <section key={catKey} className="space-y-2.5">
              <div className="sticky top-14 z-10 -mx-5 px-5 py-2.5 bg-background/95 backdrop-blur-md border-b border-border/30 flex items-center gap-2">
                <Icon size={13} className="text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-black tracking-tight">{label}</h2>
                <span className="text-xs text-muted-foreground/60 tabular-nums">({items.length})</span>
              </div>
              <div className="space-y-2">
                {gatedItems.map(it => (
                  <IntegrationCard
                    key={it.integration_id}
                    integration={it}
                    stripeConnected={stripeConnected}
                    t={t}
                    onSync={handleSync}
                    onConnect={handleConnect}
                  />
                ))}
              </div>
            </section>
          );
        })}

        {/* Footer */}
        {!loading && (
          <div className="pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {t("ct_page_sub")}
            </p>
            <Link to="/Analyzer">
              <Button className="h-10 rounded-full px-5 text-sm font-bold gap-2 min-h-[44px] sm:min-h-0">
                {t("nav_analyzer")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}