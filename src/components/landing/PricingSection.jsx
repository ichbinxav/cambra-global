import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function PricingSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-16 md:py-20 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="relative max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-border/60 bg-background/80 backdrop-blur-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint" />
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-muted-foreground">
              Access & Recovery
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(2rem,5vw,3.2rem)] font-black tracking-[-0.04em] leading-[1]"
          >
            Aligned with your <span className="text-saas-gradient">margin.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 text-sm md:text-base text-foreground/65 max-w-xl mx-auto leading-relaxed"
          >
            Infrastructure intelligence is free for early operators. An optional recovery layer participates only in verified savings.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {/* Intelligence Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm p-6"
          >
            <div className="text-left">
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted-foreground/70 mb-3">Intelligence</p>
              <p className="text-2xl font-black tracking-tight mb-4">Free</p>
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2.5 text-sm text-foreground/75">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  Infrastructure audit & scoring
                </li>
                <li className="flex items-start gap-2.5 text-sm text-foreground/75">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  Real network benchmarks
                </li>
                <li className="flex items-start gap-2.5 text-sm text-foreground/75">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  Dashboard & reporting
                </li>
                <li className="flex items-start gap-2.5 text-sm text-foreground/75">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-mint shrink-0" />
                  AI recommendations
                </li>
              </ul>
            </div>
          </motion.div>

          {/* Recovery Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-xl border border-white/10 bg-gradient-to-br from-neon-2 to-neon-1 p-6"
            style={{
              background: "linear-gradient(135deg, hsl(222 55% 11%) 0%, hsl(222 60% 8%) 100%)",
              boxShadow: "0 0 30px rgba(31,78,216,0.15), 0 1px 0 hsl(0 0% 100% / 0.06) inset"
            }}
          >
            <div className="text-left text-white">
              <p className="text-xs font-bold tracking-[0.2em] uppercase text-white/55 mb-3">Recovery Model</p>
              <p className="text-2xl font-black tracking-tight mb-4">25% of verified savings</p>
              <ul className="space-y-2.5">
                <li className="flex items-start gap-2.5 text-sm text-white/80">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  Provider negotiation
                </li>
                <li className="flex items-start gap-2.5 text-sm text-white/80">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  Savings verification
                </li>
                <li className="flex items-start gap-2.5 text-sm text-white/80">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  Migration support
                </li>
                <li className="flex items-start gap-2.5 text-sm text-white/80">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cambra-cyan shrink-0" />
                  Only when you win
                </li>
              </ul>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-center"
        >
          <Link to="/Pricing">
            <button className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full font-semibold text-sm bg-foreground text-background hover:opacity-90 transition">
              See full details <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}