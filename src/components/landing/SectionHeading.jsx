import React from "react";

/**
 * SectionHeading — the single, unified title style for every landing section.
 * Dark (ink) text on the paper canvas. Optional eyebrow pill above, optional
 * gradient-highlighted keyword passed as `highlight` (rendered via .kw).
 *
 * Keeping ALL section titles identical (same font, size, weight, spacing,
 * color) is the whole point — sections differ by content, not by title style.
 */
export default function SectionHeading({ eyebrow, children, className = "" }) {
  return (
    <div className={`text-center ${className}`}>
      {eyebrow && (
        <p className="eyebrow mb-5">{eyebrow}</p>
      )}
      <h2
        className="max-w-3xl mx-auto text-center"
        style={{
          color: "var(--ink)",
          fontFamily: "'Space Grotesk', 'Inter', sans-serif",
          fontSize: "clamp(30px, 8.5vw, 80px)",
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