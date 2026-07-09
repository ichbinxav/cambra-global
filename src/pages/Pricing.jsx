import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, TrendingUp, Zap, Lock, Sparkles } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import PricingDual from "@/components/landing/PricingDual";

const FAQ = [
  {
    q: "Is the infrastructure intelligence really free?",
    a: "Yes — no card, no commitment. Early founding brands get full access to the audit, benchmarks, scoring and dashboard at no cost.",
  },
  {
    q: "How does the recovery model work?",
    a: "When CAMBRA actively helps you recover margin, we participate in 25% of the verified savings for 24 months. You keep the majority. No upfront fee, no subscription, no minimum. If we don't recover anything, you pay nothing — the risk is entirely on us. After 24 months, 100% of the recovered margin stays with you.",
  },
  {
    q: "What counts as 'verified savings'?",
    a: "Recovered margin that is measurable, attributable to CAMBRA's negotiation or migration support, and reconciled against your real provider statements. Estimates from the audit are never charged — only what shows up on your actual bills once the change is live.",
  },
  {
    q: "So what does it actually cost me?",
    a: "The audit and estimate are free during early access. You only pay if you activate the recovery service AND we successfully lower a real cost that shows up on your provider statements. The fee is a share of what we save you — never more than what you actually gain.",
  },
  {
    q: "Can I stop at any time?",
    a: "Yes. No lock-in, no minimum duration. Pause or terminate from your account settings.",
  },
  {
    q: "Is my data confidential?",
    a: "Always. Read-only access, encrypted at rest and in transit, never sold, never shared. See our Privacy Policy.",
  },
];

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "No credit card" },
  { icon: Lock, label: "Read-only, encrypted access" },
  { icon: Zap, label: "5-minute setup" },
  { icon: TrendingUp, label: "Cancel anytime" },
];

