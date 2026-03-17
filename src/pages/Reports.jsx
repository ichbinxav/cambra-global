import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { ArrowRight, TrendingUp, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Reports() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.AnalyzerResult.list("-created_date", 20).then(r => {
      setResults(r);
      setLoading(false);
    });
  }, []);

  const chartData = results.slice().reverse().map(r => ({
    date: format(new Date(r.created_date), "MMM d"),
    Payments: r.payment_savings || 0,
    Shipping: r.shipping_savings || 0,
    SaaS: r.saas_savings || 0,
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      <div className="flex items-start justify-between mb-12">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Analytics</p>
          <h1 className="text-3xl font-black tracking-[-0.03em]">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1.5">Your analysis history and savings trends.</p>
        </div>
        <Link to="/Analyzer">
          <Button size="sm" className="h-8 rounded-full px-4 text-xs font-semibold shadow-sm">
            New Analysis <ArrowRight className="ml-1.5 h-3 w-3" />
          </Button>
        </Link>
      </div>

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
              className="p-7 rounded-2xl border border-border/50 bg-card/60 mb-6"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="mb-6">
                <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 mb-1">Savings history</p>
                <p className="text-sm font-semibold">Annual savings potential by category (€)</p>
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
                  <Bar dataKey="Payments" fill="hsl(215,100%,50%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Shipping" fill="hsl(142,76%,36%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="SaaS" fill="hsl(25,95%,53%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* History list */}
          <motion.div
            className="rounded-2xl border border-border/50 overflow-hidden bg-card/60"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
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
                        <p className="text-[10px] text-muted-foreground">potential savings</p>
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