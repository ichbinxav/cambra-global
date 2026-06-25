import React from "react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * RevenueRangePicker — 5 large tap-friendly tiles for monthly revenue.
 * Each tile is min 56px high; layout is 2 cols on mobile, 5 on desktop.
 * Tile shows the range label + the midpoint hint (~€Xk/mo) for confidence.
 */
export const REVENUE_RANGES = [
  { key: "under_10k",  i18n: "revenue_under10k",  midpoint: 5000,   hint: "≈ €5k/mo" },
  { key: "10k_50k",    i18n: "revenue_10_50k",    midpoint: 30000,  hint: "≈ €30k/mo" },
  { key: "50k_100k",   i18n: "revenue_50_100k",   midpoint: 75000,  hint: "≈ €75k/mo" },
  { key: "100k_500k",  i18n: "revenue_100_500k",  midpoint: 300000, hint: "≈ €300k/mo" },
  { key: "over_500k",  i18n: "revenue_over500k",  midpoint: 750000, hint: "≈ €750k/mo" },
];

export function midpointForRange(key) {
  return REVENUE_RANGES.find(r => r.key === key)?.midpoint ?? 0;
}

export default function RevenueRangePicker({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {REVENUE_RANGES.map(r => {
        const active = value === r.key;
        return (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={t(r.i18n)}
            onClick={() => onChange(r.key)}
            className={`min-h-[64px] px-3 py-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-0.5 ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-white text-foreground hover:border-foreground/40"
            }`}
          >
            <span className="text-sm font-semibold leading-tight">{t(r.i18n)}</span>
            <span
              className={`text-[10px] tabular-nums ${
                active ? "text-background/65" : "text-muted-foreground"
              }`}
            >
              {r.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}