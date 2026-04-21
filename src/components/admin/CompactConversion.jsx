import React from "react";

export default function CompactConversion({ funnel, convAnalysis, convActivation, stuckCount = 0, offerReady = 0 }) {
  const steps = [
    { label: 'Analyzed', value: funnel?.analyses || 0 },
    { label: 'Applied', value: funnel?.applied || 0, pct: funnel?.analyses ? Math.round((funnel.applied / funnel.analyses) * 100) : 0 },
    { label: 'Activated', value: funnel?.active || 0, pct: funnel?.applied ? Math.round((funnel.active / funnel.applied) * 100) : 0 },
  ];

  const bar = (pct) => (
    <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
      <div className="h-full bg-foreground/70" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );

  const items = [
    { label: 'Analysis → Application', value: `${steps[1].pct ?? 0}%`, helper: `${steps[1].value}/${steps[0].value}` },
    { label: 'Application → Activation', value: `${steps[2].pct ?? 0}%`, helper: `${steps[2].value}/${steps[1].value}` },
    { label: 'Overall Conversion', value: `${convAnalysis ?? 0}%`, helper: 'Analyses → Applications' },
    { label: 'Activation Rate', value: `${convActivation ?? 0}%`, helper: 'Applications → Activated' },
  ];

  return (
    <div className="rounded-xl border border-border/40 bg-card p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-3">
        {/* Step summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {steps.map((s, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground/70">
                <span>{s.label}</span>
                <span className="tabular-nums text-foreground font-semibold">{s.value}</span>
              </div>
              {typeof s.pct === 'number' ? bar(s.pct) : <div className="h-1.5" />}
            </div>
          ))}
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {items.map((m, idx) => (
            <div key={idx} className="rounded-lg bg-secondary/40 border border-border/40 p-2.5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">{m.label}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-black tabular-nums">{m.value}</span>
                <span className="text-[11px] text-muted-foreground/60">{m.helper}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Bottlenecks */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-orange-500/[0.04] border border-orange-500/20 p-2.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-orange-600/90 mb-1">Stuck / Blocked</p>
            <p className="text-lg font-black tabular-nums text-orange-700">{stuckCount}</p>
          </div>
          <div className="rounded-lg bg-purple-500/[0.05] border border-purple-500/20 p-2.5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-purple-700 mb-1">Offers ready</p>
            <p className="text-lg font-black tabular-nums text-purple-700">{offerReady}</p>
          </div>
        </div>
      </div>
    </div>
  );
}