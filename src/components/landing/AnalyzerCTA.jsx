import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

export default function AnalyzerCTA() {
  return (
    <section id="analyzer" className="py-32 px-6 bg-secondary/30 border-t border-border/40">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <RevealOnScroll>
              <p className="text-[10px] tracking-[0.35em] uppercase text-muted-foreground mb-5">Free Tool</p>
              <h2 className="text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em] leading-[0.92] mb-6">
                How much are you
                <br />
                <span className="text-foreground/20">overpaying?</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed text-lg mb-8">
                Run the Node Analyzer. In under 3 minutes, discover exactly how much your infrastructure costs you — and how much you could save.
              </p>
              <Link to="/Analyzer">
                <Button size="lg" className="rounded-full px-9 h-12 text-sm tracking-wide group font-medium">
                  Run the Analyzer
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </RevealOnScroll>
          </div>

          <RevealOnScroll delay={0.15} direction="left">
            <div className="p-8 rounded-2xl border border-border bg-card space-y-5">
              {[
                { label: "Payment savings", value: "€8,400/yr" },
                { label: "Shipping optimization", value: "€5,200/yr" },
                { label: "SaaS consolidation", value: "€3,600/yr" },
              ].map((row, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                  <span className="text-sm text-muted-foreground">{row.label}</span>
                  <span className="text-sm font-semibold tabular-nums">{row.value}</span>
                </div>
              ))}
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs tracking-[0.1em] uppercase text-muted-foreground/60">Total potential savings</span>
                <span className="text-2xl font-bold tracking-tight">€17,200<span className="text-sm font-normal text-muted-foreground">/yr</span></span>
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}