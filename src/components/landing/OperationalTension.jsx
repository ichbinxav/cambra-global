import { motion, useInView } from "framer-motion";
import { useRef } from "react";

/**
 * OperationalTension — economic tension framing.
 *
 * Replaces the wordy CredibilitySection + ThreeLayersSection with a single
 * sharp, dense, asymmetric block that creates economic tension before showing
 * the iconic map. Dense, no fluff, Palantir-like.
 */

const FACTS = [
  { value: "78%", label: "of brands have never benchmarked their PSP" },
  { value: "0.6pp", label: "median PSP drift detected at €1–5M tier" },
  { value: "2.3×", label: "more SaaS tools than peers on average" },
  { value: "6%/yr", label: "rate at which infrastructure drift compounds" },
];

export default function OperationalTension() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-24 md:py-28 border-y border-border/40 bg-background relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-center">
          {/* LEFT — economic tension copy */}
          <div>
            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-5 font-mono"
            >
              Economic premise
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.92] mb-6"
            >
              Most operational cost<br />
              is never audited.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-base text-foreground/55 leading-relaxed max-w-md"
            >
              You measure CAC. You measure margin. You measure conversion.
              <br /><br />
              The cost layer beneath your business — PSP, shipping, SaaS, banking, FX, insurance — drifts silently. No one watches it.
            </motion.p>
          </div>

          {/* RIGHT — dense fact stack */}
          <div className="space-y-3">
            {FACTS.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.15 + i * 0.08 }}
                className="flex items-baseline gap-5 p-4 border-l-2 border-foreground/10 hover:border-foreground/40 transition-colors"
              >
                <div className="text-[clamp(1.6rem,3vw,2.4rem)] font-black tracking-tight tabular-nums shrink-0 w-24">
                  {f.value}
                </div>
                <div className="text-sm text-muted-foreground/70 leading-snug">
                  {f.label}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}