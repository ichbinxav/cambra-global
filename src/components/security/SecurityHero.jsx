import React from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Lock, Scale } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * SecurityHero — hero for /Security, styled like the landing hero.
 * Light paper canvas (inherited from PublicPageShell), a soft voltio spotlight,
 * a violet eyebrow pill, a headline with the .kw voltio gradient keyword and
 * trust chips. No dark terminal — same visual language as the landing. DA
 * tokens only.
 */
export default function SecurityHero() {
  const { t } = useTranslation();
  return (
    <section className="relative px-5 pt-28 sm:pt-32 pb-4 overflow-hidden">
      {/* Soft voltio spotlight — same wash as the landing hero */}
      {/* eslint-disable-next-line no-unused-vars */}
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 640,
          height: 640,
          left: "50%",
          top: "10%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(91,76,245,0.10) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
      />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        {/* Eyebrow pill — violet dot, like the landing badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 mb-8 text-[10px] uppercase font-semibold"
          style={{
            border: "1px solid var(--linea)",
            color: "var(--gris-1)",
            background: "rgba(12,12,22,0.04)",
            letterSpacing: "0.14em",
          }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--voltio)" }} />
          {t("sec_eyebrow")}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          style={{
            color: "var(--ink)",
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(2.6rem, 6.5vw, 5rem)",
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 0.94,
          }}
        >
          {t("sec_h1_pre")} <span className="kw">{t("sec_h1_kw")}</span> {t("sec_h1_post")}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="mt-7 text-[15px] sm:text-[17px] leading-relaxed max-w-2xl mx-auto"
          style={{ color: "var(--gris-1)" }}
        >
          {t("sec_sub")}
        </motion.p>

        {/* Trust chips — light paper pills, voltio icon */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.45 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-2.5"
        >
          {/* i18n: traducción propia, revisar — chips not covered by the source table */}
          {[
            { icon: Lock, k: "sec_chip_1" },
            { icon: ShieldCheck, k: "sec_chip_2" },
            { icon: Scale, k: "sec_chip_3" },
          ].map(({ icon: Icon, k }) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold"
              style={{
                background: "#fff",
                border: "1px solid var(--linea)",
                color: "var(--gris-1)",
              }}
            >
              <Icon size={12} style={{ color: "var(--voltio)" }} />
              {t(k)}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}