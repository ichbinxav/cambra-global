import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, Gauge, Sparkles } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * KPI strip for Reports — 4 dense premium cells.
 * Aggregates totals from the analyzer results list.
 */
export default function ReportsKPIStrip({ results }) {
  const { locale, formatCurrency } = useTranslation();
  const latest = results[0];
  const totalSavings = results.reduce((acc, r) => acc + (r.total_savings || 0), 0);
  // FX-2 Fase C — compact currency in the currency of the newest result
  // (legacy rows without the field are EUR by construction). Was a hardcoded
  // `€${...}K` — wrong symbol for non-EUR results, wrong grouping for most
  // locales.
  const kpiCurrency = latest?.currency || "EUR";
  const compact = (n) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency: kpiCurrency, notation: "compact", maximumFractionDigits: 1 }).format(n);
    } catch {
      return formatCurrency(Math.round(n), kpiCurrency);
    }
  };
  // P0.2 — payments-only KPIs. Removed the multi-vertical composite score
  // and the cross-vertical pillars count. Replaced with payment-specific
  // metrics: data quality and recovery status.
  const dataQualityLabel = !latest
    ? "—"
    : latest.verification_status === "verified"
      ? "Verified"
      : latest.verification_status === "pending_verification"
        ? "Provisional"
        : "Modelled";

  const recoveryLabel = !latest
    ? "—"
    : latest.verification_status === "verified"
      ? "Eligible"
      : "Not started";

  const items = [
    {
      label: "Latest opportunity",
      value: latest ? compact(latest.total_savings || 0) : "—",
      hint: latest ? "Annualized payment savings" : "Run a scan",
      Icon: Sparkles,
      accent: "from-[#5B4CF5] to-[#39C6F0]",
    },
    {
      label: "Cumulative identified",
      value: compact(totalSavings),
      hint: `${results.length} scan${results.length === 1 ? "" : "s"}`,
      Icon: TrendingUp,
      accent: "from-[#39C6F0] to-[#2FE0A8]",
    },
    {
      label: "Data quality",
      value: dataQualityLabel,
      hint: latest ? "Latest analysis" : "Run a scan",
      Icon: Gauge,
      accent: "from-[#8B7BFF] to-[#5B4CF5]",
    },
    {
      label: "Recovery",
      value: recoveryLabel,
      hint: latest?.verification_status === "verified" ? "Verified savings" : "Verify to activate",
      Icon: Sparkles,
      accent: "from-[#2FE0A8] to-[#39C6F0]",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {items.map((item, i) => (
        <motion.div
          key={item.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 + i * 0.06 }}
          className="relative rounded-2xl border border-white/[0.08] overflow-hidden p-5"
          style={{
            background:
              "linear-gradient(180deg, hsl(222 55% 9%) 0%, hsl(222 60% 6%) 100%)",
            boxShadow: "0 1px 0 hsl(0 0% 100% / 0.05) inset, 0 16px 40px -20px rgba(0,0,0,0.45)",
          }}
        >
          {/* Top gradient accent line */}
          <div
            aria-hidden
            className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${item.accent} opacity-70`}
          />
          {/* Floating glow */}
          <div
            aria-hidden
            className="absolute -top-12 -right-8 w-32 h-32 rounded-full blur-2xl opacity-50"
            style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.3), transparent)" }}
          />

          <div className="relative flex items-start justify-between mb-3">
            <span className="text-[9px] font-bold tracking-[0.22em] uppercase text-white/45">
              {item.label}
            </span>
            <div className="h-7 w-7 rounded-lg border border-white/[0.10] bg-white/[0.04] flex items-center justify-center">
              <item.Icon className="h-3.5 w-3.5 text-cambra-cyan" strokeWidth={1.8} />
            </div>
          </div>

          <div className="relative">
            <div
              className="text-3xl font-black tabular-nums tracking-[-0.03em] leading-none"
              style={{
                background: "linear-gradient(135deg, #ffffff 0%, #B8D8E0 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {item.value}
            </div>
            <p className="mt-2 text-[11px] text-white/45 font-mono">{item.hint}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}