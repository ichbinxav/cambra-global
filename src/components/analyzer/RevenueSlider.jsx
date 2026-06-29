import { useMemo } from "react";

/**
 * RevenueSlider — continuous monthly revenue slider with a non-linear feel.
 *
 * The slider value is a 0–1000 internal index; we map it to a euro amount
 * using a power curve so the lower end (where most brands live) has more
 * granularity than the high end.
 *
 * Range: €0 → €1,000,000+ monthly. Anything above 950 maps to "€1M+".
 *
 * Internally still produces a `monthly_revenue_range` key compatible with
 * the existing scoreEngine / AnalyzerInput contract.
 */

const MAX_INDEX = 1000;
const MAX_EUR = 1_000_000;
const CURVE = 3.2; // higher = more low-end resolution

function indexToEur(idx) {
  if (idx <= 0) return 0;
  if (idx >= MAX_INDEX) return MAX_EUR;
  const t = idx / MAX_INDEX;
  return Math.round((Math.pow(t, CURVE) * MAX_EUR) / 100) * 100;
}

function eurToIndex(eur) {
  if (eur <= 0) return 0;
  if (eur >= MAX_EUR) return MAX_INDEX;
  const t = Math.pow(eur / MAX_EUR, 1 / CURVE);
  return Math.round(t * MAX_INDEX);
}

export function eurToRangeKey(eur) {
  if (eur < 10_000) return "under_10k";
  if (eur < 50_000) return "10k_50k";
  if (eur < 100_000) return "50k_100k";
  if (eur < 500_000) return "100k_500k";
  return "over_500k";
}

function formatEur(eur) {
  if (eur >= MAX_EUR) return "€1M+ / mo";
  if (eur >= 1_000_000) return `€${(eur / 1_000_000).toFixed(1)}M / mo`;
  if (eur >= 1_000) return `€${Math.round(eur / 1_000)}k / mo`;
  if (eur > 0) return `€${eur.toLocaleString()} / mo`;
  return "€0 / mo";
}

const TICKS = [0, 10_000, 50_000, 100_000, 500_000, MAX_EUR];

/**
 * Props:
 *   - valueEur: number (current revenue in EUR)
 *   - onChangeEur: (eur: number) => void
 */
export default function RevenueSlider({ valueEur = 0, onChangeEur }) {
  const idx = useMemo(() => eurToIndex(valueEur), [valueEur]);
  const pct = (idx / MAX_INDEX) * 100;

  const handleChange = (e) => {
    const newIdx = Number(e.target.value);
    onChangeEur?.(indexToEur(newIdx));
  };

  return (
    <div className="space-y-3">
      {/* Live readout */}
      <div className="flex items-baseline justify-between">
        <span
          className="text-white"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(22px, 4vw, 28px)",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}
        >
          {formatEur(valueEur)}
        </span>
        <span className="text-[10px] uppercase tracking-[0.18em] font-bold text-white/40">
          {valueEur >= MAX_EUR ? "Enterprise" : valueEur >= 500_000 ? "Scale" : valueEur >= 100_000 ? "Growth" : valueEur >= 10_000 ? "Emerging" : "Early"}
        </span>
      </div>

      {/* Slider */}
      <div className="relative pt-1 pb-2">
        {/* Filled track */}
        <div
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full pointer-events-none"
          style={{ background: "rgba(255,255,255,0.10)" }}
        />
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full pointer-events-none"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #3b82f6 0%, #22d3ee 100%)",
            boxShadow: "0 0 12px rgba(34,211,238,0.5)",
          }}
        />

        <input
          type="range"
          min={0}
          max={MAX_INDEX}
          step={1}
          value={idx}
          onChange={handleChange}
          aria-label="Monthly revenue"
          aria-valuemin={0}
          aria-valuemax={MAX_EUR}
          aria-valuenow={valueEur}
          aria-valuetext={formatEur(valueEur)}
          className="cambra-rev-slider relative w-full appearance-none bg-transparent cursor-pointer"
          style={{ height: 28 }}
        />
      </div>

      {/* Tick marks */}
      <div className="flex justify-between text-[10px] text-white/35 font-semibold tabular-nums px-0.5">
        {TICKS.map(tick => (
          <span key={tick}>
            {tick === 0
              ? "€0"
              : tick >= MAX_EUR
              ? "€1M+"
              : tick >= 1000
              ? `€${tick / 1000}k`
              : `€${tick}`}
          </span>
        ))}
      </div>

      <style>{`
        .cambra-rev-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 0 4px rgba(34,211,238,0.18), 0 4px 12px rgba(0,0,0,0.4);
          cursor: grab;
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        .cambra-rev-slider::-webkit-slider-thumb:active {
          cursor: grabbing;
          transform: scale(1.08);
          box-shadow: 0 0 0 6px rgba(34,211,238,0.28), 0 6px 16px rgba(0,0,0,0.5);
        }
        .cambra-rev-slider::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: #ffffff;
          border: 2px solid #22d3ee;
          box-shadow: 0 0 0 4px rgba(34,211,238,0.18), 0 4px 12px rgba(0,0,0,0.4);
          cursor: grab;
        }
        .cambra-rev-slider:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 6px rgba(34,211,238,0.35), 0 4px 12px rgba(0,0,0,0.4);
        }
      `}</style>
    </div>
  );
}