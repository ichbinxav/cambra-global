import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, CreditCard, Truck, Package } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const rows = [
  { icon: CreditCard, label: "Payment fees", current: "2.9%", network: "1.4%", saving: "€8,400/yr", color: "text-blue-600" },
  { icon: Truck, label: "Shipping rates", current: "Base retail", network: "−18%", saving: "€5,200/yr", color: "text-green-600" },
  { icon: Package, label: "SaaS stack", current: "€2,500/mo", network: "€1,750/mo", saving: "€9,000/yr", color: "text-orange-500" },
];

export default function AnalyzerCTA() {
  return (
    <section className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/60 mb-5 flex items-center gap-2">
              <span className="w-4 h-px bg-border inline-block" /> Infrastructure Analyzer
            </p>
            <h2 className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-6">
              Your potential<br />savings — in 2 minutes.
            </h2>
            <p className="text-muted-foreground leading-relaxed text-base mb-8 max-w-sm">
              The Analyzer benchmarks your payments, shipping, and tools against real network data. Identify hidden margin and unlock it through collective rates.
            </p>
            <Link to="/Analyzer">
              <Button size="lg" className="h-14 rounded-full px-9 text-base font-bold gap-2 shadow-sm">
                Run the Analyzer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <p className="mt-4 text-[11px] text-muted-foreground/40">No commitment · Instant benchmark · Real network data</p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
              <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/60">Sample analysis — €500K brand</span>
              <div className="w-2 h-2 rounded-full bg-green-500" />
            </div>

            <div className="divide-y divide-border/40">
              {rows.map((row, i) => (
                <div key={i} className="px-6 py-4 flex items-center gap-4">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <row.icon size={13} className={row.color} />
                  </div>
                  <span className="text-sm flex-1 font-medium">{row.label}</span>
                  <span className="tabular-nums text-muted-foreground/50 text-xs w-16 text-right">{row.current}</span>
                  <span className={`tabular-nums text-xs font-semibold w-12 text-right ${row.color}`}>{row.network}</span>
                  <span className="tabular-nums font-black text-sm w-20 text-right">{row.saving}</span>
                </div>
              ))}
            </div>

            <div className="px-6 py-5 border-t border-border/40 bg-foreground text-background flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 mb-0.5">Margin unlocked / year</p>
                <span className="text-2xl font-black tracking-tight">€22,600<span className="text-base font-normal opacity-50">/yr</span></span>
              </div>
              <Link to="/Analyzer">
                <button className="h-9 px-4 rounded-full bg-background/10 hover:bg-background/20 border border-background/20 text-background text-xs font-semibold transition-colors flex items-center gap-1.5">
                  Access my report <ArrowRight size={12} />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}