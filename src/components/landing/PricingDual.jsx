import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Sparkles, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import SectionHeading from "@/components/landing/SectionHeading";
import { useTranslation } from "@/lib/i18n.jsx";
import { getSuccessFeePct, PRODUCT_POLICY } from "@/lib/productPolicy";
import { useMarket } from "@/lib/publicExperience.jsx";

/**
 * Pricing — three-tier edition (Addendum R1, 2026-07-12).
 *
 * Three visually distinct cards on one row:
 *   1. Analyze      — free, always. Anonymous 60s + verified analysis via Stripe.
 *   2. Monitoring   — €29/mo standard; founding cohort (first 150 brands) locks in
 *                     12 months free, price shown struck-through with badge.
 *   3. Recovery     — 25% of verified savings, 24-month agreement, only if we recover.
 *
 * The two durations live in different columns and read differently — kept
 * separate on purpose so no reader confuses them:
 *   • Monitoring   — "Free for 12 months — founding cohort" (grant duration).
 *   • Recovery     — "24-month agreement" (contract duration for success fee).
 *
 * NO monitoring product yet, NO subscription entities, NO dynamic 150-counter.
 * The founding-cohort promise is TEXTUAL only. The Monitoring CTA points at
 * the analyzer (same as Analyze) — the actual join-monitoring flow ships later.
 */
// i18n keys — resolved with t() inside the component so the cards follow
// the active language on both the Landing and the /Pricing page.
const FREE_FEATURE_KEYS = ["pd_t1_f1", "pd_t1_f2", "pd_t1_f3", "pd_t1_f4"];
const RECOVERY_FEATURE_KEYS = ["pd_t2_f1", "pd_t2_f2", "pd_t2_f3", "pd_t2_f4"];

function Eyebrow({ children, accent = "ink" }) {
  const color = accent === "voltio" ? "var(--voltio)" : "var(--gris-1)";
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-px w-5"
        style={{ background: accent === "voltio" ? "rgba(91,76,245,0.4)" : "var(--linea)" }}
      />
      <span
        className="text-[9px] uppercase font-bold"
        style={{ letterSpacing: "0.28em", color }}
      >
        {children}
      </span>
    </div>
  );
}

function FeatureRow({ children }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="mt-[5px] inline-flex h-3.5 w-3.5 items-center justify-center rounded-full shrink-0"
        style={{
          background: "rgba(139,123,255,0.20)",
          border: "1px solid rgba(139,123,255,0.5)",
        }}
      >
        <Check size={9} style={{ color: "var(--voltio-2)" }} strokeWidth={3} />
      </span>
      <span className="text-[12.5px] leading-[1.55]" style={{ color: "var(--gris-1)" }}>{children}</span>
    </li>
  );
}

/**
 * Tier — one pricing column.
 *
 * `priceRow` overrides the default single `price` render — used by Monitoring
 * to show the strikethrough €29/mo alongside the "Free for 12 months" claim
 * plus the founding-cohort badge below it, all inside the same block that
 * `price`/`priceSuffix` would normally occupy. Keeps every other tier
 * (Analyze, Recovery) rendering unchanged.
 */
function Tier({
  eyebrow,
  eyebrowAccent,
  price,
  priceSuffix = null,
  priceGradient = false,
  priceRow = null,
  strike = null,
  caption,
  features,
  ctaText,
  ctaPrimary,
  ctaHref,
}) {
  return (
    <div className="relative flex flex-col p-6 sm:p-7 h-full">
      <Eyebrow accent={eyebrowAccent}>{eyebrow}</Eyebrow>

      {/* Price block */}
      <div className="mt-5 sm:mt-6">
        {priceRow ? (
          priceRow
        ) : (
          <>
            <div
              className="font-black tabular-nums"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(44px, 5.2vw, 64px)",
                letterSpacing: "-0.055em",
                lineHeight: 0.9,
                ...(priceGradient
                  ? {
                      background: "var(--g-voltio)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 0 18px rgba(91,76,245,0.28))",
                    }
                  : { color: "var(--ink)" }),
              }}
            >
              {price}
            </div>
            {priceSuffix && (
              <p className="mt-2 text-[12px] font-medium leading-snug" style={{ color: "var(--gris-1)" }}>
                {priceSuffix}
              </p>
            )}
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 min-h-[18px]">
        {strike && (
          <span
            className="text-[11px]"
            style={{ textDecoration: "line-through", color: "var(--gris-2)" }}
          >
            {strike}
          </span>
        )}
        {caption && (
          <span className="text-[11px] font-medium" style={{ color: "var(--gris-1)" }}>{caption}</span>
        )}
      </div>

      {/* Hairline */}
      <div
        className="my-6 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--linea) 50%, transparent 100%)",
        }}
      />

      {/* Features */}
      <ul className="space-y-2.5 flex-1">
        {features.map((f) => (
          <FeatureRow key={f}>{f}</FeatureRow>
        ))}
      </ul>

      {/* CTA */}
      <Link
        to={ctaHref}
        className="mt-7 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 h-11 font-bold text-[13px] transition-all hover:translate-y-[-1px]"
        style={
          ctaPrimary
            ? {
                background: "var(--g-voltio)",
                color: "#ffffff",
                boxShadow: "0 14px 36px -14px rgba(91,76,245,0.5)",
              }
            : {
                background: "#ffffff",
                color: "var(--ink)",
                border: "1px solid rgba(91,76,245,0.30)",
              }
        }
      >
        {ctaText}
        <ArrowUpRight size={14} strokeWidth={2.5} />
      </Link>
    </div>
  );
}

