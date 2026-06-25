import React from "react";

/**
 * SectionLabel — uppercase eyebrow label used above section titles.
 * 11px / 600 / 0.12em tracking / rgba(255,255,255,0.35) on dark.
 */
export default function SectionLabel({ children, className = "", as: Tag = "p" }) {
  return (
    <Tag
      className={`uppercase ${className}`}
      style={{
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.12em",
        color: "rgba(255,255,255,0.35)",
      }}
    >
      {children}
    </Tag>
  );
}