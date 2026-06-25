import React from "react";

/**
 * 4-stat grid card — dark navy, gradient numbers.
 * Mirrors the reference: 98% Accuracy / Real-time Data Freshness /
 * 22+ Integrations / OAuth Secure Access.
 */
const STATS = [
  { value: "98%",       label: "Accuracy" },
  { value: "Real-time", label: "Data Freshness" },
  { value: "22+",       label: "Integrations" },
  { value: "OAuth",     label: "Secure Access" },
];

function Stat({ value, label }) {
  return (
    <div className="text-center px-4 py-10 sm:py-14">
      <div
        className="font-black tabular-nums"
        style={{
          fontSize: "clamp(36px, 5vw, 64px)",
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

export default function StatsGrid() {
  return (
    <section className="relative py-20 sm:py-28">
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
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
      </div>
    </section>
  );
}