import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const QUOTES = [
  { quote: "€18k in duplicate SaaS. Gone.",            role: "CFO",          tier: "DTC skincare · €4M" },
  { quote: "Never benchmarked PSP. Now we own it.",    role: "Founder",      tier: "Activewear · €2.1M" },
  { quote: "0.6pp delta. €42K/year. Just sitting there.", role: "Head of Ops",  tier: "Home goods · €1.6M" },
  { quote: "Two redundant tools. Cut one. No one noticed.", role: "COO",          tier: "Coffee brand · €3.2M" },
];

export default function TestimonialsSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-20 px-5 border-t border-border/40 bg-secondary/10">
      <div ref={ref} className="max-w-6xl mx-auto">
        {/* Compact header */}
        <div className="flex items-baseline justify-between mb-10 flex-wrap gap-4">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-2 font-mono">
              Operator findings
            </p>
            <h2 className="font-display text-[clamp(1.6rem,3.5vw,2.6rem)] font-black tracking-[-0.04em] leading-[0.95]">
              Drift, found.
            </h2>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/30">
            n = anonymized · €1–5M tier
          </span>
        </div>

        {/* Dense quote grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUOTES.map((q, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="p-5 border border-border/40 bg-background hover:border-foreground/30 transition-colors flex flex-col h-full"
            >
              <p className="text-sm font-semibold text-foreground/90 leading-snug flex-1 mb-4">
                "{q.quote}"
              </p>
              <div className="pt-3 border-t border-border/30">
                <p className="text-[11px] font-semibold text-foreground/70">{q.role}</p>
                <p className="text-[10px] font-mono text-muted-foreground/40 mt-0.5">{q.tier}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}