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

      <div className="relative max-w-4xl mx-auto text-center">
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
          Infrastructure intelligence is free for early operators. An optional recovery layer participates only in verified savings — we earn when you do.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8"
        >
          <Link to="/Pricing">
            <button className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-full font-semibold text-sm bg-foreground text-background hover:opacity-90 transition">
              Go to pricing <ArrowRight className="h-4 w-4" />
            </button>
          </Link>
          <p className="text-[11px] text-muted-foreground/60 mt-3 font-mono tracking-[0.1em]">
            Free intelligence · 25% only on verified recovery
          </p>
        </motion.div>
      </div>
    </section>
  );
}