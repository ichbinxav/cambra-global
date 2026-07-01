import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";

/**
 * InfrastructureHeatmap — the iconic "holy shit" moment.
 *
 * Dense matrix of operational layers (rows) × tier benchmarks (cols).
 * Each cell is colored by drift vs peer median. Hover reveals an insight.
 * Designed to feel like a Bloomberg terminal × Palantir × Ramp.
 */

const LAYERS = [
  { id: "psp",      name: "PSP effective rate",     unit: "%",       you: 2.0,   peer: 1.4 },
  { id: "tpe",      name: "TPE all-in (in-store)",  unit: "%",       you: 1.8,   peer: 1.4 },
  { id: "ship",     name: "Shipping per order",     unit: "€",       you: 6.20,  peer: 5.40 },
  { id: "intl",     name: "Cross-border FX spread", unit: "%",       you: 1.6,   peer: 0.9 },
  { id: "saas",     name: "SaaS / GMV ratio",       unit: "%",       you: 0.95,  peer: 0.70 },
  { id: "ovlp",     name: "Tool overlap",           unit: "tools",   you: 3,     peer: 1 },
  { id: "bank",     name: "Banking fixed fees",     unit: "€/mo",    you: 38,    peer: 18 },
  { id: "ins",      name: "RC Pro / revenue",       unit: "bps",     you: 22,    peer: 14 },
];

const COLS = [
  { id: "micro", label: "Micro", factor: 1.18 },
  { id: "small", label: "Small", factor: 1.05 },
  { id: "mid",   label: "Mid",   factor: 1.00 },
  { id: "large", label: "Large", factor: 0.92 },
];

// Drift = (you - peer*factor) / (peer*factor)
function computeDrift(row, col) {
  const peer = row.peer * col.factor;
  if (peer === 0) return 0;
  return (row.you - peer) / peer;
}

function cellColor(drift) {
  // drift > 0 means overpay vs peer (bad)
  const d = Math.max(-0.4, Math.min(0.6, drift));
  if (d <= 0) {
    // mint band (within or below peer)
    const intensity = Math.min(1, Math.abs(d) / 0.4);
    return `rgba(44, 167, 193, ${0.10 + intensity * 0.18})`;
  }
  // drift band — escalating
  const intensity = Math.min(1, d / 0.5);
  if (d < 0.10) return `rgba(31, 78, 216, ${0.10 + intensity * 0.22})`;
  if (d < 0.25) return `rgba(124, 58, 237, ${0.18 + intensity * 0.30})`;
  return `rgba(220, 38, 38, ${0.18 + intensity * 0.40})`;
}

function formatDelta(row, col) {
  const peer = row.peer * col.factor;
  const diff = row.you - peer;
  const sign = diff > 0 ? "+" : "";
  if (row.unit === "%") return `${sign}${diff.toFixed(1)}pp`;
  if (row.unit === "€") return `${sign}€${diff.toFixed(2)}`;
  if (row.unit === "€/mo") return `${sign}€${Math.round(diff)}/mo`;
  if (row.unit === "bps") return `${sign}${Math.round(diff)} bps`;
  return `${sign}${diff.toFixed(0)}`;
}

