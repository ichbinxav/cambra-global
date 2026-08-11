import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import { useTranslation } from "@/lib/i18n.jsx";
import { useMarket } from "@/lib/publicExperience.jsx";

/**
 * Final CTA block — the WOW closer.
 * Cinematic finale: large frosted cube on the left, headline + CTAs
 * right-aligned, and a giant ghosted C-mark filling the whole pill as the
 * background brand mark.
 */
export default function StopLeavingMarginCTA() {
  const { t } = useTranslation();
  const { experience } = useMarket();
  return (
    <section className="relative py-16 sm:py-20 px-4 sm:px-6">
     {/* Dark closer pill — this section is a full-bleed cinematic dark block,
         so it renders as its own navy card on the paper canvas. */}
     <div
       className="relative mx-auto max-w-6xl rounded-[32px] overflow-hidden py-24 sm:py-32"
       style={{
         background: "linear-gradient(180deg, #14112e 0%, #0e0b22 55%, #0a0818 100%)",
         border: "1px solid rgba(255,255,255,0.08)",
         boxShadow: "0 40px 100px -40px rgba(0,0,0,0.6), 0 16px 50px -22px rgba(91,76,245,0.3)",
       }}
     >
      {/* Pulsing multi-layer ambient halo — the heartbeat of the closing */}
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 1100,
          height: 900,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(91,76,245,0.24) 0%, transparent 65%)",
          filter: "blur(120px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0.8, 0.55] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
      />
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700,
          height: 700,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(139,123,255,0.18) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ scale: [1.05, 1, 1.05], opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 8, ease: "easeInOut", repeat: Infinity, delay: 1.5 }}
      />

      {/* Top hairline — cinematic frame */}
      <div
        aria-hidden
        className="absolute top-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: "min(720px, 80%)",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(139,123,255,0.5) 50%, transparent 100%)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 sm:px-10 flex flex-col items-center text-center">
        {/* Giant background C-mark — fills the whole pill as the brand watermark */}
        <motion.img
          src={BRAND_ASSETS.cMarkWhitePng}
          alt=""
          aria-hidden
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 0.11, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 m-auto w-[105%] max-w-[900px] h-auto object-contain select-none"
          draggable={false}
        />

        {/* Copy + CTAs, centered */}
        <div className="w-full">
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-10 flex justify-center"
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 backdrop-blur-md"
              style={{
                border: "1px solid rgba(139,123,255,0.32)",
                background: "rgba(139,123,255,0.08)",
                boxShadow: "0 0 32px rgba(91,76,245,0.22)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ background: "var(--voltio-2)" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--voltio-2)" }} />
              </span>
              <span className="text-[11px] uppercase tracking-[0.28em] font-bold text-white/85">
                {t("cta_final_eyebrow")}
              </span>
            </span>
          </motion.div>

          {/* MASSIVE headline — the closing statement */}
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            className="text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(48px, 8vw, 104px)",
              fontWeight: 900,
              letterSpacing: "-0.05em",
              lineHeight: 0.9,
              textShadow: "0 0 80px rgba(91,76,245,0.25)",
            }}
          >
            {t("cta_final_h2_pre")}
            <br />
            {/* Keyword highlight → violet→cyan gradient (reference style). */}
            <span className="kw">{t("cta_final_h2_kw")}</span>
          </motion.h2>

          {/* Supporting line */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-10 text-[17px] sm:text-[20px] text-white/65 mx-auto"
            style={{ lineHeight: 1.55, maxWidth: 620 }}
          >
            {t("cta_final_sub1")}
            <br />
            <span className="text-white">{t("cta_final_sub2")}</span>
          </motion.p>

          {/* CTAs — premium dual */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-12 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto items-stretch justify-center"
          >
            <div className="flex-1">
              <Link
                to={experience.analyzer.href}
                className="group w-full inline-flex items-center justify-center gap-3 rounded-full font-medium text-[15px] transition-transform hover:-translate-y-0.5"
                style={{
                  background: "var(--g-voltio)",
                  color: "#ffffff",
                  boxShadow: "0 14px 36px -14px rgba(91,76,245,0.5)",
                  padding: "20px 32px",
                }}
              >
                <Sparkles size={16} style={{ color: "#ffffff" }} />
                <span>{t(experience.analyzer.status === "ENABLED" ? "cta_final_primary" : "market_cta_access")}</span>
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="flex-1">
              <JoinWaitlistButton variant="ghost" label={t("cta_final_secondary")} fullWidth />
            </div>
          </motion.div>

          {/* Trust row — proof-first */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-10 flex flex-wrap justify-center items-center gap-x-5 gap-y-2.5 text-[11px] uppercase tracking-[0.24em] font-bold"
            style={{ color: "rgba(255,255,255,0.50)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={12} style={{ color: "rgba(139,123,255,0.9)" }} />
              {t("cta_final_t1")}
            </span>
            <span style={{ color: "rgba(139,123,255,0.6)" }}>•</span>
            <span>{t("cta_final_t2")}</span>
            <span style={{ color: "rgba(139,123,255,0.6)" }}>•</span>
            <span>{t("cta_final_t3")}</span>
            <span style={{ color: "rgba(139,123,255,0.6)" }}>•</span>
            <span className="text-white/80">{t("cta_final_t4")}</span>
          </motion.div>
        </div>
      </div>

      {/* Bottom hairline — cinematic frame closer */}
      <div
        aria-hidden
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px"
        style={{
          width: "min(720px, 80%)",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(139,123,255,0.5) 50%, transparent 100%)",
        }}
      />
     </div>
    </section>
  );
}
