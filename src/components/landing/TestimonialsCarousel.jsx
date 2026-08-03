import React from "react";
import { Quote, TrendingUp } from "lucide-react";
import InitialsAvatar from "@/components/shared/InitialsAvatar";
import SectionHeading from "@/components/landing/SectionHeading";
import { useTranslation } from "@/lib/i18n.jsx";

// ⚠️ ILLUSTRATIVE / PLACEHOLDER testimonials — invented names + quotes.
// Uses initials avatars (NOT photos) on purpose: a fake photo-realistic face
// + fake quote presented as a real customer is misleading advertising.
// REPLACE with real, consented customer quotes (and real photos) before launch.
const ITEMS = [
  {
    vertical: "Maison Épice",
    quoteKey: "tst_q1",
    name: "Camille Laurent",
    roleKey: "tst_role_founder",
    revenue: "Maison Épice",
    before: "2.40%",
    after: "1.20%",
    savings: "€22K",
  },
  {
    vertical: "Atelier Nord",
    quoteKey: "tst_q2",
    name: "Théo Mercier",
    roleKey: "tst_role_coo",
    revenue: "Atelier Nord",
    before: "2.15%",
    after: "1.08%",
    savings: "€18K",
  },
  {
    vertical: "Vela Studio",
    quoteKey: "tst_q3",
    name: "Sofia Ferran",
    roleKey: "tst_role_founder",
    revenue: "Vela Studio",
    before: "2.55%",
    after: "1.15%",
    savings: "€15K",
  },
  {
    vertical: "Brün Coffee",
    quoteKey: "tst_q4",
    name: "Lucas Petit",
    roleKey: "tst_role_finance",
    revenue: "Brün Coffee",
    before: "2.30%",
    after: "0.95%",
    savings: "€14K",
  },
  {
    vertical: "Lume",
    quoteKey: "tst_q5",
    name: "Inès Marchal",
    roleKey: "tst_role_founder",
    revenue: "Lume",
    before: "2.60%",
    after: "1.56%",
    savings: "€16K",
  },
];

function TestimonialCard({ item }) {
  const { t } = useTranslation();
  return (
    <div
      className="relative rounded-2xl overflow-hidden p-6 shrink-0 w-[340px] sm:w-[380px]"
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
          width: 300, height: 300, right: "-20%", top: "-30%",
          background: "radial-gradient(circle, rgba(139,123,255,0.18) 0%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      {/* category */}
      <div className="relative flex items-center gap-2 mb-4">
        <Quote size={13} style={{ color: "var(--voltio-2)" }} />
        <span className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "var(--voltio-2)" }}>
          {t("tst_category")}
        </span>
        <span className="text-white/30">·</span>
        <span className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/55">
          {item.vertical}
        </span>
      </div>

      {/* quote */}
      <p
        className="relative text-white mb-5"
        style={{
          fontSize: "14px",
          lineHeight: 1.45,
          fontWeight: 500,
          letterSpacing: "-0.005em",
        }}
      >
        "{t(item.quoteKey)}"
      </p>

      {/* author */}
      <div className="relative flex items-center gap-2.5 mb-5">
        <InitialsAvatar name={item.name} size={36} />
        <div className="min-w-0">
          <p className="text-white text-[12px] font-bold tracking-tight truncate">
            {item.name}
          </p>
          <p className="text-[10px] text-white/55 truncate">
            {t(item.roleKey)} <span className="text-white/30">·</span> {item.revenue}
          </p>
        </div>
      </div>

      {/* divider */}
      <div className="relative my-5 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

      {/* before / after / saved */}
      <div className="relative grid grid-cols-3 items-center gap-3">
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[0.22em] font-bold text-white/40 mb-1">
            {t("tst_before")}
          </p>
          <p
            className="font-black tabular-nums text-white/50"
            style={{
              fontSize: "18px",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              textDecoration: "line-through",
            }}
          >
            {item.before}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[9px] uppercase tracking-[0.22em] font-bold mb-1" style={{ color: "rgba(47,224,168,0.85)" }}>
            {t("tst_after")}
          </p>
          <p
            className="font-black tabular-nums"
            style={{
              color: "#2FE0A8",
              fontSize: "18px",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {item.after}
          </p>
        </div>
        <div className="text-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="inline-flex items-center gap-1 mb-1">
            <TrendingUp size={9} style={{ color: "#2FE0A8" }} />
            <p className="text-[9px] uppercase tracking-[0.22em] font-bold" style={{ color: "rgba(47,224,168,0.85)" }}>
              {t("tst_saved")}
            </p>
          </div>
          <p
            className="font-black tabular-nums"
            style={{
              fontFamily: "'Space Grotesk', 'Inter', sans-serif",
              fontSize: "24px",
              letterSpacing: "-0.03em",
              lineHeight: 0.95,
              background:
                "linear-gradient(135deg, #2FE0A8 0%, #0FA97A 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 16px rgba(47,224,168,0.35))",
            }}
          >
            {item.savings}
          </p>
          <p className="text-[9px] text-white/40 mt-0.5">{t("tst_per_year")}</p>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsCarousel() {
  const { t } = useTranslation();
  // Duplicate the list so the marquee loops seamlessly (-50% translate).
  const loop = [...ITEMS, ...ITEMS];

  return (
    <section id="testimonials" className="relative py-12 sm:py-16 overflow-hidden">
      <div className="relative max-w-6xl mx-auto px-6 sm:px-10">
        <SectionHeading eyebrow={t("tst_eyebrow")} className="mb-10">
          {t("tst_h2_pre")}
          <br />
          <span className="kw">{t("tst_h2_kw")}</span>
        </SectionHeading>
      </div>

      {/* Continuous marquee ribbon — pauses on hover. Edges fade via mask. */}
      <div
        className="relative group"
        style={{
          maskImage:
            "linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%)",
        }}
      >
        <div className="flex gap-5 w-max animate-testimonials-marquee group-hover:[animation-play-state:paused]">
          {loop.map((item, i) => (
            <TestimonialCard key={i} item={item} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes testimonials-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-testimonials-marquee {
          animation: testimonials-marquee 40s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-testimonials-marquee { animation: none; }
        }
      `}</style>
    </section>
  );
}