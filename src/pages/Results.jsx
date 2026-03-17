import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Truck, Layers, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import NodeLoader from "@/components/shared/NodeLoader";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";

const breakdown = [
  { key: "payment_savings", label: "Payments", icon: CreditCard, color: "text-blue-500", bg: "bg-blue-500/8 border-blue-500/20", desc: "Fee rate optimization vs. network benchmark" },
  { key: "shipping_savings", label: "Shipping", icon: Truck, color: "text-green-600", bg: "bg-green-500/8 border-green-500/20", desc: "Carrier & logistics consolidation" },
  { key: "saas_savings", label: "SaaS & Tools", icon: Layers, color: "text-orange-500", bg: "bg-orange-500/8 border-orange-500/20", desc: "Stack consolidation savings" },
];

export default function Results() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      base44.entities.AnalyzerResult.filter({ id }).then(res => {
        if (res.length > 0) setResult(res[0]);
        setTimeout(() => { setLoading(false); setTimeout(() => setRevealed(true), 300); }, 3000);
      });
    }
  }, []);

  if (loading) return <NodeLoader text="Analyzing your infrastructure" />;

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4 text-sm">No results found.</p>
          <Link to="/Analyzer"><Button variant="outline" className="rounded-full px-6 text-sm">Run the Analyzer</Button></Link>
        </div>
      </div>
    );
  }

  const score = result.infra_score || 0;
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;
  const scoreColor = score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#3b82f6";

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-border/40 px-6 py-4 flex items-center justify-between bg-background/92 backdrop-blur-2xl">
        <Link to="/" className="text-sm font-black tracking-tight">THE N✱DE</Link>
        <div className="flex items-center gap-2">
          <Link to="/Reports">
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">History</Button>
          </Link>
          <Link to="/Dashboard">
            <Button size="sm" className="h-7 rounded-full text-xs px-4 font-semibold shadow-sm">Enter Dashboard →</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-20">

        {/* Hero */}
        <motion.div
          className="text-center mb-24"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="inline-block text-3xl mb-8 select-none opacity-25"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          >
            ✱
          </motion.div>
          <p className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground/50 mb-5">
            Your analysis is ready
          </p>
          <h1 className="text-[clamp(1.8rem,4vw,3.5rem)] font-black tracking-[-0.03em] leading-[0.9] mb-5">
            You're likely overpaying
          </h1>
          <div className="text-[clamp(4rem,12vw,8rem)] font-black tracking-[-0.05em] leading-none text-node-blue">
            {revealed
              ? <AnimatedCounter value={result.total_savings} prefix="€" duration={2.5} />
              : <span className="opacity-0">€0</span>}
          </div>
          <p className="text-muted-foreground text-sm mt-4">per year, based on your current infrastructure</p>
        </motion.div>

        {/* Breakdown */}
        <motion.div
          className="mb-12"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5">Breakdown</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {breakdown.map((item, i) => (
              <motion.div
                key={item.key}
                className={`p-6 rounded-2xl border ${item.bg}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                <div className="flex items-center gap-2 mb-5">
                  <item.icon size={13} className={item.color} />
                  <span className="text-xs font-medium">{item.label}</span>
                </div>
                <div className={`text-2xl font-black tracking-tight mb-1 ${item.color}`}>
                  {revealed
                    ? <AnimatedCounter value={result[item.key]} prefix="€" suffix="/yr" duration={2} />
                    : <span className="opacity-0">€0</span>}
                </div>
                <p className="text-[11px] text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Infra Score */}
        <motion.div
          className="mb-12 p-8 rounded-2xl border border-border/50 bg-card/60"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-7">Infrastructure Score</p>
          <div className="flex flex-col sm:flex-row items-center gap-10">
            {/* SVG gauge */}
            <div className="relative w-32 h-32 shrink-0">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
                <motion.circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke={scoreColor}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={revealed ? { strokeDashoffset: offset } : {}}
                  transition={{ duration: 1.8, delay: 0.6, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black tracking-tight" style={{ color: scoreColor }}>{revealed ? score : 0}</span>
                <span className="text-[10px] text-muted-foreground/50">/100</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold tracking-tight mb-2">
                {score >= 70 ? "Strong foundation" : score >= 40 ? "Room to improve" : "Significant gaps identified"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {score >= 70
                  ? "Your infrastructure is performing above average. Joining THE NoDE can still unlock meaningful collective savings."
                  : score >= 40
                  ? "You're paying more than you should across multiple areas. THE NoDE can close these gaps quickly."
                  : "Your infrastructure has significant inefficiencies. There is major upside available through THE NoDE network."}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                <Info size={11} />
                <span>Score calculated against network benchmark of 1,000+ brands</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Recommended next actions */}
        <motion.div
          className="mb-16 p-8 rounded-2xl border border-border/50 bg-secondary/20"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-6">Recommended next steps</p>
          <div className="space-y-4">
            {[
              { step: "01", action: "Join THE NoDE to access network-negotiated payment rates", impact: "High" },
              { step: "02", action: "Connect to collective shipping contracts", impact: "Medium" },
              { step: "03", action: "Consolidate your SaaS stack through the network", impact: "Medium" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-4">
                <span className="text-[10px] tracking-[0.2em] text-muted-foreground/40 mt-0.5">{item.step}</span>
                <p className="text-sm flex-1">{item.action}</p>
                <span className={`text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-full ${
                  item.impact === "High" ? "bg-blue-500/10 text-blue-600" : "bg-secondary text-muted-foreground"
                }`}>{item.impact}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          className="text-center py-14 border-t border-border/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
        >
          <h3 className="text-2xl font-black tracking-tight mb-2">Ready to recover this?</h3>
          <p className="text-muted-foreground text-sm mb-8">Join THE NoDE and start improving your infrastructure immediately.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Onboarding">
              <Button size="lg" className="h-12 rounded-full px-10 text-sm font-semibold group shadow-sm">
                Join THE NoDE <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/Dashboard">
              <Button variant="outline" size="lg" className="h-12 rounded-full px-10 text-sm border-border/60">
                View Dashboard
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}