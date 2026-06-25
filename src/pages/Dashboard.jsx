import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, CheckCircle2, AlertTriangle, Sparkles,
  CreditCard, Truck, Package, Plug, Building2, Store, Mail, Headphones, Users, Wifi, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import UpgradeToVerified from "@/components/shared/UpgradeToVerified";

import InfrastructureStatus from "@/components/dashboard/InfrastructureStatus";
import LastScanBar from "@/components/dashboard/LastScanBar";
import AIInsightsPanel from "@/components/dashboard/AIInsightsPanel";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import PageHero from "@/components/shared/PageHero";
import SavingsTrendPanel from "@/components/dashboard/SavingsTrendPanel";
import { useTranslation } from "@/lib/i18n.jsx";

/* ── helpers ─────────────────────────────────────────────────── */
function formatEurLocal(n, lang) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  const locale = { en: "en-IE", fr: "fr-FR", es: "es-ES" }[lang] || "en-IE";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  } catch {
    return `€${v.toLocaleString()}`;
  }
}

// FIX 2 — Each category carries its own i18n key so its header renders translated.
const NODE_CATEGORY = {
  payment_provider:   { key: "Payments",  i18n: "cat_payments",  icon: CreditCard },
  commerce_platform:  { key: "Commerce",  i18n: "cat_commerce",  icon: Store },
  shipping_carrier:   { key: "Shipping",  i18n: "cat_shipping",  icon: Truck },
  logistics:          { key: "Shipping",  i18n: "cat_shipping",  icon: Truck },
  marketing:          { key: "Marketing", i18n: "cat_marketing", icon: Mail },
  saas_tool:          { key: "SaaS",      i18n: "saas_title",    icon: Package },
  analytics:          { key: "SaaS",      i18n: "saas_title",    icon: Package },
  support:            { key: "Support",   i18n: "cat_support",   icon: Headphones },
  bank:               { key: "Banking",   i18n: "cat_banking",   icon: Building2 },
  insurance:          { key: "Banking",   i18n: "cat_banking",   icon: Building2 },
  telecom:            { key: "Telecom",   i18n: "cat_telecom",   icon: Wifi },
  hr_tool:            { key: "HR",        i18n: "cat_hr",        icon: Users },
};
const CATEGORY_ORDER = ["Payments", "Commerce", "Shipping", "Marketing", "SaaS", "Banking", "Support", "HR", "Telecom"];
const CATEGORY_I18N_KEY = {
  Payments: "cat_payments",
  Commerce: "cat_commerce",
  Shipping: "cat_shipping",
  Marketing: "cat_marketing",
  SaaS:     "saas_title",
  Banking:  "cat_banking",
  Support:  "cat_support",
  HR:       "cat_hr",
  Telecom:  "cat_telecom",
};

