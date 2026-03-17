import { Link } from "react-router-dom";
import { Network, BarChart2, Zap, CheckCircle2, ArrowRight, CreditCard, Truck, Package } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const SECONDARIES = [
  {
    icon: Network,
    label: "Network",
    tagline: "Connect with the right brands.",
    description: "Access a curated directory of independent brands. Build partnerships and opportunities across the ecosystem.",
    bullets: ["Member directory", "Brand profiles", "Collaboration opportunities"],
    cta: "Explore the Network",
    href: "/Network",
    color: "text-blue-600",
    bg: "bg-blue-500/[0.05] border-blue-500/15",
    iconBg: "bg-blue-500/[0.08]",
  },
  {
    icon: BarChart2,
    label: "Intelligence",
    tagline: "Understand how you operate.",
    description: "Benchmark your business, access market insights, and identify where to improve your economics.",
    bullets: ["Benchmark vs similar brands", "Market insights", "Optimization signals"],
    cta: "Unlock your insights",
    href: "/Insights",
    color: "text-orange-500",
    bg: "bg-orange-500/[0.05] border-orange-500/15",
    iconBg: "bg-orange-500/[0.08]",
  },
];

export default function ThreeLayersSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const posRef = useRef(null);
  const posInView = useInView(posRef, { once: true, margin: "-80px" });
  const dashRef = useRef(null);
  const dashInView = useInView(dashRef, { once: true, margin: "-80px" });

  return (
    <>
      {/* Three Layers */}
      <section className="py-24 px-5 border-t border-border/40">
        <div className="max-w-6xl mx-auto">
          <div ref={headRef} className="text-center mb-16">
            <motion.p
              initial={{ opacity: 0, y: 12 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
              className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-4 flex items-center justify-center gap-2"
            >
              <span className="w-4 h-px bg-border" /> Three layers. One advantage. <span className="w-4 h-px bg-border" />
            </motion.p>
            <motion.h2
              initial={{ opacity: 0, y: 30 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-4"
            >
              Three layers. One advantage.
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 16 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-muted-foreground text-base max-w-md mx-auto"
            >
              THE NoDE helps you connect, understand, and optimize your business.
            </motion.p>
          </div>

          {/* Infrastructure — PRIMARY */}
          <motion.div
            initial={{ opacity: 0, y: 40 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-foreground/10 bg-foreground text-background p-8 mb-5"
          >
            <div className="flex flex-col lg:flex-row lg:items-start gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <Zap size={16} className="text-background/60" />
                  <p className="text-[10px] tracking-[0.25em] uppercase text-background/40">Infrastructure · Core</p>
                </div>
                <h3 className="text-3xl font-black tracking-[-0.03em] mb-2">Access better economics.</h3>
                <p className="text-background/60 text-sm leading-relaxed max-w-md">
                  Unlock pre-negotiated deals across payments, shipping, and tools — powered by collective scale. This is our core product and the foundation of everything.
                </p>
              </div>
              <div className="flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                  {[
                    { icon: CreditCard, label: "Payments", sub: "−52% fee rate" },
                    { icon: Truck, label: "Shipping", sub: "−18% avg cost" },
                    { icon: Package, label: "SaaS", sub: "−30% stack waste" },
                  ].map(item => (
                    <div key={item.label} className="p-3.5 rounded-xl bg-background/10 border border-background/10 flex flex-col gap-1.5">
                      <item.icon size={13} className="text-background/50" />
                      <p className="text-xs font-bold">{item.label}</p>
                      <p className="text-[10px] text-background/40">{item.sub}</p>
                    </div>
                  ))}
                </div>
                <Link to="/Deals" className="inline-flex items-center gap-1.5 text-xs font-bold text-background hover:opacity-70 transition-opacity">
                  Access the deals <ArrowRight size={11} />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Network + Intelligence — SECONDARY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {SECONDARIES.map((layer, i) => {
              const ref = useRef(null);
              const inView = useInView(ref, { once: true, margin: "-60px" });
              return (
                <motion.div
                  key={layer.label}
                  ref={ref}
                  initial={{ opacity: 0, y: 30 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  className={`rounded-2xl border p-6 flex flex-col ${layer.bg}`}
                >
                  <div className={`w-9 h-9 rounded-xl ${layer.iconBg} flex items-center justify-center mb-4`}>
                    <layer.icon size={15} className={layer.color} />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50">{layer.label}</p>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground/50 border border-border/30">Coming soon</span>
                  </div>
                  <h3 className="text-lg font-black tracking-tight mb-2">{layer.tagline}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-4 flex-1">{layer.description}</p>
                  <ul className="space-y-1.5 mb-5">
                    {layer.bullets.map(b => (
                      <li key={b} className="flex items-center gap-2 text-xs text-muted-foreground/70">
                        <CheckCircle2 size={10} className={layer.color + " opacity-60"} />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <Link to={layer.href} className={`inline-flex items-center gap-1.5 text-xs font-bold ${layer.color} opacity-60 hover:opacity-100 transition-opacity`}>
                    {layer.cta} <ArrowRight size={10} />
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Positioning block */}
      <section className="py-20 px-5 border-t border-border/40 bg-foreground text-background">
        <div className="max-w-4xl mx-auto text-center" ref={posRef}>
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={posInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase opacity-30 mb-6"
          >
            The platform
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 30 }} animate={posInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.9] mb-8"
          >
            Not a tool.<br />An economic layer.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={posInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base opacity-60 leading-relaxed max-w-xl mx-auto mb-2"
          >
            You don't just analyze your business. You improve it.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={posInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base opacity-60 leading-relaxed max-w-xl mx-auto"
          >
            THE NoDE connects you to a network, gives you intelligence, and unlocks better economics — all in one place.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={posInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex items-center justify-center gap-3 mt-10"
          >
            {["Network", "Intelligence", "Deals"].map((l, i) => (
              <span key={l} className="flex items-center gap-3">
                <span className="text-sm font-bold opacity-90">{l}</span>
                {i < 2 && <span className="w-1 h-1 rounded-full bg-background/30" />}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Dashboard section */}
      <section className="py-24 px-5 border-t border-border/40">
        <div className="max-w-4xl mx-auto" ref={dashRef}>
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={dashInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-center mb-12"
          >
            <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-4">Dashboard</p>
            <h2 className="text-[clamp(1.8rem,4vw,3rem)] font-black tracking-[-0.04em] mb-3">Everything in one dashboard.</h2>
            <p className="text-muted-foreground text-sm">Your entire economic layer, structured in three modules.</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={dashInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm"
          >
            {/* Mock top bar */}
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/40 bg-foreground">
              <span className="text-xs font-black text-background tracking-tight">THE NoDE</span>
              <span className="ml-auto text-[10px] text-background/30 tracking-[0.2em] uppercase">Dashboard</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/40">
              {[
                { icon: Network, label: "Network", sub: "Member directory & partners", color: "text-blue-600", bg: "bg-blue-500/[0.06]" },
                { icon: BarChart2, label: "Intelligence", sub: "Insights & benchmarks", color: "text-orange-500", bg: "bg-orange-500/[0.06]" },
                { icon: Zap, label: "Deals", sub: "Payments, shipping & SaaS", color: "text-green-600", bg: "bg-green-500/[0.06]" },
              ].map((m, i) => (
                <div key={m.label} className={`p-7 flex flex-col gap-3 ${m.bg}`}>
                  <m.icon size={16} className={m.color} />
                  <div>
                    <p className="text-sm font-bold">{m.label}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{m.sub}</p>
                  </div>
                  <div className="flex gap-1 mt-auto">
                    {[...Array(3)].map((_, j) => (
                      <div key={j} className={`h-1 flex-1 rounded-full ${j === 0 ? m.color.replace("text-", "bg-") + " opacity-60" : "bg-border/40"}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }} animate={dashInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.5 }}
            className="flex justify-center mt-8"
          >
            <Link to="/Onboarding">
              <button className="inline-flex items-center gap-2 h-12 px-8 rounded-full bg-foreground text-background text-sm font-bold hover:bg-foreground/90 transition-colors">
                Join THE NoDE <ArrowRight size={13} />
              </button>
            </Link>
          </motion.div>
        </div>
      </section>
    </>
  );
}