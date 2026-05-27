import { motion, useInView } from "framer-motion";
import { useRef } from "react";

/**
 * MeetTheFounder — editorial founder letter section.
 * Photo on the left, signed letter on the right.
 */
export default function MeetTheFounder() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section
      ref={ref}
      className="py-20 md:py-28 px-5 border-t border-border/40 bg-background relative overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />

      <div className="max-w-6xl mx-auto relative">
        <div className="mb-10 md:mb-14">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-3 font-mono">
            Meet the founder
          </p>
          <h2 className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-black tracking-[-0.04em] leading-[0.95] max-w-2xl">
            A letter from <span className="text-saas-gradient">the founder</span>.
          </h2>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1fr)_1.2fr] gap-8 md:gap-14 items-start">
          {/* Photo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-border/40 bg-secondary/50">
              <img
                src="https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/f1e34eda8_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg"
                alt="Founder portrait"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <div>
                <p className="text-sm font-bold tracking-tight text-foreground">
                  Founder · CAMBRA
                </p>
                <p className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">
                  Paris · 2026
                </p>
              </div>
            </div>
          </motion.div>

          {/* Letter */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="space-y-5 text-[15px] md:text-base leading-[1.7] text-foreground/80 font-light">
              <p>
                I started CAMBRA because I watched too many great independent brands
                quietly bleed margin to infrastructure they never had time to question.
              </p>
              <p>
                Payment fees drifted up. SaaS stacked. Shipping rates stayed locked
                while peer brands negotiated better. Nobody was watching the layers
                that compound — the boring ones, the ones that decide whether you
                survive the next year.
              </p>
              <p>
                CAMBRA exists to do that work for you. Continuously. Quietly. Against
                the brands that look exactly like yours. We only win when you recover
                margin — that's the whole deal.
              </p>
              <p>
                If you build something independent, we're on your side.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-border/40">
              <p
                className="text-2xl md:text-3xl text-foreground"
                style={{ fontFamily: "'Caveat', 'Brush Script MT', cursive" }}
              >
                — Founder
              </p>
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/50 mt-2">
                Founder & CEO · CAMBRA
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}