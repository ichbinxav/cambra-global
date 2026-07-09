import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, AlertTriangle, Shield } from "lucide-react";
import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

const STATUS_CONFIG = {
  overpaying: { label: "Overpaying", color: "text-red-600", bg: "bg-red-500/[0.06] border-red-500/20", dot: "bg-red-500", icon: AlertTriangle },
  average: { label: "Above benchmark", color: "text-orange-500", bg: "bg-orange-500/[0.06] border-orange-500/20", dot: "bg-orange-400", icon: AlertTriangle },
  optimized: { label: "Optimized", color: "text-green-600", bg: "bg-green-500/[0.06] border-green-500/20", dot: "bg-green-500", icon: CheckCircle2 },
};

function ScoreGauge({ score }) {
  const color = score >= 75 ? "#22c55e" : score >= 55 ? "#f97316" : "#ef4444";
  const circ = 2 * Math.PI * 34;
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="34" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
        <motion.circle
          cx="40" cy="40" r="34" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - score / 100) }}
          transition={{ duration: 1.5, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-black"
          style={{ color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >{score}</motion.span>
        <span className="text-[10px] text-muted-foreground/40">/100</span>
      </div>
    </div>
  );
}

export default function StripeResults({ data }) {
  const status = STATUS_CONFIG[data.benchmark_status];
  const StatusIcon = status.icon;

  const feeChartData = data.fee_breakdown.map(f => ({
    name: f.label.replace(" fee", "").replace("Currency ", "FX "),
    pct: f.pct,
    amount: f.amount,
  }));

  return (
    <div className="space-y-8">
      {/* Live badge */}
      <div className="flex items-center justify-between">
        {data?.simulated ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/25 bg-amber-500/[0.06]">
            <motion.div className="w-1.5 h-1.5 rounded-full bg-amber-500" animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 2 }} />
            <span className="text-[10px] font-bold text-amber-600">Simulated · Demo data</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-green-500/25 bg-green-500/[0.05]">
            <motion.div className="w-1.5 h-1.5 rounded-full bg-green-500" animate={{ scale: [1, 1.5, 1] }} transition={{ repeat: Infinity, duration: 2 }} />
            <span className="text-[10px] font-bold text-green-600">Stripe connected · Live data</span>
          </div>
        )}
        <span className="text-[10px] text-muted-foreground/35">Last 30 days</span>
      </div>

      {/* Big savings number */}
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground/60 mb-2">{data?.simulated ? "Based on demo data, you're estimated to be overpaying by" : "You're overpaying by"}</p>
        <div className="text-[clamp(4rem,16vw,8rem)] font-black tracking-[-0.06em] leading-none mb-2 text-red-600">
          <AnimatedCounter value={data.annual_savings_potential} prefix="€" duration={1.8} />
        </div>
        <p className="text-muted-foreground/50 text-sm">per year on payment processing alone</p>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-4 p-5 rounded-2xl border ${status.bg}`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${status.bg}`}>
          <StatusIcon size={15} className={status.color} />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-black ${status.color}`}>{status.label}</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">
            Your effective fee is <strong className="text-foreground">{data.effective_fee_pct}%</strong> vs CAMBRA network benchmark of <strong className="text-foreground">{data.benchmark_fee_pct}%</strong>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-2xl font-black tabular-nums ${status.color}`}>{data.effective_fee_pct}%</p>
          <p className="text-[10px] text-muted-foreground/40">your rate</p>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Monthly volume", value: `€${data.monthly_volume.toLocaleString()}`, sub: "30-day total" },
          { label: "Fees paid", value: `€${data.total_fees_monthly.toLocaleString()}`, sub: "Last 30 days" },
          { label: "Transactions", value: data.total_transactions.toLocaleString(), sub: "Charges" },
          { label: "Avg order", value: `€${data.avg_order_value}`, sub: "Per transaction" },
        ].map((kpi, i) => (
          <div key={i} className="p-4 rounded-xl border border-border/50 bg-card">
            <p className="text-[10px] text-muted-foreground/40 mb-1">{kpi.label}</p>
            <p className="text-lg font-black tabular-nums">{kpi.value}</p>
            <p className="text-[10px] text-muted-foreground/35">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Fee vs benchmark comparison */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 bg-secondary/30">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Fee rate comparison</p>
        </div>
        <div className="p-5 space-y-4">
          {[
            { label: "Your rate", pct: data.effective_fee_pct, max: 4, color: "#ef4444", barW: (data.effective_fee_pct / 4) * 100 },
            { label: "CAMBRA network benchmark", pct: data.benchmark_fee_pct, max: 4, color: "#22c55e", barW: (data.benchmark_fee_pct / 4) * 100 },
          ].map((row, i) => (
            <div key={i}>
              <div className="flex justify-between mb-1.5">
                <span className="text-xs font-medium text-muted-foreground/70">{row.label}</span>
                <span className="text-sm font-black tabular-nums" style={{ color: row.color }}>{row.pct}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-border/30 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: row.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${row.barW}%` }}
                  transition={{ duration: 1, delay: 0.2 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ))}
          <div className="pt-3 border-t border-border/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground/50">Annual fee gap</span>
            <span className="text-lg font-black text-red-600 tabular-nums">
              €{data.annual_savings_potential.toLocaleString()}/yr
            </span>
          </div>
        </div>
      </div>

      {/* Infra score */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 flex items-center gap-6">
        <ScoreGauge score={data.infra_score} />
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">Infrastructure Score</p>
          <p className="text-2xl font-black mb-1">{data.infra_score}/100</p>
          <p className="text-xs text-muted-foreground/55 leading-relaxed">
            {data.infra_score < 55
              ? "Significant optimization potential. Connect Stripe to CAMBRA to verify your network benchmark rate."
              : data.infra_score < 75
              ? "Above average but room for improvement. Connecting more data will refine your benchmark."
              : "Well-optimized. Connect your tools to CAMBRA for maximum accuracy and savings verification."}
          </p>
        </div>
      </div>

      {/* Fee breakdown chart */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/40 bg-secondary/30">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Fee breakdown by type</p>
        </div>
        <div className="p-5">
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={feeChartData} barSize={28}>
              <XAxis dataKey="name" axisLine={false} tickLine={false}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", opacity: 0.5 }} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }}
                formatter={(v, name, props) => [`€${props.payload.amount} (${v}%)`, "Fee"]}
                cursor={{ fill: "hsl(var(--secondary))", radius: 4 }}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]} fill="#635BFF" fillOpacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 space-y-2">
            {data.fee_breakdown.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground/60">{f.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground/40">{f.pct}%</span>
                  <span className="font-semibold tabular-nums">€{f.amount.toLocaleString()}/mo</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="rounded-2xl bg-foreground text-background p-6">
        <p className="text-[10px] uppercase tracking-[0.2em] opacity-30 mb-3">Recommendation</p>
        <h3 className="text-xl font-black mb-2">
          You are paying {(data.effective_fee_pct - data.benchmark_fee_pct).toFixed(1)}% above benchmark.
        </h3>
        <p className="text-sm text-background/55 leading-relaxed mb-5">
          You could reduce your payment fees by reaching the CAMBRA network benchmark rate. At your current volume,
          that's <strong className="text-background">€{data.monthly_savings_potential.toLocaleString()}/month</strong> back into your margins.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Link to="/Onboarding">
            <Button className="h-11 rounded-xl px-6 text-sm font-bold gap-2 bg-background text-foreground hover:bg-background/90">
              Start saving <ArrowRight size={13} />
            </Button>
          </Link>

        </div>
      </div>

      {/* Security footer */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/35 pb-4">
        <Shield size={11} />
        <span>{data?.simulated ? "Simulated data analysis · Read-only access · We never modify your data" : "Read-only access · We never modify your data · Analysis runs server-side"}</span>
      </div>
    </div>
  );
}