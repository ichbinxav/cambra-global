import React, { useEffect, useState } from "react";
import { ArrowRight, Quote, X } from "lucide-react";

/**
 * Founder note — preview card + full letter modal (mobile + desktop).
 * Layout: small photo · short quote · "Read full note" arrow → opens modal with full letter.
 */
const FOUNDER_PHOTO =
  "https://media.base44.com/images/public/6a16288b833b3c26d7ac1fab/d863d71f2_0347F92E-E1B9-4977-A6B1-85897923556A.jpeg";

function FullLetterModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
      style={{ background: "rgba(5,7,12,0.85)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: "linear-gradient(180deg, #0b1020 0%, #07090f 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 40px 100px -30px rgba(0,0,0,0.8), 0 0 80px -30px rgba(34,211,238,0.25)",
        }}
      >
        {/* close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
          style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.85)" }}
        >
          <X size={16} />
        </button>

        <div className="p-6 sm:p-10">
          {/* eyebrow */}
          <div className="mb-6">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{ border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
              </span>
              <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/70">
                Letter from the founder
              </span>
            </span>
          </div>

          <Quote size={28} className="mb-5" style={{ color: "#60a5fa" }} aria-hidden />

          <h3
            className="text-white mb-6"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "clamp(24px, 4vw, 36px)",
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
          </h3>

          <div
            className="space-y-5 text-white/80"
            style={{ fontSize: "clamp(15px, 1.5vw, 17px)", lineHeight: 1.65 }}
          >
            <p className="text-white" style={{ fontSize: "clamp(17px, 1.8vw, 20px)", lineHeight: 1.45, fontWeight: 500 }}>
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
            <p>That's why I started CAMBRA.</p>
          </div>

          <div className="mt-8 pt-6" style={{ borderTop: "1px solid rgba(255,255,255,0.10)" }}>
            <p className="text-white text-[13px] font-bold tracking-tight">Xavier M. Contero</p>
            <p className="text-[10px] uppercase tracking-[0.24em] font-bold mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
              Founder · CAMBRA · Paris
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FounderLetter() {
  const [open, setOpen] = useState(false);

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

      <div className="relative max-w-4xl mx-auto px-6 sm:px-10">
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

        <h2
          className="text-white mb-10"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(34px, 5vw, 56px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.02,
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

        {/* Preview card: photo + short quote · adapts mobile + desktop */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group w-full text-left rounded-2xl overflow-hidden transition-all hover:border-white/20"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 30px 80px -30px rgba(0,0,0,0.5)",
          }}
        >
          <div className="grid grid-cols-12 items-stretch">
            {/* photo */}
            <div className="col-span-5 sm:col-span-4 relative" style={{ minHeight: 200 }}>
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
                    "linear-gradient(90deg, transparent 60%, rgba(8,10,18,0.7) 100%)",
                }}
              />
            </div>

            {/* quote */}
            <div className="col-span-7 sm:col-span-8 p-5 sm:p-8 flex flex-col justify-between gap-5">
              <div>
                <Quote size={20} className="mb-3" style={{ color: "#60a5fa" }} aria-hidden />
                <p
                  className="text-white"
                  style={{
                    fontSize: "clamp(15px, 1.7vw, 19px)",
                    lineHeight: 1.5,
                    fontWeight: 500,
                    letterSpacing: "-0.01em",
                  }}
                >
                  After years inside global companies, I realized independent brands were operating without the infrastructure they deserved.
                </p>
                <p
                  className="mt-3 text-white/55"
                  style={{ fontSize: "clamp(12px, 1.3vw, 14px)", lineHeight: 1.5 }}
                >
                  That's why I started CAMBRA.
                </p>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-white text-[12px] sm:text-[13px] font-bold tracking-tight">
                    Xavier M. Contero
                  </p>
                  <p
                    className="text-[9px] sm:text-[10px] uppercase tracking-[0.24em] font-bold mt-1"
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    Founder
                  </p>
                </div>
                <span
                  className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all group-hover:bg-white group-hover:text-black"
                  style={{
                    border: "1px solid rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.85)",
                  }}
                  aria-hidden
                >
                  <ArrowRight size={14} />
                </span>
              </div>
            </div>
          </div>
        </button>

        <p className="mt-4 text-center text-[11px] uppercase tracking-[0.22em] font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
          Tap to read the full letter
        </p>
      </div>

      <FullLetterModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
}