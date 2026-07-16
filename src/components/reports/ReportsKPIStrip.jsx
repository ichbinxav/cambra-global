import { motion } from "framer-motion";
import { TrendingUp, Gauge, Layers, Sparkles } from "lucide-react";

/**
 * KPI strip for Reports — 4 dense premium cells.
 * Aggregates totals from the analyzer results list.
 */
export default function ReportsKPIStrip({ results }) {
  const latest = results[0];
  const totalSavings = results.reduce((acc, r) => acc + (r.total_savings || 0), 0);
  const avgScore = results.length
    ? Math.round(results.reduce((acc, r) => acc + (r.infra_score || 0), 0) / results.length)
    : 0;
  const layers = latest
    ? [latest.payment_savings, latest.shipping_savings, latest.saas_savings].filter((v) => v > 0).length
    : 0;

  const items = [
    {
      label: "Latest opportunity",
      value: latest ? `€${Math.round((latest.total_savings || 0) / 1000)}K` : "—",
      hint: latest ? "Annualized recovery" : "Run a scan",
      Icon: Sparkles,
      accent: "from-[#5B4CF5] to-[#39C6F0]",
    },
    {
      label: "Cumulative identified",
      value: `€${(totalSavings / 1000).toFixed(totalSavings < 10000 ? 1 : 0)}K`,
      hint: `${results.length} scan${results.length === 1 ? "" : "s"}`,
      Icon: TrendingUp,
      accent: "from-[#39C6F0] to-[#2FE0A8]",
    },
    {
      label: "Infrastructure score",
      value: `${avgScore}`,
      hint: "Avg · all reports",
      Icon: Gauge,
      accent: "from-[#8B7BFF] to-[#5B4CF5]",
    },
    {
      label: "Pillars benchmarked",
      value: latest ? `${layers}/3` : "—",
      hint: "Payments · Logistics · SaaS",
      Icon: Layers,
      accent: "from-[#FFB05A] to-[#FF7A45]",
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