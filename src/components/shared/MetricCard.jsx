import React from "react";
import { ArrowUp, ArrowDown } from "lucide-react";
import SectionLabel from "./SectionLabel";
import ConfidenceBadge from "./ConfidenceBadge";

/**
 * MetricCard — surface card showing a labelled KPI value with optional change and confidence.
 *
 * Props:
 *  - label       (string)  eyebrow label
 *  - value       (number|string) main figure
 *  - change      (number|string) optional delta (e.g. "+12.4%" or 12.4)
 *  - trend       ("up"|"down") direction of change
 *  - prefix      (string)  e.g. "€"
 *  - suffix      (string)  e.g. "/yr"
 *  - confidence  (string)  level for ConfidenceBadge
 */
export default function MetricCard({
  label,
  value,
  change,
  trend,
  prefix = "",
  suffix = "",
  confidence,
  className = "",
}) {
  const isUp = trend === "up";
  const trendColor = isUp ? "text-emerald-500" : "text-red-500";
  const TrendIcon = isUp ? ArrowUp : ArrowDown;

  return (
    <div className={`surface surface-hover p-5 ${className}`}>
      <SectionLabel className="mb-3">{label}</SectionLabel>

      <div className="flex items-baseline gap-1">
        {prefix && <span className="text-2xl font-black text-white/70">{prefix}</span>}
        <span className="text-mono text-3xl sm:text-4xl font-black tracking-tight text-white tabular-nums">
          {value}
        </span>
        {suffix && <span className="text-sm font-bold text-white/40 ml-1">{suffix}</span>}
      </div>

      {change != null && (
        <div className={`mt-2 inline-flex items-center gap-1 text-xs font-bold ${trendColor}`}>
          <TrendIcon size={12} />
          <span className="tabular-nums">{change}</span>
        </div>
      )}

      {confidence && (
        <div className="mt-3">
          <ConfidenceBadge level={confidence} />
        </div>
      )}
    </div>
  );
}