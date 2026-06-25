import React from "react";

/**
 * ConfidenceBadge — pill with colored dot + label indicating data confidence.
 *
 * Levels:
 *  - verified, high           → emerald
 *  - estimated, low           → amber
 *  - mixed, connected, medium → blue
 *  - static                   → grey
 */
const LEVEL_STYLES = {
  verified:  { dot: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", label: "Verified" },
  high:      { dot: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", label: "High confidence" },
  estimated: { dot: "bg-amber-500",   pill: "bg-amber-500/10 text-amber-600 border-amber-500/25",       label: "Estimated" },
  low:       { dot: "bg-amber-500",   pill: "bg-amber-500/10 text-amber-600 border-amber-500/25",       label: "Low confidence" },
  mixed:     { dot: "bg-blue-500",    pill: "bg-blue-500/10 text-blue-600 border-blue-500/25",          label: "Mixed" },
  connected: { dot: "bg-blue-500",    pill: "bg-blue-500/10 text-blue-600 border-blue-500/25",          label: "Connected" },
  medium:    { dot: "bg-blue-500",    pill: "bg-blue-500/10 text-blue-600 border-blue-500/25",          label: "Medium confidence" },
  static:    { dot: "bg-zinc-400",    pill: "bg-zinc-500/10 text-zinc-500 border-zinc-500/25",          label: "Static" },
};

export default function ConfidenceBadge({ level = "estimated", label, className = "" }) {
  const s = LEVEL_STYLES[level] || LEVEL_STYLES.estimated;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${s.pill} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label || s.label}
    </span>
  );
}