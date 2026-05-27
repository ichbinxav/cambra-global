import { TrendingUp, BarChart2, Brain, Clock, Shield, Zap } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const BENEFITS = [
  {
    icon: TrendingUp,
    title: "Recover margin you didn't know you were losing",
    body: "Infrastructure inefficiency is invisible until it's audited. CAMBRA makes the invisible visible — and recoverable.",
    accent: "#635BFF",
  },
  {
    icon: BarChart2,
    title: "Benchmark like elite operators",
    body: "See how your costs compare to similar businesses. Understand the gap. Quantify the opportunity.",
    accent: "#06B6D4",
  },
  {
    icon: Brain,
    title: "AI-native intelligence",
    body: "Not a report. A living intelligence system that explains findings, recommends actions and evolves with your business.",
    accent: "#8B5CF6",
  },
  {
    icon: Zap,
    title: "Results in under 3 minutes",
    body: "Three audit methods. Visual flow, document upload or direct integrations. Fast, frictionless, high-signal.",
    accent: "#F97316",
  },
  {
    icon: Clock,
    title: "Continuous monitoring",
    body: "Infrastructure drift happens. CAMBRA monitors your operational stack and surfaces new inefficiencies as they emerge.",
    accent: "#06B6D4",
  },
  {
    icon: Shield,
    title: "Quantified, not estimated",
    body: "Every finding is benchmarked against real data. Not approximations — specific recovery figures per category.",
    accent: "#635BFF",
  },
];

function BenefitCard({ b, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: (index % 3) * 0.08 }}
      whileHover={{ y: -4 }}
      className="group relative p-6 rounded-2xl border border-border/40 bg-card overflow-hidden"
    >
      <div
        className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl opacity-60"
        style={{ background: `linear-gradient(90deg, ${b.accent}, transparent)` }}
      />
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
        style={{ background: `${b.accent}10`, border: `1px solid ${b.accent}20` }}
      >
        <b.icon size={18} style={{ color: b.accent }} />
      </div>
      <h3 className="text-sm font-bold mb-2 tracking-tight">{b.title}</h3>
      <p className="text-sm text-muted-foreground/65 leading-relaxed">{b.body}</p>
    </motion.div>
  );
}

export default function BenefitsSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });

  return (
    <section className="py-16 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div ref={headRef} className="max-w-2xl mb-14 text-center mx-auto">
          <motion.p
            initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-4"
          >Why CAMBRA</motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4"
          >
            The intelligence layer your business was missing.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }} animate={headInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.25 }}
            className="text-base text-muted-foreground/60 leading-relaxed"
          >
            Most businesses optimize marketing and product obsessively. Almost none audit their operational infrastructure. CAMBRA fixes that.
          </motion.p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
          {BENEFITS.map((b, i) => (
            <BenefitCard key={i} b={b} index={i} />
          ))}
        </div>

        {/* Editorial block */}
        <div className="py-14 border-y border-border/40 text-center">
          <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground/35 mb-5">The CAMBRA thesis</p>
          <h3 className="text-[clamp(1.8rem,4vw,3.2rem)] font-black tracking-[-0.04em] leading-[0.9] max-w-3xl mx-auto">
            "Most businesses optimize everything except the silent costs that compound beneath the surface."
          </h3>
        </div>
      </div>
    </section>
  );
}