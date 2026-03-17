import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, TrendingDown, Zap, BarChart2 } from "lucide-react";

const STEPS = [
  {
    num: "01",
    icon: Search,
    color: "text-blue-600",
    bg: "bg-blue-500/[0.07] border-blue-500/20",
    title: "Run the Analyzer",
    desc: "Input your providers, revenue, and channels. Benchmarked against real network data.",
    time: "2 min",
    stat: "< 2 min",
    statLabel: "to complete",
  },
  {
    num: "02",
    icon: TrendingDown,
    color: "text-orange-500",
    bg: "bg-orange-500/[0.07] border-orange-500/20",
    title: "See exactly where you lose money",
    desc: "Per-category, per-provider overspend shown in euros — not vague percentages.",
    time: "Instant",
    stat: "€29K",
    statLabel: "avg. identified",
  },
  {
    num: "03",
    icon: Zap,
    color: "text-green-600",
    bg: "bg-green-500/[0.07] border-green-500/20",
    title: "Unlock network rates",
    desc: "Access deals at collective scale — payment rates, shipping contracts, SaaS licenses.",
    time: "1 click",
    stat: "1.4%",
    statLabel: "payment rate",
  },
  {
    num: "04",
    icon: BarChart2,
    color: "text-purple-500",
    bg: "bg-purple-500/[0.07] border-purple-500/20",
    title: "Track savings over time",
    desc: "Your infrastructure score improves. Every month, the network gets stronger.",
    time: "Ongoing",
    stat: "−18%",
    statLabel: "avg. shipping saved",
  },
];

export default function HowSection() {
  return (
    <section id="how" className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-16 items-start">
          <div className="lg:sticky lg:top-24">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border" /> How it works
            </p>
            <h2 className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5">
              From overpaying<br />to optimized<br />in an afternoon.
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-xs">
              A structured process — not a platform you have to figure out yourself.
            </p>

            {/* Flow diagram */}
            <div className="p-4 rounded-xl border border-border/50 bg-card mb-8">
              <div className="flex items-center gap-2">
                {["Connect", "Analyze", "Optimize"].map((label, i) => (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <div className={`flex-1 py-2 px-3 rounded-lg text-center text-[11px] font-bold ${
                      i === 0 ? "bg-blue-500/[0.08] text-blue-600 border border-blue-500/20" :
                      i === 1 ? "bg-orange-500/[0.08] text-orange-500 border border-orange-500/20" :
                      "bg-green-500/[0.08] text-green-600 border border-green-500/20"
                    }`}>{label}</div>
                    {i < 2 && <ArrowRight size={11} className="text-muted-foreground/30 shrink-0" />}
                  </div>
                ))}
              </div>
            </div>

            <Link to="/Analyzer">
              <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 shadow-sm">
                Start now — free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <div key={i} className="group p-6 rounded-2xl border border-border/50 bg-card hover:border-border transition-all">
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${step.bg}`}>
                    <step.icon size={15} className={step.color} />
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/30">{step.num}</span>
                      <span className="text-[10px] font-semibold bg-secondary px-2.5 py-0.5 rounded-full text-muted-foreground/60">{step.time}</span>
                    </div>
                    <h3 className="text-base font-bold tracking-tight mb-1">{step.title}</h3>
                    <p className="text-sm text-muted-foreground/70 leading-relaxed">{step.desc}</p>
                  </div>
                  {/* Stat */}
                  <div className="text-right shrink-0">
                    <p className={`text-xl font-black tabular-nums ${step.color}`}>{step.stat}</p>
                    <p className="text-[10px] text-muted-foreground/40">{step.statLabel}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}