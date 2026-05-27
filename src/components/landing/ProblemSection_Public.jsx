import React, { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { TrendingDown } from "lucide-react";

const DRAINS = [
  { label: "Payments", marker: "Silent drain", body: "Most businesses pay 2.4–3.2% on transactions. Benchmark: 1.4%. On €2M revenue, that's €20,000 in silent leakage annually.", color: "#EF4444", value: "€20K/yr" },
  { label: "Logistics", marker: "Above market", body: "Without volume leverage, shipping rates are set by individual negotiation. The collective benchmark is 15–22% below single-account rates.", color: "#F97316", value: "15–22%" },
  { label: "SaaS Stack", marker: "Fragmented spend", body: "The average operator runs 6–11 SaaS tools. Benchmarking consistently finds 2–3 redundant or overpriced subscriptions per stack.", color: "#8B5CF6", value: "2–3 tools" },
  { label: "Banking & FX", marker: "Unbenchmarked", body: "Business banking fees, FX spreads and card processing costs are rarely audited. Yet they compound silently across every transaction.", color: "#06B6D4", value: "0.8–1.4%" },
];

export default function ProblemSection_Public() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-16 border-t border-border/40 bg-gradient-to-b from-background via-secondary/10 to-background">
      <div className="max-w-6xl mx-auto px-5">
        {/* Header */}
        <div ref={ref} className="max-w-3xl mx-auto text-center mb-12">
          <motion.p
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground/40 mb-4"
          >The infrastructure tax</motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2rem,5vw,3.8rem)] font-black tracking-[-0.04em] leading-[0.92] mb-5"
          >
            Operational inefficiency compounds faster than inflation.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground/60 leading-relaxed"
          >
            It's not one problem. It's four invisible taxes — each small enough to ignore individually, catastrophic when summed across your entire infrastructure stack.
          </motion.p>
        </div>

        {/* Drain grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {DRAINS.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
              className="group p-5 rounded-2xl border border-border/40 bg-card relative overflow-hidden"
              whileHover={{ y: -3 }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                style={{ background: `linear-gradient(90deg, ${item.color}, transparent)` }}
              />
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="text-sm font-bold">{item.label}</span>
                  <span
                    className="ml-2 text-[9px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: `${item.color}12`, color: item.color }}
                  >
                    {item.marker}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-black" style={{ color: item.color }}>
                  <TrendingDown className="h-3.5 w-3.5" />
                  {item.value}
                </div>
              </div>
              <p className="text-sm text-muted-foreground/65 leading-relaxed">{item.body}</p>
            </motion.div>
          ))}
        </div>

        {/* Bottom card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 }}
          className="rounded-2xl bg-foreground text-background p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="max-w-xl text-center md:text-left">
            <p className="text-[10px] uppercase tracking-[0.22em] opacity-30 mb-2">The CAMBRA finding</p>
            <p className="text-xl md:text-2xl font-bold leading-snug opacity-90">
              Businesses audited by CAMBRA identify an average of <span className="font-black opacity-100">€29,000/year</span> in recoverable infrastructure margin.
            </p>
          </div>
          <a
            href="/Analyzer"
            className="shrink-0 h-12 px-7 rounded-full bg-background text-foreground text-sm font-bold inline-flex items-center gap-2 hover:opacity-90 transition"
          >
            See what you're losing →
          </a>
        </motion.div>
      </div>
    </section>
  );
}