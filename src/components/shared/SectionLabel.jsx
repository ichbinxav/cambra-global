import React from "react";

/**
 * One editorial category label shared by every public section.
 * The short rule gives light and dark panels the same visual signature.
 */
/** @param {{ children?: React.ReactNode, className?: string, as?: React.ElementType, style?: React.CSSProperties, tone?: "light" | "dark" }} props */
export default function SectionLabel({ children, className = "", as: Tag = "span", style = undefined, tone = "light" }) {
  const color = tone === "dark" ? "#B8AEFF" : "var(--voltio)";

  return (
    <Tag
      className={`inline-flex items-center gap-2.5 text-[10px] font-bold uppercase leading-none ${className}`}
      style={{
        color,
        letterSpacing: "0.2em",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        className="h-px w-5 shrink-0"
        style={{ background: `linear-gradient(90deg, ${color}, transparent)` }}
      />
      <span>{children}</span>
    </Tag>
  );
}
