import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const steps = [
  {
    num: "01",
    title: "Run the Analyzer",
    desc: "Input your revenue, channels, and providers. We benchmark every cost against real network data in under 2 minutes.",
    time: "2 min",
    why: "Revenue determines negotiation potential",
  },
  {
    num: "02",
    title: "See your overspend",
    desc: "We show you exactly how much you're overpaying — per category, per provider, and annually.",
    time: "Instant",
    why: "Specific numbers, not vague percentages",
  },
  {
    num: "03",
    title: "Unlock network rates",
    desc: "Access deals negotiated at collective scale — payment rates, shipping contracts, SaaS group licenses.",
    time: "1 click",
    why: "Collective leverage = better commercial terms",
  },
  {
    num: "04",
    title: "Track your savings",
    desc: "Monitor improvements over time. Every analysis is saved. Your infrastructure gets smarter each month.",
    time: "Ongoing",
    why: "Savings compound as the network grows",
  },
];

export default function HowSection() {
  return (
    <section id="how" className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 items-start">

          <div className="lg:sticky lg:top-24">
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> How it works
            </p>
            <h2 className="text-[clamp(2rem,4.5vw,3.75rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6">
              From overpaying<br />to optimized<br />in an afternoon.
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed mb-8 max-w-xs">
              THE NoDE is a structured process — not a platform you have to figure out yourself.
            </p>
            <Link to="/Analyzer">
              <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 shadow-sm">
                Start now — free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="group p-7 rounded-2xl border border-border/50 bg-card hover:border-border transition-all">
                <div className="flex items-start justify-between mb-4">
                  <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40">{step.num}</p>
                  <span className="text-[10px] text-muted-foreground/50 bg-secondary px-2.5 py-1 rounded-full font-medium">{step.time}</span>
                </div>
                <h3 className="text-lg font-bold tracking-tight mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{step.desc}</p>
                <p className="text-[11px] text-muted-foreground/40 flex items-center gap-1.5">
                  <span className="w-3 h-px bg-border inline-block" />
                  {step.why}
                </p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}