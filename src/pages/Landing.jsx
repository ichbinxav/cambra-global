import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SectionHeading from "@/components/landing/SectionHeading";
import Navbar from "@/components/landing/Navbar";
import { useTranslation } from "@/lib/i18n.jsx"; // used by HowItWorksSection + LandingFooter
import AuroraBackground from "@/components/landing/AuroraBackground";
import AnimatedSection from "@/components/landing/AnimatedSection";
import TestimonialsCarousel from "@/components/landing/TestimonialsCarousel";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import FounderLetter from "@/components/landing/FounderLetter";
import PricingDual from "@/components/landing/PricingDual";
import StopLeavingMarginCTA from "@/components/landing/StopLeavingMarginCTA";
import ProblemSectionWow from "@/components/landing/ProblemSectionWow";
import InStoreUpsellStrip from "@/components/landing/InStoreUpsellStrip";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";
import TheStackSection from "@/components/landing/TheStackSection";
import RealImpactSection from "@/components/landing/RealImpactSection";
import Founding150Section from "@/components/landing/Founding150Section";

/* FIX 12 — JSON-LD structured data for SoftwareApplication */
const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "CAMBRA",
  "slogan": "Pay less for card payments",
  "description": "CAMBRA helps independent brands reduce what they pay for card payments. Anonymous 60-second analysis compares your effective payment rate against interchange floors and recovers the negotiable margin.",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR",
    "description": "Free anonymous payments analysis during early access. Optional recovery service earns 25% of verified savings over 24 months — only when CAMBRA actually recovers margin. No upfront fee, no subscription."
  },
  "featureList": [
    "Payment fee benchmarking",
    "Interchange floor analysis",
    "Effective rate calculation",
    "Anonymous 60-second audit"
  ],
  "audience": {
    "@type": "BusinessAudience",
    "audienceType": "Independent ecommerce brands"
  }
};

function useJsonLd(data) {
  useEffect(() => {
    const id = "cambra-landing-jsonld";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
    return () => { /* keep across SPA navigation */ };
  }, [data]);
}

/* ──────────────────────────────────────────────────────────
   CAMBRA Landing — editorial redesign · EN / FR / ES
   ────────────────────────────────────────────────────────── */

// JSON-LD injector — no visible UI. The visible navbar is the shared
// <Navbar /> component so every public page renders the same header.
function LandingJsonLd() {
  useJsonLd(LANDING_JSON_LD);
  return null;
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative flex items-center overflow-hidden" style={{ minHeight: "100vh", color: "var(--ink)", paddingTop: 48 }}>
      {/* DA v1.1 Chunk 1d — Aurora navy removida sobre hero claro. Spotlight
          reducido a un wash voltio suave (~25% opacidad) para no ensuciar. */}
      {/* eslint-disable-next-line no-unused-vars */}
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 720, height: 720, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(91,76,245,0.08) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* LEFT — aggressive copy */}
        <div className="lg:col-span-7">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 mb-8 text-[10px] uppercase font-semibold"
            style={{
              border: "1px solid var(--linea)",
              color: "var(--gris-1)",
              background: "rgba(12,12,22,0.04)",
              letterSpacing: "0.14em",
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "#5B4CF5" }}
            />
            {t("hero_badge")}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            style={{
              color: "var(--ink)",
              fontSize: "clamp(46px, 7.8vw, 100px)",
              fontWeight: 900,
              letterSpacing: "-0.05em",
              lineHeight: 0.94,
            }}
          >
            {t("hero_h1_line1")}
            <br />
            {/* Keyword highlight uses the reference violet→cyan gradient (.kw).
                Menta is reserved for explicitly positive figures (gains). */}
            <span className="kw">{t("hero_h1_line2")}</span>
          </motion.h1>

          <motion.p
            className="mt-8"
            style={{ maxWidth: 560, fontSize: 18, lineHeight: 1.6, color: "var(--gris-1)" }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
          >
            {t("hero_sub")}
          </motion.p>

          <motion.div
            className="mt-10 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/Analyzer"
                className="inline-flex items-center gap-2 rounded-full px-8 py-4 font-medium text-[14px] transition-colors hover:bg-[#4A3AD1]"
                style={{
                  background: "#3A2BB0",
                  color: "#fff",
                }}
              >
                {t("hero_cta_primary")}
                <ArrowRight size={16} />
              </Link>
            </motion.div>
            <a
              href="#testimonials"
              className="inline-flex items-center rounded-full px-8 py-4 text-[14px] font-medium transition-colors hover:border-[color:var(--ink)]"
              style={{
                border: "1px solid var(--linea)",
                color: "var(--gris-1)",
                background: "#fff",
              }}
            >
              {t("hero_cta_secondary")}
            </a>
          </motion.div>

          {/* Trust row */}
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px]"
            style={{ color: "var(--gris-2)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} style={{ color: "var(--menta-dark)" }} />
              {t("hero_trust_1")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} style={{ color: "var(--menta-dark)" }} />
              {t("hero_trust_2")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} style={{ color: "var(--menta-dark)" }} />
              {t("hero_trust_3")}
            </span>
          </motion.div>
        </div>

        {/* RIGHT — hero visual intentionally left empty for now. */}
        <div className="hidden lg:block lg:col-span-5" aria-hidden />
      </div>
    </section>
  );
}

