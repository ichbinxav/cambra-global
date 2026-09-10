import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Eye,
  MonitorSmartphone,
  PanelsTopLeft,
  Scale,
  ShieldCheck,
  Target,
} from "lucide-react";
import { motion } from "framer-motion";
import SectionLabel from "@/components/shared/SectionLabel";
import SectionHeading from "@/components/landing/SectionHeading";
import Navbar from "@/components/landing/Navbar";
import { useTranslation } from "@/lib/i18n.jsx"; // used by HowItWorksSection + LandingFooter
import AnimatedSection from "@/components/landing/AnimatedSection";
import { BRAND_ASSETS } from "@/lib/brandAssets";
import PricingDual from "@/components/landing/PricingDual";
import StopLeavingMarginCTA from "@/components/landing/StopLeavingMarginCTA";
import TheStackSection from "@/components/landing/TheStackSection";
import TrustSecuritySection from "@/components/landing/TrustSecuritySection";
import AudienceSection from "@/components/landing/AudienceSection";
import RealImpactSection from "@/components/landing/RealImpactSection";
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

      <div className="cambra-public-container relative z-10 grid w-full grid-cols-1 items-center gap-8 py-10 lg:py-14 min-[1180px]:grid-cols-[minmax(0,1.02fr)_minmax(520px,.98fr)] min-[1180px]:gap-8">
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
              maxWidth: 780,
              textWrap: "pretty",
            }}
          >
            {t("hero_h1_line1")}<br /><span className="kw">{t("hero_h1_line2")}</span>
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
          <div className="relative w-full max-w-[760px] min-[1180px]:translate-x-2">
            <img
              src={BRAND_ASSETS.landingHero}
              alt={t("hero_image_alt")}
              width={1536}
              height={1024}
              className="relative h-auto w-full select-none"
              style={{ filter: "contrast(.995) saturate(1.01) drop-shadow(0 26px 42px rgba(91,76,245,.13))" }}
              draggable={false}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[57.9%] top-[16.1%] h-[6.3%] w-[14.8%] rounded-[10px]"
              style={{
                background: "linear-gradient(145deg,rgba(255,255,255,.98),rgba(245,247,255,.94))",
                boxShadow: "0 0 16px 8px rgba(249,250,255,.72)",
              }}
            />
          </div>
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
    <section className="relative pb-12 sm:pb-16" aria-label={t("hero_audience")}>
      <div
        className="cambra-public-container relative overflow-hidden rounded-[26px]"
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

