import React from "react";

/**
 * Founder letter — matches user reference: LIGHT background section,
 * eyebrow pill, big black headline with blue accent,
 * grayscale photo + dark navy quote card side-by-side.
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

export default function FounderLetter() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden" style={{ background: "#ffffff", color: "#0a0a0a" }}>
      <div className="relative max-w-4xl mx-auto px-6 sm:px-10 text-center">
        {/* eyebrow */}
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-8"
          style={{
            border: "1px solid rgba(15,23,42,0.12)",
            background: "#ffffff",
          }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-500 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-500" />
          </span>
          <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-slate-700">
            Meet the founder
          </span>
        </span>

        <h2
          className="mb-12 sm:mb-14 text-slate-900"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(36px, 5.5vw, 64px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
          }}
        >
          A note from{" "}
          <span style={{ color: "#2563eb" }}>the founder.</span>
        </h2>

        {/* Side-by-side: photo + dark quote card */}
        <div className="grid grid-cols-2 gap-3 sm:gap-5 items-stretch max-w-2xl mx-auto">
          {/* Photo */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              boxShadow: "0 20px 50px -20px rgba(0,0,0,0.25)",
              aspectRatio: "4 / 5",
            }}
          >
            <img
              src={FOUNDER_PHOTO}
              alt="Xavier M. Contero — Founder of CAMBRA"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: "grayscale(100%) contrast(1.05)" }}
            />
          </div>

          {/* Dark quote card */}
          <div
            className="relative rounded-2xl overflow-hidden p-5 sm:p-7 flex flex-col text-left"
            style={{
              background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)",
              boxShadow: "0 20px 50px -20px rgba(0,0,0,0.5)",
              aspectRatio: "4 / 5",
            }}
          >
            {/* quote glyph */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="mb-3 shrink-0">
              <path
                d="M6 9h3v3H6c0 2 1 3 3 3v2c-3 0-5-2-5-5V9zm10 0h3v3h-3c0 2 1 3 3 3v2c-3 0-5-2-5-5V9z"
                fill="#22d3ee"
                opacity="0.9"
              />
            </svg>

            <p
              className="text-white mb-2 flex-1"
              style={{
                fontSize: "clamp(11px, 1.5vw, 14px)",
                lineHeight: 1.45,
                fontWeight: 500,
              }}
            >
              After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
            </p>
            <p
              className="text-white/50 mb-4"
              style={{ fontSize: "clamp(10px, 1.3vw, 12px)", lineHeight: 1.45 }}
            >
              That's why I started CAMBRA.
            </p>

            <div
              className="pt-3 flex items-center justify-between gap-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}
            >
              <p className="text-white text-[11px] sm:text-[12px] font-bold tracking-tight truncate">
                Xavier M. Contero
              </p>
              <span
                className="text-[8px] uppercase tracking-[0.22em] font-bold px-2 py-1 rounded-full shrink-0"
                style={{
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                Founder
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}