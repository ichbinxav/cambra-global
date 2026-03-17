import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Truck, Package } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

const breakdown = [
  { key: "payment_savings", label: "Payments", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-500/8 border-blue-500/20" },
  { key: "shipping_savings", label: "Shipping", icon: Truck, color: "text-green-600", bg: "bg-green-500/8 border-green-500/20" },
  { key: "saas_savings", label: "SaaS & Tools", icon: Package, color: "text-orange-500", bg: "bg-orange-500/8 border-orange-500/20" },
];

export default function Results() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) {
      base44.entities.AnalyzerResult.filter({ id }).then(res => {
        if (res.length > 0) setResult(res[0]);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-border border-t-foreground animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Analyzing your infrastructure...</p>
      </div>
    </div>
  );

  if (!result) return (
    <div className="min-h-screen flex items-center justify-center bg-background px-5">
      <div className="text-center">
        <p className="text-muted-foreground mb-4 text-sm">No results found.</p>
        <Link to="/Analyzer"><Button variant="outline" className="rounded-full px-6 text-sm h-11">Run the Analyzer</Button></Link>
      </div>
    </div>
  );

  const score = result.infra_score || 0;
  const scoreColor = score >= 70 ? "#22c55e" : score >= 40 ? "#f97316" : "#3b82f6";

  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-border/40 px-5 py-3 flex items-center justify-between bg-background/95 backdrop-blur-2xl">
        <Link to="/" className="text-sm font-black tracking-tight">THE NoDE</Link>
        <div className="flex items-center gap-2">
          <Link to="/Reports">
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground rounded-full px-3">History</Button>
          </Link>
          <Link to="/Dashboard">
            <Button size="sm" className="h-8 rounded-full text-xs px-4 font-semibold">Dashboard →</Button>
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-5 py-12 pb-24">

        {/* TIER 1 — Hero savings number */}
        <div className="text-center mb-12 pb-12 border-b border-border/40">
          <p className="text-[11px] tracking-[0.35em] uppercase text-muted-foreground/50 mb-4">Your analysis is ready</p>
          <p className="text-base text-muted-foreground mb-2">You are overpaying by an estimated</p>
          <div className="text-[clamp(4rem,14vw,9rem)] font-black tracking-[-0.05em] leading-none text-foreground">
            <AnimatedCounter value={result.total_savings} prefix="€" duration={2} />
          </div>
          <p className="text-muted-foreground text-base mt-3">per year, based on your current infrastructure</p>
        </div>

        {/* TIER 2 — Top 3 categories */}
        <div className="mb-10">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5">Where it comes from</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {breakdown.map((item) => (
              <div key={item.key} className={`p-6 rounded-2xl border ${item.bg}`}>
                <div className="flex items-center gap-2 mb-4">
                  <item.icon size={13} className={item.color} />
                  <span className="text-xs font-semibold">{item.label}</span>
                </div>
                <div className={`text-2xl font-black tracking-tight ${item.color}`}>
                  <AnimatedCounter value={result[item.key]} prefix="€" suffix="/yr" duration={1.8} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TIER 3 — Infrastructure score */}
        <div className="mb-10 p-7 rounded-2xl border border-border/50 bg-card/60">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-6">Infrastructure score</p>
          <div className="flex flex-col sm:flex-row items-center gap-8">
            <div className="relative w-28 h-28 shrink-0">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
                <circle
                  cx="60" cy="60" r="50" fill="none"
                  stroke={scoreColor} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={2 * Math.PI * 50 * (1 - score / 100)}
                  style={{ transition: "stroke-dashoffset 1.5s ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-black" style={{ color: scoreColor }}>{score}</span>
                <span className="text-[10px] text-muted-foreground/50">/100</span>
              </div>
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold mb-2">
                {score >= 70 ? "Strong foundation" : score >= 40 ? "Room to improve" : "Significant gaps identified"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {score >= 70
                  ? "Above average infrastructure. THE NoDE can still unlock meaningful savings through collective deals."
                  : score >= 40
                  ? "You're paying above benchmark rates in multiple areas. THE NoDE closes these gaps quickly."
                  : "Major infrastructure inefficiencies detected. Significant annual savings available through THE NoDE network."}
              </p>
            </div>
          </div>
        </div>

        {/* Next steps */}
        <div className="mb-12 p-7 rounded-2xl border border-border/50 bg-secondary/20">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5">Next steps</p>
          <div className="space-y-4">
            {[
              { step: "01", action: "Join THE NoDE to access network-negotiated payment rates", impact: "High" },
              { step: "02", action: "Activate collective shipping contracts via the Deals section", impact: "High" },
              { step: "03", action: "Audit and consolidate your SaaS stack through network group licenses", impact: "Medium" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-[10px] tracking-[0.2em] text-muted-foreground/40 w-6 shrink-0">{item.step}</span>
                <p className="text-sm flex-1">{item.action}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${item.impact === "High" ? "bg-blue-500/10 text-blue-600 font-semibold" : "bg-secondary text-muted-foreground"}`}>{item.impact}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center pb-8">
          <h3 className="text-2xl font-black tracking-tight mb-2">Ready to recover this?</h3>
          <p className="text-muted-foreground text-sm mb-8">Join THE NoDE and start improving your infrastructure now.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/Onboarding" className="w-full sm:w-auto">
              <Button size="lg" className="w-full h-13 rounded-full px-10 text-sm font-bold gap-2 shadow-sm">
                Join THE NoDE <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/Dashboard" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full h-13 rounded-full px-10 text-sm border-border/60">
                View Dashboard
              </Button>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}