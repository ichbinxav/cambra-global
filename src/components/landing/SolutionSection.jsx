import { Link } from "react-router-dom";
import { Search, Zap, TrendingUp, ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

const PILLARS = [
  {
    num: "01", icon: Search, color: "text-blue-600",
    bg: "bg-blue-500/[0.07] border-blue-500/20",
    title: "Identify overspend",
    desc: "The Analyzer benchmarks your payments, shipping, and SaaS against real network data.",
    stat: "2 min", statLabel: "to complete", note: "Exact euros, not vague %",
  },
  {
    num: "02", icon: Zap, color: "text-orange-500",
    bg: "bg-orange-500/[0.07] border-orange-500/20",
    title: "Unlock network rates",
    desc: "Access pre-negotiated deals secured across 1,000+ brands at collective volume.",
    stat: "1.4%", statLabel: "payment rate", note: "Unavailable to individual brands",
  },
  {
    num: "03", icon: TrendingUp, color: "text-green-600",
    bg: "bg-green-500/[0.07] border-green-500/20",
    title: "Improve over time",
    desc: "Track savings, monitor your Infrastructure Score, and optimize continuously.",
    stat: "€29K", statLabel: "avg. saved/yr", note: "Compounds as network grows",
  },
];

export default function SolutionSection() {
  const { isAuthenticated } = useAuth();
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const flowRef = useRef(null);
  const flowInView = useInView(flowRef, { once: true, margin: "-60px" });

  return (
    <section className="py-24 px-5 border-t border-border/40 bg-secondary/10">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div ref={headRef} className="text-center mb-14">
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center justify-center gap-2"
          >
            <span className="w-4 h-px bg-border" /> The solution
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 40 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.2rem,6vw,5rem)] font-black tracking-[-0.05em] leading-[0.88] mb-4"
          >
            Collective leverage.<br />Individual savings.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-muted-foreground text-base max-w-sm mx-auto"
          >
            Turn your infrastructure from a cost center into a competitive advantage.
          </motion.p>
        </div>

        {/* System flow */}
        <motion.div
          ref={flowRef}
          initial={{ opacity: 0, y: 30 }} animate={flowInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mb-10 p-5 rounded-2xl border border-border/50 bg-background max-w-2xl mx-auto"
        >
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {[
              { label: "Your tools", sub: "Stripe · DHL · Shopify" },
              null,
              { label: "THE NoDE", sub: "Analysis engine", highlight: true },
              null,
              { label: "Savings", sub: "€18K–72K/yr" },
            ].map((item, i) =>
              item === null ? (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0 }} animate={flowInView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.2 + i * 0.1 }}
                >
                  <ArrowRight size={14} className="text-muted-foreground/30 shrink-0" />
                </motion.div>
              ) : (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 16 }} animate={flowInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.1 + i * 0.1, duration: 0.5 }}
                  className={`px-4 py-2.5 rounded-xl border text-center flex-1 min-w-[100px] ${
                    item.highlight ? "bg-foreground text-background border-foreground/10" : "bg-card border-border/40"
                  }`}
                >
                  <p className={`text-xs font-bold ${item.highlight ? "text-background" : ""}`}>{item.label}</p>
                  <p className={`text-[10px] mt-0.5 ${item.highlight ? "text-background/40" : "text-muted-foreground/40"}`}>{item.sub}</p>
                </motion.div>
              )
            )}
          </div>
        </motion.div>

        {/* Pillars grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((p, i) => {
            const ref = useRef(null);
            const inView = useInView(ref, { once: true, margin: "-60px" });
            return (
              <motion.div
                key={i}
                ref={ref}
                initial={{ opacity: 0, y: 50 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.65, delay: i * 0.13, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -8, transition: { duration: 0.25 } }}
                className="p-7 rounded-2xl bg-background border border-border/50 flex flex-col group hover:border-border hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/30">{p.num}</span>
                  <motion.div
                    className={`w-9 h-9 rounded-xl border flex items-center justify-center ${p.bg}`}
                    whileHover={{ rotate: 10, scale: 1.1 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <p.icon size={15} className={p.color} />
                  </motion.div>
                </div>
                <h3 className="text-lg font-bold tracking-tight mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground/70 leading-relaxed flex-1 mb-5">{p.desc}</p>

                <div className="pt-5 border-t border-border/30 flex items-end justify-between">
                  <div>
                    <motion.p
                      className={`text-2xl font-black tracking-tight ${p.color}`}
                      initial={{ opacity: 0 }}
                      animate={inView ? { opacity: 1 } : {}}
                      transition={{ delay: i * 0.13 + 0.4 }}
                    >{p.stat}</motion.p>
                    <p className="text-[10px] text-muted-foreground/40">{p.statLabel}</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground/30 text-right max-w-[90px]">{p.note}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        <motion.div
          className="text-center mt-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {isAuthenticated ? (
            <Link to="/Analyzer">
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
                className="h-12 px-8 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
              >
                See my savings <ArrowRight size={14} />
              </motion.button>
            </Link>
          ) : (
            <motion.a
              whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}
              href="/auth/start"
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 px-8 rounded-full bg-foreground text-background text-sm font-bold inline-flex items-center gap-2 hover:opacity-90 transition-opacity shadow-sm"
            >
              Sign in to start <ArrowRight size={14} />
            </motion.a>
          )}
        </motion.div>

      </div>
    </section>
  );
}