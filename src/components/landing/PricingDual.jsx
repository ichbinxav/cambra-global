import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check } from "lucide-react";

/**
 * Pricing — sleek edition.
 * One unified dark editorial surface, split by a hairline divider.
 * Cleaner typography, smaller pills, refined CTAs.
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

function Eyebrow({ children, accent = "white" }) {
  const color = accent === "cyan" ? "#22d3ee" : "rgba(255,255,255,0.55)";
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-px w-5"
        style={{ background: accent === "cyan" ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.18)" }}
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
          background: "rgba(34,211,238,0.10)",
          border: "1px solid rgba(34,211,238,0.25)",
        }}
      >
        <Check size={9} className="text-cyan-300" strokeWidth={3} />
      </span>
      <span className="text-[12.5px] text-white/75 leading-[1.55]">{children}</span>
    </li>
  );
}

function Tier({
  eyebrow,
  eyebrowAccent,
  price,
  priceSuffix,
  priceGradient,
  strike,
  caption,
  features,
  ctaText,
  ctaPrimary,
}) {
  return (
    <div className="relative flex flex-col p-6 sm:p-8 h-full">
      <Eyebrow accent={eyebrowAccent}>{eyebrow}</Eyebrow>

      {/* Price block */}
      <div className="mt-5 sm:mt-7">
        <div
          className="font-black tabular-nums"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(48px, 6vw, 72px)",
            letterSpacing: "-0.055em",
            lineHeight: 0.9,
            ...(priceGradient
              ? {
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #b8d8e0 45%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 18px rgba(34,211,238,0.28))",
                }
              : { color: "#ffffff" }),
          }}
        >
          {price}
        </div>
        {priceSuffix && (
          <p className="mt-2 text-[12px] font-medium text-white/50 leading-snug">
            {priceSuffix}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 min-h-[18px]">
        {strike && (
          <span
            className="text-[11px] text-white/35"
            style={{ textDecoration: "line-through" }}
          >
            {strike}
          </span>
        )}
        {caption && (
          <span className="text-[11px] font-medium text-white/60">{caption}</span>
        )}
      </div>

      {/* Hairline */}
      <div
        className="my-6 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%)",
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
        to="/Analyzer"
        className="mt-7 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 h-11 font-bold text-[13px] transition-all hover:translate-y-[-1px]"
        style={
          ctaPrimary
            ? {
                background: "#ffffff",
                color: "#0a0f1e",
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.1), 0 18px 40px -16px rgba(34,211,238,0.45)",
              }
            : {
                background: "rgba(255,255,255,0.04)",
                color: "#ffffff",
                border: "1px solid rgba(255,255,255,0.14)",
                backdropFilter: "blur(8px)",
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
            "radial-gradient(circle, rgba(34,211,238,0.05) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-4xl mx-auto px-6 sm:px-10">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-14">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-5"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.28em] font-bold text-white/70">
              Pricing
            </span>
          </span>
          <h2
            className="text-white"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(32px, 4.8vw, 52px)",
              fontWeight: 900,
              letterSpacing: "-0.045em",
              lineHeight: 1.02,
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
              save you money
            </span>
            <span className="text-white">.</span>
          </h2>
          <p className="mt-4 text-[13px] sm:text-[14px] text-white/50 max-w-md mx-auto">
            No upfront fees. No subscription. We earn only when verified savings land.
          </p>
        </div>

        {/* Unified card with center divider */}
        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(13,18,36,0.95) 0%, rgba(6,8,15,0.95) 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              "0 30px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        >
          {/* corner halos */}
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 320,
              height: 320,
              left: "-15%",
              top: "-25%",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 360,
              height: 360,
              right: "-15%",
              bottom: "-25%",
              background:
                "radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />

          <div className="relative grid grid-cols-1 md:grid-cols-2">
            {/* vertical hairline divider (desktop) */}
            <div
              aria-hidden
              className="hidden md:block absolute left-1/2 top-6 bottom-6 w-px pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%)",
              }}
            />
            {/* horizontal hairline divider (mobile) */}
            <div
              aria-hidden
              className="md:hidden absolute left-6 right-6 top-1/2 h-px pointer-events-none"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%)",
              }}
            />
            <Tier
              eyebrow="Audit"
              eyebrowAccent="white"
              price="Free"
              caption="Early access · No card"
              features={FREE_FEATURES}
              ctaText="Run audit"
              ctaPrimary={false}
            />
            <Tier
              eyebrow="Recovery"
              eyebrowAccent="cyan"
              price="25%"
              priceSuffix="of verified savings · 24 mo"
              priceGradient
              caption="No savings, no fee"
              features={RECOVERY_FEATURES}
              ctaText="Start recovering"
              ctaPrimary={true}
            />
          </div>
        </div>

        {/* Tiny footnote */}
        <p className="mt-6 text-center text-[11px] text-white/35">
          Cancel anytime · No credit card required · 5-minute setup
        </p>
      </div>
    </section>
  );
}