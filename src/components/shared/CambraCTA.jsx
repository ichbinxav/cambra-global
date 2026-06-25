import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Plug } from "lucide-react";

/**
 * CambraCTA — single source of truth for every primary/secondary CTA in the platform.
 *
 * Variants:
 *   - primary   → white pill, cyan glow (the ONE action of the page)
 *   - secondary → outlined pill on dark surfaces
 *   - ghost     → text + arrow (inline navigation)
 *
 * Sizes:
 *   - sm  (navbar, quick actions)        h-9
 *   - md  (default)                      h-11
 *   - lg  (hero, final CTA)              h-13
 *
 * Intent (controls icon + default label if no children):
 *   - audit    → /Analyzer       · Sparkles · "Run free audit"
 *   - connect  → /ConnectTools   · Plug     · "Connect your tools"
 *   - results  → /Results        · —        · "View results"
 *
 * Always pairs nicely with <CambraTrustRow /> rendered just below.
 */

const SHADOW_CYAN =
  "0 0 0 1px rgba(255,255,255,0.10), 0 18px 40px -16px rgba(34,211,238,0.50), 0 0 28px rgba(34,211,238,0.18)";

const SIZE = {
  sm: { h: "h-9",  px: "px-4", text: "text-[12px]", icon: 12, gap: "gap-1.5" },
  md: { h: "h-11", px: "px-6", text: "text-[13px]", icon: 14, gap: "gap-2"   },
  lg: { h: "h-[52px]", px: "px-8", text: "text-[15px]", icon: 16, gap: "gap-2" },
};

const INTENT = {
  audit:   { to: "/Analyzer",     icon: Sparkles, label: "Run free audit" },
  connect: { to: "/ConnectTools", icon: Plug,     label: "Connect your tools" },
  results: { to: "/Results",      icon: null,     label: "View results" },
};

export default function CambraCTA({
  intent = "audit",
  variant = "primary",
  size = "md",
  to,
  children,
  className = "",
  showLeadingIcon = true,
  showTrailingArrow = true,
  onClick,
  ...rest
}) {
  const cfg = INTENT[intent] || INTENT.audit;
  const sz = SIZE[size] || SIZE.md;
  const href = to || cfg.to;
  const Icon = cfg.icon;
  const label = children ?? cfg.label;

  const base = `inline-flex items-center justify-center ${sz.gap} rounded-full font-bold ${sz.text} ${sz.h} ${sz.px} whitespace-nowrap transition-all duration-200`;

  const styles =
    variant === "primary"
      ? { background: "#ffffff", color: "#0a0f1e", boxShadow: SHADOW_CYAN }
      : variant === "secondary"
      ? {
          background: "rgba(255,255,255,0.04)",
          color: "#ffffff",
          border: "1px solid rgba(255,255,255,0.18)",
          backdropFilter: "blur(8px)",
        }
      : { background: "transparent", color: "rgba(255,255,255,0.85)" };

  const hover =
    variant === "primary"
      ? "hover:scale-[1.02] active:scale-[0.98]"
      : variant === "secondary"
      ? "hover:bg-white/[0.07] hover:border-white/30"
      : "hover:text-white";

  const content = (
    <>
      {showLeadingIcon && Icon && variant === "primary" && (
        <Icon size={sz.icon} strokeWidth={2.5} />
      )}
      <span>{label}</span>
      {showTrailingArrow && <ArrowRight size={sz.icon} strokeWidth={2.5} />}
    </>
  );

  if (onClick || !href) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} ${hover} ${className}`}
        style={styles}
        {...rest}
      >
        {content}
      </button>
    );
  }

  return (
    <Link to={href} className={`${base} ${hover} ${className}`} style={styles} {...rest}>
      {content}
    </Link>
  );
}

/**
 * CambraTrustRow — the canonical microcopy that lives BELOW any primary CTA.
 * Default: "3 min · No card · Free" — override via `items` if context differs.
 */
export function CambraTrustRow({
  items = ["3 min", "No card", "Free"],
  align = "left",
  className = "",
}) {
  const alignCls =
    align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start";
  return (
    <div
      className={`flex flex-wrap items-center ${alignCls} gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.22em] font-bold ${className}`}
      style={{ color: "rgba(255,255,255,0.40)" }}
    >
      {items.map((it, i) => (
        <React.Fragment key={it}>
          <span>{it}</span>
          {i < items.length - 1 && <span className="text-cyan-400/60">·</span>}
        </React.Fragment>
      ))}
    </div>
  );
}