import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Truck, Layers } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";
import NodeLoader from "@/components/shared/NodeLoader";

const breakdownItems = [
  { key: "payment_savings", label: "Payments", desc: "Fee rate optimization", icon: CreditCard },
  { key: "shipping_savings", label: "Shipping", desc: "Carrier consolidation", icon: Truck },
  { key: "saas_savings", label: "SaaS & Tools", desc: "Stack consolidation", icon: Layers },
];

export default function Results() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      base44.entities.AnalyzerResult.filter({ id }).then(results => {
        if (results.length > 0) setResult(results[0]);
        setTimeout(() => {
          setLoading(false);
          setTimeout(() => setRevealed(true), 400);
        }, 2800);
      });
    }
  }, []);

  if (loading) return <NodeLoader text="Analyzing your infrastructure" />;

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No results found.</p>
          <Link to="/Analyzer"><Button variant="outline">Run the Analyzer</Button></Link>
        </div>
      </div>
    );
  }

  const score = result.infra_score || 0;
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 px-6 py-4 flex items-center justify-between bg-background/80 backdrop-blur-xl sticky top-0 z-20">
        <Link to="/" className="text-sm font-bold tracking-tight">THE N✱DE</Link>
        <Link to="/Dashboard">
          <Button variant="outline" size="sm" className="rounded-full text-xs h-8 px-4">Enter Dashboard</Button>
        </Link>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Hero number */}
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <motion.div
            className="text-3xl mb-6 select-none inline-block"
            initial={{ rotate: 0, scale: 0.3, opacity: 0 }}
            animate={{ rotate: 360, scale: 1, opacity: 0.3 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            ✱
          </motion.div>

          <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-4">Your analysis is ready</p>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-[0.92] mb-4">
            You're likely overpaying
          </h1>
          <div className="text-6xl sm:text-7xl font-bold tracking-tight text-foreground mt-2">
            {revealed && (
              <AnimatedCounter value={result.total_savings} prefix="€" suffix="/yr" duration={2.5} />
            )}
            {!revealed && <span className="opacity-0">€0</span>}
          </div>
          <p className="text-sm text-muted-foreground mt-3">per year, based on your current infrastructure</p>
        </motion.div>

        {/* Breakdown */}
        <motion.div
          className="mb-14"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-5">Breakdown</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {breakdownItems.map((item, i) => (
              <motion.div
                key={item.key}
                className="p-6 rounded-2xl border border-border/60 bg-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.5 }}
              >
                <div className="flex items-center gap-2 mb-4">
                  <item.icon size={13} className="text-muted-foreground/60" />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                <div className="text-2xl font-bold tracking-tight mb-1">
                  {revealed && <AnimatedCounter value={result[item.key]} prefix="€" suffix="/yr" duration={2} />}
                  {!revealed && <span className="opacity-0">€0</span>}
                </div>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Infra Score */}
        <motion.div
          className="mb-14 p-8 rounded-2xl border border-border/60 bg-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground mb-6">Infrastructure Score</p>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative w-28 h-28 shrink-0">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
                <motion.circle
                  cx="50" cy="50" r="40" fill="none"
                  stroke="hsl(var(--foreground))"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={revealed ? { strokeDashoffset: offset } : {}}
                  transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold tracking-tight">{revealed ? score : 0}</span>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight mb-2">
                {score >= 70 ? "Good foundation" : score >= 40 ? "Room to improve" : "Significant gaps"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">
                {score >= 70
                  ? "Your infrastructure is performing above average. Joining THE Node can still unlock meaningful savings."
                  : score >= 40
                  ? "You're paying more than you should across multiple areas. THE Node can close these gaps quickly."
                  : "Your infrastructure has significant inefficiencies. There's major upside to unlocking through THE Node."}
              </p>
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          className="text-center py-14 border-t border-border/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          <h3 className="text-2xl font-bold tracking-tight mb-2">Ready to optimize?</h3>
          <p className="text-muted-foreground text-sm mb-8">Join THE Node and start saving immediately.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Onboarding">
              <Button size="lg" className="rounded-full px-10 h-12 text-sm group font-medium">
                Join THE Node <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link to="/Dashboard">
              <Button variant="outline" size="lg" className="rounded-full px-10 h-12 text-sm font-medium border-border/60">
                View Dashboard
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}