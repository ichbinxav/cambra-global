import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import AccessModelCards from "@/components/pricing/AccessModelCards";

export default function PricingSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 px-5 border-t border-border/40 bg-background overflow-hidden"
    >
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/3 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.15]" />
        <div className="absolute -bottom-32 right-1/4 w-[32rem] h-[32rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.12]" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        <div className="mb-12 md:mb-16 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-2 mb-6 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">
              Economic Alignment
            </span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(2.4rem,6vw,4.2rem)] font-black tracking-[-0.045em] leading-[0.92]"
          >
            How CAMBRA <br className="hidden sm:inline" />
            <span className="text-saas-gradient">works.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed"
          >
            Free infrastructure intelligence for every operator. An optional recovery layer that participates only in verified savings.
          </motion.p>
        </div>

        <AccessModelCards />
      </div>
    </section>
  );
}