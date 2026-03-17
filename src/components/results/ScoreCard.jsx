import { useState } from "react";
import { ChevronDown, ChevronUp, ArrowRight, AlertCircle, CheckCircle2, Info } from "lucide-react";
import AnimatedCounter from "@/components/shared/AnimatedCounter";

function DimensionBar({ label, weight, score, desc }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f97316" : "#3b82f6";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{label}</span>
          <span className="text-[10px] text-muted-foreground/40 hidden sm:block">{desc}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground/40">{weight}</span>
          <span className="text-xs font-black tabular-nums" style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
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
    high: { dot: "bg-blue-500", badge: "bg-blue-500/[0.08] text-blue-600 border-blue-500/20" },
    medium: { dot: "bg-orange-400", badge: "bg-orange-500/[0.08] text-orange-500 border-orange-500/20" },
    low: { dot: "bg-muted-foreground/30", badge: "bg-secondary text-muted-foreground/60 border-border/40" },
  };
  const cfg = severityConfig[impact.severity] || severityConfig.low;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-border/30 last:border-0">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-xs font-semibold">{impact.category}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.badge}`}>
            +{impact.pointsGain} pts potential
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mb-1">{impact.issue}</p>
        <p className="text-[11px] text-foreground/70 flex items-center gap-1">
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

  const accuracyDot = dataQuality === "connected" ? "bg-green-500" : dataQuality === "partial" ? "bg-orange-400" : "bg-muted-foreground/40";

  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">

      {/* Header */}
      <div className="px-7 py-5 border-b border-border/40 flex items-center justify-between">
        <p className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground/50">Infrastructure Score</p>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${accuracyDot}`} />
          <span className="text-[10px] text-muted-foreground/50">{accuracyLabel}</span>
        </div>
      </div>

      {/* Score hero */}
      <div className="px-7 py-7 flex flex-col sm:flex-row items-center sm:items-start gap-8">
        {/* Gauge */}
        <div className="relative w-32 h-32 shrink-0">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="7" />
            <circle
              cx="60" cy="60" r="52" fill="none"
              stroke={scoreColor} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black tabular-nums" style={{ color: scoreColor }}>
              <AnimatedCounter value={total} duration={1.6} />
            </span>
            <span className="text-[11px] text-muted-foreground/40">/100</span>
          </div>
        </div>

        {/* Right side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-black tracking-tight">{label}</h3>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            {total >= 80
              ? "Strong infrastructure baseline. THE NoDE can push this further through collective deals."
              : total >= 60
              ? "Above average, with clear gaps. Targeted improvements can recover significant margin."
              : total >= 40
              ? "Paying above benchmark across multiple dimensions. High savings potential."
              : "Major inefficiencies detected. This is exactly where THE NoDE has most impact."}
          </p>

          {/* Potential score */}
          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-border/40 bg-secondary/40 mb-4">
            <div>
              <p className="text-[10px] text-muted-foreground/50 mb-0.5">Potential after optimization</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-green-600">{potentialTotal}</span>
                <span className="text-sm text-muted-foreground/50">/ 100</span>
                <span className="text-[11px] text-green-600 font-semibold ml-1">+{potentialTotal - total} pts</span>
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
                          ? scoreColor
                          : i < barPotential
                          ? "#22c55e40"
                          : "hsl(var(--border))",
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
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            {showDimensions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showDimensions ? "Hide" : "Show"} dimension breakdown
          </button>
        </div>
      </div>

      {/* Dimension breakdown */}
      {showDimensions && (
        <div className="px-7 pb-6 space-y-4 border-t border-border/30 pt-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-3">Score breakdown by dimension</p>
          {dimensions.map(d => (
            <DimensionBar key={d.key} {...d} />
          ))}
        </div>
      )}

      {/* Impacts */}
      {impacts.length > 0 && (
        <div className="px-7 pb-7 border-t border-border/30 pt-5">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40 mb-1">Score is impacted by</p>
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