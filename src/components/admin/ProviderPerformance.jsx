import React from "react";

export default function ProviderPerformance({ rows }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Provider Performance</p>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No data yet</div>
      ) : (
        <div className="divide-y divide-border/20">
          {rows.map((p, i) => (
            <div key={i} className="py-3 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="text-[9px] font-black">{i+1}</span>
              </div>
              <p className="text-sm font-semibold flex-1">{p.name}</p>
              <p className="text-xs text-muted-foreground/50 w-20 text-right">{p.deals} deals</p>
              <p className="text-sm font-bold text-green-600 w-32 text-right">€{p.savings.toLocaleString()} realized</p>
              <p className="text-sm font-black text-amber-600 w-28 text-right">€{p.revenue.toLocaleString()} monetized</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}