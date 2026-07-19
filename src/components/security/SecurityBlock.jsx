import React from "react";
import { motion } from "framer-motion";

/**
 * SecurityBlock — one content section on /Security, cybersecurity styling.
 * Dark glass surface on the paper canvas with a mono index tag, an accent
 * icon in a glowing chip, and a hover glow. `accent` picks the glow color
 * ('menta' default | 'coral' | 'cian'). DA tokens + system glass rgba only.
 */
const ACCENTS = {
  menta: { color: "#2FE0A8", soft: "rgba(47,224,168,0.14)", glow: "rgba(47,224,168,0.22)" },
  coral: { color: "#FF8A6B", soft: "rgba(244,91,105,0.14)", glow: "rgba(244,91,105,0.22)" },
  cian: { color: "#7DE3FF", soft: "rgba(57,198,240,0.14)", glow: "rgba(57,198,240,0.22)" },
};

export default function SecurityBlock({
  index,
  title,
  titleAccent,
  icon: Icon,
  accent = "menta",
  children,
  className = "",
}) {
  const a = ACCENTS[accent] || ACCENTS.menta;
  return (
    <motion.section
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative ${className}`}
    >
      {/* Glow halo behind the card, intensifies on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[26px] opacity-40 group-hover:opacity-90 transition-opacity duration-500"
        style={{ background: `radial-gradient(120% 80% at 0% 0%, ${a.glow}, transparent 60%)` }}
      />
      <div
        className="relative rounded-[26px] px-6 sm:px-10 py-9 sm:py-12 overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, rgba(74,58,209,0.10) 0%, transparent 55%), linear-gradient(180deg, rgba(20,17,46,0.95) 0%, rgba(10,8,24,0.97) 100%)",
          border: "1px solid rgba(255,255,255,0.09)",
          boxShadow: "0 24px 60px -34px rgba(0,0,0,0.7)",
        }}
      >
        {/* Faint grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            maskImage: "radial-gradient(ellipse 90% 90% at 0% 0%, #000 20%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 90% 90% at 0% 0%, #000 20%, transparent 75%)",
          }}
        />

        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-5">
            {Icon && (
              <span
                className="inline-flex items-center justify-center h-10 w-10 rounded-xl shrink-0"
                style={{ background: a.soft, border: `1px solid ${a.color}40`, color: a.color }}
              >
                <Icon size={18} strokeWidth={2} />
              </span>
            )}
            {index && (
              <span
                className="mono-num text-[11px] font-semibold tracking-[0.2em]"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {index}
              </span>
            )}
          </div>

          <h2
            style={{
              color: "#ffffff",
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

          <div className="mt-4 space-y-4 text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.66)" }}>
            {children}
          </div>
        </div>
      </div>
    </motion.section>
  );
}