import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingDown, Package, Layers } from "lucide-react";
import SectionLabel from "@/components/shared/SectionLabel";

/* ──────────────────────────────────────────────────────────
   CAMBRA Landing — editorial redesign
   Dark, fixed navbar · hero with grid + radial glow ·
   problem · how it works · CTA · footer
   ────────────────────────────────────────────────────────── */

/* ── Navbar ── */
function LandingNavbar() {
  return (
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
      <Link
        to="/"
        className="text-white"
        style={{ fontWeight: 900, letterSpacing: "-0.04em", fontSize: 18 }}
      >
        CAMBRA
      </Link>

      <div className="hidden md:flex items-center gap-8 text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
        <a href="#how" className="hover:text-white transition-colors">How it works</a>
        <Link to="/Pricing" className="hover:text-white transition-colors">Pricing</Link>
        <Link to="/Developers" className="hover:text-white transition-colors">Developers</Link>
      </div>

      <Link
        to="/Analyzer"
        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold bg-white text-black hover:opacity-90 transition-opacity"
      >
        Get started
      </Link>
    </nav>
  );
}

/* ── Hero ── */
function Hero() {
  return (
    <section
      className="relative flex items-center"
      style={{ minHeight: "100vh", background: "#0a0a0a", color: "#ffffff" }}
    >
      {/* Subtle grid overlay */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "repeating-linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(ellipse 90% 70% at 50% 40%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 90% 70% at 50% 40%, #000 30%, transparent 80%)",
        }}
      />

      {/* Blue radial glow behind text */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-6 sm:px-10 py-32">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-8 text-[11px] uppercase tracking-[0.22em]"
          style={{
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.75)",
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          Infrastructure Intelligence
        </div>

        {/* Headline */}
        <h1 className="text-hero animate-fade-up text-white max-w-5xl">
          Your infrastructure is leaking<br />money.
        </h1>

        {/* Subheadline */}
        <p
          className="mt-8 animate-fade-up"
          style={{
            maxWidth: 520,
            color: "rgba(255,255,255,0.55)",
            fontSize: 18,
            lineHeight: 1.6,
          }}
        >
          CAMBRA maps every tool in your stack, benchmarks your costs against the network,
          and shows you exactly how much you can recover — without changing providers.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center gap-3 animate-fade-up">
          <Link
            to="/Analyzer"
            className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-4 font-bold text-[14px] hover:opacity-90 transition-opacity"
          >
            Run free analysis <ArrowRight size={16} />
          </Link>
          <a
            href="#how"
            className="inline-flex items-center rounded-full px-8 py-4 text-[14px] font-medium transition-colors"
            style={{
              border: "1px solid rgba(255,255,255,0.20)",
              color: "rgba(255,255,255,0.70)",
            }}
          >
            See how it works
          </a>
        </div>

        {/* Fine print */}
        <p className="mt-5 text-[12px]" style={{ color: "rgba(255,255,255,0.30)" }}>
          No credit card. Pay only when you save.
        </p>
      </div>
    </section>
  );
}

/* ── Problem ── */
const PROBLEMS = [
  {
    icon: TrendingDown,
    headline: "Payments overpriced",
    desc: "2.4% effective rate when 1.7% is achievable.",
  },
  {
    icon: Package,
    headline: "Shipping inflated",
    desc: "€6.20/pkg when network average is €4.80.",
  },
  {
    icon: Layers,
    headline: "Tools overlapping",
    desc: "3x overlapping tools draining budget.",
  },
];

function ProblemSection() {
  return (
    <section style={{ background: "#0a0a0a" }} className="py-24 sm:py-32">
      <div className="max-w-6xl mx-auto px-6 sm:px-10">
        <SectionLabel className="mb-6">The Problem</SectionLabel>
        <h2 className="text-display text-white max-w-3xl mb-16">
          Three silent leaks in every modern brand.
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PROBLEMS.map((p, i) => (
            <div key={i} className="surface surface-hover p-6">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p.icon size={16} className="text-white/70" />
              </div>
              <p className="text-white font-bold text-[15px] mb-1">{p.headline}</p>
              <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How it works ── */
const STEPS = [
  { n: "01", title: "Enter your website",   desc: "We start with what's public. No connections needed to begin." },
  { n: "02", title: "We map your stack",    desc: "Payments, shipping, software, banking — every layer detected." },
  { n: "03", title: "See your savings",     desc: "Benchmark-grade numbers in under 3 minutes. Verify when ready." },
];

function HowItWorksSection() {
  return (
    <section id="how" style={{ background: "#0a0a0a" }} className="py-24 sm:py-32">
      <div className="max-w-6xl mx-auto px-6 sm:px-10">
        <SectionLabel className="mb-6">How CAMBRA works</SectionLabel>
        <h2 className="text-display text-white max-w-3xl mb-16">
          Three minutes from website to savings.
        </h2>

        <div className="space-y-3">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="surface surface-hover relative overflow-hidden p-8 sm:p-10"
            >
              {/* Giant muted step number behind content */}
              <span
                aria-hidden
                className="absolute -top-6 right-6 text-mono select-none"
                style={{
                  fontSize: "clamp(96px, 14vw, 180px)",
                  fontWeight: 900,
                  letterSpacing: "-0.05em",
                  lineHeight: 1,
                  color: "rgba(255,255,255,0.04)",
                }}
              >
                {s.n}
              </span>

              <div className="relative z-10 max-w-xl">
                <SectionLabel className="mb-3">Step {s.n}</SectionLabel>
                <h3 className="text-title text-white mb-3">{s.title}</h3>
                <p className="text-[14px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ── */
function CTASection() {
  return (
    <section style={{ background: "#0a0a0a" }} className="py-24 sm:py-32 relative overflow-hidden">
      {/* Center blue glow */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700,
          height: 700,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative z-10 max-w-3xl mx-auto px-6 sm:px-10 text-center">
        <SectionLabel className="mb-6">Get started</SectionLabel>
        <h2 className="text-display text-white mb-6">
          Start for free.<br />Pay only when you save.
        </h2>
        <p className="text-[16px] mb-10" style={{ color: "rgba(255,255,255,0.55)" }}>
          25% of verified savings. Nothing upfront.
        </p>

        <Link
          to="/Analyzer"
          className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-4 font-bold text-[14px] hover:opacity-90 transition-opacity"
        >
          Run free analysis <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}

/* ── Footer ── */
function LandingFooter() {
  return (
    <footer
      style={{ background: "#0a0a0a", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      className="py-10"
    >
      <div className="max-w-6xl mx-auto px-6 sm:px-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          <span className="font-black text-white" style={{ letterSpacing: "-0.04em" }}>CAMBRA</span>
          <span className="mx-2">·</span>
          Infrastructure Intelligence
        </p>
        <div className="flex items-center gap-6 text-[13px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          <Link to="/Privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link to="/Terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

/* ── Page ── */
export default function Landing() {
  return (
    <div className="min-h-screen font-inter" style={{ background: "#0a0a0a", color: "#ffffff" }}>
      <LandingNavbar />
      <main>
        <Hero />
        <ProblemSection />
        <HowItWorksSection />
        <CTASection />
      </main>
      <LandingFooter />
    </div>
  );
}