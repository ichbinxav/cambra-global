import { Link } from "react-router-dom";
import { Search, Database, Brain, ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const LAYERS = [
  {
    icon: Search,
    label: "Audit",
    desc: "Full infrastructure mapping. Every cost layer, every provider, every inefficiency surfaced and benchmarked.",
    accent: "#635BFF",
    stat: "< 3 min",
    statLabel: "to complete",
  },
  {
    icon: Database,
    label: "Benchmark",
    desc: "Your costs compared against real operational data from comparable businesses. You see exactly where you stand.",
    accent: "#06B6D4",
    stat: "94%",
    statLabel: "accuracy",
  },
  {
    icon: Brain,
    label: "Intelligence",
    desc: "AI-powered recommendations. Specific, actionable, quantified. Not suggestions — strategic intelligence.",
    accent: "#8B5CF6",
    stat: "€29K",
    statLabel: "avg. recoverable",
  },
];

export default function ThreeLayersSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });

  return (
    <section className="py-16 px-5 border-t border-border/40 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(900px 400px at 50% 50%, rgba(99,91,255,0.035), transparent)" }} />
      <div className="max-w-6xl mx-auto relative z-10">
        <div ref={headRef} className="mb-12 text-center">
          <motion.p
            initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-4"
          >How CAMBRA works</motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.2rem,5vw,3.8rem)] font-black tracking-[-0.04em] leading-[0.92] mb-4"
          >
            Audit. Benchmark. Act.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.25 }}
            className="text-base text-muted-foreground/60 max-w-xl mx-auto"
          >
            Three layers of infrastructure intelligence that compound into strategic clarity.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {LAYERS.map((layer, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, delay: 0.15 + i * 0.1 }}
              className="group p-6 rounded-2xl border border-border/40 bg-card overflow-hidden relative"
              whileHover={{ y: -4 }}
            >
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `radial-gradient(350px 250px at 50% -20%, ${layer.accent}08, transparent)` }}
              />
              <div className="relative z-10">
                <div className="flex items-start justify-between mb-5">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: `${layer.accent}12`, border: `1px solid ${layer.accent}25` }}
                  >
                    <layer.icon className="h-5 w-5" style={{ color: layer.accent }} />
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-black" style={{ color: layer.accent }}>{layer.stat}</div>
                    <div className="text-[9px] text-muted-foreground/35">{layer.statLabel}</div>
                  </div>
                </div>
                <h3 className="text-lg font-black mb-2">{layer.label}</h3>
                <p className="text-sm text-muted-foreground/65 leading-relaxed">{layer.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom hero block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={headInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5 }}
          className="rounded-2xl bg-foreground text-background p-8 lg:p-10 flex flex-col lg:flex-row items-center justify-between gap-8"
        >
          <div className="max-w-xl text-center lg:text-left">
            <p className="text-[10px] uppercase tracking-[0.22em] opacity-30 mb-3">The CAMBRA intelligence layer</p>
            <h3 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-black tracking-[-0.04em] leading-[0.9] mb-3">
              Infrastructure intelligence.<br />Not just a dashboard.
            </h3>
            <p className="text-background/50 text-sm leading-relaxed">
              CAMBRA doesn't just show you numbers. It maps your operational reality, benchmarks it against comparable businesses, and delivers specific intelligence about where margin is being lost and how to recover it.
            </p>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            <Link to="/Analyzer">
              <button className="h-12 px-7 rounded-full bg-background text-foreground text-sm font-bold inline-flex items-center gap-2 hover:opacity-90 transition w-full justify-center">
                Run Infrastructure Audit <ArrowRight size={14} />
              </button>
            </Link>
            <Link to="/Dashboard">
              <button className="h-12 px-7 rounded-full border border-background/20 text-background text-sm font-semibold inline-flex items-center gap-2 hover:bg-background/10 transition w-full justify-center">
                View the dashboard
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}