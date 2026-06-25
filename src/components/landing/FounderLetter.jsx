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
        <div className="mb-10">
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

        {/* Two-column: photo left · letter right — side-by-side on mobile too */}
        <div className="grid grid-cols-12 gap-4 sm:gap-8 lg:gap-16 items-start">
          {/* LEFT — PHOTO */}
          <div className="col-span-4 lg:col-span-5 lg:sticky lg:top-28">
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow:
                  "0 30px 80px -30px rgba(0,0,0,0.7), 0 0 60px -20px rgba(34,211,238,0.18)",
                aspectRatio: "4 / 5",
              }}
            >
              <img
                src={FOUNDER_PHOTO}
                alt="Xavier M. Contero — Founder of CAMBRA"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: "grayscale(35%) contrast(1.05)" }}
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 55%, rgba(8,10,18,0.85) 100%)",
                }}
              />
              <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-5">
                <p className="text-white text-[11px] sm:text-[14px] font-bold tracking-tight">
                  Xavier M. Contero
                </p>
                <p
                  className="text-[8px] sm:text-[10px] uppercase tracking-[0.20em] sm:tracking-[0.24em] font-bold mt-1"
                  style={{ color: "rgba(255,255,255,0.55)" }}
                >
                  Founder · CAMBRA · Paris
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT — LETTER */}
          <div className="col-span-8 lg:col-span-7">
            <h2
              className="text-white mb-10"
              style={{
                fontSize: "clamp(34px, 4.8vw, 56px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
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

            <Quote
              size={32}
              className="mb-6"
              style={{ color: "#60a5fa" }}
              aria-hidden
            />

            <div
              className="space-y-6 text-white/80"
              style={{
                fontSize: "clamp(17px, 1.55vw, 19px)",
                lineHeight: 1.65,
                letterSpacing: "-0.005em",
              }}
            >
              <p className="text-white" style={{ fontSize: "clamp(20px, 2vw, 24px)", lineHeight: 1.45, fontWeight: 500 }}>
                After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
              </p>

              <p>
                The big players have CFOs, procurement teams and leverage. You have a Stripe dashboard, a Shopify export, and an inbox full of receipts. The system is built so you never know what you should actually be paying.
              </p>
              <p>
                CAMBRA pools data from hundreds of independent brands, benchmarks every cost line, and uses that collective leverage to recover what's yours.
              </p>
              <p className="text-white">
                No retainer. No software fee. We only get paid when you actually save money —{" "}
                <span className="font-bold">25% of what we recover, nothing else.</span>
              </p>
              <p>
                That's why I started CAMBRA.
              </p>
            </div>

            {/* signature row */}
            <div
              className="mt-10 pt-6 flex items-center justify-between"
              style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}
            >
              <div>
                <p className="text-white text-[13px] font-bold tracking-tight">
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
                className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10 shrink-0"
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
    </section>
  );
}