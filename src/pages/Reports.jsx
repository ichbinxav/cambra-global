import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ArrowRight, TrendingUp, ArrowUpRight, CheckCircle2, Circle, AlertCircle, Sparkles } from "lucide-react";
import { getBenchmarks } from "@/lib/scoreEngine";
import { Button } from "@/components/ui/button";
import PageHero from "@/components/shared/PageHero";
import ReportsKPIStrip from "@/components/reports/ReportsKPIStrip";

export default function Reports() {
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
      // Tenant filter — same pattern as UnlockSavings.jsx. Without this filter
      // an admin viewing /Reports would see AnalyzerResults from other users.
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
        const brands = await base44.entities.Brand
          .filter({ created_by: me.email }, '-created_date', 1)
          .catch(() => []);
        const b = brands?.[0] || null;
        setBrand(b);
        if (b) {
          const [reports, baselines] = await Promise.all([
            base44.entities.MonthlySavingsReport.filter({ brand_id: b.id }, '-month', 1),
            base44.entities.Baseline.filter({ brand_id: b.id, is_current: true }, '-locked_at', 1),
          ]);
          setLastReport(reports?.[0] || null);
          setBaseline(baselines?.[0] || null);
        }
      } finally {
        setVLoading(false);
      }
    })();
  }, []);

  // R2 (2026-07-12) — payments-only chart. Removed Logistics
  // (r.shipping_savings) and Commerce SaaS (r.saas_savings) series — those
  // fields still exist on AnalyzerResult for legacy rows but are always 0 in
  // the payments-only product, and rendering them as chart bars advertised a
  // multi-vertical offering that no longer exists. The TPE report block below
  // stays (in-store terminal payments = same product, offline channel).
  const chartData = results.slice().reverse().map(r => ({
    date: format(new Date(r.created_date), "MMM d"),
    Payments: r.payment_savings || 0,
  }));

  return (
    <div>
      <PageHero
        eyebrow="Margin intelligence · History"
        title="Reports."
        subtitle="Every scan, every benchmark, every recovered euro — mapped continuously across your stack."
        icon={TrendingUp}
        actions={
          <Link to="/Analyzer">
            <Button size="sm" className="h-10 rounded-full px-5 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> New scan <ArrowRight className="h-3.5 w-3.5" />
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
            <h3 className="text-xl font-black text-white tracking-tight mb-2">No reports yet</h3>
            <p className="text-sm text-white/55 mb-6 max-w-sm mx-auto">
              Run your first infrastructure audit to see margin recovery opportunities mapped here.
            </p>
            <Link to="/Analyzer">
              <Button className="rounded-full px-7 h-11 text-sm font-bold bg-white text-[#06080F] hover:bg-white/90 gap-2">
                <Sparkles className="h-3.5 w-3.5" /> Run Analyzer <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <ReportsKPIStrip results={results} />

          {/* Chart */}
          {chartData.length > 0 && (
            <div className="cambra-card p-7 mb-6">
              <div className="relative">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="cc-eyebrow mb-1.5">Savings history</p>
                  <p className="text-base font-black text-white tracking-tight">Identified payment savings</p>
                  <p className="text-[11px] text-white/45 font-mono mt-0.5">Annualized · online + in-store card payments</p>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.10] bg-white/[0.04]">
                  <span className="h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
                  <span className="text-[9px] font-bold tracking-[0.18em] uppercase text-white/65">Live</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", fontSize: 11, background: "#0B1023", color: "#fff" }}
                    formatter={v => [`€${v?.toLocaleString()}/yr`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16, color: "rgba(255,255,255,0.7)" }} />
                  <Bar dataKey="Payments" fill="var(--voltio-2)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          )}

           {/* Verification checklist */}
           {!vLoading && (
             <div className="cambra-card p-7 mb-6">
               <div className="relative">
               <div className="mb-4 flex items-center justify-between">
                 <div>
                   <p className="cc-eyebrow mb-1">Verification</p>
                   <p className="text-sm font-semibold text-white">Checklist for verified savings</p>
                 </div>
                 {lastReport?.verification_status && (
                   <span className="text-[11px] px-2 py-1 rounded-full border border-white/15 text-white/75">
                     {lastReport.verification_status.replaceAll("_"," ")}
                   </span>
                 )}
               </div>
               <ul className="space-y-2">
                 {(() => {
                   const ORDER = ["estimated","proposed","evidence_submitted","under_review","verified","realized","invoiced","paid"];
                   const vs = lastReport?.verification_status || "estimated";
                   const idx = ORDER.indexOf(vs);
                   const steps = [
                     { key: "baseline", label: "Baseline locked", done: !!(baseline?.locked), hint: baseline?.locked_at ? new Date(baseline.locked_at).toLocaleDateString() : null },
                     { key: "evidence", label: "Evidence submitted", done: idx >= ORDER.indexOf("evidence_submitted"), hint: (lastReport?.evidence_count || 0) > 0 ? `${lastReport.evidence_count} file(s)` : null },
                     { key: "under_review", label: "Under review", done: idx >= ORDER.indexOf("under_review") },
                     { key: "verified", label: "Verified", done: idx >= ORDER.indexOf("verified") },
                     { key: "realized", label: "Realized", done: idx >= ORDER.indexOf("realized") },
                   ];
                   return steps.map(s => (
                     <li key={s.key} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                       <div className="flex items-center gap-3">
                         {s.done ? <CheckCircle2 className="w-4 h-4 text-[#2FE0A8]" /> : <Circle className="w-4 h-4 text-white/30" />}
                         <span className={`text-sm ${s.done ? "font-semibold text-white" : "text-white/65"}`}>{s.label}</span>
                         {s.hint && <span className="text-[11px] text-white/55">· {s.hint}</span>}
                       </div>
                       {!s.done && <AlertCircle className="w-4 h-4 text-white/30" />}
                     </li>
                   ))
                 })()}
               </ul>
               {!brand && (
                <p className="text-xs text-white/55 mt-3">Complete onboarding to enable verification tracking.</p>
                )}
                </div>
                </div>
                )}

                {lastReport && (
                <div className="cambra-card p-7 mb-6">
               <div className="relative">
               <div className="mb-4">
                <p className="cc-eyebrow mb-1">In-store payments</p>
                <p className="text-sm font-semibold text-white">Terminal (TPV) benchmark and savings opportunity</p>
               </div>
               {(() => {
                 const input = results[0];
                 const effectiveRate = input?.details?.tpe_effective_rate || 0;
                 const benchmarkRate = input?.details?.tpe_optimal_rate || getBenchmarks(input?.details?.monthly_revenue || 50000, brand?.country || '').tpe.rate;
                 const tpeSavings = input?.details?.tpe_savings || 0;
                 const annualInStoreCost = input?.details?.annual_gmv && effectiveRate ? (input.details.annual_gmv * (effectiveRate / 100)) : 0;
                 const benchmarkCost = input?.details?.annual_gmv && benchmarkRate ? (input.details.annual_gmv * (benchmarkRate / 100)) : 0;
                 return (
                   <div className="grid gap-3 md:grid-cols-2">
                     <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
                       <p className="text-xs text-white/55 mb-2">Current cost</p>
                       <p className="text-lg font-black text-white">€{Math.round(annualInStoreCost).toLocaleString()}/yr</p>
                       <p className="text-xs text-white/55 mt-2">Effective TPE rate: {effectiveRate.toFixed(2)}%</p>
                     </div>
                     <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
                       <p className="text-xs text-white/55 mb-2">Benchmark cost</p>
                       <p className="text-lg font-black text-white">€{Math.round(benchmarkCost).toLocaleString()}/yr</p>
                       <p className="text-xs text-white/55 mt-2">Network rate: {benchmarkRate.toFixed(2)}%</p>
                     </div>
                     <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
                       <p className="text-xs text-white/55 mb-2">Savings opportunity</p>
                       <p className="text-lg font-black text-[#FFB05A]">€{Math.round(tpeSavings).toLocaleString()}/yr</p>
                       <p className="text-xs text-white/55 mt-2">Recommendation: renegotiate terminals and fixed fees.</p>
                     </div>
                     <div className="rounded-xl border border-white/10 p-4 bg-white/[0.04]">
                       <p className="text-xs text-white/55 mb-2">Next action</p>
                       <p className="text-sm font-semibold text-white">Improve payment infrastructure terms.</p>
                       <p className="text-xs text-white/55 mt-2">Include rental, contract renewal and banking fees.</p>
                     </div>
                   </div>
                 );
                 })()}
                 </div>
                 </div>
                 )}

                 {/* History list */}
                 <div className="cambra-card overflow-hidden">
                 <div className="px-6 py-5 border-b border-white/[0.08] flex items-center justify-between relative">
                   <div>
                     <p className="cc-eyebrow mb-1">Audit history</p>
                     <p className="text-base font-black text-white tracking-tight">Analysis timeline</p>
                   </div>
                   <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/50">{results.length} {results.length === 1 ? "report" : "reports"}</span>
                 </div>
                 <div className="divide-y divide-white/[0.06] relative">
                 {results.map((r, i) => {
                   const score = r.infra_score || 0;
                   const scoreColor = score >= 75 ? "text-[#2FE0A8] bg-[#2FE0A8]/10 border-[#2FE0A8]/25" : score >= 50 ? "text-[#7BD9F0] bg-[#7BD9F0]/10 border-[#7BD9F0]/25" : score >= 30 ? "text-[#FFB05A] bg-[#FFB05A]/10 border-[#FFB05A]/25" : "text-[#FF7A6E] bg-[#FF7A6E]/10 border-[#FF7A6E]/25";
                   return (
                 <Link key={r.id} to={`/Results?id=${r.id}`}>
                 <div className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.04] transition-colors group cursor-pointer">
                   <div className="flex items-center gap-4 min-w-0">
                     <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.10] flex items-center justify-center text-[11px] font-mono font-bold text-white/70 shrink-0">
                       {String(results.length - i).padStart(2, "0")}
                     </div>
                     <div className="min-w-0">
                       <p className="text-sm font-bold text-white truncate">{format(new Date(r.created_date), "MMMM d, yyyy")}</p>
                       <p className="text-[11px] text-white/45 font-mono mt-0.5">{format(new Date(r.created_date), "HH:mm")} · scan complete</p>
                     </div>
                   </div>
                   <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                     <span className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tabular-nums ${scoreColor}`}>
                       {score}<span className="opacity-60">/100</span>
                     </span>
                     <div className="text-right">
                       <p className="text-sm font-black tabular-nums tracking-tight text-white">€{r.total_savings?.toLocaleString()}<span className="text-white/40 font-normal">/yr</span></p>
                       <p className="text-[10px] text-white/45 font-mono">recovery potential</p>
                     </div>
                     <ArrowUpRight size={14} className="text-white/30 group-hover:text-cambra-cyan group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                     </div>
                     </div>
                     </Link>
                     );
                     })}
                     </div>
                     </div>
                     </>
                     )}
                     </div>
                     );
                     }