import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, Sparkles,
  CreditCard, Plug, Store, Layers,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getMyActiveBrand } from "@/lib/getMyActiveBrand";
import { formatEur as formatEurLocal } from "@/lib/currencyFormats";

import LastScanBar from "@/components/dashboard/LastScanBar";
import AIInsightsPanel from "@/components/dashboard/AIInsightsPanel";
import DashboardSkeleton from "@/components/dashboard/DashboardSkeleton";
import SavingsTrendPanel from "@/components/dashboard/SavingsTrendPanel";
import DashboardHeroV2 from "@/components/dashboard/DashboardHeroV2";
import DashboardWelcome from "@/components/dashboard/DashboardWelcome";
import AccountSummaryPanel from "@/components/dashboard/AccountSummaryPanel";
import ActionCenter from "@/components/dashboard/ActionCenter";
import ReferralTeaser from "@/components/dashboard/ReferralTeaser";
import AnalysisTrendPanel from "@/components/dashboard/AnalysisTrendPanel";
import MerchantInformationTasks from "@/components/dashboard/MerchantInformationTasks";
import PaymentsDataInsights from "@/components/paymentsResults/PaymentsDataInsights";
import PaymentsInStoreInsights from "@/components/paymentsResults/PaymentsInStoreInsights";
import CollectiveModal from "@/components/paymentsResults/CollectiveModal";
import BookCallModal from "@/components/paymentsResults/BookCallModal";
import RecoverMandatePanel from "@/components/recover/RecoverMandatePanel";
import PaymentsMigrationCard from "@/components/recover/PaymentsMigrationCard";
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
        <DashboardWelcome
          firstName={firstName}
          hasAnalysis={false}
          statusLabel={t("state_b_badge")}
        />
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,.92fr)]">
          <div
            className="relative overflow-hidden rounded-[28px] p-6 sm:p-8 lg:p-10"
            style={{
              background: "rgba(255,255,255,.92)",
              border: "1px solid rgba(20,18,50,.09)",
              boxShadow: "0 24px 70px -52px rgba(20,18,50,.5)",
            }}
          >
            <div
              className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                background: "linear-gradient(135deg,#EEEBFF,#E5F8FD)",
                border: "1px solid rgba(91,76,245,.14)",
              }}
            >
              <Sparkles size={19} style={{ color: "#5B4CF5" }} />
            </div>
            <h1
              className="mb-3 max-w-xl"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(26px, 4vw, 38px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
                color: "#0C0C16",
              }}
            >
              {t("state_a_title")}
            </h1>
            <p className="mb-7 max-w-xl text-sm leading-relaxed" style={{ color: "#666478" }}>
              {t("state_a_sub")}
            </p>
            <Link to="/Analyzer">
              <span
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg,#5B4CF5,#318FE8)",
                  boxShadow: "0 16px 34px -18px rgba(55,62,216,.72)",
                }}
              >
                {t("state_a_cta")} <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
          <div
            className="relative overflow-hidden rounded-[28px] p-6 sm:p-8"
            style={{
              background: "radial-gradient(90% 120% at 100% 0%,rgba(91,76,245,.27),transparent 58%),linear-gradient(145deg,#13112C,#071426)",
              border: "1px solid rgba(255,255,255,.10)",
              boxShadow: "0 28px 72px -46px rgba(8,9,30,.9)",
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#8B7BFF]">{t("dash_journey_title")}</p>
            <div className="mt-5 space-y-3">
              {[t("auto_detection"), t("bench_comparison"), t("savings_calc")].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[.08] text-[11px] font-black text-[#7BD9F0]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-semibold text-white/85">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
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
      <DashboardWelcome
        firstName={firstName}
        hasAnalysis
        verificationStatus={verificationStatus}
        hasLiveDeal={hasLiveDeal}
        statusLabel={heroBadge.label}
        onStartRecovery={handleStartRecovery}
      />

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

      {/* Recover is a first-class merchant journey: authorize once, then see
          exactly what CAMBRA is handling and whether anything needs attention. */}
      <RecoverMandatePanel />
      <PaymentsMigrationCard />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <LastScanBar />
        <AIInsightsPanel />
      </div>

      {/* ── PHASE 2 — account aggregate (self-hides with <2 coherent analyses) ── */}
      <AccountSummaryPanel rows={allResults} />

      {/* ── PHASE 2 — analysis evolution (self-hides with <2 coherent analyses).
          Re-runs ARE the point here — the series shows how rate/savings moved. ── */}
      <AnalysisTrendPanel rows={allResults} />

      {engineResult && (
        <section
          className="space-y-7 overflow-hidden rounded-[28px] p-5 sm:p-7"
          style={{
            background: "radial-gradient(100% 100% at 100% 0%,rgba(91,76,245,.18),transparent 54%),linear-gradient(145deg,#111126,#071322)",
            border: "1px solid rgba(255,255,255,.09)",
            boxShadow: "0 28px 76px -52px rgba(7,9,27,.9)",
          }}
        >
          <PaymentsDataInsights engineResult={engineResult} inputSnapshot={inputSnapshot} />
          <PaymentsInStoreInsights engineResult={engineResult} inputSnapshot={inputSnapshot} />
        </section>
      )}

      {/* ── INFRASTRUCTURE NODES — grouped ── */}
      {graphNodes.length > 0 && (
        <section
          className="space-y-4 overflow-hidden rounded-[28px] p-5 sm:p-7"
          style={{
            background: "radial-gradient(90% 110% at 100% 0%,rgba(57,198,240,.13),transparent 55%),linear-gradient(145deg,#111126,#071322)",
            border: "1px solid rgba(255,255,255,.09)",
            boxShadow: "0 28px 76px -52px rgba(7,9,27,.9)",
          }}
        >
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
        </section>
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

      {/* REFERRAL-1 T4 — discreet entry point to the referral program */}
      <ReferralTeaser />

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
