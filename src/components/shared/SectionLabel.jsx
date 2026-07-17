import React from "react";

/**
 * SectionLabel — uppercase eyebrow label used above section titles.
 * 11px / 600 / 0.12em tracking / rgba(255,255,255,0.35) on dark.
 */
export default function SectionLabel({ children, className = "", as: Tag = "p" }) {
  // DA v1.1 — Part D: section eyebrows use the .eyebrow utility (JetBrains
  // Mono, voltio accent, .14em tracking). Kept as a className so the shared
  // component propagates it to every section eyebrow at once.
  return (
    <Tag className={`eyebrow ${className}`}>
      {children}
    </Tag>
  );
}