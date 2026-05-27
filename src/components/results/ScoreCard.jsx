import { useState } from "react";
import { ChevronDown, ChevronUp, ArrowRight, AlertCircle, CheckCircle2, Info } from "lucide-react";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

function DimensionBar({ label, weight, score, desc }) {
  const color = score >= 80 ? "#52EBA4" : score >= 60 ? "#FFB05A" : "#7AA8FF";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white">{label}</span>
          <span className="text-[10px] text-white/40 hidden sm:block">{desc}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-white/40">{weight}</span>
          <span className="text-xs font-black tabular-nums" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ImpactRow({ impact, index }) {
  const severityConfig = {
    high:   { dot: "bg-[#7AA8FF]",  badge: "bg-[#7AA8FF]/15 text-[#7AA8FF] border-[#7AA8FF]/30" },
    medium: { dot: "bg-[#FFB05A]",  badge: "bg-[#FFB05A]/15 text-[#FFB05A] border-[#FFB05A]/30" },
    low:    { dot: "bg-white/30",   badge: "bg-white/5 text-white/55 border-white/15" },
  };
  const cfg = severityConfig[impact.severity] || severityConfig.low;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-white/8 last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-xs font-semibold text-white">{impact.category}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.badge}`}>
            +{impact.pointsGain} pts potential
          </span>
        </div>
        <p className="text-[11px] text-white/55 mb-1">{impact.issue}</p>
        <p className="text-[11px] text-white/75 flex items-center gap-1">
          <ArrowRight size={9} className="shrink-0" />
          {impact.action}
        </p>
      </div>
    </div>
  );
}

export default function ScoreCard({ scoreReport }) {
  const [showDimensions, setShowDimensions] = useState(false);
  const { total, potentialTotal, label, scoreColor, accuracyLabel, dimensions, impacts, dataQuality } = scoreReport;

  const circumference = 2 * Math.PI * 52;
  const offset = circumference * (1 - total / 100);

  const accuracyDot = dataQuality === "connected" ? "bg-[#52EBA4]" : dataQuality === "partial" ? "bg-[#FFB05A]" : "bg-white/40";
  // Force navy-compatible score color
  const navyScoreColor = total >= 80 ? "#52EBA4" : total >= 60 ? "#FFB05A" : "#7AA8FF";

  return (
    <div className="cambra-card overflow-hidden">

      {/* Header */}
      <div className="px-7 py-5 border-b border-white/8 flex items-center justify-between relative">
        <p className="cc-eyebrow">Infrastructure Score</p>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${accuracyDot}`} />
          <span className="text-[10px] text-white/55">{accuracyLabel}</span>
        </div>
      </div>

      {/* Score hero */}
      <div className="px-7 py-7 flex flex-col sm:flex-row items-center sm:items-start gap-8 relative">
        {/* Gauge */}
        <div className="relative w-32 h-32 shrink-0">
          <div className="absolute inset-0 rounded-full blur-2xl opacity-50" style={{ background: navyScoreColor }} />
          <svg className="relative w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="7" />
            <circle
              cx="60" cy="60" r="52" fill="none"
              stroke={navyScoreColor} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black tabular-nums" style={{ color: navyScoreColor }}>
              <AnimatedCounter value={total} duration={1.6} />
            </span>
            <span className="text-[11px] text-white/40">/100</span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-black tracking-tight text-white">{label}</h3>
          </div>
          <p className="text-sm text-white/65 leading-relaxed mb-5">
            {total >= 80
              ? "Strong infrastructure baseline. CAMBRA can push this further through network-benchmarked terms."
              : total >= 60
              ? "Above average, with clear gaps. Targeted improvements can recover significant margin."
              : total >= 40
              ? "Paying above benchmark across multiple dimensions. High savings potential."
              : "Major inefficiencies detected. This is exactly where CAMBRA has most impact."}
          </p>

          {/* Potential score — nested light card on navy */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm mb-4">
            <div>
              <p className="text-[10px] text-white/55 mb-0.5">Estimated potential after optimization</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#52EBA4]">{potentialTotal}</span>
                <span className="text-sm text-white/45">/ 100</span>
                <span className="text-[11px] text-[#52EBA4] font-semibold ml-1">+{potentialTotal - total} pts</span>
              </div>
            </div>
            <div className="ml-auto">
              <div className="flex h-7 items-center gap-0.5">
                {Array.from({ length: 10 }).map((_, i) => {
                  const barTotal = Math.round(total / 10);
                  const barPotential = Math.round(potentialTotal / 10);
                  return (
                    <div
                      key={i}
                      className="w-1.5 rounded-full transition-all"
                      style={{
                        height: `${40 + i * 6}%`,
                        background: i < barTotal
                          ? navyScoreColor
                          : i < barPotential
                          ? "rgba(82,235,164,0.35)"
                          : "rgba(255,255,255,0.10)",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dimension toggle */}
          <button
            onClick={() => setShowDimensions(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-white/60 hover:text-white transition-colors"
          >
            {showDimensions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showDimensions ? "Hide" : "Show"} dimension breakdown
          </button>
        </div>
      </div>

      {/* Dimension breakdown */}
      {showDimensions && (
        <div className="px-7 pb-6 space-y-4 border-t border-white/8 pt-5 relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3">Score breakdown by dimension</p>
          {dimensions.map(d => (
            <DimensionBar key={d.key} {...d} />
          ))}
        </div>
      )}

      {/* Impacts */}
      {impacts.length > 0 && (
        <div className="px-7 pb-7 border-t border-white/8 pt-5 relative">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-1">Score is impacted by</p>
          <div>
            {impacts.map((impact, i) => (
              <ImpactRow key={i} impact={impact} index={i} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}