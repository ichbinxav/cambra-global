import { motion, useInView } from "framer-motion";
import { useRef } from "react";

/**
 * OperationalTension — economic tension + live visual identity.
 *
 * Sharp, asymmetric, dense. Left side carries the high-tension premise;
 * right side carries a live drift readout — animated bars + sparklines that
 * make the section feel alive without repeating buzzwords.
 */

const DRIFTS = [
  { layer: "PSP",      delta: "+0.6pp",  pct: 62, color: "#635BFF", trend: [4, 5, 4, 6, 7, 8, 9, 11] },
  { layer: "Shipping", delta: "+€0.12",  pct: 48, color: "#06B6D4", trend: [6, 5, 6, 7, 7, 8, 9, 10] },
  { layer: "SaaS",     delta: "2 dupes", pct: 84, color: "#8B5CF6", trend: [3, 4, 5, 6, 8, 9, 10, 12] },
  { layer: "FX",       delta: "+0.7pp",  pct: 55, color: "#22C55E", trend: [5, 6, 5, 7, 8, 8, 9, 10] },
  { layer: "TPE",      delta: "+0.4pp",  pct: 38, color: "#F97316", trend: [4, 4, 5, 5, 6, 6, 7, 8] },
];

function Sparkline({ data, color }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const W = 56;
  const H = 18;
  const step = W / (data.length - 1);
  const points = data.map((v, i) => `${i * step},${H - ((v - min) / range) * H}`).join(" ");
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function OperationalTension() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="py-24 md:py-28 border-y border-border/40 bg-background relative overflow-hidden">
      {/* Subtle scan line ambient */}
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
              Most operational cost<br />
              <span className="text-saas-gradient">is never audited.</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-base text-foreground/55 leading-relaxed max-w-md mb-6"
            >
              You measure CAC. You measure margin. You measure conversion.
              <br /><br />
              The cost layer beneath your business drifts silently. No one watches it.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="flex items-baseline gap-3 text-[11px] font-mono text-muted-foreground/50"
            >
              <span className="h-1 w-1 rounded-full bg-cambra-mint animate-pulse" />
              Drift compounds at ~6%/yr · €1–5M tier
            </motion.div>
          </div>

          {/* RIGHT — live drift readout */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur-sm overflow-hidden"
          >
            {/* Terminal header */}
            <div className="px-4 py-2.5 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
                <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground/60 font-mono">
                  Drift readout · sample brand
                </span>
              </div>
              <span className="text-[9px] font-mono text-muted-foreground/40">5 / 8 layers</span>
            </div>

            <div className="px-4 py-2 grid grid-cols-[80px_1fr_60px_56px] gap-3 text-[9px] uppercase tracking-[0.18em] text-muted-foreground/40 font-mono border-b border-border/30">
              <span>Layer</span>
              <span>Drift vs peer</span>
              <span className="text-right">Δ</span>
              <span className="text-right">30d</span>
            </div>

            <div className="divide-y divide-border/30">
              {DRIFTS.map((d, i) => (
                <motion.div
                  key={d.layer}
                  initial={{ opacity: 0, x: 10 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.4, delay: 0.3 + i * 0.08 }}
                  className="px-4 py-3 grid grid-cols-[80px_1fr_60px_56px] gap-3 items-center group hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-xs font-semibold text-foreground/85">{d.layer}</span>

                  {/* Drift bar */}
                  <div className="relative h-1.5 rounded-full bg-border/40 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={inView ? { width: `${d.pct}%` } : {}}
                      transition={{ duration: 1.1, delay: 0.4 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ background: d.color }}
                    />
                    {/* Peer median tick */}
                    <span className="absolute top-1/2 -translate-y-1/2 h-2.5 w-px bg-foreground/30" style={{ left: "50%" }} />
                  </div>

                  <span className="text-[11px] font-mono tabular-nums font-bold text-right" style={{ color: d.color }}>
                    {d.delta}
                  </span>
                  <div className="flex justify-end">
                    <Sparkline data={d.trend} color={d.color} />
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="px-4 py-2.5 bg-secondary/20 border-t border-border/30 flex items-center justify-between text-[9px] font-mono text-muted-foreground/40 uppercase tracking-[0.18em]">
              <span>· peer median</span>
              <span>scanning · 8 layers</span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}