import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ArrowRight } from "lucide-react";
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

  const chartData = results.map(r => ({
    date: format(new Date(r.created_date), "MMM d"),
    payments: r.payment_savings || 0,
    shipping: r.shipping_savings || 0,
    saas: r.saas_savings || 0,
    total: r.total_savings || 0,
  })).reverse();

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter">Reports</h1>
          <p className="text-muted-foreground text-sm mt-1">Your analysis history and trends.</p>
        </div>
        <Link to="/Analyzer">
          <Button size="sm" className="rounded-full text-xs">
            New Analysis <ArrowRight className="ml-2 h-3 w-3" />
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <motion.div className="text-3xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : results.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No reports yet. Run the Analyzer to get started.</p>
        </div>
      ) : (
        <>
          {/* Chart */}
          {chartData.length > 1 && (
            <div className="p-6 rounded-2xl border border-border bg-card mb-8">
              <h3 className="text-sm font-medium tracking-tight mb-6">Savings Over Time (€/yr)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="payments" name="Payments" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="shipping" name="Shipping" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saas" name="SaaS" fill="hsl(var(--border))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* History table */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-secondary/30">
              <h3 className="text-sm font-medium tracking-tight">Analysis History</h3>
            </div>
            <div className="divide-y divide-border">
              {results.map(r => (
                <Link key={r.id} to={`/Results?id=${r.id}`}>
                  <div className="px-6 py-4 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{format(new Date(r.created_date), "MMMM d, yyyy")}</p>
                      <p className="text-xs text-muted-foreground">Score: {r.infra_score}/100</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">€{r.total_savings?.toLocaleString()}/yr</p>
                      <p className="text-xs text-muted-foreground">potential savings</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}