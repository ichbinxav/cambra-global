import { motion, AnimatePresence } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Quote, TrendingDown, ArrowRight } from "lucide-react";

const TESTIMONIALS = [
  {
    quote: "€18K back in the bank — same team, same workflow, one less subscription. Feels great.",
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
    quote: "Renegotiated our PSP in a week. 0.6pp shaved off — pure margin we never knew we had.",
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
    quote: "Shipping costs quietly fixed. Customers never noticed — our P&L definitely did.",
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
    <section ref={ref} className="py-12 md:py-16 px-5 border-t border-border/40 bg-background relative overflow-hidden">
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
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl border border-white/10 overflow-hidden relative"
              style={{
                boxShadow: "0 30px 80px -28px rgba(0,0,0,0.45), 0 8px 28px -14px rgba(31,78,216,0.18)"
              }}
            >
              <div className="flex flex-col md:flex-row md:items-stretch">
                {/* Quote + author — NAVY GRADIENT (impact + sofisticado) */}
                <div
                  className="flex-1 p-6 md:p-8 min-w-0 relative overflow-hidden"
                  style={{
                    background:
                      "radial-gradient(120% 80% at 0% 0%, rgba(31,78,216,0.22) 0%, transparent 55%), radial-gradient(100% 100% at 100% 100%, rgba(44,167,193,0.16) 0%, transparent 60%), linear-gradient(180deg, hsl(222 60% 7%) 0%, hsl(222 65% 4%) 100%)",
                  }}
                >
                  {/* Tech grid overlay */}
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.5]"
                    style={{
                      backgroundImage:
                        "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
                      backgroundSize: "44px 44px",
                      maskImage: "radial-gradient(ellipse 90% 90% at 30% 0%, #000 30%, transparent 75%)",
                      WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 30% 0%, #000 30%, transparent 75%)",
                    }}
                  />
                  {/* Floating cyan glow */}
                  <motion.div
                    className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full blur-[80px]"
                    style={{ background: "radial-gradient(closest-side, rgba(44,167,193,0.35), transparent)" }}
                    animate={{ opacity: [0.4, 0.7, 0.4], scale: [1, 1.1, 1] }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                  />

                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-5">
                      <Quote className="h-3 w-3 text-cambra-cyan" strokeWidth={2.5} />
                      <span className="text-[9px] uppercase tracking-[0.22em] font-mono text-white/45">
                        {t.layer} · {t.company}
                      </span>
                    </div>

                    <blockquote className="text-lg md:text-xl font-semibold leading-[1.35] tracking-[-0.015em] text-white mb-6">
                      <span
                        style={{
                          background:
                            "linear-gradient(135deg, #ffffff 0%, #E8F4F6 60%, #B8D8E0 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        "{t.quote}"
                      </span>
                    </blockquote>

                    <div className="flex items-center gap-2.5 pt-4 border-t border-white/10">
                      <div className="h-7 w-7 rounded-full bg-white/[0.08] border border-white/15 flex items-center justify-center text-[10px] font-bold text-white/80 shrink-0">
                        {t.initials}
                      </div>
                      <p className="text-[11px] text-white/55 font-mono">
                        {t.role} · {t.tier}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Metrics — LIGHT GRADIENT (clarito sofisticado) */}
                <div
                  className="flex flex-col items-stretch justify-between gap-4 p-6 md:p-8 md:min-w-[300px] relative overflow-hidden"
                  style={{
                    background:
                      "radial-gradient(120% 80% at 100% 0%, rgba(44,167,193,0.10) 0%, transparent 60%), radial-gradient(100% 100% at 0% 100%, rgba(31,78,216,0.06) 0%, transparent 60%), linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(210 40% 98%) 100%)",
                    borderLeft: "1px solid hsl(var(--border) / 0.5)",
                  }}
                >
                  {/* Subtle dot grid */}
                  <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

                  <div className="relative z-10 space-y-5">
                    {/* Before */}
                    <div>
                      <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-muted-foreground/55 mb-1.5">Before</div>
                      <div className="text-xl font-black text-foreground/35 line-through decoration-foreground/20 tabular-nums tracking-tight">{t.before}</div>
                    </div>

                    {/* Divider with arrow */}
                    <div className="flex items-center">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" />
                      <div className="h-7 w-7 rounded-full bg-foreground flex items-center justify-center mx-2 shadow-sm">
                        <ArrowRight className="h-3 w-3 text-background" strokeWidth={2.5} />
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-transparent" />
                    </div>

                    {/* After */}
                    <div>
                      <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-cambra-blue mb-1.5">After</div>
                      <div
                        className="text-3xl font-black tabular-nums tracking-[-0.025em] leading-none"
                        style={{
                          background: "linear-gradient(135deg, hsl(var(--cambra-navy)) 0%, hsl(var(--cambra-blue)) 60%, hsl(var(--cambra-cyan)) 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                        }}
                      >
                        {t.after}
                      </div>
                    </div>
                  </div>

                  {/* Recovery */}
                  <div className="relative z-10 pt-5 border-t border-border/50">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <TrendingDown className="h-3 w-3 text-cambra-cyan rotate-180" strokeWidth={2.5} />
                      <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-muted-foreground/55">Annual savings</div>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span
                        className="text-4xl font-black tracking-[-0.035em] tabular-nums leading-none"
                        style={{
                          background: "linear-gradient(135deg, hsl(var(--cambra-blue)) 0%, hsl(var(--cambra-cyan)) 100%)",
                          WebkitBackgroundClip: "text",
                          WebkitTextFillColor: "transparent",
                          backgroundClip: "text",
                          filter: "drop-shadow(0 0 16px rgba(44,167,193,0.25))",
                        }}
                      >
                        €{(t.recovery / 1000).toFixed(t.recovery % 1000 === 0 ? 0 : 1)}K
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/50">/year</span>
                    </div>
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