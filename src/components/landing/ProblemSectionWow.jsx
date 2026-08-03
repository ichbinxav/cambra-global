import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, Globe2, Coins, AlertTriangle } from "lucide-react";
import AnimatedSection from "@/components/landing/AnimatedSection";
import SectionHeading from "@/components/landing/SectionHeading";
import { useTranslation } from "@/lib/i18n.jsx";

/**
 * Problem section — payments-only edition · R6 canonical recalibration (2026-07-13).
 *
 * Three angles of the SAME problem — hidden overpayment on card payments.
 * Numbers derived from the SINGLE CANONICAL REFERENCE BRAND used across
 * the whole public surface (see Decision_Log · "Landing reference brand"):
 *
 *   GMV €1M/yr · current effective 2.21% · achievable 1.47% · gap 0.74 pts
 *   → cost today   = €1M × 2.21% = €22,100/yr  (of which €14,700/yr is
 *                     unavoidable — interchange + scheme floor, kept forever)
 *   → overpaying   = €1M × 0.74% = €7,400/yr   (THE recoverable portion)
 *   → over 24 mo   = €7,400 × 2  ≈ €15,000     (matches the pricing window)
 *   → relative     = €7,400 / €22,100 ≈ 33%    (comfortably under the
 *                     "up to 40%" band advertised in the H2)
 *
 * CRITICAL distinction — do NOT confuse:
 *   • €14,700/yr = what the merchant STILL pays after optimisation (floor).
 *     This is NOT recoverable, ever. Never present it as savings.
 *   • €7,400/yr  = the gap. THIS is what CAMBRA recovers.
 * Mixing the two is the €48k fabricated-telemetry class of error and must
 * not happen again.
 *
 * The three cards below decompose the €7,400/yr gap into its narrative
 * angles (blended / cross-border / fixed-fee drag). Amounts sum to €7,400
 * so the TOTAL BLEED and the SavingsCurveChart's "recovered" figure close
 * the same account:
 *   —€7,400/yr overpaying   =   €7,400/yr × 24 mo ≈ €15,000 recovered.
 *
 * Total is a live reduce over ITEMS — NOT hardcoded. If the reference brand
 * assumptions change, retune the three amounts (keeping their proportions)
 * and everything else follows.
 */
const ITEMS = [
  {
    icon: TrendingDown,
    categoryKey: "prob_c1_cat",
    bodyKey: "prob_c1_body",
    amount: 3900,
    // Largest angle — blended pricing hides most of the gap.
    // Overpay vs achievable on the % component: (2.21% − 1.47%) / 1.47% ≈ +50%.
    overpayPct: 50,
    accent: "rgba(239,68,68,0.65)",
    glow: "rgba(239,68,68,0.08)",
  },
  {
    icon: Globe2,
    categoryKey: "prob_c2_cat",
    bodyKey: "prob_c2_body",
    amount: 2200,
    // ~30% of the gap on the reference brand (~15% intl share, +1.75%
    // Stripe EU/UK cross-border vs a negotiated ~0.9% on the same portion).
    // Visual cap +38% keeps the bar under the "up to 40%" H2 band.
    overpayPct: 38,
    accent: "rgba(249,115,22,0.65)",
    glow: "rgba(249,115,22,0.08)",
  },
  {
    icon: Coins,
    categoryKey: "prob_c3_cat",
    bodyKey: "prob_c3_body",
    amount: 1300,
    // €0.25 vs €0.15 per-tx on ~€65 avg ticket ≈ +25% overpay on the fixed
    // component (the % component isn't affected). ~17% of the total gap.
    overpayPct: 25,
    accent: "rgba(236,72,153,0.65)",
    glow: "rgba(236,72,153,0.08)",
  },
];

const TOTAL = ITEMS.reduce((acc, i) => acc + i.amount, 0);

/* Animated counter — kicks in on view */
function useCountUp(target, durationMs = 1600, start = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);
  return val;
}

