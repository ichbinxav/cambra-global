import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, Sparkles,
  CreditCard, Plug, Store, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { getMyActiveBrand } from "@/lib/getMyActiveBrand";
import { formatEur as formatEurLocal } from "@/lib/currencyFormats";

import LastScanBar from "@/components/dashboard/LastScanBar";
import AIInsightsPanel from "@/components/dashboard/AIInsightsPanel";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import SavingsTrendPanel from "@/components/dashboard/SavingsTrendPanel";
import DashboardHeroV2 from "@/components/dashboard/DashboardHeroV2";
import AccountSummaryPanel from "@/components/dashboard/AccountSummaryPanel";
import ActionCenter from "@/components/dashboard/ActionCenter";
import ReferralTeaser from "@/components/dashboard/ReferralTeaser";
import AnalysisTrendPanel from "@/components/dashboard/AnalysisTrendPanel";
import MerchantInformationTasks from "@/components/dashboard/MerchantInformationTasks";
import PaymentsDataInsights from "@/components/paymentsResults/PaymentsDataInsights";
import PaymentsInStoreInsights from "@/components/paymentsResults/PaymentsInStoreInsights";
import CollectiveModal from "@/components/paymentsResults/CollectiveModal";
import BookCallModal from "@/components/paymentsResults/BookCallModal";
import { useTranslation } from "@/lib/i18n.jsx";

// A merchant whose opportunity is this large gets routed to a human call
// instead of the self-serve collective (same thresholds as PaymentsResults).
const CALL_GMV_MONTHLY_EUR = 250000;
const CALL_ANNUAL_SAVINGS_EUR = 25000;

/* ── helpers ─────────────────────────────────────────────────── */
// Checkpoint H — the local formatEurLocal moved to @/lib/currencyFormats so the
// dashboard, the Action Center and the hero share ONE implementation. Output is
// unchanged (same locales, same rounding).

