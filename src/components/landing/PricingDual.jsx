import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check } from "lucide-react";
import SectionHeading from "@/components/landing/SectionHeading";

/**
 * Pricing — three-tier edition (Addendum R1, 2026-07-12).
 *
 * Three visually distinct cards on one row:
 *   1. Analyze      — free, always. Anonymous 60s + verified analysis via Stripe.
 *   2. Monitoring   — €29/mo standard; founding cohort (first 150 brands) locks in
 *                     12 months free, price shown struck-through with badge.
 *   3. Recovery     — 25% of verified savings, 24-month agreement, only if we recover.
 *
 * The two durations live in different columns and read differently — kept
 * separate on purpose so no reader confuses them:
 *   • Monitoring   — "Free for 12 months — founding cohort" (grant duration).
 *   • Recovery     — "24-month agreement" (contract duration for success fee).
 *
 * NO monitoring product yet, NO subscription entities, NO dynamic 150-counter.
 * The founding-cohort promise is TEXTUAL only. The Monitoring CTA points at
 * the analyzer (same as Analyze) — the actual join-monitoring flow ships later.
 */
const FREE_FEATURES = [
  "Anonymous 60-second audit",
  "Verified analysis via Stripe Connect",
  "Public-pricing benchmarks",
  "Your savings estimate in euros",
];

const RECOVERY_FEATURES = [
  "Interchange floor benchmarking",
  "Payments rate negotiation",
  "Savings verification & migration",
  "We win when you do",
];

function Eyebrow({ children, accent = "white" }) {
  const color = accent === "voltio" ? "#8B7BFF" : "rgba(255,255,255,0.55)";
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-px w-5"
        style={{ background: accent === "voltio" ? "rgba(139,123,255,0.4)" : "rgba(255,255,255,0.18)" }}
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
          background: "rgba(139,123,255,0.12)",
          border: "1px solid rgba(139,123,255,0.28)",
        }}
      >
        <Check size={9} style={{ color: "#8B7BFF" }} strokeWidth={3} />
      </span>
      <span className="text-[12.5px] text-white/75 leading-[1.55]">{children}</span>
    </li>
  );
}

/**
 * Tier — one pricing column.
 *
 * `priceRow` overrides the default single `price` render — used by Monitoring
 * to show the strikethrough €29/mo alongside the "Free for 12 months" claim
 * plus the founding-cohort badge below it, all inside the same block that
 * `price`/`priceSuffix` would normally occupy. Keeps every other tier
 * (Analyze, Recovery) rendering unchanged.
 */
function Tier({
  eyebrow,
  eyebrowAccent,
  price,
  priceSuffix,
  priceGradient,
  priceRow,
  strike,
  caption,
  features,
  ctaText,
  ctaPrimary,
}) {
  return (
    <div className="relative flex flex-col p-6 sm:p-7 h-full">
      <Eyebrow accent={eyebrowAccent}>{eyebrow}</Eyebrow>

      {/* Price block */}
      <div className="mt-5 sm:mt-6">
        {priceRow ? (
          priceRow
        ) : (
          <>
            <div
              className="font-black tabular-nums"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(44px, 5.2vw, 64px)",
                letterSpacing: "-0.055em",
                lineHeight: 0.9,
                ...(priceGradient
                  ? {
                      background:
                        "linear-gradient(135deg, #8B7BFF 0%, #5B4CF5 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: "drop-shadow(0 0 18px rgba(91,76,245,0.28))",
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
          </>
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
                  "0 0 0 1px rgba(255,255,255,0.1), 0 18px 40px -16px rgba(91,76,245,0.45)",
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
            "radial-gradient(circle, rgba(91,76,245,0.05) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        {/* Header */}
        <SectionHeading eyebrow="Pricing" className="mb-6">
          Free until we{" "}
          <span className="kw">save you money</span>
          <span style={{ color: "var(--ink)" }}>.</span>
        </SectionHeading>
        <div className="text-center mb-12 sm:mb-14">
          <p className="text-[13px] sm:text-[14px] max-w-lg mx-auto" style={{ color: "var(--gris-1)" }}>
            Analyze for free. Pay only when we actually recover margin — 25% of verified payment savings.
          </p>
        </div>

        {/* Two columns — Analyze · Recover */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 max-w-3xl mx-auto">
          {/* STEP 1 — Analyze (free, always) */}
          <div
            className="relative rounded-3xl overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, rgba(13,18,36,0.82) 0%, rgba(6,8,15,0.82) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow:
                "0 30px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 320, height: 320, left: "-15%", top: "-25%",
                background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)",
                filter: "blur(60px)",
              }}
            />
            <span
              className="absolute top-5 right-5 text-[9px] uppercase font-bold tracking-[0.24em] text-white/40"
              aria-hidden
            >
              Step 1
            </span>
            <Tier
              eyebrow="Analyze"
              eyebrowAccent="white"
              price="Free"
              caption="Always · No card"
              features={FREE_FEATURES}
              ctaText="Run audit"
              ctaPrimary={false}
            />
          </div>

          {/* STEP 2 — Recover (25% success fee, 24-month agreement) */}
          <div
            className="relative rounded-3xl overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, rgba(13,18,36,0.82) 0%, rgba(6,8,15,0.82) 100%)",
              border: "1px solid rgba(139,123,255,0.20)",
              boxShadow:
                "0 30px 80px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 40px -20px rgba(91,76,245,0.35)",
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 360, height: 360, right: "-15%", bottom: "-25%",
                background: "radial-gradient(circle, rgba(139,123,255,0.20) 0%, transparent 70%)",
                filter: "blur(60px)",
              }}
            />
            <span
              className="absolute top-5 right-5 text-[9px] uppercase font-bold tracking-[0.24em]"
              style={{ color: "rgba(139,123,255,0.7)" }}
              aria-hidden
            >
              Step 2
            </span>
            <Tier
              eyebrow="Recover"
              eyebrowAccent="voltio"
              price="25%"
              priceSuffix="of verified payment savings · 24-month agreement"
              priceGradient
              caption="No savings, no fee"
              features={RECOVERY_FEATURES}
              ctaText="Start recovering"
              ctaPrimary={true}
            />
          </div>
        </div>

        {/* Tiny footnote */}
        <p className="mt-6 text-center text-[11px]" style={{ color: "var(--gris-2)" }}>
          Cancel anytime · No credit card required · 5-minute setup
        </p>
      </div>
    </section>
  );
}