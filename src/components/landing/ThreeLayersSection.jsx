import { Link } from "react-router-dom";
import { Network, BarChart2, CreditCard, Truck, Package, ArrowRight, Users, TrendingDown, ShieldCheck } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const POWER_POINTS = [
  { icon: Users, label: "Collective leverage you don't have", desc: "1,000+ brands negotiate as one bloc. Enterprise-level bargaining power — available to you immediately." },
  { icon: TrendingDown, label: "Pre-negotiated institutional rates", desc: "Deals are already secured. You don't negotiate — you activate. Instant access to network-negotiated terms." },
  { icon: ShieldCheck, label: "Enterprise infrastructure, indie economics", desc: "The exact contracts that large retailers sign. At the cost structure independent brands actually pay." },
];

export default function ThreeLayersSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const powerRef = useRef(null);
  const powerInView = useInView(powerRef, { once: true, margin: "-60px" });
  const extraRef = useRef(null);
  const extraInView = useInView(extraRef, { once: true, margin: "-60px" });

  return (
    <section className="py-24 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div ref={headRef} className="mb-12 max-w-3xl">
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center gap-2"
          >
            <span className="w-4 h-px bg-border" /> Infrastructure platform
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 30 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.2rem,5vw,4rem)] font-black tracking-[-0.04em] leading-[0.88] mb-5 text-foreground"
          >
            Get the leverage<br />big players have.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-foreground/60 text-lg leading-relaxed max-w-xl"
          >
            Large retailers and enterprise groups have one advantage you don't: collective negotiation power. THE NoDE changes that. We pool independent brands into a single infrastructure bloc — and negotiate accordingly.
          </motion.p>
        </div>

        {/* Collective power — 3 pillars */}
        <motion.div
          ref={powerRef}
          initial={{ opacity: 0, y: 30 }} animate={powerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5"
        >
          {POWER_POINTS.map((p, i) => (
            <motion.div
              key={p.label}
              initial={{ opacity: 0, y: 20 }} animate={powerInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.15 + i * 0.1 }}
              className="p-6 rounded-2xl border border-border/50 bg-card"
            >
              <p.icon size={16} className="text-foreground/40 mb-4" />
              <p className="text-sm font-black mb-1.5">{p.label}</p>
              <p className="text-[12px] text-muted-foreground/70 leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Infrastructure deals — HERO BLOCK */}
        <motion.div
          initial={{ opacity: 0, y: 40 }} animate={powerInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl bg-foreground text-background p-8 lg:p-12 mb-4"
        >
          <div className="flex flex-col lg:flex-row lg:items-start gap-10">
            <div className="flex-1 max-w-md">
              <p className="text-[10px] tracking-[0.3em] uppercase text-background/40 mb-5">What you unlock</p>
              <h3 className="text-[clamp(1.8rem,3.5vw,2.8rem)] font-black tracking-[-0.04em] leading-[0.9] mb-4">
                Better rates.<br />From day one.
              </h3>
              <p className="text-background/55 text-sm leading-relaxed mb-3">
                Payments at 1.4% instead of 2.9%. Shipping 18% cheaper than retail. SaaS tools at group licensing rates. These aren't discounts — they're the rates our collective volume commands.
              </p>
              <p className="text-background/40 text-sm leading-relaxed mb-7">
                You join. We do the negotiating. You keep the savings.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link to="/Deals">
                  <button className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-background text-foreground text-sm font-bold hover:bg-background/90 transition-colors">
                    See all deals <ArrowRight size={12} />
                  </button>
                </Link>
                <Link to="/Onboarding">
                  <button className="inline-flex items-center gap-2 h-11 px-6 rounded-full border border-background/20 text-background/70 text-sm font-medium hover:bg-background/10 transition-colors">
                    Join to unlock <ArrowRight size={12} />
                  </button>
                </Link>
              </div>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {[
                  { icon: CreditCard, label: "Payments", detail: "From 2.9% → 1.4%", stat: "−52%", sub: "fee reduction" },
                  { icon: Truck, label: "Shipping", detail: "Collective volume rates", stat: "−18%", sub: "avg cost" },
                  { icon: Package, label: "SaaS & Tools", detail: "Group licensing deals", stat: "−30%", sub: "stack savings" },
                ].map(item => (
                  <div key={item.label} className="p-4 rounded-xl border border-background/10 bg-background/[0.06] flex flex-col gap-1.5">
                    <item.icon size={13} className="text-background/40" />
                    <p className="text-xs font-bold mt-1">{item.label}</p>
                    <p className="text-[10px] text-background/35 leading-tight">{item.detail}</p>
                    <div className="mt-auto pt-3 border-t border-background/10">
                      <p className="text-2xl font-black">{item.stat}</p>
                      <p className="text-[9px] text-background/30 uppercase tracking-wider">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-background/10 bg-background/[0.04]">
                <div>
                  <p className="text-[10px] text-background/30 uppercase tracking-wider mb-0.5">Avg. margin unlocked</p>
                  <p className="text-2xl font-black">€18K – €72K<span className="text-sm font-normal text-background/40">/yr</span></p>
                </div>
                <p className="text-[10px] text-background/25 text-right max-w-[100px] leading-relaxed">Real network benchmarks · 1,000+ brands</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Network + Intelligence — additional benefits */}
        <motion.div
          ref={extraRef}
          initial={{ opacity: 0, y: 16 }} animate={extraInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <p className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground/50 mb-3 font-semibold">Also included</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                icon: Network,
                label: "Network",
                desc: "Connect with independent brands. Build partnerships, explore collaboration opportunities, and grow within a curated ecosystem of operators.",
                href: "/Network",
              },
              {
                icon: BarChart2,
                label: "Intelligence",
                desc: "Benchmark your infrastructure against the network. Track your savings score, identify gaps, and access market insights.",
                href: "/Insights",
              },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-border/50 bg-card p-5 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <item.icon size={15} className="text-foreground/50 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold mb-1">{item.label}</p>
                    <p className="text-[12px] text-muted-foreground/70 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
                <Link to="/Onboarding" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors border border-border/50 rounded-full px-3 py-1.5 w-fit hover:border-foreground/30">
                  Join to access <ArrowRight size={10} />
                </Link>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}