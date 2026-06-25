import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";

/**
 * Pricing — two unified DARK cards side-by-side (no light/dark split).
 * Both share the same surface language; differentiation via accent only.
 */
const FREE_FEATURES = [
  "Infrastructure audit & scoring",
  "Real network benchmarks",
  "Dashboard & reporting",
  "AI-powered recommendations",
];
const RECOVERY_FEATURES = [
  "Provider negotiation",
  "Savings verification",
  "Migration support",
  "We win when you do",
];

function Pill({ children, accent = "white" }) {
  const dotColor = accent === "cyan" ? "bg-cyan-400" : "bg-white/70";
  const textColor = accent === "cyan" ? "text-cyan-300" : "text-white/70";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
      style={{
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75 animate-ping`} />
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColor}`} />
      </span>
      <span className={`text-[9px] uppercase tracking-[0.22em] font-bold ${textColor}`}>
        {children}
      </span>
    </span>
  );
}

function FeatureRow({ children }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check size={13} className="text-cyan-300 mt-1 shrink-0" strokeWidth={2.5} />
      <span className="text-[13px] text-white/80 leading-[1.55]">{children}</span>
    </li>
  );
}

function Card({ pill, pillAccent, headline, headlineGradient, sub, subBig, features, ctaText, ctaPrimary }) {
  return (
    <div
      className="relative rounded-2xl overflow-hidden p-5 sm:p-7 flex flex-col"
      style={{
        background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 20px 50px -20px rgba(0,0,0,0.5)",
      }}
    >
      {/* corner glow */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 280, height: 280, right: "-25%", top: "-30%",
          background: `radial-gradient(circle, ${
            pillAccent === "cyan" ? "rgba(34,211,238,0.22)" : "rgba(255,255,255,0.10)"
          } 0%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />

      <div className="relative flex flex-col h-full">
        <Pill accent={pillAccent}>{pill}</Pill>

        <div className="mt-6 sm:mt-8">
          <div
            className="font-black tabular-nums"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(40px, 6vw, 64px)",
              letterSpacing: "-0.05em",
              lineHeight: 1,
              ...(headlineGradient
                ? {
                    background: "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 16px rgba(34,211,238,0.30))",
                  }
                : { color: "#ffffff" }),
            }}
          >
            {headline}
          </div>
          {sub && (
            <p
              className="mt-2 text-[12px] text-white/40"
              style={{ textDecoration: "line-through" }}
            >
              {sub}
            </p>
          )}
          {subBig && <p className="mt-3 text-[13px] text-white/60">{subBig}</p>}
        </div>

        <div className="my-5 sm:my-6 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

        <ul className="space-y-3 flex-1">
          {features.map((f) => (
            <FeatureRow key={f}>{f}</FeatureRow>
          ))}
        </ul>

        <Link
          to="/Analyzer"
          className="mt-6 sm:mt-8 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-3 font-bold text-[13px] transition-opacity hover:opacity-90"
          style={
            ctaPrimary
              ? {
                  background: "#ffffff",
                  color: "#0a0f1e",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(34,211,238,0.5)",
                }
              : {
                  background: "transparent",
                  color: "#ffffff",
                  border: "1px solid rgba(255,255,255,0.18)",
                }
          }
        >
          {ctaText}
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

export default function PricingDual() {
  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      <div className="relative max-w-3xl mx-auto px-6 sm:px-10">
        <div className="text-center mb-10">
          <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/45">
            Pricing
          </span>
          <h2
            className="text-white mt-3"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(28px, 4.2vw, 44px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            Free until we{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              save you money.
            </span>
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <Card
            pill="Infrastructure"
            pillAccent="white"
            headline="Free"
            sub="€60/month"
            subBig="For early operators"
            features={FREE_FEATURES}
            ctaText="Run audit"
            ctaPrimary={false}
          />
          <Card
            pill="Recovery Model"
            pillAccent="cyan"
            headline="25%"
            headlineGradient
            subBig="Only on verified savings"
            features={RECOVERY_FEATURES}
            ctaText="Start recovering"
            ctaPrimary={true}
          />
        </div>
      </div>
    </section>
  );
}