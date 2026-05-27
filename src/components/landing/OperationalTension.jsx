import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { CreditCard, LayoutGrid, Package, ArrowLeftRight, Landmark } from "lucide-react";

/**
 * OperationalTension — plain-English premise + believable recovery examples.
 *
 * Left: sharp tension copy. Right: a vertical "field report" of realistic
 * findings with their native units. Distinct from Hero terminal.
 */

const RECOVERIES = [
  { Icon: CreditCard,     layer: "Payments",  finding: "0.3pp below Stripe default rate", recovered: "€11,400 / yr" },
  { Icon: LayoutGrid,     layer: "SaaS",      finding: "Killed 2 duplicate ESPs",          recovered: "€8,200 / yr"  },
  { Icon: Package,        layer: "Shipping",  finding: "Renegotiated €0.40 / order",       recovered: "€6,900 / yr"  },
  { Icon: ArrowLeftRight, layer: "FX",        finding: "Spread tightened by 0.4pp",        recovered: "€4,100 / yr"  },
  { Icon: Landmark,       layer: "Banking",   finding: "Fixed fees -€18 / month",          recovered: "€220 / yr"    },
];

export default function OperationalTension() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-24 md:py-28 border-y border-border/40 bg-background relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-center">
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
              Typical recovery: €15K–€35K / yr · €1–5M tier
            </motion.div>
          </div>

          {/* RIGHT — field report of recovered margin */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden"
          >
            <div className="px-4 py-2.5 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
                <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60 font-mono">
                  Field report · anonymized
                </span>
              </div>
              <span className="text-[9px] font-mono text-muted-foreground/40">€1–5M tier</span>
            </div>

            <div className="divide-y divide-border/30">
              {RECOVERIES.map((r, i) => (
                <motion.div
                  key={r.layer}
                  initial={{ opacity: 0, x: 10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                  className="px-4 py-3.5 flex items-center gap-3 hover:bg-secondary/30 transition-colors"
                >
                  <div className="h-9 w-9 rounded-lg border border-border/50 bg-card flex items-center justify-center shrink-0">
                    <r.Icon className="h-4 w-4 text-foreground/70" strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground/40 mb-0.5">
                      {r.layer}
                    </p>
                    <p className="text-sm font-semibold text-foreground/85 truncate">{r.finding}</p>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-bold text-foreground shrink-0">
                    {r.recovered}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="px-4 py-2.5 bg-secondary/20 border-t border-border/30 flex items-center justify-between text-[9px] font-mono text-muted-foreground/40 uppercase tracking-[0.18em]">
              <span>5 layers recovered</span>
              <span className="text-foreground/70">~€30.8K / yr</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}