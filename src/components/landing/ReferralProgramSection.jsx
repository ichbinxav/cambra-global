import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";
import { BASE_FEE_PCT, STEP_POINTS, FLOOR_FEE_PCT } from "@/lib/referralProgram";

/**
 * REFERRAL-3 — public referral section (replaces the pre-pivot Founding 150
 * block, same slot on the landing, right after Pricing/Testimonials).
 *
 * Every figure comes from src/lib/referralProgram.js — the SAME source of truth
 * that ReferralFeeStatus uses on the authenticated /Referrals page, so the
 * public promise and the logged-in figure can never diverge. The referred
 * business's entry fee is BASE − STEP (one step down, Terms §8), derived here
 * rather than hardcoded for exactly that reason.
 *
 * The CTA is the landing's standard free-analysis CTA, NOT "get my invite link"
 * — an anonymous visitor has no account and therefore no link; full conditions
 * (permanence, non-retroactivity, non-cumulation) live in Terms §8 and are
 * linked, never duplicated here.
 */
export default function ReferralProgramSection() {
  const { t } = useTranslation();

  const entryPct = BASE_FEE_PCT - STEP_POINTS;
  const sub = t("ref_land_sub")
    .replace("{step}", String(STEP_POINTS))
    .replace("{floor}", `${FLOOR_FEE_PCT}%`)
    .replace("{entry}", `${entryPct}%`)
    .replace("{base}", `${BASE_FEE_PCT}%`);

  const tiles = [
    { label: t("ref_land_t1_label"), value: `−${STEP_POINTS}`, unit: "pts", note: t("ref_land_t1_note") },
    { label: t("ref_land_t2_label"), value: `${FLOOR_FEE_PCT}`, unit: "%", note: t("ref_land_t2_note") },
    { label: t("ref_land_t3_label"), value: `${entryPct}`, unit: "%", note: t("ref_land_t3_note").replace("{base}", `${BASE_FEE_PCT}%`) },
  ];

  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, right: "-8%", top: "10%",
          background: "radial-gradient(circle, rgba(91,76,245,0.06) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <motion.div
          className="lg:col-span-7 text-center lg:text-left"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="mb-5">
            <SectionLabel>{t("ref_land_eyebrow")}</SectionLabel>
          </div>
          <h2
            style={{
              color: "var(--ink)",
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(40px, 6vw, 68px)",
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1.0,
            }}
          >
            {t("ref_land_h2_l1")}
            <br />
            <span className="kw">{t("ref_land_h2_kw")}</span>
          </h2>

          <p className="mt-6 text-[15px] sm:text-[16px] leading-relaxed max-w-xl mx-auto lg:mx-0" style={{ color: "var(--gris-1)" }}>
            {sub}
          </p>

          <p className="mt-4 text-[13px]" style={{ color: "var(--gris-2)" }}>
            {t("ref_land_trigger")}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-5">
            <Link to="/Analyzer" className="btn-primary inline-flex items-center gap-2">
              {t("ref_land_cta")}
              <ArrowRight size={16} />
            </Link>
            <Link
              to="/Terms"
              className="text-[13px] underline underline-offset-4"
              style={{ color: "var(--gris-1)" }}
            >
              {t("ref_land_how")}
            </Link>
          </div>
        </motion.div>

        <div className="lg:col-span-5 space-y-3">
          {tiles.map((tile, i) => (
            <motion.div
              key={tile.label}
              className="section-ink relative flex items-center px-6 sm:px-7"
              style={{ borderRadius: 20, maxWidth: "none", minHeight: 96 }}
              initial={{ opacity: 0, x: 28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.12 }}
              whileHover={{ y: -3 }}
            >
              {/* Fixed-width numeric column so the three figures sit on the
                  same optical axis regardless of digit count (−5 / 5 / 20). */}
              <p
                className="font-black tabular-nums shrink-0 text-center"
                style={{
                  width: 104,
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: 44,
                  letterSpacing: "-0.045em",
                  lineHeight: 1,
                  background: "linear-gradient(120deg, #B9AEFF 0%, #8B7BFF 45%, #5BD8F5 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {tile.value}
                <span style={{ fontSize: "0.42em", letterSpacing: 0 }}>{tile.unit}</span>
              </p>
              <div
                aria-hidden
                className="shrink-0 self-stretch my-5 mr-6"
                style={{ width: 1, background: "rgba(255,255,255,0.12)" }}
              />
              <div className="min-w-0 py-5">
                <p className="text-[9.5px] font-bold uppercase" style={{ letterSpacing: "0.16em", color: "rgba(255,255,255,0.45)" }}>
                  {tile.label}
                </p>
                <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: "rgba(255,255,255,0.92)" }}>
                  {tile.note}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}