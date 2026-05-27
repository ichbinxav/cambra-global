import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TESTIMONIALS = [
  { 
    quote: "Found €18K in duplicate email tools. Killed one, kept the workflow.",
    recovery: "€18K / yr",
    role: "CFO",
    tier: "DTC skincare · €4M"
  },
  { 
    quote: "Never benchmarked our PSP. Turns out we were 0.6pp above market. Renegotiated.",
    recovery: "€42K / yr",
    role: "Founder",
    tier: "Activewear · €2.1M"
  },
  { 
    quote: "Shipping was €0.40 per order above peer median. Fixed it. No service change.",
    recovery: "€8.9K / yr",
    role: "Head of Ops",
    tier: "Home goods · €1.6M"
  },
];

export default function TestimonialsSection() {
  const ref = useRef(null);
  const [idx, setIdx] = useState(0);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const next = () => setIdx((i) => (i + 1) % TESTIMONIALS.length);
  const prev = () => setIdx((i) => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length);

  return (
    <section className="py-20 px-5 border-t border-border/40 bg-secondary/10">
      <div ref={ref} className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-3 font-mono">
            Real findings
          </p>
          <h2 className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-black tracking-[-0.04em] leading-[0.95] text-saas-gradient">
            What brands found.
          </h2>
          <p className="text-sm text-muted-foreground/60 mt-3 max-w-md">
            Anonymous operators. €1–5M revenue. Real recoveries, real impact.
          </p>
        </div>

        {/* Carousel */}
        <div className="relative">
          <div className="overflow-hidden">
            <motion.div
              animate={{ x: `-${idx * 100}%` }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex"
            >
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="w-full flex-shrink-0 px-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={inView ? { opacity: 1 } : {}}
                    transition={{ duration: 0.5 }}
                    className="p-8 rounded-2xl border border-border/40 bg-background h-full flex flex-col"
                  >
                    <p className="text-base md:text-lg font-semibold text-foreground/90 leading-relaxed flex-1 mb-6">
                      "{t.quote}"
                    </p>
                    
                    <div className="pt-5 border-t border-border/30 space-y-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 font-mono mb-1">
                          Estimated recovery
                        </p>
                        <p className="text-2xl font-black text-saas-gradient tabular-nums">
                          {t.recovery}
                        </p>
                      </div>
                      <div className="pt-2">
                        <p className="text-sm font-semibold text-foreground/70">{t.role}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/40 mt-1">{t.tier}</p>
                      </div>
                    </div>
                  </motion.div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Nav buttons */}
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center gap-2">
              {TESTIMONIALS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === idx ? "w-6 bg-foreground" : "w-2 bg-border"
                  }`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={prev}
                className="h-10 w-10 rounded-full border border-border/60 flex items-center justify-center hover:bg-secondary/50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-foreground/70" />
              </button>
              <button
                onClick={next}
                className="h-10 w-10 rounded-full border border-border/60 flex items-center justify-center hover:bg-secondary/50 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-foreground/70" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}