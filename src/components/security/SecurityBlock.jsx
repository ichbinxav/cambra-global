import React from "react";
import { motion } from "framer-motion";

/**
 * SecurityBlock — one content section on /Security, styled like the landing
 * "How it works" cards: white paper card on the paper canvas, soft shadow,
 * a voltio icon chip, a mono index tag, and a hover voltio glow. `accent`
 * tints the icon chip + glow ('voltio' default | 'coral'). DA tokens only.
 */
const ACCENTS = {
  voltio: { color: "#5B4CF5", soft: "rgba(91,76,245,0.10)", glow: "rgba(91,76,245,0.10)" },
  coral: { color: "#F45B69", soft: "rgba(244,91,105,0.10)", glow: "rgba(244,91,105,0.10)" },
};

export default function SecurityBlock({
  index,
  title,
  titleAccent = null,
  icon: Icon,
  accent = "voltio",
  children,
  className = "",
}) {
  const a = ACCENTS[accent] || ACCENTS.voltio;
  return (
    <motion.section
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative overflow-hidden px-6 sm:px-10 py-9 sm:py-12 ${className}`}
      style={{
        background: "#ffffff",
        border: "1px solid var(--linea)",
        borderRadius: 26,
        boxShadow: "0 4px 20px rgba(12,12,22,0.04)",
      }}
    >
      {/* Hover glow halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 20% 50%, ${a.glow}, transparent 60%)` }}
      />

      <div className="relative z-10 max-w-3xl">
        <div className="flex items-center gap-3 mb-5">
          {Icon && (
            <span
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
              style={{ background: a.soft, border: `1px solid ${a.color}33`, color: a.color }}
            >
              <Icon size={18} strokeWidth={2} />
            </span>
          )}
          {index && (
            <span
              className="mono-num text-[11px] font-semibold tracking-[0.2em]"
              style={{ color: "var(--gris-2)" }}
            >
              {index}
            </span>
          )}
        </div>

        <h2
          style={{
            color: "var(--ink)",
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(24px, 3.4vw, 34px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.06,
          }}
        >
          {title}
          {titleAccent && <span style={{ color: a.color }}>{titleAccent}</span>}
        </h2>

        <div className="mt-4 space-y-4 text-[15px] leading-relaxed" style={{ color: "var(--gris-1)" }}>
          {children}
        </div>
      </div>
    </motion.section>
  );
}