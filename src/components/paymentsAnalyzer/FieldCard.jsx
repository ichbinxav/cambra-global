import React from "react";

/**
 * FieldCard — navy-gradient card wrapper for every Analyzer field block, so
 * each question sits in a landing-style navy panel on the light paper canvas.
 * Same gradient family as the landing .section-ink / .cambra-card: deep navy
 * with voltio + cian aurora glows and a faint dot mesh. Children render in
 * white/light text (the field components handle their own inner text colors).
 */
export default function FieldCard({ children, className = "" }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 ${className}`}
      style={{
        background:
          "radial-gradient(120% 90% at 8% 0%, rgba(74,58,209,0.30) 0%, transparent 55%)," +
          "radial-gradient(110% 100% at 100% 100%, rgba(57,198,240,0.14) 0%, transparent 60%)," +
          "linear-gradient(180deg, #14112e 0%, #0e0b22 55%, #0a0818 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 1px 0 rgba(139,123,255,0.12) inset, 0 24px 64px -34px rgba(0,0,0,0.7), 0 10px 34px -20px rgba(91,76,245,0.35)",
      }}
    >
      {/* Faint dot mesh, condensing toward the corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1.5px)",
          backgroundSize: "26px 26px",
          maskImage:
            "radial-gradient(ellipse 85% 85% at 100% 100%, #000 5%, transparent 70%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 85% at 100% 100%, #000 5%, transparent 70%)",
          opacity: 0.6,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}