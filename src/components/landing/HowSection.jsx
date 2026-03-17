import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const steps = [
  { num: "01", title: "Run the Analyzer", desc: "Input your revenue, channels, and providers. We benchmark every cost against real network data in under 2 minutes.", time: "2 min" },
  { num: "02", title: "See your overspend", desc: "We show you exactly how much you're overpaying — per category, provider, and annually.", time: "instant" },
  { num: "03", title: "Unlock network rates", desc: "Access deals negotiated at collective scale — payment rates, shipping contracts, SaaS group licenses.", time: "1 click" },
  { num: "04", title: "Track your savings", desc: "Monitor improvements over time. Every analysis is saved. Your infrastructure gets smarter each month.", time: "ongoing" },
];

export default function HowSection() {
  return (
    <section id="how" className="py-28 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-16 items-start">

          <RevealOnScroll>
            <div className="lg:sticky lg:top-24">
              <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
                <span className="w-4 h-px bg-border inline-block" /> How it works
              </p>
              <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6">
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
          </RevealOnScroll>

          <div className="space-y-3">
            {steps.map((step, i) => (
              <RevealOnScroll key={i} delay={i * 0.07}>
                <div className="group p-7 rounded-2xl border border-border/50 bg-card/60 hover:bg-card hover:border-border transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40">{step.num}</p>
                    <span className="text-[10px] text-muted-foreground/40 bg-secondary px-2.5 py-1 rounded-full">{step.time}</span>
                  </div>
                  <h3 className="text-lg font-bold tracking-tight mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </RevealOnScroll>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}