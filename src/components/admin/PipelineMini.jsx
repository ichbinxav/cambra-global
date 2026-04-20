import React from "react";

export default function PipelineMini({ data, totalApps }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Deal Pipeline</p>
        <a href="/admin/pipeline" className="text-[11px] text-muted-foreground/50 hover:text-foreground underline">Full pipeline</a>
      </div>
      <div className="space-y-2.5">
        {data.map(stage => {
          const pct = totalApps > 0 ? (stage.count / totalApps) * 100 : 0;
          return (
            <div key={stage.key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                  <p className="text-xs font-medium">{stage.label}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground/50">€{Math.round(stage.value).toLocaleString()}</span>
                  <span className="font-bold w-5 text-right">{stage.count}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-border/30 overflow-hidden">
                <div className="h-full rounded-full" style={{ background: stage.color, width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}