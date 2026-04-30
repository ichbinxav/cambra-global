import { TrendingUp, BarChart2, Network, Clock, Focus, CreditCard, Truck, Package, Store } from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const BENEFITS = [
  {
    icon: TrendingUp,
    title: "Reduce your costs instantly",
    body: "Access pre-negotiated rates across payments, shipping, and SaaS. Stop overpaying for infrastructure you rely on every day.",
    color: "text-cambra-lilac",
    bg: "bg-cambra-lilac-soft border-cambra-lilac",
  },
  {
    icon: BarChart2,
    title: "Increase your margins",
    body: "Every % saved goes directly to your bottom line. No revenue growth needed — just smarter economics.",
    color: "text-cambra-mint",
    bg: "bg-cambra-mint-soft border-cambra-mint",
  },
  {
    icon: BarChart2,
    title: "Benchmark like top operators",
    body: "See how your costs compare to similar brands. Understand where you're inefficient and where to optimize.",
    iconOverride: "benchmark",
    color: "text-cambra-lilac",
    bg: "bg-cambra-lilac-soft border-cambra-lilac",
  },
  {
    icon: Network,
    title: "Access network-level deals",
    body: "Benefit from collective scale. What large companies negotiate, you now access instantly.",
    color: "text-cambra-plum",
    bg: "bg-orange-500/[0.08] border-chart-3/20",
  },
  {
    icon: Clock,
    title: "Save time and complexity",
    body: "No need to negotiate contracts, compare providers, or audit costs. We centralize your entire infrastructure layer.",
    color: "text-chart-2",
    bg: "bg-cambra-mint-soft border-cambra-mint",
  },
  {
    icon: Focus,
    title: "Stay focused on your core business",
    body: "Spend less time on operations, more time on brand, product, and growth. THE NoDE handles the backend.",
    color: "text-destructive",
    bg: "bg-cambra-plum-soft border-cambra-plum",
  },
];

const ICONS = {
  benchmark: ({ size, className }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
};

const PROOF = [
  { value: "€18K–€72K", label: "Unlocked per year", icon: BarChart2 },
  { value: "−52%", label: "Payments", icon: CreditCard },
  { value: "−35%", label: "Retail TPE", icon: Store },
  { value: "−18%", label: "Shipping", icon: Truck },
  { value: "−30%", label: "SaaS tools", icon: Package },
];

function BenefitTile({ b, index }) {
  const IconComp = b.iconOverride ? ICONS[b.iconOverride] : b.icon;
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.55, delay: (index % 3) * 0.1, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, boxShadow: "0 14px 30px -18px rgba(0,0,0,0.25)" }}
      className="relative p-6 rounded-2xl border border-border/50 bg-card overflow-hidden"
    >
      {/* Accent blob */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-[0.06] bg-foreground" />


      <div className="flex items-start gap-3 mb-3">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border bg-foreground/90 text-background`}>
          <IconComp size={18} className={b?.color || "text-muted-foreground/60"} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold tracking-tight mb-1.5">{b.title}</h3>
          <p className="text-sm text-muted-foreground/70 leading-relaxed">{b.body}</p>
        </div>
      </div>

      {/* Bottom accent line */}
      <div className="h-1 rounded-full bg-foreground/70" />
    </motion.div>
  );
}

export default function BenefitsSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: "-80px" });
  const editorialRef = useRef(null);
  const editorialInView = useInView(editorialRef, { once: true, margin: "-60px" });
  const proofRef = useRef(null);
  const proofInView = useInView(proofRef, { once: true, margin: "-60px" });

  return (
    <section className="py-12 px-5 border-t border-border/40">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div ref={headRef} className="max-w-2xl mb-16 mx-auto text-center lg:text-left">
          <motion.p
            initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50 mb-5 flex items-center justify-center lg:justify-start gap-2"
          >
            <span className="w-4 h-px bg-border" /> Why brands join
          </motion.p>
          <motion.h2
            initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(2.4rem,6vw,5rem)] font-black tracking-[-0.05em] leading-[0.87] mb-5 text-center lg:text-left"
          >
            The economic advantage<br />of CAMBRA.
          </motion.h2>
          <motion.p
            initial={false} animate={headInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-muted-foreground text-lg leading-relaxed mx-auto text-center lg:text-left"
          >
            We turn your infrastructure into a competitive advantage.
          </motion.p>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {BENEFITS.map((b, i) => (
            <BenefitTile key={i} b={b} index={i} />
          ))}
        </div>

        {/* Editorial block */}
        <div
          ref={editorialRef}
          className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-12 items-center mb-16 py-14 border-y border-border/40"
        >
          <motion.h3
            initial={false} animate={editorialInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="text-[clamp(1.8rem,4vw,3rem)] font-black tracking-[-0.04em] leading-[0.9] text-center lg:text-left"
          >
            This is not a tool.<br />It's your economic layer.
          </motion.h3>
          <motion.div
            initial={false} animate={editorialInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-4 text-muted-foreground text-base leading-relaxed"
          >
            <p>You don't need more tools. You need better economics.</p>
            <p>CAMBRA connects your business to a network designed to optimize how you spend, scale, and operate — so your infrastructure works for you, not against you.</p>
          </motion.div>
        </div>

        {/* Proof strip */}
        <div ref={proofRef} className="rounded-[2rem] border border-border/50 bg-card/70 p-4 sm:p-6">

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {PROOF.map((p, i) => (
              <motion.div
                key={i}
                initial={false}
                animate={proofInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="rounded-2xl border border-neon-6/20 bg-neon-6/5 px-4 py-4 text-center shadow-sm"
              >
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-neon-6/15 bg-background">
                  <p.icon size={16} className="text-neon-6 opacity-90" />
                </div>
                <motion.p
                  className="text-2xl font-black tracking-tight text-neon-6"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={proofInView ? { scale: 1, opacity: 1 } : {}}
                  transition={{ delay: i * 0.08 + 0.15, type: 'spring', stiffness: 280, damping: 16 }}
                >{p.value}</motion.p>
                <p className="mt-1 text-[11px] text-muted-foreground">{p.label}</p>
              </motion.div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}