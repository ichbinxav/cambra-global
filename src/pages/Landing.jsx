import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BadgeEuro, Eye, FileSearch, Handshake, LockKeyhole, ScanSearch, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SectionHeading from "@/components/landing/SectionHeading";
import Navbar from "@/components/landing/Navbar";
import { useTranslation } from "@/lib/i18n.jsx"; // used by HowItWorksSection + LandingFooter
import AnimatedSection from "@/components/landing/AnimatedSection";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import FounderLetter from "@/components/landing/FounderLetter";
import PricingDual from "@/components/landing/PricingDual";
import StopLeavingMarginCTA from "@/components/landing/StopLeavingMarginCTA";
import ProblemSectionWow from "@/components/landing/ProblemSectionWow";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";
import TheStackSection from "@/components/landing/TheStackSection";
import ReferralProgramSection from "@/components/landing/ReferralProgramSection";
import TrustSecuritySection from "@/components/landing/TrustSecuritySection";
import { useMarket } from "@/lib/publicExperience.jsx";

/* ──────────────────────────────────────────────────────────
   CAMBRA Landing — editorial redesign · EN / FR / ES
   ────────────────────────────────────────────────────────── */

function Hero() {
  const { t } = useTranslation();
  const { experience } = useMarket();
  const benefits = [
    { icon: FileSearch, key: "how_step2_title" },
    { icon: Handshake, key: "pd_t2_f2" },
    { icon: ShieldCheck, key: "pd_t2_caption" },
  ];

  return (
    <section
      id="overview"
      className="relative flex items-center overflow-hidden"
      aria-labelledby="landing-hero-title"
      style={{ minHeight: "clamp(680px, 88vh, 860px)", color: "var(--ink)", paddingTop: 76 }}
    >
      <motion.div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 820, height: 820, right: "-12%", top: "4%",
          background: "radial-gradient(circle, rgba(91,76,245,0.10) 0%, rgba(57,198,240,0.03) 46%, transparent 72%)",
          filter: "blur(80px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 7, ease: "easeInOut", repeat: Infinity }}
      />

      <div className="relative z-10 w-full max-w-[1500px] mx-auto px-6 sm:px-10 lg:px-14 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,.92fr)] gap-8 lg:gap-3 xl:gap-0 items-center">
        <div className="min-w-0 lg:pr-0">
          <motion.div
            className="mb-6"
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
              fontSize: "clamp(43px, 4.15vw, 64px)",
              fontWeight: 900,
              letterSpacing: "-0.05em",
              lineHeight: 0.98,
              maxWidth: 760,
            }}
          >
            {t("hero_h1_line1")}
            <br />
            <span className="kw">{t("hero_h1_line2")}</span>
          </motion.h1>

          <motion.p
            className="mt-7"
            style={{ maxWidth: 590, fontSize: 17, lineHeight: 1.58, color: "var(--gris-1)" }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.25 }}
          >
            {t("hero_sub")}
          </motion.p>

          <motion.ul
            className="mt-7 grid gap-3"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.34 }}
          >
            {benefits.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-center gap-3 text-[13.5px] font-semibold" style={{ color: "var(--ink)" }}>
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ color: "var(--voltio)", background: "rgba(91,76,245,.08)", border: "1px solid rgba(91,76,245,.14)" }}>
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                </span>
                {t(key)}
              </li>
            ))}
          </motion.ul>

          <motion.div
            className="mt-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
              <Link
                to={experience.analyzer.href}
                className="inline-flex items-center gap-2 rounded-full px-8 py-4 font-medium text-[14px] transition-transform hover:-translate-y-0.5"
                style={{
                  background: "var(--g-voltio)",
                  color: "#fff",
                  boxShadow: "0 12px 32px -12px rgba(91,76,245,0.5)",
                }}
              >
                {t(experience.analyzer.status === "ENABLED" ? "hero_cta_primary" : "market_cta_access")}
                <ArrowRight size={16} />
              </Link>
            </motion.div>
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--gris-2)" }}>
              <ShieldCheck size={13} style={{ color: "var(--voltio)" }} aria-hidden="true" />
              {t("hero_trust_1")}
            </p>
          </motion.div>
        </div>

        <motion.div
          className="relative flex min-w-0 items-center justify-center overflow-visible lg:justify-end"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        >
          <img
            src="/images/cambra-fee-audit-24m-v3.png"
            alt={t("hero_image_alt")}
            width={1291}
            height={1218}
            className="relative h-auto w-[78%] max-w-[510px] select-none lg:w-[92%] lg:max-w-[544px]"
            style={{ filter: "contrast(.995) saturate(1.02) drop-shadow(0 24px 38px rgba(91,76,245,.12))" }}
            draggable={false}
          />
        </motion.div>
      </div>
    </section>
  );
}

function HeroTrustStrip() {
  const { t } = useTranslation();
  const items = [
    { icon: Eye, title: "trust_sec_b2_t", body: "trust_sec_b2_d", accent: "#8B7BFF" },
    { icon: BadgeEuro, title: "pd_t2_caption", body: "hero_trust_2", accent: "#6B8CFF" },
    { icon: ScanSearch, title: "stack_c3_t", body: "stack_c3_d", accent: "#39C6F0" },
    { icon: LockKeyhole, title: "trust_sec_b1_t", body: "trust_sec_b1_d", accent: "#2FE0A8" },
  ];

  return (
    <section className="relative px-5 sm:px-8 pb-12 sm:pb-16" aria-label={t("trust_sec_eyebrow")}>
      <div
        className="relative max-w-[1440px] mx-auto overflow-hidden rounded-[28px]"
        style={{
          background: "linear-gradient(118deg,#090817 0%,#151139 48%,#071923 100%)",
          border: "1px solid #302A66",
        }}
      >
        <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(circle at 22% 0%,rgba(139,123,255,.18),transparent 36%),radial-gradient(circle at 82% 110%,rgba(57,198,240,.13),transparent 38%)" }} />
        <div aria-hidden className="absolute left-[6%] right-[6%] top-0 h-px" style={{ background: "linear-gradient(90deg,transparent,#8B7BFF,#39C6F0,transparent)" }} />
        <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#302A57]">
          {items.map(({ icon: Icon, title, body, accent }, index) => (
            <article key={title} className="group relative flex items-center gap-4 px-6 py-7 sm:px-7 lg:min-h-[124px]">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] transition-transform duration-300 group-hover:-translate-y-0.5" style={{ color: accent, background: `linear-gradient(145deg,${accent}2A,#0B0A1A)`, border: `1px solid ${accent}66` }}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-[13.5px] font-bold leading-snug tracking-[-.015em] text-white">{t(title)}</h2>
                <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "#CAC7DF" }}>{t(body)}</p>
              </div>
              <span aria-hidden className="absolute right-4 top-4 text-[9px] font-bold tabular-nums" style={{ color: accent, letterSpacing: ".12em" }}>0{index + 1}</span>
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
                style={{ background: "#ffffff", border: "1px solid var(--linea)", borderRadius: 26 }}
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

                <div className="relative z-10 flex h-full max-w-xl flex-col lg:max-w-none">
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
        <Hero />
        <HeroTrustStrip />
        <ProblemSectionWow />
        <TheStackSection />
        <HowItWorksSection />
        <PricingDual />
        <ReferralProgramSection />
        <TrustSecuritySection />
        <FounderLetter />
        <StopLeavingMarginCTA />
      </main>
      <LandingFooter />
    </div>
  );
}