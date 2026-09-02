import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import { useTranslation } from "@/lib/i18n.jsx";
import { BASE_FEE_PCT, ENTRY_FEE_PCT, STEP_POINTS, FLOOR_FEE_PCT } from "@/lib/referralProgram";
import { useMarket } from "@/lib/publicExperience.jsx";

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
  const { experience } = useMarket();

  const entryPct = ENTRY_FEE_PCT;
  const sub = t("ref_land_sub")
    .replace("{step}", String(STEP_POINTS))
    .replace("{floor}", `${FLOOR_FEE_PCT}%`)
    .replace("{entry}", `${entryPct}%`)
    .replace("{base}", `${BASE_FEE_PCT}%`);

  const tiles = [
    { icon: Users, label: t("ref_land_t1_label"), value: `−${STEP_POINTS}`, unit: "pts", note: t("ref_land_t1_note") },
    { icon: ShieldCheck, label: t("ref_land_t2_label"), value: `${FLOOR_FEE_PCT}`, unit: "%", note: t("ref_land_t2_note") },
    { icon: TrendingUp, label: t("ref_land_t3_label"), value: `${entryPct}`, unit: "%", note: t("ref_land_t3_note").replace("{base}", `${BASE_FEE_PCT}%`) },
  ];

  return (
    <section id="referrals" className="relative scroll-mt-20 py-12 sm:py-16 overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, right: "-8%", top: "10%",
          background: "radial-gradient(circle, rgba(91,76,245,0.06) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-[1500px] mx-auto px-6 sm:px-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-10 xl:gap-14 items-start">
        <motion.div
          className="lg:col-span-6 text-center lg:text-left"
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
              fontSize: "clamp(38px, 5vw, 60px)",
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
            <Link to={experience.analyzer.href} className="btn-primary inline-flex items-center gap-2">
              {t(experience.analyzer.status === "ENABLED" ? "ref_land_cta" : "market_cta_access")}
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

        <div className="lg:col-span-6 space-y-3.5 lg:pt-40 xl:pt-44">
          {tiles.map((tile, i) => {
            const Icon = tile.icon;
            return (
            <motion.div
              key={tile.label}
              className="group relative grid grid-cols-[108px_1fr_48px] sm:grid-cols-[122px_1fr_58px] items-stretch overflow-hidden"
              style={{
                borderRadius: 24,
                minHeight: 112,
                background: "linear-gradient(135deg,rgba(255,255,255,.98),rgba(249,249,255,.92))",
                border: "1px solid rgba(91,76,245,.13)",
              }}
              initial={{ opacity: 0, x: 28 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.12 }}
              whileHover={{ y: -2 }}
            >
              <div className="relative flex items-center justify-center" style={{ borderRight: "1px solid #403889", background: "linear-gradient(145deg,#100D27 0%,#332878 54%,#3156A9 100%)" }}>
                <span aria-hidden className="absolute left-4 top-3 text-[8px] font-bold tracking-[.2em]" style={{ color: "#B7AFFF" }}>0{i + 1}</span>
                <p className="flex items-baseline justify-center whitespace-nowrap font-black tabular-nums text-center text-white" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif", fontSize: "clamp(42px,4.1vw,52px)", letterSpacing: "-0.045em", lineHeight: 1 }}>
                  <span>{tile.value}</span>
                  <span className="ml-1.5 font-bold" style={{ color: "#E4E0FF", fontSize: "0.34em", letterSpacing: ".02em" }}>{tile.unit}</span>
                </p>
              </div>
              <div className="min-w-0 px-4 sm:px-6 py-5 self-center">
                <p className="text-[9.5px] font-bold uppercase" style={{ letterSpacing: "0.18em", color: "var(--voltio)" }}>
                  {tile.label}
                </p>
                <p className="mt-2 text-[13.5px] font-medium leading-snug" style={{ color: "var(--ink)" }}>
                  {tile.note}
                </p>
              </div>
              <span className="m-auto inline-flex h-10 w-10 items-center justify-center rounded-[13px] transition-transform duration-300 group-hover:scale-105" style={{ color: "var(--voltio)", background: "linear-gradient(145deg,#fff,rgba(91,76,245,.08))", border: "1px solid rgba(91,76,245,.12)", boxShadow: "0 12px 28px -22px rgba(91,76,245,.8)" }}>
                <Icon size={19} aria-hidden="true" />
              </span>
            </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
