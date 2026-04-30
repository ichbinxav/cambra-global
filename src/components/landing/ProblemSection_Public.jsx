import React from "react";

export default function ProblemSection_Public() {
  return (
    <section className="py-12 border-t border-border/40 bg-gradient-to-b from-background to-secondary/30">
      <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-8 lg:gap-10 items-start">
        <div className="lg:sticky lg:top-24">
          <p className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground/60 font-semibold mb-3">The problem</p>
          <h3 className="text-3xl md:text-5xl font-black tracking-[-0.04em] leading-[0.92] mb-4">Operating without scale is expensive</h3>
          <p className="text-lg text-foreground/70 leading-relaxed max-w-xl">Most indie brands overpay across payments, retail TPE, shipping and SaaS. CAMBRA unlocks enterprise terms through collective scale.</p>

          <div className="mt-6 space-y-3">
            {[
              "Payments: +0.6–1.2 pp above benchmark",
              "Retail TPE: high fees + terminal rentals",
              "Shipping: 10–25% above collective rates",
              "SaaS: up to 30% wasted spend",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/70 px-4 py-3 shadow-sm">
                <div className="h-2.5 w-2.5 rounded-full bg-neon-6 shrink-0" />
                <p className="text-sm md:text-[15px] font-medium text-foreground/90">{item}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/Analyzer" className="h-12 px-6 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center justify-center shadow-sm">Run the Analyzer →</a>
            <a href="/Onboarding" className="h-12 px-6 rounded-full border border-foreground text-foreground text-sm font-semibold inline-flex items-center justify-center bg-background/80 backdrop-blur-sm">Join CAMBRA →</a>
          </div>
        </div>

        <div className="rounded-[2rem] border border-border/60 bg-card/80 backdrop-blur-sm p-4 sm:p-5 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.18)]">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-neon-6/15 bg-neon-6/5 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">Without collective leverage</p>
              <p className="text-sm font-semibold text-foreground">Typical cost profile for independent brands</p>
            </div>
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-2xl bg-background border border-border/60 text-neon-6 text-lg font-black">!</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl border border-border/50 bg-background p-4 text-center shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50">Typical fee</div>
              <div className="mt-3 text-3xl font-black text-neon-6">3.1%</div>
              <div className="mt-1 text-[12px] text-muted-foreground/70">Payments</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background p-4 text-center shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50">Retail TPE</div>
              <div className="mt-3 text-3xl font-black text-neon-5">2.5%</div>
              <div className="mt-1 text-[12px] text-muted-foreground/70">+ rentals</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background p-4 text-center shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50">Cost / parcel</div>
              <div className="mt-3 text-3xl font-black text-neon-7">€7.60</div>
              <div className="mt-1 text-[12px] text-muted-foreground/70">Shipping</div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-background p-4 text-center shadow-sm">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50">SaaS waste</div>
              <div className="mt-3 text-3xl font-black text-neon-6">30%</div>
              <div className="mt-1 text-[12px] text-muted-foreground/70">Tools</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-foreground text-background px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-background/40">Why it matters</p>
            <p className="mt-2 text-base font-semibold leading-snug">Small inefficiencies compound into major margin loss across the whole stack.</p>
          </div>

          <p className="mt-4 text-xs text-muted-foreground/70">Benchmarks vary by revenue tier and geography; the Analyzer adapts targets accordingly.</p>
        </div>
      </div>
    </section>
  );
}