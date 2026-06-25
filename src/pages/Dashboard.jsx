import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, CheckCircle2, Sparkles, RefreshCw,
  CreditCard, Truck, Package, Plug, Building2, Store, Mail, Headphones, Users, Wifi, Layers,
  TrendingUp as TrendingUpIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import UpgradeToVerified from "@/components/shared/UpgradeToVerified";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import { useToast } from "@/components/shared/Toast.jsx";
import { useNavigate } from "react-router-dom";

import InfrastructureStatus from "@/components/dashboard/InfrastructureStatus";
import LastScanBar from "@/components/dashboard/LastScanBar";
import AIInsightsPanel from "@/components/dashboard/AIInsightsPanel";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import PageHero from "@/components/shared/PageHero";
import SavingsTrendPanel from "@/components/dashboard/SavingsTrendPanel";
import { useTranslation } from "@/lib/i18n.jsx";
import CambraCTA from "@/components/shared/CambraCTA";

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
  if (status === "verified" || cc === "verified") return { label: t("badge_verified"), cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25" };
  if (status === "connected" || cc === "connected") return { label: t("badge_connected"), cls: "bg-cyan-400/10 text-cyan-300 border-cyan-400/25" };
  if (status === "detected") return { label: t("badge_detected"), cls: "bg-blue-400/10 text-blue-300 border-blue-400/25" };
  return { label: t("badge_estimated"), cls: "bg-amber-400/10 text-amber-300 border-amber-400/25" };
}

