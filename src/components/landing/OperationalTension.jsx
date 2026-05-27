import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { CreditCard, LayoutGrid, Package, ArrowLeftRight, Landmark, Radar } from "lucide-react";

/**
 * OperationalTension — Engine + orbital layers diagram.
 * Compact, scannable, "wow". Each layer is a node orbiting the CAMBRA engine.
 */

const RECOVERIES = [
  { Icon: CreditCard,     layer: "Payments",  finding: "−0.3pp",       amount: 11400, accent: "text-blue-500",    dot: "bg-blue-500" },
  { Icon: LayoutGrid,     layer: "SaaS",      finding: "2 dupes",      amount: 8200,  accent: "text-cyan-500",    dot: "bg-cyan-500" },
  { Icon: Package,        layer: "Shipping",  finding: "−€0.40/order", amount: 6900,  accent: "text-violet-500",  dot: "bg-violet-500" },
  { Icon: ArrowLeftRight, layer: "FX",        finding: "−0.4pp",       amount: 4100,  accent: "text-emerald-500", dot: "bg-emerald-500" },
  { Icon: Landmark,       layer: "Banking",   finding: "−€18/mo",      amount: 220,   accent: "text-amber-500",   dot: "bg-amber-500" },
];

const TOTAL = RECOVERIES.reduce((s, r) => s + r.amount, 0);

export default function OperationalTension() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-14 md:py-16 border-y border-border/40 bg-background relative overflow-hidden">
      <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-5">
        <div className="grid lg:grid-cols-[1fr_1.05fr] gap-10 lg:gap-14 items-center">
          {/* LEFT — copy */}
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

          {/* RIGHT — orbital engine diagram */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden shadow-xl shadow-foreground/[0.03]"
          >
            {/* Top bar */}
            <div className="px-4 py-2.5 border-b border-border/40 bg-secondary/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radar className="h-3 w-3 text-emerald-500" />
                <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60 font-mono">
                  Live scan · €1–5M tier
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-mono text-emerald-600 uppercase tracking-wider font-bold">Live</span>
              </div>
            </div>

            {/* Orbital diagram */}
            <div className="relative h-[260px] md:h-[280px] bg-gradient-to-br from-blue-500/[0.03] to-cyan-500/[0.03]">
              {/* Orbit rings */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid meet">
                <circle cx="200" cy="140" r="70"  fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border/40" strokeDasharray="2 4" />
                <circle cx="200" cy="140" r="110" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border/30" strokeDasharray="2 4" />
                {/* Scan sweep */}
                <motion.line
                  x1="200" y1="140" x2="200" y2="30"
                  stroke="url(#sweep)" strokeWidth="1.5"
                  style={{ transformOrigin: "200px 140px" }}
                  animate={inView ? { rotate: 360 } : {}}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />
                <defs>
                  <linearGradient id="sweep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--neon-7))" stopOpacity="0" />
                    <stop offset="100%" stopColor="hsl(var(--neon-7))" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Center engine */}
              <motion.div
                initial={{ scale: 0 }}
                animate={inView ? { scale: 1 } : {}}
                transition={{ duration: 0.6, delay: 0.4, type: "spring" }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
              >
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-saas-gradient blur-xl opacity-50 animate-pulse" />
                  <div className="relative h-16 w-16 md:h-[72px] md:w-[72px] rounded-full bg-saas-gradient flex flex-col items-center justify-center shadow-lg">
                    <span className="text-[8px] font-mono tracking-[0.18em] text-white/70 uppercase">Engine</span>
                    <span className="text-[11px] font-black text-white tracking-tight">CAMBRA</span>
                  </div>
                </div>
              </motion.div>

              {/* Orbital nodes */}
              {RECOVERIES.map((r, i) => {
                // 5 nodes positioned on outer orbit
                const angle = (i / RECOVERIES.length) * 2 * Math.PI - Math.PI / 2;
                const radius = 110;
                const cx = 50 + (Math.cos(angle) * radius) / 4; // % positioning
                const cy = 50 + (Math.sin(angle) * radius * 280) / (400 * 140); // adjust for aspect

                // Use simpler absolute % positions for a 5-point star around center
                const positions = [
                  { top: "10%",  left: "50%" },  // top
                  { top: "38%",  left: "88%" },  // top-right
                  { top: "82%",  left: "72%" },  // bottom-right
                  { top: "82%",  left: "28%" },  // bottom-left
                  { top: "38%",  left: "12%" },  // top-left
                ];

                return (
                  <motion.div
                    key={r.layer}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={inView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ duration: 0.5, delay: 0.6 + i * 0.1, type: "spring" }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-10 group"
                    style={positions[i]}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="relative">
                        <div className={`absolute inset-0 rounded-full ${r.dot} opacity-20 blur-md group-hover:opacity-40 transition-opacity`} />
                        <div className="relative h-11 w-11 rounded-full bg-card border border-border/60 flex items-center justify-center shadow-sm group-hover:scale-110 group-hover:border-foreground/30 transition-all">
                          <r.Icon className={`h-4 w-4 ${r.accent}`} strokeWidth={2} />
                        </div>
                        {/* Ping */}
                        <motion.div
                          className={`absolute inset-0 rounded-full border-2 ${r.dot.replace('bg-', 'border-')}`}
                          animate={inView ? { scale: [1, 1.6], opacity: [0.6, 0] } : {}}
                          transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
                        />
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-foreground leading-none mb-0.5">{r.layer}</div>
                        <div className={`text-[9px] font-mono tabular-nums ${r.accent} leading-none`}>{r.finding}</div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Bottom — total recovery */}
            <div className="px-4 py-3 border-t border-border/40 bg-secondary/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[9px] uppercase tracking-[0.2em] font-mono text-muted-foreground/50">
                  Annual recovery
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black tracking-tight text-saas-gradient tabular-nums leading-none">
                  ~€{(TOTAL / 1000).toFixed(1)}K
                </span>
                <span className="text-[10px] font-mono text-muted-foreground/50">/ yr</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}