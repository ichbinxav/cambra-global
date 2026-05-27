import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, AlertTriangle, TrendingDown, Zap, Activity } from "lucide-react";
import { motion, useScroll, useTransform, animate } from "framer-motion";

// Animated counter hook
function useCounter(target, duration = 1.8, delay = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const controls = animate(0, target, {
        duration,
        ease: [0.22, 1, 0.36, 1],
        onUpdate: (v) => setValue(Math.round(v)),
      });
      return () => controls.stop();
    }, delay * 1000);
    return () => clearTimeout(timer);
  }, [target, duration, delay]);
  return value;
}

const NODES = [
  { id: "stripe", label: "Stripe", x: 18, y: 28, color: "#635BFF", pulse: 2.1 },
  { id: "shopify", label: "Shopify", x: 62, y: 12, color: "#96BF48", pulse: 2.7 },
  { id: "dhl", label: "DHL", x: 82, y: 48, color: "#FFCC00", pulse: 3.2 },
  { id: "saas", label: "SaaS ×6", x: 44, y: 72, color: "#06B6D4", pulse: 1.9 },
  { id: "bank", label: "Banking", x: 8, y: 62, color: "#F59E0B", pulse: 2.5 },
];

const LEAKS = [
  { label: "Payments", amount: "€12,400", pct: "2.8% → 1.4%", color: "#635BFF" },
  { label: "Logistics", amount: "€8,200", pct: "+22% above benchmark", color: "#06B6D4" },
  { label: "SaaS Stack", amount: "€5,800", pct: "3 redundant tools", color: "#8B5CF6" },
];

function InfraNode({ node, delay }) {
  return (
    <motion.div
      className="absolute flex flex-col items-center gap-1"
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="relative w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
        style={{ background: `${node.color}18`, border: `1px solid ${node.color}40` }}
        animate={{ y: [0, -3, 0] }}
        transition={{ duration: node.pulse, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          className="absolute inset-0 rounded-xl"
          style={{ background: `${node.color}08` }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: node.pulse, repeat: Infinity }}
        />
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: node.color }} />
      </motion.div>
      <span className="text-[9px] font-semibold text-foreground/40 whitespace-nowrap">{node.label}</span>
    </motion.div>
  );
}

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } } };
const container = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } };

