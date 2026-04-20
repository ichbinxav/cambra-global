import React from "react";

function MetricBlock({ label, value, helper, accent }) {
  return (
    <div className="min-w-[180px] flex-1">
      <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60 mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-4xl sm:text-5xl font-black tracking-[-0.02em] tabular-nums">{value}</p>
        {helper ? <span className={`text-xs font-semibold ${accent || 'text-muted-foreground/60'}`}>{helper}</span> : null}
      </div>
    </div>
  );
}

export default function CommandHero({ title = "Command Center", subtitle = "Infrastructure Intelligence · THE NoDE", metrics = [] }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-gradient-to-br from-foreground/[0.03] via-secondary/30 to-background">
      {/* subtle grid */}
      <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
           style={{backgroundImage:"radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize:"22px 22px"}}/>

      <div className="relative p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-[-0.02em]">{title}</h2>
            <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-muted-foreground/60">
            <span className="h-1.5 w-1.5 rounded-full bg-node-blue" />
            <span>Live</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {metrics.slice(0,3).map((m, i) => (
            <div key={i} className={`rounded-xl ${i===0 ? 'bg-background' : 'bg-card'} shadow-sm border border-border/40 p-4 sm:p-5`}>
              <MetricBlock label={m.label} value={m.value} helper={m.helper} accent={m.accent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}