// FASE 1.1 — Payments-only UI. We keep NODE_CATEGORY / CATEGORY_ORDER as
// tiny objects but only render payments (+ commerce, since commerce
// platform detection is what surfaces the payment provider node in the
// first place). Other verticals are intentionally omitted from the UI —
// their data may still exist in the graph but stays hidden.
const NODE_CATEGORY = {
  payment_provider:   { key: "Payments",  i18n: "cat_payments",  icon: CreditCard },
  commerce_platform:  { key: "Commerce",  i18n: "cat_commerce",  icon: Store },
};
const CATEGORY_ORDER = ["Payments", "Commerce"];
const CATEGORY_I18N_KEY = {
  Payments: "cat_payments",
  Commerce: "cat_commerce",
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
  const navigate = useNavigate();
  const formatEur = (n) => formatEurLocal(n, lang);
  const [user, setUser] = useState(null);
  const [brand, setBrand] = useState(null);
  const [latest, setLatest] = useState(null);
  const [allResults, setAllResults] = useState([]);
  const [stripeConn, setStripeConn] = useState(null);
  const [graphNodes, setGraphNodes] = useState([]);
  const [hasLiveDeal, setHasLiveDeal] = useState(false);
  const [loading, setLoading] = useState(true);
  // Recovery destinations (collective / call) — same segment logic as the report.
  const [collectiveOpen, setCollectiveOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // A2 migration — resolve brand via contact_email (see getMyActiveBrand
        // docstring). Fixes the self-test / service-role brand empty-state hit.
        const { user: u, brand: b } = await getMyActiveBrand();
        setUser(u);
        setBrand(b);

        // AnalyzerResult remains scoped by brand_id when the brand exists —
        // that's the correct tenant boundary. Falls back to `[]` for users
        // without a brand, same visible behavior as the previous empty case.
        // Phase 2 — fetch up to 20 (newest first) to power the account
        // aggregate; `latest` stays the first (unchanged behavior for the hero).
        const results = b
          ? await base44.entities.AnalyzerResult
              .filter({ brand_id: b.id }, "-created_date", 20)
              .catch(() => [])
          : [];
        const latestResult = results[0] || null;
        setLatest(latestResult);
        setAllResults(results);

        if (b) {
          // P10 — never read credential-bearing Integration/StripeConnection rows in the browser.
          try {
            const statusRes = await base44.functions.invoke("getIntegrationStatus", { brand_id: b.id });
            const statusData = statusRes?.data || statusRes;
            const stripe = (statusData?.integrations || []).find(i => i.integration_id === "stripe" && i.is_connected);
            setStripeConn(stripe?.connection_id ? {
              id: stripe.connection_id, brand_id: statusData.brand_id,
              last_sync_at: stripe.last_sync_at, provider: stripe.connection_provider,
            } : null);
          } catch {}

          try {
            const g = await base44.functions.invoke("getInfrastructureGraph", { brand_id: b.id });
            const payload = g?.data || g;
            if (payload?.ok) setGraphNodes(payload.nodes || []);
          } catch {}

          try {
            const acts = await base44.entities.DealActivation.filter({ brand_id: b.id });
            const live = (acts || []).some(a => ["live", "authorized", "migrating", "monetizing"].includes(a.status));
            setHasLiveDeal(live);
          } catch {}
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
      <div className="pb-10 space-y-6">
        <MerchantInformationTasks lang={lang} />
        <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
          <div
            className="w-full max-w-xl rounded-3xl p-8 sm:p-10 text-center"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6), 0 0 60px -20px rgba(96,165,250,0.15)",
            }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{
                background: "rgba(34,211,238,0.08)",
                border: "1px solid rgba(34,211,238,0.25)",
                boxShadow: "0 0 24px rgba(34,211,238,0.18)",
              }}
            >
              <Sparkles size={20} className="text-cyan-300" />
            </div>
            <h1
              className="text-white mb-3"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 36px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              {t("state_a_title")}
            </h1>
            <p className="text-sm text-white/55 mb-7 max-w-md mx-auto leading-relaxed">
              {t("state_a_sub")}
            </p>
            <Link to="/Analyzer">
              <Button
                size="lg"
                className="h-12 rounded-full px-7 text-sm font-bold gap-2 min-h-[44px] bg-white text-black hover:bg-white/90"
                style={{
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 12px 32px -12px rgba(59,130,246,0.55), 0 0 28px rgba(59,130,246,0.22)",
                }}
              >
                {t("state_a_cta")} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex flex-wrap justify-center gap-2 mt-7">
              {[t("auto_detection"), t("bench_comparison"), t("savings_calc")].map(p => (
                <span
                  key={p}
                  className="text-[11px] px-3 py-1.5 rounded-full text-white/55 font-medium"
                  style={{ border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}
                >
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
  // BUG-2 FIX (2026-07-09) — the hero badge now derives from the ACTIVE
  // AnalyzerResult's `verification_status`, not from Integration connectivity.
  // Rationale: connecting Stripe is necessary but not sufficient — a row
  // materialized on provisional data (2 active days, 15 charges) is honestly
  // labeled "provisional", not "verified". Only `verification_status ===
  // "verified"` (which verifiedMaterializer emits at high confidence — ≥45
  // active days AND ≥30 charges) earns the emerald "Verified" pill.
  //
  // Three states:
  //   • verified          → emerald "Verified — based on real Stripe data"
  //   • pending_verification → blue "Provisional — verified on partial data"
  //   • estimated (or missing) → amber "Estimated — connect Stripe to verify"
  //
  // stripeConnected is intentionally NOT part of the gate anymore: an
  // Integration without a materialized AnalyzerResult ≠ verified savings.
  const verificationStatus = latest.verification_status || "estimated";
  const heroBadge =
    verificationStatus === "verified"
      ? { label: t("state_c_badge"), cls: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25", dot: "bg-emerald-400" }
    : verificationStatus === "pending_verification"
      ? { label: t("state_c_badge_provisional"), cls: "bg-blue-400/10 text-blue-300 border-blue-400/25", dot: "bg-blue-400" }
      : { label: t("state_b_badge"), cls: "bg-amber-400/10 text-amber-300 border-amber-400/25", dot: "bg-amber-400" };

  // Group nodes by category
  const grouped = {};
  for (const n of graphNodes) {
    const meta = NODE_CATEGORY[n.node_type] || { key: "Other", icon: Layers };
    if (!grouped[meta.key]) grouped[meta.key] = { icon: meta.icon, items: [] };
    grouped[meta.key].items.push(n);
  }

  // ── Recovery CTA routing (same contract + thresholds as PaymentsResults) ──
  const engineResult = latest?.details?.engine_result || null;
  const inputSnapshot = latest?.details?.input_snapshot || {};
  const buildCtaContext = () => ({
    gmv_eur_monthly: Number(inputSnapshot?.monthly_gmv_eur) || undefined,
    annual_savings_eur: Number(engineResult?.annual_savings_eur?.point) || Number(latest?.total_savings) || undefined,
    provider_slug: inputSnapshot?.provider_slug || undefined,
    country: inputSnapshot?.country || undefined,
    channel: engineResult?.cohort?.channel === "in_store" ? "in_store" : "online",
    uiContext: "generic",
  });
  const isHighValue = () => {
    const ctx = buildCtaContext();
    return (
      (isFinite(ctx.gmv_eur_monthly) && ctx.gmv_eur_monthly >= CALL_GMV_MONTHLY_EUR) ||
      (isFinite(ctx.annual_savings_eur) && ctx.annual_savings_eur >= CALL_ANNUAL_SAVINGS_EUR)
    );
  };
  const handleStartRecovery = () => {
    if (isHighValue()) setCallOpen(true);
    else setCollectiveOpen(true);
  };

  // Action Center — "in collective" is inferred from an active recovery deal
  // (honest: we don't read the admin-only CollectiveMember table, so we only
  // claim membership when a live deal proves it). Handlers route to the SAME
  // existing flows the report uses — nothing new is opened here.
  const inCollective = hasLiveDeal;

  return (
    <div className="space-y-6 pb-10">
      <MerchantInformationTasks lang={lang} />
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
              {heroBadge.label}
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
        <Link to="/Analyzer">
          <Button
            size="sm"
            className="h-10 rounded-full px-5 text-sm font-bold gap-1.5 bg-white text-black hover:bg-white/90"
            style={{
              boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 8px 24px -10px rgba(59,130,246,0.55), 0 0 20px rgba(59,130,246,0.2)",
            }}
          >
            {t("nav_analyzer")} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* ── ACTION CENTER — your next best step (one primary action, same
          aggregated state as the Hero; routes to existing flows) ── */}
      <ActionCenter
        rows={allResults}
        latest={latest}
        inCollective={inCollective}
        onVerify={() => navigate("/ConnectTools")}
        onCall={() => setCallOpen(true)}
        onCollective={() => setCollectiveOpen(true)}
        onAddChannel={() => navigate("/Analyzer")}
      />

      {/* ── SAVINGS HERO v2 — single source of truth (engine_result), gauge, CTAs ── */}
      <DashboardHeroV2
        latest={latest}
        stripeConnected={stripeConnected}
        onStartRecovery={handleStartRecovery}
      />

      {/* ── PHASE 2 — account aggregate (self-hides with <2 coherent analyses) ── */}
      <AccountSummaryPanel rows={allResults} />

      {/* ── PHASE 2 — analysis evolution (self-hides with <2 coherent analyses).
          Re-runs ARE the point here — the series shows how rate/savings moved. ── */}
      <AnalysisTrendPanel rows={allResults} />

      {/* Quick stats — payments only (FASE 1.1) */}
      <div className="grid grid-cols-1 gap-3">
        {[
          { label: t("payments_title"), value: latest.payment_savings, icon: CreditCard },
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

      {/* ── PHASE 1 — data insights (single source of truth: engine_result) ── */}
      {engineResult && (
        <PaymentsDataInsights engineResult={engineResult} inputSnapshot={inputSnapshot} />
      )}

      {/* ── PHASE 3 — in-store (TPE) tiles. Self-hides for online analyses. ── */}
      {engineResult && (
        <PaymentsInStoreInsights engineResult={engineResult} inputSnapshot={inputSnapshot} />
      )}

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

      {/* M6 — InfrastructureStatus removed (2026-07-12).
          Post-payments-only pivot the component collapsed to 2 rows
          (Payments Online + In-store TPV), duplicating information already
          surfaced by the KPI card above (payments_title) and the "Your
          infrastructure" node list below. Kept the KPI + node list which
          together carry the same signal with less redundancy. */}

      {/* ── M7 — Last scan + re-scan (unchanged) ── */}
      <LastScanBar />

      {/* ── M8 — AI Insights (unchanged) ── */}
      <AIInsightsPanel />

      {/* REFERRAL-1 T4 — discreet entry point to the referral program */}
      <ReferralTeaser />

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link to="/Analyzer">
          <div
            className="p-5 rounded-2xl transition-all min-h-[44px] hover:border-white/20"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <p className="text-sm font-bold mb-0.5 text-white">{t("nav_analyzer")}</p>
          </div>
        </Link>
        <Link to="/ConnectTools">
          <div
            className="p-5 rounded-2xl transition-all min-h-[44px] hover:border-white/20"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <p className="text-sm font-bold mb-0.5 text-white">{t("nav_connect")}</p>
            <p className="text-xs text-white/55">{t("ct_page_sub")}</p>
          </div>
        </Link>
      </div>

      {/* Recovery destinations — collective (primary) / call (high value). */}
      <CollectiveModal
        open={collectiveOpen}
        onClose={() => setCollectiveOpen(false)}
        context={buildCtaContext()}
        onSwitch={() => { setCollectiveOpen(false); setCallOpen(true); }}
      />
      <BookCallModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        context={buildCtaContext()}
        onSwitch={() => { setCallOpen(false); setCollectiveOpen(true); }}
      />
    </div>
  );
}