export default function InfrastructureHeatmap() {
  const [hovered, setHovered] = useState(null); // {row, col}
  const [scanRow, setScanRow] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setScanRow((i) => (i + 1) % LAYERS.length), 900);
    return () => clearInterval(t);
  }, []);

  const focus = hovered
    ? { row: LAYERS[hovered.row], col: COLS[hovered.col], drift: computeDrift(LAYERS[hovered.row], COLS[hovered.col]) }
    : { row: LAYERS[scanRow], col: COLS[2], drift: computeDrift(LAYERS[scanRow], COLS[2]) };

  return (
    <section id="heatmap" className="relative py-24 md:py-32 bg-neon-1 text-neon-9 overflow-hidden">
      {/* Ambient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-[60rem] h-[60rem] rounded-full blur-[120px]"
             style={{ background: "radial-gradient(circle, rgba(31,78,216,0.18), transparent 60%)" }} />
        <div className="absolute bottom-0 right-1/4 w-[40rem] h-[40rem] rounded-full blur-[100px]"
             style={{ background: "radial-gradient(circle, rgba(44,167,193,0.14), transparent 60%)" }} />
      </div>

      <div className="relative max-w-6xl mx-auto px-5">
        {/* Header */}
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-end mb-10">
          <div>
            <div className="inline-flex items-center gap-2 mb-5 px-2.5 py-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
              <span className="text-[10px] font-mono tracking-[0.22em] uppercase text-white/60">
                Infrastructure Heatmap · Live
              </span>
            </div>
            <h2 className="font-display text-[clamp(2rem,5vw,3.6rem)] font-black tracking-[-0.04em] leading-[0.92]">
              The economic layer,<br />
              <span className="text-saas-gradient">benchmarked in real time.</span>
            </h2>
            <p className="mt-4 text-sm md:text-base text-white/55 max-w-xl leading-relaxed">
              Every operational layer continuously compared against peer medians. Drift, overlap and inefficiency surface the moment they appear.
            </p>
          </div>
          <a href="/Analyzer" className="hidden md:inline-flex h-11 rounded-full px-5 text-xs font-bold tracking-[0.12em] uppercase items-center gap-2 border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] transition">
            Run my audit <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* Matrix */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          {/* Heatmap card */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md overflow-hidden">
            {/* Column header */}
            <div className="grid grid-cols-[180px_repeat(4,minmax(0,1fr))] gap-px bg-white/[0.04] px-3 py-2.5 border-b border-white/10">
              <span className="text-[9px] uppercase tracking-[0.18em] text-white/40 font-mono">Layer</span>
              {COLS.map((c) => (
                <span key={c.id} className="text-[9px] uppercase tracking-[0.18em] text-white/40 font-mono text-center">
                  {c.label}
                </span>
              ))}
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/[0.04]">
              {LAYERS.map((row, ri) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-[180px_repeat(4,minmax(0,1fr))] gap-px px-3 py-2 transition-colors ${
                    scanRow === ri && !hovered ? "bg-white/[0.025]" : ""
                  }`}
                >
                  <div className="flex flex-col justify-center min-w-0 pr-3">
                    <span className="text-[11px] font-semibold text-white/90 truncate">{row.name}</span>
                    <span className="text-[9px] font-mono text-white/35 mt-0.5">
                      you {row.unit === "€" || row.unit === "€/mo" ? "€" : ""}{row.you}{row.unit === "%" ? "%" : ""}
                    </span>
                  </div>

                  {COLS.map((col, ci) => {
                    const drift = computeDrift(row, col);
                    const isFocus = hovered && hovered.row === ri && hovered.col === ci;
                    return (
                      <motion.button
                        key={col.id}
                        onMouseEnter={() => setHovered({ row: ri, col: ci })}
                        onMouseLeave={() => setHovered(null)}
                        animate={{
                          backgroundColor: cellColor(drift),
                          scale: isFocus ? 1.04 : 1,
                        }}
                        transition={{ duration: 0.25 }}
                        className="relative h-12 rounded-md border border-white/[0.04] flex items-center justify-center cursor-pointer overflow-hidden"
                      >
                        <span className="text-[10px] font-mono tabular-nums text-white/85">
                          {formatDelta(row, col)}
                        </span>
                        {isFocus && (
                          <span className="absolute inset-0 ring-1 ring-white/40 rounded-md pointer-events-none" />
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3 text-[9px] uppercase tracking-[0.18em] text-white/40 font-mono">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(44,167,193,0.32)" }} /> Within peer</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(31,78,216,0.32)" }} /> Mild drift</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(124,58,237,0.40)" }} /> Drift</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgba(220,38,38,0.42)" }} /> Alert</span>
              </div>
              <span className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-mono">
                32 cells · {LAYERS.length} layers · 4 tiers
              </span>
            </div>
          </div>

          {/* Insight panel */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-md p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <span className="h-1.5 w-1.5 rounded-full bg-cambra-mint animate-pulse" />
              <span className="text-[9px] uppercase tracking-[0.2em] text-white/50 font-mono">Live finding</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${focus.row.id}-${focus.col.id}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
                className="flex-1"
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/35 font-mono mb-1.5">
                  {focus.col.label} tier · {focus.row.name}
                </p>
                <p className="text-2xl font-black tracking-tight leading-tight text-white">
                  {focus.drift > 0
                    ? `${(focus.drift * 100).toFixed(0)}% above peer median`
                    : focus.drift < 0
                    ? `${Math.abs(focus.drift * 100).toFixed(0)}% below peer median`
                    : `aligned with peer median`}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-mono mb-1">You</p>
                    <p className="text-sm font-mono tabular-nums text-white">
                      {focus.row.unit === "€" ? "€" : focus.row.unit === "€/mo" ? "€" : ""}
                      {focus.row.you}
                      {focus.row.unit === "%" ? "%" : ""}
                      {focus.row.unit === "€/mo" ? "/mo" : ""}
                      {focus.row.unit === "bps" ? " bps" : ""}
                      {focus.row.unit === "tools" ? " tools" : ""}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[9px] uppercase tracking-[0.18em] text-white/35 font-mono mb-1">Peer</p>
                    <p className="text-sm font-mono tabular-nums text-white/70">
                      {focus.row.unit === "€" ? "€" : focus.row.unit === "€/mo" ? "€" : ""}
                      {(focus.row.peer * focus.col.factor).toFixed(focus.row.unit === "€" ? 2 : focus.row.unit === "bps" || focus.row.unit === "€/mo" || focus.row.unit === "tools" ? 0 : 1)}
                      {focus.row.unit === "%" ? "%" : ""}
                      {focus.row.unit === "€/mo" ? "/mo" : ""}
                      {focus.row.unit === "bps" ? " bps" : ""}
                      {focus.row.unit === "tools" ? " tools" : ""}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-xs text-white/55 leading-relaxed">
                  {focus.drift > 0.20
                    ? "Material drift detected. Likely benchmark inefficiency — recommend audit."
                    : focus.drift > 0.05
                    ? "Mild drift. Within tolerance but compounding silently."
                    : "Operating within peer range. Continuous monitoring active."}
                </p>
              </motion.div>
            </AnimatePresence>

            <a
              href="/Analyzer"
              className="mt-5 h-10 rounded-full text-xs font-bold tracking-[0.12em] uppercase bg-card text-neon-1 hover:bg-white/90 transition inline-flex items-center justify-center gap-2"
            >
              Benchmark my stack <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}