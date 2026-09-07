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
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import ReportsKPIStrip from "@/components/reports/ReportsKPIStrip";
import EffectiveFeePanel from "@/components/reports/EffectiveFeePanel";
import RecoverMandatePanel from "@/components/recover/RecoverMandatePanel";
import PaymentsMigrationCard from "@/components/recover/PaymentsMigrationCard";
import VerificationChecklist from "@/components/reports/VerificationChecklist";
import InStoreBenchmarkPanel from "@/components/reports/InStoreBenchmarkPanel";
import ResultsHistory from "@/components/paymentsResults/ResultsHistory";
import { formatShortDate } from "@/components/reports/reportsLabels";
import { useTranslation } from "@/lib/i18n.jsx";

export default function Reports() {
  const { t, lang, locale, formatCurrency } = useTranslation();
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

  // FX-2 Fase C (2026-08-16) — the chart's currency is the currency of the
  // NEWEST AnalyzerResult (results[0]); legacy rows without the field are EUR
  // by construction (the engine was EUR-only when they were written). The
  // axis/tooltip previously hardcoded `€${...}` with en-US grouping — wrong
  // symbol for any future non-EUR result AND wrong separators for most
  // merchants ("€2,500" shown to a German instead of "2.500 €").
  const chartCurrency = results[0]?.currency || "EUR";
  const compactAxisFormat = (v) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: chartCurrency, notation: "compact", maximumFractionDigits: 0 }).format(v);
    } catch {
      return formatCurrency(v, chartCurrency);
    }
  };

  return (
    <div className="workspace-light-page pb-12">
      <ResultsHistory />

      {loading ? (
        <div className="mt-8 flex items-center justify-center py-16">
          <span
            style={{
              display: "inline-block",
              width: 32, height: 32, borderRadius: "50%",
              border: "2px solid rgba(91,76,245,0.14)",
              borderTopColor: "#5B4CF5",
              animation: "cambra-spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes cambra-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : results.length === 0 ? (
        null
      ) : (
        <>
          <section className="mt-12 border-t border-[#E1E4EC] pt-9">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#5B4CF5]">{t("rpt_chart_eyebrow")}</p>
            <h2 className="mt-2 text-[24px] font-bold tracking-[-.035em] text-[#11182D]">{t("rpt_chart_title")}</h2>
          </section>

          <div className="mt-6"><ReportsKPIStrip results={results} /></div>

          {/* REFERRAL-2 T3 — the merchant's REAL fee and what they keep after it. */}
          {!vLoading && <EffectiveFeePanel report={lastReport} />}

          {/* RECOVER-1 — acceptance entry point. Renders nothing unless the
              merchant actually has an activation to authorize. */}
          <RecoverMandatePanel />

          {/* P9 — once Recover is accepted, the recommendation disappears into
              execution: CAMBRA owns the migration and the merchant sees only the
              simple operational journey plus true merchant-required blockers. */}
          <PaymentsMigrationCard />

          {chartData.length > 0 && (
            <div className="cambra-paper-card mb-6 p-7">
              <div className="relative">
                <div className="mb-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="cc-eyebrow mb-1.5">{t("rpt_chart_eyebrow")}</p>
                    <p className="text-base font-black text-[#11182D] tracking-tight">{t("rpt_chart_title")}</p>
                    <p className="text-[11px] text-[#737B90] font-mono mt-0.5">{t("rpt_chart_note")}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-[#DADDE7] bg-[#F8F8FC] px-2.5 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#39C6F0]" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#646D83]">{t("rpt_live")}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="2 4" stroke="rgba(17,24,45,0.08)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#747D91" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#747D91" }} axisLine={false} tickLine={false} tickFormatter={compactAxisFormat} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #E0E3EC", fontSize: 11, background: "#fff", color: "#11182D" }}
                      formatter={v => [`${formatCurrency(Number(v) || 0, chartCurrency)}${t("rpt_per_year")}`, t("rpt_chart_series")]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16, color: "#5F687E" }} />
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

          {/* ResultsHistory above is the canonical report library. */}
        </>
      )}
    </div>
  );
}
