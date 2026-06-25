import React from "react";
import { ShieldCheck, Shield, ShieldAlert } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * ConfidenceIndicator — small pill that surfaces a HIGH/MEDIUM/LOW signal
 * based on how many fields the user has supplied. Shown above the Step 2 CTA
 * so users understand that adding data improves the estimate.
 *
 * Props:
 *   - level: "high" | "medium" | "low"
 */
const META = {
  high: {
    label_key: "confidence_high",
    icon: ShieldCheck,
    bg: "rgba(52,211,153,0.10)",
    border: "rgba(52,211,153,0.30)",
    color: "#34d399",
    dot: "#34d399",
  },
  medium: {
    label_key: "confidence_medium",
    icon: Shield,
    bg: "rgba(34,211,238,0.08)",
    border: "rgba(34,211,238,0.28)",
    color: "#22d3ee",
    dot: "#22d3ee",
  },
  low: {
    label_key: "confidence_low",
    icon: ShieldAlert,
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.28)",
    color: "#fbbf24",
    dot: "#fbbf24",
  },
};

export default function ConfidenceIndicator({ level = "medium" }) {
  const { t } = useTranslation();
  const m = META[level] || META.medium;
  const Icon = m.icon;
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
      style={{
        background: m.bg,
        border: `1px solid ${m.border}`,
      }}
      role="status"
      aria-live="polite"
    >
      <Icon size={12} style={{ color: m.color }} />
      <span
        className="text-[10px] font-bold uppercase"
        style={{ color: m.color, letterSpacing: "0.18em" }}
      >
        {t(m.label_key)}
      </span>
    </div>
  );
}