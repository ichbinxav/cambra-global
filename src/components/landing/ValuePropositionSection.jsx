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
    <section className="py-12 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={ref} className="max-w-3xl mx-auto text-center lg:text-left">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-[clamp(2rem,5vw,3.4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4"
          >
            Reduce operating costs through collective infrastructure.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base text-muted-foreground leading-relaxed mb-6"
          >
            Most independent brands operate below optimal infrastructure rates — and don’t realize it. CAMBRA aggregates independent brands into a single leverage bloc, identifies where value is being lost, and helps members access better terms.
          </motion.p>
          <div className="space-y-2">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.45, delay: 0.15 + i * 0.05 }}
                className="flex items-start gap-2 text-sm text-foreground/80"
              >
                <CheckCircle2 className="h-4 w-4 text-chart-2 mt-0.5" />
                <span className="font-medium">{b}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}