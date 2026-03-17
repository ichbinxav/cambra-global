import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, TrendingDown, Shield, Zap, Package, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

const quickActions = [
  { title: "Run new analysis", desc: "Update your infrastructure score", path: "/Analyzer", accent: true },
  { title: "Browse network", desc: "Discover member brands", path: "/Network" },
  { title: "Read insights", desc: "Infrastructure intelligence", path: "/Insights" },
];

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.AnalyzerResult.list("-created_date", 10),
      base44.auth.me(),
    ]).then(([r, u]) => {
      setResults(r);
      setUser(u);
      setLoading(false);
    });
  }, []);

  const latest = results[0];

  const stats = latest ? [
    { label: "Total Savings", value: latest.total_savings, prefix: "€", suffix: "/yr", icon: TrendingDown, desc: "Potential annual savings", accent: true },
    { label: "Infra Score", value: latest.infra_score, suffix: "/100", icon: Shield, desc: "Infrastructure health" },
    { label: "Payment Savings", value: latest.payment_savings, prefix: "€", suffix: "/yr", icon: Zap, desc: "Payment optimization" },
    { label: "Shipping Savings", value: latest.shipping_savings, prefix: "€", suffix: "/yr", icon: Package, desc: "Logistics savings" },
  ] : [];

  const chartData = results.slice().reverse().map((r, i) => ({
    i,
    value: r.total_savings || 0,
    score: r.infra_score || 0,
  }));

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-12">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-2">Dashboard</p>
          <h1 className="text-3xl font-black tracking-[-0.03em]">
            {user?.full_name ? `Hello, ${user.full_name.split(" ")[0]}.` : "Overview"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5">Your infrastructure command center.</p>
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
      ) : !latest ? (
        <motion.div
          className="text-center py-36 border border-dashed border-border/50 rounded-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="text-5xl mb-6 select-none text-muted-foreground/15"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          >✱</motion.div>
          <h3 className="text-xl font-bold tracking-tight mb-2">No analysis yet</h3>
          <p className="text-muted-foreground text-sm mb-8 max-w-xs mx-auto">Run the Analyzer to reveal your infrastructure insights and identify savings opportunities.</p>
          <Link to="/Analyzer">
            <Button className="rounded-full px-8 text-sm font-semibold shadow-sm">Run Analyzer →</Button>
          </Link>
        </motion.div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                className={`p-6 rounded-2xl border transition-all ${
                  stat.accent
                    ? "border-blue-500/20 bg-blue-500/[0.03]"
                    : "border-border/50 bg-card/60"
                }`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.4 }}
                whileHover={{ y: -2 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <stat.icon size={13} className={stat.accent ? "text-blue-500" : "text-muted-foreground/50"} />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/50">{stat.label}</span>
                </div>
                <div className={`text-2xl font-black tracking-tight ${stat.accent ? "text-node-blue" : ""}`}>
                  <AnimatedCounter value={stat.value} prefix={stat.prefix || ""} suffix={stat.suffix || ""} duration={1.5} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{stat.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Chart (if multiple results) */}
          {chartData.length > 1 && (
            <motion.div
              className="p-6 rounded-2xl border border-border/50 bg-card/60 mb-8"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 mb-1">Savings trend</p>
                  <p className="text-sm font-semibold">Total potential savings over time</p>
                </div>
                <Link to="/Reports">
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground gap-1">
                    View reports <ArrowUpRight size={11} />
                  </Button>
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(215,100%,50%)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="hsl(215,100%,50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: "1px solid hsl(var(--border))", fontSize: 11, background: "hsl(var(--card))" }}
                    formatter={v => [`€${v?.toLocaleString()}/yr`, "Savings"]}
                  />
                  <Area type="monotone" dataKey="value" stroke="hsl(215,100%,50%)" strokeWidth={2} fill="url(#blueGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </motion.div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {quickActions.map((action, i) => (
              <Link key={action.path} to={action.path}>
                <motion.div
                  className={`group p-6 rounded-2xl border transition-all ${
                    action.accent
                      ? "border-foreground/10 bg-foreground text-background"
                      : "border-border/50 bg-card/60 hover:border-border hover:bg-card"
                  }`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.07 }}
                  whileHover={{ y: -2 }}
                >
                  <h3 className={`font-semibold tracking-tight text-sm mb-1 ${action.accent ? "text-background" : ""}`}>{action.title}</h3>
                  <p className={`text-xs ${action.accent ? "text-background/50" : "text-muted-foreground"}`}>{action.desc}</p>
                  <ArrowRight size={13} className={`mt-4 group-hover:translate-x-1 transition-transform ${action.accent ? "text-background/40" : "text-muted-foreground/40"}`} />
                </motion.div>
              </Link>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}