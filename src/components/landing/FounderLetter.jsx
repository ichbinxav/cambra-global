import React from "react";
import { Quote } from "lucide-react";

/**
 * Founder letter — unified single dark card (no split light/dark).
 * Photo + quote sit inside ONE coherent card matching landing's dark editorial language.
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

export default function FounderLetter() {
  return (
    <section className="relative py-16 sm:py-24 overflow-hidden">
      <div className="relative max-w-2xl mx-auto px-6 sm:px-10 text-center">
        {/* eyebrow */}
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-5"
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

        <h2
          className="text-white mb-8"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(28px, 4.2vw, 44px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}
        >
          A note from{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            the founder.
          </span>
        </h2>

        {/* UNIFIED CARD — photo left, quote right, single surface */}
        <div
          className="relative rounded-2xl overflow-hidden text-left"
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
              width: 320, height: 320, right: "-15%", top: "-30%",
              background: "radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%)",
              filter: "blur(50px)",
            }}
          />

          <div className="relative grid grid-cols-12 gap-0">
            {/* PHOTO — same dark surface, no white card cut */}
            <div className="col-span-5 sm:col-span-4 relative" style={{ minHeight: 200 }}>
              <img
                src={FOUNDER_PHOTO}
                alt="Xavier M. Contero — Founder of CAMBRA"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "grayscale(85%) contrast(1.05) brightness(0.95)" }}
              />
              {/* fade into card so it feels unified, not pasted */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 55%, rgba(11,16,32,0.85) 100%)",
                }}
              />
            </div>

            {/* QUOTE */}
            <div className="col-span-7 sm:col-span-8 p-5 sm:p-7 flex flex-col">
              <Quote size={18} style={{ color: "#22d3ee" }} className="mb-3 shrink-0" />

              <p
                className="text-white mb-2 flex-1"
                style={{
                  fontSize: "clamp(13px, 1.6vw, 16px)",
                  lineHeight: 1.5,
                  fontWeight: 500,
                  letterSpacing: "-0.005em",
                }}
              >
                After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
              </p>
              <p
                className="text-white/55 mb-5"
                style={{ fontSize: "clamp(11px, 1.3vw, 13px)", lineHeight: 1.5 }}
              >
                That's why I started CAMBRA.
              </p>

              <div
                className="pt-4 flex items-center justify-between gap-2"
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="min-w-0">
                  <p className="text-white text-[12px] font-bold tracking-tight truncate">
                    Xavier M. Contero
                  </p>
                  <p
                    className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/45 mt-0.5"
                    style={{ letterSpacing: "0.22em" }}
                  >
                    Founder · CAMBRA
                  </p>
                </div>
                <span
                  className="text-[8px] uppercase tracking-[0.22em] font-bold px-2 py-1 rounded-full shrink-0"
                  style={{
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "rgba(255,255,255,0.75)",
                  }}
                >
                  Paris
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}