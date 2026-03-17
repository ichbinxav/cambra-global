import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, TrendingDown, Zap, Shield, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

const quickActions = [
  { title: "View Reports", desc: "Historical analysis data", path: "/Reports" },
  { title: "Browse Network", desc: "Discover member brands", path: "/Network" },
  { title: "Read Insights", desc: "Infrastructure intelligence", path: "/Insights" },
];

export default function Dashboard() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.AnalyzerResult.list("-created_date", 5).then(r => {
      setResults(r);
      setLoading(false);
    });
  }, []);

  const latest = results[0];

  const stats = latest ? [
    { label: "Total Savings", value: latest.total_savings, prefix: "€", suffix: "/yr", icon: TrendingDown, desc: "Potential annual savings" },
    { label: "Infra Score", value: latest.infra_score, suffix: "/100", icon: Shield, desc: "Infrastructure health" },
    { label: "Payment Savings", value: latest.payment_savings, prefix: "€", suffix: "/yr", icon: Zap, desc: "Payment optimization" },
    { label: "Shipping Savings", value: latest.shipping_savings, prefix: "€", suffix: "/yr", icon: Package, desc: "Shipping optimization" },
  ] : [];

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex items-start justify-between mb-12">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-2">Dashboard</p>
          <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
          <p className="text-muted-foreground text-sm mt-1.5">Your infrastructure at a glance.</p>
        </div>
        <Link to="/Analyzer">
          <Button size="sm" className="rounded-full text-xs h-8 px-4">
            Run Analyzer <ArrowRight className="ml-1.5 h-3 w-3" />
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <motion.div className="text-2xl text-muted-foreground/40" animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }}>✱</motion.div>
        </div>
      ) : !latest ? (
        <div className="text-center py-32 border border-dashed border-border/60 rounded-2xl">
          <div className="text-4xl mb-5 select-none opacity-20">✱</div>
          <h3 className="text-xl font-semibold tracking-tight mb-2">No analysis yet</h3>
          <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">Run the Analyzer to see your infrastructure insights and identify savings opportunities.</p>
          <Link to="/Analyzer">
            <Button className="rounded-full px-8 text-sm">Run Analyzer →</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                className="p-6 rounded-2xl border border-border/60 bg-card hover:border-foreground/10 transition-all"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <stat.icon size={13} className="text-muted-foreground/60" />
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{stat.label}</span>
                </div>
                <div className="text-2xl font-bold tracking-tight">
                  <AnimatedCounter value={stat.value} prefix={stat.prefix || ""} suffix={stat.suffix || ""} duration={1.5} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{stat.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action, i) => (
              <Link key={action.path} to={action.path}>
                <motion.div
                  className="group p-6 rounded-2xl border border-border/60 hover:border-foreground/10 bg-card transition-all"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.08, duration: 0.4 }}
                >
                  <h3 className="font-semibold tracking-tight mb-1 text-sm">{action.title}</h3>
                  <p className="text-xs text-muted-foreground">{action.desc}</p>
                  <ArrowRight size={13} className="mt-4 text-muted-foreground/40 group-hover:translate-x-1 group-hover:text-foreground transition-all" />
                </motion.div>
              </Link>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}