import { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, Activity, AlertCircle, ArrowRight, Minus } from "lucide-react";

/**
 * DriftMonitor — Compares the latest AnalyzerResult against the previous one
 * to surface infrastructure drift across the 3 pillars (Payments, Logistics, Commerce SaaS).
 *
 * Pure display: receives results array, computes deltas, renders alerts.
 */

const PILLARS = [
  { key: "payment_savings", label: "Payments", inverseGood: true },
  { key: "shipping_savings", label: "Logistics", inverseGood: true },
  { key: "saas_savings", label: "Commerce SaaS", inverseGood: true },
];

function StatusIcon({ trend }) {
  if (trend === "up") return <TrendingDown className="h-3 w-3" />;     // up in savings gap = WORSE
  if (trend === "down") return <TrendingUp className="h-3 w-3" />;     // down in savings gap = BETTER
  return <Minus className="h-3 w-3" />;
}

export default function DriftMonitor({ results = [] }) {
  const { current, previous, scoreDelta, pillarDeltas, hasDrift, daysSince } = useMemo(() => {
    if (results.length < 2) {
      return { current: results[0] || null, previous: null, scoreDelta: 0, pillarDeltas: [], hasDrift: false, daysSince: 0 };
    }
    const [cur, prev] = results;
    const scoreD = (cur.infra_score || 0) - (prev.infra_score || 0);

    const deltas = PILLARS.map((p) => {
      const curV = cur[p.key] || 0;
      const prevV = prev[p.key] || 0;
      const diff = curV - prevV;
      // For savings_gap: increase = MORE waste (worse). Decrease = LESS waste (better).
      const trend = Math.abs(diff) < 1 ? "flat" : diff > 0 ? "up" : "down";
      const pctChange = prevV > 0 ? Math.round((diff / prevV) * 100) : 0;
      return { ...p, current: curV, previous: prevV, diff, trend, pctChange };
    });

    const drift = scoreD < -2 || deltas.some((d) => d.trend === "up" && Math.abs(d.pctChange) >= 10);

    let days = 0;
    if (cur.created_date && prev.created_date) {
      days = Math.round((new Date(cur.created_date) - new Date(prev.created_date)) / (1000 * 60 * 60 * 24));
    }

    return { current: cur, previous: prev, scoreDelta: scoreD, pillarDeltas: deltas, hasDrift: drift, daysSince: days };
  }, [results]);

  // No second analysis yet — friendly empty state
  if (!previous) {
    return (
      <div className="cambra-card cambra-card--soft p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-7 w-7 rounded-lg flex items-center justify-center bg-white/[0.06] border border-white/12">
            <Activity className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={2} />
          </div>
          <div>
            <p className="cc-eyebrow">Drift monitor</p>
            <p className="text-sm font-semibold text-white">Tracking starts on your 2nd audit</p>
          </div>
        </div>
        <p className="text-[12px] cc-muted leading-relaxed mb-4">
          Once you run a second analysis, we'll automatically compare scores and alert you if any pillar degrades.
        </p>
        <Link to="/Analyzer">
          <button className="h-8 px-4 rounded-full bg-white text-[#06080F] text-[11px] font-bold inline-flex items-center gap-1.5 hover:bg-white/90 transition">
            Schedule re-analysis <ArrowRight className="h-3 w-3" />
          </button>
        </Link>
      </div>
    );
  }

  const scoreColor = scoreDelta < -2 ? "text-cambra-plum" : scoreDelta > 2 ? "text-cambra-mint" : "text-white/70";
  const scoreBg = scoreDelta < -2 ? "bg-cambra-plum/15 border-cambra-plum/30" : scoreDelta > 2 ? "bg-cambra-mint/15 border-cambra-mint/30" : "bg-white/[0.04] border-white/10";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="cambra-card p-5 sm:p-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="relative h-8 w-8 rounded-lg flex items-center justify-center bg-white/[0.06] border border-white/12">
            <Activity className="h-4 w-4 text-cambra-cyan" strokeWidth={2} />
            {hasDrift && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-cambra-plum animate-pulse" />
            )}
          </div>
          <div>
            <p className="cc-eyebrow">Drift monitor</p>
            <p className="text-sm font-semibold text-white">
              {hasDrift ? "Infrastructure degradation detected" : "Stack performing on baseline"}
            </p>
          </div>
        </div>
        <span className="cc-pill">vs {daysSince > 0 ? `${daysSince}d ago` : "previous"}</span>
      </div>

      {/* Score delta hero */}
      <div className={`flex items-center justify-between p-4 rounded-xl border mb-4 ${scoreBg}`}>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/55 mb-1">Infrastructure score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tabular-nums text-white">{current.infra_score || 0}</span>
            <span className="text-xs text-white/40">/100</span>
            <span className={`text-xs font-bold tabular-nums ${scoreColor} ml-1`}>
              {scoreDelta > 0 ? "+" : ""}{scoreDelta} pts
            </span>
          </div>
        </div>
        {hasDrift ? (
          <AlertCircle className="h-5 w-5 text-cambra-plum" />
        ) : (
          <TrendingUp className="h-5 w-5 text-cambra-mint" />
        )}
      </div>

      {/* Per-pillar deltas */}
      <div className="space-y-2 mb-4">
        {pillarDeltas.map((p) => {
          const isWorse = p.trend === "up" && Math.abs(p.pctChange) >= 5;
          const isBetter = p.trend === "down" && Math.abs(p.pctChange) >= 5;
          const color = isWorse ? "text-cambra-plum" : isBetter ? "text-cambra-mint" : "text-white/55";
          const bg = isWorse ? "bg-cambra-plum/8 border-cambra-plum/20" : isBetter ? "bg-cambra-mint/8 border-cambra-mint/20" : "bg-white/[0.03] border-white/8";

          return (
            <div key={p.key} className={`flex items-center justify-between p-3 rounded-lg border ${bg}`}>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center justify-center h-5 w-5 rounded-md ${isWorse ? "bg-cambra-plum/20" : isBetter ? "bg-cambra-mint/20" : "bg-white/[0.06]"}`}>
                  <StatusIcon trend={p.trend} />
                </span>
                <span className="text-xs font-semibold text-white">{p.label}</span>
              </div>
              <div className="text-right">
                <p className={`text-xs font-bold tabular-nums ${color}`}>
                  {p.trend === "flat" ? "stable" : `${p.diff > 0 ? "+" : ""}€${Math.round(p.diff).toLocaleString()}/yr`}
                </p>
                {p.trend !== "flat" && (
                  <p className="text-[10px] text-white/40 tabular-nums">
                    {p.pctChange > 0 ? "+" : ""}{p.pctChange}% vs prev
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CTA — FASE 1.2 — /Network deprecated, both branches route to Reports. */}
      <Link to="/Reports">
        <button className="w-full h-9 rounded-full border border-white/15 bg-white/[0.04] text-white text-[11px] font-bold inline-flex items-center justify-center gap-1.5 hover:bg-white/[0.08] transition">
          {hasDrift ? "Review drift" : "View full drift history"} <ArrowRight className="h-3 w-3" />
        </button>
      </Link>
    </motion.div>
  );
}