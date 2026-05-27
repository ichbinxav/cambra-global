import React from "react";
import { getCategoryAccent } from "@/lib/iconSystem";

/**
 * CategoryBadge — small, consistent category marker.
 * Used everywhere a category needs to be visually identified.
 */
export default function CategoryBadge({ category, label, size = "sm", dark = false }) {
  const accent = getCategoryAccent(category);
  const display = label || accent.label;

  const sizeCls = size === "xs"
    ? "text-[9px] px-1.5 py-0.5 tracking-[0.14em]"
    : "text-[10px] px-2 py-0.5 tracking-[0.16em]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase ${sizeCls}`}
      style={{
        background: dark ? "rgba(255,255,255,0.05)" : accent.soft,
        border: `1px solid ${dark ? "rgba(255,255,255,0.10)" : accent.border}`,
        color: dark ? accent.color : accent.color,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: accent.color }}
      />
      {display}
    </span>
  );
}