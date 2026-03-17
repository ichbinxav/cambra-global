import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, TrendingDown, CreditCard, Truck, Package } from "lucide-react";

const SAVINGS = [
  { label: "Payments", value: "€38K", sub: "−52% fee rate", color: "text-blue-600", bg: "bg-blue-500/[0.07] border-blue-500/20", icon: CreditCard },
  { label: "Shipping", value: "€19K", sub: "−18% carrier cost", color: "text-green-600", bg: "bg-green-500/[0.07] border-green-500/20", icon: Truck },
  { label: "SaaS", value: "€24K", sub: "−30% stack waste", color: "text-orange-500", bg: "bg-orange-500/[0.07] border-orange-500/20", icon: Package },
];

const STATS = [
  { value: "€29K", label: "Avg. savings/yr" },
  { value: "1.4%", label: "Network payment rate" },
  { value: "−18%", label: "Shipping reduction" },
  { value: "1,000+", label: "Member brands" },
];

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-14">

      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.022] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />

      {/* Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[55vw] font-thin text-foreground/[0.014] select-none pointer-events-none leading-none">✱</div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-14 lg:gap-20 items-center">

          {/* LEFT */}
          <div>
            {/* Pill */}
            <div className="inline-flex items-center gap-2 mb-7 px-3.5 py-1.5 rounded-full border border-border/50 bg-background/80">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[11px] font-medium text-muted-foreground">Used by independent brands across Europe</span>
            </div>

            {/* Headline */}
            <h1 className="text-[clamp(3rem,8.5vw,7.5rem)] font-black tracking-[-0.05em] leading-[0.86] mb-6">
              Unlock your<br />
              margin.<br />
              Scale smarter.
            </h1>

            <p className="text-[clamp(1rem,2vw,1.2rem)] text-muted-foreground leading-relaxed mb-10 max-w-[420px]">
              The infrastructure layer behind independent brands. Benchmark, optimize, and reduce your costs across payments, shipping, and tools.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              <Link to="/Analyzer" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-bold shadow-lg gap-2">
                  Run the Analyzer <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/Onboarding" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 rounded-full px-10 text-base font-medium border-border/60">
                  Join THE NoDE
                </Button>
              </Link>
            </div>

            <p className="text-[11px] text-muted-foreground/45 mb-10">
              Brands unlock <strong className="text-foreground/60">€18,000 – €72,000/year</strong> · Based on real network benchmarks
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {STATS.map(s => (
                <div key={s.label} className="p-4 rounded-xl border border-border/40 bg-card/50">
                  <p className="text-2xl font-black tracking-tight">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — visual savings dashboard */}
          <div className="hidden lg:flex flex-col gap-3">
            {/* Header */}
            <div className="rounded-2xl border border-border/60 bg-card/90 backdrop-blur-sm overflow-hidden shadow-xl">
              <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/50">Live savings analysis</span>
                </div>
                <TrendingDown size={12} className="text-muted-foreground/30" />
              </div>

              {/* Category cards */}
              <div className="p-4 space-y-2">
                {SAVINGS.map((item, i) => (
                  <div key={i} className={`flex items-center gap-3 p-3.5 rounded-xl border ${item.bg}`}>
                    <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center shrink-0`}>
                      <item.icon size={13} className={item.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground/50">{item.sub}</p>
                    </div>
                    <p className={`text-lg font-black tabular-nums ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="mx-4 mb-4 p-4 rounded-xl bg-foreground text-background flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-35 mb-0.5">Total margin unlocked</p>
                  <p className="text-3xl font-black tracking-tight">€81K<span className="text-base font-normal opacity-40">/yr</span></p>
                </div>
                <Link to="/Analyzer">
                  <button className="h-9 px-4 rounded-full bg-background/10 hover:bg-background/20 text-background text-xs font-bold transition-colors border border-background/15 flex items-center gap-1.5">
                    Analyze mine <ArrowRight size={11} />
                  </button>
                </Link>
              </div>
            </div>

            {/* Infra score mini card */}
            <div className="rounded-xl border border-border/50 bg-card p-4 flex items-center gap-4">
              <div className="relative w-12 h-12 shrink-0">
                <svg className="w-12 h-12 -rotate-90" viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 18} strokeDashoffset={2 * Math.PI * 18 * 0.43} />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-black text-orange-500">57</span>
                </div>
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold">Infrastructure Score: <span className="text-orange-500">57/100</span></p>
                <p className="text-[10px] text-muted-foreground/50">Under-optimized — potential score: 84/100</p>
              </div>
            </div>

            <p className="text-center text-[10px] text-muted-foreground/25">Sample analysis · Independent brand · 2025</p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}