function Card({ item, index }) {
  const { t } = useTranslation();
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }),
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const counted = useCountUp(item.amount, 1600 + index * 200, inView);
  const barFill = inView ? item.overpayPct : 0;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.7, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="relative rounded-2xl p-6 sm:p-7 h-full group overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #14112e 0%, #0a0818 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 20px 50px -25px rgba(0,0,0,0.5)",
      }}
    >
      {/* corner glow — matches category accent */}
      <div
        aria-hidden
        className="absolute pointer-events-none transition-opacity duration-500 opacity-60 group-hover:opacity-100"
        style={{
          width: 300, height: 300, right: "-25%", top: "-30%",
          background: `radial-gradient(circle, ${item.glow} 0%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />

      {/* icon + category */}
      <div className="relative flex items-center gap-3 mb-5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <item.icon size={16} style={{ color: item.accent, opacity: 0.8 }} />
        </div>
        <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/60">
          {t(item.categoryKey)}
        </p>
      </div>

      {/* HUGE counter */}
      <div className="relative">
        <p
          className="font-black tabular-nums mb-1"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(42px, 6vw, 60px)",
            letterSpacing: "-0.05em",
            lineHeight: 0.95,
            background: `linear-gradient(135deg, #ffffff 0%, ${item.accent} 120%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          −€{counted.toLocaleString("en-US")}
          <span
            className="text-[14px] font-bold ml-1"
            style={{
              color: "rgba(255,255,255,0.45)",
              WebkitTextFillColor: "rgba(255,255,255,0.45)",
              filter: "none",
            }}
          >
            /{t("per_yr_short")}
          </span>
        </p>
        <p
          className="text-[10px] uppercase tracking-[0.22em] font-bold mb-5"
          style={{ color: item.accent, opacity: 0.6 }}
        >
          {t("prob_card_illustrative")}
        </p>
      </div>

      {/* Overpay bar — visual proof */}
      <div className="relative mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40">
            {t("prob_card_overpay")}
          </span>
          <span
            className="text-[11px] font-black tabular-nums"
            style={{ color: item.accent }}
          >
            +{item.overpayPct}%
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${barFill}%` }}
            transition={{ duration: 1.4, delay: 0.4 + index * 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full"
            style={{
              background: item.accent,
              opacity: 0.7,
            }}
          />
        </div>
      </div>

      <p className="relative text-[13px] text-white/55 leading-relaxed">{t(item.bodyKey)}</p>
    </motion.div>
  );
}

export default function ProblemSectionWow() {
  const { t } = useTranslation();
  const [totalInView, setTotalInView] = useState(false);
  const totalRef = useRef(null);

  useEffect(() => {
    const el = totalRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { setTotalInView(true); io.disconnect(); } }),
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const totalCount = useCountUp(TOTAL, 2200, totalInView);

  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* ambient red wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "10%", transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <SectionHeading eyebrow={t("prob_eyebrow")} className="mb-4">
            {t("prob_h2_pre")}{" "}
            {/* DA v1.1 Chunk 1c — Rule 1: single keyword. "up to 40%" is the
                PROBLEM/cost → .kw-c (Coral Gap). */}
            <span className="kw-c">{t("prob_h2_kw")}</span>{" "}
            {t("prob_h2_post")}
            <br />
            <span className="kw-c">{t("prob_h2_kw2")}</span>
          </SectionHeading>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12">
          {ITEMS.map((item, i) => (
            <Card key={item.categoryKey} item={item} index={i} />
          ))}
        </div>

        {/* Cinematic total reveal */}
        <motion.div
          ref={totalRef}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-10 rounded-2xl p-6 sm:p-8 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #1f1420 0%, #0d0a1a 100%)",
            border: "1px solid rgba(249,115,22,0.45)",
            boxShadow: "0 24px 70px -28px rgba(249,115,22,0.6), 0 0 40px -8px rgba(249,115,22,0.35)",
          }}
        >
          {/* pulsing glow — stronger orange */}
          <motion.div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 520, height: 520, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
              background: "radial-gradient(circle, rgba(255,159,67,0.42) 0%, rgba(249,115,22,0.28) 42%, transparent 74%)",
              filter: "blur(70px)",
            }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.65, 1, 0.65] }}
            transition={{ duration: 4, ease: "easeInOut", repeat: Infinity }}
          />

          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(239,68,68,0.12)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  boxShadow: "0 0 24px rgba(239,68,68,0.35)",
                }}
              >
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-red-300/85 mb-1">
                  {t("prob_total_label")}
                </p>
                <p className="text-[13px] text-white/55 max-w-md">
                  <span className="text-white/85 font-semibold">
                    {t("prob_total_line1")}
                  </span>
                  {" · "}
                  <span className="text-red-300/85 font-semibold">
                    {t("prob_total_line2")}
                  </span>
                  {t("prob_total_line3")}
                </p>
                <p className="text-[11px] text-white/40 mt-2 leading-snug max-w-md">
                  {t("prob_total_note")}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p
                className="font-black tabular-nums"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(40px, 5.5vw, 64px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.95,
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #FF9F43 45%, #F97316 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 26px rgba(249,115,22,0.7))",
                }}
              >
                −€{totalCount.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-white/45 mt-1">
                {t("prob_total_per")}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}