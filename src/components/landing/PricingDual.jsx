import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";

/**
 * Two-card pricing block:
 *  - LEFT: Free (Infrastructure) — light card on dark surface
 *  - RIGHT: 25% (Recovery Model) — navy card
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

function Pill({ children, tone = "dark" }) {
  const isDark = tone === "dark";
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{
        border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)"}`,
        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.7)",
      }}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
      </span>
      <span
        className="text-[10px] uppercase tracking-[0.24em] font-bold"
        style={{ color: isDark ? "rgba(255,255,255,0.75)" : "rgba(10,15,30,0.7)" }}
      >
        {children}
      </span>
    </span>
  );
}

function FeatureRow({ children, tone = "dark" }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-2 inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: "#22d3ee", boxShadow: "0 0 8px rgba(34,211,238,0.6)" }}
      />
      <span
        className="text-[15px] leading-[1.55]"
        style={{ color: tone === "dark" ? "rgba(255,255,255,0.85)" : "rgba(10,15,30,0.85)" }}
      >
        {children}
      </span>
    </li>
  );
}

export default function PricingDual() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* ambient */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 800, height: 600, left: "50%", top: "10%", transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-10">
        <div className="text-center mb-14">
          <span className="text-[11px] uppercase tracking-[0.24em] font-bold text-white/45">
            Pricing
          </span>
          <h2
            className="text-white mt-4"
            style={{
              fontSize: "clamp(32px, 5vw, 56px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.02,
            }}
          >
            Free until we save you money.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* LEFT — FREE / Infrastructure */}
          <div
            className="relative rounded-3xl p-8 sm:p-10 overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, #f5f9ff 0%, #e6efff 100%)",
              border: "1px solid rgba(10,15,30,0.06)",
              boxShadow: "0 30px 80px -30px rgba(0,0,0,0.4)",
              color: "#0a0f1e",
            }}
          >
            <Pill tone="light">Infrastructure</Pill>

            <div className="mt-10">
              <div
                style={{
                  fontSize: "clamp(60px, 9vw, 96px)",
                  fontWeight: 900,
                  letterSpacing: "-0.05em",
                  lineHeight: 1,
                  color: "#0a0f1e",
                }}
              >
                Free
              </div>
              <p className="mt-3 text-[14px]" style={{ color: "rgba(10,15,30,0.45)", textDecoration: "line-through" }}>
                €60/month
              </p>
              <p className="mt-1 text-[16px]" style={{ color: "rgba(10,15,30,0.55)" }}>
                For early operators
              </p>
            </div>

            <div className="my-8 h-px" style={{ background: "rgba(10,15,30,0.10)" }} />

            <ul className="space-y-4">
              {FREE_FEATURES.map((f) => (
                <FeatureRow key={f} tone="light">{f}</FeatureRow>
              ))}
            </ul>

            <Link
              to="/Analyzer"
              className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 font-bold text-[14px] transition-colors"
              style={{
                background: "#0a0f1e",
                color: "#ffffff",
              }}
            >
              Run free audit
              <ArrowRight size={16} />
            </Link>
          </div>

          {/* RIGHT — 25% / Recovery */}
          <div
            className="relative rounded-3xl p-8 sm:p-10 overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, #0b1226 0%, #060912 100%)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow:
                "0 40px 100px -30px rgba(0,0,0,0.7), 0 0 60px -20px rgba(34,211,238,0.20)",
              color: "#ffffff",
            }}
          >
            {/* grid */}
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage:
                  "radial-gradient(ellipse 90% 80% at 50% 0%, #000 30%, transparent 80%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 90% 80% at 50% 0%, #000 30%, transparent 80%)",
                opacity: 0.5,
              }}
            />
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 400, height: 400, right: "-20%", top: "-20%",
                background:
                  "radial-gradient(circle, rgba(34,211,238,0.22) 0%, transparent 70%)",
                filter: "blur(60px)",
              }}
            />

            <div className="relative">
              <Pill tone="dark">Recovery Model</Pill>

              <div className="mt-10">
                <div
                  className="font-black tabular-nums"
                  style={{
                    fontSize: "clamp(60px, 9vw, 96px)",
                    letterSpacing: "-0.05em",
                    lineHeight: 1,
                    background:
                      "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 0 24px rgba(34,211,238,0.35))",
                  }}
                >
                  25%
                </div>
                <p className="mt-4 text-[16px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                  Only on verified savings recovered
                </p>
              </div>

              <div className="my-8 h-px" style={{ background: "rgba(255,255,255,0.10)" }} />

              <ul className="space-y-4">
                {RECOVERY_FEATURES.map((f) => (
                  <FeatureRow key={f} tone="dark">{f}</FeatureRow>
                ))}
              </ul>

              <Link
                to="/Analyzer"
                className="mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3.5 font-bold text-[14px] transition-colors"
                style={{
                  background: "#ffffff",
                  color: "#0a0f1e",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(34,211,238,0.6)",
                }}
              >
                Start recovering
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}