import React from "react";

/**
 * Founder's letter — editorial, cinematic.
 * Two-column layout: portrait + handwritten signature on the left,
 * personal letter on the right.
 *
 * Replace FOUNDER_PHOTO with a real URL when available.
 */
const FOUNDER_PHOTO =
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=800&fit=crop&crop=faces&q=85";

export default function FounderLetter() {
  return (
    <section className="relative py-28 sm:py-36 overflow-hidden">
      {/* ambient cyan wash */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 900,
          height: 700,
          left: "-10%",
          top: "20%",
          background:
            "radial-gradient(circle, rgba(34,211,238,0.10) 0%, transparent 70%)",
          filter: "blur(110px)",
        }}
      />
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700,
          height: 600,
          right: "-10%",
          bottom: "5%",
          background:
            "radial-gradient(circle, rgba(96,165,250,0.10) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        {/* Eyebrow */}
        <div className="mb-12 flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/65">
              A letter from the founder
            </span>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          {/* LEFT — portrait + signature */}
          <div className="lg:col-span-4 lg:sticky lg:top-28">
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow:
                  "0 30px 80px -30px rgba(0,0,0,0.7), 0 0 60px -20px rgba(34,211,238,0.20)",
              }}
            >
              <img
                src={FOUNDER_PHOTO}
                alt="Xavi Martínez — Founder & CEO of CAMBRA"
                className="w-full h-auto block"
                style={{ aspectRatio: "3 / 4", objectFit: "cover" }}
              />
              {/* photo overlay */}
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 50%, rgba(8,10,18,0.85) 100%)",
                }}
              />
              {/* caption inside photo */}
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="text-white text-[13px] font-bold tracking-tight">
                  Xavi Martínez
                </p>
                <p className="text-white/65 text-[11px] uppercase tracking-[0.18em] mt-0.5">
                  Founder & CEO · CAMBRA
                </p>
              </div>
            </div>

            {/* Signature */}
            <div className="mt-6 flex items-center gap-4">
              <span
                className="text-white"
                style={{
                  fontFamily:
                    '"Caveat", "Brush Script MT", "Segoe Script", cursive',
                  fontSize: 38,
                  lineHeight: 1,
                  transform: "rotate(-3deg)",
                  display: "inline-block",
                  textShadow: "0 0 24px rgba(34,211,238,0.25)",
                }}
              >
                Xavi
              </span>
              <span
                className="text-[11px] uppercase tracking-[0.22em] text-white/40"
              >
                Paris · 2026
              </span>
            </div>
          </div>

          {/* RIGHT — the letter */}
          <div className="lg:col-span-8">
            <h2
              className="text-white mb-10"
              style={{
                fontSize: "clamp(34px, 4.5vw, 56px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.02,
              }}
            >
              I built CAMBRA because{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                independent brands are getting robbed in silence.
              </span>
            </h2>

            <div
              className="text-white/80 space-y-6"
              style={{
                fontSize: "clamp(17px, 1.55vw, 19px)",
                lineHeight: 1.65,
                letterSpacing: "-0.005em",
                fontWeight: 400,
              }}
            >
              <p>
                For years I watched founders build brands customers loved, only
                to see the margin quietly disappear into payment fees, shipping
                contracts and SaaS invoices nobody had time to renegotiate.
              </p>
              <p>
                The big players have CFOs, procurement teams and leverage. You
                have a Stripe dashboard, a Shopify export and an inbox full of
                receipts. The system is built so you never know what you should
                actually be paying.
              </p>
              <p className="text-white">
                CAMBRA was built to flip that. We pool data from hundreds of
                independent brands, benchmark every single cost line, and use
                that collective leverage to recover what's yours.
              </p>
              <p>
                We don't charge a retainer. We don't sell software. We only get
                paid when you actually save money —{" "}
                <span className="text-white font-bold">
                  25% of what we recover, nothing else.
                </span>
              </p>
              <p>
                If you're tired of overpaying and ready to find out how much,
                I'd love to show you.
              </p>
            </div>

            {/* PS */}
            <div
              className="mt-12 p-6 rounded-2xl"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <p className="text-[11px] uppercase tracking-[0.22em] font-bold text-cyan-300/80 mb-2">
                P.S.
              </p>
              <p className="text-white/75 text-[15px] leading-relaxed">
                The analysis is free. If we don't find savings, you pay nothing.
                If we do, you pocket 75% of every euro we recover. That's the
                whole deal.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}