function SplitVisual() {
  return (
    <div className="relative max-w-4xl mx-auto mb-16 sm:mb-20">
      <div className="text-center mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45 mb-3">
          Pricing model
        </p>
        <h2
          className="text-white"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(28px, 4vw, 42px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}
        >
          You keep the margin. We take a share.
        </h2>
      </div>

      <div
        className="relative rounded-3xl overflow-hidden backdrop-blur-sm"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background:
            "linear-gradient(180deg, rgba(13,18,36,0.6) 0%, rgba(6,8,15,0.6) 100%)",
        }}
      >
        {/* 75 / 25 visual bar */}
        <div className="p-8 sm:p-10">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/80 mb-1">
                You keep
              </p>
              <p
                className="tabular-nums font-black"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(48px, 7vw, 84px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.9,
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #b8d8e0 45%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 22px rgba(34,211,238,0.35))",
                }}
              >
                75%
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">
                CAMBRA
              </p>
              <p
                className="tabular-nums font-black text-white/70"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(32px, 4.5vw, 48px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.9,
                }}
              >
                25%
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div
            className="h-2.5 rounded-full overflow-hidden mb-6"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div className="h-full flex">
              <div
                style={{
                  width: "75%",
                  background:
                    "linear-gradient(90deg, #60a5fa 0%, #22d3ee 100%)",
                  boxShadow: "0 0 16px rgba(34,211,238,0.5)",
                }}
              />
              <div style={{ width: "25%", background: "rgba(255,255,255,0.15)" }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/[0.06]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 mb-1.5">
                Duration
              </p>
              <p className="text-[14px] font-semibold text-white">24 months</p>
              <p className="text-[11.5px] text-white/50 mt-0.5">
                Then 100% yours, forever
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 mb-1.5">
                Already at benchmark
              </p>
              <p className="text-[14px] font-semibold text-white">You pay €0</p>
              <p className="text-[11.5px] text-white/50 mt-0.5">
                No gap, no fee — ever
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 mb-1.5">
                If no savings
              </p>
              <p className="text-[14px] font-semibold text-white">You pay €0</p>
              <p className="text-[11.5px] text-white/50 mt-0.5">
                Risk is entirely on us
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />

      {/* ambient grid */}
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

      {/* hero halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 900,
          height: 900,
          left: "50%",
          top: "-10%",
          transform: "translateX(-50%)",
          background:
            "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 60%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-5">
          {/* HERO */}
          <div className="text-center mb-16 md:mb-20">
            <div
              className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full backdrop-blur-sm"
              style={{
                border: "1px solid rgba(34,211,238,0.25)",
                background: "rgba(34,211,238,0.05)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
              </span>
              <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-white/75">
                Pricing · Aligned with your margin
              </span>
            </div>

            <h1
              className="font-display mb-6 text-white"
              style={{
                fontSize: "clamp(2.6rem, 6.5vw, 5rem)",
                fontWeight: 900,
                letterSpacing: "-0.05em",
                lineHeight: 0.92,
              }}
            >
              First analyze.{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Then recover.
              </span>
            </h1>
            <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed mb-8">
              Not two pricing tiers — two inevitable steps. Step 01 is the free audit. Step 02 is when we help you actually recover the margin we found.
            </p>

            {/* CTA */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
              <Link
                to="/Analyzer"
                className="inline-flex items-center gap-2 rounded-full bg-white text-black px-7 py-3.5 font-bold text-[13px] transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(34,211,238,0.6)]"
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.1), 0 18px 40px -18px rgba(34,211,238,0.5)",
                }}
              >
                Run free audit — 3 min
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/HowItWorks"
                className="inline-flex items-center rounded-full px-7 py-3.5 text-[13px] font-medium text-white/70 hover:text-white transition-colors"
                style={{
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                See how it works
              </Link>
            </div>

            {/* Trust bar */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[12px] text-white/45">
              {TRUST_POINTS.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <Icon size={13} className="text-cyan-300/80" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Split visual */}
          <SplitVisual />

          {/* Pricing dual — the two steps */}
          <PricingDual />

          {/* Reassurance banner */}
          <div
            className="mt-16 mb-16 max-w-3xl mx-auto rounded-2xl p-6 sm:p-8 relative overflow-hidden"
            style={{
              border: "1px solid rgba(34,211,238,0.18)",
              background:
                "linear-gradient(135deg, rgba(34,211,238,0.06) 0%, rgba(59,130,246,0.03) 100%)",
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 300,
                height: 300,
                right: "-10%",
                top: "-40%",
                background:
                  "radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />
            <div className="relative flex items-start gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(34,211,238,0.12)",
                  border: "1px solid rgba(34,211,238,0.3)",
                  boxShadow: "0 0 24px rgba(34,211,238,0.3)",
                }}
              >
                <Sparkles size={18} className="text-cyan-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/85 mb-1.5">
                  The founder's promise
                </p>
                <p className="text-[14.5px] text-white/80 leading-relaxed">
                  If CAMBRA doesn't recover any margin for you, you owe us nothing. Not for the audit, not for the negotiation, not for the migration. Our incentives are 100% aligned with yours — we only get paid when your bank statements confirm the savings.
                </p>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="mt-8 md:mt-12 max-w-3xl mx-auto">
            <div className="mb-8 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45 mb-3">
                Frequently asked
              </p>
              <h2
                className="text-white"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                }}
              >
                Clarity, not fine print.
              </h2>
            </div>

            <div
              className="rounded-2xl overflow-hidden backdrop-blur-sm"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {FAQ.map((item, i) => (
                <div
                  key={i}
                  className="px-6 py-5 sm:px-7 sm:py-6 hover:bg-white/[0.02] transition-colors"
                  style={{
                    borderTop:
                      i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="text-[15px] font-semibold tracking-tight text-white mb-1.5">
                    {item.q}
                  </p>
                  <p className="text-[13.5px] text-white/65 leading-relaxed">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="mt-16 text-center">
            <Link
              to="/Analyzer"
              className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-4 font-bold text-[14px] transition-shadow"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(34,211,238,0.6)",
              }}
            >
              Start with the free audit
              <ArrowRight size={16} />
            </Link>
            <p className="mt-4 text-[12px] text-white/40">
              3 minutes · No card · You'll see your savings in euros
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}