import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { AlertCircle } from "lucide-react";

const CATEGORIES = [
  { name: "Payments", status: "Inefficient", pct: 78, color: "#EF4444", sub: "2.8% avg vs 1.4% benchmark" },
  { name: "Logistics", status: "Warning", pct: 55, color: "#F97316", sub: "€0.80–1.20/parcel above market" },
  { name: "SaaS Stack", status: "Fragmented", pct: 42, color: "#8B5CF6", sub: "Avg 3.2 redundant tools detected" },
  { name: "Banking", status: "Inefficient", pct: 61, color: "#EF4444", sub: "Non-benchmarked FX & fees" },
];

export default function ValuePropositionSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-16 px-5 border-t border-border/40 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none dot-grid opacity-[0.15]" />
      <div className="max-w-6xl mx-auto relative z-10">
        <div ref={ref} className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 items-center">
          {/* LEFT */}
          <div>
            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground/50 mb-4"
            >Infrastructure Health</motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
              className="text-[clamp(2rem,4.5vw,3.4rem)] font-black tracking-[-0.04em] leading-[0.92] mb-5"
            >
              Most businesses are quietly leaking margin through infrastructure inefficiency.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 10 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="text-base text-muted-foreground/70 leading-relaxed mb-8 max-w-lg"
            >
              The problem isn't a single overpayment. It's the silent accumulation of sub-optimal rates, fragmented stacks and unbenchmarked costs — compounding quarter after quarter.
            </motion.p>
            <motion.a
              href="/Analyzer"
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-2 h-12 px-6 rounded-full text-sm font-bold bg-foreground text-background hover:opacity-90 transition"
            >
              <AlertCircle className="h-4 w-4" />
              Audit your infrastructure
            </motion.a>
          </div>

          {/* RIGHT — Category bars */}
          <div className="space-y-3">
            {CATEGORIES.map((cat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
                className="p-4 rounded-xl border border-border/40 bg-card/80"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{cat.name}</span>
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${cat.color}15`, color: cat.color }}
                    >
                      {cat.status}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground/50">{cat.pct}/100</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: cat.color }}
                    initial={{ width: 0 }}
                    animate={inView ? { width: `${cat.pct}%` } : { width: 0 }}
                    transition={{ duration: 1.0, delay: 0.3 + i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/40 mt-1.5">{cat.sub}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}