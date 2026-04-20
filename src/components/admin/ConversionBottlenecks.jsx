import React from "react";

export default function ConversionBottlenecks({ data }) {
  const { convAnalysis, convActivation, stuckCount, offerReady, funnel } = data;
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Conversion & Bottlenecks</p>
        <div className="text-[11px] text-muted-foreground/50">Apps → Active: <span className="text-foreground font-semibold">{convActivation}%</span></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[{label:'Analysis→Deal',val:`${convAnalysis}%`, color:'text-blue-600'},
          {label:'Offer Ready',val:offerReady, color:'text-purple-600'},
          {label:'Stuck >7d',val:stuckCount, color:'text-red-600'},
          {label:'In Progress',val:funnel.inProgress, color:'text-orange-600'}].map((k,i)=> (
          <div key={i} className="p-4 rounded-xl border border-border/40 bg-card/80">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 mb-1">{k.label}</p>
            <p className={`text-xl font-black ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>
      <div className="flex items-end gap-1 h-12">
        {[
          { label: "Users", val: funnel.users, color: "bg-foreground/20" },
          { label: "Analyses", val: funnel.analyses, color: "bg-blue-500/50" },
          { label: "Applied", val: funnel.applied, color: "bg-orange-500/60" },
          { label: "Active", val: funnel.active, color: "bg-green-500/70" },
        ].map((s, i) => {
          const maxVal = Math.max(1, funnel.users);
          const pct = Math.max((s.val / maxVal) * 100, 4);
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full relative" style={{ height: "40px" }}>
                <div className={`absolute bottom-0 w-full rounded-t-sm ${s.color}`} style={{ height: `${pct}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground/40 text-center leading-tight">{s.label}<br /><strong className="text-foreground/70">{s.val}</strong></p>
            </div>
          );
        })}
      </div>
    </div>
  );
}