function nodeBadge(node, t) {
  const status = node.status || "detected";
  const cc = node.cost_confidence || "estimated";
  if (status === "verified" || cc === "verified") return { label: t("badge_verified"), cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25" };
  if (status === "connected" || cc === "connected") return { label: t("badge_connected"), cls: "bg-blue-500/10 text-blue-600 border-blue-500/25" };
  if (status === "detected") return { label: t("badge_detected"), cls: "bg-purple-500/10 text-purple-600 border-purple-500/25" };
  return { label: t("badge_estimated"), cls: "bg-amber-500/10 text-amber-600 border-amber-500/25" };
}

/* ── main ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { t, lang } = useTranslation();
  const formatEur = (n) => formatEurLocal(n, lang);
  const [user, setUser] = useState(null);
  const [brand, setBrand] = useState(null);
  const [latest, setLatest] = useState(null);
  const [stripeConn, setStripeConn] = useState(null);
  const [graphNodes, setGraphNodes] = useState([]);
  const [hasLiveDeal, setHasLiveDeal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setUser(u);

        const brands = await base44.entities.Brand.filter({ created_by_id: u.id }, "-created_date", 1);
        const b = brands[0] || null;
        setBrand(b);

        const results = await base44.entities.AnalyzerResult
          .filter({ created_by_id: u.id }, "-created_date", 1);
        setLatest(results[0] || null);

        if (b) {
          try {
            const sc = await base44.entities.StripeConnection
              .filter({ brand_id: b.id, connection_status: "connected" }, "-last_sync_at", 1);
            setStripeConn(sc[0] || null);
          } catch (_) {}

          try {
            const g = await base44.functions.invoke("getInfrastructureGraph", { brand_id: b.id });
            const payload = g?.data || g;
            if (payload?.ok) setGraphNodes(payload.nodes || []);
          } catch (_) {}

          try {
            const acts = await base44.entities.DealActivation.filter({ brand_id: b.id });
            const live = (acts || []).some(a => ["live", "authorized", "migrating", "monetizing"].includes(a.status));
            setHasLiveDeal(live);
          } catch (_) {}
        }
      } catch (err) {
        console.warn("Dashboard init error:", err?.message || err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <DashboardSkeleton />;

  const firstName = user?.full_name ? user.full_name.split(" ")[0] : t("dashboard_word");
  const stripeConnected = !!stripeConn;

  /* ───── STATE A: no AnalyzerResult yet ───── */
  if (!latest) {
    return (
      <div className="pb-10">
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-xl rounded-3xl border border-border/60 bg-card p-8 sm:p-10 text-center shadow-[0_8px_40px_-16px_rgba(0,0,0,0.12)]">
            <div className="w-14 h-14 rounded-2xl bg-secondary border border-border/60 flex items-center justify-center mx-auto mb-6">
              <Sparkles size={20} className="text-foreground" />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-black tracking-[-0.03em] mb-2">
              {t("state_a_title")}
            </h1>
            <p className="text-sm text-muted-foreground mb-7 max-w-md mx-auto leading-relaxed">
              {t("state_a_sub")}
            </p>
            <Link to="/Analyzer">
              <Button size="lg" className="h-12 rounded-full px-7 text-sm font-bold gap-2 min-h-[44px]">
                {t("state_a_cta")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex flex-wrap justify-center gap-2 mt-7">
              {[t("auto_detection"), t("bench_comparison"), t("savings_calc")].map(p => (
                <span key={p} className="text-[11px] px-3 py-1.5 rounded-full border border-border/60 bg-secondary/40 text-muted-foreground font-medium">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ───── STATE B / C: result exists ───── */
  const heroBadge = stripeConnected
    ? { label: t("state_c_badge"), cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", dot: "bg-emerald-500" }
    : { label: t("state_b_badge"), cls: "bg-amber-500/10 text-amber-600 border-amber-500/25", dot: "bg-amber-500" };

  const heroSubtitle = stripeConnected
    ? t("hero_confidence_verified")
    : t("hero_confidence_estimated");

  // Group nodes by category
  const grouped = {};
  for (const n of graphNodes) {
    const meta = NODE_CATEGORY[n.node_type] || { key: "Other", icon: Layers };
    if (!grouped[meta.key]) grouped[meta.key] = { icon: meta.icon, items: [] };
    grouped[meta.key].items.push(n);
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <PageHero
        eyebrow={stripeConnected ? t("state_c_badge") : t("state_b_badge")}
        title={`${firstName}.`}
        subtitle={t("your_infrastructure")}
        actions={
          <Link to="/Analyzer">
            <Button size="sm" className="h-10 rounded-full px-5 text-sm font-bold gap-1.5 bg-foreground text-background hover:opacity-90">
              {t("nav_analyzer")} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      />

      {/* ── SAVINGS HERO ── */}
      <div className="rounded-3xl border border-border/60 bg-card p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex-1 min-w-0">
            <div className={`inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-full border text-[11px] font-bold ${heroBadge.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${heroBadge.dot}`} />
              {heroBadge.label}
            </div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold mb-1">{t("identified_potential")}</p>
            <p className="font-display font-black tabular-nums tracking-[-0.04em] leading-none" style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)" }}>
              {formatEur(latest.total_savings)}<span className="text-[0.35em] font-bold text-muted-foreground/40 ml-2">/{t("per_yr_short")}</span>
            </p>
            <p className="text-sm text-muted-foreground/80 mt-3 max-w-md">{heroSubtitle}</p>
          </div>

          <div className="shrink-0 w-full sm:w-auto sm:max-w-xs">
            {stripeConnected ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 text-xs font-bold">
                <CheckCircle2 size={11} /> {t("payments_verified")}
              </div>
            ) : (
              <UpgradeToVerified
                vertical="payments"
                currentConfidence="estimated"
                isConnected={false}
                onConnect={() => { window.location.href = "/ConnectTools"; }}
              />
            )}
          </div>
        </div>
      </div>

      {/* FIX 3C — Quick stats: 2 cols on mobile, 3 on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: t("payments_title"), value: latest.payment_savings, icon: CreditCard },
          { label: t("shipping_title"), value: latest.shipping_savings, icon: Truck },
          { label: t("saas_title"),     value: latest.saas_savings,     icon: Package },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-secondary border border-border/60 flex items-center justify-center">
                <s.icon size={13} className="text-foreground" />
              </div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">{s.label}</p>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {formatEur(s.value)}<span className="text-xs text-muted-foreground/50 font-normal ml-1">/{t("per_yr_short")}</span>
            </p>
          </div>
        ))}
      </div>

      {/* ── INFRASTRUCTURE NODES — grouped ── */}
      {graphNodes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black tracking-tight">{t("your_infrastructure")}</h2>
            <Link to="/ConnectTools" className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1">
              <Plug size={10} /> {t("connect_more")}
            </Link>
          </div>
          <div className="space-y-3 max-h-[28rem] sm:max-h-none overflow-y-auto sm:overflow-visible">
            {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => {
              const Icon = grouped[cat].icon;
              const items = grouped[cat].items;
              return (
                <div key={cat} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/30 flex items-center gap-2">
                    <Icon size={12} className="text-muted-foreground" aria-hidden="true" />
                    <span className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground">
                      {t(CATEGORY_I18N_KEY[cat] || "cat_other")}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">({items.length})</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {items.map(n => {
                      const b = nodeBadge(n, t);
                      return (
                        <div key={n.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                          <p className="text-sm font-semibold flex-1 min-w-0 truncate">{n.provider_name}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${b.cls}`}>
                            {b.label}
                          </span>
                          {Number(n.monthly_cost) > 0 && (
                            <span className="text-xs font-bold tabular-nums whitespace-nowrap">
                              {formatEur(Number(n.monthly_cost))}/{t("per_mo_short")}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FIX 3C — Savings trend wrapped with horizontal scroll on mobile */}
      {(stripeConnected || hasLiveDeal) && brand && (
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[320px]">
            <SavingsTrendPanel
              brandId={brand.id}
              identifiedMonthly={(Number(latest.total_savings) || 0) / 12}
            />
          </div>
        </div>
      )}

      {/* ── M6 — Infrastructure status (unchanged) ── */}
      <InfrastructureStatus latest={latest} />

      {/* ── M7 — Last scan + re-scan (unchanged) ── */}
      <LastScanBar />

      {/* ── M8 — AI Insights (unchanged) ── */}
      <AIInsightsPanel />

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link to="/Analyzer">
          <div className="p-5 rounded-2xl border border-border/60 bg-card hover:border-foreground/40 transition-colors min-h-[44px]">
            <p className="text-sm font-bold mb-0.5">{t("nav_analyzer")}</p>
          </div>
        </Link>
        <Link to="/ConnectTools">
          <div className="p-5 rounded-2xl border border-border/60 bg-card hover:border-foreground/40 transition-colors min-h-[44px]">
            <p className="text-sm font-bold mb-0.5">{t("nav_connect")}</p>
            <p className="text-xs text-muted-foreground">{t("ct_page_sub")}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}