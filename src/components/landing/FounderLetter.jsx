import React from "react";

/**
 * Founder's letter — editorial section.
 * Big serif-like statement + signature.
 */
export default function FounderLetter() {
  return (
    <section className="relative py-24 sm:py-32 overflow-hidden">
      {/* ambient subtle */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 700,
          height: 700,
          left: "50%",
          top: "30%",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(44,167,193,0.08) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
      />

      <div className="relative max-w-3xl mx-auto px-6 sm:px-10">
        <div className="mb-10 flex items-center gap-3">
          <span
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/65">
              A letter from the founder
            </span>
          </span>
        </div>

        <div
          className="text-white"
          style={{
            fontSize: "clamp(20px, 2.3vw, 26px)",
            lineHeight: 1.55,
            letterSpacing: "-0.015em",
            fontWeight: 400,
          }}
        >
          <p className="mb-6">
            I spent ten years inside DTC brands watching the same scene repeat itself.
          </p>
          <p className="mb-6 text-white/75">
            A founder builds something people love. Revenue grows. Then, quietly, the infrastructure
            starts eating the margin — payment fees creep up, shipping contracts go stale, SaaS bills
            multiply, and nobody has the time, the data, or the leverage to push back.
          </p>
          <p className="mb-6 text-white/75">
            Banks won't tell you what your peers pay. Carriers won't show you their best rates. SaaS
            vendors count on you not reading the invoice. The system is designed to be opaque, and
            independent brands pay the price.
          </p>
          <p
            className="mb-6 font-bold"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #b8d8e0 60%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            CAMBRA exists to flip that. We pool data from hundreds of independent brands, benchmark
            every cost line, and use that collective leverage to recover money that should never have
            left your account.
          </p>
          <p className="mb-6 text-white/75">
            You only pay us when we actually save you money. 25% of what we recover. Zero risk, zero
            retainer, zero excuses.
          </p>
          <p className="text-white/75">
            If you're tired of paying more than you should, you're in the right place.
          </p>
        </div>

        {/* Signature block */}
        <div className="mt-12 flex items-center gap-4">
          <img
            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=faces&q=80"
            alt="Founder portrait"
            loading="lazy"
            className="w-12 h-12 rounded-full object-cover"
            style={{ border: "1px solid rgba(255,255,255,0.18)" }}
          />
          <div>
            <p
              className="text-white"
              style={{
                fontFamily: '"Caveat", "Brush Script MT", cursive',
                fontSize: 28,
                lineHeight: 1,
              }}
            >
              Adrien Vauthier
            </p>
            <p className="text-[12px] text-white/45 mt-0.5">Founder & CEO · CAMBRA</p>
          </div>
        </div>
      </div>
    </section>
  );
}