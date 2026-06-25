import React from "react";

/**
 * StatusDot — small colored dot for state indication.
 *
 * Statuses:
 *  - verified  → emerald
 *  - detected  → blue
 *  - connected → blue
 *  - estimated → amber
 *  - running   → blue + pulse animation
 *  - stale     → grey
 */
const STATUS_COLORS = {
  verified:  "bg-emerald-500",
  detected:  "bg-blue-500",
  connected: "bg-blue-500",
  estimated: "bg-amber-500",
  running:   "bg-blue-500",
  stale:     "bg-zinc-400",
};

export default function StatusDot({ status = "estimated", size = 8, className = "" }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.estimated;
  const dim = { width: `${size}px`, height: `${size}px` };

  if (status === "running") {
    return (
      <span className={`relative inline-flex ${className}`} style={dim} aria-label="running">
        <span className={`absolute inset-0 rounded-full ${color} opacity-60 animate-ping`} />
        <span className={`relative inline-flex rounded-full ${color}`} style={dim} />
      </span>
    );
  }

  return (
    <span
      className={`inline-block rounded-full ${color} ${className}`}
      style={dim}
      aria-label={status}
    />
  );
}