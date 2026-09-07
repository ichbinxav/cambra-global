import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CalendarDays, MonitorSmartphone, PanelsTopLeft } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SectionHeading from "@/components/landing/SectionHeading";
import Navbar from "@/components/landing/Navbar";
import { useTranslation } from "@/lib/i18n.jsx"; // used by HowItWorksSection + LandingFooter
import AnimatedSection from "@/components/landing/AnimatedSection";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import PricingDual from "@/components/landing/PricingDual";
import StopLeavingMarginCTA from "@/components/landing/StopLeavingMarginCTA";
import ProblemSectionWow from "@/components/landing/ProblemSectionWow";
import TheStackSection from "@/components/landing/TheStackSection";
import TrustSecuritySection from "@/components/landing/TrustSecuritySection";
import AudienceSection from "@/components/landing/AudienceSection";
import BookCallModal from "@/components/paymentsResults/BookCallModal";
import { useMarket } from "@/lib/publicExperience.jsx";

/* ──────────────────────────────────────────────────────────
   CAMBRA Landing — editorial redesign · all product locales
   ────────────────────────────────────────────────────────── */

function Hero({ onBookDemo }) {
  const { t } = useTranslation();
  const { experience } = useMarket();

  return (
    <section
      id="overview"
      className="relative flex items-center overflow-hidden"
      aria-labelledby="landing-hero-title"
      style={{ minHeight: "clamp(680px, 84vh, 860px)", color: "var(--ink)", paddingTop: 76 }}
    >
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 820, height: 820, right: "-12%", top: "4%",
          background: "radial-gradient(circle, rgba(91,76,245,0.10) 0%, rgba(57,198,240,0.03) 46%, transparent 72%)",
          filter: "blur(80px)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.78 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />

      <div className="relative z-10 w-full max-w-[1560px] mx-auto px-6 sm:px-10 lg:px-12 py-10 lg:py-14 grid grid-cols-1 min-[1180px]:grid-cols-[minmax(0,.96fr)_minmax(500px,1.04fr)] gap-8 min-[1180px]:gap-10 items-center">
        <div className="relative z-10 min-w-0">
          <motion.div
            className="mb-7"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <SectionLabel>{t("hero_badge")}</SectionLabel>
          </motion.div>

          <motion.h1
            id="landing-hero-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            style={{
              color: "var(--ink)",
              fontSize: "clamp(44px, 3.85vw, 68px)",
              fontWeight: 900,
              letterSpacing: "-0.05em",
              lineHeight: 0.99,
              maxWidth: 730,
              textWrap: "pretty",
            }}
          >
            {t("hero_h1_line1")} <span className="kw">{t("hero_h1_line2")}</span>
          </motion.h1>

          <motion.p
            className="mt-7"
            style={{ maxWidth: 650, fontSize: 17, lineHeight: 1.58, color: "var(--gris-1)" }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
          >
            {t("hero_sub")}
          </motion.p>

          <motion.p
            className="mt-5 inline-flex items-center gap-2.5 text-[13.5px] font-bold"
            style={{ color: "var(--ink)" }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.34 }}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--voltio)", boxShadow: "0 0 0 6px rgba(91,76,245,.08)" }} />
            {t("hero_audience")}
          </motion.p>

          <motion.div
            className="mt-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-[560px]">
              <motion.div className="flex-1" whileHover={{ scale: 1.025 }} whileTap={{ scale: 0.98 }}>
                <Link
                  to={experience.analyzer.href}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-full px-7 font-bold text-[14px] transition-transform hover:-translate-y-0.5"
                  style={{
                    background: "var(--g-voltio)",
                    color: "#fff",
                    boxShadow: "0 15px 34px -14px rgba(91,76,245,0.58)",
                  }}
                >
                  {t(experience.analyzer.status === "ENABLED" ? "hero_cta_primary" : "market_cta_access")}
                  <ArrowRight size={16} />
                </Link>
              </motion.div>
              <button
                type="button"
                onClick={onBookDemo}
                className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-full border px-7 text-[14px] font-bold transition-colors hover:bg-white"
                style={{ color: "var(--ink)", background: "rgba(255,255,255,.68)", borderColor: "rgba(14,14,26,.15)" }}
              >
                <CalendarDays size={16} /> {t("hero_cta_secondary")}
              </button>
            </div>
          </motion.div>
        </div>

        <motion.div
          className="relative flex min-w-0 flex-col items-center justify-center min-[1180px]:items-end"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        >
          <div className="relative w-full max-w-[720px]">
            <img
              src={BRAND_ASSETS.landingHero}
              alt={t("hero_image_alt")}
              width={1536}
              height={1024}
              className="relative h-auto w-full select-none"
              style={{ filter: "contrast(.995) saturate(1.01) drop-shadow(0 26px 42px rgba(91,76,245,.13))" }}
              draggable={false}
            />
            {/* The approved render has a tiny baked-in example badge. This
                frosted patch removes only that badge while preserving the
                real alpha canvas and every approved figure in the artwork. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[57.8%] top-[15.8%] h-[6.6%] w-[16.2%] rounded-[3px]"
              style={{
                background: "linear-gradient(145deg,rgba(255,255,255,.985),rgba(249,250,255,.975))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.98)",
              }}
            />
          </div>
          <p className="mt-2 w-full max-w-[560px] text-center text-[10.5px] leading-relaxed min-[1180px]:self-center" style={{ color: "var(--gris-2)" }}>
            {t("hero_visual_footer")}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

function HeroTrustStrip() {
  const { t } = useTranslation();
  const items = [
    { icon: MonitorSmartphone, title: "analyzer_channel_online", body: "az_ch_online_sub", accent: "#8B7BFF" },
    { icon: Building2, title: "az_tpv_label", body: "az_ch_instore_sub", accent: "#5E82FF" },
    { icon: PanelsTopLeft, title: "ac_chip_impact_complete", body: "hero_audience", accent: "#39C6F0" },
  ];

  return (
    <section className="relative px-5 sm:px-8 pb-12 sm:pb-16" aria-label={t("hero_audience")}>
      <div
        className="relative max-w-[1440px] mx-auto overflow-hidden rounded-[26px]"
        style={{
          background: "rgba(255,255,255,.88)",
          border: "1px solid rgba(91,76,245,.13)",
          boxShadow: "0 26px 70px -48px rgba(20,17,46,.48), inset 0 1px 0 rgba(255,255,255,.9)",
          backdropFilter: "blur(18px)",
        }}
      >
        <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(circle at 12% 0%,rgba(139,123,255,.09),transparent 34%),radial-gradient(circle at 90% 110%,rgba(57,198,240,.07),transparent 34%)" }} />
        <div aria-hidden className="absolute left-[6%] right-[6%] top-0 h-px" style={{ background: "linear-gradient(90deg,transparent,#8B7BFF,#39C6F0,transparent)" }} />
        <div className="relative grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E7E4F4]">
          {items.map(({ icon: Icon, title, body, accent }) => (
            <article key={title} className="group relative flex items-center gap-4 px-6 py-7 sm:px-7 lg:min-h-[124px]">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] transition-transform duration-300 group-hover:-translate-y-0.5" style={{ color: accent, background: `linear-gradient(145deg,${accent}18,#fff)`, border: `1px solid ${accent}38`, boxShadow: `0 14px 28px -24px ${accent}` }}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[13.5px] font-bold leading-snug tracking-[-.015em]" style={{ color: "var(--ink)" }}>{t(title)}</h2>
                <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(body)}</p>
              </div>
              <span aria-hidden className="absolute right-4 top-4 h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// Note: legacy ProblemSection removed — landing now renders ProblemSectionWow.

function HowItWorksSection() {
  const { t } = useTranslation();
  const { experience } = useMarket();
  // Three plain-language steps: show us → understand → recover.
  const steps = [
    { n: "01", title: t("how_step1_title"), desc: t("how_step1_desc"), connect: true },
    { n: "02", title: t("how_step2_title"), desc: t("how_step2_desc") },
    { n: "03", title: t("how_step3_title"), desc: t("how_step3_desc"), cta: true },
  ];

  return (
    <section id="how" className="relative py-12 sm:py-16 overflow-hidden">
      {/* ambient blue wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, right: "-10%", top: "10%",
          background: "radial-gradient(circle, rgba(91,76,245,0.10) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div className="relative max-w-7xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <SectionHeading eyebrow={t("how_label")} align="left" className="mb-10">
            {t("how_h2_pre")}{" "}
            <span className="kw">{t("how_h2_hl")}.</span>
          </SectionHeading>
        </AnimatedSection>

        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Animated connector line behind the steps */}
          <motion.div
            aria-hidden
            className="absolute left-8 top-0 bottom-0 w-px hidden sm:block lg:hidden"
            style={{
              background:
                "linear-gradient(180deg, transparent, rgba(139,123,255,0.45), rgba(91,76,245,0.3), transparent)",
              boxShadow: "0 0 16px rgba(139,123,255,0.3)",
            }}
            initial={{ scaleY: 0, originY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          />

          {steps.map((s, i) => (
            <AnimatedSection key={s.n} delay={i * 0.15}>
              <motion.div
                transition={{ duration: 0.3 }}
                className="relative h-full overflow-hidden p-7 sm:p-9 lg:p-7 group"
                style={{ background: "#ffffff", border: "1px solid rgba(91,76,245,.28)", borderRadius: 26 }}
              >
                {/* hover glow halo */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 20% 50%, rgba(91,76,245,0.06), transparent 60%)",
                  }}
                />
                {/* Giant number — gradient */}
                <span
                  aria-hidden
                  className="absolute top-3 right-5 text-mono select-none"
                  style={{
                    fontSize: "clamp(78px, 8vw, 118px)",
                    fontWeight: 900,
                    letterSpacing: "-0.05em",
                    lineHeight: 1,
                    background:
                      "linear-gradient(180deg, rgba(91,76,245,0.55) 0%, rgba(139,123,255,0.3) 55%, rgba(12,12,22,0.03) 95%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {s.n}
                </span>

                <div className="relative z-10 flex h-full max-w-xl flex-col pt-14 lg:max-w-none">
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="relative inline-flex w-2 h-2 rounded-full"
                      style={{ background: "var(--voltio-2)", boxShadow: "0 0 12px rgba(139,123,255,0.8)" }}
                      aria-hidden
                    />
                    <SectionLabel>{t("how_step_label")} {s.n}</SectionLabel>
                  </div>
                  <h3 className="text-title mb-3" style={{ color: "var(--ink)" }}>{s.title}</h3>
                  <p className="text-[14px]" style={{ color: "var(--gris-1)" }}>{s.desc}</p>
                  {s.connect && (
                    <div className="mt-auto flex justify-center pt-6">
                      <Link
                        to="/ConnectTools"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-[12.5px] font-bold text-white"
                        style={{ background: "var(--ink)", boxShadow: "0 12px 28px -18px rgba(12,12,22,.65)" }}
                      >
                        {t("ci_title")} <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                  {s.cta && (
                    <div className="mt-auto flex justify-center pt-6">
                      <Link
                        to={experience.analyzer.href}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-[12.5px] font-bold text-white"
                        style={{ background: "var(--g-voltio)", boxShadow: "0 14px 30px -18px rgba(91,76,245,.72)" }}
                      >
                        {t(experience.analyzer.status === "ENABLED" ? "hero_cta_primary" : "market_cta_access")} <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

// Note: legacy BenchmarkSection removed — landing now renders StatsGrid.
// Note: legacy PricingCTASection removed — landing now renders PricingDual + StopLeavingMarginCTA.

function LandingFooter() {
  const { t } = useTranslation();
  const links = [
    { to: "/ForProviders", label: t("footer_for_providers") },
    { to: "/Security", label: t("footer_security") },
    { to: "/Privacy", label: t("footer_privacy") },
    { to: "/Terms", label: t("footer_terms") },
    { to: "/Cookies", label: t("footer_cookies") },
    { to: "/Contact", label: t("footer_contact") },
  ];
  return (
    <footer className="relative mt-16">
      {/* Full-bleed dark footer — a solid navy band cut straight across the
          bottom of the paper page (no rounded pill). Soft purple/cyan ambient
          glow + subtle dot-grid so the page fades naturally into the end. */}
      <div
        className="relative w-full overflow-hidden px-6 sm:px-10 pt-20 pb-14"
        style={{
          background: "#0A0818",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="relative max-w-6xl mx-auto flex flex-col lg:flex-row lg:items-end justify-between gap-10">
          <div>
            <span
              className="font-black text-white inline-flex items-center gap-2.5"
              style={{ letterSpacing: "-0.04em", fontSize: 22 }}
            >
              <img src={BRAND_ASSETS.cMarkWhite} alt="" width={26} height={26} className="h-[26px] w-[26px]" draggable={false} />
              CAMBRA
            </span>
            <p className="mt-2 max-w-sm text-[14px] font-bold leading-relaxed text-white">
              {t("footer_tagline")}
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-7 gap-y-3 text-[13px]">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="transition-colors"
                style={{ color: "rgba(255,255,255,0.60)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.60)")}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div
          className="relative max-w-6xl mx-auto mt-12 pt-6"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
        >
          <p className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.35)" }}>
            CAMBRA Global SASU · SIREN 105 452 916 · SIRET 105 452 916 00015 · VAT FR50105452916 · 47 rue Vivienne, 75002 Paris, France · support@cambra.global
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div
      className="min-h-screen font-inter relative"
      style={{
        // Fondo claro (paper) global. Las secciones van directas sobre él, sin
        // ningún wrapper/pastilla envolviéndolas.
        color: "var(--ink)",
        background: "var(--paper)",
      }}
    >
      {/* Fixed ambient DOT mesh — violet dots across the whole paper canvas.
          Two offset layers scattered in DIFFERENT directions (coarse layer
          anchored top-left, fine layer anchored bottom-right + half-offset)
          so the texture reads organic/random rather than a rigid grid. Two
          soft radial fades (top-right + center-left) blend the mesh in without
          any hard edge — nothing gets cut off at the bottom. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "radial-gradient(rgba(91,76,245,0.28) 1.3px, transparent 2px)",
          backgroundSize: "34px 30px",
          backgroundPosition: "0 0",
          opacity: 1,
          maskImage:
            "radial-gradient(120% 90% at 82% 12%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(120% 90% at 82% 12%, #000 0%, rgba(0,0,0,0.35) 55%, transparent 100%)",
        }}
      />

      <Navbar />
      <main className="relative">
        {/* DA v1.1 — decorative dot-grid corner (hero) */}
        <div className="dot-grid" aria-hidden />
        <Hero onBookDemo={() => setDemoOpen(true)} />
        <HeroTrustStrip />
        <ProblemSectionWow />
        <HowItWorksSection />
        <TheStackSection />
        <TrustSecuritySection />
        <AudienceSection />
        <PricingDual />
        <StopLeavingMarginCTA onBookDemo={() => setDemoOpen(true)} />
      </main>
      <LandingFooter />
      <BookCallModal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        context={{ source: "landing_demo" }}
      />
    </div>
  );
}
