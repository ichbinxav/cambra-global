import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Plug } from "lucide-react";
import IntegrationsLogos from "@/components/landing/IntegrationsLogos";

/**
 * 4-stat grid card — dark navy, gradient numbers.
 *
 * Copy discipline: only claims we can defend end up here.
 *   - "Estimated → Verified" replaces the old "98% accuracy" — every number
 *     shown to the user starts as an estimate and hardens into a confirmed
 *     figure once tools connect. That's the actual, honest product promise.
 *   - "20+" integrations reflects the current live count in the registry.
 *   - "OAuth · Read-only" spells out the access model instead of just "OAuth".
 *   - The "Real-time" freshness line is gone — sync latency depends on the
 *     underlying provider (webhooks vs. polling) and we don't ship a
 *     hard-coded SLA we can point to. Replaced with a factual line about
 *     the sync cadence.
 */
const STATS = [
  { value: "Estimated",  suffix: " → Verified", label: "Every number, confirmed" },
  { value: "20+",        suffix: "",            label: "Integrations live" },
  { value: "Read-only",  suffix: "",            label: "OAuth · revocable" },
  { value: "Daily+",     suffix: "",            label: "Sync cadence" },
];

function Stat({ value, suffix, label }) {
  return (
    <div className="text-center px-4 py-10 sm:py-14">
      <div
        className="font-black tabular-nums"
        style={{
          fontSize: "clamp(28px, 4vw, 52px)",
          letterSpacing: "-0.04em",
          lineHeight: 1,
          background:
            "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          filter: "drop-shadow(0 0 24px rgba(34,211,238,0.25))",
        }}
      >
        {value}
        {suffix && <span className="opacity-70">{suffix}</span>}
      </div>
      <div
        className="mt-3 text-[11px] uppercase tracking-[0.24em] font-bold"
        style={{ color: "rgba(255,255,255,0.45)" }}
      >
        {label}
      </div>
    </div>
  );
}

/**
 * Inline marquee — reuses IntegrationsLogos but strips its own outer padding
 * so it sits flush inside the StatsGrid section.
 */
function IntegrationsLogosInline() {
  return (
    <div className="[&>section]:!py-0">
      <IntegrationsLogos />
    </div>
  );
}

export default function StatsGrid() {
  return (
    <section className="relative py-12 sm:py-16">
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        {/* eyebrow + context */}
        <div className="text-center mb-10 sm:mb-14">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-5"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <Plug size={11} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/70">
              Connect your tools
            </span>
          </span>
          <h2
            className="text-white max-w-2xl mx-auto"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            Every number, confirmed against{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              your real data.
            </span>
          </h2>
          <p className="mt-4 text-[14px] max-w-xl mx-auto" style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}>
            Stripe, Shopify, DHL, Klaviyo, Notion and more — connected via read-only OAuth. Every estimate becomes a confirmed euro figure.
          </p>
        </div>

        {/* Live marquee of integration logos */}
        <div className="mb-10 sm:mb-14 -mx-6 sm:-mx-10">
          <IntegrationsLogosInline />
        </div>

        <div
          className="relative rounded-3xl overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, #0b1226 0%, #060912 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow:
              "0 40px 100px -30px rgba(0,0,0,0.7), 0 0 60px -20px rgba(34,211,238,0.18)",
          }}
        >
          {/* grid pattern */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse 90% 80% at 50% 50%, #000 30%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 90% 80% at 50% 50%, #000 30%, transparent 80%)",
              opacity: 0.6,
            }}
          />
          {/* corner glow */}
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 500, height: 500, right: "-20%", top: "-30%",
              background:
                "radial-gradient(circle, rgba(34,211,238,0.20) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />

          <div className="relative grid grid-cols-2 divide-x divide-y"
               style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`${i === 1 ? "border-l border-white/[0.06]" : ""} ${i >= 2 ? "border-t border-white/[0.06]" : ""}`}
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <Stat {...s} />
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-10 sm:mt-12">
          <Link
            to="/ConnectTools"
            className="inline-flex items-center gap-2 rounded-full bg-white text-black px-7 py-3.5 font-bold text-[14px] transition-shadow"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(34,211,238,0.5), 0 0 32px rgba(34,211,238,0.2)",
            }}
          >
            <Plug size={14} />
            Connect your tools
            <ArrowRight size={16} />
          </Link>
          <p className="mt-4 text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
            Encrypted credentials · Read-only access · Revoke anytime
          </p>
        </div>
      </div>
    </section>
  );
}