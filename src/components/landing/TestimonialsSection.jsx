import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
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
  },
];

export default function TestimonialsSection() {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = () => setIdx((i) => (i + 1) % TESTIMONIALS.length);
  const prev = () => setIdx((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);

  // Auto-rotate every 4.5s, pause briefly on user interaction
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % TESTIMONIALS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [paused]);

  const handleInteraction = (fn) => () => {
    fn();
    setPaused(true);
    setTimeout(() => setPaused(false), 8000); // resume after 8s of inactivity
  };

  const t = TESTIMONIALS[idx];

  return (
    <section ref={ref} className="py-10 md:py-12 px-5 border-t border-border/40 bg-background relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-5 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-mint opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-mint" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">Real findings</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,6vw,4.2rem)] font-black tracking-[-0.045em] leading-[0.92] text-foreground">
            What brands actually <span className="text-saas-gradient">recovered.</span>
          </h2>
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
              className="rounded-2xl border border-border/40 bg-card overflow-hidden"
            >
              <div className="flex flex-col md:flex-row md:items-stretch">
                {/* Quote + author */}
                <div className="flex-1 p-5 md:p-6 min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] uppercase tracking-[0.22em] font-mono text-muted-foreground/50">
                      {t.layer}
                    </span>
                    <span className="h-0.5 w-0.5 rounded-full bg-muted-foreground/30" />
                    <span className="text-[9px] uppercase tracking-[0.22em] font-mono text-muted-foreground/50">
                      {t.company}
                    </span>
                  </div>

                  <blockquote className="text-base md:text-[17px] font-medium leading-[1.35] tracking-tight text-foreground mb-3">
                    "{t.quote}"
                  </blockquote>

                  <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-bold text-foreground/60 shrink-0">
                      {t.initials}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 font-mono">
                      {t.role} · {t.tier}
                    </p>
                  </div>
                </div>

                {/* Metrics — navy card style */}
                <div className="cambra-card flex md:flex-col items-center md:items-end justify-between gap-4 md:gap-3 p-5 md:p-6 md:border-l-0 md:min-w-[220px]">
                  <div className="flex items-baseline gap-1.5 md:order-1">
                    <span className="text-sm font-medium text-white/50 line-through decoration-1">{t.before}</span>
                    <span className="text-white/40 text-xs">→</span>
                    <span className="text-base font-black text-white">{t.after}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 md:order-2">
                    <span className="text-2xl md:text-3xl font-black tracking-tighter text-white tabular-nums leading-none">
                      €{(t.recovery / 1000).toFixed(t.recovery % 1000 === 0 ? 0 : 1)}K
                    </span>
                    <span className="text-[10px] font-mono text-white/50">/ yr</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Nav */}
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={handleInteraction(() => setIdx(i))}
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
                onClick={handleInteraction(prev)}
                aria-label="Previous"
                className="h-11 w-11 rounded-full border border-border/60 bg-background flex items-center justify-center hover:bg-foreground hover:text-background hover:border-foreground transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={handleInteraction(next)}
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