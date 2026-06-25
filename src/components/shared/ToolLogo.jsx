import { useState } from "react";
import { getToolMeta, getCategoryAccent } from "@/lib/iconSystem";

/**
 * ToolLogo — renders a real brand logo from SimpleIcons CDN.
 * Falls back to a category-tinted monogram if the tool is unknown
 * or the logo fails to load.
 *
 * Props:
 *  - name:     tool name (e.g. "Stripe", "Shopify")
 *  - category: optional category override
 *  - size:     pixel size (default 24)
 *  - variant:  "container" (default — soft tinted box) | "bare" (logo only)
 *  - dark:     true if used on dark navy surface
 */
export default function ToolLogo({
  name,
  category,
  size = 24,
  variant = "container",
  dark = false,
  className = "",
}) {
  const [errored, setErrored] = useState(false);
  const meta = getToolMeta(name);
  const cat = category || meta?.category;
  const accent = getCategoryAccent(cat);

  const containerSize = Math.round(size * 1.7);
  const logoSrc = meta && !errored
    ? `https://cdn.simpleicons.org/${meta.slug}/${meta.color}`
    : null;

  const monogram = (name || "?").slice(0, 2).toUpperCase();

  const inner = logoSrc ? (
    <img
      src={logoSrc}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErrored(true)}
      style={{ width: size, height: size, objectFit: "contain" }}
      draggable={false}
    />
  ) : (
    <span
      className="font-black tracking-tight"
      style={{
        fontSize: Math.max(9, Math.round(size * 0.42)),
        color: accent.color,
        letterSpacing: "-0.04em",
      }}
    >
      {monogram}
    </span>
  );

  if (variant === "bare") {
    return <span className={`inline-flex items-center justify-center ${className}`}>{inner}</span>;
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl shrink-0 transition-colors ${className}`}
      style={{
        width: containerSize,
        height: containerSize,
        background: dark ? "rgba(255,255,255,0.06)" : "#FFFFFF",
        border: dark
          ? "1px solid rgba(255,255,255,0.10)"
          : `1px solid ${accent.border}`,
        boxShadow: dark ? "none" : "0 1px 0 rgba(0,0,0,0.02), 0 4px 12px -8px rgba(0,0,0,0.08)",
      }}
    >
      {inner}
    </span>
  );
}