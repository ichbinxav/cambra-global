import React from "react";
import CambraCTA, { CambraTrustRow } from "@/components/shared/CambraCTA";

/**
 * Final CTA block — "Stop leaving margin on the table".
 * Dual button: white "Run free audit" + outlined "Join CAMBRA".
 */
export default function StopLeavingMarginCTA() {
  return (
    <section className="relative py-14 sm:py-20 overflow-hidden">
      {/* ambient pulse */}
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          width: 900, height: 700, left: "50%", top: "50%", transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(34,211,238,0.16) 0%, transparent 70%)",
          filter: "blur(100px)",
        }}
      />
      {/* watermark "BRAVO" style giant letters behind CTA */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
        style={{ opacity: 0.05 }}
      >
        <span
          className="font-black"
          style={{
            fontSize: "clamp(140px, 22vw, 320px)",
            letterSpacing: "-0.06em",
            lineHeight: 1,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 80%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          CAMBRA
        </span>
      </div>

      <div className="relative max-w-3xl mx-auto px-6 sm:px-10">
        {/* eyebrow */}
        <div className="mb-8">
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[11px] uppercase tracking-[0.24em] font-bold text-white/70">
              Join CAMBRA to unlock savings
            </span>
          </span>
        </div>

        <h2
          className="text-white"
          style={{
            fontSize: "clamp(48px, 8vw, 96px)",
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 0.95,
          }}
        >
          Stop leaving{" "}
          <span
            style={{
              background:
                "linear-gradient(135deg, #ffffff 0%, #b8d8e0 50%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            margin on the table.
          </span>
        </h2>

        <p
          className="mt-8 text-[17px] sm:text-[19px]"
          style={{ color: "rgba(255,255,255,0.60)", lineHeight: 1.55, maxWidth: 560 }}
        >
          Turn operating costs into recovered margin. Verified. Immediate. Aligned incentives.
        </p>

        {/* Single canonical CTA */}
        <div className="mt-10 flex flex-col gap-5 items-start">
          <CambraCTA intent="audit" size="lg" />
          <CambraTrustRow />
        </div>
      </div>
    </section>
  );
}