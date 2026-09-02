import React from "react";
import { motion } from "framer-motion";

/**
 * Shared editorial hero for public pages. Light is the default so secondary
 * pages inherit the landing's paper-first direction; dark remains available
 * for pages whose children deliberately use inverse controls.
 *
 * Props:
 *  - eyebrow: string   → small cyan uppercase label
 *  - title:   node     → big Space Grotesk headline (can contain <br/>, spans)
 *  - subtitle: node    → white/60 paragraph under the title
 *  - children: node    → optional CTA row / extra content under subtitle
 *  - align: "center" | "left" (default "center")
 *  - tone: "light" | "dark" (default "light")
 */
export default function PublicPageHero({ eyebrow, title, subtitle, children = null, align = "center", tone = "light" }) {
  const isCenter = align === "center";
  const isDark = tone === "dark";
  return (
    <div className="px-5 sm:px-8 pt-28 sm:pt-32">
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={`relative max-w-[1400px] mx-auto overflow-hidden px-6 sm:px-12 lg:px-16 py-14 sm:py-20 ${isDark ? "section-ink" : "rounded-[28px]"} ${isCenter ? "text-center" : "text-left"}`}
        style={isDark ? undefined : { background: "linear-gradient(140deg,rgba(255,255,255,.88) 0%,rgba(247,247,255,.88) 68%,rgba(241,246,255,.74) 100%)", border: "1px solid var(--linea)", boxShadow: "0 24px 75px -52px rgba(12,12,22,.34)" }}
      >
        {!isDark && <div aria-hidden="true" className="absolute pointer-events-none" style={{ width: 620, height: 620, right: "-14%", top: "-65%", background: "radial-gradient(circle,rgba(91,76,245,.10),transparent 70%)", filter: "blur(60px)" }} />}
        <div className="relative">
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] uppercase mb-5"
            style={{ color: isDark ? "#AFA2FF" : "var(--voltio)", background: isDark ? "rgba(139,123,255,.10)" : "rgba(91,76,245,.07)", border: isDark ? "1px solid rgba(139,123,255,.18)" : "1px solid rgba(91,76,245,.12)" }}
          >
            {eyebrow}
          </motion.p>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          style={{
            color: isDark ? "#fff" : "var(--ink)",
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(2.5rem, 5.4vw, 4.6rem)",
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 0.98,
          }}
        >
          {title}
        </motion.h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.28 }}
            className={`mt-6 text-[15px] sm:text-[17px] leading-relaxed ${isCenter ? "max-w-3xl mx-auto" : "max-w-3xl"}`}
            style={{ color: isDark ? "rgba(255,255,255,.62)" : "var(--gris-1)" }}
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
        </div>
      </motion.section>
    </div>
  );
}
