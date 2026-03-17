import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Truck, Package } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";

const rows = [
  { icon: CreditCard, label: "Payment fees", current: "2.9%", network: "1.4%", saving: "€8,400/yr" },
  { icon: Truck, label: "Shipping rates", current: "Base retail", network: "−18%", saving: "€5,200/yr" },
  { icon: Package, label: "SaaS stack", current: "€2,500/mo", network: "€1,750/mo", saving: "€9,000/yr" },
];

export default function AnalyzerCTA() {
  return (
    <section className="py-28 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          <RevealOnScroll>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> Free tool
            </p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6">
              How much are<br />you overpaying?
            </h2>
            <p className="text-muted-foreground leading-relaxed text-base mb-8 max-w-sm">
              The Analyzer benchmarks your payments, shipping, and tools against real network data. Takes 2 minutes.
            </p>
            <Link to="/Analyzer">
              <Button size="lg" className="h-13 rounded-full px-9 text-sm font-bold gap-2 shadow-sm">
                Run the Analyzer — it's free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </RevealOnScroll>

          <RevealOnScroll delay={0.1} direction="left">
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
                <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/60">Sample analysis — €500K brand</span>
                <div className="w-2 h-2 rounded-full bg-green-500" />
              </div>
              <div className="divide-y divide-border/40">
                {rows.map((row, i) => (
                  <div key={i} className="px-6 py-4 flex items-center gap-4">
                    <row.icon size={14} className="text-muted-foreground/40 shrink-0" />
                    <span className="text-sm text-muted-foreground flex-1">{row.label}</span>
                    <span className="tabular-nums text-muted-foreground/50 text-xs w-16 text-right">{row.current}</span>
                    <span className="tabular-nums text-blue-600 text-xs font-medium w-12 text-right">{row.network}</span>
                    <span className="tabular-nums font-bold text-sm w-20 text-right">{row.saving}</span>
                  </div>
                ))}
              </div>
              <div className="px-6 py-5 border-t border-border/40 bg-secondary/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground/60">Total annual savings</span>
                <span className="text-2xl font-black tracking-tight">€22,600<span className="text-sm font-normal text-muted-foreground">/yr</span></span>
              </div>
            </div>
          </RevealOnScroll>

        </div>
      </div>
    </section>
  );
}