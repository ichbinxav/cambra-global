import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingDown } from "lucide-react";

const metrics = [
  { label: "Avg. annual savings", value: "€29K" },
  { label: "Network payment rate", value: "1.4%" },
  { label: "Avg. shipping reduction", value: "−18%" },
];

const proof = [
  { saving: "€38K/yr", area: "Payments", desc: "Reduced from 2.9% → 1.4%" },
  { saving: "€24K/yr", area: "Infrastructure", desc: "Hidden costs identified" },
  { saving: "€19K/yr", area: "Shipping", desc: "Repriced in one afternoon" },
];

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-14">
      {/* Fine grid */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Node watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[55vw] font-thin text-foreground/[0.015] select-none pointer-events-none leading-none">
        ✱
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 lg:gap-20 items-center">
          
          {/* Left — headline + CTAs */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 mb-8 px-3.5 py-1.5 rounded-full border border-border/50 bg-background/80 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              <span className="text-[11px] font-medium text-muted-foreground">Powering independent commerce</span>
            </div>

            <h1 className="text-[clamp(2.8rem,8vw,7rem)] font-black tracking-[-0.04em] leading-[0.88] mb-6">
              Stop overpaying<br />
              for your<br />
              infrastructure.
            </h1>

            <p className="text-[clamp(1rem,2vw,1.25rem)] text-muted-foreground leading-relaxed mb-10 max-w-md">
              See exactly how much you can save in 2 minutes — across payments, shipping, and SaaS.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/Analyzer" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-bold shadow-lg gap-2">
                  Run the Analyzer
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/Onboarding" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-medium border-border/60">
                  Join THE NoDE
                </Button>
              </Link>
            </div>

            {/* Trust line */}
            <p className="mt-8 text-[12px] text-muted-foreground/50">
              Brands save <strong className="text-foreground/70">€18,000 – €72,000/year</strong> · No credit card required
            </p>

            {/* Stats row */}
            <div className="mt-10 flex gap-8 flex-wrap">
              {metrics.map(m => (
                <div key={m.label}>
                  <p className="text-2xl font-black tracking-tight">{m.value}</p>
                  <p className="text-[11px] text-muted-foreground/50 mt-0.5">{m.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — live proof card */}
          <div className="hidden lg:block">
            <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden shadow-xl">
              <div className="px-6 py-4 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/60">Live network results</span>
                </div>
                <TrendingDown size={13} className="text-muted-foreground/30" />
              </div>

              <div className="divide-y divide-border/30">
                {proof.map((item, i) => (
                  <div key={i} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{item.area}</p>
                      <p className="text-[11px] text-muted-foreground/50 mt-0.5">{item.desc}</p>
                    </div>
                    <span className="text-lg font-black text-foreground tabular-nums">{item.saving}</span>
                  </div>
                ))}
              </div>

              <div className="px-6 py-5 bg-foreground text-background flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-40 mb-0.5">Total identified</p>
                  <p className="text-3xl font-black tracking-tight">€81K<span className="text-lg font-normal opacity-50">/yr</span></p>
                </div>
                <Link to="/Analyzer">
                  <button className="h-10 px-5 rounded-full bg-background/10 hover:bg-background/20 text-background text-sm font-semibold transition-colors border border-background/20 flex items-center gap-1.5">
                    Analyze mine <ArrowRight size={13} />
                  </button>
                </Link>
              </div>
            </div>

            <p className="text-center text-[11px] text-muted-foreground/30 mt-4">
              Sample — 3 independent brands · 2025
            </p>
          </div>
        </div>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}