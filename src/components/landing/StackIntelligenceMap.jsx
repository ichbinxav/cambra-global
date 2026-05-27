import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";

/**
 * StackIntelligenceMap — THE iconic visual.
 *
 * A radial intelligence graph of 8 operational layers connected to a central
 * benchmark engine. Each node pulses, surfaces its drift, and emits a live
 * finding into the side feed. Feels like a living operating system.
 */

const LAYERS = [
  { id: "psp",    label: "💳 PSP",       angle: 270, drift: +0.3,  unit: "pp",     finding: "💳 PSP +0.3pp vs peer median",          state: "drift" },
  { id: "ship",   label: "📦 Ship",      angle: 315, drift: +0.40, unit: "€/order",finding: "📦 Shipping +€0.40 / order",            state: "drift" },
  { id: "saas",   label: "🧰 SaaS",      angle: 360, drift: +2,    unit: "dupes",  finding: "🧰 2 duplicate SaaS tools",             state: "alert" },
  { id: "bank",   label: "🏦 Bank",      angle: 45,  drift: +18,   unit: "€/mo",   finding: "🏦 Fixed bank fees +€18 / mo",          state: "mild" },
  { id: "fx",     label: "💱 FX",        angle: 90,  drift: +0.4,  unit: "pp",     finding: "💱 FX spread +0.4pp",                   state: "drift" },
  { id: "tpe",    label: "🛒 TPE",       angle: 135, drift: +0.2,  unit: "pp",     finding: "🛒 TPE all-in +0.2pp",                  state: "mild" },
  { id: "ins",    label: "🛡️ Ins",      angle: 180, drift: +6,    unit: "bps",    finding: "🛡️ RC Pro +6 bps",                     state: "mild" },
  { id: "tel",    label: "📞 Telecom",   angle: 225, drift: 0,     unit: "—",      finding: "📞 Telecom aligned with peer",          state: "ok" },
];

const STATE_COLOR = {
  alert: "#EF4444",
  drift: "#8B5CF6",
  mild:  "#06B6D4",
  ok:    "#22C55E",
};

function polar(angle, radius) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

