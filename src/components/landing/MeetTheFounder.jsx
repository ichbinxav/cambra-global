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
                After years working inside global companies, I realized something strange:
              </p>
              <p className="text-foreground font-medium">
                Independent brands were building incredible businesses; yet still operating without the infrastructure, leverage, and conditions usually reserved for much larger companies.
              </p>
              <p>
                Too many founders were negotiating alone.
                Overpaying silently.
                Solving the same operational problems over and over again.
              </p>
              <p>
                Payments. Shipping. Software. Operations…
                Everyone rebuilding the same infrastructure from scratch.
              </p>
              <p>
                So I started CAMBRA.
              </p>
              <p>
                Not as another tool. Not as an agency.
                But as infrastructure for independent commerce.
              </p>
              <p>
                We're still early and always building.
                But our path is becoming very clear.
              </p>
              <p>
                Join us.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-border/40">
              <p
                className="text-2xl md:text-3xl text-foreground"
                style={{ fontFamily: "'Caveat', 'Brush Script MT', cursive" }}
              >
                — Xavier M. Contero
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