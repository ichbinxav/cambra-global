import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { CreditCard, LayoutGrid, Package, ArrowLeftRight, Landmark, TrendingUp } from "lucide-react";

/**
 * OperationalTension — plain-English premise + believable recovery examples.
 *
 * Left: sharp tension copy. Right: a visual "field report" with per-layer
 * impact bars, color-coded categories, and a hero total.
 */

const RECOVERIES = [
  { Icon: CreditCard,     layer: "Payments",  finding: "0.3pp below Stripe default", amount: 11400, color: "from-blue-500 to-blue-600",     accent: "text-blue-600",    bg: "bg-blue-500/10" },
  { Icon: LayoutGrid,     layer: "SaaS",      finding: "Killed 2 duplicate ESPs",    amount: 8200,  color: "from-cyan-500 to-cyan-600",     accent: "text-cyan-600",    bg: "bg-cyan-500/10" },
  { Icon: Package,        layer: "Shipping",  finding: "Renegotiated €0.40 / order", amount: 6900,  color: "from-violet-500 to-violet-600", accent: "text-violet-600",  bg: "bg-violet-500/10" },
  { Icon: ArrowLeftRight, layer: "FX",        finding: "Spread tightened by 0.4pp",  amount: 4100,  color: "from-emerald-500 to-emerald-600", accent: "text-emerald-600", bg: "bg-emerald-500/10" },
  { Icon: Landmark,       layer: "Banking",   finding: "Fixed fees -€18 / month",    amount: 220,   color: "from-amber-500 to-amber-600",   accent: "text-amber-600",   bg: "bg-amber-500/10" },
];

const TOTAL = RECOVERIES.reduce((sum, r) => sum + r.amount, 0);
const MAX = Math.max(...RECOVERIES.map(r => r.amount));

export default function OperationalTension() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-16 md:py-20 border-y border-border/40 bg-background relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-16 items-center">
          {/* LEFT — economic tension copy */}
          <div>
            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/40 mb-5 font-mono"
            >
              Premise
            </motion.p>

            <motion.h2
              initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.045em] leading-[0.9] mb-6"
            >
              <span className="text-saas-gradient">You're overpaying.</span><br />
              You just don't know where.
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-base text-foreground/55 leading-relaxed max-w-md mb-6"
            >
              Every brand pays Stripe, ships orders, runs SaaS tools.
              <br /><br />
              Nobody checks if the prices are fair. We do — against brands your exact size, in your country.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex items-baseline gap-3 text-[11px] font-mono text-muted-foreground/50"
            >
              <span className="h-1 w-1 rounded-full bg-cambra-mint animate-pulse" />
              Estimated recovery: €15K–€35K / yr · €1–5M tier
            </motion.div>
          </div>

          {/* RIGHT — visual field report with impact bars */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden shadow-xl shadow-foreground/[0.03]"
          >
            {/* Header */}
            <div className="px-5 py-3 border-b border-border/50 bg-secondary/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
                <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60 font-mono">
                  Field report · anonymized
                </span>
              </div>
              <span className="text-[9px] font-mono text-muted-foreground/40">€1–5M tier</span>
            </div>

            {/* Hero total */}
            <div className="px-5 py-5 border-b border-border/40 bg-gradient-to-br from-blue-500/[0.04] to-cyan-500/[0.04]">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] font-mono text-muted-foreground/50 mb-1.5">
                    Estimated annual recovery
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl md:text-5xl font-black tracking-tight text-saas-gradient tabular-nums">
                      ~€{(TOTAL / 1000).toFixed(1)}K
                    </span>
                    <span className="text-sm font-mono text-muted-foreground/50">/ yr</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <TrendingUp className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
                  <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase tracking-wider">
                    5 layers
                  </span>
                </div>
              </div>
            </div>

            {/* Layers */}
            <div className="p-3 space-y-1.5">
              {RECOVERIES.map((r, i) => {
                const widthPct = (r.amount / MAX) * 100;
                return (
                  <motion.div
                    key={r.layer}
                    initial={{ opacity: 0, x: 10 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                    className="relative px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors group"
                  >
                    <div className="flex items-center gap-3 relative z-10">
                      <div className={`h-9 w-9 rounded-lg ${r.bg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                        <r.Icon className={`h-4 w-4 ${r.accent}`} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[9px] uppercase tracking-[0.18em] font-mono font-bold ${r.accent}`}>
                            {r.layer}
                          </span>
                        </div>
                        <p className="text-[13px] text-foreground/75 truncate">{r.finding}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-base font-mono tabular-nums font-bold text-foreground">
                          €{r.amount.toLocaleString()}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/40 ml-0.5">/yr</span>
                      </div>
                    </div>
                    {/* Impact bar */}
                    <div className="mt-2 ml-12 h-1 rounded-full bg-border/30 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={inView ? { width: `${widthPct}%` } : {}}
                        transition={{ duration: 0.8, delay: 0.5 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        className={`h-full bg-gradient-to-r ${r.color} rounded-full`}
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}