export default function HeroSection_Public() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const score = useCounter(63, 2.0, 1.0);
  const leakage = useCounter(26400, 2.2, 1.3);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center overflow-hidden pt-14">
      {/* Background system */}
      <motion.div className="absolute inset-0 pointer-events-none" style={{ y: bgY }}>
        <div className="absolute inset-0 dot-grid opacity-[0.18]" />
        <div className="absolute top-0 left-[20%] w-[600px] h-[600px] rounded-full blur-[120px]" style={{ background: "radial-gradient(closest-side, rgba(99,91,255,0.10) 0%, transparent 100%)" }} />
        <div className="absolute bottom-10 right-[10%] w-[500px] h-[500px] rounded-full blur-[100px]" style={{ background: "radial-gradient(closest-side, rgba(6,182,212,0.08) 0%, transparent 100%)" }} />
        <div className="absolute top-[30%] left-[5%] w-[300px] h-[300px] rounded-full blur-[80px]" style={{ background: "radial-gradient(closest-side, rgba(139,92,246,0.07) 0%, transparent 100%)" }} />
      </motion.div>

      <div className="relative z-10 w-full max-w-6xl mx-auto px-5 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-12 lg:gap-16 items-center">
          {/* LEFT */}
          <motion.div variants={container} initial="hidden" animate="show" className="text-center lg:text-left">
            {/* Badge */}
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 mb-7 px-3 py-1.5 rounded-full border border-border/40 bg-background/70 backdrop-blur-sm shadow-sm">
              <motion.div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "#EF4444" }}
                animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
              <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-foreground/50">Infrastructure Audit Intelligence</span>
            </motion.div>

            {/* Headline */}
            <motion.h1 variants={fadeUp} className="text-[clamp(2.6rem,7.5vw,6.8rem)] font-black tracking-[-0.05em] leading-[0.87] mb-7 text-center lg:text-left">
              Your business is probably{" "}
              <span className="relative inline-block">
                <span className="relative z-10" style={{ background: "linear-gradient(135deg, #EF4444 0%, #F97316 50%, #EF4444 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>leaking margin.</span>
                <motion.div
                  className="absolute -bottom-1 left-0 right-0 h-[3px] rounded-full"
                  style={{ background: "linear-gradient(90deg, #EF4444, #F97316)" }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.8, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                />
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p variants={fadeUp} className="text-[clamp(1rem,2.2vw,1.35rem)] font-medium text-foreground/65 mb-8 max-w-[640px] mx-auto lg:mx-0 leading-[1.5] text-center lg:text-left">
              CAMBRA audits your operational infrastructure and identifies where your business is overpaying across payments, shipping, SaaS, telecom, banking and operational systems.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 items-center justify-center lg:justify-start mb-5">
              <a href="/Analyzer" className="group relative h-14 rounded-full px-10 text-base font-bold text-white shadow-lg inline-flex items-center justify-center gap-2 overflow-hidden" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" style={{ background: "linear-gradient(135deg, #635BFF20, #06B6D420)" }} />
                <Zap className="h-4 w-4 relative z-10" />
                <span className="relative z-10">Run Infrastructure Audit</span>
                <ArrowRight className="h-4 w-4 relative z-10" />
              </a>
              <a href="/Analyzer?preview=1" className="h-14 rounded-full px-8 text-base font-semibold border border-border/60 bg-background/60 backdrop-blur-sm text-foreground/80 hover:border-foreground/40 hover:text-foreground transition-all inline-flex items-center justify-center gap-2">
                View Audit Preview
              </a>
            </motion.div>

            <motion.p variants={fadeUp} className="text-[11px] text-muted-foreground/40 text-center lg:text-left">
              Takes less than 3 minutes · No credit card required
            </motion.p>

            {/* Live stats */}
            <motion.div variants={fadeUp} className="mt-10 grid grid-cols-3 gap-3 max-w-[500px] mx-auto lg:mx-0">
              {[
                { label: "Avg. recoverable margin", value: "€29K/yr", sub: "per brand audited" },
                { label: "Infrastructure inefficiencies", value: "4.2", sub: "avg. detected per audit" },
                { label: "Time to complete audit", value: "<3 min", sub: "interactive flow" },
              ].map((stat, i) => (
                <motion.div key={i} className="p-3 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm" whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
                  <div className="text-lg font-black tracking-tight text-foreground">{stat.value}</div>
                  <div className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT — Infrastructure Visual */}
          <div className="hidden lg:block">
            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Main audit card */}
              <div className="rounded-2xl border border-border/50 bg-card/90 backdrop-blur-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-border/40 flex items-center justify-between bg-background/50">
                  <div className="flex items-center gap-2">
                    <motion.div className="w-2 h-2 rounded-full bg-red-500" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
                    <span className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground/50">Live Audit · Infrastructure Map</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3 w-3 text-muted-foreground/30" />
                    <span className="text-[9px] text-muted-foreground/30">Scanning…</span>
                  </div>
                </div>

                {/* Infrastructure Map */}
                <div className="relative h-[200px] overflow-hidden bg-gradient-to-br from-background to-secondary/20">
                  {/* Connection lines */}
                  <svg className="absolute inset-0 w-full h-full" style={{ opacity: 0.2 }}>
                    {NODES.map((node, i) =>
                      NODES.slice(i + 1, i + 3).map((target, j) => (
                        <motion.line
                          key={`${node.id}-${target.id}`}
                          x1={`${node.x}%`} y1={`${node.y}%`}
                          x2={`${target.x}%`} y2={`${target.y}%`}
                          stroke="hsl(var(--border))" strokeWidth="1"
                          strokeDasharray="4 4"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 0.6 }}
                          transition={{ delay: 0.5 + i * 0.15, duration: 0.8 }}
                        />
                      ))
                    )}
                  </svg>
                  {NODES.map((node, i) => (
                    <InfraNode key={node.id} node={node} delay={0.4 + i * 0.12} />
                  ))}
                  {/* Score overlay */}
                  <motion.div
                    className="absolute bottom-3 right-3 rounded-xl border border-border/40 bg-background/80 backdrop-blur-sm p-2.5 flex items-center gap-2"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.1 }}
                  >
                    <div className="relative w-8 h-8">
                      <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                        <circle cx="16" cy="16" r="12" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
                        <motion.circle cx="16" cy="16" r="12" fill="none" stroke="#EF4444" strokeWidth="3" strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 12}
                          initial={{ strokeDashoffset: 2 * Math.PI * 12 }}
                          animate={{ strokeDashoffset: 2 * Math.PI * 12 * (1 - 0.63) }}
                          transition={{ delay: 1.2, duration: 1.4, ease: "easeOut" }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] font-black text-red-500">{score}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-foreground/70">Efficiency Score</div>
                      <div className="text-[8px] text-red-500">Below benchmark</div>
                    </div>
                  </motion.div>
                </div>

                {/* Leakage list */}
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[10px] font-bold text-foreground/60 uppercase tracking-[0.18em]">Inefficiencies detected</span>
                  </div>
                  {LEAKS.map((leak, i) => (
                    <motion.div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-background/50"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.8 + i * 0.12, duration: 0.4 }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: leak.color }} />
                        <div>
                          <div className="text-xs font-semibold">{leak.label}</div>
                          <div className="text-[9px] text-muted-foreground/40">{leak.pct}</div>
                        </div>
                      </div>
                      <div className="text-sm font-black" style={{ color: leak.color }}>
                        {leak.amount}
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Total leakage */}
                <motion.div
                  className="mx-4 mb-4 p-4 rounded-xl text-white flex items-center justify-between"
                  style={{ background: "linear-gradient(135deg, #1a1a2e, #0f3460)" }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3 }}
                >
                  <div>
                    <div className="text-[9px] uppercase tracking-[0.2em] opacity-40 mb-0.5">Estimated recoverable margin</div>
                    <div className="text-2xl font-black tabular-nums">
                      €{leakage.toLocaleString()}<span className="text-sm font-normal opacity-40">/yr</span>
                    </div>
                  </div>
                  <a href="/Analyzer" className="h-8 px-3.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition border border-white/15 flex items-center gap-1.5">
                    Audit <ArrowRight size={9} />
                  </a>
                </motion.div>
              </div>

              {/* Floating alert */}
              <motion.div
                className="absolute -top-3 -left-3 rounded-xl border border-red-200/40 bg-red-50/90 backdrop-blur-sm px-3.5 py-2.5 flex items-center gap-2 shadow-lg"
                initial={{ opacity: 0, scale: 0.7, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 1.5, type: "spring", stiffness: 300, damping: 20 }}
              >
                <TrendingDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <span className="text-[11px] font-semibold text-red-700">Margin leakage detected</span>
              </motion.div>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </section>
  );
}