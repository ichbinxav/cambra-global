import React from "react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SavingsCurveChart from "@/components/landing/SavingsCurveChart";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * Real Impact — promotes the existing "≈ 7% of annual profit" microcopy to
 * a headline. Reuses the untouched SavingsCurveChart (its curve, target,
 * stats, disclaimers and methodology note are NOT modified here).
 */
export default function RealImpactSection() {
  const { t } = useTranslation();
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* soft mint wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "8%", transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(15,169,122,0.06) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* LEFT — headline + sub */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-5">
            <SectionLabel>{t("ri_eyebrow")}</SectionLabel>
          </div>
          <h2
            style={{
              color: "var(--ink)",
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(44px, 7vw, 80px)",
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1.0,
            }}
          >
            {t("ri_h2_pre")}
            <br />
            <span className="kw">{t("ri_h2_kw")}</span>
          </h2>

          <p className="mt-6 text-[15px] sm:text-[16px] leading-relaxed max-w-xl" style={{ color: "var(--gris-1)" }}>
            {t("ri_sub_pre")}
            <span className="kw-c">{t("ri_sub_kw")}</span>
            {t("ri_sub_post")}
          </p>
        </motion.div>

        {/* RIGHT — existing chart, logic untouched */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="relative p-6 sm:p-8 overflow-hidden"
          style={{
            background: "#fff",
            border: "1px solid var(--linea)",
            borderRadius: 26,
            boxShadow: "0 4px 20px rgba(12,12,22,0.04)",
          }}
        >
          <SavingsCurveChart />
        </motion.div>
      </div>
    </section>
  );
}