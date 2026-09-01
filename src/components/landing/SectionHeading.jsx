import React from "react";

/**
 * SectionHeading — the single, unified title style for every landing section.
 * Dark (ink) text on the paper canvas. Optional eyebrow pill above, optional
 * gradient-highlighted keyword passed as `highlight` (rendered via .kw).
 *
 * Keeping ALL section titles identical (same font, size, weight, spacing,
 * color) is the whole point — sections differ by content, not by title style.
 */
export default function SectionHeading({ eyebrow = null, children, className = "", align = "center" }) {
  const alignment = align === "left"
    ? "text-center lg:text-left"
    : "text-center";
  const width = align === "left"
    ? "max-w-5xl mx-auto lg:mx-0"
    : "max-w-4xl mx-auto";

  return (
    <div className={`${alignment} ${className}`}>
      {eyebrow && (
        <p className="eyebrow mb-5">{eyebrow}</p>
      )}
      <h2
        className={`${width} ${alignment}`}
        style={{
          color: "var(--ink)",
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(32px, 5vw, 64px)",
          fontWeight: 900,
          letterSpacing: "-0.045em",
          lineHeight: 1.05,
          overflowWrap: "break-word",
          wordBreak: "normal",
          hyphens: "manual",
          textWrap: "balance",
        }}
      >
        {children}
      </h2>
    </div>
  );
}
