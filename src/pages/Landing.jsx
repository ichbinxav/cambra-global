import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import Navbar from "@/components/landing/Navbar";
import { useTranslation } from "@/lib/i18n.jsx"; // used by HowItWorksSection + LandingFooter
import AuroraBackground from "@/components/landing/AuroraBackground";
import AnimatedSection from "@/components/landing/AnimatedSection";
import SavingsCurveChart from "@/components/landing/SavingsCurveChart";
import TestimonialsCarousel from "@/components/landing/TestimonialsCarousel";
import FounderLetter from "@/components/landing/FounderLetter";
import PricingDual from "@/components/landing/PricingDual";
import StopLeavingMarginCTA from "@/components/landing/StopLeavingMarginCTA";
import ProblemSectionWow from "@/components/landing/ProblemSectionWow";
import InStoreUpsellStrip from "@/components/landing/InStoreUpsellStrip";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";

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
  return (
    <section className="relative flex items-center overflow-hidden" style={{ minHeight: "100vh", color: "#ffffff", paddingTop: 80 }}>
      {/* Cinematic ambient layers */}
      <AuroraBackground intensity={1} />

      {/* Spotlight halo behind headline */}
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 720, height: 720, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
      />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* LEFT — aggressive copy */}
        <div className="lg:col-span-7">
          <motion.div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-8 text-[11px] uppercase tracking-[0.22em]"
            style={{
              border: "1px solid rgba(96,165,250,0.30)",
              color: "rgba(255,255,255,0.85)",
              background: "rgba(59,130,246,0.06)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "0 0 24px rgba(59,130,246,0.18)",
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
            </span>
            Pay only if we save you money
          </motion.div>

          <motion.h1
            className="text-white"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            style={{
              fontSize: "clamp(44px, 7.5vw, 96px)",
              fontWeight: 900,
              letterSpacing: "-0.05em",
              lineHeight: 0.94,
              textShadow: "0 0 60px rgba(59,130,246,0.18)",
            }}
          >
            Stop overpaying.
            <br />
            <span
              style={{
                background:
                  "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Recover the margin.
            </span>
          </motion.h1>

          <motion.p
            className="mt-8 text-white/60"
            style={{ maxWidth: 560, fontSize: 18, lineHeight: 1.6 }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
          >
            Most independent brands overpay <span className="text-white">up to 40%</span> on card payments — hidden inside blended rates. CAMBRA measures your effective rate against the interchange floor and recovers what's negotiable. <span className="text-white">You keep 75%. We only get paid when you do.</span>
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
                className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-4 font-bold text-[14px] transition-shadow"
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(59,130,246,0.6), 0 0 40px rgba(59,130,246,0.25)",
                }}
              >
                Recover your margin — 3 min
                <ArrowRight size={16} />
              </Link>
            </motion.div>
            <motion.a
              whileHover={{ scale: 1.03, borderColor: "rgba(255,255,255,0.5)", color: "rgba(255,255,255,0.95)" }}
              href="#testimonials"
              className="inline-flex items-center rounded-full px-8 py-4 text-[14px] font-medium"
              style={{
                border: "1px solid rgba(255,255,255,0.20)",
                color: "rgba(255,255,255,0.70)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              Discover real brands savings
            </motion.a>
          </motion.div>

          {/* Trust row */}
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px]"
            style={{ color: "rgba(255,255,255,0.45)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.6 }}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-cyan-300/80" />
              No retainer · no contract
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-cyan-300/80" />
              Credentials encrypted, never in plain text
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-cyan-300/80" />
              EU brands only
            </span>
          </motion.div>
        </div>

        {/* RIGHT — animated cumulative savings chart */}
        <motion.div
          className="lg:col-span-5"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
        >
          <div
            className="relative p-6 sm:p-8 rounded-2xl overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              boxShadow:
                "0 30px 80px -30px rgba(0,0,0,0.6), 0 0 60px -20px rgba(96,165,250,0.18)",
            }}
          >
            {/* Corner badge — Illustrative projection (2026-07-12 · R3).
                Was "Live · network median / Q3 2026" — presented a fabricated
                network figure (€48k) as live telemetry. Reframed as an
                illustrative projection derived from our benchmark methodology,
                anchored to the ICP (DTC €200k–€2M). No dated tag anymore. */}
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-bold text-white/60">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
                </span>
                Illustrative · Projection
              </span>
              <span className="text-[10px] text-white/35 font-mono">DTC · €200k–€2M GMV</span>
            </div>
            <SavingsCurveChart className="mt-6" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// Note: legacy ProblemSection removed — landing now renders ProblemSectionWow.

function HowItWorksSection() {
  const { t } = useTranslation();
  // NOTE: 4-step story — Tell us → See gap → Connect to confirm → Join to recover.
  // Kept in-file (single language) on purpose: the copy is honest about what we
  // measure vs. what we confirm, and dictionaries can be updated later.
  const steps = [
    {
      n: "01",
      title: "Tell us what you process",
      desc: "Your annual GMV, average ticket, and current PSP. Sixty seconds. Nothing to connect.",
    },
    {
      n: "02",
      title: "See your effective rate",
      desc: "We compare what you actually pay against the interchange floor — the real minimum for cards your size.",
    },
    {
      n: "03",
      title: "Connect Stripe to confirm",
      desc: "Read-only. Your estimate becomes a confirmed number from real transaction data.",
    },
    {
      n: "04",
      title: "Join to recover it",
      desc: "Claim your savings and join the brands negotiating as one. Together we unlock rates none of us could get alone.",
      cta: true,
    },
  ];

  return (
    <section id="how" className="relative py-12 sm:py-16 overflow-hidden">
      {/* ambient blue wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, right: "-10%", top: "10%",
          background: "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <div className="text-center mb-10">
            <SectionLabel className="mb-6 inline-block">{t("how_label")}</SectionLabel>
            <h2
              className="text-white max-w-3xl mx-auto text-center"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(36px, 5.5vw, 60px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
              }}
            >
              Four steps from{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                estimate to recovered margin.
              </span>
            </h2>
          </div>
        </AnimatedSection>

        <div className="relative space-y-3">
          {/* Animated connector line behind the steps */}
          <motion.div
            aria-hidden
            className="absolute left-8 top-0 bottom-0 w-px hidden sm:block"
            style={{
              background:
                "linear-gradient(180deg, transparent, rgba(96,165,250,0.4), rgba(44,167,193,0.3), transparent)",
              boxShadow: "0 0 16px rgba(96,165,250,0.3)",
            }}
            initial={{ scaleY: 0, originY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          />

          {steps.map((s, i) => (
            <AnimatedSection key={s.n} delay={i * 0.15}>
              <motion.div
                whileHover={{ scale: 1.005, borderColor: "rgba(96,165,250,0.25)" }}
                transition={{ duration: 0.3 }}
                className="surface relative overflow-hidden p-8 sm:p-10 group"
                style={{ background: "rgba(255,255,255,0.025)" }}
              >
                {/* hover glow halo */}
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 20% 50%, rgba(59,130,246,0.10), transparent 60%)",
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
                      "linear-gradient(180deg, rgba(96,165,250,0.18), rgba(255,255,255,0.02) 70%)",
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
                      style={{ background: "#60a5fa", boxShadow: "0 0 12px rgba(96,165,250,0.8)" }}
                      aria-hidden
                    />
                    <SectionLabel>Step {s.n}</SectionLabel>
                  </div>
                  <h3 className="text-title text-white mb-3">{s.title}</h3>
                  <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.55)" }}>{s.desc}</p>
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
  return (
    <footer
      style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
      className="py-10"
    >
      <div className="max-w-6xl mx-auto px-6 sm:px-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.45)" }}>
            <span className="font-black text-white" style={{ letterSpacing: "-0.04em" }}>CAMBRA</span>
            <span className="mx-2">·</span>
            {t("footer_tagline")}
          </p>
          <p className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.30)" }}>
            CAMBRA GLOBAL SASU · SIREN 105 452 916 · 42 rue Vivienne, 75002 Paris, France · support@cambra.global
          </p>
        </div>
        <div className="flex items-center gap-6 text-[13px] flex-wrap" style={{ color: "rgba(255,255,255,0.45)" }}>
          <Link to="/ForProviders" className="hover:text-white transition-colors">{t("footer_for_providers")}</Link>
          <Link to="/Privacy" className="hover:text-white transition-colors">{t("footer_privacy")}</Link>
          <Link to="/Terms" className="hover:text-white transition-colors">{t("footer_terms")}</Link>
          <Link to="/Cookies" className="hover:text-white transition-colors">Cookies</Link>
          <Link to="/Contact" className="hover:text-white transition-colors">{t("footer_contact")}</Link>
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
        color: "#ffffff",
        // Continuous editorial gradient — no flat #0a0a0a "cuts" between sections
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      {/* Fixed ambient noise/grid that unifies every section */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />

      <LandingJsonLd />
      <Navbar />
      <main className="relative">
        <Hero />
        {/* M4-TPV Fase 2B — RESTAURADO 2026-07-12 tras Fase 2A-redo verificada
            (motor 1.4.0 en las 3 copias SYNC + 19 filas seed + retrocompat
            online byte-idéntica). Strip señala que payments cubre ambos canales
            (online + in-store TPV) sin prometer números que el motor no puede
            calcular todavía — el CTA lleva al Analyzer donde el toggle real vive. */}
        <InStoreUpsellStrip />
        <ProblemSectionWow />
        <HowItWorksSection />
        <PricingDual />
        <TestimonialsCarousel />
        <FounderLetter />
        <StopLeavingMarginCTA />
      </main>
      <LandingFooter />
    </div>
  );
}