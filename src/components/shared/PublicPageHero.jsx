import React from "react";
import { motion } from "framer-motion";

/**
 * PublicPageHero — cinematic dark hero for every public page.
 *
 * Reuses the approved `.section-ink` surface (translucent deep navy-violet
 * pill + condensing dot-mesh + floating cyan bloom) from the landing, wraps
 * it in a reveal animation, and renders an eyebrow + gradient headline +
 * subtitle. This replaces the flat paper text-heros so every page opens with
 * the same "wow" the landing has.
 *
 * Props:
 *  - eyebrow: string   → small cyan uppercase label
 *  - title:   node     → big Space Grotesk headline (can contain <br/>, spans)
 *  - subtitle: node    → white/60 paragraph under the title
 *  - children: node    → optional CTA row / extra content under subtitle
 *  - align: "center" | "left" (default "center")
 */
export default function PublicPageHero({ eyebrow, title, subtitle, children, align = "center" }) {
  const isCenter = align === "center";
  return (
    <div className="px-5 pt-28 sm:pt-32">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={`section-ink px-6 sm:px-12 py-16 sm:py-24 ${isCenter ? "text-center" : "text-left"}`}
      >
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-[11px] font-bold tracking-[0.24em] uppercase mb-5"
            style={{ color: "#7DE3FF" }}
          >
            {eyebrow}
          </motion.p>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="text-white"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(2.6rem, 6.5vw, 5.2rem)",
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 0.94,
          }}
        >
          {title}
        </motion.h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.28 }}
            className={`mt-6 text-[15px] sm:text-[17px] leading-relaxed text-white/60 ${isCenter ? "max-w-2xl mx-auto" : "max-w-2xl"}`}
          >
            {subtitle}
          </motion.p>
        )}

        {children && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.38 }}
            className="mt-9"
          >
            {children}
          </motion.div>
        )}
      </motion.section>
    </div>
  );
}