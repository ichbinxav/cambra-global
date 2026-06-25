import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ShieldCheck, AlertCircle, Sparkles, Calendar } from "lucide-react";

function formatEur(n) {
  return `€${Math.max(0, Math.round(Number(n) || 0)).toLocaleString()}`;
}

function monthLabel(ym) {
  // "2026-05" -> "May 26"
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || "";
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

function qualityBadge(q) {
  if (q === "verified") return { label: "Verified", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", icon: ShieldCheck };
  if (q === "mixed") return { label: "Mixed", cls: "bg-blue-500/10 text-blue-600 border-blue-500/25", icon: Sparkles };
  return { label: "Estimated", cls: "bg-amber-500/10 text-amber-600 border-amber-500/25", icon: AlertCircle };
}

const VERIFIED_COLOR = "#10b981"; // emerald-500
const ESTIMATED_COLOR = "#f59e0b"; // amber-500

export default function SavingsTrendPanel({ brandId, identifiedMonthly = 0 }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!brandId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await base44.functions.invoke("getBrandSavings", { brandId });
        const payload = res?.data || res;
        setData(payload);
      } catch (_) {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [brandId]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-6 h-44 animate-pulse" />
    );
  }
  if (!data) return null;

  const history = Array.isArray(data.monthly_history) ? data.monthly_history : [];
  const latest = history[history.length - 1] || null;
  const quality = qualityBadge(data.measurement_quality || "estimated");
  const QIcon = quality.icon;

  const chartData = history.map(h => ({
    month: monthLabel(h.month),
    savings: Math.max(0, Math.round(Number(h.savings || 0))),
    verified: h.measurement_mode === "fully_verified",
  }));

  const nextDue = data.next_report_due ? new Date(data.next_report_due) : null;
  const nextDueLabel = nextDue
    ? nextDue.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 sm:p-7">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold mb-1">
            Savings to date
          </p>
          <p className="font-display font-black tabular-nums tracking-[-0.03em] text-3xl sm:text-4xl">
            {formatEur(data.realized_to_date)}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5">
            Measured cumulative savings — past, not projected.
          </p>
        </div>
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${quality.cls}`}>
          <QIcon size={11} />
          {quality.label}
        </div>
      </div>

      {/* This month vs identified potential */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-3.5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-semibold mb-1">This month</p>
          <p className="text-xl font-black tabular-nums">{formatEur(latest?.savings || 0)}</p>
          {latest && (
            <p className="text-[10px] text-muted-foreground/70 mt-0.5">
              {latest.measurement_mode === "fully_verified" ? "Verified" :
               latest.measurement_mode === "estimated_from_partial_data" ? "Partially verified" : "Estimated"}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-border/50 bg-secondary/30 p-3.5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-semibold mb-1">Identified potential</p>
          <p className="text-xl font-black tabular-nums">{formatEur(identifiedMonthly)}<span className="text-xs text-muted-foreground/50 font-normal ml-1">/mo</span></p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">From your latest analysis</p>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="rounded-xl border border-border/40 bg-card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">
              Last 12 months
            </p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: VERIFIED_COLOR }} /> Verified
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: ESTIMATED_COLOR }} /> Estimated
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `€${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
              <Tooltip
                contentStyle={{ borderRadius: 10, fontSize: 11, border: "1px solid hsl(var(--border))", padding: "6px 10px" }}
                formatter={(v, _n, item) => [`€${v.toLocaleString()}`, item?.payload?.verified ? "Verified" : "Estimated"]}
                labelStyle={{ fontWeight: 700 }}
              />
              <Bar dataKey="savings" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.verified ? VERIFIED_COLOR : ESTIMATED_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
          <Sparkles size={16} className="mx-auto text-muted-foreground/60 mb-2" />
          <p className="text-sm font-semibold mb-0.5">Tracking starts next month</p>
          <p className="text-xs text-muted-foreground">
            Savings tracking will appear once your first monthly report is generated.
          </p>
        </div>
      )}

      {/* Next report due */}
      <div className="flex items-center gap-2 mt-4 text-[11px] text-muted-foreground">
        <Calendar size={11} />
        <span>Next report: <span className="font-semibold text-foreground/80">{nextDueLabel}</span></span>
      </div>
    </div>
  );
}