import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Quote, TrendingDown, ArrowRight } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "Found €18K in duplicate email tools. Killed one, kept the workflow.",
    layer: "SaaS",
    before: "2 ESPs",
    after: "1 ESP",
    recovery: 18000,
    role: "CFO",
    company: "DTC skincare",
    tier: "€4M revenue",
    initials: "MR",
    accent: "from-cyan-500 to-blue-500",
    accentText: "text-cyan-600",
    accentBg: "bg-cyan-500/10",
  },
  {
    quote: "Never benchmarked our PSP. Turns out we were 0.6pp above market. Renegotiated.",
    layer: "Payments",
    before: "2.9%",
    after: "2.3%",
    recovery: 42000,
    role: "Founder",
    company: "Activewear brand",
    tier: "€2.1M revenue",
    initials: "JL",
    accent: "from-blue-500 to-violet-500",
    accentText: "text-blue-600",
    accentBg: "bg-blue-500/10",
  },
  {
    quote: "Shipping was €0.40 per order above peer median. Fixed it. No service change.",
    layer: "Shipping",
    before: "€7.20/order",
    after: "€6.80/order",
    recovery: 8900,
    role: "Head of Ops",
    company: "Home goods",
    tier: "€1.6M revenue",
    initials: "SK",
    accent: "from-violet-500 to-pink-500",
    accentText: "text-violet-600",
    accentBg: "bg-violet-500/10",
  },
];

export default function TestimonialsSection() {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);

  const next = () => setIdx((i) => (i + 1) % TESTIMONIALS.length);
  const prev = () => setIdx((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);

  const t = TESTIMONIALS[idx];

  return (
    <section ref={ref} className="py-16 md:py-20 px-5 border-t border-border/40 bg-gradient-to-b from-secondary/10 to-background relative overflow-hidden">
      {/* Ambient glows */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-500/[0.04] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-cyan-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <div className="mb-10 md:mb-12 flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-3 font-mono">
              Real findings · Anonymized
            </p>
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.2rem)] font-black tracking-[-0.04em] leading-[0.95]">
              <span className="text-saas-gradient">What brands</span><br />
              actually recovered.
            </h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-wider">
              Verified savings
            </span>
          </div>
        </div>

        {/* Main card */}
        <div className="relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-3xl border border-border/50 bg-card overflow-hidden shadow-2xl shadow-foreground/[0.04]"
            >
              <div className="grid md:grid-cols-[1.3fr_1fr]">
                {/* LEFT — Quote */}
                <div className="p-8 md:p-10 lg:p-12 relative">
                  {/* Category badge */}
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${t.accentBg} mb-8`}>
                    <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${t.accent}`} />
                    <span className={`text-[10px] font-mono font-bold ${t.accentText} uppercase tracking-[0.18em]`}>
                      {t.layer} layer
                    </span>
                  </div>

                  {/* Quote icon */}
                  <Quote className={`h-8 w-8 ${t.accentText} opacity-30 mb-4`} strokeWidth={1.5} />

                  {/* Quote text */}
                  <blockquote className="text-xl md:text-2xl lg:text-[1.65rem] font-bold leading-[1.3] tracking-tight text-foreground mb-8">
                    "{t.quote}"
                  </blockquote>

                  {/* Author */}
                  <div className="flex items-center gap-3 pt-6 border-t border-border/40">
                    <div className={`h-11 w-11 rounded-full bg-gradient-to-br ${t.accent} flex items-center justify-center text-white text-sm font-black shrink-0`}>
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{t.role}</p>
                      <p className="text-xs text-muted-foreground/60 font-mono">
                        {t.company} · {t.tier}
                      </p>
                    </div>
                  </div>
                </div>

                {/* RIGHT — Impact metrics */}
                <div className={`p-8 md:p-10 lg:p-12 bg-gradient-to-br ${t.accent} relative overflow-hidden flex flex-col justify-between`}>
                  {/* Grid pattern overlay */}
                  <div
                    className="absolute inset-0 opacity-10"
                    style={{
                      backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                    }}
                  />

                  <div className="relative">
                    {/* Before / After */}
                    <p className="text-[10px] uppercase tracking-[0.22em] font-mono text-white/60 mb-4">
                      The change
                    </p>
                    <div className="flex items-center gap-3 mb-8">
                      <div>
                        <p className="text-[10px] font-mono text-white/50 uppercase mb-1">Before</p>
                        <p className="text-lg font-bold text-white/70 line-through decoration-2">{t.before}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-white/70 mx-1" />
                      <div>
                        <p className="text-[10px] font-mono text-white/50 uppercase mb-1">After</p>
                        <p className="text-lg font-black text-white">{t.after}</p>
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingDown className="h-3.5 w-3.5 text-white/80" strokeWidth={2.5} />
                      <p className="text-[10px] uppercase tracking-[0.22em] font-mono text-white/80">
                        Estimated recovery
                      </p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl md:text-6xl font-black tracking-tighter text-white tabular-nums leading-none">
                        €{(t.recovery / 1000).toFixed(t.recovery % 1000 === 0 ? 0 : 1)}K
                      </span>
                      <span className="text-sm font-mono text-white/70">/ yr</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Nav */}
          <div className="flex items-center justify-between mt-8">
            <div className="flex items-center gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Testimonial ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${
                    i === idx ? "w-8 bg-foreground" : "w-2 bg-border hover:bg-foreground/40"
                  }`}
                />
              ))}
              <span className="ml-3 text-[10px] font-mono text-muted-foreground/40 tabular-nums">
                {String(idx + 1).padStart(2, "0")} / {String(TESTIMONIALS.length).padStart(2, "0")}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={prev}
                aria-label="Previous"
                className="h-11 w-11 rounded-full border border-border/60 bg-background flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={next}
                aria-label="Next"
                className="h-11 w-11 rounded-full border border-border/60 bg-background flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}