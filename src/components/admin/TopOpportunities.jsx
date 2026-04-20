import React from "react";

export default function TopOpportunities({ items }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Top Opportunities</p>
        <a href="/admin/users" className="text-[11px] text-muted-foreground/50 hover:text-foreground underline">All users</a>
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No data yet</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <a key={i} href="/admin/users" className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50 transition-colors">
              <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <span className="text-[9px] font-black">{i+1}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{it.brandName}</p>
                <p className="text-[10px] text-muted-foreground/40 truncate">{it.email}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-purple-600">€{Math.round(it.savings).toLocaleString()}</p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}