import React from "react";
import { ArrowRight } from "lucide-react";

export default function AnalyzerCTA_Public() {
  return (
    <section className="py-10 border-t border-border/40">
      <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-8 items-center">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground/60 font-semibold mb-2">Cost Analyzer</p>
          <h3 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
            Benchmark your infrastructure costs in 2 minutes
          </h3>
          <p className="text-foreground/70 max-w-xl mb-4">
            Upload a recent statement or enter a few numbers to see where you're overpaying across payments, shipping and SaaS — and what the network can unlock for your brand.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href="/Analyzer" className="h-12 px-6 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center justify-center gap-2">
              Run the Analyzer <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/Onboarding" className="h-12 px-6 rounded-full border border-foreground text-foreground text-sm font-semibold inline-flex items-center justify-center gap-2">
              Join the Founding Brands <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-3">
            <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground/60">Sample analysis</div>
            <div className="rounded-full border border-border/60 bg-secondary/70 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">Estimated</div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="rounded-xl border border-border/50 p-3">
                <div className="text-[11px] text-muted-foreground/60">Payments</div>
                <div className="text-lg font-black text-cambra-lilac">€38K/yr</div>
                <div className="text-[11px] text-muted-foreground/60">-52% fee rate</div>
              </div>
              <div className="rounded-xl border border-border/50 p-3">
                <div className="text-[11px] text-muted-foreground/60">Shipping</div>
                <div className="text-lg font-black text-cambra-mint">€19K/yr</div>
                <div className="text-[11px] text-muted-foreground/60">-18% carrier cost</div>
              </div>
              <div className="rounded-xl border border-border/50 p-3">
                <div className="text-[11px] text-muted-foreground/60">Retail TPE</div>
                <div className="text-lg font-black text-chart-1">€12K/yr</div>
                <div className="text-[11px] text-muted-foreground/60">-35% terminal costs</div>
              </div>
              <div className="rounded-xl border border-border/50 p-3">
                <div className="text-[11px] text-muted-foreground/60">SaaS</div>
                <div className="text-lg font-black text-cambra-plum">€24K/yr</div>
                <div className="text-[11px] text-muted-foreground/60">-30% stack waste</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-foreground text-background p-4 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase opacity-50 mb-0.5">Potential savings unlocked</div>
                <div className="text-2xl font-black">€8.4K<span className="text-sm opacity-60 font-normal">/yr</span></div>
              </div>
              <a href="/Analyzer" className="h-9 px-4 rounded-full bg-background/10 hover:bg-background/20 text-background text-xs font-bold border border-background/15 inline-flex items-center gap-1.5">
                Analyze <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}