import { ArrowRight, ShieldCheck, Sparkles, Mail, Lock } from "lucide-react";
import { useTranslation } from "@/lib/i18n.jsx";
import Navbar from "@/components/landing/Navbar";
import { base44 } from "@/api/base44Client";

/**
 * AnalyzerAuthGate — premium sign-in gate shown BEFORE the analyzer flow starts.
 *
 * Why a gate (UX rationale):
 *  - Guarantees we capture the user's email upfront → audit is always tied to an account.
 *  - Lets the user resume the audit from any device (resume_state_json works only with auth).
 *  - Removes the awkward "sign in now" friction at the end (Step 3 / runAnalysis).
 *  - Sets honest expectations: "this is a saved, private audit", not a one-shot calculator.
 *
 * The gate is designed to feel like Step 0 of the flow — not a block.
 */
export default function AnalyzerAuthGate() {
  const { t } = useTranslation();

  const startAuth = () => {
    // Redirect back to /Analyzer after login so the user lands directly in Step 1.
    try {
      base44.auth.redirectToLogin("/Analyzer");
    } catch {
      window.location.href = "/auth/start";
    }
  };

  return (
    <div
      className="relative min-h-screen flex flex-col font-inter overflow-x-hidden"
      style={{
        color: "#ffffff",
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 25%, #0a0d18 55%, #0b1020 80%, #08090f 100%)",
      }}
    >
      {/* Ambient grid + glow — same vocabulary as the rest of the analyzer */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.3,
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 25%, #000 35%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed z-0"
        style={{
          width: 700,
          height: 700,
          left: "50%",
          top: 80,
          transform: "translateX(-50%)",
          background:
            "radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <Navbar />

      <main className="relative z-10 flex-1 flex items-center justify-center px-5 pt-20 pb-10">
        <div className="w-full max-w-md">
          {/* Eyebrow */}
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6"
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
            </span>
            <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/65">
              Step 00 · Sign in
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-white mb-3"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(32px, 5vw, 44px)",
              fontWeight: 900,
              letterSpacing: "-0.04em",
              lineHeight: 1.02,
            }}
          >
            Create your{" "}
            <span
              style={{
                background:
                  "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              audit account
            </span>
            .
          </h1>
          <p className="text-[14px] text-white/55 mb-8 leading-relaxed">
            Your audit is private, saved to your account, and resumable from any
            device. You'll get the full report by email when it's ready.
          </p>

          {/* Value bullets — three short reasons */}
          <div className="space-y-3 mb-8">
            {[
              {
                icon: ShieldCheck,
                title: "Private & secure",
                body: "Your audit is encrypted and visible only to you.",
              },
              {
                icon: Mail,
                title: "Report by email",
                body: "We send a clean PDF the moment it's calculated.",
              },
              {
                icon: Sparkles,
                title: "Saved & resumable",
                body: "Stop anytime — pick up exactly where you left off.",
              },
            ].map((row) => (
              <div
                key={row.title}
                className="flex items-start gap-3 rounded-xl px-4 py-3"
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: "rgba(34,211,238,0.10)",
                    border: "1px solid rgba(34,211,238,0.20)",
                  }}
                >
                  <row.icon size={14} className="text-cyan-300" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-white leading-tight">
                    {row.title}
                  </p>
                  <p className="text-[12px] text-white/55 mt-0.5 leading-snug">
                    {row.body}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Primary CTA */}
          <button
            onClick={startAuth}
            className="w-full h-12 rounded-full inline-flex items-center justify-center gap-2 text-sm font-bold text-black bg-white hover:bg-white/90 transition-colors"
            style={{
              boxShadow:
                "0 0 0 1px rgba(255,255,255,0.10), 0 12px 32px -12px rgba(34,211,238,0.55), 0 0 28px rgba(34,211,238,0.22)",
            }}
          >
            Sign in to start audit
            <ArrowRight size={15} />
          </button>

          {/* Microcopy — trust */}
          <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-white/40">
            <Lock size={10} />
            <span>Takes 10 seconds · No credit card · Free audit</span>
          </div>

          {/* Audit duration hint */}
          <p className="mt-3 text-center text-[11px] text-white/35">
            {t("estimated_duration") || "Average audit time: 2 minutes"}
          </p>
        </div>
      </main>
    </div>
  );
}