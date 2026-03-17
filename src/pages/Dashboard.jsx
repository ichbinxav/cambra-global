import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, TrendingDown, Zap, Shield, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

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
    { label: "Total Savings", value: latest.total_savings, prefix: "€", suffix: "/yr", icon: TrendingDown },
    { label: "Infra Score", value: latest.infra_score, suffix: "/100", icon: Shield },
    { label: "Payment Savings", value: latest.payment_savings, prefix: "€", suffix: "/yr", icon: Zap },
    { label: "Shipping Savings", value: latest.shipping_savings, prefix: "€", suffix: "/yr", icon: Target },
  ] : [];

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tighter">Overview</h1>
            <p className="text-muted-foreground text-sm mt-1">Your infrastructure at a glance.</p>
          </div>
          <Link to="/Analyzer">
            <Button size="sm" className="rounded-full text-xs">
              Run Analyzer <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <motion.div className="text-3xl" animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>✱</motion.div>
          </div>
        ) : !latest ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <div className="text-4xl mb-4 select-none">✱</div>
            <h3 className="text-xl font-semibold tracking-tight mb-2">No analysis yet</h3>
            <p className="text-muted-foreground text-sm mb-6">Run the Analyzer to see your infrastructure insights.</p>
            <Link to="/Analyzer">
              <Button className="rounded-full px-8 text-sm">Run Analyzer</Button>
            </Link>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="p-6 rounded-2xl border border-border bg-card hover:shadow-md transition-shadow"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <stat.icon size={14} className="text-muted-foreground" />
                    <span className="text-xs text-muted-foreground tracking-wide uppercase">{stat.label}</span>
                  </div>
                  <div className="text-2xl font-bold tracking-tight">
                    <AnimatedCounter value={stat.value} prefix={stat.prefix || ""} suffix={stat.suffix || ""} duration={1.5} />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: "View Reports", desc: "Historical analysis data", path: "/Reports" },
                { title: "Browse Network", desc: "Discover member brands", path: "/Network" },
                { title: "Read Insights", desc: "Infrastructure intelligence", path: "/Insights" },
              ].map((action, i) => (
                <Link key={action.path} to={action.path}>
                  <motion.div
                    className="p-6 rounded-2xl border border-border hover:border-foreground/20 bg-card hover:shadow-md transition-all group cursor-pointer"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
                  >
                    <h3 className="font-semibold tracking-tight mb-1">{action.title}</h3>
                    <p className="text-sm text-muted-foreground">{action.desc}</p>
                    <ArrowRight size={14} className="mt-3 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </motion.div>
                </Link>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}