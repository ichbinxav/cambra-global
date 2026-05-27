import { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";
import { TrendingUp, Info } from "lucide-react";

/**
 * Cumulative savings chart — month by month.
 * Builds a 12-month timeline ending at the current month, distributing each
 * AnalyzerResult's identified savings as a monthly run-rate from the analysis date forward.
 *
 * Props:
 *  - results: AnalyzerResult[]  (sorted by created_date desc or asc — handled internally)
 */
export default function CumulativeSavingsChart({ results = [] }) {
  const { data, totalToDate, monthlyAvg } = useMemo(() => {
    if (!results.length) return { data: [], totalToDate: 0, monthlyAvg: 0 };

    // Build 12 trailing months
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        date: d,
        label: d.toLocaleDateString(undefined, { month: "short" }),
      });
    }

    // For each analysis, accrue 1/12 of total_savings per month from its month onward
    const sorted = [...results].sort(
      (a, b) => new Date(a.created_date) - new Date(b.created_date)
    );

    let cumulative = 0;
    const series = months.map((m) => {
      // monthly contribution: sum of (total_savings/12) for every analysis active at/before this month
      let monthlyAdd = 0;
      for (const r of sorted) {
        const createdAt = new Date(r.created_date);
        if (createdAt <= new Date(m.date.getFullYear(), m.date.getMonth() + 1, 0)) {
          monthlyAdd += (r.total_savings || 0) / 12;
        }
      }
      cumulative += monthlyAdd;
      return {
        month: m.label,
        cumulative: Math.round(cumulative),
        monthly: Math.round(monthlyAdd),
      };
    });

    const total = series[series.length - 1]?.cumulative || 0;
    const avg = total / 12;
    return { data: series, totalToDate: total, monthlyAvg: avg };
  }, [results]);

  if (!results.length) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-6">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={14} className="text-muted-foreground/50" />
          <h3 className="text-sm font-semibold">Cumulative savings</h3>
        </div>
        <p className="text-xs text-muted-foreground/60 mb-6">
          Track the real impact of CAMBRA on your bottom line, month by month.
        </p>
        <div className="text-center py-12 border border-dashed border-border/40 rounded-xl">
          <p className="text-xs text-muted-foreground/60">
            Run your first analysis to start tracking accumulated savings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-chart-2" />
            <h3 className="text-sm font-semibold">Cumulative savings</h3>
            <span className="text-[10px] text-muted-foreground/40 hidden sm:inline">· last 12 months</span>
          </div>
          <p className="text-xs text-muted-foreground/60">
            Estimated impact of CAMBRA on your infrastructure costs.
          </p>
        </div>
        <div className="flex gap-4 sm:gap-6 shrink-0">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-0.5">To date</p>
            <p className="text-xl font-black tabular-nums text-chart-2">
              €{totalToDate.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40 mb-0.5">Avg / month</p>
            <p className="text-xl font-black tabular-nums">
              €{Math.round(monthlyAvg).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--neon-7))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--neon-7))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `€${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `€${Number(value).toLocaleString()}`,
                name === "cumulative" ? "Cumulative" : "This month",
              ]}
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Area
              type="monotone"
              dataKey="cumulative"
              stroke="hsl(var(--neon-7))"
              strokeWidth={2.5}
              fill="url(#savingsGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footnote */}
      <div className="flex items-start gap-2 mt-4 pt-4 border-t border-border/30">
        <Info size={11} className="text-muted-foreground/40 mt-0.5 shrink-0" />
        <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
          Estimated cumulative savings based on identified annual potential from your analyses,
          accrued as a monthly run-rate. Activate deals to convert estimates into realized savings.
        </p>
      </div>
    </div>
  );
}