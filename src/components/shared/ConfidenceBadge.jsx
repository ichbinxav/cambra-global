import React from "react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * ConfidenceBadge — pill with colored dot + label indicating data confidence.
 * Uses i18n; pass `label` to override.
 */
const LEVEL_STYLES = {
  verified:  { dot: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", key: "badge_verified" },
  high:      { dot: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25", key: "badge_high" },
  estimated: { dot: "bg-amber-500",   pill: "bg-amber-500/10 text-amber-600 border-amber-500/25",       key: "badge_estimated" },
  low:       { dot: "bg-amber-500",   pill: "bg-amber-500/10 text-amber-600 border-amber-500/25",       key: "badge_low" },
  mixed:     { dot: "bg-blue-500",    pill: "bg-blue-500/10 text-blue-600 border-blue-500/25",          key: "badge_mixed" },
  connected: { dot: "bg-blue-500",    pill: "bg-blue-500/10 text-blue-600 border-blue-500/25",          key: "badge_connected" },
  medium:    { dot: "bg-blue-500",    pill: "bg-blue-500/10 text-blue-600 border-blue-500/25",          key: "badge_medium" },
  static:    { dot: "bg-zinc-400",    pill: "bg-zinc-500/10 text-zinc-500 border-zinc-500/25",          key: "badge_estimated" },
};

function capitalize(s) {
  if (!s || typeof s !== "string") return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ConfidenceBadge({ level = "estimated", label, className = "" }) {
  const { t } = useTranslation();
  const s = LEVEL_STYLES[level] || LEVEL_STYLES.estimated;
  // FIX 7 — if t() returns the key itself (missing translation), fall back to
  // the capitalized level name so users never see a raw key like "badge_low".
  let resolved = label;
  if (!resolved) {
    const translated = t(s.key);
    resolved = (translated === s.key || !translated) ? capitalize(level) : translated;
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${s.pill} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {resolved}
    </span>
  );
}