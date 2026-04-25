import React from "react";
import { cn } from "@/lib/utils";

// Simple, visual tile selector. Supports single (string) or multi (string[]) selection.
export default function OptionTiles({ label, value, onChange, options = [], multi = false }) {
  const isSelected = (v) => multi ? Array.isArray(value) && value.includes(v) : String(value || '') === String(v);
  const handleClick = (v) => {
    if (multi) {
      const cur = Array.isArray(value) ? value : [];
      const exists = cur.includes(v);
      const next = exists ? cur.filter((x) => x !== v) : [...cur, v];
      onChange(next);
    } else {
      onChange(v);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <div className="text-xs font-medium text-muted-foreground/80">{label}</div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
        {options.map((opt) => {
          const active = isSelected(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleClick(opt)}
              className={cn(
                "group relative rounded-xl border px-3 py-3 text-left text-sm transition-all",
                "glass border-border/60 hover:border-foreground/30",
                active && "ring-1 ring-cambra-lilac border-cambra-lilac bg-cambra-lilac-soft"
              )}
            >
              <span className={cn("font-semibold", active ? "text-foreground" : "text-foreground/80")}>{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}