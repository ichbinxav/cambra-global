import React from "react";

export default function ProblemSection_Public() {
  return (
    <section className="py-10 border-t border-border/40">
      <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
        <div>
          <p className="text-[11px] tracking-[0.28em] uppercase text-muted-foreground/60 font-semibold mb-2">The problem</p>
          <h3 className="text-2xl md:text-3xl font-black tracking-tight mb-2">Operating without scale is expensive</h3>
          <p className="text-foreground/70">Most indie brands overpay across payments, retail TPE, shipping and SaaS. CAMBRA unlocks enterprise terms through collective scale.</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>Payments: +0.6–1.2 pp above benchmark</li>
            <li>Retail TPE: high fees + terminal rentals</li>
            <li>Shipping: 10–25% above collective rates</li>
            <li>SaaS: up to 30% wasted spend</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/Analyzer" className="h-11 px-5 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center justify-center">Run the Analyzer →</a>
            <a href="/Onboarding" className="h-11 px-5 rounded-full border border-foreground text-foreground text-sm font-semibold inline-flex items-center justify-center">Join CAMBRA →</a>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 p-5 bg-card">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="rounded-xl border border-border/50 p-3 text-center">
              <div className="text-[11px] text-muted-foreground/60">Typical fee</div>
              <div className="text-xl font-black">2.4%</div>
              <div className="text-[11px] text-muted-foreground/60">Payments</div>
            </div>
            <div className="rounded-xl border border-border/50 p-3 text-center">
              <div className="text-[11px] text-muted-foreground/60">Retail TPE</div>
              <div className="text-xl font-black">1.9%</div>
              <div className="text-[11px] text-muted-foreground/60">+ rentals</div>
            </div>
            <div className="rounded-xl border border-border/50 p-3 text-center">
              <div className="text-[11px] text-muted-foreground/60">Cost/parcel</div>
              <div className="text-xl font-black">€5.90</div>
              <div className="text-[11px] text-muted-foreground/60">Shipping</div>
            </div>
            <div className="rounded-xl border border-border/50 p-3 text-center">
              <div className="text-[11px] text-muted-foreground/60">SaaS waste</div>
              <div className="text-xl font-black">30%</div>
              <div className="text-[11px] text-muted-foreground/60">Tools</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground/70">Benchmarks vary by revenue tier and geography; the Analyzer adapts targets accordingly.</p>
        </div>
      </div>
    </section>
  );
}