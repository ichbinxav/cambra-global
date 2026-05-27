import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ArrowRight, TrendingUp, ArrowUpRight, CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { getBenchmarks } from "@/lib/scoreEngine";
import { Button } from "@/components/ui/button";
import PageHero from "@/components/shared/PageHero";

export default function Reports() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState(null);
  const [lastReport, setLastReport] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [vLoading, setVLoading] = useState(true);

  useEffect(() => {
    base44.entities.AnalyzerResult.list("-created_date", 20).then(r => {
      setResults(r);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const authed = await base44.auth.isAuthenticated();
        if (!authed) { setVLoading(false); return; }
        const me = await base44.auth.me();
        const brands = await base44.entities.Brand.filter({ created_by_id: me.id }, '-created_date', 1);
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

  const chartData = results.slice().reverse().map(r => ({
    date: format(new Date(r.created_date), "MMM d"),
    "Online Payments": Math.max(0, (r.payment_savings || 0) - (r.details?.tpe_savings || 0)),
    "In-Store / TPE": r.details?.tpe_savings || 0,
    Shipping: r.shipping_savings || 0,
    SaaS: r.saas_savings || 0,
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <PageHero
        eyebrow="Analytics · Savings history"
        title="Reports."
        subtitle="Your analysis history and savings trends, mapped continuously."
        icon={TrendingUp}
        actions={
          <Link to="/Analyzer">
            <Button size="sm" className="h-10 rounded-full px-5 text-sm font-bold bg-foreground text-background hover:opacity-90 gap-1.5">
              New Analysis <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-40">
          <motion.div className="text-2xl text-muted-foreground/25" animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-36 border border-dashed border-border/50 rounded-2xl">
          <TrendingUp size={28} className="mx-auto mb-4 text-muted-foreground/25" />
          <p className="text-muted-foreground text-sm mb-6">No reports yet. Run the Analyzer to get started.</p>
          <Link to="/Analyzer">
            <Button className="rounded-full px-8 text-sm font-semibold shadow-sm">Run Analyzer →</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Chart */}
          {chartData.length > 0 && (
            <motion.div
              className="relative p-7 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm mb-6 overflow-hidden shadow-[0_18px_48px_-24px_rgba(0,0,0,0.18)]"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(31,78,216,0.20), transparent)" }} />
              <div className="pointer-events-none absolute -bottom-24 -left-24 w-72 h-72 rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.18), transparent)" }} />
              <div className="relative">
              <div className="mb-6">
                <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 mb-1">Savings history</p>
                <p className="text-sm font-semibold">Identified (Analyzer) savings by category (€)</p>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v/1000).toFixed(0)}K`} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }}
                    formatter={v => [`€${v?.toLocaleString()}/yr`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 16 }} />
                  <Bar dataKey="Online Payments" fill="hsl(var(--cambra-blue))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="In-Store / TPE" fill="hsl(var(--score-medium))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Shipping" fill="hsl(var(--cambra-cyan))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="SaaS" fill="hsl(var(--cambra-navy))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              </div>
            </motion.div>
          )}

           {/* Verification checklist */}
           {!vLoading && (
             <motion.div
               className="relative p-7 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm mb-6 overflow-hidden shadow-[0_18px_48px_-24px_rgba(0,0,0,0.18)]"
               initial={{ opacity: 0, y: 12 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.15 }}
             >
               <div className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(34,197,94,0.20), transparent)" }} />
               <div className="relative">
               <div className="mb-4 flex items-center justify-between">
                 <div>
                   <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 mb-1">Verification</p>
                   <p className="text-sm font-semibold">Checklist for verified savings</p>
                 </div>
                 {lastReport?.verification_status && (
                   <span className="text-[11px] px-2 py-1 rounded-full border">
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
                     <li key={s.key} className="flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                       <div className="flex items-center gap-3">
                         {s.done ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Circle className="w-4 h-4 text-muted-foreground/40" />}
                         <span className={`text-sm ${s.done ? "font-semibold" : ""}`}>{s.label}</span>
                         {s.hint && <span className="text-[11px] text-muted-foreground/70">· {s.hint}</span>}
                       </div>
                       {!s.done && <AlertCircle className="w-4 h-4 text-muted-foreground/40" />}
                     </li>
                   ))
                 })()}
               </ul>
               {!brand && (
                <p className="text-xs text-muted-foreground mt-3">Complete onboarding to enable verification tracking.</p>
               )}
               </div>
               </motion.div>
               )}

               {lastReport && (
               <motion.div
               className="relative p-7 rounded-2xl border border-border/60 bg-card/95 backdrop-blur-sm mb-6 overflow-hidden shadow-[0_18px_48px_-24px_rgba(0,0,0,0.18)]"
               initial={{ opacity: 0, y: 12 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.18 }}
               >
               <div className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-50" style={{ background: "radial-gradient(closest-side, rgba(251,146,60,0.20), transparent)" }} />
               <div className="relative">
               <div className="mb-4">
                 <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 mb-1">TPE report</p>
                 <p className="text-sm font-semibold">In-store terminal benchmark and savings opportunity</p>
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
                     <div className="rounded-xl border border-border/40 p-4 bg-background/40">
                       <p className="text-xs text-muted-foreground mb-2">Current cost</p>
                       <p className="text-lg font-black">€{Math.round(annualInStoreCost).toLocaleString()}/yr</p>
                       <p className="text-xs text-muted-foreground mt-2">Effective TPE rate: {effectiveRate.toFixed(2)}%</p>
                     </div>
                     <div className="rounded-xl border border-border/40 p-4 bg-background/40">
                       <p className="text-xs text-muted-foreground mb-2">Benchmark cost</p>
                       <p className="text-lg font-black">€{Math.round(benchmarkCost).toLocaleString()}/yr</p>
                       <p className="text-xs text-muted-foreground mt-2">Collective rate: {benchmarkRate.toFixed(2)}%</p>
                     </div>
                     <div className="rounded-xl border border-border/40 p-4 bg-background/40">
                       <p className="text-xs text-muted-foreground mb-2">Savings opportunity</p>
                       <p className="text-lg font-black text-orange-500">€{Math.round(tpeSavings).toLocaleString()}/yr</p>
                       <p className="text-xs text-muted-foreground mt-2">Recommendation: renegotiate terminals and fixed fees.</p>
                     </div>
                     <div className="rounded-xl border border-border/40 p-4 bg-background/40">
                       <p className="text-xs text-muted-foreground mb-2">Next action</p>
                       <p className="text-sm font-semibold">Open a payments deal and compare TPE providers.</p>
                       <p className="text-xs text-muted-foreground mt-2">Include rental, contract renewal and banking fees.</p>
                     </div>
                   </div>
                 );
                 })()}
                 </div>
                 </motion.div>
                 )}

                 {/* History list */}
                 <motion.div
                 className="relative rounded-2xl border border-border/60 overflow-hidden bg-card/95 backdrop-blur-sm shadow-[0_18px_48px_-24px_rgba(0,0,0,0.18)]"
                 initial={{ opacity: 0, y: 12 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: 0.2 }}
                 >
                 <div className="pointer-events-none absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl opacity-40" style={{ background: "radial-gradient(closest-side, rgba(168,85,247,0.18), transparent)" }} />
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
              <p className="text-xs font-semibold tracking-tight">Analysis history</p>
              <span className="text-[10px] text-muted-foreground/50">{results.length} reports</span>
            </div>
            <div className="divide-y divide-border/40">
              {results.map((r, i) => (
                <Link key={r.id} to={`/Results?id=${r.id}`}>
                  <motion.div
                    className="px-6 py-4 flex items-center justify-between hover:bg-secondary/30 transition-colors group"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + i * 0.04 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{format(new Date(r.created_date), "MMMM d, yyyy")}</p>
                        <p className="text-xs text-muted-foreground">Score: {r.infra_score}/100</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-bold tracking-tight">€{r.total_savings?.toLocaleString()}/yr</p>
                        <p className="text-[10px] text-muted-foreground">optimization potential</p>
                      </div>
                      <ArrowUpRight size={14} className="text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}