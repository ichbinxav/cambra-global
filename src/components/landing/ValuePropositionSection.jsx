import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { CheckCircle2 } from "lucide-react";

const BENEFITS = [
  "See where your brand is overpaying",
  "Access better rates through collective scale",
  "Improve margins across payments, shipping and SaaS",
  "Pay only when real savings are created",
];

export default function ValuePropositionSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-12 px-5 border-t border-border/40 relative overflow-hidden">
      {/* background pattern */}
      <div className="absolute inset-0 pointer-events-none dot-grid opacity-[0.25]" />
      <div className="max-w-6xl mx-auto relative z-10">
        <div ref={ref} className="max-w-4xl mx-auto">
          <motion.h2
            initial={false}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-[clamp(2rem,5vw,3.4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4"
          >
            Reduce operating costs through collective infrastructure.
          </motion.h2>
          <motion.p
            initial={false}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base text-muted-foreground leading-relaxed mb-6"
          >
            Most independent brands operate below optimal infrastructure rates — and don’t realize it. CAMBRA aggregates independent brands into a single leverage bloc, identifies where value is being lost, and helps members access better terms.
          </motion.p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-5">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.45, delay: 0.15 + i * 0.05 }}
                className="flex items-center gap-2 p-3 rounded-xl border border-border/40 bg-secondary/40 hover:bg-secondary/60 transition-colors"
              >
                <CheckCircle2 className="h-4 w-4 text-chart-2" />
                <span className="text-sm font-medium">{b}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}