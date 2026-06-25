import React from "react";
import { ArrowRight, Quote } from "lucide-react";

/**
 * Founder note — editorial, clean, brand-aligned.
 * Layout matches the reference screenshot:
 *  - eyebrow pill: MEET THE FOUNDER
 *  - large headline "A note from the founder."
 *  - photo + quote card side by side
 *  - signature row with name + arrow
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

export default function FounderLetter() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* ambient washes */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 800, height: 600, left: "-10%", top: "20%",
          background: "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700, height: 500, right: "-10%", bottom: "10%",
          background: "radial-gradient(circle, rgba(96,165,250,0.08) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 sm:px-10">
        {/* eyebrow */}
        <div className="mb-8">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/70">
              Meet the founder
            </span>
          </span>
        </div>

        {/* headline */}
        <h2
          className="text-white mb-12"
          style={{
            fontSize: "clamp(36px, 5.5vw, 64px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
            maxWidth: 760,
          }}
        >
          A note from{" "}
          <span
            style={{
              background:
                "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            the founder.
          </span>
        </h2>

        {/* photo + quote card */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
          {/* PHOTO */}
          <div className="md:col-span-5">
            <div
              className="relative rounded-2xl overflow-hidden h-full"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow:
                  "0 30px 70px -30px rgba(0,0,0,0.7), 0 0 50px -20px rgba(34,211,238,0.15)",
                minHeight: 360,
              }}
            >
              <img
                src={FOUNDER_PHOTO}
                alt="Xavier M. Contero — Founder of CAMBRA"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "grayscale(40%) contrast(1.05)" }}
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 60%, rgba(8,10,18,0.55) 100%)",
                }}
              />
            </div>
          </div>

          {/* QUOTE */}
          <div className="md:col-span-7">
            <div
              className="relative h-full rounded-2xl p-8 sm:p-10 flex flex-col"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
                border: "1px solid rgba(255,255,255,0.10)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {/* big quote glyph */}
              <Quote
                size={36}
                className="mb-6"
                style={{ color: "#60a5fa" }}
                aria-hidden
              />

              <p
                className="text-white"
                style={{
                  fontSize: "clamp(20px, 2.2vw, 26px)",
                  lineHeight: 1.4,
                  letterSpacing: "-0.02em",
                  fontWeight: 500,
                }}
              >
                After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
              </p>

              <p
                className="mt-5 text-[15px]"
                style={{ color: "rgba(255,255,255,0.55)", lineHeight: 1.6 }}
              >
                That's why I started CAMBRA.
              </p>

              {/* spacer */}
              <div className="flex-1" />

              {/* signature row */}
              <div
                className="mt-8 pt-6 flex items-center justify-between"
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div>
                  <p className="text-white text-[14px] font-bold tracking-tight">
                    Xavier M. Contero
                  </p>
                  <p
                    className="text-[10px] uppercase tracking-[0.24em] font-bold mt-1"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    Founder · CAMBRA
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="More about the founder"
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                  style={{
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}