import { useState } from "react";
import { Info, Sparkles, TrendingUp } from "lucide-react";
import { getRecoveryType, getRecoveryCopy } from "@/lib/recoveryModel";

/**
 * RecoveryBadge
 *
 * Tiny presentational badge that tells the user how a given savings
 * opportunity gets recovered — free self-serve, or CAMBRA-recovered with a
 * 25% success fee. Includes an inline tooltip with the full context frame
 * (verified · 24 months · conditional) so the fee never appears bare.
 *
 * Props:
 *   - vertical: 'payments' | 'shipping' | 'saas' (source of truth = scoreEngine key)
 *   - size: 'sm' (default) | 'xs' — dense list variant
 *
 * Renders nothing if the vertical is not one we classify (e.g. banking) —
 * keeps the UI silent instead of guessing.
 */
export default function RecoveryBadge({ vertical, size = "sm" }) {
  const [open, setOpen] = useState(false);
  const type = getRecoveryType(vertical);
  const copy = getRecoveryCopy(type);
  if (type === "unknown") return null;

  const isRecovery = type === "cambra_recovered";
  const Icon = isRecovery ? TrendingUp : Sparkles;

  const palette = isRecovery
    ? {
        bg: "rgba(34,211,238,0.10)",
        border: "rgba(34,211,238,0.35)",
        text: "#67e8f9",
      }
    : {
        bg: "rgba(52,211,153,0.10)",
        border: "rgba(52,211,153,0.35)",
        text: "#6ee7b7",
      };

  const isXs = size === "xs";

  return (
    <span className="relative inline-flex items-center">
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold uppercase whitespace-nowrap ${
          isXs ? "px-1.5 py-0.5 text-[9px] tracking-[0.14em]" : "px-2 py-0.5 text-[10px] tracking-[0.16em]"
        }`}
        style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text }}
      >
        <Icon size={isXs ? 8 : 9} strokeWidth={2.5} />
        {copy.label}
        <button
          type="button"
          aria-label="What this means"
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          className="ml-0.5 opacity-70 hover:opacity-100"
        >
          <Info size={isXs ? 9 : 10} />
        </button>
      </span>
      <span
        className={`ml-1.5 font-mono text-[10px] ${isXs ? "hidden sm:inline" : ""}`}
        style={{ color: palette.text, opacity: 0.75 }}
      >
        {copy.shortHint}
      </span>

      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1.5 w-64 rounded-lg p-3 text-[11px] leading-relaxed shadow-lg"
          style={{
            background: "rgba(10,15,30,0.98)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.85)",
            backdropFilter: "blur(12px)",
          }}
        >
          {copy.fullFrame}
        </span>
      )}
    </span>
  );
}