import React from "react";

export default function ActionQueue({ items }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <div className="px-5 py-3.5 border-b border-border/40">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50">Action Queue</p>
      </div>
      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Nothing requires action right now</div>
      ) : (
        <div className="divide-y divide-border/20">
          {items.slice(0,10).map((it, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${it.badge}`}>
                {it.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{it.title}</p>
                {it.sub && <p className="text-[11px] text-muted-foreground/50 truncate">{it.sub}</p>}
              </div>
              {it.link && <a href={it.link} className="text-[11px] text-muted-foreground hover:text-foreground underline">Open</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}