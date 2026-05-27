import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { CreditCard, LayoutGrid, Package, ArrowLeftRight, Landmark, Radar } from "lucide-react";

/**
 * OperationalTension — Engine + orbital layers diagram.
 * Fully responsive SVG-based diagram. Nodes never overflow.
 */

const RECOVERIES = [
  { Icon: CreditCard,     layer: "Payments",  finding: "−0.3pp",       amount: 11400, accent: "text-blue-500",    stroke: "#3b82f6" },
  { Icon: LayoutGrid,     layer: "SaaS",      finding: "2 dupes",      amount: 8200,  accent: "text-cyan-500",    stroke: "#06b6d4" },
  { Icon: Package,        layer: "Shipping",  finding: "−€0.40/order", amount: 6900,  accent: "text-violet-500",  stroke: "#8b5cf6" },
  { Icon: ArrowLeftRight, layer: "FX",        finding: "−0.4pp",       amount: 4100,  accent: "text-emerald-500", stroke: "#10b981" },
  { Icon: Landmark,       layer: "Banking",   finding: "−€18/mo",      amount: 220,   accent: "text-amber-500",   stroke: "#f59e0b" },
];

const TOTAL = RECOVERIES.reduce((s, r) => s + r.amount, 0);

// SVG geometry
const VB_W = 400;
const VB_H = 320;
const CX = 200;
const CY = 160;
const ORBIT_R = 115;

// Pre-compute node positions on the orbit (pentagon, top first)
const NODES = RECOVERIES.map((r, i) => {
  const angle = (i / RECOVERIES.length) * 2 * Math.PI - Math.PI / 2;
  return {
    ...r,
    x: CX + Math.cos(angle) * ORBIT_R,
    y: CY + Math.sin(angle) * ORBIT_R,
  };
});

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

            {/* SVG diagram — fully scalable, never overflows */}
            <div className="relative bg-gradient-to-br from-blue-500/[0.03] to-cyan-500/[0.03]">
              <svg
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="w-full h-auto block"
                preserveAspectRatio="xMidYMid meet"
              >
                <defs>
                  <linearGradient id="sweep" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--neon-7))" stopOpacity="0" />
                    <stop offset="100%" stopColor="hsl(var(--neon-7))" stopOpacity="0.9" />
                  </linearGradient>
                  <linearGradient id="engine" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#0A1024" />
                    <stop offset="55%" stopColor="#1F4ED8" />
                    <stop offset="100%" stopColor="#2CA7C1" />
                  </linearGradient>
                </defs>

                {/* Orbit rings */}
                <circle cx={CX} cy={CY} r={70}      fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border/40" strokeDasharray="2 4" />
                <circle cx={CX} cy={CY} r={ORBIT_R} fill="none" stroke="currentColor" strokeWidth="0.5" className="text-border/30" strokeDasharray="2 4" />

                {/* Scan sweep */}
                <motion.line
                  x1={CX} y1={CY} x2={CX} y2={CY - 130}
                  stroke="url(#sweep)" strokeWidth="2"
                  style={{ transformOrigin: `${CX}px ${CY}px` }}
                  animate={inView ? { rotate: 360 } : {}}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                />

                {/* Center engine — glow */}
                <motion.circle
                  cx={CX} cy={CY} r={42}
                  fill="url(#engine)"
                  opacity="0.25"
                  initial={{ scale: 0 }}
                  animate={inView ? { scale: [1, 1.15, 1] } : {}}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  style={{ transformOrigin: `${CX}px ${CY}px`, filter: "blur(8px)" }}
                />
                {/* Center engine — core */}
                <motion.g
                  initial={{ scale: 0, opacity: 0 }}
                  animate={inView ? { scale: 1, opacity: 1 } : {}}
                  transition={{ duration: 0.6, delay: 0.4, type: "spring" }}
                  style={{ transformOrigin: `${CX}px ${CY}px` }}
                >
                  <circle cx={CX} cy={CY} r={32} fill="url(#engine)" />
                  <text x={CX} y={CY - 4} textAnchor="middle" fill="rgba(255,255,255,0.65)"
                        style={{ fontFamily: "var(--font-inter)", fontSize: 7, letterSpacing: "0.18em", fontWeight: 500 }}>
                    ENGINE
                  </text>
                  <text x={CX} y={CY + 8} textAnchor="middle" fill="#fff"
                        style={{ fontFamily: "var(--font-inter)", fontSize: 11, fontWeight: 900, letterSpacing: "-0.02em" }}>
                    CAMBRA
                  </text>
                </motion.g>

                {/* Orbital nodes */}
                {NODES.map((n, i) => {
                  const labelBelow = n.y > CY - 20; // labels below circle except top
                  const labelY = labelBelow ? n.y + 32 : n.y - 20;
                  return (
                    <motion.g
                      key={n.layer}
                      initial={{ opacity: 0, scale: 0 }}
                      animate={inView ? { opacity: 1, scale: 1 } : {}}
                      transition={{ duration: 0.5, delay: 0.6 + i * 0.1, type: "spring" }}
                      style={{ transformOrigin: `${n.x}px ${n.y}px` }}
                    >
                      {/* Soft glow under node */}
                      <circle cx={n.x} cy={n.y} r={16} fill={n.stroke} opacity="0.15" style={{ filter: "blur(6px)" }} />

                      {/* Ping ring */}
                      <motion.circle
                        cx={n.x} cy={n.y} r={14}
                        fill="none" stroke={n.stroke} strokeWidth="1.5"
                        animate={inView ? { r: [14, 22], opacity: [0.6, 0] } : {}}
                        transition={{ duration: 2, repeat: Infinity, delay: i * 0.4, ease: "easeOut" }}
                      />

                      {/* Node circle */}
                      <circle
                        cx={n.x} cy={n.y} r={14}
                        className="fill-card"
                        stroke={n.stroke} strokeWidth="1.25"
                      />

                      {/* Icon — rendered via foreignObject so we keep lucide */}
                      <foreignObject x={n.x - 8} y={n.y - 8} width="16" height="16">
                        <div className={`w-4 h-4 ${n.accent} flex items-center justify-center`}>
                          <n.Icon className="w-4 h-4" strokeWidth={2} />
                        </div>
                      </foreignObject>

                      {/* Label */}
                      <text
                        x={n.x} y={labelY}
                        textAnchor="middle"
                        className="fill-foreground"
                        style={{ fontFamily: "var(--font-inter)", fontSize: 9, fontWeight: 700 }}
                      >
                        {n.layer}
                      </text>
                      <text
                        x={n.x} y={labelY + 10}
                        textAnchor="middle"
                        fill={n.stroke}
                        style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 8, fontWeight: 500 }}
                      >
                        {n.finding}
                      </text>
                    </motion.g>
                  );
                })}
              </svg>
            </div>

            {/* Bottom — total recovery */}
            <div className="px-4 py-3 border-t border-border/40 bg-secondary/30 flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-[0.2em] font-mono text-muted-foreground/50">
                Annual recovery
              </span>
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