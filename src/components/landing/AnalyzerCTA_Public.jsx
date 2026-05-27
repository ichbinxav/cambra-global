import React, { useRef, useState, useEffect } from "react";
import { ArrowRight, Zap } from "lucide-react";
import { motion, useInView, animate } from "framer-motion";

const CATEGORIES = ["Payments", "Logistics", "SaaS Stack", "Banking", "Telecom", "Insurance"];

function LiveBenchmarkBar({ label, value, benchmark, color, inView, delay }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] font-medium text-foreground/70">{label}</span>
        <span className="text-[10px] text-muted-foreground/40">Benchmark: {benchmark}</span>
      </div>
      <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
        <motion.div
          className="absolute left-0 top-0 h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={inView ? { width: `${value}%` } : { width: 0 }}
          transition={{ duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* Benchmark marker */}
        <div className="absolute top-0 bottom-0 w-px bg-foreground/20" style={{ left: `${benchmark.replace('%', '') * 1.5}%` }} />
      </div>
    </div>
  );
}

export default function AnalyzerCTA_Public() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [activeCategory, setActiveCategory] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCategory(prev => (prev + 1) % CATEGORIES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section ref={ref} className="py-16 border-t border-border/40 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(800px 400px at 80% 50%, rgba(99,91,255,0.04), transparent)" }} />
      <div className="max-w-6xl mx-auto px-5 grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-10 items-center">
        {/* LEFT */}
        <div>
          <motion.p
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            className="text-[10px] tracking-[0.28em] uppercase text-muted-foreground/40 mb-4"
          >Infrastructure Audit</motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65 }}
            className="text-[clamp(2rem,4.5vw,3.5rem)] font-black tracking-[-0.04em] leading-[0.92] mb-5"
          >
            Benchmark your entire infrastructure in under 3 minutes.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.15 }}
            className="text-base text-muted-foreground/65 mb-7 max-w-xl leading-relaxed"
          >
            Interactive flow, document upload, or direct integrations. Benchmarked against real operational data.
          </motion.p>

          {/* Scanning animation */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.2 }}
            className="mb-7 p-3.5 rounded-xl border border-border/40 bg-card/60 flex items-center gap-3 max-w-xs"
          >
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Zap className="h-3.5 w-3.5 text-background" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] text-muted-foreground/40 mb-0.5">Currently benchmarking</div>
              <motion.div
                key={activeCategory}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs font-bold"
              >
                {CATEGORIES[activeCategory]}
              </motion.div>
            </div>
            <motion.div
              className="ml-auto flex gap-0.5"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-foreground/40" />
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <a href="/Analyzer" className="h-12 px-7 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center justify-center gap-2 hover:opacity-90 transition">
              Run Infrastructure Audit <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/Analyzer?mode=upload" className="h-12 px-6 rounded-full border border-border/60 text-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 hover:border-foreground/40 transition">
              Upload documents
            </a>
          </motion.div>
        </div>

        {/* RIGHT — live benchmark */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-sm overflow-hidden shadow-xl"
        >
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-green-500"
                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              />
              <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/40">Live benchmark · Sample brand</span>
            </div>
            <span className="text-[9px] text-muted-foreground/25">€1.8M/yr revenue</span>
          </div>
          <div className="p-4 space-y-4">
            <LiveBenchmarkBar label="Payments (online)" value={72} benchmark="1.4%" color="#EF4444" inView={inView} delay={0.3} />
            <LiveBenchmarkBar label="Logistics" value={58} benchmark="€5.80" color="#F97316" inView={inView} delay={0.45} />
            <LiveBenchmarkBar label="SaaS Stack" value={65} benchmark="€12K/yr" color="#8B5CF6" inView={inView} delay={0.6} />
            <LiveBenchmarkBar label="Banking & FX" value={48} benchmark="0.3%" color="#06B6D4" inView={inView} delay={0.75} />
          </div>
          <div className="mx-4 mb-4 p-3.5 rounded-xl bg-foreground text-background flex items-center justify-between">
            <div>
              <div className="text-[9px] opacity-35 uppercase tracking-[0.18em] mb-0.5">Estimated margin leakage</div>
              <div className="text-xl font-black">€18,400<span className="text-sm opacity-40 font-normal">/yr</span></div>
            </div>
            <a href="/Analyzer" className="h-8 px-3 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold border border-white/15 flex items-center gap-1">
              Audit <ArrowRight size={9} />
            </a>
          </div>
          <p className="text-center text-[9px] text-muted-foreground/25 pb-3">Sample analysis · Estimated figures</p>
        </motion.div>
      </div>
    </section>
  );
}