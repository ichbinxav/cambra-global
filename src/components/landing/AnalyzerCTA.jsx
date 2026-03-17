import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import RevealOnScroll from "@/components/shared/RevealOnScroll";
import { motion } from "framer-motion";

const rows = [
  { label: "Payment fee benchmark", current: "2.9%", network: "1.4%", saving: "€8,400/yr" },
  { label: "Shipping optimization", current: "Base rate", network: "−18%", saving: "€5,200/yr" },
  { label: "SaaS consolidation", current: "€2,500/mo", network: "€1,750/mo", saving: "€9,000/yr" },
];

export default function AnalyzerCTA() {
  return (
    <section id="analyzer" className="py-36 px-6 border-t border-border/40 bg-secondary/20">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-20 items-center">

          {/* Left */}
          <div>
            <RevealOnScroll>
              <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-7">
                <span className="w-4 h-px bg-border inline-block" /> Free Tool
              </span>
              <h2 className="text-[clamp(2.4rem,5.5vw,5rem)] font-black tracking-[-0.04em] leading-[0.88] mb-8">
                How much are
                <br />
                <span className="text-foreground/20">you overpaying?</span>
              </h2>
              <p className="text-muted-foreground leading-relaxed text-[1.05rem] mb-10">
                Run the NoDE Analyzer. In under 3 minutes, discover exactly how much your infrastructure costs you — and how much you could recover.
              </p>
              <Link to="/Analyzer">
                <Button size="lg" className="h-12 rounded-full px-9 text-sm font-semibold group shadow-sm">
                  Run the Analyzer
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </RevealOnScroll>
          </div>

          {/* Right: data table */}
          <RevealOnScroll delay={0.15} direction="left">
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
                <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/60">Sample analysis</span>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse-slow" />
              </div>
              <div className="divide-y divide-border/40">
                {rows.map((row, i) => (
                  <motion.div
                    key={i}
                    className="px-6 py-4 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center text-sm"
                    initial={{ opacity: 0, x: 12 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.08 }}
                  >
                    <span className="text-muted-foreground text-xs">{row.label}</span>
                    <span className="tabular-nums text-muted-foreground/60 text-xs">{row.current}</span>
                    <span className="tabular-nums text-node-blue text-xs font-medium">{row.network}</span>
                    <span className="tabular-nums font-semibold text-xs">{row.saving}</span>
                  </motion.div>
                ))}
              </div>
              <div className="px-6 py-5 border-t border-border/40 bg-secondary/30 flex items-center justify-between">
                <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground/60">Total potential</span>
                <span className="text-2xl font-black tracking-tight">€22,600<span className="text-sm font-normal text-muted-foreground">/yr</span></span>
              </div>
            </div>
          </RevealOnScroll>
        </div>
      </div>
    </section>
  );
}