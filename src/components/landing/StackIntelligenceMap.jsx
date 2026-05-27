import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Activity, Zap, AlertTriangle } from "lucide-react";

/**
 * StackIntelligenceMap — THE iconic visual.
 *
 * A radial intelligence graph of 8 operational layers connected to a central
 * benchmark engine. A live findings feed shows what the engine just detected
 * — no redundant grid. The side panel adds context, never repeats the map.
 */

const LAYERS = [
  { id: "psp",  label: "Payments",  angle: 270, drift: +0.3,  unit: "pp",      finding: "PSP fees +0.3pp above peer median",      recovery: 11400, state: "drift" },
  { id: "ship", label: "Shipping",  angle: 315, drift: +0.40, unit: "€/order", finding: "Shipping +€0.40 per parcel",             recovery: 6900,  state: "drift" },
  { id: "saas", label: "SaaS",      angle: 360, drift: +2,    unit: "dupes",   finding: "2 duplicate SaaS subscriptions",         recovery: 8200,  state: "alert" },
  { id: "bank", label: "Banking",   angle: 45,  drift: +18,   unit: "€/mo",    finding: "Fixed bank fees +€18 / month",           recovery: 220,   state: "mild" },
  { id: "fx",   label: "FX",        angle: 90,  drift: +0.4,  unit: "pp",      finding: "FX spread +0.4pp above peer",            recovery: 4100,  state: "drift" },
  { id: "tpe",  label: "In-store",  angle: 135, drift: +0.2,  unit: "pp",      finding: "In-store fees +0.2pp all-in",            recovery: 1800,  state: "mild" },
  { id: "ins",  label: "Insurance", angle: 180, drift: +6,    unit: "bps",     finding: "Insurance +6 bps above tier",            recovery: 950,   state: "mild" },
  { id: "tel",  label: "Telecom",   angle: 225, drift: 0,     unit: "—",       finding: "Telecom matches peer median",            recovery: 0,     state: "ok" },
];

const STATE = {
  alert: { color: "#EF4444", label: "Overpaid",  Icon: AlertTriangle },
  drift: { color: "#8B5CF6", label: "Drift",     Icon: Activity },
  mild:  { color: "#06B6D4", label: "Mild gap",  Icon: Activity },
  ok:    { color: "#22C55E", label: "Aligned",   Icon: Zap },
};

const TOTAL_RECOVERY = LAYERS.reduce((s, l) => s + l.recovery, 0);
const FLAGGED = LAYERS.filter(l => l.state !== "ok").length;

function polar(angle, radius) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
}

function formatDrift(layer) {
  if (layer.drift === 0) return "aligned";
  if (layer.unit === "€/order") return `+€${layer.drift.toFixed(2)}/order`;
  if (layer.unit === "€/mo") return `+€${layer.drift}/mo`;
  if (layer.unit === "dupes") return `${layer.drift} dupes`;
  return `+${layer.drift}${layer.unit}`;
}