export default function StackIntelligenceMap() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setActiveIdx((i) => (i + 1) % LAYERS.length), 1800);
    return () => clearInterval(t);
  }, []);

  const focusIdx = useMemo(() => {
    if (hoveredId) {
      const i = LAYERS.findIndex((l) => l.id === hoveredId);
      return i >= 0 ? i : activeIdx;
    }
    return activeIdx;
  }, [hoveredId, activeIdx]);

  const focus = LAYERS[focusIdx];
  const RADIUS = 160;
  const NODE_R = 26;

  // Live findings feed (last 5 surfaced)
  const feed = useMemo(() => {
    const order = [];
    for (let i = 0; i < 5; i++) {
      const idx = (focusIdx - i + LAYERS.length) % LAYERS.length;
      order.push({ ...LAYERS[idx], age: i });
    }
    return order;
  }, [focusIdx]);

  return (
    <section className="relative py-24 md:py-32 bg-neon-1 text-neon-9 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60rem] h-[60rem] rounded-full blur-[140px] opacity-50"
             style={{ background: "radial-gradient(circle, rgba(31,78,216,0.25), transparent 60%)" }} />
      </div>

      <div className="relative max-w-6xl mx-auto px-5">
        {/* Section header — minimal */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
            <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-white/60">
              Stack Intelligence · Live
            </span>
          </div>
          <h2 className="font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.04em] leading-[0.92] max-w-3xl mx-auto">
            One engine.<br />
            <span className="text-saas-gradient">Eight margin levers.</span>
          </h2>
          <p className="mt-4 text-sm md:text-base text-white/55 max-w-xl mx-auto leading-relaxed">
            Hover a node. See the lever, the delta, the recovery — live.
          </p>
        </div>

        {/* Map + Feed */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-stretch">
          {/* The radial map */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md p-6 md:p-8 flex items-center justify-center min-h-[480px] relative overflow-hidden">
            {/* Scan rings */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {[0.4, 0.7, 1.0].map((s, i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border border-white/[0.06]"
                  style={{ width: RADIUS * 2 * s, height: RADIUS * 2 * s }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.4 }}
                />
              ))}
            </div>

            <svg
              viewBox={`-${RADIUS + NODE_R + 20} -${RADIUS + NODE_R + 20} ${(RADIUS + NODE_R + 20) * 2} ${(RADIUS + NODE_R + 20) * 2}`}
              className="w-full max-w-[440px] h-auto relative z-10"
            >
              {/* Connection lines from center to nodes */}
              {LAYERS.map((layer, i) => {
                const { x, y } = polar(layer.angle, RADIUS);
                const isActive = i === focusIdx;
                return (
                  <motion.line
                    key={`line-${layer.id}`}
                    x1={0} y1={0} x2={x} y2={y}
                    stroke={isActive ? STATE_COLOR[layer.state] : "rgba(255,255,255,0.08)"}
                    strokeWidth={isActive ? 1.5 : 0.6}
                    animate={{
                      strokeOpacity: isActive ? 1 : 0.4,
                    }}
                    transition={{ duration: 0.4 }}
                  />
                );
              })}

              {/* Center node — CAMBRA engine */}
              <circle cx={0} cy={0} r={32} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
              <motion.circle
                cx={0} cy={0} r={32}
                fill="none"
                stroke={STATE_COLOR[focus.state]}
                strokeWidth={1.5}
                animate={{ opacity: [0.4, 0.9, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <text x={0} y={-3} textAnchor="middle" className="fill-white font-mono" style={{ fontSize: 9, letterSpacing: "0.15em" }}>
                CAMBRA
              </text>
              <text x={0} y={9} textAnchor="middle" className="fill-white/40 font-mono" style={{ fontSize: 7 }}>
                ENGINE
              </text>

              {/* Layer nodes */}
              {LAYERS.map((layer, i) => {
                const { x, y } = polar(layer.angle, RADIUS);
                const isActive = i === focusIdx;
                const color = STATE_COLOR[layer.state];
                return (
                  <g
                    key={layer.id}
                    onMouseEnter={() => setHoveredId(layer.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Outer pulse on active */}
                    {isActive && (
                      <motion.circle
                        cx={x} cy={y} r={NODE_R}
                        fill="none"
                        stroke={color}
                        strokeWidth={1}
                        animate={{ r: [NODE_R, NODE_R + 14], opacity: [0.6, 0] }}
                        transition={{ duration: 1.6, repeat: Infinity }}
                      />
                    )}
                    {/* Node */}
                    <motion.circle
                      cx={x} cy={y} r={NODE_R}
                      fill={isActive ? color : "rgba(255,255,255,0.03)"}
                      fillOpacity={isActive ? 0.18 : 1}
                      stroke={isActive ? color : "rgba(255,255,255,0.18)"}
                      strokeWidth={isActive ? 1.5 : 1}
                      animate={{ scale: isActive ? 1.08 : 1 }}
                      transition={{ duration: 0.4 }}
                    />
                    {/* Label */}
                    <text
                      x={x} y={y - 2}
                      textAnchor="middle"
                      className="fill-white font-semibold pointer-events-none"
                      style={{ fontSize: 10 }}
                    >
                      {layer.label}
                    </text>
                    <text
                      x={x} y={y + 10}
                      textAnchor="middle"
                      className="font-mono pointer-events-none"
                      style={{ fontSize: 8, fill: isActive ? color : "rgba(255,255,255,0.4)" }}
                    >
                      {layer.drift === 0
                        ? "ok"
                        : layer.unit === "€/order"
                          ? `+€${layer.drift.toFixed(2)}`
                          : layer.unit === "€/mo"
                            ? `+€${layer.drift}/mo`
                            : layer.unit === "dupes"
                              ? `${layer.drift} dupes`
                              : `+${layer.drift}${layer.unit}`}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Bottom meta */}
            <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.18em] text-white/35">
              <span>scanning</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cambra-mint animate-pulse" />
                live engine
              </span>
            </div>
          </div>

          {/* Live finding feed */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
                <span className="text-[9px] uppercase tracking-[0.2em] text-white/50 font-mono">Signal stream</span>
              </div>
              <span className="text-[9px] font-mono text-white/30">{LAYERS.length}/8</span>
            </div>

            <div className="flex-1 space-y-2 overflow-hidden">
              <AnimatePresence initial={false}>
                {feed.map((f, i) => (
                  <motion.div
                    key={`${f.id}-${focusIdx}`}
                    initial={{ opacity: 0, x: -8, height: 0 }}
                    animate={{
                      opacity: 1 - i * 0.18,
                      x: 0,
                      height: "auto",
                    }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex items-start gap-2.5 py-2 border-b border-white/[0.05] last:border-0"
                  >
                    <span
                      className="mt-1 h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: STATE_COLOR[f.state] }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] uppercase tracking-[0.15em] font-mono text-white/40 mb-0.5">
                        {f.label}
                      </p>
                      <p className="text-[11px] text-white/85 leading-snug">{f.finding}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <a
              href="/Analyzer"
              className="mt-4 h-10 rounded-full text-xs font-bold tracking-[0.12em] uppercase bg-white text-neon-1 hover:bg-white/90 transition inline-flex items-center justify-center gap-2"
            >
              Benchmark my stack <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}