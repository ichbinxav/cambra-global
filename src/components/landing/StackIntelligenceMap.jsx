import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Activity, Zap, AlertTriangle } from "lucide-react";

/**
 * StackIntelligenceMap — Hero-style section with light bg,
 * responsive grid for map + live findings panel.
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
  const NODE_R = 52;

  return (
    <section className="relative py-20 md:py-28 px-5 border-t border-border/40 bg-background overflow-hidden">
      {/* Ambient (matches other landing sections) */}
      <div className="absolute inset-0 dot-grid opacity-20 pointer-events-none" />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/4 w-[40rem] h-[40rem] rounded-full blur-3xl bg-ambient-lilac opacity-[0.15]" />
        <div className="absolute bottom-0 -right-32 w-[36rem] h-[36rem] rounded-full blur-3xl bg-ambient-mint opacity-[0.12]" />
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header — matches landing pattern */}
        <div className="mb-12 md:mb-16 max-w-4xl">
          <div className="flex items-center gap-2 mb-6 w-fit px-3 py-1.5 rounded-full border border-border/60 bg-background/70 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cambra-cyan opacity-75" style={{ animation: "ping-soft 1.8s cubic-bezier(0,0,0.2,1) infinite" }} />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cambra-cyan" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.22em] uppercase text-muted-foreground">Stack Intelligence</span>
          </div>
          <h2 className="font-display text-[clamp(2.4rem,6vw,4.2rem)] font-black tracking-[-0.045em] leading-[0.92]">
            Every cost, in one place.<br />
            <span className="text-saas-gradient">Eight layers. One screen.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed">
            Continuously benchmarked against brands your exact size and country.
          </p>
        </div>

        {/* Map + Live feed */}
        <div className="grid lg:grid-cols-[1.35fr_1fr] gap-5 md:gap-6 items-stretch">
          {/* The radial map — in cambra-card */}
          <div className="cambra-card p-5 sm:p-6 md:p-8 flex flex-col relative overflow-hidden min-h-[420px] md:min-h-[520px]">
            {/* Top meta row */}
            <div className="flex items-center justify-between mb-4 relative z-10">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-cambra-cyan animate-pulse" />
                <span className="text-[9px] font-mono tracking-[0.22em] uppercase text-white/70">
                  Live scan
                </span>
              </div>
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/40 hidden sm:inline">
                8 layers · radial intelligence
              </span>
            </div>

            {/* Map area — centered, fills card */}
            <div className="flex-1 flex items-center justify-center relative z-10 py-4">
            <svg
              viewBox={`-${RADIUS + NODE_R + 20} -${RADIUS + NODE_R + 20} ${(RADIUS + NODE_R + 20) * 2} ${(RADIUS + NODE_R + 20) * 2}`}
              className="w-full max-w-[560px] h-auto"
            >
              <defs>
                <linearGradient id="scan-arc-grad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={focusState.color} stopOpacity="0" />
                  <stop offset="70%" stopColor={focusState.color} stopOpacity="0.35" />
                  <stop offset="100%" stopColor={focusState.color} stopOpacity="0.7" />
                </linearGradient>
                <radialGradient id="pulse-ring">
                  <stop offset="85%" stopColor={focusState.color} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={focusState.color} stopOpacity="0" />
                </radialGradient>
              </defs>

              {[64, 112, RADIUS].map((r, i) => (
                <circle key={`ring-${i}`} cx={0} cy={0} r={r}
                  fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}
                  strokeDasharray="3 6" />
              ))}

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

              <circle cx={0} cy={0} r={48} fill="rgba(10,16,36,0.95)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
              <motion.circle
                cx={0} cy={0} r={48}
                fill="none"
                stroke={focusState.color}
                strokeWidth={1.5}
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
              <motion.circle
                cx={0} cy={0} r={30}
                fill={focusState.color}
                animate={{ opacity: [0.04, 0.12, 0.04] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              />
              <g transform="translate(-16, -18) scale(0.65)">
                <polygon points="20,10 28,14 28,44 20,48" fill="white" />
                <polygon points="32,12 48,22 40,28 24,18" fill="white" />
                <polygon points="24,38 40,48 48,42 32,32" fill="white" />
              </g>

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
                    <text x={x} y={y - 3} textAnchor="middle"
                          className="fill-white font-semibold pointer-events-none"
                          style={{ fontSize: 14, fontWeight: 700 }}>
                      {layer.label}
                    </text>
                    <text x={x} y={y + 12} textAnchor="middle"
                          className="font-mono pointer-events-none"
                          style={{ fontSize: 10, fill: isActive ? color : "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                      {layer.drift === 0 ? "✓ ok" : formatDrift(layer)}
                    </text>
                  </g>
                );
              })}
            </svg>
            </div>

            {/* Bottom meta row — responsive, no overlap */}
            <div className="relative z-10 pt-4 mt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/40">
                infrastructure for independent commerce
              </span>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em]">
                <span className="text-white/45">est. savings</span>
                <span className="text-saas-gradient font-bold tabular-nums">
                  €{(TOTAL_RECOVERY / 1000).toFixed(1)}K/yr
                </span>
              </span>
            </div>
          </div>

          {/* Live context panel — in cambra-card */}
          <div className="cambra-card p-5 md:p-6 flex flex-col gap-5">
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

            {/* Live finding card */}
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
              Run free audit <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}