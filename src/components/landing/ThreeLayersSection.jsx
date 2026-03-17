import { Link } from "react-router-dom";
import { Network, BarChart2, Zap, CreditCard, Truck, Package, ArrowRight } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

export default function ThreeLayersSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const extraRef = useRef(null);
  const extraInView = useInView(extraRef, { once: true, margin: "-60px" });

  return (
    <section className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div ref={headRef} className="mb-12">
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2"
          >
            <span className="w-4 h-px bg-border" /> The platform
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 30 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-4 max-w-2xl"
          >
            Infrastructure first.<br />Everything else follows.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-muted-foreground text-base max-w-lg"
          >
            Our core is simple: reduce what you spend on payments, shipping, and tools. The rest — network, intelligence — amplifies that foundation.
          </motion.p>
        </div>

        {/* Infrastructure — HERO BLOCK */}
        <motion.div
          initial={{ opacity: 0, y: 40 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl bg-foreground text-background p-8 lg:p-12 mb-5"
        >
          <div className="flex flex-col lg:flex-row lg:items-start gap-10">
            <div className="flex-1 max-w-md">
              <div className="flex items-center gap-2 mb-5">
                <Zap size={14} className="text-background/50" />
                <p className="text-[10px] tracking-[0.3em] uppercase text-background/40">Infrastructure · Core product</p>
              </div>
              <h3 className="text-[clamp(1.8rem,3.5vw,3rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4">
                Better economics.<br />From day one.
              </h3>
              <p className="text-background/55 text-sm leading-relaxed mb-6">
                Unlock pre-negotiated rates across payments, shipping, and tools — powered by collective scale. Brands on THE NoDE unlock €18K–€72K per year without changing how they operate.
              </p>
              <Link to="/Deals">
                <button className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-background text-foreground text-sm font-bold hover:bg-background/90 transition-colors">
                  Access the deals <ArrowRight size={12} />
                </button>
              </Link>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { icon: CreditCard, label: "Payments", sub: "−52% fee rate", stat: "1.4%", statLabel: "network rate" },
                  { icon: Truck, label: "Shipping", sub: "−18% avg cost", stat: "−18%", statLabel: "avg saving" },
                  { icon: Package, label: "SaaS", sub: "−30% stack waste", stat: "−30%", statLabel: "stack savings" },
                ].map(item => (
                  <div key={item.label} className="p-4 rounded-xl bg-background/8 border border-background/10 flex flex-col gap-2">
                    <item.icon size={13} className="text-background/40" />
                    <p className="text-xs font-bold">{item.label}</p>
                    <p className="text-[10px] text-background/35 leading-tight">{item.sub}</p>
                    <div className="mt-auto pt-3 border-t border-background/10">
                      <p className="text-lg font-black">{item.stat}</p>
                      <p className="text-[9px] text-background/30 uppercase tracking-wider">{item.statLabel}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-background/25 mt-3">Based on real network benchmarks · €18K–€72K avg. per brand / year</p>
            </div>
          </div>
        </motion.div>

        {/* Network + Intelligence — SUBTLE SECONDARY */}
        <motion.div
          ref={extraRef}
          initial={{ opacity: 0, y: 20 }} animate={extraInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          {[
            {
              icon: Network,
              label: "Network",
              desc: "Connect with independent brands. Build partnerships, explore collaboration opportunities, and grow within a curated ecosystem.",
              href: "/Network",
              cta: "Explore Network",
            },
            {
              icon: BarChart2,
              label: "Intelligence",
              desc: "Benchmark your performance, access market insights, and track your infrastructure score over time.",
              href: "/Insights",
              cta: "Explore Intelligence",
            },
          ].map(item => (
            <div key={item.label} className="rounded-xl border border-border/40 bg-card/50 p-5 flex items-start gap-4">
              <item.icon size={14} className="text-muted-foreground/40 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-xs font-semibold text-muted-foreground/60">{item.label}</p>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-border/40 text-muted-foreground/35">Coming soon</span>
                </div>
                <p className="text-[11px] text-muted-foreground/50 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}