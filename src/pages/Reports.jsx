// Reports — Checkpoint H (2026-08-06).
//
// LANGUAGE FIX. This page was English-only for every merchant, and two of its
// defects would have survived a naive t() sweep:
//   • The verification pill printed the RAW stored enum via
//     `verification_status.replaceAll("_"," ")`, so a French merchant read
//     "evidence submitted".
//   • Every date went through date-fns `format()` with no locale argument, which
//     silently defaults to English ("August 6, 2026"). Dates now use Intl with
//     the active language — see components/reports/reportsLabels.js.
//
// UNCHANGED ON PURPOSE: the tenant filter, the getMyBillingRecords call, the
// chart series and all the TPV arithmetic. This is a presentation fix.
//
// The verification checklist, the in-store block and the audit timeline moved
// into components/reports/ — they were inline IIFEs in this file.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ArrowRight, TrendingUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHero from "@/components/shared/PageHero";
import ReportsKPIStrip from "@/components/reports/ReportsKPIStrip";
import EffectiveFeePanel from "@/components/reports/EffectiveFeePanel";
import RecoverMandatePanel from "@/components/recover/RecoverMandatePanel";
import VerificationChecklist from "@/components/reports/VerificationChecklist";
import InStoreBenchmarkPanel from "@/components/reports/InStoreBenchmarkPanel";
import AuditHistoryList from "@/components/reports/AuditHistoryList";
import { formatShortDate } from "@/components/reports/reportsLabels";
import { useTranslation } from "@/lib/i18n.jsx";

export default function Reports() {
  const { t, lang } = useTranslation();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState(null);
  const [lastReport, setLastReport] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [vLoading, setVLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { setResults([]); setLoading(false); return; }
      // Tenant filter — without it an admin viewing /Reports would see
      // AnalyzerResults belonging to other users.
      const r = await base44.entities.AnalyzerResult
        .filter({ created_by: me.email }, "-created_date", 20)
        .catch(() => []);
      setResults(r);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me().catch(() => null);
        if (!me) { setVLoading(false); return; }
        // v61 Checkpoint D — brand, latest monthly report and current baseline
        // all come from getMyBillingRecords: the tenant scope is resolved from
        // the session server-side (these entities' RLS is inert for app users,
        // so a client-side brand_id filter was both broken and unsafe).
        const resp = await base44.functions.invoke('getMyBillingRecords', {}).catch(() => null);
        const d = resp?.data || {};
        setBrand(d.brand || null);
        setLastReport(d.reports?.[0] || null);
        setBaseline(d.baseline || null);
      } finally {
        setVLoading(false);
      }
    })();
  }, []);

  // R2 (2026-07-12) — payments-only chart. The Logistics / Commerce SaaS series
  // were removed: those fields still exist on AnalyzerResult for legacy rows but
  // are always 0 in the payments-only product, and rendering them advertised a
  // multi-vertical offering that no longer exists.
  const chartData = results.slice().reverse().map(r => ({
    date: formatShortDate(r.created_date, lang),
    payments: r.payment_savings || 0,
  }));

  return (
    <div>
      <PageHero
        eyebrow={t("rpt_eyebrow")}
        title={t("rpt_title")}
        subtitle={t("rpt_subtitle")}
        icon={TrendingUp}
        actions={
          <Link to="/Analyzer">
            <Button size="sm" className="h-10 rounded-full px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> {t("rpt_new_scan")} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-40">
          <span
            style={{
              display: "inline-block",
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.12)",
              borderTopColor: "#39C6F0",
              animation: "cambra-spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes cambra-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : results.length === 0 ? (
        <div
          className="relative rounded-2xl border border-white/[0.08] overflow-hidden p-12 sm:p-16 text-center"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.18) 0%, transparent 55%), linear-gradient(180deg, hsl(222 60% 7%) 0%, hsl(222 65% 4%) 100%)",
          }}
        >
          <div className="absolute inset-0 dot-grid opacity-[0.08] pointer-events-none" />
          <div className="relative">
            <div className="h-14 w-14 rounded-2xl border border-white/[0.10] bg-white/[0.04] flex items-center justify-center mx-auto mb-5">
              <TrendingUp className="h-6 w-6 text-cambra-cyan" strokeWidth={1.6} />
            </div>
            <h3 className="text-xl font-black text-white tracking-tight mb-2">{t("rpt_empty_title")}</h3>
            <p className="text-sm text-white/55 mb-6 max-w-sm mx-auto">{t("rpt_empty_sub")}</p>
            <Link to="/Analyzer">
              <Button className="rounded-full px-7 h-11 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2">
                <Sparkles className="h-3.5 w-3.5" /> {t("rpt_empty_cta")} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          <ReportsKPIStrip results={results} />

          {/* REFERRAL-2 T3 — the merchant's REAL fee and what they keep after it. */}
          {!vLoading && <EffectiveFeePanel report={lastReport} />}

          {/* RECOVER-1 — acceptance entry point. Renders nothing unless the
              merchant actually has an activation to authorize. */}
          <RecoverMandatePanel />

          {chartData.length > 0 && (
            <div className="cambra-card p-7 mb-6">
              <div className="relative">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="cc-eyebrow mb-1.5">{t("rpt_chart_eyebrow")}</p>
                    <p className="text-base font-black text-white tracking-tight">{t("rpt_chart_title")}</p>
                    <p className="text-[11px] text-white/45 font-mono mt-0.5">{t("rpt_chart_note")}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.10] bg-white/[0.04]">
                    <span className="h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
                    <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-white/65">{t("rpt_live")}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}K`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", fontSize: 11, background: "#0B1023", color: "#fff" }}
                      formatter={v => [`€${v?.toLocaleString()}${t("rpt_per_year")}`, t("rpt_chart_series")]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16, color: "rgba(255,255,255,0.7)" }} />
                    {/* dataKey stays the stored field; `name` is what the legend
                        and tooltip display, so the series label localizes. */}
                    <Bar dataKey="payments" name={t("rpt_chart_series")} fill="var(--voltio-2)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {!vLoading && (
            <VerificationChecklist report={lastReport} baseline={baseline} hasBrand={!!brand} />
          )}

          {lastReport && <InStoreBenchmarkPanel result={results[0]} brand={brand} />}

          <AuditHistoryList results={results} />
        </>
      )}
    </div>
  );
}