// Note: legacy ProblemSection removed — landing now renders ProblemSectionWow.

function HowItWorksSection() {
  const { t } = useTranslation();
  // 4-step story — Tell us → See rate → Connect to confirm → Join to recover.
  // Copy now flows through the i18n dictionary (how_step*_*) so the section
  // follows the language toggle. Step 3 is provider-agnostic (des-Stripe).
  const steps = [
    { n: "01", title: t("how_step1_title"), desc: t("how_step1_desc") },
    { n: "02", title: t("how_step2_title"), desc: t("how_step2_desc") },
    { n: "03", title: t("how_step3_title"), desc: t("how_step3_desc") },
    { n: "04", title: t("how_step4_title"), desc: t("how_step4_desc"), cta: true },
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
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <SectionHeading eyebrow={t("how_label")} className="mb-10">
            {t("how_h2_pre")}{" "}
            <span className="kw">{t("how_h2_hl")}.</span>
          </SectionHeading>
        </AnimatedSection>

        <div className="relative space-y-3">
          {/* Animated connector line behind the steps */}
          <motion.div
            aria-hidden
            className="absolute left-8 top-0 bottom-0 w-px hidden sm:block"
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
                className="relative overflow-hidden p-8 sm:p-10 group"
                style={{ background: "#ffffff", border: "1px solid var(--linea)", borderRadius: 26, boxShadow: "0 4px 20px rgba(12,12,22,0.04)" }}
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
                  className="absolute -top-6 right-6 text-mono select-none"
                  style={{
                    fontSize: "clamp(96px, 14vw, 180px)",
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

                <div className="relative z-10 max-w-xl">
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="relative inline-flex w-2 h-2 rounded-full"
                      style={{ background: "#8B7BFF", boxShadow: "0 0 12px rgba(139,123,255,0.8)" }}
                      aria-hidden
                    />
                    <SectionLabel>Step {s.n}</SectionLabel>
                  </div>
                  <h3 className="text-title mb-3" style={{ color: "var(--ink)" }}>{s.title}</h3>
                  <p className="text-[14px]" style={{ color: "var(--gris-1)" }}>{s.desc}</p>
                  {s.cta && (
                    <div className="mt-5">
                      <JoinWaitlistButton />
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
    { to: "/Privacy", label: t("footer_privacy") },
    { to: "/Terms", label: t("footer_terms") },
    { to: "/Cookies", label: "Cookies" },
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
          background: "rgba(10,8,24,0.97)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
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
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
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
            CAMBRA GLOBAL SASU · SIREN 105 452 916 · 42 rue Vivienne, 75002 Paris, France · support@cambra.global
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
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

      <LandingJsonLd />
      <Navbar />
      <main className="relative">
        {/* DA v1.1 — decorative dot-grid corner (hero) */}
        <div className="dot-grid" aria-hidden />
        <Hero />
        {/* Sections render directly on the paper canvas — NO wrappers.
            Each section owns its own inner dark pills/cards internally. */}
        <InStoreUpsellStrip />
        <ProblemSectionWow />
        <TheStackSection />
        <HowItWorksSection />
        <RealImpactSection />
        <PricingDual />
        <TestimonialsCarousel />
        <Founding150Section />
        <FounderLetter />
        <StopLeavingMarginCTA />
      </main>
      <LandingFooter />
    </div>
  );
}