import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, TrendingUp, Zap, Lock, Sparkles } from "lucide-react";
import Navbar from "@/components/landing/Navbar";
import PricingDual from "@/components/landing/PricingDual";
import { useTranslation } from "@/lib/i18n.jsx";

const FAQ = [
  { q: "prc_faq_q1", a: "prc_faq_a1" },
  { q: "prc_faq_q2", a: "prc_faq_a2" },
  { q: "prc_faq_q3", a: "prc_faq_a3" },
  { q: "prc_faq_q4", a: "prc_faq_a4" },
  { q: "prc_faq_q5", a: "prc_faq_a5" },
  { q: "prc_faq_q6", a: "prc_faq_a6" },
];

const TRUST_POINTS = [
  { icon: ShieldCheck, key: "prc_trust_1" },
  { icon: Lock, key: "prc_trust_2" },
  { icon: Zap, key: "prc_trust_3" },
  { icon: TrendingUp, key: "prc_trust_4" },
];

function SplitVisual() {
  const { t } = useTranslation();
  return (
    <div className="relative max-w-4xl mx-auto mb-16 sm:mb-20">
      <div className="text-center mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45 mb-3">
          {t("prc_split_eyebrow")}
        </p>
        <h2
          className="text-white"
          style={{
            fontFamily: "'Space Grotesk', 'Inter', sans-serif",
            fontSize: "clamp(28px, 4vw, 42px)",
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}
        >
          {t("prc_split_h2")}
        </h2>
      </div>

      <div
        className="relative rounded-3xl overflow-hidden backdrop-blur-sm"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          background:
            "linear-gradient(180deg, rgba(13,18,36,0.6) 0%, rgba(6,8,15,0.6) 100%)",
        }}
      >
        {/* 75 / 25 visual bar */}
        <div className="p-8 sm:p-10">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/80 mb-1">
                {t("prc_you_keep")}
              </p>
              <p
                className="tabular-nums font-black"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(48px, 7vw, 84px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.9,
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #b8d8e0 45%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 22px rgba(34,211,238,0.35))",
                }}
              >
                75%
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">
                {t("prc_cambra")}
              </p>
              <p
                className="tabular-nums font-black text-white/70"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(32px, 4.5vw, 48px)",
                  letterSpacing: "-0.05em",
                  lineHeight: 0.9,
                }}
              >
                25%
              </p>
            </div>
          </div>

          {/* Progress bar */}
          <div
            className="h-2.5 rounded-full overflow-hidden mb-6"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <div className="h-full flex">
              <div
                style={{
                  width: "75%",
                  background:
                    "linear-gradient(90deg, #60a5fa 0%, #22d3ee 100%)",
                  boxShadow: "0 0 16px rgba(34,211,238,0.5)",
                }}
              />
              <div style={{ width: "25%", background: "rgba(255,255,255,0.15)" }} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/[0.06]">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 mb-1.5">
                {t("prc_duration_label")}
              </p>
              <p className="text-[14px] font-semibold text-white">{t("prc_duration_val")}</p>
              <p className="text-[11.5px] text-white/50 mt-0.5">
                {t("prc_duration_note")}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 mb-1.5">
                {t("prc_atbench_label")}
              </p>
              <p className="text-[14px] font-semibold text-white">{t("prc_atbench_val")}</p>
              <p className="text-[11.5px] text-white/50 mt-0.5">
                {t("prc_atbench_note")}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40 mb-1.5">
                {t("prc_nosav_label")}
              </p>
              <p className="text-[14px] font-semibold text-white">{t("prc_nosav_val")}</p>
              <p className="text-[11.5px] text-white/50 mt-0.5">
                {t("prc_nosav_note")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Pricing() {
  const { t } = useTranslation();
  return (
    <div
      className="relative min-h-screen font-inter overflow-hidden text-white"
      style={{
        background:
          "linear-gradient(180deg, #0a0a0a 0%, #0b0e1a 22%, #0a0d18 48%, #0b1020 72%, #08090f 100%)",
      }}
    >
      <Navbar />

      {/* ambient grid */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          opacity: 0.35,
          maskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 80% at 50% 30%, #000 35%, transparent 100%)",
        }}
      />

      {/* hero halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: 900,
          height: 900,
          left: "50%",
          top: "-10%",
          transform: "translateX(-50%)",
          background:
            "radial-gradient(circle, rgba(34,211,238,0.08) 0%, transparent 60%)",
          filter: "blur(80px)",
        }}
      />

      <div className="relative pt-24 pb-20">
        <div className="max-w-6xl mx-auto px-5">
          {/* HERO */}
          <div className="text-center mb-16 md:mb-20">
            <div
              className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full backdrop-blur-sm"
              style={{
                border: "1px solid rgba(34,211,238,0.25)",
                background: "rgba(34,211,238,0.05)",
              }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-cyan-400" />
              </span>
              <span className="text-[10px] font-semibold tracking-[0.24em] uppercase text-white/75">
                {t("prc_hero_badge")}
              </span>
            </div>

            <h1
              className="font-display mb-6 text-white"
              style={{
                fontSize: "clamp(2.6rem, 6.5vw, 5rem)",
                fontWeight: 900,
                letterSpacing: "-0.05em",
                lineHeight: 0.92,
              }}
            >
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #ffffff 0%, #b8d8e0 55%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {t("prc_hero_h1")}
              </span>
            </h1>
            <p className="text-base md:text-lg text-white/60 max-w-2xl mx-auto leading-relaxed mb-8">
              {t("prc_hero_sub")}
            </p>

            {/* CTA */}
            <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
              <Link
                to="/Analyzer"
                className="inline-flex items-center gap-2 rounded-full bg-white text-black px-7 py-3.5 font-bold text-[13px] transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(34,211,238,0.6)]"
                style={{
                  boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.1), 0 18px 40px -18px rgba(34,211,238,0.5)",
                }}
              >
                {t("prc_cta_primary")}
                <ArrowRight size={14} />
              </Link>
              <Link
                to="/HowItWorks"
                className="inline-flex items-center rounded-full px-7 py-3.5 text-[13px] font-medium text-white/70 hover:text-white transition-colors"
                style={{
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                {t("prc_cta_secondary")}
              </Link>
            </div>

            {/* Trust bar */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-[12px] text-white/45">
              {TRUST_POINTS.map(({ icon: Icon, key }) => (
                <span key={key} className="inline-flex items-center gap-1.5">
                  <Icon size={13} className="text-cyan-300/80" />
                  {t(key)}
                </span>
              ))}
            </div>
          </div>

          {/* Split visual */}
          <SplitVisual />

          {/* Pricing dual — the two steps */}
          <PricingDual />

          {/* Reassurance banner */}
          <div
            className="mt-16 mb-16 max-w-3xl mx-auto rounded-2xl p-6 sm:p-8 relative overflow-hidden"
            style={{
              border: "1px solid rgba(34,211,238,0.18)",
              background:
                "linear-gradient(135deg, rgba(34,211,238,0.06) 0%, rgba(59,130,246,0.03) 100%)",
            }}
          >
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                width: 300,
                height: 300,
                right: "-10%",
                top: "-40%",
                background:
                  "radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%)",
                filter: "blur(50px)",
              }}
            />
            <div className="relative flex items-start gap-4">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: "rgba(34,211,238,0.12)",
                  border: "1px solid rgba(34,211,238,0.3)",
                  boxShadow: "0 0 24px rgba(34,211,238,0.3)",
                }}
              >
                <Sparkles size={18} className="text-cyan-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-cyan-300/85 mb-1.5">
                  {t("prc_promise_eyebrow")}
                </p>
                <p className="text-[14.5px] text-white/80 leading-relaxed">
                  {t("prc_promise_text")}
                </p>
              </div>
            </div>
          </div>

          {/* FAQ */}
          <div className="mt-8 md:mt-12 max-w-3xl mx-auto">
            <div className="mb-8 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45 mb-3">
                {t("prc_faq_eyebrow")}
              </p>
              <h2
                className="text-white"
                style={{
                  fontFamily: "'Space Grotesk', 'Inter', sans-serif",
                  fontSize: "clamp(28px, 4vw, 40px)",
                  fontWeight: 900,
                  letterSpacing: "-0.035em",
                  lineHeight: 1.05,
                }}
              >
                {t("prc_faq_h2")}
              </h2>
            </div>

            <div
              className="rounded-2xl overflow-hidden backdrop-blur-sm"
              style={{
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              {FAQ.map((item, i) => (
                <div
                  key={i}
                  className="px-6 py-5 sm:px-7 sm:py-6 hover:bg-white/[0.02] transition-colors"
                  style={{
                    borderTop:
                      i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="text-[15px] font-semibold tracking-tight text-white mb-1.5">
                    {t(item.q)}
                  </p>
                  <p className="text-[13.5px] text-white/65 leading-relaxed">
                    {t(item.a)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Final CTA */}
          <div className="mt-16 text-center">
            <Link
              to="/Analyzer"
              className="inline-flex items-center gap-2 rounded-full bg-white text-black px-8 py-4 font-bold text-[14px] transition-shadow"
              style={{
                boxShadow:
                  "0 0 0 1px rgba(255,255,255,0.1), 0 20px 50px -20px rgba(34,211,238,0.6)",
              }}
            >
              {t("prc_final_cta")}
              <ArrowRight size={16} />
            </Link>
            <p className="mt-4 text-[12px] text-white/40">
              {t("prc_final_note")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}