/* ── main ────────────────────────────────────────────────────── */
export default function Dashboard() {
  const { t, lang } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const formatEur = (n) => formatEurLocal(n, lang);
  const [user, setUser] = useState(null);
  const [brand, setBrand] = useState(null);
  const [latest, setLatest] = useState(null);
  const [stripeConn, setStripeConn] = useState(null);
  const [graphNodes, setGraphNodes] = useState([]);
  const [hasLiveDeal, setHasLiveDeal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);

  const handleRescan = async () => {
    if (!brand || rescanning) return;
    setRescanning(true);
    toast.info(t("scanning_toast"));
    try {
      await base44.functions.invoke("discoverCompanyInfrastructure", {
        brand_id: brand.id,
        website_url: brand.website,
      });
      toast.success(t("scan_complete_toast"));
    } catch (e) {
      toast.error(t("sync_error"));
    } finally {
      setRescanning(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        // Auth is no longer enforced at the route level — degrade gracefully
        // when the user is not signed in instead of crashing on u.id.
        const u = await base44.auth.me().catch(() => null);
        setUser(u);
        if (!u) { setLoading(false); return; }

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

  if (loading) return (
    <div style={{ padding: 24, color: "#666", fontSize: 14 }}>Loading…</div>
  );

  const firstName = user?.full_name ? user.full_name.split(" ")[0] : t("dashboard_word");
  const stripeConnected = !!stripeConn;

  /* ───── STATE A: no AnalyzerResult yet ───── */
  if (!latest) {
    return (
      <div style={{ paddingBottom: 40 }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "48px 16px" }}>
          <div
            style={{
              width: "100%",
              maxWidth: 576,
              borderRadius: 24,
              padding: "40px 32px",
              textAlign: "center",
              background: "#ffffff",
              border: "1px solid #e5e5e5",
              boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
            }}
          >
            <div
              style={{
                width: 56, height: 56, borderRadius: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 24px",
                background: "#f0fafd",
                border: "1px solid #c0e9f0",
              }}
            >
              <Sparkles size={20} style={{ color: "#0891b2" }} />
            </div>
            <h1
              style={{
                color: "#0a0a0a",
                marginBottom: 12,
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 36px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              {t("state_a_title")}
            </h1>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 28, maxWidth: 420, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
              {t("state_a_sub")}
            </p>
            <CambraCTA intent="audit" size="lg" />
          </div>
        </div>

        {/* Feature hint cards — plain */}
        <div style={{ maxWidth: 768, margin: "0 auto", padding: "0 16px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { icon: Plug, title: t("auto_detection"), desc: t("ct_page_sub") },
              { icon: Layers, title: t("bench_comparison"), desc: t("benchmarked_against", { n: "100+", country: "EU" }) },
              { icon: TrendingUpIcon, title: t("savings_calc"), desc: t("measured_cumulative") },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                style={{
                  borderRadius: 16,
                  padding: 20,
                  textAlign: "left",
                  background: "#ffffff",
                  border: "1px solid #e5e5e5",
                }}
              >
                <div
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginBottom: 12,
                    background: "#f0fafd",
                    border: "1px solid #c0e9f0",
                  }}
                >
                  <Icon size={14} style={{ color: "#0891b2" }} />
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#0a0a0a", marginBottom: 4 }}>{title}</p>
                <p style={{ fontSize: 11, color: "#666", lineHeight: 1.4 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ───── STATE B / C: result exists ───── */
  const heroBadge = stripeConnected
    ? { label: t("state_c_badge"), cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25", dot: "bg-emerald-400" }
    : { label: t("state_b_badge"), cls: "bg-amber-400/10 text-amber-300 border-amber-400/25", dot: "bg-amber-400" };

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
    <div className="space-y-6 pb-10" style={{ color: "#0a0a0a" }}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-2">
        <div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4"
            style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/65">
              {stripeConnected ? t("state_c_badge") : t("state_b_badge")}
            </span>
          </div>
          <h1
            className="text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(32px, 5vw, 48px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 0.98,
            }}
          >
            {firstName}.
          </h1>
          <p className="text-[14px] text-white/55 mt-2">{t("your_infrastructure")}</p>
        </div>
        <CambraCTA intent="audit" size="sm">{t("nav_analyzer")}</CambraCTA>
      </div>

      {/* ── SAVINGS HERO ── */}
      <div
        className="relative rounded-3xl p-6 sm:p-8 overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6), 0 0 60px -20px rgba(96,165,250,0.18)",
        }}
      >
        {/* ambient halo */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            width: 500, height: 500, right: "-10%", top: "-30%",
            background: "radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%)",
            filter: "blur(70px)",
          }}
        />
        <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex-1 min-w-0">
            <div className={`inline-flex items-center gap-1.5 mb-3 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-[0.18em] font-bold ${heroBadge.cls}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${heroBadge.dot}`} />
              {heroBadge.label}
            </div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/45 font-bold mb-2">{t("identified_potential")}</p>
            <p
              className="tabular-nums leading-none"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
                fontWeight: 900,
                letterSpacing: "-0.05em",
                background: "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                filter: "drop-shadow(0 0 22px rgba(34,211,238,0.35))",
              }}
            >
              <AnimatedCounter
                value={Number(latest.total_savings) || 0}
                format={(n) => formatEur(n)}
                duration={1.8}
              />
              <span className="text-[0.35em] font-bold text-white/40 ml-2" style={{ WebkitTextFillColor: "rgba(255,255,255,0.4)" }}>/{t("per_yr_short")}</span>
            </p>
            <p className="text-sm text-white/60 mt-3 max-w-md">{heroSubtitle}</p>
          </div>

          <div className="shrink-0 w-full sm:w-auto sm:max-w-xs">
            {stripeConnected ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 text-xs font-bold">
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

      {/* Quick action strip — State B only (analysis exists, Stripe not connected) */}
      {!stripeConnected && (
        <div className="flex flex-wrap gap-2 mb-2">
          <button
            type="button"
            onClick={() => navigate("/ConnectTools")}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all hover:translate-y-[-1px]"
            style={{
              background: "rgba(59,130,246,0.10)",
              border: "1px solid rgba(59,130,246,0.30)",
              color: "#93c5fd",
            }}
          >
            <Plug size={12} /> {t("quick_connect_stripe")}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/Results?id=${latest.id}`)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition-all hover:translate-y-[-1px]"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "rgba(255,255,255,0.80)",
            }}
          >
            {t("quick_view_results")} <ArrowRight size={12} />
          </button>
          <button
            type="button"
            onClick={handleRescan}
            disabled={rescanning || !brand}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all hover:translate-y-[-1px] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.45)",
            }}
          >
            <RefreshCw size={12} className={rescanning ? "animate-spin" : ""} /> {t("quick_rescan")}
          </button>
        </div>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: t("payments_title"), value: latest.payment_savings, icon: CreditCard },
          { label: t("shipping_title"), value: latest.shipping_savings, icon: Truck },
          { label: t("saas_title"),     value: latest.saas_savings,     icon: Package },
        ].map(s => (
          <div
            key={s.label}
            className="rounded-2xl p-5 transition-all hover:border-white/20"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{
                  background: "rgba(59,130,246,0.08)",
                  border: "1px solid rgba(96,165,250,0.20)",
                }}
              >
                <s.icon size={13} className="text-blue-300" />
              </div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45 font-bold">{s.label}</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-white" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", letterSpacing: "-0.03em" }}>
              {formatEur(s.value)}<span className="text-xs text-white/40 font-normal ml-1">/{t("per_yr_short")}</span>
            </p>
          </div>
        ))}
      </div>

      {/* ── INFRASTRUCTURE NODES — grouped ── */}
      {graphNodes.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black tracking-tight text-white" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>{t("your_infrastructure")}</h2>
            <Link to="/ConnectTools" className="text-[11px] font-semibold text-white/55 hover:text-white transition-colors inline-flex items-center gap-1">
              <Plug size={10} /> {t("connect_more")}
            </Link>
          </div>
          <div className="space-y-3 max-h-[28rem] sm:max-h-none overflow-y-auto sm:overflow-visible">
            {CATEGORY_ORDER.filter(cat => grouped[cat]).map(cat => {
              const Icon = grouped[cat].icon;
              const items = grouped[cat].items;
              return (
                <div
                  key={cat}
                  className="rounded-2xl overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    className="px-4 py-2.5 flex items-center gap-2"
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <Icon size={12} className="text-white/50" aria-hidden="true" />
                    <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/55">
                      {t(CATEGORY_I18N_KEY[cat] || "cat_other")}
                    </span>
                    <span className="text-[10px] text-white/30">({items.length})</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                    {items.map(n => {
                      const b = nodeBadge(n, t);
                      return (
                        <div key={n.id} className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                          <p className="text-sm font-semibold flex-1 min-w-0 truncate text-white">{n.provider_name}</p>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-bold ${b.cls}`}>
                            {b.label}
                          </span>
                          {Number(n.monthly_cost) > 0 && (
                            <span className="text-xs font-bold tabular-nums whitespace-nowrap text-white/80">
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


    </div>
  );
}