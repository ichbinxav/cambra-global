import React from "react";

/**
 * SectionLabel — premium product-style eyebrow pill.
 * Very light grey background, small uppercase type, wide tracking,
 * rounded pill. Never colourful — restrained, engineered (Art Direction).
 */
/** @param {{ children?: React.ReactNode, className?: string, as?: React.ElementType, style?: React.CSSProperties }} props */
export default function SectionLabel({ children, className = "", as: Tag = "span", style = undefined }) {
  return (
    <Tag
      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${className}`}
      style={{
        background: "rgba(12,12,22,0.04)",
        color: "var(--gris-1)",
        letterSpacing: "0.14em",
        border: "1px solid var(--linea)",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}