function HowItWorksSection() {
  const { t } = useTranslation();
  const { experience } = useMarket();
  const benefits = [
    { icon: Eye, title: "prob_c1_cat", desc: "prob_c1_body", status: "prob_c1_status", color: "#A678FF" },
    { icon: Scale, title: "prob_c2_cat", desc: "prob_c2_body", status: "prob_c2_status", color: "#5E82FF" },
    { icon: Target, title: "prob_c3_cat", desc: "prob_c3_body", status: "prob_c3_status", color: "#39C6F0" },
  ];
  const steps = [
    { n: "01", icon: MonitorSmartphone, title: t("how_step1_title"), desc: t("how_step1_desc"), connect: true },
    { n: "02", icon: ChartNoAxesCombined, title: t("how_step2_title"), desc: t("how_step2_desc") },
    { n: "03", icon: Target, title: t("how_step3_title"), desc: t("how_step3_desc"), cta: true },
  ];

  return (
    <section id="how" className="relative py-12 sm:py-16 overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, right: "-10%", top: "10%",
          background: "radial-gradient(circle, rgba(91,76,245,0.10) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div className="cambra-public-container relative">
        <AnimatedSection className="grid grid-cols-1 items-end gap-6 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-7">
            <SectionHeading eyebrow={`${t("prob_eyebrow")} · ${t("how_label")}`} align="left">
              {t("how_h2_pre")}<br />
              <span className="kw">{t("how_h2_hl")}.</span>
            </SectionHeading>
          </div>
          <div className="lg:col-span-5 lg:pb-1">
            <p className="text-[15px] font-bold leading-relaxed" style={{ color: "var(--ink)" }}>{t("prob_h2_post")}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t("prob_intro")}</p>
          </div>
        </AnimatedSection>

        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3">
          {benefits.map(({ icon: Icon, title, desc, status, color }, index) => (
            <AnimatedSection key={title} delay={index * 0.08}>
              <article className="group relative h-full overflow-hidden rounded-[22px] border bg-white p-6" style={{ borderColor: `${color}32`, boxShadow: "0 22px 52px -44px rgba(14,14,26,.55)" }}>
                <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg,${color},transparent 84%)` }} />
                <div className="flex items-start justify-between gap-4">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]" style={{ color, border: `1px solid ${color}40`, background: `${color}10` }}>
                    <Icon size={19} strokeWidth={1.85} aria-hidden="true" />
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.16em]" style={{ color }}>
                    <ShieldCheck size={11} aria-hidden="true" /> {t(status)}
                  </span>
                </div>
                <h3 className="mt-5 text-[18px] font-bold tracking-[-.025em]" style={{ color: "var(--ink)" }}>{t(title)}</h3>
                <p className="mt-2.5 text-[12.5px] leading-relaxed" style={{ color: "var(--gris-1)" }}>{t(desc)}</p>
              </article>
            </AnimatedSection>
          ))}
        </div>

        <div className="relative mt-5 overflow-hidden rounded-[30px] px-5 py-6 sm:px-7 sm:py-8 lg:px-9" style={{ background: "linear-gradient(135deg,#17143A 0%,#0A0C19 62%,#071625 100%)", border: "1px solid rgba(139,123,255,.22)", boxShadow: "0 34px 80px -58px rgba(34,30,105,.8)" }}>
          <div aria-hidden className="absolute inset-0 opacity-35" style={{ backgroundImage: "radial-gradient(rgba(139,123,255,.26) 1px,transparent 1px)", backgroundSize: "26px 26px", maskImage: "radial-gradient(circle at 76% 0%,#000,transparent 62%)" }} />
          <div className="relative grid grid-cols-1 gap-3 lg:grid-cols-3">
            {steps.map((s, i) => {
              const StepIcon = s.icon;
              return (
            <AnimatedSection key={s.n} delay={i * 0.15}>
              <motion.div
                transition={{ duration: 0.3 }}
                className="group relative h-full overflow-hidden rounded-[22px] border border-white/[.1] p-6 sm:p-7"
                style={{ background: "rgba(255,255,255,.055)" }}
              >
                <div aria-hidden className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(circle at 10% 0%,rgba(139,123,255,.14),transparent 58%)" }} />
                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-[#B9AEFF]" style={{ background: "rgba(139,123,255,.12)", border: "1px solid rgba(139,123,255,.26)" }}>
                      <StepIcon size={19} strokeWidth={1.85} aria-hidden="true" />
                    </span>
                    <span className="font-mono text-[10px] font-bold tracking-[.2em] text-white/45">{t("how_step_label")} {s.n}</span>
                  </div>
                  <h3 className="mb-2.5 text-[20px] font-bold tracking-[-.025em] text-white">{s.title}</h3>
                  <p className="text-[13px] leading-relaxed text-white/60">{s.desc}</p>
                  {s.connect && (
                    <div className="mt-auto pt-6">
                      <Link
                        to="/Analyzer"
                        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#65DDF7]"
                      >
                        {t("ci_title")} <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                  {s.cta && (
                    <div className="mt-auto pt-6">
                      <Link
                        to={experience.analyzer.href}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 text-[12px] font-bold text-white"
                        style={{ background: "var(--g-voltio)", boxShadow: "0 14px 30px -18px rgba(91,76,245,.72)" }}
                      >
                        {t(experience.analyzer.status === "ENABLED" ? "hero_cta_primary" : "market_cta_access")} <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatedSection>
              );
            })}
          </div>
        </div>

        <RealImpactSection embedded />
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
        className="relative w-full overflow-hidden pt-20 pb-14"
        style={{
          background: "#0A0818",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div className="cambra-public-container relative flex flex-col lg:flex-row lg:items-end justify-between gap-10">
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
          className="cambra-public-container relative mt-12 pt-6"
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
