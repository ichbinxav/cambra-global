import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, TrendingDown, Zap, BarChart2 } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const STEPS = [
  {
    num: "01", icon: Search, color: "text-blue-600",
    bg: "bg-blue-500/[0.07] border-blue-500/20",
    title: "Run the Analyzer",
    desc: "Input your providers, revenue, and channels. Benchmarked against real network data.",
    time: "2 min", stat: "< 2 min", statLabel: "to complete",
  },
  {
    num: "02", icon: TrendingDown, color: "text-orange-500",
    bg: "bg-orange-500/[0.07] border-orange-500/20",
    title: "See exactly where you lose money",
    desc: "Per-category, per-provider overspend shown in euros — not vague percentages.",
    time: "Instant", stat: "€29K", statLabel: "avg. identified",
  },
  {
    num: "03", icon: Zap, color: "text-green-600",
    bg: "bg-green-500/[0.07] border-green-500/20",
    title: "Unlock network rates",
    desc: "Access deals at collective scale — payment rates, shipping contracts, SaaS licenses.",
    time: "1 click", stat: "1.4%", statLabel: "payment rate",
  },
  {
    num: "04", icon: BarChart2, color: "text-purple-500",
    bg: "bg-purple-500/[0.07] border-purple-500/20",
    title: "Track savings over time",
    desc: "Your infrastructure score improves. Every month, the network gets stronger.",
    time: "Ongoing", stat: "−18%", statLabel: "avg. shipping saved",
  },
];

export default function HowSection() {
  const leftRef = useRef(null);
  const leftInView = useInView(leftRef, { once: true, margin: "-80px" });

  return (
    <section id="how" className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-16 items-start">
          <div ref={leftRef} className="lg:sticky lg:top-24">
            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={leftInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
              className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2"
            >
              <span className="w-4 h-px bg-border" /> How it works
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 40 }} animate={leftInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5"
            >
              From overpaying<br />to optimized<br />in an afternoon.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={leftInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-xs"
            >
              A structured process — not a platform you have to figure out yourself.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={leftInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="p-4 rounded-xl border border-border/50 bg-card mb-8"
            >
              <div className="flex items-center gap-2">
                {["Connect", "Analyze", "Optimize"].map((label, i) => (
                  <div key={label} className="flex items-center gap-2 flex-1">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }} animate={leftInView ? { opacity: 1, scale: 1 } : {}}
                      transition={{ delay: 0.4 + i * 0.12 }}
                      className={`flex-1 py-2 px-3 rounded-lg text-center text-[11px] font-bold ${
                        i === 0 ? "bg-blue-500/[0.08] text-blue-600 border border-blue-500/20" :
                        i === 1 ? "bg-orange-500/[0.08] text-orange-500 border border-orange-500/20" :
                        "bg-green-500/[0.08] text-green-600 border border-green-500/20"
                      }`}
                    >{label}</motion.div>
                    {i < 2 && <ArrowRight size={11} className="text-muted-foreground/30 shrink-0" />}
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={leftInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.55 }}
            >
              <Link to="/Analyzer">
                <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                  <Button className="h-12 rounded-full px-8 text-sm font-bold gap-2 shadow-sm">
                    Start now — free <ArrowRight className="h-4 w-4" />
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {STEPS.map((step, i) => {
              const ref = useRef(null);
              const inView = useInView(ref, { once: true, margin: "-50px" });
              return (
                <motion.div
                  key={i}
                  ref={ref}
                  initial={{ opacity: 0, x: 50 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ x: 8, transition: { duration: 0.2 } }}
                  className="group p-6 rounded-2xl border border-border/50 bg-card hover:border-border hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <motion.div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${step.bg}`}
                      whileHover={{ rotate: -8, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <step.icon size={15} className={step.color} />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground/30">{step.num}</span>
                        <span className="text-[10px] font-semibold bg-secondary px-2.5 py-0.5 rounded-full text-muted-foreground/60">{step.time}</span>
                      </div>
                      <h3 className="text-base font-bold tracking-tight mb-1">{step.title}</h3>
                      <p className="text-sm text-muted-foreground/70 leading-relaxed">{step.desc}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <motion.p
                        className={`text-xl font-black tabular-nums ${step.color}`}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={inView ? { opacity: 1, scale: 1 } : {}}
                        transition={{ delay: i * 0.1 + 0.3, type: "spring", stiffness: 280, damping: 16 }}
                      >{step.stat}</motion.p>
                      <p className="text-[10px] text-muted-foreground/40">{step.statLabel}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}