import React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

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
              {it.link && (
                <Link to={it.link} aria-label={`${it.actionLabel || "Open"}: ${it.title}`}
                  className="shrink-0 inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1.5 text-[10px] font-bold text-white/75 hover:bg-white/10 hover:text-white">
                  {it.actionLabel || "Open"} <ArrowRight size={10} />
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
