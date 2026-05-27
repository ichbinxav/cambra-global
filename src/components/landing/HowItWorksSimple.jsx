import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Search, GitCompareArrows, Banknote } from "lucide-react";

/**
 * HowItWorksSimple — three plain-English steps explaining what CAMBRA does.
 * Sits right under the hero so first-time visitors instantly get it.
 */
const STEPS = [
  {
    n: "01",
    icon: Search,
    title: "We scan your stack",
    body: "Connect your tools or upload an invoice. We read your real costs across 8 layers.",
  },
  {
    n: "02",
    icon: GitCompareArrows,
    title: "We compare to peers",
    body: "We benchmark each cost against brands your size, in your country. You see the gap.",
  },
  {
    n: "03",
    icon: Banknote,
    title: "You recover margin",
    body: "We renegotiate or switch what's overpriced. You only pay if we save you money.",
  },
];

export default function HowItWorksSimple() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-20 px-5 border-t border-border/40 bg-background">
      <div className="max-w-6xl mx-auto">
        <div className="mb-12 max-w-2xl">
          <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-3 font-mono">
            How it works
          </p>
          <h2 className="font-display text-[clamp(1.8rem,4vw,2.8rem)] font-black tracking-[-0.04em] leading-[0.95]">
            <span className="text-saas-gradient">Three steps.</span> No procurement contracts.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s, i) => {
            const colors = ["text-saas-gradient", "text-chart-2", "text-chart-1"];
            const bgColors = ["bg-blue-500/[0.08]", "bg-cyan-500/[0.08]", "bg-blue-500/[0.08]"];
            const borderColors = ["border-blue-500/30", "border-cyan-500/30", "border-blue-500/30"];
            return (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 16 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`p-8 rounded-2xl border ${borderColors[i]} ${bgColors[i]} hover:border-foreground/40 transition-all group relative overflow-hidden`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.02] to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-6">
                    <span className={`text-6xl font-black ${colors[i]} opacity-20 leading-none`}>{s.n}</span>
                    <div className={`h-16 w-16 rounded-xl ${bgColors[i]} border ${borderColors[i]} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <s.icon className={`h-7 w-7 ${colors[i]}`} strokeWidth={1.5} />
                    </div>
                  </div>
                  <h3 className="text-xl font-bold tracking-tight mb-3">{s.title}</h3>
                  <p className="text-sm text-muted-foreground/75 leading-relaxed">{s.body}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Quick chips row */}
        <div className="mt-10 flex flex-wrap items-center gap-2 justify-center">
          <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/40 mr-1">Includes</span>
          {["No subscription", "No card required", "3-min audit", "Success fee only", "Cancel anytime"].map((chip) => (
            <span
              key={chip}
              className="px-3 py-1.5 text-[11px] font-medium rounded-full border border-border/50 bg-card text-foreground/70"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}