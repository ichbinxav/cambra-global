import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingDown, Package, Layers, BarChart3, Truck, FileText, Sparkles, ShieldCheck, Menu, X } from "lucide-react";
import { useState } from "react";
import SectionLabel from "@/components/shared/SectionLabel";
import LanguageSwitcher from "@/components/shared/LanguageSwitcher";
import { useTranslation } from "@/lib/i18n.jsx";
import AuroraBackground from "@/components/landing/AuroraBackground";
import AnimatedSection from "@/components/landing/AnimatedSection";
import SavingsCurveChart from "@/components/landing/SavingsCurveChart";
import TestimonialsCarousel from "@/components/landing/TestimonialsCarousel";
import FounderLetter from "@/components/landing/FounderLetter";
import StatsGrid from "@/components/landing/StatsGrid";
import PricingDual from "@/components/landing/PricingDual";
import StopLeavingMarginCTA from "@/components/landing/StopLeavingMarginCTA";
import ProblemSectionWow from "@/components/landing/ProblemSectionWow";
import IntegrationsLogos from "@/components/landing/IntegrationsLogos";
import OneScanSection from "@/components/landing/OneScanSection";

/* FIX 12 — JSON-LD structured data for SoftwareApplication */
const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "CAMBRA",
  "description": "Infrastructure cost intelligence platform for independent European brands. Benchmarks payment fees, shipping costs and SaaS spend.",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR",
    "description": "Free analysis. 25% success fee on verified savings only."
  },
  "featureList": [
    "Payment fee benchmarking",
    "Shipping cost analysis",
    "SaaS spend audit",
    "Infrastructure graph",
    "Stripe integration",
    "AI-powered recommendations"
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

function LandingNavbar() {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useJsonLd(LANDING_JSON_LD);
  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10"
        style={{
          height: 60,
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Link to="/" className="text-white" style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: 18 }}>
          CAMBRA
        </Link>

        <div className="hidden md:flex items-center gap-8 text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          <a href="#how" className="hover:text-white transition-colors">{t("nav_how")}</a>
          <Link to="/Pricing" className="hover:text-white transition-colors">{t("nav_pricing")}</Link>
          <Link to="/Developers" className="hover:text-white transition-colors">{t("nav_developers")}</Link>
        </div>

        {/* Desktop right side */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageSwitcher variant="dark" />
          <Link
            to="/Analyzer"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold bg-white text-black hover:opacity-90 transition-opacity"
          >
            {t("nav_get_started")}
          </Link>
        </div>

        {/* Mobile right side — hamburger + compact CTA */}
        <div className="flex md:hidden items-center gap-2">
          <Link
            to="/Analyzer"
            className="inline-flex items-center rounded-full px-3.5 py-1.5 text-[12px] font-bold bg-white text-black hover:opacity-90"
          >
            {t("nav_get_started")}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full text-white"
            style={{ border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.04)" }}
          >
            {mobileOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50 animate-fade-up"
            style={{ animationDuration: "200ms" }}
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div
            className="absolute left-0 right-0 top-[60px] overflow-y-auto animate-fade-up"
            style={{
              maxHeight: "calc(100vh - 60px)",
              background:
                "radial-gradient(120% 60% at 50% 0%, rgba(31,78,216,0.18) 0%, transparent 55%), linear-gradient(180deg, hsl(222 65% 5%) 0%, hsl(222 70% 3%) 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
            }}
          >
            <nav className="px-6 py-6 flex flex-col gap-1">
              <a
                href="#how"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white text-[15px] font-semibold border-b border-white/[0.06]"
              >
                {t("nav_how")} <ArrowRight size={14} className="text-white/40" />
              </a>
              <Link
                to="/Pricing"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white text-[15px] font-semibold border-b border-white/[0.06]"
              >
                {t("nav_pricing")} <ArrowRight size={14} className="text-white/40" />
              </Link>
              <Link
                to="/Developers"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white text-[15px] font-semibold border-b border-white/[0.06]"
              >
                {t("nav_developers")} <ArrowRight size={14} className="text-white/40" />
              </Link>
              <a
                href="/auth/start"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between py-3.5 text-white/80 text-[15px] font-semibold"
              >
                Sign in <ArrowRight size={14} className="text-white/40" />
              </a>

              <div className="pt-5">
                <LanguageSwitcher variant="dark" />
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function Hero() {
  const { t } = useTranslation();
  return (
    <section className="relative flex items-center overflow-hidden" style={{ minHeight: "100vh", color: "#ffffff", paddingTop: 80 }}>
      {/* Cinematic ambient layers */}
      <AuroraBackground intensity={1} />

      {/* Spotlight halo behind headline — pure CSS pulse */}
      <div
        aria-hidden
        className="absolute pointer-events-none landing-halo-pulse"
        style={{
          width: 720, height: 720, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)",
          filter: "blur(70px)",
        }}
      />
      <style>{`
        @keyframes landingHaloPulse {
          0%, 100% { opacity: 0.85; transform: translate(-50%, -50%) scale(1); }
          50%      { opacity: 1;    transform: translate(-50%, -50%) scale(1.08); }
        }
        .landing-halo-pulse { animation: landingHaloPulse 7s ease-in-out infinite; }
        @keyframes landingCtaPulse {
          0%, 100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
          50%      { opacity: 1;   transform: translate(-50%, -50%) scale(1.15); }
        }
        .landing-cta-pulse { animation: landingCtaPulse 6s ease-in-out infinite; }
      `}</style>

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 sm:px-10 py-20 lg:py-28 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* LEFT — aggressive copy */}
        <div className="lg:col-span-7">
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-8 text-[11px] uppercase tracking-[0.22em] animate-fade-up"
            style={{
              border: "1px solid rgba(96,165,250,0.30)",
              color: "rgba(255,255,255,0.85)",
              background: "rgba(59,130,246,0.06)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              boxShadow: "0 0 24px rgba(59,130,246,0.18)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
            </span>
            Pay only if we save you money
          </div>

          <h1
            className="text-white animate-fade-up"
            style={{
              animationDelay: "100ms",
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
          </h1>

          <p
            className="mt-8 text-white/60 animate-fade-up"
            style={{ maxWidth: 560, fontSize: 18, lineHeight: 1.6, animationDelay: "250ms" }}
          >
            Most independent brands overpay <span className="text-white">15–30%</span> on payments, shipping and SaaS. CAMBRA benchmarks every line against our network and recovers what's yours. <span className="text-white">You keep 75%. We only get paid when you do.</span>
          </p>

          <div
            className="mt-10 flex flex-wrap items-center gap-3 animate-fade-up"
            style={{ animationDelay: "400ms" }}
          >
            <Link
              to="/Analyzer"
              className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-4 font-bold text-[14px] transition-transform hover:scale-[1.04] active:scale-[0.97]"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(59,130,246,0.6), 0 0 40px rgba(59,130,246,0.25)",
              }}
            >
              Find what you're losing — 3 min
              <ArrowRight size={16} />
            </Link>
            <a
              href="#testimonials"
              className="inline-flex items-center rounded-full px-8 py-4 text-[14px] font-medium transition-all hover:scale-[1.03] hover:text-white"
              style={{
                border: "1px solid rgba(255,255,255,0.20)",
                color: "rgba(255,255,255,0.70)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              See a sample report
            </a>
          </div>

          {/* Trust row */}
          <div
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] animate-fade-up"
            style={{ color: "rgba(255,255,255,0.45)", animationDelay: "600ms" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-cyan-300/80" />
              No retainer · no contract
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-cyan-300/80" />
              Bank-level data security
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={13} className="text-cyan-300/80" />
              EU brands only
            </span>
          </div>
        </div>

        {/* RIGHT — animated cumulative savings chart */}
        <div className="lg:col-span-5 animate-fade-up" style={{ animationDelay: "350ms" }}>
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
            {/* corner badge */}
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-bold text-white/55">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
                </span>
                Live · network median
              </span>
              <span className="text-[10px] text-white/30 font-mono">Q3 2026</span>
            </div>
            <SavingsCurveChart className="mt-6" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const { t } = useTranslation();
  const cards = [
    { icon: TrendingDown, title: t("problem_card1_title"), body: t("problem_card1_body"), stat: t("problem_card1_stat") },
    { icon: Truck,        title: t("problem_card2_title"), body: t("problem_card2_body"), stat: t("problem_card2_stat") },
    { icon: Layers,       title: t("problem_card3_title"), body: t("problem_card3_body"), stat: t("problem_card3_stat") },
  ];

  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      {/* ambient red wash for the "problem" mood */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 600, height: 600, left: "10%", top: "20%",
          background: "radial-gradient(circle, rgba(239,68,68,0.10) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <SectionLabel className="mb-6">{t("problem_label")}</SectionLabel>
          <h2 className="text-display text-white max-w-3xl mb-10">{t("problem_headline")}</h2>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <AnimatedSection key={i} delay={i * 0.1}>
              <div
                className="surface p-6 relative group h-full transition-transform hover:-translate-y-1.5"
                style={{ background: "rgba(255,255,255,0.025)" }}
              >
                {/* hover halo */}
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 0%, rgba(239,68,68,0.16), transparent 60%)",
                  }}
                />
                <div
                  className="relative w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.18)",
                    boxShadow: "0 0 24px rgba(239,68,68,0.12)",
                  }}
                >
                  <c.icon size={16} className="text-red-300" aria-hidden="true" />
                </div>
                <p className="relative text-white font-bold text-[15px] mb-1">{c.title}</p>
                <p className="relative text-[13px] mb-4" style={{ color: "rgba(255,255,255,0.55)" }}>{c.body}</p>
                <p className="relative text-mono text-[12px] font-bold" style={{ color: "rgba(239,68,68,0.95)" }}>
                  {c.stat}
                </p>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const { t } = useTranslation();
  const steps = [
    { n: "01", title: t("step1_title"), desc: t("step1_desc") },
    { n: "02", title: t("step2_title"), desc: t("step2_desc") },
    { n: "03", title: t("step3_title"), desc: t("step3_desc") },
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
          <SectionLabel className="mb-6">{t("how_label")}</SectionLabel>
          <h2 className="text-display text-white max-w-3xl mb-10">{t("how_label")}</h2>
        </AnimatedSection>

        <div className="relative space-y-3">
          {/* Animated connector line behind the steps — pure CSS reveal */}
          <div
            aria-hidden
            className="absolute left-8 top-0 bottom-0 w-px hidden sm:block landing-connector-line"
            style={{
              background:
                "linear-gradient(180deg, transparent, rgba(96,165,250,0.4), rgba(44,167,193,0.3), transparent)",
              boxShadow: "0 0 16px rgba(96,165,250,0.3)",
              transformOrigin: "top",
            }}
          />
          <style>{`
            @keyframes landingConnectorReveal {
              from { transform: scaleY(0); }
              to   { transform: scaleY(1); }
            }
            .landing-connector-line { animation: landingConnectorReveal 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
          `}</style>

          {steps.map((s, i) => (
            <AnimatedSection key={s.n} delay={i * 0.15}>
              <div
                className="surface relative overflow-hidden p-8 sm:p-10 group transition-transform hover:scale-[1.005]"
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
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </div>
    </section>
  );
}

function BenchmarkSection() {
  const { t } = useTranslation();
  const stats = [
    { icon: BarChart3, text: t("benchmark_payments") },
    { icon: Truck,     text: t("benchmark_shipping") },
    { icon: Package,   text: t("benchmark_saas") },
  ];

  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "-10%", bottom: "5%",
          background: "radial-gradient(circle, rgba(44,167,193,0.10) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <AnimatedSection>
          <SectionLabel className="mb-6">{t("benchmark_label")}</SectionLabel>
          <h2 className="text-display text-white max-w-3xl mb-12">{t("benchmark_headline")}</h2>
        </AnimatedSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((s, i) => (
            <AnimatedSection key={i} delay={i * 0.12}>
              <div
                className="surface p-6 flex items-start gap-3 relative group h-full transition-transform hover:-translate-y-1"
                style={{ background: "rgba(255,255,255,0.025)" }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 0% 0%, rgba(44,167,193,0.16), transparent 70%)",
                  }}
                />
                <div
                  className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:rotate-[8deg] group-hover:scale-105"
                  style={{
                    background: "rgba(96,165,250,0.08)",
                    border: "1px solid rgba(96,165,250,0.20)",
                    boxShadow: "0 0 20px rgba(96,165,250,0.12)",
                  }}
                >
                  <s.icon size={15} className="text-blue-300" aria-hidden="true" />
                </div>
                <p className="relative text-[14px] text-white/85 leading-relaxed">{s.text}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        <p className="mt-8 text-[12px]" style={{ color: "rgba(255,255,255,0.30)" }}>
          {t("benchmark_footnote")}
        </p>
      </div>
    </section>
  );
}

function PricingCTASection() {
  const { t } = useTranslation();
  const lines = [t("pricing_line1"), t("pricing_line2"), t("pricing_line3"), t("pricing_line4")];

  return (
    <section className="py-12 sm:py-16 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 700, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Animated breathing glow — pure CSS */}
      <div
        aria-hidden
        className="absolute pointer-events-none landing-cta-pulse"
        style={{
          width: 500, height: 500, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(96,165,250,0.20) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto px-6 sm:px-10 text-center">
        <AnimatedSection>
          <SectionLabel className="mb-6">{t("pricing_model")}</SectionLabel>
          <h2 className="text-display text-white mb-8">{t("pricing_headline")}</h2>
        </AnimatedSection>

        <ul className="space-y-2.5 text-[14px] mb-10 text-left w-full sm:w-auto sm:inline-block">
          {lines.map((l, i) => (
            <li
              key={i}
              className="flex items-center gap-3 text-white/75 animate-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"
                style={{ boxShadow: "0 0 10px rgba(96,165,250,0.8)" }}
              />
              {l}
            </li>
          ))}
        </ul>

        <AnimatedSection delay={0.2}>
          <div className="inline-block">
            <Link
              to="/Analyzer"
              className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-4 font-bold text-[14px] transition-transform hover:scale-[1.04] active:scale-[0.97]"
              aria-label={t("pricing_cta")}
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(59,130,246,0.6), 0 0 40px rgba(59,130,246,0.25)",
              }}
            >
              <Sparkles size={14} />
              {t("pricing_cta")} <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </AnimatedSection>

        <p className="mt-6 text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          {t("pricing_trust")}
        </p>
      </div>
    </section>
  );
}

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
          <p className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.30)" }}>{t("footer_legal")}</p>
        </div>
        <div className="flex items-center gap-6 text-[13px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          <Link to="/Privacy" className="hover:text-white transition-colors">{t("footer_privacy")}</Link>
          <Link to="/Terms" className="hover:text-white transition-colors">{t("footer_terms")}</Link>
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

      <LandingNavbar />
      <main className="relative">
        <Hero />
        <ProblemSectionWow />
        <OneScanSection />
        <HowItWorksSection />
        <StatsGrid />
        <TestimonialsCarousel />
        <FounderLetter />
        <PricingDual />
        <StopLeavingMarginCTA />
      </main>
      <LandingFooter />
    </div>
  );
}