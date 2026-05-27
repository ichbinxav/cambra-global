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

  const next = () => setIdx((i) => (i + 1) % TESTIMONIALS.length);
  const prev = () => setIdx((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);

  const t = TESTIMONIALS[idx];

  return (
    <section ref={ref} className="py-10 md:py-12 px-5 border-t border-border/40 bg-background relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-2 font-mono">
            Real findings
          </p>
          <h2 className="font-display text-[clamp(1.5rem,3.5vw,2.4rem)] font-black tracking-[-0.04em] leading-[0.95] text-foreground">
            What brands actually recovered.
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
              <div className="grid md:grid-cols-[1.4fr_1fr]">
                {/* LEFT — Quote */}
                <div className="p-6 md:p-7">
                  {/* Layer tag */}
                  <p className="text-[9px] uppercase tracking-[0.22em] font-mono text-muted-foreground/50 mb-4">
                    {t.layer} optimization
                  </p>

                  {/* Quote text */}
                  <blockquote className="text-base md:text-lg font-medium leading-[1.35] tracking-tight text-foreground mb-6">
                    "{t.quote}"
                  </blockquote>

                  {/* Author */}
                  <div className="flex items-center gap-2.5 pt-5 border-t border-border/30">
                    <div className="h-9 w-9 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-bold text-foreground/60 shrink-0">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{t.role}</p>
                      <p className="text-[10px] text-muted-foreground/50 font-mono">
                        {t.company}
                      </p>
                    </div>
                  </div>
                </div>

                {/* RIGHT — Impact metrics */}
                <div className="p-6 md:p-7 bg-secondary/40 border-l border-border/40 flex flex-col justify-between">
                  {/* Before / After */}
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.22em] font-mono text-muted-foreground/50 mb-3">
                      The change
                    </p>
                    <div className="flex items-end gap-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-widest font-mono text-muted-foreground/40 mb-1">Before</p>
                        <p className="text-sm font-medium text-foreground/50 line-through decoration-1">{t.before}</p>
                      </div>
                      <div className="text-muted-foreground/40 text-xs">→</div>
                      <div>
                        <p className="text-[8px] uppercase tracking-widest font-mono text-muted-foreground/40 mb-1">After</p>
                        <p className="text-lg font-black text-foreground">{t.after}</p>
                      </div>
                    </div>
                  </div>

                  {/* Recovery amount */}
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.22em] font-mono text-muted-foreground/50 mb-2">
                      Recovery / year
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl md:text-4xl font-black tracking-tighter text-saas-gradient tabular-nums">
                        €{(t.recovery / 1000).toFixed(t.recovery % 1000 === 0 ? 0 : 1)}K
                      </span>
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