export default function PricingDual() {
  const recoveryV2Available = PRODUCT_POLICY.economicTerms.recoverEconomicsV2LegalApproved === true;
  const { t } = useTranslation();
  const { experience } = useMarket();
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* ambient halo */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700,
          height: 700,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(91,76,245,0.025) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        {/* Header */}
        <SectionHeading eyebrow={t("pd_eyebrow")} className="mb-6">
          {t("pd_h2_pre")}
          <br />
          <span className="kw">{t("pd_h2_kw")}</span>
        </SectionHeading>
        <div className="text-center mb-12 sm:mb-14">
          <p className="text-[13px] sm:text-[14px] max-w-lg mx-auto" style={{ color: "var(--gris-1)" }}>
            {t(recoveryV2Available ? "pd_sub_v2" : "pd_sub")}
          </p>
        </div>

        {/* Two columns — Analyze · Recover */}
        <div className="relative grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 max-w-3xl mx-auto pt-4">
          {/* Flow connector between the two steps */}
          <motion.div
            aria-hidden
            initial={{ opacity: 0, scale: 0.6 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.35 }}
            className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: "var(--g-voltio)",
              boxShadow: "0 10px 24px -10px rgba(91,76,245,0.5)",
              border: "3px solid #ffffff",
            }}
          >
            <ArrowRight size={15} className="text-white" strokeWidth={2.5} />
          </motion.div>
          {/* STEP 1 — Analyze (free, always) */}
          <div
            className="relative rounded-3xl overflow-hidden"
            style={{
              background: "#ffffff",
              border: "1px solid var(--linea)",
              boxShadow: "0 30px 80px -40px rgba(12,12,22,0.12)",
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 320, height: 320, left: "-15%", top: "-25%",
                background: "radial-gradient(circle, rgba(91,76,245,0.02) 0%, transparent 70%)",
                filter: "blur(60px)",
              }}
            />
            <span
              className="absolute top-5 right-5 text-[9px] uppercase font-bold tracking-[0.24em]"
              style={{ color: "var(--gris-2)" }}
              aria-hidden
            >
              {t("pd_step1")}
            </span>
            <Tier
              eyebrow={t("pd_t1_eyebrow")}
              eyebrowAccent="ink"
              price={t("pd_t1_price")}
              priceGradient
              caption={t("pd_t1_caption")}
              features={FREE_FEATURE_KEYS.map((k) => t(k))}
              ctaText={t("pd_t1_cta")}
              ctaPrimary={false}
              ctaHref={experience.analyzer.href}
            />
          </div>

          {/* STEP 2 — Recover (25% success fee, 24-month agreement) */}
          <div className="relative">
            {/* Most popular badge — sits on the wrapper (no overflow) so it never clips */}
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-30"
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[10px] uppercase font-bold tracking-[0.14em] text-white whitespace-nowrap"
                style={{
                  background: "#3A2BB0",
                  border: "2px solid #ffffff",
                  boxShadow: "0 10px 24px -8px rgba(58,43,176,0.6)",
                }}
              >
                <Sparkles size={11} strokeWidth={2.5} />
                {t("pd_popular")}
              </span>
            </motion.div>

            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                background: "#ffffff",
                border: "1px solid rgba(91,76,245,0.30)",
                boxShadow: "0 30px 80px -40px rgba(91,76,245,0.12)",
              }}
            >
              {/* Animated gradient border sweep — the WOW frame on the featured tier */}
              <motion.div
                aria-hidden
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  padding: 1.5,
                  background:
                    "linear-gradient(120deg, rgba(91,76,245,0) 20%, rgba(139,123,255,0.9) 50%, rgba(57,198,240,0.9) 60%, rgba(91,76,245,0) 85%)",
                  backgroundSize: "220% 220%",
                  WebkitMask:
                    "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                  WebkitMaskComposite: "xor",
                  maskComposite: "exclude",
                }}
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
              />
              <div
                aria-hidden
                className="absolute pointer-events-none"
                style={{
                  width: 360, height: 360, right: "-15%", bottom: "-25%",
                  background: "radial-gradient(circle, rgba(91,76,245,0.035) 0%, transparent 70%)",
                  filter: "blur(60px)",
                }}
              />
              <span
                className="absolute top-5 right-5 text-[9px] uppercase font-bold tracking-[0.24em]"
                style={{ color: "var(--voltio)" }}
                aria-hidden
              >
                {t("pd_step2")}
              </span>
              <Tier
                eyebrow={t("pd_t2_eyebrow")}
                eyebrowAccent="voltio"
                price={recoveryV2Available ? `${getSuccessFeePct()}→15→0%` : getSuccessFeePct() + "%"}
                priceSuffix={t(recoveryV2Available ? "pd_t2_suffix_v2" : "pd_t2_suffix")}
                priceGradient
                caption={t("pd_t2_caption")}
                features={RECOVERY_FEATURE_KEYS.map((k) => t(k))}
                ctaText={t(experience.analyzer.status === "ENABLED" ? "pd_t2_cta" : "market_cta_access")}
                ctaPrimary={true}
                ctaHref={experience.analyzer.href}
              />
            </div>
          </div>
        </div>

        {/* Tiny footnote */}
        <p className="mt-6 text-center text-[11px]" style={{ color: "var(--gris-2)" }}>
          {t("pd_footnote")}
        </p>
      </div>
    </section>
  );
}
