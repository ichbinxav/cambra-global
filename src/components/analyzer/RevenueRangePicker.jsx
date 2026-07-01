import React from "react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * RevenueRangePicker — 5 large tap-friendly tiles for monthly revenue.
 * Each tile is min 44px high; layout is 1 column on mobile, 5 on desktop.
 */
export const REVENUE_RANGES = [
  { key: "under_10k",  i18n: "revenue_under10k",  midpoint: 5000 },
  { key: "10k_50k",    i18n: "revenue_10_50k",    midpoint: 30000 },
  { key: "50k_100k",   i18n: "revenue_50_100k",   midpoint: 75000 },
  { key: "100k_500k",  i18n: "revenue_100_500k",  midpoint: 300000 },
  { key: "over_500k",  i18n: "revenue_over500k",  midpoint: 750000 },
];

export function midpointForRange(key) {
  return REVENUE_RANGES.find(r => r.key === key)?.midpoint ?? 0;
}

export default function RevenueRangePicker({ value, onChange }) {
  const { t } = useTranslation();
  return (
    // FIX 19: grid stays 2-col on mobile (375px), 5-col on >= sm, and each tile
    // remains ≥44px tap target.
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
            className={`min-h-[56px] px-3 py-3 rounded-xl border text-sm font-semibold text-center transition-all ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border/60 bg-card text-foreground hover:border-foreground/40"
            }`}
          >
            {t(r.i18n)}
          </button>
        );
      })}
    </div>
  );
}