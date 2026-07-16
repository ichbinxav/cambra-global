// AnalysisTrendPanel — Phase 2 · evolution of the brand's payments analyses.
//
// Shows how the EFFECTIVE RATE and IDENTIFIED SAVINGS moved across every
// re-run over time. Re-runs are the whole point here (unlike the account
// aggregate, which dedupes them) — each one is a point on the timeline.
//
// SINGLE SOURCE OF TRUTH: derivePaymentsTrend() over the persisted
// AnalyzerResult rows. Every point satisfies fees === gmv × bps before render;
// the panel self-hides with <2 analyses or an incoherent series (honest over
// pretty).

import { useMemo } from "react";
import { useTranslation, formatCurrency } from "@/lib/i18n.jsx";
import { derivePaymentsTrend } from "@/lib/paymentsTrend.js";
import { INSIGHT_MONO as MONO } from "@/components/paymentsResults/InsightCard";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Dot } from "recharts";
import { TrendingDown, TrendingUp, LineChart as LineChartIcon } from "lucide-react";

const DATE_LOCALES = { en: "en-GB", fr: "fr-FR", es: "es-ES" };
const RATE_COLOR = "#7BD9F0";    // cyan — effective rate
const SAVINGS_COLOR = "#2FE0A8"; // emerald — identified savings
const VERIFIED_RING = "#2FE0A8";

function dayLabel(ts, lang) {
  try {
    return new Date(ts).toLocaleDateString(DATE_LOCALES[lang] || "en-GB", { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

// Dot renderer — a slightly bigger emerald-ringed dot marks verified points.
function TrendDot({ cx, cy, payload, color }) {
  if (cx == null || cy == null) return null;
  if (payload?.verified) {
    return <Dot cx={cx} cy={cy} r={5} fill={color} stroke={VERIFIED_RING} strokeWidth={2} />;
  }
  return <Dot cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
}

export default function AnalysisTrendPanel({ rows }) {
  const { t, lang } = useTranslation();
  const trend = useMemo(() => derivePaymentsTrend(rows), [rows]);

  // Guard: need ≥2 coherent analyses (else there's no evolution to show).
  if (!trend.available || !trend._coherent) return null;

  const chartData = trend.points.map((p) => ({
    label: dayLabel(p.ts, lang),
    rate: Number(p.effective_pct.toFixed(3)),
    savings: Math.round(p.annual_savings),
    verified: p.verified,
  }));

  const rateImproved = trend.rate_delta_pct <= 0; // lower rate = better
  const DeltaIcon = rateImproved ? TrendingDown : TrendingUp;
  const deltaColor = rateImproved ? "#2FE0A8" : "#F45B69";
  const deltaAbs = Math.abs(trend.rate_delta_pct).toFixed(2);

  return (
    <div
      className="relative rounded-3xl p-6 overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.14) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.10) 0%, transparent 60%), linear-gradient(180deg, #0b1020 0%, #070c16 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px -28px rgba(0,0,0,0.55)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          opacity: 0.5,
          maskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <LineChartIcon size={13} className="text-cyan-300" />
              <span className="uppercase font-bold" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.2em", color: "#585868" }}>
                {t("trend_eyebrow")}
              </span>
            </div>
            <h3 className="text-white font-black" style={{ fontFamily: "'Space Grotesk','Inter',sans-serif", fontSize: 22, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              {t("trend_title")}
            </h3>
            <p className="text-[12px] text-white/45 mt-1">{t("trend_sub", { n: trend.count })}</p>
          </div>
          {/* Rate delta pill */}
          <div
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${deltaColor}40` }}
          >
            <DeltaIcon size={13} style={{ color: deltaColor }} />
            <span className="tabular-nums font-bold" style={{ fontFamily: MONO, fontSize: 13, color: deltaColor }}>
              {rateImproved ? "−" : "+"}{deltaAbs} pp
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-white/55 font-semibold">
            <span className="w-3 h-[2px] rounded-full" style={{ background: RATE_COLOR }} /> {t("trend_legend_rate")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-white/55 font-semibold">
            <span className="w-3 h-[2px] rounded-full" style={{ background: SAVINGS_COLOR }} /> {t("trend_legend_savings")}
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-white/40 font-semibold ml-auto">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: RATE_COLOR, border: `2px solid ${VERIFIED_RING}` }} /> {t("verified_label")}
          </span>
        </div>

        {/* Dual-axis line chart */}
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[320px]">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: -8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="rate"
                  tick={{ fontSize: 10, fill: RATE_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={42}
                />
                <YAxis
                  yAxisId="savings"
                  orientation="right"
                  tick={{ fontSize: 10, fill: SAVINGS_COLOR }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `€${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                  width={44}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 10, fontSize: 11, background: "#070c16", border: "1px solid rgba(255,255,255,0.14)", padding: "8px 12px" }}
                  labelStyle={{ fontWeight: 700, color: "#fff", marginBottom: 4 }}
                  itemStyle={{ padding: 0 }}
                  formatter={(v, name) =>
                    name === "rate"
                      ? [`${v}%`, t("trend_legend_rate")]
                      : [formatCurrency(v, lang), t("trend_legend_savings")]
                  }
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="rate"
                  stroke={RATE_COLOR}
                  strokeWidth={2}
                  dot={(props) => <TrendDot {...props} color={RATE_COLOR} />}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="savings"
                  type="monotone"
                  dataKey="savings"
                  stroke={SAVINGS_COLOR}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={(props) => <TrendDot {...props} color={SAVINGS_COLOR} />}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Caption */}
        <p className="text-[11px] text-white/45 mt-4 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {t("trend_caption")}
        </p>
      </div>
    </div>
  );
}