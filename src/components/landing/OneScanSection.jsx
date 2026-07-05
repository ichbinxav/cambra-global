import React from "react";
import { Sparkles, Activity, ScanLine, Gauge } from "lucide-react";

/**
 * "One scan. Every leak surfaced." — Analyzer flagship section.
 * Matches user reference: light eyebrow pill, big white headline with cyan accent,
 * subtitle, then a dark feature card explaining the Analyzer.
 */
export default function OneScanSection() {
  return (
    <section className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-4xl mx-auto px-6 sm:px-10 text-center">
        {/* eyebrow */}
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6"
          style={{
            border: "1px solid rgba(34,211,238,0.30)",
            background: "rgba(34,211,238,0.06)",
          }}
        >
          <Sparkles size={11} className="text-cyan-300" />
          <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-cyan-300">
            The Analyzer · our flagship
          </span>
        </span>

        <h2
          className="text-white mb-6"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(38px, 6vw, 72px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
          }}
        >
          Connect. Confirm.{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Recover.
          </span>
        </h2>

        <p
          className="text-white/55 max-w-2xl mx-auto mb-4"
          style={{ fontSize: "clamp(15px, 1.6vw, 18px)", lineHeight: 1.6 }}
        >
          An intelligence layer, not a calculator. Connect your payments, accounting and store,
          or upload your invoices, and your estimate becomes confirmed. Read only, we never
          touch your funds.
        </p>

        <p
          className="text-white/40 mb-12"
          style={{ fontSize: "13px", letterSpacing: "0.02em" }}
        >
          Independent brands, negotiating as one.
        </p>

        {/* Feature card */}
        <div
          className="relative rounded-2xl overflow-hidden p-7 sm:p-10 text-left"
          style={{
            background:
              "linear-gradient(180deg, rgba(11,16,32,0.95) 0%, rgba(7,9,15,0.95) 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow:
              "0 40px 100px -30px rgba(0,0,0,0.6), 0 0 60px -20px rgba(34,211,238,0.15)",
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
                "radial-gradient(ellipse 90% 80% at 50% 0%, #000 30%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 90% 80% at 50% 0%, #000 30%, transparent 80%)",
              opacity: 0.5,
            }}
          />
          <div
            aria-hidden
            className="absolute pointer-events-none"
            style={{
              width: 400, height: 400, right: "-10%", top: "-30%",
              background: "radial-gradient(circle, rgba(34,211,238,0.20) 0%, transparent 70%)",
              filter: "blur(60px)",
            }}
          />

          <div className="relative">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 mb-6"
              style={{
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <Activity size={11} className="text-cyan-300" />
              <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/70">
                What it does
              </span>
            </span>

            <h3
              className="text-white mb-4"
              style={{
                fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                fontSize: "clamp(28px, 4vw, 44px)",
                fontWeight: 900,
                letterSpacing: "-0.04em",
                lineHeight: 1.05,
              }}
            >
              Your full infrastructure audit,{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #60a5fa 0%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                automated.
              </span>
            </h3>

            <p
              className="text-white/60 mb-8"
              style={{ fontSize: "clamp(14px, 1.4vw, 16px)", lineHeight: 1.6 }}
            >
              Instead of a 3-month consultancy engagement, the Analyzer delivers a complete
              operational diagnosis — instantly, free, and tailored to your stack.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: ScanLine, title: "Maps your stack", body: "Detects every tool, fee and contract." },
                { icon: Gauge, title: "Benchmarks costs", body: "Against 1,000+ similar brands." },
                { icon: Sparkles, title: "Surfaces leaks", body: "Quantifies every euro overpaid." },
              ].map((f, i) => (
                <div
                  key={i}
                  className="rounded-xl p-4"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                    style={{
                      background: "rgba(34,211,238,0.10)",
                      border: "1px solid rgba(34,211,238,0.25)",
                    }}
                  >
                    <f.icon size={14} className="text-cyan-300" />
                  </div>
                  <p className="text-white text-[13px] font-bold mb-1">{f.title}</p>
                  <p className="text-[12px] text-white/50 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}