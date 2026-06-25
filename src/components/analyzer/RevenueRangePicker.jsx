import React from "react";

/**
 * RevenueRangePicker — 5 large tap-friendly tiles for monthly revenue.
 * Each tile is min 44px high; layout is 1 column on mobile, 5 on desktop.
 */
export const REVENUE_RANGES = [
  { key: "under_10k",  label: "Under €10k",   midpoint: 5000 },
  { key: "10k_50k",    label: "€10k–€50k",    midpoint: 30000 },
  { key: "50k_100k",   label: "€50k–€100k",   midpoint: 75000 },
  { key: "100k_500k",  label: "€100k–€500k",  midpoint: 300000 },
  { key: "over_500k",  label: "Over €500k",   midpoint: 750000 },
];

export function midpointForRange(key) {
  return REVENUE_RANGES.find(r => r.key === key)?.midpoint ?? 0;
}

export default function RevenueRangePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
      {REVENUE_RANGES.map(r => {
        const active = value === r.key;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            className={`min-h-[56px] px-3 py-3 rounded-xl border text-sm font-semibold text-center transition-all ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-white text-foreground hover:border-foreground/40"
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}