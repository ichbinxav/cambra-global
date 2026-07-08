import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import JoinWaitlistButton from "@/components/landing/JoinWaitlistButton";

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

      <div className="relative max-w-3xl mx-auto px-6 sm:px-10 text-center">
        {/* eyebrow */}
        <div className="mb-8 flex justify-center">
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
          className="text-white text-center mx-auto max-w-3xl"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(36px, 5.5vw, 60px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
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
          className="mt-8 text-[17px] sm:text-[19px] mx-auto"
          style={{ color: "rgba(255,255,255,0.60)", lineHeight: 1.55, maxWidth: 560 }}
        >
          Turn operating costs into recovered margin. Verified. Immediate. Aligned incentives.
        </p>

        {/* Buttons — two distinct actions:
              1. Primary: run the free audit (Analyzer).
              2. Secondary: join the recovery waitlist (visual-only email capture). */}
        <div className="mt-10 flex flex-col gap-3 max-w-md mx-auto">
          <Link
            to="/Analyzer"
            className="group inline-flex items-center justify-center gap-3 rounded-full font-bold text-[15px] transition-transform hover:scale-[1.02]"
            style={{
              background: "#ffffff",
              color: "#0a0f1e",
              padding: "18px 28px",
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.1), 0 24px 60px -20px rgba(34,211,238,0.55), 0 0 50px rgba(34,211,238,0.20)",
            }}
          >
            <Sparkles size={16} className="text-blue-600" />
            Run free audit
            <ArrowRight size={16} />
          </Link>

          <JoinWaitlistButton variant="ghost" label="Join to recover" fullWidth />
        </div>

        {/* Trust row */}
        <div
          className="mt-8 flex flex-wrap justify-center items-center gap-x-3 gap-y-2 text-[11px] uppercase tracking-[0.22em] font-bold"
          style={{ color: "rgba(255,255,255,0.40)" }}
        >
          <span>3 minutes</span>
          <span className="text-cyan-400">•</span>
          <span>No credit card</span>
          <span className="text-cyan-400">•</span>
          <span>Free audit</span>
        </div>
      </div>
    </section>
  );
}