import React from "react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-inter">
      {/* Standalone static header (no auth, no SDK) */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <a href="/" aria-label="CAMBRA" className="text-sm font-black tracking-[0.14em]">CAMBRA</a>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#how" className="text-muted-foreground hover:text-foreground transition-colors">How it works</a>
            <a href="/Analyzer" className="text-muted-foreground hover:text-foreground transition-colors">Analyzer</a>
            <a href="/Onboarding" className="text-muted-foreground hover:text-foreground transition-colors">Join</a>
          </nav>
        </div>
      </header>

      {/* Hero — purely static content */}
      <main className="pt-20">
        <section className="py-10">
          <div className="max-w-6xl mx-auto px-5">
            <h1 className="text-[clamp(2.2rem,6.5vw,4rem)] leading-[1.05] font-black tracking-[-0.04em] mb-3">
              Independent brands. <span className="gradient-text">Collective leverage.</span>
            </h1>
            <p className="text-[clamp(1rem,2.2vw,1.2rem)] text-foreground/70 max-w-2xl">
              CAMBRA helps independent commerce brands improve operating margins through better infrastructure
              terms across payments, shipping and SaaS — using collective scale.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li className="flex items-start gap-2"><span className="text-cambra-mint">✓</span> Access rates you can't unlock alone</li>
              <li className="flex items-start gap-2"><span className="text-cambra-mint">✓</span> Instantly see where you're overpaying</li>
              <li className="flex items-start gap-2"><span className="text-cambra-mint">✓</span> Reduce infrastructure costs across your stack</li>
            </ul>
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <a href="/Onboarding" className="h-12 px-6 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center justify-center">Join the Founding Brands →</a>
              <a href="/Analyzer" className="h-12 px-6 rounded-full border border-foreground text-foreground text-sm font-semibold inline-flex items-center justify-center">Run the Cost Analyzer →</a>
            </div>
          </div>
        </section>

        {/* Credibility */}
        <section className="py-6 border-t border-border/40">
          <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/60 p-4 text-sm">
              <strong>Built for independent commerce</strong>
              <div className="text-muted-foreground mt-1.5">Fashion, beauty, wellness and lifestyle — online & retail.</div>
            </div>
            <div className="rounded-xl border border-border/60 p-4 text-sm">
              <strong>Focused on real operating costs</strong>
              <div className="text-muted-foreground mt-1.5">Start with payments, shipping and SaaS.</div>
            </div>
            <div className="rounded-xl border border-border/60 p-4 text-sm">
              <strong>Collective leverage, individual benefit</strong>
              <div className="text-muted-foreground mt-1.5">Access structural terms beyond solo negotiation.</div>
            </div>
          </div>
        </section>

        {/* Value proposition */}
        <section className="py-8 border-t border-border/40">
          <div className="max-w-6xl mx-auto px-5">
            <h2 className="text-2xl font-black tracking-tight mb-2">Lower operating costs via collective infrastructure</h2>
            <p className="text-foreground/70 max-w-2xl">We analyze your current stack, surface where money leaks, and activate better terms with minimal change management.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="rounded-xl border border-border/60 p-4 text-sm">Spot overpayment quickly</div>
              <div className="rounded-xl border border-border/60 p-4 text-sm">Instant access to better rates</div>
              <div className="rounded-xl border border-border/60 p-4 text-sm">Pay only from realized savings</div>
              <div className="rounded-xl border border-border/60 p-4 text-sm">Improve margins without more sales</div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="py-8 border-t border-border/40">
          <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border/60 p-4 text-sm"><strong>1) Analyze</strong><div className="text-muted-foreground mt-1.5">Upload files or connect tools to benchmark.</div></div>
            <div className="rounded-xl border border-border/60 p-4 text-sm"><strong>2) Activate</strong><div className="text-muted-foreground mt-1.5">Unlock structural terms with providers.</div></div>
            <div className="rounded-xl border border-border/60 p-4 text-sm"><strong>3) Save</strong><div className="text-muted-foreground mt-1.5">Track verified savings monthly.</div></div>
          </div>
        </section>
      </main>

      <footer className="py-8 border-t border-border/40 text-sm text-muted-foreground">
        <div className="max-w-6xl mx-auto px-5 flex items-center justify-between gap-3 flex-wrap">
          <div>© CAMBRA — Infrastructure for independent brands</div>
          <div className="flex items-center gap-4">
            <a href="/Privacy" className="hover:text-foreground">Privacy</a>
            <a href="/Terms" className="hover:text-foreground">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}