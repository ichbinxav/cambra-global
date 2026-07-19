import React from "react";
import { motion } from "framer-motion";

/**
 * SecurityBlock — one content section on /Security. Two surface variants:
 *  - "paper" (default): light card on the paper canvas.
 *  - "ink": a .panel-dark block for the alternating dark sections.
 * Uses only DA tokens. Title in Space Grotesk, body in Inter (--gris-1).
 */
export default function SecurityBlock({ title, titleAccent, children, variant = "paper", className = "" }) {
  const ink = variant === "ink";
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`relative ${className}`}
    >
      <div
        className={ink ? "panel-dark px-6 sm:px-12 py-12 sm:py-16" : "px-6 sm:px-10 py-10 sm:py-14 rounded-[26px]"}
        style={
          ink
            ? undefined
            : { background: "#ffffff", border: "1px solid var(--linea)", boxShadow: "0 4px 20px rgba(12,12,22,0.04)" }
        }
      >
        <div className="relative z-10 max-w-3xl">
          <h2
            style={{
              color: ink ? "#ffffff" : "var(--ink)",
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(26px, 3.6vw, 38px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            {title}
            {titleAccent && <span style={{ color: "var(--menta)" }}>{titleAccent}</span>}
          </h2>
          <div className={`mt-5 space-y-4 text-[15px] leading-relaxed`} style={{ color: "var(--gris-1)" }}>
            {children}
          </div>
        </div>
      </div>
    </motion.section>
  );
}