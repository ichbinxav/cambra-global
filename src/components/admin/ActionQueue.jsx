import React from "react";

export default function ActionQueue({ items }) {
  return (
    <div className="cambra-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-white/8 relative">
        <p className="cc-eyebrow">Action Queue</p>
      </div>
      {items.length === 0 ? (
        <div className="py-10 text-center text-sm text-white/55 relative">Nothing requires action right now</div>
      ) : (
        <div className="divide-y divide-white/8 relative">
          {items.slice(0,10).map((it, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${it.badge}`}>
                {it.type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate text-white">{it.title}</p>
                {it.sub && <p className="text-[11px] text-white/50 truncate">{it.sub}</p>}
              </div>
              {it.link && <a href={it.link} className="text-[11px] text-white/65 hover:text-white underline">Open</a>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}