export default function StackIntelligenceMap() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);

  useEffect(() => {
    if (hoveredId) return;
    const t = setInterval(() => setActiveIdx((i) => (i + 1) % LAYERS.length), 2200);
    return () => clearInterval(t);
  }, [hoveredId]);

  const focusIdx = hoveredId ? LAYERS.findIndex((l) => l.id === hoveredId) : activeIdx;
  const focus = LAYERS[focusIdx >= 0 ? focusIdx : activeIdx];
  const focusState = STATE[focus.state];
  const RADIUS = 160;
  const NODE_R = 26;

  return (
    <section className="relative pt-32 md:pt-40 pb-24 md:pb-32 bg-neon-1 text-neon-9 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60rem] h-[60rem] rounded-full blur-[140px] opacity-50"
             style={{ background: "radial-gradient(circle, rgba(31,78,216,0.25), transparent 60%)" }} />
      </div>

      <div className="relative max-w-6xl mx-auto px-5">
        {/* Section header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
            <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-white/60">
              Stack Intelligence · Live
            </span>
          </div>
          <h2 className="font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.04em] leading-[0.92] max-w-3xl mx-auto">
            Every cost, in one place.<br />
            <span className="text-saas-gradient">Eight layers. One screen.</span>
          </h2>
          <p className="mt-4 text-sm md:text-base text-white/55 max-w-xl mx-auto leading-relaxed">
            Continuously benchmarked against brands your exact size and country.
          </p>
        </div>

        {/* Map + Live feed */}
        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-6 items-stretch">
          {/* The radial map */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md p-6 md:p-8 flex items-center justify-center min-h-[480px] relative overflow-hidden">
            <svg
              viewBox={`-${RADIUS + NODE_R + 20} -${RADIUS + NODE_R + 20} ${(RADIUS + NODE_R + 20) * 2} ${(RADIUS + NODE_R + 20) * 2}`}
              className="w-full max-w-[440px] h-auto relative z-10"
            >
              <defs>
                {/* Scan arc gradient — fades to transparent so no text overlap */}
                <linearGradient id="scan-arc-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={focusState.color} stopOpacity="0" />
                  <stop offset="70%" stopColor={focusState.color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={focusState.color} stopOpacity="0.7" />
                </linearGradient>
                {/* Expanding pulse ring */}
                <radialGradient id="pulse-ring">
                  <stop offset="85%" stopColor={focusState.color} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={focusState.color} stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Background orbit rings — behind everything */}
              {[64, 112, RADIUS].map((r, i) => (
                <circle key={`ring-${i}`} cx={0} cy={0} r={r}
                  fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}
                  strokeDasharray="3 6" />
              ))}

              {/* Expanding scan pulse — behind nodes, no text overlap */}
              <motion.circle
                cx={0} cy={0} r={RADIUS}
                fill="none" stroke={focusState.color}
                strokeWidth={1.5}
                animate={{ r: [40, RADIUS + 30], opacity: [0.5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.circle
                cx={0} cy={0} r={RADIUS}
                fill="none" stroke={focusState.color}
                strokeWidth={1}
                animate={{ r: [40, RADIUS + 30], opacity: [0.3, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: 1.2 }}
              />

              {/* Scan hand — synced to active node via SVG transform attribute (works in all browsers) */}
              <g
                transform={`rotate(${focus.angle})`}
                style={{ transition: "transform 1.2s cubic-bezier(0.22, 1, 0.36, 1)" }}
              >
                <line
                  x1={0} y1={0} x2={RADIUS - NODE_R - 6} y2={0}
                  stroke={focusState.color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  opacity={0.75}
                />
              </g>

              {/* Connection lines removed — clean radial map without center-to-node links */}

              {/* Center engine — always on top of lines */}
              <circle cx={0} cy={0} r={34} fill="rgba(10,16,36,0.9)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
              <motion.circle
                cx={0} cy={0} r={34}
                fill="none"
                stroke={focusState.color}
                strokeWidth={1.5}
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
              {/* Inner glow */}
              <motion.circle
                cx={0} cy={0} r={22}
                fill={focusState.color}
                animate={{ opacity: [0.04, 0.12, 0.04] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
              <text x={0} y={-4} textAnchor="middle" className="fill-white font-mono" style={{ fontSize: 9, letterSpacing: "0.15em", fontWeight: 700 }}>
                CAMBRA
              </text>
              <text x={0} y={8} textAnchor="middle" className="fill-white/40 font-mono" style={{ fontSize: 7 }}>
                ENGINE
              </text>

              {/* Layer nodes — TOPMOST layer, nothing overlaps these */}
              {LAYERS.map((layer, i) => {
                const { x, y } = polar(layer.angle, RADIUS);
                const isActive = i === focusIdx;
                const color = STATE[layer.state].color;
                return (
                  <g
                    key={layer.id}
                    onMouseEnter={() => setHoveredId(layer.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Soft halo — contained to the node, no expanding ring that reaches neighbors */}
                    {isActive && (
                      <circle
                        cx={x} cy={y} r={NODE_R + 4}
                        fill={color} opacity={0.08}
                        style={{ filter: "blur(6px)" }}
                      />
                    )}
                    {/* Node bg — opaque so nothing bleeds through */}
                    <circle
                      cx={x} cy={y} r={NODE_R}
                      fill="hsl(220, 45%, 7%)"
                    />
                    <motion.circle
                      cx={x} cy={y} r={NODE_R}
                      fill={isActive ? color : "transparent"}
                      fillOpacity={isActive ? 0.15 : 0}
                      stroke={isActive ? color : "rgba(255,255,255,0.15)"}
                      strokeWidth={isActive ? 1.5 : 1}
                      animate={{ scale: isActive ? 1.06 : 1 }}
                      transition={{ duration: 0.4 }}
                      style={{ transformOrigin: `${x}px ${y}px` }}
                    />
                    <text x={x} y={y - 2} textAnchor="middle"
                          className="fill-white font-semibold pointer-events-none"
                          style={{ fontSize: 10 }}>
                      {layer.label}
                    </text>
                    <text x={x} y={y + 10} textAnchor="middle"
                          className="font-mono pointer-events-none"
                          style={{ fontSize: 8, fill: isActive ? color : "rgba(255,255,255,0.4)" }}>
                      {layer.drift === 0 ? "✓ ok" : formatDrift(layer)}
                    </text>
                  </g>
                );
              })}
            </svg>

            <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-[9px] font-mono uppercase tracking-[0.18em] text-white/35">
              <span>infrastructure for independent commerce</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-cambra-mint animate-pulse" />
                live · 8 cost layers
              </span>
            </div>
          </div>

          {/* Live context panel — NOT a duplicate grid */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md p-5 md:p-6 flex flex-col gap-5">
            {/* Status summary chip row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-mono mb-1.5">Flagged</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black tabular-nums text-white">{FLAGGED}</span>
                  <span className="text-[10px] font-mono text-white/40">/ 8</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-mono mb-1.5">Tier</div>
                <div className="text-sm font-bold text-white leading-tight">€1–5M</div>
                <div className="text-[9px] font-mono text-white/40">EU · DTC</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-mono mb-1.5">Refresh</div>
                <div className="text-sm font-bold text-white leading-tight">15 min</div>
                <div className="text-[9px] font-mono text-cambra-mint">continuous</div>
              </div>
            </div>

            {/* Live finding card — animates as the engine cycles */}
            <div className="relative rounded-xl border overflow-hidden"
                 style={{ borderColor: `${focusState.color}40`, background: `${focusState.color}0D` }}>
              <div className="px-4 py-2 border-b flex items-center justify-between"
                   style={{ borderColor: `${focusState.color}30`, background: `${focusState.color}14` }}>
                <div className="flex items-center gap-2">
                  <focusState.Icon className="h-3 w-3" style={{ color: focusState.color }} />
                  <span className="text-[9px] uppercase tracking-[0.22em] font-mono" style={{ color: focusState.color }}>
                    {focusState.label} · {focus.label}
                  </span>
                </div>
                <span className="text-[9px] font-mono text-white/40">
                  {String(focusIdx + 1).padStart(2, "0")} / 08
                </span>
              </div>

              <div className="p-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={focus.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                  >
                    <p className="text-sm text-white/90 leading-snug mb-3 font-medium">
                      {focus.finding}
                    </p>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-mono mb-0.5">Current drift</div>
                        <div className="text-base font-bold tabular-nums" style={{ color: focusState.color }}>
                          {formatDrift(focus)}
                        </div>
                      </div>
                      {focus.recovery > 0 && (
                        <div className="text-right">
                          <div className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-mono mb-0.5">Recoverable</div>
                          <div className="text-base font-black tabular-nums text-white">
                            €{(focus.recovery / 1000).toFixed(1)}K<span className="text-[10px] font-mono text-white/40">/yr</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {/* Total recovery */}
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.01] p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-[0.22em] text-white/45 font-mono">
                  Total recoverable
                </span>
                <span className="text-[9px] font-mono text-white/30">aggregated</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black tracking-tight text-saas-gradient tabular-nums">
                  €{(TOTAL_RECOVERY / 1000).toFixed(1)}K
                </span>
                <span className="text-[10px] font-mono text-white/40">/ yr · estimate</span>
              </div>
            </div>

            <a
              href="/Analyzer"
              className="h-11 rounded-full text-xs font-bold tracking-[0.12em] uppercase bg-white text-neon-1 hover:bg-white/90 transition inline-flex items-center justify-center gap-2"
            >
              Benchmark my stack <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}