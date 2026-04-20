import React from "react";

export default function BrandHealth({ rows }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50 mb-4">Brand Health</p>
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No data yet</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((b, i) => (
            <div key={i} className="p-4 rounded-xl border border-border/40 bg-card/80 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{b.name}</p>
                <p className="text-[11px] text-muted-foreground/50 truncate">{b.email}</p>
              </div>
              <div className="text-right">
                <p className={`text-xl font-black ${b.score>=70?'text-green-600':b.score>=40?'text-orange-600':'text-red-600'}`}>{Math.round(b.score || 0)}</p>
                <p className="text-[10px] text-muted-foreground/50">{b.deals} deals</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}